// 2D geometry of the tool insert: polygons in mm as [[x, y], ...], counter-clockwise, without a repeated end point.
// Pure JS on top of Clipper (clipper-lib 6.4.2: offsets and booleans in integer µm). The library is injected once with
// setClipper(), like replicad's setOC: the page and the worker pass ./vendor/clipper.js, the Node checks
// require("clipper-lib").
let C = null;
export const setClipper = (lib) => { C = lib; };

const S = 1000; // Clipper units per mm
const toPath = (pts) => pts.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
const fromPath = (p) => p.map(({ X, Y }) => [X / S, Y / S]);
const toPaths = (polys) => polys.map(toPath);
const fromPaths = (paths) => paths.map(fromPath).filter((p) => p.length >= 3);

// ---------- measures ----------
export function area(pts) { // signed: > 0 counter-clockwise
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}
export const areaOf = (polys) => polys.reduce((s, p) => s + area(p), 0);

// centroid and principal axis (angle of the direction of largest spread, radians) of a simple polygon
export function moments(pts) {
  let a = 0, cx = 0, cy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n], c = x0 * y1 - x1 * y0;
    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
    sxx += (x0 * x0 + x0 * x1 + x1 * x1) * c;
    syy += (y0 * y0 + y0 * y1 + y1 * y1) * c;
    sxy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c;
  }
  a /= 2;
  cx /= 6 * a;
  cy /= 6 * a;
  // second moments about the centroid (integrals of x², y², xy over the area), independent of the orientation
  const sg = Math.sign(a), A = Math.abs(a);
  const ixx = (sg * sxx) / 12 - A * cx * cx, iyy = (sg * syy) / 12 - A * cy * cy, ixy = (sg * sxy) / 24 - A * cx * cy;
  // round or square shapes have no main direction: take the X axis instead of numerical noise
  const flat = Math.hypot(ixx - iyy, 2 * ixy) < 1e-3 * (ixx + iyy);
  return { area: A, cx, cy, angle: flat ? 0 : 0.5 * Math.atan2(2 * ixy, ixx - iyy) };
}

export function bounds(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// ---------- transforms ----------
export function place(pts, { x = 0, y = 0, rot = 0 } = {}) { // rotate (degrees, counter-clockwise) about the origin, then move
  const c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180);
  return pts.map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
}
export const translate = (polys, dx, dy) => polys.map((p) => p.map(([x, y]) => [x + dx, y + dy]));

