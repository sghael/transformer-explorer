# Performance evidence

Measured persistent-graph build: **20260917T222114Z-777233**. These are Chromium headless ANGLE SwiftShader software-rendering diagnostics, not a benchmark on the viewing laptop. Later builds relocate the flow description, separate flow from annotation visibility, and improve narrow router framing. The exported graph is unchanged; the table reports the measured build rather than claiming a new hardware benchmark.

Viewport: 1440 × 1100; device pixel ratio: 1; Chromium 140.0.7339.186. Each view sampled 59 frame intervals after warm-up. Other acceptance browsers ran on the same host during this verification campaign, so these measurements are not a controlled hardware benchmark.

| View | Draw calls | Triangles | Median frame | p95 frame |
| --- | ---: | ---: | ---: | ---: |
| compact | 854 | 21,384 | 16.7 ms | 16.8 ms |
| spaced | 854 | 21,384 | 16.7 ms | 16.8 ms |
| layer | 788 | 18,768 | 16.7 ms | 16.7 ms |
| attention | 366 | 8,080 | 16.7 ms | 16.8 ms |
| active overview flow | 879 | 23,218 | 33.3 ms | 83.4 ms |

The complete GLB contains **21,196 triangles across 96 shared meshes**, **1,183 semantic nodes**, and **512,244 bytes**, below the 10 MB target. Renderer counts also include annotations and flow packets. Keeping every group and expert interior present increases draw calls substantially over the earlier scene-switching implementation. Mesh data is shared; these objects are not GPU-instanced.

One 768 × 768 RGBA heatmap texture is allocated. Its pixel data plus mipmaps is approximately 3 MiB; actual driver allocation bytes are not exposed by the browser. Renderer counters and frame measurements are saved in ignored artifacts/browser/report.json and artifacts/deep-browser/report.json.

Paused software-rendered views meet the approximate 60 fps target in this sample. Active overview flow averaged **37.286 ms** per interval, so the 60 fps target is **not met in that software-rendered case**. Previous nonpersistent builds measured roughly 17 ms during active flow. These runs do not isolate GPU cost, browser scheduling or concurrent host load; they establish a performance limitation rather than a causal benchmark. Reduced pixel density remains available without removing selections or detail views. Batching graph connections is a possible follow-up if client profiling confirms submission cost as a bottleneck.

Representative laptop hardware frame time, thermal behavior, battery usage and exact GPU texture allocation remain unmeasured. The human confirmed that the model loads on the laptop. Smoothness, performance and learning effectiveness must not be inferred from that connectivity check.

Reproduce with PREVIEW_URL set to the running development preview, then run node web/browser-checks.mjs and node web/deep-checks.mjs. The frame-sampled flights are recorded separately by node web/flight-checks.mjs. For hardware evidence, run the same interactions and capture performance on the target browser.


## Directional layout follow-up

The directional-layout full-browser run on **20260917T235010Z-4ef01d** measured the following paused views in Full context, with the same software renderer, viewport, pixel ratio and 59-interval sampling described above. The later 235150 build changes only desktop embedding-label placement.

| View | Draw calls | Triangles | Median frame | p95 frame |
| --- | ---: | ---: | ---: | ---: |
| compact | 849 | 24,084 | 16.7 ms | 16.8 ms |
| spaced | 849 | 24,084 | 16.7 ms | 16.7 ms |
| layer | 747 | 18,756 | 16.7 ms | 16.7 ms |
| attention | 352 | 8,920 | 16.7 ms | 16.8 ms |

Active overview flow was measured on the earlier directional build **20260917T234138Z-2e3894**, before the screen-width overview contours were added: **872 draw calls**, **23,242 triangles**, **16.8 ms median**, **66.6 ms p95**, and **30.507 ms mean**. This remains a recorded failure to sustain 60 fps under software rendering. It is not a measurement of the later contour rendering or of the target laptop. No controlled before/after performance improvement is claimed.

The current GLB has **21,220 triangles**, **91 shared meshes**, **1,175 nodes**, and **502,836 bytes**. Full, muted and isolated context preserve world transforms; isolation suppresses rendering of outside meshes. Its hardware performance effect has not been benchmarked.

## Representative-layer layout

Build **20260918T001857Z-249d93** replaces the 32 overview frames with one representative frame. Paused Full-context measurements used the same 1440 × 1100 software-rendering setup and 59-interval sampling:

| View | Draw calls | Triangles | Median frame | p95 frame |
| --- | ---: | ---: | ---: | ---: |
| overview | 755 | 16,272 | 16.7 ms | 16.8 ms |
| layer | 744 | 15,864 | 16.7 ms | 16.7 ms |
| attention | 351 | 6,316 | 16.7 ms | 16.7 ms |

The earlier representative build **20260918T001430Z-31ecea** measured active overview flow at **780 draw calls**, **18,106 triangles**, **16.7 ms median**, **50.0 ms p95**, and **23.45 ms mean**. The later build changes labels and annotation scope. These diagnostic samples still do not establish sustained 60 fps or target-laptop performance, and were not a controlled comparison.

