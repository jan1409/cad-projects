// Where does a generated box differ from its Onshape reference? Prints every solid of (web - ref) and (ref - web)
// with volume and bounding box, and writes them as STL for viewing. Usage: node node/bin_diff.mjs <ref name> x y z variant
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { makeBin } from "../src/bin.js";

const [name, x, y, z, variant = "standard"] = process.argv.slice(2);
const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
R.setOC(await opencascade({ locateFile: () => wasm }));
const spec = JSON.parse(fs.readFileSync(new URL("../../spec/bin_params.json", import.meta.url)));
const inputs = { variant, x_count: +x, y_count: +y, z_count: +z, magnets: true };
const ref = await R.importSTEP(new Blob([fs.readFileSync(new URL(`../../reference/bins/${name}.step`, import.meta.url))]));
const refBox = [...R.iterTopo(ref.wrapped, "solid")].map((s) => R.cast(s))
  .map((s) => s.translate(-21 * (inputs.x_count - 1), -21 * (inputs.y_count - 1), 0))
  .filter((s) => Math.abs(s.boundingBox.bounds[0][2]) < 1e-3).sort((a, b) => R.measureVolume(b) - R.measureVolume(a))[0];
const web = makeBin(R, spec, inputs).box();
const out = fileURLToPath(new URL("../../export/bins_diff/", import.meta.url));
fs.mkdirSync(out, { recursive: true });
for (const [label, shape] of [["web-ref", web.clone().cut(refBox.clone())], ["ref-web", refBox.clone().cut(web.clone())]]) {
  const parts = [...R.iterTopo(shape.wrapped, "solid")].map((s) => R.cast(s)).sort((a, b) => R.measureVolume(b) - R.measureVolume(a));
  console.log(`${label}: ${parts.length} solids, ${(R.measureVolume(shape) / 1000).toFixed(4)} cm3`);
  for (const p of parts.slice(0, 12)) {
    const [[x0, y0, z0], [x1, y1, z1]] = p.boundingBox.bounds;
    console.log(`  ${(R.measureVolume(p)).toFixed(3).padStart(9)} mm3  x ${x0.toFixed(2)}..${x1.toFixed(2)}  y ${y0.toFixed(2)}..${y1.toFixed(2)}  z ${z0.toFixed(3)}..${z1.toFixed(3)}`);
  }
  if (parts.length) fs.writeFileSync(`${out}${name}_${label}.stl`, Buffer.from(await shape.blobSTL({ tolerance: 0.005, binary: true }).arrayBuffer()));
}
