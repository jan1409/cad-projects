"""Build the Gridfinity Rugged Case in Fusion through the Fusion MCP server.

Usage:
  python -I Gridfinity/fusion/build.py <XxYxZ> [--wt 1.6] [--gap 0.2] [--steps doc,base,lid,latch,seal,window,report,export]
  python -I Gridfinity/fusion/build.py 5x4x6 --steps selftest
  python -I Gridfinity/fusion/build.py 5x4x6 --steps bdiff --faces Base,Lid,Latch,Seal,Window
    (bdiff/faces: exact B-rep comparison with the imported reference STEP, which must be open in Fusion)
Default steps: doc,base,lid,latch,seal,window,report,export.
Exports go to Gridfinity/export/fusion/<XxYxZ>[_w<wt>][_g<gap>]/ (_g only for a non-default gap; --gap 0 = Onshape original).
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import fusion_mcp  # noqa: E402

LIB = [os.path.join(ROOT, "tools", "fusion_lib.py"), os.path.join(HERE, "cad", "_case.py")]
STEPS = {
    "selftest": "01_selftest.py",
    "doc": "00_doc.py",
    "base": "10_base.py",
    "lid": "20_lid.py",
    "latch": "30_latch.py",
    "seal": "40_seal.py",
    "window": "50_window.py",
    "report": "90_report.py",
    "ref": "91_ref.py",
    "faces": "92_faces.py",
    "bdiff": "93_bdiff.py",
    "export": "95_export.py",
    "save": "96_save.py",
    "web": "94_web.py",
}
DEFAULT_STEPS = ["doc", "base", "lid", "latch", "seal", "window", "report", "export"]


def run_step(step, cfg, export_dir):
    parts = []
    for path in LIB + [os.path.join(HERE, "cad", STEPS[step])]:
        with open(path, encoding="utf-8") as f:
            parts.append(f.read())
    head = "CFG = %s\nEXPORT_DIR = %r\n" % (json.dumps(cfg), export_dir)
    script = head + "\n\n".join(parts)
    t0 = time.time()
    result = fusion_mcp.run_script(script)
    text = fusion_mcp._texts(result)
    ok = not result.get("isError") and '"success": false' not in text
    print("=== %s (%.1f s) %s" % (step, time.time() - t0, "" if ok else "FAILED"))
    print(text.rstrip())
    return ok


def main(argv):
    if hasattr(sys.stdout, "reconfigure"):  # not when validate.py captures the output
        sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) < 2:
        raise SystemExit(__doc__)
    x, y, n = (int(v) for v in argv[1].lower().split("x"))
    wt = 1.6
    steps = DEFAULT_STEPS
    if "--wt" in argv:
        wt = float(argv[argv.index("--wt") + 1])
    if "--steps" in argv:
        steps = argv[argv.index("--steps") + 1].split(",")
    spec = json.load(open(os.path.join(ROOT, "Gridfinity", "spec", "case_params.json"), encoding="utf-8"))["parameters"]
    gap = float(argv[argv.index("--gap") + 1]) if "--gap" in argv else spec["window_gap"]["default"]
    cfg = {"x_count": x, "y_count": y, "z_count": n, "window_t": wt, "window_gap": gap}
    for k, v in cfg.items():
        # --force: build outside the user range (validation of the Onshape reference 3x2x4)
        if "--force" not in argv and not spec[k]["min"] <= v <= spec[k]["max"]:
            raise SystemExit("%s = %g is outside %g..%g" % (k, v, spec[k]["min"], spec[k]["max"]))
    if "--against" in argv:  # bdiff against "build" (default) or "web" (imported browser-generator STEP)
        cfg["against"] = argv[argv.index("--against") + 1]
    if "--web-step" in argv:
        cfg["web_step"] = os.path.abspath(argv[argv.index("--web-step") + 1])
    if "--faces" in argv:
        cfg["faces"] = argv[argv.index("--faces") + 1].split(",")
    tag = "%dx%dx%d" % (x, y, n) + ("" if abs(wt - 1.6) < 1e-9 else "_w%s" % str(wt).replace(".", ""))
    cfg["tag"] = tag  # reference configuration (Onshape exports have no gap)
    export_tag = tag + ("" if abs(gap - spec["window_gap"]["default"]) < 1e-9 else "_g%s" % ("%g" % gap).replace(".", ""))
    export_dir = os.path.join(ROOT, "Gridfinity", "export", "fusion", export_tag)
    os.makedirs(export_dir, exist_ok=True)
    for step in steps:
        if not run_step(step, cfg, export_dir):
            sys.exit(1)


if __name__ == "__main__":
    main(sys.argv)
