"""SolidCraft scripts for the core-star concept: stage files s1_params.json ... s6_assembly.json."""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom import faces, axis_angle

HERE = os.path.dirname(os.path.abspath(__file__))
stages = {}
cur = None


def stage(name):
    global cur
    cur = stages.setdefault(name, [])


def add(c, p):
    cur.append({"command": c, "params": p})


def par(name, expr, comment, unit=None):
    p = {"name": name, "expression": expr, "comment": comment}
    if unit is not None:
        p["unit"] = unit
    add("parameters.add", p)


# ---------------------------------------------------------------- parameters
stage("s1_params")
par("D", "550 mm", "star diameter, tip to tip")
par("k", "3", "slenderness: square point height / edge a", "")
par("t", "0.9 mm", "point wall")
par("g", "0.2 mm", "fit: gap between neighbouring points and between plug and window")
par("w", "2.5 mm", "core strut: half width (each side of the radial plane through the edge)")
par("hf", "7 mm", "core strut depth below the face plane (the catch edge)")
par("er", "0.6 mm", "core ridge below the face planes (no knife edge)")
par("tw", "1.6 mm", "plug wall")
par("tf", "1.2 mm", "flare wall (45 deg seat)")
par("bp", "0.8 mm", "barb height beyond the plug wall (perpendicular)")
par("pre", "0.2 mm", "barb preload: its 45 deg catch face reaches this far behind the catch edge")
par("cr", "0.3 mm", "barb crest")
par("zb", "2.7 mm", "plug below the catch edge (barb zone)")
par("la", "12 mm", "snap arm length (fixed: the same snap at every size)")
par("sl", "0.6 mm", "slit width")
par("bw", "5 mm", "barb width along the arm")
par("rs", "(1 + sqrt(2))/2", "square face distance / a", "")
par("rt", "(3 + sqrt(2))/(2*sqrt(3))", "triangle face distance / a", "")
par("a", "D/2/(rs + k)", "edge of the rhombicuboctahedron")
par("Rs", "rs*a", "square face distance")
par("Rt", "rt*a", "triangle face distance")
par("hs", "k*a", "square point height above its face")
par("ht", "D/2 - Rt", "triangle point height above its face")
par("Z0", "hf + zb", "face plane in the point frame (plug end on the bed at z 0)")
par("dpl", "w + g/2", "plug outer wall: offset from the radial plane")
par("dpi", "dpl + tw", "plug inner wall: offset from the radial plane")
par("zcat", "Z0 - hf", "catch edge height in the point frame")
par("zs", "zcat + 0.6 mm", "arm top (slit bottom)")
for X, T, R, h in (("S", "0.5/rs", "Rs", "hs"), ("T", "1/(2*sqrt(3)*rt)", "Rt", "ht")):
    kind = "square" if X == "S" else "triangle"
    par(f"T{X}", T, f"{kind}: tan of the radial planes against the axis", "")
    par(f"c{X}", f"1/sqrt(1 + T{X}*T{X})", f"{kind}: cos of that angle", "")
    par(f"zc{X}", f"Z0 - {R}", f"{kind}: star centre in the point frame")
    par(f"wod{X}", f"{R}*T{X} - g/(2*c{X})", f"{kind}: pyramid base half width / inradius")
    par(f"zf{X}", f"(Z0 - wod{X} - zc{X}*T{X} - dpl/c{X})/(1 - T{X})", f"{kind}: flare meets plug (outside)")
    par(f"zfi{X}", f"(Z0 - wod{X} + tf*sqrt(2) - zc{X}*T{X} - dpi/c{X})/(1 - T{X})", f"{kind}: flare meets plug (inside)")
    par(f"q{X}", f"sqrt(1 + (wod{X}/{h})*(wod{X}/{h}))", f"{kind}: 1/cos of the pyramid wall tilt", "")
    par(f"zpi{X}", f"Z0 + (tf*sqrt(2) - t*q{X})/(1 + wod{X}/{h})", f"{kind}: flare meets pyramid (inside)")
    par(f"za{X}", f"Z0 + {h}*(1 - t*q{X}/wod{X})", f"{kind}: inner apex")
    par(f"zx{X}", f"(Z0 - wod{X} - zc{X}*T{X} - w/c{X})/(1 - T{X})", f"{kind}: core flank meets window wall")
    par(f"ztop{X}", f"zcat + (g/(2*c{X}) + pre)/(1 + T{X})", f"{kind}: barb top")
    par(f"zct{X}", f"zcat + (g/(2*c{X}) + pre - bp/c{X})/(1 + T{X})", f"{kind}: barb crest top")
    par(f"zcb{X}", f"zct{X} - cr", f"{kind}: barb crest bottom")
    par(f"zrb{X}", f"zcb{X} - (bp/c{X})/(1 - T{X})", f"{kind}: barb bottom (45 deg lower face)")


