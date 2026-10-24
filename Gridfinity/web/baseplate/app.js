// Gridfinity baseplate generator - UI for both variants (size in cells, or fitted to a drawer). The variant comes from
// model.json, which the site build writes next to the page; geometry runs in worker.js, the datasheet uses plateEnv.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { zipSync } from "./vendor/fflate.js";
import { plateEnv, plateBuildSheet } from "./src/baseplate.js";

const $ = (id) => document.getElementById(id);
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

$("title").textContent = V.title;
document.title = V.title;
$("lede").textContent = variant === "drawer"
  ? "A Gridfinity baseplate that fills a drawer: enter its inside size, and the page fits as many 42 mm cells as possible and fills the rest with a flat border. Larger plates are split into pieces that fit the printer."
  : "A Gridfinity baseplate to the official dimensions, sized in 42 mm cells, with an optional solid bottom plate and magnet holes. Plates larger than the printer are split into pieces.";
$("size-h").textContent = variant === "drawer" ? "Drawer" : "Size in Gridfinity cells";

// ---------- state ----------
const inputs = Object.fromEntries(KEYS.map((k) => [k, P[k].default]));
const valid = (p, v) => (p.type === "bool" ? typeof v === "boolean"
  : p.type === "choice" ? p.options.some(([o]) => o === v) : typeof v === "number" && v >= p.min && v <= p.max);
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
  for (const k of KEYS) if (valid(P[k], saved[k])) inputs[k] = saved[k];
} catch { /* storage unavailable: defaults */ }
let built = null; // { tag, env, parts: {A: {stl, volume}, ...}, sheet }
let building = false;

const fmt = (v, d = 1) => v.toFixed(d);
const num = (v) => String(+v.toFixed(2));
const tagOf = (i) => (variant === "drawer" ? `${num(i.width)}x${num(i.depth)}mm` : `${i.x_count}x${i.y_count}`) +
  (i.bottom ? `_b${num(i.bottom_h)}` : "") + (i.bottom && i.magnets ? "_mag" : "");
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const envOf = (i = inputs) => plateEnv(spec, { ...i, variant });
const active = (p) => !p.requires || inputs[p.requires];

