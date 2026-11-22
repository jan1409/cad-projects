// Christmas tree - UI. The geometry (src/tree.js, a port of Jan's SolidCraft model) runs in worker.js, which also
// splits the mesh at the band planes and paints it, and builds the star for the Star top; this page shows them in the
// chosen colours (the star on its tab) and writes the painted 3MF for the chosen slicer with src/paint3mf.js: the tree,
// and the star lying beside it, painted whole in its filament. Texts: src/strings.js and the {en, de} labels of the spec.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { zipSync } from "./vendor/fflate.js";
import { translator, applyDom, mountLangSwitch, pick } from "./vendor/i18n.js";
import { treeEnv, treeTag, treeBuildSheet, starOffset } from "./src/tree.js";
import { threemfEntries, stlBytes } from "./src/paint3mf.js";
import S from "./src/strings.js";

const $ = (id) => document.getElementById(id);
const t = translator(S);
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};
const spec = await (await fetch(new URL("./tree_params.json", import.meta.url))).json();
const P = spec.parameters;
const PARAMS = Object.keys(P).filter((k) => k !== "slicer"); // the form (the slicer sits with the files)
const GEOMETRY = PARAMS.filter((k) => k !== "star_filament"); // what a build depends on
const STAR_ONLY = ["star_share", "star_filament"];
const STORE = "christmas-tree-inputs";
const SLICERS = Object.fromEntries(P.slicer.options.map(([v, label]) => [v, label]));

// ---------- state ----------
const inputs = Object.fromEntries(Object.keys(P).map((k) => [k, P[k].default]));
const colours = { ...spec.colors };
const valid = (p, v) => (p.type === "choice" ? p.options.some(([o]) => o === v) : p.type === "bool" ? typeof v === "boolean"
  : typeof v === "number" && v >= p.min && v <= p.max);
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
  for (const k of Object.keys(P)) if (valid(P[k], saved[k])) inputs[k] = saved[k];
  for (const k of ["main", "band", "star"]) if (/^#[0-9a-f]{6}$/i.test(saved.colours?.[k] ?? "")) colours[k] = saved.colours[k];
} catch { /* storage unavailable: defaults */ }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ ...inputs, colours })); } catch { /* ignore */ } };
let built = null, building = false; // built: { key, env, mesh: {pos, tri}, states, volume, painted, star?: {mesh} }
const envOf = () => treeEnv(spec, inputs);
const keyOf = () => JSON.stringify(GEOMETRY.map((k) => inputs[k]));

// ---------- parameters (generated from the spec) ----------
const params = $("params"), labels = [];
const segment = (key, p, onPick) => {
  const control = el("div", { className: "seg", role: "group", id: key });
  for (const [value, label] of p.options) {
    const b = el("button", { type: "button" });
    b.dataset.value = value;
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
      minus.ariaLabel = t("tree.decrease", { name: pick(p.label) });
      plus.ariaLabel = t("tree.increase", { name: pick(p.label) });
    });
    minus.addEventListener("click", () => setInput(key, inputs[key] - (p.step ?? 1)));
    plus.addEventListener("click", () => setInput(key, inputs[key] + (p.step ?? 1)));
    control = el("div", { className: "stepper" }, minus, el("output", { id: key }), plus);
  } else if (p.type === "choice") { // its own rows: the name, then the buttons (they would squeeze the names)
    control = segment(key, p, (value) => setInput(key, value));
    name.classList.add("wide");
    control.classList.add("wide");
  } else if (p.type === "bool") {
    control = el("input", { type: "checkbox", id: key });
    control.addEventListener("change", () => setInput(key, control.checked));
  } else {
    control = el("input", { type: "number", id: key, inputMode: "decimal", min: p.min, max: p.max, step: p.step ?? 0.1 });
    control.addEventListener("change", () => setInput(key, Number(control.value)));
  }
  params.append(name, control);
}
// slicer: a choice in the files section (it changes the 3MF, not the tree)
const slicerLabel = el("span", { className: "param-name" });
const slicerSeg = segment("slicer", P.slicer, (value) => { inputs.slicer = value; save(); render(); });
labels.push(() => { slicerLabel.textContent = pick(P.slicer.label); });
$("slicer-row").append(slicerLabel, slicerSeg);
const labelParams = () => labels.forEach((f) => f());

