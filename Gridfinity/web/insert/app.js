// Gridfinity tool insert generator - UI. Photo -> sheet corners -> traced tools (trace-worker.js, OpenCV) -> layout
// editor (pockets from insertEnv of src/insert.js, no kernel needed) -> box with pockets (worker.js) -> files.
// Texts: src/strings.js and the {en, de} labels of the spec's insert variant; the language switch re-renders in place.
// The project (tools and settings, no photo) is kept in localStorage and can be saved and opened as JSON.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { zipSync } from "./vendor/fflate.js";
import ClipperLib from "./vendor/clipper.js";
import { translator, applyDom, mountLangSwitch, num, pick } from "./vendor/i18n.js";
import { setClipper, cleanOutline, offset, place, bounds, circle, rect, autoFingers, arrange, flatRotation } from "./src/outline.js";
import { insertEnv, insertSvg, insertBuildSheet, ERRORS } from "./src/insert.js";
import { PAPERS } from "./src/trace.js";
import S from "./src/strings.js";

setClipper(ClipperLib);
const $ = (id) => document.getElementById(id);
const t = translator(S);
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};
const fmt = (v, d = 1) => num(v, d);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const spec = await (await fetch(new URL("./bin_params.json", import.meta.url))).json();
const V = spec.variants.insert, P = V.parameters, I = spec.insert;
const STORE = "gridfinity-tool-insert-project";
const FORMAT = "gridfinity-tool-insert";
const fileBase = "Gridfinity_Tool_Insert";

// ---------- project state ----------
const defaults = () => ({ ...Object.fromEntries(Object.entries(P).map(([k, p]) => [k, p.default])), auto_size: true, auto_height: true });
let project = { inputs: defaults(), tools: [] }; // tools: {id, name, outline, height, depth, x, y, rot, fingers, shape?}
let nextId = 1, selected = null, selFinger = null, selVertex = null, editOutline = false, arranged = true;
let env = null, built = null, building = false;

const finite = (v) => typeof v === "number" && Number.isFinite(v);
// a project from storage or a file: keep what is valid, drop the rest
function sanitize(obj) {
  const inputs = defaults(), src = obj?.inputs ?? {};
  for (const [k, p] of Object.entries(P)) {
    const v = src[k];
    if (p.type === "bool" ? typeof v === "boolean" : finite(v) && v >= p.min && v <= p.max) inputs[k] = p.type === "int" ? Math.round(v) : v;
  }
  for (const k of ["auto_size", "auto_height"]) if (typeof src[k] === "boolean") inputs[k] = src[k];
  const tools = [];
  for (const tl of Array.isArray(obj?.tools) ? obj.tools : []) {
    const outline = Array.isArray(tl?.outline) ? tl.outline.filter((p) => Array.isArray(p) && finite(p[0]) && finite(p[1])) : [];
    if (outline.length < 3) continue;
    const fingers = tl.fingers === "none" || tl.fingers === "auto" ? tl.fingers
      : Array.isArray(tl.fingers) ? tl.fingers.filter((f) => finite(f?.x) && finite(f?.y)).map((f) => ({ x: f.x, y: f.y, d: finite(f.d) ? f.d : null }))
      : "auto";
    const shape = tl.shape?.kind === "rect" && finite(tl.shape.w) && finite(tl.shape.h) ? { kind: "rect", w: tl.shape.w, h: tl.shape.h }
      : tl.shape?.kind === "circle" && finite(tl.shape.d) ? { kind: "circle", d: tl.shape.d } : null;
    tools.push({
      id: nextId++, name: String(tl.name ?? "").slice(0, 80) || t("tool.defaultName", { n: tools.length + 1 }), outline,
      height: finite(tl.height) && tl.height > 0 ? tl.height : null, depth: finite(tl.depth) && tl.depth > 0 ? tl.depth : null,
      x: finite(tl.x) ? tl.x : 0, y: finite(tl.y) ? tl.y : 0, rot: finite(tl.rot) ? tl.rot : 0, fingers, shape,
    });
  }
  return { inputs, tools };
}
const exportProject = () => ({
  format: FORMAT, version: 1, inputs: project.inputs,
  tools: project.tools.map(({ id, ...tl }) => ({ ...tl, fingers: Array.isArray(tl.fingers) ? tl.fingers.map((f) => ({ ...f })) : tl.fingers })),
});
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "null");
  if (saved) project = sanitize(saved);
} catch { /* storage unavailable or broken: start empty */ }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(exportProject())); } catch { /* full or unavailable */ } };
const toolById = (id) => project.tools.find((tl) => tl.id === id);
const keyOf = () => JSON.stringify(exportProject());

function update() {
  env = insertEnv(spec, project.inputs, project.tools);
  save();
  render();
}

// ---------- shapes and tools ----------
const shapeOutline = (s) => (s.kind === "rect" ? rect(-s.w / 2, -s.h / 2, s.w / 2, s.h / 2) : circle(0, 0, s.d / 2, 0.02));
const toolLength = (tl) => bounds([place(tl.outline, { rot: flatRotation(tl.outline) })]);
function addTools(list) {
  const base = project.tools.length;
  const fresh = list.map((tl, i) => ({ id: nextId++, name: t("tool.defaultName", { n: base + i + 1 }), height: null, depth: null,
    x: 0, y: 0, rot: 0, fingers: "auto", shape: null, ...tl }));
  if (arranged || !project.tools.length) {
    project.tools = arrangeAll([...project.tools, ...fresh]);
    arranged = true;
  } else { // keep the user's layout: new tools go to the right of it
    const b = bounds(env.items.flatMap((it) => it.region).map((p) => p.map(([x, y]) => [x - env.shift[0], y - env.shift[1]])));
    let x = b.x1 + 4;
    for (const tl of fresh) {
      const tb = bounds([place(tl.outline, { rot: tl.rot })]);
      tl.x = x - tb.x0;
      tl.y = (b.y0 + b.y1) / 2 - (tb.y0 + tb.y1) / 2;
      x += tb.w + 2 * project.inputs.clearance + 4;
    }
    project.tools.push(...fresh);
  }
  selected = fresh[0]?.id ?? selected;
  update();
  setMode("layout");
}
function arrangeAll(tools) {
  const laid = arrange(tools, { clearance: project.inputs.clearance, fingerD: project.inputs.finger_d, gap: I.min_wall + 1,
    pad: 2 * (spec.official.clearance + spec.official.lip.depth + I.min_wall), maxUnits: I.max_units,
    rowUnits: project.inputs.auto_size ? null : project.inputs.x_count });
  if (project.inputs.auto_size) return laid;
  const [dx, dy] = insertEnv(spec, { ...project.inputs, auto_size: true }, laid).shift; // manual size: centre in the box
  return laid.map((tl) => ({ ...tl, x: tl.x + dx, y: tl.y + dy }));
}

