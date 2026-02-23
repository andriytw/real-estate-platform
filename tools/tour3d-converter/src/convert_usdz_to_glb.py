"""
Blender script: import USD/USDZ, export GLB.
Usage: blender -b -P convert_usdz_to_glb.py -- --input <path> --output <path>
"""
import sys
import os
import argparse

def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    return p.parse_args(argv)

def main():
    args = parse_args()
    in_path = os.path.abspath(args.input)
    out_path = os.path.abspath(args.output)
    if not os.path.isfile(in_path):
        print(f"Error: input file not found: {in_path}", file=sys.stderr)
        sys.exit(1)
    out_dir = os.path.dirname(out_path)
    if out_dir and not os.path.isdir(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)

    try:
        bpy.ops.wm.usd_import(filepath=in_path)
    except Exception as e1:
        try:
            bpy.ops.wm.usd_import(filepath=in_path, import_cameras=False, import_curves=False)
        except Exception as e2:
            print(f"USD import failed: {e1}; {e2}", file=sys.stderr)
            sys.exit(1)

    if not bpy.data.objects:
        print("No objects after import", file=sys.stderr)
        sys.exit(1)

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=False,
        export_materials="EXPORT",
        export_colors=True,
        export_cameras=False,
        export_lights=False,
    )
    sys.exit(0)

if __name__ == "__main__":
    main()
