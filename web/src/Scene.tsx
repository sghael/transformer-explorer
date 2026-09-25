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
import { routerPaths, pointAlongPath, type Point } from "./spatial";
import Flow from "./Flow";
import { belongsToFocus, type NormFocus } from "./context";
import {
  FOCUS_SCALE,
  layerOrigin,
  inLayer,
  planFlight,
  flightPose,
  type FlightLeg,
} from "./navigation";
import { layout, macroX, macroPaths, stackEnds, type MacroId } from "./layout";
export type ContextMode = "full" | "muted" | "isolated";
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
  normFocus?: NormFocus | null;
  contextMode: ContextMode;
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
// OrbitControls keeps a released drag's damped rotation privately and keeps
// spending it on every update(), even while disabled for a flight. Discard it
// when navigation takes the camera, or the pose drifts after arrival.
function stopOrbitInertia(controls: Controls) {
  const position = controls.object.position.clone();
  const target = controls.target.clone();
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update(); // Undamped update() applies and clears pending motion.
  controls.enableDamping = damping;
  controls.object.position.copy(position);
  controls.target.copy(target);
  controls.update();
}
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
  background: "rgba(13,24,33,.65)",
  padding: "2px 4px",
  textShadow: "0 1px 3px #101820",
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
      const world = pos.clone();
      ref.current.parent?.worldToLocal(pos);
      ref.current.position.copy(pos).add(new THREE.Vector3(...offset));
      const scale = ref.current.getWorldScale(new THREE.Vector3()).x;
      const distance = camera.position.distanceTo(world) / scale;
      if (shown.current && distance > maxDistance + 2) shown.current = false;
      else if (!shown.current && distance < maxDistance - 2)
        shown.current = true;
      if (html.current)
        html.current.style.display =
          shown.current &&
          isVisibleInScene(ref.current) &&
          isVisibleInScene(node) &&
          !node.userData.contextLabelHidden
            ? "inline"
            : "none";
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
  const [first, last] = stackEnds(spacing);
  const x = (id: MacroId): Point => [macroX(id, spacing), 0, 0];
  const feedback = macroPaths(spacing).generation_feedback;
  const stops: [number, Point][] = [
    [0, x("input")],
    [6, x("input")],
    [11, x("embedding")],
    [13, [first, 0, 0]],
    [20, layerOrigin(layer, spacing)],
    [66, layerOrigin(layer, spacing)],
    [70, [last, 0, 0]],
    [72, x("final_norm")],
    [73, x("lm_head")],
    [74, x("output")],
    [74.5, feedback[1]],
    [75.5, feedback[2]],
    [78.5, feedback[3]],
    [79.5, feedback[4]],
    [80, x("input")],
  ];
  const end = stops.findIndex(([t]) => t > time);
  if (end < 0) return stops.at(-1)![1];
  if (end === 0) return stops[0][1];
  const [ta, a] = stops[end - 1],
    [tb, b] = stops[end];
  return a.map((v, i) => v + ((b[i] - v) * (time - ta)) / (tb - ta)) as Point;
}
// Numerical annotations become legible at their local scale. The structural
// GLB is always present; this controls only explanatory labels and sample marks.
function AnnotationLevel({
  origin,
  scale = 1,
  center = [0, 0, 0],
  near = 0,
  far = Infinity,
  children,
}: {
  origin: Point;
  scale?: number;
  center?: Point;
  near?: number;
  far?: number;
  children: React.ReactNode;
}) {
  const { camera } = useThree();
  const [visible, setVisible] = useState(false);
  const shown = useRef(false);
  useFrame(() => {
    const anchor = new THREE.Vector3(...center)
      .multiplyScalar(scale)
      .add(new THREE.Vector3(...origin));
    const distance = camera.position.distanceTo(anchor) / scale;
    const next = distance >= near && distance <= far;
    if (next !== shown.current) {
      shown.current = next;
      setVisible(next);
    }
  });
  return visible ? (
    <group position={origin} scale={scale}>
      {children}
    </group>
  ) : null;
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
  const compact = useThree((state) => state.size.width < 600);
  const view = p.state.view,
    g = p.state.group,
    z = (g - 3.5) * 1.2;
  const label = (id: string, text: string, offset: Point = [0, 1, 0]) => (
    <Label
      key={id + text}
      node={nodes.get(id)}
      offset={offset}
      maxDistance={view === "cache" ? 20 : Infinity}
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
      {overview && (
        <>
          {label("input", compact ? "IDs" : "Token IDs", [0, 1.2, 0])}
          {label("embedding", compact ? "Embed" : "Embedding", [0, -0.9, 0])}
          {label(
            "stack",
            compact
              ? `Layer ${p.state.layer + 1} / 32`
              : `Layer ${p.state.layer + 1} of 32 · representative`,
            [0, 1.2, 0],
          )}
          {view === "overview" &&
            [
              { x: -3.3, count: p.state.layer, direction: "earlier" },
              { x: 3.3, count: 31 - p.state.layer, direction: "later" },
            ]
              .filter((span) => span.count > 0)
              .map((span) => (
                <group key={span.direction}>
                  <Html
                    position={[span.x, 0, 0]}
                    center
                    style={{
                      ...labelStyle,
                      background: "#101820",
                      font: "28px/8px system-ui",
                      padding: "0 5px",
                      textShadow: "none",
                    }}
                  >
                    <span
                      role="img"
                      aria-label={`${span.count} ${span.direction} layers omitted`}
                    >
                      ⋯
                    </span>
                  </Html>
                  <Html position={[span.x, -2, 0]} center style={labelStyle}>
                    {span.count} {span.direction}
                    {compact ? "" : " layers"}
                  </Html>
                </group>
              ))}
          {label("final_norm", compact ? "Norm" : "Final RMSNorm", [0, 0.8, 0])}
          {label("lm_head", "LM head", [0, compact ? 2.6 : 1.9, 0])}
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
                points={macroPaths(p.state.spacing).generation_feedback}
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
              <Html
                position={[0, 0.5, layout.feedback_z]}
                center
                style={labelStyle}
              >
                New token → embedding · retained K/V reused
              </Html>
            </>
          )}
        </>
      )}
      {view === "layer" && (
        <>
          {label("norm1", compact ? "Norm 1" : "RMSNorm 1", [-0.5, -2, 0])}
          {label("attention", "8 attention groups", [0, 2.5, 3])}
          {label("add1", compact ? "+1" : "+ residual 1", [-0.6, -0.9, 0])}
          {label("norm2", compact ? "Norm 2" : "RMSNorm 2", [0.5, -2, 0])}
          {label("router", "Router", [0, -0.8, 0])}
          {label(
            "experts",
            compact ? "8 experts" : "8 parallel experts",
            [5, 1.8, 3.4],
          )}
          {label("merge", compact ? "Merge" : "Weighted merge", [0, -2, 0])}
          {label("add2", compact ? "+2" : "+ residual 2", [0.6, -0.9, 0])}
          {!compact &&
            label("residual_attention", "Attention bypass", [-5.5, 0.6, -5.4])}
          {!compact && label("residual_moe", "MoE bypass", [4.5, 0.6, 5.4])}
          {label(
            "representative_layer",
            `Layer ${p.state.layer + 1}`,
            [-0.5, -1.2, 0],
          )}
        </>
      )}
      {view === "attention" && (
        <>
          {label(
            `q_${g * 4}`,
            compact
              ? "Q · queries"
              : `Query projections (Q) · heads ${g * 4 + 1}–${g * 4 + 4}`,
            [-0.95, 0.1, 0],
          )}
          {label(
            `k_${g}`,
            compact ? "K · key" : "Key projection (K)",
            [-0.4, -1, 0.5],
          )}
          {label(
            `v_${g}`,
            compact ? "V · value" : "Value projection (V)",
            [0.4, -1, 0.5],
          )}
          {label(`rope_q_${g * 4}`, "RoPE · Q", [
            -0.5,
            compact ? 1.05 : 0.5,
            0,
          ])}
          {label(`rope_k_${g}`, "RoPE · K", [0.5, 0.6, 0])}
          {label(
            `score_${g}`,
            compact ? "Attention weights" : "Attention weights · one head",
            [0.7, 0.65, 0],
          )}
          {label(
            `weighted_sum_${g}`,
            compact ? "Weighted V sum" : "Weighted value sum",
            [0.95, -0.35, 0],
          )}
          {label(`cache_k_${g}`, "K cache", [-0.3, compact ? -0.45 : -0.75, 0])}
          {label(`cache_v_${g}`, "V cache", [0.3, compact ? -1.1 : -0.75, 0])}
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
          {(["k", "v"] as const).map((kind) => {
            const sheet = nodes.get(`cache_${kind}_${g}`) as THREE.Mesh;
            const center = nodes
              .get("focus")!
              .worldToLocal(sheet.getWorldPosition(new THREE.Vector3()));
            sheet.geometry.computeBoundingBox();
            const size = sheet.geometry.boundingBox!.getSize(
              new THREE.Vector3(),
            );
            const top = center.y + size.y / 2;
            return (
              <group key={kind}>
                <Html
                  position={[center.x, top + 0.055, center.z + 0.04]}
                  center
                  style={labelStyle}
                >
                  {kind.toUpperCase()} · {p.decode ? 9 : 8} retained rows
                </Html>
                {Array.from({ length: p.decode ? 9 : 8 }, (_, row) => (
                  <group key={row}>
                    <mesh
                      position={[
                        center.x,
                        top - 0.05 - row * 0.088,
                        center.z + 0.025,
                      ]}
                    >
                      <boxGeometry args={[size.x - 0.018, 0.067, 0.008]} />
                      <meshBasicMaterial
                        color={
                          row === 8
                            ? "#d7b97c"
                            : row === p.state.token
                              ? "#ced3a8"
                              : kind === "k"
                                ? "#398f83"
                                : "#85659c"
                        }
                      />
                    </mesh>
                    <Html
                      position={[
                        center.x - size.x / 2 - 0.045,
                        top - 0.05 - row * 0.088,
                        center.z + 0.04,
                      ]}
                      center
                      style={{ ...labelStyle, fontSize: 10, padding: 0 }}
                    >
                      {row + 1}
                    </Html>
                  </group>
                ))}
              </group>
            );
          })}
          <Html position={[-4.9, -2.84, z + 0.04]} center style={labelStyle}>
            Sampled channels →
          </Html>
        </>
      )}
      {["router", "layer"].includes(view) && (
        <>
          {view === "router" && (
            <>
              {label(
                "router",
                compact ? "Top 2" : `Token ${p.state.token + 1}: choose 2`,
                [0, 1.7, 0],
              )}
              {label(
                "merge",
                compact ? "Merge" : "Combine outputs",
                [0, 1.7, 0],
              )}
              {Array.from({ length: 8 }, (_, e) =>
                label(
                  `expert_${e}`,
                  `${compact ? "E" : "Expert "}${e + 1}${p.top2.includes(e) ? " ✓" : ""}`,
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
            `Expert ${p.state.expert + 1} · ${p.top2.includes(p.state.expert) ? "distinct learned weights" : "not selected for this token"}`,
            [0, 0.65, 0],
          )}
          {label("gate", "Gate 4096 → 14336", [-0.3, 0.35, 0])}
          {label("up", "Up 4096 → 14336", [-0.2, -0.35, 0])}
          {label("silu", "SiLU", [0, 0.2, -0.2])}
          {label("multiply", "Multiply", [0, -0.25, 0])}
          {label("down", "Down → 4096", [0.1, 0.18, 0])}
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
        o.userData.baseColor = (
          o.material as THREE.MeshStandardMaterial
        ).color.getHex();
      }
    });
    return s;
  }, [original]);
  const controls = useRef<Controls>(null);
  const routes = useRef<THREE.Group>(null);
  const contours = useRef<THREE.Group>(null);
  const outlines = useMemo(() => {
    const points: Point[] = [];
    const corner = (bits: number): Point =>
      layout.layer_dimensions.map(
        (size, axis) => ((bits & (1 << axis) ? 1 : -1) * size) / 2,
      ) as Point;
    for (let bits = 0; bits < 8; bits++)
      for (let axis = 0; axis < 3; axis++) {
        if (!(bits & (1 << axis)))
          points.push(corner(bits), corner(bits | (1 << axis)));
      }
    return points;
  }, []);
  const contextBase = useRef(
    new Map<
      THREE.Object3D,
      { visible: boolean; color?: THREE.Color; emissive?: THREE.Color }
    >(),
  );
  const contextApplied = useRef("");
  const overviewPicking = useRef(false);
  overviewPicking.current = p.state.view === "overview";
  useEffect(() => {
    // At model scale the complete layer footprint is selectable. At cell scale
    // only the visible rails participate, leaving the nested graph pickable.
    const meshes: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        object.userData.component !== "decoder_layer"
      )
        return;
      const mesh = object;
      meshes.push(mesh);
      mesh.geometry.computeBoundingBox();
      const inverse = new THREE.Matrix4();
      const localRay = new THREE.Ray();
      const point = new THREE.Vector3();
      mesh.raycast = (raycaster, intersections) => {
        if (!overviewPicking.current) {
          THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersections);
          return;
        }
        inverse.copy(mesh.matrixWorld).invert();
        localRay.copy(raycaster.ray).applyMatrix4(inverse);
        if (!localRay.intersectBox(mesh.geometry.boundingBox!, point)) return;
        point.applyMatrix4(mesh.matrixWorld);
        const distance = raycaster.ray.origin.distanceTo(point);
        if (distance >= raycaster.near && distance <= raycaster.far)
          intersections.push({ distance, point: point.clone(), object: mesh });
      };
    });
    return () =>
      meshes.forEach((mesh) => {
        mesh.raycast = THREE.Mesh.prototype.raycast;
      });
  }, [scene]);
  const lastPick = useRef<Record<string, any> | null>(null);
  const { camera, gl, size, scene: renderScene, raycaster } = useThree();
  useEffect(() => {
    (window as any).__explorerInspect = () => ({
      camera,
      scene: renderScene,
      gl,
      raycaster,
    });
    return () => {
      delete (window as any).__explorerInspect;
    };
  }, [camera, renderScene, gl, raycaster]);
  const destination = useRef<CameraPose | null>(null);
  const moving = useRef(false);
  const navigation = useRef<{
    elapsed: number;
    legs: FlightLeg[];
    target: View;
    phase: string;
    to: CameraPose;
  } | null>(null);
  const visibleView = p.state.view;
  const viewPoses = useRef(new Map<string, CameraPose>());
  const previousView = useRef<{ key: string; revision: number } | null>(null);
  const nodes = useMemo(() => {
    const map = new Map<string, THREE.Object3D>();
    scene.traverse((o) => {
      map.set(o.userData.id || o.name, o);
      map.set(o.name, o);
    });
    for (const id of [
      "expert_detail",
      "gate",
      "up",
      "silu",
      "multiply",
      "down",
    ]) {
      const selected = map.get(`${id}_${p.state.expert}`);
      if (selected) map.set(id, selected);
    }
    return map;
  }, [scene, p.state.expert]);
  const values = useMemo(
    () => sample(p.state.layer, p.state.group, p.state.token),
    [p.state.layer, p.state.group, p.state.token],
  );
  const texture = useMemo(
    () => heatmap(values.attention, p.state.token),
    [values, p.state.token],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  function applySelectionLayout() {
    // All structural geometry occupies one persistent coordinate system.
    // Camera navigation preserves position and scale; context styling is separate.
    scene.traverse((o) => {
      const d = o.userData,
        id = d.id || o.name;
      o.visible =
        d.component !== "camera_anchor" && d.component !== "diagnostic";

      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        m.color.setHex(o.userData.baseColor);
        if (typeof d.group === "number" && d.group !== p.state.group)
          m.color.lerp(new THREE.Color("#253943"), 0.8);
        if (
          typeof d.expert === "number" &&
          d.expert !== p.state.expert &&
          d.component !== "expert"
        )
          m.color.lerp(new THREE.Color("#35434b"), 0.65);
        m.opacity = 1;
        m.transparent = false;
        m.depthWrite = true;
        if (d.component === "attention_scores") {
          m.map = null;
          m.needsUpdate = true;
        }
        if (id === "representative_layer") {
          m.color.set("#d0b87e");
          m.emissive.set("#332a16");
        }
        if (/^expert_\d+$/.test(id))
          m.color.set(p.top2.includes(d.expert) ? "#c8ad75" : "#596779");
      }
      if (id === "representative_layer") {
        d.layer = p.state.layer;
        o.position.set(0, 0, 0);
      }
    });
    const stack = nodes.get("stack")!;
    stack.position.set(0, 0, 0);
    stack.scale.setScalar(1);
    const focus = nodes.get("focus")!;
    focus.position.set(...layerOrigin(p.state.layer, p.state.spacing));
    focus.scale.setScalar(FOCUS_SCALE);
    const setPath = (id: string, points: Point[]) => {
      points.slice(1).forEach((end, i) => {
        const start = points[i];
        const segment = nodes.get(`${id}_segment_${i}`) as
          | THREE.Mesh
          | undefined;
        if (!segment) return;
        segment.geometry.computeBoundingBox();
        const size = segment.geometry.boundingBox!.getSize(new THREE.Vector3());
        segment.position.set(
          ...(start.map((v, axis) => (v + end[axis]) / 2) as Point),
        );
        segment.scale.set(1, 1, 1);
        const axis = start.findIndex(
          (v, axis) => Math.abs(end[axis] - v) > 0.00001,
        );
        if (axis >= 0)
          segment.scale.setComponent(
            axis,
            Math.abs(end[axis] - start[axis]) / size.getComponent(axis),
          );
      });
    };
    for (const id of Object.keys(layout.macro_nodes) as MacroId[])
      nodes.get(id)!.position.set(macroX(id, p.state.spacing), 0, 0);
    for (const [id, points] of Object.entries(macroPaths(p.state.spacing)))
      setPath(id, points);
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
    const material = score.material as THREE.MeshStandardMaterial;
    material.map = texture;
    material.color.set("#ffffff");
    material.needsUpdate = true;
    contextBase.current.clear();
    scene.traverse((object) => {
      const material =
        object instanceof THREE.Mesh
          ? (object.material as THREE.MeshStandardMaterial)
          : null;
      contextBase.current.set(object, {
        visible: object.visible,
        color: material?.color.clone(),
        emissive: material?.emissive.clone(),
      });
    });
    contextApplied.current = "";
    scene.updateMatrixWorld(true);
  }
  useLayoutEffect(() => {
    applySelectionLayout();
  }, [scene, nodes, p.state.layer, p.state.spacing, p.top2, texture]);
  function normPose(id: NormFocus): CameraPose {
    const object = nodes.get(id)!;
    object.updateWorldMatrix(true, false);
    const bounds = new THREE.Box3().setFromObject(object);
    const target = bounds.getCenter(new THREE.Vector3());
    const dimensions = bounds.getSize(new THREE.Vector3());
    // Normalization disks face along X. Inspect the original face at its actual
    // world scale, with a slight oblique angle that reveals the disk thickness.
    const diameter = Math.max(dimensions.y, dimensions.z);
    const offset = new THREE.Vector3(2.5, 0.7, 1.2).multiplyScalar(diameter);
    return {
      target: target.toArray(),
      position: target.clone().add(offset).toArray(),
    };
  }
  function poseFor(view: View): CameraPose {
    const aspect = size.width / size.height;
    const distanceScale = Math.max(1, 1.6 / aspect);
    const z = (p.state.group - 3.5) * 1.2;
    let target = [0, 0.6, 0],
      position = [4, 7, 16 * distanceScale];
    if (view === "attention") {
      target = [-4.8, -0.25, z];
      position = [-1.8, 2.8, z + 7];
    }
    if (view === "cache") {
      target = [-4.9, -2.36, z];
      position = [-4.9, -2.36, z + 1.1];
    }
    if (view === "matrix") {
      target = [-3.35, 1.45, z];
      position = [-3.35, 1.45, z + 1.15];
    }
    if (view === "expert") {
      const depth = (p.state.expert - 3.5) * 1.1;
      target = [5, 0, depth];
      position = [5 + 0.55 * distanceScale, 0.45 * distanceScale, depth + 0.72];
    }
    if (view === "router") {
      target = [5, 0, 0];
      position = [12, 9, 2];
    }
    if (["overview", "input", "output"].includes(view)) {
      if (view === "overview") {
        const fit =
          (macroX("output", p.state.spacing) -
            macroX("input", p.state.spacing) +
            2) /
          33;
        return { position: [0, 12 * fit, 25 * fit], target: [0.5, 0, 0] };
      }
      const anchor = nodes.get(anchors[view])!;
      const d = anchor.userData;
      const shift =
        macroX(view === "input" ? "input" : "output", p.state.spacing) -
        layout.macro_nodes[view === "input" ? "input" : "output"].x;
      const position = anchor.getWorldPosition(new THREE.Vector3()).toArray();
      position[0] += shift;
      return { position, target: [d.target_x + shift, d.target_y, d.target_z] };
    }
    return {
      position: inLayer(position, p.state.layer, p.state.spacing),
      target: inLayer(target, p.state.layer, p.state.spacing),
    };
  }
  useEffect(() => {
    const viewKey = `${p.state.view}:${p.state.layer}:${p.state.group}:${p.state.expert}:${p.state.spacing}:${p.normFocus ?? ""}`;
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
    if (forced) viewPoses.current.clear();
    previousView.current = { key: viewKey, revision: p.cameraRevision };
    if (!forced && !p.playing && previous?.key === viewKey) return;
    const pose = p.normFocus
      ? normPose(p.normFocus)
      : (!forced && !p.playing && viewPoses.current.get(viewKey)) ||
        poseFor(p.state.view);
    destination.current = pose;
    moving.current = true;
    if (controls.current) stopOrbitInertia(controls.current);
    if (
      previous &&
      previous.key !== viewKey &&
      !forced &&
      !p.playing &&
      !p.reduced &&
      controls.current
    ) {
      const from = {
        position: camera.position.toArray(),
        target: controls.current.target.toArray(),
      };
      navigation.current = {
        elapsed: 0,
        target: p.state.view,
        to: pose,
        phase: "aim",
        legs: planFlight(
          previous.key.split(":")[0] as View,
          p.state.view,
          from,
          pose,
          poseFor,
        ),
      };
      controls.current.enabled = false;
    } else {
      navigation.current = null;
      if (controls.current) controls.current.enabled = !p.playing;
    }
  }, [
    nodes,
    p.state.view,
    p.normFocus,
    p.state.layer,
    p.state.group,
    p.state.expert,
    p.state.spacing,
    p.playing,
    p.cameraRevision,
    size.width,
    size.height,
  ]);
  useEffect(() => {
    if (p.restorePose) {
      navigation.current = null;
      applySelectionLayout();
      if (controls.current) {
        stopOrbitInertia(controls.current);
        controls.current.enabled = !p.playing;
      }
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
        ).length === 1,
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
      route.elapsed += Math.min(dt, 0.05);
      const flight = flightPose(route.legs, route.elapsed);
      route.phase = flight.phase;
      camera.position.set(...(flight.pose.position as Point));
      controls.current.target.set(...(flight.pose.target as Point));
      controls.current.update();
      if (flight.done) {
        navigation.current = null;
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
        camera.position.distanceTo(new THREE.Vector3(...d.position)) <
          0.00001 &&
        controls.current.target.distanceTo(new THREE.Vector3(...d.target)) <
          0.00001
      ) {
        camera.position.set(...(d.position as Point));
        controls.current.target.set(...(d.target as Point));
        controls.current.update();
        moving.current = false;
      }
    }
    if (camera instanceof THREE.PerspectiveCamera && controls.current) {
      camera.fov = THREE.MathUtils.radToDeg(
        2 *
          Math.atan(
            Math.tan(THREE.MathUtils.degToRad(25)) *
              Math.max(1, 1.6 / (size.width / size.height)),
          ),
      );
      camera.near = THREE.MathUtils.clamp(
        camera.position.distanceTo(controls.current.target) * 0.001,
        0.000001,
        0.05,
      );
      camera.updateProjectionMatrix();
    }
    // Context recedes as the eye approaches, while the destination keeps its
    // material and world transform. Isolation is an explicit cutaway mode.
    const detail =
      !!p.normFocus || !["overview", "input", "output"].includes(p.state.view);
    const distance = camera.position.distanceTo(
      new THREE.Vector3(...layerOrigin(p.state.layer, p.state.spacing)),
    );
    const normObject = p.normFocus ? nodes.get(p.normFocus) : undefined;
    const normBounds = normObject
      ? new THREE.Box3().setFromObject(normObject)
      : null;
    const normSize = normBounds?.getSize(new THREE.Vector3());
    const normDistance =
      normBounds && normSize
        ? camera.position.distanceTo(
            normBounds.getCenter(new THREE.Vector3()),
          ) / Math.max(normSize.y, normSize.z)
        : Infinity;
    // Keep the parent graph visible while approaching the existing disk. Only
    // cut away its surroundings once the eye reaches the disk's local scale.
    const strength =
      p.normFocus && p.contextMode !== "full"
        ? 1 - THREE.MathUtils.smoothstep(normDistance, 4, 12)
        : detail && p.contextMode !== "full"
          ? 1 - THREE.MathUtils.smoothstep(distance / FOCUS_SCALE, 30, 90)
          : 0;
    const contextKey = `${p.contextMode}:${p.state.view}:${p.normFocus ?? ""}:${p.state.group}:${p.state.expert}:${strength.toFixed(4)}`;
    if (contextApplied.current !== contextKey) {
      const subdued = new THREE.Color("#101820");
      for (const [object, base] of contextBase.current) {
        const outside = !belongsToFocus(
          object,
          p.state.view,
          p.state.group,
          p.state.expert,
          p.normFocus,
        );
        const hide = outside && strength > 0.95 && p.contextMode === "isolated";
        object.visible =
          base.visible && (!(object instanceof THREE.Mesh) || !hide);
        object.userData.contextLabelHidden = outside && strength > 0.75;
        if (object instanceof THREE.Mesh && base.color) {
          const material = object.material as THREE.MeshStandardMaterial;
          material.color
            .copy(base.color)
            .lerp(subdued, outside ? strength * 0.94 : 0);
          if (base.emissive)
            material.emissive
              .copy(base.emissive)
              .multiplyScalar(outside ? 1 - strength : 1);
        }
      }
      if (routes.current) {
        const outside =
          !!p.normFocus || !["layer", "router"].includes(p.state.view);
        routes.current.visible = !(
          outside &&
          strength > 0.95 &&
          p.contextMode === "isolated"
        );
        routes.current.children.forEach((route, i) => {
          const material = (route as THREE.Mesh)
            .material as THREE.MeshBasicMaterial;
          if (material?.color)
            material.color
              .set(i ? "#69bfb3" : "#d3b77b")
              .lerp(subdued, outside ? strength * 0.94 : 0);
        });
      }
      if (contours.current) {
        contours.current.visible = !(
          strength > 0.95 && p.contextMode === "isolated"
        );
        contours.current.children.forEach((line) => {
          const material = (line as THREE.Mesh)
            .material as THREE.MeshBasicMaterial;
          material.color.set("#d0b87e").lerp(subdued, strength * 0.94);
        });
      }
      contextApplied.current = contextKey;
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
      "representative_layer",
      "focus",
      "stack",
      `group_${p.state.group}`,
      `q_${p.state.group * 4}`,
      `score_${p.state.group}`,
      "router",
      "input",
      "embedding",
      "final_norm",
      "norm1",
      "norm2",
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
      contextMode: p.contextMode,
      normFocus: p.normFocus ?? null,
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
              scale: o.getWorldScale(new THREE.Vector3()).toArray(),
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
      <group ref={contours} name="layer-contours">
        <Line
          points={outlines}
          color="#d0b87e"
          segments
          lineWidth={0.9}
          raycast={() => {}}
        />
      </group>
      {!p.normFocus && (p.flowPlaying || p.flowTime > 0) && (
        <group
          position={
            ["overview", "input", "output"].includes(p.state.view)
              ? [0, 0, 0]
              : layerOrigin(p.state.layer, p.state.spacing)
          }
          scale={
            ["overview", "input", "output"].includes(p.state.view)
              ? 1
              : FOCUS_SCALE
          }
        >
          <Flow
            view={p.state.view}
            time={p.flowTime}
            group={p.state.group}
            token={p.state.token}
            spacing={p.state.spacing}
            experts={p.top2}
            expert={p.state.expert}
          />
        </group>
      )}
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
      {p.normFocus && (
        <Label
          node={nodes.get(p.normFocus)}
          offset={[0, p.normFocus === "final_norm" ? 0.34 : 0.06, 0]}
        >
          {p.normFocus === "final_norm"
            ? "Final RMSNorm"
            : p.normFocus === "norm1"
              ? "Attention RMSNorm"
              : "Expert RMSNorm"}
        </Label>
      )}
      {!p.normFocus && (
        <AnnotationLevel
          origin={layerOrigin(p.state.layer, p.state.spacing)}
          near={
            ["overview", "input", "output"].includes(p.state.view)
              ? 0
              : 90 * FOCUS_SCALE
          }
        >
          <group
            position={
              layerOrigin(p.state.layer, p.state.spacing).map(
                (v) => -v,
              ) as Point
            }
          >
            <Effects
              p={{
                ...p,
                state: {
                  ...p.state,
                  view: ["input", "output"].includes(p.state.view)
                    ? p.state.view
                    : "overview",
                },
              }}
              nodes={nodes}
            />
          </group>
        </AnnotationLevel>
      )}
      {(
        [
          ["layer", [0, 0.6, 0], 17, 100],
          ["attention", [-5, 0.5, (p.state.group - 3.5) * 1.2], 0, Infinity],
          [
            "router",
            [5, 0, 0],
            3,
            15 * Math.max(1, (1.6 * size.height) / size.width),
          ],
          ["expert", [5, 0, (p.state.expert - 3.5) * 1.1], 0, 3],
          ["cache", [-4.9, -2.36, (p.state.group - 3.5) * 1.2], 0, 1.8],
          ["matrix", [-3.35, 1.45, (p.state.group - 3.5) * 1.2], 0, 3.5],
        ] as [View, Point, number, number][]
      )
        .filter(([view]) => !p.normFocus && view === p.state.view)
        .map(([view, center, near, far]) => (
          <AnnotationLevel
            key={view}
            origin={layerOrigin(p.state.layer, p.state.spacing)}
            scale={FOCUS_SCALE}
            center={center}
            near={
              view === "layer" &&
              ["overview", "input", "output"].includes(p.state.view)
                ? Infinity
                : near
            }
            far={far}
          >
            <Effects
              p={{
                ...p,
                flowPlaying: p.flowPlaying && p.state.view === view,
                flowTime: p.state.view === view ? p.flowTime : 0,
                state: { ...p.state, view },
              }}
              nodes={nodes}
            />
          </AnnotationLevel>
        ))}
      <group
        ref={routes}
        position={layerOrigin(p.state.layer, p.state.spacing)}
        scale={FOCUS_SCALE}
      >
        {p.top2.map((expert, i) => (
          <Line
            key={expert}
            name={`router-path-${expert}`}
            segments
            points={[
              routerPaths(expert).input,
              routerPaths(expert).output,
            ].flatMap((points) =>
              points.slice(1).flatMap((end, i) => [points[i], end]),
            )}
            color={i ? "#69bfb3" : "#d3b77b"}
            lineWidth={1.3}
          />
        ))}
      </group>
      <OrbitControls
        ref={controls}
        enabled={!p.playing && !navigation.current}
        makeDefault
        minDistance={0.001}
        maxDistance={150}
        onStart={() => (moving.current = false)}
        onEnd={() => {
          if (p.playing || p.normFocus || !controls.current) return;
          const distance =
            camera.position.distanceTo(controls.current.target) /
            (p.state.view === "overview" ? 1 : FOCUS_SCALE);
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
      camera={{ position: [18, 15, 20], fov: 50, near: 0.0001, far: 200 }}
      dpr={p.lowQuality ? 1 : [1, 1.5]}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#101820"]} />
      <ambientLight intensity={1.8} />
      <directionalLight position={[2, 12, 8]} intensity={2.5} />
      <Suspense fallback={null}>
        <Model {...p} />
      </Suspense>
    </Canvas>
  );
}
