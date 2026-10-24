// Gridfinity baseplate generator - UI for both variants (size in cells, or fitted to a drawer). The variant comes from
// model.json, which the site build writes next to the page; geometry runs in worker.js, the datasheet uses plateEnv.
// Texts: src/strings.js and the {en, de} labels of the spec; the language switch re-renders the page in place.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { zipSync } from "./vendor/fflate.js";
import { translator, applyDom, mountLangSwitch, num, pick } from "./vendor/i18n.js";
import { plateEnv, plateBuildSheet, SIDES } from "./src/baseplate.js";
import S from "./src/strings.js";

const $ = (id) => document.getElementById(id);
const t = translator(S);
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};
const model = await fetch(new URL("./model.json", import.meta.url)).then((r) => (r.ok ? r.json() : {}), () => ({}));
const variant = model.variant === "drawer" ? "drawer" : "grid";
const spec = await (await fetch(new URL("./baseplate_params.json", import.meta.url))).json();
const V = spec.variants[variant], P = V.parameters, KEYS = Object.keys(P);
const STORE = `gridfinity-baseplate-${variant}-inputs`;
const fileBase = variant === "drawer" ? "Gridfinity_Drawer_Baseplate" : "Gridfinity_Baseplate";
const COLORS = [0x5f86c9, 0x4fa3a5, 0x8a7cc9, 0xc98a5f, 0x6fae6a, 0xc96f8a, 0x9aa55a, 0x5fa0c9];
const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;

function labelPage() {
  $("title").textContent = document.title = pick(V.title);
  $("lede").textContent = t(variant === "drawer" ? "plate.ledeDrawer" : "plate.ledeGrid");
  $("size-h").textContent = t(variant === "drawer" ? "plate.sizeDrawer" : "plate.sizeGrid");
}

// ---------- state ----------
const inputs = Object.fromEntries(KEYS.map((k) => [k, P[k].default]));
const valid = (p, v) => (p.type === "bool" ? typeof v === "boolean"
  : p.type === "choice" ? p.options.some(([o]) => o === v) : typeof v === "number" && v >= p.min && v <= p.max);
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
  for (const k of KEYS) if (valid(P[k], saved[k])) inputs[k] = saved[k];
} catch { /* storage unavailable: defaults */ }
let built = null; // { tag, env, parts: {A: {stl, volume}, ...} }
let building = false;

const fmt = (v, d = 1) => num(v, d);
const short = (v) => String(+v.toFixed(2)); // input values and file names: always with a decimal point
const tagOf = (i) => (variant === "drawer" ? `${short(i.width)}x${short(i.depth)}mm` : `${i.x_count}x${i.y_count}`) +
  (i.bottom ? `_b${short(i.bottom_h)}` : "") + (i.bottom && i.magnets ? "_mag" : "");
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const envOf = (i = inputs) => plateEnv(spec, { ...i, variant });
const active = (p) => !p.requires || inputs[p.requires];

// ---------- parameters (generated from the spec) ----------
const params = $("params"), labels = []; // labels: functions that write the current language into the controls
for (const key of KEYS) {
  const p = P[key];
  const text = el("span"), help = el("small");
  const name = el(p.type === "int" || p.type === "choice" ? "div" : "label", { className: "param-name", htmlFor: key, id: `${key}-name` }, text, help);
  labels.push(() => { text.textContent = pick(p.label); help.textContent = pick(p.help); });
  let control;
  if (p.type === "int") {
    const minus = el("button", { type: "button", textContent: "−" });
    const plus = el("button", { type: "button", textContent: "+" });
    labels.push(() => {
      minus.ariaLabel = t("common.decrease", { name: pick(p.label) });
      plus.ariaLabel = t("common.increase", { name: pick(p.label) });
    });
    minus.addEventListener("click", () => setInput(key, inputs[key] - 1));
    plus.addEventListener("click", () => setInput(key, inputs[key] + 1));
    control = el("div", { className: "stepper" }, minus, el("output", { id: key }), plus);
  } else if (p.type === "bool") {
    control = el("input", { type: "checkbox", id: key });
    control.addEventListener("change", () => setInput(key, control.checked));
  } else if (p.type === "choice") {
    const seg = control = el("div", { className: "seg", role: "group", id: key }, ...p.options.map(([value, text]) => {
      const b = el("button", { type: "button" });
      b.dataset.value = value;
      b.addEventListener("click", () => setInput(key, value));
      labels.push(() => { b.textContent = pick(text); });
      return b;
    }));
    labels.push(() => { seg.ariaLabel = pick(p.label); });
  } else {
    control = el("input", { type: "number", id: key, inputMode: "decimal", min: p.min, max: p.max, step: p.step ?? 0.1 });
    control.addEventListener("change", () => setInput(key, Number(control.value)));
  }
  params.append(name, control);
}
const labelParams = () => labels.forEach((f) => f());

