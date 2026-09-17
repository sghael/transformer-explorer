export type Point = [number, number, number];
export function routerPaths(expert: number): {
  input: Point[];
  output: Point[];
} {
  const z = (expert - 3.5) * 1.1;
  return {
    input: [
      [2.25, 0, 0],
      [3.15, 0, 0],
      [3.15, 1, 0],
      [3.15, 1, z],
      [4.25, 1, z],
      [4.25, 0, z],
    ],
    output: [
      [5.75, 0, z],
      [6.4, 0, z],
      [6.4, 1, z],
      [6.4, 1, 0],
      [7.75, 1, 0],
      [7.75, 0, 0],
    ],
  };
}
// Distance-based interpolation follows each elbow at constant speed. Rendering
// and review diagnostics use the same path; pause never changes the progress.
export function pointAlongPath(points: Point[], progress: number): Point {
  const lengths = points
    .slice(1)
    .map((point, i) =>
      Math.hypot(
        ...point.map((coordinate, axis) => coordinate - points[i][axis]),
      ),
    );
  let remaining =
    Math.min(1, Math.max(0, progress)) *
    lengths.reduce((sum, length) => sum + length, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const fraction = lengths[i] ? remaining / lengths[i] : 0;
      return points[i].map(
        (coordinate, axis) =>
          coordinate + (points[i + 1][axis] - coordinate) * fraction,
      ) as Point;
    }
    remaining -= lengths[i];
  }
  return points[points.length - 1];
}
export function attentionPath(group: number, key: number): Point[] {
  const z = (group - 3.5) * 1.2 + 1.2;
  const x = -7 + key * 0.53;
  return [
    [-7.6, -0.65, z],
    [-7.6, -1.05, z],
    [x, -1.05, z],
    [x, -1.65, z],
  ];
}
