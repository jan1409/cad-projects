// Parametric Christmas star - UI. The geometry (src/star.js, a port of the SolidCraft model) runs in worker.js; this
// page places the parts into the star for the preview and writes the files (STL per part, 3MF, build sheet, fit test)
// with src/paint3mf.js. Texts: src/strings.js and the {en, de} labels of the spec.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { zipSync } from "./vendor/fflate.js";
import { translator, applyDom, mountLangSwitch, pick } from "./vendor/i18n.js";
import { starEnv, starLayout, lampEnvelope, socketProblems, minDiameter, printFit, partList, starTag, starBuildSheet, printPose, transformMesh, PART_KEYS } from "./src/star.js";
import { threemfEntries, stlBytes } from "./src/paint3mf.js";
import S from "./src/strings.js";

const $ = (id) => document.getElementById(id);
const t = translator(S);
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};
const spec = await (await fetch(new URL("./star_params.json", import.meta.url))).json();
const P = spec.parameters, NUMERIC = Object.keys(P).filter((k) => k !== "lamp");
const LAMPS = P.lamp.options.map(([v]) => v);
const STORE = "christmas-star-inputs";

// ---------- state ----------
const inputs = Object.fromEntries(Object.keys(P).map((k) => [k, P[k].default]));
const valid = (p, v) => (p.type === "choice" ? p.options.some(([o]) => o === v) : typeof v === "number" && v >= p.min && v <= p.max);
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
  for (const k of Object.keys(P)) if (valid(P[k], saved[k])) inputs[k] = saved[k];
} catch { /* storage unavailable: defaults */ }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(inputs)); } catch { /* ignore */ } };
let built = null, building = false; // built: { key, env, parts: {square: {pos, tri, volume}, ...} }
const envOf = () => starEnv(spec, inputs);
const keyOf = () => JSON.stringify(Object.keys(P).map((k) => inputs[k]));

// ---------- parameters (generated from the spec) ----------
const params = $("params"), labels = [];
for (const key of NUMERIC) {
  const p = P[key], text = el("span"), help = el("small");
  const name = el(p.type === "int" ? "div" : "label", { className: "param-name", htmlFor: key, id: `${key}-name` }, text, help);
  labels.push(() => { text.textContent = pick(p.label); help.textContent = pick(p.help); });
  let control;
  if (p.type === "int") {
    const minus = el("button", { type: "button", textContent: "−" }), plus = el("button", { type: "button", textContent: "+" });
    labels.push(() => {
      minus.ariaLabel = t("star.decrease", { name: pick(p.label) });
      plus.ariaLabel = t("star.increase", { name: pick(p.label) });
    });
    minus.addEventListener("click", () => setInput(key, inputs[key] - p.step));
    plus.addEventListener("click", () => setInput(key, inputs[key] + p.step));
    control = el("div", { className: "stepper" }, minus, el("output", { id: key }), plus);
  } else {
    control = el("input", { type: "number", id: key, inputMode: "decimal", min: p.min, max: p.max, step: p.step });
    control.addEventListener("change", () => setInput(key, Number(control.value)));
  }
  params.append(name, control);
}
// lamps: one button each, with the smallest star it fits
const lampList = $("lamps"), lampButtons = {};
for (const key of LAMPS) {
  const name = el("strong"), help = el("small"), from = el("span", { className: "from" });
  const b = el("button", { type: "button", className: "lamp" }, name, from, help);
  b.dataset.value = key;
  labels.push(() => { name.textContent = pick(spec.lamps[key].label); help.textContent = pick(spec.lamps[key].help); });
  b.addEventListener("click", () => { inputs.lamp = key; save(); render(); });
  lampButtons[key] = { b, from };
  lampList.append(b);
}
labels.push(() => { lampList.ariaLabel = pick(P.lamp.label); });
const labelParams = () => labels.forEach((f) => f());

