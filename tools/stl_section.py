"""Planar sections of STL files, overlaid in one PNG (needs the project venv: trimesh, matplotlib).

Use it to read profiles from reference parts and to overlay a generated part on its reference.

Usage:
  .venv/Scripts/python.exe tools/stl_section.py <plane> <out.png> <a.stl> [<b.stl> ...] [--lim u0 u1 v0 v1] [--grid 1]
    <plane>  x=<mm> | y=<mm> | z=<mm>   (section plane; plot axes: x-plane -> (y,z), y-plane -> (x,z), z-plane -> (x,y))
    --lim    zoom window in plot coordinates
    --grid   grid spacing in mm (default: matplotlib auto)
    --vertices  also print each outline as an ordered vertex list (collinear points dropped), clipped to --lim
Prints the extent of every section so values can be read off without the image.
"""
import os
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import trimesh  # noqa: E402
from matplotlib.collections import LineCollection  # noqa: E402

AXES = {"x": (0, (1, 2)), "y": (1, (0, 2)), "z": (2, (0, 1))}


def section(path, axis, value):
    mesh = trimesh.load_mesh(path)
    normal = np.zeros(3)
    normal[AXES[axis][0]] = 1.0
    origin = np.zeros(3)
    origin[AXES[axis][0]] = value
    segs = trimesh.intersections.mesh_plane(mesh, normal, origin)
    u, v = AXES[axis][1]
    return segs[:, :, [u, v]] if len(segs) else np.zeros((0, 2, 2))


def chains(segs, tol=1e-4):
    """Join section segments into ordered polylines."""
    key = lambda p: (round(p[0] / tol), round(p[1] / tol))
    adj = {}
    for i, (a, b) in enumerate(segs):
        adj.setdefault(key(a), []).append((i, 1))
        adj.setdefault(key(b), []).append((i, 0))
    used = [False] * len(segs)
    out = []
    for i in range(len(segs)):
        if used[i]:
            continue
        used[i] = True
        line = [tuple(segs[i][0]), tuple(segs[i][1])]
        for end in (1, 0):  # grow forward, then backward
            while True:
                tip = line[-1] if end else line[0]
                nxt = next(((j, s) for j, s in adj.get(key(tip), []) if not used[j]), None)
                if nxt is None:
                    break
                j, s = nxt
                used[j] = True
                p = tuple(segs[j][s])
                line.append(p) if end else line.insert(0, p)
        out.append(line)
    return out


def simplify(line, tol=1e-3):
    if len(line) < 3:
        return line
    keep = [line[0]]
    for k in range(1, len(line) - 1):
        a, b, c = np.array(keep[-1]), np.array(line[k]), np.array(line[k + 1])
        u, w = b - a, c - a
        if abs(u[0] * w[1] - u[1] * w[0]) > tol * max(np.linalg.norm(w), 1e-9):
            keep.append(line[k])
    keep.append(line[-1])
    return keep


def print_vertices(segs, lim):
    for n, line in enumerate(chains(segs)):
        pts = simplify(line)
        if lim:
            pts = [p for p in pts if lim[0] <= p[0] <= lim[1] and lim[2] <= p[1] <= lim[3]]
        if pts:
            print("  outline %d (%d pts): %s" % (n, len(pts), " ".join("(%.3f,%.3f)" % p for p in pts)))


def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) < 4:
        raise SystemExit(__doc__)
    lim, grid = None, None
    vertices = "--vertices" in argv
    argv = [a for a in argv if a != "--vertices"]
    if "--lim" in argv:
        k = argv.index("--lim")
        lim = [float(v) for v in argv[k + 1:k + 5]]
        argv = argv[:k] + argv[k + 5:]
    if "--grid" in argv:
        k = argv.index("--grid")
        grid = float(argv[k + 1])
        argv = argv[:k] + argv[k + 2:]
    axis, value = argv[1].split("=")
    value = float(value)
    out = argv[2]
    names = {"x": ("Y", "Z"), "y": ("X", "Z"), "z": ("X", "Y")}[axis]
    fig, ax = plt.subplots(figsize=(11, 8))
    for i, path in enumerate(argv[3:]):
        segs = section(path, axis, value)
        label = os.path.basename(os.path.dirname(path)) + "/" + os.path.basename(path)
        if len(segs):
            pts = segs.reshape(-1, 2)
            print("%-34s %s: %8.3f..%8.3f   %s: %8.3f..%8.3f   segments %d" % (
                label, names[0], pts[:, 0].min(), pts[:, 0].max(), names[1], pts[:, 1].min(), pts[:, 1].max(), len(segs)))
            ax.add_collection(LineCollection(segs, colors="C%d" % i, linewidths=1.0, label=label))
            if vertices:
                print_vertices(segs, lim)
        else:
            print("%-34s no intersection" % label)
    ax.autoscale()
    if lim:
        ax.set_xlim(lim[0], lim[1])
        ax.set_ylim(lim[2], lim[3])
    if grid:
        x0, x1 = ax.get_xlim()
        y0, y1 = ax.get_ylim()
        ax.set_xticks(np.arange(np.floor(x0 / grid) * grid, x1 + grid, grid))
        ax.set_yticks(np.arange(np.floor(y0 / grid) * grid, y1 + grid, grid))
        ax.tick_params(labelsize=6)
    ax.set_aspect("equal")
    ax.grid(True, lw=0.3)
    ax.set_xlabel(names[0] + " mm")
    ax.set_ylabel(names[1] + " mm")
    ax.set_title("section %s = %g mm" % (axis.upper(), value), fontsize=9)
    ax.legend(fontsize=7, loc="best")
    fig.savefig(out, dpi=120, bbox_inches="tight")
    print("png:", out)


if __name__ == "__main__":
    main(sys.argv)
