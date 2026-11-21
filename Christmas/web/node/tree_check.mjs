// Compare the JS tree (src/tree.js) with Jan's SolidCraft model, the master (Christmas/solidcraft/christmas_tree.sc),
// over a parameter sweep: solidcraft-cli rebuilds the .sc headless with each set of values and exports a STEP, which is
// compared with the replicad solid by exact B-rep booleans (both differences must vanish), volume and bounding box.
// Local only (needs SolidCraft; CI has none). Each set runs in its own process (the WASM heap only grows).
//   node node/tree_check.mjs [--one <set>]   -> ../../export/web/tree_check.md, references in ../../export/ref/
//   SOLIDCRAFT_CLI overrides the path of solidcraft-cli.exe
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { treeEnv, makeTree } from "../src/tree.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const CLI = process.env.SOLIDCRAFT_CLI ?? "C:/Program Files/SolidCraft/solidcraft-cli.exe";
const SC = path.join(root, "solidcraft/christmas_tree.sc");
const REF = path.join(root, "export/ref");
const spec = JSON.parse(fs.readFileSync(path.join(root, "spec/tree_params.json")));
const P = spec.parameters;
// spec key -> parameter of the .sc
const SC_NAME = { height: "H", fins: "N", fin_t: "t", angle: "a" };
const d = Object.fromEntries(Object.keys(SC_NAME).map((k) => [k, P[k].default]));
export const SETS = {
  default: d,
  h_min: { ...d, height: P.height.min },
  h_max: { ...d, height: P.height.max },
  n_min: { ...d, fins: P.fins.min },
  n_max: { ...d, fins: P.fins.max },
  t_min: { ...d, fin_t: P.fin_t.min },
  t_max: { ...d, fin_t: P.fin_t.max },
  a_min: { ...d, angle: P.angle.min },
  a_max: { ...d, angle: P.angle.max },
  small_dense: { height: P.height.min, fins: P.fins.max, fin_t: P.fin_t.max, angle: P.angle.max },
  large_sparse: { height: P.height.max, fins: P.fins.min, fin_t: P.fin_t.min, angle: P.angle.min },
  mixed: { height: 85, fins: 14, fin_t: 1.6, angle: 45 },
};

function reference(name, values) {
  fs.mkdirSync(REF, { recursive: true });
  const step = path.join(REF, `${name}.step`), script = path.join(REF, `${name}.json`);
  const changes = Object.fromEntries(Object.entries(SC_NAME).map(([k, n]) => [n, String(values[k])]));
  fs.writeFileSync(script, JSON.stringify({ commands: [{ command: "parameters.change", params: { changes } }] }, null, 1));
  execFileSync(CLI, ["run", script, "--in", SC, "--out", step, "--quiet"], { stdio: "pipe" });
  return step;
}

async function one(name) {
  const values = SETS[name];
  const t0 = Date.now();
  const step = reference(name, values);
  const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
  R.setOC(await opencascade({ locateFile: () => wasm }));
  const ref = await R.importSTEP(new Blob([fs.readFileSync(step)]));
  const solids = [...R.iterTopo(ref.wrapped, "solid")].map((s) => R.cast(s));
  if (solids.length !== 1) throw new Error(`${name}: reference has ${solids.length} solids`);
  const env = treeEnv(spec, { ...values, bands: false, band_share: P.band_share.default });
  const web = makeTree(R, env), refS = solids[0];
  const v = (s) => R.measureVolume(s);
  const plus = v(web.clone().cut(refS.clone())), minus = v(refS.clone().cut(web.clone()));
  const box = (s) => s.boundingBox.bounds.flat();
  const dbox = Math.max(...box(web).map((x, i) => Math.abs(x - box(refS)[i])));
  const ok = plus < 1e-3 && minus < 1e-3 && Math.abs(v(web) - v(refS)) < 1e-6 * v(refS) + 1e-3 && dbox < 1e-4;
  const label = Object.entries(SC_NAME).map(([k, n]) => `${n}=${values[k]}`).join(" ");
  console.log(`| ${name} | ${label} | ${v(refS).toFixed(3)} | ${v(web).toFixed(3)} | ${plus.toExponential(1)} | ${minus.toExponential(1)} | ` +
    `${dbox.toExponential(1)} | ${((Date.now() - t0) / 1000).toFixed(1)} | ${ok ? "ok" : "DIFFERENT"} |`);
}

const args = process.argv.slice(2);
if (args[0] === "--one") {
  await one(args[1]);
} else {
  if (!fs.existsSync(CLI)) throw new Error(`solidcraft-cli not found at ${CLI} (set SOLIDCRAFT_CLI)`);
  const rows = ["| Set | SolidCraft parameters | SolidCraft mm³ | JS mm³ | JS − SC mm³ | SC − JS mm³ | bbox Δ mm | s | result |",
    "|---|---|---|---|---|---|---|---|---|"];
  let failures = 0;
  for (const name of Object.keys(SETS)) {
    let line;
    try {
      line = execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--one", name], { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] })
        .split("\n").find((l) => l.startsWith("|"));
    } catch (e) {
      line = `| ${name} | - | - | - | - | - | - | - | FAILED: ${String(e.stderr ?? e.message).trim().split("\n").slice(-1)[0]} |`;
    }
    if (!line.endsWith("| ok |")) failures++;
    rows.push(line);
    console.log(line);
  }
  const outFile = path.join(root, "export/web/tree_check.md");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `# Christmas tree vs SolidCraft\n\n${rows.length - 2} sets, ${failures} different.\n\n${rows.join("\n")}\n`);
  console.log(`done: ${rows.length - 2} sets, ${failures} different`);
  process.exitCode = failures ? 1 : 0;
}
