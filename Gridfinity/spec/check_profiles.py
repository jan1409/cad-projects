"""Check the wall/seal profiles in case_params.json against sections of the Onshape reference STLs.

Every profile vertex (except fillet corners "r" and points marked "synthetic") must lie on the
measured section outline (x = 0 cut, +Y wall: s = y - Wi/2) within TOL.

Usage: .venv/Scripts/python.exe Gridfinity/spec/check_profiles.py
"""
import json
import os
import sys

import numpy as np
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, "..", "reference")
TOL = 0.01
CASES = [("3x2x4", 1.6), ("5x4x6", 1.6), ("8x6x8", 1.6), ("5x4x6_w075", 0.75)]


def evaluate(expr, env):
    return float(eval(str(expr), {"__builtins__": {}}, env))


def env_for(spec, x, y, n, wt):
    env = {"x_count": x, "y_count": y, "z_count": n, "window_t": wt, "window_gap": 0.0}  # Onshape original has no gap
    for k, v in spec["derived"].items():
        env[k] = evaluate(v, env)
    return env


def section_segments(path, half_w, x_count):
    # Cut through a cell centre: x = 0 is a cell boundary when x_count is even
    x_cut = 0.0 if x_count % 2 else 21.0
    mesh = trimesh.load_mesh(path)
    segs = trimesh.intersections.mesh_plane(mesh, [1, 0, 0], [x_cut, 0, 0])
    segs = segs[:, :, [1, 2]]
    segs = segs[(segs[:, :, 0] > half_w - 10).all(axis=1)]  # +Y wall region only
    segs[:, :, 0] -= half_w
    return segs


def dist_to_segments(p, segs):
    a, b = segs[:, 0, :], segs[:, 1, :]
    ab = b - a
    t = np.clip(((p - a) * ab).sum(1) / np.maximum((ab * ab).sum(1), 1e-12), 0, 1)
    return np.min(np.linalg.norm(a + ab * t[:, None] - p, axis=1))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    with open(os.path.join(HERE, "case_params.json"), encoding="utf-8") as f:
        spec = json.load(f)
    failures = 0
    for tag, wt in CASES:
        x, y, n = (int(v) for v in tag.split("_")[0].split("x"))
        env = env_for(spec, x, y, n, wt)
        for part, prof in (("Base", "base_wall"), ("Lid", "lid_wall"), ("Seal", "seal")):
            path = os.path.join(REF, tag, part + ".stl")
            if not os.path.exists(path):
                continue
            segs = section_segments(path, env["Wi"] / 2, x)
            worst = 0.0
            for pt in spec["profiles"][prof]:
                if "r" in pt or pt.get("synthetic"):
                    continue
                p = np.array([evaluate(pt["s"], env), evaluate(pt["z"], env)])
                d = dist_to_segments(p, segs)
                worst = max(worst, d)
                if d > TOL:
                    failures += 1
                    print("  FAIL %s %s %s point (%.3f, %.3f) off by %.3f" % (tag, part, prof, p[0], p[1], d))
            print("%-11s %-5s %-10s max deviation %.4f mm" % (tag, part, prof, worst))
    print("RESULT:", "OK" if failures == 0 else "%d point(s) off" % failures)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
