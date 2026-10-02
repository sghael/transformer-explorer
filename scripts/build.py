"""Regenerate and build. Publish only successful builds to the preview directory."""
import datetime
import hashlib
import time
import json
import os
from pathlib import Path
import shutil
import subprocess
import uuid
ROOT = Path(__file__).resolve().parents[1]
started = time.perf_counter()
def run(args, **kwargs):
    subprocess.run(args, cwd=ROOT, check=True, **kwargs)
blender = os.environ.get('BLENDER_BIN') or shutil.which('blender')
if not blender:
    raise SystemExit('Set BLENDER_BIN to the Blender 4.5 LTS executable.')
run([blender, '--background', '--factory-startup', '--python-exit-code', '1', '--python', str(ROOT/'blender/generate.py')])
run(['python3', str(ROOT/'scripts/validate_glb.py')])
asset = ROOT/'web/public/models/transformer.glb'
asset_name = 'transformer-' + hashlib.sha256(asset.read_bytes()).hexdigest()[:12] + '.glb'
# Earlier builds left content-addressed copies here, and Vite ships everything in public/.
for stale in asset.parent.glob('transformer-*.glb'):
    stale.unlink()
build_id = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:6]
run(['npm', '--prefix', str(ROOT/'web'), 'run', 'build'], env={**os.environ, 'VITE_BUILD_ID':build_id, 'VITE_REVIEW':'1', 'VITE_ASSET_NAME':asset_name})
dist = ROOT/'web/dist'
# Production pages request only the content-addressed model.
(dist/'models/transformer.glb').unlink(missing_ok=True)
shutil.copy2(asset, dist/'models'/asset_name)
own_files = sorted(str(f.relative_to(dist)) for f in dist.rglob('*') if f.is_file())
releases = ROOT/'artifacts/releases'
release = releases/build_id
releases.mkdir(parents=True, exist_ok=True)
shutil.copytree(dist, release)
(releases/f'{build_id}.json').write_text(json.dumps(own_files, indent=2)+'\n')
# Pages loaded just before the atomic swap may still request the previous
# release's files. Carry only that release's own files, so copies do not accumulate.
previous = ROOT/'artifacts/preview'
if previous.exists():
    manifest = releases/f'{previous.resolve().name}.json'
    carried = json.loads(manifest.read_text()) if manifest.exists() else [
        str(f.relative_to(previous)) for folder in ('assets', 'models') for f in (previous/folder).glob('*')]
    for name in carried:
        source, target = previous/name, release/name
        if source.is_file() and not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
link = ROOT/'artifacts/preview-next'
link.unlink(missing_ok=True)
link.symlink_to(release, target_is_directory=True)
link.replace(ROOT/'artifacts/preview')
# The preview serves only the newest release; keep two older ones for comparison.
for old in sorted(p for p in releases.iterdir() if p.is_dir())[:-3]:
    shutil.rmtree(old)
    (releases/f'{old.name}.json').unlink(missing_ok=True)
report = dict(build_id=build_id, asset=asset_name, asset_bytes=asset.stat().st_size, elapsed_seconds=round(time.perf_counter()-started, 3))
(ROOT/'artifacts/build-report.json').write_text(json.dumps(report, indent=2)+'\n')
print(f'Published successful preview build {build_id}', flush=True)
print(json.dumps(report), flush=True)
