# Pose the plugs for pictures: CFG["pose"] = "locked" (default) or "pulled" (the plug of the left bracket - seen
# from the front - turned back and pulled out 70 mm, as for a roll change).


def run(_context: str):
    left, right, flip = plug_matrices()
    place(find_component("Plug"), left)
    occ = find_component("_Plug_R")
    if CFG.get("pose") == "pulled":
        m = flip.copy()
        out = adsk.core.Matrix3D.create()
        out.translation = adsk.core.Vector3D.create(cm(70.0), 0, 0)
        m.transformBy(out)
        place(occ, m)
    else:
        place(occ, right)
    print("pose:", CFG.get("pose", "locked"))
