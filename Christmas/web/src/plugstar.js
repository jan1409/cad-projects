// Plug-together star: a port of the SolidCraft model (Christmas/solidcraft/plug_star.sc) with the same equations.
// N points, each a triangular bipyramid (tip, two inner corners, the centre above and below the star plane), slide
// radially onto a hidden connector in the star plane and click in: every tongue of the connector ends in two prongs
// with barbs (30° lead-in, 45° catch) that spring out into a pocket inside the point. The 45° catch pulls the point in
// against the tongue end and lets it go again when pulled hard.
// Star frame: centre at the origin, star plane XY; a point's axis on +X (tip at (Rt, 0, 0)), as in the .sc. In the
// assembled star point k is turned to 90° + k·360°/N (point 0, with the hanging hole, on top).
// Spec: Christmas/spec/plugstar_params.json, equations: Christmas/spec/plugstar_spec.md.
// Runs in the page's worker and in Node (replicad passed in as R).
import { transformMesh } from "./star.js";

export { transformMesh };
const deg = Math.PI / 180;

// derived sizes, without the geometry kernel (names as in the .sc). inputs: diameter, points, tip_angle, depth (%),
// fit, hanger
export function plugEnv(spec, inputs) {
  const s = spec.shape;
  const D = inputs.diameter, N = inputs.points, alpha = inputs.tip_angle, depth = inputs.depth / 100, fit = inputs.fit;
  const Rt = D / 2, hc = depth * Rt, beta = (alpha / 2) * deg, phi = Math.PI / N;
  const ri = (Rt * Math.sin(beta)) / Math.sin(beta + phi); // inner corner radius
  const ox = fit / 2 / Math.sin(phi), big = D; // inner edge of a point (side faces fit/2 behind the sector planes)
  const sc = Math.max(1, D / s.scale_from); // the connector grows with stars larger than scale_from
  const tk = s.tk * sc, wt = s.wt * sc, sw = s.sw * sc, bd = s.bd * sc, bl = s.bl * sc, Lp = s.lp * sc;
  const rh = (wt / 2 + s.hub_m * sc) / Math.tan(phi), uslit = rh + s.slit_m * sc, ucat = uslit + Lp;
  const uend = ucat + bd + bl + bd * Math.sqrt(3);
  const m = (hc * (1 - (ri / Rt) * Math.cos(phi))) / (ri * Math.sin(phi)); // sideways slope of the faces
  // hanging hole: as far in as the outline (hangm beside it) and the thickness at its edge (hangt) need
  const hangd = s.hang_d * sc, hangm = s.hang_m * sc, hangt = s.hang_t * sc;
  const hangx = Rt - Math.max((hangd / 2 + hangm) / Math.tan(beta), (hangt / 2 + (hangd / 2) * Math.hypot(depth, m)) / depth);
  return {
    ...inputs, D, N, alpha, depth, fit, Rt, hc, beta, phi, ri, ox, big, sc, tk, wt, sw, bd, bl, Lp, rh, uslit, ucat, uend,
    hangd, hangm, hangt, hangx, m, hanger: Boolean(inputs.hanger), shape: s, fits: fitOptions(spec),
  };
}

// height of a point's top face over the star plane at (x, y) of the point frame (inside the outline)
export const faceZ = (env, x, y) => env.hc * (1 - x / env.Rt) - env.m * Math.abs(y);

// material around the connector and at the hanging hole (mm): wall over the barb pocket (thinnest at its far corners),
// jaw over the hub slot where it opens in the side faces, star thickness at the edge of the hanging hole (hangt by
// construction), material between the hanging hole and the pocket
export function plugChecks(env) {
  const { tk, fit, wt, bd, uend, rh, hc, ri, hangx, hangd, depth, m } = env;
  return {
    wall: faceZ(env, uend, wt / 2 + fit + bd) - (tk / 2 + fit),
    jaw: hc * (1 - (rh + fit) / ri) - (tk / 2 + fit),
    hang: 2 * (faceZ(env, hangx, 0) - (hangd / 2) * Math.hypot(depth, m)),
    hangPocket: hangx - hangd / 2 - uend,
  };
}

