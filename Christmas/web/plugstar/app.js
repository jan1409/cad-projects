// Plug-together star - UI. The geometry (src/plugstar.js, a port of the SolidCraft model) runs in worker.js; this page
// places the parts into the star for the preview, colours every point with its filament and writes the files (STL per
// part, the painted 3MF for the chosen slicer, build sheet, fit test) with src/paint3mf.js. Texts: src/strings.js and
// the {en, de} labels of the spec.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { zipSync } from "./vendor/fflate.js";
import { translator, applyDom, mountLangSwitch, pick } from "./vendor/i18n.js";
import {
  plugEnv, plugLayout, plugProblems, minDiameter, printFit, partList, plugTag, plugBuildSheet, printPose, transformMesh,
  defaultAssign, plateObjects, partGrams, pointAngle, fitOptions, PART_KEYS,
} from "./src/plugstar.js";
import { threemfEntries, stlBytes } from "./src/paint3mf.js";
import S from "./src/strings.js";

const $ = (id) => document.getElementById(id);
const t = translator(S);
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};
const spec = await (await fetch(new URL("./plugstar_params.json", import.meta.url))).json();
const P = spec.parameters;
const PARAMS = Object.keys(P).filter((k) => k !== "slicer"); // the form (the slicer sits with the files)
const SLICERS = Object.fromEntries(P.slicer.options.map(([v, label]) => [v, label]));
const STORE = "christmas-plugstar-inputs";
const SLOTS = spec.colors.length;

// ---------- state ----------
const inputs = Object.fromEntries(Object.keys(P).map((k) => [k, P[k].default]));
const colours = [...spec.colors];
let assign = defaultAssign(inputs.points);
const valid = (p, v) => (p.type === "choice" ? p.options.some(([o]) => o === v) : p.type === "bool" ? typeof v === "boolean"
  : typeof v === "number" && v >= p.min && v <= p.max);
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
  for (const k of Object.keys(P)) if (valid(P[k], saved[k])) inputs[k] = saved[k];
  (saved.colours ?? []).forEach((c, i) => { if (i < SLOTS && /^#[0-9a-f]{6}$/i.test(c)) colours[i] = c; });
  const a = saved.assign;
  assign = Array.isArray(a) && a.length === inputs.points && a.every((s) => Number.isInteger(s) && s >= 1 && s <= SLOTS) ? a : defaultAssign(inputs.points);
} catch { /* storage unavailable: defaults */ }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ ...inputs, colours, assign })); } catch { /* ignore */ } };
let built = null, building = false; // built: { key, env, parts: {point, point_hang?, connector, fit_0, fit_1: {pos, tri, volume, area}} }
const envOf = () => plugEnv(spec, inputs);
const keyOf = () => JSON.stringify(PARAMS.map((k) => inputs[k]));

// ---------- parameters (generated from the spec) ----------
const params = $("params"), labels = [];
const segment = (key, p, onPick) => {
  const control = el("div", { className: "seg", role: "group", id: key });
  for (const [value, label] of p.options) {
    const b = el("button", { type: "button" });
    b.dataset.value = String(value);
    labels.push(() => { b.textContent = pick(label); });
    b.addEventListener("click", () => onPick(value));
    control.append(b);
  }
  labels.push(() => { control.ariaLabel = pick(p.label); });
  return control;
};
for (const key of PARAMS) {
  const p = P[key], text = el("span"), help = el("small");
  const name = el(p.type === "int" || p.type === "choice" ? "div" : "label", { className: "param-name", htmlFor: key, id: `${key}-name` }, text, help);
  labels.push(() => { text.textContent = pick(p.label); help.textContent = pick(p.help); });
  let control;
  if (p.type === "int") {
    const minus = el("button", { type: "button", textContent: "−" }), plus = el("button", { type: "button", textContent: "+" });
    labels.push(() => {
      minus.ariaLabel = t("plugstar.decrease", { name: pick(p.label) });
      plus.ariaLabel = t("plugstar.increase", { name: pick(p.label) });
    });
    minus.addEventListener("click", () => setInput(key, inputs[key] - p.step));
    plus.addEventListener("click", () => setInput(key, inputs[key] + p.step));
    control = el("div", { className: "stepper" }, minus, el("output", { id: key }), plus);
  } else if (p.type === "choice") {
    control = segment(key, p, (value) => setInput(key, value));
  } else if (p.type === "bool") {
    control = el("input", { type: "checkbox", id: key });
    control.addEventListener("change", () => setInput(key, control.checked));
  } else {
    control = el("input", { type: "number", id: key, inputMode: "decimal", min: p.min, max: p.max, step: p.step });
    control.addEventListener("change", () => setInput(key, Number(control.value)));
  }
  params.append(name, control);
}
// slicer: a choice in the files section (it changes the 3MF, not the star)
const slicerLabel = el("span", { className: "param-name" });
const slicerSeg = segment("slicer", P.slicer, (value) => { inputs.slicer = value; save(); render(); });
labels.push(() => { slicerLabel.textContent = pick(P.slicer.label); });
$("slicer-row").append(slicerLabel, slicerSeg);