function setInput(key, value) {
  const p = P[key];
  if (!Number.isFinite(value)) value = p.default;
  value = Math.min(p.max, Math.max(p.min, value));
  value = p.min + Math.round((value - p.min) / p.step) * p.step; // on the spec's grid
  inputs[key] = p.type === "int" ? Math.round(value) : Math.round(value * 100) / 100;
  save();
  render();
}

// ---------- page ----------
const digits = (p) => (String(p.step).split(".")[1] ?? "").length;
function render() {
  for (const key of NUMERIC) {
    const p = P[key];
    if (p.type === "int") {
      $(key).textContent = inputs[key];
      const [minus, plus] = $(key).parentElement.querySelectorAll("button");
      minus.disabled = inputs[key] <= p.min;
      plus.disabled = inputs[key] >= p.max;
    } else $(key).value = inputs[key].toFixed(digits(p));
  }
  for (const key of LAMPS) {
    const { b, from } = lampButtons[key], dmin = minDiameter(spec, inputs, key);
    b.setAttribute("aria-pressed", String(key === inputs.lamp));
    b.classList.toggle("off", dmin === null || dmin > inputs.diameter);
    from.textContent = dmin === null ? t("star.lampNever") : t("star.lampFrom", { d: dmin / 10 });
  }
  const env = envOf(), problems = socketProblems(env), current = built && built.key === keyOf();
  const pf = printFit(env, spec.printers);
  const rows = [
    [t("star.rowSize"), t("star.valSize", { d: env.D, a: env.a })],
    [t("star.rowPoints"), t("star.valPoints", { h: pf.height })],
    [t("star.rowLamp"), env.seat === "bayonet" ? t("star.valLampBayonet", { o: env.Do }) : t("star.valLampSleeve", { o: env.holeS })],
  ];
  if (current) {
    const grams = partList(built.env).reduce((sum, { part, count }) => sum + (built.parts[part]?.volume ?? 0) * count * 1.25, 0);
    const n = partList(built.env).reduce((sum, { count }) => sum + count, 0);
    rows.push([t("star.rowFilament"), t("star.valFilament", { g: Math.round(grams), n })]);
  }
  $("sheet").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]));
  const chips = Object.entries(spec.printers).map(([name, [, , z]]) => chip(pf.fit[name] ? "ok" : "signal", t(pf.fit[name] ? "star.fits" : "star.tooBig", { name, z })));
  if (problems.length) {
    const dmin = minDiameter(spec, inputs, inputs.lamp);
    chips.push(chip("signal", dmin === null ? t("star.lampNoFit") : t("star.lampTooSmall", { d: dmin / 10 })));
    if (dmin !== null) {
      const fix = el("button", { type: "button", className: "chip-btn", textContent: t("star.setMin", { d: dmin / 10 }) });
      fix.addEventListener("click", () => setInput("diameter", dmin));
      chips.push(fix);
    }
  } else chips.push(chip("ok", t("star.lampOk")));
  if (env.lamp_key.startsWith("e10") && env.D > 350) chips.push(chip("signal", t("star.dimLamp")));
  chips.push(chip("ok", t("star.noSupports")));
  $("chips").replaceChildren(...chips);
  $("build").disabled = building || problems.length > 0;
  $("build").textContent = building ? t("star.building") : current ? t("star.rebuild") : t("star.build");
  renderFiles(problems.length > 0);
  showLamp();
}
const chip = (kind, text) => el("span", { className: `chip ${kind}`, textContent: text });

