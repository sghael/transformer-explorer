# Transformer Explorer agent instructions

## Read before implementation

Read `AGENT_PROMPT.txt` for the current assignment, `docs/project-plan.md` for milestone acceptance criteria, and `README.md` for the exhibit's technical and educational requirements. Read `docs/agent-workflow.md` before choosing reasoning effort, delegating, escalating a failed task, or setting an implementation goal. The prompt in `docs/archive/` is historical material, not current instructions.

## Model requirement

Read `.codex/config.toml` for the current model selection. Use the project-configured model for the coordinator and every worker; low/Light reasoning effort is the minimum. Choose effort according to `docs/agent-workflow.md`. Project configuration takes precedence over generic cheaper-worker defaults. Set the configured model and chosen effort explicitly at dispatch. If workers cannot use it, keep work with a coordinator using that model; otherwise report the limitation and request direction before substituting. Keep concrete model IDs in configuration, not in these instructions.

## Execution

Use the plan → bounded implementation → automated checks → visual inspection → acceptance loop in `docs/agent-workflow.md`. Keep the coordinator responsible for architecture, integration, and acceptance. Delegate an independent, bounded implementation or inspection task when it lets the coordinator make useful progress concurrently; use at most two workers initially and give each exclusive file ownership. Keep sequential or trivial work local.

Choose model and effort through supported runtime controls. A sentence in this file cannot change the current model's reasoning configuration. Follow the routing table and existing user preferences; report requested versus confirmed settings accurately. If a setting or delegation capability is unavailable, follow the model requirement above and state the limitation.

## Evidence

A milestone is complete only when its acceptance checks pass and its relevant browser views have been inspected. Record commands, outcomes, artifact locations, remaining defects, and the next bounded task in `docs/progress.md` when implementation starts. Mark unperformed checks explicitly. Use the same learning and correctness criteria at every effort level.

Generate assets from versioned Python and JSON. Keep scene generation, metadata/export validation, and browser timeline state separate. Rebuild from a clean scene at milestone boundaries. Use structured scene reports plus screenshots to verify transforms, visibility, semantic identity, and visual clarity.

## Private context

Keep personal paths, machine details, private links, and raw session logs in ignored `docs-private/`. Read private context only when required for local operation; transfer only sanitized facts into tracked documents. Review public text and run both configured Gitleaks scans before publication. Preserve the pre-commit hook, including its rejection of force-added private documentation.
