# Bounding box, volume and body count of every case component.
def run(_context: str):
    env = case_env()
    print("config %dx%dx%d window_t %.2f" % (env["x_count"], env["y_count"], env["z_count"], env["window_t"]))
    for i in range(root.occurrences.count):
        comp = root.occurrences.item(i).component
        if comp.name.startswith("_"):
            continue
        print("[%s] bodies %d" % (comp.name, comp.bRepBodies.count))
        report(comp)
