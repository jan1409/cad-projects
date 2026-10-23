# Export every case component as binary STL (assembled position, mm) to EXPORT_DIR/<Component>.stl.
import os


def run(_context: str):
    os.makedirs(EXPORT_DIR, exist_ok=True)
    em = design.exportManager
    for i in range(root.occurrences.count):
        occ = root.occurrences.item(i)
        if occ.component.name.startswith("_"):
            continue
        path = os.path.join(EXPORT_DIR, occ.component.name + ".stl")
        opts = em.createSTLExportOptions(occ, path)
        opts.isBinaryFormat = True
        opts.meshRefinement = adsk.fusion.MeshRefinementSettings.MeshRefinementHigh
        em.execute(opts)
        print("exported", path)
