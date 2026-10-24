// Gridfinity tool insert headless: build one fixture set (node/fixtures/tools.json), check that the box is a closed
// mesh, optionally export it.
//   node node/insert_build.mjs <set> [--x n --y n] [--z n] [--no-magnets] [--clearance mm] [--lower mm] [--depth mm]
//                                    [--out <dir>]                          -> STL + STEP + check SVG
//   node node/insert_build.mjs --sweep                                      -> ../export/web/insert_sweep.md
// --x/--y and --z switch off the automatic size / height; --depth sets every pocket depth (tools stick out if lower
// than their height). The sweep runs every configuration in its own process (OpenCascade's WASM heap only grows).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { insertEnv, makeInsert, insertSvg } from "../src/insert.js";
import { spec, SETS, defaults, setTools, openEdges } from "./insert_fixtures.mjs";

function parse(args) {
  const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  const inputs = defaults();
  if (opt("--x")) Object.assign(inputs, { auto_size: false, x_count: Number(opt("--x")), y_count: Number(opt("--y") ?? opt("--x")) });
  if (opt("--z")) Object.assign(inputs, { auto_height: false, z_count: Number(opt("--z")) });
  if (args.includes("--no-magnets")) inputs.magnets = false;
  if (opt("--clearance")) inputs.clearance = Number(opt("--clearance"));
  if (opt("--lower")) inputs.fill_lower = Number(opt("--lower"));
  return { set: args[0], inputs, depth: opt("--depth") ? Number(opt("--depth")) : null, out: opt("--out") };
}

async function one(args) {
  const { set, inputs, depth, out } = parse(args);
  const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
  R.setOC(await opencascade({ locateFile: () => wasm }));
  const t0 = Date.now(), tag = args.filter((a) => a !== "--out" && a !== out).join("_").replace(/--/g, "");
  let cells = ["-", "-", "-", "-"], open = "-", result = "ok";
  try {
    const tools = setTools(set, inputs).map((tl) => ({ ...tl, depth: depth ?? tl.depth }));
    const env = insertEnv(spec, inputs, tools);
    const warn = env.problems.map((p) => p.code);
    cells = [`${env.x_count}×${env.y_count}×${env.z_count}`, env.F.toFixed(2), env.items.length, "-"];
    if (!env.ok) throw new Error(`not buildable: ${warn.join(", ")}`);
    const shape = makeInsert(R, spec, env).box();
    cells[3] = (R.measureVolume(shape) / 1000).toFixed(2);
    const stl = await shape.blobSTL({ tolerance: 0.01, angularTolerance: 0.1, binary: true }).arrayBuffer();
    open = openEdges(stl);
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, `${tag}.stl`), Buffer.from(stl));
      fs.writeFileSync(path.join(out, `${tag}.step`), Buffer.from(await shape.blobSTEP().arrayBuffer()));
      fs.writeFileSync(path.join(out, `${tag}_check.svg`), insertSvg(env, { title: tag }));
    }
    shape.delete();
    if (open) result = "OPEN STL";
    else if (warn.length) result = `ok (${warn.join(", ")})`;
  } catch (e) {
    result = `FAILED: ${e.message}`;
  }
  console.log(`| ${tag} | ${cells.join(" | ")} | ${open} | ${((Date.now() - t0) / 1000).toFixed(1)} | ${result} |`);
}

const args = process.argv.slice(2);
if (args[0] === "--sweep") {
  const configs = [
    ...SETS.map((s) => [s]),
    ["caliper", "--no-magnets"], ["mixed", "--no-magnets"],
    ["coin", "--x", "1", "--y", "1", "--z", "2"], ["bit", "--z", "25"], ["lenscap", "--z", "12", "--lower", "30"],
    ["camera", "--x", "7", "--y", "3"], ["pliers", "--clearance", "0"], ["pliers", "--clearance", "3"],
    ["caliper", "--depth", "10"], ["mixed", "--z", "8"],
  ];
  const rows = ["| Config | Size | Insert top | Tools | Box cm3 | open STL edges | build s | result |", "|---|---|---|---|---|---|---|---|"];
  let failures = 0;
  for (const c of configs) {
    let line;
    try {
      line = execFileSync(process.execPath, [fileURLToPath(import.meta.url), ...c], { encoding: "utf8", maxBuffer: 1 << 26 })
        .split("\n").find((l) => l.startsWith("|"));
    } catch {
      line = undefined;
    }
    line ??= `| ${c.join("_")} | - | - | - | - | - | - | FAILED: process crashed |`;
    if (!/\| ok( \([a-zA-Z, ]+\))? \|$/.test(line)) failures++;
    rows.push(line);
    console.log(line);
  }
  const outFile = new URL("../../export/web/insert_sweep.md", import.meta.url);
  fs.mkdirSync(new URL(".", outFile), { recursive: true });
  fs.writeFileSync(outFile, `# Tool insert sweep\n\n${configs.length} configurations, ${failures} problem(s).\n\n${rows.join("\n")}\n`);
  console.log(`done: ${configs.length} configurations, ${failures} problem(s) -> ${fileURLToPath(outFile)}`);
  process.exitCode = failures ? 1 : 0;
} else {
  await one(args);
}
