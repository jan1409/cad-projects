"""Patch s9_lamptube: the lamp plate's free snap tabs become a closed octagonal tube (like the points' plug).
The tube's diagonal faces run 0.5 mm inside the rope lugs, so it passes them; the arms stay on the four sides."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
cmds = []
add = lambda c, p: cmds.append({"command": c, "params": p})


def sw(z, dl):
    return f"(({z}) - zcS)*TS - ({dl})/cS"


def neg(e):
    return f"-({e})"


def sq(h):
    return [[h, h], [neg(h), h], [neg(h), neg(h)], [h, neg(h)]]


def sk(name, z, pts):
    add("sketch.create", {"plane": "XY", "offset": z, "name": name})
    add("sketch.line", {"points": pts, "closed": True})
    add("sketch.finish", {})


def corner(name, L, body):
    add("sketch.create", {"plane": "XY", "offset": "-2 mm", "name": name + "Sk"})
    add("sketch.line", {"points": [[f"{L} + 5 mm", "-5 mm"], ["2*a", "2*a"], ["-5 mm", f"{L} + 5 mm"]], "closed": True})
    add("sketch.finish", {})
    add("solid.extrude", {"distance": "zr + 6 mm", "operation": "cut", "targets": [body], "name": name})
    add("solid.pattern.circular", {"features": [name], "axis": "Z", "count": 4, "name": name + "s"})


add("timeline.roll_to", {"feature": "LampRopeHole"})
add("parameters.add", {"name": "dco", "expression": "sqrt(2)*Xc - dg - 0.5 mm",
                       "comment": "lamp plate tube: diagonal faces from the axis (0.5 mm inside the rope lugs)"})
sk("LTO0", "0 mm", sq(sw("0 mm", "dpl")))
sk("LTO1", "zr + 0.5 mm", sq(sw("zr + 0.5 mm", "dpl")))
add("solid.loft", {"sections": [{"sketch": "LTO0"}, {"sketch": "LTO1"}], "operation": "new", "name": "LampTubeOuter",
                   "body_name": "LampTube"})
corner("LampTubeCorner", "sqrt(2)*dco", "LampTube")
sk("LTI0", "-1 mm", sq(sw("-1 mm", "dpi")))
sk("LTI1", "zr + 1 mm", sq(sw("zr + 1 mm", "dpi")))
add("solid.loft", {"sections": [{"sketch": "LTI0"}, {"sketch": "LTI1"}], "operation": "new", "name": "LampTubeInner",
                   "body_name": "LampTubeIn"})
corner("LampTubeInCorner", "sqrt(2)*(dco - tw)", "LampTubeIn")
add("solid.combine", {"target": "LampTube", "tools": ["LampTubeIn"], "operation": "cut", "name": "LampTubeHollow"})
add("solid.combine", {"target": "LampPlate", "tools": ["LampTube"], "operation": "join", "name": "LampTube"})
add("timeline.roll_to", {})
add("timeline.edit", {"feature": "LampSnaps", "set": {"features": [133, 136, 137, 139]}})
add("timeline.delete", {"features": ["LampTab", "LampTabSk"]})
json.dump({"commands": cmds}, open(os.path.join(HERE, "s9_lamptube.json"), "w"), indent=1)
print(len(cmds), "commands")