function setInput(key, value) {
  const p = P[key];
  if (p.type === "bool") inputs[key] = Boolean(value);
  else if (p.type === "choice") inputs[key] = value;
  else {
    if (!Number.isFinite(value)) value = p.default;
    value = Math.min(p.max, Math.max(p.min, value));
    inputs[key] = p.type === "int" ? Math.round(value) : Math.round(value * 100) / 100;
  }
  try { localStorage.setItem(STORE, JSON.stringify(inputs)); } catch { /* ignore */ }
  render();
}

function render() {
  for (const key of KEYS) {
    const p = P[key], on = active(p);
    if (p.type === "int") {
      $(key).textContent = inputs[key];
      const [minus, plus] = $(key).parentElement.querySelectorAll("button");
      minus.disabled = inputs[key] <= p.min;
      plus.disabled = inputs[key] >= p.max;
    } else if (p.type === "bool") {
      $(key).checked = inputs[key] && on;
      $(key).disabled = !on;
    } else if (p.type === "choice") {
      for (const b of $(key).querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.value === inputs[key]));
    } else {
      $(key).value = short(inputs[key]);
      $(key).disabled = !on;
    }
    $(`${key}-name`).classList.toggle("off", !on);
    $(key).classList.toggle("off", !on);
  }
  const env = envOf();
  drawFootprint(env);
  const strips = Object.entries(env.pad).filter(([, v]) => v > 0).map(([k, v]) => `${t(SIDES[k])} ${fmt(v)}`);
  const rows = [];
  if (env.drawer) rows.push([t("plate.rowDrawer"), `${fmt(env.width)} × ${fmt(env.depth)} mm`]);
  rows.push([t("plate.rowPlate"), `${fmt(env.W)} × ${fmt(env.D)} × ${fmt(env.H)} mm`]);
  rows.push([t("plate.rowGrid"), t("plate.valGrid", { nx: env.nx, ny: env.ny, w: env.grid[0], d: env.grid[1] })]);
  if (env.drawer) rows.push([t("plate.rowStrips"), strips.length ? strips.join(" · ") + " mm" : t("common.none")]);
  rows.push([t("plate.rowBottom"), env.b ? t("plate.valBottom", { b: env.b }) : t("plate.valNoBottom")]);
  rows.push([t("common.magnets"), env.magnetCount ? `${env.magnetCount} × 6 × 2 mm` : t("common.none")]);
  rows.push([t("plate.rowPieces"), env.pieces.length === 1 ? "1"
    : t("plate.valPieces", { total: env.pieces.length, cx: env.split[0], cy: env.split[1], n: env.unique.length })]);
  if (env.boxUnits !== null) rows.push([t("plate.rowBoxes"), env.boxUnits >= 1
    ? t("plate.valBoxes", { n: env.boxUnits, h: 7 * env.boxUnits + spec.design.box_top }) : t("plate.valTooLow")]);
  $("sheet").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]));
  const bed = spec.bed, chips = [];
  chips.push(env.pieces.length === 1 ? chip("ok", t("plate.chipOnePiece", { x: bed[0], y: bed[1] }))
    : chip("signal", t("plate.chipSplit", { n: env.pieces.length, x: bed[0], y: bed[1] })));
  if (env.dropped > 0.005) chips.push(chip("signal", t("plate.chipDropped", { d: env.dropped })));
  if (env.boxUnits !== null && env.boxUnits < 1) chips.push(chip("signal", t("plate.chipTooLow")));
  $("chips").replaceChildren(...chips);
  const many = env.pieces.length > 1, at = { nx: env.nx, ny: env.ny, w: env.W, d: env.D, n: env.pieces.length };
  $("footprint-text").textContent = env.drawer ? t(many ? "plate.footprintDrawerPieces" : "plate.footprintDrawer", at)
    : t(many ? "plate.footprintGridPieces" : "plate.footprintGrid", at);
  const current = built && built.tag === tagOf(inputs);
  $("build").textContent = building ? t("common.building") : current ? t("plate.rebuild") : t("plate.build");
  renderFiles();
}
const chip = (kind, text) => el("span", { className: `chip ${kind}`, textContent: text });

