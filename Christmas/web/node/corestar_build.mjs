// Christmas star with core, headless: build one configuration and check the print files.
//   - the lamp fits the star (lampProblems), every part builds, its welded mesh is closed, its volume is within 0.5 %
//     of the B-rep's, it stands on z = 0 and is no taller than computed; the 3MF reads back
//   - --assembly: all 30 placed parts pairwise: no overlap, except the barbs' preload behind the core (< 1 mm³ a part)
//   node node/corestar_build.mjs [diameter=550] [slenderness=3] [lamp=e27_p45] [wall=0.9] [fit=0.2] [snap=0.2] [--assembly] [--out dir]
//   (--out writes an STL per part, the 3MF and the fit test)
//   node node/corestar_build.mjs --sweep          -> ../../export/web/corestar_sweep.md (corners of the range, every lamp)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { zipSync, unzipSync, strFromU8 } from "fflate";
import {
  coreEnv, coreTag, coreLayout, lampProblems, minDiameter, partHeights, makeCore, makeSquarePoint, makeTrianglePoint,
  makeLampPlate, makeTopHalf, makeTopSleeve, makeCrown, shortPoint, SNAP_TEST, printPose, transformMesh,
} from "../src/corestar.js";
import { weld, meshStats, threemfEntries, stlBytes } from "../src/paint3mf.js";

const spec = JSON.parse(fs.readFileSync(new URL("../../spec/corestar_params.json", import.meta.url)));
const P = spec.parameters;
const KEYS = Object.keys(P);
export const MESH = { tolerance: 0.01, angularTolerance: 0.1 };
const COUNT = { core: 1, square: 17, triangle: 8, lamp: 1, top: 2, sleeve: 1 };

export function inputsFrom(pairs) {
  const inputs = Object.fromEntries(KEYS.map((k) => [k, P[k].default]));
  for (const pair of pairs) {
    const [k, v] = pair.split("=");
    if (!KEYS.includes(k)) throw new Error(`unknown parameter ${k}`);
    inputs[k] = P[k].type === "choice" ? v : Number(v);
  }
  return inputs;
}

