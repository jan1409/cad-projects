// Compare generated boxes with the Onshape reference STEPs (Gridfinity/reference/bins) by exact B-rep booleans.
// The reference has cell (0, 0) at the origin; it is moved to the centred frame of src/bin.js first.
// Usage: node node/bin_check.mjs [--one <ref name>]   (each reference runs in its own process; the WASM heap only grows)
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { makeBin } from "../src/bin.js";

const REFS = {
  std_1x1x3: { variant: "standard", x_count: 1, y_count: 1, z_count: 3 },
  std_3x2x6: { variant: "standard", x_count: 2, y_count: 3, z_count: 6 },
  label_L2xB1xH3: { variant: "label", x_count: 1, y_count: 2, z_count: 3 },
  label_L4xB5xH6: { variant: "label", x_count: 5, y_count: 4, z_count: 6 },
};

async function one(name) {
  const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
  R.setOC(await opencascade({ locateFile: () => wasm }));
  const spec = JSON.parse(fs.readFileSync(new URL("../../spec/bin_params.json", import.meta.url)));
  const inputs = { ...REFS[name], magnets: true };
  const ref = await R.importSTEP(new Blob([fs.readFileSync(new URL(`../../reference/bins/${name}.step`, import.meta.url))]));
  const solids = [...R.iterTopo(ref.wrapped, "solid")].map((s) => R.cast(s))
    .map((s) => s.translate(-21 * (inputs.x_count - 1), -21 * (inputs.y_count - 1), 0));
  const zr = (s) => s.boundingBox.bounds.map((b) => b[2]);
  const refBox = solids.filter((s) => Math.abs(zr(s)[0]) < 1e-3).sort((a, b) => R.measureVolume(b) - R.measureVolume(a))[0];
  const refPlate = solids.find((s) => zr(s)[0] > 1 && R.measureVolume(s) < R.measureVolume(refBox) / 4);
  const bin = makeBin(R, spec, inputs);
  const v = (s) => R.measureVolume(s) / 1000;
  const rows = [];
  const compare = (part, web, refS) => {
    const plus = v(web.clone().cut(refS.clone())), minus = v(refS.clone().cut(web.clone()));
    rows.push(`| ${name} | ${part} | ${v(refS).toFixed(4)} | ${v(web).toFixed(4)} | ${(v(web) - v(refS)).toFixed(4)} | ${plus.toFixed(4)} | ${minus.toFixed(4)} |`);
  };
  const t0 = Date.now();
  compare("box", bin.box(), refBox);
  if (bin.plate && refPlate) compare("plate", bin.plate(), refPlate);
  for (const r of rows) console.log(r);
  console.error(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

if (process.argv[2] === "--one") await one(process.argv[3]);
else {
  console.log("| reference | part | Onshape cm3 | web cm3 | diff | web - Onshape | Onshape - web |\n|---|---|---|---|---|---|---|");
  for (const name of Object.keys(REFS)) {
    const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--one", name], { encoding: "utf8", maxBuffer: 1 << 26 });
    process.stdout.write(out.split("\n").filter((l) => l.startsWith("|")).join("\n") + "\n");
  }
}
