import math
S2, S3 = math.sqrt(2), math.sqrt(3)
rs = (1 + S2) / 2; rt = (3 + S2) / (2 * S3)
w, hf, er, tw, g, zb, la, sl, dg, dr, tpl, ttp, ws, hsl, tsl = 2.5, 7, 0.6, 1.6, 0.2, 2.7, 12, 0.6, 14, 7, 2.4, 1.2, 18, 12, 1.2
def env(D, k):
    a = D / 2 / (rs + k); Rs, Rt = rs * a, rt * a; hs = k * a; Z0 = hf + zb
    TS = 0.5 / rs; cS = 1 / math.sqrt(1 + TS * TS); TT = 1 / (2 * S3 * rt); cT = 1 / math.sqrt(1 + TT * TT)
    dpl, dpi = w + g / 2, w + g / 2 + tw
    zcS, zcT = Z0 - Rs, Z0 - Rt
    swS = lambda z, d: (z - zcS) * TS - d / cS
    swT = lambda z, d: (z - zcT) * TT - d / cT
    zr = Z0 - er; Xc = swS(zr, w); dg = min(14, 0.47 * Xc); dr = min(7, dg / 2); dco = S2 * Xc - dg - 0.5
    hb = (zr - zcS) * TS - g / (2 * cS); qt = math.sqrt(1 + (hb / (hs + er)) ** 2)
    hp = hb * (Z0 + hs - zr - tpl) / (hs + er) - ttp * qt - g
    zt = Z0 + hs - (hs + er) * (ws / 2) / hb
    need = la / 2 + sl + 1
    out = dict(a=a, tri_arm=S3 * swT(0, dpi) - need, tube_flat=S2 * (dco - tw) - swS(0, dpi) - need,
               lug=Xc - S2 * dg, zt_room=zt - hsl - 3 - zr - 20, hp=hp, tube_in_r=min(swS(0, dpi), dco - tw),
               plate_in=min(swS(zr, dpi), dco - tw), win_r=min((Rs - hf) * TS - w / cS, S2 * Xc - dg),
               rope_r=S2 * (Xc - dg / (2 * S2)) - dr / 2, height=Z0 + hs, core=2 * (Rs - er))
    return out
for k in (2.4, 3.0, 3.6):
    for D in range(250, 651, 50):
        e = env(D, k)
        print(f"k {k} D {D}: a {e['a']:.1f} triArm {e['tri_arm']:+.1f} tubeFlat {e['tube_flat']:+.1f} lug {e['lug']:+.1f} ztRoom {e['zt_room']:+.0f} "
              f"hp {e['hp']:.1f} tubeIn r {e['tube_in_r']:.1f} plateIn {e['plate_in']:.1f} window r {e['win_r']:.1f} rope r {e['rope_r']:.1f} h {e['height']:.0f} core {e['core']:.0f}")