// ---------- photo ----------
const photo = { img: null, w: 0, h: 0, corners: null, found: false, traced: null, stage: "none" };
let tracer = null, tracerReady = false;
const tracerQueue = [];
function startTracer() {
  tracer = new Worker(new URL("./trace-worker.js", import.meta.url), { type: "module" });
  tracer.onmessage = onTracer;
  tracer.onerror = (e) => status("tool.cvStopped", { error: () => e.message || t("common.unknownError") }, "err");
}
function sendTracer(msg, transfer = []) {
  if (tracerReady) tracer.postMessage(msg, transfer);
  else tracerQueue.push([msg, transfer]);
}
function onTracer({ data: msg }) {
  if (msg.type === "ready") {
    tracerReady = true;
    for (const [m, tr] of tracerQueue.splice(0)) tracer.postMessage(m, tr);
  } else if (msg.type === "sheet") {
    photo.corners = msg.corners;
    photo.found = msg.found;
    photo.stage = "corners";
    status(msg.found ? "tool.sheetFound" : "tool.sheetMissing", {}, msg.found ? "" : "err");
    renderPhoto();
  } else if (msg.type === "traced") {
    const c = el("canvas", { width: msg.width, height: msg.height });
    c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(msg.data), msg.width, msg.height), 0, 0);
    const keep = photo.traced?.tools ?? [];
    photo.traced = { ...msg, canvas: c, tools: msg.tools.map((tr, i) => ({ ...tr, use: keep[i]?.use ?? true })) };
    photo.stage = "traced";
    status("tool.traced", { n: msg.tools.length }, msg.tools.length ? "" : "err");
    renderPhoto();
  } else if (msg.type === "error") {
    status(msg.code === "opencv" ? "tool.cvError" : "tool.traceError", { error: msg.message }, "err");
  }
}
async function loadPhoto(file) {
  status("tool.reading", {}, "busy");
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    status("tool.photoError", {}, "err");
    return;
  }
  const scale = Math.min(1, 3000 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = el("canvas", { width: w, height: h }), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const data = g.getImageData(0, 0, w, h);
  Object.assign(photo, { img: c, w, h, corners: null, found: false, traced: null, stage: "loading" });
  if (!tracer) startTracer();
  status(tracerReady ? "tool.findingSheet" : "tool.loadingCv", {}, "busy");
  sendTracer({ type: "photo", width: w, height: h, data: data.data.buffer }, [data.data.buffer]);
  setMode("photo");
  renderPhoto();
}
const paper = () => PAPERS[$("paper").value] ?? PAPERS.A4;
function trace() {
  if (!photo.corners) return;
  status("tool.tracing", {}, "busy");
  sendTracer({ type: "trace", corners: photo.corners, paper: paper(), sensitivity: Number($("sens").value) });
}
function addTraced() {
  const tr = photo.traced;
  const list = tr.tools.filter((p) => p.use).map((p) => {
    const grown = offset([p.outline], tr.halfPixel, 0.05)[0] ?? p.outline; // the contour runs half a pixel inside the edge
    return { outline: cleanOutline(grown, { eps: 0.15 }) };
  }).filter((x) => x.outline);
  if (list.length) addTools(list);
}
$("photo-file").addEventListener("change", (e) => { if (e.target.files[0]) loadPhoto(e.target.files[0]); e.target.value = ""; });
$("trace").addEventListener("click", trace);
$("corners").addEventListener("click", () => { photo.stage = "corners"; renderPhoto(); setMode("photo"); });
$("add").addEventListener("click", addTraced);
$("paper").addEventListener("change", () => { if (photo.stage === "traced") trace(); });
let sensTimer = 0;
$("sens").addEventListener("input", () => { clearTimeout(sensTimer); sensTimer = setTimeout(trace, 250); });

function renderPhoto() {
  const has = !!photo.img, traced = photo.stage === "traced";
  $("trace-row").hidden = !photo.corners;
  $("corners").hidden = !traced;
  $("sens-row").hidden = !traced;
  $("add-row").hidden = !traced || !photo.traced.tools.length;
  if (traced) $("add").textContent = t("tool.addPieces", { n: photo.traced.tools.filter((p) => p.use).length });
  $("add").disabled = traced && !photo.traced.tools.some((p) => p.use);
  $("photo-note").textContent = !has ? t("tool.photoEmpty") : traced ? t("tool.pickPieces") : photo.corners ? t("tool.checkCorners") : "";
  if (mode === "photo") drawPhoto();
  renderHint();
}

// ---------- stage: modes ----------
let mode = "layout";
function setMode(m) {
  mode = m;
  for (const b of $("modes").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.mode === m));
  $("photo-view").hidden = m !== "photo";
  $("layout-view").hidden = m !== "layout";
  $("view3d").hidden = m !== "3d";
  renderer.setAnimationLoop(m === "3d" ? () => { controls.update(); renderer.render(scene, camera); } : null);
  if (m === "3d") resize3d();
  redraw();
  renderHint();
}
for (const b of $("modes").querySelectorAll("button")) b.addEventListener("click", () => setMode(b.dataset.mode));
const redraw = () => (mode === "photo" ? drawPhoto() : mode === "layout" ? drawLayout() : null);
function renderHint() {
  $("hint").textContent = mode === "photo"
    ? (photo.stage === "traced" ? t("tool.hintPieces") : photo.corners ? t("tool.hintCorners") : t("tool.photoEmpty"))
    : mode === "layout" ? (project.tools.length ? (editOutline ? t("tool.hintOutline") : t("tool.hintLayout")) : t("tool.hintEmpty"))
    : t("tool.hint3d");
  $("hint").parentElement.hidden = !$("hint").textContent;
}
function fitCanvas(c) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

