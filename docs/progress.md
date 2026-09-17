# Implementation progress

## Startup

Implementation starts from merged PR #1, main revision da53140. No prior implementation or progress record exists. Original checkout changes are preserved in place; work proceeds on an isolated implementation branch.

The five-milestone goal is active. Startup brief, plan, storyboard, model specification and private operating context have been read. Configured model: gpt-6-astra; requested coordinator design effort: high. The harness exposes no coordinator effort switch or confirmed effort metadata, so no switch is claimed. Worker dispatch will explicitly request the configured model and effort. Token accounting for individual increments is unavailable.

First bounded increment: settle the versioned scene/coordinate contract, generate the clean Blender asset and validate its metadata while implementing the viewer against that contract. Milestone acceptance is pending. No browser or learner checks have been performed yet.

## First implementation checkpoint

Design contracts now exist in architecture.md and visual-language.md; chapter data maps the 80-second storyboard to explicit objectives, anchors, poses and acceptance checks. Tool versions verified: Blender 4.5.13 LTS, Python 3.12.13, Node 24.14.1, npm 11.11.0, Chromium 140.0.7339.186. Dependencies are pinned with a lockfile; dependency audit reports zero vulnerabilities after updating Vite to 7.3.6.

The clean Blender generator and GLB validator pass: 315 nodes, 43 shared meshes, 2,712 triangles, 122,860 asset bytes. All exported world positions/bounds and semantic extras match the scene report; asymmetric coordinate marker and all 10 camera anchors pass. Geometry includes all 32 layer slices, 32 Q heads across eight K/V groups, eight experts and two residual bypasses. Reports: artifacts/scene-report.json and artifacts/export-validation.json.

Seven numerical tests pass for architectural counts, causal normalization, routing, cache append identity, Q/K-only RoPE, deterministic samples and 80-second chapter boundaries. These tests validate illustrative data, not model inference.

First production build 20260917T180641Z-cf5ca4 is served from an immutable release selected by an atomic preview symlink. The server binds to all interfaces; HTML and GLB both return HTTP 200 through the LAN interface. Laptop access remains unverified: the attempted SSH hostname did not resolve. A one-time human browser check has been requested without stopping implementation. Private addresses remain outside this file.

Chromium loaded the exported asset without JavaScript errors. Initial overview, selected-layer and attention screenshots are in artifacts/browser/. Visual inspection identified missing anchored labels and an attention frame that includes too much neighboring geometry. Correction is in progress; milestone 2 is not yet accepted. Automated interaction coverage, two-angle depth proof, narrow-screen and context-restoration checks remain pending. Learner comprehension and the human feedback cycle remain untested.

Generator and numerical-data workers explicitly requested gpt-6-astra at medium effort; dispatch accepted these settings. Internal runtime effort confirmation and token usage are unavailable. Generator correction: one shared-V bus connection added before validation. Numerical tests passed on their first run. Next increment: anchored labels, tighter component views, spatial numerical overlays, deterministic state integration, and browser interaction acceptance.

## Spatial and computation integration

Build 20260917T181629Z-0cfffc adds anchored semantic labels, isolated attention/cache/expert inspection, a sample heatmap on the exported attention-score sheet, a face-on matrix camera, layer extraction, selected expert routes and a deterministic token path. Manual view changes retain camera poses; timeline seeks reset to repeatable chapter poses. Eight-channel toy SwiGLU output data now verifies weighted output combination and residual addition separately from real model inference.

Actual browser checks pass loaded coordinate/dimension/anchor/count validation, all 32 selections, projected mesh picking, changed spacing transforms, orbit, forward/backward deterministic seeking, cache retention/append and runtime/HTTP error checks. The first harness lacked bounded logging; it was stopped after prolonged timeouts. The instrumented retry identified exact label-selector mismatches for selects, now corrected with explicit accessible names. Context restoration was sampled before camera convergence; the transition is now shorter while retaining smooth motion. Full retry remains pending; milestone acceptance is not yet claimed.

Visual inspection covers overview, expanded layer, attention, cache, router, expert, output, generation and matrix. Corrections include larger layer framing, staggered labels, explicit matrix/cache axes and larger matrix digits. Remaining correction at this point: cache/expert label collisions, rear expert label readability, and visible chosen-token/cache evidence during generation.

A deliberately failed Blender invocation leaves the successful preview pointer and its HTML/GLB unchanged. Both configured full-history Gitleaks scans pass on the starting history; staged new source still needs its hook checks before commit.

