# Exact interference checks of the roll holder (TemporaryBRepManager, mm3). Expected: 0 everywhere except
# the detent bumps while turning (the click) and, with brake_interf > 0, the brake pads in the core.


def _body(name):
    return main_body(find_component(name).component)


def _shift(dx, dy, dz):
    m = adsk.core.Matrix3D.create()
    m.translation = adsk.core.Vector3D.create(cm(dx), cm(dy), cm(dz))
    return m


def run(_context: str):
    ya, za = P["axis_y"], P["axis_z"]
    # bl: bracket at X = 0 (the plug part's own hub, named _R), br: the mirrored one at X = span (named _L)
    bl, br, plug_b = _body("Bracket_R"), _body("Bracket_L"), _body("Plug")
    roll = find_component("_roll").component.bRepBodies.itemByName("roll")
    board = _body("_board")
    left, right, flip = plug_matrices()
    pl, pr = moved(plug_b, left), moved(plug_b, right)
    zb = -T["slot_h"] / 2.0 + tab_seat(T["tab_w"])
    lift = (zb + T["tab_shank_h"] + zb - T["tab_lip_l"]) / -2.0  # tab centred in the slot
    rows = [
        ("roll x bracket L / R", overlap_mm3(roll, bl) + overlap_mm3(roll, br), "0"),
        ("board x bracket L / R (mounted)", overlap_mm3(board, bl) + overlap_mm3(board, br), "0"),
        ("board x brackets lifted %.2f mm (mounting)" % lift,
         overlap_mm3(board, moved(bl, _shift(0, 0, lift))) + overlap_mm3(board, moved(br, _shift(0, 0, lift))), "0"),
        ("plug x bracket, locked L / R", overlap_mm3(pl, bl) + overlap_mm3(pr, br), "0"),
        ("plug x bracket, inserted (not turned) L / R", overlap_mm3(plug_b, bl) + overlap_mm3(moved(plug_b, flip), br), "0"),
        ("plug x roll, both" + (" (brake pads)" if P["brake_interf"] > 0 else " (runs loose)"),
         overlap_mm3(pl, roll) + overlap_mm3(pr, roll), "> 0" if P["brake_interf"] > 0 else "0"),
    ]
    for a in (30, 60, 85):
        rows.append(("plug x bracket L, turned %d deg (detent)" % a, overlap_mm3(moved(plug_b, rot_x(a, ya, za)), bl), "~3"))
    for label_, v, expect in rows:
        print("%-48s %9.3f mm3   (expected %s)" % (label_, v, expect))
    gap = P["span_cols"] * T["pitch"] - T["tab_w"] - P["roll_l"]
    print("roll end play: %.2f mm per side; core play on the plug: %.2f mm per side"
          % (gap / 2.0, (P["core_id"] - P["shaft_d"]) / 2.0))