function setInput(key, value) {
  const p = P[key];
  if (p.type === "bool") inputs[key] = Boolean(value);
  else if (p.type === "choice") inputs[key] = value;
  else {
    if (!Number.isFinite(value)) value = p.default;
    value = Math.min(p.max, Math.max(p.min, value));
    const step = p.step ?? (p.type === "int" ? 1 : 0.1);
    value = p.min + Math.round((value - p.min) / step) * step; // on the spec's grid (even fin counts)
    inputs[key] = p.type === "int" ? Math.round(value) : Math.round(value * 100) / 100;
  }
  save();
  if (key === "star_filament" && built?.star) MATS.star.color.set(starColour());
  render();
}

// ---------- colours (preview) ----------
const starColour = () => [colours.main, colours.band, colours.star][Number(inputs.star_filament) - 1];
for (const k of ["main", "band", "star"]) {
  const input = $(`c-${k}`);
  input.value = colours[k];
  input.addEventListener("input", () => { colours[k] = input.value; MATS[k].color.set(input.value); MATS.star.color.set(starColour()); save(); });
}

function render() {
  const isStar = inputs.top === "star";
  for (const key of PARAMS) {
    const p = P[key], off = (key === "band_share" && !inputs.bands) || (STAR_ONLY.includes(key) && !isStar);
    if (p.type === "int") {
      $(key).textContent = inputs[key];
      const [minus, plus] = $(key).parentElement.querySelectorAll("button");
      minus.disabled = off || inputs[key] <= p.min;
      plus.disabled = off || inputs[key] >= p.max;
    } else if (p.type === "choice") {
      for (const b of $(key).querySelectorAll("button")) { b.setAttribute("aria-pressed", String(b.dataset.value === inputs[key])); b.disabled = off; }
    } else if (p.type === "bool") $(key).checked = inputs[key];
    else $(key).value = inputs[key].toFixed(1);
    $(`${key}-name`).classList.toggle("off", off);
  }
  $("c-star-row").hidden = $("c-star").hidden = !(isStar && inputs.star_filament === "3");
  for (const b of slicerSeg.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.value === inputs.slicer));
  const env = envOf(), current = built && built.key === keyOf(), st = env.star;
  const rows = [
    [t("tree.rowSize"), t("tree.valSize", { h: env.H, d: env.diameter })],
    [t("tree.rowFins"), t("tree.valFins", { n: env.N, t: env.t })],
    [t("tree.rowTiers"), t("tree.valTiers", { p: env.p, s: env.s })],
    [t("tree.rowBands"), env.bands.length ? t("tree.valBands", { n: env.bands.length, h: env.h }) : t("tree.valNoBands")],
    [t("tree.rowTop"), st ? t("tree.valTopStar", { d: st.Ds, s: st.st }) : env.top === "sharp" ? t("tree.valTopSharp") : t("tree.valTopFlat", { w: 2 * env.t })],
  ];
  if (st) rows.push([t("tree.rowHeights"), t("tree.valHeights", { h: env.printHeight, a: env.fullHeight })]);
  if (current) {
    rows.push([t("tree.rowVolume"), t("tree.valVolume", { v: built.volume + (built.star?.volume ?? 0) })]);
    rows.push([t("tree.rowMesh"), t("tree.valMesh", { n: built.mesh.tri.length / 3, p: built.painted })]);
  }
  $("sheet").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]));
  const chips = Object.entries(spec.printers).map(([name, [x, y, z]]) => {
    const fits = env.diameter <= Math.min(x, y) && env.printHeight <= z;
    return chip(fits ? "ok" : "signal", t(fits ? "tree.fits" : "tree.tooBig", { name, x, y, z }));
  });
  chips.push(chip(env.angle >= 30 ? "ok" : "signal", t(env.angle >= 30 ? "tree.noSupports" : "tree.flatUndersides")));
  $("chips").replaceChildren(...chips);
  $("build").textContent = building ? t("tree.building") : current ? t("tree.rebuild") : t("tree.build");
  renderFiles();
}
const chip = (kind, text) => el("span", { className: `chip ${kind}`, textContent: text });

