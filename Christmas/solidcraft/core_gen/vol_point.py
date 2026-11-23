import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geom import derived, P
d = derived(P); S2, S3 = math.sqrt(2), math.sqrt(3)
def area(kind, h):  # h = half width (square) or inradius (triangle)
    return (2*h)**2 if kind == "S" else 3*S3*h*h
def fr(kind, z1, h1, z2, h2):
    A1, A2 = area(kind, h1), area(kind, h2); return (z2-z1)/3*(A1 + A2 + math.sqrt(A1*A2))
def shoelace(pts):
    return abs(sum(pts[i][0]*pts[i-1][1] - pts[i-1][0]*pts[i][1] for i in range(len(pts))))/2
for X, n, h in (("S", 4, d["hs"]), ("T", 3, d["ht"])):
    q = d[X]; T, c, zc, wod = q["T"], q["c"], q["zc"], q["wod"]
    dpl = P["w"] + P["g"]/2; dpi = dpl + P["tw"]; Z0 = d["Z0"]
    hw = lambda z, dl: (z - zc)*T - dl/c
    outer = fr(X, 0, hw(0, dpl), q["zf"], hw(q["zf"], dpl)) + fr(X, q["zf"], hw(q["zf"], dpl), Z0, wod) + area(X, wod)*h/3
    # inner from z=0 (material starts there)
    inner = fr(X, 0, hw(0, dpi), q["zfi"], hw(q["zfi"], dpi)) + fr(X, q["zfi"], hw(q["zfi"], dpi), q["zpi"], q["hpi"]) + area(X, q["hpi"])*(q["za"] - q["zpi"])/3
    zs = d["Z0"] - P["hf"] + 0.6; tw, sl, la = P["tw"], P["sl"], P["la"]
    slits = (tw/c)*(la + sl)*sl + (tw/c)*sl*zs
    sw = lambda z: hw(z, dpl)
    pts = [(sw(q["ztop"]), q["ztop"]), (sw(q["zct"]) + P["p"]/c, q["zct"]), (sw(q["zcb"]) + P["p"]/c, q["zcb"]), (sw(q["zrb"]), q["zrb"])]
    barb = shoelace(pts) * P["bw"]
    v = outer - inner + n*(barb - slits)
    print(X, f"outer {outer:.3f} inner {inner:.3f} shell {outer-inner:.3f} barb {barb:.4f} slits {slits:.4f} -> {v:.3f}  height {Z0 + h:.4f}  halfwidth {wod:.4f}")
