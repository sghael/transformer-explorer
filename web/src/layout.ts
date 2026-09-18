import layout from "../../shared/layout.json";
import type { Point } from "./spatial";

export { layout };
export type MacroId = keyof typeof layout.macro_nodes;
export const representativeLayers = [0, 15, 31] as const;
export function representativeLayer(layer: number): number {
  return representativeLayers.reduce<number>(
    (best, candidate) =>
      Math.abs(candidate - layer) < Math.abs(best - layer) ? candidate : best,
    15,
  );
}
export const layerHalf = layout.layer_dimensions[0] / 2;
export function macroX(id: MacroId, _spacing: number): number {
  return layout.macro_nodes[id].x;
}
export function macroFace(id: MacroId, side: -1 | 1, spacing: number): Point {
  return [
    macroX(id, spacing) + (side * layout.macro_nodes[id].size[0]) / 2,
    0,
    0,
  ];
}
export function stackEnds(_spacing: number): [number, number] {
  return [-layerHalf, layerHalf];
}
export function macroPaths(spacing: number): Record<string, Point[]> {
  const [first, last] = stackEnds(spacing);
  const output = macroFace("output", 1, spacing);
  const input = macroFace("input", -1, spacing);
  return {
    overview_input: [
      macroFace("input", 1, spacing),
      macroFace("embedding", -1, spacing),
    ],
    overview_embed: [macroFace("embedding", 1, spacing), [first, 0, 0]],
    overview_final: [[last, 0, 0], macroFace("final_norm", -1, spacing)],
    overview_norm: [
      macroFace("final_norm", 1, spacing),
      macroFace("lm_head", -1, spacing),
    ],
    overview_output: [
      macroFace("lm_head", 1, spacing),
      macroFace("output", -1, spacing),
    ],
    generation_feedback: [
      output,
      [output[0] + 0.5, 0, 0],
      [output[0] + 0.5, 0, layout.feedback_z],
      [input[0] - 0.45, 0, layout.feedback_z],
      [input[0] - 0.45, 0, 0],
      input,
    ],
  };
}
