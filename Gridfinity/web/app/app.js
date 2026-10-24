// Gridfinity Rugged Case generator - UI. Geometry runs in worker.js; the datasheet uses the same spec formulas.
// Texts: src/strings.js (English, German); the language switch re-renders the page and later downloads in place.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { zipSync } from "./vendor/fflate.js";
import { translator, applyDom, mountLangSwitch, num } from "./vendor/i18n.js";
import { caseEnv } from "./src/expr.js";
import { windowSVG, buildSheet } from "./src/case.js";
import S from "./src/strings.js";

const $ = (id) => document.getElementById(id);
const t = translator(S);
const spec = await (await fetch(new URL("./case_params.json", import.meta.url))).json();
const P = spec.parameters;
const KEYS = ["x_count", "y_count", "z_count", "window_t", "window_gap"];
const STORE = "gridfinity-rugged-case-inputs";

// ---------- state ----------
const inputs = Object.fromEntries(KEYS.map((k) => [k, P[k].default]));
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
  for (const k of KEYS) if (typeof saved[k] === "number" && saved[k] >= P[k].min && saved[k] <= P[k].max) inputs[k] = saved[k];
} catch { /* storage unavailable: defaults */ }
let built = null; // { tag, env, sizes, parts: {Base: {stl, volume}} }
let building = false;

const fmt = (v, d = 1) => num(v, d);
const tagOf = (i) => `${i.x_count}x${i.y_count}x${i.z_count}` +
  (Math.abs(i.window_t - 1.6) < 1e-9 ? "" : `_w${String(i.window_t).replace(".", "")}`) +
  (Math.abs(i.window_gap - P.window_gap.default) < 1e-9 ? "" : `_g${String(i.window_gap).replace(".", "")}`);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---------- parameters ----------
for (const el of document.querySelectorAll(".stepper")) {
  const key = el.dataset.key;
  const [minus, plus] = el.querySelectorAll("button");
  minus.addEventListener("click", () => setInput(key, inputs[key] - 1));
  plus.addEventListener("click", () => setInput(key, inputs[key] + 1));
}
for (const key of ["window_t", "window_gap"]) {
  const el = $(key);
  Object.assign(el, { min: P[key].min, max: P[key].max, step: 0.05 });
  el.addEventListener("change", () => setInput(key, Number(el.value)));
}
function setInput(key, value) {
  const p = P[key];
  if (!Number.isFinite(value)) value = p.default;
  value = Math.min(p.max, Math.max(p.min, value));
  inputs[key] = p.type === "int" ? Math.round(value) : Math.round(value * 100) / 100;
  try { localStorage.setItem(STORE, JSON.stringify(inputs)); } catch { /* ignore */ }
  render();
}

function render() {
  for (const key of ["x_count", "y_count", "z_count"]) {
    $(key).textContent = inputs[key];
    const [minus, plus] = document.querySelectorAll(`.stepper[data-key="${key}"] button`);
    minus.disabled = inputs[key] <= P[key].min;
    plus.disabled = inputs[key] >= P[key].max;
  }
  $("window_t").value = inputs.window_t.toFixed(2);
  $("window_gap").value = inputs.window_gap.toFixed(2);
  const env = caseEnv(spec, inputs);
  drawFootprint(env);
  const outer = [env.Li + 8.52, env.Wi + 22.52, env.top + 3.2];
  const rows = [
    [t("case.rowInner"), `${env.Li} × ${env.Wi} mm`],
    [t("case.rowClear"), `${fmt(env.top - 5.5)} mm`],
    [t("case.rowBoxes"), t("case.valBoxes", { n: inputs.z_count })], // lip clears the closed lid by 1 mm (node/bin_case_fit.mjs)
    [t("case.rowOutside"), `${outer.map((v) => fmt(v)).join(" × ")} mm`],
    [t("case.rowHeights"), `${fmt(env.split + 6.6)} / ${fmt(env.top - env.split + 3.4)} mm`],
    [t("case.rowWindow"), `${env.Li - 4} × ${env.Wi - 4} × ${fmt(inputs.window_t, 2)} mm`],
    [t("case.rowHardware"), t("case.valHardware")],
  ];
  $("sheet").replaceChildren(...rows.flatMap(([k, v]) => [Object.assign(document.createElement("dt"), { textContent: k }),
    Object.assign(document.createElement("dd"), { textContent: v })]));
  const fits = outer[0] <= 360 && outer[1] <= 360;
  $("chips").replaceChildren(
    chip(fits ? "ok" : "signal", t(fits ? "common.bedFits" : "common.bedTooBig", { x: 360, y: 360 })),
    chip("signal", t("case.chipPause", { z: 1.2 + inputs.window_t + inputs.window_gap })));
  $("footprint-text").textContent = t("case.footprint", { x: inputs.x_count, y: inputs.y_count });
  const current = built && built.tag === tagOf(inputs);
  $("build").textContent = building ? t("common.building") : current ? t("case.rebuild") : t("case.build");
  renderFiles();
}
const chip = (kind, text) => Object.assign(document.createElement("span"), { className: `chip ${kind}`, textContent: text });