// ---------- booleans and offsets ----------
// non-zero fill; results are strictly simple (pieces touching in a point come out separate), outers counter-clockwise
function boolOp(type, a, b = []) {
  const c = new C.Clipper();
  c.StrictlySimple = true;
  c.AddPaths(toPaths(a), C.PolyType.ptSubject, true);
  if (b.length) c.AddPaths(toPaths(b), C.PolyType.ptClip, true);
  const out = new C.Paths();
  c.Execute(type, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return fromPaths(out);
}
export const union = (polys) => boolOp(C.ClipType.ctUnion, polys);
export const intersect = (a, b) => boolOp(C.ClipType.ctIntersection, a, b);
export const difference = (a, b) => boolOp(C.ClipType.ctDifference, a, b);

// round-joined offset (negative shrinks); arcTol = max deviation of the polygonised rounds, mm
export function offset(polys, d, arcTol = 0.02) {
  if (Math.abs(d) < 1e-6) return union(polys);
  const co = new C.ClipperOffset(2, arcTol * S);
  co.AddPaths(toPaths(polys), C.JoinType.jtRound, C.EndType.etClosedPolygon);
  const out = new C.Paths();
  co.Execute(out, d * S);
  return fromPaths(out);
}

// Ramer-Douglas-Peucker on closed polygons: drops points closer than eps (mm) to the simplified outline
function rdp(pts, eps) {
  const n = pts.length;
  if (n <= 4) return pts;
  // split at the two points farthest apart (point 0 and the point farthest from it), simplify both chains
  let far = 0, dMax = -1;
  for (let i = 1; i < n; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > dMax) { dMax = d; far = i; }
  }
  const keep = new Uint8Array(n);
  keep[0] = keep[far] = 1;
  const stack = [[0, far], [far, n]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const [ax, ay] = pts[i0], [bx, by] = pts[i1 % n], ex = bx - ax, ey = by - ay, len = Math.hypot(ex, ey);
    let best = -1, bd = eps;
    for (let i = i0 + 1; i < i1; i++) {
      const [px, py] = pts[i];
      const d = len > 1e-12 ? Math.abs((px - ax) * ey - (py - ay) * ex) / len : Math.hypot(px - ax, py - ay);
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([i0, best], [best, i1]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
export const simplify = (polys, eps) => polys.map((p) => rdp(p, eps)).filter((p) => p.length >= 3);

export function circle(cx, cy, r, tol = 0.02) {
  const n = Math.max(12, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tol / r))));
  return Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]);
}
export const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// ---------- tool outlines ----------
// cleans a traced or hand-made outline: one simple counter-clockwise polygon (the largest piece), self-intersections
// resolved, holes dropped, simplified to eps; centred on its centroid unless keepOrigin
export function cleanOutline(pts, { eps = 0.05, keepOrigin = false } = {}) {
  const pieces = union([pts]).filter((p) => area(p) > 0);
  if (!pieces.length) return null;
  let best = pieces.reduce((a, b) => (area(b) > area(a) ? b : a));
  best = simplify([best], eps)[0] ?? best;
  if (area(best) < 0) best.reverse();
  if (keepOrigin) return best;
  const m = moments(best);
  return best.map(([x, y]) => [x - m.cx, y - m.cy]);
}

// automatic finger cutouts: two circles centred where the tool's minor principal axis through its centroid leaves the
// outline (on both sides), in the tool's own frame
export function autoFingers(pts, d) {
  const m = moments(pts), vx = -Math.sin(m.angle), vy = Math.cos(m.angle);
  let tMin = 0, tMax = 0;
  for (let i = 0, n = pts.length; i < n; i++) { // intersections of the line c + t v with every edge
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n], ex = x1 - x0, ey = y1 - y0;
    const den = vx * ey - vy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const qx = x0 - m.cx, qy = y0 - m.cy;
    const u = (qx * vy - qy * vx) / den; // position on the edge
    if (u < 0 || u > 1) continue;
    const t = (qx * ey - qy * ex) / den;
    if (t > tMax) tMax = t;
    if (t < tMin) tMin = t;
  }
  return [tMax, tMin].filter((t) => Math.abs(t) > 1e-6).map((t) => ({ x: m.cx + t * vx, y: m.cy + t * vy, d }));
}

// the region a tool occupies in its pocket (outline + clearance), and the whole pocket (plus finger cutouts),
// both in the layout frame
export function toolRegion(tool, clearance, arcTol) {
  return offset([place(tool.outline, tool)], clearance, arcTol);
}
export function toolFingers(tool, fingerD) {
  const list = tool.fingers === "auto" || tool.fingers == null ? autoFingers(tool.outline, fingerD)
    : tool.fingers === "none" ? [] : tool.fingers;
  return list.map((f) => {
    const [[x, y]] = place([[f.x, f.y]], tool);
    return { x, y, d: f.d ?? fingerD };
  });
}

export function convexHull(pts) { // monotone chain, counter-clockwise
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of p.reverse()) {
    while (hi.length >= 2 && cross(hi.at(-2), hi.at(-1), q) <= 0) hi.pop();
    hi.push(q);
  }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}

