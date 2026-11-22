// Build Jan's SolidCraft tree v3 from v2: the same design plus two tops as configuration rows, all headless
// (solidcraft-cli), so the running SolidCraft app is left alone and v2 stays untouched.
//   Flat   v2 exactly (fins end 2t wide at H)
//   Sharp  FinSketchSharp: v2's outline meeting in an apex (0, H); every point an expression, fillets in closed form
//   Star   the flat top plus a blade tab in the plane of fin 0 and a separate flat 5-point star body with a slot,
//          in its place on the tab (the web prints the star lying flat)
// The star's sizes are expressions of the new parameters (Christmas/spec/tree_spec.md, "Tops").
//   node node/tree_sc_v3.mjs [--in v2.sc] [--out v3.sc]      (defaults: the repo snapshot of v2 -> ../../export/sc/)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const CLI = process.env.SOLIDCRAFT_CLI ?? "C:/Program Files/SolidCraft/solidcraft-cli.exe";
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const input = path.resolve(opt("--in", path.join(root, "solidcraft/christmas_tree_v2.sc")));
const output = path.resolve(opt("--out", path.join(root, "export/sc/christmas_tree_v3.sc")));

const doc = JSON.parse(strFromU8(unzipSync(fs.readFileSync(input))["document.json"]));
const finSketch = doc.features.find((f) => f.name === "FinSketch");
if (!finSketch || doc.features.length !== 4) throw new Error(`${input} is not the v2 tree (expected 4 features)`);

// ---------- new parameters (shape constants of the star first, then the derived sizes)
const PARAMS = [
  ["kds", "0.25", "", "Star diameter / H (top Star)"],
  ["Dsm", "22", "mm", "Smallest star diameter (keeps the wall around the slot)"],
  ["kq", "0.45", "", "Star inner radius / outer radius (regular star: 0.382)"],
  ["fg", "0.2", "mm", "Fit per side between tab and slot"],
  ["wl", "1.2", "mm", "Smallest wall of the star around the slot"],
  ["cs", "0.5", "mm", "Clearance between the star's lower points and the fins"],
  ["Ds", "max(Dsm, kds * H)", "mm", "Star diameter, tip to tip"],
  ["Rs", "Ds / 2", "mm", "Star outer radius"],
  ["st", "max(5 mm, t + 2 * fg + 2 * wl)", "mm", "Star thickness (the tab is fin 0 continued, t thick)"],
  ["wt", "0.9 * kq * Rs", "mm", "Tab width"],
  ["sd", "(kq + 0.1) * Rs", "mm", "Slot depth above the star's bottom notch"],
  ["ms", "(sin(54 deg) - kq) / cos(54 deg)", "", "Slope of the inner edges of the star's lower points"],
  ["gs", "ms * (hypot(t, t / 2) + cs)", "mm", "Lift of the star's notch above H (its lower points clear the fins)"],
  ["zc", "H + gs + kq * Rs", "mm", "Star centre height"],
  ["tb", "min(t, wt / 2 - 0.5 mm)", "mm", "Tab half-width at H (no wider than fin 0's top)"],
  ["tf", "wt / 2 - tb", "mm", "Height of the tab's 45 deg flare to its full width"],
];

// ---------- FinSketchSharp: the v2 outline with an apex (0, H) instead of the flat top, every point an expression.
// The fillets are closed form, not constraints: v2's constraint fillets are solved from the saved solution and can
// flip (H 120 -> 168 -> 235 gives another shape than 120 -> 235; from 260 they don't solve). For a tip C between the
// unit directions u1 (back along the underside) and u2 (on to the next corner), with c = u1.u2 and sn = |u1 x u2|:
// tangent points C + d u1 and C + d u2 with d = rc (1 + c)/sn; centre C + (u1 + u2) rc/sn.
const CORNERS = { // tip, and the vector from it to the next corner of the outline
  A: { x: "R3", y: "p", vx: "R2 - s - R3", vy: "p - dr" },
  B: { x: "R2", y: "2 * p", vx: "R1 - s - R2", vy: "p - dr" },
  C: { x: "R1", y: "3 * p", vx: "-R1", vy: "H - 3 * p" },
};
const SHARP_PARAMS = [
  ["fux", "-s / hypot(s, dr)", "", "Sharp top: unit vector back along a tier underside, x"],
  ["fuy", "-dr / hypot(s, dr)", "", "Sharp top: unit vector back along a tier underside, y"],
  ...Object.entries(CORNERS).flatMap(([k, c]) => [
    [`fvx${k}`, `(${c.vx}) / hypot(${c.vx}, ${c.vy})`, "", `Sharp top, tip ${k}: unit vector to the next corner, x`],
    [`fvy${k}`, `(${c.vy}) / hypot(${c.vx}, ${c.vy})`, "", `Sharp top, tip ${k}: unit vector to the next corner, y`],
    [`fs${k}`, `abs(fux * fvy${k} - fuy * fvx${k})`, "", `Sharp top, tip ${k}: sine of the corner angle`],
    [`fd${k}`, `rc * (1 + fux * fvx${k} + fuy * fvy${k}) / fs${k}`, "mm", `Sharp top, tip ${k}: tip to the fillet's tangent points`],
  ]),
];

