# Roll holder parts: hub features (bayonet entry grooves, recess with a 45 deg ceiling, detent notches) and the plug.
# Frame: the axis runs along X through (ya, za). Angles in deg from +Y towards s*Z, where s = +1 for a hub whose plug
# points +X (left bracket) and -1 for one whose plug points -X (right bracket); so the same plug fits both hubs.
# Lug k sits at 90 + 180 k when inserted (entry grooves top/bottom) and turns +lock_turn (clockwise seen from the knob)
# to lock; optional brake pads (brake_interf > 0, off by default) sit at the lug angles, so they pass the grooves and end
# up horizontal (off the roll weight). The plug carries everything that flexes (lug arms with detent bumps, brake
# springs): cheap to reprint.

BUMP_R = 0.7  # detent bump radius


def lug_angles(k):
    return 90.0 + 180.0 * k, P["lug_span"] / 2.0


def hub_features(comp, body, x_in, out, ya, za, s, hub_len):
    """Cut bore, entry grooves, recess and detent notches into `body`.

    x_in: hub face towards the roll; out = -1 / +1: direction from that face into the hub (away from the roll).
    """
    neg = out < 0
    rb, rg, rr, lock = P["bore_d"] / 2.0, P["groove_r"], P["recess_r"], P["lock_turn"]
    r_in = rb - 1.0  # inner edge of the cut sketches (inside the bore)
    sk = Sk(comp, "x", x_in, "bore")
    sk.circle(ya, za, P["bore_d"])
    extrude(comp, sk.profiles()[0], hub_len + 1.0, CUT, negative=neg, bodies=[body], name="bore")
    sk = Sk(comp, "x", x_in, "grooves")
    for k in (0, 1):
        c, half = lug_angles(k)
        chain(sk, polar_prims(ya, za, s, sector_verts(r_in, rg, c - half - 2.0, c + half + 2.0)))
    extrude_any(comp, sk.all_profiles(), hub_len + 1.0, CUT, negative=neg, bodies=[body], name="grooves")
    # recess with the detent notches (where the bumps rest when locked): prism cut to a 45 deg cone ceiling
    # (depth = rc - r), so it prints without support
    rc = P["lug_r1"] + P["lug_h"] + P["play"]
    depth = rc - r_in
    sk = Sk(comp, "x", x_in, "recess")
    for k in (0, 1):
        c, half = lug_angles(k)
        a0, ag, a1 = c - half - 2.0, c + half + 2.0, c + half + lock + 1.0
        chain(sk, polar_prims(ya, za, s, [(r_in, a0, "line"), (rg, a0, "arc"), (rg, ag, "line"),
                                          (rr, ag + 6.0, "arc"), (rr, a1, "line"), (r_in, a1, "arc")]))
        y, z = polar(ya, za, s, rr + P["detent_interf"] - BUMP_R, c + half - 2.5 + lock)
        sk.circle(y, z, 2.0 * (BUMP_R + 0.15))
    f = extrude_any(comp, sk.all_profiles(), depth, NEW, negative=neg, name="recess tool")
    tools = [f.bodies.item(i) for i in range(f.bodies.count)]
    sk = Sk(comp, "x", x_in, "recess cone")
    sk.circle(ya, za, 2.0 * rc)
    extrude_any(comp, sk.profiles()[0], depth, INTERSECT, negative=neg, bodies=tools, taper_deg=-45.0, name="recess cone")
    combine(body, tools, CUT)


