# Window (laser-cut plexiglass): (Li-4) x (Wi-4) r 0.2, window_t thick, top at lid top - 1.2.
def run(_context: str):
    env = case_env()
    wt = env["window_t"]
    occ = new_component("Window")
    comp = occ.component
    sk = Sk(comp, "z", env["top"] - 1.2 - wt, "Window outline")
    rrect_c(sk, 0, 0, env["Li"] - 4, env["Wi"] - 4, 0.2)
    extrude(comp, sk.largest_profile(), wt, NEW, name="Window")
    comp.bRepBodies.item(0).name = "Window"
    report(comp)
