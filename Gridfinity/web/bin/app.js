// Gridfinity box generator - UI for both variants (standard box, box with label). The variant comes from model.json,
// which the site build writes next to the page; geometry runs in worker.js, the datasheet uses binEnv from src/bin.js.
// Texts: src/strings.js and the {en, de} labels of the spec; the language switch re-renders the page in place.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { zipSync } from "./vendor/fflate.js";
import { translator, applyDom, mountLangSwitch, num, pick } from "./vendor/i18n.js";
import { binEnv, binBuildSheet } from "./src/bin.js";
import S from "./src/strings.js";

const $ = (id) => document.getElementById(id);
const t = translator(S);
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};
const model = await fetch(new URL("./model.json", import.meta.url)).then((r) => (r.ok ? r.json() : {}), () => ({}));
const variant = model.variant === "label" ? "label" : "standard";
const spec = await (await fetch(new URL("./bin_params.json", import.meta.url))).json();
const V = spec.variants[variant], P = V.parameters, KEYS = Object.keys(P);
const STORE = `gridfinity-box-${variant}-inputs`;
const fileBase = variant === "label" ? "Gridfinity_Box_Label" : "Gridfinity_Box";

function labelPage() {
  $("title").textContent = document.title = pick(V.title);
  $("lede").textContent = t(variant === "label" ? "box.ledeLabel" : "box.ledeStandard");
}
if (variant === "label") $("views").hidden = $("legend-plate").hidden = false;

// ---------- state ----------
const inputs = Object.fromEntries(KEYS.map((k) => [k, P[k].default]));
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
  for (const k of KEYS) {
    const p = P[k], v = saved[k];
    if (p.type === "bool" ? typeof v === "boolean" : typeof v === "number" && v >= p.min && v <= p.max) inputs[k] = v;
  }
} catch { /* storage unavailable: defaults */ }
let built = null; // { tag, env, parts: {Box: {stl, volume}, Plate: ...} }
let building = false;

const fmt = (v, d = 1) => num(v, d);
const tagOf = (i) => `${i.x_count}x${i.y_count}x${i.z_count}${i.magnets ? "" : "_nomag"}` +
  (i.plate_gap ? `_g${String(i.plate_gap).replace(".", "")}` : "");
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const envOf = () => binEnv(spec, { ...inputs, variant });

// ---------- parameters (generated from the spec) ----------
const params = $("params"), labels = []; // labels: functions that write the current language into the controls
for (const key of KEYS) {
  const p = P[key];
  const text = el("span"), help = el("small");
  const name = el(p.type === "int" ? "div" : "label", { className: "param-name", htmlFor: key }, text, help);
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
  } else {
    control = el("input", { type: "number", id: key, inputMode: "decimal", min: p.min, max: p.max, step: p.step ?? 0.05 });
    control.addEventListener("change", () => setInput(key, Number(control.value)));
  }
  params.append(name, control);
}
const labelParams = () => labels.forEach((f) => f());

function setInput(key, value) {
  const p = P[key];
  if (p.type === "bool") inputs[key] = Boolean(value);
  else {
    if (!Number.isFinite(value)) value = p.default;
    value = Math.min(p.max, Math.max(p.min, value));
    inputs[key] = p.type === "int" ? Math.round(value) : Math.round(value * 100) / 100;
  }
  try { localStorage.setItem(STORE, JSON.stringify(inputs)); } catch { /* ignore */ }
  render();
}

// smallest Rugged Case (Gridfinity/spec/case_params.json ranges) that takes this box, or why none does; text() translates it
function ruggedFit(env) {
  const rc = spec.rugged_case;
  const z = Math.max(rc.z_min, env.z_count + rc.z_extra);
  const lo = Math.min(env.x_count, env.y_count), hi = Math.max(env.x_count, env.y_count);
  const fit = (ok, key, vars) => ({ ok, z, text: () => t(key, vars) });
  if (hi > Math.max(rc.x_max, rc.y_max) || lo > Math.min(rc.x_max, rc.y_max)) return fit(false, "box.fitWide", { x: rc.x_max, y: rc.y_max });
  if (z > rc.z_max) return fit(false, "box.fitTall", { z: rc.z_max });
  const fits = env.x_count <= rc.x_max && env.y_count <= rc.y_max;
  const [x, y] = fits ? [env.x_count, env.y_count] : [env.y_count, env.x_count];
  return fit(true, "box.fitOk", { x: Math.max(rc.x_min, x), y: Math.max(rc.y_min, y), z });
}

