"""Print files for SKÅDIS models from the Fusion exports (Skadis/export/<model>/, assembled position).

STLs in print orientation, a 3MF plate laid out for the Prusa XL bed, and STEP copies, written to the tracked
download folder Skadis/models/<slug>/files/ (the site serves them). Needs the project venv (trimesh).

Usage:
  .venv/Scripts/python.exe Skadis/fusion/print_export.py <job> [--bed 360]
Jobs: fit-test, roll-test, roll-holder, first-test (fit tokens + roll test pieces on one plate -> Skadis/export/print/)
"""
import fnmatch
import math
import os
import shutil
import sys

import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
SK = os.path.abspath(os.path.join(HERE, ".."))
ROOT = os.path.abspath(os.path.join(SK, ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import stl_check  # noqa: E402
from threemf import write_3mf  # noqa: E402

GAP = 10.0  # mm between parts on a plate


def ry(deg):
    return trimesh.transformations.rotation_matrix(math.radians(deg), [0, 1, 0])


# Print orientation: parts whose print-bed face looks to +X with the part towards -X get ry(90) (bracket at X = 0,
# which is the right one seen from the front; tokens; hub ring); parts towards +X get ry(-90) (left bracket);
# plugs stand on the knob: ry(-90).
TOKENS = [("fit-test", "Token_*", ry(90), 1)]
TEST = [("roll-test", "Test_Hub", ry(90), 1), ("roll-test", "Test_Plug_*", ry(-90), 1)]
HOLDER = [("roll-holder", "Bracket_L", ry(-90), 1), ("roll-holder", "Bracket_R", ry(90), 1), ("roll-holder", "Plug", ry(-90), 2)]
JOBS = {
    # stl: (file, parts merged into one STL); plate: (file, parts with quantities); step: (file, model, component)
    "fit-test": {"out": "models/fit-test/files",
                 "stl": [("Skadis_Fit_Test_Tokens", TOKENS)],
                 "plate": ("Skadis_Fit_Test_Plate", TOKENS)},
    # brake test pieces: not on the download page (the roll runs loose since the 2026-11 test)
    "roll-test": {"out": "export/print",
                  "stl": [("Skadis_Roll_Holder_Test_Pieces", TEST)],
                  "plate": None},
    "roll-holder": {"out": "models/roll-holder/files",
                    "stl": [("Skadis_Roll_Holder_Bracket_L", HOLDER[:1]), ("Skadis_Roll_Holder_Bracket_R", HOLDER[1:2]),
                            ("Skadis_Roll_Holder_Plug", [HOLDER[2][:3] + (1,)])],
                    "plate": ("Skadis_Roll_Holder_Plate", HOLDER),
                    "step": [("Skadis_Roll_Holder_Bracket_L", "roll-holder", "Bracket_L"),
                             ("Skadis_Roll_Holder_Bracket_R", "roll-holder", "Bracket_R"),
                             ("Skadis_Roll_Holder_Plug", "roll-holder", "Plug")]},
    "first-test": {"out": "export/print",
                   "stl": [],
                   "plate": ("Skadis_First_Test_Print", TOKENS + TEST)},
}


def load_parts(spec):
    """[(model, glob, rotation, qty)] -> [(name, mesh in print orientation, z = 0, centred)] with quantities expanded."""
    out = []
    for model, pattern, tf, qty in spec:
        src = os.path.join(SK, "export", model)
        names = sorted(f[:-4] for f in os.listdir(src) if f.endswith(".stl") and fnmatch.fnmatch(f[:-4], pattern))
        if not names:
            raise SystemExit("no export for %s/%s - run Skadis/fusion/build.py %s first" % (model, pattern, model))
        for name in names:
            mesh = trimesh.load_mesh(os.path.join(src, name + ".stl"))
            if not mesh.is_watertight:
                print("WARNING: %s/%s.stl from Fusion is not watertight" % (model, name))
            mesh.apply_transform(tf)
            lo, hi = mesh.bounds
            mesh.apply_translation([-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]])
            for q in range(qty):
                out.append((name if qty == 1 else "%s_%d" % (name, q + 1), mesh.copy()))
    return out


def layout(parts, bed):
    """Shelf packing in rows (largest first), centred on (0, 0); returns the moved meshes."""
    parts = sorted(parts, key=lambda p: -p[1].extents[1])
    rows, row, x, w_max = [], [], 0.0, bed - 2 * GAP
    for name, m in parts:
        w = m.extents[0]
        if row and x + w > w_max:
            rows.append(row)
            row, x = [], 0.0
        row.append((name, m, x))
        x += w + GAP
    rows.append(row)
    placed, y = [], 0.0
    for row in rows:
        h = max(m.extents[1] for _, m, _ in row)
        for name, m, x in row:
            m = m.copy()
            m.apply_translation([x + m.extents[0] / 2, y + h / 2, 0])
            placed.append((name, m))
        y += h + GAP
    allb = trimesh.util.concatenate([m for _, m in placed]).bounds
    shift = [-(allb[0][0] + allb[1][0]) / 2, -(allb[0][1] + allb[1][1]) / 2, 0]
    for _, m in placed:
        m.apply_translation(shift)
    size = allb[1] - allb[0]
    if size[0] > bed or size[1] > bed:
        print("WARNING: layout %.0f x %.0f mm exceeds the %g mm bed" % (size[0], size[1], bed))
    return placed


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) < 2 or argv[1] not in JOBS:
        raise SystemExit(__doc__)
    job = JOBS[argv[1]]
    bed = float(argv[argv.index("--bed") + 1]) if "--bed" in argv else 360.0
    out = os.path.join(SK, job["out"])
    os.makedirs(out, exist_ok=True)
    for fname, spec in job["stl"]:
        placed = layout(load_parts(spec), bed)
        path = os.path.join(out, fname + ".stl")
        trimesh.util.concatenate([m for _, m in placed]).export(path)
        print(stl_check.check(path, (bed, bed)))
    if job["plate"]:
        fname, spec = job["plate"]
        placed = layout(load_parts(spec), bed)
        objs = []
        for name, m in placed:
            m.apply_translation([bed / 2, bed / 2, 0])  # bed coordinates (PrusaSlicer: origin at the front left)
            objs.append((name, m.vertices, m.faces))
        path = os.path.join(out, fname + ".3mf")
        write_3mf(path, objs, title=fname)
        print("%-40s %d objects, %.0f KB" % (os.path.basename(path), len(objs), os.path.getsize(path) / 1024))
    for fname, model, comp in job.get("step", []):
        shutil.copyfile(os.path.join(SK, "export", model, comp + ".step"), os.path.join(out, fname + ".step"))
        print("%-40s %.0f KB" % (fname + ".step", os.path.getsize(os.path.join(out, fname + ".step")) / 1024))


if __name__ == "__main__":
    main(sys.argv)
