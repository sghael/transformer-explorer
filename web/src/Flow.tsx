import { Html, Line } from "@react-three/drei";
import type { View } from "./data";
import { pointAlongPath, routerPaths, type Point } from "./spatial";

type Props = {
  view: View;
  time: number;
  group: number;
  token: number;
  spacing: number;
  experts: number[];
};
type Kind = "token" | "vector" | "tensor";
function Packet({
  position,
  kind,
  color = "#ffe1a0",
}: {
  position: Point;
  kind: Kind;
  color?: string;
}) {
  return (
    <group position={position} userData={{ flowPacket: kind }}>
      {kind === "token" ? (
        <mesh>
          <sphereGeometry args={[0.2, 16, 12]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ) : (
        Array.from({ length: kind === "tensor" ? 24 : 8 }, (_, i) => (
          <mesh
            key={i}
            position={[((i % 8) - 3.5) * 0.085, Math.floor(i / 8) * 0.105, 0]}
          >
            <sphereGeometry args={[0.038 + (i % 3) * 0.006, 8, 6]} />
            <meshBasicMaterial color={color} />
          </mesh>
        ))
      )}
    </group>
  );
}
function Track({
  points,
  progress,
  kind = "vector",
  color = "#ffe1a0",
}: {
  points: Point[];
  progress: number;
  kind?: Kind;
  color?: string;
}) {
  return (
    <>
      <Line
        points={points}
        color={color}
        lineWidth={1}
        transparent
        opacity={0.35}
      />
      <Packet
        position={pointAlongPath(points, progress)}
        kind={kind}
        color={color}
      />
    </>
  );
}
const caption = {
  color: "#f5e7c6",
  background: "#17242cee",
  border: "1px solid #716342",
  borderRadius: 5,
  padding: "5px 8px",
  whiteSpace: "nowrap" as const,
  fontSize: 12,
  pointerEvents: "none" as const,
};
/** A 12-second schematic cycle. Markers are sampled representations, not inference. */
export default function Flow({
  view,
  time,
  group,
  token,
  spacing,
  experts,
}: Props) {
  const phase = (time % 12) / 12;
  const z = (group - 3.5) * 1.2;
  let message = "";
  let tracks: React.ReactNode;
  if (["overview", "input", "output"].includes(view)) {
    const first = -4.96 * spacing,
      last = 4.96 * spacing;
    const stages: { end: number; points: Point[]; kind: Kind; text: string }[] =
      [
        {
          end: 0.12,
          points: [
            [-8, 0.6, 0],
            [-5.5, 0.6, 0],
          ],
          kind: "token",
          text: "Token ID → embedding lookup",
        },
        {
          end: 0.65,
          points: [
            [-5.5, 0.6, 0],
            [-5.5, 0.6, first],
            [0, 0.6, first],
            [0, 0.6, last],
          ],
          kind: phase < 0.28 ? "tensor" : "vector",
          text:
            phase < 0.28
              ? "Prompt positions × channels → prefill"
              : "Hidden vector → 32 sequential layers",
        },
        {
          end: 0.82,
          points: [
            [0, 0.6, last],
            [4.8, 0.6, last],
            [4.8, 0.6, 0],
            [7, 0.6, 0],
            [9.5, 0.6, 0],
          ],
          kind: "vector",
          text: "Final norm → logits → select next token",
        },
        {
          end: 1,
          points: [
            [9.5, 0.6, 0],
            [9.5, -3.2, 0],
            [-8, -3.2, 0],
            [-8, 0.6, 0],
          ],
          kind: "token",
          text: "New token returns · next decode step reuses K/V",
        },
      ];
    const i = stages.findIndex((stage) => phase < stage.end),
      stage = stages[Math.max(0, i)];
    const start = i > 0 ? stages[i - 1].end : 0;
    message = stage.text;
    tracks = (
      <>
        <Track
          points={stage.points}
          progress={(phase - start) / (stage.end - start)}
          kind={stage.kind}
        />
        <Line
          points={stages[3].points}
          color="#70d8cc"
          lineWidth={1}
          transparent
          opacity={0.4}
        />
      </>
    );
  } else if (view === "layer") {
    message =
      "Activation vector → normalization → attention → residual → experts → residual";
    tracks = (
      <>
        <Track
          points={[
            [-9, 0.2, 0],
            [11, 0.2, 0],
          ]}
          progress={phase}
        />
        {phase > 0.45 &&
          experts.map((expert, i) => (
            <Track
              key={expert}
              points={[
                ...routerPaths(expert).input,
                ...routerPaths(expert).output,
              ]}
              progress={(phase - 0.45) / 0.55}
              color={i ? "#70d8cc" : "#ffe1a0"}
            />
          ))}
      </>
    );
  } else if (view === "router") {
    const input = phase < 0.45;
    message = input
      ? "One activation vector → two selected experts"
      : "Two transformed vectors → weighted sum";
    tracks = experts.map((expert, i) => (
      <Track
        key={expert}
        points={routerPaths(expert)[input ? "input" : "output"]}
        progress={input ? phase / 0.45 : (phase - 0.45) / 0.55}
        color={i ? "#70d8cc" : "#ffe1a0"}
      />
    ));
  } else if (view === "expert") {
    message = "Gate and up vectors → elementwise product → down projection";
    tracks = [-0.5, 0.5].map((depth, i) => (
      <Track
        key={depth}
        points={[
          [4, -2, depth],
          [5.8, -2, depth],
          [5.8, -2, 0],
          [6.8, -2, 0],
        ]}
        progress={phase}
        color={i ? "#70d8cc" : "#ffe1a0"}
      />
    ));
  } else if (view === "cache") {
    const append = phase >= 0.5;
    message = append
      ? "Decode: append this token’s new K/V vectors"
      : "Read retained K/V · no prompt recomputation";
    tracks = [-5, -2.7].map((x, i) => (
      <Track
        key={x}
        points={
          append
            ? [
                [-7, -3.9, z + 0.35],
                [x, -3.9, z + 0.35],
                [x, -3.56, z + 0.35],
              ]
            : [
                [x, -1.8 - token * 0.22, z + 0.35],
                [x, -1.1, z + 0.35],
                [-1, -1.1, z + 0.35],
              ]
        }
        progress={append ? (phase - 0.5) * 2 : phase * 2}
        color={i ? "#bf9be9" : "#70d8cc"}
      />
    ));
  } else {
    message =
      phase < 0.5
        ? "Query and keys → match scores → causal mask"
        : "Attention weights × value vectors → weighted sum";
    tracks =
      view === "matrix" ? (
        <Track
          points={[
            [-3.8, 1.9, z + 0.1],
            [-2.9, 1.9, z + 0.1],
            [-2.9, 1, z + 0.1],
          ]}
          progress={phase}
          kind="tensor"
        />
      ) : (
        <Track
          points={
            phase < 0.5
              ? [
                  [-7.1, 1, z],
                  [-5.8, 1, z],
                  [-5.8, 1.45, z],
                  [-3.35, 1.45, z],
                ]
              : [
                  [-3.35, 1.45, z],
                  [-3.35, -0.2, z],
                  [-5.5, -0.2, z],
                  [-2.8, -0.2, z],
                ]
          }
          progress={phase < 0.5 ? phase * 2 : (phase - 0.5) * 2}
        />
      );
  }
  return (
    <group name="computation-flow">
      {tracks}
      <Html
        fullscreen
        calculatePosition={(_object, _camera, size) => [
          size.width / 2,
          size.height / 2,
        ]}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            ...caption,
            position: "absolute",
            top: 12,
            left: 12,
            maxWidth: "calc(100% - 24px)",
            whiteSpace: "normal",
          }}
        >
          {message}
        </div>
      </Html>
    </group>
  );
}
