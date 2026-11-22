// Plug-together star headless: build one configuration and check the print files.
//   - the star can be built (plugProblems), every part builds, its welded mesh is closed and its volume within 0.5 % of
//     the B-rep's; every part lies on z = 0 as computed (a point on its side face, the connector flat); the painted 3MF
//     reads back with one object per point and the paint of each point's filament
//   node node/plugstar_build.mjs [diameter=200] [points=5] [tip_angle=40] [depth=22] [fit=0.2] [hanger=1] [--out dir]
//   (--out writes an STL per part, the painted 3MF and the fit test: the connector and a short point per fit)
//   node node/plugstar_build.mjs --sweep     -> ../../export/web/plugstar_sweep.md (corners of the range)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { zipSync, unzipSync, strFromU8 } from "fflate";
import { plugEnv, plugTag, plugProblems, minDiameter, makePoint, makeConnector, fitTestPiece, printPose, pointPrintSize, transformMesh, defaultAssign, plateObjects, meshBox, fitOptions } from "../src/plugstar.js";
import { weld, meshStats, threemfEntries, stlBytes, paintCode } from "../src/paint3mf.js";

const spec = JSON.parse(fs.readFileSync(new URL("../../spec/plugstar_params.json", import.meta.url)));
const P = spec.parameters;
const KEYS = Object.keys(P).filter((k) => k !== "slicer");
export const MESH = { tolerance: 0.01, angularTolerance: 0.1 };

export function inputsFrom(pairs) {
  const inputs = Object.fromEntries(KEYS.map((k) => [k, P[k].default]));
  for (const pair of pairs) {
    const [k, v] = pair.split("=");
    if (!KEYS.includes(k)) throw new Error(`unknown parameter ${k}`);
    inputs[k] = P[k].type === "bool" ? v === "1" || v === "true" : P[k].type === "choice" && typeof P[k].default === "string" ? v : Number(v);
    if (P[k].type === "choice" && !P[k].options.some(([o]) => o === inputs[k])) throw new Error(`${k}=${v} is not one of ${P[k].options.map(([o]) => o)}`);
  }
  return inputs;
}

