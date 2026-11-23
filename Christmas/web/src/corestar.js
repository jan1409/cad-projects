// Christmas star with a core: a port of the SolidCraft model (Christmas/solidcraft/christmas_star_core.sc) with the
// same equations. A printed frame core (the edges of a rhombicuboctahedron) carries 25 points that snap into its
// windows (17 squares, 8 triangles); the top window takes a lamp plate and the two halves of the top point, the star
// hangs by a cord tied to two of the four lugs in the top window. Every point prints standing on its plug: the plug
// walls run parallel to the radial planes through the edges, a 45° flare sits on the 45° flank of the strut, and a
// horizontal snap arm on every side catches behind the strut with a 45° barb (preload `snap`).
// Point frame (print orientation): plug end on z = 0, the face plane at z = Z0, the point's axis on +Z.
// Spec: Christmas/spec/corestar_params.json. Runs in the page's worker and in Node (replicad passed in as R).

const RS = (1 + Math.sqrt(2)) / 2; // centre to a square face, per edge a
const RT = (3 + Math.sqrt(2)) / (2 * Math.sqrt(3)); // centre to a triangle face, per edge a
const S2 = Math.SQRT2, S3 = Math.sqrt(3);

// derived sizes, without the geometry kernel. inputs: diameter, slenderness, wall, fit, snap, lamp
export function coreEnv(spec, inputs) {
  const s = spec.shape, lamp = spec.lamps[inputs.lamp];
  const D = inputs.diameter, k = inputs.slenderness, t = inputs.wall, g = inputs.fit, pre = inputs.snap;
  const a = D / 2 / (RS + k), Rs = RS * a, Rt = RT * a, hs = k * a, ht = D / 2 - Rt;
  const Z0 = s.hf + s.zb, dpl = s.w + g / 2, dpi = dpl + s.tw, zcat = Z0 - s.hf, zs = zcat + s.slit_z;
  // one point type: X = square (S) or triangle (T); T = tan of the radial planes against the axis
  const side = (T, R, h) => {
    const c = 1 / Math.sqrt(1 + T * T), zc = Z0 - R, wod = R * T - g / (2 * c);
    const q = Math.sqrt(1 + (wod / h) ** 2), zct = zcat + (g / (2 * c) + pre - s.bp / c) / (1 + T);
    return {
      T, c, R, h, zc, wod, q, zct,
      zf: (Z0 - wod - zc * T - dpl / c) / (1 - T), // flare meets plug (outside)
      zfi: (Z0 - wod + s.tf * S2 - zc * T - dpi / c) / (1 - T), // flare meets plug (inside)
      zpi: Z0 + (s.tf * S2 - t * q) / (1 + wod / h), // flare meets pyramid (inside)
      za: Z0 + h * (1 - (t * q) / wod), // inner apex
      zx: (Z0 - wod - zc * T - s.w / c) / (1 - T), // core flank meets window wall
      ztop: zcat + (g / (2 * c) + pre) / (1 + T), zcb: zct - s.cr,
      zrb: zct - s.cr - s.bp / c / (1 - T),
      sw: (z, dl) => (z - zc) * T - dl / c, // a wall at offset dl from the radial plane, at height z
    };
  };
  const sq = side(0.5 / RS, Rs, hs), tr = side(1 / (2 * S3 * RT), Rt, ht);
  // top window: flat ring (the core prints on it), lamp plate, top point halves and sleeve
  const zr = Z0 - s.er, Xc = sq.sw(zr, s.w);
  const hb = (zr - sq.zc) * sq.T - g / (2 * sq.c), qt = Math.sqrt(1 + (hb / (hs + s.er)) ** 2);
  const hw = (z, off = 0) => (hb * (Z0 + hs - z)) / (hs + s.er) - off * qt; // top point outside, offset inward
  const dg = Math.min(s.dg_max, s.kdg * Xc), dr = Math.min(s.dr_max, dg / 2);
  const zt = Z0 + hs - ((hs + s.er) * (s.ws / 2)) / hb;
  const top = {
    zr, Xc, hb, qt, hw, dg, dr, hc: Xc - dg / (2 * S2), zt, zt1: zt - s.hsl - 3, zt2: zt - s.hsl,
    hp: (hb * (Z0 + hs - zr - s.tpl)) / (hs + s.er) - s.ttp * qt - g, dco: S2 * Xc - dg - s.tube_cl,
  };
  const seat = lamp.seat;
  const sleeve = seat === "sleeve" ? (() => {
    const hcl = (lamp.hole_d - lamp.ledge_d) / 2, shs = lamp.holder_l + 0.5 + hcl - s.tpl;
    return { holeS: lamp.hole_d, ledS: lamp.ledge_d, hlS: lamp.holder_l, slw: s.sleeve_w, hcl, shs, z0s: zr - shs };
  })() : null;
  return { ...inputs, D, k, t, g, pre, a, Rs, Rt, hs, ht, Z0, dpl, dpi, zcat, zs, sq, tr, top, shape: s, lamp, lamp_key: inputs.lamp, seat, sleeve, hd: lamp.hole_d };
}

