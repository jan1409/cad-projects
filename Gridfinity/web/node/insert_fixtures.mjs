// Shared by the tool-insert Node checks: spec, Clipper, fixture tool sets (node/fixtures/tools.json) and the open-edge
// count of binary STLs.
import fs from "node:fs";
import { createRequire } from "node:module";
import { setClipper, circle, cleanOutline, arrange } from "../src/outline.js";
import { insertEnv } from "../src/insert.js";

setClipper(createRequire(import.meta.url)("clipper-lib"));
export const spec = JSON.parse(fs.readFileSync(new URL("../../spec/bin_params.json", import.meta.url)));
const fixtures = JSON.parse(fs.readFileSync(new URL("./fixtures/tools.json", import.meta.url)));
export const SETS = Object.keys(fixtures.sets);

export const defaults = () => ({
  ...Object.fromEntries(Object.entries(spec.variants.insert.parameters).map(([k, p]) => [k, p.default])),
  auto_size: true, auto_height: true,
});

// the tools of a fixture set, cleaned and centred like traced ones, auto-arranged; for a manual box size the layout is
// centred in the box (the page does the same when the size is switched to manual)
export function setTools(name, inputs) {
  const tools = fixtures.sets[name].map((key) => {
    const f = fixtures.tools[key];
    const outline = cleanOutline(f.circle ? circle(0, 0, f.circle) : f.outline, { eps: 0.02 });
    return { name: f.name, height: f.height, depth: null, outline, fingers: "auto", x: 0, y: 0, rot: 0 };
  });
  const laid = arrange(tools, { clearance: inputs.clearance, fingerD: inputs.finger_d, gap: spec.insert.min_wall + 1,
    rowUnits: inputs.auto_size ? null : inputs.x_count });
  if (inputs.auto_size) return laid;
  const [dx, dy] = insertEnv(spec, { ...inputs, auto_size: true }, laid).shift;
  return laid.map((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
}

export function openEdges(buf) { // binary STL -> number of edges not shared by exactly two triangles (vertices welded at 1 um)
  const dv = new DataView(buf), n = dv.getUint32(80, true), count = new Map();
  const key = (o) => [0, 4, 8].map((d) => Math.round(dv.getFloat32(o + d, true) * 1000)).join(",");
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12, v = [key(o), key(o + 12), key(o + 24)];
    for (const [a, b] of [[v[0], v[1]], [v[1], v[2]], [v[2], v[0]]]) {
      const k = a < b ? a + "|" + b : b + "|" + a;
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  let bad = 0;
  for (const c of count.values()) if (c !== 2) bad++;
  return bad;
}
