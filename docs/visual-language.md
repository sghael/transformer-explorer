# Visual language

Original procedural schematics; no external artwork is used. Space represents computational structure. Thin sheets represent sampled matrices, with actual dimensions stated in HTML.

## Overview

Forward computation runs left to right. One enlarged open frame contains the representative layer, with First (1), Middle (16), and Last (32) examples. Paper-style ellipses (⋯) on the connecting spans denote omitted repetitions; adjacent counts account for the earlier and later layers. A zero-count span has no ellipsis. Their lengths are schematic. Depth separates parallel heads and experts inside the representative layer.

```text
IDs → Embed → ⋯ (15 earlier) → [Layer 16] → ⋯ (16 later) → RMSNorm → LM head → ID
    ↑                                                                  │
    └────────────────────── next decode step ───────────────────────────┘
```

## Inside a layer

Flow runs left to right; residual paths bypass attention and the expert bank on outer depth lanes in the main connection plane. Heads and expert alternatives separate toward/away from the viewer, so orbit changes occlusion. The camera enters a selected group or expert through the available space between neighbors. Surrounding geometry stays present; selection changes its emphasis, not its opacity.

```text
     ┌──────── residual ────────┐     ┌──────── residual ──────────┐
 x → Norm → Q/K/V → Attention → + → Norm → Router → Experts → Merge → +
                                               ╱  eight alternatives
```

Router connectors use orthogonal segments aligned to the scene axes, with right-angle bends at shared routing lanes. Output markers follow the same paths. Perspective may change the apparent screen angle; orbit preserves the underlying right-angle geometry.

## Attention and reading

Four query projections and a shared K/V pair receive the same normalized input. Q and K pass through RoPE before the score operation; V feeds the weighted sum. The numerical attention display identifies the selected query, masks future keys and shows the allowed weights. Nearby cache sheets extend by token row and connect their writes and reads to the graph. Matrix reading uses a face-on camera and an HTML table with query rows and key columns. Layer/group/token identity remains above the controls.

## Presentation

Use a dark neutral canvas, off-white text, cyan for activations, muted gold for selected routes and slate for inactive geometry. Shape, arrows, numbered controls and text supplement color. Learned weights and runtime activations are explicitly labeled. Interface typography uses the system sans-serif stack, 16px body text, short line lengths and tabular numbers. Selected controls have both border and pressed state. Keyboard focus uses a conspicuous outline.

Component navigation runs above the model. Desktop places the scene beside a wider, independently scrolling reading panel. Narrow screens place the explanation below the model and before playback controls; the navigation row scrolls horizontally and the locator remains reachable. Essential labels stay in HTML at fixed screen sizes. Secondary equations appear on demand. Reduced motion reaches the same views immediately; it does not remove concepts or controls.

Visual acceptance requires the actual loaded GLB at two oblique angles, expanded layer, attention, matrix, routing and narrow view. Original wireframes specify composition; browser evidence determines acceptance.

## Deeper inspection

Solid operation nodes have modest rounded edges; RoPE uses the rounded operation form; RMSNorm uses a compact solid circular disk aligned with the flow, distinguishing normalization from a learned array. Open outlines are reserved for subgraph containers such as layers and experts. Learned matrices and runtime arrays use panels whose labels identify their different roles. These are explanatory shapes, not physical components. Each view states the mathematical dimensions separately from its schematic mesh size.

A moving point represents a token ID, a bundle represents sampled channels of a vector, and a grid represents sampled positions/channels of a tensor. The explicit flow controls keep the motion optional and inspectable. RMSNorm provides the first complete operation-to-scalar path: select a channel, inspect its squared input and the shared denominator, then apply its learned scale.

## Persistent scale and graph edges

The model, selected layer, attention group, cache and expert interior share one spatial hierarchy. Zooming changes the camera rather than cross-fading between scenes. Container rails and inter-layer links are thin enough to remain legible at the interior scale. The sparse overview keeps its stage connections and autoregressive feedback edge visible.

The gray graph joins actual input/output ports. Expert routing and residual bypasses use the same Y=0 plane as the main computation trunk; necessary projection/cache port stubs are orthogonal. Flow packets follow those connections. Open containers do not themselves imply a numerical operation. Solid operators transform their input tensors; matrix panels identify learned parameters or runtime arrays in their labels. Model dimensions are stated numerically, independently of schematic mesh size.

## Information design

The numerical panels apply Tufte's integration of graphics with words and numbers: selected attention weights and all eight router probabilities have directly adjacent values and common-scale bars. Masked future keys remain explicitly marked, and routing probability is separate from the selected experts' normalized combination weights. Quiet table rules and direct labels reduce decoration while preserving the data. Parent context remains available around local detail; arbitrary orbit may still cause occlusion.

These are project applications of [Tufte's sparkline principles](https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/) and [his use of surrounding evidence for comparison](https://www.edwardtufte.com/notebook/making-better-inferences-from-statistical-graphics-edward-tufte/), not claims that he endorsed this exhibit. X encodes sequential computation at both model and layer scales; depth encodes parallel alternatives; they do not encode probability or parameter count. Exact numerical reading remains available in the HTML panels and matrix view.

## Surroundings experiment

The development preview offers Full context, Muted context, and Hide surroundings. Muting darkens outside geometry heavily and suppresses its labels near the selected module; it leaves material opacity at one. Hiding is an explicit cutaway of the same scene. The selected computation and camera pose do not move when the control changes. The overview retains the complete graph in every mode.

Attention inspection defaults to Hide surroundings so adjacent groups cannot obstruct the selected computation. Users may restore context manually. Direct labels identify query/key/value projections, Q and K RoPE, attention weights, the weighted value sum, and both cache sheets. These labels persist while zooming and orbiting within attention inspection; narrow labels use shorter wording and staggered positions.