// [] when the star can be built, else reasons: "connector" (too small or thin for the connector), "hanger" (the
// hanging hole would meet the barb pocket)
export function plugProblems(env) {
  const c = plugChecks(env), s = env.shape, out = [];
  if (c.wall < s.min_wall || c.jaw < s.min_jaw) out.push("connector");
  if (env.hanger && c.hangPocket < s.min_hang * env.sc) out.push("hanger");
  return out;
}

// smallest diameter (mm, on the parameter grid) that can be built with the other inputs as given, null if none
export function minDiameter(spec, inputs) {
  const { min, max, step } = spec.parameters.diameter;
  for (let D = min; D <= max; D += step) if (plugProblems(plugEnv(spec, { ...inputs, diameter: D })).length === 0) return D;
  return null;
}

// ---- geometry ----

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
// closed polygon [x, y] in the plane z, extruded by h
const prism = (R, pts, z, h) => {
  let pen = R.draw(pts[0]);
  for (const p of pts.slice(1)) pen = pen.lineTo(p);
  return pen.close().sketchOnPlane("XY", z).extrude(h);
};

// one point (star frame, axis on +X). hang: with the hanging hole
export function makePoint(R, env, hang = false) {
  const { Rt, hc, ri, phi, ox, big, rh, fit, tk, wt, bd, ucat, uend } = env;
  const c = Math.cos(phi), s = Math.sin(phi);
  // the bipyramid: tip, inner corners, the centre above and below the star plane
  const T = [Rt, 0, 0], I2 = [ri * c, ri * s, 0], I1 = [ri * c, -ri * s, 0], Ct = [0, 0, hc], Cb = [0, 0, -hc];
  const faces = [[T, I2, Ct], [T, Ct, I1], [T, I1, Cb], [T, Cb, I2], [I2, Cb, Ct], [I1, Ct, Cb]].map((f) => R.makePolygon(f));
  let body = R.makeSolid(faces);
  // side faces fit/2 behind the sector planes: cut away everything outside the wedge from (ox, 0)
  body = cut(R, body, prism(R, [[ox, 0], [ox + big * c, big * s], [-big, big * s], [-big, -big * s], [ox + big * c, -big * s]], -hc - 1, 2 * hc + 2));
  // hub slot and the tongue's channel with the barb pocket (the catch line 45°, the pocket end on the tongue end)
  const zs = -(tk / 2 + fit), hs = tk + 2 * fit, wf = wt / 2 + fit;
  body = cut(R, body, R.makeCylinder(rh + fit, hs, [0, 0, zs], [0, 0, 1]));
  body = cut(R, body, prism(R, [[0, wf], [ucat + fit, wf], [ucat + fit + bd, wf + bd], [uend, wf + bd], [uend, -wf - bd], [ucat + fit + bd, -wf - bd], [ucat + fit, -wf], [0, -wf]], zs, hs));
  if (hang) body = cut(R, body, R.makeCylinder(env.hangd / 2, 2 * hc, [env.hangx, 0, -hc], [0, 0, 1]));
  return body;
}

// the connector (star frame, tongue 0 on +X): hub disc and N tongues, each split into two barbed prongs
export function makeConnector(R, env) {
  const { N, tk, wt, sw, bd, bl, rh, uslit, ucat, uend } = env;
  const w = wt / 2;
  let body = R.makeCylinder(rh, tk, [0, 0, -tk / 2], [0, 0, 1]);
  const tongue = prism(R, [[0, -w], [ucat, -w], [ucat + bd, -w - bd], [ucat + bd + bl, -w - bd], [uend, -w], [uend, w], [ucat + bd + bl, w + bd], [ucat + bd, w + bd], [ucat, w], [0, w]], -tk / 2, tk);
  const slitEnd = R.makeCylinder(sw / 2, tk + 2, [uslit + sw / 2, 0, -tk / 2 - 1], [0, 0, 1]);
  const slit = R.makeBox([uslit + sw / 2, -sw / 2, -tk / 2 - 1], [uend + 1, sw / 2, tk / 2 + 1]);
  for (let k = 0; k < N; k++) {
    const turn = (shape) => (k === 0 ? shape : shape.clone().rotate((k * 360) / N, [0, 0, 0], [0, 0, 1]));
    body = fuse(R, body, turn(tongue));
    body = cut(R, body, turn(slitEnd));
    body = cut(R, body, turn(slit));
  }
  return body;
}

