// Build the generator site into site/dist/:
//   index.html + portal.js      overview page (cards from models.json)
//   models.json                 registry as served (facts filled in from each model's spec)
//   models/<id>/                each model's page, app, worker, modules and spec
//   vendor/                     shared libraries + gzipped OpenCascade kernel + i18n.js (shared/i18n.js)
//   version.json                {version, commit, builtAt}
// Usage: node build.mjs [--version <v>] [--out <dir>]   (CI passes the release version; default: <date>-<git sha>-dev)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LANGS, num, pick } from "./shared/i18n.js";

const site = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dist = path.resolve(arg("--out") ?? path.join(site, "dist"));

// npm workspaces hoist dependencies: walk up to the node_modules that holds the package
function pkgDir(name) {
  for (let d = site; ; d = path.dirname(d)) {
    const p = path.join(d, "node_modules", name);
    if (fs.existsSync(path.join(p, "package.json"))) return p;
    if (path.dirname(d) === d) throw new Error(`package ${name} not found - run npm install at the repo root`);
  }
}

function git(cmd, fallback) {
  try { return execSync(`git ${cmd}`, { cwd: site, encoding: "utf8" }).trim(); } catch { return fallback; }
}
const commit = git("rev-parse --short HEAD", "unknown");
const version = arg("--version") ?? `${new Date().toISOString().slice(0, 10)}-${commit}-dev`;
if (!/^[\w.-]+$/.test(version)) throw new Error(`version "${version}" may only use letters, digits, ".", "_" and "-"`);

fs.rmSync(dist, { recursive: true, force: true });
const put = (rel, data) => {
  const file = path.join(dist, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};
const copy = (from, rel) => put(rel, fs.readFileSync(from));

// ---------- shared vendor files ----------
const rd = path.join(pkgDir("replicad"), "dist");
copy(path.join(rd, "replicad.js"), "vendor/replicad.js");
for (const f of fs.readdirSync(rd)) if (/^casting-.*\.js$/.test(f)) copy(path.join(rd, f), `vendor/${f}`); // chunk imported by replicad.js
const oc = path.join(pkgDir("replicad-opencascadejs"), "dist");
copy(path.join(oc, "replicad_single.js"), "vendor/replicad_single.js");
// gzipped kernel (7 MB instead of 23 MB); the model workers gunzip it (kept as .wasm for claude.ai artifact hosting)
put("vendor/opencascade-gz.wasm", zlib.gzipSync(fs.readFileSync(path.join(oc, "replicad_single.wasm")), { level: 9 }));
copy(path.join(pkgDir("three"), "build", "three.module.js"), "vendor/three.module.js");
copy(path.join(pkgDir("three"), "examples", "jsm", "controls", "OrbitControls.js"), "vendor/OrbitControls.js");
copy(path.join(pkgDir("fflate"), "esm", "browser.js"), "vendor/fflate.js");
copy(path.join(site, "shared", "i18n.js"), "vendor/i18n.js");
// tool insert: Clipper (polygon offsets; a script that sets globalThis.ClipperLib, exported here as an ES module) and
// OpenCV.js (single file with embedded WASM; imported by the trace worker, sets globalThis.cv; the server gzips it)
put("vendor/clipper.js", fs.readFileSync(path.join(pkgDir("clipper-lib"), "clipper.js"), "utf8") + "\nexport default globalThis.ClipperLib;\n");
copy(path.join(pkgDir("@techstark/opencv-js"), "dist", "opencv.js"), "vendor/opencv.js");

// ---------- models ----------
// texts are {en, de}; "{param.field}" is filled from the spec in each language's number notation
const fill = (text, params, l) => text.replace(/\{(\w+)\.(\w+)\}/g, (m, k, f) => {
  const v = params?.[k]?.[f];
  return v === undefined ? m : typeof v === "number" ? num(v, undefined, l) : String(v);
});
const fillAll = (text, params) => Object.fromEntries(LANGS.map((l) => [l, fill(pick(text, l), params, l)]));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// model pages are written for the claude.ai artifact skeleton: give them a real document here
const ICON = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#2357c6"/><path d="M5.5 2v12M10.5 2v12M2 5.5h12M2 10.5h12" stroke="#fff" stroke-width="1.2"/></svg>');
const page = (body) =>
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
  `<link rel="icon" href="${ICON}">\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
// the bar above each model page; vendor/i18n.js translates it (data-i18n*) like the rest of the page
const nav = (title) =>
  `<nav class="site-nav" aria-label="Site" data-i18n-attr="aria-label:site.nav"><a href="../../" data-i18n="site.allModels">← All models</a>` +
  `<span><span data-i18n-pick="${esc(JSON.stringify(title))}">${esc(pick(title, "en"))}</span> · ` +
  `<span data-i18n="site.version" data-version="${esc(version)}">site ${esc(version)}</span></span></nav>`;
const registry = JSON.parse(fs.readFileSync(path.join(site, "models.json"), "utf8"));
const served = [];
for (const m of registry) {
  const app = path.resolve(site, m.app);
  const out = `models/${m.id}`;
  const spec = JSON.parse(fs.readFileSync(path.resolve(site, m.spec), "utf8"));
  const rewrite = (s) => s.replaceAll("./vendor/", "../../vendor/"); // model files expect vendor next to them
  // the app's scripts (app.js, worker.js, more workers) next to the page
  for (const f of fs.readdirSync(app).filter((f) => f.endsWith(".js"))) put(`${out}/${f}`, rewrite(fs.readFileSync(path.join(app, f), "utf8")));
  put(`${out}/index.html`, page(rewrite(fs.readFileSync(path.join(app, "index.html"), "utf8")).replace("<!--site:nav-->", nav(fillAll(m.title)))));
  for (const f of fs.readdirSync(path.resolve(site, m.modules))) if (f.endsWith(".js")) copy(path.join(path.resolve(site, m.modules), f), `${out}/src/${f}`);
  put(`${out}/${path.basename(m.spec)}`, JSON.stringify(spec, null, 1));
  // the page reads its variant here (several models can share one app, e.g. the Gridfinity boxes)
  const title = fillAll(m.title);
  put(`${out}/model.json`, JSON.stringify({ id: m.id, title, variant: m.variant ?? null }, null, 1));
  let image = null;
  if (m.image && fs.existsSync(path.resolve(site, m.image))) {
    image = `models/${m.id}/card${path.extname(m.image)}`;
    copy(path.resolve(site, m.image), image);
  }
  const params = spec.parameters ?? spec.variants?.[m.variant]?.parameters;
  served.push({
    id: m.id, title: fillAll(m.title), summary: fillAll(m.summary), href: `models/${m.id}/`, image,
    facts: m.facts.map((f) => fillAll(f, params)),
  });
}
put("models.json", JSON.stringify(served, null, 1));

// ---------- overview page ----------
put("index.html", fs.readFileSync(path.join(site, "portal", "index.html"), "utf8").replace("<!--site:icon-->", `<link rel="icon" href="${ICON}">`));
copy(path.join(site, "portal", "portal.js"), "portal.js");
copy(path.join(site, "portal", "strings.js"), "strings.js");
put("version.json", JSON.stringify({ version, commit, builtAt: new Date().toISOString() }, null, 1));

let total = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const f of walk(dist)) total += fs.statSync(f).size;
console.log(`site ${version}: ${served.length} model(s), ${(total / 1048576).toFixed(1)} MB in ${dist}`);
