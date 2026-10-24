// Tool tracing from a photo of tools lying on a sheet of paper (OpenCV.js; runs in the trace worker and in Node).
// 1. findSheet: the paper's 4 corners in the photo (bright, unsaturated region; sides fitted as lines)
// 2. rectify: perspective-corrected image of the sheet at ppm pixels per mm
// 3. traceTools: tool silhouettes on the rectified sheet -> polygons in mm (sheet frame: origin bottom left, y up)
// The cv module is passed in (the worker loads ./vendor/opencv.js, Node requires @techstark/opencv-js).
// Every cv.Mat is freed here except the ones returned (documented per function).
export const PAPERS = { A4: [210, 297], A3: [297, 420], Letter: [215.9, 279.4] };

const odd = (v) => Math.max(1, Math.round(v) | 1);

function withMats(fn) { // collects Mats created by fn and frees them afterwards
  const mats = [];
  const track = (m) => (mats.push(m), m);
  try {
    return fn(track);
  } finally {
    for (const m of mats) if (!m.isDeleted()) m.delete();
  }
}

// corners [[x, y] x 4] -> order top left, top right, bottom right, bottom left (image coordinates, y down)
export function orderCorners(pts) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / 4, cy = pts.reduce((s, p) => s + p[1], 0) / 4;
  const byAngle = [...pts].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let start = 0;
  byAngle.forEach((p, i) => { if (p[0] + p[1] < byAngle[start][0] + byAngle[start][1]) start = i; });
  return [0, 1, 2, 3].map((i) => byAngle[(start + i) % 4]);
}

// 1. rgba: cv.Mat CV_8UC4 (the photo). Returns {found, corners (ordered, image px), area (fraction of the photo)}.
export function findSheet(cv, rgba, { maxSide = 1400 } = {}) {
  return withMats((T) => {
    const scale = Math.min(1, maxSide / Math.max(rgba.cols, rgba.rows));
    const small = T(new cv.Mat());
    cv.resize(rgba, small, new cv.Size(Math.round(rgba.cols * scale), Math.round(rgba.rows * scale)), 0, 0, cv.INTER_AREA);
    const rgb = T(new cv.Mat()), hsv = T(new cv.Mat());
    cv.cvtColor(small, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    const ch = T(new cv.MatVector());
    cv.split(hsv, ch);
    // whiteness = V - S: paper is bright and unsaturated
    const white = T(new cv.Mat()), mask = T(new cv.Mat());
    cv.subtract(ch.get(2), ch.get(1), white);
    ch.get(0).delete(); ch.get(1).delete(); ch.get(2).delete();
    cv.GaussianBlur(white, white, new cv.Size(5, 5), 0);
    cv.threshold(white, mask, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    const k = T(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7)));
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, k);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, k);

    const contours = T(new cv.MatVector()), hier = T(new cv.Mat());
    cv.findContours(mask, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
    let best = -1, bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i), a = cv.contourArea(c);
      if (a > bestArea) { bestArea = a; best = i; }
      c.delete();
    }
    const total = small.cols * small.rows;
    if (best < 0 || bestArea < 0.04 * total) return { found: false, corners: defaultCorners(rgba), area: 0 };
    const cont = T(contours.get(best));
    const hull = T(new cv.Mat());
    cv.convexHull(cont, hull, false, true);
    // quadrilateral: approximate the hull with growing tolerance until 4 corners remain
    let quad = null;
    const peri = cv.arcLength(hull, true);
    for (let f = 0.01; f <= 0.1 && !quad; f += 0.005) {
      const ap = new cv.Mat();
      cv.approxPolyDP(hull, ap, f * peri, true);
      if (ap.rows === 4) quad = Array.from({ length: 4 }, (_, i) => [ap.data32S[2 * i], ap.data32S[2 * i + 1]]);
      ap.delete();
    }
    if (!quad) {
      const r = cv.minAreaRect(cont), pts = cv.RotatedRect.points(r);
      quad = pts.map((p) => [p.x, p.y]);
    }
    quad = orderCorners(quad);
    const pts = Array.from({ length: cont.rows }, (_, i) => [cont.data32S[2 * i], cont.data32S[2 * i + 1]]);
    const refined = refineCorners(quad, pts);
    // pixel centres sit at integer coordinates in both images: small pixel i spans the photo's (i - 0.5 .. i + 0.5) / scale
    const toPhoto = (v) => (v + 0.5) / scale - 0.5;
    return { found: true, corners: refined.map(([x, y]) => [toPhoto(x), toPhoto(y)]), area: bestArea / total };
  });
}

