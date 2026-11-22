// Christmas tree headless: build one configuration and check the print files.
//   - the B-rep builds, the welded mesh is closed, and its volume is within 0.5 % of the B-rep's
//   - after splitting at the band planes the mesh is still closed, has the same volume, and no triangle crosses a plane
//   - with bands, triangles are painted; every 3MF flavour unzips, and its objects, triangles and paint codes read back
//   - top=star: the star is closed; on its tab it does not touch the tree, and with no fit the tab touches the slot
//     (the check can see contact); the wall around the slot is at least shape.star.wall; the tab lies inside fin 0
//   node node/tree_build.mjs [height=120] [fins=20] [fin_t=2] [angle=30] [bands=1] [band_share=27] [top=flat|sharp|star]
//                            [star_share=25] [star_filament=3] [--out dir]
//   node node/tree_build.mjs --sweep          -> ../../export/web/tree_sweep.md (corners and edges of the spec range)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { zipSync, unzipSync, strFromU8 } from "fflate";
import { treeEnv, makeTree, makeStar, starPose, starOutline, starOffset, treeTag } from "../src/tree.js";
import { weld, splitAtZ, statesByZ, meshStats, threemfEntries, stlBytes, paintCode, FLAVOURS } from "../src/paint3mf.js";

const spec = JSON.parse(fs.readFileSync(new URL("../../spec/tree_params.json", import.meta.url)));
const P = spec.parameters;
const INPUTS = Object.keys(P).filter((k) => k !== "slicer");
export const MESH = { tolerance: 0.01, angularTolerance: 0.1 };

export function inputsFrom(pairs) {
  const inputs = Object.fromEntries(INPUTS.map((k) => [k, P[k].default]));
  for (const pair of pairs) {
    const [k, v] = pair.split("=");
    if (!INPUTS.includes(k)) throw new Error(`unknown parameter ${k}`);
    inputs[k] = P[k].type === "bool" ? v === "1" || v === "true" : P[k].type === "choice" ? v : Number(v);
  }
  return inputs;
}

// the print meshes: the tree welded, split at the band planes and painted; the star (top=star) welded, lying flat,
// painted whole in its filament (filament 1 = no paint)
export function treeMesh(R, env) {
  const tree = makeTree(R, env);
  const m = tree.mesh(MESH), volume = R.measureVolume(tree);
  tree.delete();
  const welded = weld(m.vertices, m.triangles);
  const zs = env.bands.flat().filter((z) => z > 1e-9);
  const split = splitAtZ(welded, zs);
  const out = { welded, split, zs, states: statesByZ(split, env.bands), brepVolume: volume };
  if (env.star) {
    const star = makeStar(R, env), sm = star.mesh(MESH);
    out.star = { mesh: weld(sm.vertices, sm.triangles), brepVolume: R.measureVolume(star) };
    star.delete();
    const n = out.star.mesh.tri.length / 3;
    out.star.states = env.star.filament > 1 ? new Uint8Array(n).fill(env.star.filament) : null;
  }
  return out;
}

// the objects of the 3MF (tree, and the star beside it)
export function threemfObjects(meshes, env, names = { tree: "Christmas tree", star: "Star" }) {
  const objects = [{ mesh: meshes.split, states: env.bands.length ? meshes.states : null, name: names.tree }];
  if (meshes.star) objects.push({ mesh: meshes.star.mesh, states: meshes.star.states, name: names.star, offset: starOffset(env) });
  return objects;
}

// smallest wall between the slot (above the notch: its sides and its top) and the star's outline, in the star's plane
function slotWall(S) {
  const outline = starOutline(S), half = S.wt / 2 + S.fit, notch = -S.q * S.Rs, top = notch + S.sd;
  const dist = ([x, y]) => Math.min(...outline.map(([ax, ay], i) => {
    const [bx, by] = outline[(i + 1) % outline.length], dx = bx - ax, dy = by - ay;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - ax - u * dx, y - ay - u * dy);
  }));
  const pts = [];
  for (let i = 0; i <= 200; i++) {
    const y = notch + ((top - notch) * i) / 200, x = -half + (2 * half * i) / 200;
    pts.push([half, y], [-half, y], [x, top]);
  }
  return Math.min(...pts.map(dist));
}

