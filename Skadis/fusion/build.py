"""Build SKÅDIS models in Fusion through the Fusion MCP server.

Usage:
  python -I Skadis/fusion/build.py <model> [--steps doc,...] [--set name=value ...]
Models (default steps in brackets):
  fit-test      hook-tab fit tokens                        [doc,tokens,report,export]
  roll-test     hub test ring + 3 mini plugs (brake/click)  [doc,test,report,export]
  roll-holder   brackets, plug, board/roll context         [doc,bracket,plug,context,report,check,export]
--set overrides a parameter of Skadis/spec/skadis_params.json or of the model's spec, e.g. --set tab_w=4.4.
--steps pose --pose pulled|locked  (roll-holder) poses the plugs for pictures.
Each model has its own Fusion document, tagged skadis/role = <model>-build. Exports: Skadis/export/<model>/.
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SPEC = os.path.join(HERE, "..", "spec")
sys.path.insert(0, os.path.join(ROOT, "tools"))
import fusion_mcp  # noqa: E402

CAD = os.path.join(HERE, "cad")
LIB = [os.path.join(ROOT, "tools", "fusion_lib.py"), os.path.join(CAD, "_skadis.py")]
STEPS = {
    "doc": "00_doc.py",
    "report": "90_report.py",
    "export": "95_export.py",
    "tokens": "fit_test/10_tokens.py",
    "test": "roll_holder/05_test.py",
    "bracket": "roll_holder/10_bracket.py",
    "plug": "roll_holder/20_plug.py",
    "context": "roll_holder/30_context.py",
    "check": "roll_holder/80_check.py",
    "pose": "roll_holder/85_pose.py",
}
MODELS = {
    "fit-test": {"spec": None, "lib": [], "steps": ["doc", "tokens", "report", "export"]},
    "roll-test": {"spec": "roll_holder_params.json", "lib": ["roll_holder/_roll.py"],
                  "steps": ["doc", "test", "report", "export"]},
    "roll-holder": {"spec": "roll_holder_params.json", "lib": ["roll_holder/_roll.py"],
                    "steps": ["doc", "bracket", "plug", "context", "report", "check", "export"]},
}
TOKENS = {"widths": [4.4, 4.6, 4.8], "gaps": [5.1, 5.3, 5.5]}
TEST_BRAKES = [0.5, 1.0, 1.5]


def defaults(name):
    spec = json.load(open(os.path.join(SPEC, name), encoding="utf-8"))["parameters"]
    return {k: v["default"] for k, v in spec.items()}, spec


def run_step(model, step, cfg, export_dir):
    parts = []
    for path in LIB + [os.path.join(CAD, p) for p in MODELS[model]["lib"]] + [os.path.join(CAD, STEPS[step])]:
        with open(path, encoding="utf-8") as f:
            parts.append(f.read())
    head = "CFG = %s\nEXPORT_DIR = %r\n" % (json.dumps(cfg), export_dir)
    t0 = time.time()
    result = fusion_mcp.run_script(head + "\n\n".join(parts))
    text = fusion_mcp._texts(result)
    ok = not result.get("isError") and '"success": false' not in text
    print("=== %s (%.1f s) %s" % (step, time.time() - t0, "" if ok else "FAILED"))
    print(text.rstrip())
    return ok


def main(argv):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) < 2 or argv[1] not in MODELS:
        raise SystemExit(__doc__)
    model = argv[1]
    sk, sk_spec = defaults("skadis_params.json")
    params, spec = defaults(MODELS[model]["spec"]) if MODELS[model]["spec"] else ({}, {})
    for i, a in enumerate(argv):
        if a == "--set":
            k, v = argv[i + 1].split("=")
            target, tspec = (sk, sk_spec) if k in sk else (params, spec) if k in params else (None, None)
            if target is None:
                raise SystemExit("unknown parameter: " + k)
            v = float(v)
            lo, hi = tspec[k].get("min", -1e9), tspec[k].get("max", 1e9)
            if not lo <= v <= hi:
                raise SystemExit("%s = %g is outside %g..%g" % (k, v, lo, hi))
            target[k] = v
    # numbers only: json.dumps of bools/None would not be valid Python in the prepended CFG line
    cfg = {"model": model, "skadis": sk, "params": params, "tokens": TOKENS, "test_brakes": TEST_BRAKES,
           "pose": argv[argv.index("--pose") + 1] if "--pose" in argv else "locked"}
    steps = argv[argv.index("--steps") + 1].split(",") if "--steps" in argv else MODELS[model]["steps"]
    export_dir = os.path.join(ROOT, "Skadis", "export", model)
    os.makedirs(export_dir, exist_ok=True)
    for step in steps:
        if not run_step(model, step, cfg, export_dir):
            sys.exit(1)


if __name__ == "__main__":
    main(sys.argv)