// the fits to choose from (mm, spec order); the fit test has a short point of each, the first in filament 2
export const fitOptions = (spec) => spec.parameters.fit.options.map(([v]) => v);

// a short piece of a point for the fit test: its inner end with the slot and the pocket
export function fitTestPiece(R, env, solid) {
  const x1 = env.uend + 6 * env.sc, big = env.big;
  return solid.clone().intersect(R.makeBox([-1, -big, -big], [x1, big, big]));
}

// ---- assembly and printing ----

const turnZ = (a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
};
// angle of point k in the assembled star (point 0 up)
export const pointAngle = (env, k) => 90 * deg + (k * 2 * Math.PI) / env.N;

// every part of the assembled star with its placement (row-major 4×4): N points (point 0 with the hanging hole if
// chosen) and the connector, tongue 0 under point 0
export function plugLayout(env) {
  const list = Array.from({ length: env.N }, (_, k) => ({ part: k === 0 && env.hanger ? "point_hang" : "point", index: k, m: turnZ(pointAngle(env, k)) }));
  list.push({ part: "connector", index: -1, m: turnZ(90 * deg) });
  return list;
}

// how a part lies on the bed (row-major 4×4 from the star frame): a point on its side face at -phi (that face on
// z = 0, the tip up, the star's thickness along Y), the connector flat
export function printPose(env, part) {
  if (part === "connector") return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, env.tk / 2, 0, 0, 0, 1];
  const c = Math.cos(env.phi), s = Math.sin(env.phi);
  return [c, -s, 0, 0, 0, 0, -1, 0, s, c, 0, -env.fit / 2, 0, 0, 0, 1];
}

// size of a point as it prints, from the corners of its bipyramid: [x, y, z]
export function pointPrintSize(env) {
  const { Rt, ri, hc, phi, fit } = env;
  const c = Math.cos(phi), s = Math.sin(phi);
  const pts = [[Rt, 0], [ri * c, ri * s], [ri * c, -ri * s], [env.ox, 0]];
  const xs = pts.map(([x, y]) => x * c - y * s), zs = pts.map(([x, y]) => x * s + y * c - fit / 2);
  return [Math.max(...xs) - Math.min(...xs), 2 * hc, Math.max(...zs)];
}

// which printers take the points ({name: [x, y, z]})
export function printFit(env, printers) {
  const [w, d, h] = pointPrintSize(env);
  const fit = Object.fromEntries(Object.entries(printers).map(([name, [x, y, z]]) => [name, h <= z && ((w <= x && d <= y) || (w <= y && d <= x))]));
  return { size: [w, d, h], fit };
}

// filament slot (1-based) of each point by default: three colours in turn, no two neighbours alike
export function defaultAssign(N) {
  const a = Array.from({ length: N }, (_, k) => (k % 3) + 1);
  if (N % 3 === 1) a[N - 1] = 2;
  return a;
}

// parts to print: [{part, count}]
export function partList(env) {
  return [
    { part: "point", count: env.hanger ? env.N - 1 : env.N },
    ...(env.hanger ? [{ part: "point_hang", count: 1 }] : []),
    { part: "connector", count: 1 },
  ];
}

// lay boxes [w, d] out in rows on a bed of width `bed`, gap mm apart, the whole block centred at (cx, cy):
// returns the centre [x, y] of each box
export function bedLayout(sizes, bed, cx, cy, gap = 8) {
  const pos = [];
  let x = 0, y = 0, row = 0, width = 0;
  for (const [w, d] of sizes) {
    if (x > 0 && x + w > bed) { y += row + gap; x = 0; row = 0; }
    pos.push([x + w / 2, y + d / 2]);
    x += w + gap;
    width = Math.max(width, x - gap);
    row = Math.max(row, d);
  }
  const height = y + row;
  return pos.map(([px, py]) => [px - width / 2 + cx, py - height / 2 + cy]);
}

// ---- files ----

// bounding box [[x, y, z], [x, y, z]] of a mesh {pos}
export function meshBox(mesh) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], p = mesh.pos;
  for (let i = 0; i < p.length; i++) { lo[i % 3] = Math.min(lo[i % 3], p[i]); hi[i % 3] = Math.max(hi[i % 3], p[i]); }
  return [lo, hi];
}

