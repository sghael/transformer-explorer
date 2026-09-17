# Scene and interaction contract

Version 1. Original schematic geometry; all samples are illustrative. Architecture counts come from shared/model-spec.json.

## Coordinates and ownership

Author coordinates are browser coordinates: X runs left to right through computation, Y is up, Z separates repeated layers or parallel groups. The Blender helper maps (x,y,z) to (x,-z,y); standard glTF export restores (x,y,z). All object transforms are local to their parent, with unit scale and centered mesh pivots. Mesh dimensions are baked into shared mesh vertices. An asymmetric test marker at browser (1,2,3), with dimensions (.2,.4,.6), and CAM_TEST at (4,5,6) verify export conversion. The browser hides diagnostic geometry.

MODEL_ROOT contains LAYER_STACK, FOCUS_LAYER, input, embedding, final_norm, lm_head, output, and camera anchor empties. LAYER_STACK contains layer_0 through layer_31 at (0,0,(i-15.5)*.32), dimensions (4,.12,.22). Browser spacing multiplies each slice's base Z coordinate by a user factor in [1,3]. This depth axis means sequential decoder layers, not tokens or parameter coordinates. A connecting path follows their order.

FOCUS_LAYER contains one detailed reusable assembly, hidden in overview. Its origin is (0,0,0). Selecting a layer preserves a highlighted slot in the stack locator; the stack dims and shifts left while the assembly opens. Metadata layer=-1 means the currently selected layer, never shared model weights. Component X positions convey order: norm1=-8, attention=-5, add1=-2, norm2=0, router=2, experts=5, merge=8, add2=10. Both residual bypasses connect before/after their respective stages with distinct addition nodes. Browser may translate the complete focus assembly, but does not reinterpret exported local geometry.

Attention has eight groups separated along Z at (g-3.5)*1.2. Each group contains four Q sheets separated locally in Z and one shared K/V pair. Semantic group selection isolates the selected group while retaining compact group controls. Attention-score matrix axes are query token rows and key token columns. K/V cache axes are token rows and sampled head channels; sheet separation means K versus V. Expert alternatives separate along Z at (e-3.5)*1.1. These spatial distances do not encode tensor dimensions. One expert detail can open at a time.

## Metadata

Every semantic object has extras: schema_version=1, id (unique stable string), component (snake_case), layer (0–31 for slices, -1 for reusable detail), lod (0/1/2), interactive (boolean), description_key. Optional group, head, expert and dimensions specify semantic identity. All geometry has a semantic ancestor. Camera anchors use component=camera_anchor, browser-space target_x/target_y/target_z extras; their positions undergo normal export conversion. Reports record parent, local/world transforms, bounds, meshes, triangles, and exported extras. Export and actual Three.js loading both check the coordinate sentinel, anchors, counts and identity. Repeated meshes share glTF mesh data; GPU instancing is not assumed.

## Browser state

One state owns selected layer, group, token, expert, view (overview/layer/attention/cache/router/expert/matrix/output/input), spacing, tour time, playing, speed, and illustrative seed 1729. View changes never reset selection. Matrix return restores its originating spatial view; overview round trips preserve layer/group/token. HTML controls provide all picking alternatives and a persistent 32-slot locator.

Absolute timeline time determines chapter, pose, demonstration progress and highlights. No accumulated simulation changes are allowed. Explore and pause give OrbitControls sole camera ownership. Playback disables orbit and interpolates toward chapter anchors; resume blends from the current camera. Reduced motion jumps directly to identical target states. Review context serializes build/asset version, seed, state, camera position/target and viewport, and can restore that state.

## Verification

Check first/middle/last layer overview → layer → attention → matrix → layer → overview round trips. Check all 32 selections, each four-Q group, both residual paths, eight alternatives and two selected routes. Inspect two oblique angles, changed spacing, extracted layer, matrix and narrow viewport. Numerical cells and spatial highlights use the same deterministic data. Track structural, browser visual/interaction and human learner evidence separately.