// star checks: clearance on the tab, contact without fit, wall around the slot, tab inside fin 0
function starChecks(R, env) {
  const bad = [], S = env.star, v = (s) => R.measureVolume(s);
  const tree = makeTree(R, env), placed = starPose(makeStar(R, env), env);
  const clash = v(tree.clone().intersect(placed.clone()));
  if (clash > 1e-6) bad.push(`star on the tab hits the tree (${clash.toExponential(1)} mm³)`);
  const env0 = treeEnv({ ...spec, shape: { ...spec.shape, star: { ...spec.shape.star, fit: 0 } } }, env);
  const tree0 = makeTree(R, env0).translate(0.02, 0, 0), placed0 = starPose(makeStar(R, env0), env0);
  if (v(tree0.intersect(placed0)) < 1e-4) bad.push("without fit the tab does not touch the slot");
  const wall = slotWall(S);
  if (wall < spec.shape.star.wall - 1e-6) bad.push(`wall around the slot ${wall.toFixed(2)} mm`);
  if ((S.st - env.t - 2 * S.fit) / 2 < spec.shape.star.wall - 1e-6) bad.push("star too thin for the slot");
  // everything the tab adds to the flat tree lies above H (no ears on the fins)
  const flat = makeTree(R, { ...env, star: null });
  const added = tree.clone().cut(flat), below = R.makeBox([-env.Rb - 1, -env.Rb - 1, -1], [env.Rb + 1, env.Rb + 1, env.H - 1e-6]);
  const outside = v(added.intersect(below));
  if (outside > 1e-6) bad.push(`tab sticks out of the tree below H (${outside.toFixed(3)} mm³)`);
  return { bad, wall, clash };
}

