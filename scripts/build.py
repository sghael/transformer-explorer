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
shutil.copy2(asset, asset.with_name(asset_name))
build_id = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:6]
run(['npm', '--prefix', str(ROOT/'web'), 'run', 'build'], env={**os.environ, 'VITE_BUILD_ID':build_id, 'VITE_REVIEW':'1', 'VITE_ASSET_NAME':asset_name})
release = ROOT/'artifacts/releases'/build_id
release.parent.mkdir(parents=True, exist_ok=True)
shutil.copytree(ROOT/'web/dist', release)
# Preserve content-addressed files for pages loaded just before an atomic swap.
previous = ROOT/'artifacts/preview'
if previous.exists():
    for folder in ('assets', 'models'):
        for old in (previous/folder).glob('*'):
            target = release/folder/old.name
            if old.is_file() and not target.exists():
                shutil.copy2(old, target)
link = ROOT/'artifacts/preview-next'
link.unlink(missing_ok=True)
link.symlink_to(release, target_is_directory=True)
link.replace(ROOT/'artifacts/preview')
report = dict(build_id=build_id, asset=asset_name, asset_bytes=asset.stat().st_size, elapsed_seconds=round(time.perf_counter()-started, 3))
(ROOT/'artifacts/build-report.json').write_text(json.dumps(report, indent=2)+'\n')
print(f'Published successful preview build {build_id}', flush=True)
print(json.dumps(report), flush=True)
