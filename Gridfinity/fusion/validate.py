"""Regression check: rebuild every reference configuration, compare it exactly (B-rep booleans in Fusion) with the
imported Onshape STEP, check the exported STLs, and write a VALIDATION.md.

  python -I Gridfinity/fusion/validate.py [configs]         Fusion port  -> Gridfinity/fusion/VALIDATION.md
  python -I Gridfinity/fusion/validate.py --web [configs]   browser generator (node build -> STEP -> Fusion import)
                                                            -> Gridfinity/web/VALIDATION.md
Configs default to 3x2x4 5x4x6 8x6x8 5x4x6_w075. Needs Fusion running (MCP server) and the reference STEPs in
Gridfinity/reference/<tag>/case_<tag>.step. Fusion mode rebuilds the default 5x4x6 at the end.
"""
import datetime
import io
import os
import re
import subprocess
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
FAILED = re.compile(r"(ref - build|build - ref) \(\w+ in build\): boolean failed \((\S+)\)")


def num(v):
    return v if isinstance(v, (int, float)) else 0.0


def cell(v):
    return "%.5f" % v if isinstance(v, (int, float)) else v


def run(tag, web=False):
    size, _, w = tag.partition("_w")
    wt = ["--wt", str(float(w[0] + "." + w[1:]))] if w else []
    if web:
        # browser generator: build headless with node, then import its STEP into Fusion and compare
        node = subprocess.run(["node", "node/build.mjs", size, "--gap", "0", "--force"] + wt, cwd=os.path.join(ROOT, "Gridfinity", "web"),
                              capture_output=True, text=True, encoding="utf-8")
        timing = {m.group(1): int(m.group(2)) for m in re.finditer(r"^(\w+) .* (\d+) ms$", node.stdout, re.M)}
        if node.returncode:
            return {}, "NODE BUILD FAILED\n" + node.stdout[-2000:] + node.stderr[-2000:]
        export_dir = os.path.join(ROOT, "Gridfinity", "export", "web", tag + "_g0")
        argv = ["build.py", size, "--gap", "0", "--force", "--steps", "web,ref,bdiff", "--against", "web",
                "--web-step", os.path.join(export_dir, "case.step"), "--faces", ",".join(PARTS)] + wt
    else:
        timing = {}
        export_dir = os.path.join(ROOT, "Gridfinity", "export", "fusion", tag + "_g0")
        argv = ["build.py", size, "--gap", "0", "--force", "--steps", "doc,base,lid,latch,seal,window,ref,bdiff,export",
                "--faces", ",".join(PARTS)] + wt
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
            continue
        m = FAILED.search(line)
        if m and cur:  # exact boolean impossible (near-coincident edges): keep the exact volume difference only
            rows[cur]["missing" if m.group(1) == "ref - build" else "extra"] = "n/a (%s)" % m.group(2)
    for part in rows:
        path = os.path.join(export_dir, part + ".stl")
        rows[part]["watertight"] = os.path.exists(path) and "watertight" in stl_check.check(path)
        rows[part]["ms"] = timing.get(part)
    return rows, text


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    web = "--web" in argv
    configs = [a for a in argv[1:] if a != "--web"] or CONFIGS
    what = "Browser generator (Gridfinity/web, replicad / OpenCascade) - STEP export imported into Fusion" if web else "Fusion port"
    out = ["# %s validation" % ("Browser generator" if web else "Fusion port"), "",
           "%s: exact B-rep comparison (Fusion TemporaryBRepManager booleans) of every part against the Onshape reference STEP," % what,
           "built with window_gap = 0 (the Onshape original; the default 0.2 gap only deepens the lid's window pocket),",
           "run %s by `Gridfinity/fusion/validate.py%s`. Volumes in cm3; *missing* = ref - build, *extra* = build - ref." % (
               datetime.date.today(), " --web" if web else ""),
           "", "| Config | Part | V ref | V build | diff | missing | extra | STL watertight |%s" % (" build ms |" if web else ""),
           "|---|---|---|---|---|---|---|---|%s" % ("---|" if web else "")]
    worst = 0.0
    for tag in configs:
        rows, text = run(tag, web)
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
            miss, extra = r.get("missing", 0.0), r.get("extra", 0.0)
            worst = max(worst, abs(d), num(miss), num(extra))
            out.append("| %s | %s | %.4f | %.4f | %+.5f | %s | %s | %s |%s" % (
                tag, part, r["ref"], r["build"], d, cell(miss), cell(extra), "yes" if r["watertight"] else "**no**",
                (" %s |" % r["ms"]) if web else ""))
            print("%-11s %-6s diff %+.5f  missing %s  extra %s  watertight %s" % (tag, part, d, cell(miss), cell(extra), r["watertight"]))
    out += ["", "Largest deviation: %.5f cm3." % worst, "",
            "Known, accepted deviations:",
            "- Lid: the 0.5 x 2 lead-in on the front inner edge is not faded out over the two front corner arcs (Onshape lofts it to zero there): +2.3 mm3.",
            "- Base: pocket corners differ by rounding of the 4.646 / 2.15 profile values: about -0.05 mm3 per cell.",
            "- Lid: top openings about +0.07 mm3 per cell (offset rounding); Latch about 0.2 mm3 (sketch coordinates rounded to 0.001 mm)."]
    if web:
        out.append("- Lid (browser only): the r 1 rib top-edge rounds are cut explicitly (OpenCascade's fillet follows tangent chains), "
                   "starting 0.05 mm outside the lid's top-fillet tangent so the STL stays watertight; their ends differ from Parasolid's "
                   "fillet ends by about 0.1-0.2 mm3 each. Edges of both lids then lie so close together that Fusion's exact boolean "
                   "(ASM_EDGECOIN_PROBLEM) cannot split the difference into missing/extra; the volume difference stays exact.")
    target = os.path.join(ROOT, "Gridfinity", "web", "VALIDATION.md") if web else os.path.join(HERE, "VALIDATION.md")
    with open(target, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print("written", target)
    if not web and configs[-1] != "5x4x6":
        build.main(["build.py", "5x4x6", "--steps", "doc,base,lid,latch,seal,window,export"])


if __name__ == "__main__":
    main(sys.argv)
