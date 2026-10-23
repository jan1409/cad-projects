// Gridfinity boxes headless: build one configuration, check that every part is a closed mesh, optionally export it.
//   node node/bin_build.mjs <standard|label> <x> <y> <z> [--no-magnets] [--out <dir>]   -> STL per part (+ box STEP)
//   node node/bin_build.mjs --sweep                                                     -> ../export/web/bin_sweep.md
// The sweep runs every configuration in its own process (OpenCascade's WASM heap only grows).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { makeBin, plateToPrint } from "../src/bin.js";

const spec = JSON.parse(fs.readFileSync(new URL("../../spec/bin_params.json", import.meta.url)));

function openEdges(buf) { // binary STL -> number of edges not shared by exactly two triangles (vertices welded at 1 um)
  const dv = new DataView(buf), n = dv.getUint32(80, true), count = new Map();
  const key = (o) => [0, 4, 8].map((d) => Math.round(dv.getFloat32(o + d, true) * 1000)).join(",");
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12, v = [key(o), key(o + 12), key(o + 24)];
    for (const [a, b] of [[v[0], v[1]], [v[1], v[2]], [v[2], v[0]]]) {
      const k = a < b ? a + "|" + b : b + "|" + a;
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  let bad = 0;
  for (const c of count.values()) if (c !== 2) bad++;
  return bad;
}

async function one(variant, x, y, z, { magnets = true, out = null } = {}) {
  const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
  R.setOC(await opencascade({ locateFile: () => wasm }));
  const t0 = Date.now(), tag = `${variant}_${x}x${y}x${z}${magnets ? "" : "_nomag"}`;
  const cells = [], open = [];
  let result = "ok";
  try {
    const bin = makeBin(R, spec, { variant, x_count: x, y_count: y, z_count: z, magnets });
    const parts = [["box", bin.box()]];
    if (bin.plate) parts.push(["plate", plateToPrint(bin.plate(), bin.env)]);
    for (const [name, s] of parts) {
      cells.push((R.measureVolume(s) / 1000).toFixed(2));
      const stl = await s.blobSTL({ tolerance: 0.01, angularTolerance: 0.1, binary: true }).arrayBuffer();
      const bad = openEdges(stl);
      if (bad) open.push(`${name} ${bad}`);
      if (out) {
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(out, `${tag}_${name}.stl`), Buffer.from(stl));
        if (name === "box") fs.writeFileSync(path.join(out, `${tag}_box.step`), Buffer.from(await s.blobSTEP().arrayBuffer()));
      }
      s.delete();
    }
    if (open.length) result = "OPEN STL";
  } catch (e) {
    result = `FAILED: ${e.message}`;
  }
  while (cells.length < 2) cells.push("-");
  console.log(`| ${tag} | ${cells.join(" | ")} | ${open.join(", ") || "0"} | ${((Date.now() - t0) / 1000).toFixed(1)} | ${result} |`);
}

const args = process.argv.slice(2);
if (args[0] === "--sweep") {
  const configs = [];
  for (const variant of ["standard", "label"]) {
    const P = spec.variants[variant].parameters;
    for (let n = P.x_count.min; n <= P.x_count.max; n++) configs.push([variant, n, n, 6]); // square footprints
    for (const [x, y] of [[1, 10], [10, 1], [3, 7]]) configs.push([variant, x, y, 6]);
    for (const zz of [P.z_count.min, P.z_count.min + 1, 4, 5, P.z_count.max]) for (const [x, y] of [[1, 1], [10, 10]]) configs.push([variant, x, y, zz]);
  }
  const rows = ["| Config | Box cm3 | Plate cm3 | open STL edges | build s | result |", "|---|---|---|---|---|---|"];
  let failures = 0;
  for (const c of configs) {
    let line;
    try {
      line = execFileSync(process.execPath, [fileURLToPath(import.meta.url), ...c.map(String)], { encoding: "utf8", maxBuffer: 1 << 26 })
        .split("\n").find((l) => l.startsWith("|"));
    } catch {
      line = undefined;
    }
    line ??= `| ${c.join("_")} | - | - | - | - | FAILED: process crashed |`;
    if (!line.endsWith("| ok |")) failures++;
    rows.push(line);
    console.log(line);
  }
  const outFile = new URL("../../export/web/bin_sweep.md", import.meta.url);
  fs.mkdirSync(new URL(".", outFile), { recursive: true });
  fs.writeFileSync(outFile, `# Box sweep\n\n${configs.length} configurations, ${failures} problem(s).\n\n${rows.join("\n")}\n`);
  console.log(`done: ${configs.length} configurations, ${failures} problem(s) -> ${fileURLToPath(outFile)}`);
  process.exitCode = failures ? 1 : 0;
} else {
  const [variant, x, y, z] = args;
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  await one(variant, Number(x), Number(y), Number(z), { magnets: !args.includes("--no-magnets"), out });
}
