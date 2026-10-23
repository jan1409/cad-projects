# Shared helpers for the Gridfinity Rugged Case build (prepended after tools/fusion_lib.py).
# Geometry follows Gridfinity/spec/case_params.json; frame: z = 0 floor top, front (latches) = -Y.
import json

SPEC_PATH = r"D:\CreativeProjects\CAD_Projects\Gridfinity\spec\case_params.json"
with open(SPEC_PATH, encoding="utf-8") as _f:
    SPEC = json.load(_f)

INPUTS = ("x_count", "y_count", "z_count", "window_t", "window_gap")


def case_env():
    """Inputs from the design's user parameters + derived values from the spec."""
    env = {}
    for name in INPUTS:
        env[name] = par(name)
    for k, v in SPEC["derived"].items():
        env[k] = ev(v, env)
    return env


def ev(expr, env):
    return float(eval(str(expr), {"__builtins__": {}}, env))


def pts_sz(name, env):
    """Profile from the spec as [(s, z, r)]."""
    return [(ev(p["s"], env), ev(p["z"], env), float(p.get("r", 0))) for p in SPEC["profiles"][name]]


# ---------- 2-D polygon with rounded vertices (same math is used by the browser generator) ----------

def _unit(dx, dy):
    n = math.hypot(dx, dy)
    return dx / n, dy / n


def round_polygon(pts):
    """[(u, v, r)] closed polygon -> list of nodes; node = ('p', P) or ('a', T1, M, T2) for a rounded vertex."""
    nodes = []
    n = len(pts)
    for i, (u, v, r) in enumerate(pts):
        if r <= 0:
            nodes.append(("p", (u, v)))
            continue
        a = pts[i - 1]
        b = pts[(i + 1) % n]
        u1 = _unit(a[0] - u, a[1] - v)
        u2 = _unit(b[0] - u, b[1] - v)
        cos_t = max(-1.0, min(1.0, u1[0] * u2[0] + u1[1] * u2[1]))
        theta = math.acos(cos_t)
        d = r / math.tan(theta / 2)
        t1 = (u + u1[0] * d, v + u1[1] * d)
        t2 = (u + u2[0] * d, v + u2[1] * d)
        w = _unit(u1[0] + u2[0], u1[1] + u2[1])
        h = r / math.sin(theta / 2)
        c = (u + w[0] * h, v + w[1] * h)
        m = (c[0] - w[0] * r, c[1] - w[1] * r)
        nodes.append(("a", t1, m, t2))
    return nodes


def _end_near(curve, target):
    """The curve's sketch point nearest to target (Point3D) - arcs are stored CCW, so 'end' is not reliable."""
    sp, ep = curve.startSketchPoint, curve.endSketchPoint
    return sp if sp.geometry.distanceTo(target) < ep.geometry.distanceTo(target) else ep


def draw_polygon(sk, pts):
    """Draw a closed polygon with rounded vertices into Sk sk (plane coordinates u, v)."""
    nodes = round_polygon(pts)
    prims = []
    for i, nd in enumerate(nodes):
        if nd[0] == "a":
            prims.append(("arc", nd[1], nd[2], nd[3]))
        a = nd[1] if nd[0] == "p" else nd[3]
        b = nodes[(i + 1) % len(nodes)][1]
        if math.dist(a, b) > 1e-6:
            prims.append(("line", a, b))
    first = last = None
    for k, pr in enumerate(prims):
        start = last if last is not None else sk.p(*pr[1])
        end_target = sk.p(*pr[-1])
        end = first if (k == len(prims) - 1 and first is not None) else end_target
        if pr[0] == "line":
            c = sk.lines.addByTwoPoints(start, end)
        else:
            c = sk.arcs.addByThreePoints(start, sk.p(*pr[2]), end)
        if first is None:
            first = _end_near(c, sk.p(*pr[1]))
        last = _end_near(c, end_target)
    return sk


def rrect_c(sk, cx, cy, w, h, r):
    """Rounded rectangle centred at (cx, cy), size w x h, corner radius r (plane coordinates)."""
    if r <= 1e-6:
        draw_polygon(sk, [(cx - w / 2, cy - h / 2, 0), (cx + w / 2, cy - h / 2, 0), (cx + w / 2, cy + h / 2, 0), (cx - w / 2, cy + h / 2, 0)])
    else:
        sk.rrect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, r)


# ---------- grid ----------

def cell_centres(env):
    nx, ny = int(env["x_count"]), int(env["y_count"])
    return [(-env["Li"] / 2 + 21 + 42 * i, -env["Wi"] / 2 + 21 + 42 * j) for i in range(nx) for j in range(ny)]


def cell_sketch(comp, env, z, offset, name):
    """Sketch at height z with every cell outline offset inwards by `offset` (size 42-2o, r 4-o)."""
    sk = Sk(comp, "z", z, name)
    for cx, cy in cell_centres(env):
        rrect_c(sk, cx, cy, 42 - 2 * offset, 42 - 2 * offset, 4 - offset)
    return sk


def cavity_sketch(comp, env, z, name, grow=0.0):
    sk = Sk(comp, "z", z, name)
    rrect_c(sk, 0, 0, env["Li"] + 2 * grow, env["Wi"] + 2 * grow, 4 + grow)
    return sk


def profiles_of(sk, min_area_cm2=0.0):
    oc = adsk.core.ObjectCollection.create()
    for p in sk.profiles():
        if p.areaProperties().area > min_area_cm2:
            oc.add(p)
    return oc


