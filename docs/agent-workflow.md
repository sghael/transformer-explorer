# Agent workflow and reasoning policy

Research checked 2026-09-17. Named models in the research sections describe the verified API at that date; operational model choices live in configuration. The routing choices below are project starting points to evaluate, not measured Blender benchmarks.

## What is supported

Astra's API model ID is `gpt-6-astra`; its effort values are `low`, `medium`, `high`, `xhigh`, and `max`. Use `low` in API/configuration examples rather than inventing an `astra-light` model ID. UI labels such as Light must be checked against the selected model and client. Lower effort does not select a cheaper model with different per-token rates. [Astra model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra)

Codex supports separate model/effort choices for subagents and custom agent definitions. This is suitable for a coordinator retaining the overall design while workers return bounded results. Delegation has its own token and coordination overhead. [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)

The locally inspected Codex CLI version was 0.154.0. Its generated app-server `TurnStartParams` schema exposes `model` and `effort` overrides for the next and subsequent turns. Its CLI accepts `--model` and `-c` configuration overrides. These establish configurable effort; they do not prove that this desktop session implements cache-preserving updates internally. No API billing or cache experiment was run.

## Starting policy

Read `../.codex/config.toml` for the selected model. The coordinator and all workers use that model, with low effort (Light in the UI) as the minimum. This is a project constraint, not a general recommendation for all repositories. Tune reasoning effort within the configured model. Change model IDs in configuration when upgrading; substitution requires the user's direction.

| Work | Starting choice | Escalation trigger |
| --- | --- | --- |
| Progress assessment, bounded planning, routine integration | Configured model, medium | Conflicting requirements, uncertain interfaces, or cross-module failure |
| Initial scene hierarchy, coordinate/export contract, timeline ownership, educational correctness | Configured model, high | A reproduced ambiguity remains after simplifying the problem |
| Implementation against a settled interface | Configured model, medium worker | Failed acceptance after one focused correction; return diagnosis to coordinator |
| Mechanical data edits or repeated styling changes | Configured model, low worker, or local execution | Task requires new design judgment |
| Sequential implementation and styling | Configured model, medium; low for mechanical edits | Same acceptance checks fail after a focused correction |
| Difficult spatial or state-machine diagnosis | Configured model, high; xhigh for a specific unresolved case | High still cannot resolve a bounded, reproduced failure |
| Max effort | Exceptional, explicitly justified case | Define the question and exit condition before selecting it |

The model minimum is required; effort choices above it are starting points. Verify the active harness's model IDs and effort support at dispatch. Read the model ID from project configuration and select it with the chosen effort for workers rather than inheriting a generic worker default. If matching workers are unavailable, keep the work with a coordinator using that model. If the model is unavailable altogether, report the limitation and request direction rather than silently substituting. Higher effort is neither a correctness guarantee nor a reason to add complexity.

A long render or many tool calls alone do not justify high effort: rendering time is tool work. Spend additional reasoning on uncertain geometry, architecture, and acceptance decisions. Diagnose missing dependencies, poor task briefs, or tool failures before changing effort.

## Skill boundaries

This project's brief and acceptance criteria govern the work. Use a skill only
when its specific tools or knowledge help the current increment. Do not restart
product discovery or require repeated approval of choices already settled here.

| Skill or workflow | Appropriate use here | Avoid for |
| --- | --- | --- |
| `impeccable` | Later refinement of HTML controls, typography, panels, accessibility, and responsive layout within the established brief | Transformer pedagogy, tensor/scene layout, Blender geometry, spatial acceptance, and initial project planning. Do not invoke its product interview or create duplicate PRODUCT/DESIGN documents as prerequisites |
| `prototype` | A separately requested disposable experiment with a specific unresolved question | Replacing the required Blender-to-GLB pipeline or delivering a throwaway mockup as the exhibit |
| `deep-clean`, `code-audit`, `thermo-nuclear-code-quality-review` | A separately scoped cleanup or review when concrete maintenance problems warrant it | Routine implementation, speculative restructuring, arbitrary line-count gates, or an obligatory cleanup campaign |
| `tdd`, `diagnosing-bugs` | Requested test-first work or a difficult investigation where the method helps | Forcing an entire method on every small change, demanding approval for established test boundaries, or refusing useful inspection until a reproduction exists |
| `routing-subagent-models` | None; the shared skill was retired | Reinstating generic model tiers or model IDs in skill prose; use project runtime configuration and current dispatch capabilities |

Keep privacy checks, relevant tests, browser inspection, and the repository's
actual PR/review requirements. These boundaries remove irrelevant ceremony, not
verification. Explicit human feedback takes precedence over a skill's stylistic
preferences; do not let a UI skill redefine the 3D teaching approach.

## Fresh-context startup

Read `../AGENTS.md`, `../AGENT_PROMPT.txt`, `../README.md`, this workflow,
`project-plan.md`, `storyboard.md`, and `../shared/model-spec.json`. Read
`progress.md` if it exists, then inspect the checkout and current build state;
resume verified work rather than repeating completed milestones. Load only the
private operating context supplied with the launch request. Do not depend on
conversation history or treat the archived prompt as a second assignment.