# helpers: the outward distance of a wall (offset dl from the radial plane) at height z
def sw(X, z, dl):
    return f"(({z}) - zc{X})*T{X} - ({dl})/c{X}"


def neg(e):
    return f"-({e})"


def square(h):
    return [[h, h], [neg(h), h], [neg(h), neg(h)], [h, neg(h)]]


def tri(r):
    return [[f"sqrt(3)*({r})", neg(r)], ["0*a", f"2*({r})"], [f"-sqrt(3)*({r})", neg(r)]]


def sk(name, z, pts=None, point=False, plane="XY"):
    add("sketch.create", {"plane": plane, "offset": z, "name": name})
    if point:
        add("sketch.point", {"point": ["0*a", "0*a"]})
    else:
        add("sketch.line", {"points": pts, "closed": True})
    add("sketch.finish", {})


def octagon(A):
    q = "(sqrt(2) - 1)"
    return [[A, f"{q}*({A})"], [f"{q}*({A})", A], [f"-{q}*({A})", A], [neg(A), f"{q}*({A})"],
            [neg(A), f"-{q}*({A})"], [f"-{q}*({A})", neg(A)], [f"{q}*({A})", neg(A)], [A, f"-{q}*({A})"]]


# ---------------------------------------------------------------- core shell
stage("s2_core")


def polyhedron(tag, As, At, body):
    for pl in ("XY", "XZ", "YZ"):
        add("sketch.create", {"plane": pl, "name": f"{tag}Oct{pl}"})
        add("sketch.line", {"points": octagon(As), "closed": True})
        add("sketch.finish", {})
        if pl == "XY":
            add("solid.extrude", {"distance": "2*Rs + 2 mm", "direction": "symmetric", "operation": "new",
                                  "name": f"{tag}Prism{pl}", "body_name": body})
        else:
            add("solid.extrude", {"distance": "2*Rs + 2 mm", "direction": "symmetric", "operation": "intersect",
                                  "targets": [body], "name": f"{tag}Prism{pl}"})
    o = f"({At})/sqrt(3)"
    for nm, org, ydir in (("U", [o, o, o], [1, 1, -2]), ("L", [o, o, neg(o)], [-1, -1, -2])):
        add("sketch.create", {"plane": {"origin": org, "x_dir": [1, -1, 0], "y_dir": ydir}, "name": f"{tag}TriPl{nm}"})
        add("sketch.line", {"points": square("2*a"), "closed": True})
        add("sketch.finish", {})
        add("solid.extrude", {"distance": "2*a", "operation": "cut", "targets": [body], "name": f"{tag}TriCut{nm}"})
    add("solid.pattern.circular", {"features": [f"{tag}TriCutU", f"{tag}TriCutL"], "axis": "Z", "count": 4,
                                   "name": f"{tag}TriCuts"})


