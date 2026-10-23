// Robustness sweep: build every footprint (x, y in 3..8) at z = 6 plus height extremes, check that every part builds,
// is a single watertight mesh and has a plausible volume. Usage: node node/sweep.mjs  -> ../export/web/sweep.md
// Each configuration runs in its own process (node node/sweep.mjs --one x y z): OpenCascade's WASM heap only grows,
// and many builds in one process eventually run out of memory - which is not what this sweep is testing.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { makeCase } from "../src/case.js";

const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
R.setOC(await opencascade({ locateFile: () => wasm }));
const spec = JSON.parse(fs.readFileSync(new URL("../../spec/case_params.json", import.meta.url)));
const P = spec.parameters;

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

async function one(x, y, z) {
  const t0 = Date.now();
  const cells = [], open = [];
  let result = "ok";
  try {
    const kase = makeCase(R, spec, { x_count: x, y_count: y, z_count: z, window_t: 1.6, window_gap: 0.2 });
    for (const part of ["base", "lid", "latch", "seal", "window"]) {
      const s = kase[part]();
      cells.push((R.measureVolume(s) / 1000).toFixed(2));
      const bad = openEdges(await s.blobSTL({ tolerance: 0.01, angularTolerance: 0.1, binary: true }).arrayBuffer());
      if (bad) open.push(`${part} ${bad}`);
      s.delete();
    }
    if (open.length) result = "OPEN STL";
  } catch (e) {
    result = `FAILED: ${e.message}`;
  }
  while (cells.length < 5) cells.push("-");
  console.log(`| ${x}x${y}x${z} | ${cells.join(" | ")} | ${open.join(", ") || "0"} | ${((Date.now() - t0) / 1000).toFixed(1)} | ${result} |`);
}

if (process.argv[2] === "--one") {
  await one(...process.argv.slice(3, 6).map(Number));
} else {
  const configs = [];
  for (let x = P.x_count.min; x <= P.x_count.max; x++) for (let y = P.y_count.min; y <= P.y_count.max; y++) configs.push([x, y, 6]);
  for (const z of [P.z_count.min, P.z_count.max]) for (const [x, y] of [[3, 3], [8, 8], [5, 4]]) configs.push([x, y, z]);
  const rows = ["| Config | Base cm3 | Lid cm3 | Latch | Seal | Window | open STL edges | build s | result |", "|---|---|---|---|---|---|---|---|---|"];
  let failures = 0;
  for (const [x, y, z] of configs) {
    let line;
    try {
      line = execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--one", x, y, z].map(String), { encoding: "utf8", maxBuffer: 1 << 26 })
        .split("\n").find((l) => l.startsWith("|"));
    } catch (e) {
      line = undefined;
    }
    line ??= `| ${x}x${y}x${z} | - | - | - | - | - | - | - | FAILED: process crashed |`;
    if (!line.endsWith("| ok |")) failures++;
    rows.push(line);
    console.log(line);
  }
  const out = new URL("../../export/web/sweep.md", import.meta.url);
  fs.writeFileSync(out, `# Robustness sweep\n\n${configs.length} configurations, ${failures} problem(s).\n\n${rows.join("\n")}\n`);
  console.log(`done: ${configs.length} configurations, ${failures} problem(s) -> ${fileURLToPath(out)}`);
}