// rotation (degrees) for the automatic layout, long side along X, straight: as photographed when the tool's principal
// axis is within 4 degrees of the sheet's axes (tools usually lie along the sheet), otherwise along its principal axis
// (straightens a tool that lay askew). Diagonal (minimum-area) placements only when no straight one fits:
// fits(w, h) says whether a pocket of that size fits the printer.
export function flatRotation(pts, fits = () => true) {
  const h = convexHull(pts), norm = (r) => ((r % 360) + 360) % 360;
  const pa = (-moments(pts).angle * 180) / Math.PI, off = Math.abs(((pa % 90) + 135) % 90 - 45);
  const straight = off < 4 ? [0, 90, pa, pa + 90] : [pa, pa + 90, 0, 90];
  for (const rot of straight) {
    const b = bounds([place(h, { rot })]);
    if (b.w >= b.h * 0.995 && fits(b.w, b.h)) return norm(rot); // long side along X (round shapes: either way, keep 0)
  }
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const [x0, y0] = h[i], [x1, y1] = h[(i + 1) % h.length], e = (-Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    for (const rot of [e, e + 90]) {
      const b = bounds([place(h, { rot })]);
      if (b.w < b.h * 0.995) continue;
      const score = [fits(b.w, b.h) ? 0 : 1, b.w * b.h];
      if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) best = { score, rot };
    }
  }
  return norm(best?.rot ?? 0);
}

// automatic layout: every tool turned flat, then shelf-packed (tallest first) into rows; tries every row width from
// the widest tool up to maxUnits and keeps the one with the fewest grid cells (then the squarest), or packs into a
// given box width (rowUnits, for a manual footprint). Spacing uses the whole pocket (outline + clearance + finger
// cutouts) plus gap. Returns copies of the tools with x, y, rot set.
export function arrange(tools, { clearance, fingerD, gap, pitch = 42, pad = 8.1, maxUnits = 8, rowUnits = null }) {
  const fits = (w, h) => Math.max(w, h) + 2 * clearance + pad <= maxUnits * pitch;
  const parts = tools.map((tool) => {
    const rot = flatRotation(tool.outline, fits), placed = { ...tool, rot, x: 0, y: 0 };
    const circles = toolFingers(placed, fingerD).map((f) => circle(f.x, f.y, f.d / 2, 0.2));
    const b = bounds([...toolRegion(placed, clearance, 0.1), ...circles]);
    return { tool, rot, b, w: b.w + gap, h: b.h + gap };
  });
  if (!parts.length) return [];
  const order = [...parts].sort((p, q) => q.h - p.h);
  const units = (len) => Math.max(1, Math.ceil((len - gap + pad - 1e-6) / pitch));
  let best = null;
  const minW = Math.max(...parts.map((p) => p.w));
  const [uFrom, uTo] = rowUnits ? [rowUnits, rowUnits] : [units(minW), Math.max(units(minW), maxUnits)];
  for (let u = uFrom; u <= uTo; u++) {
    const width = u * pitch - pad + gap; // usable row length including one trailing gap
    let x = 0, y = 0, rowH = 0, usedW = 0;
    const pos = new Map();
    for (const p of order) {
      if (x > 0 && x + p.w > width + 1e-6) { y += rowH; x = 0; rowH = 0; }
      pos.set(p, [x, y]);
      x += p.w;
      usedW = Math.max(usedW, x);
      rowH = Math.max(rowH, p.h);
    }
    const ux = units(usedW), uy = units(y + rowH), score = [ux * uy, Math.abs(ux - uy)];
    if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) best = { score, pos };
  }
  return parts.map((p) => {
    const [x, y] = best.pos.get(p);
    // the pocket's lower left corner goes to (x, y); the layout is centred by insertEnv anyway
    return { ...p.tool, rot: p.rot, x: x - p.b.x0, y: -(y + p.h - gap) - p.b.y0 };
  });
}

// SVG path data of polygons (y up in the model, so the caller flips the y axis)
export const svgPath = (polys, f = (v) => v.toFixed(2)) =>
  polys.map((p) => `M${p.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`).join("");