// the 26 faces of the rhombicuboctahedron (unit normal n, in-plane axes x, y with x × y = n). Square frames have x
// along an edge; triangle frames have y towards a corner. Face 0 is the top square (+Z): lamp plate and top point.
export function coreFaces() {
  const q = 1 + S2;
  const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const faces = [];
  const add = (type, n, x) => { n = norm(n); x = norm(x); faces.push({ type, n, x, y: cross(n, x) }); };
  for (const [n, x] of [[[0, 0, 1], [1, 0, 0]], [[0, 0, -1], [1, 0, 0]], [[1, 0, 0], [0, 1, 0]], [[-1, 0, 0], [0, 1, 0]], [[0, 1, 0], [0, 0, 1]], [[0, -1, 0], [0, 0, 1]]]) add("square", n, x);
  for (const [i, j, kk] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]]) for (const si of [1, -1]) for (const sj of [1, -1]) {
    const n = [0, 0, 0], x = [0, 0, 0];
    n[i] = si; n[j] = sj; x[kk] = 1;
    add("square", n, x);
  }
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const n = norm([sx, sy, sz]);
    const c = [sx, sy, sz].map((v) => (v * (q + 2)) / 3);
    const yv = norm([sx * q - c[0], sy - c[1], sz - c[2]]);
    faces.push({ type: "triangle", n, x: cross(yv, n), y: yv });
  }
  return faces;
}

// a part in the point frame onto a face: world = x·px + y·py + n·(pz + r − Z0), as a row-major 4×4 matrix
export function placement(env, face, turn = 0) {
  const r = face.type === "triangle" ? env.Rt : env.Rs;
  const c = Math.cos(turn), sn = Math.sin(turn);
  const x = face.x.map((v, i) => c * v + sn * face.y[i]), y = face.y.map((v, i) => -sn * face.x[i] + c * v), n = face.n;
  const o = n.map((v) => v * (r - env.Z0));
  return [x[0], y[0], n[0], o[0], x[1], y[1], n[1], o[1], x[2], y[2], n[2], o[2], 0, 0, 0, 1];
}
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// every part of the assembled star with its placement (core in the star frame, the rest in the point frame)
export function coreLayout(env) {
  const faces = coreFaces();
  const list = [{ part: "core", m: IDENTITY }];
  for (const f of faces.slice(1)) list.push({ part: f.type, m: placement(env, f) });
  list.push({ part: "lamp", m: placement(env, faces[0]) },
    { part: "top", m: placement(env, faces[0]) }, { part: "top", m: placement(env, faces[0], Math.PI) },
    { part: "sleeve", m: placement(env, faces[0]) });
  return list;
}

