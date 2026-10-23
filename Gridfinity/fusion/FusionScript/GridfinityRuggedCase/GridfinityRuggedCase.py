"""Fusion script: build the Gridfinity Rugged Case into the active design.

Install once: Fusion > Utilities > Add-Ins > Scripts and Add-Ins > "+" next to My Scripts > select this folder.
Run: pick "GridfinityRuggedCase", enter x, y, z (Gridfinity units), the window thickness and (optional) the window gap.
Uses the same build code as Gridfinity/fusion/build.py (tools/fusion_lib.py, cad/_case.py, cad/10..50_*.py),
so the workspace must stay at its location relative to this script.
"""
import json
import os
import traceback

import adsk.core
import adsk.fusion

HERE = os.path.dirname(os.path.realpath(__file__))  # realpath: also works when Fusion starts it through a folder link
FUSION_DIR = os.path.abspath(os.path.join(HERE, "..", ".."))
ROOT = os.path.abspath(os.path.join(FUSION_DIR, "..", ".."))
LIB = [os.path.join(ROOT, "tools", "fusion_lib.py"), os.path.join(FUSION_DIR, "cad", "_case.py")]
STEPS = ["10_base.py", "20_lid.py", "30_latch.py", "40_seal.py", "50_window.py"]
SPEC = os.path.join(ROOT, "Gridfinity", "spec", "case_params.json")


def _read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def _ask(ui, spec, current):
    p = spec["parameters"]
    keys = ("x_count", "y_count", "z_count", "window_t", "window_gap")
    default = "%d, %d, %d, %g, %g" % tuple(current.get(k, p[k]["default"]) for k in keys)
    text, cancelled = ui.inputBox("x, y, z (Gridfinity units), window thickness mm, window gap mm\n"
                                  "ranges: x %d-%d, y %d-%d, z %d-%d, window %.2f-%.2f, gap %.1f-%.1f (0 = Onshape original)" % (
                                      p["x_count"]["min"], p["x_count"]["max"], p["y_count"]["min"], p["y_count"]["max"],
                                      p["z_count"]["min"], p["z_count"]["max"], p["window_t"]["min"], p["window_t"]["max"],
                                      p["window_gap"]["min"], p["window_gap"]["max"]),
                                  "Gridfinity Rugged Case", default)
    if cancelled:
        return None
    vals = [v.strip() for v in text.replace(";", ",").split(",")]
    cfg = {"x_count": int(vals[0]), "y_count": int(vals[1]), "z_count": int(vals[2]), "window_t": float(vals[3]),
           "window_gap": float(vals[4]) if len(vals) > 4 else p["window_gap"]["default"]}
    for k, v in cfg.items():
        if not p[k]["min"] <= v <= p[k]["max"]:
            raise ValueError("%s = %s is outside %s..%s" % (k, v, p[k]["min"], p[k]["max"]))
    return cfg


def outer_size(cfg):
    return 42 * cfg["x_count"] + 8.52, 42 * cfg["y_count"] + 22.52


def build(cfg):
    """Build all parts into the active design (no UI; also used for testing over MCP)."""
    lib = "\n\n".join(_read(p) for p in LIB)
    export_dir = os.path.join(ROOT, "Gridfinity", "export", "fusion")
    exec(compile(lib + "\n\nensure_case_params(CFG)\n", "case_lib", "exec"), {"CFG": cfg, "EXPORT_DIR": export_dir})
    for step in STEPS:
        ns = {"CFG": cfg, "EXPORT_DIR": export_dir}
        exec(compile(lib + "\n\n" + _read(os.path.join(FUSION_DIR, "cad", step)), step, "exec"), ns)
        ns["run"]("")


def run(_context):
    app = adsk.core.Application.get()
    ui = app.userInterface
    try:
        design = adsk.fusion.Design.cast(app.activeProduct)
        if design is None:
            ui.messageBox("Open or create a Fusion design first.")
            return
        spec = json.loads(_read(SPEC))
        current = {}
        for k in ("x_count", "y_count", "z_count", "window_t", "window_gap"):
            prm = design.userParameters.itemByName(k)
            if prm is not None:
                current[k] = prm.value * 10.0 if prm.unit == "mm" else prm.value
        cfg = _ask(ui, spec, current)
        if cfg is None:
            return
        outer = outer_size(cfg)
        if max(outer) > 360:
            if ui.messageBox("Outer size %.1f x %.1f mm exceeds a 360 mm bed. Build anyway?" % outer, "Gridfinity Rugged Case",
                             adsk.core.MessageBoxButtonTypes.YesNoButtonType) != adsk.core.DialogResults.DialogYes:
                return
        build(cfg)
        app.activeViewport.fit()
        ui.messageBox("Gridfinity Rugged Case %d x %d x %d (window %.2f mm, gap %.2f mm) built.\nOuter size %.1f x %.1f mm.\n"
                      "Print pause for the window at %.2f mm (lid printed upside down)." % (
                          cfg["x_count"], cfg["y_count"], cfg["z_count"], cfg["window_t"], cfg["window_gap"], outer[0], outer[1],
                          1.2 + cfg["window_t"] + cfg["window_gap"]))
    except Exception:  # noqa: BLE001 - show any failure in Fusion
        ui.messageBox("Failed:\n%s" % traceback.format_exc())
