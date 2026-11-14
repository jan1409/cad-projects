// Gridfinity label jig headless: build one configuration, check it is a closed mesh and that the label plates of
// src/bin.js fit: a plate in every pocket is free of the jig (lying on the pocket floor, its top flush with the jig's
// top) and touches it when moved sideways by the clearance + 0.02 mm (proves the check can see a contact).
//   node node/jig_build.mjs <x> [layout auto|1|2] [--gap mm] [--clearance mm] [--base mm] [--out dir]
//   node node/jig_build.mjs --sweep                                   -> ../export/web/jig_sweep.md
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { setClipper } from "../src/outline.js";
import { jigEnv, makeJig, jigSvg } from "../src/jig.js";
import { makeBin } from "../src/bin.js";
import { openEdges } from "./insert_fixtures.mjs";

setClipper(createRequire(import.meta.url)("clipper-lib"));
const spec = JSON.parse(fs.readFileSync(new URL("../../spec/bin_params.json", import.meta.url)));

async function one(args) {
  const opt = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
  const P = spec.variants.jig.parameters;
  const inputs = { x_count: Number(args[0]), layout: args[1] && !args[1].startsWith("--") ? args[1] : "auto",
    plate_gap: opt("--gap", P.plate_gap.default), clearance: opt("--clearance", P.clearance.default), base: opt("--base", P.base.default) };
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  const tag = `${inputs.x_count}_${inputs.layout}_g${inputs.plate_gap}_c${inputs.clearance}_b${inputs.base}`;
  const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
  R.setOC(await opencascade({ locateFile: () => wasm }));
  const t0 = Date.now();
  let cells = ["-", "-", "-", "-", "-"], result = "ok";
  try {
    const env = jigEnv(spec, inputs);
    cells = [`${env.cols} × ${env.rows}`, `${env.L.toFixed(1)} × ${env.W.toFixed(1)} × ${env.H.toFixed(2)}`, env.uv ? "yes" : "no", env.bed ? "yes" : "no", "-"];
    const jig = makeJig(R, spec, env);
    const stl = await jig.blobSTL({ tolerance: 0.01, angularTolerance: 0.1, binary: true }).arrayBuffer();
    const open = openEdges(stl);
    // the real plate moved into each pocket: bottom on the pocket floor
    const flat = makeBin(R, spec, { variant: "label", x_count: inputs.x_count, y_count: 1, z_count: 3, plate_gap: inputs.plate_gap }).plate();
    const pb = flat.boundingBox.bounds, pcx = (pb[0][0] + pb[1][0]) / 2, pcy = (pb[0][1] + pb[1][1]) / 2;
    let free = 0, touch = 0, flush = 0;
    for (const p of env.pockets) {
      const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2;
      const placed = flat.clone().translate(cx - pcx, cy - pcy, env.H - env.plate[2] - pb[0][2]);
      const top = placed.boundingBox.bounds[1][2];
      if (Math.abs(top - env.H) > 1e-6) flush++;
      const v = R.measureVolume(jig.clone().intersect(placed.clone()));
      if (v > 1e-6) free++;
      const moved = placed.clone().translate(inputs.clearance + 0.02, 0, 0);
      if (R.measureVolume(jig.clone().intersect(moved)) < 1e-4) touch++;
      placed.delete();
    }
    cells[4] = (R.measureVolume(jig) / 1000).toFixed(1);
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, `jig_${tag}.stl`), Buffer.from(stl));
      fs.writeFileSync(path.join(out, `jig_${tag}.step`), Buffer.from(await jig.blobSTEP().arrayBuffer()));
      fs.writeFileSync(path.join(out, `jig_${tag}_layout.svg`), jigSvg(env, { title: tag }));
    }
    const bad = [open && `${open} open STL edges`, free && `${free} plates collide`, touch && `${touch} plates loose`, flush && `${flush} not flush`].filter(Boolean);
    if (bad.length) result = bad.join(", ");
  } catch (e) {
    result = `FAILED: ${e.message}`;
  }
  console.log(`| ${tag} | ${cells.join(" | ")} | ${((Date.now() - t0) / 1000).toFixed(1)} | ${result} |`);
}

const args = process.argv.slice(2);
if (args[0] === "--sweep") {
  const configs = [];
  for (let x = 1; x <= 10; x++) configs.push([String(x)]);
  configs.push(["2", "1"], ["4", "2"], ["6", "2"], ["3", "auto", "--gap", "0.25"], ["3", "auto", "--clearance", "0"], ["3", "auto", "--clearance", "0.5", "--base", "5"],
    ["1", "auto", "--base", "1.5"]);
  const rows = ["| Config | Layout | Size mm | UV area | Bed | cm³ | build s | result |", "|---|---|---|---|---|---|---|---|"];
  let failures = 0;
  for (const c of configs) {
    let line;
    try {
      line = execFileSync(process.execPath, [fileURLToPath(import.meta.url), ...c], { encoding: "utf8", maxBuffer: 1 << 26 }).split("\n").find((l) => l.startsWith("|"));
    } catch {
      line = undefined;
    }
    line ??= `| ${c.join("_")} | - | - | - | - | - | - | FAILED: process crashed |`;
    if (!line.endsWith("| ok |")) failures++;
    rows.push(line);
    console.log(line);
  }
  const outFile = new URL("../../export/web/jig_sweep.md", import.meta.url);
  fs.mkdirSync(new URL(".", outFile), { recursive: true });
  fs.writeFileSync(outFile, `# Label jig sweep\n\n${configs.length} configurations, ${failures} problem(s).\n\n${rows.join("\n")}\n`);
  console.log(`done: ${configs.length} configurations, ${failures} problem(s)`);
  process.exitCode = failures ? 1 : 0;
} else {
  await one(args);
}
