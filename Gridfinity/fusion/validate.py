"""Regression check of the Fusion port: rebuild every reference configuration, compare it exactly (B-rep booleans)
with the imported Onshape STEP, check the exported STLs, and write Gridfinity/fusion/VALIDATION.md.

Needs Fusion running (MCP server) and the reference STEPs in Gridfinity/reference/<tag>/case_<tag>.step.
Usage: python -I Gridfinity/fusion/validate.py [3x2x4 5x4x6 8x6x8 5x4x6_w075]
Takes ~1 min per small configuration, ~4 min for 8x6x8. Rebuilds the default 5x4x6 at the end.
"""
import datetime
import io
import os
import re
import sys
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "tools"))
import build  # noqa: E402
import stl_check  # noqa: E402

CONFIGS = ["3x2x4", "5x4x6", "8x6x8", "5x4x6_w075"]
PARTS = ["Base", "Lid", "Latch", "Seal", "Window"]
LINE = re.compile(r"\[(\w+)\] volume ref ([\d.]+) build ([\d.]+) cm3")
LUMP = re.compile(r"(ref - build|build - ref) \(\w+ in build\): ([\d.]+) cm3")


def run(tag):
    size, _, w = tag.partition("_w")
    argv = ["build.py", size, "--gap", "0", "--force", "--steps", "doc,base,lid,latch,seal,window,ref,bdiff,export", "--faces", ",".join(PARTS)]
    if w:
        argv += ["--wt", str(float(w[0] + "." + w[1:]))]
    buf = io.StringIO()
    with redirect_stdout(buf):
        try:
            build.main(argv)
        except SystemExit as e:
            if e.code:
                print("BUILD FAILED", e.code)
    text = buf.getvalue()
    rows, cur = {}, None
    for line in text.splitlines():
        m = LINE.search(line)
        if m:
            cur = m.group(1)
            rows[cur] = {"ref": float(m.group(2)), "build": float(m.group(3))}
            continue
        m = LUMP.search(line)
        if m and cur:
            rows[cur]["missing" if m.group(1) == "ref - build" else "extra"] = float(m.group(2))
    export_dir = os.path.join(ROOT, "Gridfinity", "export", "fusion", tag + "_g0")
    for part in rows:
        path = os.path.join(export_dir, part + ".stl")
        rows[part]["watertight"] = os.path.exists(path) and "watertight" in stl_check.check(path)
    return rows, text


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    configs = argv[1:] or CONFIGS
    out = ["# Fusion port validation", "",
           "Exact B-rep comparison (Fusion TemporaryBRepManager booleans) of every part against the Onshape reference STEP,",
           "built with window_gap = 0 (the Onshape original; the default 0.2 gap only deepens the lid's window pocket),",
           "run %s by `Gridfinity/fusion/validate.py`. Volumes in cm3; *missing* = ref - build, *extra* = build - ref." % datetime.date.today(),
           "", "| Config | Part | V ref | V build | diff | missing | extra | STL watertight |", "|---|---|---|---|---|---|---|---|"]
    worst = 0.0
    for tag in configs:
        rows, text = run(tag)
        if "BUILD FAILED" in text or not rows:
            print(text)
            out.append("| %s | **build failed** | | | | | | |" % tag)
            continue
        for part in PARTS:
            r = rows.get(part)
            if not r:
                out.append("| %s | %s | missing | | | | | |" % (tag, part))
                continue
            d = r["build"] - r["ref"]
            worst = max(worst, abs(d), r.get("missing", 0), r.get("extra", 0))
            out.append("| %s | %s | %.4f | %.4f | %+.5f | %.5f | %.5f | %s |" % (
                tag, part, r["ref"], r["build"], d, r.get("missing", 0), r.get("extra", 0), "yes" if r["watertight"] else "**no**"))
            print("%-11s %-6s diff %+.5f  missing %.5f  extra %.5f  watertight %s" % (
                tag, part, d, r.get("missing", 0), r.get("extra", 0), r["watertight"]))
    out += ["", "Largest deviation: %.5f cm3." % worst, "",
            "Known, accepted deviations:",
            "- Lid: the 0.5 x 2 lead-in on the front inner edge is not faded out over the two front corner arcs (Onshape lofts it to zero there): +2.3 mm3.",
            "- Base: pocket corners differ by rounding of the 4.646 / 2.15 profile values: about -0.05 mm3 per cell.",
            "- Lid: top openings about +0.07 mm3 per cell (offset rounding); Latch about 0.2 mm3 (sketch coordinates rounded to 0.001 mm)."]
    with open(os.path.join(HERE, "VALIDATION.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print("written", os.path.join(HERE, "VALIDATION.md"))
    if configs[-1] != "5x4x6":
        build.main(["build.py", "5x4x6", "--steps", "doc,base,lid,latch,seal,window,export"])


if __name__ == "__main__":
    main(sys.argv)
