import { architecture } from "./data";

export function rmsNorm(values: number[], gamma: number[], epsilon = 0.00001) {
  if (
    !values.length ||
    values.length !== gamma.length ||
    ![...values, ...gamma].every(Number.isFinite) ||
    !Number.isFinite(epsilon) ||
    epsilon <= 0
  )
    throw new RangeError(
      "RMSNorm requires equal nonempty finite vectors and a positive epsilon.",
    );
  const squares = values.map((value) => value * value);
  const meanSquares =
    squares.reduce((sum, value) => sum + value, 0) / values.length;
  const denominator = Math.sqrt(meanSquares + epsilon);
  const normalized = values.map((value) => value / denominator);
  const output = normalized.map((value, index) => value * gamma[index]);
  return {
    values,
    gamma,
    squares,
    meanSquares,
    epsilon,
    denominator,
    normalized,
    output,
  };
}

/** An eight-channel teaching calculation, not a partial real-model normalization. */
export function inspectRmsNorm(
  layer: number,
  token: number,
  stage: 1 | 2 = 1,
  seed = 1729,
) {
  if (
    !Number.isInteger(layer) ||
    layer < 0 ||
    layer >= architecture.num_layers ||
    !Number.isInteger(token) ||
    token < 0 ||
    token >= 8
  )
    throw new RangeError("Select a valid layer and illustrative token.");
  const random = (channel: number, kind: number, activation = true) => {
    let hash =
      seed ^
      Math.imul(layer + 1, 73856093) ^
      (activation ? Math.imul(token + 1, 19349663) : 0) ^
      Math.imul(stage, 83492791) ^
      Math.imul(channel + 1, kind);
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x45d9f3b);
    hash ^= hash >>> 16;
    return (hash >>> 0) / 4294967296;
  };
  const values = Array.from(
    { length: 8 },
    (_, channel) =>
      Math.round((random(channel, 2654435761) * 4 - 2) * 100) / 100,
  );
  const gamma = Array.from(
    { length: 8 },
    (_, channel) =>
      Math.round((0.75 + random(channel, 1597334677, false) * 0.5) * 100) / 100,
  );
  return rmsNorm(values, gamma);
}
