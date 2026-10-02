import { useSyncExternalStore } from "react";
// Tour and flow time advance every animation frame. Holding them outside React
// state lets only the components that display or animate a value re-render.
export type Clock = {
  get: () => number;
  set: (value: number) => void;
  subscribe: (listener: () => void) => () => void;
};
export function createClock(initial = 0): Clock {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (next === value) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
// Select a primitive, such as a chapter ID or a threshold, so a component
// re-renders only when the selected value changes.
export function useClock<T extends number | string | boolean>(
  clock: Clock,
  select: (time: number) => T,
): T {
  return useSyncExternalStore(clock.subscribe, () => select(clock.get()));
}