// ---------- files ----------
const baseName = (env) => `christmas_star_${starTag(env)}`;
const partFile = (env, part) => (part === "nut" ? "christmas_star_e27_nut.stl" : `${baseName(env)}_${part}.stl`);
function files() {
  if (!built) return [];
  const base = baseName(built.env);
  return [
    { key: "zip", label: t("star.fileZip"), sub: t("star.zipSub"), primary: true, file: `${base}.zip` },
    { key: "3mf", label: t("star.file3mf"), sub: t("star.file3mfSub"), file: `${base}.3mf` },
    { key: "md", label: t("star.fileSheet"), sub: t("star.sheetSub"), file: `${base}_BUILD_SHEET.md` },
    { key: "fit", label: t("star.fileFit"), sub: t("star.fitSub"), file: `${base}_fit_test.zip` },
  ];
}
function renderFiles(blocked) {
  $("files").replaceChildren(...files().map((f) => {
    const btn = el("button", { type: "button", textContent: t("star.download"), disabled: building });
    btn.addEventListener("click", () => download(f));
    return el("div", { className: `file${f.primary ? " primary" : ""}` }, el("strong", { textContent: f.label }), btn, el("small", { textContent: f.sub }));
  }));
  $("files-note").textContent = blocked ? t("star.blocked") : !built ? t("star.empty") : built.key !== keyOf() ? t("star.stale") : "";
}
// the fixed E27 nut is a file next to the page (site/models.json "assets")
let nutStl = null;
const loadNut = async () => (nutStl ??= new Uint8Array(await (await fetch(new URL("./e27_nut.stl", import.meta.url))).arrayBuffer()));
// a part as it prints (the lamp socket plate down), from the worker's model-frame mesh
const printed = (env, key) => transformMesh(built.parts[key], printPose(env, key));
// parts side by side along X, each once (the counts are in the build sheet), the row centred at (128, 128) so that it
// lies on the bed of every printer (slicers do not move parts of a 3MF by themselves)
function threemf(env, keys) {
  const meshes = keys.map((key) => printed(env, key));
  const half = meshes.map((m) => Math.max(...Array.from({ length: m.pos.length / 3 }, (_, i) => Math.max(Math.abs(m.pos[3 * i]), Math.abs(m.pos[3 * i + 1])))));
  let x = 128 - (half.reduce((sum, h) => sum + 2 * h, 0) + 10 * (keys.length - 1)) / 2;
  const objects = keys.map((key, i) => {
    const o = { mesh: meshes[i], name: `${pick(spec.title)} ${t(PART_KEYS[key.replace("_fit", "")])}`, offset: [x + half[i], 128, 0] };
    x += 2 * half[i] + 10;
    return o;
  });
  return zipSync(threemfEntries({ objects, flavour: "bambu" }), { level: 6 });
}
async function download(f) {
  const env = built.env, enc = (s) => new TextEncoder().encode(s), base = baseName(env);
  const printParts = partList(env).map(({ part }) => part).filter((p) => p !== "nut");
  const stls = (keys) => Object.fromEntries(keys.map((k) => [partFile(env, k), stlBytes(printed(env, k), `${pick(spec.title)} ${k}`)]));
  const nut = env.lamp.nut ? { [partFile(env, "nut")]: await loadNut() } : {};
  const sheet = () => starBuildSheet(env, pick(spec.title), spec.printers, t, (p) => partFile(env, p));
  let data;
  if (f.key === "zip") {
    data = new Blob([zipSync({ ...stls(printParts), ...nut, [`${base}.3mf`]: [threemf(env, printParts), { level: 0 }], "BUILD_SHEET.md": enc(sheet()) }, { level: 6 })]);
  } else if (f.key === "3mf") data = new Blob([threemf(env, printParts)], { type: "model/3mf" });
  else if (f.key === "md") data = new Blob([sheet()]);
  else {
    const fit = ["square_fit", "square_fit", "square_fit", "triangle_fit", ...printParts.filter((p) => p === "socket" || p === "carrier")];
    const fitStl = {
      [`${base}_fit_square.stl`]: stlBytes(built.parts.square_fit, "fit test square point (print 3)"),
      [`${base}_fit_triangle.stl`]: stlBytes(built.parts.triangle_fit, "fit test triangular point"),
      ...stls(printParts.filter((p) => p === "socket" || p === "carrier")),
    };
    data = new Blob([zipSync({ ...fitStl, ...nut, [`${base}_fit_test.3mf`]: [threemf(env, fit), { level: 0 }], "BUILD_SHEET.md": enc(sheet()) }, { level: 6 })]);
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
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(600, -800, 1400);
scene.add(sun);
const MATS = {
  point: new THREE.MeshStandardMaterial({ color: spec.colors.point, roughness: 0.6, metalness: 0.02, side: THREE.DoubleSide }),
  lampPart: new THREE.MeshStandardMaterial({ color: spec.colors.lamp, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide }),
  bulb: new THREE.MeshStandardMaterial({ color: 0xffd36b, emissive: 0xffb02e, emissiveIntensity: 0.6, transparent: true, opacity: 0.55 }),
};
const group = new THREE.Group(), lampGroup = new THREE.Group();
scene.add(group, lampGroup);
let pieces = []; // {mesh, base: Matrix4, n: Vector3}
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
  const geos = Object.fromEntries(["square", "triangle", "socket", "carrier"].filter((k) => built.parts[k]).map((k) => [k, geometryOf(built.parts[k])]));
  pieces = starLayout(built.env).map(({ part, m }) => {
    const mesh = new THREE.Mesh(geos[part], part === "socket" || part === "carrier" ? MATS.lampPart : MATS.point);
    mesh.matrixAutoUpdate = false;
    const base = new THREE.Matrix4().set(...m), n = new THREE.Vector3(m[2], m[6], m[10]);
    group.add(mesh);
    return { mesh, base, n: part === "carrier" ? new THREE.Vector3(0, 0, 1) : n };
  });
  explode();
}
function explode() {
  const f = Number($("explode").value) / 100, D = built?.env.D ?? 0;
  for (const p of pieces) {
    p.mesh.matrix.copy(p.base).premultiply(new THREE.Matrix4().makeTranslation(p.n.x * f * D * 0.25, p.n.y * f * D * 0.25, p.n.z * f * D * 0.25));
  }
}
$("explode").addEventListener("input", explode);
function showLamp() {
  lampGroup.children.forEach((c) => c.geometry.dispose());
  lampGroup.clear();
  if (!$("show-lamp").checked) return;
  for (const [r, z0, z1] of lampEnvelope(envOf())) {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, z1 - z0, 40), MATS.bulb);
    cyl.rotation.x = Math.PI / 2;
    cyl.position.set(0, 0, (z0 + z1) / 2);
    lampGroup.add(cyl);
  }
}
$("show-lamp").addEventListener("change", showLamp);
function frame(env) {
  const dist = (env.D / 2 / Math.sin((camera.fov * Math.PI) / 360)) * 1.1;
  controls.target.set(0, 0, 0);
  camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(0.55, -0.8, 0.35).normalize(), dist);
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
const workerError = (msg) => () => (msg.code === "kernel" ? t("star.kernelError", { status: msg.status }) : msg.message);
let worker = null, pending = null, t0 = 0, kernelReady = false, firstBuild = true, queued = false;
// OpenCascade's WASM heap only grows, so every build gets a fresh worker (the kernel comes from the browser cache)
function startWorker() {
  kernelReady = false;
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = onWorkerMessage;
  worker.onerror = (e) => {
    building = false;
    status("star.workerStopped", { error: () => e.message || t("star.unknownError") }, "err");
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
  } else if (msg.type === "progress") status("star.buildingPart", { part: () => t(PART_KEYS[msg.part]) }, "busy");
  else if (msg.type === "parts") {
    built = { ...pending, parts: msg.parts };
    showStar();
    status("star.built", { s: (performance.now() - t0) / 1000 });
    finish();
  } else if (msg.type === "error") {
    status("star.failed", { error: workerError(msg) }, "err");
    finish();
  }
}
function build() {
  if (building || socketProblems(envOf()).length) return;
  if (!kernelReady) { queued = true; status("star.kernel", {}, "busy"); return; }
  building = true;
  t0 = performance.now();
  const env = envOf();
  pending = { key: keyOf(), env };
  frame(env);
  status("star.starting", {}, "busy");
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
status("star.kernelFirst", {}, "busy");
startWorker();
