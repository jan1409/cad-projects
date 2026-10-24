// Build the case headless with the same module the browser page uses, and export it.
// Usage: node node/build.mjs <XxYxZ> [--wt 1.6] [--gap 0.2] [--force] [--parts Base,Lid,...] [--lang en|de]
// Output: Gridfinity/export/web/<tag>/ (assembled STLs + case.step) and .../print/ (oriented STLs, window SVG, build sheet)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { makeCase, toPrint, windowSVG, buildSheet, PRINT } from "../src/case.js";
import strings from "../src/strings.js";
import { translator } from "../../../site/shared/i18n.js";

const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const [x, y, n] = args[0].toLowerCase().split("x").map(Number);
const spec = JSON.parse(fs.readFileSync(new URL("../../spec/case_params.json", import.meta.url)));
const P = spec.parameters;
const inputs = { x_count: x, y_count: y, z_count: n, window_t: Number(opt("--wt", P.window_t.default)),
  window_gap: Number(opt("--gap", P.window_gap.default)) };
for (const [k, v] of Object.entries(inputs))
  if (!args.includes("--force") && !(P[k].min <= v && v <= P[k].max)) throw new Error(`${k} = ${v} outside ${P[k].min}..${P[k].max}`);
const parts = opt("--parts", "Base,Lid,Latch,Seal,Window").split(",");
const t = translator(strings, opt("--lang", "en")); // language of the window SVG title and the build sheet

let tag = `${x}x${y}x${n}` + (Math.abs(inputs.window_t - 1.6) < 1e-9 ? "" : `_w${String(inputs.window_t).replace(".", "")}`);
if (Math.abs(inputs.window_gap - P.window_gap.default) > 1e-9) tag += `_g${String(inputs.window_gap).replace(".", "")}`;
const out = fileURLToPath(new URL(`../../export/web/${tag}/`, import.meta.url));
fs.mkdirSync(path.join(out, "print"), { recursive: true });

const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
R.setOC(await opencascade({ locateFile: () => wasm }));
const kase = makeCase(R, spec, inputs);
const STL = { tolerance: 0.01, angularTolerance: 0.1, binary: true };
const writeBlob = async (file, blob) => fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));

const shapes = {};
const sizes = {};
for (const part of parts) {
  const t0 = Date.now();
  const shape = kase[part.toLowerCase()]();
  const ms = Date.now() - t0;
  shapes[part] = shape;
  const [[x0, y0, z0], [x1, y1, z1]] = shape.boundingBox.bounds;
  console.log(`${part.padEnd(7)} ${(x1 - x0).toFixed(2)} x ${(y1 - y0).toFixed(2)} x ${(z1 - z0).toFixed(2)} mm  ` +
    `z ${z0.toFixed(2)}..${z1.toFixed(2)}  V=${(R.measureVolume(shape) / 1000).toFixed(4)} cm3  ${ms} ms`);
  await writeBlob(path.join(out, `${part}.stl`), shape.blobSTL(STL));
  if (PRINT[part]) {
    const p = toPrint(shape, part);
    const [[a0, b0, c0], [a1, b1, c1]] = p.boundingBox.bounds;
    sizes[part] = [a1 - a0, b1 - b0, c1 - c0];
    await writeBlob(path.join(out, "print", `Gridfinity_Rugged_Case_${tag}_${PRINT[part].file}.stl`), p.blobSTL(STL));
  }
}
// STEP of the assembly (both latches, like the Onshape reference) for the exact comparison in Fusion
const stepShapes = Object.entries(shapes).map(([name, shape]) => ({
  name, shape: name === "Latch" ? R.makeCompound([shape.clone(), shape.clone().translate([-2 * kase.env.hinge_x, 0, 0])]) : shape }));
await writeBlob(path.join(out, "case.step"), R.exportSTEP(stepShapes));
if (parts.includes("Window")) {
  fs.writeFileSync(path.join(out, "print", `Gridfinity_Rugged_Case_${tag}_Window_${inputs.window_t.toFixed(2)}mm.svg`), windowSVG(kase.env, t));
}
if (Object.keys(sizes).length === 4) fs.writeFileSync(path.join(out, "print", "BUILD_SHEET.md"), buildSheet(kase.env, tag, sizes, t));
console.log("written", out);