// ---------- photo view ----------
let photoView = null; // {s, ox, oy}: screen = o + image px * s
function drawPhoto() {
  const c = $("photo-view"), { g, w, h } = fitCanvas(c);
  if (!photo.img) return;
  const top = 56, pad = 16;
  if (photo.stage === "traced") {
    const tr = photo.traced, img = tr.canvas;
    const s = Math.min((w - 2 * pad) / img.width, (h - top - 40) / img.height);
    const ox = (w - img.width * s) / 2, oy = top + (h - top - 40 - img.height * s) / 2;
    photoView = { s, ox, oy };
    g.drawImage(img, ox, oy, img.width * s, img.height * s);
    const toS = ([x, y]) => [ox + x * tr.ppm * s, oy + (tr.hMm - y) * tr.ppm * s];
    tr.tools.forEach((p, i) => {
      g.beginPath();
      p.outline.forEach((q, j) => { const [x, y] = toS(q); j ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.closePath();
      g.setLineDash(p.use ? [] : [5, 4]);
      g.fillStyle = p.use ? "rgba(35, 87, 198, .28)" : "rgba(128, 128, 128, .12)";
      g.strokeStyle = p.use ? css("--accent") : "#888";
      g.lineWidth = 2;
      g.fill();
      g.stroke();
      const b = bounds([p.outline]), [lx, ly] = toS([b.x0 + b.w / 2, b.y0 + b.h / 2]);
      g.setLineDash([]);
      g.fillStyle = p.use ? css("--accent") : "#888";
      g.font = "600 14px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText(String(i + 1), lx, ly + 5);
    });
    return;
  }
  const s = Math.min((w - 2 * pad) / photo.w, (h - top - 40) / photo.h);
  const ox = (w - photo.w * s) / 2, oy = top + (h - top - 40 - photo.h * s) / 2;
  photoView = { s, ox, oy };
  g.drawImage(photo.img, ox, oy, photo.w * s, photo.h * s);
  if (!photo.corners) return;
  const pts = photo.corners.map(([x, y]) => [ox + x * s, oy + y * s]);
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = "rgba(35, 87, 198, .12)";
  g.fill();
  g.strokeStyle = css("--accent");
  g.lineWidth = 2;
  g.stroke();
  pts.forEach(([x, y], i) => {
    g.beginPath();
    g.arc(x, y, 10, 0, 2 * Math.PI);
    g.fillStyle = i === dragCorner ? css("--accent") : "rgba(255, 255, 255, .9)";
    g.fill();
    g.stroke();
  });
}
let dragCorner = -1;
const photoPoint = (e) => {
  const r = $("photo-view").getBoundingClientRect(), { s, ox, oy } = photoView;
  return [(e.clientX - r.left - ox) / s, (e.clientY - r.top - oy) / s];
};
$("photo-view").addEventListener("pointerdown", (e) => {
  if (!photoView) return;
  const [px, py] = photoPoint(e);
  if (photo.stage === "traced") { // toggle a piece
    const tr = photo.traced, mm = [px / tr.ppm, tr.hMm - py / tr.ppm];
    const hit = tr.tools.findIndex((p) => inside(mm, p.outline));
    if (hit >= 0) { tr.tools[hit].use = !tr.tools[hit].use; renderPhoto(); }
    return;
  }
  if (!photo.corners) return;
  const reach = (e.pointerType === "touch" ? 28 : 16) / photoView.s;
  let best = -1, bd = reach;
  photo.corners.forEach(([x, y], i) => { const d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = i; } });
  if (best < 0) return;
  dragCorner = best;
  $("photo-view").setPointerCapture(e.pointerId);
  drawPhoto();
});
$("photo-view").addEventListener("pointermove", (e) => {
  if (dragCorner < 0) return;
  const [px, py] = photoPoint(e);
  photo.corners[dragCorner] = [Math.max(0, Math.min(photo.w, px)), Math.max(0, Math.min(photo.h, py))];
  drawPhoto();
});
$("photo-view").addEventListener("pointerup", () => { if (dragCorner >= 0) { dragCorner = -1; drawPhoto(); } });

function inside([x, y], poly) { // even-odd point in polygon
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// ---------- layout view (box frame, mm, y up) ----------
let view = null; // {s, ox, oy}: screen = (ox + x s, oy - y s)
let drag = null; // {kind: "tool" | "finger" | "vertex", id, index, start: [x, y], orig, moved}
const toScreen = ([x, y]) => [view.ox + x * view.s, view.oy - y * view.s];
const placedOutline = (tl, dx = 0, dy = 0) => place(tl.outline, tl).map(([x, y]) => [x + env.shift[0] + dx, y + env.shift[1] + dy]);
// box frame <-> tool frame (for finger cutouts and outline vertices)
function toTool(tl, [x, y]) {
  const u = x - env.shift[0] - tl.x, v = y - env.shift[1] - tl.y, a = (-tl.rot * Math.PI) / 180;
  return [u * Math.cos(a) - v * Math.sin(a), u * Math.sin(a) + v * Math.cos(a)];
}
function drawLayout() {
  const c = $("layout-view"), { g, w, h } = fitCanvas(c);
  if (!env) return;
  const top = 56, pad = 18, hw = env.W / 2, hd = env.D / 2;
  let b = { x0: -hw, y0: -hd, x1: hw, y1: hd };
  for (const it of env.items) { const r = bounds(it.region); b = { x0: Math.min(b.x0, r.x0), y0: Math.min(b.y0, r.y0), x1: Math.max(b.x1, r.x1), y1: Math.max(b.y1, r.y1) }; }
  const s = Math.min((w - 2 * pad) / (b.x1 - b.x0), (h - top - 44) / (b.y1 - b.y0));
  view = { s, ox: w / 2 - ((b.x0 + b.x1) / 2) * s, oy: top + (h - top - 44) / 2 + ((b.y0 + b.y1) / 2) * s };
  const path = (poly) => { g.beginPath(); poly.forEach((p, i) => { const [x, y] = toScreen(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
  const rrect = (x0, y0, x1, y1, r) => { const [a, bb] = toScreen([x0, y1]); g.beginPath(); g.roundRect(a, bb, (x1 - x0) * s, (y1 - y0) * s, r * s); };
  // cells, box outline, opening, allowed area
  g.fillStyle = css("--grid-cell");
  for (let i = 0; i < env.x_count; i++) for (let j = 0; j < env.y_count; j++) {
    const x0 = -env.x_count * 21 + 42 * i, y0 = -env.y_count * 21 + 42 * j;
    rrect(x0 + 0.6, y0 + 0.6, x0 + 41.4, y0 + 41.4, 4);
    g.fill();
  }
  g.strokeStyle = css("--muted");
  g.lineWidth = 1.5;
  rrect(-hw, -hd, hw, hd, 3.75);
  g.stroke();
  g.setLineDash([6, 4]);
  g.lineWidth = 1;
  rrect(-env.opening[0] / 2, -env.opening[1] / 2, env.opening[0] / 2, env.opening[1] / 2, 1.15);
  g.stroke();
  g.setLineDash([]);
  const bad = new Map(); // tool index -> "err" | "signal"
  for (const p of env.problems) if (p.tool != null) {
    const kind = p.code === "overlap" || p.code === "thinWall" ? "signal" : "err";
    for (const i of [p.tool, p.other]) if (i != null && bad.get(i) !== "err") bad.set(i, kind);
  }
  env.items.forEach((it, i) => {
    const tl = project.tools[i], d = drag?.kind === "tool" && drag.id === tl.id ? drag.delta : [0, 0];
    const move = (poly) => poly.map(([x, y]) => [x + d[0], y + d[1]]);
    for (const poly of it.pocket) {
      path(move(poly));
      g.fillStyle = css("--pocket");
      g.fill();
      g.strokeStyle = bad.has(i) ? css(bad.get(i) === "err" ? "--err" : "--signal") : css("--accent");
      g.lineWidth = bad.has(i) ? 2 : 1;
      g.stroke();
    }
    const outline = drag?.kind === "vertex" && drag.id === tl.id ? place(drag.outline, tl).map(([x, y]) => [x + env.shift[0], y + env.shift[1]])
      : placedOutline(tl, d[0], d[1]);
    path(outline);
    const sel = tl.id === selected;
    g.fillStyle = sel ? "rgba(23, 32, 42, .22)" : "rgba(23, 32, 42, .12)";
    g.fill();
    g.strokeStyle = sel ? css("--accent") : css("--ink");
    g.lineWidth = sel ? 2.5 : 1.5;
    g.stroke();
    const tb = bounds([outline]), [lx, ly] = toScreen([tb.x0 + tb.w / 2, tb.y0 + tb.h / 2]);
    g.fillStyle = css("--ink");
    g.font = "600 12px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText(tl.name, lx, ly + 4, Math.max(40, tb.w * s - 8));
    if (sel && Array.isArray(tl.fingers)) it.fingers.forEach((f, k) => {
      const [x, y] = toScreen([f.x, f.y]);
      g.beginPath();
      g.arc(x, y, (f.d / 2) * s, 0, 2 * Math.PI);
      g.strokeStyle = css("--accent");
      g.lineWidth = 1.5;
      g.setLineDash([4, 3]);
      g.stroke();
      g.setLineDash([]);
      handle(g, x, y, k === selFinger);
      if (k === selFinger) badge(g, x + (f.d / 2) * s * 0.7, y - (f.d / 2) * s * 0.7);
    });
    if (sel && editOutline) outline.forEach((p, k) => {
      const [x, y] = toScreen(p);
      g.fillStyle = k === selVertex ? css("--accent") : "#fff";
      g.strokeStyle = css("--accent");
      g.lineWidth = 1.5;
      g.fillRect(x - 4, y - 4, 8, 8);
      g.strokeRect(x - 4, y - 4, 8, 8);
      if (k === selVertex) badge(g, x + 12, y - 12);
    });
  });
}
function handle(g, x, y, active) {
  g.beginPath();
  g.arc(x, y, 6, 0, 2 * Math.PI);
  g.fillStyle = active ? css("--accent") : "#fff";
  g.strokeStyle = css("--accent");
  g.lineWidth = 1.5;
  g.fill();
  g.stroke();
}
function badge(g, x, y) { // the "remove" mark next to a selected finger cutout or vertex
  g.beginPath();
  g.arc(x, y, 9, 0, 2 * Math.PI);
  g.fillStyle = css("--err");
  g.fill();
  g.strokeStyle = "#fff";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4);
  g.stroke();
  lastBadge = [x, y];
}
let lastBadge = null;
const layoutPoint = (e) => {
  const r = $("layout-view").getBoundingClientRect();
  return { sx: e.clientX - r.left, sy: e.clientY - r.top, x: (e.clientX - r.left - view.ox) / view.s, y: (view.oy - (e.clientY - r.top)) / view.s };
};
$("layout-view").addEventListener("pointerdown", (e) => {
  if (!view || !env) return;
  const p = layoutPoint(e), reach = e.pointerType === "touch" ? 22 : 12, tl = toolById(selected);
  const idx = project.tools.indexOf(tl);
  // 1. the remove badge of the selected finger cutout or vertex
  if (lastBadge && (selFinger != null || selVertex != null) && Math.hypot(p.sx - lastBadge[0], p.sy - lastBadge[1]) < reach) {
    if (selFinger != null) tl.fingers.splice(selFinger, 1);
    else if (tl.outline.length > 3) tl.outline.splice(selVertex, 1);
    selFinger = selVertex = null;
    lastBadge = null;
    update();
    return;
  }
  lastBadge = null;
  // 2. vertices (outline editing) and finger cutouts of the selected tool
  if (tl && editOutline) {
    const outline = placedOutline(tl);
    const k = outline.findIndex((q) => { const [x, y] = toScreen(q); return Math.hypot(x - p.sx, y - p.sy) < reach; });
    if (k >= 0) {
      selVertex = k; selFinger = null;
      drag = { kind: "vertex", id: tl.id, index: k, start: [p.x, p.y], outline: tl.outline.map((q) => [...q]) };
      $("layout-view").setPointerCapture(e.pointerId);
      drawLayout();
      return;
    }
    // a click on an edge inserts a vertex there
    for (let i = 0; i < outline.length; i++) {
      const a = toScreen(outline[i]), b = toScreen(outline[(i + 1) % outline.length]);
      if (segDist([p.sx, p.sy], a, b) < reach * 0.6) {
        tl.outline.splice(i + 1, 0, toTool(tl, [p.x, p.y]));
        selVertex = i + 1;
        update();
        return;
      }
    }
  }
  if (tl && Array.isArray(tl.fingers)) {
    const k = env.items[idx].fingers.findIndex((f) => Math.hypot(toScreen([f.x, f.y])[0] - p.sx, toScreen([f.x, f.y])[1] - p.sy) < Math.max(reach, 8));
    if (k >= 0) {
      selFinger = k; selVertex = null;
      drag = { kind: "finger", id: tl.id, index: k, start: [p.x, p.y], orig: { ...tl.fingers[k] } };
      $("layout-view").setPointerCapture(e.pointerId);
      drawLayout();
      return;
    }
  }
  // 3. tools: inside the pocket region (topmost = last drawn)
  for (let i = env.items.length - 1; i >= 0; i--) {
    if (env.items[i].region.some((poly) => inside([p.x, p.y], poly))) {
      const hit = project.tools[i];
      if (selected !== hit.id) { selected = hit.id; selFinger = selVertex = null; editOutline = false; renderTools(); }
      drag = { kind: "tool", id: hit.id, start: [p.x, p.y], orig: { x: hit.x, y: hit.y }, delta: [0, 0] };
      $("layout-view").setPointerCapture(e.pointerId);
      drawLayout();
      return;
    }
  }
  if (selected != null) { selected = null; selFinger = selVertex = null; editOutline = false; renderTools(); drawLayout(); renderHint(); }
});
$("layout-view").addEventListener("pointermove", (e) => {
  if (!drag) return;
  const p = layoutPoint(e), tl = toolById(drag.id), dx = p.x - drag.start[0], dy = p.y - drag.start[1];
  if (Math.hypot(dx, dy) * view.s > 2) drag.moved = true;
  if (drag.kind === "tool") drag.delta = [dx, dy];
  else if (drag.kind === "finger") {
    const a = (-tl.rot * Math.PI) / 180, u = dx * Math.cos(a) - dy * Math.sin(a), v = dx * Math.sin(a) + dy * Math.cos(a);
    tl.fingers[drag.index] = { ...drag.orig, x: drag.orig.x + u, y: drag.orig.y + v };
    env = insertEnv(spec, project.inputs, project.tools); // finger cutouts don't move the layout: live update is fine
  } else if (drag.kind === "vertex") drag.outline[drag.index] = toTool(tl, [p.x, p.y]);
  drawLayout();
});
$("layout-view").addEventListener("pointerup", () => {
  if (!drag) return;
  const tl = toolById(drag.id);
  if (drag.kind === "tool" && drag.moved) {
    tl.x = drag.orig.x + drag.delta[0];
    tl.y = drag.orig.y + drag.delta[1];
    arranged = false;
  } else if (drag.kind === "vertex" && drag.moved) tl.outline = drag.outline;
  drag = null;
  update();
});
$("layout-view").addEventListener("wheel", (e) => {
  const tl = toolById(selected);
  if (!tl || mode !== "layout") return;
  e.preventDefault();
  rotate(tl, (e.deltaY > 0 ? 1 : -1) * (e.shiftKey ? 1 : 5));
}, { passive: false });
window.addEventListener("keydown", (e) => {
  const tl = toolById(selected);
  if (!tl || mode !== "layout" || e.target.closest("input, select, textarea")) return;
  const step = e.shiftKey ? 10 : 1, moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
  if (moves[e.key]) {
    tl.x += moves[e.key][0];
    tl.y += moves[e.key][1];
    arranged = false;
    update();
  } else if (e.key === "r" || e.key === "R") rotate(tl, e.shiftKey ? -90 : 90);
  else if ((e.key === "Delete" || e.key === "Backspace") && (selFinger != null || selVertex != null)) {
    if (selFinger != null) tl.fingers.splice(selFinger, 1);
    else if (tl.outline.length > 3) tl.outline.splice(selVertex, 1);
    selFinger = selVertex = null;
    update();
  } else return;
  e.preventDefault();
});
function rotate(tl, deg) {
  tl.rot = (((tl.rot + deg) % 360) + 360) % 360;
  arranged = false;
  update();
}
const segDist = ([px, py], [ax, ay], [bx, by]) => {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey, u = l2 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / l2)) : 0;
  return Math.hypot(px - ax - u * ex, py - ay - u * ey);
};

// ---------- tool list ----------
function numInput(value, { min = 0, step = 0.1, placeholder = "", need = false, label }, onChange) {
  const i = el("input", { type: "number", inputMode: "decimal", min, step, value: value ?? "", placeholder, ariaLabel: label });
  if (need) i.classList.add("need");
  i.addEventListener("change", () => onChange(i.value === "" ? null : Number(i.value)));
  return i;
}
function seg(options, current, onPick) {
  const g = el("div", { className: "seg", role: "group" });
  for (const [value, text] of options) {
    const b = el("button", { type: "button", textContent: text });
    b.setAttribute("aria-pressed", String(value === current));
    b.addEventListener("click", () => onPick(value));
    g.append(b);
  }
  return g;
}
function renderTools() {
  const list = $("tools");
  list.replaceChildren(...project.tools.map((tl, i) => {
    const sel = tl.id === selected, it = env?.items[i];
    const size = it ? bounds([place(tl.outline, { rot: tl.rot })]) : null;
    const sub = el("small");
    sub.append(size ? `${fmt(size.w)} × ${fmt(size.h)} mm · ` : "");
    if (tl.height > 0) sub.append(t("tool.headHeight", { h: tl.height }));
    else sub.append(el("span", { className: "warn", textContent: t("tool.needHeight") }));
    const del = el("button", { type: "button", className: "btn small quiet", textContent: "×", ariaLabel: t("tool.remove", { name: tl.name }) });
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      project.tools = project.tools.filter((x) => x !== tl);
      if (selected === tl.id) selected = null;
      update();
    });
    const head = el("div", { className: "tool-head" }, el("strong", { textContent: tl.name }), del, sub);
    head.addEventListener("click", () => { selected = sel ? null : tl.id; selFinger = selVertex = null; editOutline = false; render(); });
    const box = el("div", { className: `tool${sel ? " sel" : ""}` }, head);
    if (!sel) return box;

    const body = el("div", { className: "tool-body" });
    const name = el("input", { type: "text", value: tl.name, maxLength: 80, ariaLabel: t("tool.name") });
    name.addEventListener("change", () => { tl.name = name.value.trim() || tl.name; update(); });
    const auto = (tl.height > 0 ? tl.height : 0) + I.depth_extra;
    body.append(
      el("span", { textContent: t("tool.name") }), name,
      el("span", { textContent: t("tool.height") }),
      el("div", { className: "row" }, numInput(tl.height, { min: 0.5, need: !(tl.height > 0), label: t("tool.height") }, (v) => { tl.height = v > 0 ? v : null; update(); }),
        el("small", { className: "note", textContent: t("tool.heightHelp") })),
      el("span", { textContent: t("tool.depth") }),
      el("div", { className: "row" }, numInput(tl.depth, { min: 0.5, placeholder: fmt(auto), label: t("tool.depth") }, (v) => { tl.depth = v > 0 ? v : null; update(); }),
        el("small", { className: "note", textContent: t("tool.depthHelp") })),
    );
    if (tl.shape?.kind === "rect") {
      const setRect = (k) => (v) => { if (v > 0) { tl.shape[k] = v; tl.outline = shapeOutline(tl.shape); update(); } };
      body.append(el("span", { textContent: t("tool.size") }), el("div", { className: "row" },
        numInput(tl.shape.w, { min: 1, label: t("tool.sizeW") }, setRect("w")), "×", numInput(tl.shape.h, { min: 1, label: t("tool.sizeH") }, setRect("h")), "mm"));
    } else if (tl.shape?.kind === "circle") {
      body.append(el("span", { textContent: t("tool.diameter") }), el("div", { className: "row" },
        numInput(tl.shape.d, { min: 1, label: t("tool.diameter") }, (v) => { if (v > 0) { tl.shape.d = v; tl.outline = shapeOutline(tl.shape); update(); } }), "mm"));
    } else {
      const len = toolLength(tl).w;
      body.append(el("span", { textContent: t("tool.length") }), el("div", { className: "row" },
        numInput(Math.round(len * 10) / 10, { min: 1, label: t("tool.length") }, (v) => {
          if (!(v > 0)) return;
          const f = v / len;
          tl.outline = tl.outline.map(([x, y]) => [x * f, y * f]);
          if (Array.isArray(tl.fingers)) tl.fingers = tl.fingers.map((p) => ({ ...p, x: p.x * f, y: p.y * f }));
          update();
        }), el("small", { className: "note", textContent: t("tool.lengthHelp") })));
    }
    const rot = numInput(Math.round(tl.rot * 10) / 10, { min: -360, step: 1, label: t("tool.rotation") }, (v) => { if (v != null) { tl.rot = ((v % 360) + 360) % 360; arranged = false; update(); } });
    const turn = (d, text) => { const b = el("button", { type: "button", className: "btn small quiet", textContent: text }); b.addEventListener("click", () => rotate(tl, d)); return b; };
    body.append(el("span", { textContent: t("tool.rotation") }), el("div", { className: "row" }, rot, "°", turn(-90, "⟲ 90°"), turn(90, "⟳ 90°")));
    const fm = tl.fingers === "none" ? "none" : Array.isArray(tl.fingers) ? "manual" : "auto";
    const fingers = seg([["auto", t("tool.fingersAuto")], ["none", t("tool.fingersNone")], ["manual", t("tool.fingersManual")]], fm, (v) => {
      if (v === "manual" && !Array.isArray(tl.fingers)) tl.fingers = (tl.fingers === "none" ? [] : autoFingers(tl.outline, project.inputs.finger_d)).map((f) => ({ x: f.x, y: f.y, d: null }));
      else if (v !== "manual") tl.fingers = v;
      selFinger = null;
      update();
    });
    const fRow = el("div", { className: "row" }, fingers);
    if (fm === "manual") {
      const plus = el("button", { type: "button", className: "btn small quiet", textContent: t("tool.addFinger") });
      plus.addEventListener("click", () => {
        const b = bounds([tl.outline]);
        tl.fingers.push({ x: 0, y: b.y1, d: null });
        selFinger = tl.fingers.length - 1;
        update();
      });
      fRow.append(plus);
    }
    body.append(el("span", { textContent: t("tool.fingers") }), fRow);
    const edit = el("button", { type: "button", className: `btn small ${editOutline ? "primary" : "quiet"}`, textContent: t(editOutline ? "tool.editDone" : "tool.editOutline") });
    edit.addEventListener("click", () => { editOutline = !editOutline; selVertex = null; setMode("layout"); render(); });
    const row = el("div", { className: "row" }, edit);
    if (!tl.shape) {
      const mirror = el("button", { type: "button", className: "btn small quiet", textContent: t("tool.mirror") });
      mirror.addEventListener("click", () => {
        tl.outline = tl.outline.map(([x, y]) => [-x, y]).reverse();
        if (Array.isArray(tl.fingers)) tl.fingers = tl.fingers.map((f) => ({ ...f, x: -f.x }));
        update();
      });
      row.append(mirror);
    }
    body.append(el("span", { textContent: t("tool.outline") }), row);
    box.append(body);
    return box;
  }));
  const missing = project.tools.filter((tl) => !(tl.height > 0)).length;
  $("tools-note").textContent = !project.tools.length ? t("tool.toolsEmpty") : missing ? t("tool.toolsNeedHeight", { n: missing }) : "";
  $("arrange").disabled = !project.tools.length;
}
$("add-rect").addEventListener("click", () => { const shape = { kind: "rect", w: 60, h: 30 }; addTools([{ outline: shapeOutline(shape), shape }]); });
$("add-circle").addEventListener("click", () => { const shape = { kind: "circle", d: 40 }; addTools([{ outline: shapeOutline(shape), shape }]); });
$("arrange").addEventListener("click", () => { project.tools = arrangeAll(project.tools); arranged = true; update(); setMode("layout"); });
$("project-file").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    if (obj?.format !== FORMAT) throw new Error("format");
    project = sanitize(obj);
    selected = null;
    arranged = false;
    update();
    setMode("layout");
    status("tool.projectOpened", { n: project.tools.length });
  } catch {
    status("tool.projectError", {}, "err");
  }
});

