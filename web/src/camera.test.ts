import test from "node:test";
import assert from "node:assert/strict";
import { chapters, type View } from "./data";
import {
  anchorPose,
  cameras,
  expertDepth,
  groupDepth,
  viewPose,
} from "./camera";
import { FOCUS_SCALE } from "./navigation";

const views = Object.keys(cameras) as View[];
const base = { layer: 15, group: 2, expert: 4, spacing: 1 };
const near = (a: number[], b: number[], tolerance = 1e-12) =>
  a.every((v, i) => Math.abs(v - b[i]) <= tolerance);

test("every view and chapter reads one uniquely anchored camera", () => {
  assert.deepEqual([...views].sort(), [
    "attention",
    "cache",
    "expert",
    "input",
    "layer",
    "matrix",
    "output",
    "overview",
    "router",
  ]);
  const anchors = views.map((view) => cameras[view].anchor);
  assert.equal(new Set(anchors).size, anchors.length);
  for (const chapter of chapters) {
    assert.equal(chapter.cameraAnchor, cameras[chapter.view].anchor);
    assert.ok(!("cameraTarget" in chapter), chapter.id);
  }
});

test("only group and expert views follow their selection's depth", () => {
  for (const view of views) {
    const pose = viewPose(view, base, 2);
    const depth = cameras[view].depth;
    for (const [key, value] of [
      ["group", 6],
      ["expert", 1],
    ] as const) {
      const moved = viewPose(view, { ...base, [key]: value }, 2);
      const expected =
        depth !== key
          ? 0
          : (key === "group"
              ? groupDepth(value) - groupDepth(base.group)
              : expertDepth(value) - expertDepth(base.expert)) *
            (cameras[view].frame === "layer" ? FOCUS_SCALE : 1);
      for (const part of ["position", "target"] as const)
        assert.ok(
          near(moved[part], [
            pose[part][0],
            pose[part][1],
            pose[part][2] + expected,
          ]),
          `${view} ${key} ${part}`,
        );
    }
  }
});

test("narrow viewports lengthen only the fitted axes of the camera offset", () => {
  for (const view of views) {
    const wide = viewPose(view, base, 1.6);
    assert.deepEqual(viewPose(view, base, 3), wide, view);
    const narrow = viewPose(view, base, 0.8);
    assert.deepEqual(narrow.target, wide.target, view);
    for (let axis = 0; axis < 3; axis++) {
      const offset = wide.position[axis] - wide.target[axis];
      const fitted = cameras[view].fit?.includes("xyz"[axis]) ?? false;
      assert.ok(
        Math.abs(
          narrow.position[axis] -
            narrow.target[axis] -
            offset * (fitted ? 2 : 1),
        ) < 1e-12,
        `${view} axis ${axis}`,
      );
    }
  }
});

test("GLB anchors are each view's pose without selection offset or fit", () => {
  for (const view of views) {
    const framing = cameras[view];
    const anchor = anchorPose(view);
    const centered = viewPose(
      view,
      { layer: 31, group: 3.5, expert: 3.5, spacing: 1 },
      2,
    );
    assert.ok(near(anchor.position, centered.position), view);
    assert.ok(near(anchor.target, centered.target), view);
    const scale = framing.frame === "layer" ? FOCUS_SCALE : 1;
    assert.ok(
      near(
        anchor.target,
        framing.target.map((v) => v * scale),
      ),
      view,
    );
  }
});
