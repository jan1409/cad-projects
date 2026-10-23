# Latch: one closed outline (top boss with pivot hole, two curved arms, lower hook boss open towards the wall,
# handle tab) extruded 23.2 wide. Coordinates from Rugged Box Sketch 10 (source frame), mapped to the case:
# y = y_src + 35 - Wi/2 (front side), z = z_src - 30 + split. Second latch = copy at -hinge_x.
C_TOP, C_BOT, C_ARM, C_TAB = (-41.76, 38.0), (-41.76, 22.0), (-23.131, 30.0), (-44.933, 12.517)


def _on(c, r, deg):
    return (c[0] + r * math.cos(math.radians(deg)), c[1] + r * math.sin(math.radians(deg)))


# outline as primitives: ("L", a, b) or ("A", a, mid, b), in source coordinates
Q1, Q2, Q3, Q4 = (-44.423, 35.015), (-41.367, 34.019), (-41.367, 25.981), (-41.749, 23.6)
Q5, Q6, Q7, Q8 = (-40.761, 20.75), (-37.96, 20.75), (-41.406, 18.016), (-43.416, 12.009)
Q9, Q10, Q11 = (-46.45, 13.024), (-44.441, 19.031), (-44.423, 24.985)
OUTLINE = [
    ("A", Q1, _on(C_TOP, 4.0, 71.95), Q2),           # top boss over the top
    ("A", Q2, (C_ARM[0] - 18.674, 30.0), Q3),         # inner arm
    ("L", Q3, Q4),
    ("A", Q4, _on(C_BOT, 1.6, 199.1), Q5),           # hook: lower hole, open towards the wall
    ("L", Q5, Q6),                                    # hook lower lip
    ("A", Q6, _on(C_BOT, 4.0, 308.45), Q7),          # lower boss, outer bottom
    ("L", Q7, Q8),                                    # tab
    ("A", Q8, _on(C_TAB, 1.6, -108.5), Q9),          # tab end
    ("L", Q9, Q10),
    ("A", Q10, _on(C_BOT, 4.0, 179.8), Q11),         # lower boss, wall side
    ("A", Q11, (C_ARM[0] - 21.874, 30.0), Q1),        # outer arm
]


def run(_context: str):
    env = case_env()
    split, xc, hw = env["split"], env["hinge_x"], env["Wi"] / 2
    m = lambda p: (p[0] + 35 - hw, p[1] - 30 + split)  # source -> case (y, z) on the front side
    occ = new_component("Latch")
    comp = occ.component
    width = SPEC["hardware"]["latch_front"]["latch_part"]["width"]
    sk = Sk(comp, "x", xc - width / 2, "Latch profile")
    first = last = None
    for k, pr in enumerate(OUTLINE):
        a, b = m(pr[1]), m(pr[-1])
        start = last if last is not None else sk.p(*a)
        end = first if k == len(OUTLINE) - 1 else sk.p(*b)
        if pr[0] == "L":
            c = sk.lines.addByTwoPoints(start, end)
        else:
            c = sk.arcs.addByThreePoints(start, sk.p(*m(pr[2])), end)
        if first is None:
            first = _end_near(c, sk.p(*a))
        last = _end_near(c, sk.p(*b))
    sk.circle(*m(C_TOP), 3.2)
    prof = sk.profile_with_loops(2)
    extrude(comp, prof, width, NEW, name="Latch")
    comp.bRepBodies.item(0).name = "Latch"
    # second latch at -hinge_x (the part is symmetric about its mid plane)
    t = adsk.core.Matrix3D.create()
    t.translation = adsk.core.Vector3D.create(cm(-2 * xc), 0, 0)
    root.occurrences.addExistingComponent(comp, t)
    report(comp)
