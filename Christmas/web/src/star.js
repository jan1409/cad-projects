// Parametric Christmas star: a port of the SolidCraft model (Christmas/solidcraft/christmas_star.sc) with the same
// equations. 25 points sit on the faces of a rhombicuboctahedron (17 squares, 8 triangles); the top square carries the
// lamp socket. Every point carries its own piece of the core (the skirt): the cone from the star centre over its face,
// cut off at depth d, so neighbouring skirt walls meet in the plane through the centre and their common edge.
// Part frame (print orientation): the skirt bottom on z = 0, the point's axis on +Z, its tip at z = d + h.
// Spec: Christmas/spec/star_params.json. Runs in the page's worker and in Node (replicad passed in as R).

const RS = (1 + Math.sqrt(2)) / 2; // centre to a square face, per edge a
const RT = (3 + Math.sqrt(2)) / (2 * Math.sqrt(3)); // centre to a triangle face, per edge a

// lamp opening and carrier sizes from the lamp table (independent of the star size)
export function lampSizes(spec, lampKey) {
  const s = spec.shape, lamp = spec.lamps[lampKey];
  if (lamp.seat === "sleeve") { // the holder ends flush with the plate top; its collar sits on a 45° seat at the bottom
    const sh = lamp.holder_l + 0.5 + (lamp.hole_d - lamp.ledge_d) / 2 - s.tp;
    return { lamp, seat: "sleeve", holeS: lamp.hole_d, ledS: lamp.ledge_d, hlS: lamp.holder_l, sh, sw: s.sleeve_w };
  }
  const pass = Math.max(lamp.bottom_d ?? 0, ...lamp.envelope.map(([dd]) => dd));
  const Do = Math.max(lamp.hole_d + 2 * (s.tw + s.cr), pass + 1.5); // the carrier tube and everything below it pass
  const Ll = Do < 25 ? s.lug_l_small : s.lug_l;
  return { lamp, seat: "bayonet", Do, holeD: lamp.hole_d, Ll };
}

// derived sizes, without the geometry kernel. inputs: diameter, slenderness, wall, fit, lamp
export function starEnv(spec, inputs) {
  const { kd, ts, rb, hb, cb, ksb, kvb } = spec.shape;
  const D = inputs.diameter, k = inputs.slenderness, t = inputs.wall, g = inputs.fit;
  const a = D / 2 / (RS + k), hs = k * a, ht = D / 2 - RT * a, d = kd * a, Rs = RS * a, Rt = RT * a;
  const ths = Math.atan(0.5 / RS), tht = Math.atan(1 / (2 * Math.sqrt(3) * RT)); // skirt wall tilts
  // square point: half-widths of the skirt (outer/inner, bottom/face), the pyramid cavity and its apex
  const cs = Math.cos(ths);
  const wo0 = (a / 2) * (Rs - d) / Rs - g / 2 / cs, wod = a / 2 - g / 2 / cs;
  const wi0 = wo0 - ts / cs, wid = wod - ts / cs, wim = wi0 - (wid - wi0) / d;
  const phs = Math.atan(wod / hs), wpi = wod - t / Math.cos(phs), zai = d + (hs * wpi) / wod;
  // snap bump and dimple: s along the edge, v down the wall (the same v for both point types)
  const sb = ksb * a, vb = kvb * d, zbs = d - vb * cs, xbs = wo0 + zbs * Math.tan(ths);
  // triangle point: inradii instead of half-widths; the bottom edge parallel to X, a corner on +Y
  const ct = Math.cos(tht), r3 = a / (2 * Math.sqrt(3));
  const ro0 = r3 * (Rt - d) / Rt - g / 2 / ct, rod = r3 - g / 2 / ct;
  const ri0 = ro0 - ts / ct, rid = rod - ts / ct, rim = ri0 - (rid - ri0) / d;
  const pht = Math.atan(rod / ht), rpi = rod - t / Math.cos(pht), ztai = d + (ht * rpi) / rod;
  const zbt = d - vb * ct, ybt = ro0 + zbt * Math.tan(tht);
  // lamp socket: a shallow square skirt (deep enough for the snaps) under a plate; carrier: tube, cone, rim and 3 lugs
  const sh = spec.shape, L = lampSizes(spec, inputs.lamp);
  const ds = (vb + rb + cb + 0.6) * cs;
  const wos0 = (a / 2) * (Rs - ds) / Rs - g / 2 / cs, wis0 = wos0 - ts / cs, wism = wis0 - (wid - wis0) / ds;
  const zbk = ds - vb * cs, xbk = wos0 + zbk * Math.tan(ths);
  const re = Math.SQRT2 * wid - sh.cord_d / 2 - 1.5; // cord holes along the diagonal
  const sk = { ds, wos0, wis0, wism, zbk, xbk, re, tp: sh.tp };
  if (L.seat === "bayonet") {
    const RL = L.Do / 2 + L.Ll, Rn = RL + sh.cl, wn = 2 * RL * Math.sin(((sh.lug_w / 2) * Math.PI) / 180) + 2 * sh.cl;
    const rn = L.Do / 2 - sh.cr, zlt = L.Ll + sh.cr + sh.lug_e, zpt = zlt + sh.cz + sh.tp, Rd = L.Do / 2 + sh.cone_w;
    Object.assign(sk, { RL, Rn, wn, rn, zlt, zpt, Rd, ztop: zpt + sh.cone_w + sh.rim_h });
  }
  return {
    ...inputs, D, k, t, g, ts, rb, hb, cb, a, hs, ht, d, Rs, Rt, ths, tht, sb, vb, shape: sh, ...L, lamp_key: inputs.lamp,
    sq: { wo0, wod, wi0, wid, wim, phs, wpi, zai, zbs, xbs },
    tr: { ro0, rod, ri0, rid, rim, pht, rpi, ztai, zbt, ybt },
    sk,
  };
}

