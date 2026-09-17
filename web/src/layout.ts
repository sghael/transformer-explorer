import layout from "../../shared/layout.json";
import spec from "../../shared/model-spec.json";
import type { Point } from "./spatial";

export { layout };
export type MacroId = keyof typeof layout.macro_nodes;
export const halfSpan =
  ((spec.architecture.num_layers - 1) * layout.layer_pitch) / 2;
export const layerHalf = layout.layer_dimensions[0] / 2;
export function macroX(id: MacroId, spacing: number): number {
  const x = layout.macro_nodes[id].x;
  return x + Math.sign(x) * halfSpan * (spacing - 1);
}
export function macroFace(id: MacroId, side: -1 | 1, spacing: number): Point {
  return [
    macroX(id, spacing) + (side * layout.macro_nodes[id].size[0]) / 2,
    0,
    0,
  ];
}
export function stackEnds(spacing: number): [number, number] {
  return [-halfSpan * spacing - layerHalf, halfSpan * spacing + layerHalf];
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
