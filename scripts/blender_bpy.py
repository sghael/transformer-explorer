#!/usr/bin/env python3
"""Headless stand-in for the Blender executable, backed by the PyPI bpy module.

Use it where the official Blender 4.5 LTS build cannot be installed. With a
Python 3.11 environment containing bpy==4.5.13 (the tested release) active:

    BLENDER_BIN="$PWD/scripts/blender_bpy.py" python3 scripts/build.py

Only the arguments used by scripts/build.py and the generator docs are accepted,
so an unexpected flag fails instead of being silently ignored.
"""
import runpy
import sys
import traceback

args = sys.argv[1:]
if args in (["--version"], ["-v"]):
    import bpy
    print(f"Blender {bpy.app.version_string} (bpy module)")
    raise SystemExit(0)
script, exit_code, i = None, 0, 0
while i < len(args):
    arg = args[i]
    if arg == "--":
        break
    if arg in ("--python", "-P", "--python-exit-code") and i + 1 == len(args):
        raise SystemExit(f"blender_bpy: {arg} requires a value")
    if arg in ("--python", "-P"):
        script = args[i+1]
        i += 1
    elif arg == "--python-exit-code":
        exit_code = int(args[i+1])
        i += 1
    elif arg not in ("--background", "-b", "--factory-startup", "--noaudio"):
        raise SystemExit(f"blender_bpy: unsupported argument {arg!r}")
    i += 1

import bpy
bpy.ops.wm.read_factory_settings(use_empty=False)
if script:
    # Blender exposes its full command line; scripts read their own arguments after "--".
    sys.argv = ["blender", *args]
    try:
        runpy.run_path(script, run_name="__main__")
    except SystemExit:
        raise
    except BaseException:
        traceback.print_exc()
        raise SystemExit(exit_code)
