"""Patch s10_e10: rope lugs scale with the top window (small stars), and an E10 variant of the lamp plate:
the same plate without the E27 hole, with a sleeve below it for a pre-wired E10 holder (collar on a 45 deg seat)."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
cmds = []
add = lambda c, p: cmds.append({"command": c, "params": p})

add("parameters.change", {"changes": {"dg": "min(14 mm, 0.47*Xc)", "dr": "min(7 mm, dg/2)"},
                          "comments": {"dg": "rope lug depth along the diagonal (scales with the top window up to 14 mm)",
                                       "dr": "rope hole (half the lug depth, up to 7 mm)"}})
for name, expr, comment in (
        ("holeS", "15.4 mm", "E10 sleeve bore (holder collar 15.1)"),
        ("ledS", "12 mm", "E10 sleeve: seat for the collar, bulb passage"),
        ("hlS", "24 mm", "E10 holder length"),
        ("slw", "1.6 mm", "E10 sleeve wall"),
        ("hcl", "(holeS - ledS)/2", "E10 seat height (45 deg)"),
        ("shs", "hlS + 0.5 mm + hcl - tpl", "E10 sleeve below the plate (the holder ends flush with the plate top)"),
        ("z0s", "zr - shs", "E10 sleeve bottom in the point frame")):
    add("parameters.add", {"name": name, "expression": expr, "comment": comment})
# the E27 hole becomes the last feature of the lamp plate; the E10 copy is taken just before it
add("timeline.reorder", {"feature": "LampHolderHole", "position": 151})
add("timeline.roll_to", {"feature": "LampSnaps"})
add("solid.move", {"bodies": ["LampPlate"], "copy": True, "translate": ["0 mm", "0 mm", "0 mm"], "name": "LampE10Copy",
                   "body_name": "LampPlateE10"})
add("solid.cylinder", {"radius": "holeS/2 + slw", "height": "shs + tpl", "base": ["0 mm", "0 mm", "z0s"],
                       "operation": "join", "targets": ["LampPlateE10"], "name": "LampSleeve"})
add("solid.cylinder", {"radius": "holeS/2", "height": "shs - hcl + tpl + 1 mm", "base": ["0 mm", "0 mm", "z0s + hcl"],
                       "operation": "cut", "targets": ["LampPlateE10"], "name": "LampSleeveBore"})
# seat profile on XZ (sketch y = -Z), revolved about Z
pts = [["0*a", "-(z0s - 1 mm)"], ["ledS/2", "-(z0s - 1 mm)"], ["ledS/2", "-(z0s)"], ["holeS/2", "-(z0s + hcl)"],
       ["holeS/2", "-(z0s + hcl + 0.5 mm)"], ["0*a", "-(z0s + hcl + 0.5 mm)"]]
add("sketch.create", {"plane": "XZ", "name": "LampSeatSk"})
add("sketch.line", {"points": pts, "closed": True})
add("sketch.finish", {})
add("solid.revolve", {"sketch": "LampSeatSk", "axis": "Z", "operation": "cut", "targets": ["LampPlateE10"],
                      "name": "LampSleeveSeat"})
add("timeline.roll_to", {})
json.dump({"commands": cmds}, open(os.path.join(HERE, "s10_e10.json"), "w"), indent=1)
print(len(cmds), "commands")
