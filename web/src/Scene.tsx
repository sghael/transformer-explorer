import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, events, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as Controls } from "three-stdlib";
import { sample, type View } from "./data";
import {
  routerPaths,
  pointAlongPath,
  attentionPath,
  type Point,
} from "./spatial";
import Flow from "./Flow";
import {
  timing,
  duration,
  cameraBetween,
  captureScene,
  blendScene,
  resetOpacity,
  type ScenePose,
} from "./navigation";
export type Selection = {
  layer: number;
  group: number;
  token: number;
  expert: number;
  view: View;
  spacing: number;
};
export type CameraPose = { position: number[]; target: number[] };
type Props = {
  state: Selection;
  playing: boolean;
  flowTime: number;
  flowPlaying: boolean;
  reduced: boolean;
  top2: number[];
  time: number;
  decode: boolean;
  cameraRevision: number;
  lowQuality: boolean;
  onView: (view: View) => void;
  onPick: (id: string, data: Record<string, any>) => void;
  onReady: (info: any) => void;
  cameraRef: React.RefObject<CameraPose | null>;
  restorePose: CameraPose | null;
};
function isVisibleInScene(object: THREE.Object3D): boolean {
  for (
    let ancestor: THREE.Object3D | null = object;
    ancestor;
    ancestor = ancestor.parent
  ) {
    if (!ancestor.visible) return false;
  }
  return true;
}
// Three.js raycasting does not exclude hidden descendants. Filter before R3F
// dispatches events so an invisible foreground mesh cannot consume a click.
const sceneEvents: typeof events = (store) => ({
  ...events(store),
  filter: (intersections) =>
    intersections.filter(({ object }) => isVisibleInScene(object)),
});
const anchors: Record<View, string> = {
  overview: "CAM_OVERVIEW",
  input: "CAM_INPUT",
  layer: "CAM_LAYER",
  attention: "CAM_ATTENTION",
  cache: "CAM_CACHE",
  router: "CAM_MOE",
  expert: "CAM_EXPERT",
  matrix: "CAM_MATRIX",
  output: "CAM_LM_HEAD",
};
const labelStyle: React.CSSProperties = {
  whiteSpace: "nowrap",
  font: "12px system-ui",
  color: "#e3edf1",
  background: "rgba(13,24,33,.9)",
  padding: "4px 7px",
  border: "1px solid #40515d",
  borderRadius: 4,
  pointerEvents: "none",
};
function Label({
  node,
  offset = [0, 0, 0],
  children,
  maxDistance = Infinity,
}: {
  node?: THREE.Object3D;
  offset?: Point;
  children: React.ReactNode;
  maxDistance?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const html = useRef<HTMLSpanElement>(null);
  const shown = useRef(true);
  const { camera } = useThree();
  const pos = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (node && ref.current) {
      node.getWorldPosition(pos);
      ref.current.position.copy(pos).add(new THREE.Vector3(...offset));
      const distance = camera.position.distanceTo(pos);
      if (shown.current && distance > maxDistance + 2) shown.current = false;
      else if (!shown.current && distance < maxDistance - 2)
        shown.current = true;
      if (html.current)
        html.current.style.display = shown.current ? "inline" : "none";
    }
  });
  return node ? (
    <group ref={ref}>
      <Html center style={labelStyle}>
        <span ref={html}>{children}</span>
      </Html>
    </group>
  ) : null;
}
function heatmap(values: number[][], token: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 768;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#15232d";
  c.fillRect(0, 0, 768, 768);
  values.forEach((row, i) =>
    row.forEach((v, j) => {
      const x = j * 96,
        y = i * 96;
      c.fillStyle =
        j > i
          ? "#26313b"
          : `rgb(${25 + v * 100},${65 + v * 150},${80 + v * 160})`;
      c.fillRect(x + 2, y + 2, 92, 92);
      c.fillStyle = j > i ? "#83929e" : "#f3f6f8";
      c.font = "32px system-ui";
      c.textAlign = "center";
      c.fillText(j > i ? "—" : v.toFixed(2), x + 48, y + 57);
      if (i === token) {
        c.strokeStyle = "#f3c779";
        c.lineWidth = 4;
        c.strokeRect(x + 3, y + 3, 90, 90);
      }
    }),
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
// One absolute journey: chapter seeking never repeats a within-chapter loop.
function tokenPose(time: number, spacing: number, layer: number): Point {
  const first = -4.96 * spacing,
    last = 4.96 * spacing,
    selected = (layer - 15.5) * 0.32 * spacing;
  const stops: [number, Point][] = [
    [0, [-8, 0.5, 0]],
    [6, [-8, 0.5, 0]],
    [11, [-5.5, 0.5, 0]],
    [13, [0, 0.18, first]],
    [20, [0, 0.18, selected]],
    [66, [0, 0.18, selected]],
    [70, [0, 0.18, last]],
    [72, [4.8, 0.5, 0]],
    [73, [7, 0.5, 0]],
    [74, [9.5, 0.5, 0]],
    [75, [9.5, -3.5, 0]],
    [79, [-8, -3.5, 0]],
    [80, [-8, 0.5, 0]],
  ];
  const end = stops.findIndex(([t]) => t > time);
  if (end < 0) return stops.at(-1)![1];
  if (end === 0) return stops[0][1];
  const [ta, a] = stops[end - 1],
    [tb, b] = stops[end];
  const u = (time - ta) / (tb - ta);
  return a.map((v, i) => v + (b[i] - v) * u) as Point;
}
function Effects({
  p,
  nodes,
}: {
  p: Props;
  nodes: Map<string, THREE.Object3D>;
}) {
  const data = useMemo(
    () => sample(p.state.layer, p.state.group, p.state.token),
    [p.state.layer, p.state.group, p.state.token],
  );
  const view = p.state.view,
    g = p.state.group,
    z = (g - 3.5) * 1.2;
  const label = (id: string, text: string, offset: Point = [0, 1, 0]) => (
    <Label
      key={id + text}
      node={nodes.get(id)}
      offset={offset}
      maxDistance={["attention", "cache"].includes(view) ? 20 : Infinity}
    >
      {text}
    </Label>
  );
  const overview = ["overview", "input", "output"].includes(view);
  const chosen = data.candidates.reduce((best, item) =>
    item.logit > best.logit ? item : best,
  );
  const flowPosition = tokenPose(p.time, p.state.spacing, p.state.layer);
  return (
    <>
      {(p.flowPlaying || p.flowTime > 0) && (
        <Flow
          view={view}
          time={p.flowTime}
          group={g}
          token={p.state.token}
          spacing={p.state.spacing}
          experts={p.top2}
        />
      )}
      {overview && (
        <>
          {label("input", "Token IDs", [-1, 1.9, 0])}
          {label("embedding", "Embedding", [0, 0.3, 2])}
          {label(
            "stack",
            `32 layers · selected ${p.state.layer + 1}`,
            [0, 1.6, 0],
          )}
          {label("final_norm", "Final norm", [0, 2.0, 0])}
          {label("lm_head", "LM head", [0, 2.5, 0])}
          {label(
            "output",
            view === "output"
              ? `Chosen “${chosen.token}” · illustrative greedy choice`
              : "Next token",
            [0, -1, 0],
          )}
          {!p.flowPlaying && p.flowTime === 0 && (
            <mesh position={flowPosition}>
              <sphereGeometry args={[0.13, 10, 8]} />
              <meshBasicMaterial color="#f3c779" />
            </mesh>
          )}
          {p.time >= 74 && (
            <>
              <Line
                points={[
                  [9.5, 0.5, 0],
                  [9.5, -3.5, 0],
                  [-8, -3.5, 0],
                  [-8, 0.5, 0],
                ]}
                color="#64cfbf"
                lineWidth={2}
              />
              <Html
                position={[
                  flowPosition[0],
                  flowPosition[1] + 0.7,
                  flowPosition[2],
                ]}
                center
                style={labelStyle}
              >
                Appended chunk “{chosen.token}”
              </Html>
              <Html position={[0, -4.1, 0]} center style={labelStyle}>
                New token → embedding · retained K/V reused
              </Html>
              <group position={[-6.5, 0, 4.5]}>
                <Html position={[0.7, 2, 0]} center style={labelStyle}>
                  Layer {p.state.layer + 1} cache · K / V<br />8 retained + 1
                  new position
                </Html>
                {Array.from({ length: 9 }, (_, row) => (
                  <group key={row}>
                    {[0, 1].map((kind) => (
                      <mesh
                        key={kind}
                        position={[kind * 1.4, 1.2 - row * 0.18, 0]}
                      >
                        <boxGeometry args={[1.15, 0.12, 0.08]} />
                        <meshBasicMaterial
                          color={
                            row === 8
                              ? "#f3c779"
                              : kind === 0
                                ? "#43a995"
                                : "#8d6ab4"
                          }
                        />
                      </mesh>
                    ))}
                  </group>
                ))}
              </group>
            </>
          )}
        </>
      )}
      {view === "layer" && (
        <>
          {label("norm1", "RMSNorm 1", [-0.5, -2, 0])}
          {label("attention", "8 attention groups", [0, 2.5, 3])}
          {label("add1", "+ residual 1", [-0.6, -0.9, 0])}
          {label("norm2", "RMSNorm 2", [0.5, -2, 0])}
          {label("router", "Router", [0, -0.8, 0])}
          {label("experts", "8 parallel experts", [5, 1.8, 3.4])}
          {label("merge", "Weighted merge", [0, -2, 0])}
          {label("add2", "+ residual 2", [0.6, -0.9, 0])}
          {label("residual_attention", "Attention bypass", [-5.5, 4.3, 0])}
          {label("residual_moe", "MoE bypass", [4.5, 4.3, 0])}
          {label(
            `layer_${p.state.layer}`,
            `Layer ${p.state.layer + 1}`,
            [-0.5, -1.2, 0],
          )}
        </>
      )}
      {view === "attention" && (
        <>
          {Array.from({ length: 4 }, (_, h) =>
            label(`q_${g * 4 + h}`, `Q ${g * 4 + h + 1} weights`, [
              -1.4,
              0.65 - h * 0.43,
              0,
            ]),
          )}
          {label(`k_${g}`, "Shared K weights", [0, 1.15, 0])}
          {label(`v_${g}`, "Shared V weights", [0.2, -1, 0])}
          {label(`score_${g}`, "Runtime attention scores", [0, 0.75, 0])}
          {Array.from({ length: 4 }, (_, h) => (
            <Line
              key={"qlead" + h}
              points={[
                [-7.05, 1.65 - h * 0.43, z + (h - 1.5) * 0.21],
                [-6.225, 1, z + (h - 1.5) * 0.21],
              ]}
              color="#749cb7"
              lineWidth={1}
            />
          ))}
          {data.attention[p.state.token]
            .slice(0, p.state.token + 1)
            .map((weight, key) => (
              <Line
                key={"attention-link" + key}
                points={attentionPath(g, key)}
                color="#79d9cd"
                lineWidth={1 + weight * 5}
              />
            ))}
          <Html position={[-7.6, -0.65, z + 1.2]} center style={labelStyle}>
            Query token {p.state.token + 1}
          </Html>
          {data.attention[p.state.token].map((weight, key) => {
            const allowed = key <= p.state.token;
            const point = attentionPath(g, key).at(-1)!;
            return (
              <group key={"key-position" + key} position={point}>
                <mesh>
                  <sphereGeometry args={[0.065, 8, 6]} />
                  <meshBasicMaterial color={allowed ? "#79d9cd" : "#59636b"} />
                </mesh>
                <Html
                  position={[0, -0.3, 0]}
                  center
                  style={{
                    ...labelStyle,
                    fontSize: 10,
                    padding: "2px 4px",
                    textAlign: "center",
                    color: allowed ? "#d6fff7" : "#8c969e",
                  }}
                >
                  K{key + 1}
                  <br />
                  {allowed ? weight.toFixed(2) : "×"}
                </Html>
              </group>
            );
          })}
          <Html
            position={[-8.8, -2.1, z + 1.2]}
            center
            style={{ ...labelStyle, fontSize: 10 }}
          >
            Keys: token positions
            <br />
            Values: weights · × masked
          </Html>
          {(["q", "k", "v"] as const).map((kind, i) => {
            const before = data.rope[kind];
            const after =
              kind === "q"
                ? data.rope.rotatedQ
                : kind === "k"
                  ? data.rope.rotatedK
                  : data.rope.rotatedV;
            const x = -1.5,
              y = 0.6 - i * 1.3;
            return (
              <group key={kind}>
                <Line
                  points={[
                    [x, y, z],
                    [x + before[0] * 0.4, y + before[1] * 0.4, z],
                  ]}
                  color="#586b7a"
                  lineWidth={2}
                />
                <Line
                  points={[
                    [x, y, z + 0.02],
                    [x + after[0] * 0.4, y + after[1] * 0.4, z + 0.02],
                  ]}
                  color={kind === "v" ? "#bc97ed" : "#efc578"}
                  lineWidth={3}
                />
                <Html position={[x + 1.1, y, z]} center style={labelStyle}>
                  {kind.toUpperCase()} {kind === "v" ? "unchanged" : "rotated"}
                </Html>
              </group>
            );
          })}
        </>
      )}
      {view === "matrix" && (
        <>
          {label(`score_${g}`, "Key token columns 1 → 8", [0, 0.62, 0.03])}
          {label(
            `score_${g}`,
            `Query rows 1 ↓ 8 · selected ${p.state.token + 1}`,
            [0, -0.62, 0.03],
          )}
        </>
      )}
      {view === "cache" && (
        <>
          {(["k", "v"] as const).map((kind, i) => {
            const x = -5.8 + i * 2.3;
            return (
              <group key={kind}>
                <Html position={[x + 0.8, -1.35, z]} center style={labelStyle}>
                  {kind.toUpperCase()} · {p.decode ? 9 : 8} activation rows
                </Html>
                {Array.from({ length: p.decode ? 9 : 8 }, (_, row) => (
                  <group key={row}>
                    <mesh position={[x + 0.8, -1.8 - row * 0.22, z + 0.3]}>
                      <boxGeometry args={[1.8, 0.17, 0.04]} />
                      <meshBasicMaterial
                        color={
                          row === 8
                            ? "#efc578"
                            : row === p.state.token
                              ? "#d5dca5"
                              : kind === "k"
                                ? "#43a995"
                                : "#8d6ab4"
                        }
                      />
                    </mesh>
                    <Html
                      position={[x - 0.3, -1.8 - row * 0.22, z + 0.3]}
                      center
                      style={{ ...labelStyle, fontSize: 10, padding: 1 }}
                    >
                      {row + 1}
                    </Html>
                  </group>
                ))}
              </group>
            );
          })}
          <Html position={[-3.85, -4, z]} center style={labelStyle}>
            Sampled head channels →
          </Html>
        </>
      )}
      {["router", "layer"].includes(view) && (
        <>
          {p.top2.map((e, i) => (
            <Line
              key={"route" + e}
              points={[...routerPaths(e).input, ...routerPaths(e).output]}
              color={i === 0 ? "#f3c779" : "#64cfbf"}
              lineWidth={3}
            />
          ))}
          {view === "router" && (
            <>
              {label(
                "router",
                `Token ${p.state.token + 1}: choose 2`,
                [0, 1.7, 0],
              )}
              {label("merge", "Combine outputs", [0, 1.7, 0])}
              {Array.from({ length: 8 }, (_, e) =>
                label(
                  `expert_${e}`,
                  `Expert ${e + 1}${p.top2.includes(e) ? " ✓" : ""}`,
                  [0, 1.1 + (e % 2) * 0.8, 0],
                ),
              )}
            </>
          )}
        </>
      )}
      {view === "router" &&
        !p.flowPlaying &&
        p.flowTime === 0 &&
        p.top2.map((e, i) => {
          const t = Math.min(1, Math.max(0, (p.time - 49) / 7));
          const position = pointAlongPath(routerPaths(e).output, t);
          return (
            <mesh
              key={"output-vector" + e}
              name={"output-vector" + e}
              position={position}
            >
              <boxGeometry args={[0.28, 0.28, 0.28]} />
              <meshBasicMaterial color={i === 0 ? "#f3c779" : "#64cfbf"} />
            </mesh>
          );
        })}
      {view === "layer" && (
        <mesh
          position={[
            Math.max(-9, Math.min(10, -9 + ((p.time - 20) / 9) * 7)),
            0.2,
            0,
          ]}
        >
          <sphereGeometry args={[0.14, 10, 8]} />
          <meshBasicMaterial color="#f3c779" />
        </mesh>
      )}
      {view === "expert" && (
        <>
          {label(
            "expert_detail",
            `Expert ${p.state.expert + 1} · distinct learned weights`,
            [0, 3.2, 0],
          )}
          {label("gate", "Gate 4096 → 14336", [-1.1, 1, 0])}
          {label("up", "Up 4096 → 14336", [-0.5, -1, 0])}
          {label("silu", "SiLU", [0, 0.2, -0.2])}
          {label("multiply", "Multiply", [0, -0.7, 0])}
          {label("down", "Down → 4096", [1, 0.5, 0])}
        </>
      )}
    </>
  );
}
function Model(p: Props) {
  const { scene: original } = useGLTF(
    "./models/" +
      ((import.meta as any).env.VITE_ASSET_NAME || "transformer.glb"),
  );
  const scene = useMemo(() => {
    const s = original.clone(true);
    s.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = (o.material as THREE.Material).clone();
        o.castShadow = false;
      }
    });
    return s;
  }, [original]);
  const controls = useRef<Controls>(null);
  const lastPick = useRef<Record<string, any> | null>(null);
  const { camera, gl, size, scene: renderScene } = useThree();
  const destination = useRef<CameraPose | null>(null);
  const moving = useRef(false);
  const [presentationView, setPresentationView] = useState<View>(p.state.view);
  const navigation = useRef<{
    elapsed: number;
    from: CameraPose;
    via: CameraPose;
    to: CameraPose;
    context: View;
    target: View;
    phase: string;
    outgoing: ScenePose;
    surroundings: ScenePose;
    incoming: ScenePose;
  } | null>(null);
  const visibleView = presentationView;
  const viewPoses = useRef(new Map<string, CameraPose>());
  const previousView = useRef<{ key: string; revision: number } | null>(null);
  const nodes = useMemo(() => {
    const map = new Map<string, THREE.Object3D>();
    scene.traverse((o) => {
      map.set(o.userData.id || o.name, o);
      map.set(o.name, o);
    });
    return map;
  }, [scene]);
  const values = useMemo(
    () => sample(p.state.layer, p.state.group, p.state.token),
    [p.state.layer, p.state.group, p.state.token],
  );
  const texture = useMemo(
    () => heatmap(values.attention, p.state.token),
    [values, p.state.token],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  function applySceneView(view: View) {
    resetOpacity(scene);
    const overview = ["overview", "input", "output"].includes(view),
      detail = ["attention", "cache", "matrix"].includes(view);
    scene.traverse((o) => {
      o.visible = true;
      const d = o.userData,
        id = d.id || o.name;
      if (d.component === "camera_anchor" || d.component === "diagnostic")
        o.visible = false;
      if (
        [
          "input",
          "embedding",
          "final_norm",
          "lm_head",
          "output",
          "overview_flow",
        ].includes(id)
      )
        o.visible = overview;
      if (id === "focus") o.visible = !overview;
      if (id === "expert_detail") o.visible = view === "expert";
      if (/^layer_\d+$/.test(id)) {
        o.position.set(
          view === "layer" && d.layer === p.state.layer ? 1.3 : 0,
          view === "layer" && d.layer === p.state.layer ? 0.5 : 0,
          (d.layer - 15.5) * 0.32 * p.state.spacing,
        );
        if (o instanceof THREE.Mesh) {
          const m = o.material as THREE.MeshStandardMaterial;
          m.color.set(d.layer === p.state.layer ? "#f3c779" : "#54677b");
          m.emissive.set(d.layer === p.state.layer ? "#654315" : "#000000");
        }
      }
      if (/^group_\d+$/.test(id))
        o.visible = !detail || d.group === p.state.group;
      if (d.component === "kv_cache") o.visible = view === "cache";
      if (d.component === "attention_scores")
        o.visible = view === "attention" || view === "matrix";
      if (/^expert_\d+$/.test(id) && o instanceof THREE.Mesh)
        (o.material as THREE.MeshStandardMaterial).color.set(
          p.top2.includes(d.expert) ? "#e6b96f" : "#596779",
        );
    });
    const focus = nodes.get("focus")!;
    for (const child of focus.children) {
      const id = child.userData.id;
      if (detail) child.visible = id === "attention";
      else if (view === "router")
        child.visible = ["router", "experts", "merge"].includes(id);
      else if (view === "expert") child.visible = id === "expert_detail";
    }
    if (detail) {
      const attention = nodes.get("attention")!;
      attention.children.forEach(
        (o) => (o.visible = o.userData.id === `group_${p.state.group}`),
      );
      const group = nodes.get(`group_${p.state.group}`)!;
      group.children.forEach((o) => {
        if (view === "matrix")
          o.visible = o.userData.id === `score_${p.state.group}`;
        else if (view === "cache")
          o.visible = o.userData.id === `cache_${p.state.group}`;
      });
    }
    // A cache link is meaningful only when both its projection and cache sheet
    // are visible. The focused cache view hides projections as well.
    for (let group = 0; group < 8; group++) {
      nodes.get(`cache_link_${group}`)!.visible =
        isVisibleInScene(nodes.get(`k_${group}`)!) &&
        isVisibleInScene(nodes.get(`cache_k_${group}`)!);
    }
    const stack = nodes.get("stack")!;
    stack.visible = overview || view === "layer";
    stack.position.set(
      view === "layer" ? -11 : 0,
      view === "layer" ? -1 : 0,
      0,
    );
    stack.scale.setScalar(view === "layer" ? 0.3 : 1);
    const line = nodes.get("stack_sequence_segment_0");
    if (line) line.scale.z = p.state.spacing;
    const score = nodes.get(`score_${p.state.group}`) as THREE.Mesh;
    if (!score.geometry.getAttribute("uv")) {
      score.geometry = score.geometry.clone();
      const positions = score.geometry.getAttribute("position");
      const uv = new Float32Array(positions.count * 2);
      for (let i = 0; i < positions.count; i++) {
        uv[i * 2] = (positions.getX(i) + 0.45) / 0.9;
        uv[i * 2 + 1] = (positions.getY(i) + 0.45) / 0.9;
      }
      score.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    }
    for (const [i, kind] of ["k", "v"].entries()) {
      const sheet = nodes.get(`cache_${kind}_${p.state.group}`)!;
      sheet.position.x = view === "cache" ? -0.9 + i * 2.3 : 0.3;
      sheet.position.y = view === "cache" ? -0.4 : 0;
      sheet.scale.y = view === "cache" ? 1.8 : 1;
      sheet.position.z = view === "cache" ? 0 : i === 0 ? -0.2 : 0.2;
    }
    const material = score.material as THREE.MeshStandardMaterial;
    material.map = texture;
    material.color.set("#ffffff");
    material.needsUpdate = true;
    scene.updateMatrixWorld(true);
  }
  useLayoutEffect(() => {
    if (!navigation.current) applySceneView(visibleView);
  }, [scene, nodes, p.state, p.top2, texture, visibleView]);
  useEffect(() => {
    const viewKey =
      p.state.view +
      (["attention", "cache", "matrix"].includes(p.state.view)
        ? `:${p.state.group}`
        : "");
    const previous = previousView.current;
    const forced = previous?.revision !== p.cameraRevision;
    if (
      previous &&
      previous.key !== viewKey &&
      !forced &&
      !p.playing &&
      controls.current
    )
      viewPoses.current.set(
        previous.key,
        navigation.current?.to ?? {
          position: camera.position.toArray(),
          target: controls.current.target.toArray(),
        },
      );
    const travel = (pose: CameraPose) => {
      destination.current = pose;
      moving.current = true;
      if (
        previous &&
        previous.key !== viewKey &&
        !forced &&
        !p.playing &&
        !p.reduced &&
        controls.current
      ) {
        const fromView = previous.key.split(":")[0] as View;
        const context: View = [fromView, p.state.view].some((v) =>
          ["overview", "input", "output"].includes(v),
        )
          ? "overview"
          : "layer";
        const scale = Math.max(1, 1.6 / (size.width / size.height));
        const outgoing = captureScene(scene);
        applySceneView(context);
        const surroundings = captureScene(scene);
        applySceneView(p.state.view);
        const incoming = captureScene(scene);
        // Reveal destination detail while still wide, before approaching it.
        incoming.forEach((pose, object) => {
          if (pose.alpha > 0 && surroundings.get(object)!.alpha === 0)
            surroundings.set(object, pose);
        });
        blendScene(outgoing, surroundings, 0);
        navigation.current = {
          outgoing,
          surroundings,
          incoming,
          elapsed: 0,
          phase: "zoom-out",
          context,
          target: p.state.view,
          from: {
            position: camera.position.toArray(),
            target: controls.current.target.toArray(),
          },
          via:
            context === "overview"
              ? { position: [17, 15, 22 * scale], target: [0, 0, 0] }
              : { position: [5, 10, 23 * scale], target: [0, 0.6, 0] },
          to: pose,
        };
        controls.current.enabled = false;
        setPresentationView(fromView);
      } else {
        navigation.current = null;
        applySceneView(p.state.view);
        if (controls.current) controls.current.enabled = !p.playing;
        setPresentationView(p.state.view);
      }
    };
    if (forced) viewPoses.current.clear();
    previousView.current = { key: viewKey, revision: p.cameraRevision };
    if (
      !forced &&
      !p.playing &&
      previous?.key !== viewKey &&
      viewPoses.current.has(viewKey)
    ) {
      travel(viewPoses.current.get(viewKey)!);
      return;
    }
    if (!forced && !p.playing && previous?.key === viewKey) return;
    const anchor = nodes.get(anchors[p.state.view]);
    const d = anchor?.userData ?? {};
    let position = anchor
      ? anchor.getWorldPosition(new THREE.Vector3()).toArray()
      : [18, 15, 20];
    let target = [d.target_x ?? 0, d.target_y ?? 0, d.target_z ?? 0];
    const z = (p.state.group - 3.5) * 1.2;
    const aspect = size.width / size.height;
    const distanceScale = Math.max(1, 1.6 / aspect);
    if (p.state.view === "layer") {
      target = [0, 0.6, 0];
      position = [4, 7, 16 * distanceScale];
    }
    if (p.state.view === "attention") {
      target = [-5, -0.6, z];
      position = [-2.2, 2.7, z + 8.5 * distanceScale];
    }
    if (p.state.view === "cache") {
      target = [-4.7, -2.6, z];
      position = [-3.6, 0.2, z + 8 * distanceScale];
    }
    if (p.state.view === "matrix") {
      target = [-3.35, 1.45, z];
      position = [-3.35, 1.45, z + 1.6 * Math.max(1, 1 / aspect)];
    }
    if (p.state.view === "expert") {
      target = [5, -2, 0];
      position = [7.5, 1, 7 * distanceScale];
    }
    if (p.state.view === "router") {
      target = [5, 0, 0];
      position = [5 + 7 * distanceScale, 9 * distanceScale, 2 * distanceScale];
    }
    if (p.state.view === "overview") {
      position = [13, 11, 16 * distanceScale];
    }
    travel({ position, target });
  }, [
    nodes,
    p.state.view,
    p.state.group,
    p.playing,
    p.cameraRevision,
    size.width,
    size.height,
  ]);
  useEffect(() => {
    if (p.restorePose) {
      navigation.current = null;
      applySceneView(p.state.view);
      if (controls.current) controls.current.enabled = !p.playing;
      setPresentationView(p.state.view);
      destination.current = p.restorePose;
      moving.current = true;
    }
  }, [p.restorePose]);
  useEffect(() => {
    scene.updateMatrixWorld(true);
    const sentinel = nodes.get("coordinate_sentinel")!;
    const test = nodes.get("CAM_TEST")!;
    const bounds = new THREE.Box3()
      .setFromObject(sentinel)
      .getSize(new THREE.Vector3());
    const checks = {
      sentinel:
        sentinel
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(new THREE.Vector3(1, 2, 3)) < 1e-5,
      dimensions: bounds.distanceTo(new THREE.Vector3(0.2, 0.4, 0.6)) < 1e-5,
      anchor:
        test
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(new THREE.Vector3(4, 5, 6)) < 1e-5,
      layerCount:
        [...new Set(nodes.values())].filter(
          (o) => o.userData.component === "decoder_layer",
        ).length === 32,
    };
    if (Object.values(checks).some((v) => !v))
      throw Error("GLB coordinate or metadata validation failed");
    p.onReady({
      nodes: new Set(nodes.values()).size,
      semanticIds: [...nodes.keys()],
      assetLoaded: true,
      checks,
    });
  }, [nodes, scene]);
  useFrame((_, dt) => {
    if (navigation.current && controls.current) {
      const route = navigation.current;
      route.elapsed += dt;
      const t = route.elapsed;
      const inwardStart = timing.out + timing.context;
      const phase =
        t < timing.out ? "zoom-out" : t < inwardStart ? "context" : "zoom-in";
      if (phase !== route.phase) {
        route.phase = phase;
        // Retain the layer/model presentation throughout the approach.
        setPresentationView(route.context);
      }
      const inward = t >= inwardStart;
      const progress = inward
        ? (t - inwardStart) / timing.into
        : t / timing.out;
      const pose = cameraBetween(
        inward ? route.via : route.from,
        inward ? route.to : route.via,
        progress,
      );
      blendScene(
        inward ? route.surroundings : route.outgoing,
        inward ? route.incoming : route.surroundings,
        progress,
        inward,
      );
      camera.position.set(...(pose.position as Point));
      controls.current.target.set(...(pose.target as Point));
      controls.current.update();
      if (t >= duration) {
        navigation.current = null;
        setPresentationView(route.target);
        applySceneView(route.target);
        controls.current.enabled = !p.playing;
        moving.current = false;
      }
    } else if (controls.current && moving.current && destination.current) {
      const d = destination.current;
      const alpha = p.reduced ? 1 : 1 - Math.exp(-dt * 8);
      camera.position.lerp(new THREE.Vector3(...d.position), alpha);
      controls.current.target.lerp(new THREE.Vector3(...d.target), alpha);
      controls.current.update();
      if (
        camera.position.distanceTo(new THREE.Vector3(...d.position)) < 0.015 &&
        controls.current.target.distanceTo(new THREE.Vector3(...d.target)) <
          0.015
      ) {
        camera.position.set(...(d.position as Point));
        controls.current.target.set(...(d.target as Point));
        controls.current.update();
        moving.current = false;
      }
    }
    if (controls.current)
      p.cameraRef.current = {
        position: camera.position.toArray(),
        target: controls.current.target.toArray(),
      };
    (window as any).__explorerRender = {
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      textures: gl.info.memory.textures,
      geometries: gl.info.memory.geometries,
    };
    const selectedIds = [
      ...Array.from({ length: 32 }, (_, i) => `layer_${i}`),
      "focus",
      "stack",
      `group_${p.state.group}`,
      `q_${p.state.group * 4}`,
      `score_${p.state.group}`,
      "router",
      "input",
      "embedding",
      "final_norm",
      "lm_head",
      "output",
      ...Array.from({ length: 8 }, (_, group) => `cache_link_${group}`),
      ...Array.from(
        { length: 8 },
        (_, group) => `cache_link_${group}_segment_0`,
      ),
      ...Array.from({ length: 8 }, (_, group) => `cache_${group}`),
      ...Array.from({ length: 8 }, (_, group) => `k_${group}`),
      ...Array.from({ length: 8 }, (_, group) => `score_${group}`),
      ...Array.from({ length: 8 }, (_, group) => `cache_k_${group}`),
      ...Array.from({ length: 8 }, (_, group) => `cache_v_${group}`),
      `expert_${p.state.expert}`,
      "expert_detail",
    ];
    const rect = gl.domElement.getBoundingClientRect();
    (window as any).__explorerScene = {
      selected: { ...p.state },
      presentedView: visibleView,
      navigationPhase: navigation.current?.phase ?? "settled",
      navigationElapsed: navigation.current?.elapsed ?? 0,
      expandedCount: nodes.get("focus")?.visible ? 1 : 0,
      decode: p.decode,
      flowTime: p.flowTime,
      flowPlaying: p.flowPlaying,
      flowPackets: renderScene.children.flatMap(function collect(o): any[] {
        return [
          ...(o.userData.flowPacket
            ? [
                {
                  kind: o.userData.flowPacket,
                  position: o.getWorldPosition(new THREE.Vector3()).toArray(),
                  visible: isVisibleInScene(o),
                },
              ]
            : []),
          ...o.children.flatMap(collect),
        ];
      }),
      time: p.time,
      routeExperts: p.top2,
      routerPaths: p.top2.map((expert) => {
        const paths = routerPaths(expert);
        return { expert, ...paths, points: [...paths.input, ...paths.output] };
      }),
      routerOutputProgress: Math.min(1, Math.max(0, (p.time - 49) / 7)),
      lastPick: lastPick.current,
      routerOutputPositions:
        p.state.view === "router"
          ? p.top2.map((expert) => ({
              expert,
              position: renderScene
                .getObjectByName("output-vector" + expert)
                ?.getWorldPosition(new THREE.Vector3())
                .toArray(),
            }))
          : [],
      routeWeights: values.router.weights,
      attentionRow: values.attention[p.state.token],
      attentionEndpoints: values.attention[p.state.token].map(
        (weight, key) => ({
          key,
          allowed: key <= p.state.token,
          weight,
          position: attentionPath(p.state.group, key).at(-1),
        }),
      ),
      attentionPaths: Array.from({ length: p.state.token + 1 }, (_, key) => ({
        key,
        points: attentionPath(p.state.group, key),
      })),
      tokenPosition: tokenPose(p.time, p.state.spacing, p.state.layer),
      generationNewToken: p.time >= 74,
      chosenChunk: values.candidates.reduce((best, item) =>
        item.logit > best.logit ? item : best,
      ).token,
      greedyChoiceIllustrative: true,
      cache: {
        layer: p.state.layer,
        group: p.state.group,
        retainedKeys: values.cache.keys,
        retainedValues: values.cache.values,
        newKey: p.decode ? values.cache.nextKey : null,
        newValue: p.decode ? values.cache.nextValue : null,
      },
      attentionKeys: Array.from({ length: p.state.token + 1 }, (_, i) => i),
      cacheRows: p.decode ? 9 : 8,
      camera: p.cameraRef.current,
      nodes: Object.fromEntries(
        selectedIds.map((id) => {
          const o = nodes.get(id)!;
          const world = o.getWorldPosition(new THREE.Vector3());
          const screen = world.clone().project(camera);
          let visible = true;
          for (let a: THREE.Object3D | null = o; a; a = a.parent)
            visible = visible && a.visible;
          return [
            id,
            {
              position: o.position.toArray(),
              world: world.toArray(),
              visible,
              opacity:
                o instanceof THREE.Mesh
                  ? (o.material as THREE.Material).opacity
                  : 1,
              semantic: o.userData,
              screen: [
                rect.left + ((screen.x + 1) * rect.width) / 2,
                rect.top + ((1 - screen.y) * rect.height) / 2,
              ],
            },
          ];
        }),
      ),
    };
  });
  return (
    <>
      <primitive
        object={scene}
        onClick={(e: any) => {
          if (navigation.current) return;
          e.stopPropagation();
          let o = e.object;
          while (o && !o.userData.interactive) o = o.parent;
          if (o) {
            lastPick.current = {
              ...o.userData,
              id: o.userData.id || o.name,
              count: (lastPick.current?.count ?? 0) + 1,
            };
            p.onPick(o.userData.id || o.name, o.userData);
          }
        }}
      />
      <Effects
        p={{ ...p, state: { ...p.state, view: visibleView } }}
        nodes={nodes}
      />
      <OrbitControls
        ref={controls}
        enabled={!p.playing && !navigation.current}
        makeDefault
        minDistance={0.7}
        maxDistance={65}
        onStart={() => (moving.current = false)}
        onEnd={() => {
          if (p.playing || !controls.current) return;
          const distance = camera.position.distanceTo(controls.current.target);
          // Different entry/exit distances prevent oscillation between detail levels.
          if (p.state.view === "overview" && distance < 10) p.onView("layer");
          else if (p.state.view === "layer" && distance < 6)
            p.onView("attention");
          else if (p.state.view === "layer" && distance > 40)
            p.onView("overview");
          else if (p.state.view === "attention" && distance > 22)
            p.onView("layer");
        }}
      />
    </>
  );
}
export default function Scene(p: Props) {
  return (
    <Canvas
      events={sceneEvents}
      camera={{ position: [18, 15, 20], fov: 45, near: 0.05, far: 200 }}
      dpr={p.lowQuality ? 1 : [1, 1.5]}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#101820"]} />
      <ambientLight intensity={1.8} />
      <directionalLight position={[2, 12, 8]} intensity={2.5} />
      <Suspense fallback={null}>
        <Model {...p} />
      </Suspense>
      <gridHelper
        args={[45, 30, "#25343d", "#17242c"]}
        position={[0, -4.4, 0]}
      />
    </Canvas>
  );
}
