"""Dump the sketches of an Onshape feature tree in mm: plane, lines/arcs/circles/points, dimensions.

Coordinates are the solved sketch coordinates at the last regeneration (i.e. for the configuration that was active
when the feature tree was fetched). Plane names: Top/Front/Right for default planes, otherwise the names of the
features whose geometry the plane query references.

Usage:
  python -I tools/onshape_sketches.py <features.json> [<sketch name or index> ...]
  .venv/Scripts/python.exe tools/onshape_sketches.py <features.json> --png <out_dir> [<sketch> ...]
    (--png needs matplotlib from the project venv; one labelled PNG per sketch)
"""
import json
import math
import os
import re
import sys

DEFAULT_PLANES = {"JDC": "Top", "JCC": "Front", "JEC": "Right", "JFC": "Right", "IB": "Origin"}
DIM_TYPES = {"DISTANCE", "LENGTH", "ANGLE", "RADIUS", "DIAMETER", "CENTERLINE_DIMENSION", "OFFSET"}


def mm(v):
    return v * 1000.0


def plane_name(feature, id_to_name):
    for p in feature.get("parameters", []):
        if p.get("parameterId") != "sketchPlane":
            continue
        names = []
        for q in p.get("queries", []):
            for did in q.get("deterministicIds", []):
                if did in DEFAULT_PLANES:
                    names.append(DEFAULT_PLANES[did])
            qs = q.get("queryString") or ""
            m = re.search(r"\$(Top|Front|Right)planeOp", qs)
            if m:
                names.append(m.group(1))
            for fid, name in id_to_name.items():
                if fid and fid in qs:
                    names.append("face/plane of '%s'" % name)
        return ", ".join(dict.fromkeys(names)) or "?"
    return "?"


def segment(e):
    """-> dict(kind, pts or center/radius/angles) in mm."""
    g = e.get("geometry") or {}
    t = g.get("btType", "")
    s, en = e.get("startParam"), e.get("endParam")
    if "Line" in t:
        px, py, dx, dy = g["pntX"], g["pntY"], g["dirX"], g["dirY"]
        a = (mm(px + dx * s), mm(py + dy * s))
        b = (mm(px + dx * en), mm(py + dy * en))
        return {"kind": "L", "a": a, "b": b, "len": math.dist(a, b)}
    if "Circle" in t:
        cx, cy, r = mm(g["xCenter"]), mm(g["yCenter"]), mm(g["radius"])
        xd, yd = g.get("xDir", 1.0), g.get("yDir", 0.0)
        sign = -1.0 if g.get("clockwise") else 1.0
        base = math.atan2(yd, xd)
        if s is None or en is None or e.get("btType", "").startswith("BTMSketchCurve-4"):
            return {"kind": "C", "c": (cx, cy), "r": r}
        a0, a1 = base + sign * s, base + sign * en
        pa = (cx + r * math.cos(a0), cy + r * math.sin(a0))
        pb = (cx + r * math.cos(a1), cy + r * math.sin(a1))
        return {"kind": "A", "c": (cx, cy), "r": r, "a": pa, "b": pb, "a0": a0, "a1": a1,
                "sweep": math.degrees(sign * (en - s))}
    if e.get("btType", "").startswith("BTMSketchPoint"):
        return {"kind": "P", "p": (mm(e.get("x", 0.0)), mm(e.get("y", 0.0)))}
    return {"kind": "?", "type": t or e.get("btType")}


def fmt_pt(p):
    return "(%8.3f, %8.3f)" % p


def dims(feature):
    out = []
    for c in feature.get("constraints", []):
        ct = c.get("constraintType")
        if ct not in DIM_TYPES:
            continue
        val, refs = None, []
        for p in c.get("parameters", []):
            if "Quantity" in p.get("btType", "") and p.get("expression"):
                expr = p["expression"]
                if any(u in expr for u in ("mm", "deg", "in")) or "#" in expr:
                    val = expr
            elif p.get("btType", "").startswith("BTMParameterString") and p.get("parameterId") in ("localFirst", "localSecond"):
                refs.append(p.get("value", "").split(".")[0])
            elif "QueryList" in p.get("btType", ""):
                refs.append("<external>")
        if val:
            out.append((ct, val, refs))
    return out