const rawBool = (R, cls, a, b) => {
  const bld = new (R.getOC()[cls])(a.wrapped, b.wrapped);
  bld.Build();
  const shape = R.cast(bld.Shape());
  bld.delete();
  return shape;
};
// replicad's fuse/cut end with UnifySameDomain, which can throw after a successful boolean: fall back to the raw one
const fuse = (R, a, b) => { try { return a.fuse(b); } catch { return rawBool(R, "BRepAlgoAPI_Fuse", a, b); } };
const cut = (R, a, b) => { try { return a.cut(b); } catch { return rawBool(R, "BRepAlgoAPI_Cut", a, b); } };
const cutAll = (R, body, tools) => { for (const x of tools) body = cut(R, body, x); return body; };

const polygon = (R, pts, z) => {
  let pen = R.draw(pts[0]);
  for (const p of pts.slice(1)) pen = pen.lineTo(p);
  return pen.close().sketchOnPlane("XY", z);
};
const square = (R, w, z) => polygon(R, [[-w, -w], [w, -w], [w, w], [-w, w]], z);
// equilateral triangle of inradius r, a corner on +Y, the opposite edge parallel to X (on y = -r)
const triangle = (R, r, z) => polygon(R, [[0, 2 * r], [-S3 * r, -r], [S3 * r, -r]], z);
const frustum = (R, a, b) => a.loftWith([b], { ruled: true });
const pyramid = (R, base, apex) => base.loftWith([], { ruled: true, endPoint: apex });
const box = (R, lo, hi) => R.makeBox(lo, hi);
const ring = (R, solid, n) => Array.from({ length: n }, (_, i) => (i === 0 ? solid : solid.clone().rotate((i * 360) / n, [0, 0, 0], [0, 0, 1])));

// apply a row-major 4×4 rigid matrix to a solid
function transformed(R, solid, m) {
  const oc = R.getOC(), tr = new oc.gp_Trsf();
  tr.SetValues(...m.slice(0, 12));
  const b = new oc.BRepBuilderAPI_Transform(solid.wrapped, tr, true);
  const out = R.cast(b.Shape());
  b.delete(); tr.delete();
  return out;
}

// remove the half-space n·p > d (n unit) from a solid, with a big box turned onto the plane
function halfCut(R, solid, n, d, L) {
  let b = R.makeBox([-L, -L, 0], [L, L, L]);
  const ax = [-n[1], n[0], 0], s = Math.hypot(...ax), ang = (Math.atan2(s, n[2]) * 180) / Math.PI;
  if (s > 1e-12) b = b.rotate(ang, [0, 0, 0], ax);
  else if (n[2] < 0) b = b.rotate(180, [0, 0, 0], [1, 0, 0]);
  return cut(R, solid, b.translate(n.map((c) => c * d)));
}

// the convex polyhedron with the square faces at ds and the triangle faces at dt from the centre
function polyhedron(R, ds, dt, L) {
  let body = R.makeBox([-ds, -ds, -ds], [ds, ds, ds]);
  for (const f of coreFaces()) {
    if (f.type === "square" && f.n.filter((c) => Math.abs(c) > 1e-9).length === 1) continue; // the box has them
    body = halfCut(R, body, f.n, f.type === "square" ? ds : dt, L);
  }
  return body;
}

// window cutter of a face in the point frame: the window walls (offset w from the radial planes) and the 45° flank
function windowCutter(R, env, kind, flank = true) {
  const s = env.shape, X = kind === "square" ? env.sq : env.tr, poly = kind === "square" ? square : triangle;
  const z1 = env.Z0 - s.hf - 2, z2 = env.Z0 + 1, zx = X.zx - 0.5;
  let c = frustum(R, poly(R, X.sw(z1, s.w), z1), poly(R, X.sw(z2, s.w), z2));
  if (flank) c = fuse(R, c, frustum(R, poly(R, X.wod - (env.Z0 - zx), zx), poly(R, X.wod + 1, z2)));
  return c;
}

