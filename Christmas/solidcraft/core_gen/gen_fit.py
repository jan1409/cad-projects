"""SolidCraft script s8_fit: fit-test bodies (core crown, short points with notches, flipped lamp plate)."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
cmds = []
add = lambda c, p: cmds.append({"command": c, "params": p})


def par(name, expr, comment, unit=None):
    p = {"name": name, "expression": expr, "comment": comment}
    if unit is not None:
        p["unit"] = unit
    add("parameters.add", p)


par("fz", "a/2 - 6 mm", "fit test crown: lowest z (below the upper octagon struts)")
par("fx", "-(a/2 + 6 mm)", "fit test crown: lowest x (the top window and three upper squares stay whole)")
par("fh", "15 mm", "fit test points: pyramid kept above the face plane")
par("nd", "2", "fit test: notches on the short square point (1, 2, 3 = preload 0.1, 0.2, 0.3)", "")

# crown: a copy of the core cut to the upper part, turned over (printed on the top face)
add("solid.move", {"bodies": ["Core"], "copy": True, "translate": ["0 mm", "0 mm", "0 mm"], "name": "FitCrownCopy",
                   "body_name": "FitCrown"})
add("solid.box", {"length": "Rs + 2 mm - fx", "width": "2*Rs + 4 mm", "height": "Rs + 2 mm - fz",
                  "center": ["(Rs + 2 mm + fx)/2", "0 mm", "(Rs + 2 mm + fz)/2"], "operation": "intersect",
                  "targets": ["FitCrown"], "name": "FitCrownCut"})
add("solid.move", {"bodies": ["FitCrown"], "axis": [1, 0, 0], "angle": "180 deg",
                   "translate": ["0 mm", "0 mm", "Rs - er"], "name": "FitCrownPose"})

# short points
for src, dst, n in (("PointSq", "FitSq", True), ("PointTri", "FitTri", False)):
    add("solid.move", {"bodies": [src], "copy": True, "translate": ["0 mm", "0 mm", "0 mm"], "name": dst + "Copy",
                       "body_name": dst})
    add("solid.box", {"length": "4*a", "width": "4*a", "height": "2*a", "center": ["0 mm", "0 mm", "Z0 + fh + a"],
                      "operation": "cut", "targets": [dst], "name": dst + "Cut"})
add("solid.box", {"length": "1.2 mm", "width": "6 mm", "height": "3 mm",
                  "center": ["-3 mm", "-((Z0 + fh - zcS)*TS)", "Z0 + fh"], "operation": "cut", "targets": ["FitSq"],
                  "name": "FitNotch"})
add("solid.pattern.rectangular", {"features": ["FitNotch"], "dir1": [1, 0, 0], "count1": "nd", "spacing1": "3 mm",
                                  "name": "FitNotches"})

# lamp plate turned over (plate on the bed)
add("solid.move", {"bodies": ["LampPlate"], "copy": True, "axis": [1, 0, 0], "angle": "180 deg",
                   "translate": ["0 mm", "0 mm", "zr + tpl"], "name": "FitLampCopy", "body_name": "FitLamp"})

json.dump({"commands": cmds}, open(os.path.join(HERE, "s8_fit.json"), "w"), indent=1)
print(len(cmds), "commands")