function drawFootprint(env) {
  const cv = $("footprint"), g = cv.getContext("2d");
  const W = cv.width, H = cv.height, pad = 10;
  const scale = (Math.min(W, H) - 2 * pad) / (8 * 42);
  g.clearRect(0, 0, W, H);
  const w = env.Li * scale, h = env.Wi * scale, x0 = (W - w) / 2, y0 = (H - h) / 2;
  g.fillStyle = css("--grid-cell");
  g.strokeStyle = css("--accent");
  g.lineWidth = 2;
  for (let i = 0; i < env.x_count; i++)
    for (let j = 0; j < env.y_count; j++) {
      g.beginPath();
      g.roundRect(x0 + i * 42 * scale + 2, y0 + j * 42 * scale + 2, 42 * scale - 4, 42 * scale - 4, 4 * scale);
      g.fill();
    }
  g.beginPath();
  g.roundRect(x0, y0, w, h, 4 * scale);
  g.stroke();
}

// ---------- files ----------
let downloads; // undefined = not asked yet, null = no capability (local page or not granted)
const inArtifact = typeof window.claude?.use === "function";
async function getDownloads() {
  if (downloads === undefined) downloads = inArtifact ? await window.claude.use("downloads") : null;
  return downloads;
}
if (inArtifact) getDownloads().then(() => renderFiles());

function files() {
  if (!built) return [];
  const name = `Gridfinity_Rugged_Case_${built.tag}`;
  const list = [
    { key: "zip", label: t("common.printSet"), sub: t("case.zipSub"), primary: true },
    { key: "svg", label: t("case.svg"), sub: t("case.svgSub", { w: built.env.Li - 4, h: built.env.Wi - 4 }), file: `${name}_Window_${built.env.window_t.toFixed(2)}mm.svg` },
    { key: "md", label: t("common.buildSheet"), sub: t("case.mdSub"), file: `${name}_BUILD_SHEET.md` },
  ];
  if (!inArtifact) // single STLs are offered only where plain downloads work (STL is not on the artifact download list)
    for (const [part, file, label] of [["Base", "Base", "case.fileBase"], ["Lid", "Lid", "case.fileLid"], ["Latch", "Latch_x2", "case.fileLatch"], ["Seal", "Seal_TPU", "case.fileSeal"]])
      list.push({ key: part, label: t(label), sub: t(part === "Latch" ? "case.latchSub" : "case.partSub", { v: built.parts[part].volume }), file: `${name}_${file}.stl` });
  return list;
}
function renderFiles() {
  const list = files();
  $("files-for").textContent = built ? `· ${built.tag.replace(/x/g, " × ").split("_")[0]}` : "";
  $("files").replaceChildren(...list.map((f) => {
    const row = Object.assign(document.createElement("div"), { className: `file${f.primary ? " primary" : ""}` });
    const btn = Object.assign(document.createElement("button"), { type: "button", textContent: t("common.download") });
    btn.disabled = building || (inArtifact && downloads === null);
    btn.addEventListener("click", () => download(f));
    row.append(Object.assign(document.createElement("strong"), { textContent: f.label }), btn,
      Object.assign(document.createElement("small"), { textContent: f.sub }));
    return row;
  }));
  const stale = built && built.tag !== tagOf(inputs);
  $("files-note").textContent = !built ? t("case.empty")
    : inArtifact && downloads === null ? t("case.noDownloads")
      : stale ? t("common.stale") : "";
}

async function download(f) {
  let filename = f.file, data;
  // window SVG and build sheet are written now, in the page's current language
  const svg = () => windowSVG(built.env, t), sheet = () => buildSheet(built.env, built.tag, built.sizes, t);
  if (f.key === "zip") {
    filename = `Gridfinity_Rugged_Case_${built.tag}.zip`;
    const enc = new TextEncoder(), entries = {};
    for (const [part, file] of [["Base", "Base"], ["Lid", "Lid"], ["Latch", "Latch_x2"], ["Seal", "Seal_TPU"]])
      entries[`Gridfinity_Rugged_Case_${built.tag}_${file}.stl`] = new Uint8Array(built.parts[part].stl);
    entries[`Gridfinity_Rugged_Case_${built.tag}_Window_${built.env.window_t.toFixed(2)}mm.svg`] = enc.encode(svg());
    entries["BUILD_SHEET.md"] = enc.encode(sheet());
    data = new Blob([zipSync(entries, { level: 6 })]);
  } else if (f.key === "svg") data = new Blob([svg()]);
  else if (f.key === "md") data = new Blob([sheet()]);
  else data = new Blob([built.parts[f.key].stl]);
  const cap = await getDownloads();
  if (cap) {
    try {
      await cap.save({ filename, data });
      toast(t("case.saved", { file: filename }));
    } catch (err) {
      toast(err?.code === "declined" ? t("case.cancelled") : err?.code === "rate_limited" ? t("case.waiting") : t("case.saveFailed", { error: err?.message ?? err }));
    }
    return;
  }
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(data), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
let toastTimer;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

// ---------- 3-D preview ----------
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 1, 6000);
camera.up.set(0, 0, 1);
camera.position.set(420, -520, 360);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(300, -400, 700);
scene.add(sun);
const MATS = {
  Base: new THREE.MeshStandardMaterial({ color: 0x5f86c9, roughness: 0.55, metalness: 0.05 }),
  Lid: new THREE.MeshStandardMaterial({ color: 0x5f86c9, roughness: 0.55, metalness: 0.05 }),
  Latch: new THREE.MeshStandardMaterial({ color: 0xd8952b, roughness: 0.5 }),
  Seal: new THREE.MeshStandardMaterial({ color: 0x3b4148, roughness: 0.8 }),
  Window: new THREE.MeshPhysicalMaterial({ color: 0xa9d3ee, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }),
};
const groups = Object.fromEntries(Object.keys(MATS).map((k) => [k, new THREE.Group()]));
Object.values(groups).forEach((g) => scene.add(g));
let grid = null;
const EXPLODE = { Base: 0, Seal: 12, Latch: 24, Lid: 44, Window: 44 };
let exploded = false;

