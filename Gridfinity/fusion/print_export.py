"""Print files from the Fusion exports: STLs in print orientation, the window as SVG cut file, and a build sheet.

Needs the project venv (trimesh). Input: Gridfinity/export/fusion/<tag>/*.stl (assembled position, from build.py).
Output: Gridfinity/export/print/<tag>/

Usage: .venv/Scripts/python.exe Gridfinity/fusion/print_export.py <XxYxZ> [--wt 1.6] [--gap 0.2] [--bed 360]
"""
import json
import math
import os
import sys

import numpy as np
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
GF = os.path.abspath(os.path.join(HERE, ".."))
SPEC = json.load(open(os.path.join(GF, "spec", "case_params.json"), encoding="utf-8"))


def rot(axis, deg):
    return trimesh.transformations.rotation_matrix(math.radians(deg), axis)


# part -> (file name suffix, quantity, transform to print orientation, note)
ORIENT = {
    "Base": ("Base", 1, np.eye(4), "feet down, no supports"),
    "Lid": ("Lid", 1, rot([1, 0, 0], 180), "upside down (top on the bed); PAUSE for the window, see below"),
    "Latch": ("Latch_x2", 2, rot([0, 1, 0], 90), "on its side, holes vertical"),
    "Seal": ("Seal_TPU", 1, np.eye(4), "flat, TPU"),
}


def window_svg(w, h, r):
    """Rounded rectangle cut path, mm units (1 user unit = 1 mm)."""
    m = 1.0  # margin
    x0, y0, x1, y1 = m, m, m + w, m + h
    d = ("M %.3f %.3f H %.3f A %.3f %.3f 0 0 1 %.3f %.3f V %.3f A %.3f %.3f 0 0 1 %.3f %.3f "
         "H %.3f A %.3f %.3f 0 0 1 %.3f %.3f V %.3f A %.3f %.3f 0 0 1 %.3f %.3f Z") % (
        x0 + r, y0, x1 - r, r, r, x1, y0 + r, y1 - r, r, r, x1 - r, y1,
        x0 + r, r, r, x0, y1 - r, y0 + r, r, r, x0 + r, y0)
    W, H = w + 2 * m, h + 2 * m
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<svg xmlns="http://www.w3.org/2000/svg" width="%.3fmm" height="%.3fmm" viewBox="0 0 %.3f %.3f">\n'
            '  <title>Gridfinity Rugged Case window %.1f x %.1f mm, r %.1f</title>\n'
            '  <path d="%s" fill="none" stroke="#ff0000" stroke-width="0.1"/>\n'
            '</svg>\n') % (W, H, W, H, w, h, r, d)


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) < 2:
        raise SystemExit(__doc__)
    x, y, n = (int(v) for v in argv[1].lower().split("x"))
    wt = float(argv[argv.index("--wt") + 1]) if "--wt" in argv else 1.6
    bed = float(argv[argv.index("--bed") + 1]) if "--bed" in argv else 360.0
    gap_default = SPEC["parameters"]["window_gap"]["default"]
    gap = float(argv[argv.index("--gap") + 1]) if "--gap" in argv else gap_default
    tag = "%dx%dx%d" % (x, y, n) + ("" if abs(wt - 1.6) < 1e-9 else "_w%s" % str(wt).replace(".", ""))
    tag += "" if abs(gap - gap_default) < 1e-9 else "_g%s" % ("%g" % gap).replace(".", "")
    src = os.path.join(GF, "export", "fusion", tag)
    out = os.path.join(GF, "export", "print", tag)
    os.makedirs(out, exist_ok=True)
    name = "Gridfinity_Rugged_Case_%s" % tag
    lines = []
    for part, (suffix, qty, tf, note) in ORIENT.items():
        mesh = trimesh.load_mesh(os.path.join(src, part + ".stl"))
        if not mesh.is_watertight:
            print("WARNING: %s.stl from Fusion is not watertight - check the model (slivers, coincident faces)" % part)
        mesh.apply_transform(tf)
        lo, hi = mesh.bounds
        mesh.apply_translation([-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]])
        path = os.path.join(out, "%s_%s.stl" % (name, suffix))
        mesh.export(path)
        size = mesh.extents
        fits = size[0] <= bed and size[1] <= bed
        lines.append("| %s | %d | %.1f x %.1f x %.1f | %s | %s |" % (
            os.path.basename(path), qty, size[0], size[1], size[2], note, "fits" if fits else "**TOO BIG for %g bed**" % bed))
        print("%-46s %.1f x %.1f x %.1f mm  %s" % (os.path.basename(path), *size, "" if fits else "TOO BIG"))
    li, wi = 42 * x, 42 * y
    svg = os.path.join(out, "%s_Window_%.2fmm.svg" % (name, wt))
    with open(svg, "w", encoding="utf-8") as f:
        f.write(window_svg(li - 4, wi - 4, 0.2))
    print("%-46s %.1f x %.1f mm cut outline" % (os.path.basename(svg), li - 4, wi - 4))
    pause = 1.2 + wt + gap
    sheet = [
        "# Gridfinity Rugged Case %s - build sheet" % tag,
        "",
        "Generated from the Fusion port (Gridfinity/fusion). Inner space %d x %d mm (%d x %d Gridfinity cells), %d height units." % (li, wi, x, y, n),
        "",
        "| File | Qty | Size mm (print orientation) | Orientation | Bed %g |" % bed,
        "|---|---|---|---|---|",
    ] + lines + [
        "| %s | 1 | %.1f x %.1f x %.2f | laser-cut plexiglass, cut on the red line | - |" % (os.path.basename(svg), li - 4, wi - 4, wt),
        "",
        "## Window insert (print pause)",
        "The lid prints upside down. Add a pause (M601 / 'Add pause' in PrusaSlicer) at the first layer **above %.2f mm**," % pause,
        "i.e. when the top ribs and the open window pocket (%.2f mm deep = %.2f plexiglass + %.2f gap) are finished." % (wt + gap, wt, gap),
        "Drop the plexiglass in (protective film off) and resume: the next layers bridge %.2f mm above the plexiglass and lock it in." % gap,
        "With 0.2 mm layers put the pause before the first layer that starts at or above %.2f mm." % pause,
        "",
        "## Hardware",
        "- 6 x M3 x 30 screws: 2 hinge pins (back), 2 latch pivots (lid, front), 2 latch catches (base, front).",
        "  The screw goes in through the 3.4 mm hole at the case end and threads into the 2.85 mm hole towards the centre.",
        "- Seal in TPU, pressed into the groove on the base rim.",
    ]
    with open(os.path.join(out, "BUILD_SHEET.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(sheet) + "\n")
    print("build sheet:", os.path.join(out, "BUILD_SHEET.md"))


if __name__ == "__main__":
    main(sys.argv)
