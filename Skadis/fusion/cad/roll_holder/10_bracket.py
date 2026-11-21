# Roll holder brackets (left and right): back plate with hook tabs in one slot column, an arm (hull of the plate and
# the hub, with a window) and the hub with the bayonet. The tab column is flush with the bracket's inner face, which is
# the print-bed face, so the tabs print with their L-profile in the layer plane and nothing needs support.
# Facing the board, +X points to the LEFT (X along the board, Y towards the viewer, Z up). So the bracket with its top
# tab in the slot at X = 0, Z = 0 (material towards -X) is the RIGHT one; the left one sits span_cols pitches further.


def _tangent(p, c, rad, pick):
    """Tangent point on circle (c, rad) seen from p; pick = max or min (by Z) of the two candidates."""
    d = math.dist(p, c)
    base = math.atan2(p[1] - c[1], p[0] - c[0])
    beta = math.acos(rad / d)
    cands = [(c[0] + rad * math.cos(base + sg * beta), c[1] + rad * math.sin(base + sg * beta)) for sg in (1, -1)]
    return pick(cands, key=lambda q: q[1])


def _offset(a, b, dist, inside):
    """Line a-b moved by dist towards the point `inside`: (point, direction)."""
    d = _unit(b[0] - a[0], b[1] - a[1])
    n = (-d[1], d[0])
    if (inside[0] - a[0]) * n[0] + (inside[1] - a[1]) * n[1] < 0:
        n = (-n[0], -n[1])
    return (a[0] + n[0] * dist, a[1] + n[1] * dist), d


def _cross(l1, l2):
    (p, d), (q, e) = l1, l2
    den = d[0] * e[1] - d[1] * e[0]
    t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den
    return (p[0] + d[0] * t, p[1] + d[1] * t)


def arm_outline(ya, za):
    """Outer outline (chain primitives) and window polygon of the arm in (Y, Z)."""
    rad = P["hub_d"] / 2.0
    pt, pb, c = (0.0, P["plate_top"]), (0.0, P["plate_bottom"]), (ya, za)
    t1, t2 = _tangent(pt, c, rad, max), _tangent(pb, c, rad, min)
    a1, a2 = math.degrees(math.atan2(t1[1] - za, t1[0] - ya)), math.degrees(math.atan2(t2[1] - za, t2[0] - ya))
    am = math.radians((a1 + a2) / 2.0)
    mid = (ya + rad * math.cos(am), za + rad * math.sin(am))
    ta1, ma, ta2 = round_corner(pb, pt, t1, 4.0)
    tb1, mb, tb2 = round_corner(t2, pb, pt, 4.0)
    outer = [("arc", ta1, ma, ta2), ("line", ta2, t1), ("arc", t1, mid, t2), ("line", t2, tb1),
             ("arc", tb1, mb, tb2), ("line", tb2, ta1)]
    wm = P["window_margin"]
    inside = ((pt[0] + pb[0] + c[0]) / 3.0, (pt[1] + pb[1] + c[1]) / 3.0)
    back = ((P["plate_t"] + wm, 0.0), (0.0, 1.0))
    hub = ((ya - rad - 6.0, 0.0), (0.0, 1.0))
    top, diag = _offset(pt, t1, wm, inside), _offset(pb, t2, wm, inside)
    win = [_cross(back, top), _cross(top, hub), _cross(hub, diag), _cross(diag, back)]
    return outer, win


def bracket(side):
    """side = -1: at X = 0, material towards -X (right seen from the front); +1: at X = span (left)."""
    name = "Bracket_R" if side < 0 else "Bracket_L"
    comp = fresh_component(name).component
    col_x = 0.0 if side < 0 else P["span_cols"] * T["pitch"]
    x_in = col_x - side * T["tab_w"] / 2.0
    neg = side < 0
    ya, za = P["axis_y"], P["axis_z"]
    s = Sk(comp, "x", x_in, "plate")
    chain(s, rpoly_prims([(0.0, P["plate_bottom"], 0), (P["plate_t"], P["plate_bottom"], 3.0),
                          (P["plate_t"], P["plate_top"], 3.0), (0.0, P["plate_top"], 0)]))
    body = extrude(comp, s.profiles()[0], P["plate_w"], NEW, negative=neg, name="plate").bodies.item(0)
    body.name = name
    outer, win = arm_outline(ya, za)
    s = Sk(comp, "x", x_in, "arm")
    chain(s, outer)
    chain(s, rpoly_prims([(u, v, 5.0) for u, v in win]))
    extrude(comp, s.profile_with_loops(2), P["arm_t"], JOIN, negative=neg, bodies=[body], name="arm")
    s = Sk(comp, "x", x_in, "hub")
    s.circle(ya, za, P["hub_d"])
    extrude(comp, s.profiles()[0], P["hub_len"], JOIN, negative=neg, bodies=[body], name="hub")
    hub_features(comp, body, x_in, side, ya, za, -side, P["hub_len"])
    for r in range(int(P["tab_rows"])):
        hook_tab(comp, body, col_x, -2.0 * T["row"] * r, side, name="tab %d" % (r + 1))
    appearance(comp, "Plastic - Matte (Yellow)")
    return body


def run(_context: str):
    for side in (-1, 1):
        bracket(side)
    print("brackets: tabs at X = 0 and %.0f, inner gap %.2f mm for a %.0f mm roll"
          % (P["span_cols"] * T["pitch"], P["span_cols"] * T["pitch"] - T["tab_w"], P["roll_l"]))
