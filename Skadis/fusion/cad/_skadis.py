# Shared helpers for SKÅDIS part scripts, prepended after tools/fusion_lib.py by Skadis/fusion/build.py.
# Axes: X along the board (right), Y out of the board (board front face Y = 0, board behind it), Z up. mm.
# CFG (prepended by build.py): {"model", "skadis": shared interface values, "params": model values}.
T = CFG["skadis"]
P = CFG.get("params", {})


# ---------- sketch outlines ----------

def _unit(dx, dy):
    n = math.hypot(dx, dy)
    return dx / n, dy / n


def _end_near(curve, target):
    """The curve's sketch point nearest to target - arcs are stored CCW, so 'end' is not reliable."""
    sp, ep = curve.startSketchPoint, curve.endSketchPoint
    return sp if sp.geometry.distanceTo(target) < ep.geometry.distanceTo(target) else ep


def chain(sk, prims):
    """Closed outline from primitives in plane coordinates: ("line", a, b) or ("arc", a, mid, b), end to end."""
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


def round_corner(a, c, b, r):
    """Vertex c rounded with radius r between neighbours a and b: (t1 on c-a, arc midpoint, t2 on c-b)."""
    u1 = _unit(a[0] - c[0], a[1] - c[1])
    u2 = _unit(b[0] - c[0], b[1] - c[1])
    theta = math.acos(max(-1.0, min(1.0, u1[0] * u2[0] + u1[1] * u2[1])))
    d = r / math.tan(theta / 2)
    w = _unit(u1[0] + u2[0], u1[1] + u2[1])
    h = r / math.sin(theta / 2)
    cen = (c[0] + w[0] * h, c[1] + w[1] * h)
    return (c[0] + u1[0] * d, c[1] + u1[1] * d), (cen[0] - w[0] * r, cen[1] - w[1] * r), (c[0] + u2[0] * d, c[1] + u2[1] * d)


def rpoly_prims(pts):
    """[(u, v, r)] closed polygon with rounded vertices (r = 0: sharp) -> chain primitives."""
    nodes = []
    n = len(pts)
    for i, (u, v, r) in enumerate(pts):
        if r <= 0:
            nodes.append(("p", (u, v)))
        else:
            a, b = pts[i - 1], pts[(i + 1) % n]
            nodes.append(("a",) + round_corner(a[:2], (u, v), b[:2], r))
    prims = []
    for i, nd in enumerate(nodes):
        if nd[0] == "a":
            prims.append(("arc", nd[1], nd[2], nd[3]))
        a = nd[1] if nd[0] == "p" else nd[3]
        nx = nodes[(i + 1) % n]
        b = nx[1]
        if math.dist(a, b) > 1e-6:
            prims.append(("line", a, b))
    return prims


def polar(cy, cz, s, r, deg):
    """Point at radius r, angle deg (from +Y towards s*Z) around (cy, cz) in an x-plane sketch (u, v) = (y, z)."""
    a = math.radians(deg)
    return (cy + r * math.cos(a), cz + s * r * math.sin(a))


def polar_prims(cy, cz, s, verts):
    """[(r, deg, kind)] polar vertices; kind is the segment to the next vertex: 'arc' (same r) or 'line'."""
    prims = []
    for i, (r, a, kind) in enumerate(verts):
        r2, a2, _ = verts[(i + 1) % len(verts)]
        p1, p2 = polar(cy, cz, s, r, a), polar(cy, cz, s, r2, a2)
        if kind == "arc":
            prims.append(("arc", p1, polar(cy, cz, s, r, (a + a2) / 2.0), p2))
        else:
            prims.append(("line", p1, p2))
    return prims


def sector_verts(r0, r1, a0, a1):
    """Annular sector r0..r1, a0..a1 (deg) as polar vertices."""
    return [(r0, a0, "line"), (r1, a0, "arc"), (r1, a1, "line"), (r0, a1, "arc")]


def stadium_prims(u, v, w, h):
    """Vertical slot (stadium) centred at (u, v), width w, length h, in plane coordinates."""
    r = w / 2.0
    return [("line", (u - r, v - h / 2 + r), (u - r, v + h / 2 - r)),
            ("arc", (u - r, v + h / 2 - r), (u, v + h / 2), (u + r, v + h / 2 - r)),
            ("line", (u + r, v + h / 2 - r), (u + r, v - h / 2 + r)),
            ("arc", (u + r, v - h / 2 + r), (u, v - h / 2), (u - r, v - h / 2 + r))]


# ---------- components ----------

