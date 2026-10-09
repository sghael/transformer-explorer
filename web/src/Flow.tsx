import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { useClock, type Clock } from "./clock";
import { macroX, macroPaths, stackEnds } from "./layout";
import type { View } from "./data";
import { pointAlongPath, routerPaths, type Point } from "./spatial";

type Props = {
  view: View;
  clock: Clock;
  reduced: boolean;
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
  // Only the position changes on a flow frame; the marker body is reused.
  const body = useMemo(
    () =>
      kind === "token" ? (
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
      ),
    [kind, color],
  );
  return (
    <group position={position} userData={{ flowPacket: kind }}>
      {body}
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
  const line = useMemo(
    () => (
      <Line
        points={points}
        color={color}
        lineWidth={1}
        transparent
        opacity={0.35}
      />
    ),
    [points, color],
  );
  return (
    <>
      {line}
      <Packet
        position={pointAlongPath(points, progress)}
        kind={kind}
        color={color}
      />
    </>
  );
}
/** A 12-second schematic cycle. Markers are sampled representations, not inference. */
export default function Flow({
  view,
  clock,
  reduced,
  group,
  token,
  spacing,
  experts,
  expert,
}: Props) {
  // Only this subtree follows the flow clock. Track points are built once per
  // selection, so drei keeps each line's geometry while packets move.
  const time = useClock(clock, (t) => (reduced ? Math.floor(t) : t));
  const tracks = useMemo(
    () => flowTracks(view, group, token, spacing, experts, expert),
    [view, group, token, spacing, experts, expert],
  );
  return <group name="computation-flow">{tracks((time % 12) / 12)}</group>;
}
function flowTracks(
  view: View,
  group: number,
  token: number,
  spacing: number,
  experts: number[],
  expert: number,
): (phase: number) => React.ReactNode {
  const z = (group - 3.5) * 1.2;
  if (["overview", "input", "output"].includes(view)) {
    const [first, last] = stackEnds(spacing);
    const center = (id: "input" | "embedding" | "output"): Point => [
      macroX(id, spacing),
      0,
      0,
    ];
    const stages: { end: number; points: Point[]; kind: Kind }[] = [
      {
        end: 0.12,
        points: [center("input"), center("embedding")],
        kind: "token",
      },
      {
        end: 0.65,
        points: [center("embedding"), [first, 0, 0], [last, 0, 0]],
        kind: "vector",
      },
      { end: 0.82, points: [[last, 0, 0], center("output")], kind: "vector" },
      {
        end: 1,
        points: [
          center("output"),
          ...macroPaths(spacing).generation_feedback,
          center("input"),
        ],
        kind: "token",
      },
    ];
    return (phase) => {
      const i = stages.findIndex((stage) => phase < stage.end),
        stage = stages[Math.max(0, i)];
      const start = i > 0 ? stages[i - 1].end : 0;
      return (
        <>
          <Track
            points={stage.points}
            progress={(phase - start) / (stage.end - start)}
            kind={i === 1 && phase < 0.28 ? "tensor" : stage.kind}
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
    };
  }
  if (view === "layer") {
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
    const entry: Point[] = [
      [-9, 0, 0],
      [-7, 0, 0],
    ];
    const toRouter: Point[] = [
      [-1, 0, 0],
      [2.25, 0, 0],
    ];
    const routes = experts.map((e) => {
      const depth = (e - 3.5) * 1.1;
      return [
        ...routerPaths(e).input,
        [4.32, 0, depth],
        [4.32, 0, depth - 0.15],
        [4.52, 0, depth - 0.15],
        [5.06, 0, depth - 0.15],
        [5.06, 0, depth],
        [5.48, 0, depth],
        ...routerPaths(e).output,
      ] as Point[];
    });
    const exit: Point[] = [
      [7.75, 0, 0],
      [11, 0, 0],
    ];
    const attentionBypass: Point[] = [
      [-9, 0, 0],
      [-9, 0, -5.4],
      [-2, 0, -5.4],
      [-2, 0, 0],
    ];
    const expertBypass: Point[] = [
      [-1, 0, 0],
      [-1, 0, 5.4],
      [10, 0, 5.4],
      [10, 0, 0],
    ];
    return (phase) => (
      <>
        {phase < 0.12 ? (
          <Track points={entry} progress={phase / 0.12} />
        ) : phase < 0.4 ? (
          <Track points={attention} progress={(phase - 0.12) / 0.28} />
        ) : phase < 0.5 ? (
          <Track points={toRouter} progress={(phase - 0.4) / 0.1} />
        ) : phase < 0.88 ? (
          experts.map((e, i) => (
            <Track
              key={e}
              points={routes[i]}
              progress={(phase - 0.5) / 0.38}
              color={i ? "#70d8cc" : "#ffe1a0"}
            />
          ))
        ) : (
          <Track points={exit} progress={(phase - 0.88) / 0.12} />
        )}
        <Track
          points={phase < 0.4 ? attentionBypass : expertBypass}
          progress={phase < 0.4 ? phase / 0.4 : (phase - 0.4) / 0.6}
          color="#aebfc3"
        />
      </>
    );
  }
  if (view === "router") {
    const paths = experts.map((e) => routerPaths(e));
    return (phase) => {
      const input = phase < 0.45;
      return experts.map((e, i) => (
        <Track
          key={e}
          points={paths[i][input ? "input" : "output"]}
          progress={input ? phase / 0.45 : (phase - 0.45) / 0.55}
          color={i ? "#70d8cc" : "#ffe1a0"}
        />
      ));
    };
  }
  if (view === "expert") {
    const branches = [-0.5, 0.5].map((depth): Point[] => [
      [-1.9, 1, 0],
      [-1.6667, 1, 0],
      [-1.6667, 1, depth],
      [-1, 1, depth],
      [0.8, 1, depth],
      [0.8, 1, 0],
      [1.8, 1, 0],
      [3.1, 1, 0],
    ]);
    return (phase) => (
      <group position={[4.82, -0.3, (expert - 3.5) * 1.1]} scale={0.3}>
        {[-0.5, 0.5].map((depth, i) => (
          <Track
            key={depth}
            points={branches[i]}
            progress={phase}
            color={i ? "#70d8cc" : "#ffe1a0"}
          />
        ))}
      </group>
    );
  }
  if (view === "cache") {
    const sheets = [-5.36, -4.44].map((x, i) => {
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
      const append: Point[] = [
        ...write,
        [x, -2.718, z],
        [x, -2.718, z + 0.025],
      ];
      return { x, read, append };
    });
    return (phase) => {
      const append = phase >= 0.5;
      return sheets.map((sheet, i) => (
        <Track
          key={sheet.x}
          points={append ? sheet.append : sheet.read}
          progress={append ? (phase - 0.5) * 2 : phase * 2}
          color={i ? "#bf9be9" : "#70d8cc"}
        />
      ));
    };
  }
  if (view === "matrix") {
    const points: Point[] = [
      [-3.8, 1.9, z + 0.1],
      [-2.9, 1.9, z + 0.1],
      [-2.9, 1, z + 0.1],
    ];
    return (phase) => <Track points={points} progress={phase} kind="tensor" />;
  }
  const scores: Point[] = [
    [-7, 0, z],
    [-7, -0.35, z],
    [-5.9, -0.35, z],
    [-5.9, -0.35, z - 0.315],
    [-5.9, 1.9, z - 0.315],
    [-3.35, 1.9, z - 0.315],
    [-3.35, 1.9, z],
  ];
  const values: Point[] = [
    [-3.35, 1.45, z],
    [-3.35, 0.5, z],
    [-3.35, 0, z],
    [-3.3, 0, z],
    [-3.3, 0, 0],
    [-2.925, 0, 0],
  ];
  return (phase) => (
    <Track
      points={phase < 0.5 ? scores : values}
      progress={phase < 0.5 ? phase * 2 : (phase - 0.5) * 2}
    />
  );
}
