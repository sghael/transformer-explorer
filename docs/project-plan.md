# Transformer Explorer implementation plan

Status: specification and scaffold. The generator, viewer, and build commands described below are planned work. The initial implementation goal covers milestones 1 and 2. Later milestones define the route to a finished exhibit.

## Outcome and scope

Build a live 3D explanation for readers familiar with basic ML terminology but new to Transformer internals. After the tour, a visitor should trace a token through the model, explain what attention and expert routing each do, and distinguish model weights from the activations stored in the KV cache.

Use the Mixtral preset and educational constraints in `../README.md`. Start with original lightweight procedural geometry, a short illustrative token sequence, and one detailed layer reused for all layer selections. Physics simulation, kinematic rigs, photorealistic assets, additional model families, and live inference are outside the initial scope.

## Spatial deliverable contract

Use depth to explain repeated structure and relationships. Matrix values can live
on flat surfaces; the arrangement of layers, head groups, and expert modules must
be explorable in three dimensions. The stack is a diagram of computation, not a
physical arrangement of memory or a three-dimensional embedding space.

The preset has 32 sequential decoder layers, 32 query heads grouped around eight
K/V pairs per layer, and eight experts of which two are selected per token.
These are different axes of repetition. Draw counts from `../shared/model-spec.json`;
do not add fictitious layers to suggest scale. Larger presets are future work.

| View | What space explains | Required interaction |
| --- | --- | --- |
| Model overview | Distinct decoder layers repeat along a labeled depth axis; a residual-stream path connects them in order | Start at an oblique angle; orbit and adjust stack spacing; select any of 32 slices directly or through a keyboard-accessible layer list |
| Selected layer | Attention and MoE are sequential stages with two residual bypasses; heads and experts are parallel within their respective stages | Pull the selected slice into a focus area, separate its components, and retain a highlighted slot in a compact overview; collapse back to the same identity |
| Attention and cache | Repeated matrix sheets show query groups sharing K/V and the cache growing along token positions | Inspect one of eight groups, visibly connect its four Q heads to one K/V pair, select a token, and expose the associated cache rows; other groups remain represented compactly |
| Expert bank | Eight alternatives receive routed inputs; two outputs combine, rather than flowing through eight experts in series | Separate the bank enough to trace the two selected routes, open one expert, and return to the bank without losing token or layer selection |
| Matrix reading | A matrix has row/column meaning and numerical values that need a stable reading surface | Switch to a face-on view with readable axes, dimensions, selected entries, and linked HTML explanation; return to the same 3D component |

Define axis meanings per view. For example, a cache sheet uses token position and
head channel as its matrix axes, while separation between sheets identifies K/V
and group membership. An attention-score sheet uses query and key token positions.
Layer depth is a separate structural axis. Label transitions between these views;
physical distance or slab thickness must not silently encode a tensor dimension.
Represent large dimensions with samples and explicit counts, not one mesh per value.

Use a common selected layer/group/token state for the scene and numerical panels.
Include a location indicator such as `Layer 12 / KV group 3 / token 5`. Guided
views should frame the relevant objects automatically; free orbit is optional
exploration. Occluded objects remain reachable through the layer/component list.
Prefer spacing, isolation, and dimming over overlapping transparent surfaces.
On narrow screens, show one focused view and place the reading panel below it.
Reduced motion uses immediate or brief crossfade transitions to the same states.

**Proof of depth:** the first browser slice must show the same selected objects
from two oblique viewing angles, with visible changes in separation and
occlusion; spacing and expansion must change actual object transforms. Selection,
connectivity, and the highlighted stack slot must survive the round trip
`overview → layer → attention group → matrix → layer → overview`. A static
perspective image, a prerecorded fly-through, or a flat node diagram with orbit
controls is insufficient. The face-on reading view is a companion to the spatial
scene and shares its data and selection.

## Milestone 1: Design contracts

Inspect the installed Blender, Python, Node, package manager, browser tools, and agent controls. Record portable versions and executable checks; keep machine-specific paths and connection details private.

Create `architecture.md` with the scene hierarchy, coordinate conventions, transform ownership, versioned metadata schema, and tour state model. Define Blender-to-glTF-to-browser conversion with one asymmetric test object and a camera anchor, so a flipped axis or wrong forward direction is observable. Specify local versus world transforms, pivots, scale, parent relationships, and how an expanded layer preserves its identity. Include compact, spaced, and exploded poses; per-view axis meanings; and the shared selection state for 3D objects and matrix panels.

Refine `storyboard.md` into chapter data requirements. For each stop, specify one main learning objective, essential labels, camera framing, visibility, caption, misconception, and acceptance check. Design an 80-second overview tour with optional deeper inspection rather than trying to teach every equation during playback.

Create `visual-language.md` with original schematic layouts for the oblique stack, expanded attention, expert routing, and face-on matrix reading. Show how focus transitions retain a compact stack locator and avoid occlusion at desktop and narrow widths. Include typography, arrow conventions, selected/dimmed states, and reduced-motion behavior. If using external references, record source and usage rights. If none are supplied, proceed with original wireframes and state assumptions.

**Acceptance:** the contracts specify enough detail to implement the generator and viewer independently; the coordinate test, metadata round trip, and chapter acceptance checks are defined; all required teaching concepts map to a stop or optional detail view; each use of depth has a stated learning purpose and the spatial contract has checkable evidence requirements. Resolve design decisions in documents, then proceed to the first implementation slice without an extra approval gate.