// fit a line to the contour points along each side (middle 80 %, within 1.5 % of the side length), intersect neighbours.
// The contour runs through the outermost paper pixels: the sheet's edge lies half a pixel further out.
function refineCorners(quad, pts) {
  const qx = quad.reduce((s, p) => s + p[0], 0) / 4, qy = quad.reduce((s, p) => s + p[1], 0) / 4;
  const outward = (l) => { // move a line half a pixel away from the quad's centre
    let nx = -l.uy, ny = l.ux;
    if (nx * (l.px - qx) + ny * (l.py - qy) < 0) { nx = -nx; ny = -ny; }
    return { ...l, px: l.px + 0.5 * nx, py: l.py + 0.5 * ny };
  };
  const lines = quad.map((a, i) => {
    const b = quad[(i + 1) % 4], ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey), ux = ex / len, uy = ey / len;
    const sel = pts.filter(([x, y]) => {
      const t = ((x - a[0]) * ux + (y - a[1]) * uy) / len, d = Math.abs((x - a[0]) * uy - (y - a[1]) * ux);
      return t > 0.1 && t < 0.9 && d < 0.015 * len;
    });
    if (sel.length < 10) return { px: a[0], py: a[1], ux, uy };
    // total least squares: centroid + principal direction
    const mx = sel.reduce((s, p) => s + p[0], 0) / sel.length, my = sel.reduce((s, p) => s + p[1], 0) / sel.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of sel) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return outward({ px: mx, py: my, ux: Math.cos(ang), uy: Math.sin(ang) });
  });
  const side = Math.min(...quad.map((a, i) => Math.hypot(quad[(i + 1) % 4][0] - a[0], quad[(i + 1) % 4][1] - a[1])));
  return quad.map((q, i) => {
    const l1 = lines[(i + 3) % 4], l2 = lines[i]; // corner i joins side i-1 and side i
    const den = l1.ux * l2.uy - l1.uy * l2.ux;
    if (Math.abs(den) < 1e-6) return q;
    const t = ((l2.px - l1.px) * l2.uy - (l2.py - l1.py) * l2.ux) / den;
    const p = [l1.px + t * l1.ux, l1.py + t * l1.uy];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.05 * side ? p : q; // a far jump means a bad fit: keep the hull corner
  });
}

function defaultCorners(m) { // a centred guess for the corner editor when no sheet was found
  const w = m.cols, h = m.rows;
  return [[0.2 * w, 0.2 * h], [0.8 * w, 0.2 * h], [0.8 * w, 0.8 * h], [0.2 * w, 0.8 * h]];
}

// 2. Returns {mat (CV_8UC4, the caller deletes it), wMm, hMm, ppm}. The sheet keeps its orientation in the photo:
// if the top side (corner 0 -> 1) is the longer one, the output is landscape.
export function rectify(cv, rgba, corners, paper, ppm = 5) {
  const [c0, c1, c2, c3] = corners, d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const landscape = d(c0, c1) + d(c3, c2) > d(c0, c3) + d(c1, c2);
  const [wMm, hMm] = landscape ? [Math.max(...paper), Math.min(...paper)] : [Math.min(...paper), Math.max(...paper)];
  const W = Math.round(wMm * ppm), H = Math.round(hMm * ppm);
  const out = new cv.Mat();
  withMats((T) => {
    const src = T(cv.matFromArray(4, 1, cv.CV_32FC2, corners.flat()));
    const dst = T(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, W, 0, W, H, 0, H]));
    const M = T(cv.getPerspectiveTransform(src, dst));
    cv.warpPerspective(rgba, out, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  });
  return { mat: out, wMm: W / ppm, hMm: H / ppm, ppm };
}

