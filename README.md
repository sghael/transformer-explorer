# Transformer Explorer

An interactive 3D exhibit explaining how a decoder-only Transformer processes tokens and generates the next token. Visitors can explore the live scene or play a guided camera tour, pause it, and inspect the same objects.

**Status: project seed.** This repository contains the design brief, implementation plan, current agent prompt, initial model specification, and starter directories. The Blender generator and web viewer have not been implemented. There is no runnable website or generated model yet.

## Start here

Read [AGENT_PROMPT.txt](AGENT_PROMPT.txt) for the current implementation assignment and [the project plan](docs/project-plan.md) for milestone acceptance criteria. [AGENTS.md](AGENTS.md) routes agents to the product requirements and [reasoning/delegation workflow](docs/agent-workflow.md). The [initial storyboard](docs/storyboard.md) maps the tour to learning objectives and visual checks.

The first implementation goal covers design contracts and one complete Blender-to-browser path. This repository is already initialized. The [original prompt](docs/archive/original-agent-prompt.txt) is preserved verbatim as historical background.

## What the exhibit should teach

Follow a short sequence from token IDs through embedding lookup, repeated decoder layers, final normalization, vocabulary logits, next-token selection, and another generation step. A visitor should be able to explain the residual stream, attention, grouped-query attention, positional rotation, causal masking, caching, and sparse expert routing.

All token paths, attention weights, routing scores, logits, and candidate probabilities in the first version are **illustrative**. No model weights or inference service are required. Show this label beside demonstrations, not only in a disclaimer page. Words used as token labels are illustrative chunks unless a real tokenizer supplies boundaries.

## Initial architecture: Mixtral 8x7B

Mixtral provides a concrete sparse mixture-of-experts (MoE) decoder preset. It is one architecture, not a claim about every modern language model. Each decoder layer contains its own attention and expert weights; geometry reuse does not imply weight sharing.

