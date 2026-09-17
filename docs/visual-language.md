# Visual language

Original procedural schematics; no external artwork is used. Space represents computational structure. Thin sheets represent sampled matrices, with actual dimensions stated in HTML.

## Overview

An oblique camera looks across 32 horizontally oriented slices separated in depth. Input and embedding sit to the left; final normalization and output sit to the right. A labeled path connects the stack in sequential order. A spacing control changes the depth separation. Selected slices receive a bright edge and a numbered persistent HTML locator.

```text
                    Layer 32 / far depth
                  ╱──────────╱
                 ╱──────────╱   → Final norm → Output
Input → Embed → ╱──────────╱
              Layer 1 / near depth
```

## Extracted layer

Flow runs left to right; residual paths bypass attention and the expert bank above the main path. Heads and expert alternatives separate toward/away from the viewer, so orbit changes occlusion. A focused view isolates a group or expert instead of requiring the reader to see through overlapping sheets.

```text
     ┌──────── residual ────────┐     ┌──────── residual ──────────┐
 x → Norm → Q/K/V → Attention → + → Norm → Router → Experts → Merge → +
                                               ╱  eight alternatives
```

## Attention and reading

Four query sheets connect to a shared K/V pair. Nearby cache sheets extend by token row. Matrix reading uses a face-on camera and an HTML table with query rows and key columns; future cells display a mask, while allowed cells show illustrative weights. Layer/group/token identity remains above the controls.

## Presentation

Use a dark neutral canvas, off-white text, cyan for activations, muted gold for selected routes and slate for inactive geometry. Shape, arrows, numbered controls and text supplement color. Learned weights and runtime activations are explicitly labeled. Interface typography uses the system sans-serif stack, 16px body text, short line lengths and tabular numbers. Selected controls have both border and pressed state. Keyboard focus uses a conspicuous outline.

Desktop places the scene beside a reading panel. Narrow screens place the scene above the panel; controls wrap and the locator remains reachable. Essential labels stay in HTML at fixed screen sizes. Secondary equations appear on demand. Reduced motion reaches the same views immediately; it does not remove concepts or controls.

Visual acceptance requires the actual loaded GLB at two oblique angles, expanded layer, attention, matrix, routing and narrow view. Original wireframes specify composition; browser evidence determines acceptance.
