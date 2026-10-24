// Gridfinity tool insert: a standard box (src/bin.js) whose floor slab is raised to the fill top F, with one pocket per
// tool - the tool outline plus clearance plus finger cutouts, clipped to the opening under the lip. Spec: the insert
// block and variant of Gridfinity/spec/bin_params.json; rules in Gridfinity/spec/insert_spec.md.
// Tools: [{name, outline: [[x, y], ...] (mm, tool frame), height, depth (null = height + depth_extra), x, y, rot (deg),
// fingers: "auto" | "none" | [{x, y, d}] (tool frame)}], placed in a layout frame; the box centres the layout.
// Needs setClipper() of src/outline.js.
import { binEnv, makeBin } from "./bin.js";
import { occHelpers } from "./occ.js";
import { area, bounds, circle, intersect, offset, rect, simplify, toolFingers, toolRegion, translate, union, svgPath } from "./outline.js";

// problem codes; the errors block the build, the warnings don't
export const ERRORS = new Set(["noTools", "noHeight", "badDepth", "tooBig", "tooSmall", "outside", "tooTall", "tooLow"]);

// derived numbers, pockets and problems, without the geometry kernel (the page's editor and datasheet use it too)
// inputs: x_count, y_count, z_count, auto_size, auto_height, magnets, clearance, finger_d, fill_lower
export function insertEnv(spec, inputs, tools) {
  const o = spec.official, d = spec.design, I = spec.insert, lip = o.lip, P = spec.variants.insert.parameters;
  const problems = [];
  // a tool without a height (not entered yet) counts as 0 mm for the sizes and blocks the build
  const items = tools.map((tool, i) => {
    const height = tool.height > 0 ? tool.height : 0;
    if (!(tool.height > 0)) problems.push({ code: "noHeight", tool: i });
    else if (tool.depth != null && !(tool.depth > 0)) problems.push({ code: "badDepth", tool: i });
    return {
      i, name: tool.name, height, depth: tool.depth > 0 ? tool.depth : height + I.depth_extra,
      region: toolRegion(tool, inputs.clearance, I.arc_tol),
      fingers: toolFingers(tool, inputs.finger_d),
    };
  });
  if (!items.length) problems.push({ code: "noTools" });

  // footprint: the pockets (without finger cutouts, which are clipped) need 42 n - 8.1 mm per direction:
  // 0.25 outline clearance + 2.6 lip depth + min_wall between pocket and opening, on both sides
  const lb = items.length ? bounds(items.flatMap((it) => it.region)) : { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };
  const pad = 2 * (o.clearance + lip.depth + I.min_wall);
  const units = (len) => Math.max(1, Math.ceil((len + pad - 1e-6) / o.pitch));
  const minXY = [units(lb.w), units(lb.h)];
  let [x_count, y_count] = inputs.auto_size ? minXY : [inputs.x_count, inputs.y_count];
  if (inputs.auto_size) {
    if (Math.max(...minXY) > I.max_units) problems.push({ code: "tooBig", x: minXY[0], y: minXY[1], max: I.max_units });
    x_count = Math.min(x_count, P.x_count.max);
    y_count = Math.min(y_count, P.y_count.max);
  } else if (x_count < minXY[0] || y_count < minXY[1]) problems.push({ code: "tooSmall", x: minXY[0], y: minXY[1] });

  // height: a box stacked on top seats at T + lip.height - foot.height (T - 0.35); fill and tool tops stay stack_gap below.
  // F = that - stack_gap - (largest tool protrusion above its pocket) - fill_lower; every pocket floor F - depth >= floor_top
  const seatOff = lip.height - o.foot.height, protrude = Math.max(0, ...items.map((it) => it.height - it.depth));
  const maxDepth = Math.max(0, ...items.map((it) => it.depth));
  const lower = inputs.fill_lower ?? 0;
  const minZ = Math.max(P.z_count.min,
    Math.ceil((d.floor_top + maxDepth - seatOff + I.stack_gap + protrude + lower - 1e-6) / o.height_unit));
  let z_count = inputs.auto_height ? minZ : inputs.z_count;
  if (inputs.auto_height && minZ > P.z_count.max) {
    problems.push({ code: "tooTall", z: minZ, max: P.z_count.max });
    z_count = P.z_count.max;
  } else if (!inputs.auto_height && z_count < minZ) problems.push({ code: "tooLow", z: minZ });

  const env = binEnv(spec, { variant: "standard", x_count, y_count, z_count, magnets: inputs.magnets });
  const { T, W, D } = env;
  const seat = T + seatOff, stackTop = seat - I.stack_gap;
  let F = stackTop - protrude - lower;
  for (const z of [T - d.lip_support, env.supportLow]) if (Math.abs(F - z) < 0.1) F = z - 0.1; // no sliver faces
  F = Math.max(F, d.floor_top);

  // pockets in the box frame: the automatic size centres the layout, a manual size keeps the tools where they are (the
  // layout frame is the box frame then); finger cutouts are clipped to the allowed area (opening minus min_wall)
  const [dx, dy] = inputs.auto_size && items.length ? [-(lb.x0 + lb.x1) / 2, -(lb.y0 + lb.y1) / 2] : [0, 0];
  const ax = W / 2 - lip.depth - I.min_wall, ay = D / 2 - lip.depth - I.min_wall;
  const allowed = [rect(-ax, -ay, ax, ay)];
  for (const it of items) {
    it.region = translate(it.region, dx, dy);
    const b = bounds(it.region);
    if (!problems.some((p) => p.code === "tooSmall") && (b.x0 < -ax - 1e-6 || b.x1 > ax + 1e-6 || b.y0 < -ay - 1e-6 || b.y1 > ay + 1e-6))
      problems.push({ code: "outside", tool: it.i });
    it.fingers = it.fingers.map((f) => ({ ...f, x: f.x + dx, y: f.y + dy }));
    const circles = it.fingers.map((f) => circle(f.x, f.y, f.d / 2, I.arc_tol));
    it.pocket = simplify(intersect(union([...it.region, ...circles]), allowed), I.simplify);
    it.floor = F - it.depth;
  }
  // pockets closer than min_wall (warning) or overlapping (warning: they merge)
  for (let a = 0; a < items.length; a++)
    for (let b = a + 1; b < items.length; b++) {
      const A = items[a].pocket, B = items[b].pocket;
      if (Math.abs(areaSum(intersect(A, B))) > 0.01) problems.push({ code: "overlap", tool: a, other: b });
      else if (Math.abs(areaSum(intersect(offset(A, I.min_wall / 2, 0.1), offset(B, I.min_wall / 2, 0.1)))) > 1e-4)
        problems.push({ code: "thinWall", tool: a, other: b });
    }

  // cut groups: pockets with the same floor merged (disjoint pieces then), deepest first
  const byFloor = new Map();
  for (const it of items) {
    const k = it.floor.toFixed(3);
    byFloor.set(k, [...(byFloor.get(k) ?? []), ...it.pocket]);
  }
  const groups = [...byFloor].map(([k, polys]) => ({ floor: Number(k), polys: union(polys) })).sort((p, q) => p.floor - q.floor);

  return {
    ...env, auto_size: inputs.auto_size, auto_height: inputs.auto_height, clearance: inputs.clearance,
    finger_d: inputs.finger_d, fill_lower: lower, min: { x: minXY[0], y: minXY[1], z: minZ },
    F, seat, stackTop, protrude, allowed: [ax, ay], shift: [dx, dy], items, groups, problems,
    ok: !problems.some((p) => ERRORS.has(p.code)),
  };
}
const areaSum = (polys) => polys.reduce((s, p) => s + area(p), 0);

