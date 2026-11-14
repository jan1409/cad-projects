// Gridfinity label jig - UI. The jig holds 10 label plates of the Box with Label flush for the UV printer; it follows
// the box width. Geometry runs in worker.js, the datasheet and the layout drawing use jigEnv from src/jig.js.
// Texts: src/strings.js and the {en, de} labels of the spec's jig variant; the language switch re-renders in place.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { zipSync } from "./vendor/fflate.js";
import ClipperLib from "./vendor/clipper.js";
import { translator, applyDom, mountLangSwitch, num, pick } from "./vendor/i18n.js";
import { setClipper } from "./src/outline.js";
import { jigEnv, jigSvg, jigBuildSheet } from "./src/jig.js";
import S from "./src/strings.js";

setClipper(ClipperLib);
const $ = (id) => document.getElementById(id);
const t = translator(S);
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};
const spec = await (await fetch(new URL("./bin_params.json", import.meta.url))).json();
const V = spec.variants.jig, P = V.parameters, KEYS = Object.keys(P);
const STORE = "gridfinity-label-jig-inputs";
const fileBase = "Gridfinity_Label_Jig";
const UV_NAME = "xTool O1 Omni";

// ---------- state ----------
const inputs = Object.fromEntries(KEYS.map((k) => [k, P[k].default]));
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
  for (const k of KEYS) {
    const p = P[k], v = saved[k];
    if (p.type === "choice" ? p.options.some(([o]) => o === v) : typeof v === "number" && v >= p.min && v <= p.max) inputs[k] = v;
  }
} catch { /* storage unavailable: defaults */ }
let built = null, building = false; // built: { tag, env, stl, volume }
const fmt = (v, d = 1) => num(v, d);
const tagOf = (i) => `${i.x_count}u_${envOf().cols}col` + (i.plate_gap ? `_g${String(i.plate_gap).replace(".", "")}` : "");
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const envOf = () => jigEnv(spec, inputs);
const keyOf = () => JSON.stringify(inputs);

// ---------- parameters (generated from the spec) ----------
const params = $("params"), labels = [];
for (const key of KEYS) {
  const p = P[key], text = el("span"), help = el("small");
  const name = el(p.type === "float" ? "label" : "div", { className: "param-name", htmlFor: key }, text, help);
  labels.push(() => { text.textContent = pick(p.label); help.textContent = pick(p.help); });
  let control;
  if (p.type === "int") {
    const minus = el("button", { type: "button", textContent: "−" }), plus = el("button", { type: "button", textContent: "+" });
    labels.push(() => {
      minus.ariaLabel = t("common.decrease", { name: pick(p.label) });
      plus.ariaLabel = t("common.increase", { name: pick(p.label) });
    });
    minus.addEventListener("click", () => setInput(key, inputs[key] - 1));
    plus.addEventListener("click", () => setInput(key, inputs[key] + 1));
    control = el("div", { className: "stepper" }, minus, el("output", { id: key }), plus);
  } else if (p.type === "choice") {
    control = el("div", { className: "seg", role: "group", id: key });
    for (const [value, label] of p.options) {
      const b = el("button", { type: "button" });
      b.dataset.value = value;
      labels.push(() => { b.textContent = pick(label); });
      b.addEventListener("click", () => setInput(key, value));
      control.append(b);
    }
  } else {
    control = el("input", { type: "number", id: key, inputMode: "decimal", min: p.min, max: p.max, step: p.step ?? 0.05 });
    control.addEventListener("change", () => setInput(key, Number(control.value)));
  }
  params.append(name, control);
}
const labelParams = () => labels.forEach((f) => f());

