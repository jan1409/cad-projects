// Gridfinity baseplates headless: build one configuration, check that every piece is a closed mesh, optionally export it.
//   node node/plate_build.mjs <grid|drawer> [key=value ...] [--out <dir>]   -> STL (+ STEP) per unique piece
//      keys are the variant's parameters, e.g. grid x_count=9 y_count=9 bottom=1 bottom_h=4 magnets=1
//                                         or drawer width=500 depth=400 spare_x=left spare_y=center
//   node node/plate_build.mjs --sweep                                         -> ../export/web/plate_sweep.md
// The sweep runs every configuration in its own process (OpenCascade's WASM heap only grows).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { plateEnv, makePiece } from "../src/baseplate.js";

const spec = JSON.parse(fs.readFileSync(new URL("../../spec/baseplate_params.json", import.meta.url)));

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

// "variant key=value ..." -> inputs (defaults from the spec)
function parseInputs(variant, pairs) {
  const P = spec.variants[variant].parameters;
  const inputs = { variant, ...Object.fromEntries(Object.entries(P).map(([k, p]) => [k, p.default])) };
  for (const pair of pairs) {
    const [k, v] = pair.split("=");
    if (!(k in P)) throw new Error(`unknown parameter ${k}`);
    inputs[k] = P[k].type === "bool" ? v === "1" || v === "true" : P[k].type === "choice" ? v : Number(v);
  }
  return inputs;
}
const tagOf = (i) => (i.variant === "drawer" ? `${i.width}x${i.depth}_${i.spare_x}_${i.spare_y}` : `${i.x_count}x${i.y_count}`) +
  (i.bottom ? `_b${i.bottom_h}` : "") + (i.bottom && i.magnets ? "_mag" : "");

async function one(inputs, out) {
  const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
  R.setOC(await opencascade({ locateFile: () => wasm }));
  const t0 = Date.now(), tag = `${inputs.variant}_${tagOf(inputs)}`;
  const vols = [], open = [];
  let result = "ok", env = null;
  try {
    env = plateEnv(spec, inputs);
    for (const u of env.unique) {
      const s = makePiece(R, spec, env, u);
      const bb = s.boundingBox.bounds;
      const size = [0, 1, 2].map((k) => bb[1][k] - bb[0][k]);
      if (Math.abs(size[0] - u.w) > 0.01 || Math.abs(size[1] - u.d) > 0.01 || Math.abs(size[2] - env.H) > 0.01 || Math.abs(bb[0][2]) > 0.01)
        open.push(`${u.id} bbox ${size.map((v) => v.toFixed(2)).join("x")}`);
      vols.push(`${u.id}${u.count > 1 ? `×${u.count}` : ""} ${(R.measureVolume(s) / 1000).toFixed(1)}`);
      const stl = await s.blobSTL({ tolerance: 0.01, angularTolerance: 0.1, binary: true }).arrayBuffer();
      const bad = openEdges(stl);
      if (bad) open.push(`${u.id} ${bad}`);
      if (out) {
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(out, `${tag}_${u.id}.stl`), Buffer.from(stl));
        fs.writeFileSync(path.join(out, `${tag}_${u.id}.step`), Buffer.from(await s.blobSTEP().arrayBuffer()));
      }
      s.delete();
    }
    if (open.length) result = "OPEN STL";
  } catch (e) {
    result = `FAILED: ${e.message}`;
  }
  const layout = env ? `${env.nx}×${env.ny} cells, ${env.W.toFixed(1)}×${env.D.toFixed(1)}×${env.H.toFixed(1)}, ${env.pieces.length} pcs` : "-";
  console.log(`| ${tag} | ${layout} | ${vols.join(", ") || "-"} | ${open.join(", ") || "0"} | ${((Date.now() - t0) / 1000).toFixed(1)} | ${result} |`);
}

const args = process.argv.slice(2);
if (args[0] === "--sweep") {
  const configs = [];
  for (let n = 1; n <= 8; n++) configs.push(["grid", `x_count=${n}`, `y_count=${n}`]);
  configs.push(["grid", "x_count=9", "y_count=9"], ["grid", "x_count=1", "y_count=24"], ["grid", "x_count=3", "y_count=7"]);
  configs.push(["grid", "x_count=24", "y_count=24"], ["grid", "x_count=24", "y_count=24", "bottom=1", "bottom_h=8", "magnets=1"]);
  for (const [bh, mag] of [[3, 1], [8, 0], [4.5, 1]]) for (const n of [1, 5]) configs.push(["grid", `x_count=${n}`, `y_count=${n}`, "bottom=1", `bottom_h=${bh}`, `magnets=${mag}`]);
  for (const sx of ["left", "center", "right"]) for (const sy of ["front", "center", "back"]) configs.push(["drawer", "width=350", "depth=250", `spare_x=${sx}`, `spare_y=${sy}`]);
  configs.push(["drawer", "width=46", "depth=46"], ["drawer", "width=127.3", "depth=85.3"], ["drawer", "width=128.6", "depth=86.6"]);
  configs.push(["drawer", "width=500", "depth=400", "bottom=1", "magnets=1"], ["drawer", "width=600", "depth=380", "spare_x=left", "spare_y=back", "bottom=1", "bottom_h=3"]);
  configs.push(["drawer", "width=1000", "depth=1000"], ["drawer", "width=1000", "depth=1000", "bottom=1", "bottom_h=8", "magnets=1"]);
  const rows = ["| Config | Layout | Volume cm3 per unique piece | open STL edges / bbox | build s | result |", "|---|---|---|---|---|---|"];
  let failures = 0;
  for (const c of configs) {
    let line;
    try {
      line = execFileSync(process.execPath, [fileURLToPath(import.meta.url), ...c], { encoding: "utf8", maxBuffer: 1 << 26 })
        .split("\n").find((l) => l.startsWith("|"));
    } catch {
      line = undefined;
    }
    line ??= `| ${c.join(" ")} | - | - | - | - | FAILED: process crashed |`;
    if (!line.endsWith("| ok |")) failures++;
    rows.push(line);
    console.log(line);
  }
  const outFile = new URL("../../export/web/plate_sweep.md", import.meta.url);
  fs.mkdirSync(new URL(".", outFile), { recursive: true });
  fs.writeFileSync(outFile, `# Baseplate sweep\n\n${configs.length} configurations, ${failures} problem(s).\n\n${rows.join("\n")}\n`);
  console.log(`done: ${configs.length} configurations, ${failures} problem(s) -> ${fileURLToPath(outFile)}`);
  process.exitCode = failures ? 1 : 0;
} else {
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  await one(parseInputs(args[0], args.slice(1).filter((a) => a.includes("="))), out);
}
