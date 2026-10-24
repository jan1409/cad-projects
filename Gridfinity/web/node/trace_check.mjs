// How accurate is the tracing (src/trace.js)? Synthetic photos: tools of node/fixtures/tools.json drawn on an A4 sheet
// lying on a desk, with drop shadows, a lighting gradient, a coloured tool, perspective (camera tilt and turn), blur
// and sensor noise. The traced outlines are compared with the drawn ones: bounding box size, area, and the largest
// distance between the two outlines (both directions).
//   node node/trace_check.mjs [--png <dir>]     -> table; --png writes the photos and overlays (needs no extra tools)
//   node node/trace_check.mjs <photo.jpg> [--paper A4] [--png <dir>]   -> traces a real photo, lists the tools
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { findSheet, rectify, traceTools, PAPERS } from "../src/trace.js";
import { setClipper, offset, cleanOutline, bounds, area, place, circle } from "../src/outline.js";

const require = createRequire(import.meta.url);
setClipper(require("clipper-lib"));
let cv = require("@techstark/opencv-js");
if (typeof cv.then === "function") cv = await cv;
const fixtures = JSON.parse(fs.readFileSync(new URL("./fixtures/tools.json", import.meta.url)));
const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const pngDir = opt("--png");

// ---------- helpers ----------
function writePng(file, mat) { // RGBA or gray Mat -> PNG (stored, zlib via node:zlib)
  const zlib = require("node:zlib");
  const rgba = new cv.Mat();
  if (mat.channels() === 1) cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA); else mat.copyTo(rgba);
  const w = rgba.cols, h = rgba.rows, raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.data.buffer, rgba.data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  rgba.delete();
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]));
}
const segDist = ([px, py], [ax, ay], [bx, by]) => {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey, t = l2 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / l2)) : 0;
  return Math.hypot(px - ax - t * ex, py - ay - t * ey);
};
const densify = (poly, step = 0.5) => poly.flatMap((a, i) => {
  const b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  return Array.from({ length: n }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
});
const toPoly = (pts, poly) => Math.min(...poly.map((a, i) => segDist(pts, a, poly[(i + 1) % poly.length])));
// distances between two outlines, both directions: [95th percentile, maximum]
function deviation(A, B) {
  const d = [...densify(A).map((p) => toPoly(p, B)), ...densify(B).map((p) => toPoly(p, A))].sort((a, b) => a - b);
  return [d[Math.floor(d.length * 0.95)], d.at(-1)];
}
const fixtureOutline = (key) => {
  const f = fixtures.tools[key];
  return cleanOutline(f.circle ? circle(0, 0, f.circle) : f.outline, { eps: 0.01 });
};

// ---------- synthetic photo ----------
// tools: [{key, x, y, rot, color}] on the sheet: (x, y) = centre of the turned tool's bounding box (mm, y up, origin
// bottom left of the sheet); every tool keeps 10 mm from the sheet edges (the tracer ignores a 4 mm border)
// shadow: offset (mm) and strength (darkening) of the drop shadow, like a lamp at the top left
function scene({ tools, cam, sheet = [210, 297], shadow = 2.5, shadowK = 0.25, gradient = 0.25, noise = 4, blur = 0.8 }) {
  const s = 6, desk = [sheet[0] + 160, sheet[1] + 120], W = Math.round(desk[0] * s), H = Math.round(desk[1] * s);
  const x0 = 80, y0 = 60; // sheet's top left corner on the desk, mm
  const toPx = ([X, Y]) => [(x0 + X) * s, (y0 + sheet[1] - Y) * s];
  const flat = new cv.Mat(H, W, cv.CV_8UC4, new cv.Scalar(78, 62, 50, 255));
  const shade = new cv.Mat(H, W, cv.CV_8UC1, new cv.Scalar(255));
  const poly = (mat, pts, color) => {
    const mv = new cv.MatVector(), m = cv.matFromArray(pts.length, 1, cv.CV_32SC2, pts.flatMap((p) => p.map(Math.round)));
    mv.push_back(m);
    cv.fillPoly(mat, mv, color, cv.LINE_AA);
    m.delete(); mv.delete();
  };
  poly(flat, [[0, 0], [sheet[0], 0], [sheet[0], sheet[1]], [0, sheet[1]]].map(toPx), new cv.Scalar(242, 240, 233, 255));
  const truth = tools.map((t) => {
    const p = place(fixtureOutline(t.key), { rot: t.rot }), b = bounds([p]);
    const poly = p.map(([X, Y]) => [X - b.x0 - b.w / 2 + t.x, Y - b.y0 - b.h / 2 + t.y]), q = bounds([poly]);
    if (q.x0 < 10 || q.y0 < 10 || q.x1 > sheet[0] - 10 || q.y1 > sheet[1] - 10) throw new Error(`${t.key} is closer than 10 mm to the sheet edge`);
    return { ...t, poly };
  });
  for (const t of truth) poly(shade, t.poly.map(([X, Y]) => toPx([X + shadow, Y - shadow])), new cv.Scalar(Math.round(255 * (1 - shadowK))));
  cv.GaussianBlur(shade, shade, new cv.Size(0, 0), shadow * s * 0.6);
  for (const t of truth) poly(flat, t.poly.map(toPx), t.color ?? new cv.Scalar(48, 48, 54, 255));
  // shadow and lighting gradient: multiply
  const fd = flat.data, sd = shade.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = (1 - gradient) + gradient * (0.5 + 0.5 * Math.cos((x / W) * 2.2 + (y / H) * 1.3)), f = g * (sd[y * W + x] / 255), i = (y * W + x) * 4;
    fd[i] *= f; fd[i + 1] *= f; fd[i + 2] *= f;
  }
  shade.delete();
  // camera: the sheet corners go to the given quad of a 3000 x 2250 photo
  const corners = [[0, sheet[1]], [sheet[0], sheet[1]], [sheet[0], 0], [0, 0]].map(toPx);
  const src = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flat()), dst = cv.matFromArray(4, 1, cv.CV_32FC2, cam.flat());
  const M = cv.getPerspectiveTransform(src, dst), photo = new cv.Mat();
  cv.warpPerspective(flat, photo, M, new cv.Size(cam.w ?? 3000, cam.h ?? 2250), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  src.delete(); dst.delete(); M.delete(); flat.delete();
  if (blur) cv.GaussianBlur(photo, photo, new cv.Size(0, 0), blur);
  const pd = photo.data;
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2 * noise;
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v); // Uint8Array wraps instead of clamping
  for (let i = 0; i < pd.length; i += 4) {
    const n = rnd();
    pd[i] = clamp(pd[i] + n); pd[i + 1] = clamp(pd[i + 1] + n); pd[i + 2] = clamp(pd[i + 2] + n);
  }
  return { photo, truth };
}