// ---------- box parameters ----------
const params = $("params"), paramLabels = [];
function paramName(key) {
  const p = P[key], text = el("span"), help = el("small");
  paramLabels.push(() => { text.textContent = pick(p.label); help.textContent = pick(p.help); });
  return el("div", { className: "param-name" }, text, help);
}
function stepper(key) {
  const p = P[key], minus = el("button", { type: "button", textContent: "−" }), plus = el("button", { type: "button", textContent: "+" });
  paramLabels.push(() => { minus.ariaLabel = t("common.decrease", { name: pick(p.label) }); plus.ariaLabel = t("common.increase", { name: pick(p.label) }); });
  const set = (v) => { project.inputs[key] = Math.min(p.max, Math.max(p.min, v)); update(); };
  minus.addEventListener("click", () => set(project.inputs[key] - 1));
  plus.addEventListener("click", () => set(project.inputs[key] + 1));
  return el("div", { className: "stepper" }, minus, el("output"), plus);
}
const sizeName = el("div", { className: "param-name" }, el("span", { id: "size-name" }), el("small", { id: "size-help" }));
const sizeSeg = el("div", { className: "row", id: "size-ctl" });
const heightName = el("div", { className: "param-name" }, el("span", { id: "height-name" }), el("small", { id: "height-help" }));
const heightSeg = el("div", { className: "row", id: "height-ctl" });
const steppers = { x_count: stepper("x_count"), y_count: stepper("y_count"), z_count: stepper("z_count") };
params.append(sizeName, sizeSeg, heightName, heightSeg);
for (const key of ["clearance", "finger_d", "fill_lower"]) {
  const p = P[key], input = el("input", { type: "number", id: key, inputMode: "decimal", min: p.min, max: p.max, step: p.step ?? 0.1 });
  input.addEventListener("change", () => {
    const v = Number(input.value);
    project.inputs[key] = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default;
    update();
  });
  params.append(paramName(key), input);
}
{
  const box = el("input", { type: "checkbox", id: "magnets" });
  box.addEventListener("change", () => { project.inputs.magnets = box.checked; update(); });
  params.append(paramName("magnets"), box);
}
function setAuto(which, auto) {
  const inp = project.inputs;
  if (which === "size" && !auto && inp.auto_size) { // keep everything where it is: the layout frame becomes the box frame
    for (const tl of project.tools) { tl.x += env.shift[0]; tl.y += env.shift[1]; }
    Object.assign(inp, { x_count: env.x_count, y_count: env.y_count });
  }
  if (which === "height" && !auto && inp.auto_height) inp.z_count = env.z_count;
  inp[which === "size" ? "auto_size" : "auto_height"] = auto;
  update();
}
function renderParams() {
  const inp = project.inputs;
  $("size-name").textContent = t("tool.boxSize");
  $("size-help").textContent = inp.auto_size ? t("tool.sizeAutoHelp", { x: env.x_count, y: env.y_count }) : t("tool.sizeManualHelp", { x: env.min.x, y: env.min.y });
  sizeSeg.replaceChildren(seg([[true, t("tool.auto")], [false, t("tool.manual")]], inp.auto_size, (v) => setAuto("size", v)));
  if (!inp.auto_size) sizeSeg.append(steppers.x_count, "×", steppers.y_count);
  $("height-name").textContent = t("tool.boxHeight");
  $("height-help").textContent = inp.auto_height ? t("tool.heightAutoHelp", { z: env.z_count }) : t("tool.heightManualHelp", { z: env.min.z });
  heightSeg.replaceChildren(seg([[true, t("tool.auto")], [false, t("tool.manual")]], inp.auto_height, (v) => setAuto("height", v)));
  if (!inp.auto_height) heightSeg.append(steppers.z_count);
  for (const [key, st] of Object.entries(steppers)) {
    const p = P[key], [minus, plus] = st.querySelectorAll("button");
    st.querySelector("output").textContent = inp[key];
    minus.disabled = inp[key] <= p.min;
    plus.disabled = inp[key] >= p.max;
  }
  for (const key of ["clearance", "finger_d", "fill_lower"]) if (document.activeElement !== $(key)) $(key).value = inp[key];
  $("magnets").checked = inp.magnets;
}