// the box with its pockets; env from insertEnv (must be ok)
export function makeInsert(R, spec, env) {
  const { cut, step } = occHelpers(R);
  const bin = makeBin(R, spec, { variant: "standard", x_count: env.x_count, y_count: env.y_count, z_count: env.z_count,
    magnets: env.magnets, fill_top: env.F });
  const drawPoly = (pts) => {
    let pen = R.draw(pts[0]);
    for (let i = 1; i < pts.length; i++) pen = pen.lineTo(pts[i]);
    return pen.close();
  };
  // one prism per outer polygon (holes cut out), from the pocket floor to 1 mm above the insert surface
  const prisms = (polys, z0) => {
    const outers = polys.filter((p) => area(p) > 0), holes = polys.filter((p) => area(p) < 0);
    return outers.map((outer) => {
      let dr = drawPoly(outer);
      for (const h of holes) if (inside(h[0], outer)) dr = dr.cut(drawPoly(h));
      return dr.sketchOnPlane("XY", [0, 0, z0]).extrude(env.F + 1 - z0);
    });
  };
  function box() {
    let body = bin.box();
    env.groups.forEach((g, i) => {
      const tools = prisms(g.polys, g.floor);
      body = step(`pocket ${i + 1}`, () => cut(body, tools.length === 1 ? tools[0] : R.makeCompound(tools)));
    });
    return body;
  }
  return { env, box };
}

