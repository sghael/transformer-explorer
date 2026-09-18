# Initial tour storyboard

Design draft: 80 seconds total. Durations are pacing targets to validate in the browser. The tour introduces the flow; paused inspection and detail panels provide the deeper explanations. All depicted values and token chunks are illustrative.

| Time | Stop and camera framing | Main learning objective | Essential labels / visible evidence | Acceptance check and misconception to avoid |
| --- | --- | --- | --- | --- |
| 0–6 s | Overview: oblique view of the entire compact model | Trace the input-to-output path | Input, decoder layers, final norm, output; one clear flow direction | Layer depth and a continuous path are visible; the stack depicts computation, not physical parameter placement |
| 6–13 s | Input and embedding lookup | Tokens become vector representations | Illustrative token chunks, token ID, embedding lookup, activation vector | Distinguish token labels from real tokenizer boundaries; vocabulary entries are not context positions |
| 13–20 s | Stack, then selected layer | Layers repeat the same structure with distinct weights | One representative frame, collapsed earlier/later spans, First/Middle/Last examples, persistent location indicator | Sequential flow remains left to right through entry; the selected slot stays highlighted; only one assembly opens; repeated geometry does not imply shared weights |
| 20–29 s | Expanded layer: residual and attention entry | Attention reads a normalized representation while retaining a bypass | Residual path, RMSNorm, Q/K/V projections, visible addition point | The bypass reconnects at addition; Q/K/V are distinct projections; each norm has an inspectable explanation |
| 29–38 s | Attention detail: oblique group view, optional face-on reading | A token gathers context only from allowed positions | Separated matrix sheets, four Q heads connected to a shared KV pair, Q/K RoPE, causal mask, weighted links | Future links are absent; groups are inspectable; face-on reading preserves group/token identity; equations remain available on demand |
| 38–45 s | Selected layer's cache | Decode reuses prior keys and values | Prefill/decode distinction, labeled token-position axis, retained rows and one new row per K/V sheet | Rows grow along token position, not layer depth; caches are per-layer activations, not weights or answers |
| 45–56 s | Attention residual, second norm, router | Each token selects two of eight experts | Attention output projection/addition, second RMSNorm, eight scores, parallel expert bank, two selected routes | Both bypasses are traceable; selected weights normalize; experts are not assigned fixed topic labels |
| 56–66 s | One expert, then merge | Selected expert outputs are weighted and combined | Gate/up, SiLU, elementwise multiply, down projection, weighted merge, residual add | At most one expert detail is open; vector outputs are combined, not expert weights; dimensions are available on demand |
| 66–74 s | Collapse, remaining layers, final output | Final representation becomes vocabulary scores and a chosen token | Remaining layer progression, final RMSNorm, LM head, logits, selection | Scores and illustrative probabilities are distinguished; selection is separate from computing logits |
| 74–80 s | Generation loop and overview | The new token continues generation using the cache | Appended token, retained cache, return path | The scene does not suggest reprocessing the entire prompt during cached decode; return to Explore is available |

Each implemented chapter also needs an ID, duration, camera anchor/target, detail level, stack/explosion pose, selected layer/group/token, locator state, emphasis/dimming sets, caption, explanation key, and deterministic animation parameters. Face-on matrix inspection is optional paused detail; the 80-second tour must not rush through every numerical operation. Write those in versioned chapter data after the architecture contract is settled.

Before accepting the tour, inspect essential labels and occlusions at each stop, plus transitions into attention, router, and output. If a stop is too dense, move secondary detail into paused inspection or revise timing within the README's 60–90-second target. Preserve the main learning objective.

## Learning checks

After the tour, ask a test viewer to:

1. Trace the next-token path, including the two residual additions in a layer.
2. Explain how attention differs from expert routing.
3. Explain what is reused during cached decode and why the cache belongs to each layer.
4. Distinguish the 32 sequential layers from parallel query heads and expert alternatives.
5. Select a middle layer, inspect one shared K/V group and a matrix row, then return
   to the same layer and overview while identifying what each displayed axis means.

Record whether these checks were performed. Until then, describe the storyboard as reviewed for correctness and clarity, not validated for learning effectiveness.
