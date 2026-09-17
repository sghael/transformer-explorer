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


## Review corrections and final delivery checks

PR #2 contains the implementation. The first independent review requested fixes for hidden meshes intercepting clicks, pause-dependent computation, and semantic component navigation. These are corrected: the event filter rejects intersections with invisible ancestors; cache state and router vector progress derive from absolute tour time; component IDs select their own explanation while preserving valid layer/group/expert identity. Browser verification caught and corrected the exported non-layer sentinel before publication of the verified build.

Copied contexts now include decode mode, rendering quality, playback speed and matrix-return origin. Restore validates these values; Reset restores their defaults. The new review-checks.mjs suite passes all 12 groups on build **20260917T184553Z-ce44d1**, including actual projected mesh clicks, ninth-row retention while paused, actual router vector transforms, copied decode restoration and Reset. Its report and inspected cache/router captures are in artifacts/review-browser/. Formatting and numerical checks pass. Clean generation and compilation took 3.496 seconds; the GLB hash and structural counts are unchanged.

The LAN preview runs as a supervised user service, independent of the launching tool session. The implementation worktree and successful release are retained. Learner comprehension and hardware-client performance remain unmeasured. Free-orbit poses can overlap anchored labels, and the long K/V captions have a minor overlap in the cache pose; numerical content remains available in the readable side panel. These visual limitations are recorded rather than treated as learner validation.

The review runtime confirmed the project-configured model at high effort. Re-review follows the same wrapper, which selects effort by review round. Final repository review/landing remains pending at this record's commit; the PR records the authoritative outcome.

The full 16-group browser suite also passed on build 20260917T184553Z-ce44d1, with 26 captures and no runtime/console/HTTP errors. Before the next review, human steering requested orthogonal router connectors; that visual correction is being batched into delivery.

## Human-directed depth and visual refinement

The human requested orthogonal routing, removal of dangling cache links, a clearer causal-attention fan, softer shapes, contextual camera navigation, explicit dimensions, visible information flow and operation-to-scalar inspection. These requests were implemented together before re-review.

- Router paths use axis-aligned segments attached to the generated component faces; moving vectors follow their elbows by distance. Cache links require both endpoints to be visible. Attention shows a labeled query, numbered key positions with illustrative weights, and unconnected future positions.
- Blender generates modest beveled operation shells and open normalization frames while retaining thin weight sheets. All 315 semantic nodes, outer bounds and coordinate checks remain valid; the asset now has 43 shared meshes and 4,900 triangles.
- Manual navigation passes through a wider layer/model context. Rapid interrupted navigation preserves the intended destination, and reduced motion skips the detour.
- Each view explains mathematical dimensions and schematic geometry. A separate 12-second flow cycle shows token points, sampled vector bundles, tensor grids, two-expert transformations, retained K/V reads, new K/V appends and the autoregressive token return. Play/pause/step controls are independent of the guided tour.
- RMSNorm is the first complete model → layer → operation → vector → scalar inspection. An eight-channel teaching example exposes squared inputs, mean square, stability constant, denominator, learned scaling and selected-channel output. Real model width is identified separately as 4,096. Illustrative learned scales stay fixed across tokens; this is not real inference.

Verified build **20260917T190430Z-e13ddc** passed all nine deep-browser checks, including independent DOM arithmetic for channels 1, 4 and 8 and the rapid-navigation regression. Build **20260917T190016Z-f1bb21** passed all 16 full-browser groups and 15 review-regression groups; unaffected behavior is retained across the final caption-only change. Eight original data tests and four RMSNorm tests pass. Actual layer/router/attention/cache/flow/RMSNorm and wide-context captures were inspected. Reports: artifacts/browser/, artifacts/review-browser/, artifacts/deep-browser/.

Latest successful build: **20260917T190735Z-22f70e**, asset **transformer-ff74c38b729a.glb**, **190,016 bytes**, clean build **3.608 seconds**. Final flow captions sit in a fixed canvas caption to avoid covering world labels. The supervised LAN preview remains available; human laptop access is confirmed. Both paused-view and active-flow software-rendering evidence is in performance.md. Human learning assessment and target-laptop hardware performance remain unperformed, explicitly documented limitations. Free orbit can still produce label occlusion; fixed views have been inspected.