def fresh_component(name):
    """Like fusion_lib.new_component, but also for components with several occurrences: Fusion keeps the old
    component (and its name) until the script ends, so the old one is renamed first. Removes 'name (n)' leftovers."""
    def same(n):
        return n == name or (n.startswith(name + " (") and n.endswith(")"))
    old = [root.occurrences.item(i) for i in range(root.occurrences.count) if same(root.occurrences.item(i).component.name)]
    for occ in old:
        if same(occ.component.name):
            occ.component.name = "_old_" + occ.component.name
    for occ in old:
        occ.deleteMe()
    occ = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    occ.component.name = name
    return occ


def place(occ, m):
    """Move an occurrence; in a parametric design the move only sticks once captured as a position snapshot."""
    occ.transform2 = m
    if design.designType == adsk.fusion.DesignTypes.ParametricDesignType and design.snapshots.hasPendingSnapshot:
        design.snapshots.add()


# ---------- features ----------

def profiles_of(sk, min_area_cm2=0.0):
    oc = adsk.core.ObjectCollection.create()
    for p in sk.profiles():
        if p.areaProperties().area > min_area_cm2:
            oc.add(p)
    return oc


def extrude_any(comp, profs, dist_mm, op, negative=False, bodies=None, name=None, taper_deg=0.0):
    """Like fusion_lib.extrude, for a profile, an ObjectCollection or a SketchText."""
    ext = comp.features.extrudeFeatures
    ei = ext.createInput(profs, op)
    direction = adsk.fusion.ExtentDirections.NegativeExtentDirection if negative else adsk.fusion.ExtentDirections.PositiveExtentDirection
    if taper_deg:
        ei.setOneSideExtent(adsk.fusion.DistanceExtentDefinition.create(V(dist_mm)), direction,
                            adsk.core.ValueInput.createByString("%r deg" % taper_deg))
    else:
        ei.setOneSideExtent(adsk.fusion.DistanceExtentDefinition.create(V(dist_mm)), direction)
    if bodies is not None:
        ei.participantBodies = list(bodies)
    f = ext.add(ei)
    if name:
        f.name = name
    return f


INTERSECT = FOP.IntersectFeatureOperation


def combine(target, tools, op=None, keep=False):
    comp = target.parentComponent
    oc = adsk.core.ObjectCollection.create()
    for t in tools:
        oc.add(t)
    ci = comp.features.combineFeatures.createInput(target, oc)
    ci.operation = op if op is not None else JOIN
    ci.isKeepToolBodies = keep
    return comp.features.combineFeatures.add(ci)


def main_body(comp):
    return max((comp.bRepBodies.item(i) for i in range(comp.bRepBodies.count)), key=lambda b: b.volume)


def label(comp, body, axis, offset, text, u, v, height, depth, cut_negative, flip=False, mirror=False, box=(40.0, 12.0)):
    """Text centred at (u, v) on an axis plane, cut `depth` into `body`.

    flip = turn the text by 180 deg; mirror = read it from the side opposite the plane normal.
    Sketch axes: x-plane x -> -Z, y -> +Y; y-plane x -> +X, y -> -Z (normal +Y); z-plane x -> +X, y -> +Y.
    """
    s = Sk(comp, axis, offset, "label " + text.replace("\n", " "))
    ti = s.sk.sketchTexts.createInput2(text, cm(height))
    ti.setAsMultiLine(s.p(u - box[0] / 2, v - box[1] / 2), s.p(u + box[0] / 2, v + box[1] / 2),
                      adsk.core.HorizontalAlignments.CenterHorizontalAlignment,
                      adsk.core.VerticalAlignments.MiddleVerticalAlignment, 0)
    t = s.sk.sketchTexts.add(ti)
    if flip or mirror:
        t.isHorizontalFlip = True
    if flip:
        t.isVerticalFlip = True
    return extrude_any(comp, t, depth, CUT, negative=cut_negative, bodies=[body], name="label " + text.replace("\n", " "))


def appearance(comp, name):
    """Give every body of comp a library appearance, e.g. 'Plastic - Matte (Yellow)'."""
    found = None
    for i in range(app.materialLibraries.count):
        lib = app.materialLibraries.item(i)
        if "Appearance" not in lib.name:
            continue
        for j in range(lib.appearances.count):
            if lib.appearances.item(j).name == name:
                found = lib.appearances.item(j)
                break
    if found is None:
        raise KeyError("Missing appearance: " + name)
    local = None
    for i in range(design.appearances.count):  # itemByName throws on unknown names
        if design.appearances.item(i).name == name:
            local = design.appearances.item(i)
    if local is None:
        local = design.appearances.addByCopy(found, name)
    for i in range(comp.bRepBodies.count):
        comp.bRepBodies.item(i).appearance = local


