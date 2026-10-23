"""Quick STL check (stdlib only): size, volume, triangle count, watertightness, bed contact area.

Reads binary and ASCII STL. Watertight = every edge is shared by exactly two triangles (vertices welded at 1 µm).

Usage: python -I tools/stl_check.py <file.stl> [...] [--bed 360x360]
"""
import struct
import sys
from collections import Counter


def read_stl(path):
    with open(path, "rb") as f:
        data = f.read()
    if len(data) >= 84:
        n = struct.unpack_from("<I", data, 80)[0]
        if 84 + n * 50 == len(data):
            return [struct.unpack_from("<12f", data, 84 + i * 50)[3:] for i in range(n)]
    tris, cur = [], []
    for line in data.decode("utf-8", "replace").splitlines():
        parts = line.split()
        if parts[:1] == ["vertex"]:
            cur.extend(float(x) for x in parts[1:4])
            if len(cur) == 9:
                tris.append(tuple(cur))
                cur = []
    return tris


def check(path, bed=None):
    tris = read_stl(path)
    if not tris:
        return "%s: no triangles" % path
    key = lambda x, y, z: (round(x * 1000), round(y * 1000), round(z * 1000))
    edges = Counter()
    vol = 0.0
    mn = [float("inf")] * 3
    mx = [float("-inf")] * 3
    zmin = min(min(t[2], t[5], t[8]) for t in tris)
    contact = 0.0
    for t in tris:
        a, b, c = (t[0], t[1], t[2]), (t[3], t[4], t[5]), (t[6], t[7], t[8])
        for p in (a, b, c):
            for i in range(3):
                mn[i] = min(mn[i], p[i])
                mx[i] = max(mx[i], p[i])
        ka, kb, kc = key(*a), key(*b), key(*c)
        for e in ((ka, kb), (kb, kc), (kc, ka)):
            edges[tuple(sorted(e))] += 1
        # signed tetrahedron volume against the origin
        vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0])
                + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0
        if all(abs(p[2] - zmin) < 0.01 for p in (a, b, c)):
            contact += abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2
    bad = sum(1 for n in edges.values() if n != 2)
    size = [mx[i] - mn[i] for i in range(3)]
    name = path.replace("\\", "/").split("/")[-1]
    line = "%-40s %8.2f x %8.2f x %7.2f mm  V=%9.1f cm3  tris=%7d  %s  bed contact %6.0f mm2" % (
        name, size[0], size[1], size[2], abs(vol) / 1000.0, len(tris),
        "watertight" if bad == 0 else "OPEN (%d bad edges)" % bad, contact)
    if bed:
        line += "  bed %s: %s" % ("x".join("%g" % b for b in bed),
                                  "fits" if size[0] <= bed[0] and size[1] <= bed[1] else "TOO BIG")
    return line


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    bed = None
    if "--bed" in argv:
        i = argv.index("--bed")
        bed = [float(v) for v in argv[i + 1].lower().split("x")]
        argv = argv[:i] + argv[i + 2:]
    if len(argv) < 2:
        raise SystemExit(__doc__)
    for path in argv[1:]:
        print(check(path, bed))


if __name__ == "__main__":
    main(sys.argv)
