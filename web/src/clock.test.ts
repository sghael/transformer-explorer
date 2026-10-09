import test from "node:test";
import assert from "node:assert/strict";
import { createClock } from "./clock";

test("a clock notifies subscribers only when its value changes", () => {
  const clock = createClock(2);
  const seen: number[] = [];
  const unsubscribe = clock.subscribe(() => seen.push(clock.get()));
  clock.set(2);
  clock.set(3.5);
  clock.set(0);
  unsubscribe();
  clock.set(7);
  assert.deepEqual(seen, [3.5, 0]);
  assert.equal(clock.get(), 7);
});