function setPart(part, msg, env) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(msg.positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(msg.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(msg.indices, 1));
  const g = groups[part];
  g.children.forEach((c) => c.geometry.dispose());
  g.clear();
  g.add(new THREE.Mesh(geo, MATS[part]));
  if (part === "Latch") { // second latch at -hinge_x (the part is symmetric about its mid plane)
    const twin = new THREE.Mesh(geo, MATS[part]);
    twin.position.x = -2 * env.hinge_x;
    g.add(twin);
  }
  applyExplode();
}
function applyExplode() {
  for (const [part, dz] of Object.entries(EXPLODE)) groups[part].position.z = exploded ? dz : 0;
}
function frame(env) {
  if (grid) { scene.remove(grid); grid.geometry.dispose(); }
  const size = 42 * 10;
  grid = new THREE.GridHelper(size, 10, new THREE.Color(css("--line")), new THREE.Color(css("--line")));
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -3.21;
  grid.position.x = (env.x_count % 2) * 21; // grid lines on the cell boundaries
  grid.position.y = (env.y_count % 2) * 21;
  scene.add(grid);
  const r = Math.hypot(env.Li + 8.5, env.Wi + 22.5, env.top + 3.2) / 2;
  const dist = r / Math.sin((camera.fov * Math.PI) / 360) * 1.05;
  const dir = new THREE.Vector3(0.62, -0.78, 0.62).normalize();
  controls.target.set(0, 0, env.top / 2);
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  controls.update();
}
for (const [id, value] of [["view-closed", false], ["view-open", true]]) {
  $(id).addEventListener("click", () => {
    exploded = value;
    $("view-closed").setAttribute("aria-pressed", String(!value));
    $("view-open").setAttribute("aria-pressed", String(value));
    applyExplode();
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
  const [key, vars, kind] = shown, el = $("status");
  el.textContent = t(key, Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, typeof v === "function" ? v() : v])));
  el.className = `status ${kind}`;
}
const workerError = (msg) => () => (msg.code === "kernel" ? t("common.kernelError", { status: msg.status }) : msg.message);
let worker = null, pending = null, t0 = 0, kernelReady = false, firstBuild = true, queued = false;
const PROGRESS = { Base: "case.buildingBase", Lid: "case.buildingLid", Latch: "case.buildingLatch", Seal: "case.buildingSeal", Window: "case.buildingWindow" };

// OpenCascade's WASM heap only grows, and many builds in one worker eventually run out of memory. So every build
// gets a fresh worker; the replacement loads the kernel (from the browser cache) while the user looks at the result.
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
    status(PROGRESS[msg.part], {}, "busy");
  } else if (msg.type === "part") {
    pending.parts[msg.part] = { stl: msg.stl, volume: msg.volume };
    setPart(msg.part, msg, caseEnv(spec, pending.inputs));
  } else if (msg.type === "done") {
    built = { ...pending, env: msg.env, sizes: msg.sizes };
    building = false;
    $("build").disabled = false;
    status("common.built", { size: built.tag.split("_")[0].replace(/x/g, " × "), s: (performance.now() - t0) / 1000 });
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
  pending = { tag: tagOf(inputs), inputs: { ...inputs }, parts: {} };
  frame(caseEnv(spec, inputs));
  status("common.starting", {}, "busy");
  render();
  worker.postMessage({ type: "build", inputs: { ...inputs }, tag: pending.tag });
}
$("build").addEventListener("click", build);
applyDom(t);
mountLangSwitch();
document.addEventListener("langchange", () => {
  applyDom(t);
  render();
  showStatus();
});
render();
status("common.kernelFirst", {}, "busy");
startWorker();