// core (1 per star, star frame): the frame between the outer and inner polyhedron, 25 windows with 45° flanks, the
// flat top window (the core prints on it) with 4 rope lugs
export function makeCore(R, env) {
  const s = env.shape, L = 4 * env.a;
  let body = polyhedron(R, env.Rs - s.er, env.Rt - s.er, L);
  body = cut(R, body, polyhedron(R, env.Rs - s.hf, env.Rt - s.hf, L));
  const faces = coreFaces(), sqC = windowCutter(R, env, "square"), trC = windowCutter(R, env, "triangle");
  const tools = [transformed(R, windowCutter(R, env, "square", false), placement(env, faces[0]))];
  for (const f of faces.slice(1)) tools.push(transformed(R, f.type === "square" ? sqC : trC, placement(env, f)));
  body = cut(R, body, R.makeCompound(tools)); // the cutters are disjoint
  // rope lugs in the corners of the top window (star frame), each with a hole on the diagonal
  const zr = env.Rs - s.er, X = env.top.Xc, dg = env.top.dg;
  const lug = polygon(R, [[X + 1, X + 1], [X + 1, X - S2 * dg - 1], [X - S2 * dg - 1, X + 1]], zr - s.tg).extrude(s.tg);
  const hc = X - dg / (2 * S2);
  const hole = R.makeCylinder(env.top.dr / 2, s.tg + 2, [hc, hc, zr - s.tg - 1], [0, 0, 1]);
  const lugs = ring(R, lug, 4), holes = ring(R, hole, 4);
  for (let i = 0; i < 4; i++) { body = fuse(R, body, lugs[i]); body = cut(R, body, holes[i]); }
  return body;
}

// snap on the -y wall of a plug (X: square or triangle sizes): a horizontal arm between a slit above it and a slit at
// its free end (+x), and a barb near the free end: 45° catch face reaching `pre` behind the strut's catch edge, crest,
// 45° lower face. Returns [cuts, joins].
function snapTools(R, env, X) {
  const s = env.shape, { dpl, dpi, zs } = env;
  const sl = s.sl, la = s.la;
  const hi = X.sw(zs + sl, dpl) + 0.5;
  const slitH = box(R, [-la / 2, -hi, zs], [la / 2 + sl, -(X.sw(zs, dpi) - 0.5), zs + sl]);
  const slitV = box(R, [la / 2, -hi, -1], [la / 2 + sl, -(X.sw(-1, dpi) - 0.5), zs + sl]);
  const sw = (z) => X.sw(z, dpl), e = s.barb_in;
  const pts = [[-(sw(X.ztop) - e), X.ztop], [-sw(X.ztop), X.ztop], [-(sw(X.zct) + s.bp / X.c), X.zct],
    [-(sw(X.zcb) + s.bp / X.c), X.zcb], [-sw(X.zrb), X.zrb], [-(sw(X.zrb) - e), X.zrb]];
  let pen = R.draw(pts[0]);
  for (const p of pts.slice(1)) pen = pen.lineTo(p);
  const barb = pen.close().sketchOnPlane("YZ", la / 2 - 0.5 - s.bw).extrude(s.bw);
  return [[slitH, slitV], [barb]];
}
function addSnaps(R, env, body, X, n) {
  const [cuts, joins] = snapTools(R, env, X);
  const cs = cuts.map((c) => ring(R, c, n)), js = joins.map((j) => ring(R, j, n));
  for (let i = 0; i < n; i++) { for (const c of cs) body = cut(R, body, c[i]); for (const j of js) body = fuse(R, body, j[i]); }
  return body;
}

