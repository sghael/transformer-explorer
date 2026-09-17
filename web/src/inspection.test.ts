import test from "node:test";
import assert from "node:assert/strict";
import { inspectRmsNorm, rmsNorm } from "./inspection";
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-12);

test("RMSNorm applies shared RMS denominator then per-channel learned scale", () => {
  const example = rmsNorm([3, 4], [1, 2], 0.5);
  assert.deepEqual(example.squares, [9, 16]);
  close(example.meanSquares, 12.5);
  close(example.denominator, Math.sqrt(13));
  close(example.output[0], 3 / Math.sqrt(13));
  close(example.output[1], 8 / Math.sqrt(13));
});
test("zero input remains finite and RMS normalization preserves sign", () => {
  assert.deepEqual(rmsNorm([0, 0], [1, 1]).output, [0, 0]);
  const result = rmsNorm([-3, 1, 2], [1, 1, 1]);
  close(
    result.output.reduce((sum, value) => sum + value * value, 0) / 3,
    result.meanSquares / (result.meanSquares + result.epsilon),
  );
  assert.ok(result.output[0] < 0);
});
test("teaching vectors are reproducible, finite, and selected layer/token/stage dependent", () => {
  const first = inspectRmsNorm(11, 4, 1);
  for (const layer of [0, 11, 31])
    for (const token of [0, 4, 7])
      for (const stage of [1, 2] as const) {
        const result = inspectRmsNorm(layer, token, stage);
        assert.equal(result.values.length, 8);
        assert.ok(result.output.every(Number.isFinite));
        assert.deepEqual(result, inspectRmsNorm(layer, token, stage));
      }
  assert.notDeepEqual(first.values, inspectRmsNorm(12, 4, 1).values);
  assert.notDeepEqual(first.values, inspectRmsNorm(11, 5, 1).values);
  assert.deepEqual(first.gamma, inspectRmsNorm(11, 5, 1).gamma);
  assert.notDeepEqual(first.values, inspectRmsNorm(11, 4, 2).values);
});
test("RMSNorm rejects invalid dimensions and unstable inputs", () => {
  assert.throws(() => rmsNorm([], []), RangeError);
  assert.throws(() => rmsNorm([1], [1, 2]), RangeError);
  assert.throws(() => rmsNorm([Infinity], [1]), RangeError);
  assert.throws(() => rmsNorm([1], [1], 0), RangeError);
});
