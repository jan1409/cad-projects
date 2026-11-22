// Christmas star headless: build one configuration and check the print files.
//   - the lamp fits the star (socketProblems), every part builds, its welded mesh is closed, and its volume is within
//     0.5 % of the B-rep's; every part stands on z = 0 and is no taller than computed; the 3MF reads back
//   - --assembly: all 26 placed parts pairwise without overlap (slow, about 40 s)
//   node node/star_build.mjs [diameter=550] [slenderness=3] [lamp=e27_p45] [wall=0.9] [fit=0.2] [--assembly] [--out dir]
//   (--out writes an STL per part, the 3MF and the fit test's short points)
//   node node/star_build.mjs --sweep          -> ../../export/web/star_sweep.md (corners of the range, every lamp)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { zipSync, unzipSync, strFromU8 } from "fflate";
import { starEnv, starTag, starLayout, socketProblems, minDiameter, partHeights, makeSquarePoint, makeTrianglePoint, makeSocket, makeCarrier, fitTestPiece, printPose, transformMesh } from "../src/star.js";
import { weld, meshStats, threemfEntries, stlBytes } from "../src/paint3mf.js";

const spec = JSON.parse(fs.readFileSync(new URL("../../spec/star_params.json", import.meta.url)));
const P = spec.parameters;
const KEYS = Object.keys(P);
export const MESH = { tolerance: 0.01, angularTolerance: 0.1 };

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
  const env = starEnv(spec, inputs);
  const tag = `${starTag(env)}_k${inputs.slenderness}_t${inputs.wall}_g${inputs.fit}`;
  const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
  const oc = await opencascade({ locateFile: () => wasm });
  R.setOC(oc);
  const t0 = Date.now();
  let cells = ["-", "-", "-"], result = "ok";
  try {
    const bad = [];
    const problems = socketProblems(env);
    if (problems.length) bad.push(`lamp does not fit (${problems.join(", ")}; from ${minDiameter(spec, inputs, inputs.lamp)} mm)`);
    const makers = { square: makeSquarePoint, triangle: makeTrianglePoint, socket: makeSocket, ...(env.seat === "bayonet" ? { carrier: makeCarrier } : {}) };
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
      if (Math.abs(st.bbox[0][2]) > 1e-6) bad.push(`${part}: starts at z ${st.bbox[0][2]}`);
      if (st.bbox[1][2] > heights[part] + 1e-3) bad.push(`${part}: ${st.bbox[1][2].toFixed(3)} tall, expected ${heights[part].toFixed(3)}`);
      grams += (vol / 1000) * 1.25 * { square: 17, triangle: 8, socket: 1, carrier: 1 }[part];
    }
    const zip = zipSync(threemfEntries({ objects: Object.entries(meshes).map(([name, mesh], i) => ({ mesh, name, offset: [i * 2 * env.a, 0, 0] })) }), { level: 6 });
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
      const placed = starLayout(env).map(({ part, m }) => place(solids[part], m));
      const box = placed.map((s) => s.boundingBox.bounds);
      const near = (i, j) => [0, 1, 2].every((c) => box[i][0][c] <= box[j][1][c] && box[j][0][c] <= box[i][1][c]);
      let worst = 0;
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
        if (near(i, j)) worst = Math.max(worst, vol(placed[i].clone().intersect(placed[j].clone())));
      }
      if (worst > 1e-6) bad.push(`assembled parts overlap by up to ${worst.toExponential(2)} mm³`);
    }
    cells = [String(tris), Math.round(grams).toString(), Object.entries(heights).filter(([p]) => meshes[p]).map(([p, h]) => `${p} ${h.toFixed(1)}`).join(", ")];
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      for (const [part, mesh] of Object.entries(meshes)) fs.writeFileSync(path.join(out, `christmas_star_${starTag(env)}_${part}.stl`), stlBytes(mesh, `Christmas star ${part}`));
      fs.writeFileSync(path.join(out, `christmas_star_${starTag(env)}.3mf`), zip);
      for (const part of ["square", "triangle"]) { // the fit test's short points
        const f = fitTestPiece(R, env, solids[part]), m = f.mesh(MESH);
        fs.writeFileSync(path.join(out, `christmas_star_${starTag(env)}_fit_${part}.stl`), stlBytes(weld(m.vertices, m.triangles), `fit test ${part}`));
      }
    }
    if (bad.length) result = bad.join(", ");
  } catch (e) {
    result = `FAILED: ${e.message}`;
  }
  console.log(`| ${tag} | ${cells.join(" | ")} | ${((Date.now() - t0) / 1000).toFixed(1)} | ${result} |`);
}

const args = process.argv.slice(2);
if (args[0] === "--sweep") {
  // corners of diameter x slenderness for every lamp at its smallest star and at the largest, wall and fit at the ends
  const configs = [];
  for (const lamp of P.lamp.options.map(([v]) => v)) for (const k of [P.slenderness.min, P.slenderness.max]) {
    const inputs = { ...inputsFrom([]), lamp, slenderness: k };
    const dmin = minDiameter(spec, inputs, lamp);
    for (const D of [dmin, P.diameter.max]) configs.push([`lamp=${lamp}`, `slenderness=${k}`, `diameter=${D}`]);
  }
  configs.push([`wall=${P.wall.min}`, `fit=${P.fit.max}`], [`wall=${P.wall.max}`, `fit=${P.fit.min}`], ["diameter=380", "lamp=e10_panel", "slenderness=2.8", "--assembly"], ["--assembly"]);
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
  const outFile = new URL("../../export/web/star_sweep.md", import.meta.url);
  fs.mkdirSync(new URL(".", outFile), { recursive: true });
  fs.writeFileSync(outFile, `# Christmas star sweep\n\n${configs.length} configurations, ${failures} problem(s).\n\n${rows.join("\n")}\n`);
  console.log(`done: ${configs.length} configurations, ${failures} problem(s)`);
  process.exitCode = failures ? 1 : 0;
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await one(args);
}