function drawFootprint(env) {
  const cv = $("footprint"), g = cv.getContext("2d");
  const W = cv.width, H = cv.height, pad = 8;
  const outer = env.drawer ? [env.width, env.depth] : [env.W, env.D];
  const s = Math.min((W - 2 * pad) / outer[0], (H - 2 * pad) / outer[1]);
  const X = (x) => W / 2 + x * s, Y = (y) => H / 2 - y * s; // plate frame: centred, front (-Y) at the bottom
  g.clearRect(0, 0, W, H);
  if (env.drawer) { // drawer inside
    g.setLineDash([4, 3]);
    g.strokeStyle = css("--muted");
    g.lineWidth = 1;
    g.strokeRect(X(-env.width / 2), Y(env.depth / 2), env.width * s, env.depth * s);
    g.setLineDash([]);
  }
  const x0 = -env.W / 2, y0 = -env.D / 2;
  g.fillStyle = css("--strip");
  g.beginPath();
  g.roundRect(X(x0), Y(-y0), env.W * s, env.D * s, 4 * s);
  g.fill();
  g.fillStyle = css("--grid-cell");
  const gap = Math.min(1, 2 * s);
  for (let i = 0; i < env.nx; i++)
    for (let j = 0; j < env.ny; j++) {
      g.beginPath();
      g.roundRect(X(x0 + env.pad.left + 42 * i) + gap, Y(y0 + env.pad.front + 42 * (j + 1)) + gap, 42 * s - 2 * gap, 42 * s - 2 * gap, 4 * s);
      g.fill();
    }
  if (env.pieces.length > 1) { // split lines and piece letters
    g.strokeStyle = css("--cut");
    g.lineWidth = 1.5;
    g.fillStyle = css("--ink");
    g.font = `600 20px ${css("--mono").split(",")[0]}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const q of env.pieces) {
      g.strokeRect(X(q.cx - q.w / 2), Y(q.cy + q.d / 2), q.w * s, q.d * s);
      g.fillText(q.id, X(q.cx), Y(q.cy));
    }
  }
  g.strokeStyle = css("--accent");
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(X(x0), Y(-y0), env.W * s, env.D * s, 4 * s);
  g.stroke();
}

// ---------- files ----------
const pieceFile = (u) => `${fileBase}_${built.tag}${built.env.pieces.length > 1 ? `_${u.id}${u.count > 1 ? `_x${u.count}` : ""}` : ""}.stl`;
function files() {
  if (!built) return [];
  const { env } = built, many = env.pieces.length > 1, list = [];
  if (many) list.push({ key: "zip", label: t("common.printSet"), sub: t("plate.zipSub", { n: env.unique.length }), primary: true, file: `${fileBase}_${built.tag}.zip` });
  for (const u of env.unique) {
    const label = !many ? t("plate.filePlate") : u.count > 1 ? t("plate.filePieceCount", { id: u.id, count: u.count }) : t("plate.filePiece", { id: u.id });
    list.push({
      key: u.id, label, primary: !many, file: pieceFile(u),
      sub: t("plate.fileSub", { w: u.w, d: u.d, h: env.H, v: built.parts[u.id].volume }),
    });
  }
  list.push({ key: "md", label: t("common.buildSheet"), sub: t(many ? "plate.mdSubPieces" : "plate.mdSub"), file: `${fileBase}_${built.tag}_BUILD_SHEET.md` });
  return list;
}
function renderFiles() {
  const list = files();
  $("files-for").textContent = built ? `· ${built.tag.split("_")[0].replace(/x/g, " × ").replace("mm", " mm")}` : "";
  $("files").replaceChildren(...list.map((f) => {
    const btn = el("button", { type: "button", textContent: t("common.download"), disabled: building });
    btn.addEventListener("click", () => download(f));
    return el("div", { className: `file${f.primary ? " primary" : ""}` }, el("strong", { textContent: f.label }), btn, el("small", { textContent: f.sub }));
  }));
  const stale = built && built.tag !== tagOf(inputs);
  $("files-note").textContent = !built ? t("plate.empty") : stale ? t("common.stale") : "";
}

// the build sheet is written at download time, in the page's current language
const sheet = () => plateBuildSheet(built.env, built.tag, pick(V.title), t);
function download(f) {
  let data;
  if (f.key === "zip") {
    const entries = { "BUILD_SHEET.md": new TextEncoder().encode(sheet()) };
    for (const u of built.env.unique) entries[pieceFile(u)] = new Uint8Array(built.parts[u.id].stl);
    data = new Blob([zipSync(entries, { level: 6 })]);
  } else if (f.key === "md") data = new Blob([sheet()]);
  else data = new Blob([built.parts[f.key].stl]);
  const a = el("a", { href: URL.createObjectURL(data), download: f.file });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// ---------- 3-D preview ----------
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 1, 8000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(300, -400, 700);
scene.add(sun);
const plate = new THREE.Group();
scene.add(plate);
let grid = null, spread = false, layoutEnv = null;
const SPREAD = 12; // mm between the pieces in the spread view

// every placed piece shares its unique piece's geometry, turned by its quarter turns
function setPart(id, msg, env) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(msg.positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(msg.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(msg.indices, 1));
  const k = env.unique.findIndex((u) => u.id === id);
  const mat = new THREE.MeshStandardMaterial({ color: COLORS[k % COLORS.length], roughness: 0.55, metalness: 0.05 });
  for (const q of env.pieces.filter((p) => p.id === id)) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.z = (q.quarter * Math.PI) / 2;
    mesh.userData = q;
    plate.add(mesh);
  }
  place();
}
function place() {
  if (!layoutEnv) return;
  const [cols, rows] = layoutEnv.split;
  for (const mesh of plate.children) {
    const q = mesh.userData, d = spread ? SPREAD : 0;
    mesh.position.set(q.cx + (q.col - (cols - 1) / 2) * d, q.cy + (q.row - (rows - 1) / 2) * d, 0);
  }
}
function clearParts() {
  const geos = new Set(), mats = new Set();
  for (const m of plate.children) { geos.add(m.geometry); mats.add(m.material); }
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
  plate.clear();
}
function frame(env) {
  if (grid) { scene.remove(grid); grid.geometry.dispose(); }
  const n = Math.ceil(Math.max(env.W, env.D) / 42) + 4;
  grid = new THREE.GridHelper(42 * n, n, new THREE.Color(css("--line")), new THREE.Color(css("--line")));
  grid.rotation.x = Math.PI / 2;
  const snap = (lo) => lo + 42 * Math.round(-lo / 42) + (n % 2 ? 21 : 0); // grid lines on the cell boundaries, near the centre
  grid.position.set(snap(-env.W / 2 + env.pad.left), snap(-env.D / 2 + env.pad.front), -0.01);
  scene.add(grid);
  const r = Math.hypot(env.W, env.D, env.H) / 2 + (env.pieces.length > 1 ? SPREAD : 0);
  const dist = r / Math.sin((camera.fov * Math.PI) / 360) * 1.05;
  const dir = new THREE.Vector3(0.35, -0.75, 0.95).normalize();
  controls.target.set(0, 0, 0);
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  controls.update();
  $("views").hidden = env.pieces.length < 2;
  showLegend();
}
function showLegend() {
  const env = layoutEnv;
  if (!env) return;
  $("legend").replaceChildren(...env.unique.map((u, k) =>
    el("span", { style: `--c:${hex(COLORS[k % COLORS.length])}`, textContent: env.pieces.length > 1 ? `${u.id}${u.count > 1 ? ` × ${u.count}` : ""}` : t("plate.legendPlate") })));
}
for (const [id, value] of [["view-closed", false], ["view-open", true]]) {
  $(id).addEventListener("click", () => {
    spread = value;
    $("view-closed").setAttribute("aria-pressed", String(!value));
    $("view-open").setAttribute("aria-pressed", String(value));
    place();
  });
}
function resize() {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);
resize();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// ---------- build ----------
// status line as [key, vars, kind], so a language switch can show it again; function vars are evaluated when shown
let shown = null;
const status = (key, vars = {}, kind = "") => { shown = [key, vars, kind]; showStatus(); };
function showStatus() {
  const [key, vars, kind] = shown, s = $("status");
  s.textContent = t(key, Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, typeof v === "function" ? v() : v])));
  s.className = `status ${kind}`;
}
const workerError = (msg) => () => (msg.code === "kernel" ? t("common.kernelError", { status: msg.status }) : msg.message);
let worker = null, pending = null, t0 = 0, kernelReady = false, firstBuild = true, queued = false;

// OpenCascade's WASM heap only grows, so every build gets a fresh worker (the kernel comes from the browser cache)
function startWorker() {
  kernelReady = false;
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = onWorkerMessage;
  worker.onerror = (e) => {
    building = false;
    $("build").disabled = false;
    status("common.workerStopped", { error: () => e.message || t("common.unknownError") }, "err");
    render();
  };
}
function recycleWorker() {
  worker.terminate();
  startWorker();
}

function onWorkerMessage({ data: msg }) {
  if (msg.type === "ready") {
    kernelReady = true;
    if (queued || firstBuild) {
      queued = firstBuild = false;
      build();
    }
  } else if (msg.type === "progress") {
    if (msg.total > 1) status("plate.buildingPiece", { id: msg.id, i: msg.index + 1, n: msg.total }, "busy");
    else status("plate.buildingPlate", {}, "busy");
  } else if (msg.type === "part") {
    pending.parts[msg.id] = { stl: msg.stl, volume: msg.volume };
    setPart(msg.id, msg, pending.env);
  } else if (msg.type === "done") {
    built = { ...pending };
    building = false;
    $("build").disabled = false;
    status("plate.built", { nx: pending.env.nx, ny: pending.env.ny, s: (performance.now() - t0) / 1000 });
    render();
    recycleWorker();
  } else if (msg.type === "error") {
    building = false;
    $("build").disabled = false;
    status("common.failed", { error: workerError(msg) }, "err");
    render();
    recycleWorker();
  }
}

function build() {
  if (building) return;
  if (!kernelReady) {
    queued = true;
    status("common.kernel", {}, "busy");
    return;
  }
  building = true;
  $("build").disabled = true;
  t0 = performance.now();
  const env = envOf();
  pending = { tag: tagOf(inputs), inputs: { ...inputs }, env, parts: {} };
  layoutEnv = env;
  clearParts();
  frame(env);
  status("common.starting", {}, "busy");
  render();
  worker.postMessage({ type: "build", inputs: { ...inputs, variant } });
}
$("build").addEventListener("click", build);
const relabel = () => { applyDom(t); labelPage(); labelParams(); };
relabel();
mountLangSwitch();
document.addEventListener("langchange", () => {
  relabel();
  render();
  showLegend();
  showStatus();
});
render();
status("common.kernelFirst", {}, "busy");
startWorker();
