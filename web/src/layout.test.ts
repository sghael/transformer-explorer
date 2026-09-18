import test from "node:test";
import assert from "node:assert/strict";
import {
  layout,
  macroPaths,
  stackEnds,
  layerHalf,
  representativeLayers,
  representativeLayer,
} from "./layout";
import { layerOrigin, inLayer } from "./navigation";

test("forward edges meet the persistent representative frame along +X", () => {
  for (const spacing of [1, 1.5, 2, 3]) {
    const paths = macroPaths(spacing);
    for (const [id, points] of Object.entries(paths)) {
      if (id === "generation_feedback") continue;
      assert.equal(points.length, 2);
      assert.ok(points[1][0] > points[0][0], id);
      assert.deepEqual(
        points.map((point) => point.slice(1)),
        [
          [0, 0],
          [0, 0],
        ],
      );
    }
    const [first, last] = stackEnds(spacing);
    assert.equal(first, layerOrigin(0, spacing)[0] - layerHalf);
    assert.equal(last, layerOrigin(31, spacing)[0] + layerHalf);
    for (const layer of representativeLayers) {
      for (const side of [-1, 1]) {
        const port = inLayer([side * 11, 0, 0], layer, spacing);
        assert.ok(
          Math.abs(
            port[0] - (layerOrigin(layer, spacing)[0] + side * layerHalf),
          ) < 1e-12,
        );
        assert.deepEqual(port.slice(1), [0, 0]);
      }
    }
  }
});

test("generation returns on a separate orthogonal lane", () => {
  for (const spacing of [1, 3]) {
    const points = macroPaths(spacing).generation_feedback;
    assert.ok(points[0][0] > points.at(-1)![0]);
    assert.ok(points.some((point) => point[2] === layout.feedback_z));
    for (let i = 1; i < points.length; i++)
      assert.equal(
        points[i].filter((value, axis) => value !== points[i - 1][axis]).length,
        1,
      );
  }
});

test("legacy layer selections map to three representative examples", () => {
  assert.deepEqual(representativeLayers, [0, 15, 31]);
  for (let layer = 0; layer < 32; layer++) {
    const selected = representativeLayer(layer);
    assert.ok(representativeLayers.some((value) => value === selected));
    assert.deepEqual(layerOrigin(selected, 1), [0, 0, 0]);
  }
  for (const selected of representativeLayers)
    assert.equal(representativeLayer(selected), selected);
  assert.equal(representativeLayer(11), 15);
});