function sharpSketch() {
  const pts = [], curves = [], idx = {};
  const point = (id, x, y) => { idx[id] = pts.length + 1; pts.push({ exprs: { x, y }, fixed: true, id, pos: [0, 0] }); };
  const neg = (e) => `-(${e})`;
  // the right side: base corner, then for each tip the inner corner below it, the two tangent points and the centre
  point("b0", "-Rb", "0*H");
  point("b1", "Rb", "0*H");
  const inner = { A: ["R3 - s", "p - dr"], B: ["R2 - s", "2 * p - dr"], C: ["R1 - s", "3 * p - dr"] };
  for (const [k, c] of Object.entries(CORNERS)) {
    point(`i${k}`, ...inner[k]);
    point(`t1${k}`, `${c.x} + fd${k} * fux`, `${c.y} + fd${k} * fuy`);
    point(`t2${k}`, `${c.x} + fd${k} * fvx${k}`, `${c.y} + fd${k} * fvy${k}`);
    point(`o${k}`, `${c.x} + (fux + fvx${k}) * rc / fs${k}`, `${c.y} + (fuy + fvy${k}) * rc / fs${k}`);
  }
  point("apex", "0*H", "H");
  // the left side, mirrored (x negated)
  for (const k of ["C", "B", "A"]) {
    for (const n of [`t2${k}`, `t1${k}`, `o${k}`]) point(`${n}L`, neg(pts[idx[n] - 1].exprs.x), pts[idx[n] - 1].exprs.y);
    point(`i${k}L`, neg(inner[k][0]), inner[k][1]);
  }
  let n = 0;
  const line = (a, b) => curves.push({ a: idx[a], b: idx[b], construction: false, id: `l${++n}`, type: "line" });
  const arc = (a, b, c) => curves.push({ a: idx[a], b: idx[b], c: idx[c], construction: false, id: `a${++n}`, type: "arc" });
  // counter-clockwise: up the right side, over the apex, down the left side; each fillet runs from the incoming
  // tangent point to the outgoing one
  line("b0", "b1");
  line("b1", "iA");
  for (const [k, next] of [["A", "iB"], ["B", "iC"], ["C", "apex"]]) {
    line(`i${k}`, `t1${k}`);
    arc(`t1${k}`, `t2${k}`, `o${k}`);
    line(`t2${k}`, next);
  }
  for (const [k, next] of [["C", "iCL"], ["B", "iBL"], ["A", "iAL"]]) {
    const from = curves.length && k === "C" ? "apex" : null;
    if (from) line("apex", `t2CL`);
    arc(`t2${k}L`, `t1${k}L`, `o${k}L`);
    line(`t1${k}L`, next);
    if (k !== "A") line(next, `t2${k === "C" ? "B" : "A"}L`);
  }
  line("iAL", "b0");
  return { name: "FinSketchSharp", plane: finSketch.plane, suppressed: false, type: "sketch",
    sketch: { constraints: [], counters: { a: 6, corner: 0, k: 0, l: n, p: pts.length }, curves,
      points: [{ fixed: true, id: "origin", pos: [0, 0] }, ...pts] } };
}

// ---------- StarSketch: a 5-point star (one point up) about (0, zc) in fin 0's plane, every point an expression
function starSketch() {
  const points = [{ fixed: true, id: "origin", pos: [0, 0] }], curves = [];
  for (let i = 0; i < 10; i++) {
    const outer = i % 2 === 0, ang = 90 + 36 * i, r = outer ? "Rs" : "kq * Rs";
    const rad = (ang * Math.PI) / 180, rv = outer ? 15 : 6.75;
    points.push({ exprs: { x: `${r} * cos(${ang} deg)`, y: `zc + ${r} * sin(${ang} deg)` }, fixed: true, id: `s${i + 1}`,
      pos: [rv * Math.cos(rad), 128.4 + rv * Math.sin(rad)] });
    curves.push({ a: i + 1, b: ((i + 1) % 10) + 1, construction: false, id: `l${i + 1}`, type: "line" });
  }
  return { name: "StarSketch", plane: finSketch.plane, suppressed: false, type: "sketch",
    sketch: { constraints: [], counters: { a: 0, corner: 0, k: 0, l: 10, p: 10 }, curves, points } };
}

