# Checks Fusion conventions the build relies on (taper sign, y-plane normal, sweep along a closed path,
# polygon drawing). Builds in a temporary component and deletes it again.
def run(_context: str):
    occ = new_component("_selftest")
    comp = occ.component
    # taper: 10 x 10 square at z = 0, extruded 5 mm with TAPER_SIGN * 10 deg -> top should be larger
    sk = Sk(comp, "z", 0.0, "taper")
    rrect_c(sk, 0, 0, 10, 10, 0)
    extrude_taper(comp, sk.largest_profile(), 5, NEW, taper_deg=10, name="taper")
    b = comp.bRepBodies.item(comp.bRepBodies.count - 1)
    x0, y0, z0, x1, y1, z1 = bb_mm(b)
    print("taper +10 (grow): bbox x %.3f (expect %.3f for growth)" % (x1 - x0, 10 + 2 * 5 * math.tan(math.radians(10))))
    # y-plane: sketch at y = 20, extrude 5 with Y_PLANE_NEGATIVE -> should go +Y (20..25)
    sk2 = Sk(comp, "y", 20.0, "yplane")
    rrect_c(sk2, 50, 5, 4, 4, 0)
    extrude(comp, sk2.largest_profile(), 5, NEW, negative=Y_PLANE_NEGATIVE, name="yplane")
    b2 = comp.bRepBodies.item(comp.bRepBodies.count - 1)
    print("y-plane extrude: y %.3f..%.3f (expect 20..25)" % (bb_mm(b2)[1], bb_mm(b2)[4]))
    # x-plane: sketch at x = 30, extrude +5 -> x 30..35
    sk3 = Sk(comp, "x", 30.0, "xplane")
    rrect_c(sk3, 50, 5, 4, 4, 0)
    extrude(comp, sk3.largest_profile(), 5, NEW, name="xplane")
    b3 = comp.bRepBodies.item(comp.bRepBodies.count - 1)
    print("x-plane extrude: x %.3f..%.3f (expect 30..35)" % (bb_mm(b3)[0], bb_mm(b3)[3]))
    # polygon with rounded corners (convex + concave) swept along a 60 x 40 r4 path
    env = {"Li": 60.0, "Wi": 40.0}
    pts = [(0, 0, 0), (3, 0, 0), (3, 4, 1), (5, 6, 1), (5, 10, 0), (0, 10, 0)]
    f = sweep_wall(comp, env, pts, "sweep")
    b4 = f.bodies.item(0)
    x0, y0, z0, x1, y1, z1 = bb_mm(b4)
    print("sweep: bbox %.3f x %.3f x %.3f (expect 70 x 50 x 10), solid=%s, V=%.3f cm3" % (
        x1 - x0, y1 - y0, z1 - z0, b4.isSolid, b4.volume))
    occ.deleteMe()