// the 26 faces of the rhombicuboctahedron (unit normal n, in-plane axes x, y with x × y = n) and where each part goes.
// Square frames have x along an edge; triangle frames have y towards a corner (the part's corner on +Y).
// Face 0 is the top square (+Z): the lamp socket.
export function starFaces() {
  const q = 1 + Math.SQRT2;
  const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const faces = [];
  const add = (type, n, x) => { n = norm(n); x = norm(x); faces.push({ type, n, x, y: cross(n, x) }); };
  // 6 squares on the axes: x along the next axis (an edge direction)
  for (const [n, x] of [[[0, 0, 1], [1, 0, 0]], [[0, 0, -1], [1, 0, 0]], [[1, 0, 0], [0, 1, 0]], [[-1, 0, 0], [0, 1, 0]], [[0, 1, 0], [0, 0, 1]], [[0, -1, 0], [0, 0, 1]]]) add("square", n, x);
  // 12 squares on the edges of the cube: n = (e_i ± e_j)/√2, x along the remaining axis e_k
  for (const [i, j, kk] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]]) for (const si of [1, -1]) for (const sj of [1, -1]) {
    const n = [0, 0, 0], x = [0, 0, 0];
    n[i] = si; n[j] = sj; x[kk] = 1;
    add("square", n, x);
  }
  // 8 triangles on the corners of the cube: y towards the corner (sx·q, sy, sz)·a/2 of the face
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const n = norm([sx, sy, sz]);
    const c = [sx, sy, sz].map((s) => (s * (q + 2)) / 3); // face centroid, per a/2
    const yv = norm([sx * q - c[0], sy - c[1], sz - c[2]]);
    faces.push({ type: "triangle", n, x: cross(yv, n), y: yv });
  }
  return faces;
}

// placement of a part on a face: world = n·(r − depth) + x·px + y·py + n·pz, as a row-major 4×4 matrix
// (depth: the part's skirt depth, d for the points, ds for the lamp socket)
export function placement(env, face, depth = env.d) {
  const r = face.type === "triangle" ? env.Rt : env.Rs;
  const o = face.n.map((c) => c * (r - depth));
  const { x, y, n } = face;
  return [x[0], y[0], n[0], o[0], x[1], y[1], n[1], o[1], x[2], y[2], n[2], o[2], 0, 0, 0, 1];
}

