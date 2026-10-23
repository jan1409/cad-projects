# Base: wall sweep + Gridfinity floor (pockets on top, foot pads underneath) + end ribs + hardware zone.
STRIP_S = 4.26   # outer face of ribs/strips (= bumper)
BOSS_S = 11.26   # outer face of the hardware bosses
CLIP_Z = 0.3     # bosses never reach below this height (n = 4 reference)


def strip_pts(split):
    """Full-height rib strip on the base: from the bottom chamfer (z = s) up to the rim, groove left open."""
    return [(2.0, 2.0, 0), (STRIP_S, STRIP_S, 1), (STRIP_S, split, 0), (3.03, split, 0), (3.03, split - 2, 0), (2.0, split - 2, 0)]


def rib_pts(split, c, top_r):
    """Strip + 45 deg boss whose lower face is z = s + c; top outer corner radius top_r (5 front, 0 back)."""
    tail = [(BOSS_S, BOSS_S + c, 3), (BOSS_S, split, top_r), (3.03, split, 0), (3.03, split - 2, 0), (2.0, split - 2, 0)]
    corner = STRIP_S + c  # where the boss face meets the strip face
    if corner > STRIP_S:
        # boss above the bottom chamfer: chamfer -> strip -> concave corner -> boss
        gap = corner - STRIP_S
        r = min(1.0, gap / (2 * math.tan(math.radians(22.5))))
        return [(2.0, 2.0, 0), (STRIP_S, STRIP_S, r), (STRIP_S, corner, r)] + tail
    # boss reaches below the chamfer: clipped flat at CLIP_Z (only n = 4)
    s_k = CLIP_Z - c
    return [(2.0, 2.0, 0), (CLIP_Z, CLIP_Z, 0), (s_k, CLIP_Z, 0)] + tail


def run(_context: str):
    env = case_env()
    split = env["split"]
    occ = new_component("Base")
    comp = occ.component
    bodies = []

    # wall
    bodies.append(sweep_wall(comp, env, pts_sz("base_wall", env), "Base wall").bodies.item(0))

    # floor slab above the underside plane; foot pads (35.6 sq r 0.8 at z = -3.2) taper at 45 deg up to the
    # underside plane, 0.3 beyond the cell outline -> V-notches run out through the wall
    under = SPEC["cells"]["foot_pad"]["underside_z"]
    bodies.append(extrude(comp, cavity_sketch(comp, env, under, "Floor slab").largest_profile(), 4.646 - under, NEW, name="Floor slab").bodies.item(0))
    feet = extrude_taper(comp, profiles_of(cell_sketch(comp, env, -3.2, 3.2, "Feet")), 3.2 + under, NEW, taper_deg=45, name="Feet")
    bodies += new_bodies(feet)

    # end ribs on the X walls
    hw = env["Wi"] / 2
    for side in (1, -1):
        for y0, y1 in ((hw - 23, hw - 18), (-(hw - 18), -(hw - 23))):
            bodies += new_bodies(prism_y(comp, env, side, strip_pts(split), y0, y1, NEW, "End rib"))

    # hardware zone at x = +-hinge_x
    xc = env["hinge_x"]
    c_front, c_back = split - 28.26, split - 16.26
    for m in (1, -1):
        def xr(a, b):
            # module-relative range [a, b] -> absolute x range, mirrored for the -hinge_x module
            return (xc + a, xc + b) if m > 0 else (-xc - b, -xc - a)
        for a, b in ((-15, -11.8), (11.8, 15)):
            x0, x1 = xr(a, b)
            bodies += new_bodies(prism_x(comp, env, -1, rib_pts(split, c_front, 5), x0, x1, NEW, "Latch rib"))
            bodies += new_bodies(prism_x(comp, env, 1, rib_pts(split, c_back, 0), x0, x1, NEW, "Hinge rib"))
        for a, b in ((-15, -8.8), (8.8, 15)):
            x0, x1 = xr(a, b)
            gusset = [(2.4, split - 10.268, 0), (10.264, split - 2.404, 0), (7.86, split, 0), (3.03, split, 0), (3.03, split - 2, 0), (2.4, split - 2, 0)]
            bodies += new_bodies(prism_x(comp, env, 1, gusset, x0, x1, NEW, "Hinge knuckle"))
            sk = Sk(comp, "x", x0, "Hinge knuckle boss")
            sk.circle(hw + 7.86, split, 6.8)
            bodies += new_bodies(extrude(comp, sk.largest_profile(), x1 - x0, NEW, name="Hinge knuckle boss"))

    base = bodies[0]
    combine(base, bodies[1:])
    base.name = "Base"

    # baseplate pockets on top (2.846 -> 2.15 @45, 1.8 vertical, 2.15 @45 to the 42 r4 outline); also trims the pad tops
    extrude_taper(comp, profiles_of(cell_sketch(comp, env, 0.0, 2.846, "Pocket 1")), 0.696, CUT, taper_deg=45, bodies=[base], name="Pocket 1")
    extrude(comp, profiles_of(cell_sketch(comp, env, 0.696, 2.15, "Pocket 2")), 1.8, CUT, bodies=[base], name="Pocket 2")
    extrude_taper(comp, profiles_of(cell_sketch(comp, env, 2.496, 2.15, "Pocket 3")), 2.15, CUT, taper_deg=45, bodies=[base], name="Pocket 3")

    # holes: towards the case centre 2.85 (M3 tap), at the case end 3.4 (clearance); print flat on top
    tap, clear = SPEC["hardware"]["hole_tap_d"], SPEC["hardware"]["hole_clearance_d"]
    for m in (1, -1):
        centre_side = (xc - 15, xc - 11.8) if m > 0 else (-xc + 11.8, -xc + 15)
        end_side = (xc + 11.8, xc + 15) if m > 0 else (-xc - 15, -xc - 11.8)
        knuckle_centre = (xc - 15, xc - 8.8) if m > 0 else (-xc + 8.8, -xc + 15)
        knuckle_end = (xc + 8.8, xc + 15) if m > 0 else (-xc - 15, -xc - 8.8)
        for (x0, x1), d in ((centre_side, tap), (end_side, clear)):
            teardrop_x(comp, env, -1, 6.76, split - 8, d, x0 - 0.5, x1 + 0.5, True, [base], "Catch hole")
        for (x0, x1), d in ((knuckle_centre, tap), (knuckle_end, clear)):
            teardrop_x(comp, env, 1, 7.86, split, d, x0 - 0.5, x1 + 0.5, True, [base], "Hinge hole")
    report(comp)