// a point (square: 17, triangle: 8): plug, 45° flare and hollow pyramid, a snap on every side
function makePoint(R, env, kind) {
  const X = kind === "square" ? env.sq : env.tr, poly = kind === "square" ? square : triangle, n = kind === "square" ? 4 : 3;
  const { Z0, dpl, dpi, shape: s } = env;
  let body = fuse(R, frustum(R, poly(R, X.sw(0, dpl), 0), poly(R, X.sw(X.zf, dpl), X.zf)),
    frustum(R, poly(R, X.sw(X.zf, dpl), X.zf), poly(R, X.wod, Z0)));
  body = fuse(R, body, pyramid(R, poly(R, X.wod, Z0), [0, 0, Z0 + X.h]));
  body = cut(R, body, frustum(R, poly(R, X.sw(-1, dpi), -1), poly(R, X.sw(X.zfi, dpi), X.zfi)));
  const hpi = X.wod - s.tf * S2 - (Z0 - X.zpi);
  body = cut(R, body, frustum(R, poly(R, X.sw(X.zfi, dpi), X.zfi), poly(R, hpi, X.zpi)));
  body = cut(R, body, pyramid(R, poly(R, hpi, X.zpi), [0, 0, X.za]));
  return addSnaps(R, env, body, X, n);
}
export const makeSquarePoint = (R, env) => makePoint(R, env, "square");
export const makeTrianglePoint = (R, env) => makePoint(R, env, "triangle");

// lamp plate (point frame): plate on the top ring, a closed octagonal plug (its diagonal faces pass inside the rope
// lugs) with 4 snaps, 4 rope holes; E27: the holder hole; E10: a sleeve below with a 45° seat for the holder's collar
export function makeLampPlate(R, env) {
  const s = env.shape, T = env.top, X = env.sq, { dpl, dpi } = env, a2 = 2 * env.a;
  let body = box(R, [-T.hp, -T.hp, T.zr], [T.hp, T.hp, T.zr + s.tpl]);
  const corners = (b, L) => {
    const c = polygon(R, [[L + 5, -5], [a2, a2], [-5, L + 5]], -2).extrude(T.zr + 6);
    return cutAll(R, b, ring(R, c, 4));
  };
  let tube = corners(frustum(R, square(R, X.sw(0, dpl), 0), square(R, X.sw(T.zr + 0.5, dpl), T.zr + 0.5)), S2 * T.dco);
  const tubeIn = corners(frustum(R, square(R, X.sw(-1, dpi), -1), square(R, X.sw(T.zr + 1, dpi), T.zr + 1)), S2 * (T.dco - s.tw));
  tube = cut(R, tube, tubeIn);
  body = fuse(R, body, tube);
  body = cutAll(R, body, ring(R, R.makeCylinder(T.dr / 2, s.tpl + 2, [T.hc, T.hc, T.zr - 1], [0, 0, 1]), 4));
  body = addSnaps(R, env, body, X, 4);
  if (env.seat === "sleeve") {
    const v = env.sleeve;
    body = fuse(R, body, R.makeCylinder(v.holeS / 2 + v.slw, v.shs + s.tpl, [0, 0, v.z0s], [0, 0, 1]));
    body = cut(R, body, R.makeCylinder(v.holeS / 2, v.shs - v.hcl + s.tpl + 1, [0, 0, v.z0s + v.hcl], [0, 0, 1]));
    let pen = R.draw([0, v.z0s - 1]);
    for (const q of [[v.ledS / 2, v.z0s - 1], [v.ledS / 2, v.z0s], [v.holeS / 2, v.z0s + v.hcl], [v.holeS / 2, v.z0s + v.hcl + 0.5], [0, v.z0s + v.hcl + 0.5]]) pen = pen.lineTo(q);
    body = cut(R, body, pen.close().sketchOnPlane("XZ").revolve([0, 0, 1]));
  } else {
    body = cut(R, body, R.makeCylinder(env.hd / 2, s.tpl + 2, [0, 0, T.zr - 1], [0, 0, 1]));
  }
  return body;
}

