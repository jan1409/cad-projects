# Export every root component (names starting with "_" are context only) as binary STL and as STEP,
# in component coordinates (= assembled position, mm), to EXPORT_DIR/<Component>.stl|.step.
import os


def run(_context: str):
    os.makedirs(EXPORT_DIR, exist_ok=True)
    em = design.exportManager
    seen = set()
    for i in range(root.occurrences.count):
        occ = root.occurrences.item(i)
        comp = occ.component
        if comp.name.startswith("_") or comp.name in seen:
            continue
        seen.add(comp.name)
        occ.isLightBulbOn = True  # hidden occurrences export as empty files (tools/fusion_view.py --show-only hides)
        stl = os.path.join(EXPORT_DIR, comp.name + ".stl")
        opts = em.createSTLExportOptions(occ, stl)
        opts.isBinaryFormat = True
        opts.meshRefinement = adsk.fusion.MeshRefinementSettings.MeshRefinementHigh
        em.execute(opts)
        step = os.path.join(EXPORT_DIR, comp.name + ".step")
        em.execute(em.createSTEPExportOptions(step, comp))
        print("exported", comp.name, "(stl, step)")
