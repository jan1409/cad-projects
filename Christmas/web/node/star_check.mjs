// Compare the JS star parts (src/star.js) with the SolidCraft master (Christmas/solidcraft/christmas_star.sc) over a
// parameter sweep: solidcraft-cli rebuilds the .sc headless with each set of values and exports a STEP with its five
// bodies (square point, triangle point, bayonet socket, sleeve socket, carrier). Each is compared with its replicad twin
// by exact B-rep booleans (both differences must vanish), volume and bounding box.
// Local only (needs SolidCraft; CI has none). Each set runs in its own process (the WASM heap only grows).
//   node node/star_check.mjs [--one <set>]   -> ../../export/web/star_check.md, references in ../../export/ref/
//   SOLIDCRAFT_CLI overrides the path of solidcraft-cli.exe
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { starEnv, makeSquarePoint, makeTrianglePoint, makeSocket, makeCarrier } from "../src/star.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const CLI = process.env.SOLIDCRAFT_CLI ?? "C:/Program Files/SolidCraft/solidcraft-cli.exe";
const SC = path.join(root, "solidcraft/christmas_star.sc");
const REF = path.join(root, "export/ref/star");
const spec = JSON.parse(fs.readFileSync(path.join(root, "spec/star_params.json")));
// a bayonet lamp too large for the smallest stars: a made-up small one checks the same equations there
spec.lamps.check_small = { seat: "bayonet", hole_d: 8.2, bottom_d: 10, envelope: [[10, 10, 1]] };
const P = spec.parameters;
const d = { diameter: P.diameter.default, slenderness: P.slenderness.default, wall: P.wall.default, fit: P.fit.default, magnet_fit: P.magnet_fit.default, lamp: P.lamp.default };
export const SETS = {
  default: d,
  d_min: { ...d, diameter: P.diameter.min, lamp: "check_small" },
  d_max: { ...d, diameter: P.diameter.max, lamp: "e27_a60" },
  k_min: { ...d, slenderness: P.slenderness.min },
  k_max: { ...d, slenderness: P.slenderness.max },
  wall_min: { ...d, wall: P.wall.min },
  wall_max: { ...d, wall: P.wall.max },
  fit_min: { ...d, fit: P.fit.min },
  fit_max: { ...d, fit: P.fit.max },
  mfit_ends: { ...d, magnet_fit: P.magnet_fit.min, diameter: 300, lamp: "e10_panel" },
  small_panel: { diameter: 260, slenderness: 3.6, wall: 1.6, fit: 0.4, lamp: "e10_panel" },
  large_a60: { diameter: 900, slenderness: 2.4, wall: 0.8, fit: 0.1, magnet_fit: 0.3, lamp: "e27_a60" },
  mixed: { diameter: 380, slenderness: 2.8, wall: 1.1, fit: 0.25, lamp: "e10_panel" },
};

// .sc parameters for a set: the star inputs, the bayonet lamp's opening and the E10 sleeve
function scChanges(env, sleeve) {
  return {
    D: String(env.D), k: String(env.k), t: String(env.t), g: String(env.g), mfit: String(env.mfit),
    Do: String(env.Do), holeD: String(env.holeD), Ll: String(env.Ll),
    holeS: String(sleeve.holeS), ledS: String(sleeve.ledS), hlS: String(sleeve.hlS), sw: String(sleeve.sw), // sh follows in the .sc
  };
}

function reference(name, changes) {
  fs.mkdirSync(REF, { recursive: true });
  const step = path.join(REF, `${name}.step`), script = path.join(REF, `${name}.json`);
  fs.writeFileSync(script, JSON.stringify({ commands: [{ command: "parameters.change", params: { changes } }] }, null, 1));
  execFileSync(CLI, ["run", script, "--in", SC, "--out", step, "--quiet"], { stdio: "pipe" });
  return step;
}

async function one(name) {
  const values = SETS[name];
  const t0 = Date.now();
  const env = starEnv(spec, values), envS = starEnv(spec, { ...values, lamp: "e10_sleeve" });
  const step = reference(name, scChanges(env, envS));
  const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
  const oc = await opencascade({ locateFile: () => wasm });
  R.setOC(oc);
  // replicad's measureVolume integrates spheres coarsely (0.1 mm³ off); Gauss-Kronrod with a tolerance is exact
  const vol = (s) => {
    const props = new oc.GProp_GProps();
    oc.BRepGProp.VolumePropertiesGK(s.wrapped, props, 1e-9, false, false, false, false, false);
    const m = props.Mass();
    props.delete();
    return m;
  };
  const ref = await R.importSTEP(new Blob([fs.readFileSync(step)]));
  const refs = [...R.iterTopo(ref.wrapped, "solid")].map((s) => R.cast(s));
  if (refs.length !== 5) throw new Error(`${name}: reference has ${refs.length} solids, expected 5`);
  const web = {
    square: makeSquarePoint(R, env), triangle: makeTrianglePoint(R, env),
    socket: makeSocket(R, env), sleeve: makeSocket(R, envS), carrier: makeCarrier(R, env),
  };
  const refVol = refs.map(vol);
  const box = (s) => s.boundingBox.bounds.flat();
  const cells = [];
  let ok = true;
  for (const [part, w] of Object.entries(web)) {
    const vw = vol(w);
    const i = refVol.map((v, j) => [Math.abs(v - vw), j]).sort((p, q) => p[0] - q[0])[0][1]; // the reference body by volume
    const rs = refs[i];
    const plus = vol(w.clone().cut(rs.clone())), minus = vol(rs.clone().cut(w.clone()));
    const dbox = Math.max(...box(w).map((x, j) => Math.abs(x - box(rs)[j])));
    const good = plus < 1e-3 && minus < 1e-3 && Math.abs(vw - refVol[i]) < 1e-6 * refVol[i] + 2e-2 && dbox < 1e-4;
    ok &&= good;
    cells.push(`${part} ${refVol[i].toFixed(2)}/${vw.toFixed(2)} ±${Math.max(plus, minus).toExponential(0)}${good ? "" : " ✗"}`);
  }
  const label = `D=${env.D} k=${env.k} t=${env.t} g=${env.g} ${values.lamp} (Ø ${env.Do})`;
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
  const outFile = path.join(root, "export/web/star_check.md");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `# Christmas star vs SolidCraft\n\n${rows.length - 2} sets, ${failures} different.\n\n${rows.join("\n")}\n`);
  console.log(`done: ${rows.length - 2} sets, ${failures} different`);
  process.exitCode = failures ? 1 : 0;
}
