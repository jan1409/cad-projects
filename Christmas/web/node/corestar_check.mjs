// Compare the JS parts of the core star (src/corestar.js) with the SolidCraft master
// (Christmas/solidcraft/christmas_star_core.sc) over a parameter sweep: solidcraft-cli rebuilds the .sc headless with
// each set of values and exports its seven part bodies (core, square and triangle point, E27 and E10 lamp plate, top
// point half, top sleeve) to a STEP. Each is compared with its replicad twin by exact B-rep booleans (both
// differences must vanish), volume and bounding box.
// Local only (needs SolidCraft; CI has none). Each set runs in its own process (the WASM heap only grows).
//   node node/corestar_check.mjs [--one <set>]   -> ../../export/web/corestar_check.md, references in ../../export/ref/corestar
//   SOLIDCRAFT_CLI overrides the path of solidcraft-cli.exe
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { coreEnv, makeCore, makeSquarePoint, makeTrianglePoint, makeLampPlate, makeTopHalf, makeTopSleeve } from "../src/corestar.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const CLI = process.env.SOLIDCRAFT_CLI ?? "C:/Program Files/SolidCraft/solidcraft-cli.exe";
const SC = path.join(root, "solidcraft/christmas_star_core.sc");
const REF = path.join(root, "export/ref/corestar");
const spec = JSON.parse(fs.readFileSync(path.join(root, "spec/corestar_params.json")));
const P = spec.parameters;
// an E27-type hole too large for the smallest stars: a made-up small one checks the same plate there
spec.lamps.check_small = { seat: "hole", hole_d: 10, body_d: 10, top_d: 12, envelope: [[10, 10, 1]] };
const BODIES = ["Core", "PointSq", "PointTri", "LampPlate", "LampPlateE10", "TopHalf", "TopSleeve"];
const d = Object.fromEntries(Object.entries(P).map(([k, p]) => [k, p.default]));
export const SETS = {
  default: d,
  d_min: { ...d, diameter: 340, lamp: "e10_sleeve" },
  d_max: { ...d, diameter: P.diameter.max, lamp: "e27_a60" },
  k_min: { ...d, slenderness: P.slenderness.min },
  k_max: { ...d, slenderness: P.slenderness.max, diameter: 600 },
  wall_ends: { ...d, wall: P.wall.min, fit: P.fit.max },
  fit_ends: { ...d, wall: P.wall.max, fit: P.fit.min },
  snap_min: { ...d, snap: P.snap.min, diameter: 450, lamp: "e10_sleeve" },
  snap_max: { ...d, snap: P.snap.max, diameter: 700 },
  large_flat: { diameter: 900, slenderness: 2.4, wall: 1.6, fit: 0.1, snap: 0.3, lamp: "e27_a60" },
  small_long: { diameter: 400, slenderness: 3.6, wall: 0.8, fit: 0.4, snap: 0.1, lamp: "e10_sleeve" },
  mixed: { diameter: 480, slenderness: 2.8, wall: 1.1, fit: 0.25, snap: 0.15, lamp: "e10_sleeve" },
};

function reference(name, env, e10) {
  fs.mkdirSync(REF, { recursive: true });
  const step = path.join(REF, `${name}.step`), script = path.join(REF, `${name}.json`);
  const changes = {
    D: String(env.D), k: String(env.k), t: String(env.t), g: String(env.g), pre: String(env.pre), hd: String(env.lamp.hole_d ?? 41),
    holeS: String(e10.sleeve.holeS), ledS: String(e10.sleeve.ledS), hlS: String(e10.sleeve.hlS), slw: String(e10.sleeve.slw),
  };
  const commands = [{ command: "parameters.change", params: { changes } }, { command: "file.export", params: { path: step, bodies: BODIES } }];
  fs.writeFileSync(script, JSON.stringify({ commands }, null, 1));
  execFileSync(CLI, ["run", script, "--in", SC, "--quiet"], { stdio: "pipe" });
  return step;
}

