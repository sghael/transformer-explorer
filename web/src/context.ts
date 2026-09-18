import type { Object3D } from "three";
import type { View } from "./data";

export type NormFocus = "norm1" | "norm2" | "final_norm";

/** Scope is semantic, independent of camera position and exported mesh names. */
export function belongsToFocus(
  object: Object3D,
  view: View,
  group: number,
  expert: number,
  normFocus?: NormFocus | null,
): boolean {
  if (normFocus) {
    const connectors: Record<NormFocus, string[]> = {
      norm1: ["residual_stage_0", "residual_stage_1"],
      norm2: ["residual_stage_3", "residual_stage_4"],
      final_norm: ["overview_final", "overview_norm"],
    };
    for (let node: Object3D | null = object; node; node = node.parent) {
      const id = node.userData.id || node.name;
      if (id === normFocus || connectors[normFocus].includes(id)) return true;
    }
    return false;
  }
  if (["overview", "input", "output"].includes(view)) return true;
  if (["attention", "cache", "matrix"].includes(view)) {
    for (let node: Object3D | null = object; node; node = node.parent)
      if (/^sum_to_output_\d+$/.test(node.userData.id || node.name))
        return false;
  }
  for (let node: Object3D | null = object; node; node = node.parent) {
    const id = node.userData.id || node.name;
    if (view === "layer" && id === "focus") return true;
    if (
      ["attention", "cache", "matrix"].includes(view) &&
      id === `group_${group}`
    )
      return true;
    if (
      view === "router" &&
      (id === "router" ||
        id === "merge" ||
        id === "experts" ||
        /^expert_detail_\d+$/.test(id))
    )
      return true;
    if (
      view === "expert" &&
      (id === `expert_${expert}` || id === `expert_detail_${expert}`)
    )
      return true;
  }
  return false;
}