The GLB contains **16,000 triangles**, **88 shared meshes**, **1,018 nodes**, and **461,416 bytes**. It retains the complete representative interior and compresses repeated model-level geometry. The numerical model still contains 32 layers.

## Per-frame work and bundle split

Before: main at **fff1016** (build 20261002T212845Z-86b1bc). After: this change (build 20261002T215737Z-b0ebfd). Both use asset transformer-edbc6ca676ec.glb and were measured in the same container: 4 cores, Chromium 141.0.7390.37 headless, ANGLE SwiftShader, 1440 × 1100, device pixel ratio 1. These are software-rendering diagnostics, not hardware benchmarks. This host renders even paused views far slower than the host in the tables above (paused overview about 40–45 ms mean here, against 16.7 ms there), so compare rows within this section only.

Method: the browser-checks sampling, 60 `requestAnimationFrame` intervals after warm-up, for paused overview, layer and attention; active overview flow and tour playback from 0 s at 1× were each sampled three times. Main-thread script time comes from the Chrome DevTools Protocol `Performance.getMetrics` (`ScriptDuration`) over 2–3 s windows. The review build supplies renderer counters through `window.__explorerRender`. The public build (`npm --prefix web run build`, `VITE_REVIEW` unset) has no diagnostics globals or per-frame scene report and measures production cost. The public rows show two complete runs.

| Build | Case | Mean frame | Median / p95 per sample | Script ms per second |
| --- | --- | ---: | --- | ---: |
| Public, before | active overview flow | 69.1 / 71.6 ms | 50–83 / 150–183 ms | **944 / 952** |
| Public, after | active overview flow | 44.8 / 42.3 ms | 33–50 / 67–100 ms | **196 / 203** |
| Public, before | tour playback | 42.6 / 42.5 ms | 33–50 / 50–83 ms | 199 / 195 |
| Public, after | tour playback | 41.5 / 40.1 ms | 33–50 / 50–83 ms | 160 / 150 |
| Public, before | paused overview | 42.5 / 40.6 ms | 33–50 / 67 ms | 164 / 182 |
| Public, after | paused overview | 45.8 / 41.1 ms | 33–50 / 67 ms | 166 / 157 |
| Review, before | active overview flow | 77.3 ms | 67 / 183–200 ms | 925 |
| Review, after | active overview flow | 46.1 ms | 50 / 83–100 ms | 223 |
| Review, before | tour playback | 43.8 ms | 33–50 / 50–100 ms | 226 |
| Review, after | tour playback | 40.6 ms | 33–50 / 67 ms | 181 |

Before the change, active flow saturated the main thread: about 0.95 s of script per second. After it, flow costs about the same main-thread time as the paused overview, and its frame interval matches the paused overview's. Software rasterization then dominates, so 60 fps is still **not met** under SwiftShader on this host, paused or animated. Renderer counters are unchanged: overview 755 draw calls and 16,272 triangles, layer 743 / 15,852, attention 523 / 9,900, and active overview flow 764–780 / 16,820–18,106 in both builds.

React work during playback, measured with a temporary `Profiler` around the DOM root and the React Three Fiber root on the development server (removed before committing). Each figure is for 3 s; two runs of each agree within 20%.

| Case | DOM root: commits, render time | Three.js root: commits, render time |
| --- | --- | --- |
| Tour, before | 58 commits, 776 ms | 56 commits, 278 ms |
| Tour, after | 64 commits, 56 ms | 62 commits, 38 ms |
| Flow, before | 30 commits, 402 ms | 28 commits, 213 ms |
| Flow, after | 37 commits, 42 ms | 68 commits, 63 ms |

Commit counts stay near one per frame because the time readouts and moving markers genuinely change each frame. More frames rendered in the same 3 s after the change, so counts rose slightly. Each commit now renders only those readouts and markers rather than the whole App, its explanation panel and tables, and the scene. The flow's three.js commits also stopped rebuilding line geometry. drei's `Line` rebuilds its geometry and disposes its material whenever it receives a new `points` array, which previously happened for every flow track on every frame.

Bundle (`npm --prefix web run build`, minified / gzip):

| Chunk | Before | After |
| --- | ---: | ---: |
| index (app) | 1,238.3 / 350.0 kB | 50.3 / 16.2 kB |
| react (vendor) | — | 189.2 / 59.9 kB |
| Scene (lazy) | — | 293.6 / 92.8 kB |
| three (vendor, lazy) | — | 704.3 / 181.5 kB |

The page now needs 239.4 kB (76.1 kB gzip) of JavaScript before the explanation UI renders, down from 1,238.3 kB. The scene chunks load in parallel after that. Vite's size warning no longer fires: the limit is 750 kB, because three.js core is a single 704 kB module.

Equivalence: 60 captures (six views at 1440 × 1100 and 390 × 844, eight tour times at both sizes and with reduced motion, and flow steps in five views) give identical app state, scene report, camera pose and visible text before and after. Their screenshots differ by at most 208 pixels, within the 227-pixel variation between two runs of the unchanged build.
