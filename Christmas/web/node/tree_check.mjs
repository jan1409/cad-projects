// Compare the JS tree (src/tree.js) with Jan's SolidCraft model, the master (Christmas/solidcraft/christmas_tree.sc,
// v3: v2 plus the tops as configuration rows), over a parameter sweep and every top: solidcraft-cli activates the
// row (Flat / Sharp / Star), sets the values and exports a STEP, which is compared with the replicad solids by exact
// B-rep booleans (both differences must vanish), volume and bounding box: the tree, and for Star the star in its
// place on the tab. Local only (needs SolidCraft; CI has none). Each job runs in its own process (the WASM heap only
// grows).
//   node node/tree_check.mjs [--top flat|sharp|star] [--one <set> <top>]  -> ../../export/web/tree_check.md
//   SOLIDCRAFT_CLI overrides the path of solidcraft-cli.exe
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { treeEnv, makeTree, makeStar, starPose } from "../src/tree.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const CLI = process.env.SOLIDCRAFT_CLI ?? "C:/Program Files/SolidCraft/solidcraft-cli.exe";
const SC = path.join(root, "solidcraft/christmas_tree.sc");
const REF = path.join(root, "export/ref");
const spec = JSON.parse(fs.readFileSync(path.join(root, "spec/tree_params.json")));
const P = spec.parameters;
// spec key -> parameter of the .sc (star_share is a percentage, kds a ratio)
const SC_NAME = { height: "H", fins: "N", fin_t: "t", angle: "a", star_share: "kds" };
const scValue = (k, v) => (k === "star_share" ? String(v / 100) : String(v));
const ROW = { flat: "Flat", sharp: "Sharp", star: "Star" };
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
  small_dense: { ...d, height: P.height.min, fins: P.fins.max, fin_t: P.fin_t.max, angle: P.angle.max },
  large_sparse: { ...d, height: P.height.max, fins: P.fins.min, fin_t: P.fin_t.min, angle: P.angle.min },
  mixed: { ...d, height: 85, fins: 14, fin_t: 1.6, angle: 45 },
  star_min: { ...d, star_share: P.star_share.min },
  star_max: { ...d, height: P.height.max, star_share: P.star_share.max },
};
const STAR_ONLY = ["star_min", "star_max"]; // the star size changes nothing else

function reference(name, top, values) {
  fs.mkdirSync(REF, { recursive: true });
  const base = path.join(REF, `${name}_${top}`), step = `${base}.step`, script = `${base}.json`;
  const changes = Object.fromEntries(Object.entries(SC_NAME).map(([k, n]) => [n, scValue(k, values[k])]));
  // one change straight from the saved state: v2's constraint fillets (FinSketch, used by Flat and Star) are solved from
  // the saved solution, and a path through other heights can flip them (120 -> 168 -> 235 is not 120 -> 235)
  const commands = [{ command: "config.activate", params: { row: ROW[top] } }, { command: "parameters.change", params: { changes } }];
  fs.writeFileSync(script, JSON.stringify({ commands }, null, 1));
  execFileSync(CLI, ["run", script, "--in", SC, "--out", step, "--quiet"], { stdio: "pipe" });
  return step;
}

async function one(name, top) {
  const values = SETS[name];
  const t0 = Date.now();
  const step = reference(name, top, values);
  const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
  R.setOC(await opencascade({ locateFile: () => wasm }));
  const ref = await R.importSTEP(new Blob([fs.readFileSync(step)]));
  const solids = [...R.iterTopo(ref.wrapped, "solid")].map((s) => R.cast(s));
  const env = treeEnv(spec, { ...values, bands: false, band_share: P.band_share.default, top, star_filament: "3" });
  const zmin = (s) => s.boundingBox.bounds[0][2];
  const refTree = solids.find((s) => zmin(s) < 1e-6), refStar = solids.find((s) => zmin(s) > env.H / 2);
  if (solids.length !== (top === "star" ? 2 : 1) || !refTree || (top === "star" && !refStar))
    throw new Error(`${name} ${top}: reference has ${solids.length} solids`);
  const v = (s) => R.measureVolume(s), box = (s) => s.boundingBox.bounds.flat();
  const cells = [], label = Object.entries(SC_NAME).filter(([k]) => k !== "star_share" || top === "star").map(([k, n]) => `${n}=${scValue(k, values[k])}`).join(" ");
  let ok = true;
  const compare = (part, web, refS) => {
    const plus = v(web.clone().cut(refS.clone())), minus = v(refS.clone().cut(web.clone()));
    const dbox = Math.max(...box(web).map((x, i) => Math.abs(x - box(refS)[i])));
    const good = plus < 1e-3 && minus < 1e-3 && Math.abs(v(web) - v(refS)) < 1e-6 * v(refS) + 1e-3 && dbox < 1e-4;
    ok &&= good;
    cells.push(`${part} ${v(refS).toFixed(3)} / ${v(web).toFixed(3)}, ±${plus.toExponential(0)}/${minus.toExponential(0)}, bbox ${dbox.toExponential(0)}`);
  };
  compare("tree", makeTree(R, env), refTree);
  if (top === "star") compare("star", starPose(makeStar(R, env), env), refStar);
  console.log(`| ${name} | ${top} | ${label} | ${cells.join("; ")} | ${((Date.now() - t0) / 1000).toFixed(1)} | ${ok ? "ok" : "DIFFERENT"} |`);
}

const args = process.argv.slice(2);
if (args[0] === "--one") {
  await one(args[1], args[2]);
} else {
  if (!fs.existsSync(CLI)) throw new Error(`solidcraft-cli not found at ${CLI} (set SOLIDCRAFT_CLI)`);
  const tops = args.includes("--top") ? [args[args.indexOf("--top") + 1]] : Object.keys(ROW);
  const rows = ["| Set | Top | SolidCraft parameters | SolidCraft / JS mm³, JS−SC / SC−JS mm³, bbox Δ mm | s | result |", "|---|---|---|---|---|---|"];
  let failures = 0;
  for (const top of tops) for (const name of Object.keys(SETS)) {
    if (STAR_ONLY.includes(name) && top !== "star") continue;
    let line;
    try {
      line = execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--one", name, top], { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] })
        .split("\n").find((l) => l.startsWith("|"));
    } catch (e) {
      line = `| ${name} | ${top} | - | - | - | FAILED: ${String(e.stderr ?? e.message).trim().split("\n").slice(-1)[0]} |`;
    }
    if (!line.endsWith("| ok |")) failures++;
    rows.push(line);
    console.log(line);
  }
  const outFile = path.join(root, "export/web/tree_check.md");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `# Christmas tree vs SolidCraft\n\n${rows.length - 2} jobs, ${failures} different.\n\n${rows.join("\n")}\n`);
  console.log(`done: ${rows.length - 2} jobs, ${failures} different`);
  process.exitCode = failures ? 1 : 0;
}
