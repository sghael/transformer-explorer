import { Line } from "@react-three/drei";
import type { View } from "./data";
import { pointAlongPath, routerPaths, type Point } from "./spatial";

type Props = {
  view: View;
  time: number;
  group: number;
  token: number;
  spacing: number;
  experts: number[];
  expert: number;
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
export function flowDescription(view: View, time: number): string {
  const phase = (time % 12) / 12;
  if (["overview", "input", "output"].includes(view)) {
    if (phase < 0.12) return "Token ID → embedding lookup";
    if (phase < 0.28) return "Prompt positions × channels → prefill";
    if (phase < 0.65) return "Hidden vector → 32 sequential layers";
    if (phase < 0.82) return "Final norm → logits → select next token";
    return "New token returns · next decode step reuses K/V";
  }
  if (view === "layer")
    return "Activation vector → normalization → attention → residual → experts → residual";
  if (view === "router")
    return phase < 0.45
      ? "One activation vector → two selected experts"
      : "Two transformed vectors → weighted sum";
  if (view === "expert")
    return "Gate and up vectors → elementwise product → down projection";
  if (view === "cache")
    return phase >= 0.5
      ? "Decode: append this token’s new K/V vectors"
      : "Read retained K/V · no prompt recomputation";
  return phase < 0.5
    ? "Query and keys → match scores → causal mask"
    : "Attention weights × value vectors → weighted sum";
}
/** A 12-second schematic cycle. Markers are sampled representations, not inference. */
export default function Flow({
  view,
  time,
  group,
  token,
  spacing,
  experts,
  expert,
}: Props) {
  const phase = (time % 12) / 12;
  const z = (group - 3.5) * 1.2;
  let tracks: React.ReactNode;
  if (["overview", "input", "output"].includes(view)) {
    const first = -4.96 * spacing - 0.11,
      last = 4.96 * spacing + 0.11;
    const stages: { end: number; points: Point[]; kind: Kind }[] = [
      {
        end: 0.12,
        points: [
          [-8, 0, 0],
          [-5.5, 0, 0],
        ],
        kind: "token",
      },
      {
        end: 0.65,
        points: [
          [-5.5, 0, 0],
          [-3, 0, 0],
          [-3, 0, first],
          [0, 0, first],
          [0, 0, last],
        ],
        kind: phase < 0.28 ? "tensor" : "vector",
      },
      {
        end: 0.82,
        points: [
          [0, 0, last],
          [3, 0, last],
          [3, 0, 0],
          [4.8, 0, 0],
          [7, 0, 0],
          [9.5, 0, 0],
        ],
        kind: "vector",
      },
      {
        end: 1,
        points: [
          [9.5, 0, 0],
          [11, 0, 0],
          [11, 0, last + 1.73],
          [-9, 0, last + 1.73],
          [-9, 0, 0],
          [-8, 0, 0],
        ],
        kind: "token",
      },
    ];
    const i = stages.findIndex((stage) => phase < stage.end),
      stage = stages[Math.max(0, i)];
    const start = i > 0 ? stages[i - 1].end : 0;
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
    const attention = [
      [-7, 0, 0],
      [-7, 0, z],
      [-7, -0.35, z],
      [-5.9, -0.35, z],
      [-5.9, -0.35, z - 0.315],
      [-5.9, 1.9, z - 0.315],
      [-3.35, 1.9, z - 0.315],
      [-3.35, 1.9, z],
      [-3.35, 0.5, z],
      [-3.35, 0, z],
      [-3.3, 0, z],
      [-3.3, 0, 0],
      [-1, 0, 0],
    ] as Point[];
    tracks = (
      <>
        {phase < 0.12 ? (
          <Track
            points={[
              [-9, 0, 0],
              [-7, 0, 0],
            ]}
            progress={phase / 0.12}
          />
        ) : phase < 0.4 ? (
          <Track points={attention} progress={(phase - 0.12) / 0.28} />
        ) : phase < 0.5 ? (
          <Track
            points={[
              [-1, 0, 0],
              [2.25, 0, 0],
            ]}
            progress={(phase - 0.4) / 0.1}
          />
        ) : phase < 0.88 ? (
          experts.map((e, i) => {
            const depth = (e - 3.5) * 1.1;
            return (
              <Track
                key={e}
                points={[
                  ...routerPaths(e).input,
                  [4.32, 0, depth],
                  [4.32, 0, depth - 0.15],
                  [4.52, 0, depth - 0.15],
                  [5.06, 0, depth - 0.15],
                  [5.06, 0, depth],
                  [5.48, 0, depth],
                  ...routerPaths(e).output,
                ]}
                progress={(phase - 0.5) / 0.38}
                color={i ? "#70d8cc" : "#ffe1a0"}
              />
            );
          })
        ) : (
          <Track
            points={[
              [7.75, 0, 0],
              [11, 0, 0],
            ]}
            progress={(phase - 0.88) / 0.12}
          />
        )}
        <Track
          points={
            phase < 0.4
              ? [
                  [-9, 0, 0],
                  [-9, 0, -5.4],
                  [-2, 0, -5.4],
                  [-2, 0, 0],
                ]
              : [
                  [-1, 0, 0],
                  [-1, 0, 5.4],
                  [10, 0, 5.4],
                  [10, 0, 0],
                ]
          }
          progress={phase < 0.4 ? phase / 0.4 : (phase - 0.4) / 0.6}
          color="#aebfc3"
        />
      </>
    );
  } else if (view === "router") {
    const input = phase < 0.45;
    tracks = experts.map((expert, i) => (
      <Track
        key={expert}
        points={routerPaths(expert)[input ? "input" : "output"]}
        progress={input ? phase / 0.45 : (phase - 0.45) / 0.55}
        color={i ? "#70d8cc" : "#ffe1a0"}
      />
    ));
  } else if (view === "expert") {
    tracks = (
      <group position={[4.82, -0.3, (expert - 3.5) * 1.1]} scale={0.3}>
        {[-0.5, 0.5].map((depth, i) => (
          <Track
            key={depth}
            points={[
              [-1.9, 1, 0],
              [-1.6667, 1, 0],
              [-1.6667, 1, depth],
              [-1, 1, depth],
              [0.8, 1, depth],
              [0.8, 1, 0],
              [1.8, 1, 0],
              [3.1, 1, 0],
            ]}
            progress={phase}
            color={i ? "#70d8cc" : "#ffe1a0"}
          />
        ))}
      </group>
    );
  } else if (view === "cache") {
    const append = phase >= 0.5;
    tracks = [-5.36, -4.44].map((x, i) => {
      const write: Point[] = i
        ? [
            [-3.85, 0.5, z + 0.48],
            [-3.85, -1.964, z + 0.48],
            [x, -1.964, z + 0.48],
            [x, -1.964, z],
          ]
        : [
            [-4.92, 1.9, z + 0.48],
            [-4.6, 1.9, z + 0.48],
            [-4.6, -1.964, z + 0.48],
            [-5, -1.964, z + 0.48],
            [-5, -1.964, z],
            [x, -1.964, z],
          ];
      const read: Point[] = [
        [x, -2.014 - token * 0.088, z + 0.025],
        [x, -2.014 - token * 0.088, z],
        [x, -2.36, z],
        [x + 0.36, -2.36, z],
      ];
      read.push(
        ...((i
          ? [
              [-3.75, -2.36, z],
              [-3.75, 0.5, z],
              [-3.525, 0.5, z],
            ]
          : [
              [-4.85, -2.36, z],
              [-4.85, 2.1, z],
              [-3.35, 2.1, z],
              [-3.35, 1.9, z],
            ]) as Point[]),
      );
      return (
        <Track
          key={x}
          points={
            append ? [...write, [x, -2.718, z], [x, -2.718, z + 0.025]] : read
          }
          progress={append ? (phase - 0.5) * 2 : phase * 2}
          color={i ? "#bf9be9" : "#70d8cc"}
        />
      );
    });
  } else {
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
                  [-7, 0, z],
                  [-7, -0.35, z],
                  [-5.9, -0.35, z],
                  [-5.9, -0.35, z - 0.315],
                  [-5.9, 1.9, z - 0.315],
                  [-3.35, 1.9, z - 0.315],
                  [-3.35, 1.9, z],
                ]
              : [
                  [-3.35, 1.45, z],
                  [-3.35, 0.5, z],
                  [-3.35, 0, z],
                  [-3.3, 0, z],
                  [-3.3, 0, 0],
                  [-2.925, 0, 0],
                ]
          }
          progress={phase < 0.5 ? phase * 2 : (phase - 0.5) * 2}
        />
      );
  }
  return <group name="computation-flow">{tracks}</group>;
}
