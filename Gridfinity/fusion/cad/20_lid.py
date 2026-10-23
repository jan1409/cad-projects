# Lid: wall sweep + window frame grid (skirts with underside groove) + top stacking ribs + window pocket
# + front lead-in + hardware (hinge knuckle, centre rib, latch pivot ribs, end ribs). Printed upside down.
def run(_context: str):
    env = case_env()
    split, top, wt = env["split"], env["top"], env["window_t"]
    seat = env["seat"]  # top - 1.2 - wt - window_gap
    occ = new_component("Lid")
    comp = occ.component
    bodies = [sweep_wall(comp, env, pts_sz("lid_wall", env), "Lid wall").bodies.item(0)]

    # frame below the window: slab from the groove top to the window seat + 45 deg skirts on the underside
    bodies.append(extrude(comp, cavity_sketch(comp, env, top - 4, "Frame slab").largest_profile(), seat - (top - 4), NEW, name="Frame slab").bodies.item(0))
    bodies += new_bodies(extrude_taper(comp, profiles_of(cell_sketch(comp, env, top - 5.5, 2.35, "Frame skirts")), 1.5, NEW, taper_deg=45, name="Frame skirts"))
    # top layer above the window
    # (ends 0.5 inside the cavity outline: the wall sweep carries the edge, and its top fillet starts at s = -0.006)
    bodies.append(extrude(comp, cavity_sketch(comp, env, top - 1.2, "Top slab", grow=-0.5).largest_profile(), 1.2, NEW, name="Top slab").bodies.item(0))

    hw = env["Wi"] / 2
    # end ribs on the X walls: strip up to the 2.635 top chamfer
    end_rib = [(1.0, split, 0), (4.26, split, 0), (4.26, top - 2.635, 1), (1.625, top, 1), (-0.5, top, 0), (0.5, top - 1.0, 0)]
    for side in (1, -1):
        for y0, y1 in ((hw - 23, hw - 18), (-(hw - 18), -(hw - 23))):
            bodies += new_bodies(prism_y(comp, env, side, end_rib, y0, y1, NEW, "End rib"))

    xc = env["hinge_x"]
    # rib tops run flat back onto the lid top (to s = -0.5, past the start of its top fillet), filling the chamfer behind them
    front_rib = [(2.0, split, 0), (11.26, split, 5), (11.26, top - 4.8, 3), (6.46, top, 1), (-0.5, top, 0)]
    knuckle = [(2.4, split, 0), (7.86, split, 0), (10.264, split + 2.404, 0), (2.4, split + 10.268, 0)]
    centre_rib = [(1.0, split + 1, 0), (7.86, split + 1, 0), (10.264, split + 2.404, 0), (4.26, split + 8.408, 1),
                  (4.26, top - 2.635, 1), (1.625, top, 1), (-0.5, top, 0), (1.0, top - 1.5, 0)]
    for m in (1, -1):
        c = m * xc
        for a, b in ((-15, -11.8), (11.8, 15)):
            bodies += new_bodies(prism_x(comp, env, -1, front_rib, c + a, c + b, NEW, "Pivot rib"))
        bodies += new_bodies(prism_x(comp, env, 1, knuckle, c - 8.675, c + 8.675, NEW, "Hinge knuckle"))
        sk = Sk(comp, "x", c - 8.675, "Hinge knuckle boss")
        sk.circle(hw + 7.86, split, 6.8)
        bodies += new_bodies(extrude(comp, sk.largest_profile(), 17.35, NEW, name="Hinge knuckle boss"))
        bodies += new_bodies(prism_x(comp, env, 1, centre_rib, c - 1.6, c + 1.6, NEW, "Hinge centre rib"))

    lid = bodies[0]
    combine(lid, bodies[1:])
    lid.name = "Lid"

    # openings: frame 35.7 sq r 0.85 (offset 3.15) through to the seat; top layer offset 3.009 widening 45 deg to 1.809
    extrude(comp, profiles_of(cell_sketch(comp, env, top - 5.5, 3.15, "Frame openings")), seat - (top - 5.5), CUT, bodies=[lid], name="Frame openings")
    extrude_taper(comp, profiles_of(cell_sketch(comp, env, top - 1.2, 3.009, "Top openings")), 1.2, CUT, taper_deg=45, bodies=[lid], name="Top openings")
    # window pocket (Li-3) x (Wi-3) r 0.2 between seat and top - 1.2 (window_t + window_gap deep)
    sk = Sk(comp, "z", seat, "Window pocket")
    rrect_c(sk, 0, 0, env["Li"] - 3, env["Wi"] - 3, 0.2)
    extrude(comp, sk.largest_profile(), top - 1.2 - seat, CUT, bodies=[lid], name="Window pocket")
    # front lead-in 0.5 x 2 on the inner bottom edge (straight part of the front wall; the reference fades it out
    # over the corner arcs, which is left out here)
    lead = [(-1.0, split - 0.5, 0), (0.625, split - 0.5, 0), (0.0, split + 2, 0), (-1.0, split + 2, 0)]
    prism_x(comp, env, -1, lead, -(env["Li"] / 2 - 4), env["Li"] / 2 - 4, CUT, "Lead-in", bodies=[lid])

    # holes, print flat at the bottom (lid prints upside down)
    tap, clear = SPEC["hardware"]["hole_tap_d"], SPEC["hardware"]["hole_clearance_d"]
    for m in (1, -1):
        centre_side = (xc - 15, xc - 11.8) if m > 0 else (-xc + 11.8, -xc + 15)
        end_side = (xc + 11.8, xc + 15) if m > 0 else (-xc - 15, -xc - 11.8)
        for (x0, x1), d in ((centre_side, tap), (end_side, clear)):
            teardrop_x(comp, env, -1, 6.76, split + 8, d, x0 - 0.5, x1 + 0.5, False, [lid], "Pivot hole")
        teardrop_x(comp, env, 1, 7.86, split, clear, m * xc - 9.2, m * xc + 9.2, False, [lid], "Hinge hole")

    # r 1 on the straight top side edges of the ribs (pivot ribs, hinge centre ribs: edges along Y; end ribs: along X)
    rib_x = [m * xc + d for m in (1, -1) for d in (-15, -11.8, 11.8, 15, -1.6, 1.6)]
    rib_y = [sg * v for sg in (1, -1) for v in (hw - 23, hw - 18)]
    edges = []
    for i in range(lid.edges.count):
        e = lid.edges.item(i)
        if not isinstance(e.geometry, adsk.core.Line3D):
            continue
        a, b = e.startVertex.geometry, e.endVertex.geometry
        if not (near(a.z * 10, top, 1e-3) and near(b.z * 10, top, 1e-3)):
            continue
        if near(a.x, b.x, 1e-6) and any(near(a.x * 10, x, 1e-3) for x in rib_x) and min(abs(a.y), abs(b.y)) * 10 > hw - 0.01:
            edges.append(e)
        elif near(a.y, b.y, 1e-6) and any(near(a.y * 10, y, 1e-3) for y in rib_y) and min(abs(a.x), abs(b.x)) * 10 > env["Li"] / 2 - 0.01:
            edges.append(e)
    print("rib top edges filleted:", len(edges))
    if edges:
        oc = adsk.core.ObjectCollection.create()
        for e in edges:
            oc.add(e)
        fi = comp.features.filletFeatures.createInput()
        fi.edgeSetInputs.addConstantRadiusEdgeSet(oc, V(1.0), False)
        comp.features.filletFeatures.add(fi).name = "Rib top edges"
    report(comp)
