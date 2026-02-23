#!/usr/bin/env bash
# Usage: run_blender.sh <input.usdz> <output.glb>
set -e
IN="${1:?}"
OUT="${2:?}"
BLENDER="${BLENDER_CMD:-blender}"
"$BLENDER" -b -P "$(dirname "$0")/convert_usdz_to_glb.py" -- --input "$IN" --output "$OUT"