def plug(comp, x_in, ya, za, bearing_len, core_len, knob_d, knob_h, brake_interf, brake_len, name, text=None):
    """Plug in its insertion orientation (lugs at 90 / 270), axis +X through (ya, za), x_in = the hub's roll-side face."""
    r = P["shaft_d"] / 2.0
    x_k = x_in - bearing_len - P["play"]  # knob underside
    sk = Sk(comp, "x", x_k, "knob")
    sk.circle(ya, za, knob_d)
    body = extrude(comp, sk.profiles()[0], knob_h, NEW, negative=True, name="knob").bodies.item(0)
    body.name = name
    chamfer(comp, edges_where(body, lambda b: b[4] - b[1] > knob_d - 1.0), 1.0, "knob edges")
    sk = Sk(comp, "x", x_k, "grip")
    n = int(knob_d * math.pi / 13.0)
    for i in range(n):
        y, z = polar(ya, za, 1, knob_d / 2.0 + 1.8, 360.0 * i / n)
        sk.circle(y, z, 6.0)
    grips = [p for p in sk.profiles() if p.areaProperties().area < cm(cm(6.0 * 6.0))]
    oc = adsk.core.ObjectCollection.create()
    for p in grips:
        oc.add(p)
    extrude_any(comp, oc, knob_h + 1.0, CUT, negative=True, bodies=[body], name="grip")
    sk = Sk(comp, "x", x_k - 1.0, "shaft")
    sk.circle(ya, za, 2.0 * r)
    extrude(comp, sk.profiles()[0], 1.0 + bearing_len + P["play"] + core_len, JOIN, bodies=[body], name="shaft")
    tip = x_in + core_len
    chamfer(comp, edges_where(body, lambda b: near(b[0], tip) and near(b[3], tip)), 1.5, "tip")
    # bayonet lug arms with the detent bump at the leading end: free 1 mm gap to the shaft except at the trailing
    # root; back face = 45 deg cone (prints standing on the knob without support)
    rl = P["lug_r1"] + P["lug_h"]
    depth = rl - (r - 0.5)
    sk = Sk(comp, "x", x_in, "lugs")
    for k in (0, 1):
        c, half = lug_angles(k)
        chain(sk, polar_prims(ya, za, 1, [(r - 0.5, c - half, "line"), (P["lug_r1"], c - half, "arc"),
                                          (P["lug_r1"], c + half, "line"), (P["lug_r0"], c + half, "arc"),
                                          (P["lug_r0"], c - half + 7.0, "line"), (r - 0.5, c - half + 7.0, "arc")]))
        y, z = polar(ya, za, 1, P["recess_r"] + P["detent_interf"] - BUMP_R, c + half - 2.5)
        sk.circle(y, z, 2.0 * BUMP_R)
    f = extrude_any(comp, sk.all_profiles(), depth, NEW, negative=True, name="lugs")
    tools = [f.bodies.item(i) for i in range(f.bodies.count)]
    sk = Sk(comp, "x", x_in, "lug cone")
    sk.circle(ya, za, 2.0 * rl)
    extrude_any(comp, sk.profiles()[0], depth, INTERSECT, negative=True, bodies=tools, taper_deg=-45.0, name="lug cone")
    combine(body, tools)
    if P["plug_hollow_d"] > 0:  # hollow shaft, closed by the knob, open at the tip
        sk = Sk(comp, "x", x_k, "hollow")
        sk.circle(ya, za, P["plug_hollow_d"])
        extrude(comp, sk.profiles()[0], bearing_len + P["play"] + core_len + 1.0, CUT, bodies=[body], name="hollow")
    if brake_len > 0 and brake_interf > 0:
        # brake (optional, off by default: the roll should run loose): flat-topped pads with 45 deg ramps at the lug
        # angles, on curved leaf springs that bend in the layer plane
        x0, x1 = tip - brake_len, tip
        rp, rbase = P["core_id"] / 2.0 + brake_interf, r - 1.0
        ramp = rp - rbase
        sk = Sk(comp, "y", ya - 2.5, "pads")
        for sz in (1, -1):
            sk.poly([(x0 + 0.5, za + sz * rbase), (x0 + 0.5 + ramp, za + sz * rp),
                     (x1 - 0.5 - ramp, za + sz * rp), (x1 - 0.5, za + sz * rbase)])
        extrude_any(comp, sk.all_profiles(), 5.0, JOIN, bodies=[body], name="pads")
        sk = Sk(comp, "x", x0, "springs")
        for k in (0, 1):
            c, _ = lug_angles(k)
            chain(sk, polar_prims(ya, za, 1, [(10.4, c - 62.0, "arc"), (10.4, c + 15.0, "line"), (r + 1.5, c + 15.0, "arc"),
                                              (r + 1.5, c + 12.0, "line"), (12.2, c + 12.0, "arc"), (12.2, c - 62.0, "line")]))
        extrude_any(comp, sk.all_profiles(), brake_len + 1.0, CUT, bodies=[body], name="springs")
    if text:  # on the knob's shaft-side face (faces up when printing): reads radially outwards at +Y
        label(comp, body, "x", x_k, text, ya + (r + knob_d / 2.0) / 2.0, za, 3.5, 0.6, True,
              box=(knob_d / 2.0 - r - 0.6, 12.0))
    return body


def test_hub(comp, x_in, ya, za, length):
    """Short hub ring with the bayonet features, printed roll-side face down like the left bracket."""
    sk = Sk(comp, "x", x_in, "ring")
    sk.circle(ya, za, P["hub_d"])
    body = extrude(comp, sk.profiles()[0], length, NEW, negative=True, name="ring").bodies.item(0)
    body.name = comp.name
    hub_features(comp, body, x_in, -1, ya, za, 1, length)
    chamfer(comp, edges_where(body, lambda b: b[4] - b[1] > P["hub_d"] - 1.0), 0.8, "ring edges")
    return body


# ---------- exact checks (TemporaryBRepManager) ----------

_TBM = adsk.fusion.TemporaryBRepManager.get()  # fetch once: after a failed boolean the next get() re-raises


def rot_x(deg, ya, za):
    m = adsk.core.Matrix3D.create()
    m.setToRotation(math.radians(deg), adsk.core.Vector3D.create(1, 0, 0), P3(0, ya, za))
    return m


def plug_matrices():
    """Placements of the plug part (modelled at the left hub, inserted): left locked, right locked, right inserted."""
    span = P["span_cols"] * T["pitch"]
    ya, za = P["axis_y"], P["axis_z"]
    left = rot_x(P["lock_turn"], ya, za)
    flip = adsk.core.Matrix3D.create()
    flip.setToRotation(math.pi, adsk.core.Vector3D.create(0, 1, 0), P3(span / 2.0, 0.0, za))
    right = left.copy()
    right.transformBy(flip)
    return left, right, flip


def moved(body, *mats):
    b = _TBM.copy(body)
    for m in mats:
        _TBM.transform(b, m)
    return b


def overlap_mm3(a, b):
    """Volume of a ∩ b in mm3 (copies, inputs untouched)."""
    t = _TBM.copy(a)
    ok = _TBM.booleanOperation(t, _TBM.copy(b), adsk.fusion.BooleanTypes.IntersectionBooleanType)
    if not ok:
        return float("nan")
    return t.volume * 1000.0 if t.faces.count else 0.0
