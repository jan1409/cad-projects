// Compare the JS parts of the plug-together star (src/plugstar.js) with the SolidCraft master
// (Christmas/solidcraft/plug_star.sc) over a parameter sweep: solidcraft-cli rebuilds the .sc headless with each set of
// values and exports a STEP with its three bodies (point, point with hanging hole, connector). Each is compared with its
// replicad twin by exact B-rep booleans (both differences must vanish), volume and bounding box.
// Local only (needs SolidCraft; CI has none). Each set runs in its own process (the WASM heap only grows).
//   node node/plugstar_check.mjs [--one <set>]   -> ../../export/web/plugstar_check.md, references in ../../export/ref/plugstar/
//   SOLIDCRAFT_CLI overrides the path of solidcraft-cli.exe
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { plugEnv, plugProblems, makePoint, makeConnector } from "../src/plugstar.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const CLI = process.env.SOLIDCRAFT_CLI ?? "C:/Program Files/SolidCraft/solidcraft-cli.exe";
const SC = path.join(root, "solidcraft/plug_star.sc");
const REF = path.join(root, "export/ref/plugstar");
const spec = JSON.parse(fs.readFileSync(path.join(root, "spec/plugstar_params.json")));
const P = spec.parameters;
const d = { diameter: P.diameter.default, points: P.points.default, tip_angle: P.tip_angle.default, depth: P.depth.default, fit: P.fit.default, hanger: true };
export const SETS = {
  default: d,
  d_min: { ...d, diameter: P.diameter.min },
  d_max: { ...d, diameter: P.diameter.max },
  n_min: { ...d, points: P.points.min },
  n_max: { ...d, points: P.points.max, diameter: 250 },
  angle_min: { ...d, tip_angle: P.tip_angle.min },
  angle_max: { ...d, tip_angle: P.tip_angle.max },
  depth_min: { ...d, depth: P.depth.min },
  depth_max: { ...d, depth: P.depth.max },
  ...Object.fromEntries(P.fit.options.map(([fit]) => [`fit_${fit}`, { ...d, fit }])),
  fit_wide: { ...d, fit: 0.4 }, // outside the choice: the equations hold anyway
  wide4: { diameter: 300, points: 4, tip_angle: 60, depth: 35, fit: 0.3, hanger: true },
  slim8: { diameter: 260, points: 8, tip_angle: 30, depth: 20, fit: 0.15, hanger: true },
  six: { diameter: 170, points: 6, tip_angle: 45, depth: 25, fit: 0.25, hanger: true },
};

const scChanges = (env) => ({ D: `${env.D} mm`, pts: String(env.N), alpha: `${env.alpha} deg`, depth: String(env.depth), fit: `${env.fit} mm` });

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
  const env = plugEnv(spec, values);
  const step = reference(name, scChanges(env));
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
  if (refs.length !== 3) throw new Error(`${name}: reference has ${refs.length} solids, expected 3`);
  const web = { point: makePoint(R, env, false), point_hang: makePoint(R, env, true), connector: makeConnector(R, env) };
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
  const probs = plugProblems(env);
  const label = `D=${env.D} N=${env.N} α=${env.alpha} depth=${env.depth} fit=${env.fit}${probs.length ? ` (${probs.join(", ")})` : ""}`;
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
  const outFile = path.join(root, "export/web/plugstar_check.md");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `# Plug-together star vs SolidCraft\n\n${rows.length - 2} sets, ${failures} different.\n\n${rows.join("\n")}\n`);
  console.log(`done: ${rows.length - 2} sets, ${failures} different`);
  process.exitCode = failures ? 1 : 0;
}