function render() {
  for (const key of KEYS) {
    const p = P[key];
    if (p.type === "int") {
      $(key).textContent = inputs[key];
      const [minus, plus] = $(key).parentElement.querySelectorAll("button");
      minus.disabled = inputs[key] <= p.min;
      plus.disabled = inputs[key] >= p.max;
    } else if (p.type === "bool") $(key).checked = inputs[key];
    else $(key).value = inputs[key].toFixed(2);
  }
  const env = envOf();
  drawFootprint(env);
  const fit = ruggedFit(env);
  const rows = [
    [t("box.rowOutside"), `${fmt(env.W)} × ${fmt(env.D)} × ${fmt(env.top)} mm`],
    [t("box.rowWall"), `${fmt(env.T)} / ${fmt(env.top)} mm`],
    [t("box.rowInside"), `${fmt(env.inner[0])} × ${fmt(env.inner[1])} mm`],
    [t("box.rowDepth"), `${fmt(env.depth)} mm`],
    [t("box.rowOpening"), `${fmt(env.opening[0])} × ${fmt(env.opening[1])} mm`],
    [t("box.rowCapacity"), t("box.valCapacity", { l: env.capacity })],
    [t("common.magnets"), env.magnets ? `${env.x_count * env.y_count * 4} × 6 × 2 mm` : t("common.none")],
  ];
  if (env.label) rows.push([t("box.rowPlate"), `${fmt(env.plate[0])} × ${fmt(env.plate[1])} × ${fmt(env.plate[2], 2)} mm`]);
  const rc = spec.rugged_case, need = Math.max(rc.z_min, env.z_count + rc.z_extra);
  rows.push([t("box.rowRugged"), need <= rc.z_max ? t("box.valRugged", { n: need }) : t("box.valRuggedOver", { n: need, max: rc.z_max })]);
  $("sheet").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]));
  const bed = spec.bed, onBed = env.W <= bed[0] && env.D <= bed[1];
  $("chips").replaceChildren(
    chip(onBed ? "ok" : "signal", t(onBed ? "common.bedFits" : "common.bedTooBig", { x: bed[0], y: bed[1] })),
    chip(fit.ok ? "ok" : "signal", fit.text()));
  $("footprint-text").textContent = t(env.label ? "box.footprintLabel" : "box.footprint", { x: env.x_count, y: env.y_count, z: env.z_count });
  const current = built && built.tag === tagOf(inputs);
  $("build").textContent = building ? t("common.building") : current ? t("box.rebuild") : t("box.build");
  renderFiles();
}
const chip = (kind, text) => el("span", { className: `chip ${kind}`, textContent: text });

function drawFootprint(env) {
  const cv = $("footprint"), g = cv.getContext("2d");
  const W = cv.width, H = cv.height, pad = 10;
  const scale = (Math.min(W, H) - 2 * pad) / (10 * 42);
  g.clearRect(0, 0, W, H);
  const w = env.x_count * 42 * scale, h = env.y_count * 42 * scale, x0 = (W - w) / 2, y0 = (H - h) / 2;
  g.fillStyle = css("--grid-cell");
  for (let i = 0; i < env.x_count; i++)
    for (let j = 0; j < env.y_count; j++) {
      g.beginPath();
      g.roundRect(x0 + i * 42 * scale + 1, y0 + j * 42 * scale + 1, 42 * scale - 2, 42 * scale - 2, 4 * scale);
      g.fill();
    }
  if (env.label) { // label strip on the back (+Y = top of the drawing)
    g.fillStyle = css("--label");
    g.fillRect(x0 + 2.6 * scale, y0 + 1.2 * scale, w - 5.2 * scale, Math.max(3, 13 * scale));
  }
  g.strokeStyle = css("--accent");
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(x0, y0, w, h, 4 * scale);
  g.stroke();
}