All five milestone implementation loops are complete with those evidence limitations. The remaining delivery step is approval and landing of PR #2 through the repository review workflow. The PR is the authoritative final review/merge record. Requested/accepted worker settings remained project-configured model at medium effort; worker runtime effort/token accounting is unavailable. No private operating details or screenshots are tracked.

Final exact-build verification: all nine deep-browser groups pass on 20260917T190735Z-22f70e, with 16 captures and no browser errors. The return-flow canvas crop was inspected and its caption no longer overlaps labels or the moving token. Both staged privacy scans pass. The complete numerical and formatting checks remain green.

## Follow-up: continuous navigation

Human feedback identified a jump during contextual zoom-in despite the prior endpoint tests passing. A new frame-sampled browser regression reproduced the exact discontinuity on build 20260917T190735Z-22f70e: all three tested routes removed a surrounding landmark within one frame of inward travel, and the matrix destination was briefly absent. Inward travel lasted about 433 ms. Baseline traces, screenshots and video are retained under ignored artifacts/navigation-browser/.

The correction blends scene visibility and local transforms instead of replacing the scene at the start of zoom-in. Destination detail appears while the camera is still wide. Surrounding landmarks remain opaque through the first 35% of the approach, then fade progressively. Camera travel uses a smooth easing curve, interpolated viewing direction and logarithmic viewing distance. Timing is 0.85 seconds outward, 0.35 seconds of context and 1.25 seconds inward. Reduced motion still moves directly to the destination. Interrupted navigation captures the current rendered scene and retains the intended saved camera destination.

Build **20260917T193951Z-7bd2fd** passes all ten navigation checks, all nine deep-interaction checks and all fifteen review regressions. Actual inward travel measured about 1,233 ms; contextual landmark opacity remained 1 during its first 300 ms. The incoming object stayed visible throughout. The recorded matrix-transition frame sequence was inspected and shows a continuous approach with progressive context fading. Existing browser harnesses now wait for settled navigation and actual camera convergence rather than a fixed delay. Full-suite verification and PR review follow before delivery. The unchanged GLB remains 190,016 bytes; clean regeneration and compilation took 3.64 seconds.

Prevention: endpoint screenshots cannot establish animation continuity. The new regression checks visibility/opacity, incoming identity and camera state on animation frames, preserving the formerly failing baseline.

The full suite then caught an orbit-control regression when the contextual view and destination were the same. Explicit control re-enabling now runs at arrival, seek and restore; cancellation also reapplies the complete destination layout even when the presentation state does not change. Build **20260917T194522Z-47c2bb** contains that correction (3.624-second clean build). The real orbit-drag check now passes. Additional navigation tests cover seeking during the wide context and during a partial fade, Reset during travel, and orbit after arrival.

Final verification on 20260917T194522Z-47c2bb: all 16 full-browser groups and all 14 navigation checks pass, including actual orbit drags, same-presentation seeking during partial opacity, Reset, complete opacity restoration and hidden-detail cleanup. Cancellation screenshots were inspected. Numerical tests and formatting pass; both staged privacy scans pass. This follow-up is ready for repository review with the current successful preview retained.

## Follow-up: stable layer expansion before approach

Further human feedback identified the move into **Inside a layer** as still disjoint. The earlier opacity and camera-duration checks were insufficient. Independent browser sampling of the actual renderer reproduced two failing checks on build 20260917T203152Z-ec4c5a: during inward travel the stack moved about 11 world units and shrank from scale 1 to 0.3, while the destination shifted about 10 screen pixels. Rendered camera values exactly matched the existing diagnostics; no camera reset was observed. The baseline is preserved in ignored artifacts/continuity-browser/layer-baseline-report.json.

