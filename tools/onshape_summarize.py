"""Readable summary of an Onshape Part Studio feature tree (JSON from `onshape_api.py features`).

Lists every feature with its type, the non-default parameters (expressions such as `#x_count * 42 mm` are kept)
and, for sketches, entity/constraint counts plus dimension expressions. Derived-feature sources and their
configuration overrides are resolved so the derive chain is visible.

Usage: python -I tools/onshape_summarize.py <features.json> [<out.txt>]
"""
import json
import sys
from collections import Counter


def pval(p):
    t = p.get("btType", "")
    if "Quantity" in t:
        return p.get("expression") or p.get("value")
    if "Enum" in t or "Boolean" in t or "String" in t:
        return p.get("value")
    if "Query" in t:
        return "<query x%d>" % len(p.get("queries", []))
    if "Array" in t:
        return "<array x%d>" % len(p.get("items", []))
    if "Derived" in t:
        cfg = ", ".join("%s=%s" % (c.get("parameterId"), c.get("expression") or c.get("value"))
                        for c in p.get("configuration", []))
        return "<derived %s%s>" % (p.get("namespace", ""), (" | " + cfg) if cfg else "")
    return "<%s>" % t


def sketch_info(f):
    dims = []
    for c in f.get("constraints", []):
        for cp in c.get("parameters", []):
            # Only real dimensions carry units or #variables; bare floats are solver positions
            expr = cp.get("expression")
            if "Quantity" in cp.get("btType", "") and expr and (any(u in expr for u in ("mm", "deg", "in")) or "#" in expr):
                dims.append(expr)
    return "entities=%d constraints=%d dims=%s" % (len(f.get("entities", [])), len(f.get("constraints", [])), dims)


def summarize(d):
    out = []
    feats = d.get("features", [])
    out.append("features: %d   rollbackIndex: %s   types: %s" % (
        len(feats), d.get("rollbackIndex"), dict(Counter(f.get("featureType") for f in feats).most_common())))
    for i, f in enumerate(feats):
        flag = "  [suppressed]" if f.get("suppressed") else ""
        out.append("%3d %-28s %-18s%s" % (i, (f.get("name") or "")[:28], f.get("featureType"), flag))
        shown = []
        for p in f.get("parameters", []):
            v = pval(p)
            if v in (None, "", False) or v == "<query x0>":
                continue
            shown.append("%s=%s" % (p.get("parameterId"), v))
        if f.get("featureType") == "newSketch":
            shown.append(sketch_info(f))
        if shown:
            out.append("      " + "; ".join(str(s) for s in shown))
    return "\n".join(out)


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) < 2:
        raise SystemExit(__doc__)
    with open(argv[1], encoding="utf-8") as f:
        text = summarize(json.load(f))
    if len(argv) > 2:
        with open(argv[2], "w", encoding="utf-8") as f:
            f.write(text + "\n")
        print("summary ->", argv[2])
    else:
        print(text)


if __name__ == "__main__":
    main(sys.argv)
