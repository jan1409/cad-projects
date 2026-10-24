// Assemble the self-contained generator in Gridfinity/web/dist/ (no CDN needed at runtime except Google Fonts).
//   dist/index.html     full document for local use (node tools/serve.mjs)
//   dist/artifact.html  page content only, for publishing as a claude.ai Artifact (the platform adds the skeleton)
// Usage: node tools/bundle.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const web = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(web, "dist");
// npm workspaces hoist dependencies to the repo root: walk up to the node_modules that holds them
const nm = (() => {
  for (let d = web; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, "node_modules", "replicad"))) return path.join(d, "node_modules");
    if (path.dirname(d) === d) throw new Error("node_modules not found - run npm install at the repo root");
  }
})();
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, "src"), { recursive: true });
fs.mkdirSync(path.join(dist, "vendor"), { recursive: true });

const copy = (from, to) => fs.copyFileSync(from, path.join(dist, to));
for (const f of ["app.js", "worker.js"]) copy(path.join(web, "app", f), f);
for (const f of ["case.js", "expr.js", "geom2d.js", "strings.js"]) copy(path.join(web, "src", f), path.join("src", f));
copy(path.join(web, "..", "spec", "case_params.json"), "case_params.json");

const rd = path.join(nm, "replicad", "dist");
copy(path.join(rd, "replicad.js"), "vendor/replicad.js");
for (const f of fs.readdirSync(rd)) if (/^casting-.*\.js$/.test(f)) copy(path.join(rd, f), path.join("vendor", f)); // chunk imported by replicad.js
copy(path.join(nm, "replicad-opencascadejs", "dist", "replicad_single.js"), "vendor/replicad_single.js");
const wasm = fs.readFileSync(path.join(nm, "replicad-opencascadejs", "dist", "replicad_single.wasm"));
// gzipped kernel, kept under the .wasm extension (artifacts serve no .gz); worker.js gunzips it
fs.writeFileSync(path.join(dist, "vendor", "opencascade-gz.wasm"), zlib.gzipSync(wasm, { level: 9 }));
copy(path.join(nm, "three", "build", "three.module.js"), "vendor/three.module.js");
copy(path.join(nm, "three", "examples", "jsm", "controls", "OrbitControls.js"), "vendor/OrbitControls.js");
copy(path.join(nm, "fflate", "esm", "browser.js"), "vendor/fflate.js");
copy(path.join(web, "..", "..", "site", "shared", "i18n.js"), "vendor/i18n.js"); // languages, shared with the generator site

const page = fs.readFileSync(path.join(web, "app", "index.html"), "utf8");
fs.writeFileSync(path.join(dist, "artifact.html"), page);
fs.writeFileSync(path.join(dist, "index.html"),
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n' + page + "\n</body>\n</html>\n");

let total = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const f of walk(dist)) {
  const size = fs.statSync(f).size;
  total += size;
  console.log(`${(size / 1024).toFixed(0).padStart(7)} KB  ${path.relative(dist, f).replace(/\\/g, "/")}`);
}
console.log(`${(total / 1048576).toFixed(1)} MB in ${dist}`);
