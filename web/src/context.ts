import type { Object3D } from "three";
import type { View } from "./data";

/** Scope is semantic, independent of camera position and exported mesh names. */
export function belongsToFocus(
  object: Object3D,
  view: View,
  group: number,
  expert: number,
): boolean {
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
