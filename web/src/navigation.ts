import * as THREE from "three";
export type CameraPose = { position: number[]; target: number[] };
export const timing = { out: 0.85, context: 0.35, into: 1.25 };
export const duration = timing.out + timing.context + timing.into;
export const ease = (t: number) => {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * x * (10 + x * (-15 + 6 * x));
};
type NodePose = {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  alpha: number;
};
export type ScenePose = Map<THREE.Object3D, NodePose>;
function visible(object: THREE.Object3D) {
  for (let o: THREE.Object3D | null = object; o; o = o.parent)
    if (!o.visible) return false;
  return true;
}
export function captureScene(scene: THREE.Object3D): ScenePose {
  const pose: ScenePose = new Map();
  scene.traverse((object) => {
    const material =
      object instanceof THREE.Mesh ? (object.material as THREE.Material) : null;
    pose.set(object, {
      position: object.position.clone(),
      scale: object.scale.clone(),
      alpha: visible(object) ? (material?.opacity ?? 1) : 0,
    });
  });
  return pose;
}
export function resetOpacity(scene: THREE.Object3D) {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const material = object.material as THREE.Material;
      if (material.transparent) {
        material.transparent = false;
        material.needsUpdate = true;
      }
      material.opacity = 1;
      material.depthWrite = true;
    }
  });
}
export function blendScene(
  from: ScenePose,
  to: ScenePose,
  progress: number,
  approaching = false,
) {
  const u = ease(progress);
  from.forEach((start, object) => {
    const end = to.get(object)!;
    // Fading context stays in place. New detail appears at its actual destination.
    const a = start.alpha === 0 ? end : start;
    const b = end.alpha === 0 ? a : end;
    object.position.lerpVectors(a.position, b.position, u);
    object.scale.lerpVectors(a.scale, b.scale, u);
    object.visible = true;
    if (object instanceof THREE.Mesh) {
      const fade =
        approaching && end.alpha < start.alpha
          ? ease((progress - 0.35) / 0.65)
          : u;
      const alpha = THREE.MathUtils.lerp(start.alpha, end.alpha, fade);
      const material = object.material as THREE.Material;
      const transparent = alpha < 0.999;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.opacity = alpha;
      material.depthWrite = !transparent;
      object.visible = alpha > 0.001;
    }
  });
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