polyhedron("Out", "Rs - er", "Rt - er", "Core")
polyhedron("In", "Rs - hf", "Rt - hf", "Inner")
add("solid.combine", {"target": "Core", "tools": ["Inner"], "operation": "cut", "name": "CoreHollow"})

# ---------------------------------------------------------------- windows
stage("s3_windows")
F = faces()
for X, poly, body, R in (("S", square, "WinSq", "Rs"), ("T", tri, "WinTri", "Rt")):
    z1, z2, zx = "Z0 - hf - 2 mm", "Z0 + 1 mm", f"zx{X} - 0.5 mm"
    sk(f"W{X}1", z1, poly(sw(X, z1, "w")))
    sk(f"W{X}2", z2, poly(sw(X, z2, "w")))
    add("solid.loft", {"sections": [{"sketch": f"W{X}1"}, {"sketch": f"W{X}2"}], "operation": "new",
                       "name": f"Win{X}Wall", "body_name": body})
    sk(f"F{X}1", zx, poly(f"wod{X} - (Z0 - ({zx}))"))
    sk(f"F{X}2", z2, poly(f"wod{X} + 1 mm"))
    add("solid.loft", {"sections": [{"sketch": f"F{X}1"}, {"sketch": f"F{X}2"}], "operation": "join",
                       "targets": [body], "name": f"Win{X}Flank"})
add("solid.loft", {"sections": [{"sketch": "WS1"}, {"sketch": "WS2"}], "operation": "new", "name": "WinTopWall",
                   "body_name": "WinTop"})


def tr(n, dist):
    R = "Rs" if dist < 1.25 else "Rt"
    return [f"{float(c):.12f}*({R} - Z0)" if abs(c) > 1e-12 else "0 mm" for c in n]


tools = []
counts = {"sq": 0, "tri": 0}
for f in F:
    ax, ang = axis_angle(f["R"])
    top = f["kind"] == "sq" and f["n"][2] > 0.999
    src = "WinTop" if top else ("WinSq" if f["kind"] == "sq" else "WinTri")
    counts[f["kind"]] += 1
    nm = "WinTopPlaced" if top else f"{src}_{counts[f['kind']]}"
    add("solid.move", {"bodies": [src], "copy": True, "axis": ax, "angle": f"{ang:.12f} deg",
                       "translate": tr(f["n"], f["dist"]), "name": nm, "body_name": nm})
    tools.append(nm)
add("solid.combine", {"target": "Core", "tools": tools + ["WinSq", "WinTri", "WinTop"], "operation": "cut",
                      "name": "CoreWindows"})