// every part of the assembled star with its placement: 17 squares, 8 triangles, the socket on the top square and,
// for bayonet lamps, the carrier locked in it (turned clockwise from above by `lock`)
export function starLayout(env) {
  const faces = starFaces();
  const list = faces.slice(1).map((f) => ({ part: f.type, m: placement(env, f) }));
  list.unshift({ part: "socket", m: placement(env, faces[0], env.sk.ds) });
  if (env.seat === "bayonet") {
    const a = (-env.shape.lock * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const z = env.Rs - env.shape.cz - env.sk.zlt; // the carrier's tube bottom
    list.push({ part: "carrier", m: [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, z, 0, 0, 0, 1] });
  }
  return list;
}

// what hangs from the socket (holder, nut, bulb) as stacked vertical cylinders [radius, z bottom, z top, clearance],
// world frame (star centre at the origin, socket on +Z)
export function lampEnvelope(env) {
  let z = env.seat === "bayonet" ? env.Rs - env.shape.cz - env.sk.zlt : env.Rs; // carrier bottom / plate underside
  return env.lamp.envelope.map(([dd, l, c]) => { const seg = [dd / 2, z - l, z, c]; z -= l; return seg; });
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

// closed polygon in the plane z (counter-clockwise points [x, y])
const polygon = (R, pts, z) => {
  let pen = R.draw(pts[0]);
  for (const p of pts.slice(1)) pen = pen.lineTo(p);
  return pen.close().sketchOnPlane("XY", z);
};
// axis-aligned square of half-width w (edges parallel to X and Y)
const square = (R, w, z) => polygon(R, [[-w, -w], [w, -w], [w, w], [-w, w]], z);
const frustum = (R, a, b) => a.loftWith([b], { ruled: true });
const pyramid = (R, base, apex) => base.loftWith([], { ruled: true, endPoint: apex });

// rotate copies of a solid about Z: n-fold pattern including the original
const ring = (R, solid, n) => Array.from({ length: n }, (_, i) => (i === 0 ? solid : solid.clone().rotate((i * 360) / n, [0, 0, 0], [0, 0, 1])));

// square point (17 per star): pyramid on the square skirt, hollow, open at the bottom, with 4 bumps and 4 dimples
export function makeSquarePoint(R, env) {
  const { d, hs, ths, rb, hb, cb, g, sb } = env;
  const s = env.sq;
  let body = fuse(R, frustum(R, square(R, s.wo0, 0), square(R, s.wod, d)), pyramid(R, square(R, s.wod, d), [0, 0, d + hs]));
  body = cut(R, body, frustum(R, square(R, s.wim, -1), square(R, s.wid, d)));
  body = cut(R, body, pyramid(R, square(R, s.wpi, d), [0, 0, s.zai]));
  // the wall on +x: outward normal (cos ths, 0, -sin ths); bump at +s along the edge, dimple at -s
  const c = Math.cos(ths), sn = Math.sin(ths);
  const bump = R.makeSphere(rb).translate([s.xbs - (rb - hb) * c, sb, s.zbs + (rb - hb) * sn]);
  const dimple = R.makeSphere(rb + cb).translate([s.xbs + (g + rb - hb) * c, -sb, s.zbs - (g + rb - hb) * sn]);
  for (const b of ring(R, bump, 4)) body = fuse(R, body, b);
  for (const m of ring(R, dimple, 4)) body = cut(R, body, m);
  return body;
}

// equilateral triangle of inradius r, a corner on +Y, the opposite edge parallel to X
const triangle = (R, r, z) => polygon(R, [[0, 2 * r], [-Math.sqrt(3) * r, -r], [Math.sqrt(3) * r, -r]], z);

// triangle point (8 per star): pyramid on the triangular skirt, hollow, open at the bottom, with 3 bumps and 3 dimples
export function makeTrianglePoint(R, env) {
  const { d, ht, tht, rb, hb, cb, g, sb } = env;
  const s = env.tr;
  let body = fuse(R, frustum(R, triangle(R, s.ro0, 0), triangle(R, s.rod, d)), pyramid(R, triangle(R, s.rod, d), [0, 0, d + ht]));
  body = cut(R, body, frustum(R, triangle(R, s.rim, -1), triangle(R, s.rid, d)));
  body = cut(R, body, pyramid(R, triangle(R, s.rpi, d), [0, 0, s.ztai]));
  // the wall on -y: outward normal (0, -cos tht, -sin tht); bump at +s along the edge (+x), dimple at -s
  const c = Math.cos(tht), sn = Math.sin(tht);
  const bump = R.makeSphere(rb).translate([sb, -s.ybt + (rb - hb) * c, s.zbt + (rb - hb) * sn]);
  const dimple = R.makeSphere(rb + cb).translate([-sb, -s.ybt - (g + rb - hb) * c, s.zbt - (g + rb - hb) * sn]);
  for (const b of ring(R, bump, 3)) body = fuse(R, body, b);
  for (const m of ring(R, dimple, 3)) body = cut(R, body, m);
  return body;
}

// snap bumps (+s) and dimples (-s) on the 4 walls of a square skirt; x: outer wall at height z, as in makeSquarePoint
const squareSnaps = (R, env, body, xb, zb) => {
  const { ths, rb, hb, cb, g, sb } = env;
  const c = Math.cos(ths), sn = Math.sin(ths);
  const bump = R.makeSphere(rb).translate([xb - (rb - hb) * c, sb, zb + (rb - hb) * sn]);
  const dimple = R.makeSphere(rb + cb).translate([xb + (g + rb - hb) * c, -sb, zb - (g + rb - hb) * sn]);
  for (const b of ring(R, bump, 4)) body = fuse(R, body, b);
  for (const m of ring(R, dimple, 4)) body = cut(R, body, m);
  return body;
};
const deg = Math.PI / 180;

// lamp socket (1 per star, glued into the top square): shallow skirt + plate; bayonet opening or E10 sleeve; 2 cord holes
export function makeSocket(R, env) {
  const { sk, shape: s } = env;
  const { wod, wid } = env.sq;
  let body = frustum(R, square(R, sk.wos0, 0), square(R, wod, sk.ds));
  body = cut(R, body, frustum(R, square(R, sk.wism, -1), square(R, wid, sk.ds)));
  body = fuse(R, body, R.makeBox([-wod, -wod, sk.ds], [wod, wod, sk.ds + s.tp]));
  body = squareSnaps(R, env, body, sk.xbk, sk.zbk);
  if (env.seat === "bayonet") {
    body = cut(R, body, R.makeCylinder(env.Do / 2, s.tp + 2, [0, 0, sk.ds - 1], [0, 0, 1]));
    const notch = polygon(R, [[env.Do / 4, -sk.wn / 2], [sk.Rn, -sk.wn / 2], [sk.Rn, sk.wn / 2], [env.Do / 4, sk.wn / 2]], sk.ds - 1).extrude(s.tp + 2);
    for (const n of ring(R, notch, 3)) body = cut(R, body, n);
    // stop beyond the locked lug (turned clockwise from above by `lock`), and a detent ramp behind it
    const r1 = env.Do / 2 + 0.2, r2 = sk.RL - 0.2;
    const a2 = (-s.lock - s.lug_w / 2 - 1) * deg, a1 = a2 - s.stop_w * deg;
    const p = (r, an) => [r * Math.cos(an), r * Math.sin(an)];
    const stop = polygon(R, [p(r1, a1), p(r2, a1), p(r2, a2), p(r1, a2)], sk.ds - s.cz - s.lug_e).extrude(s.cz + s.lug_e + 0.5);
    const ar = -41 * deg; // fixed with lock 60° and lug_w 30° (the .sc uses the same literal)
    const ramp = R.makeCylinder(0.8, r2 - r1, [r1 * Math.cos(ar), r1 * Math.sin(ar), sk.ds - s.cz - s.ramp_i + 0.8], [Math.cos(ar), Math.sin(ar), 0]);
    const stops = ring(R, stop, 3), ramps = ring(R, ramp, 3);
    for (let i = 0; i < 3; i++) { body = fuse(R, body, stops[i]); body = fuse(R, body, ramps[i]); }
  } else {
    // the sleeve hangs below the plate, so the socket prints plate down without supports; the holder's collar sits on a
    // 45° seat at the sleeve's lower end, the bulb passes through it
    const z0 = sk.ds - env.sh, hc = (env.holeS - env.ledS) / 2;
    body = fuse(R, body, R.makeCylinder(env.holeS / 2 + env.sw, env.sh + s.tp, [0, 0, z0], [0, 0, 1]));
    body = cut(R, body, R.makeCylinder(env.holeS / 2, env.sh - hc + s.tp + 1, [0, 0, z0 + hc], [0, 0, 1]));
    let pen = R.draw([0, z0 - 1]);
    for (const q of [[env.ledS / 2, z0 - 1], [env.ledS / 2, z0], [env.holeS / 2, z0 + hc], [env.holeS / 2, z0 + hc + 0.5], [0, z0 + hc + 0.5]]) pen = pen.lineTo(q);
    body = cut(R, body, pen.close().sketchOnPlane("XZ").revolve([0, 0, 1]));
  }
  const hole = R.makeCylinder(s.cord_d / 2, s.tp + 2, [sk.re / Math.SQRT2, sk.re / Math.SQRT2, sk.ds - 1], [0, 0, 1]);
  for (const h of ring(R, hole, 2)) body = cut(R, body, h);
  return body;
}

// lamp carrier (bayonet lamps): tube with the holder bore, a 45° cone that sits on the opening edge, a rim and 3 lugs.
// Frame: the tube bottom on z = 0; in the star it sits ds - cz - zlt above the socket's skirt bottom, turned by -lock.
export function makeCarrier(R, env) {
  const { sk, shape: s } = env;
  const { rn, zpt, Rd, ztop, zlt, RL } = sk;
  const profile = (pts) => { let pen = R.draw(pts[0]); for (const q of pts.slice(1)) pen = pen.lineTo(q); return pen.close().sketchOnPlane("XZ"); };
  let body = profile([[rn, 0], [rn, zpt - s.cr], [Rd, zpt + s.cone_w], [Rd, ztop], [env.holeD / 2, ztop], [env.holeD / 2, 0]]).revolve([0, 0, 1]);
  let lug = profile([[rn - 0.5, zlt], [RL, zlt], [RL, zlt - s.lug_e], [rn, 0], [rn - 0.5, 0]]).revolve([0, 0, 1], { angle: s.lug_w });
  // centre the lug on +X whichever way the revolve turned
  const bb = lug.boundingBox.bounds;
  lug = lug.rotate(bb[1][1] > -bb[0][1] ? -s.lug_w / 2 : s.lug_w / 2, [0, 0, 0], [0, 0, 1]);
  for (const l of ring(R, lug, 3)) body = fuse(R, body, l);
  return body;
}

// ---- checks without the kernel ----

// geometric limits of the lamp socket at this size: [] when the socket, lugs, lamp and cord holes fit, else reasons
export function socketProblems(env) {
  const { sk, shape: s, ths } = env;
  const { wod } = env.sq;
  const wis = (z) => sk.wis0 + z * Math.tan(ths); // inner half-width of the socket skirt at height z
  const out = [];
  const topR = (env.lamp.top_d ?? 0) / 2;
  if (env.seat === "bayonet") {
    if (sk.RL + 0.5 > wis(Math.max(0, sk.ds - s.cz - s.lug_e))) out.push("lugs");
    if (sk.Rn + 1.2 > wod) out.push("plate");
    if (env.Do / 2 + 0.3 > sk.wis0) out.push("passage");
    if (sk.re < Math.max(sk.Rn, sk.Rd, topR) + s.cord_d / 2 + 1) out.push("cord");
  } else {
    const so = env.holeS / 2 + env.sw;
    // the sleeve hangs through the skirt: it may merge with the socket's own walls, but must not stick out of them
    if (so + 0.3 > sk.wos0) out.push("passage");
    if (sk.re < Math.max(so, topR) + s.cord_d / 2 + 1) out.push("cord");
  }
  if (env.lamp.a_lamp && env.a < env.lamp.a_lamp) out.push("clearance");
  return out;
}

// smallest diameter (mm, on the parameter grid) at which a lamp fits, for the other inputs as given
export function minDiameter(spec, inputs, lampKey) {
  const { min, max, step } = spec.parameters.diameter;
  const fits = (D) => socketProblems(starEnv(spec, { ...inputs, lamp: lampKey, diameter: D })).length === 0;
  for (let D = min; D <= max; D += step) if (fits(D)) return D;
  return null; // not within the range
}

// tallest part and widest footprint, and which printers take them (printers: {name: [x, y, z]})
export function printFit(env, printers) {
  const height = env.d + env.hs; // the square point is the tallest part
  const width = Math.max(2 * env.sq.wod, Math.sqrt(3) * 2 * env.tr.rod);
  const fit = Object.fromEntries(Object.entries(printers).map(([name, [x, y, z]]) => [name, height <= z && width <= Math.min(x, y)]));
  return { height, width, fit };
}

// parts to print: [{part, count}]
export function partList(env) {
  const list = [{ part: "square", count: 17 }, { part: "triangle", count: 8 }, { part: "socket", count: 1 }];
  if (env.seat === "bayonet") list.push({ part: "carrier", count: 1 });
  if (env.lamp.nut) list.push({ part: "nut", count: 1 });
  return list;
}

// ---- files ----

export const starTag = (env) => `${env.D}mm_${env.lamp_key}`;
export const PART_KEYS = { square: "star.partSquare", triangle: "star.partTriangle", socket: "star.partSocket", carrier: "star.partCarrier", nut: "star.partNut" };

// how a part lies on the bed, as a row-major 4×4 matrix from its model frame: the lamp socket turned over (plate down,
// so the plate needs no supports), the others as modelled
export function printPose(env, part) {
  if (part !== "socket") return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, env.sk.ds + env.shape.tp, 0, 0, 0, 1]; // 180° about X, plate top on z = 0
}
// apply a row-major 4×4 matrix to a mesh {pos, tri} (a rotation keeps the triangle orientation)
export function transformMesh(mesh, m) {
  const p = mesh.pos, out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i += 3) for (let r = 0; r < 3; r++) out[i + r] = m[4 * r] * p[i] + m[4 * r + 1] * p[i + 1] + m[4 * r + 2] * p[i + 2] + m[4 * r + 3];
  return { ...mesh, pos: out };
}

