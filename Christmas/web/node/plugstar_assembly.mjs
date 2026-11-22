// Assembly check of the plug-together star (src/plugstar.js), exact B-rep booleans:
//  - seated: the N points and the connector placed as in the star: no overlaps; the gap between neighbouring points
//    (= fit); the tongue end and the 45° catch touch the point (distance 0)
//  - insertion: one point pulled out along its axis step by step: it never meets its seated neighbours, and it meets
//    the connector only with the barbs (the parts that flex), never with the hub or the tongue core
//   node node/plugstar_assembly.mjs [diameter points tip_angle depth fit]   (defaults from the spec)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { plugEnv, plugLayout, makePoint, makeConnector } from "../src/plugstar.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(fs.readFileSync(path.join(here, "../../spec/plugstar_params.json")));
const P = spec.parameters;
const [D, N, A, DE, F] = process.argv.slice(2).map(Number);
const inputs = {
  diameter: D || P.diameter.default, points: N || P.points.default, tip_angle: A || P.tip_angle.default,
  depth: DE || P.depth.default, fit: F || P.fit.default, hanger: true,
};
const env = plugEnv(spec, inputs);
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
const dist = (a, b) => R.measureDistanceBetween(a, b);
const overlap = (a, b) => vol(a.clone().intersect(b.clone()));
const place = (shape, m) => {
  // row-major 4x4 rotation about Z (plugLayout) -> replicad rotate
  const ang = (Math.atan2(m[4], m[0]) * 180) / Math.PI;
  return shape.clone().rotate(ang, [0, 0, 0], [0, 0, 1]);
};

const point = makePoint(R, env, false), hang = makePoint(R, env, true), conn = makeConnector(R, env);
const layout = plugLayout(env);
const parts = layout.map(({ part, m }) => place(part === "connector" ? conn : part === "point_hang" ? hang : point, m));
const pts = parts.slice(0, env.N), connector = parts[env.N];
const out = [];
let ok = true;
const check = (label, value, good) => { out.push(`${good ? "ok " : "BAD"} ${label}: ${value}`); ok &&= good; };

// seated
for (let k = 0; k < env.N; k++) {
  const next = pts[(k + 1) % env.N];
  check(`point ${k} ∩ point ${(k + 1) % env.N}`, `${overlap(pts[k], next).toFixed(4)} mm³, gap ${dist(pts[k], next).toFixed(4)} mm`, overlap(pts[k], next) < 1e-4 && Math.abs(dist(pts[k], next) - env.fit) < 1e-3);
  const o = overlap(pts[k], connector), g = dist(pts[k], connector);
  check(`point ${k} ∩ connector`, `${o.toFixed(4)} mm³, distance ${g.toFixed(4)} mm`, o < 1e-4 && g < 1e-6);
}

// insertion of point 1 (no hanging hole), along its axis
const k = 1, a = (layout[k].m[4] !== 0 || layout[k].m[0] !== 0) ? Math.atan2(layout[k].m[4], layout[k].m[0]) : 0;
const u = [Math.cos(a), Math.sin(a), 0];
// the connector's core: everything closer to the tongue axes than the barbs reach into the channel (wt/2 + fit)
const coreCut = (shape) => {
  let core = shape.clone();
  // remove the barb zones of tongue k: |v| in [wt/2 + fit, wt/2 + bd + 1] beyond ucat - 1 (in the point frame of tongue k)
  for (const side of [1, -1]) {
    const y0 = side > 0 ? env.wt / 2 + env.fit - 1e-3 : -(env.wt / 2 + env.bd + 1), y1 = side > 0 ? env.wt / 2 + env.bd + 1 : -(env.wt / 2 + env.fit - 1e-3);
    const zone = R.makeBox([env.ucat - 1, y0, -env.tk], [env.uend + 1, y1, env.tk]).rotate((a * 180) / Math.PI, [0, 0, 0], [0, 0, 1]);
    core = core.cut(zone);
  }
  return core;
};
const core = coreCut(connector);
const steps = [0.05, 0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30].map((s) => s * env.sc).filter((s) => s < env.uend + 2);
steps.push(env.uend + 1);
let barbMax = 0;
for (const s of steps) {
  const moved = pts[k].clone().translate([u[0] * s, u[1] * s, 0]);
  const nb = Math.max(overlap(moved, pts[k - 1]), overlap(moved, pts[(k + 1) % env.N]));
  const oc1 = overlap(moved, core), oall = overlap(moved, connector);
  barbMax = Math.max(barbMax, oall);
  check(`pulled out ${s.toFixed(2)} mm`, `neighbours ${nb.toFixed(4)}, connector core ${oc1.toFixed(4)}, barbs ${oall.toFixed(3)} mm³`, nb < 1e-4 && oc1 < 1e-4);
}
console.log(`plug star D=${env.D} N=${env.N} α=${env.alpha} depth=${env.depth} fit=${env.fit}: ${ok ? "ok" : "PROBLEMS"} (largest barb interference ${barbMax.toFixed(2)} mm³)`);
console.log(out.join("\n"));
process.exitCode = ok ? 0 : 1;