Manual navigation now separates withdrawal, layout expansion, aiming and inward travel. The camera withdraws for 0.7 seconds; the scene expands for 1 second with the camera stationary; the camera aims at the destination for 0.7 seconds; then it moves straight toward that fixed destination for 1.3 seconds. Geometry, visible opacity and destination annotations are settled before aiming. The inward move keeps its target and heading fixed, and arrival does not replace the visible presentation. Reduced motion and tour seeking retain their direct-navigation behavior.

When entering the layer from the model, the expanded representation grows from the selected slice during the wide stage. The miniature stack remains visible beside the layer, connected by an orthogonal dashed line. The explanation identifies this as a magnification relationship. Browser inspection caught an occluded source stack; moving it forward and downward made the selected slice and its label readable without covering RMSNorm.

Latest successful build: **20260917T203838Z-f3dee3**, clean regeneration and compilation **3.684 seconds**. The Blender-generated GLB is unchanged: **transformer-ff74c38b729a.glb**, **190,016 bytes**. The supervised preview remains available at the privately recorded address. Work continues in the preserved implementation worktree on a branch from the merged navigation PR.

All 16 full-browser groups passed on build 20260917T203344Z-070a15. The subsequent stack-placement correction passed all 10 focused continuity checks on 20260917T203557Z-8e2fa2: actual stack/focus transforms remain fixed, the destination stays centered within numerical precision, and the layer labels and connector remain present through arrival. The final build also removes an unused fade branch, types the line reference, and clarifies the dashed-line caption. The 12 numerical tests pass. Final navigation/cancellation checks and repository review follow before landing.

Evidence is in artifacts/continuity-browser/, artifacts/navigation-browser/ and artifacts/browser/. Wide, aiming, late-approach and arrival captures have been inspected. Labels crowd together at the wide aiming distance and separate during approach; arbitrary orbit can still overlap labels. Frame-sampled geometry and camera evidence establishes the corrected motion contract, but the human has not yet confirmed that this revision feels continuous. Learner comprehension and target-laptop hardware performance remain unmeasured.

Final-build verification: **13 continuity checks, 26 navigation checks and 9 deep-interaction checks pass** on 20260917T203838Z-f3dee3. The navigation suite covers four routes, stationary wide expansion, fixed rendered geometry/opacity through arrival, centered straight approaches, seeking during expansion and inward travel, Reset and orbit after arrival. Inward travel measured about 1,283 ms. The deep suite covers rapid interruption, reduced motion and operation/flow behavior. No browser errors were recorded. Final layer captures and the motion contact sheet were inspected. Formatting and both full-history privacy scans pass; staged scans run through the preserved commit hook. The next step is exact-head PR review and landing, with the preview retained.


## Follow-up: persistent computation graph and spatial flight

Human feedback accepted the improved aiming motion but rejected the remaining cross-fade. Further steering requested a persistent destination when entering Attention group, interconnects on fewer planes, an attached output/generation graph, meaningful shape categories, and an information design informed by Tufte.

The first bounded step reproduced the old behavior using the actual renderer: baseline build 20260917T203838Z-f3dee3 failed 19 of 35 flight checks. Scene transforms, opacity and visibility changed during navigation, and direct layer-to-group and group-to-matrix moves unnecessarily withdrew. Raw traces and video remain in ignored docs-private/flight-baseline. The implementation branch starts from the merged prior fix and preserves the supervised preview.

The new scene keeps the selected layer inside its stack frame and all eight expert interiors inside their shells. Navigation moves only the camera; structural meshes remain opaque, present and fixed. Direct descendants no longer force a wide detour. Sibling navigation uses the common parent. The Blender generator now connects the macro stages and layer interfaces at their actual ports, uses solid nodes for operations and open outlines for subgraph containers, and puts the principal graph trunks and residual/expert routes on Y=0. Q/K-only RoPE and cached-key writes after RoPE are explicit. Retained K/V reads and expert port connections close previously floating branches. The browser renders expert input/output routes as separate segments, preventing a false bypass through each shell.