// ---------- TabSketch: fin 0 continued above H, from its top width out at 45 deg to wt, with a 1 mm root inside fin 0
function tabSketch() {
  const P = [["-tb", "H - 1 mm"], ["tb", "H - 1 mm"], ["tb", "H"], ["wt / 2", "H + tf"], ["wt / 2", "H + gs + sd - fg"],
    ["-wt / 2", "H + gs + sd - fg"], ["-wt / 2", "H + tf"], ["-tb", "H"]];
  const POS = [[-2, 119], [2, 119], [2, 120], [3.04, 121.04], [3.04, 129.72], [-3.04, 129.72], [-3.04, 121.04], [-2, 120]];
  const points = [{ fixed: true, id: "origin", pos: [0, 0] }, ...P.map(([x, y], i) => ({ exprs: { x, y }, fixed: true, id: `t${i + 1}`, pos: POS[i] }))];
  const curves = P.map((_, i) => ({ a: i + 1, b: ((i + 1) % P.length) + 1, construction: false, id: `l${i + 1}`, type: "line" }));
  return { name: "TabSketch", plane: finSketch.plane, suppressed: false, type: "sketch",
    sketch: { constraints: [], counters: { a: 0, corner: 0, k: 0, l: P.length, p: P.length }, curves, points } };
}

const FEATURES = ["Fin", "Fins", "FinSharp", "FinsSharp", "Tab", "Star", "Slot"];
const ROWS = {
  Flat: { Fin: false, Fins: false, FinSharp: true, FinsSharp: true, Tab: true, Star: true, Slot: true },
  Sharp: { Fin: true, Fins: true, FinSharp: false, FinsSharp: false, Tab: true, Star: true, Slot: true },
  Star: { Fin: false, Fins: false, FinSharp: true, FinsSharp: true, Tab: false, Star: false, Slot: false },
};
const slotHalf = "(wt / 2 + fg)";
const commands = [
  ...[...PARAMS, ...SHARP_PARAMS].map(([name, expression, unit, comment]) => ({ command: "parameters.add", params: { name, expression, unit, comment } })),
  { command: "timeline.add", params: { feature: sharpSketch() } },
  { command: "solid.extrude", params: { sketch: "FinSketchSharp", direction: "symmetric", distance: "t", operation: "join", targets: ["Tree"], name: "FinSharp" } },
  { command: "solid.pattern.circular", params: { features: ["FinSharp"], axis: "Z", count: "N / 2", angle: "180 deg - 360 deg / N", name: "FinsSharp" } },
  { command: "timeline.add", params: { feature: tabSketch() } },
  { command: "solid.extrude", params: { sketch: "TabSketch", direction: "symmetric", distance: "t", operation: "join", targets: ["Tree"], name: "Tab" } },
  { command: "timeline.add", params: { feature: starSketch() } },
  { command: "solid.extrude", params: { sketch: "StarSketch", direction: "symmetric", distance: "st", operation: "new", body_name: "Star", name: "Star" } },
  { command: "solid.box", params: { length: `2 * ${slotHalf}`, width: "t + 2 * fg", height: `sd + ms * ${slotHalf} + 1 mm`,
    corner: [`-${slotHalf}`, "-(t / 2 + fg)", `zc - kq * Rs - ms * ${slotHalf} - 1 mm`], operation: "cut", targets: ["Star"], name: "Slot" } },
  { command: "config.configure", params: { features: FEATURES } },
  { command: "config.row", params: { name: "Default", rename: "Flat", values: ROWS.Flat } },
  { command: "config.row", params: { name: "Sharp", values: ROWS.Sharp } },
  { command: "config.row", params: { name: "Star", values: ROWS.Star } },
  { command: "config.activate", params: { row: "Flat" } },
];

fs.mkdirSync(path.dirname(output), { recursive: true });
const script = output.replace(/\.sc$/, "_script.json");
fs.writeFileSync(script, JSON.stringify({ commands }, null, 1));
execFileSync(CLI, ["run", script, "--in", input, "--save", output, "--quiet"], { stdio: "inherit" });
console.log(`wrote ${output}`);
