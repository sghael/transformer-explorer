# Build and inspect

## Requirements

Tested with Blender 4.5.13 LTS, Python 3.12.13, Node 24.14.1, npm 11.11.0 and Chromium 140.0.7339.186. Install JavaScript dependencies using the checked-in lockfile:

```sh
npm --prefix web ci
```

Set `BLENDER_BIN` to the installed Blender executable if it is not on PATH. Run commands from the checkout root, or supply absolute script paths.

## Reproducible production build

```sh
python3 scripts/build.py
```

This starts Blender from a clean file, runs the versioned generator, validates the GLB against the scene report, typechecks TypeScript, and builds the production viewer. Each successful build has a timestamp and unique suffix. The preview pointer changes only after the build succeeds, so a failed generation or compilation leaves the previous successful preview in place.

Generated files remain ignored: `web/public/models/transformer.glb`, `artifacts/transformer.blend`, structural reports and production releases. Python and JSON are the reproducible asset sources. No Blender UI or MCP service is needed.

## Preview

```sh
python3 scripts/serve.py --port 0
```

Read the actual port from startup output, then run `agent-preview-url` with that port. The server binds to all interfaces and serves only the successful production release. Verify both the page and `models/transformer.glb` through the returned address. Confirm that the host firewall permits this TCP port from the authorized LAN. A same-host request does not exercise inbound firewall rules and does not prove another device can connect.

The development build enables the view-context panel. It records build ID, seed, selected layer/group/token, spacing, tour time, camera and viewport. Copy it alongside feedback or restore a saved context from the same build. No messages or commands are sent from the exhibit.

## Checks

```sh
python3 scripts/validate_glb.py
npm --prefix web test
```

The asset validator reads the GLB binary container and checks all semantic extras, counts, hierarchy, shared meshes, exported transforms, bounds and camera anchors. Numerical tests cover deterministic illustrative values, causal masking, cache append identity, RoPE and normalized expert selection. Browser interaction checks and visual inspection are separate acceptance evidence; passing an export does not establish readability or usability.

## Static deployment

The viewer uses relative asset URLs and requires no backend. After a full build, upload the contents of `web/dist` to a static server with JavaScript, CSS and GLB MIME support. For a public build without development view controls, run `npm --prefix web run build` with `VITE_REVIEW` unset after generating the model. Serve over HTTP(S), not a file URL. Keep HTML uncached or revalidated; hashed JavaScript and CSS can be cached. No Internet deployment has been authorized by the implementation preview request.

## Evidence

See progress.md for checks actually performed and remaining acceptance work. Generated reports and screenshots live under ignored `artifacts/`. Private addresses, device names, connection failures and raw operational logs belong only in ignored private context. Agent inspection does not establish learner comprehension.

With `PREVIEW_URL` set, run `node web/browser-checks.mjs` for the full acceptance suite and `node web/semantic-check.mjs` for wheel-driven semantic zoom. Run `node web/review-checks.mjs` for semantic mesh picking, paused computation, and presentation-context regressions. Run `node web/deep-checks.mjs` for contextual navigation, animated flow and scalar RMSNorm inspection. Install the pinned test browser once with `web/node_modules/.bin/playwright install chromium`. The suite captures actual browser views, checks interaction state, and records software-rendering diagnostics separately from human learning evidence.

Run `npm --prefix web run format:check` before committing. The repository uses its tracked `.githooks/pre-commit` privacy hook rather than a Lefthook configuration.

Run `node web/flight-checks.mjs` with `PREVIEW_URL` set to capture transition videos and verify actual rendered camera continuity, persistent scene transforms, complete structural opacity and destination presence throughout hierarchical navigation. Run `node web/navigation-checks.mjs` for seek, Reset and context-restore cancellation during flight, plus orbit ownership after arrival. Endpoint screenshots complement these motion checks; they cannot establish continuity on their own.