// ---------- datasheet, problems, files ----------
const PROBLEMS = { // code -> text (keys stay literal)
  noTools: (p) => t("tool.pNoTools", p), noHeight: (p) => t("tool.pNoHeight", p), badDepth: (p) => t("tool.pBadDepth", p),
  tooBig: (p) => t("tool.pTooBig", p), tooSmall: (p) => t("tool.pTooSmall", p), outside: (p) => t("tool.pOutside", p),
  tooTall: (p) => t("tool.pTooTall", p), tooLow: (p) => t("tool.pTooLow", p), overlap: (p) => t("tool.pOverlap", p),
  thinWall: (p) => t("tool.pThinWall", p),
};
function problemText(p) {
  const name = (i) => project.tools[i]?.name ?? "?";
  return PROBLEMS[p.code]?.({ ...p, name: name(p.tool), other: name(p.other), wall: I.min_wall }) ?? p.code;
}
const chip = (kind, text) => el("span", { className: `chip ${kind}`, textContent: text });
function render() {
  if (!env) return;
  renderParams();
  renderTools();
  const deepest = env.items.length ? Math.min(...env.items.map((it) => it.floor)) : null;
  const rows = [
    [t("tool.rowOutside"), `${fmt(env.W)} × ${fmt(env.D)} × ${fmt(env.top)} mm`],
    [t("tool.rowGrid"), `${env.x_count} × ${env.y_count} × ${env.z_count}`],
    [t("tool.rowSurface"), t("tool.valSurface", { f: env.F, gap: env.seat - env.F })],
    [t("tool.rowFloor"), deepest == null ? "–" : t("tool.valFloor", { z: deepest })],
    [t("tool.rowTools"), String(env.items.length)],
    [t("common.magnets"), env.magnets ? `${env.x_count * env.y_count * 4} × 6 × 2 mm` : t("common.none")],
  ];
  if (built && built.key === keyOf()) rows.push([t("tool.rowVolume"), t("tool.valVolume", { v: built.volume })]);
  $("sheet").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]));
  const bed = spec.bed, onBed = env.W <= bed[0] && env.D <= bed[1];
  const chips = [chip(onBed ? "ok" : "signal", t(onBed ? "common.bedFits" : "common.bedTooBig", { x: bed[0], y: bed[1] }))];
  if (env.ok && env.items.length) chips.push(chip("ok", t("tool.stackOk", { gap: I.stack_gap })));
  const seen = new Set();
  for (const p of env.problems) {
    const text = problemText(p);
    if (seen.has(text)) continue;
    seen.add(text);
    chips.push(chip(ERRORS.has(p.code) ? "err" : "signal", text));
  }
  $("chips").replaceChildren(...chips);
  const current = built && built.key === keyOf();
  $("build").textContent = building ? t("common.building") : current ? t("tool.rebuild") : t("tool.build");
  $("build").disabled = building || !env.ok;
  renderFiles();
  renderPhoto();
  if (mode === "layout") drawLayout();
}

