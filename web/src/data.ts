import modelSpec from "../../shared/model-spec.json";
import chapterData from "../../shared/chapters.json";
import descriptions from "../../shared/component-descriptions.json";

export { modelSpec, descriptions };
export const architecture = modelSpec.architecture;
export type View =
  | "overview"
  | "input"
  | "layer"
  | "attention"
  | "cache"
  | "router"
  | "expert"
  | "matrix"
  | "output";
export type Pair = [number, number];
export const tokens = [
  "The",
  "small",
  "robot",
  "learns",
  "to",
  "read",
  "the",
  "world",
];
export interface Chapter {
  id: string;
  title: string;
  start: number;
  end: number;
  duration: number;
  view: View;
  cameraAnchor: string;
  cameraTarget: [number, number, number];
  detailLevel: number;
  // The tour derives its expert from routing; see routedExpert.
  selection: { layer: number; group: number; token: number };
  locator: boolean;
  emphasis: string[];
  dimming: string[];
  visibility: string[];
  pose: { spacing: number; expanded: boolean; expertExpanded: boolean };
  animation: { kind: string; seed: number; cycles: number };
  caption: string;
  explanationKey: string;
  misconception: string;
  acceptance: string;
}
export const chapters = chapterData.chapters as Chapter[];
export const tourDuration = chapters.at(-1)!.end;
export function chapterAt(time: number): Chapter {
  const t = Number.isNaN(time) ? 0 : Math.max(0, Math.min(tourDuration, time));
  return (
    chapters.find((chapter) => t < chapter.end) ?? chapters[chapters.length - 1]
  );
}
export function chapterProgress(time: number): number {
  const chapter = chapterAt(time);
  return Number.isNaN(time)
    ? 0
    : Math.max(0, Math.min(1, (time - chapter.start) / chapter.duration));
}
export function softmax(logits: number[]): number[] {
  const peak = Math.max(...logits);
  const exp = logits.map((value) => Math.exp(value - peak));
  const total = exp.reduce((sum, value) => sum + value, 0);
  return exp.map((value) => value / total);
}
// Stateless integer hashing makes any sample reproducible regardless of navigation order.
function value(seed: number, ...coordinates: number[]): number {
  let hash = seed | 0;
  for (const coordinate of coordinates) {
    hash = Math.imul(hash ^ (coordinate + 0x9e3779b9), 0x85ebca6b);
    hash ^= hash >>> 13;
  }
  return ((hash >>> 0) / 4294967296) * 2 - 1;
}
function index(name: string, input: number, count: number) {
  if (!Number.isInteger(input) || input < 0 || input >= count)
    throw new RangeError(`${name} must be an integer from 0 to ${count - 1}`);
}
export function rotate([x, y]: Pair, angle: number): Pair {
  return [
    x * Math.cos(angle) - y * Math.sin(angle),
    x * Math.sin(angle) + y * Math.cos(angle),
  ];
}
export function cacheRows(
  layer: number,
  group: number,
  count: number,
  seed = 1729,
) {
  index("Layer", layer, architecture.num_layers);
  index("KV group", group, architecture.kv_heads);
  if (!Number.isInteger(count) || count < 0)
    throw new RangeError("Cache length must be a nonnegative integer");
  // Keys are position-rotated pairs; values keep their projected coordinates.
  const rows = (kind: number) =>
    Array.from({ length: count }, (_, position) => {
      const raw = Array.from({ length: 8 }, (_, channel) =>
        value(seed, kind, layer, group, position, channel),
      );
      if (kind === 2) return raw;
      return raw.flatMap((_, channel) =>
        channel % 2
          ? []
          : rotate(
              [raw[channel], raw[channel + 1]],
              position / 10000 ** (channel / architecture.head_dim),
            ),
      );
    });
  return { keys: rows(1), values: rows(2) };
}
export function sample(
  layer: number,
  group: number,
  token: number,
  seed = 1729,
) {
  index("Layer", layer, architecture.num_layers);
  index("KV group", group, architecture.kv_heads);
  index("Token", token, tokens.length);
  const attention = tokens.map((_, query) => {
    const allowed = softmax(
      Array.from(
        { length: query + 1 },
        (_, key) => value(seed, 3, layer, group, query, key) * 2,
      ),
    );
    return tokens.map((_, key) => (key <= query ? allowed[key] : 0));
  });
  const logits = Array.from(
    { length: architecture.experts },
    (_, expert) => value(seed, 4, layer, token, expert) * 3,
  );
  const probabilities = softmax(logits);
  const top2 = probabilities
    .map((_, expert) => expert)
    .sort((a, b) => probabilities[b] - probabilities[a] || a - b)
    .slice(0, architecture.experts_per_token);
  const selectedTotal = top2.reduce(
    (sum, expert) => sum + probabilities[expert],
    0,
  );
  const weights = top2.map((expert) => probabilities[expert] / selectedTotal);
  const pair = (kind: number): Pair => [
    value(seed, kind, layer, group, token, 0),
    value(seed, kind, layer, group, token, 1),
  ];
  const q = pair(5),
    k = pair(1),
    v = pair(2),
    angle = token;
  const cache = cacheRows(layer, group, tokens.length, seed);
  const appended = cacheRows(layer, group, tokens.length + 1, seed);
  const candidateTokens = [".", "and", "with", "today", "again"];
  const outputLogits = candidateTokens.map(
    (_, candidate) => value(seed, 6, layer, token, candidate) * 3,
  );
  const outputProbabilities = softmax(outputLogits);
  // A small deterministic SwiGLU example illustrates output combination. These
  // eight-channel toy matrices are not samples from trained Mixtral weights.
  const activation = Array.from({ length: 8 }, (_, c) =>
    value(seed, 8, layer, token, c),
  );
  const project = (input: number[], expert: number, branch: number) =>
    Array.from(
      { length: 8 },
      (_, out) =>
        input.reduce(
          (sum, x, c) =>
            sum + x * value(seed, 9, layer, expert, branch, out, c),
          0,
        ) / Math.sqrt(8),
    );
  const expertOutputs = Array.from(
    { length: architecture.experts },
    (_, expert) => {
      const gate = project(activation, expert, 0),
        up = project(activation, expert, 1);
      return project(
        gate.map((x, c) => (x / (1 + Math.exp(-x))) * up[c]),
        expert,
        2,
      );
    },
  );
  const mergedOutput = activation.map((_, c) =>
    top2.reduce(
      (sum, expert, i) => sum + expertOutputs[expert][c] * weights[i],
      0,
    ),
  );
  const residualOutput = activation.map((x, c) => x + mergedOutput[c]);
  return {
    activation,
    expertOutputs,
    mergedOutput,
    residualOutput,
    attention,
    router: { logits, probabilities, top2, weights },
    cache: {
      ...cache,
      nextKey: appended.keys[tokens.length],
      nextValue: appended.values[tokens.length],
    },
    rope: {
      q,
      k,
      v,
      rotatedQ: rotate(q, angle),
      rotatedK: rotate(k, angle),
      rotatedV: [...v] as Pair,
      angle,
    },
    embedding: Array.from({ length: 8 }, (_, channel) =>
      value(seed, 7, token, channel),
    ),
    candidates: candidateTokens.map((candidate, i) => ({
      token: candidate,
      logit: outputLogits[i],
      probability: outputProbabilities[i],
    })),
  };
}

// The focused expert must be one the router selected for this token, or the
// expert view would contradict the top-2 routing shown beside it. A current
// routed choice is kept; otherwise focus moves to the highest-weighted one.
export function routedExpert(
  layer: number,
  group: number,
  token: number,
  current?: number,
) {
  const { top2 } = sample(layer, group, token).router;
  return current !== undefined && top2.includes(current) ? current : top2[0];
}
