// Gridfinity box generator - UI for both variants (standard box, box with label). The variant comes from model.json,
// which the site build writes next to the page; geometry runs in worker.js, the datasheet uses binEnv from src/bin.js.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { zipSync } from "./vendor/fflate.js";
import { binEnv, binBuildSheet } from "./src/bin.js";

const $ = (id) => document.getElementById(id);
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

$("title").textContent = V.title;
document.title = V.title;
$("lede").textContent = variant === "label"
  ? "A Gridfinity box to the official dimensions, with a label ledge on the back wall, a separate label plate and a scoop at the front. Set the size in grid units, build it, and download the print files."
  : "A plain Gridfinity box to the official dimensions: stacking lip, magnet holes and 7 mm height units. Set the size in grid units, build it, and download the print files.";
$("build").textContent = "Build box";
if (variant === "label") {
  $("views").hidden = false;
  $("legend").append(el("span", { style: "--c:#e6a23c", textContent: "Label plate" }));
}

// ---------- state ----------
const inputs = Object.fromEntries(KEYS.map((k) => [k, P[k].default]));
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
  for (const k of KEYS) {
    const p = P[k], v = saved[k];
    if (p.type === "bool" ? typeof v === "boolean" : typeof v === "number" && v >= p.min && v <= p.max) inputs[k] = v;
  }
} catch { /* storage unavailable: defaults */ }
let built = null; // { tag, env, parts: {Box: {stl, volume}, Plate: ...}, sheet }
let building = false;

const fmt = (v, d = 1) => v.toFixed(d);
const tagOf = (i) => `${i.x_count}x${i.y_count}x${i.z_count}${i.magnets ? "" : "_nomag"}` +
  (i.plate_gap ? `_g${String(i.plate_gap).replace(".", "")}` : "");
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const envOf = () => binEnv(spec, { ...inputs, variant });

