# Scene and interaction contract

Version 3. Original schematic geometry; all samples are illustrative. Architecture counts come from shared/model-spec.json.

## Coordinates and ownership

Author coordinates are browser coordinates: X runs left to right through computation, Y is up, Z separates parallel groups. Sequential layers also advance along X. The Blender helper maps (x,y,z) to (x,-z,y); standard glTF export restores (x,y,z). All object transforms are local to their parent, with unit scale and centered mesh pivots. Mesh dimensions are baked into shared mesh vertices. An asymmetric test marker at browser (1,2,3), with dimensions (.2,.4,.6), and CAM_TEST at (4,5,6) verify export conversion. The browser hides diagnostic geometry.

MODEL_ROOT contains LAYER_STACK, FOCUS_LAYER, input, embedding, final_norm, lm_head, output, and camera anchor empties. LAYER_STACK contains layer_0 through layer_31 at ((i-15.5)*.65,0,0), dimensions (.484,.16,.264). Browser spacing multiplies each layer's base X coordinate by a user factor in [1,3]. This follows the same left-to-right direction as the internal computation. Depth is reserved for parallel alternatives. A connecting path follows their order.

FOCUS_LAYER contains one reusable detailed assembly. It remains present at the selected layer's center at a uniform browser scale of 0.022. Its input and output meet the enclosing frame's left and right ports. Layout constants are shared by the generator and viewer through shared/layout.json. The selected layer's collapsed summary connection is hidden, while the other 31 layers retain their summary paths. Selecting a different layer rebinds this reusable interior; navigating between views of the same selection never relocates it. Context modes can suppress surrounding meshes. Metadata layer=-1 means the currently selected layer, never shared model weights.

Thin screen-width contours follow the same exported frame bounds and links, keeping them legible at overview scale without changing their positions. They recede with the surrounding context during close inspection.

The stack has 31 explicit inter-layer links. Embedding enters the first layer; the last layer connects to final RMSNorm, the output projection and token selection. A separate feedback edge carries the next token back to the input. Spacing updates these endpoints and moves the input/output stages outward as well as changing layer positions. Every forward macro edge stays on X with Y=Z=0. The autoregressive return uses its own orthogonal depth lane. The main graph trunks and residual/expert routing lie on Y=0. Short port stubs change height only where an actual input or output face requires it.

Inside the layer, component X positions convey computation order: norm1=-8, attention=-5, add1=-2, norm2=0, router=2, experts=5, merge=8, add2=10. Separate gray stage segments prevent a false direct path through attention or around the experts. Both residual branches join their addition nodes. The selected router paths terminate at expert ports; every expert contains its own gate/up/SiLU/product/down graph. The two routed branches cannot connect directly across the interior and bypass those operations.

Attention has eight groups separated along Z at (g-3.5)*1.2. Each group contains four Q sheets separated locally in Z and one shared K/V pair. Semantic group selection highlights the selected group while its neighbors remain present and muted. The camera approaches through the gap between groups. Attention-score matrix axes are query token rows and key token columns. K/V cache axes are token rows and sampled head channels; sheet separation means K versus V. Expert alternatives separate along Z at (e-3.5)*1.1. These spatial distances do not encode tensor dimensions. All eight expert interiors are nested inside their open shells. A selected interior is framed by the camera; no interior is created at arrival.

## Metadata

Every semantic object has extras: schema_version=1, id (unique stable string), component (snake_case), layer (0–31 for slices, -1 for reusable detail), lod (0/1/2), interactive (boolean), description_key. Optional group, head, expert and dimensions specify semantic identity. All geometry has a semantic ancestor. Camera anchors use component=camera_anchor, browser-space target_x/target_y/target_z extras; their positions undergo normal export conversion. Reports record parent, local/world transforms, bounds, meshes, triangles, and exported extras. Export and actual Three.js loading both check the coordinate sentinel, anchors, counts and identity. Repeated meshes share glTF mesh data; GPU instancing is not assumed.

## Browser state

