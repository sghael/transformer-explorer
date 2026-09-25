import test from "node:test";
import assert from "node:assert/strict";
import {
  architecture,
  cacheRows,
  chapterAt,
  chapterProgress,
  chapters,
  routedExpert,
  sample,
  softmax,
  tokens,
  tourDuration,
} from "./data";
const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test("architecture and example dimensions agree", () => {
  assert.equal(architecture.attention_heads / architecture.kv_heads, 4);
  assert.equal(
    architecture.hidden_size / architecture.attention_heads,
    architecture.head_dim,
  );
  assert.equal(tokens.length, 8);
});
test("attention is causal and normalized for every query in representative layers and groups", () => {
  for (const layer of [0, 11, 31])
    for (const group of [0, 2, 7])
      for (const token of [0, 3, 7]) {
        const data = sample(layer, group, token);
        assert.equal(data.attention.length, 8);
        data.attention.forEach((row, query) => {
          assert.equal(row.length, 8);
          close(sum(row), 1);
          row.forEach((weight, key) =>
            key > query ? assert.equal(weight, 0) : assert.ok(weight > 0),
          );
        });
        assert.equal(data.router.logits.length, 8);
        assert.equal(new Set(data.router.top2).size, 2);
        close(sum(data.router.probabilities), 1);
        close(sum(data.router.weights), 1);
        const selected = data.router.top2;
        const retainedProbability = sum(
          selected.map((expert) => data.router.probabilities[expert]),
        );
        selected.forEach((expert, i) =>
          close(
            data.router.weights[i],
            data.router.probabilities[expert] / retainedProbability,
          ),
        );
        for (const expert of selected)
          for (let other = 0; other < 8; other++) {
            if (!selected.includes(other))
              assert.ok(
                data.router.logits[expert] >= data.router.logits[other],
              );
          }
        close(
          sum(data.candidates.map((candidate) => candidate.probability)),
          1,
        );
      }
});
test("cache append retains all earlier K/V rows and respects layer/group identity", () => {
  for (const layer of [0, 15, 31])
    for (const group of [0, 4, 7]) {
      for (const count of [1, 4, 8]) {
        const before = cacheRows(layer, group, count);
        const after = cacheRows(layer, group, count + 1);
        assert.deepEqual(after.keys.slice(0, count), before.keys);
        assert.deepEqual(after.values.slice(0, count), before.values);
      }
      const data = sample(layer, group, 7);
      const appended = cacheRows(layer, group, 9);
      assert.deepEqual(data.cache.keys, appended.keys.slice(0, 8));
      assert.deepEqual(data.cache.nextKey, appended.keys[8]);
      assert.deepEqual(data.cache.nextValue, appended.values[8]);
    }
  assert.notDeepEqual(cacheRows(0, 0, 8), cacheRows(1, 0, 8));
  assert.notDeepEqual(cacheRows(0, 0, 8), cacheRows(0, 1, 8));
});
test("RoPE preserves pair length, rotates Q/K only, and matches cached K/V", () => {
  for (const layer of [0, 12, 31])
    for (const group of [0, 7])
      for (const token of [0, 2, 7]) {
        const { rope, cache } = sample(layer, group, token);
        close(
          sum(rope.q.map((x) => x * x)),
          sum(rope.rotatedQ.map((x) => x * x)),
        );
        close(
          sum(rope.k.map((x) => x * x)),
          sum(rope.rotatedK.map((x) => x * x)),
        );
        assert.deepEqual(rope.v, rope.rotatedV);
        assert.deepEqual(rope.rotatedK, cache.keys[token].slice(0, 2));
        assert.deepEqual(rope.v, cache.values[token].slice(0, 2));
        if (token === 0) assert.deepEqual(rope.q, rope.rotatedQ);
      }
});
test("samples remain stable across backward navigation; router ignores head group", () => {
  const first = sample(11, 2, 6);
  sample(31, 7, 7);
  sample(0, 0, 0);
  assert.deepEqual(first, sample(11, 2, 6));
  assert.deepEqual(first.router, sample(11, 7, 6).router);
  assert.notDeepEqual(first.router, sample(12, 2, 6).router);
  assert.notDeepEqual(first.router, sample(11, 2, 5).router);
  assert.notDeepEqual(first, sample(11, 2, 6, 99));
});
test("timeline covers 80 seconds without gaps and seeks at precise chapter boundaries", () => {
  assert.equal(tourDuration, 80);
  let end = 0;
  for (const chapter of chapters) {
    assert.equal(chapter.start, end);
    assert.equal(chapter.duration, chapter.end - chapter.start);
    assert.equal(chapterAt(chapter.start).id, chapter.id);
    assert.equal(chapterAt(chapter.end - 0.001).id, chapter.id);
    close(chapterProgress(chapter.start), 0);
    assert.ok(chapter.caption && chapter.acceptance && chapter.misconception);
    end = chapter.end;
  }
  assert.equal(chapterAt(-10), chapters[0]);
  assert.equal(chapterAt(NaN), chapters[0]);
  assert.equal(chapterAt(80), chapters.at(-1));
  assert.equal(chapterProgress(100), 1);
  const before = chapterAt(30);
  chapterAt(75);
  assert.equal(chapterAt(30), before);
});
test("invalid selections fail explicitly and softmax handles large scores", () => {
  for (const args of [
    [-1, 0, 0],
    [32, 0, 0],
    [0, 8, 0],
    [0, 0, 8],
    [0.5, 0, 0],
  ]) {
    assert.throws(() => sample(args[0], args[1], args[2]), RangeError);
  }
  close(sum(softmax([1000, 1001, 1002])), 1);
});

test("two independent toy expert outputs merge before the residual addition", () => {
  for (const layer of [0, 11, 31])
    for (const token of [0, 4, 7]) {
      const d = sample(layer, 2, token);
      assert.notDeepEqual(
        d.expertOutputs[d.router.top2[0]],
        d.expertOutputs[d.router.top2[1]],
      );
      d.mergedOutput.forEach((v, c) => {
        const expected = d.router.top2.reduce(
          (sum, expert, i) =>
            sum + d.expertOutputs[expert][c] * d.router.weights[i],
          0,
        );
        assert.ok(Math.abs(v - expected) < 1e-12);
        assert.ok(Math.abs(d.residualOutput[c] - d.activation[c] - v) < 1e-12);
      });
    }
});
test("focused experts follow the router's top-2 selection", () => {
  for (const layer of [0, 15, 31])
    for (let token = 0; token < tokens.length; token++) {
      const { top2 } = sample(layer, 2, token).router;
      assert.equal(routedExpert(layer, 2, token), top2[0]);
      assert.equal(routedExpert(layer, 2, token, top2[1]), top2[1]);
      for (let expert = 0; expert < architecture.experts; expert++)
        assert.ok(top2.includes(routedExpert(layer, 2, token, expert)));
    }
  for (const chapter of chapters) {
    assert.ok(!("expert" in chapter.selection), chapter.id);
    const { layer, group, token } = chapter.selection;
    assert.ok(
      sample(layer, group, token).router.top2.includes(
        routedExpert(layer, group, token),
      ),
      chapter.id,
    );
  }
});
