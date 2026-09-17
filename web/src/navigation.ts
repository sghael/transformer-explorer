import * as THREE from "three";
import type { View } from "./data";
import { layout, halfSpan } from "./layout";
export type CameraPose = { position: number[]; target: number[] };
export const FOCUS_SCALE = layout.focus_scale;
export const ease = (t: number) => {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * x * (10 + x * (-15 + 6 * x));
};
export function layerOrigin(
  layer: number,
  spacing: number,
): [number, number, number] {
  return [(layer * layout.layer_pitch - halfSpan) * spacing, 0, 0];
}
export function inLayer(
  point: number[],
  layer: number,
  spacing: number,
): number[] {
  const origin = layerOrigin(layer, spacing);
  return point.map((v, i) => origin[i] + v * FOCUS_SCALE);
}
/** Interpolate viewing scale logarithmically, with a smooth rotation around the target. */
export function cameraBetween(
  from: CameraPose,
  to: CameraPose,
  progress: number,
): CameraPose {
  const u = ease(progress);
  const aTarget = new THREE.Vector3(...from.target),
    bTarget = new THREE.Vector3(...to.target);
  const a = new THREE.Vector3(...from.position).sub(aTarget),
    b = new THREE.Vector3(...to.position).sub(bTarget);
  const distance = Math.exp(
    THREE.MathUtils.lerp(Math.log(a.length()), Math.log(b.length()), u),
  );
  const direction = a.normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    direction,
    b.normalize(),
  );
  direction.applyQuaternion(new THREE.Quaternion().slerp(rotation, u));
  const target = aTarget.lerp(bTarget, u);
  return {
    position: target.clone().addScaledVector(direction, distance).toArray(),
    target: target.toArray(),
  };
}

const parent: Partial<Record<View, View>> = {
  input: "overview",
  output: "overview",
  layer: "overview",
  attention: "layer",
  router: "layer",
  cache: "attention",
  matrix: "attention",
  expert: "router",
};
function ancestors(view: View): View[] {
  const result: View[] = [view];
  while (parent[view]) {
    view = parent[view]!;
    result.push(view);
  }
  return result;
}
export type FlightLeg = {
  from: CameraPose;
  to: CameraPose;
  seconds: number;
  phase: "aim" | "zoom-in" | "zoom-out";
};
/** Parent-child navigation flies directly through existing geometry. Only siblings
 * withdraw to their shared parent before approaching another branch. */
export function planFlight(
  fromView: View,
  toView: View,
  from: CameraPose,
  to: CameraPose,
  poseFor: (view: View) => CameraPose,
): FlightLeg[] {
  const fromChain = ancestors(fromView),
    toChain = ancestors(toView);
  const legs: FlightLeg[] = [];
  let start = from;
  const add = (end: CameraPose, phase: FlightLeg["phase"], seconds: number) => {
    legs.push({ from: start, to: end, phase, seconds });
    start = end;
  };
  if (fromChain.includes(toView) && fromView !== toView) {
    add(to, "zoom-out", 2.1);
    return legs;
  }
  if (!toChain.includes(fromView)) {
    const common =
      fromChain.slice(1).find((view) => toChain.includes(view)) ?? "overview";
    add(poseFor(common), "zoom-out", 1.2);
  }
  // Turn the gaze without moving the eye, then keep the destination centered.
  add({ position: [...start.position], target: [...to.target] }, "aim", 0.55);
  const a = new THREE.Vector3(...start.position).distanceTo(
    new THREE.Vector3(...to.target),
  );
  const b = new THREE.Vector3(...to.position).distanceTo(
    new THREE.Vector3(...to.target),
  );
  add(
    to,
    "zoom-in",
    THREE.MathUtils.clamp(1.15 + Math.abs(Math.log(a / b)) * 0.32, 1.3, 3),
  );
  return legs;
}
export function flightPose(legs: FlightLeg[], elapsed: number) {
  let t = elapsed;
  for (const leg of legs) {
    if (t <= leg.seconds) {
      const u = t / leg.seconds;
      const pose =
        leg.phase === "aim"
          ? {
              position: [...leg.from.position],
              target: leg.from.target.map((v, i) =>
                THREE.MathUtils.lerp(v, leg.to.target[i], ease(u)),
              ),
            }
          : cameraBetween(leg.from, leg.to, u);
      return { pose, phase: leg.phase, done: false };
    }
    t -= leg.seconds;
  }
  return { pose: legs.at(-1)!.to, phase: legs.at(-1)!.phase, done: true };
}