// 3. sheet: rectified CV_8UC4 sheet image at ppm. Returns {tools: [{outline (mm, y up, as traced), area (mm²)}],
// mask (CV_8UC1 at the sheet's size, the caller deletes it), threshold}.
// sensitivity -1..1: higher finds fainter (lighter) parts and more shadow. margin: mm ignored along the sheet edges.
export function traceTools(cv, sheet, { ppm = 5, sensitivity = 0, margin = 4, minArea = 80 } = {}) {
  const W = sheet.cols, H = sheet.rows;
  const mask = new cv.Mat();
  const result = withMats((T) => {
    const rgb = T(new cv.Mat()), lab = T(new cv.Mat());
    cv.cvtColor(sheet, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
    const ch = T(new cv.MatVector());
    cv.split(lab, ch);
    const L = T(ch.get(0)), A = T(ch.get(1)), B = T(ch.get(2));
    cv.GaussianBlur(L, L, new cv.Size(3, 3), 0);

    // paper model: a quadratic brightness surface fitted to paper pixels (smooth lighting gradients), plus the paper's
    // colour cast (median a, b); two rounds, re-classifying paper pixels against the model
    const step = Math.max(2, Math.round(ppm * 2)), m0 = Math.round(margin * ppm);
    const samples = [];
    for (let y = m0; y < H - m0; y += step)
      for (let x = m0; x < W - m0; x += step) samples.push([x / W, y / H, L.ucharAt(y, x), A.ucharAt(y, x), B.ucharAt(y, x)]);
    const Ls = samples.map((s) => s[2]).sort((a, b) => a - b);
    let model = { c: [Ls[Math.floor(Ls.length * 0.75)], 0, 0, 0, 0, 0] }; // start: flat at the 75th percentile
    for (let round = 0; round < 3; round++) {
      const paper = samples.filter((s) => s[2] > 0.85 * evalQ(model.c, s[0], s[1]));
      if (paper.length > 30) model = { c: fitQ(paper) };
    }
    const paperPx = samples.filter((s) => s[2] > 0.85 * evalQ(model.c, s[0], s[1]));
    const med = (arr) => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)] ?? 128;
    const a0 = med(paperPx.map((s) => s[3])), b0 = med(paperPx.map((s) => s[4]));

    // score: darkness against the paper model, or colour distance from the paper, 0..255
    const score = T(new cv.Mat(H, W, cv.CV_8UC1));
    const Ld = L.data, Ad = A.data, Bd = B.data, Sd = score.data, c = model.c;
    for (let y = 0; y < H; y++) {
      const v = y / H, k0 = c[0] + c[2] * v + c[5] * v * v, k1 = c[1] + c[4] * v; // model along the row: k0 + k1 u + c3 u²
      for (let x = 0; x < W; x++) {
        const i = y * W + x, u = x / W, ref = Math.max(1, k0 + k1 * u + c[3] * u * u);
        const dark = 1 - Ld[i] / ref, chroma = Math.hypot(Ad[i] - a0, Bd[i] - b0) / 60;
        Sd[i] = Math.max(0, Math.min(255, Math.round(255 * Math.max(dark, chroma))));
      }
    }
    // threshold: Otsu between paper and tools, at least 15 % darker than the paper; sensitivity moves it
    const tmp = T(new cv.Mat());
    const otsu = cv.threshold(score, tmp, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    const thr = Math.max(0.15 * 255, otsu) * (1 - 0.45 * sensitivity);
    cv.threshold(score, mask, thr, 255, cv.THRESH_BINARY);
    const k1 = T(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3)));
    const k2 = T(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(odd(1.0 * ppm), odd(1.0 * ppm))));
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, k1);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, k2);
    if (m0 > 0) { // clear the margin band
      const black = new cv.Scalar(0);
      cv.rectangle(mask, new cv.Point(0, 0), new cv.Point(W - 1, m0), black, -1);
      cv.rectangle(mask, new cv.Point(0, H - 1 - m0), new cv.Point(W - 1, H - 1), black, -1);
      cv.rectangle(mask, new cv.Point(0, 0), new cv.Point(m0, H - 1), black, -1);
      cv.rectangle(mask, new cv.Point(W - 1 - m0, 0), new cv.Point(W - 1, H - 1), black, -1);
    }

    // outer contours -> polygons in mm, y up (pixel centres sit at integer coordinates, the sheet spans 0..W x 0..H;
    // the contour runs through the outermost tool pixels, so the true boundary lies half a pixel further out)
    const contours = T(new cv.MatVector()), hier = T(new cv.Mat());
    const work = T(mask.clone());
    cv.findContours(work, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
    const tools = [];
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i), a = cv.contourArea(c) / (ppm * ppm);
      if (a >= minArea) {
        const ap = new cv.Mat();
        cv.approxPolyDP(c, ap, Math.max(0.5, 0.12 * ppm), true);
        const outline = Array.from({ length: ap.rows }, (_, j) => [ap.data32S[2 * j] / ppm, (H - ap.data32S[2 * j + 1]) / ppm]);
        ap.delete();
        if (outline.length >= 3) tools.push({ outline, area: a });
      }
      c.delete();
    }
    tools.sort((p, q) => q.area - p.area);
    return { tools, threshold: thr, halfPixel: 0.5 / ppm };
  });
  return { ...result, mask };
}

// quadratic surface c0 + c1 u + c2 v + c3 u² + c4 uv + c5 v² (u, v in 0..1), least squares via normal equations
const terms = (u, v) => [1, u, v, u * u, u * v, v * v];
const evalQ = (c, u, v) => Math.max(1, terms(u, v).reduce((s, t, i) => s + c[i] * t, 0));
function fitQ(samples) {
  const N = Array.from({ length: 6 }, () => new Float64Array(7));
  for (const [u, v, l] of samples) {
    const t = terms(u, v);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) N[i][j] += t[i] * t[j];
      N[i][6] += t[i] * l;
    }
  }
  for (let i = 0; i < 6; i++) { // Gauss-Jordan with partial pivoting
    let p = i;
    for (let r = i + 1; r < 6; r++) if (Math.abs(N[r][i]) > Math.abs(N[p][i])) p = r;
    [N[i], N[p]] = [N[p], N[i]];
    const d = N[i][i] || 1e-12;
    for (let j = i; j < 7; j++) N[i][j] /= d;
    for (let r = 0; r < 6; r++) if (r !== i) {
      const f = N[r][i];
      for (let j = i; j < 7; j++) N[r][j] -= f * N[i][j];
    }
  }
  return N.map((row) => row[6]);
}
