// Do boxes stack? A standard box of the same footprint is set onto the box below: its feet seat on the stacking lip
// with z = 0 at T + lip.height - foot.height (T - 0.35). Lifted 0.01 mm from there it must be free of the box below
// (and of its contents: the label plate, the tools of a tool insert as prisms of their outline and height); lowered
// 0.05 mm it must hit the lip (proves the check can see a contact).
// It found that a label plate flush with the wall top carried the box above 0.35 mm high; the plate now sits
// plate_drop (0.5) lower (2026-10-24).
// Usage: node node/stack_fit.mjs
import { fileURLToPath } from "node:url";
import opencascade from "replicad-opencascadejs";
import * as R from "replicad";
import { makeBin } from "../src/bin.js";
import { insertEnv, makeInsert } from "../src/insert.js";
import { offset } from "../src/outline.js";
import { spec, defaults, setTools } from "./insert_fixtures.mjs";

const wasm = fileURLToPath(import.meta.resolve("replicad-opencascadejs/wasm"));
R.setOC(await opencascade({ locateFile: () => wasm }));
const o = spec.official;
const vol = (s) => (s ? R.measureVolume(s) : 0);
const inter = (a, b) => {
  try { return a.clone().intersect(b.clone()); } catch { return null; }
};
const prism = (pts, z0, h) => {
  let pen = R.draw(pts[0]);
  for (const p of pts.slice(1)) pen = pen.lineTo(p);
  return pen.close().sketchOnPlane("XY", [0, 0, z0]).extrude(h);
};

// [name, x, y, T, solids of the lower box incl. contents]
const cases = [];
for (const [x, y, z] of [[1, 1, 3], [2, 2, 6]]) {
  cases.push([`standard ${x}×${y}×${z}`, x, y, 7 * z, [makeBin(R, spec, { variant: "standard", x_count: x, y_count: y, z_count: z, magnets: false }).box()]]);
  const lb = makeBin(R, spec, { variant: "label", x_count: x, y_count: y, z_count: z, magnets: false });
  cases.push([`label ${x}×${y}×${z} + plate`, x, y, 7 * z, [lb.box(), lb.plate()]]);
}
for (const [set, extra] of [["caliper", {}], ["camera", {}], ["caliper", { protrude: 4 }], ["lenscap", { auto_height: false, z_count: 6, fill_lower: 8 }]]) {
  const inputs = { ...defaults(), magnets: false, ...extra };
  const tools = setTools(set, inputs).map((tl) => ({ ...tl, depth: extra.protrude ? tl.height - extra.protrude : null }));
  const env = insertEnv(spec, inputs, tools);
  // the tools themselves: outline (pocket region minus clearance) from the pocket floor up by the tool height
  const proxies = env.items.flatMap((it) => offset(it.region, -env.clearance, 0.05).map((p) => prism(p, it.floor, it.height)));
  const label = `insert ${set} ${env.x_count}×${env.y_count}×${env.z_count}` + (extra.protrude ? ", tools stick out 4" : "") +
    (extra.fill_lower ? `, lowered ${extra.fill_lower}` : "");
  cases.push([label, env.x_count, env.y_count, env.T, [makeInsert(R, spec, env).box(), ...proxies]]);
}

console.log("| box below | upper box | overlap mm³ | expected | result |");
console.log("|---|---|---|---|---|");
let failures = 0;
for (const [name, x, y, T, lower] of cases) {
  const seat = T + o.lip.height - o.foot.height;
  for (const [move, dz, hit] of [["lifted 0.01", 0.01, false], ["lowered 0.05", -0.05, true]]) {
    const upper = makeBin(R, spec, { variant: "standard", x_count: x, y_count: y, z_count: 2, magnets: false }).box().translate(0, 0, seat + dz);
    let v = 0;
    for (const s of lower) {
      const ov = inter(s, upper);
      v += vol(ov);
      ov?.delete();
    }
    const ok = hit ? v > 1e-3 : v < 1e-6;
    if (!ok) failures++;
    console.log(`| ${name} | ${move} | ${v.toFixed(3)} | ${hit ? "touches" : "free"} | ${ok ? "ok" : "WRONG"} |`);
    upper.delete();
  }
}
console.log(`\n${failures ? `${failures} problem(s)` : "all ok"}`);
process.exitCode = failures ? 1 : 0;