// one half of the top point (2 per star, the same part): hollow pyramid on the top ring, open at the top for cord and
// cable, a spigot for the sleeve, split along the diagonal through two opposite edges
export function makeTopHalf(R, env) {
  const s = env.shape, T = env.top, { Z0, hs } = env, L = 4 * env.a, hw = T.hw;
  let body = pyramid(R, square(R, hw(T.zr), T.zr), [0, 0, Z0 + hs]);
  body = cut(R, body, frustum(R, square(R, hw(T.zr - 1, s.ttp), T.zr - 1), square(R, hw(T.zt1, s.ttp), T.zt1)));
  body = cut(R, body, frustum(R, square(R, hw(T.zt1, s.ttp), T.zt1), square(R, hw(T.zt2, s.ttp + s.tsl), T.zt2)));
  body = cut(R, body, frustum(R, square(R, hw(T.zt2, s.ttp + s.tsl), T.zt2), square(R, hw(T.zt + 1, s.ttp + s.tsl), T.zt + 1)));
  body = cut(R, body, box(R, [-L / 2, -L / 2, T.zt], [L / 2, L / 2, T.zt + 2 * env.a]));
  const spigot = cut(R, box(R, [-L / 2, -L / 2, T.zt2], [L / 2, L / 2, T.zt2 + s.hsl + 2]),
    frustum(R, square(R, hw(T.zt2, s.tsl), T.zt2), square(R, hw(T.zt + 1, s.tsl), T.zt + 1)));
  body = cut(R, body, spigot);
  const c = s.gsp / S2, a2 = 2 * env.a;
  return cut(R, body, polygon(R, [[a2, a2 - c], [-a2, a2], [-a2, -a2 - c]], -1).extrude(Z0 + hs + 10));
}

// sleeve over the top point's spigot (holds the halves together), slotted for the cable
export function makeTopSleeve(R, env) {
  const s = env.shape, T = env.top, hw = T.hw;
  let body = frustum(R, square(R, hw(T.zt2), T.zt2), square(R, hw(T.zt), T.zt));
  body = cut(R, body, frustum(R, square(R, hw(T.zt2 - 1, s.tsl - s.csl), T.zt2 - 1), square(R, hw(T.zt + 1, s.tsl - s.csl), T.zt + 1)));
  return cut(R, body, box(R, [-s.wsl / 2, -s.ws, T.zt2 - 1], [s.wsl / 2, 0, T.zt2 + s.hsl + 1]));
}

// ---- fit test ----
// the upper part of the core as it prints (top window on the bed): flanks, catch edges and 8 real bridges
export function makeCrown(R, env, core = makeCore(R, env)) {
  const s = env.shape;
  const lo = [-(env.a / 2 + 6), -(env.Rs + 2), env.a / 2 - 6], hi = [env.Rs + 2, env.Rs + 2, env.Rs + 2];
  return transformed(R, core.intersect(box(R, lo, hi)), [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, env.Rs - s.er, 0, 0, 0, 1]);
}
// a short point (plug, flare and the start of the pyramid); notches 1–3 on the square's rim name the snap preload
export const SNAP_TEST = [0.1, 0.2, 0.3];
export function shortPoint(R, env, solid, notches = 0) {
  const s = env.shape, big = 4 * env.a, top = env.Z0 + s.fit_h;
  let body = solid.intersect(box(R, [-big, -big, -1], [big, big, top]));
  const y = (env.sq.wod * (env.hs - s.fit_h)) / env.hs;
  for (let i = 0; i < notches; i++) body = cut(R, body, box(R, [-3.6 + 3 * i, -y - 3, top - 1.5], [-2.4 + 3 * i, -y + 3, top + 1.5]));
  return body;
}

// ---- checks without the kernel ----

