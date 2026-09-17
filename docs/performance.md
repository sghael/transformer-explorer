# Performance evidence

Measured build: 20260917T182656Z-296029. These are Chromium headless ANGLE SwiftShader software-rendering diagnostics, not a benchmark on the viewing laptop.

Viewport: 1440 × 1100; device pixel ratio: 1; Chromium 140.0.7339.186. Each view sampled 59 intervals after warm-up. No other test browser ran during the measurement phase.

| View | Draw calls | Triangles | Median frame | p95 frame |
| --- | ---: | ---: | ---: | ---: |
| compact | 41 | 608 | 16.7 ms | 16.7 ms |
| spaced | 41 | 608 | 16.7 ms | 16.8 ms |
| layer | 189 | 2408 | 16.7 ms | 16.8 ms |
| attention | 35 | 348 | 16.7 ms | 16.8 ms |

The complete GLB contains 2,712 triangles across 43 shared meshes and is 122,860 bytes, below the 10 MB target. Actual visible triangle/draw-call counts depend on the selected view. GPU instancing and compression are not required for this asset.

One 768 × 768 RGBA heatmap texture is allocated. Its pixel data plus mipmaps is approximately 3 MiB; actual driver allocation bytes are not exposed by the browser. Renderer counters and frame measurements are saved in ignored artifacts/browser/report.json.

The software-browser measurements meet the approximate 60 fps target in the measured views. Reduced pixel density preserves every selection and detail view. Representative laptop hardware frame time, thermal behavior, battery usage and exact GPU texture allocation remain unmeasured; this is a documented delivery exception. The human confirmed that the model loads on the laptop.

Reproduce with PREVIEW_URL set to the running development preview, then run node web/browser-checks.mjs. For hardware evidence, run the same interactions and capture performance on the target browser. Do not infer hardware performance or learning effectiveness from the headless result.
