"""Downward-facing area of an STL in print pose, by overhang angle (from vertical), excluding the bed layer."""
import sys, numpy as np, trimesh
for f in sys.argv[1:]:
    m = trimesh.load(f, force="mesh")
    n = m.face_normals; A = m.area_faces; c = m.triangles_center
    zmin = m.bounds[0][2]
    down = (n[:, 2] < -1e-6) & (c[:, 2] > zmin + 0.05)
    ang = np.degrees(np.arccos(np.clip(-n[:, 2], -1, 1)))  # 0 = facing straight down, 90 = vertical
    ov = 90 - ang  # overhang from vertical: 0 vertical wall, 90 ceiling
    out = []
    for lo, hi in ((40, 46), (46, 60), (60, 80), (80, 91)):
        sel = down & (ov >= lo) & (ov < hi)
        zs = c[sel, 2]
        out.append(f"{lo}-{hi}deg: {A[sel].sum():7.1f} mm2" + (f" (z {zs.min():.1f}-{zs.max():.1f})" if sel.any() else ""))
    print(f.split('/')[-1], " | ".join(out))