function files() {
  if (!built) return [];
  const name = `${fileBase}_${built.tag}`;
  return [
    { key: "zip", label: t("common.printSet"), sub: t("tool.zipSub"), primary: true, file: `${name}.zip` },
    { key: "stl", label: t("tool.fileBox"), sub: t("tool.fileBoxSub", { v: built.volume }), file: `${name}.stl` },
    { key: "svg", label: t("tool.fileCheck"), sub: t("tool.fileCheckSub"), file: `${name}_check.svg` },
    { key: "md", label: t("common.buildSheet"), sub: t("tool.mdSub"), file: `${name}_BUILD_SHEET.md` },
    { key: "json", label: t("tool.fileProject"), sub: t("tool.fileProjectSub"), file: `${name}.json` },
  ];
}
function renderFiles() {
  const list = files();
  $("files-for").textContent = built ? `· ${built.tag.replace(/x/g, " × ")}` : "";
  $("files").replaceChildren(...list.map((f) => {
    const btn = el("button", { type: "button", textContent: t("common.download"), disabled: building });
    btn.addEventListener("click", () => download(f));
    return el("div", { className: `file${f.primary ? " primary" : ""}` }, el("strong", { textContent: f.label }), btn, el("small", { textContent: f.sub }));
  }));
  const stale = built && built.key !== keyOf();
  $("files-note").textContent = !built ? t("tool.filesEmpty") : stale ? t("common.stale") : "";
}
// texts are written at download time, in the page's current language
const sheetMd = () => insertBuildSheet(built.env, built.tag, pick(V.title), t);
const checkSvg = () => insertSvg(built.env, { title: t("sheet.toolSvgTitle", { tag: built.tag }), scale: t("sheet.toolSvgScale") });
const projectJson = () => JSON.stringify(built.project, null, 1);
function download(f) {
  const enc = (s) => new TextEncoder().encode(s);
  let data;
  if (f.key === "zip") {
    const name = `${fileBase}_${built.tag}`;
    data = new Blob([zipSync({
      [`${name}.stl`]: new Uint8Array(built.stl), [`${name}_check.svg`]: enc(checkSvg()), "BUILD_SHEET.md": enc(sheetMd()),
      [`${name}.json`]: enc(projectJson()),
    }, { level: 6 })]);
  } else if (f.key === "stl") data = new Blob([built.stl]);
  else if (f.key === "svg") data = new Blob([checkSvg()], { type: "image/svg+xml" });
  else if (f.key === "md") data = new Blob([sheetMd()]);
  else data = new Blob([projectJson()], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(data), download: f.file });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// ---------- 3-D preview ----------