const SCENES = {
  frontal: { cam: [[900, 120], [2100, 120], [2100, 1820], [900, 1820]], tools: [
    { key: "caliper", x: 70, y: 148, rot: 90 }, { key: "lenscap", x: 160, y: 60, rot: 0 }] },
  tilted: { cam: [[980, 260], [2050, 180], [2320, 2010], [700, 1980]], tools: [
    { key: "caliper", x: 75, y: 150, rot: 92 }, { key: "battery", x: 165, y: 70, rot: 90, color: new cv.Scalar(190, 40, 35, 255) }] },
  landscape: { cam: [[2700, 420], [2650, 2000], [350, 2080], [300, 500]], tools: [ // sheet turned 90 deg in the photo
    { key: "pliers", x: 95, y: 150, rot: 85 }, { key: "bit", x: 170, y: 50, rot: 30 }] },
  "hard light": { hard: true, shadow: 5, shadowK: 0.42, gradient: 0.45, noise: 6, cam: [[950, 200], [2150, 140], [2200, 1900], [880, 1950]], tools: [
    { key: "pliers", x: 90, y: 150, rot: 95 }, { key: "lenscap", x: 160, y: 50, rot: 0 }] },
};

function traceScene(photo, paper) {
  const sheet = findSheet(cv, photo);
  const rect = rectify(cv, photo, sheet.corners, paper, 5);
  const res = traceTools(cv, rect.mat, { ppm: rect.ppm });
  return { sheet, rect, res };
}