function setInput(key, value) {
  const p = P[key];
  if (p.type === "choice") inputs[key] = value;
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
    const p = P[key];
    if (p.type === "int") {
      $(key).textContent = inputs[key];
      const [minus, plus] = $(key).parentElement.querySelectorAll("button");
      minus.disabled = inputs[key] <= p.min;
      plus.disabled = inputs[key] >= p.max;
    } else if (p.type === "choice") {
      for (const b of $(key).querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.value === inputs[key]));
    } else $(key).value = inputs[key].toFixed(2);
  }
  const env = envOf(), [pl, pw, pt] = env.plate;
  drawLayout(env);
  const rows = [
    [t("jig.rowPlate"), `${fmt(pl)} × ${fmt(pw)} × ${fmt(pt, 2)} mm`],
    [t("jig.rowLayout"), t("jig.valLayout", { cols: env.cols, rows: env.rows })],
    [t("jig.rowSize"), `${fmt(env.L)} × ${fmt(env.W)} × ${fmt(env.H, 2)} mm`],
    [t("jig.rowPocket"), `${fmt(env.pocket[0], 2)} × ${fmt(env.pocket[1], 2)} × ${fmt(pt, 2)} mm`],
  ];
  if (built && built.key === keyOf()) rows.push([t("jig.rowVolume"), t("jig.valVolume", { v: built.volume })]);
  $("sheet").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]));
  const bed = spec.bed, uv = env.uvArea;
  $("chips").replaceChildren(
    chip(env.uv ? "ok" : "signal", t(env.uv ? "jig.uvFits" : "jig.uvTooBig", { name: UV_NAME, a: uv[0], b: uv[1] })),
    chip(env.bed ? "ok" : "signal", t(env.bed ? "common.bedFits" : "common.bedTooBig", { x: bed[0], y: bed[1] })));
  $("footprint-text").textContent = t("jig.footprint", { x: env.x_count, cols: env.cols, rows: env.rows });
  const current = built && built.key === keyOf();
  $("build").textContent = building ? t("common.building") : current ? t("jig.rebuild") : t("jig.build");
  renderFiles();
}
const chip = (kind, text) => el("span", { className: `chip ${kind}`, textContent: text });

// small drawing of the jig with its 10 plates (the chamfered corner is label 1)
function drawLayout(env) {
  const cv = $("footprint"), g = cv.getContext("2d"), W = cv.width, H = cv.height, pad = 8;
  const s = Math.min((W - 2 * pad) / env.L, (H - 2 * pad) / env.W);
  const ox = W / 2, oy = H / 2, X = (x) => ox + x * s, Y = (y) => oy - y * s;
  g.clearRect(0, 0, W, H);
  g.fillStyle = css("--grid-cell");
  g.strokeStyle = css("--accent");
  g.lineWidth = 2;
  const c = env.mark;
  g.beginPath();
  g.moveTo(X(-env.L / 2), Y(env.W / 2 - c));
  g.lineTo(X(-env.L / 2), Y(-env.W / 2)); g.lineTo(X(env.L / 2), Y(-env.W / 2)); g.lineTo(X(env.L / 2), Y(env.W / 2)); g.lineTo(X(-env.L / 2 + c), Y(env.W / 2));
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = css("--label");
  for (const p of env.pockets) g.fillRect(X(p.x0), Y(p.y1), (p.x1 - p.x0) * s, (p.y1 - p.y0) * s);
}