function inside([x, y], poly) { // even-odd point in polygon
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// 1:1 check print of the layout: box outline, opening, pockets and tool outlines (the tools are laid on it before
// printing the box). labels: {title, scale} in the page's language. Sizes in mm.
export function insertSvg(env, labels = {}) {
  const m = 6, w = env.W + 2 * m, h = env.D + 2 * m + 12, f = (v) => v.toFixed(2);
  // the tool outlines themselves: the pocket regions shrunk by the clearance
  const bare = env.items.map((it) => (env.clearance > 0 ? offset(it.region, -env.clearance, 0.05) : it.region));
  const g = (polys, style) => `<path d="${svgPath(polys, f)}" ${style}/>`;
  const rr = (hw, hd, r) => `<rect x="${f(-hw)}" y="${f(-hd)}" width="${f(2 * hw)}" height="${f(2 * hd)}" rx="${f(r)}"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="${f(-w / 2)} ${f(-env.D / 2 - m)} ${f(w)} ${f(h)}">`,
    `<g transform="scale(1,-1)" fill="none" stroke-linejoin="round">`,
    `<g stroke="#888" stroke-width="0.3">${rr(env.W / 2, env.D / 2, 3.75)}</g>`,
    `<g stroke="#bbb" stroke-width="0.2" stroke-dasharray="1.5 1">${rr(env.opening[0] / 2, env.opening[1] / 2, 1.15)}</g>`,
    ...env.items.map((it) => g(it.pocket, `stroke="#1f5fbf" stroke-width="0.25"`)),
    ...bare.map((p) => g(p, `stroke="#000" stroke-width="0.35"`)),
    `</g>`,
    `<g font-family="sans-serif" font-size="3.5" fill="#333">`,
    `<path d="M${f(-env.W / 2)} ${f(env.D / 2 + 6)}h50" stroke="#000" stroke-width="0.5"/>`,
    `<text x="${f(-env.W / 2 + 52)}" y="${f(env.D / 2 + 7.2)}">${labels.scale ?? "50 mm"}</text>`,
    labels.title ? `<text x="${f(-env.W / 2)}" y="${f(env.D / 2 + 11.5)}">${esc(labels.title)}</text>` : "",
    `</g></svg>`,
  ].join("\n") + "\n";
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Markdown build sheet; title: the model title in the sheet's language; t: translator of src/strings.js
export function insertBuildSheet(env, tag, title, t) {
  const lines = [
    `# ${title} ${tag}`,
    "",
    `- ${t("sheet.boxOutside", { w: env.W, d: env.D, top: env.top, wall: env.T })}`,
    `- ${t("sheet.boxGrid", { x: env.x_count, y: env.y_count, z: env.z_count })}`,
    `- ${t("sheet.toolSurface", { f: env.F, gap: env.seat - env.F })}`,
    `- ${t("sheet.toolClearance", { c: env.clearance })}`,
    `- ${env.magnets ? t("sheet.magnets", { n: env.x_count * env.y_count * 4 }) : t("sheet.noMagnets")}`,
    "",
    `## ${t("sheet.toolTools")}`,
    "",
    `| ${t("sheet.toolColName")} | ${t("sheet.toolColSize")} | ${t("sheet.toolColHeight")} | ${t("sheet.toolColDepth")} |`,
    "|---|---|---|---|",
    ...env.items.map((it) => {
      const b = bounds(it.region);
      return `| ${it.name} | ${t("sheet.toolSize", { a: b.w - 2 * env.clearance, b: b.h - 2 * env.clearance })} | ` +
        `${t("sheet.toolMm", { v: it.height })} | ${t("sheet.toolMm", { v: it.depth })} |`;
    }),
    "",
    `## ${t("sheet.printing")}`,
    "",
    `- ${t("sheet.toolPrint")}`,
    `- ${t("sheet.toolCheck")}`,
  ];
  return lines.join("\n") + "\n";
}
