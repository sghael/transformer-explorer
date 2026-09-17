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