// ---------- files ----------
function files() {
  if (!built) return [];
  const name = `${fileBase}_${built.tag}`;
  return [
    { key: "zip", label: t("common.printSet"), sub: t("jig.zipSub"), primary: true, file: `${name}.zip` },
    { key: "stl", label: t("jig.fileJig"), sub: t("jig.fileJigSub", { v: built.volume }), file: `${name}.stl` },
    { key: "svg", label: t("jig.fileLayout"), sub: t("jig.fileLayoutSub"), file: `${name}_layout.svg` },
    { key: "md", label: t("common.buildSheet"), sub: t("jig.mdSub"), file: `${name}_BUILD_SHEET.md` },
  ];
}
function renderFiles() {
  const list = files();
  $("files-for").textContent = built ? `· ${built.tag.split("_")[0]}` : "";
  $("files").replaceChildren(...list.map((f) => {
    const btn = el("button", { type: "button", textContent: t("common.download"), disabled: building });
    btn.addEventListener("click", () => download(f));
    return el("div", { className: `file${f.primary ? " primary" : ""}` }, el("strong", { textContent: f.label }), btn, el("small", { textContent: f.sub }));
  }));
  $("files-note").textContent = !built ? t("jig.empty") : built.key !== keyOf() ? t("common.stale") : "";
}
// texts are written at download time, in the page's current language
const sheetMd = () => jigBuildSheet(built.env, built.tag, pick(V.title), UV_NAME, t);
const layoutSvg = () => jigSvg(built.env, { title: t("jig.svgTitle", { tag: built.tag }) });
function download(f) {
  const enc = (s) => new TextEncoder().encode(s), name = `${fileBase}_${built.tag}`;
  const data = f.key === "zip"
    ? new Blob([zipSync({ [`${name}.stl`]: new Uint8Array(built.stl), [`${name}_layout.svg`]: enc(layoutSvg()), "BUILD_SHEET.md": enc(sheetMd()) }, { level: 6 })])
    : f.key === "stl" ? new Blob([built.stl]) : f.key === "svg" ? new Blob([layoutSvg()], { type: "image/svg+xml" }) : new Blob([sheetMd()]);
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
const camera = new THREE.PerspectiveCamera(32, 1, 1, 6000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(300, -400, 700);
scene.add(sun);
const MATS = {
  Jig: new THREE.MeshStandardMaterial({ color: 0x5f86c9, roughness: 0.55, metalness: 0.05 }),
  Plates: new THREE.MeshStandardMaterial({ color: 0xe6a23c, roughness: 0.5 }),
};
const groups = Object.fromEntries(Object.keys(MATS).map((k) => [k, new THREE.Group()]));
Object.values(groups).forEach((g) => scene.add(g));
function setPart(part, msg) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(msg.positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(msg.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(msg.indices, 1));
  const g = groups[part];
  g.children.forEach((c) => c.geometry.dispose());
  g.clear();
  g.add(new THREE.Mesh(geo, MATS[part]));
}
const clearParts = () => { for (const g of Object.values(groups)) { g.children.forEach((c) => c.geometry.dispose()); g.clear(); } };
function frame(env) {
  const r = Math.hypot(env.L, env.W) / 2, dist = (r / Math.sin((camera.fov * Math.PI) / 360)) * 1.1;
  controls.target.set(0, 0, 0);
  camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(0.35, -0.75, 0.9).normalize(), dist);
  controls.update();
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
let shown = null; // status as [key, vars, kind], shown again after a language switch
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
function onWorkerMessage({ data: msg }) {
  if (msg.type === "ready") {
    kernelReady = true;
    if (queued || firstBuild) { queued = firstBuild = false; build(); }
  } else if (msg.type === "progress") status("jig.buildingJig", {}, "busy");
  else if (msg.type === "part") {
    if (msg.part === "Jig") Object.assign(pending, { stl: msg.stl, volume: msg.volume });
    setPart(msg.part, msg);
  } else if (msg.type === "done") {
    built = pending;
    building = false;
    $("build").disabled = false;
    status("common.built", { size: built.tag.split("_")[0], s: (performance.now() - t0) / 1000 });
    render();
    worker.terminate();
    startWorker();
  } else if (msg.type === "error") {
    building = false;
    $("build").disabled = false;
    status("common.failed", { error: workerError(msg) }, "err");
    render();
    worker.terminate();
    startWorker();
  }
}
function build() {
  if (building) return;
  if (!kernelReady) { queued = true; status("common.kernel", {}, "busy"); return; }
  building = true;
  $("build").disabled = true;
  t0 = performance.now();
  const env = envOf();
  pending = { key: keyOf(), tag: tagOf(inputs), env };
  clearParts();
  frame(env);
  status("common.starting", {}, "busy");
  render();
  worker.postMessage({ type: "build", inputs: { ...inputs } });
}
$("build").addEventListener("click", build);
const relabel = () => {
  applyDom(t);
  $("title").textContent = document.title = pick(V.title);
  labelParams();
};
relabel();
mountLangSwitch();
document.addEventListener("langchange", () => {
  relabel();
  render();
  showStatus();
});
render();
status("common.kernelFirst", {}, "busy");
startWorker();