// ---------- parameters (generated from the spec) ----------
const params = $("params");
for (const key of KEYS) {
  const p = P[key];
  const name = el(p.type === "int" || p.type === "choice" ? "div" : "label", { className: "param-name", htmlFor: key, id: `${key}-name` },
    p.label, el("small", { textContent: p.help }));
  let control;
  if (p.type === "int") {
    const minus = el("button", { type: "button", textContent: "−", ariaLabel: `Fewer ${p.label.toLowerCase()} cells` });
    const plus = el("button", { type: "button", textContent: "+", ariaLabel: `More ${p.label.toLowerCase()} cells` });
    minus.addEventListener("click", () => setInput(key, inputs[key] - 1));
    plus.addEventListener("click", () => setInput(key, inputs[key] + 1));
    control = el("div", { className: "stepper" }, minus, el("output", { id: key }), plus);
  } else if (p.type === "bool") {
    control = el("input", { type: "checkbox", id: key });
    control.addEventListener("change", () => setInput(key, control.checked));
  } else if (p.type === "choice") {
    control = el("div", { className: "seg", role: "group", id: key, ariaLabel: p.label }, ...p.options.map(([value, text]) => {
      const b = el("button", { type: "button", textContent: text });
      b.dataset.value = value;
      b.addEventListener("click", () => setInput(key, value));
      return b;
    }));
  } else {
    control = el("input", { type: "number", id: key, inputMode: "decimal", min: p.min, max: p.max, step: p.step ?? 0.1 });
    control.addEventListener("change", () => setInput(key, Number(control.value)));
  }
  params.append(name, control);
}

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
      $(key).value = num(inputs[key]);
      $(key).disabled = !on;
    }
    $(`${key}-name`).classList.toggle("off", !on);
    $(key).classList.toggle("off", !on);
  }
  const env = envOf();
  drawFootprint(env);
  const strips = Object.entries(env.pad).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${fmt(v)}`);
  const rows = [];
  if (env.drawer) rows.push(["Drawer (inside)", `${fmt(env.width)} × ${fmt(env.depth)} mm`]);
  rows.push(["Plate", `${fmt(env.W)} × ${fmt(env.D)} × ${fmt(env.H)} mm`]);
  rows.push(["Grid", `${env.nx} × ${env.ny} cells = ${fmt(env.grid[0])} × ${fmt(env.grid[1])} mm`]);
  if (env.drawer) rows.push(["Border strips", strips.length ? strips.join(" · ") + " mm" : "none"]);
  rows.push(["Bottom plate", env.b ? `${fmt(env.b)} mm, closed` : "none, open bottom"]);
  rows.push(["Magnets", env.magnetCount ? `${env.magnetCount} × 6 × 2 mm` : "none"]);
  rows.push(["Pieces", env.pieces.length === 1 ? "1" : `${env.pieces.length} (${env.split[0]} × ${env.split[1]}), ${env.unique.length} different`]);
  if (env.boxUnits !== null) rows.push(["Boxes in the drawer", env.boxUnits >= 1 ? `up to ${env.boxUnits} units (${fmt(7 * env.boxUnits + spec.design.box_top)} mm)` : "drawer too low"]);
  $("sheet").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]));
  const bed = spec.bed, chips = [];
  chips.push(env.pieces.length === 1 ? chip("ok", `Fits a ${bed[0]} × ${bed[1]} bed in one piece`)
    : chip("signal", `Splits into ${env.pieces.length} pieces of at most ${bed[0]} × ${bed[1]} mm`));
  if (env.dropped > 0.005) chips.push(chip("signal", `${env.dropped.toFixed(2)} mm left free (too narrow for a strip)`));
  if (env.boxUnits !== null && env.boxUnits < 1) chips.push(chip("signal", "The drawer is too low for a box"));
  $("chips").replaceChildren(...chips);
  $("footprint-text").textContent = (env.drawer ? `${env.nx} × ${env.ny} cells in a ${fmt(env.W)} × ${fmt(env.D)} mm plate` : `${env.nx} × ${env.ny} cells of 42 × 42 mm`) +
    (env.pieces.length > 1 ? `, printed as ${env.pieces.length} pieces.` : ".") + " Front at the bottom.";
  const current = built && built.tag === tagOf(inputs);
  $("build").textContent = building ? "Building…" : current ? "Rebuild baseplate" : "Build baseplate";
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
  if (many) list.push({ key: "zip", label: "Print set (.zip)", sub: `${env.unique.length} STL${env.unique.length > 1 ? "s" : ""} and the build sheet`, primary: true, file: `${fileBase}_${built.tag}.zip` });
  for (const u of env.unique) {
    list.push({
      key: u.id, label: many ? `Piece ${u.id}${u.count > 1 ? ` × ${u.count}` : ""} (.stl)` : "Baseplate (.stl)", primary: !many, file: pieceFile(u),
      sub: `${fmt(u.w)} × ${fmt(u.d)} × ${fmt(env.H)} mm, ${fmt(built.parts[u.id].volume, 1)} cm³`,
    });
  }
  list.push({ key: "md", label: "Build sheet (.md)", sub: many ? "dimensions, piece layout" : "dimensions, magnets", file: `${fileBase}_${built.tag}_BUILD_SHEET.md` });
  return list;
}
function renderFiles() {
  const list = files();
  $("files-for").textContent = built ? `· ${built.tag.split("_")[0].replace(/x/g, " × ").replace("mm", " mm")}` : "";
  $("files").replaceChildren(...list.map((f) => {
    const btn = el("button", { type: "button", textContent: "Download", disabled: building });
    btn.addEventListener("click", () => download(f));
    return el("div", { className: `file${f.primary ? " primary" : ""}` }, el("strong", { textContent: f.label }), btn, el("small", { textContent: f.sub }));
  }));
  const stale = built && built.tag !== tagOf(inputs);
  $("files-note").textContent = !built ? "The files appear once the baseplate is built."
    : stale ? "These files are for the last build; build again to get the current settings." : "";
}

function download(f) {
  let data;
  if (f.key === "zip") {
    const entries = { "BUILD_SHEET.md": new TextEncoder().encode(built.sheet) };
    for (const u of built.env.unique) entries[pieceFile(u)] = new Uint8Array(built.parts[u.id].stl);
    data = new Blob([zipSync(entries, { level: 6 })]);
  } else if (f.key === "md") data = new Blob([built.sheet]);
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
  $("legend").replaceChildren(...env.unique.map((u, k) =>
    el("span", { style: `--c:${hex(COLORS[k % COLORS.length])}`, textContent: env.pieces.length > 1 ? `${u.id}${u.count > 1 ? ` × ${u.count}` : ""}` : "Baseplate" })));
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
const status = (text, kind = "") => { const s = $("status"); s.textContent = text; s.className = `status ${kind}`; };
let worker = null, pending = null, t0 = 0, kernelReady = false, firstBuild = true, queued = false;

// OpenCascade's WASM heap only grows, so every build gets a fresh worker (the kernel comes from the browser cache)
function startWorker() {
  kernelReady = false;
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = onWorkerMessage;
  worker.onerror = (e) => {
    building = false;
    $("build").disabled = false;
    status(`The geometry worker stopped: ${e.message || "unknown error"}`, "err");
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
    status(msg.total > 1 ? `Building piece ${msg.id} (${msg.index + 1} of ${msg.total})…` : "Building the baseplate…", "busy");
  } else if (msg.type === "part") {
    pending.parts[msg.id] = { stl: msg.stl, volume: msg.volume };
    setPart(msg.id, msg, pending.env);
  } else if (msg.type === "done") {
    built = { ...pending, sheet: plateBuildSheet(pending.env, pending.tag, V.title) };
    building = false;
    $("build").disabled = false;
    status(`Built ${pending.env.nx} × ${pending.env.ny} cells in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    render();
    recycleWorker();
  } else if (msg.type === "error") {
    building = false;
    $("build").disabled = false;
    status(`Build failed: ${msg.message}`, "err");
    render();
    recycleWorker();
  }
}

function build() {
  if (building) return;
  if (!kernelReady) {
    queued = true;
    status("Loading the geometry kernel…", "busy");
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
  status("Starting…", "busy");
  render();
  worker.postMessage({ type: "build", inputs: { ...inputs, variant } });
}
$("build").addEventListener("click", build);
render();
status("Loading the geometry kernel (about 7 MB)…", "busy");
startWorker();