async function one(args) {
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  const inputs = inputsFrom(args.filter((a) => a.includes("=")));
  const env = plugEnv(spec, inputs);
  const tag = `${plugTag(env)}_a${inputs.tip_angle}_d${inputs.depth}_g${inputs.fit}${env.hanger ? "" : "_nohang"}`;
  const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
  const oc = await opencascade({ locateFile: () => wasm });
  R.setOC(oc);
  const t0 = Date.now();
  let cells = ["-", "-", "-"], result = "ok";
  try {
    const bad = [];
    const problems = plugProblems(env);
    if (problems.length) bad.push(`cannot be built (${problems.join(", ")}; from ${minDiameter(spec, inputs)} mm)`);
    const solids = { point: makePoint(R, env, false), connector: makeConnector(R, env) };
    if (env.hanger) solids.point_hang = makePoint(R, env, true);
    // the fit test's short points, one per fit, each with its own fit's pose
    const fits = fitOptions(spec).map((fit) => {
      const e = plugEnv(spec, { ...inputs, fit });
      return { fit, env: e, solid: fitTestPiece(R, e, makePoint(R, e, false)) };
    });
    const meshes = {}, size = pointPrintSize(env);
    let grams = 0;
    const all = [...Object.entries(solids).map(([part, solid]) => [part, solid, env]), ...fits.map((f) => [`fit_${f.fit.toFixed(2)}`, f.solid, f.env])];
    for (const [part, solid, penv] of all) {
      const m = solid.mesh(MESH), w = transformMesh(weld(m.vertices, m.triangles), printPose(penv, part.startsWith("fit") ? "point" : part));
      const st = meshStats(w), vol = R.measureVolume(solid);
      meshes[part] = w;
      if (st.open) bad.push(`${part}: ${st.open} open edges`);
      if (Math.abs(st.volume - vol) > 0.005 * vol) bad.push(`${part}: mesh volume ${st.volume.toFixed(1)} vs B-rep ${vol.toFixed(1)}`);
      if (Math.abs(st.bbox[0][2]) > 1e-6) bad.push(`${part}: starts at z ${st.bbox[0][2]}`);
      const h = part === "connector" ? env.tk : part.startsWith("fit") ? null : size[2];
      if (h !== null && st.bbox[1][2] > h + 1e-3) bad.push(`${part}: ${st.bbox[1][2].toFixed(3)} tall, expected ${h.toFixed(3)}`);
      if (!part.startsWith("fit")) grams += (vol / 1000) * 1.24 * (part === "point" ? (env.hanger ? env.N - 1 : env.N) : 1);
    }
    // the painted 3MF as the page writes it: every point, the connector
    const assign = defaultAssign(env.N);
    const items = assign.map((slot, k) => ({ mesh: k === 0 && env.hanger ? meshes.point_hang : meshes.point, slot, name: `point ${k + 1}` }));
    items.push({ mesh: meshes.connector, slot: 1, name: "connector" });
    const objects = plateObjects(items);
    const zip = zipSync(threemfEntries({ objects, flavour: "prusa" }), { level: 6 });
    const model = strFromU8(unzipSync(zip)["3D/3dmodel.model"]);
    const tris = items.reduce((s, { mesh }) => s + mesh.tri.length / 3, 0);
    const painted = items.reduce((s, { mesh, slot }) => s + (slot > 1 ? mesh.tri.length / 3 : 0), 0);
    if ((model.match(/<triangle /g) ?? []).length !== tris || (model.match(/<object /g) ?? []).length !== items.length) bad.push("3MF does not read back");
    const codes = [...model.matchAll(/slic3rpe:mmu_segmentation="([0-9A-F]+)"/g)].length;
    if (codes !== painted) bad.push(`3MF: ${codes} painted triangles, expected ${painted}`);
    for (const slot of new Set(assign)) if (slot > 1 && !model.includes(`paint_color="${paintCode(slot)}"`)) bad.push(`3MF: no paint for filament ${slot}`);
    // parts placed on the bed without overlapping (footprints)
    const fps = objects.map((o) => meshBox(o.mesh)).map(([lo, hi], i) => [lo[0] + objects[i].offset[0], lo[1] + objects[i].offset[1], hi[0] + objects[i].offset[0], hi[1] + objects[i].offset[1]]);
    for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) {
      const [a, b] = [fps[i], fps[j]];
      if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) bad.push(`3MF: parts ${i} and ${j} overlap on the bed`);
    }
    cells = [`${size.map((v) => v.toFixed(1)).join(" × ")}`, Math.round(grams).toString(), `${tris} (${painted} painted)`];
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      const base = `plug_star_${plugTag(env)}`;
      for (const part of ["point", "point_hang", "connector"]) if (meshes[part]) fs.writeFileSync(path.join(out, `${base}_${part}.stl`), stlBytes(meshes[part], `plug star ${part}`));
      for (const f of fits) fs.writeFileSync(path.join(out, `${base}_fit_point_${f.fit.toFixed(2)}.stl`), stlBytes(meshes[`fit_${f.fit.toFixed(2)}`], `plug star fit test point, fit ${f.fit}`));
      fs.writeFileSync(path.join(out, `${base}_prusa.3mf`), zip);
      fs.writeFileSync(path.join(out, `${base}_bambu.3mf`), zipSync(threemfEntries({ objects, flavour: "bambu" }), { level: 6 }));
      const fit = plateObjects([{ mesh: meshes.connector, slot: 1, name: "connector" }, ...fits.map((f, i) => ({ mesh: meshes[`fit_${f.fit.toFixed(2)}`], slot: i + 2, name: `short point fit ${f.fit.toFixed(2)}` }))]);
      fs.writeFileSync(path.join(out, `${base}_fit_test_bambu.3mf`), zipSync(threemfEntries({ objects: fit, flavour: "bambu" }), { level: 6 }));
    }
    if (bad.length) result = bad.join(", ");
  } catch (e) {
    result = `FAILED: ${e.message}`;
  }
  console.log(`| ${tag} | ${cells.join(" | ")} | ${((Date.now() - t0) / 1000).toFixed(1)} | ${result} |`);
}

const args = process.argv.slice(2);
if (args[0] === "--sweep") {
  // the corners of points × tip angle × thickness at the smallest buildable and the largest diameter, fit at its ends
  const configs = [];
  for (const points of [P.points.min, P.points.max]) for (const tip_angle of [P.tip_angle.min, P.tip_angle.max]) for (const depth of [P.depth.min, P.depth.max]) {
    const inputs = { ...inputsFrom([]), points, tip_angle, depth };
    const dmin = minDiameter(spec, inputs);
    for (const D of [dmin, P.diameter.max]) if (D) configs.push([`points=${points}`, `tip_angle=${tip_angle}`, `depth=${depth}`, `diameter=${D}`]);
  }
  for (const [fit] of P.fit.options) configs.push([`fit=${fit}`, `diameter=${P.diameter.min}`]);
  configs.push([`fit=${P.fit.options.at(-1)[0]}`, "hanger=0"]);
  const rows = ["| Config | point as printed mm | g (all parts) | triangles | build s | result |", "|---|---|---|---|---|---|"];
  let failures = 0;
  for (const c of configs) {
    let line;
    try {
      line = execFileSync(process.execPath, [fileURLToPath(import.meta.url), ...c], { encoding: "utf8", maxBuffer: 1 << 26 }).split("\n").find((l) => l.startsWith("|"));
    } catch {
      line = undefined;
    }
    line ??= `| ${c.join(" ")} | - | - | - | - | FAILED: process crashed |`;
    if (!line.endsWith("| ok |")) failures++;
    rows.push(line);
    console.log(line);
  }
  const outFile = new URL("../../export/web/plugstar_sweep.md", import.meta.url);
  fs.mkdirSync(new URL(".", outFile), { recursive: true });
  fs.writeFileSync(outFile, `# Plug-together star sweep\n\n${configs.length} configurations, ${failures} problem(s).\n\n${rows.join("\n")}\n`);
  console.log(`done: ${configs.length} configurations, ${failures} problem(s)`);
  process.exitCode = failures ? 1 : 0;
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await one(args);
}
