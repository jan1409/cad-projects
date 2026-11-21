# Bounding box, volume and solidity of every body, per root component.


def run(_context: str):
    seen = set()
    for i in range(root.occurrences.count):
        comp = root.occurrences.item(i).component
        if comp.name in seen:
            continue
        seen.add(comp.name)
        print("[%s]" % comp.name)
        report(comp)
