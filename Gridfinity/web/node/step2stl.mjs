// Convert a STEP file into one binary STL per solid and print each solid's volume and bounding box (OpenCascade via replicad).
// Usage: node node/step2stl.mjs <in.step> <out_dir>   -> <out_dir>/<step name>_<n>.stl
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";

const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
R.setOC(await opencascade({ locateFile: () => wasm }));
const [input, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const shape = await R.importSTEP(new Blob([fs.readFileSync(input)]));
const base = path.basename(input, path.extname(input));
const list = [...R.iterTopo(shape.wrapped, "solid")].map((s) => R.cast(s));
if (!list.length) list.push(shape);
const f = (v) => v.toFixed(3).padStart(9);
let i = 0;
for (const s of list) {
  const [[x0, y0, z0], [x1, y1, z1]] = s.boundingBox.bounds;
  const out = path.join(outDir, `${base}_${i}.stl`);
  fs.writeFileSync(out, Buffer.from(await s.blobSTL({ tolerance: 0.005, angularTolerance: 0.05, binary: true }).arrayBuffer()));
  console.log(`${base}_${i}  vol ${(R.measureVolume(s) / 1000).toFixed(4)} cm3  x ${f(x0)}..${f(x1)}  y ${f(y0)}..${f(y1)}  z ${f(z0)}..${f(z1)}`);
  i++;
}
