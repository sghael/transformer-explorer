#!/bin/bash
# Prepare a Claude Code cloud container for the Blender → GLB → browser pipeline.
#
# The container's network policy blocks official Blender downloads, GitHub release
# assets and the Playwright browser CDN. Package registries remain reachable, so:
#   - Blender 4.5.13 LTS comes from the PyPI bpy module behind scripts/blender_bpy.py
#   - Gitleaks is compiled through the Go module proxy
#   - the preinstalled Chromium is aliased to the revision the pinned Playwright expects
# Every step is idempotent. Tools live outside the checkout, in the container cache.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
TOOLS="${XDG_CACHE_HOME:-$HOME/.cache}/transformer-explorer"
BPY_VERSION=4.5.13
GITLEAKS_VERSION=8.30.1
failed=()
log() { echo "[session-start] $*" >&2; }
mkdir -p "$TOOLS/bin"

install_blender() {
  local python="$TOOLS/bpy/bin/python"
  if ! "$python" -c "import bpy, sys; sys.exit(bpy.app.version_string.split()[0] != '$BPY_VERSION')" 2>/dev/null; then
    log "Installing bpy $BPY_VERSION (requires CPython 3.11)"
    rm -rf "$TOOLS/bpy"
    if command -v uv >/dev/null; then
      uv venv --quiet --python 3.11 "$TOOLS/bpy" &&
        uv pip install --quiet --python "$python" "bpy==$BPY_VERSION" || return 1
    else
      python3.11 -m venv "$TOOLS/bpy" &&
        "$python" -m pip install --quiet "bpy==$BPY_VERSION" || return 1
    fi
  fi
  printf '#!/bin/sh\nexec "%s" "%s" "$@"\n' "$python" "$ROOT/scripts/blender_bpy.py" > "$TOOLS/bin/blender"
  chmod +x "$TOOLS/bin/blender"
  "$TOOLS/bin/blender" --version >&2
}

install_gitleaks() {
  if [ "$("$TOOLS/bin/gitleaks" version 2>/dev/null)" = "$GITLEAKS_VERSION" ]; then
    return 0
  fi
  command -v go >/dev/null || { log "Go is unavailable; cannot build Gitleaks"; return 1; }
  log "Building Gitleaks $GITLEAKS_VERSION"
  local output
  # Module download progress is noise unless the build fails.
  output=$(cd "$TOOLS" && GOBIN="$TOOLS/bin" go install \
    -ldflags "-X github.com/zricethezav/gitleaks/v8/version.Version=$GITLEAKS_VERSION" \
    "github.com/zricethezav/gitleaks/v8@v$GITLEAKS_VERSION" 2>&1) || { echo "$output" >&2; return 1; }
}

install_web() {
  local stamp="$ROOT/web/node_modules/.package-lock.sha256"
  local lock
  lock=$(sha256sum "$ROOT/web/package-lock.json" | cut -d' ' -f1)
  if [ "$(cat "$stamp" 2>/dev/null)" != "$lock" ]; then
    log "Installing web dependencies from the lockfile"
    npm --prefix "$ROOT/web" ci --no-audit --no-fund >&2 || return 1
    echo "$lock" > "$stamp"
  fi
}

# Prints the browsers path Playwright should use: the preinstalled one when it
# already has the pinned revisions, otherwise an alias directory mapping each
# missing revision to the newest installed build of that browser.
link_playwright_browsers() {
  local base="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
  [ "$base" = "$TOOLS/pw-browsers" ] && base=/opt/pw-browsers
  python3 - "$base" "$TOOLS/pw-browsers" "$ROOT/web/node_modules/playwright-core/browsers.json" <<'PY'
import json, re, shutil, sys
from pathlib import Path
base, alias, manifest = map(Path, sys.argv[1:])
wanted = {b["name"].replace("-", "_"): b["revision"] for b in json.loads(manifest.read_text())["browsers"]
          if b["name"] in ("chromium", "chromium-headless-shell", "ffmpeg")}
if all((base / f"{name}-{rev}").is_dir() for name, rev in wanted.items()):
    print(base)
    raise SystemExit
shutil.rmtree(alias, ignore_errors=True)
alias.mkdir(parents=True)
for entry in base.iterdir():
    (alias / entry.name).symlink_to(entry)
for name, rev in wanted.items():
    if (alias / f"{name}-{rev}").exists():
        continue
    builds = sorted((p for p in base.iterdir() if re.fullmatch(rf"{name}-\d+", p.name)),
                    key=lambda p: int(p.name.rsplit("-", 1)[1]))
    if not builds:
        raise SystemExit(f"No installed {name} build to stand in for revision {rev}")
    (alias / f"{name}-{rev}").symlink_to(builds[-1])
    print(f"Aliased {name}-{rev} to {builds[-1].name}", file=sys.stderr)
print(alias)
PY
}

install_blender || failed+=(blender)
# The tracked privacy hook needs Gitleaks on PATH; enable it only once that holds.
install_gitleaks && git -C "$ROOT" config core.hooksPath .githooks || failed+=(gitleaks)
install_web || failed+=(web)
browsers=$(link_playwright_browsers) || failed+=(playwright)

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export PATH=\"$TOOLS/bin:\$PATH\""
    echo "export BLENDER_BIN=\"$TOOLS/bin/blender\""
    [ -n "${browsers:-}" ] && echo "export PLAYWRIGHT_BROWSERS_PATH=\"$browsers\""
  } >> "$CLAUDE_ENV_FILE"
fi

if [ ${#failed[@]} -gt 0 ]; then
  log "Setup incomplete: ${failed[*]}"
  exit 1
fi
log "Ready: BLENDER_BIN, gitleaks, web dependencies and Playwright browsers"
