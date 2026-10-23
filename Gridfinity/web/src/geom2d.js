// 2-D helpers shared by all parts. roundPolygon is the same math as round_polygon() in
// Gridfinity/fusion/cad/_case.py, so the browser build matches the Fusion build.

const unit = (dx, dy) => {
  const n = Math.hypot(dx, dy);
  return [dx / n, dy / n];
};

// [[u, v, r], ...] closed polygon -> primitives [{type: "line", a, b} | {type: "arc", a, m, b}] with rounded vertices
export function roundPolygon(pts) {
  const nodes = pts.map(([u, v, r], i) => {
    if (!(r > 0)) return { p: [u, v] };
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[(i + 1) % pts.length];
    const u1 = unit(a[0] - u, a[1] - v);
    const u2 = unit(b[0] - u, b[1] - v);
    const theta = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    const d = r / Math.tan(theta / 2);
    const w = unit(u1[0] + u2[0], u1[1] + u2[1]);
    const h = r / Math.sin(theta / 2);
    const c = [u + w[0] * h, v + w[1] * h];
    return { t1: [u + u1[0] * d, v + u1[1] * d], m: [c[0] - w[0] * r, c[1] - w[1] * r], t2: [u + u2[0] * d, v + u2[1] * d] };
  });
  const prims = [];
  nodes.forEach((nd, i) => {
    if (nd.t1) prims.push({ type: "arc", a: nd.t1, m: nd.m, b: nd.t2 });
    const a = nd.p ?? nd.t2;
    const nx = nodes[(i + 1) % nodes.length];
    const b = nx.p ?? nx.t1;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6) prims.push({ type: "line", a, b });
  });
  return prims;
}

// Primitives -> replicad Drawing (closed). draw = replicad's draw()
export function primsToDrawing(draw, prims) {
  let pen = draw(prims[0].a);
  for (const pr of prims) {
    pen = pr.type === "line" ? pen.lineTo(pr.b) : pen.threePointsArcTo(pr.b, pr.m);
  }
  return pen.close();
}

export function polygonDrawing(draw, pts) {
  return primsToDrawing(draw, roundPolygon(pts));
}

// Rounded rectangle centred at (cx, cy) as primitives (corner radius r, may be 0)
export function rrectPrims(cx, cy, w, h, r) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  return roundPolygon([[x0, y0, r], [x1, y0, r], [x1, y1, r], [x0, y1, r]]);
}