async function one(name) {
  const values = SETS[name], t0 = Date.now();
  const lampHole = values.lamp === "e10_sleeve" ? "check_small" : values.lamp; // the plate with a hole in E10 sets: a small one
  const env = coreEnv(spec, { ...values, lamp: lampHole }), e10 = coreEnv(spec, { ...values, lamp: "e10_sleeve" });
  const step = reference(name, env, e10);
  const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
  const oc = await opencascade({ locateFile: () => wasm });
  R.setOC(oc);
  const vol = (s) => {
    const props = new oc.GProp_GProps();
    oc.BRepGProp.VolumePropertiesGK(s.wrapped, props, 1e-9, false, false, false, false, false);
    const m = props.Mass();
    props.delete();
    return m;
  };
  const ref = await R.importSTEP(new Blob([fs.readFileSync(step)]));
  const refs = [...R.iterTopo(ref.wrapped, "solid")].map((s) => R.cast(s));
  if (refs.length !== BODIES.length) throw new Error(`${name}: reference has ${refs.length} solids, expected ${BODIES.length}`);
  const web = {
    core: makeCore(R, env), square: makeSquarePoint(R, env), triangle: makeTrianglePoint(R, env),
    lamp_e27: makeLampPlate(R, env), lamp_e10: makeLampPlate(R, e10), top: makeTopHalf(R, env), sleeve: makeTopSleeve(R, env),
  };
  const refVol = refs.map(vol), box = (s) => s.boundingBox.bounds.flat();
  const cells = [];
  let ok = true;
  for (const [part, w] of Object.entries(web)) {
    const vw = vol(w);
    const i = refVol.map((v, j) => [Math.abs(v - vw), j]).sort((p, q) => p[0] - q[0])[0][1];
    const rs = refs[i];
    const plus = vol(w.clone().cut(rs.clone())), minus = vol(rs.clone().cut(w.clone()));
    const dbox = Math.max(...box(w).map((x, j) => Math.abs(x - box(rs)[j])));
    const good = plus < 1e-3 && minus < 1e-3 && Math.abs(vw - refVol[i]) < 1e-6 * refVol[i] + 2e-2 && dbox < 1e-4;
    ok &&= good;
    cells.push(`${part} ${refVol[i].toFixed(2)}/${vw.toFixed(2)} ±${Math.max(plus, minus).toExponential(0)}${good ? "" : " ✗"}`);
  }
  const label = `D=${env.D} k=${env.k} t=${env.t} g=${env.g} snap=${env.pre} ${values.lamp}`;
  console.log(`| ${name} | ${label} | ${cells.join("<br>")} | ${((Date.now() - t0) / 1000).toFixed(1)} | ${ok ? "ok" : "DIFFERENT"} |`);
}

const args = process.argv.slice(2);
if (args[0] === "--one") {
  await one(args[1]);
} else {
  if (!fs.existsSync(CLI)) throw new Error(`solidcraft-cli not found at ${CLI} (set SOLIDCRAFT_CLI)`);
  const rows = ["| Set | Parameters | part: SolidCraft/JS mm³ ±largest boolean difference | s | result |", "|---|---|---|---|---|"];
  let failures = 0;
  for (const name of Object.keys(SETS)) {
    let line;
    try {
      line = execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--one", name], { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] })
        .split("\n").find((l) => l.startsWith("|"));
    } catch (e) {
      line = `| ${name} | - | - | - | FAILED: ${String(e.stderr ?? e.message).trim().split("\n").slice(-1)[0]} |`;
    }
    if (!line.endsWith("| ok |")) failures++;
    rows.push(line);
    console.log(line);
  }
  const outFile = path.join(root, "export/web/corestar_check.md");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `# Christmas star with core vs SolidCraft\n\n${rows.length - 2} sets, ${failures} different.\n\n${rows.join("\n")}\n`);
  console.log(`done: ${rows.length - 2} sets, ${failures} different`);
  process.exitCode = failures ? 1 : 0;
}