async function one(args) {
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  const inputs = inputsFrom(args.filter((a) => a.includes("=")));
  const env = coreEnv(spec, inputs);
  const tag = `${coreTag(env)}_k${inputs.slenderness}_t${inputs.wall}_g${inputs.fit}_s${inputs.snap}`;
  const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
  const oc = await opencascade({ locateFile: () => wasm });
  R.setOC(oc);
  const t0 = Date.now();
  let cells = ["-", "-", "-"], result = "ok";
  try {
    const bad = [];
    const problems = lampProblems(env);
    if (problems.length) bad.push(`lamp does not fit (${problems.join(", ")}; from ${minDiameter(spec, inputs, inputs.lamp)} mm)`);
    const makers = { core: makeCore, square: makeSquarePoint, triangle: makeTrianglePoint, lamp: makeLampPlate, top: makeTopHalf, sleeve: makeTopSleeve };
    const heights = partHeights(env), solids = {}, meshes = {};
    let grams = 0, tris = 0;
    for (const [part, make] of Object.entries(makers)) {
      const solid = make(R, env);
      solids[part] = solid;
      const m = solid.mesh(MESH), w = transformMesh(weld(m.vertices, m.triangles), printPose(env, part)), st = meshStats(w), vol = R.measureVolume(solid);
      meshes[part] = w;
      tris += st.triangles;
      if (st.open) bad.push(`${part}: ${st.open} open edges`);
      if (Math.abs(st.volume - vol) > 0.005 * vol) bad.push(`${part}: mesh volume ${st.volume.toFixed(1)} vs B-rep ${vol.toFixed(1)}`);
      if (Math.abs(st.bbox[0][2]) > 1e-4) bad.push(`${part}: starts at z ${st.bbox[0][2]}`);
      if (st.bbox[1][2] > heights[part] + 1e-3) bad.push(`${part}: ${st.bbox[1][2].toFixed(3)} tall, expected ${heights[part].toFixed(3)}`);
      grams += (vol / 1000) * 1.25 * COUNT[part];
    }
    const zip = zipSync(threemfEntries({ objects: Object.entries(meshes).map(([name, mesh], i) => ({ mesh, name, offset: [i * 3 * env.a, 0, 0] })) }), { level: 6 });
    const model = strFromU8(unzipSync(zip)["3D/3dmodel.model"]);
    if ((model.match(/<triangle /g) ?? []).length !== tris || (model.match(/<object /g) ?? []).length !== Object.keys(meshes).length) bad.push("3MF does not read back");
    if (args.includes("--assembly")) {
      const vol = (s) => {
        const props = new oc.GProp_GProps();
        oc.BRepGProp.VolumePropertiesGK(s.wrapped, props, 1e-9, false, false, false, false, false);
        const v = props.Mass();
        props.delete();
        return v;
      };
      const place = (solid, m) => {
        const tr = new oc.gp_Trsf();
        tr.SetValues(...m.slice(0, 12));
        const b = new oc.BRepBuilderAPI_Transform(solid.wrapped, tr, true);
        const o = R.cast(b.Shape());
        b.delete(); tr.delete();
        return o;
      };
      const layout = coreLayout(env), placed = layout.map(({ part, m }) => place(solids[part], m));
      const box = placed.map((s) => s.boundingBox.bounds);
      const near = (i, j) => [0, 1, 2].every((c) => box[i][0][c] <= box[j][1][c] && box[j][0][c] <= box[i][1][c]);
      let worst = 0, preload = 0;
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
        if (!near(i, j)) continue;
        const v = vol(placed[i].clone().intersect(placed[j].clone()));
        const snapPair = layout[i].part === "core" && ["square", "triangle", "lamp"].includes(layout[j].part);
        if (snapPair) preload = Math.max(preload, v); else worst = Math.max(worst, v);
      }
      if (worst > 1e-6) bad.push(`assembled parts overlap by up to ${worst.toExponential(2)} mm³`);
      if (preload > 1) bad.push(`a barb preload of ${preload.toFixed(3)} mm³`);
      cells.push(`preload ${preload.toFixed(3)} mm³`);
    }
    cells = [String(tris), Math.round(grams).toString(), Object.entries(heights).map(([p, h]) => `${p} ${h.toFixed(1)}`).join(", "), ...cells.slice(3)];
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      const base = `christmas_core_star_${coreTag(env)}`;
      for (const [part, mesh] of Object.entries(meshes)) fs.writeFileSync(path.join(out, `${base}_${part}.stl`), stlBytes(mesh, `Christmas star with core ${part}`));
      fs.writeFileSync(path.join(out, `${base}.3mf`), zip);
      const write = (name, solid, pose) => {
        const m = solid.mesh(MESH), w = transformMesh(weld(m.vertices, m.triangles), pose), st = meshStats(w);
        if (st.open) bad.push(`${name}: ${st.open} open edges`);
        fs.writeFileSync(path.join(out, `${base}_fit_${name}.stl`), stlBytes(w, `fit test ${name}`));
      };
      write("crown", makeCrown(R, env), printPose(env, "square"));
      SNAP_TEST.forEach((p, i) => write(`square_snap_${p}`, shortPoint(R, env, makeSquarePoint(R, coreEnv(spec, { ...inputs, snap: p })), i + 1), printPose(env, "square")));
      write("triangle", shortPoint(R, env, solids.triangle.clone()), printPose(env, "triangle"));
    }
    if (bad.length) result = bad.join(", ");
  } catch (e) {
    result = `FAILED: ${e.message}`;
  }
  console.log(`| ${tag} | ${cells.join(" | ")} | ${((Date.now() - t0) / 1000).toFixed(1)} | ${result} |`);
}

const args = process.argv.slice(2);
if (args[0] === "--sweep") {
  // every lamp at its smallest star and at the largest, for both ends of the point length; wall and fit at the ends
  const configs = [];
  for (const lamp of P.lamp.options.map(([v]) => v)) for (const k of [P.slenderness.min, P.slenderness.max]) {
    const inputs = { ...inputsFrom([]), lamp, slenderness: k };
    const dmin = minDiameter(spec, inputs, lamp);
    for (const D of [dmin, P.diameter.max]) configs.push([`lamp=${lamp}`, `slenderness=${k}`, `diameter=${D}`]);
  }
  configs.push([`wall=${P.wall.min}`, `fit=${P.fit.max}`, `snap=${P.snap.max}`], [`wall=${P.wall.max}`, `fit=${P.fit.min}`, `snap=${P.snap.min}`],
    ["diameter=400", "lamp=e10_sleeve", "slenderness=2.8", "--assembly"], ["--assembly"]);
  const rows = ["| Config | triangles | g (all parts) | heights mm | build s | result |", "|---|---|---|---|---|---|"];
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
  const outFile = new URL("../../export/web/corestar_sweep.md", import.meta.url);
  fs.mkdirSync(new URL(".", outFile), { recursive: true });
  fs.writeFileSync(outFile, `# Christmas star with core: sweep\n\n${configs.length} configurations, ${failures} problem(s).\n\n${rows.join("\n")}\n`);
  console.log(`done: ${configs.length} configurations, ${failures} problem(s)`);
  process.exitCode = failures ? 1 : 0;
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await one(args);
}