The [published configuration](https://huggingface.co/mistralai/Mixtral-8x7B-v0.1/blob/main/config.json) provides the starting dimensions:

| Property | Value |
| --- | ---: |
| Decoder layers | 32 |
| Hidden width | 4096 |
| Expert intermediate width | 14336 |
| Query heads | 32 |
| Key/value heads | 8 |
| Head dimension | 128 |
| Experts per layer | 8 |
| Selected experts per token per layer | 2 |
| Vocabulary size | 32000 |

The checked-in [model specification](shared/model-spec.json) is the machine-readable source for these values. Head dimension is hidden width divided by query-head count. The configuration has a 32768-position limit and no sliding window; context positions and vocabulary entries are different quantities.

A layer follows:

```text
x -> RMSNorm -> attention -> add original x
  -> RMSNorm -> sparse MoE -> add attention-stage residual
```

The residual path carries the current token representation around each sublayer. Draw both bypasses and addition points explicitly. After the stack, final RMSNorm and the language-model head map the representation to vocabulary logits. Explain logits as scores; sampling or a chosen selection rule produces a token.

See the [Mixtral paper](https://arxiv.org/abs/2401.04088) for the per-token, per-layer expert selection design and the [reference implementation](https://github.com/huggingface/transformers/blob/main/src/transformers/models/mixtral/modeling_mixtral.py) for computation details.

## Compact layer stack and semantic zoom

Render all 32 layers as individually selectable thin slices in a compact stack. Clicking any layer moves it into a focus position and expands one reusable detailed assembly. Dim or compress the remaining slices while keeping the selected layer number visible. Use zero-based indices in data and Layer 1–32 in the interface.

Semantic zoom changes which concepts are visible as the visitor moves closer:

| Level | Visible concepts |
| --- | --- |
| Overview | Input, compact layer stack, final normalization, output |
| Layer | Residual stream, two normalization gates, attention, MoE, additions |
| Component | Q/K/V, head groups, RoPE, cache, router scores, expert matrices, equations |

The [spatial deliverable contract](docs/project-plan.md#spatial-deliverable-contract) defines the required views, interactions, and evidence.

Use smooth transitions and stable thresholds to avoid flickering between levels. Selecting a component should also offer an explicit way to reveal details. Reusing the detailed assembly must preserve the selected layer's identity and cache context.

Use a dark neutral environment, restrained emissive highlights, simple matrix slabs, and a clear flow direction. Shape, labels, and placement must convey meaning alongside color. Use thin matrix surfaces with dimension labels and sampled heatmaps. Separate related surfaces in depth to reveal repetition and shared connections; label what each axis means. Avoid rendering individual parameters or thousands of matrix cells.

The default view is an oblique, genuinely three-dimensional stack with visible layer spacing. Visitors can spread the stack, pull out one layer, inspect its head groups or expert bank, and return to the same location. A face-on matrix view and HTML detail panel provide readable values without losing the selected layer, group, or token. Keep a compact stack locator visible during close inspection. A perspective-styled flat diagram alone does not meet the spatial contract.

## Attention, GQA, RoPE, and caching

Start with projections of a normalized activation into queries (Q), keys (K), and values (V). Group four query heads with one key/value head pair to explain grouped-query attention (GQA): 32 Q heads share 8 K/V pairs. Shared K/V does not mean shared query weights.

Use a short 6–10-token example for causal attention. Hide future-token links with a visible mask and use weighted arcs for allowed connections. Show the mathematical detail only at close range:

```text
Attention(Q, K, V) = softmax(Q K^T / sqrt(head_dim) + causal_mask) V
```

RoPE rotates paired coordinates in queries and keys according to token position before attention scores are formed. The twisting motif is a visual abstraction; values are not given the same positional rotation.

Give the selected layer a cache rack. Distinguish prompt **prefill**, which computes and stores per-layer K/V entries, from **decode**, which computes the new token's entries and reuses earlier ones. The cache stores activations, not model weights or precomputed answers. Returning to the input during generation must not suggest recomputing every earlier token when caching is enabled. An expanded cache is representative of one layer; each layer has its own cache.

## MoE routing

Place a router before eight expert modules. For each illustrative token:

1. Display eight routing scores and select exactly two experts.
2. Send the same current activation to the selected experts.
3. Show independent expert transformations.
4. Scale and merge the two outputs, then add the residual.

For this preset, normalize the selected routing weights to sum to one. Distinguish raw router logits, probabilities, and the normalized selected weights in labels. Different tokens and layers may choose different experts; do not label experts as fixed subject specialists without supporting evidence.

Expand at most one expert to show gate/up projections, SiLU, elementwise multiplication, and the down projection. Matrix slabs should display dimensions on demand. Animate output vectors being combined rather than averaging expert weights.

## Blender asset pipeline

Use Python and `bpy` to generate a scene from a clean file. The sources are Python plus JSON; the .blend file and GLB are reproducible artifacts.

Blender owns geometry, base materials, semantic hierarchy, exploded poses, and named camera anchors. The browser owns token movement, route highlights, attention arcs, labels, camera interpolation, and timeline state. Do not make the website depend on animated Blender materials surviving export.

Use shared meshes for repeated slices, heads, and expert shells. Validate instancing support in the actual installed Blender exporter and Three.js loader before depending on it. Preserve picking and semantic identity when instancing.

Export custom properties as glTF extras. Adopt one metadata contract across Python and TypeScript, for example:

```json
{
  "component": "moe_router",
  "layer": 0,
  "lod": 2,
  "interactive": true,
  "description_key": "moe.router"
}
```

Names such as `MODEL_ROOT`, `LAYER_STACK`, `FOCUS_LAYER`, `ATTENTION_ROOT`, `KV_CACHE`, and `MOE_ROUTER` help debugging; metadata drives interaction. Verify extras survive export and loading. Export anchors such as `CAM_OVERVIEW`, `CAM_ATTENTION`, `CAM_MOE`, and `CAM_LM_HEAD` with a documented coordinate convention.

## Web viewer and tour

Use Vite, React, TypeScript, Three.js, `@react-three/fiber`, and `@react-three/drei`. Load the GLB, interpret node metadata, and render labels and educational panels in HTML for readable, accessible text.

**Explore mode:** orbit, pan, zoom, hover, click-to-focus, layer selection, stack spacing, component explanations, and explicit Overview / Layer / Matrix views. Preserve the selected layer, head group, and token across views. Provide reset, back-to-layer, a persistent location indicator, and keyboard alternatives for essential actions. Camera travel helps orientation but is not required to reach a view.

**Guided Tour:** play/pause, restart, previous/next chapter, scrubber, speed, and return to Explore. Paused camera movement should remain under the visitor's control. Resume should transition smoothly to the tour camera. Respect reduced-motion settings and provide readable captions.

Represent chapters as data with ID, duration, camera anchor/target, visible detail level, emphasis/dimming sets, animation parameters, caption, and explanation key. Compute scene state from absolute timeline time and a fixed seed so seeking backward works without replaying a chain of side effects. Ensure camera controls and tour playback never compete for ownership.

The full storyboard follows overview → tokens → embeddings → stack → expanded layer → RMSNorm → Q/K/V → GQA → RoPE → causal attention → cache → attention residual → second RMSNorm → router → top-2 selection → expert processing → weighted merge → residual output → collapse → remaining layers → final norm → LM head/logits → next-token choice → autoregressive loop → overview.

The first polished tour should last roughly 60–90 seconds, grouping related chapters where needed.

## Development preview and feedback

During implementation, keep a reachable preview of the latest successful build
and share visual checkpoints in the agent conversation. A development-only review
control identifies the build and copies its camera/selection/timeline context, so
feedback can refer to the exact view. It does not send messages or run agent
commands. Human feedback steers autonomous work through the existing chat;
explicitly pausing the agent is separate from pausing the tour. Follow the
[steering protocol](docs/agent-workflow.md#human-steering-during-autonomous-work).
These controls are planned for milestone 2 and are not part of the public exhibit
interface by default.

## Shared data and repository layout

```text
README.md
AGENT_PROMPT.txt          # Current implementation assignment
AGENTS.md                # Agent entrypoint and project workflow
.gitignore
shared/
  model-spec.json        # Initial architectural and visualization preset
blender/                 # Future procedural Python generator
web/
  src/                   # Future React/TypeScript viewer
  public/models/         # Generated web assets
scripts/                 # Future build and validation commands
docs/                    # Plan, workflow, storyboard, original prompt archive
```

Tracked .gitkeep files preserve empty starter directories. Future files named in the prompt are a plan, not implemented modules.

Keep architecture values distinct from display limits in JSON. Both generation and viewer should validate a versioned schema. Put explanatory text in `shared/component-descriptions.json` when implemented. Add tour data separately from architectural facts.

Future presets may cover dense Llama-like models, Qwen MoE, or DeepSeek variants. Some architectures require new components or different graph structure; a JSON switch alone cannot express every architectural change. A later Hugging Face config importer should support an explicit set of mappings and reject unsupported features.

## Performance and accessibility goals

These are proposed acceptance targets, not measured results:

- Initial GLB substantially below 10 MB where practical.
- Aim for 60 fps on a representative desktop and at least 30 fps in a reduced-quality mode, with hardware, browser, viewport, and pixel ratio recorded.
- Reuse meshes and materials; cap particles and attention arcs to the short example.
- Expand one layer and one expert at a time. Avoid geometry for every parameter, hidden dimension, or context position.
- Profile triangles, draw calls, texture memory, loading time, and frame time before adding compression.
- Keep labels readable and collision-aware; support keyboard navigation and reduced motion.
- Retain semantic metadata and object selection through optimization.
- Provide preset viewpoints and a face-on reading mode on narrow screens. Reduced motion changes transitions, not the available concepts or selectable layers.

Document the measurement procedure and results in `docs/`. Check performance on the client browser, not only on the build machine.

## Phased milestones

The [project plan](docs/project-plan.md) defines five milestones: design contracts, an end-to-end slice, computational explanation, teaching and interaction, and delivery. Each has explicit acceptance checks. The initial implementation goal covers the first two.

Use the [agent workflow](docs/agent-workflow.md) to select reasoning effort and delegate bounded work. Pin dependency versions and record the tested Blender version when implementation begins.

## Validation for implementation

Regenerate from a clean scene, validate GLB export and metadata, and build the production web app. Check all 32 layer selections, exactly one expanded assembly, four Q heads per KV group, causal masking, and two selected experts with normalized merge weights.

Verify cache creation during prefill and reuse during decode, deterministic results at a given timeline time, readable labels, orbit/pan/zoom, picking, pause/resume, seeking, speed changes, and reduced motion. Inspect browser errors, duplicate geometry, and rendering performance. Record what was actually tested.

## Artifact policy and references

Ignore generated Blender scenes, autosaves, caches, rendered frames, dependencies, and build output. Source and lockfiles belong in Git. Generated models in `web/public/models/` are ignored initially; a later deployment decision can intentionally track a modest GLB. Introduce Git LFS only if size and workflow justify it.

Visual and interaction references:

- The supplied Welch Labs *Illustrated Guide to AI* page suggests repeated matrix sheets, grouping, and explicit shared connections. Use it as conceptual inspiration; create original geometry and graphics rather than publishing the supplied scan. Its example architecture and counts are not this preset.
- [Transformer Explainer](https://poloclub.github.io/transformer-explainer/) connects token selection, attention inspection, numerical explanations, and output probabilities. Adapt that connected inspection to our spatial scene. Its live GPT-2 demonstration is distinct from this project's illustrative Mixtral data; live inference remains outside the initial scope.

Primary references:

- [Mixtral configuration](https://huggingface.co/mistralai/Mixtral-8x7B-v0.1/blob/main/config.json)
- [Mixtral of Experts paper](https://arxiv.org/abs/2401.04088)
- [Mixtral reference implementation](https://github.com/huggingface/transformers/blob/main/src/transformers/models/mixtral/modeling_mixtral.py)

Implementation documentation to consult against pinned versions:

- [Blender glTF exporter](https://docs.blender.org/manual/en/5.0/addons/import_export/scene_gltf2.html)
- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- [Three.js AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html)
- [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction)

The original prompt is historical source material. This README clarifies cache creation versus reuse, distinguishes display abstractions from real inference, and makes implementation status explicit.

## Privacy checks before committing

Install [Gitleaks](https://github.com/gitleaks/gitleaks) (tested with 8.30.1), then enable the tracked hook in each checkout:

```sh
git config core.hooksPath .githooks
```

Commits are blocked when Gitleaks is missing or detects a known secret pattern, personal home-directory path, private ChatGPT conversation link, private network address, internal hostname, or email address other than a GitHub no-reply address. The hook scans staged changes and redacts matched values in its output. Extend `.gitleaks.toml` when new privacy patterns need protection.

Run a full history scan before publishing:

```sh
gitleaks git . --log-opts="--all" --config .gitleaks.toml --redact --ignore-gitleaks-allow
gitleaks git . --log-opts="--all" --config .gitleaks-secrets.toml --redact --ignore-gitleaks-allow
```

Automated checks cannot identify every kind of private information, such as personal details in prose or images. Review staged changes before committing. Hooks must be enabled in each clone and can be bypassed, so they are a guardrail rather than a guarantee.

Keep private documentation and local context in `docs-private/`. This directory is ignored by Git, and the pre-commit hook rejects it if force-added. Create it locally as needed; its contents are not shared or backed up by this repository.
