"""Set the Fusion camera (and optionally hide components), then take a screenshot.

Usage:
  python -I tools/fusion_view.py <out.png> --eye x,y,z --target x,y,z [--up 0,0,1] [--size 1600x1200]
         [--hide name1,name2] [--show-only name1,name2] [--transparent] [--ortho]
Coordinates in mm (model space). Without --size the viewport size is used.
Hidden components stay hidden; run again with --hide "" to show everything.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fusion_mcp  # noqa: E402

SCRIPT = r'''
import adsk.core, adsk.fusion
def run(_context: str):
    app = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(app.activeProduct)
    root = design.rootComponent
    a = ARGS
    for i in range(root.occurrences.count):
        occ = root.occurrences.item(i)
        name = occ.component.name
        if a["show_only"]:
            occ.isLightBulbOn = name in a["show_only"]
        elif a["hide"] is not None:
            occ.isLightBulbOn = name not in a["hide"]
    vp = app.activeViewport
    cam = vp.camera
    cam.isSmoothTransition = False
    cam.cameraType = adsk.core.CameraTypes.OrthographicCameraType if a["ortho"] else adsk.core.CameraTypes.PerspectiveCameraType
    cam.eye = adsk.core.Point3D.create(*[v / 10.0 for v in a["eye"]])
    cam.target = adsk.core.Point3D.create(*[v / 10.0 for v in a["target"]])
    cam.upVector = adsk.core.Vector3D.create(*a["up"])
    cam.isFitView = True
    vp.camera = cam
    vp.refresh()
    print("camera set")
'''


def vec(s):
    return [float(v) for v in s.split(",")]


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) < 2:
        raise SystemExit(__doc__)
    out = argv[1]
    opt = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d  # noqa: E731
    args = {
        "eye": vec(opt("--eye", "400,-600,400")),
        "target": vec(opt("--target", "0,0,0")),
        "up": vec(opt("--up", "0,0,1")),
        "hide": None if opt("--hide") is None else [n for n in opt("--hide").split(",") if n],
        "show_only": [n for n in opt("--show-only", "").split(",") if n],
        "ortho": "--ortho" in argv,
    }
    res = fusion_mcp.run_script(SCRIPT.replace("ARGS", json.dumps(args).replace("null", "None").replace("true", "True").replace("false", "False")))
    print(fusion_mcp._texts(res).strip())
    shot = ["fusion_mcp.py", "screenshot", "current", out]
    if opt("--size"):
        shot += opt("--size").split("x")
    if "--transparent" in argv:
        shot.append("--transparent")
    fusion_mcp.main(shot)


if __name__ == "__main__":
    main(sys.argv)
