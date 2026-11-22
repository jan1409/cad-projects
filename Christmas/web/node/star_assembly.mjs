// Assembly check (development): every part placed on its face; neighbouring parts must not overlap, and their walls must
// be the fit gap apart (the bump sits concentric in the neighbour's dimple, so the closest approach is the dimple clearance).
//   node node/star_assembly.mjs [D] [k]
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { starEnv, starFaces, placement, makeSquarePoint, makeTrianglePoint } from "../src/star.js";

const D = Number(process.argv[2] ?? 450), k = Number(process.argv[3] ?? 3);
const spec = { shape: { kd: 0.2, ts: 1.6, rb: 1.0, hb: 0.5, cb: 0.15, ksb: 0.25, kvb: 0.45 } };
const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
const oc = await opencascade({ locateFile: () => wasm });
R.setOC(oc);
const vol = (s) => {
  const props = new oc.GProp_GProps();
  oc.BRepGProp.VolumePropertiesGK(s.wrapped, props, 1e-9, false, false, false, false, false);
  const m = props.Mass();
  props.delete();
  return m;
};
const env = starEnv(spec, { diameter: D, slenderness: k, wall: 0.9, fit: 0.2 });
const parts = { square: makeSquarePoint(R, env), triangle: makeTrianglePoint(R, env) };
const faces = starFaces();
// apply a row-major 4x4 rigid matrix to a solid (replicad has no generic transform helper)
const place = (solid, m) => {
  const tr = new oc.gp_Trsf();
  tr.SetValues(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11]);
  const b = new oc.BRepBuilderAPI_Transform(solid.wrapped, tr, true);
  const out = R.cast(b.Shape());
  b.delete(); tr.delete();
  return out;
};
const placed = faces.map((f) => place(parts[f.type], placement(env, f)));
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
let worst = 0, minGap = Infinity, maxGap = 0, pairs = 0, edgePairs = 0;
const t0 = Date.now();
for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
  const c = dot(faces[i].n, faces[j].n);
  if (c < 0.4) continue; // far apart
  pairs++;
  const inter = vol(placed[i].clone().intersect(placed[j].clone()));
  worst = Math.max(worst, inter);
  if (c > 0.69) { // they share an edge
    edgePairs++;
    const gap = R.measureDistanceBetween(placed[i], placed[j]);
    minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap);
  }
  if (inter > 1e-6) console.log(`overlap ${i}(${faces[i].type}) ${j}(${faces[j].type}): ${inter.toExponential(3)} mm³`);
}
// tips on the sphere D/2
const tipErr = Math.max(...faces.map((f, i) => Math.abs(placed[i].boundingBox.bounds.flat().map(Math.abs).reduce((a, b) => Math.max(a, b)) * 0 + 0)));
void tipErr;
console.log(`D ${D} k ${k}: ${faces.length} parts, ${pairs} pairs checked (${edgePairs} sharing an edge); worst overlap ${worst.toExponential(2)} mm³; ` +
  `edge neighbours ${minGap.toFixed(4)}–${maxGap.toFixed(4)} mm apart; ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const box = R.makeCompound(placed).boundingBox.bounds;
console.log(`star bbox ${box[0].map((v) => v.toFixed(3)).join(", ")} .. ${box[1].map((v) => v.toFixed(3)).join(", ")} (expected ±${(D / 2).toFixed(3)} at the tips)`);
