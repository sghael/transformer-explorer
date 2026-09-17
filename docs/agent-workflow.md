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

## Working loop

1. **Plan.** Choose one milestone increment. State the learning outcome, the relationship conveyed by depth, files/interfaces involved, observable acceptance checks, and known uncertainty. Use high when these decisions are coupled; medium when extending an established pattern. Finish when a worker could implement the task without inventing its interface.
2. **Implement.** Work locally or dispatch a bounded worker using the table. Delegate only alongside useful independent coordinator work; start with at most two workers. Assign exclusive files or isolated worktrees and keep shared contract changes with the coordinator. Finish with a concrete diff and check results.
3. **Verify.** Run the affected structural checks, export/load checks, and relevant browser interaction. Capture fixed camera views with the seed, selected layer/group/token, stack/explosion pose, viewport, and tour time. Include the paired oblique views and face-on reading view when spatial behavior changes. Inspect the images rather than inferring quality from a successful command. Finish with evidence for every acceptance criterion.
4. **Correct or accept.** Identify the observed defect and make one focused correction. If the same criterion still fails, narrow the case and reassess effort or task boundaries. Accept only when checks pass; then return to routine effort for the next bounded increment.
5. **Record.** Update `docs/progress.md` with completed criteria, unresolved limitations, next task, and requested/confirmed model and effort where available. Raw logs and private paths stay in `docs-private/`.

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

> Complete milestones 1 and 2 in docs/project-plan.md. Use the project-configured model for the coordinator and all workers, with low effort as the minimum; use the routing table for bounded workers, and verify each increment with structural checks and browser inspection. Record evidence and unresolved limitations in docs/progress.md. Finish with a reproducible build and usable 3D preview meeting the spatial contract: all 32 layers selectable, adjustable stack spacing, one expanded layer and GQA group, linked matrix reading, and a verified return to overview. Include paired camera views and interaction evidence; a successful export or flat diagram is insufficient. Stay within these milestones unless I expand the goal.

Set a token or time budget only when the user supplies one. This document supplies goal wording; it does not start an unattended run.
