// Smallest star per lamp: the edge a at which everything hanging from the lamp socket (holder, nut, bulb; the lamp
// table's envelope) keeps its clearance from every part of the assembled star, by exact B-rep distances and bisection.
// The skirts scale with a alone, so a_lamp holds for every point length k; the result is checked at k min and max.
//   node node/star_lamps.mjs [--write]   (--write stores a_lamp in Christmas/spec/star_params.json)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { starEnv, starLayout, lampEnvelope, makeSquarePoint, makeTrianglePoint, makeSocket } from "../src/star.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const specFile = path.resolve(here, "../../spec/star_params.json");
const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
const P = spec.parameters;
const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
const oc = await opencascade({ locateFile: () => wasm });
R.setOC(oc);
const RS = (1 + Math.SQRT2) / 2;

const place = (solid, m) => {
  const tr = new oc.gp_Trsf();
  tr.SetValues(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11]);
  const b = new oc.BRepBuilderAPI_Transform(solid.wrapped, tr, true);
  const out = R.cast(b.Shape());
  b.delete(); tr.delete();
  return out;
};

// smallest margin (distance minus clearance) between the lamp envelope and the star; >= 0 means it fits.
// Only the points count: the lamp sits in the socket by design (socketProblems checks the passage), and what hangs
// from it must keep its distance from the points' skirts and walls.
function margin(lampKey, a, k) {
  const D = 2 * a * (RS + k);
  const env = starEnv(spec, { diameter: D, slenderness: k, wall: P.wall.default, fit: P.fit.default, lamp: lampKey });
  const parts = { square: makeSquarePoint(R, env), triangle: makeTrianglePoint(R, env), socket: makeSocket(R, env) };
  const placed = starLayout(env).filter((p) => p.part !== "carrier").map((p) => ({ part: p.part, s: place(parts[p.part], p.m) }));
  let worst = Infinity;
  lampEnvelope(env).forEach(([r, z0, z1, c], i) => {
    const cyl = R.makeCylinder(r, z1 - z0, [0, 0, z0], [0, 0, 1]);
    const cb = cyl.boundingBox.bounds;
    for (const { part, s } of placed) {
      if (part === "socket") continue;
      const sb = s.boundingBox.bounds;
      const gap = Math.max(0, ...[0, 1, 2].map((j) => Math.max(sb[0][j] - cb[1][j], cb[0][j] - sb[1][j])));
      if (gap - c >= worst || gap >= c + 50) continue; // the boxes alone keep it clear enough
      worst = Math.min(worst, R.measureDistanceBetween(cyl, s) - c);
    }
  });
  return worst;
}

if (process.argv[2] === "--probe") { // node node/star_lamps.mjs --probe <lamp> <a> [k]
  console.log(`margin ${margin(process.argv[3], Number(process.argv[4]), Number(process.argv[5] ?? 3)).toFixed(4)} mm`);
  process.exit(0);
}
// every probe in its own process: OpenCascade's WASM heap only grows, and long runs end in failed booleans.
// A probe that cannot build the parts (a far too small for the lamp) counts as no fit.
const probe = (key, a, k) => {
  try {
    const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--probe", key, String(a), String(k)],
      { encoding: "utf8", maxBuffer: 1 << 24, stdio: ["ignore", "pipe", "pipe"] });
    return Number(/margin (\S+)/.exec(out)[1]);
  } catch (e) {
    console.error(`  probe ${key} a=${a} k=${k} failed: ${String(e.stderr ?? e.message).trim().split("\n").slice(-1)[0]}`);
    return -Infinity;
  }
};
const result = {};
for (const key of Object.keys(spec.lamps).filter((k) => !k.startsWith("_"))) {
  let lo = 12, hi = 140; // a in mm
  const mHi = probe(key, hi, 3);
  if (mHi < 0) throw new Error(`${key}: no fit even at a = ${hi} (margin ${mHi})`);
  while (hi - lo > 0.05) {
    const mid = (lo + hi) / 2;
    if (probe(key, mid, 3) < 0) lo = mid; else hi = mid;
  }
  const a = Math.ceil(hi * 10) / 10;
  const kMin = probe(key, a, P.slenderness.min), kMax = probe(key, a, P.slenderness.max);
  result[key] = a;
  console.log(`${key}: a_lamp ${a} mm (D ${(2 * a * (RS + 3)).toFixed(0)} mm at k 3); margin at k ${P.slenderness.min}/3/${P.slenderness.max}: ` +
    `${kMin.toFixed(2)}/${probe(key, a, 3).toFixed(2)}/${kMax.toFixed(2)} mm`);
}
if (process.argv.includes("--write")) {
  let text = fs.readFileSync(specFile, "utf8");
  for (const [key, a] of Object.entries(result)) {
    text = text.replace(new RegExp(`("${key}": \\{[\\s\\S]*?"a_lamp": )(null|[0-9.]+)`), `$1${a}`);
  }
  fs.writeFileSync(specFile, text);
  console.log(`a_lamp written to ${path.relative(process.cwd(), specFile)}`);
}
