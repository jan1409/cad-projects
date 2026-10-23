// Which box heights fit a closed Rugged Case? Builds a 3 x 3 x n case (lid in its closed position) and intersects it
// with standard boxes of height h = n - 1, n, n + 1: one over the whole floor, one in a corner cell, one in the centre.
// Boxes stand on the floor pockets (z = 0 in the case frame), lifted 0.01 mm to avoid exact face contact.
// Usage: node node/bin_case_fit.mjs <n> [--h <h>]   (each run is one process; the WASM heap only grows)
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { makeCase } from "../src/case.js";
import { makeBin } from "../src/bin.js";

const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
R.setOC(await opencascade({ locateFile: () => wasm }));
const caseSpec = JSON.parse(fs.readFileSync(new URL("../../spec/case_params.json", import.meta.url)));
const binSpec = JSON.parse(fs.readFileSync(new URL("../../spec/bin_params.json", import.meta.url)));
const n = Number(process.argv[2]);
const opt = (name, dflt) => (process.argv.includes(name) ? Number(process.argv[process.argv.indexOf(name) + 1]) : dflt);
const hs = process.argv.includes("--h") ? [opt("--h")] : [n - 1, n, n + 1];
const lift = opt("--lift", 0.01); // raise the boxes further to measure the clearance under the lid
const kase = makeCase(R, caseSpec, { x_count: 3, y_count: 3, z_count: n, window_t: 1.6, window_gap: 0.2 });
const lid = kase.lid(), base = kase.base();
const overlap = (a, b) => {
  try { return R.measureVolume(a.clone().intersect(b.clone())); } catch { return NaN; }
};
for (const h of hs) {
  const cells = [["whole floor", 3, 3, 0, 0], ["corner cell", 1, 1, -42, -42], ["centre cell", 1, 1, 0, 0]];
  for (const [where, x, y, dx, dy] of cells) {
    const b = makeBin(R, binSpec, { variant: "standard", x_count: x, y_count: y, z_count: h, magnets: false }).box().translate(dx, dy, lift);
    const [l, s] = [overlap(lid, b), overlap(base, b)];
    console.log(`| ${n} | ${h} | ${where} | ${l.toFixed(3)} | ${s.toFixed(3)} | ${l < 0.01 && s < 0.01 ? "fits" : "collides"} |`);
    b.delete();
  }
}