def sketches(d):
    feats = d.get("features", [])
    id_to_name = {f.get("featureId"): f.get("name") for f in feats}
    for i, f in enumerate(feats):
        if f.get("featureType") == "newSketch":
            yield i, f, plane_name(f, id_to_name)


def dump(i, f, plane):
    ents = f.get("entities", [])
    lines = ["#%d %s   plane: %s   entities=%d" % (i, f.get("name"), plane, len(ents))]
    for e in ents:
        sg = segment(e)
        tag = e.get("entityId", "")[:12] + ("  (construction)" if e.get("isConstruction") else "")
        k = sg["kind"]
        if k == "L":
            lines.append("  L %s -> %s  len %7.3f   %s" % (fmt_pt(sg["a"]), fmt_pt(sg["b"]), sg["len"], tag))
        elif k == "A":
            lines.append("  A c=%s r=%6.3f  %s -> %s  sweep %6.1f°   %s" % (fmt_pt(sg["c"]), sg["r"], fmt_pt(sg["a"]),
                                                                       fmt_pt(sg["b"]), sg["sweep"], tag))
        elif k == "C":
            lines.append("  C c=%s r=%6.3f (d=%.3f)   %s" % (fmt_pt(sg["c"]), sg["r"], 2 * sg["r"], tag))
        elif k == "P":
            lines.append("  P %s   %s" % (fmt_pt(sg["p"]), tag))
        else:
            lines.append("  ? %s   %s" % (sg.get("type"), tag))
    for ct, val, refs in dims(f):
        lines.append("  dim %-20s %-28s %s" % (ct, val, ", ".join(r for r in refs if r)))
    return "\n".join(lines)


def png(i, f, plane, out_dir):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(8, 8))
    for e in f.get("entities", []):
        sg = segment(e)
        style = dict(color="0.6", lw=0.8, ls="--") if e.get("isConstruction") else dict(color="C0", lw=1.4)
        if sg["kind"] == "L":
            ax.plot([sg["a"][0], sg["b"][0]], [sg["a"][1], sg["b"][1]], **style)
        elif sg["kind"] == "A":
            n = 40
            a0, a1 = sg["a0"], sg["a1"]
            ts = [a0 + (a1 - a0) * k / n for k in range(n + 1)]
            ax.plot([sg["c"][0] + sg["r"] * math.cos(t) for t in ts], [sg["c"][1] + sg["r"] * math.sin(t) for t in ts], **style)
        elif sg["kind"] == "C":
            ax.add_patch(plt.Circle(sg["c"], sg["r"], fill=False, **style))
        elif sg["kind"] == "P":
            ax.plot(*sg["p"], "o", color="C3", ms=3)
    ax.set_aspect("equal")
    ax.grid(True, lw=0.3)
    ax.set_title("#%d %s  (%s)  mm" % (i, f.get("name"), plane), fontsize=9)
    path = os.path.join(out_dir, "%02d_%s.png" % (i, re.sub(r"\W+", "_", f.get("name", "sketch"))))
    fig.savefig(path, dpi=110, bbox_inches="tight")
    plt.close(fig)
    return path


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) < 2:
        raise SystemExit(__doc__)
    out_dir = None
    if "--png" in argv:
        k = argv.index("--png")
        out_dir = argv[k + 1]
        argv = argv[:k] + argv[k + 2:]
        os.makedirs(out_dir, exist_ok=True)
    with open(argv[1], encoding="utf-8") as fh:
        d = json.load(fh)
    wanted = set(argv[2:])
    for i, f, plane in sketches(d):
        if wanted and f.get("name") not in wanted and str(i) not in wanted:
            continue
        print(dump(i, f, plane))
        if out_dir:
            print("  png:", png(i, f, plane, out_dir))
        print()


if __name__ == "__main__":
    main(sys.argv)