Browser inspection found that original frame and inter-layer wire thicknesses obstructed the much smaller interior scale. Those dimensions were reduced without changing the enclosing bounds. Camera corridors and compact cache panels were then adjusted to make actual selected surfaces visible, with annotations derived from their exported geometry. Unattached attention/RoPE demonstration marks were replaced by inline graph operations; the numerical comparison remains in the panel. The attention score display explicitly identifies the one illustrated head within a four-head batch.

The HTML attention/router panels now combine exact values with directly adjacent bars on a shared 0–1 scale. Future keys are masked explicitly; router probability and normalized selected-expert weight remain distinct. Desktop and narrow-screen data panels were inspected, with no horizontal overflow. The visual-language and architecture documents record the new conventions and primary Tufte references.

Current verification checkpoint: build **20260917T220905Z-92e54b**, asset **transformer-81d7ce05ce79.glb**, **512,244 bytes**, clean generation/validation/compilation **3.865 seconds**. Earlier persistent-world builds pass the flight invariants, all 16 full-browser groups, all 9 deep groups and all 16 review groups. Final framing, packet-path changes and expanded graph are undergoing exact-build browser inspection before review. Structural export checks verify source/target faces, planar trunks, expert containment, metadata and coordinate conversion. Human acceptance of this revision, learner comprehension and target-laptop hardware performance remain unperformed.


Final persistent-graph verification: build **20260917T222503Z-b5f1bf**, unchanged asset **transformer-81d7ce05ce79.glb**, **512,244 bytes**, clean generation/validation/compilation **4.619 seconds**. Desktop flight captures pass all **59** checks on 20260917T221803Z-f31466. Subsequent focused checks on 20260917T222114Z-777233 verify readable narrow attention labels and camera/focus translation with changed stack spacing. All **16** full-browser groups and **10** deep-interaction groups pass on that build, including actual layer-frame picking, all 32 selections, cache read/append, nested expert packets, reduced motion and active flow. The **7** cancellation/orbit checks passed on the preceding persistent-world build; their state machine is unchanged. The **12** numerical tests and formatting pass. The final HTML-only caption relocation is receiving a focused browser smoke check.

Visual corrections were based on inspected failures: an attention camera beyond a neighboring group caused foreground obstruction; the final eye sits inside the selected depth corridor and looks obliquely across the graph. Narrow labels are compact, with full explanations in the panel. Overview layer picking uses the enclosing frame footprint while detailed picking uses actual mesh surfaces. A DOM portal returned from the scene renderer caused a real flow-start crash; moving the flow description to ordinary HTML beside the controls fixes that crash and avoids overlap with cache labels. Removed attention-fan diagnostic traces are no longer tested as if they were rendered; the revised check reads actual visible numerical rows and SVG marks.

The final captures in artifacts/flight-browser/, artifacts/browser/ and artifacts/deep-browser/ were inspected. The old morph-specific continuity harness is replaced by persistent-world flight checks; cancellation/restore/orbit regressions remain in navigation-checks.mjs. The architecture, visual-language and plan documents incorporate the human's persistent-scene direction.

Performance now reflects the larger persistent graph. Paused views sampled about 16.7 ms median frames, but active overview flow sampled 33.3 ms median and 83.4 ms p95 in software rendering. This is a recorded exception to the 60 fps target; see performance.md. Human acceptance of perceived immersion, learner comprehension and target-laptop hardware performance remain unperformed. Free orbit can still produce occlusion and label overlap.

Both full-history privacy scans pass; staged scans run through the preserved pre-commit hook. The private operating context and generated/raw evidence remain ignored. Requested worker model/effort was project-configured Astra at medium; dispatch confirmed those settings. Final PR review uses the same configured model at high effort. Review and landing follow on the stable pushed head; the PR records their authoritative outcome.

The final 20260917T222503Z-b5f1bf build passes all **16 review-browser groups**, including foreground semantic picks and actual attention DOM/SVG masking for first, middle and last tokens. Focused flow-description checks verify all five phase captions and cache growth from eight to nine rows. Actual mouse-wheel semantic zoom passes overview → layer → attention → layer → overview while retaining layer/group/token identity. Final formatting passes.
