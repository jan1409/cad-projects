// Christmas tree headless: build one configuration and check the print files.
//   - the B-rep builds, the welded mesh is closed, and its volume is within 0.5 % of the B-rep's
//   - after splitting at the band planes the mesh is still closed, has the same volume, and no triangle crosses a plane
//   - with bands, triangles are painted; every 3MF flavour unzips, and its triangles and paint codes read back
//   node node/tree_build.mjs [height=120] [fins=20] [fin_t=2] [angle=30] [bands=1] [band_share=27] [--out dir]
//   node node/tree_build.mjs --sweep          -> ../../export/web/tree_sweep.md (corners and edges of the spec range)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { zipSync, unzipSync, strFromU8 } from "fflate";
import { treeEnv, makeTree, treeTag } from "../src/tree.js";
import { weld, splitAtZ, statesByZ, meshStats, threemfEntries, stlBytes, FLAVOURS } from "../src/paint3mf.js";

const spec = JSON.parse(fs.readFileSync(new URL("../../spec/tree_params.json", import.meta.url)));
const P = spec.parameters;
const GEOMETRY = ["height", "fins", "fin_t", "angle", "bands", "band_share"];
export const MESH = { tolerance: 0.01, angularTolerance: 0.1 };

export function inputsFrom(pairs) {
  const inputs = Object.fromEntries(GEOMETRY.map((k) => [k, P[k].default]));
  for (const pair of pairs) {
    const [k, v] = pair.split("=");
    if (!GEOMETRY.includes(k)) throw new Error(`unknown parameter ${k}`);
    inputs[k] = P[k].type === "bool" ? v === "1" || v === "true" : Number(v);
  }
  return inputs;
}

// the print mesh of a tree: welded, split at the band planes, painted
export function treeMesh(R, env) {
  const tree = makeTree(R, env);
  const m = tree.mesh(MESH), volume = R.measureVolume(tree);
  tree.delete();
  const welded = weld(m.vertices, m.triangles);
  const zs = env.bands.flat().filter((z) => z > 1e-9);
  const split = splitAtZ(welded, zs);
  return { welded, split, zs, states: statesByZ(split, env.bands), brepVolume: volume };
}

async function one(args) {
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  const inputs = inputsFrom(args.filter((a) => a.includes("=")));
  const env = treeEnv(spec, inputs);
  const tag = `${treeTag(env)}_t${inputs.fin_t}_a${inputs.angle}` + (inputs.bands ? `_b${inputs.band_share}` : "_nobands");
  const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
  R.setOC(await opencascade({ locateFile: () => wasm }));
  const t0 = Date.now();
  let cells = ["-", "-", "-", "-"], result = "ok";
  try {
    const { welded, split, zs, states, brepVolume } = treeMesh(R, env);
    const a = meshStats(welded), b = meshStats(split, zs);
    const painted = states.reduce((n, s) => n + (s ? 1 : 0), 0);
    const [lo, hi] = b.bbox;
    cells = [String(b.triangles), String(painted), (brepVolume / 1000).toFixed(3),
      `${(hi[0] - lo[0]).toFixed(2)} × ${(hi[1] - lo[1]).toFixed(2)} × ${(hi[2] - lo[2]).toFixed(2)}`];
    const bad = [];
    if (a.open) bad.push(`${a.open} open edges before the split`);
    if (b.open) bad.push(`${b.open} open edges after the split`);
    if (b.crossing) bad.push(`${b.crossing} triangles cross a band plane`);
    if (Math.abs(b.volume - a.volume) > 1e-6 * a.volume) bad.push(`split changed the volume ${a.volume} -> ${b.volume}`);
    if (Math.abs(a.volume - brepVolume) > 0.005 * brepVolume) bad.push(`mesh volume ${a.volume.toFixed(1)} vs B-rep ${brepVolume.toFixed(1)}`);
    if (Math.abs(lo[2]) > 1e-6 || Math.abs(hi[2] - env.H) > 1e-6) bad.push(`z range ${lo[2]}..${hi[2]}`);
    if (inputs.bands && !painted) bad.push("no painted triangles");
    if (!inputs.bands && painted) bad.push("painted without bands");
    const files = {};
    for (const flavour of Object.keys(FLAVOURS)) {
      const zip = zipSync(threemfEntries({ mesh: split, states, name: "Christmas tree", flavour }), { level: 6 });
      files[flavour] = zip;
      const model = strFromU8(unzipSync(zip)["3D/3dmodel.model"]);
      const tris = (model.match(/<triangle /g) ?? []).length;
      for (const attr of FLAVOURS[flavour].attrs) {
        const codes = (model.match(new RegExp(` ${attr}="8"`, "g")) ?? []).length;
        if (tris !== b.triangles || codes !== painted) bad.push(`${flavour} 3MF reads back ${tris} triangles, ${codes} ${attr}`);
      }
    }
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      const base = path.join(out, `christmas_tree_${tag}`);
      fs.writeFileSync(`${base}.stl`, stlBytes(welded, `Christmas tree ${tag}`));
      for (const [flavour, zip] of Object.entries(files)) fs.writeFileSync(`${base}_${flavour}.3mf`, zip);
    }
    if (bad.length) result = bad.join(", ");
  } catch (e) {
    result = `FAILED: ${e.message}`;
  }
  console.log(`| ${tag} | ${cells.join(" | ")} | ${((Date.now() - t0) / 1000).toFixed(1)} | ${result} |`);
}

const args = process.argv.slice(2);
if (args[0] === "--sweep") {
  // every corner of height x fins x fin_t x angle, then the edges of the paint range
  const configs = [];
  for (const h of [P.height.min, P.height.max]) for (const n of [P.fins.min, P.fins.max]) for (const t of [P.fin_t.min, P.fin_t.max])
    for (const a of [P.angle.min, P.angle.max]) configs.push([`height=${h}`, `fins=${n}`, `fin_t=${t}`, `angle=${a}`]);
  configs.push([], ["band_share=10"], ["band_share=60"], ["band_share=60", "angle=60", "height=50"], ["bands=0"], ["height=85", "fins=14", "fin_t=1.6", "angle=45"],
    ["height=200", "fins=32", "fin_t=3", "angle=15"], ["height=55", "fins=8", "angle=5"]);
  const rows = ["| Config | triangles | painted | cm³ | bbox mm | build s | result |", "|---|---|---|---|---|---|---|"];
  let failures = 0;
  for (const c of configs) {
    let line;
    try {
      line = execFileSync(process.execPath, [fileURLToPath(import.meta.url), ...c], { encoding: "utf8", maxBuffer: 1 << 26 }).split("\n").find((l) => l.startsWith("|"));
    } catch {
      line = undefined;
    }
    line ??= `| ${c.join(" ")} | - | - | - | - | - | FAILED: process crashed |`;
    if (!line.endsWith("| ok |")) failures++;
    rows.push(line);
    console.log(line);
  }
  const outFile = new URL("../../export/web/tree_sweep.md", import.meta.url);
  fs.mkdirSync(new URL(".", outFile), { recursive: true });
  fs.writeFileSync(outFile, `# Christmas tree sweep\n\n${configs.length} configurations, ${failures} problem(s).\n\n${rows.join("\n")}\n`);
  console.log(`done: ${configs.length} configurations, ${failures} problem(s)`);
  process.exitCode = failures ? 1 : 0;
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await one(args);
}
