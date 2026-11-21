# Roll holder test pieces: a short hub ring with the bayonet and three mini plugs with the brake springs at
# CFG["test_brakes"] (pad overlap with the core wall). Then an exact check of a plug turning in the ring.
HUB_L, CORE_L = 12.0, 14.0


def run(_context: str):
    hub_comp = fresh_component("Test_Hub").component
    hub = test_hub(hub_comp, 0.0, 0.0, 0.0, HUB_L)
    appearance(hub_comp, "Plastic - Matte (Yellow)")
    plugs = []
    for j, b in enumerate(CFG["test_brakes"]):
        name = "Test_Plug_%02d" % round(b * 10)
        comp = fresh_component(name).component
        ya = 70.0 * (j + 1)
        plugs.append((plug(comp, 0.0, ya, 0.0, HUB_L, CORE_L, 40.0, 6.0, b, 10.0, name, text="%.1f" % b), ya))
        appearance(comp, "Plastic - Matte (Gray)")
    body, ya = plugs[0]
    shift = adsk.core.Matrix3D.create()
    shift.translation = adsk.core.Vector3D.create(0, cm(-ya), 0)
    for a in (0, 10, 30, 50, 70, 80, 86, 90):
        print("plug in ring, turned %2d deg: overlap %.3f mm3" % (a, overlap_mm3(hub, moved(body, shift, rot_x(a, 0.0, 0.0)))))