## Milestone 2: One complete Blender-to-browser path

Build a headless Python generator for input, embeddings, compact layer stack, one expanded layer, attention, router, eight expert shells, residual paths/addition nodes, final normalization, and output. Export a GLB with semantic metadata and named camera anchors. Add a structured scene report containing hierarchy, node IDs, transforms, bounds, mesh counts, and export-validation results.

Create the Vite/React/TypeScript viewer. Load the GLB, inspect metadata, support orbit and picking, select any layer, and expand one detailed assembly. Add stack spacing, a persistent stack locator, and linked face-on matrix inspection for one GQA group with four Q heads and shared K/V surfaces. Use clearly labeled illustrative samples; the full computation comes in milestone 3. Implement a short deterministic overview → layer → attention group → router → output tour using absolute time. Keep browser camera control ownership explicit during playback, pause, Explore, and resume.

Provide a development preview for continuous human steering. Keep the latest
successful build reachable while a replacement builds. A development-only review
control shows its build ID/timestamp and copies the reproducible view context,
with selectable text as a fallback. Feedback travels through the existing agent
chat; no new feedback service or command-execution endpoint is in scope. Follow
[the human steering protocol](agent-workflow.md#human-steering-during-autonomous-work).

Provide one documented command that regenerates assets and builds the production viewer. Use Blender background Python execution as the baseline; it supports scripted execution without driving its UI. A script can emit the project's JSON scene report. A Blender MCP connection is optional for interactive inspection and must not be required for reproduction. Verify flags against the installed version. [Blender command-line reference](https://docs.blender.org/manual/en/4.0/advanced/command_line/arguments.html)

**Acceptance:** regenerate from a clean scene; build and serve production output; metadata and camera anchors survive export/loading; all 32 layers select correctly; only one detailed layer is visible; representative components pick correctly; orbit, pause/resume, and forward/backward seeking work. Meet the spatial proof above, including first, middle, and last layer round trips. Inspect two oblique overview angles, an expanded layer, one GQA group, its face-on matrix view, and the router. Verify the panel and 3D scene keep the same layer/group/token identity. Record console errors, build duration, GLB size, and initial render statistics. Mark incomplete computation demonstrations explicitly. Confirm that a failed rebuild leaves the last successful preview available, copied view context identifies the displayed build and state, and a reported view can be restored. Exercise one feedback-to-correction cycle when human feedback is available; otherwise record that the human cycle remains untested and verify context restoration independently.

## Milestone 3: Computational explanation

Implement Q/K/V projection, GQA groups, the RoPE illustration, causal attention, per-layer cache prefill/decode, router scores and top-2 selection, expert internals, weighted output merge, and both residual additions. Make illustrative labels visible alongside values.

**Acceptance:** four Q heads map to each KV group; future-token attention is absent; RoPE affects the Q/K illustration; decode reuses earlier per-layer cache entries; two selected expert outputs merge with normalized weights; expert identity is not labeled as a fixed subject specialty. Verify these invariants in data tests and inspect their visual representations. Test multiple tokens and layer selections. Matrix samples, selected rows, links, and panel values must derive from the same deterministic illustrative data. Verify cache row growth is along token position, while layer and group counts stay fixed.

## Milestone 4: Teaching and interaction

Expand the tour to the storyboard duration. Add semantic zoom, captions, details on demand, keyboard alternatives, reset, speed controls, chapter navigation, accessible focus, and reduced motion. Use a stable illustrative seed.

**Acceptance:** inspect every camera stop and representative mid-transition times. Essential labels remain readable at agreed desktop and narrow viewports. Repeated seeking to the same time produces the same scene state; camera controls never compete; paused exploration remains usable; resuming blends to the tour. Check keyboard-only operation and reduced motion, including layer selection, spacing, component focus, matrix reading, and return to overview. At agreed desktop and narrow viewports, a visitor must identify the selected layer and reach its details without manually navigating a camera. Record whether a person has actually completed the learning checks; agent inspection alone does not establish learner comprehension.

## Milestone 5: Delivery and performance

Measure on a representative client browser; record device class, browser, viewport, and pixel ratio without personal identifiers. Profile before adding asset compression or instancing complexity. Preserve semantic IDs, picking, and metadata through optimization.

**Acceptance:** production build and clean regeneration succeed; performance targets from the README are measured and met or exceptions documented; keyboard and tour checks pass; static deployment instructions work. Record asset bytes, triangles, draw calls, texture memory, and frame-time measurements in both compact and spaced-stack views, during layer expansion, and in attention detail. Reduce geometry/detail before dropping spatial navigation or identity. Release scope follows the user's publishing authorization.

## Evidence and escalation

Use `agent-workflow.md` for model/effort choices. Every increment ends with a diff, check results, and the relevant visual evidence. Keep reproducible artifact-generation commands and sanitized acceptance summaries in `progress.md`; put generated screenshots/reports under ignored `artifacts/`, and private run logs under `../docs-private/`.

An export passing is structural evidence. A browser screenshot is visual evidence. A learner answering the intended question is comprehension evidence. Record which evidence exists without treating one as a substitute for another.

When a check fails, identify whether the cause is the brief, implementation, environment, or unresolved design. Fix or narrow that cause before raising reasoning effort. Avoid introducing a custom API orchestrator as a dependency of the exhibit.
