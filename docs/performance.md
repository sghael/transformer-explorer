# Performance evidence

Measured build: 20260917T190016Z-f1bb21. These are Chromium headless ANGLE SwiftShader software-rendering diagnostics, not a benchmark on the viewing laptop.

Viewport: 1440 × 1100; device pixel ratio: 1; Chromium 140.0.7339.186. Each view sampled 59 intervals after warm-up. Other acceptance browsers ran on the same host during this verification campaign; these measurements are not a controlled hardware benchmark. Flow was paused in these four views.

| View | Draw calls | Triangles | Median frame | p95 frame |
| --- | ---: | ---: | ---: | ---: |
| compact | 41 | 1124 | 16.7 ms | 16.8 ms |
| spaced | 41 | 1124 | 16.7 ms | 16.7 ms |
| layer | 181 | 3908 | 16.7 ms | 16.7 ms |
| attention | 42 | 1018 | 16.7 ms | 16.8 ms |

The complete GLB contains 4,900 triangles across 43 shared meshes and is 190,016 bytes, below the 10 MB target. Actual visible triangle/draw-call counts depend on the selected view. GPU instancing and compression are not required for this asset.

One 768 × 768 RGBA heatmap texture is allocated. Its pixel data plus mipmaps is approximately 3 MiB; actual driver allocation bytes are not exposed by the browser. Renderer counters and frame measurements are saved in ignored artifacts/browser/report.json.

The software-browser measurements meet the approximate 60 fps target in the measured views. Reduced pixel density preserves every selection and detail view. Representative laptop hardware frame time, thermal behavior, battery usage and exact GPU texture allocation remain unmeasured; this is a documented delivery exception. The human confirmed that the model loads on the laptop.

Reproduce with PREVIEW_URL set to the running development preview, then run node web/browser-checks.mjs. For hardware evidence, run the same interactions and capture performance on the target browser. Do not infer hardware performance or learning effectiveness from the headless result.

Active overview flow was separately sampled on build 20260917T190430Z-e13ddc: 59 frame intervals averaged 16.6661 ms, with 66 draw calls, 2,940 visible triangles, one texture and 54 geometries. The same 1440 × 1100, DPR 1 software Chromium environment was used; this remains diagnostic rather than target-laptop GPU evidence. See artifacts/deep-browser/report.json.

The final caption build 20260917T190735Z-22f70e repeated the active-flow sample: 59 intervals averaged 17.2288 ms, with 66 draw calls, 2,940 triangles, one texture and 56 geometries. This variation reinforces the distinction between an approximate software diagnostic and a hardware performance guarantee.
