# Seal (TPU): 1.8 x 1.4 ring swept along the groove, s 1.23..3.03, z split-2 .. split-0.6.
def run(_context: str):
    env = case_env()
    occ = new_component("Seal")
    comp = occ.component
    sweep_wall(comp, env, pts_sz("seal", env), "Seal")
    comp.bRepBodies.item(0).name = "Seal"
    report(comp)