// ---------- run ----------
if (args[0] && !args[0].startsWith("--")) {
  const jpeg = require("jpeg-js");
  const img = jpeg.decode(fs.readFileSync(args[0]), { useTArray: true, maxMemoryUsageInMB: 1024 });
  const photo = cv.matFromImageData({ data: img.data, width: img.width, height: img.height });
  const { sheet, rect, res } = traceScene(photo, PAPERS[opt("--paper") ?? "A4"]);
  console.log(`sheet ${sheet.found ? "found" : "NOT found"} (${(sheet.area * 100).toFixed(0)} % of the photo), ${rect.wMm} × ${rect.hMm} mm`);
  for (const t of res.tools) {
    const o = offset([t.outline], res.halfPixel, 0.05)[0] ?? t.outline, b = bounds([o]);
    console.log(`  tool: ${b.w.toFixed(1)} × ${b.h.toFixed(1)} mm (axis-aligned on the sheet), area ${area(o).toFixed(0)} mm²`);
  }
  if (pngDir) { fs.mkdirSync(pngDir, { recursive: true }); writePng(path.join(pngDir, "sheet.png"), rect.mat); writePng(path.join(pngDir, "mask.png"), res.mask); }
} else {
  console.log("| scene | tool | size drawn mm | size traced mm | edges Δ mm (left right bottom top) | mean offset mm | deviation mm p95 / max | result |");
  console.log("|---|---|---|---|---|---|---|---|");
  let failures = 0;
  for (const [name, sc] of Object.entries(SCENES)) {
    const t0 = Date.now();
    const { photo, truth } = scene(sc);
    const { sheet, rect, res } = traceScene(photo, PAPERS.A4);
    if (pngDir) {
      fs.mkdirSync(pngDir, { recursive: true });
      writePng(path.join(pngDir, `${name}_photo.png`), photo);
      writePng(path.join(pngDir, `${name}_mask.png`), res.mask);
    }
    // the sheet may come out landscape: map truth (portrait) into the traced frame by matching the orientation
    const land = rect.wMm > rect.hMm;
    for (const t of truth) {
      const tp = land ? t.poly.map(([X, Y]) => [Y, 210 - X]) : t.poly;
      const tb = bounds([tp]);
      // traced piece whose centre is closest to the drawn tool
      const cand = res.tools.map((r) => ({ r, o: offset([r.outline], res.halfPixel, 0.02)[0] ?? r.outline }))
        .map((c) => ({ ...c, b: bounds([c.o]) }))
        .sort((p, q) => Math.hypot(p.b.x0 + p.b.w / 2 - tb.x0 - tb.w / 2, p.b.y0 + p.b.h / 2 - tb.y0 - tb.h / 2) -
          Math.hypot(q.b.x0 + q.b.w / 2 - tb.x0 - tb.w / 2, q.b.y0 + q.b.h / 2 - tb.y0 - tb.h / 2))[0];
      let row;
      if (!cand) { row = ["-", "-", "-", "-", "NOT FOUND"]; failures++; }
      else {
        // limits (normal / hard light, where the shadow side grows): size within 0.5 / 0.8 mm, mean offset (area
        // difference per perimeter length) within 0.25 / 0.4 mm, 95 % of the outline within 0.45 / 0.6 mm, nothing
        // beyond 1.5 mm (sharp concave corners get rounded by the closing)
        const perim = tp.reduce((s, a, i) => s + Math.hypot(tp[(i + 1) % tp.length][0] - a[0], tp[(i + 1) % tp.length][1] - a[1]), 0);
        const mean = (area(cand.o) - area(tp)) / perim, [p95, max] = deviation(cand.o, tp), lim = sc.hard ? [0.8, 0.4, 0.6] : [0.5, 0.25, 0.45];
        const ok = Math.abs(cand.b.w - tb.w) <= lim[0] && Math.abs(cand.b.h - tb.h) <= lim[0] && Math.abs(mean) <= lim[1] &&
          p95 <= lim[2] && max <= 1.5;
        if (!ok) failures++;
        const edges = [tb.x0 - cand.b.x0, cand.b.x1 - tb.x1, tb.y0 - cand.b.y0, cand.b.y1 - tb.y1].map((v) => v.toFixed(2)).join(" ");
        row = [`${cand.b.w.toFixed(2)} × ${cand.b.h.toFixed(2)}`, edges, mean.toFixed(2), `${p95.toFixed(2)} / ${max.toFixed(2)}`, ok ? "ok" : "WRONG"];
      }
      console.log(`| ${name} | ${fixtures.tools[t.key].name} | ${tb.w.toFixed(2)} × ${tb.h.toFixed(2)} | ${row.join(" | ")} |`);
    }
    console.log(`| ${name} | (sheet ${sheet.found ? "found" : "NOT FOUND"}, ${res.tools.length} piece(s), ${((Date.now() - t0) / 1000).toFixed(1)} s) | | | | | | |`);
    if (!sheet.found || res.tools.length !== truth.length) failures++;
    photo.delete(); rect.mat.delete(); res.mask.delete();
  }
  console.log(`\n${failures ? `${failures} problem(s)` : "all ok"}`);
  process.exitCode = failures ? 1 : 0;
}
