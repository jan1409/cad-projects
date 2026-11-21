# Context for pictures and checks (not exported): a SKÅDIS board section and the cloth roll with a hanging cloth.


def run(_context: str):
    span = P["span_cols"] * T["pitch"]
    ya, za = P["axis_y"], P["axis_z"]
    board = fresh_component("_board").component
    skadis_board(board, -60.0, span + 60.0, -170.0, 110.0)
    appearance(board, "Plastic - Matte (White)")
    roll = fresh_component("_roll").component
    x0 = span / 2.0 - P["roll_l"] / 2.0
    s = Sk(roll, "x", x0, "roll")
    s.circle(ya, za, P["roll_d"])
    s.circle(ya, za, P["core_id"])
    body = extrude(roll, s.profile_with_loops(2), P["roll_l"], NEW, name="roll").bodies.item(0)
    body.name = "roll"
    s = Sk(roll, "x", x0 + 5.0, "cloth")  # the free end hangs down in front of the roll
    rf = P["roll_d"] / 2.0
    s.poly([(ya + rf - 1.0, za), (ya + rf + 1.0, za), (ya + rf + 1.0, za - 190.0), (ya + rf - 1.0, za - 190.0)])
    cloth = extrude(roll, s.profiles()[0], P["roll_l"] - 10.0, NEW, name="cloth").bodies.item(0)
    cloth.name = "cloth"
    appearance(roll, "Plastic - Matte (Black)")
    print("context: board %.0f x %.0f, roll %.0f x %.0f" % (span + 120.0, 280.0, P["roll_d"], P["roll_l"]))