# ---------- SKÅDIS ----------

def tab_seat(w):
    """Height of a flat tab bottom (width w) above the lowest point of the round slot end when it rests there."""
    r = T["slot_w"] / 2.0
    return r - math.sqrt(max(0.0, r * r - (w / 2.0) ** 2)) + 0.05


def hook_tab(comp, target, col_x, z_s, mat_dir, name="tab"):
    """L-shaped hook tab in the slot centred at (col_x, z_s), joined to `target` (None: keep it a body).

    The tab is flush with the part's print-bed face: mat_dir = -1 means the part continues towards -X from that face.
    Profile (Y, Z): shank through the board, lip down behind it. Mount: insert tab_lip_l higher, push in, lower.
    """
    w, g = T["tab_w"], T["tab_gap"]
    sh, ll, lt, ch = T["tab_shank_h"], T["tab_lip_l"], T["tab_lip_t"], T["tab_chamfer"]
    zb = z_s - T["slot_h"] / 2.0 + tab_seat(w)
    x_bed = col_x - mat_dir * w / 2.0
    yb = -(g + lt)
    top, bot = zb + sh, zb - ll
    s = Sk(comp, "x", x_bed, name)
    s.poly([(1.0, top), (yb, top), (yb, bot), (-g, bot), (-g, zb), (1.0, zb)])
    body = extrude(comp, s.profiles()[0], w, NEW, negative=(mat_dir < 0), name=name).bodies.item(0)
    edges = edges_where(body, lambda b: (near(b[2], top) and near(b[5], top) and b[4] - b[1] > 1.0)
                        or (near(b[2], bot) and near(b[5], bot)))
    chamfer(comp, edges, ch, name + " ends")
    if target is not None:
        combine(target, [body])
    return body


def fit_token(comp, col_x, z_s, w, g, text):
    """Fit-test token: small block with one hook tab (width w, gap g) and the values on its front face."""
    saved = (T["tab_w"], T["tab_gap"])
    T["tab_w"], T["tab_gap"] = w, g
    try:
        x_bed = col_x + w / 2.0
        depth, thick, z0, z1 = 8.0, 12.0, z_s - 24.0, z_s + 12.0
        s = Sk(comp, "x", x_bed, "token")
        chain(s, rpoly_prims([(0.0, z0, 0), (depth, z0, 2.0), (depth, z1, 2.0), (0.0, z1, 0)]))
        body = extrude(comp, s.profiles()[0], thick, NEW, negative=True, name="token").bodies.item(0)
        body.name = comp.name
        hook_tab(comp, body, col_x, z_s, -1)
        label(comp, body, "y", depth, text, x_bed - thick / 2.0, (z0 + z1) / 2.0 - 4.0, 3.5, 0.6, True, flip=True,
              box=(thick - 1.0, 14.0))
        return body
    finally:
        T["tab_w"], T["tab_gap"] = saved


def skadis_board(comp, x0, x1, z0, z1, col_x=0.0, row_z=0.0):
    """Dummy board section (Y -board_t..0) with the slot grid; the slot at (col_x, row_z) exists."""
    s = Sk(comp, "y", 0.0, "board")
    s.poly([(x0, z0), (x1, z0), (x1, z1), (x0, z1)])
    body = extrude(comp, s.profiles()[0], T["board_t"], NEW, negative=True, name="board").bodies.item(0)
    body.name = "board"
    s2 = Sk(comp, "y", 0.0, "slots")
    pitch, row, m = T["pitch"], T["row"], T["slot_h"] / 2.0 + 4.0
    k0, k1 = math.ceil((z0 + m - row_z) / row), math.floor((z1 - m - row_z) / row)
    for k in range(k0, k1 + 1):
        z = row_z + k * row
        xs = col_x + (pitch / 2.0 if k % 2 else 0.0)
        j0, j1 = math.ceil((x0 + 6.0 - xs) / pitch), math.floor((x1 - 6.0 - xs) / pitch)
        for j in range(j0, j1 + 1):
            chain(s2, stadium_prims(xs + j * pitch, z, T["slot_w"], T["slot_h"]))
    extrude_any(comp, s2.all_profiles(), T["board_t"] + 1.0, CUT, negative=True, bodies=[body], name="slots")
    return body