// ---------- parameters (generated from the spec) ----------
const params = $("params");
for (const key of KEYS) {
  const p = P[key];
  const name = el(p.type === "int" ? "div" : "label", { className: "param-name", htmlFor: key }, p.label, el("small", { textContent: p.help }));
  let control;
  if (p.type === "int") {
    const minus = el("button", { type: "button", textContent: "−", ariaLabel: `Fewer ${p.label.toLowerCase()} units` });
    const plus = el("button", { type: "button", textContent: "+", ariaLabel: `More ${p.label.toLowerCase()} units` });
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

// smallest Rugged Case (Gridfinity/spec/case_params.json ranges) that takes this box, or why none does
function ruggedFit(env) {
  const rc = spec.rugged_case;
  const z = Math.max(rc.z_min, env.z_count + rc.z_extra);
  const lo = Math.min(env.x_count, env.y_count), hi = Math.max(env.x_count, env.y_count);
  if (hi > Math.max(rc.x_max, rc.y_max) || lo > Math.min(rc.x_max, rc.y_max)) return { ok: false, text: `Wider than the largest Rugged Case (${rc.x_max} × ${rc.y_max})` };
  if (z > rc.z_max) return { ok: false, text: `Taller than the largest Rugged Case (${rc.z_max} units)` };
  const fits = env.x_count <= rc.x_max && env.y_count <= rc.y_max;
  const [x, y] = fits ? [env.x_count, env.y_count] : [env.y_count, env.x_count];
  return { ok: true, z, text: `Rugged Case ${Math.max(rc.x_min, x)} × ${Math.max(rc.y_min, y)} × ${z} or larger` };
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
    ["Outside", `${fmt(env.W)} × ${fmt(env.D)} × ${fmt(env.top)} mm`],
    ["Wall top / with lip", `${fmt(env.T)} / ${fmt(env.top)} mm`],
    ["Inside at the floor", `${fmt(env.inner[0])} × ${fmt(env.inner[1])} mm`],
    ["Usable depth", `${fmt(env.depth)} mm`],
    ["Opening under the lip", `${fmt(env.opening[0])} × ${fmt(env.opening[1])} mm`],
    ["Capacity (gross)", `≈ ${env.capacity.toFixed(2)} l`],
    ["Magnets", env.magnets ? `${env.x_count * env.y_count * 4} × 6 × 2 mm` : "none"],
  ];
  if (env.label) rows.push(["Label plate", `${fmt(env.plate[0])} × ${fmt(env.plate[1])} × ${env.plate[2].toFixed(2)} mm`]);
  const rc = spec.rugged_case, need = Math.max(rc.z_min, env.z_count + rc.z_extra);
  rows.push(["Rugged Case height", need <= rc.z_max ? `≥ ${need} units` : `${need} units, above the ${rc.z_max} maximum`]);
  $("sheet").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]));
  const bed = spec.bed, onBed = env.W <= bed[0] && env.D <= bed[1];
  $("chips").replaceChildren(
    chip(onBed ? "ok" : "signal", onBed ? `Fits a ${bed[0]} × ${bed[1]} bed` : `Larger than a ${bed[0]} × ${bed[1]} bed`),
    chip(fit.ok ? "ok" : "signal", fit.text));
  $("footprint-text").textContent = `${env.x_count} × ${env.y_count} cells of 42 × 42 mm, ${env.z_count} × 7 mm high.` +
    (env.label ? " The label runs along the width, on the back wall." : "");
  const current = built && built.tag === tagOf(inputs);
  $("build").textContent = building ? "Building…" : current ? "Rebuild box" : "Build box";
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
  const t = built.tag, name = `${fileBase}_${t}`;
  const list = [];
  if (built.parts.Plate)
    list.push({ key: "zip", label: "Print set (.zip)", sub: "box and label plate as STL, build sheet", primary: true, file: `${name}.zip` });
  list.push({ key: "Box", label: "Box (.stl)", sub: `${fmt(built.parts.Box.volume, 1)} cm³, feet down`, primary: !built.parts.Plate, file: `${name}.stl` });
  if (built.parts.Plate) list.push({ key: "Plate", label: "Label plate (.stl)", sub: `${fmt(built.parts.Plate.volume, 2)} cm³, flat`, file: `${name}_Label_Plate.stl` });
  list.push({ key: "md", label: "Build sheet (.md)", sub: "dimensions, magnets, Rugged Case fit", file: `${name}_BUILD_SHEET.md` });
  return list;
}
function renderFiles() {
  const list = files();
  $("files-for").textContent = built ? `· ${built.tag.replace(/x/g, " × ").split("_")[0]}` : "";
  $("files").replaceChildren(...list.map((f) => {
    const btn = el("button", { type: "button", textContent: "Download", disabled: building });
    btn.addEventListener("click", () => download(f));
    return el("div", { className: `file${f.primary ? " primary" : ""}` }, el("strong", { textContent: f.label }), btn, el("small", { textContent: f.sub }));
  }));
  const stale = built && built.tag !== tagOf(inputs);
  $("files-note").textContent = !built ? "The files appear once the box is built."
    : stale ? "These files are for the last build; build again to get the current settings." : "";
}

function download(f) {
  let data;
  if (f.key === "zip") {
    const entries = {
      [`${fileBase}_${built.tag}.stl`]: new Uint8Array(built.parts.Box.stl),
      [`${fileBase}_${built.tag}_Label_Plate.stl`]: new Uint8Array(built.parts.Plate.stl),
      "BUILD_SHEET.md": new TextEncoder().encode(built.sheet),
    };
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
    status(`Building the ${msg.part === "Plate" ? "label plate" : "box"}…`, "busy");
  } else if (msg.type === "part") {
    pending.parts[msg.part] = { stl: msg.stl, volume: msg.volume };
    setPart(msg.part, msg);
  } else if (msg.type === "done") {
    const env = binEnv(spec, { ...pending.inputs, variant });
    const fit = ruggedFit(env);
    built = { ...pending, env, sheet: binBuildSheet(env, pending.tag.split("_")[0], V.title, fit.text) };
    building = false;
    $("build").disabled = false;
    status(`Built ${built.tag.split("_")[0].replace(/x/g, " × ")} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
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
  pending = { tag: tagOf(inputs), inputs: { ...inputs }, parts: {} };
  clearParts();
  frame(envOf());
  status("Starting…", "busy");
  render();
  worker.postMessage({ type: "build", inputs: { ...inputs, variant } });
}
$("build").addEventListener("click", build);
render();
status("Loading the geometry kernel (about 7 MB)…", "busy");
startWorker();