async function one(args) {
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  const inputs = inputsFrom(args.filter((a) => a.includes("=")));
  const env = treeEnv(spec, inputs);
  const tag = `${treeTag(env)}_t${inputs.fin_t}_a${inputs.angle}` + (inputs.bands ? `_b${inputs.band_share}` : "_nobands") +
    (env.star ? `_s${inputs.star_share}_f${env.star.filament}` : "");
  const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
  R.setOC(await opencascade({ locateFile: () => wasm }));
  const t0 = Date.now();
  let cells = ["-", "-", "-", "-", "-"], result = "ok";
  try {
    const meshes = treeMesh(R, env), { welded, split, zs, states, brepVolume } = meshes;
    const a = meshStats(welded), b = meshStats(split, zs);
    const painted = states.reduce((n, s) => n + (s ? 1 : 0), 0);
    const [lo, hi] = b.bbox;
    cells = [String(b.triangles), String(painted), (brepVolume / 1000).toFixed(3),
      `${(hi[0] - lo[0]).toFixed(2)} × ${(hi[1] - lo[1]).toFixed(2)} × ${(hi[2] - lo[2]).toFixed(2)}`, "-"];
    const bad = [];
    if (a.open) bad.push(`${a.open} open edges before the split`);
    if (b.open) bad.push(`${b.open} open edges after the split`);
    if (b.crossing) bad.push(`${b.crossing} triangles cross a band plane`);
    if (Math.abs(b.volume - a.volume) > 1e-6 * a.volume) bad.push(`split changed the volume ${a.volume} -> ${b.volume}`);
    if (Math.abs(a.volume - brepVolume) > 0.005 * brepVolume) bad.push(`mesh volume ${a.volume.toFixed(1)} vs B-rep ${brepVolume.toFixed(1)}`);
    if (Math.abs(lo[2]) > 1e-6 || Math.abs(hi[2] - env.printHeight) > 1e-4) bad.push(`z range ${lo[2]}..${hi[2]}`);
    if (inputs.bands && !painted) bad.push("no painted triangles");
    if (!inputs.bands && painted) bad.push("painted without bands");
    if (meshes.star) {
      const s = meshStats(meshes.star.mesh), S = env.star;
      if (s.open) bad.push(`star: ${s.open} open edges`);
      if (Math.abs(s.volume - meshes.star.brepVolume) > 0.005 * meshes.star.brepVolume) bad.push("star mesh volume");
      if (Math.abs(s.bbox[0][2]) > 1e-6 || Math.abs(s.bbox[1][2] - S.st) > 1e-4) bad.push(`star z range ${s.bbox[0][2]}..${s.bbox[1][2]}`);
      const c = starChecks(R, env);
      bad.push(...c.bad);
      cells[4] = `Ø${S.Ds.toFixed(1)} × ${S.st.toFixed(1)}, wall ${c.wall.toFixed(2)}`;
    }
    const files = {}, objects = threemfObjects(meshes, env);
    for (const flavour of Object.keys(FLAVOURS)) {
      const zip = zipSync(threemfEntries({ objects, flavour }), { level: 6 });
      files[flavour] = zip;
      const model = strFromU8(unzipSync(zip)["3D/3dmodel.model"]);
      const tris = (model.match(/<triangle /g) ?? []).length, objs = (model.match(/<object /g) ?? []).length;
      const starTris = meshes.star ? meshes.star.mesh.tri.length / 3 : 0;
      const starCode = meshes.star?.states ? paintCode(env.star.filament) : null;
      if (objs !== objects.length) bad.push(`${flavour} 3MF has ${objs} objects`);
      if (tris !== b.triangles + starTris) bad.push(`${flavour} 3MF reads back ${tris} triangles`);
      for (const attr of FLAVOURS[flavour].attrs) {
        const codes = (model.match(new RegExp(` ${attr}="8"`, "g")) ?? []).length;
        const want = (env.bands.length ? painted : 0) + (starCode === "8" ? starTris : 0);
        if (codes !== want) bad.push(`${flavour} 3MF: ${codes} ${attr}="8", expected ${want}`);
        if (starCode && starCode !== "8" && (model.match(new RegExp(` ${attr}="${starCode}"`, "g")) ?? []).length !== starTris)
          bad.push(`${flavour} 3MF: star not painted ${starCode}`);
      }
    }
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      const base = path.join(out, `christmas_tree_${tag}`);
      fs.writeFileSync(`${base}.stl`, stlBytes(welded, `Christmas tree ${tag}`));
      if (meshes.star) fs.writeFileSync(`${base}_topper.stl`, stlBytes(meshes.star.mesh, `Star ${tag}`));
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
  // every corner of height x fins x fin_t x angle for each top, then the edges of the paint and star range
  const configs = [];
  for (const top of P.top.options.map(([o]) => o))
    for (const h of [P.height.min, P.height.max]) for (const n of [P.fins.min, P.fins.max]) for (const t of [P.fin_t.min, P.fin_t.max])
      for (const a of [P.angle.min, P.angle.max]) configs.push([`height=${h}`, `fins=${n}`, `fin_t=${t}`, `angle=${a}`, `top=${top}`]);
  configs.push([], ["band_share=10"], ["band_share=60"], ["band_share=60", "angle=60", "height=50"], ["bands=0"], ["height=85", "fins=14", "fin_t=1.6", "angle=45"],
    ["height=200", "fins=32", "fin_t=3", "angle=15"], ["height=55", "fins=8", "angle=5"]);
  for (const h of [P.height.min, 120, P.height.max]) for (const sh of [P.star_share.min, P.star_share.max])
    for (const t of [P.fin_t.min, P.fin_t.max]) configs.push([`height=${h}`, `star_share=${sh}`, `fin_t=${t}`, "top=star"]);
  configs.push(["top=star", "star_filament=1"], ["top=star", "star_filament=2"], ["top=star", "bands=0"], ["top=sharp", "bands=0"]);
  const rows = ["| Config | triangles | painted | cm³ | bbox mm | star | build s | result |", "|---|---|---|---|---|---|---|---|"];
  let failures = 0;
  for (const c of configs) {
    let line;
    try {
      line = execFileSync(process.execPath, [fileURLToPath(import.meta.url), ...c], { encoding: "utf8", maxBuffer: 1 << 26 }).split("\n").find((l) => l.startsWith("|"));
    } catch {
      line = undefined;
    }
    line ??= `| ${c.join(" ")} | - | - | - | - | - | - | FAILED: process crashed |`;
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
