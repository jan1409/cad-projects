// Does a Gridfinity box seat on the baseplate as the standard intends? Builds a 3 x 3 baseplate (without and with a
// bottom plate) and intersects it with standard boxes (src/bin.js) in a corner cell, the centre cell and over 2 x 2
// cells. The box foot stands on the pocket floor (z = b): lifted 0.01 mm it must be free, lowered 0.05 mm it must hit
// both 45 deg faces (upper z b+2.85..b+5, lower b+0.35..b+1.05), and shifted 0.3 mm sideways it must hit the upper face.
// Usage: node node/plate_fit.mjs [--markdown]
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { plateEnv, makePiece } from "../src/baseplate.js";
import { makeBin } from "../src/bin.js";

const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
R.setOC(await opencascade({ locateFile: () => wasm }));
const plateSpec = JSON.parse(fs.readFileSync(new URL("../../spec/baseplate_params.json", import.meta.url)));
const binSpec = JSON.parse(fs.readFileSync(new URL("../../spec/bin_params.json", import.meta.url)));

const band = (z0, z1) => R.drawRectangle(400, 400).sketchOnPlane("XY", [0, 0, z0]).extrude(z1 - z0);
const vol = (s) => (s ? R.measureVolume(s) : 0);
const inter = (a, b) => {
  try { return a.clone().intersect(b.clone()); } catch { return null; }
};

console.log("| bottom plate | box | move | overlap mm³ | upper 45° | lower 45° | expected | result |");
console.log("|---|---|---|---|---|---|---|---|");
let failures = 0;
for (const b of [0, 4]) {
  const env = plateEnv(plateSpec, { variant: "grid", x_count: 3, y_count: 3, bottom: b > 0, bottom_h: b, magnets: false });
  const plate = makePiece(R, plateSpec, env, env.unique[0]);
  const boxes = [["corner cell", 1, 1, -42, -42], ["centre cell", 1, 1, 0, 0], ["2 × 2 cells", 2, 2, -21, -21]];
  for (const [where, x, y, cx, cy] of boxes) {
    for (const [move, dx, dz, hit] of [["lifted 0.01", 0, 0.01, false], ["lowered 0.05", 0, -0.05, true], ["lifted 0.01, shifted 0.3", 0.3, 0.01, true]]) {
      const box = makeBin(R, binSpec, { variant: "standard", x_count: x, y_count: y, z_count: 3, magnets: false }).box().translate(cx + dx, cy, b + dz);
      const ov = inter(plate, box);
      const v = vol(ov), up = ov ? vol(inter(ov, band(b + 2.85, b + 5))) : 0, low = ov ? vol(inter(ov, band(b + 0.35, b + 1.05))) : 0;
      // lowered: both 45 deg faces must take part; shifted: at least the upper one; lifted: nothing
      const ok = hit ? (dz < 0 ? up > 1e-3 && low > 1e-3 : up > 1e-3) : v < 1e-6;
      if (!ok) failures++;
      console.log(`| ${b ? `${b} mm` : "none"} | ${where} | ${move} | ${v.toFixed(3)} | ${up.toFixed(3)} | ${low.toFixed(3)} | ${hit ? "touches" : "free"} | ${ok ? "ok" : "WRONG"} |`);
      box.delete();
      ov?.delete();
    }
  }
  plate.delete();
}
console.log(`\n${failures ? `${failures} problem(s)` : "all ok"}`);
process.exitCode = failures ? 1 : 0;