// surface area (mm²) of a mesh {pos, tri}
export function meshArea({ pos, tri }) {
  let a = 0;
  for (let i = 0; i < tri.length; i += 3) {
    const [p, q, r] = [3 * tri[i], 3 * tri[i + 1], 3 * tri[i + 2]];
    const ux = pos[q] - pos[p], uy = pos[q + 1] - pos[p + 1], uz = pos[q + 2] - pos[p + 2];
    const vx = pos[r] - pos[p], vy = pos[r + 1] - pos[p + 1], vz = pos[r + 2] - pos[p + 2];
    a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return a;
}

// filament (g) of a part printed with 3 perimeters and top/bottom skins (about 1.2 mm under the surface) and `infill`
// inside; PLA 1.24 g/cm³
export const partGrams = ({ volume, area }, infill = 0.15) => (1.24 * (Math.min(volume, area * 1.2) + Math.max(0, volume - area * 1.2) * infill)) / 1000;

// the objects of a 3MF (src/paint3mf.js threemfEntries): items [{mesh (as it prints), slot, name}] laid out in rows
// centred at (128, 110), so that they lie on the bed of every printer (slicers do not move the parts of a 3MF by
// themselves) and the back of a 256 mm plate stays free for the wipe tower of a multi-colour print; a part in slot
// n > 1 is painted all over with filament n, slot 1 keeps the object's own filament
export function plateObjects(items) {
  const boxes = items.map(({ mesh }) => meshBox(mesh));
  const pos = bedLayout(boxes.map(([lo, hi]) => [hi[0] - lo[0], hi[1] - lo[1]]), 236, 128, 110);
  return items.map(({ mesh, slot, name }, i) => {
    const [lo, hi] = boxes[i];
    const offset = [pos[i][0] - (lo[0] + hi[0]) / 2, pos[i][1] - (lo[1] + hi[1]) / 2, 0];
    return { mesh, name, offset, states: slot > 1 ? new Uint8Array(mesh.tri.length / 3).fill(slot) : null };
  });
}

export const plugTag = (env) => `${env.D}mm_${env.N}pt`;
export const PART_KEYS = { point: "plugstar.partPoint", point_hang: "plugstar.partPointHang", connector: "plugstar.partConnector" };

// Markdown build sheet; title in the sheet's language; t: translator of src/strings.js; file(part): its STL name;
// assign: filament slot per point; slicer: label of the slicer the 3MF is for
export function plugBuildSheet(env, title, printers, assign, slicer, t, file) {
  const size = pointPrintSize(env), pf = printFit(env, printers);
  const lines = [
    `# ${title} ${plugTag(env)}`,
    "",
    t("plugstar.sheetSize", { d: env.D, n: env.N, a: env.alpha, th: 2 * env.hc, g: env.fit }),
    "",
    `## ${t("plugstar.sheetParts")}`,
    "",
    ...partList(env).map(({ part, count }) => `- ${t("plugstar.sheetPartRow", { n: count, part: t(PART_KEYS[part]), file: file(part) })}`),
    "",
    `## ${t("plugstar.sheetColours")}`,
    "",
    ...assign.map((slot, k) => `- ${t(k === 0 && env.hanger ? "plugstar.sheetColourRowHang" : "plugstar.sheetColourRow", { k: k + 1, f: slot })}`),
    `- ${t("plugstar.sheetColour3mf", { slicer })}`,
    "",
    `## ${t("plugstar.sheetPrinting")}`,
    "",
    `- ${t("plugstar.sheetFitFirst", { a: env.fits[0], b: env.fits[1] })}`,
    `- ${t("plugstar.sheetPoints", { x: size[0], y: size[1], z: size[2] })}`,
    `- ${t("plugstar.sheetConnector", { tk: env.tk })}`,
    `- ${t("plugstar.sheetPlates")}`,
  ];
  for (const name of Object.keys(printers)) if (!pf.fit[name]) lines.push(`- ${t("plugstar.sheetTooBig", { printer: name })}`);
  lines.push(`- ${t("plugstar.sheetStl")}`, "", `## ${t("plugstar.sheetAssembly")}`, "",
    `- ${t("plugstar.sheetAsm1")}`, `- ${t("plugstar.sheetAsm2")}`, `- ${t("plugstar.sheetAsm3")}`);
  if (env.hanger) lines.push(`- ${t("plugstar.sheetHang")}`);
  return lines.join("\n") + "\n";
}