// height of each part as it prints (the E27 nut is a fixed part, 8 mm)
export function partHeights(env) {
  const s = env.shape;
  return {
    square: env.d + env.hs, triangle: env.d + env.ht,
    socket: env.sk.ds + s.tp - (env.seat === "sleeve" ? Math.min(0, env.sk.ds - env.sh) : 0), // plate down, sleeve up
    carrier: env.sk.ztop ?? 0, nut: 8,
  };
}

// a short piece of a point for the fit test: the skirt and the start of the pyramid
export function fitTestPiece(R, env, solid) {
  const big = 4 * env.a, top = env.d + Math.min(15, 0.3 * env.hs);
  return solid.clone().intersect(R.makeBox([-big, -big, -1], [big, big, top]));
}

// Markdown build sheet; title in the sheet's language; t: translator of src/strings.js; file(part): its STL name
const LAMP_SHEET = { e10_sleeve: "star.sheetLampE10Sleeve", e10_panel: "star.sheetLampE10Panel", e27_p45: "star.sheetLampE27", e27_a60: "star.sheetLampE27" };
const BULB = { e27_p45: "star.bulbP45", e27_a60: "star.bulbA60" };
export function starBuildSheet(env, title, printers, t, file) {
  const h = partHeights(env), parts = partList(env);
  const lines = [
    `# ${title} ${starTag(env)}`,
    "",
    t("star.sheetSize", { d: env.D, k: env.k, a: env.a, t: env.t, g: env.g }),
    "",
    `## ${t("star.sheetParts")}`,
    "",
    ...parts.map(({ part, count }) => `- ${t("star.sheetPartRow", { n: count, part: t(PART_KEYS[part]), file: file(part), h: h[part] })}`),
    "",
    `## ${t("star.sheetPrinting")}`,
    "",
    `- ${t("star.sheetFitFirst")}`,
    `- ${t("star.sheetPointsMat", { t: env.t })}`,
    `- ${t("star.sheetLampMat")}`,
    `- ${t("star.sheetNoSupports")}`,
  ];
  const pf = printFit(env, printers), cell = 2 * env.sq.wod + 6;
  for (const [name, [x, y]] of Object.entries(printers)) {
    lines.push(pf.fit[name] ? `- ${t("star.sheetPlates", { printer: name, n: Math.floor(x / cell) * Math.floor(y / cell) })}`
      : `- ${t("star.sheetTooTall", { printer: name, h: pf.height })}`);
  }
  lines.push(`- ${t("star.sheetStl")}`, "", `## ${t("star.sheetAssembly")}`, "",
    `- ${t("star.sheetAsm1")}`, `- ${t("star.sheetAsm2")}`, `- ${t("star.sheetAsm3")}`, "",
    `## ${t("star.sheetLamp")}`, "",
    `- ${t(LAMP_SHEET[env.lamp_key], BULB[env.lamp_key] ? { bulb: t(BULB[env.lamp_key]) } : {})}`,
    `- ${t("star.sheetSafety")}`);
  return lines.join("\n") + "\n";
}
