import { chapters, type View } from "./data";
import { layout } from "./layout";
import { inLayer, type CameraPose } from "./navigation";

/** One view's framing in shared/layout.json, also exported as its GLB anchor. */
export interface CameraFraming {
  anchor: string;
  // "model" coordinates are world space; "layer" coordinates are the reusable
  // focus-layer interior, placed and scaled into the representative frame.
  frame: "model" | "layer";
  position: number[];
  target: number[];
  // Follow the selected attention group's or expert's depth offset along Z.
  depth?: "group" | "expert";
  // Axes along which the camera's offset from its target lengthens when the
  // viewport is narrower than camera_fit_aspect.
  fit?: string;
}
export const cameras = layout.cameras as Record<View, CameraFraming>;
// A chapter frames its view; its anchor must name that view's camera.
for (const chapter of chapters)
  if (cameras[chapter.view]?.anchor !== chapter.cameraAnchor)
    throw Error(
      `Chapter ${chapter.id} names ${chapter.cameraAnchor}, but ${chapter.view} uses ${cameras[chapter.view]?.anchor}`,
    );
export const groupDepth = (group: number) => (group - 3.5) * 1.2;
export const expertDepth = (expert: number) => (expert - 3.5) * 1.1;
export type CameraSelection = {
  layer: number;
  group: number;
  expert: number;
  spacing: number;
};

/** The view's camera for the current selection and viewport aspect. */
export function viewPose(
  view: View,
  selection: CameraSelection,
  aspect: number,
): CameraPose {
  const framing = cameras[view];
  const depth =
    framing.depth === "group"
      ? groupDepth(selection.group)
      : framing.depth === "expert"
        ? expertDepth(selection.expert)
        : 0;
  return framedPose(
    framing,
    depth,
    Math.max(1, layout.camera_fit_aspect / aspect),
    selection,
  );
}

/** World pose of a view's exported GLB anchor: no depth offset or fit. */
export function anchorPose(view: View): CameraPose {
  return framedPose(cameras[view], 0, 1, { layer: 0, spacing: 1 });
}

function framedPose(
  framing: CameraFraming,
  depth: number,
  scale: number,
  { layer, spacing }: { layer: number; spacing: number },
): CameraPose {
  const target = framing.target.map((v, i) => (i === 2 ? v + depth : v));
  const position = framing.position.map((v, i) =>
    framing.fit?.includes("xyz"[i])
      ? target[i] + (framing.position[i] - framing.target[i]) * scale
      : i === 2
        ? v + depth
        : v,
  );
  return framing.frame === "layer"
    ? {
        position: inLayer(position, layer, spacing),
        target: inLayer(target, layer, spacing),
      }
    : { position, target };
}