Initial diagnostic performance: Chromium 140 headless, ANGLE SwiftShader software rendering, 1440×1100 viewport, DPR 1. Across compact, spaced, layer and attention views, 59 measured frame intervals per view had median 16.7 ms and p95 16.7–16.8 ms. Draw calls: 41 / 41 / 189 / 35; triangles: 608 / 608 / 2408 / 348. One 768×768 RGBA heatmap texture is present (approximately 3 MiB with mipmaps; GPU allocation bytes are not directly exposed). These measurements are software-browser diagnostics, not a representative laptop hardware benchmark. Hardware-client performance and learner comprehension remain unverified.

## Human steering: preview access

The human reported a connection timeout from the laptop. Host firewall logs confirmed that incoming preview connections were dropped despite the server listening correctly. A rule limited to the preview TCP port, authorized LAN subnet and LAN interface was added. Unrelated firewall rules remain unchanged. The human was asked to refresh the same address; post-fix laptop confirmation remains pending. Direct laptop SSH verification was unavailable because its SSH port refused connections. Raw addresses, logs and rule details are recorded only in ignored private context.

Prevention: validate the inbound firewall path as well as the listener before describing a preview as remotely reachable. Same-host HTTP success remains useful asset evidence but cannot establish laptop access.

The human subsequently confirmed that the model loads on the laptop after the firewall correction. Laptop access is now verified by the human. This is access evidence, not a frame-rate benchmark or learner-comprehension result.

Build 20260917T182327Z-8256bd passes all 15 browser acceptance groups. The playback speed defect was corrected by capturing each elapsed frame interval before the React state updater executes. All loaded-asset, selection, round-trip, orbit, keyboard, timeline, context, cache, narrow/reduced-motion and error checks pass. Final cosmetic cache-row/matrix-label changes and expanded transition evidence are being checked before publication.

## Implementation acceptance

Latest successful build: **20260917T183052Z-d539b4**. Asset: **transformer-c4b0b153ce33.glb**, 122,860 bytes. Clean regeneration, validation and production compilation took **3.486 seconds**. Build metadata is in artifacts/build-report.json. The preview remains available at the privately recorded LAN address, and the human confirmed laptop access.

| Milestone | Evidence and disposition |
| --- | --- |
| 1 — Design contracts | Accepted: architecture, original spatial wireframes, versioned metadata/coordinates and 80-second chapter requirements exist. Generator and viewer were implemented independently against them. |
| 2 — Blender-to-browser slice | Accepted: clean GLB generation, actual loader coordinate checks, all 32 selections, single expansion, mesh picking, spacing transforms, two oblique views, layer/group/matrix round trips, preview continuity and context restoration pass. Laptop access was confirmed after correcting the host firewall. |
| 3 — Computational explanation | Accepted: eight numerical test cases cover causal attention, grouped heads, Q/K-only RoPE, retained per-layer K/V, top-two normalized routing, independent toy expert outputs and residual addition. Actual spatial attention, cache, router, expert, output and generation views were inspected. |
| 4 — Teaching and interaction | Accepted: 80-second chapters, deterministic seeking, corrected speed clock, paused orbit, resume, keyboard controls, reduced motion and narrow layouts pass. Actual moving-camera transition captures were inspected. A separate wheel-driven semantic-zoom test passes overview → layer → attention → layer → overview without losing identity. |
| 5 — Delivery and performance | Implementation checks pass with documented client-measurement exceptions: production regeneration, static serving, formatter, numerical tests and privacy hooks pass. Software-browser performance is recorded in performance.md. Repository publication/review is the remaining workflow step. |

Browser evidence: **16 acceptance groups passed** on build 20260917T182656Z-296029. The final semantic-zoom increment passed its focused wheel-interaction and router/matrix checks on the latest build. All unaffected checks are retained rather than rerun after formatting. Captures/report: artifacts/browser/report.json, semantic-report.json, final-router.png, final-matrix.png, chapter-* and moving-transition-* images. Browser runtime, console and HTTP error checks passed.

The human's timeout report produced a verified firewall correction and a successful laptop retest. Learner-comprehension questions have not been administered. Target-laptop hardware performance has not been measured; software-browser frame timing and estimated texture bytes are clearly labeled. These human/device-dependent checks remain open and are not represented as tested.

Privacy: private operating context, machine paths, network addresses, raw logs and the project-model review-wrapper copy remain ignored. Both staged privacy scans and both starting-history scans pass. The original checkout remains clean and on its original branch; all implementation changes are isolated.