# ---------------------------------------------------------------- points
for X, poly, body, h, n in (("S", square, "PointSq", "hs", 4), ("T", tri, "PointTri", "ht", 3)):
    stage(f"s4_point{X}")
    sk(f"{X}O0", "0 mm", poly(sw(X, "0 mm", "dpl")))
    sk(f"{X}Of", f"zf{X}", poly(sw(X, f"zf{X}", "dpl")))
    sk(f"{X}Ob", "Z0", poly(f"wod{X}"))
    sk(f"{X}Tip", f"Z0 + {h}", point=True)
    add("solid.loft", {"sections": [{"sketch": f"{X}O0"}, {"sketch": f"{X}Of"}], "operation": "new",
                       "name": f"{X}Plug", "body_name": body})
    add("solid.loft", {"sections": [{"sketch": f"{X}Of"}, {"sketch": f"{X}Ob"}], "operation": "join",
                       "targets": [body], "name": f"{X}Flare"})
    add("solid.loft", {"sections": [{"sketch": f"{X}Ob"}, {"sketch": f"{X}Tip", "point": "p1"}], "operation": "join",
                       "targets": [body], "name": f"{X}Pyramid"})
    sk(f"{X}I0", "-1 mm", poly(sw(X, "-1 mm", "dpi")))
    sk(f"{X}If", f"zfi{X}", poly(sw(X, f"zfi{X}", "dpi")))
    sk(f"{X}Ip", f"zpi{X}", poly(f"wod{X} - tf*sqrt(2) - (Z0 - zpi{X})"))
    sk(f"{X}Ia", f"za{X}", point=True)
    add("solid.loft", {"sections": [{"sketch": f"{X}I0"}, {"sketch": f"{X}If"}], "operation": "cut",
                       "targets": [body], "name": f"{X}PlugIn"})
    add("solid.loft", {"sections": [{"sketch": f"{X}If"}, {"sketch": f"{X}Ip"}], "operation": "cut",
                       "targets": [body], "name": f"{X}FlareIn"})
    add("solid.loft", {"sections": [{"sketch": f"{X}Ip"}, {"sketch": f"{X}Ia", "point": "p1"}], "operation": "cut",
                       "targets": [body], "name": f"{X}PyramidIn"})
    # snap arm on the -y wall: horizontal slit above it, vertical slit at its free end (+x), barb near the free end
    lo = f"({sw(X, 'zs', 'dpi')}) - 0.5 mm"
    hi = f"({sw(X, 'zs + sl', 'dpl')}) + 0.5 mm"
    add("solid.box", {"length": "la + sl", "width": f"({hi}) - ({lo})", "height": "sl",
                      "center": ["sl/2", f"-(({hi}) + ({lo}))/2", "zs + sl/2"], "operation": "cut",
                      "targets": [body], "name": f"{X}SlitH"})
    lo = f"({sw(X, '-1 mm', 'dpi')}) - 0.5 mm"
    add("solid.box", {"length": "sl", "width": f"({hi}) - ({lo})", "height": "zs + sl + 1 mm",
                      "center": ["la/2 + sl/2", f"-(({hi}) + ({lo}))/2", "(zs + sl - 1 mm)/2"], "operation": "cut",
                      "targets": [body], "name": f"{X}SlitV"})
    s = lambda z: sw(X, z, "dpl")
    pts = [[f"-(({s(f'ztop{X}')}) - 0.6 mm)", f"ztop{X}"],
           [f"-({s(f'ztop{X}')})", f"ztop{X}"],
           [f"-(({s(f'zct{X}')}) + bp/c{X})", f"zct{X}"],
           [f"-(({s(f'zcb{X}')}) + bp/c{X})", f"zcb{X}"],
           [f"-({s(f'zrb{X}')})", f"zrb{X}"],
           [f"-(({s(f'zrb{X}')}) - 0.6 mm)", f"zrb{X}"]]
    add("sketch.create", {"plane": "YZ", "offset": "la/2 - 0.5 mm - bw", "name": f"{X}BarbSk"})
    add("sketch.line", {"points": pts, "closed": True})
    add("sketch.finish", {})
    add("solid.extrude", {"distance": "bw", "operation": "join", "targets": [body], "name": f"{X}Barb"})
    add("solid.pattern.circular", {"features": [f"{X}SlitH", f"{X}SlitV", f"{X}Barb"], "axis": "Z", "count": n,
                                   "name": f"{X}Snaps"})

# ---------------------------------------------------------------- assembly view (copies on the core)
stage("s6_assembly")
counts = {"sq": 0, "tri": 0}
for f in F:
    if f["kind"] == "sq" and f["n"][2] > 0.999:
        continue
    ax, ang = axis_angle(f["R"])
    src = "PointSq" if f["kind"] == "sq" else "PointTri"
    counts[f["kind"]] += 1
    nm = f"{src}_{counts[f['kind']]}"
    add("solid.move", {"bodies": [src], "copy": True, "axis": ax, "angle": f"{ang:.12f} deg",
                       "translate": tr(f["n"], f["dist"]), "name": "Asm" + nm, "body_name": nm})

for name, cmds in stages.items():
    json.dump({"commands": cmds}, open(os.path.join(HERE, name + ".json"), "w"), indent=1)
    print(name, len(cmds))