// colours: one picker per filament slot
colours.forEach((c, i) => {
  const text = el("label", { htmlFor: `c-${i}` }), input = el("input", { type: "color", id: `c-${i}`, value: c });
  labels.push(() => { text.textContent = t("plugstar.filament", { n: i + 1 }); });
  input.addEventListener("input", () => { colours[i] = input.value; MATS[i].color.set(input.value); save(); renderAssign(); });
  $("colours").append(text, input);
});
const labelParams = () => labels.forEach((f) => f());

function setInput(key, value) {
  const p = P[key];
  if (p.type === "bool") inputs[key] = Boolean(value);
  else if (p.type === "choice") inputs[key] = value;
  else {
    if (!Number.isFinite(value)) value = p.default;
    value = Math.min(p.max, Math.max(p.min, value));
    value = p.min + Math.round((value - p.min) / p.step) * p.step; // on the spec's grid
    inputs[key] = p.type === "int" ? Math.round(value) : Math.round(value * 100) / 100;
  }
  if (key === "points" && assign.length !== inputs.points) assign = defaultAssign(inputs.points);
  save();
  render();
}

// ---------- filament per point ----------
// readable text on a colour swatch
const ink = (hex) => {
  const n = parseInt(hex.slice(1), 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#17202a" : "#ffffff";
};
function renderAssign() {
  const box = $("assign");
  box.replaceChildren(...assign.map((slot, k) => {
    const b = el("button", { type: "button", textContent: String(k + 1) });
    b.style.setProperty("--c", colours[slot - 1]);
    b.style.setProperty("--on", ink(colours[slot - 1]));
    b.ariaLabel = b.title = t("plugstar.pointButton", { k: k + 1, f: slot });
    b.addEventListener("click", () => {
      assign[k] = (assign[k] % SLOTS) + 1;
      save();
      renderAssign();
      recolour();
    });
    return b;
  }));
}

// ---------- page ----------
const digits = (p) => (String(p.step).split(".")[1] ?? "").length;
function render() {
  for (const key of PARAMS) {
    const p = P[key];
    if (p.type === "int") {
      $(key).textContent = inputs[key];
      const [minus, plus] = $(key).parentElement.querySelectorAll("button");
      minus.disabled = inputs[key] <= p.min;
      plus.disabled = inputs[key] >= p.max;
    } else if (p.type === "choice") {
      for (const b of $(key).querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.value === String(inputs[key])));
    } else if (p.type === "bool") $(key).checked = inputs[key];
    else $(key).value = inputs[key].toFixed(digits(p));
  }
  for (const b of slicerSeg.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.value === inputs.slicer));
  renderAssign();
  const env = envOf(), problems = plugProblems(env), current = built && built.key === keyOf();
  const pf = printFit(env, spec.printers);
  const rows = [
    [t("plugstar.rowSize"), t("plugstar.valSize", { d: env.D, th: 2 * env.hc })],
    [t("plugstar.rowPoints"), t("plugstar.valPoints", { n: env.N, x: pf.size[0], y: pf.size[1], z: pf.size[2] })],
    [t("plugstar.rowConnector"), t("plugstar.valConnector", { d: 2 * env.uend, tk: env.tk })],
  ];
  if (current) {
    const grams = partList(built.env).reduce((sum, { part, count }) => sum + partGrams(built.parts[part], part === "connector" ? 1 : 0.15) * count, 0);
    rows.push([t("plugstar.rowFilament"), t("plugstar.valFilament", { g: Math.round(grams) })]);
  }
  $("sheet").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]));
  const chips = Object.keys(spec.printers).map((name) => chip(pf.fit[name] ? "ok" : "signal", t(pf.fit[name] ? "plugstar.fits" : "plugstar.tooBig", { name })));
  if (problems.length) {
    const dmin = minDiameter(spec, inputs);
    chips.push(chip("signal", dmin === null ? t("plugstar.noFit") : t("plugstar.tooSmall", { d: dmin })));
    if (dmin !== null) {
      const fix = el("button", { type: "button", className: "chip-btn", textContent: t("plugstar.setMin", { d: dmin }) });
      fix.addEventListener("click", () => setInput("diameter", dmin));
      chips.push(fix);
    }
  } else chips.push(chip("ok", t("plugstar.connectorOk")));
  chips.push(chip("ok", t("plugstar.noSupports")));
  $("chips").replaceChildren(...chips);
  $("build").disabled = building || problems.length > 0;
  $("build").textContent = building ? t("plugstar.building") : current ? t("plugstar.rebuild") : t("plugstar.build");
  renderFiles(problems.length > 0);
}
const chip = (kind, text) => el("span", { className: `chip ${kind}`, textContent: text });

