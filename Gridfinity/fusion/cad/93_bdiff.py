# Exact B-rep comparison against the reference document (imported Onshape STEP, open in Fusion):
# temporary boolean differences ref - build and build - ref, listing every remaining lump (volume, bounding box).
# Read-only. CFG["faces"] selects the parts; reference component names map via REF_NAMES.
REF_NAMES = {"Base": ["Base"], "Lid": ["Lid"], "Seal": ["Seal"], "Window": ["Part 6"], "Latch": ["Latch", "Latch (1)"]}
PARTS = CFG.get("faces", ["Base"])
MIN_CM3 = 1e-5


def _design_of(doc):
    prod = doc.products.itemByProductType("DesignProductType")
    return adsk.fusion.Design.cast(prod) if prod else None


def _ref_and_build():
    ref = build = None
    for i in range(app.documents.count):
        d = _design_of(app.documents.item(i))
        if d is None:
            continue
        tag = d.attributes.itemByName("gridfinity", "ref")
        if d.attributes.itemByName("gridfinity", "role") is not None:
            build = d
        elif tag is not None and tag.value == CFG["tag"]:
            ref = d
    return ref, build


def _merged(design_, names, first_only=False):
    tbm = adsk.fusion.TemporaryBRepManager.get()
    acc = None
    r = design_.rootComponent
    seen = set()
    for k in range(r.occurrences.count):
        occ = r.occurrences.item(k)
        if occ.component.name not in names or (first_only and occ.component.name in seen):
            continue
        seen.add(occ.component.name)
        for j in range(occ.bRepBodies.count):
            b = tbm.copy(occ.bRepBodies.item(j))  # occurrence proxy -> assembly coordinates
            if acc is None:
                acc = b
            else:
                tbm.booleanOperation(acc, b, adsk.fusion.BooleanTypes.UnionBooleanType)
    return acc


def _lumps(body, label):
    rows = []
    for i in range(body.lumps.count):
        lp = body.lumps.item(i)
        v = lp.volume
        if v < MIN_CM3:
            continue
        b = lp.boundingBox
        rows.append((v, b))
    rows.sort(key=lambda t: -t[0])
    total = sum(v for v, _ in rows)
    print("  %s: %.5f cm3 in %d lumps" % (label, total, len(rows)))
    for v, b in rows[:12]:
        print("     %.5f cm3  x %8.2f..%8.2f  y %8.2f..%8.2f  z %7.2f..%7.2f" % (
            v, b.minPoint.x * 10, b.maxPoint.x * 10, b.minPoint.y * 10, b.maxPoint.y * 10, b.minPoint.z * 10, b.maxPoint.z * 10))


def run(_context: str):
    ref_d, build_d = _ref_and_build()
    if ref_d is None or build_d is None:
        raise RuntimeError("need the reference document (imported STEP) and the build document open")
    tbm = adsk.fusion.TemporaryBRepManager.get()
    for part in PARTS:
        build_names = [part] if part != "Latch" else ["Latch"]
        r = _merged(ref_d, REF_NAMES[part])
        g = _merged(build_d, build_names)
        if r is None or g is None:
            print("[%s] missing (ref %s, build %s)" % (part, r is not None, g is not None))
            continue
        print("[%s] volume ref %.5f build %.5f cm3 (diff %+.5f)" % (part, r.volume, g.volume, g.volume - r.volume))
        a = tbm.copy(r)
        tbm.booleanOperation(a, g, adsk.fusion.BooleanTypes.DifferenceBooleanType)
        _lumps(a, "ref - build (missing in build)")
        b = tbm.copy(g)
        tbm.booleanOperation(b, r, adsk.fusion.BooleanTypes.DifferenceBooleanType)
        _lumps(b, "build - ref (extra in build)")