// ---------- files ----------
function files() {
  if (!built) return [];
  const name = `${fileBase}_${built.tag}`;
  const list = [];
  if (built.parts.Plate)
    list.push({ key: "zip", label: t("common.printSet"), sub: t("box.zipSub"), primary: true, file: `${name}.zip` });
  list.push({ key: "Box", label: t("box.fileBox"), sub: t("box.fileBoxSub", { v: built.parts.Box.volume }), primary: !built.parts.Plate, file: `${name}.stl` });
  if (built.parts.Plate) list.push({ key: "Plate", label: t("box.filePlate"), sub: t("box.filePlateSub", { v: built.parts.Plate.volume }), file: `${name}_Label_Plate.stl` });
  list.push({ key: "md", label: t("common.buildSheet"), sub: t("box.mdSub"), file: `${name}_BUILD_SHEET.md` });
  return list;
}
function renderFiles() {
  const list = files();
  $("files-for").textContent = built ? `· ${built.tag.replace(/x/g, " × ").split("_")[0]}` : "";
  $("files").replaceChildren(...list.map((f) => {
    const btn = el("button", { type: "button", textContent: t("common.download"), disabled: building });
    btn.addEventListener("click", () => download(f));
    return el("div", { className: `file${f.primary ? " primary" : ""}` }, el("strong", { textContent: f.label }), btn, el("small", { textContent: f.sub }));
  }));
  const stale = built && built.tag !== tagOf(inputs);
  $("files-note").textContent = !built ? t("box.empty") : stale ? t("common.stale") : "";
}

// the build sheet is written at download time, in the page's current language
const sheet = () => binBuildSheet(built.env, built.tag.split("_")[0], pick(V.title), ruggedFit(built.env).text(), t);
function download(f) {
  let data;
  if (f.key === "zip") {
    const entries = {
      [`${fileBase}_${built.tag}.stl`]: new Uint8Array(built.parts.Box.stl),
      [`${fileBase}_${built.tag}_Label_Plate.stl`]: new Uint8Array(built.parts.Plate.stl),
      "BUILD_SHEET.md": new TextEncoder().encode(sheet()),
    };
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
const camera = new THREE.PerspectiveCamera(32, 1, 1, 6000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(300, -400, 700);
scene.add(sun);
const MATS = {
  Box: new THREE.MeshStandardMaterial({ color: 0x5f86c9, roughness: 0.55, metalness: 0.05 }),
  Plate: new THREE.MeshStandardMaterial({ color: 0xe6a23c, roughness: 0.5 }),
};
const groups = Object.fromEntries(Object.keys(MATS).map((k) => [k, new THREE.Group()]));
Object.values(groups).forEach((g) => scene.add(g));
let grid = null, lifted = false;

function setPart(part, msg) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(msg.positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(msg.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(msg.indices, 1));
  const g = groups[part];
  g.children.forEach((c) => c.geometry.dispose());
  g.clear();
  g.add(new THREE.Mesh(geo, MATS[part]));
  groups.Plate.position.z = lifted ? 20 : 0;
}
function clearParts() {
  for (const g of Object.values(groups)) { g.children.forEach((c) => c.geometry.dispose()); g.clear(); }
}
function frame(env) {
  if (grid) { scene.remove(grid); grid.geometry.dispose(); }
  grid = new THREE.GridHelper(42 * 12, 12, new THREE.Color(css("--line")), new THREE.Color(css("--line")));
  grid.rotation.x = Math.PI / 2;
  grid.position.set((env.x_count % 2) * 21, (env.y_count % 2) * 21, -0.01); // grid lines on the cell boundaries
  scene.add(grid);
  const r = Math.hypot(env.W, env.D, env.top) / 2;
  const dist = r / Math.sin((camera.fov * Math.PI) / 360) * 1.1;
  const dir = new THREE.Vector3(0.55, -0.8, 0.75).normalize();
  controls.target.set(0, 0, env.top / 2);
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  controls.update();
}
for (const [id, value] of [["view-closed", false], ["view-open", true]]) {
  $(id).addEventListener("click", () => {
    lifted = value;
    $("view-closed").setAttribute("aria-pressed", String(!value));
    $("view-open").setAttribute("aria-pressed", String(value));
    groups.Plate.position.z = lifted ? 20 : 0;
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
    status(msg.part === "Plate" ? "box.buildingPlate" : "box.buildingBox", {}, "busy");
  } else if (msg.type === "part") {
    pending.parts[msg.part] = { stl: msg.stl, volume: msg.volume };
    setPart(msg.part, msg);
  } else if (msg.type === "done") {
    built = { ...pending, env: binEnv(spec, { ...pending.inputs, variant }) };
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
  clearParts();
  frame(envOf());
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
  showStatus();
});
render();
status("common.kernelFirst", {}, "busy");
startWorker();