The full launch covers milestones 1–5, in order, with a usable preview by
milestone 2. Expose a working spatial slice early and continue toward the complete
tutorial while accepting feedback. If the human requests a smaller goal, honor
that scope. A fresh agent should record its first bounded implementation step and
start work without another planning-approval round.

## Spatial acceptance responsibilities

Use the [spatial deliverable contract](project-plan.md#spatial-deliverable-contract)
as the design and acceptance source. Establish the scene's hierarchy, per-view
axis meanings, compact/exploded poses, and synchronized layer/group/token selection
before assigning geometry or viewer work. Use high effort when these decisions
are coupled; routine implementation follows the existing table.

Build and inspect an untextured spatial slice before material polish. It must
already support stack spacing, layer extraction, one shared K/V group, and return
to the same overview location. Judge whether depth explains sequential layers,
parallel heads, or expert alternatives; an attractive render alone does not settle
that question. Face-on numerical views must retain the scene's selection and data.

Workers implementing geometry return semantic IDs, transforms, pose bounds, and
sample-data mappings. Workers implementing interaction return selection round-trip
checks and fixed-view captures. The coordinator inspects the loaded browser scene
from at least two oblique directions, verifies spacing and explosion interactively,
and checks the matrix reading view and narrow-screen layout. A render from Blender
cannot establish browser interaction or export correctness.

Record structural, visual, interaction, and learner evidence separately. Essential
visual evidence includes camera/pose, viewport, selected layer/group/token, and tour
time. Use actual browser interaction to check orbit, spacing, selection, and return;
a pair of screenshots alone cannot prove those controls work. Mark learner checks
as unperformed until a person has tried them.

## Human steering during autonomous work

Work autonomously within the authorized milestone while keeping the human able
to redirect it. Feedback is welcome at any point; a visual checkpoint is an
invitation to inspect, not an approval gate. Silence permits continued work within
the existing scope but is not evidence of human approval or learner comprehension.

1. **Keep a reviewable preview available.** Once milestone 2 has a running viewer,
   bind the server to `0.0.0.0`, read its actual port from startup output, and
   publish a URL using `agent-preview-url <port>`. The target is a laptop browser
   on the same home LAN. Check that the helper chose a LAN-reachable address;
   use its `AGENT_PREVIEW_HOST` override when necessary. Never give the human a
   loopback or wildcard-host URL. Verify HTTP access through the LAN address
   and, when access is available, from the laptop itself. A same-host check does
   not prove laptop access; ask for a one-time browser check if necessary and
   record that limitation while continuing independent implementation. Serve
   model assets from the same reachable origin or another verified address.
   Keep the latest successful build available during edits or failed rebuilds.
   Identify it by a build ID and timestamp so an older render is not mistaken for
   current work. A commit hash alone does not identify uncommitted visual changes.
2. **Show meaningful changes.** After the first spatial slice and each coherent
   visible increment, post the preview link, a screenshot from that build, what
   changed, and what remains incomplete. Continue useful work without waiting for
   a response. Do not send a checkpoint for every edit or unchanged render.
3. **Capture the view being discussed.** A development-only review control copies
   a compact view description: build/asset version, illustrative seed, selected
   layer/group/token, camera pose, stack/explosion state, tour time, and viewport.
   Offer selectable text if clipboard access is unavailable. The human can paste
   this here with feedback or attach a screenshot; neither is required to comment.
   No custom chat backend or website-to-agent command channel is needed.
4. **Apply steering promptly.** When feedback arrives, acknowledge the intended
   correction and use the referenced view to locate it. Replan before the next
   dependent edit, and stop or revise affected worker tasks. A tool already running
   may need to reach a safe stopping point; do not promise instantaneous cancellation.
   Preserve useful work. If a material ambiguity remains, ask a focused question
   while continuing only work independent of that answer.
5. **Close the feedback loop.** Make the correction, rerun affected checks, and
   show the corresponding updated view. Record the feedback outcome in progress
   notes and carry accepted visual preferences into subsequent work. Keep raw
   feedback and private screenshots local; sanitize any tracked summary.

Ordinary feedback steers the ongoing task. An explicit **pause work** stops new
implementation actions at the next safe boundary until the human resumes. This
is separate from the viewer's **pause tour**, which controls only its timeline.
The preview is a development service on the agreed LAN, not an Internet
deployment. Keep actual machine addresses, raw feedback, and connection details
in ignored private context. Scope expansion or actions requiring additional
authorization still need that authorization. Do not infer it from a visual preference or from silence.

The human sets aesthetic intent and evaluates whether the explanation feels clear.
The agent supplies alternatives, implements them, and checks readability,
accessibility, architecture, and behavior. If a preferred visual treatment would
misrepresent the model, explain the conflict and propose a faithful alternative.
Human taste feedback and learner testing complement automated checks; neither
replaces the other. Start with the existing chat and preview rather than adding
another coordination system.

## Working loop

1. **Plan.** Apply any new human steering, then choose one milestone increment. State the learning outcome, the relationship conveyed by depth, files/interfaces involved, observable acceptance checks, and known uncertainty. Use high when these decisions are coupled; medium when extending an established pattern. Finish when a worker could implement the task without inventing its interface.
2. **Implement.** Work locally or dispatch a bounded worker using the table. Delegate only alongside useful independent coordinator work; start with at most two workers. Assign exclusive files or isolated worktrees and keep shared contract changes with the coordinator. Finish with a concrete diff and check results.
3. **Verify.** Run the affected structural checks, export/load checks, and relevant browser interaction. Capture fixed camera views with the seed, selected layer/group/token, stack/explosion pose, viewport, and tour time. Include the paired oblique views and face-on reading view when spatial behavior changes. Inspect the images rather than inferring quality from a successful command. Finish with evidence for every acceptance criterion and publish a visual checkpoint when the visible result changed.
4. **Correct or accept.** Identify the observed defect and make one focused correction. If the same criterion still fails, narrow the case and reassess effort or task boundaries. Accept only when checks pass; then return to routine effort for the next bounded increment.
5. **Record.** Update `docs/progress.md` with completed criteria, the latest preview/build ID, feedback addressed or pending, unresolved limitations, next task, and requested/confirmed model and effort where available. Raw logs and private paths stay in `docs-private/`.

A worker brief contains: objective, owned files, required input contracts, non-goals, acceptance checks, and required return evidence. A worker reports changed files, results, artifacts, and unresolved decisions. The coordinator checks the actual output before integration.

## How to control effort

`AGENTS.md` defines when to choose effort; runtime configuration controls what is actually used. Goal text defines the outcome and acceptance criteria. Neither prose nor a goal silently changes the current inference request.

For a new CLI session, use the verified flags with an absolute checkout path supplied by the caller:

```sh
codex -C "$PROJECT_DIR" -c 'model_reasoning_effort="medium"'
```

Use `high` for a session devoted to design contracts or difficult verification. In the app, use the available model/effort control. A coordinator can select supported settings for newly dispatched workers; it must not claim to change its own current effort without an exposed control and confirmation. When automatic switching is unavailable, retain the configured model at a supported effort meeting the project minimum and continue the bounded workflow.

For this session's collaboration interface, explicit overrides use `model` and `reasoning_effort`, with `fork_turns="none"` and a self-contained brief. A full-history fork inherits the parent's settings. Other clients may expose different fields; inspect their tool schema.

The checked-in `.codex/config.toml` sets the coordinator model and worker defaults. Keep concrete model IDs there. Project instructions require matching model choices at dispatch and select effort per task; custom agent files must not introduce conflicting model pins. Model upgrades should update both configured role defaults together. No machine-wide model defaults are changed by this project configuration. [Codex model and worker configuration](https://learn.chatgpt.com/docs/agent-configuration/subagents)

## API effort changes and caching

An optional future API controller can append this input item before a user message while keeping request-level `reasoning.effort` fixed:

```json
{"type":"configuration_update","reasoning":{"effort":"high"}}
```

Updates apply until replaced. This mechanism is limited to Astra in standard, single-agent mode. Preserve updates in conversation history; adjacent updates are rejected. Automatic compaction/truncation and the standalone compaction endpoint are incompatible with these histories. Explicit `compaction_trigger` has a separate supported path requiring a fresh effort update afterward. Response metadata still reports request-level effort. [Reasoning update contract](https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation)

Preserving a prefix does not guarantee a cache hit or eliminate reasoning cost. Track cache reads/writes, output tokens, retries, and elapsed time. Do not assume shared cache across worker sessions or model switches. Keep API single-agent switching separate from Codex delegation; compatibility in one does not establish compatibility in the other.

## Evaluate the policy during useful work

For the first three representative increments—metadata export, deterministic seeking, and a visual adjustment—record requested/confirmed model and effort, elapsed time, retries, passed criteria, and token usage when exposed. Mark unavailable values as unknown. Compare total effort to accepted output, including coordinator review and integration. Treat this small sample as operational evidence, not a controlled benchmark. Revisit defaults if routine workers repeatedly need repair or delegation takes longer than local work.

No Blender-specific effort optimum was established by the reviewed official sources. The supplied benchmark percentages, claims about internal spatial verification, and assertions that max effort causes dense meshes or freezes are not adopted as project facts. Polygon counts and timeouts belong in explicit build constraints and measurements.

## Reusable implementation goal

> Complete milestones 1–5 in docs/project-plan.md: a reproducible Blender Python → GLB → interactive browser tutorial. Use project-configured models, follow the skill boundaries and human steering protocol, and deliver the LAN-accessible spatial preview by milestone 2. Continue through the complete tour, computational explanations, accessibility, and measured performance. Verify each increment, keep the latest successful preview available, and record evidence and remaining limitations in docs/progress.md. Human feedback may redirect work at any point; explicit pause-work requests stop implementation. Do not claim learner validation or laptop access without evidence. Do not substitute a static diagram, video, or placeholder for the navigable 3D exhibit.

Set a token or time budget only when the user supplies one. This document supplies goal wording; it does not start an unattended run.