One state owns selected layer, group, token, expert, view (overview/layer/attention/cache/router/expert/matrix/output/input), spacing, tour time, playing, speed, and illustrative seed 1729. View changes never reset selection. Matrix return restores its originating spatial view; overview round trips preserve layer/group/token. HTML controls provide all picking alternatives. A compact Layer dropdown selects any of the 32 layers, while the persistent location text identifies the selected layer, group, and token.

Absolute timeline time determines chapter, pose, demonstration progress and highlights. No accumulated simulation changes are allowed. Explore and pause give OrbitControls sole camera ownership. Playback disables orbit and interpolates toward chapter anchors; resume blends from the current camera. Reduced motion jumps directly to identical target states. Review context serializes build/asset version, seed, state, camera position/target and viewport, and can restore that state.

## Verification

Check first/middle/last layer overview → layer → attention → matrix → layer → overview round trips. Check all 32 selections, each four-Q group, both residual paths, eight alternatives and two selected routes. Inspect two oblique angles, changed spacing, extracted layer, matrix and narrow viewport. Numerical cells and spatial highlights use the same deterministic data. Track structural, browser visual/interaction and human learner evidence separately.

## Inspection and flow

Manual section navigation follows the graph hierarchy through the persistent scene. Sibling moves use a wider common context; a parent-to-child move approaches directly. Reduced motion goes directly to the destination. Tour seeking retains its deterministic camera contract.

Flow.tsx renders a separate 12-second illustrative computation cycle. Token points, sampled vector bundles and tensor grids follow graph paths; shared route helpers live in spatial.ts. Markers do not imply real inference. App.tsx renders the current flow description beside the flow controls, independent of camera clipping and scene labels. The flow clock can play, pause or advance one step without running the camera tour. Overview flow includes the next-token return path; focused views show transformations and K/V reuse. Navigation pauses and resets the local demonstration.

inspection.ts owns the worked RMSNorm calculation independently of rendering. Its eight-channel toy vector makes each arithmetic step inspectable; it is not a slice normalized as though it were the real 4,096-channel vector. Illustrative learned scales depend on layer, stage and channel, and remain fixed across tokens. App.tsx presents the operation → vector → scalar drill-down with selected-channel arithmetic and shape/dimension explanations.

Navigation continuity is owned by navigation.ts. The live GLB remains fixed during section navigation. Full context retains every structural mesh; Muted context keeps meshes opaque and darkens the surroundings during approach. The development-only Hide surroundings mode hides meshes outside the focused semantic scope near arrival, without relocating or recreating any geometry. Parent-to-child flights aim at an existing destination and approach directly; returning to an ancestor withdraws directly; sibling moves pass through their shared parent. Camera position and direction change continuously with logarithmic distance interpolation. Viewport aspect determines a constant lens for the flight, and the near plane follows viewing distance to support the nested scales. Orbit and restored contexts preserve their camera ownership rules.

Scene annotations are separate from structural geometry. Labels and numerical overlays appear at local readable distances; the underlying module, matrix, port and wire are already present. Router label distances account for responsive camera framing. Active flow belongs to the selected graph coordinate system and remains mounted independently of label distance thresholds. The attention panel represents a batch of four per-head calculations, while the displayed 8×8 values show one illustrative head. Q and K pass through explicit RoPE operations; V does not. Cached K writes branch after RoPE, cached V writes branch from V, and retained K/V have separate read connections to scores/weighted sums.

## Operation size and context scopes

Normalization uses a compact solid circular disk aligned with the flow axis. It denotes a width-preserving rescale, not a weight matrix; its diameter and thickness are schematic. Thin embedding and output panels represent learned arrays. The final normalization badge is much smaller than those panels. Shape size does not encode FLOPs, memory, or parameter count.

Context scopes are the selected layer, selected attention group (also for cache/matrix views), the expert bank and router/merge, or the selected expert interior. Model-level views retain the complete graph. Muted context uses color and label suppression rather than transparency, so the focused module stays solid. Isolation is an explicit cutaway: connections can continue outside the hidden scope. Focused meshes and world matrices remain unchanged in all modes. Copied view contexts include the mode; older contexts default to muted. Reset also chooses muted.