// the base sizes: [] when the snaps, lugs, lamp plate and top point have room, else reasons
export function sizeProblems(env) {
  const s = env.shape, T = env.top, need = s.la / 2 + s.sl + 1, out = [];
  if (S3 * env.tr.sw(0, env.dpi) < need) out.push("triangle_snap");
  if (env.sq.sw(0, env.dpi) < need) out.push("square_snap");
  if (S2 * (T.dco - s.tw) - env.sq.sw(0, env.dpi) < need) out.push("lamp_snap");
  if (T.Xc - S2 * T.dg < 2) out.push("lugs");
  if (T.zt1 < T.zr + 20) out.push("top_point");
  return out;
}
// radii the lamp has to pass
export function lampRoom(env) {
  const s = env.shape, T = env.top;
  return {
    tube: Math.min(env.sq.sw(0, env.dpi), T.dco - s.tw), // inside the lamp plate's plug, at its end
    plate: Math.min(env.sq.sw(T.zr, env.dpi), T.dco - s.tw), // inside the plug, at the plate
    window: Math.min((env.Rs - s.hf) * env.sq.T - s.w / env.sq.c, S2 * T.Xc - T.dg), // top window and lugs
    rope: S2 * T.hc - T.dr / 2, // rope holes from the axis
  };
}
// what hangs below the lamp plate as stacked vertical cylinders [radius, z bottom, z top, clearance], star frame
export function lampEnvelope(env) {
  let z = env.Rs - env.shape.er;
  return env.lamp.envelope.map(([dd, l, c]) => { const seg = [dd / 2, z - l, z, c]; z -= l; return seg; });
}
// [] when the lamp fits this star (and the base sizes are fine), else reasons
export function lampProblems(env) {
  const out = sizeProblems(env), room = lampRoom(env), lamp = env.lamp, s = env.shape;
  if (env.seat === "sleeve") {
    if (env.sleeve.holeS / 2 + env.sleeve.slw + 0.5 > room.tube) out.push("sleeve");
  } else {
    if (lamp.hole_d / 2 + 1 > room.plate) out.push("hole");
    if (lamp.body_d / 2 + 0.5 > room.tube) out.push("holder");
    if (lamp.top_d / 2 + 0.5 > env.top.hp) out.push("ring");
    if (room.rope < lamp.top_d / 2 + 0.5) out.push("rope");
  }
  const widest = Math.max(...lamp.envelope.map(([dd]) => dd), env.seat === "sleeve" ? env.sleeve.holeS + 2 * env.sleeve.slw : 0);
  if (widest / 2 + 0.5 > room.window) out.push("passage");
  // the bulb keeps its clearance from every strut and plug end (the planes of the inner polyhedron, moved in by the plug)
  const [r, z0, z1, c] = lampEnvelope(env).at(-1);
  for (const f of coreFaces().slice(1)) {
    const d = (f.type === "square" ? env.Rs : env.Rt) - env.Z0 - c;
    if (r * Math.hypot(f.n[0], f.n[1]) + Math.max(f.n[2] * z0, f.n[2] * z1) > d) { out.push("clearance"); break; }
  }
  void s;
  return out;
}
// smallest diameter (mm, on the parameter grid) at which a lamp fits, for the other inputs as given
export function minDiameter(spec, inputs, lampKey) {
  const { min, max, step } = spec.parameters.diameter;
  for (let D = min; D <= max; D += step) if (lampProblems(coreEnv(spec, { ...inputs, lamp: lampKey, diameter: D })).length === 0) return D;
  return null;
}

// height of each part as it prints, and which printers take them (printers: {name: [x, y, z]})
export function partHeights(env) {
  const s = env.shape, T = env.top;
  return {
    core: 2 * (env.Rs - s.er), square: env.Z0 + env.hs, triangle: env.Z0 + env.ht,
    lamp: T.zr + s.tpl - (env.seat === "sleeve" ? env.sleeve.z0s : 0), top: T.zt - T.zr, sleeve: s.hsl,
  };
}
export function printFit(env, printers) {
  const h = partHeights(env), height = Math.max(h.core, h.square, h.triangle);
  const width = Math.max(2 * (env.Rs - env.shape.er), 2 * env.sq.wod);
  const fit = Object.fromEntries(Object.entries(printers).map(([name, [x, y, z]]) => [name, height <= z && width <= Math.min(x, y)]));
  return { height, width, fit };
}
export function partList() {
  return [{ part: "core", count: 1 }, { part: "square", count: 17 }, { part: "triangle", count: 8 },
    { part: "lamp", count: 1 }, { part: "top", count: 2 }, { part: "sleeve", count: 1 }];
}