// ---------- files ----------
const slicerName = () => pick(SLICERS[inputs.slicer]);
const baseName = (env) => `plug_star_${plugTag(env)}`;
const partFile = (env, part) => `${baseName(env)}_${part}.stl`;
function files() {
  if (!built) return [];
  const base = baseName(built.env), slicer = slicerName();
  return [
    { key: "zip", label: t("plugstar.fileZip"), sub: t("plugstar.zipSub", { slicer }), primary: true, file: `${base}_${inputs.slicer}.zip` },
    { key: "3mf", label: t("plugstar.file3mf", { slicer }), sub: t("plugstar.file3mfSub"), file: `${base}_${inputs.slicer}.3mf` },
    { key: "md", label: t("plugstar.fileSheet"), sub: t("plugstar.sheetSub"), file: `${base}_BUILD_SHEET.md` },
    { key: "fit", label: t("plugstar.fileFit"), sub: t("plugstar.fitSub"), file: `${base}_fit_test.zip` },
  ];
}
function renderFiles(blocked) {
  $("files").replaceChildren(...files().map((f) => {
    const btn = el("button", { type: "button", textContent: t("plugstar.download"), disabled: building });
    btn.addEventListener("click", () => download(f));
    return el("div", { className: `file${f.primary ? " primary" : ""}` }, el("strong", { textContent: f.label }), btn, el("small", { textContent: f.sub }));
  }));
  $("files-note").textContent = blocked ? t("plugstar.blocked") : !built ? t("plugstar.empty") : built.key !== keyOf() ? t("plugstar.stale") : "";
}
// a part as it prints (a point on its side face, the connector flat), from the worker's star-frame mesh
const printed = (env, key) => transformMesh(built.parts[key], printPose(env, key));
const partName = (key, k) => `${pick(spec.title)} ${t(PART_KEYS[key])}${k ? ` ${k}` : ""}`;
// the fit test's short points: one per fit, each with the pose of its own fit (its side face fit/2 behind the plane)
const FITS = fitOptions(spec);
const fitPieces = (env) => FITS.map((fit, i) => {
  const e = plugEnv(spec, { ...built.inputs, fit });
  return {
    fit, slot: i + 2, mesh: transformMesh(built.parts[`fit_${i}`], printPose(e, "point")),
    name: `${pick(spec.title)} ${t("plugstar.partFit", { f: fit })}`, file: `${baseName(env)}_fit_point_${fit.toFixed(2)}.stl`,
  };
});
// the painted 3MF: every point once in its filament, the connector in filament 1
function threemf(env) {
  const items = assign.map((slot, k) => {
    const key = k === 0 && env.hanger ? "point_hang" : "point";
    return { mesh: printed(env, key), slot, name: partName(key, k + 1) };
  });
  items.push({ mesh: printed(env, "connector"), slot: 1, name: partName("connector") });
  return zipSync(threemfEntries({ objects: plateObjects(items), flavour: inputs.slicer }), { level: 6 });
}
function fitThreemf(env) {
  const items = [{ mesh: printed(env, "connector"), slot: 1, name: partName("connector") }, ...fitPieces(env)];
  return zipSync(threemfEntries({ objects: plateObjects(items), flavour: inputs.slicer }), { level: 6 });
}
function download(f) {
  const env = built.env, enc = (s) => new TextEncoder().encode(s), base = baseName(env);
  const stls = (keys) => Object.fromEntries(keys.map((k) => [partFile(env, k), stlBytes(printed(env, k), partName(k))]));
  const sheet = () => plugBuildSheet(env, pick(spec.title), spec.printers, assign, slicerName(), t, (p) => partFile(env, p));
  const printParts = partList(env).map(({ part }) => part);
  let data;
  if (f.key === "zip") {
    data = new Blob([zipSync({ ...stls(printParts), [`${base}_${inputs.slicer}.3mf`]: [threemf(env), { level: 0 }], "BUILD_SHEET.md": enc(sheet()) }, { level: 6 })]);
  } else if (f.key === "3mf") data = new Blob([threemf(env)], { type: "model/3mf" });
  else if (f.key === "md") data = new Blob([sheet()]);
  else {
    data = new Blob([zipSync({
      ...stls(["connector"]), ...Object.fromEntries(fitPieces(env).map((f) => [f.file, stlBytes(f.mesh, f.name)])),
      [`${base}_fit_test_${inputs.slicer}.3mf`]: [fitThreemf(env), { level: 0 }], "BUILD_SHEET.md": enc(sheet()),
    }, { level: 6 })]);
  }
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
const camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
camera.up.set(0, 1, 0);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.position.set(-500, 700, 900);
scene.add(sun);
// flat shading: the faces of a point read as light and dark, as on a folded paper star
const MATS = colours.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0, flatShading: true, side: THREE.DoubleSide }));
const group = new THREE.Group();
scene.add(group);
let pieces = []; // {mesh, k, base: Matrix4, dir: Vector3}
const geometryOf = ({ pos, tri }) => {
  const xyz = new Float32Array(tri.length * 3);
  for (let i = 0; i < tri.length; i++) for (let c = 0; c < 3; c++) xyz[3 * i + c] = pos[3 * tri[i] + c];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(xyz, 3));
  geo.computeVertexNormals();
  return geo;
};
function showStar() {
  group.children.forEach((c) => c.geometry.dispose());
  group.clear();
  const geos = Object.fromEntries(["point", "point_hang", "connector"].filter((k) => built.parts[k]).map((k) => [k, geometryOf(built.parts[k])]));
  pieces = plugLayout(built.env).map(({ part, index, m }) => {
    const mesh = new THREE.Mesh(geos[part], MATS[0]);
    mesh.matrixAutoUpdate = false;
    const a = index >= 0 ? pointAngle(built.env, index) : 0;
    group.add(mesh);
    return { mesh, k: index, base: new THREE.Matrix4().set(...m), dir: new THREE.Vector3(Math.cos(a), Math.sin(a), 0) };
  });
  recolour();
  explode();
}
function recolour() {
  for (const p of pieces) p.mesh.material = MATS[p.k >= 0 ? (assign[p.k] ?? 1) - 1 : 0];
}
function explode() {
  const f = Number($("explode").value) / 100, D = built?.env.D ?? 0;
  for (const p of pieces) {
    const s = p.k >= 0 ? f * D * 0.3 : 0;
    p.mesh.matrix.copy(p.base).premultiply(new THREE.Matrix4().makeTranslation(p.dir.x * s, p.dir.y * s, 0));
  }
}
$("explode").addEventListener("input", explode);
function frame(env) {
  const dist = (env.D / 2 / Math.sin((camera.fov * Math.PI) / 360)) * 1.15;
  controls.target.set(0, 0, 0);
  camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(0.25, -0.35, 1).normalize(), dist);
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
const workerError = (msg) => () => (msg.code === "kernel" ? t("plugstar.kernelError", { status: msg.status }) : msg.message);
let worker = null, pending = null, t0 = 0, kernelReady = false, firstBuild = true, queued = false;
// OpenCascade's WASM heap only grows, so every build gets a fresh worker (the kernel comes from the browser cache)
function startWorker() {
  kernelReady = false;
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = onWorkerMessage;
  worker.onerror = (e) => {
    building = false;
    status("plugstar.workerStopped", { error: () => e.message || t("plugstar.unknownError") }, "err");
    render();
  };
}
function finish() {
  building = false;
  worker.terminate();
  startWorker();
  render();
}
function onWorkerMessage({ data: msg }) {
  if (msg.type === "ready") {
    kernelReady = true;
    if (queued || firstBuild) { queued = firstBuild = false; build(); }
  } else if (msg.type === "progress") status("plugstar.buildingPart", { part: () => t(PART_KEYS[msg.part]) }, "busy");
  else if (msg.type === "parts") {
    built = { ...pending, parts: msg.parts };
    showStar();
    status("plugstar.built", { s: (performance.now() - t0) / 1000 });
    finish();
  } else if (msg.type === "error") {
    status("plugstar.failed", { error: workerError(msg) }, "err");
    finish();
  }
}
function build() {
  if (building || plugProblems(envOf()).length) return;
  if (!kernelReady) { queued = true; status("plugstar.kernel", {}, "busy"); return; }
  building = true;
  t0 = performance.now();
  const env = envOf();
  pending = { key: keyOf(), env, inputs: { ...inputs } };
  frame(env);
  status("plugstar.starting", {}, "busy");
  render();
  worker.postMessage({ type: "build", inputs: { ...inputs } });
}
$("build").addEventListener("click", build);
const relabel = () => {
  applyDom(t);
  $("title").textContent = document.title = pick(spec.title);
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
status("plugstar.kernelFirst", {}, "busy");
startWorker();
