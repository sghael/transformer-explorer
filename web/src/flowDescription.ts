import type { View } from "./data";

// Kept apart from Flow so the explanation panel can describe the flow without
// loading the 3D libraries.
export function flowDescription(view: View, time: number): string {
  const phase = (time % 12) / 12;
  if (["overview", "input", "output"].includes(view)) {
    if (phase < 0.12) return "Token ID → embedding lookup";
    if (phase < 0.28) return "Prompt positions × channels → prefill";
    if (phase < 0.65) return "Hidden vector → 32 sequential layers";
    if (phase < 0.82) return "Final norm → logits → select next token";
    return "New token returns · next decode step reuses K/V";
  }
  if (view === "layer")
    return "Activation vector → normalization → attention → residual → experts → residual";
  if (view === "router")
    return phase < 0.45
      ? "One activation vector → two selected experts"
      : "Two transformed vectors → weighted sum";
  if (view === "expert")
    return "Gate and up vectors → elementwise product → down projection";
  if (view === "cache")
    return phase >= 0.5
      ? "Decode: append this token’s new K/V vectors"
      : "Read retained K/V · no prompt recomputation";
  return phase < 0.5
    ? "Query and keys → match scores → causal mask"
    : "Attention weights × value vectors → weighted sum";
}
