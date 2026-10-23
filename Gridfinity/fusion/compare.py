"""Compare Fusion exports with the Onshape reference STLs (needs the project venv: trimesh + manifold3d).

For every part: bounding box deviation, volume deviation and the symmetric difference volume
(ref - gen) + (gen - ref), computed with manifold3d. A perfect replica has a symmetric difference of ~0.

Usage:
  .venv/Scripts/python.exe Gridfinity/fusion/compare.py <tag> [--parts Base,Lid] [--diff out_dir]
    <tag>   e.g. 5x4x6 or 5x4x6_w075 (folders in Gridfinity/reference and Gridfinity/export/fusion)
    --diff  also write the two difference meshes per part (ref_minus_gen / gen_minus_ref) as STL
"""
import os
import sys

import numpy as np
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, "..", "reference")
GEN = os.path.join(HERE, "..", "export", "fusion")
PARTS = ["Base", "Lid", "Latch", "Seal", "Window"]


def load(path):
    m = trimesh.load_mesh(path)
    m.merge_vertices()
    return m


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) < 2:
        raise SystemExit(__doc__)
    tag = argv[1]
    parts = PARTS
    if "--parts" in argv:
        parts = argv[argv.index("--parts") + 1].split(",")
    diff_dir = argv[argv.index("--diff") + 1] if "--diff" in argv else None
    print("%-7s %9s %9s %8s %10s %10s %9s  %s" % ("part", "V_ref", "V_gen", "dV %", "ref-gen", "gen-ref", "bbox_dev", "watertight"))
    worst = 0.0
    for part in parts:
        rp, gp = os.path.join(REF, tag, part + ".stl"), os.path.join(GEN, tag, part + ".stl")
        if not (os.path.exists(rp) and os.path.exists(gp)):
            print("%-7s missing %s" % (part, rp if not os.path.exists(rp) else gp))
            continue
        ref, gen = load(rp), load(gp)
        bbox_dev = float(np.abs(ref.bounds - gen.bounds).max())
        try:
            a = trimesh.boolean.difference([ref, gen], engine="manifold")
            b = trimesh.boolean.difference([gen, ref], engine="manifold")
            va, vb = a.volume / 1000.0, b.volume / 1000.0
        except Exception as e:  # noqa: BLE001 - report and continue with the other parts
            print("%-7s boolean failed: %s" % (part, e))
            va = vb = float("nan")
            a = b = None
        print("%-7s %9.3f %9.3f %8.3f %10.4f %10.4f %9.4f  %s/%s" % (
            part, ref.volume / 1000, gen.volume / 1000, 100 * (gen.volume / ref.volume - 1), va, vb, bbox_dev,
            ref.is_watertight, gen.is_watertight))
        worst = max(worst, bbox_dev)
        if diff_dir and a is not None:
            os.makedirs(diff_dir, exist_ok=True)
            a.export(os.path.join(diff_dir, part + "_ref_minus_gen.stl"))
            b.export(os.path.join(diff_dir, part + "_gen_minus_ref.stl"))
            for name, m in (("ref_minus_gen", a), ("gen_minus_ref", b)):
                if m.volume > 1e-3:
                    parts_ = m.split(only_watertight=False)
                    big = sorted(parts_, key=lambda p: -abs(p.volume))[:6]
                    for p in big:
                        lo, hi = p.bounds
                        print("    %s piece V=%.4f cm3 at x %.1f..%.1f y %.1f..%.1f z %.1f..%.1f" % (
                            name, abs(p.volume) / 1000, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))


if __name__ == "__main__":
    main(sys.argv)