// ---------- files ----------
const slicerName = () => pick(SLICERS[inputs.slicer]);
const baseName = () => `christmas_tree_${treeTag(built.env)}`;
function files() {
  if (!built) return [];
  const painted = built.env.bands.length > 0, slicer = slicerName(), base = baseName(), star = built.env.star;
  const sub3mf = star ? t(painted ? "tree.file3mfStarSub" : "tree.file3mfStarPlainSub", { n: star.filament })
    : t(painted ? "tree.file3mfSub" : "tree.file3mfPlainSub");
  const list = [
    { key: "zip", label: t("tree.fileZip"), sub: t(star ? "tree.zipSubStar" : "tree.zipSub", { slicer }), primary: true, file: `${base}_${inputs.slicer}.zip` },
    { key: "3mf", label: t(painted || star ? "tree.file3mf" : "tree.file3mfPlain", { slicer }), sub: sub3mf, file: `${base}_${inputs.slicer}.3mf` },
    { key: "stl", label: t("tree.fileStl"), sub: t("tree.fileStlSub"), file: `${base}.stl` },
  ];
  if (star) list.push({ key: "starStl", label: t("tree.fileStarStl"), sub: t("tree.fileStarStlSub"), file: `${base}_topper.stl` });
  list.push({ key: "md", label: t("tree.fileSheet"), sub: t("tree.sheetSub"), file: `${base}_BUILD_SHEET.md` });
  return list;
}
function renderFiles() {
  $("files").replaceChildren(...files().map((f) => {
    const btn = el("button", { type: "button", textContent: t("tree.download"), disabled: building });
    btn.addEventListener("click", () => download(f));
    return el("div", { className: `file${f.primary ? " primary" : ""}` }, el("strong", { textContent: f.label }), btn, el("small", { textContent: f.sub }));
  }));
  const notes = [];
  if (!built) notes.push(t("tree.empty"));
  else if (built.key !== keyOf()) notes.push(t("tree.stale"));
  else {
    if (built.env.bands.length) notes.push(t("tree.slicerNote"));
    if (built.env.star) notes.push(t("tree.starNote", { n: Number(inputs.star_filament) }));
  }
  $("files-note").textContent = notes.join(" ");
}
// files are written at download time, for the chosen slicer and star filament, in the page's current language
const downloadEnv = () => treeEnv(spec, { ...inputs, ...Object.fromEntries(GEOMETRY.map((k) => [k, built.env[k]])) });
function threemf() {
  const env = downloadEnv(), objects = [{ mesh: built.mesh, states: env.bands.length ? built.states : null, name: pick(spec.title) }];
  if (env.star) {
    const n = built.star.mesh.tri.length / 3, f = env.star.filament;
    objects.push({ mesh: built.star.mesh, states: f > 1 ? new Uint8Array(n).fill(f) : null, name: pick(P.top.options.find(([o]) => o === "star")[1]),
      offset: starOffset(env) });
  }
  return zipSync(threemfEntries({ objects, flavour: inputs.slicer }), { level: 6 });
}
const stl = () => stlBytes(built.mesh, `Christmas tree ${treeTag(built.env)}`);
const starStl = () => stlBytes(built.star.mesh, `Star ${treeTag(built.env)}`);
const sheetMd = () => treeBuildSheet(downloadEnv(), pick(spec.title), inputs.slicer, colours, t);
function download(f) {
  const enc = (s) => new TextEncoder().encode(s), base = baseName();
  let data;
  if (f.key === "zip") {
    const entries = { [`${base}_${inputs.slicer}.3mf`]: [threemf(), { level: 0 }], [`${base}.stl`]: stl(), "BUILD_SHEET.md": enc(sheetMd()) };
    if (built.star) entries[`${base}_topper.stl`] = starStl();
    data = new Blob([zipSync(entries, { level: 6 })]);
  } else if (f.key === "3mf") data = new Blob([threemf()], { type: "model/3mf" });
  else if (f.key === "stl") data = new Blob([stl()]);
  else if (f.key === "starStl") data = new Blob([starStl()]);
  else data = new Blob([sheetMd()]);
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
const material = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05 });
const MATS = { main: material(colours.main), band: material(colours.band), star: material(starColour()) };
const group = new THREE.Group();
scene.add(group);
// flat-shaded triangles; groups: filament 1, then filament 2 (the tree's paint)
function geometry(pos, tri, order, map = (x, y, z) => [x, y, z]) {
  const xyz = new Float32Array(order.length * 9);
  order.forEach((f, j) => {
    for (let k = 0; k < 3; k++) {
      const i = 3 * tri[3 * f + k], [x, y, z] = map(pos[i], pos[i + 1], pos[i + 2]);
      xyz.set([x, y, z], 9 * j + 3 * k);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(xyz, 3));
  geo.computeVertexNormals();
  return geo;
}
function showMesh(b) {
  clearMesh();
  const { pos, tri } = b.mesh, n = tri.length / 3, order = [];
  for (let i = 0; i < n; i++) if (!b.states[i]) order.push(i);
  const nMain = order.length;
  for (let i = 0; i < n; i++) if (b.states[i]) order.push(i);
  const geo = geometry(pos, tri, order);
  geo.addGroup(0, nMain * 3, 0);
  geo.addGroup(nMain * 3, (n - nMain) * 3, 1);
  group.add(new THREE.Mesh(geo, [MATS.main, MATS.band]));
  if (b.star) { // the printed star (lying flat) put on its tab: upright in fin 0's plane, centred at zc
    const { st, zc } = b.env.star, sp = b.star.mesh;
    MATS.star.color.set(starColour());
    group.add(new THREE.Mesh(geometry(sp.pos, sp.tri, [...Array(sp.tri.length / 3).keys()], (x, y, z) => [x, st / 2 - z, zc + y]), MATS.star));
  }
}
const clearMesh = () => { group.children.forEach((c) => c.geometry.dispose()); group.clear(); };
function frame(env) {
  const r = Math.hypot(env.diameter / 2, env.fullHeight / 2), dist = (r / Math.sin((camera.fov * Math.PI) / 360)) * 1.05;
  controls.target.set(0, 0, env.fullHeight / 2);
  camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(0.55, -0.8, 0.3).normalize(), dist);
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
const workerError = (msg) => () => (msg.code === "kernel" ? t("tree.kernelError", { status: msg.status }) : msg.message);
let worker = null, pending = null, t0 = 0, kernelReady = false, firstBuild = true, queued = false;
// OpenCascade's WASM heap only grows, so every build gets a fresh worker (the kernel comes from the browser cache)
function startWorker() {
  kernelReady = false;
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = onWorkerMessage;
  worker.onerror = (e) => {
    building = false;
    $("build").disabled = false;
    status("tree.workerStopped", { error: () => e.message || t("tree.unknownError") }, "err");
    render();
  };
}
function finish() {
  building = false;
  $("build").disabled = false;
  worker.terminate();
  startWorker();
  render();
}
const PROGRESS = { tree: "tree.buildingTree", paint: "tree.painting", star: "tree.buildingStar" };
function onWorkerMessage({ data: msg }) {
  if (msg.type === "ready") {
    kernelReady = true;
    if (queued || firstBuild) { queued = firstBuild = false; build(); }
  } else if (msg.type === "progress") status(PROGRESS[msg.step], {}, "busy");
  else if (msg.type === "mesh") {
    const painted = msg.states.reduce((n, s) => n + (s ? 1 : 0), 0);
    built = { ...pending, mesh: { pos: msg.pos, tri: msg.tri }, states: msg.states, volume: msg.volume, painted };
    if (msg.starPos) built.star = { mesh: { pos: msg.starPos, tri: msg.starTri }, volume: msg.starVolume };
    showMesh(built);
    status("tree.built", { s: (performance.now() - t0) / 1000 });
    finish();
  } else if (msg.type === "error") {
    status("tree.failed", { error: workerError(msg) }, "err");
    finish();
  }
}
function build() {
  if (building) return;
  if (!kernelReady) { queued = true; status("tree.kernel", {}, "busy"); return; }
  building = true;
  $("build").disabled = true;
  t0 = performance.now();
  const env = envOf();
  pending = { key: keyOf(), env };
  frame(env);
  status("tree.starting", {}, "busy");
  render();
  worker.postMessage({ type: "build", inputs: Object.fromEntries(PARAMS.map((k) => [k, inputs[k]])) });
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
status("tree.kernelFirst", {}, "busy");
startWorker();
