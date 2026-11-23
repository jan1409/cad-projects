"""Core-star concept: numeric geometry (D 550, k 3) and the face frames of the rhombicuboctahedron.
Local point frame: z = point axis, plug end on the bed at z = 0, face plane at z = Z0."""
import math
import numpy as np
from scipy.spatial import ConvexHull

S2, S3 = math.sqrt(2), math.sqrt(3)
rs = (1 + S2) / 2
rt = (3 + S2) / (2 * S3)

P = dict(D=550.0, k=3.0, t=0.9, g=0.2, w=2.5, hf=7.0, er=0.6, tw=1.6, tf=1.2, p=0.8, pre=0.2, cr=0.3,
         zb=2.7, la=12.0, sl=0.6, bw=5.0)


def derived(P):
    d = dict(P)
    a = P["D"] / 2 / (rs + P["k"])
    d.update(a=a, Rs=rs * a, Rt=rt * a, hs=P["k"] * a, ht=P["D"] / 2 - rt * a)
    d["Z0"] = P["hf"] + P["zb"]
    for key, T, R, h, wod in (("S", 0.5 / rs, rs * a, d["hs"], None), ("T", 1 / (2 * S3 * rt), rt * a, d["ht"], None)):
        c = 1 / math.sqrt(1 + T * T)
        zc = d["Z0"] - R
        wod = R * T - P["g"] / (2 * c)  # half-width (square) / inradius (triangle) of the pyramid base
        dpl = P["w"] + P["g"] / 2
        dpi = dpl + P["tw"]
        hw = lambda z, dl: (z - zc) * T - dl / c
        Z0 = d["Z0"]
        zf = (Z0 - wod - zc * T - dpl / c) / (1 - T)
        zfi = (Z0 - wod + P["tf"] * S2 - zc * T - dpi / c) / (1 - T)
        q = math.sqrt(1 + (wod / h) ** 2)
        zpi = Z0 + (P["tf"] * S2 - P["t"] * q) / (1 + wod / h)
        za = Z0 + h * (1 - P["t"] * q / wod)
        zx = (Z0 - wod - zc * T - P["w"] / c) / (1 - T)  # core: flank meets window wall
        zcat = Z0 - P["hf"]
        ztop = zcat + (P["g"] / (2 * c) + P["pre"]) / (1 + T)
        zct = zcat + (P["g"] / (2 * c) + P["pre"] - P["p"] / c) / (1 + T)
        zcb = zct - P["cr"]
        zrb = zcb - (P["p"] / c) / (1 - T)
        d[key] = dict(T=T, c=c, zc=zc, wod=wod, zf=zf, zfi=zfi, zpi=zpi, za=za, zx=zx, zcat=zcat, ztop=ztop,
                      zct=zct, zcb=zcb, zrb=zrb, h0=hw(0, dpl), hf_=hw(zf, dpl), hi0=hw(-1, dpi), hfi=hw(zfi, dpi),
                      hpi=wod - P["tf"] * S2 - (Z0 - zpi), wall_at_2=hw(2, dpl), inner_at_2=hw(2, dpi))
    return d


def faces(a=1.0):
    """26 faces: normal, kind, distance, local frame (x, y, n) as columns of R (local -> world)."""
    Rs_ = rs * a
    V = []
    import itertools
    for perm in set(itertools.permutations([0, 1, 2])):
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    v = [0, 0, 0]
                    vals = [sx * a / 2, sy * a / 2, sz * Rs_]
                    for i, pi in enumerate(perm):
                        v[pi] = vals[i]
                    V.append(tuple(round(c, 12) for c in v))
    V = np.array(sorted(set(V)))
    hull = ConvexHull(V)
    groups = {}
    for eq, simplex in zip(hull.equations, hull.simplices):
        key = tuple(np.round(eq[:3], 6))
        groups.setdefault(key, set()).update(simplex.tolist())
    out = []
    for key, idx in groups.items():
        n = np.array(key, float)
        n /= np.linalg.norm(n)
        pts = V[sorted(idx)]
        cen = pts.mean(axis=0)
        kind = "sq" if len(pts) == 4 else "tri"
        # order the vertices anticlockwise seen from outside
        u = pts[0] - cen
        u /= np.linalg.norm(u)
        v = np.cross(n, u)
        ang = [math.atan2(np.dot(p - cen, v), np.dot(p - cen, u)) for p in pts]
        pts = pts[np.argsort(ang)]
        if kind == "sq":
            x = pts[1] - pts[0]
            x /= np.linalg.norm(x)
            y = np.cross(n, x)
        else:
            # local -y side = edge pts[0]-pts[1]; y points from that edge's midpoint through the centre
            mid = (pts[0] + pts[1]) / 2
            y = cen - mid
            y /= np.linalg.norm(y)
            x = np.cross(y, n)
        R = np.column_stack([x, y, n])
        assert abs(np.linalg.det(R) - 1) < 1e-9
        out.append(dict(n=n, kind=kind, dist=float(np.dot(cen, n)), R=R, verts=pts))
    out.sort(key=lambda f: (f["kind"], -round(f["n"][2], 6), round(math.atan2(f["n"][1], f["n"][0]), 6)))
    return out


def axis_angle(R):
    ang = math.acos(max(-1.0, min(1.0, (np.trace(R) - 1) / 2)))
    if ang < 1e-12:
        return [0.0, 0.0, 1.0], 0.0
    if abs(ang - math.pi) < 1e-9:
        # 180 deg: axis from R + I
        M = (R + np.eye(3)) / 2
        i = int(np.argmax(np.diag(M)))
        ax = M[:, i] / math.sqrt(M[i, i])
        return [float(c) for c in ax / np.linalg.norm(ax)], 180.0
    ax = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]]) / (2 * math.sin(ang))
    return [float(c) for c in ax], math.degrees(ang)


def rot(ax, deg):
    ax = np.array(ax, float) / np.linalg.norm(ax)
    t = math.radians(deg)
    K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
    return np.eye(3) + math.sin(t) * K + (1 - math.cos(t)) * K @ K


if __name__ == "__main__":
    d = derived(P)
    print({k: round(v, 3) for k, v in d.items() if isinstance(v, float)})
    for key in ("S", "T"):
        print(key, {k: round(v, 3) for k, v in d[key].items()})
    F = faces()
    print(len(F), sum(f["kind"] == "sq" for f in F), "squares")
    for f in F:
        ax, ang = axis_angle(f["R"])
        assert np.allclose(rot(ax, ang), f["R"], atol=1e-9), f
        print(f["kind"], np.round(f["n"], 3), round(f["dist"], 4), np.round(ax, 4), round(ang, 3))