// ---- files ----
export const coreTag = (env) => `${env.D}mm_${env.lamp_key}`;
export const PART_KEYS = {
  core: "corestar.partCore", square: "corestar.partSquare", triangle: "corestar.partTriangle", lamp: "corestar.partLamp",
  top: "corestar.partTop", sleeve: "corestar.partSleeve", crown: "corestar.partCrown",
};
// how a part lies on the bed, as a row-major 4×4 matrix from its model frame
export function printPose(env, part) {
  const s = env.shape, T = env.top;
  if (part === "core") return [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, env.Rs - s.er, 0, 0, 0, 1]; // top window on the bed
  if (part === "lamp") return [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, T.zr + s.tpl, 0, 0, 0, 1]; // plate on the bed
  if (part === "top") return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -T.zr, 0, 0, 0, 1];
  if (part === "sleeve") return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -T.zt2, 0, 0, 0, 1];
  return IDENTITY;
}
export function transformMesh(mesh, m) {
  const p = mesh.pos, out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i += 3) for (let r = 0; r < 3; r++) out[i + r] = m[4 * r] * p[i] + m[4 * r + 1] * p[i + 1] + m[4 * r + 2] * p[i + 2] + m[4 * r + 3];
  return { ...mesh, pos: out };
}

// Markdown build sheet; title in the sheet's language; t: translator of src/strings.js; file(part): its STL name
const LAMP_SHEET = { e10_sleeve: "corestar.sheetLampE10", e27_p45: "corestar.sheetLampE27", e27_a60: "corestar.sheetLampE27" };
const BULB = { e27_p45: "corestar.bulbP45", e27_a60: "corestar.bulbA60" };
export function coreBuildSheet(env, title, printers, t, file) {
  const h = partHeights(env), pf = printFit(env, printers);
  const lines = [
    `# ${title} ${coreTag(env)}`, "",
    t("corestar.sheetSize", { d: env.D, k: env.k, a: env.a, t: env.t, g: env.g, p: env.pre }), "",
    `## ${t("corestar.sheetParts")}`, "",
    ...partList().map(({ part, count }) => `- ${t("corestar.sheetPartRow", { n: count, part: t(PART_KEYS[part]), file: file(part), h: h[part] })}`),
    "", `## ${t("corestar.sheetPrinting")}`, "",
    `- ${t("corestar.sheetFitFirst", { p0: SNAP_TEST[0], p1: SNAP_TEST[1], p2: SNAP_TEST[2] })}`,
    `- ${t("corestar.sheetPointsMat", { t: env.t })}`,
    `- ${t("corestar.sheetCoreMat")}`,
    `- ${t("corestar.sheetLampMat")}`,
    `- ${t("corestar.sheetNoSupports")}`,
  ];
  for (const [name] of Object.entries(printers)) {
    lines.push(pf.fit[name] ? `- ${t("corestar.sheetFits", { printer: name })}` : `- ${t("corestar.sheetTooTall", { printer: name, h: pf.height })}`);
  }
  lines.push(`- ${t("corestar.sheetStl")}`, "", `## ${t("corestar.sheetAssembly")}`, "",
    `- ${t("corestar.sheetAsm1")}`, `- ${t("corestar.sheetAsm2")}`, `- ${t("corestar.sheetAsm3")}`, `- ${t("corestar.sheetAsm4")}`, "",
    `## ${t("corestar.sheetLamp")}`, "",
    `- ${t(LAMP_SHEET[env.lamp_key], BULB[env.lamp_key] ? { bulb: t(BULB[env.lamp_key]) } : {})}`,
    `- ${t("corestar.sheetSafety")}`);
  return lines.join("\n") + "\n";
}
