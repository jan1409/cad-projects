# Exact B-rep comparison against the reference document (imported Onshape STEP, open in Fusion):
# temporary boolean differences ref - build and build - ref, listing every remaining lump (volume, bounding box).
# Read-only. CFG["faces"] selects the parts; reference component names map via REF_NAMES.
REF_NAMES = {"Base": ["Base"], "Lid": ["Lid"], "Seal": ["Seal"], "Window": ["Part 6"], "Latch": ["Latch", "Latch (1)"]}
PARTS = CFG.get("faces", ["Base"])
MIN_CM3 = 1e-5
# Fetched once: after a failed boolean, the next TemporaryBRepManager.get() re-raises that failure.
TBM = adsk.fusion.TemporaryBRepManager.get()


def _design_of(doc):
    prod = doc.products.itemByProductType("DesignProductType")
    return adsk.fusion.Design.cast(prod) if prod else None


def _ref_and_build():
    """Reference doc for CFG["tag"]; compared doc = the Fusion build, or with CFG["against"] = "web" the imported
    browser-generator STEP (94_web.py)."""
    ref = build = None
    against = CFG.get("against", "build")
    for i in range(app.documents.count):
        d = _design_of(app.documents.item(i))
        if d is None:
            continue
        tag = d.attributes.itemByName("gridfinity", "ref")
        web = d.attributes.itemByName("gridfinity", "web")
        if against == "build" and d.attributes.itemByName("gridfinity", "role") is not None:
            build = d
        elif against == "web" and web is not None and web.value == CFG["tag"]:
            build = d
        elif tag is not None and tag.value == CFG["tag"]:
            ref = d
    return ref, build


def _merged(design_, names, first_only=False):
    tbm = TBM
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
    tbm = TBM
    for part in PARTS:
        build_names = [part] if part != "Latch" else ["Latch"]
        r = _merged(ref_d, REF_NAMES[part])
        g = _merged(build_d, build_names)
        if r is None or g is None:
            print("[%s] missing (ref %s, build %s)" % (part, r is not None, g is not None))
            continue
        print("[%s] volume ref %.5f build %.5f cm3 (diff %+.5f)" % (part, r.volume, g.volume, g.volume - r.volume))
        # Nearly identical solids are the hardest case for booleans (e.g. ASM_EDGECOIN_PROBLEM when edges of both lie
        # within tolerance of each other): report it instead of aborting; the volume difference above stays exact.
        for label, first, second in (("ref - build (missing in build)", r, g), ("build - ref (extra in build)", g, r)):
            body = tbm.copy(first)
            try:
                tbm.booleanOperation(body, second, adsk.fusion.BooleanTypes.DifferenceBooleanType)
            except RuntimeError as e:
                code = next((w for w in str(e).split() if w.startswith("ASM_")), "boolean error")
                print("  %s: boolean failed (%s)" % (label, code))
                continue
            _lumps(body, label)
