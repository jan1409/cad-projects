# The plug: modelled at the hub of the bracket at X = 0 (Bracket_R, the right one seen from the front) in its
# insertion orientation; its occurrence is moved to the locked position. The plug in the mirrored bracket is a
# context copy (_Plug_R, not exported): the same part rotated 180 deg about the Y-parallel axis through the roll centre
# (see _roll.py). Fusion keeps the names of deleted components that had several occurrences, so no extra occurrences.


def build(name):
    occ = fresh_component(name)
    comp = occ.component
    plug(comp, T["tab_w"] / 2.0, P["axis_y"], P["axis_z"], P["hub_len"], P["core_len"], P["knob_d"], P["knob_h"],
         P["brake_interf"], P["brake_len"], name)
    appearance(comp, "Plastic - Matte (Gray)")
    return occ


def run(_context: str):
    left, right, _ = plug_matrices()
    place(build("Plug"), left)
    place(build("_Plug_R"), right)
    for name in ("Plug", "_Plug_R"):
        b = bb_mm(find_component(name).bRepBodies.item(0))  # proxy body: assembly position
        print("%-8s placed at X %.1f..%.1f" % (name, b[0], b[3]))
