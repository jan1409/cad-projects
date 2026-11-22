// Fit-test print plates from STL files: lays parts out in a row (copies side by side) and writes one 3MF per plate,
// each part its own object, ready to open in Bambu Studio, OrcaSlicer or PrusaSlicer. No geometry kernel.
//   node node/star_plates.mjs <out.3mf> <part.stl>[*count] ...
import fs from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";
import { weld, threemfEntries } from "../src/paint3mf.js";

// binary STL -> welded mesh
function readStl(file) {
  const buf = fs.readFileSync(file), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), n = dv.getUint32(80, true);
  const pos = new Float64Array(n * 9), tri = new Uint32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 9; k++) pos[9 * i + k] = dv.getFloat32(84 + 50 * i + 12 + 4 * k, true);
    tri.set([3 * i, 3 * i + 1, 3 * i + 2], 3 * i);
  }
  return weld(pos, tri);
}
const [out, ...items] = process.argv.slice(2);
const parts = items.flatMap((it) => {
  const [file, count] = it.split("*");
  const mesh = readStl(file);
  return Array.from({ length: Number(count ?? 1) }, (_, i) => ({ mesh, name: `${path.basename(file, ".stl")}${count > 1 ? ` ${i + 1}` : ""}` }));
});
// the row is centred at (128, 128): on the bed of the Bambu X1C (256) and the Prusa XL (360) alike
const boxes = parts.map(({ mesh }) => {
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (let i = 0; i < mesh.pos.length; i += 3) for (const c of [0, 1]) { lo[c] = Math.min(lo[c], mesh.pos[i + c]); hi[c] = Math.max(hi[c], mesh.pos[i + c]); }
  return { lo, hi };
});
const GAP = 8, length = boxes.reduce((sum, { lo, hi }) => sum + hi[0] - lo[0], 0) + GAP * (parts.length - 1);
let x = 128 - length / 2;
const objects = parts.map(({ mesh, name }, i) => {
  const { lo, hi } = boxes[i];
  const o = { mesh, name, offset: [x - lo[0], 128 - (lo[1] + hi[1]) / 2, 0] };
  x += hi[0] - lo[0] + GAP;
  return o;
});
fs.writeFileSync(out, zipSync(threemfEntries({ objects }), { level: 6 }));
console.log(`${out}: ${objects.length} parts in a row ${length.toFixed(0)} mm long`);
