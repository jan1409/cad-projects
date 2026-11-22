// Assembly check: every part placed on its face (starLayout, the carrier included).
//   1. no two parts overlap (exact booleans, Gauss-Kronrod volumes), and neighbouring skirt walls are the fit gap apart;
//   2. every magnet pocket faces exactly one pocket of a neighbour, coaxial, its mouth the fit gap away, and always a
//      marked one (dot: the magnets' marked face out) against an unmarked one, so every wall fits every wall.
//   node node/star_assembly.mjs [diameter] [slenderness] [lamp]
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { starEnv, starLayout, starFaces, makeSquarePoint, makeTrianglePoint, makeSocket, makeCarrier } from "../src/star.js";

const spec = JSON.parse(fs.readFileSync(new URL("../../spec/star_params.json", import.meta.url), "utf8"));
const P = spec.parameters;
const [D = P.diameter.default, k = P.slenderness.default, lamp = P.lamp.default] = process.argv.slice(2);
const env = starEnv(spec, { diameter: Number(D), slenderness: Number(k), wall: P.wall.default, fit: P.fit.default, lamp });

// ---- 2. pockets (no kernel): mouth centre and inward axis of every pocket in the part frame, then in the world
const mul = (m, p) => [0, 1, 2].map((r) => m[4 * r] * p[0] + m[4 * r + 1] * p[1] + m[4 * r + 2] * p[2] + m[4 * r + 3]);
const rot = (m, v) => [0, 1, 2].map((r) => m[4 * r] * v[0] + m[4 * r + 1] * v[1] + m[4 * r + 2] * v[2]);
const turnZ = (p, i, n) => { const a = (2 * Math.PI * i) / n, c = Math.cos(a), s = Math.sin(a); return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]]; };
function partPockets(part) {
  const { sb, ths, tht } = env;
  let p, nIn, e, n;
  if (part === "triangle") { p = [0, -env.tr.ybt, env.tr.zbt]; nIn = [0, Math.cos(tht), Math.sin(tht)]; e = [1, 0, 0]; n = 3; }
  else if (part === "square") { p = [env.sq.xbs, 0, env.sq.zbs]; nIn = [-Math.cos(ths), 0, Math.sin(ths)]; e = [0, 1, 0]; n = 4; }
  else if (part === "socket") { p = [env.sk.xbk, 0, env.sk.zbk]; nIn = [-Math.cos(ths), 0, Math.sin(ths)]; e = [0, 1, 0]; n = 4; }
  else return [];
  const out = [];
  for (let i = 0; i < n; i++) for (const [u, marked] of [[sb, true], [-sb, false]]) {
    out.push({ at: turnZ([p[0] + e[0] * u, p[1] + e[1] * u, p[2]], i, n), axis: turnZ(nIn, i, n), marked });
  }
  return out;
}
const layout = starLayout(env);
const pockets = layout.flatMap(({ part, m }, piece) => partPockets(part).map((q) => ({ piece, part, at: mul(m, q.at), axis: rot(m, q.axis), marked: q.marked })));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
let worstGap = 0, worstAxis = 0, badPolarity = 0, unmatched = 0;
for (const q of pockets) {
  const others = pockets.filter((o) => o.piece !== q.piece).map((o) => [dist(o.at, q.at), o]).sort((x, y) => x[0] - y[0]);
  const [dd, o] = others[0];
  if (dd > env.g + 0.05) { unmatched++; continue; }
  worstGap = Math.max(worstGap, Math.abs(dd - env.g));
  const dot = q.axis[0] * o.axis[0] + q.axis[1] * o.axis[1] + q.axis[2] * o.axis[2]; // facing pockets point at each other
  worstAxis = Math.max(worstAxis, Math.acos(Math.min(1, -dot)) * (180 / Math.PI));
  if (q.marked === o.marked) badPolarity++;
}
console.log(`pockets: ${pockets.length} (${layout.length} parts); unmatched ${unmatched}; mouths ${env.g} mm apart ± ${worstGap.toExponential(1)}; ` +
  `axes within ${worstAxis.toFixed(4)}°; same pole facing ${badPolarity}`);

// ---- 1. overlaps and gaps (kernel)
const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
const oc = await opencascade({ locateFile: () => wasm });
R.setOC(oc);
const vol = (s) => {
  const props = new oc.GProp_GProps();
  oc.BRepGProp.VolumePropertiesGK(s.wrapped, props, 1e-9, false, false, false, false, false);
  const v = props.Mass();
  props.delete();
  return v;
};
const place = (solid, m) => {
  const tr = new oc.gp_Trsf();
  tr.SetValues(...m.slice(0, 12));
  const b = new oc.BRepBuilderAPI_Transform(solid.wrapped, tr, true);
  const o = R.cast(b.Shape());
  b.delete(); tr.delete();
  return o;
};
const solids = { square: makeSquarePoint(R, env), triangle: makeTrianglePoint(R, env), socket: makeSocket(R, env), ...(env.seat === "bayonet" ? { carrier: makeCarrier(R, env) } : {}) };
const placed = layout.map(({ part, m }) => place(solids[part], m));
const box = placed.map((s) => s.boundingBox.bounds);
const near = (i, j) => [0, 1, 2].every((c) => box[i][0][c] <= box[j][1][c] && box[j][0][c] <= box[i][1][c]);
const faces = starFaces();
let worst = 0, minGap = Infinity, maxGap = 0, pairs = 0;
const t0 = Date.now();
for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
  if (!near(i, j)) continue;
  pairs++;
  const ov = vol(placed[i].clone().intersect(placed[j].clone()));
  if (ov > 1e-6) console.log(`  overlap ${layout[i].part} #${i} / ${layout[j].part} #${j}: ${ov.toFixed(3)} mm³`);
  worst = Math.max(worst, ov);
  const fi = faces[i], fj = faces[j];
  if (fi && fj && layout[i].part !== "carrier" && layout[j].part !== "carrier" && fi.n[0] * fj.n[0] + fi.n[1] * fj.n[1] + fi.n[2] * fj.n[2] > 0.69) {
    const gap = R.measureDistanceBetween(placed[i], placed[j]); // they share an edge
    minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap);
  }
}
const ok = worst < 1e-6 && unmatched === 0 && badPolarity === 0 && worstGap < 1e-3 && worstAxis < 0.01 && Math.abs(minGap - env.g) < 1e-3;
console.log(`D ${env.D} k ${env.k} ${lamp}: ${pairs} pairs; worst overlap ${worst.toExponential(2)} mm³; edge neighbours ${minGap.toFixed(4)}–${maxGap.toFixed(4)} mm apart; ` +
  `${((Date.now() - t0) / 1000).toFixed(1)} s -> ${ok ? "ok" : "PROBLEMS"}`);
process.exitCode = ok ? 0 : 1;