const canvas3d = $("view3d");
const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 1, 6000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, canvas3d);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(300, -400, 700);
scene.add(sun);
const boxMat = new THREE.MeshStandardMaterial({ color: 0x5f86c9, roughness: 0.55, metalness: 0.05 });
const toolMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.4, metalness: 0.3 });
const boxGroup = new THREE.Group(), toolGroup = new THREE.Group();
scene.add(boxGroup, toolGroup);
let grid = null;
function clear3d(g) { g.children.forEach((c) => c.geometry.dispose()); g.clear(); }
function setBox(msg) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(msg.positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(msg.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(msg.indices, 1));
  clear3d(boxGroup);
  boxGroup.add(new THREE.Mesh(geo, boxMat));
}
function setTools3d(e) { // the tools themselves, standing in their pockets
  clear3d(toolGroup);
  for (const it of e.items) for (const poly of offset(it.region, -e.clearance, 0.1)) {
    const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: it.height, bevelEnabled: false });
    const mesh = new THREE.Mesh(geo, toolMat);
    mesh.position.z = it.floor;
    toolGroup.add(mesh);
  }
}
function frame3d(e) {
  if (grid) { scene.remove(grid); grid.geometry.dispose(); }
  grid = new THREE.GridHelper(42 * 12, 12, new THREE.Color(css("--line")), new THREE.Color(css("--line")));
  grid.rotation.x = Math.PI / 2;
  grid.position.set((e.x_count % 2) * 21, (e.y_count % 2) * 21, -0.01);
  scene.add(grid);
  const r = Math.hypot(e.W, e.D, e.top) / 2;
  const dist = (r / Math.sin((camera.fov * Math.PI) / 360)) * 1.1;
  const dir = new THREE.Vector3(0.45, -0.8, 0.9).normalize();
  controls.target.set(0, 0, e.top / 3);
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  controls.update();
}
function resize3d() {
  const { clientWidth: w, clientHeight: h } = canvas3d.parentElement;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(() => { if (mode === "3d") resize3d(); else redraw(); }).observe(canvas3d.parentElement);

// ---------- build ----------
let shown = null; // status as [key, vars, kind], shown again after a language switch
const status = (key, vars = {}, kind = "") => { shown = [key, vars, kind]; showStatus(); };
function showStatus() {
  if (!shown) return;
  const [key, vars, kind] = shown, s = $("status");
  s.textContent = t(key, Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, typeof v === "function" ? v() : v])));
  s.className = `status ${kind}`;
}
const workerError = (msg) => () => (msg.code === "kernel" ? t("common.kernelError", { status: msg.status }) : msg.message);
let worker = null, pending = null, t0 = 0, kernelReady = false, queued = false;
// OpenCascade's WASM heap only grows, so every build gets a fresh worker (the kernel comes from the browser cache)
function startWorker() {
  kernelReady = false;
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = onWorkerMessage;
  worker.onerror = (e) => {
    building = false;
    status("common.workerStopped", { error: () => e.message || t("common.unknownError") }, "err");
    render();
  };
}
function onWorkerMessage({ data: msg }) {
  if (msg.type === "ready") {
    kernelReady = true;
    if (queued) { queued = false; build(); }
  } else if (msg.type === "progress") status("tool.buildingBox", {}, "busy");
  else if (msg.type === "part") {
    pending.stl = msg.stl;
    pending.volume = msg.volume;
    setBox(msg);
  } else if (msg.type === "done") {
    built = pending;
    building = false;
    setTools3d(built.env);
    status("common.built", { size: built.tag.replace(/x/g, " × "), s: (performance.now() - t0) / 1000 });
    render();
    worker.terminate();
    startWorker();
  } else if (msg.type === "error") {
    building = false;
    status("common.failed", { error: workerError(msg) }, "err");
    render();
    worker.terminate();
    startWorker();
  }
}
function build() {
  if (building || !env?.ok) return;
  if (!kernelReady) { queued = true; status("common.kernel", {}, "busy"); return; }
  building = true;
  t0 = performance.now();
  const proj = exportProject();
  pending = { key: keyOf(), tag: `${env.x_count}x${env.y_count}x${env.z_count}`, env, project: proj };
  clear3d(boxGroup);
  clear3d(toolGroup);
  frame3d(env);
  setMode("3d");
  status("common.starting", {}, "busy");
  render();
  worker.postMessage({ type: "build", inputs: proj.inputs, tools: proj.tools });
}
$("build").addEventListener("click", build);

// ---------- start ----------
const relabel = () => {
  applyDom(t);
  $("title").textContent = document.title = pick(V.title);
  paramLabels.forEach((f) => f());
};
relabel();
mountLangSwitch();
document.addEventListener("langchange", () => {
  relabel();
  render();
  showStatus();
  renderHint();
});
update();
setMode("layout");
status(project.tools.length ? "tool.welcomeBack" : "tool.welcome", { n: project.tools.length });
startWorker();
