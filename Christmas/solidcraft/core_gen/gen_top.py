"""SolidCraft script s7_top: rope lugs in the core's top window, lamp plate, top point half + sleeve, assembly copies.
All parts in the square point frame (plug end z 0, face plane Z0); placed with the top face's transform."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom import faces, axis_angle, rot
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
cmds = []
add = lambda c, p: cmds.append({"command": c, "params": p})


def par(name, expr, comment, unit=None):
    p = {"name": name, "expression": expr, "comment": comment}
    if unit is not None:
        p["unit"] = unit
    add("parameters.add", p)


def neg(e):
    return f"-({e})"


def sq(h):
    return [[h, h], [neg(h), h], [neg(h), neg(h)], [h, neg(h)]]


def sk(name, z, pts=None, point=False, plane="XY"):
    add("sketch.create", {"plane": plane, "offset": z, "name": name})
    if point:
        add("sketch.point", {"point": ["0*a", "0*a"]})
    else:
        add("sketch.line", {"points": pts, "closed": True})
    add("sketch.finish", {})


def sw(z, dl):
    return f"(({z}) - zcS)*TS - ({dl})/cS"


par("tg", "3 mm", "rope lug thickness (core top window corners)")
par("dg", "14 mm", "rope lug depth along the diagonal from the window corner")
par("dr", "7 mm", "rope hole")
par("tpl", "2.4 mm", "lamp plate thickness")
par("hd", "41 mm", "lamp holder hole (E27 thread 40 x 2.5; set from the holder)")
par("wt", "16 mm", "lamp plate snap tab width")
par("ttp", "1.2 mm", "top point wall")
par("ws", "18 mm", "top point: outer width at the open top (rope + cable)")
par("hsl", "12 mm", "top sleeve height")
par("tsl", "1.2 mm", "top sleeve wall")
par("csl", "0.15 mm", "top sleeve clearance")
par("gsp", "0.2 mm", "gap between the top point halves")
par("wsl", "8 mm", "cable slot in the top sleeve")
par("zr", "Z0 - er", "top ring (flat seat) in the point frame")
par("Xc", "(zr - zcS)*TS - w/cS", "top window half width at the ring")
par("hb", "(zr - zcS)*TS - g/(2*cS)", "top point base half width (outside)")
par("hp", "hb - ttp - g", "lamp plate half width")
par("hc", "Xc - dg/(2*sqrt(2))", "rope hole centre (x = y) in the window corner")
par("qt", "sqrt(1 + (hb/(hs + er))*(hb/(hs + er)))", "top point: 1/cos of the wall tilt", "")
par("zt", "Z0 + hs - (hs + er)*(ws/2)/hb", "top point: open top")
par("zt1", "zt - hsl - 3 mm", "top point: inner wall starts to thicken")
par("zt2", "zt - hsl", "top point: spigot for the sleeve starts")


def hw(z, off="0 mm"):  # top point outer half width at height z, offset inward by `off` (perpendicular)
    return f"hb*(Z0 + hs - ({z}))/(hs + er) - ({off})*qt"


# ---------------- rope lugs in the core's top window (star frame: top face plane at Rs)
zr_star = "Rs - er"
X = "(Rs - er)*TS - w/cS"
P1 = [f"{X} + 1 mm", f"{X} + 1 mm"]
P2 = [f"{X} + 1 mm", f"{X} - sqrt(2)*dg - 1 mm"]
P3 = [f"{X} - sqrt(2)*dg - 1 mm", f"{X} + 1 mm"]
add("sketch.create", {"plane": "XY", "offset": zr_star, "name": "LugSk"})
add("sketch.line", {"points": [P1, P2, P3], "closed": True})
add("sketch.finish", {})
add("solid.extrude", {"distance": "tg", "direction": "negative", "operation": "join", "targets": ["Core"], "name": "Lug"})
hcs = f"({X}) - dg/(2*sqrt(2))"
add("solid.cylinder", {"radius": "dr/2", "height": "tg + 2 mm", "base": [hcs, hcs, f"{zr_star} - tg - 1 mm"],
                       "operation": "cut", "targets": ["Core"], "name": "LugHole"})
add("solid.pattern.circular", {"features": ["Lug", "LugHole"], "axis": "Z", "count": 4, "name": "Lugs"})

# ---------------- lamp plate (point frame)
add("solid.box", {"length": "2*hp", "width": "2*hp", "height": "tpl", "center": ["0 mm", "0 mm", "zr + tpl/2"],
                  "operation": "new", "name": "LampPlateBody", "body_name": "LampPlate"})
add("solid.cylinder", {"radius": "hd/2", "height": "tpl + 2 mm", "base": ["0 mm", "0 mm", "zr - 1 mm"],
                       "operation": "cut", "targets": ["LampPlate"], "name": "LampHolderHole"})
add("solid.cylinder", {"radius": "dr/2", "height": "tpl + 2 mm", "base": ["hc", "hc", "zr - 1 mm"],
                       "operation": "cut", "targets": ["LampPlate"], "name": "LampRopeHole"})
# snap tab on the -y side: the plug wall between the outer and inner wall planes, from the plug end up into the plate
zt_tab = "zr + 0.5 mm"
tab = [[neg(sw("0 mm", "dpl")), "0 mm"], [neg(sw(zt_tab, "dpl")), zt_tab],
       [neg(sw(zt_tab, "dpi")), zt_tab], [neg(sw("0 mm", "dpi")), "0 mm"]]
add("sketch.create", {"plane": "YZ", "name": "LampTabSk"})
add("sketch.line", {"points": tab, "closed": True})
add("sketch.finish", {})
add("solid.extrude", {"distance": "wt", "direction": "symmetric", "operation": "join", "targets": ["LampPlate"],
                      "name": "LampTab"})
lo = f"({sw('zs', 'dpi')}) - 0.5 mm"
hi = f"({sw('zs + sl', 'dpl')}) + 0.5 mm"
add("solid.box", {"length": "la + sl", "width": f"({hi}) - ({lo})", "height": "sl",
                  "center": ["sl/2", f"-(({hi}) + ({lo}))/2", "zs + sl/2"], "operation": "cut",
                  "targets": ["LampPlate"], "name": "LampSlitH"})
lo = f"({sw('-1 mm', 'dpi')}) - 0.5 mm"
add("solid.box", {"length": "sl", "width": f"({hi}) - ({lo})", "height": "zs + sl + 1 mm",
                  "center": ["la/2 + sl/2", f"-(({hi}) + ({lo}))/2", "(zs + sl - 1 mm)/2"], "operation": "cut",
                  "targets": ["LampPlate"], "name": "LampSlitV"})
s = lambda z: sw(z, "dpl")
pts = [[f"-(({s('ztopS')}) - 0.6 mm)", "ztopS"], [f"-({s('ztopS')})", "ztopS"],
       [f"-(({s('zctS')}) + bp/cS)", "zctS"], [f"-(({s('zcbS')}) + bp/cS)", "zcbS"],
       [f"-({s('zrbS')})", "zrbS"], [f"-(({s('zrbS')}) - 0.6 mm)", "zrbS"]]
add("sketch.create", {"plane": "YZ", "offset": "la/2 - 0.5 mm - bw", "name": "LampBarbSk"})
add("sketch.line", {"points": pts, "closed": True})
add("sketch.finish", {})
add("solid.extrude", {"distance": "bw", "operation": "join", "targets": ["LampPlate"], "name": "LampBarb"})
add("solid.pattern.circular", {"features": ["LampRopeHole", "LampTab", "LampSlitH", "LampSlitV", "LampBarb"],
                               "axis": "Z", "count": 4, "name": "LampSnaps"})

# ---------------- top point (one half; the other half is the same part turned 180 deg)
sk("TpO0", "zr", sq(hw("zr")))
sk("TpTip", "Z0 + hs", point=True)
add("solid.loft", {"sections": [{"sketch": "TpO0"}, {"sketch": "TpTip", "point": "p1"}], "operation": "new",
                   "name": "TopOuter", "body_name": "TopHalf"})
sk("TpI0", "zr - 1 mm", sq(hw("zr - 1 mm", "ttp")))
sk("TpI1", "zt1", sq(hw("zt1", "ttp")))
sk("TpI2", "zt2", sq(hw("zt2", "ttp + tsl")))
sk("TpI3", "zt + 1 mm", sq(hw("zt + 1 mm", "ttp + tsl")))
for nm, a_, b_ in (("TopInner1", "TpI0", "TpI1"), ("TopInner2", "TpI1", "TpI2"), ("TopInner3", "TpI2", "TpI3")):
    add("solid.loft", {"sections": [{"sketch": a_}, {"sketch": b_}], "operation": "cut", "targets": ["TopHalf"],
                       "name": nm})
add("solid.box", {"length": "4*a", "width": "4*a", "height": "2*a", "center": ["0 mm", "0 mm", "zt + a"],
                  "operation": "cut", "targets": ["TopHalf"], "name": "TopOpen"})
# spigot: the outer skin of the top hsl is taken off (sleeve wall + clearance)
sk("TpS0", "zt2", sq(hw("zt2", "tsl")))
sk("TpS1", "zt + 1 mm", sq(hw("zt + 1 mm", "tsl")))
add("solid.loft", {"sections": [{"sketch": "TpS0"}, {"sketch": "TpS1"}], "operation": "new", "name": "SpigotKeep",
                   "body_name": "SpigotKeep"})
add("solid.box", {"length": "4*a", "width": "4*a", "height": "hsl + 2 mm", "center": ["0 mm", "0 mm", "zt2 + hsl/2 + 1 mm"],
                  "operation": "new", "name": "SpigotBox", "body_name": "SpigotCut"})
add("solid.combine", {"target": "SpigotCut", "tools": ["SpigotKeep"], "operation": "cut", "name": "SpigotRing"})
add("solid.combine", {"target": "TopHalf", "tools": ["SpigotCut"], "operation": "cut", "name": "TopSpigot"})
# keep the half x - y > gsp/sqrt(2)
c = "gsp/sqrt(2)"
add("sketch.create", {"plane": "XY", "offset": "-1 mm", "name": "TopSplitSk"})
add("sketch.line", {"points": [["2*a", f"2*a - {c}"], ["-2*a", "2*a"], ["-2*a", f"-2*a - {c}"]], "closed": True})
add("sketch.finish", {})
add("solid.extrude", {"distance": "Z0 + hs + 10 mm", "operation": "cut", "targets": ["TopHalf"], "name": "TopSplit"})

# ---------------- top sleeve
sk("SlO0", "zt2", sq(hw("zt2")))
sk("SlO1", "zt", sq(hw("zt")))
add("solid.loft", {"sections": [{"sketch": "SlO0"}, {"sketch": "SlO1"}], "operation": "new", "name": "SleeveOuter",
                   "body_name": "TopSleeve"})
sk("SlI0", "zt2 - 1 mm", sq(hw("zt2 - 1 mm", "tsl - csl")))
sk("SlI1", "zt + 1 mm", sq(hw("zt + 1 mm", "tsl - csl")))
add("solid.loft", {"sections": [{"sketch": "SlI0"}, {"sketch": "SlI1"}], "operation": "cut", "targets": ["TopSleeve"],
                   "name": "SleeveInner"})
add("solid.box", {"length": "wsl", "width": "ws", "height": "hsl + 2 mm", "center": ["0 mm", "-ws/2", "zt2 + hsl/2"],
                  "operation": "cut", "targets": ["TopSleeve"], "name": "SleeveSlot"})

# ---------------- assembly copies on the top face
top = [f for f in faces() if f["kind"] == "sq" and f["n"][2] > 0.999][0]
tr = ["0 mm", "0 mm", "Rs - Z0"]
for src, R, nm in (("LampPlate", top["R"], "LampPlate_1"), ("TopHalf", top["R"], "TopHalf_1"),
                   ("TopHalf", top["R"] @ rot([0, 0, 1], 180), "TopHalf_2"), ("TopSleeve", top["R"], "TopSleeve_1")):
    ax, ang = axis_angle(R)
    add("solid.move", {"bodies": [src], "copy": True, "axis": ax, "angle": f"{ang:.12f} deg", "translate": tr,
                       "name": "Asm" + nm, "body_name": nm})

json.dump({"commands": cmds}, open(os.path.join(HERE, "s7_top.json"), "w"), indent=1)
print(len(cmds), "commands")
