// UV printing jig for the label plates of the Box with Label (src/bin.js): a flat plate with 10 pockets, the plates lie
// flush with its top. Spec: the jig block and variant of Gridfinity/spec/bin_params.json, rules in
// Gridfinity/spec/label_jig_spec.md. Frame: centred in X/Y, z = 0 under the jig; label 1 sits next to the chamfered
// corner (top left, -X +Y), labels count down the first column, then the second. Needs setClipper() of src/outline.js.
import { binEnv } from "./bin.js";
import { polygonDrawing } from "./geom2d.js";
import { occHelpers } from "./occ.js";
import { area, circle, rect, union } from "./outline.js";

// layout, sizes and printer fit, without the geometry kernel. inputs: x_count, layout ("auto" | "1" | "2"),
// plate_gap, clearance, base
export function jigEnv(spec, inputs) {
  const J = spec.jig;
  const [pl, pw, pt] = binEnv(spec, { variant: "label", x_count: inputs.x_count, y_count: 1, z_count: 3, plate_gap: inputs.plate_gap }).plate;
  const ql = pl + 2 * inputs.clearance, qw = pw + 2 * inputs.clearance; // pocket
  const H = inputs.base + pt;
  const fitsArea = (L, W, [a, b]) => (L <= Math.max(a, b) && W <= Math.min(a, b)) || (L <= Math.min(a, b) && W <= Math.max(a, b));
  const layout = (cols) => {
    const rows = J.count / cols;
    const L = 2 * J.border_end + cols * ql + (cols - 1) * J.web, W = 2 * J.border_side + rows * qw + (rows - 1) * J.web;
    return { cols, rows, L, W, uv: fitsArea(L, W, J.uv_area), bed: fitsArea(L, W, spec.bed) };
  };
  // automatic: two columns when they fit the UV printer, else one
  const two = layout(2), lay = inputs.layout === "1" ? layout(1) : inputs.layout === "2" ? two : two.uv ? two : layout(1);
  const pockets = Array.from({ length: J.count }, (_, i) => {
    const col = Math.floor(i / lay.rows), row = i % lay.rows;
    const x0 = -lay.L / 2 + J.border_end + col * (ql + J.web), y1 = lay.W / 2 - J.border_side - row * (qw + J.web);
    return { n: i + 1, x0, y0: y1 - qw, x1: x0 + ql, y1, notch: col === lay.cols - 1 && lay.cols > 1 ? "right" : "left" };
  });
  return { ...inputs, plate: [pl, pw, pt], pocket: [ql, qw], H, ...lay, pockets, uvArea: J.uv_area, mark: J.mark_chamfer };
}

// the jig; env from jigEnv
export function makeJig(R, spec, env) {
  const J = spec.jig, { cut, step } = occHelpers(R), [, , pt] = env.plate, { L, W, H } = env, c = J.mark_chamfer, r = J.corner_r;
  const drawPoly = (pts) => {
    let pen = R.draw(pts[0]);
    for (let i = 1; i < pts.length; i++) pen = pen.lineTo(pts[i]);
    return pen.close();
  };
  const prisms = (polys, z0, z1) => polys.filter((p) => area(p) > 0).map((p) => drawPoly(p).sketchOnPlane("XY", [0, 0, z0]).extrude(z1 - z0));
  // slab: rounded corners, the top left one chamfered (orientation mark)
  const slab = polygonDrawing(R.draw, [[-L / 2, W / 2 - c, 0], [-L / 2, -W / 2, r], [L / 2, -W / 2, r], [L / 2, W / 2, r], [-L / 2 + c, W / 2, 0]])
    .sketchOnPlane("XY").extrude(H);
  // pockets with round corner reliefs, one disjoint group; nail notches (deeper), another
  const rr = J.relief_d / 2, N = J.notch;
  const pocketPolys = env.pockets.flatMap((p) => union([rect(p.x0, p.y0, p.x1, p.y1),
    ...[[p.x0, p.y0], [p.x1, p.y0], [p.x1, p.y1], [p.x0, p.y1]].map(([x, y]) => circle(x, y, rr, 0.01))]));
  const notchPolys = env.pockets.flatMap((p) => {
    const yc = (p.y0 + p.y1) / 2, left = p.notch === "left", xe = left ? p.x0 - N.out + N.w / 2 : p.x1 + N.out - N.w / 2;
    const [a, b] = left ? [xe, p.x0 + N.in] : [p.x1 - N.in, xe];
    return union([rect(a, yc - N.w / 2, b, yc + N.w / 2), circle(xe, yc, N.w / 2, 0.01)]);
  });
  let body = slab;
  body = step("pockets", () => cut(body, R.makeCompound(prisms(pocketPolys, H - pt, H + 1))));
  body = step("notches", () => cut(body, R.makeCompound(prisms(notchPolys, H - pt - N.extra_depth, H + 1))));
  return body;
}

// 1:1 layout for the UV printer's software: jig outline and the 10 plates with their numbers (SVG, y down, mm)
export function jigSvg(env, labels = {}) {
  const f = (v) => v.toFixed(2), { L, W } = env, [pl, pw] = env.plate, c = env.mark;
  const plates = env.pockets.map((p) => {
    const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2; // model y up -> SVG y down
    return `<rect x="${f(cx - pl / 2 + L / 2)}" y="${f(W / 2 - cy - pw / 2)}" width="${f(pl)}" height="${f(pw)}" fill="none" stroke="#1f5fbf" stroke-width="0.25"/>` +
      `<text x="${f(cx - pl / 2 + L / 2 + 1.5)}" y="${f(W / 2 - cy + 1.3)}" font-size="3.5" font-family="sans-serif" fill="#1f5fbf">${p.n}</text>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(L)}mm" height="${f(W)}mm" viewBox="0 0 ${f(L)} ${f(W)}">`,
    labels.title ? `<title>${esc(labels.title)}</title>` : "",
    `<path d="M${f(c)} 0H${f(L)}V${f(W)}H0V${f(c)}Z" fill="none" stroke="#888" stroke-width="0.3"/>`,
    ...plates,
    `</svg>`,
  ].join("\n") + "\n";
}
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

// Markdown build sheet; title: the model title in the sheet's language; t: translator of src/strings.js
export function jigBuildSheet(env, tag, title, uvName, t) {
  const [pl, pw, pt] = env.plate;
  return [
    `# ${title} ${tag}`,
    "",
    `- ${t("sheet.jigPlates", { n: env.pockets.length, x: env.x_count, a: pl, b: pw, c: pt })}`,
    `- ${t("sheet.jigSize", { l: env.L, w: env.W, h: env.H, cols: env.cols, rows: env.rows })}`,
    `- ${t(env.uv ? "sheet.jigUvFits" : "sheet.jigUvTooBig", { name: uvName, a: env.uvArea[0], b: env.uvArea[1] })}`,
    `- ${t("sheet.jigClearance", { c: env.clearance })}`,
    "",
    `## ${t("sheet.printing")}`,
    "",
    `- ${t("sheet.jigPrint")}`,
    `- ${t("sheet.jigUse")}`,
    `- ${t("sheet.jigLayout")}`,
  ].join("\n") + "\n";
}
