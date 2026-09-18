# Transformer Explorer agent instructions

## Read before implementation

Read `AGENT_PROMPT.txt` for the current assignment, `docs/project-plan.md` for milestone acceptance criteria, and `README.md` for the exhibit's technical and educational requirements. Read `docs/agent-workflow.md` before choosing reasoning effort, delegating, escalating a failed task, or setting an implementation goal. The prompt in `docs/archive/` is historical material, not current instructions.

## Fresh launch and skill boundaries

For a fresh task, use the startup, skill boundaries, and human steering protocol in `docs/agent-workflow.md`; inspect `docs/progress.md` if present. The full goal covers all five milestones, with a LAN-accessible preview by milestone 2. Do not use `impeccable` for Transformer pedagogy, scene architecture, Blender geometry, or initial planning; reserve it for later scoped web-interface refinement. Skills must not restart discovery, add redundant approval gates, or replace the required Blender Python → GLB → live browser pipeline. Human feedback can redirect work throughout the run.

## Model defaults and overrides

Read `.codex/config.toml` for model and effort defaults. Honor the user's explicit model and effort selection for the task, including a selection made in the app. These defaults impose no model or reasoning-effort floor. Routine check-ins and mechanical work may use a lighter model. Follow `docs/agent-workflow.md` for task-based guidance and supported worker dispatch. Keep concrete default model IDs in configuration.

## Execution

Use the plan → bounded implementation → automated checks → visual inspection → acceptance loop in `docs/agent-workflow.md`. Keep the coordinator responsible for architecture, integration, and acceptance. Delegate an independent, bounded implementation or inspection task when it lets the coordinator make useful progress concurrently; use at most two workers initially and give each exclusive file ownership. Keep sequential or trivial work local.

Choose model and effort through supported runtime controls. A sentence in this file cannot change the current model's reasoning configuration. Follow the routing table and existing user preferences; report requested versus confirmed settings accurately. If a setting or delegation capability is unavailable, state the limitation and distinguish the requested settings from those actually available.

## Evidence

A milestone is complete only when its acceptance checks pass and its relevant browser views have been inspected. Record commands, outcomes, artifact locations, remaining defects, and the next bounded task in `docs/progress.md` when implementation starts. Mark unperformed checks explicitly. Use the same learning and correctness criteria at every effort level.

Generate assets from versioned Python and JSON. Keep scene generation, metadata/export validation, and browser timeline state separate. Rebuild from a clean scene at milestone boundaries. Use structured scene reports plus screenshots to verify transforms, visibility, semantic identity, and visual clarity.

## Private context

Keep personal paths, machine details, private links, and raw session logs in ignored `docs-private/`. Read private context only when required for local operation; transfer only sanitized facts into tracked documents. Review public text and run both configured Gitleaks scans before publication. Preserve the pre-commit hook, including its rejection of force-added private documentation.