def extrude_taper(comp, profiles, dist_mm, op, taper_deg=0.0, negative=False, bodies=None, name=None):
    """Extrude with taper. taper_deg > 0 widens the profile along the extrusion (verified in Fusion, see notes)."""
    ext = comp.features.extrudeFeatures
    ei = ext.createInput(profiles, op)
    direction = adsk.fusion.ExtentDirections.NegativeExtentDirection if negative else adsk.fusion.ExtentDirections.PositiveExtentDirection
    ei.setOneSideExtent(adsk.fusion.DistanceExtentDefinition.create(V(dist_mm)), direction,
                        adsk.core.ValueInput.createByString("%r deg" % (TAPER_SIGN * taper_deg)))
    if bodies is not None:
        ei.participantBodies = list(bodies)
    f = ext.add(ei)
    if name:
        f.name = name
    return f


TAPER_SIGN = 1.0  # Fusion: a positive taper angle widens the profile along the extrusion (checked by 01_selftest)


# ---------- walls ----------

def sweep_wall(comp, env, prof_pts, name, op=None):
    """Sweep a (s, z, r) profile along the cavity outline (corner r 4): profile drawn on the x = 0 plane at the +Y wall."""
    half_w = env["Wi"] / 2
    sk = Sk(comp, "x", 0.0, name + " profile")
    draw_polygon(sk, [(half_w + s, z, r) for s, z, r in prof_pts])
    prof = sk.largest_profile()
    path_sk = cavity_sketch(comp, env, 0.0, name + " path")
    curve = path_sk.sk.sketchCurves.item(0)
    path = comp.features.createPath(curve, True)  # Path.create fails for curves in sub-components
    sw = comp.features.sweepFeatures
    si = sw.createInput(prof, path, op if op is not None else NEW)
    si.orientation = adsk.fusion.SweepOrientationTypes.PerpendicularOrientationType
    f = sw.add(si)
    f.name = name
    return f


def prism_x(comp, env, side, prof_pts, x0, x1, op, name, bodies=None):
    """(s, z, r) polygon on the front (side=-1) or back (side=+1) wall, extruded along X from x0 to x1."""
    half_w = env["Wi"] / 2
    sk = Sk(comp, "x", x0, name)
    draw_polygon(sk, [(side * (half_w + s), z, r) for s, z, r in prof_pts])
    return extrude(comp, sk.largest_profile(), x1 - x0, op, bodies=bodies, name=name)


def prism_y(comp, env, side, prof_pts, y0, y1, op, name, bodies=None):
    """(s, z, r) polygon on the +X (side=+1) or -X (side=-1) end wall, extruded along Y from y0 to y1."""
    half_l = env["Li"] / 2
    sk = Sk(comp, "y", y0, name)
    draw_polygon(sk, [(side * (half_l + s), z, r) for s, z, r in prof_pts])
    # y-plane sketch: (u, v) = (x, z); its normal is +Y, extrude positive goes towards +Y
    return extrude(comp, sk.largest_profile(), y1 - y0, op, negative=Y_PLANE_NEGATIVE, bodies=bodies, name=name)


Y_PLANE_NEGATIVE = False  # xZ construction plane normal points to +Y (checked by 01_selftest)


def teardrop_x(comp, env, side, s, z, d, x0, x1, flat_up, bodies, name):
    """Horizontal hole along X with a print flat: truncated teardrop, flat at distance r from the centre."""
    half_w = env["Wi"] / 2
    sk = Sk(comp, "x", x0, name)
    y = side * (half_w + s)
    r = d / 2
    sgn = 1 if flat_up else -1
    k = r * (math.sqrt(2) - 1)  # half width of the flat
    t1 = (y - r / math.sqrt(2), z + sgn * r / math.sqrt(2))
    t2 = (y + r / math.sqrt(2), z + sgn * r / math.sqrt(2))
    f1 = (y - k, z + sgn * r)
    f2 = (y + k, z + sgn * r)
    bottom = (y, z - sgn * r)
    l1 = sk.lines.addByTwoPoints(sk.p(*t1), sk.p(*f1))
    l2 = sk.lines.addByTwoPoints(l1.endSketchPoint, sk.p(*f2))
    l3 = sk.lines.addByTwoPoints(l2.endSketchPoint, sk.p(*t2))
    sk.arcs.addByThreePoints(l3.endSketchPoint, sk.p(*bottom), l1.startSketchPoint)
    return extrude(comp, sk.largest_profile(), x1 - x0, CUT, bodies=bodies, name=name)


def combine(target, tools, op=None, keep=False):
    comp = target.parentComponent
    oc = adsk.core.ObjectCollection.create()
    for t in tools:
        oc.add(t)
    ci = comp.features.combineFeatures.createInput(target, oc)
    ci.operation = op if op is not None else adsk.fusion.FeatureOperations.JoinFeatureOperation
    ci.isKeepToolBodies = keep
    return comp.features.combineFeatures.add(ci)


def new_bodies(feature):
    return [feature.bodies.item(i) for i in range(feature.bodies.count)]


def main_body(comp):
    return max((comp.bRepBodies.item(i) for i in range(comp.bRepBodies.count)), key=lambda b: b.volume)


def ensure_case_params(cfg=None):
    """Create/update the case input parameters (cfg = dict of new values, None keeps existing ones)."""
    ensure_hybrid_design()
    defaults = {k: SPEC["parameters"][k]["default"] for k in INPUTS}
    for k in INPUTS:
        unit = "mm" if k.startswith("window_") else ""
        cur = design.userParameters.itemByName(k)
        if cfg and k in cfg:
            val = cfg[k]
        elif cur is not None:
            continue
        else:
            val = defaults[k]
        expr = ("%g mm" % val) if unit else ("%d" % int(val))
        set_par(k, expr, unit, SPEC["parameters"][k]["doc"])
