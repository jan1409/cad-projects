# Face statistics of the reference (imported STEP document) vs the build document, per component:
# counts of face types and radii of cylinders / tori (fillets), to find missing or extra rounds.
# Read-only. Set FACE_PARTS = ["Base"] etc. before run() to restrict the output.
from collections import Counter

FACE_PARTS = CFG.get("faces", ["Base"])


def _axis_class(v):
    a = [abs(v.x), abs(v.y), abs(v.z)]
    k = a.index(max(a))
    return "XYZ"[k] if max(a) > 0.999 else "skew"


def _stats(body):
    c = Counter()
    for f in (body.faces.item(i) for i in range(body.faces.count)):
        g = f.geometry
        t = type(g).__name__
        if isinstance(g, adsk.core.Cylinder):
            c["cyl r%.3f %s" % (g.radius * 10, _axis_class(g.axis))] += 1
        elif isinstance(g, adsk.core.Torus):
            c["torus r%.3f/R%.3f %s" % (g.minorRadius * 10, g.majorRadius * 10, _axis_class(g.axis))] += 1
        elif isinstance(g, adsk.core.Cone):
            c["cone %.1fdeg %s" % (math.degrees(g.halfAngle), _axis_class(g.axis))] += 1
        else:
            c[t] += 1
    return c


def _bodies_of(doc, part):
    prod = adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
    out = []
    r = prod.rootComponent
    for i in range(r.occurrences.count):
        o = r.occurrences.item(i)
        if o.component.name == part:
            out += [o.component.bRepBodies.item(k) for k in range(o.component.bRepBodies.count)]
    return prod, out


def run(_context: str):
    docs = [app.documents.item(i) for i in range(app.documents.count)]
    for part in FACE_PARTS:
        stats = {}
        for doc in docs:
            prod = doc.products.itemByProductType("DesignProductType")
            if prod is None:
                continue
            d = adsk.fusion.Design.cast(prod)
            attr = d.attributes.itemByName("gridfinity", "role")
            ref_tag = d.attributes.itemByName("gridfinity", "ref")
            if attr is None and (ref_tag is None or ref_tag.value != CFG["tag"]):
                continue
            role = "build" if attr is not None else "ref"
            _, bodies = _bodies_of(doc, part)
            if bodies:
                st = Counter()
                for b in bodies:
                    st += _stats(b)
                stats[role] = (st, sum(b.volume for b in bodies))
        if "ref" not in stats or "build" not in stats:
            print(part, "missing in", [k for k in ("ref", "build") if k not in stats])
            continue
        ref, gen = stats["ref"][0], stats["build"][0]
        print("[%s] volume ref %.4f build %.4f cm3 (diff %+.4f)" % (part, stats["ref"][1], stats["build"][1], stats["build"][1] - stats["ref"][1]))
        for k in sorted(set(ref) | set(gen)):
            if ref[k] != gen[k]:
                print("   %-34s ref %4d  build %4d" % (k, ref[k], gen[k]))
