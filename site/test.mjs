// Site checks, run by CI before every release (npm test):
//   geometry  smallest, default and largest case, boxes and baseplates build with watertight parts
//             (Gridfinity/web/node/sweep.mjs --one, bin_build.mjs, plate_build.mjs); tool inserts from fixture tools
//             (insert_build.mjs), boxes stack on each other (stack_fit.mjs)
//   tracing   tools on synthetic photos of a sheet are traced to within the limits of trace_check.mjs
//   layout    baseplate fitting and splitting (pieces fit the bed and add up, rotations dedupe)
//   i18n      every text in English and German with the same placeholders; every key used exists and every key is
//             used; build sheets render in both languages; Accept-Language of the server's waiting page
//   build     the site builds; every relative URL in the pages and modules points at a file that exists
//   server    static serving: MIME types, redirects, ETag/304, gzip, no path traversal or dot files
//   untar     archives made by the system tar unpack byte for byte; unsafe paths are refused
//   updater   server.mjs against a fake GitHub API: first install, update, bad checksum, pruning, restart
// Usage: node test.mjs [--skip-geometry] [--keep]
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { createSiteServer, untar, acceptLanguage } from "./server/server.mjs";

const site = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(site);
const args = process.argv.slice(2);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cad-site-test-"));
const dist = path.join(tmp, "dist");
let failures = 0;

async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`ok    ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failures++;
    console.log(`FAIL  ${name}\n      ${String(e.stack ?? e).split("\n").slice(0, 4).join("\n      ")}`);
  }
}

const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).replace(/\\/g, "/")]));
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 20_000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) {
    const v = await fn();
    if (v) return v;
  }
  throw new Error(`timed out waiting for ${what}`);
}
const tarGz = (dir) => { // system tar, as in CI; relative paths keep GNU tar from reading "D:" as a host name
  execFileSync("tar", ["-czf", "pack.tar.gz", "-C", path.relative(tmp, dir) || ".", "."], { cwd: tmp });
  return fs.readFileSync(path.join(tmp, "pack.tar.gz"));
};

// ---------------------------------------------------------------- geometry
if (!args.includes("--skip-geometry")) {
  const P = JSON.parse(fs.readFileSync(path.join(root, "Gridfinity/spec/case_params.json"), "utf8")).parameters;
  const configs = ["min", "default", "max"].map((k) => [P.x_count[k], P.y_count[k], P.z_count[k]]);
  for (const cfg of configs) {
    await step(`geometry ${cfg.join("x")}`, () => {
      const out = execFileSync(process.execPath, [path.join(root, "Gridfinity/web/node/sweep.mjs"), "--one", ...cfg.map(String)],
        { encoding: "utf8", maxBuffer: 1 << 26 });
      const row = out.split("\n").find((l) => l.startsWith("|"));
      assert.ok(row?.endsWith("| ok |"), row ?? out);
    });
  }
  const bins = JSON.parse(fs.readFileSync(path.join(root, "Gridfinity/spec/bin_params.json"), "utf8")).variants;
  for (const [variant, { parameters: B }] of Object.entries(bins).filter(([v]) => v !== "insert")) {
    for (const k of ["min", "default", "max"]) {
      const cfg = [B.x_count[k], B.y_count[k], B.z_count[k]];
      await step(`geometry ${variant} box ${cfg.join("x")}`, () => {
        const out = execFileSync(process.execPath, [path.join(root, "Gridfinity/web/node/bin_build.mjs"), variant, ...cfg.map(String)],
          { encoding: "utf8", maxBuffer: 1 << 26 });
        const row = out.split("\n").find((l) => l.startsWith("|"));
        assert.ok(row?.endsWith("| ok |"), row ?? out);
      });
    }
  }
  const plates = JSON.parse(fs.readFileSync(path.join(root, "Gridfinity/spec/baseplate_params.json"), "utf8")).variants;
  for (const [variant, { parameters: B }] of Object.entries(plates)) {
    for (const k of ["min", "default", "max"]) {
      // min / max: smallest and largest size; max also with the thickest bottom plate and magnet holes
      const pairs = variant === "grid" ? [`x_count=${B.x_count[k]}`, `y_count=${B.y_count[k]}`] : [`width=${B.width[k]}`, `depth=${B.depth[k]}`];
      if (k === "max") pairs.push("bottom=1", `bottom_h=${B.bottom_h.max}`, "magnets=1");
      await step(`geometry ${variant} baseplate ${pairs.join(" ")}`, () => {
        const out = execFileSync(process.execPath, [path.join(root, "Gridfinity/web/node/plate_build.mjs"), variant, ...pairs],
          { encoding: "utf8", maxBuffer: 1 << 26 });
        const row = out.split("\n").find((l) => l.startsWith("|"));
        assert.ok(row?.endsWith("| ok |"), row ?? out);
      });
    }
  }
  // tool inserts: smallest (1 x 1 x 2), several tools with the automatic size, the tallest box
  const B = bins.insert.parameters;
  for (const cfg of [["coin", "--x", "1", "--y", "1", "--z", String(B.z_count.min)], ["mixed"], ["bit", "--z", String(B.z_count.max)]]) {
    await step(`geometry tool insert ${cfg.join(" ")}`, () => {
      const out = execFileSync(process.execPath, [path.join(root, "Gridfinity/web/node/insert_build.mjs"), ...cfg],
        { encoding: "utf8", maxBuffer: 1 << 26 });
      const row = out.split("\n").find((l) => l.startsWith("|"));
      assert.ok(row?.endsWith("| ok |"), row ?? out);
    });
  }
  await step("geometry boxes stack (standard, label, tool inserts)", () => {
    const out = execFileSync(process.execPath, [path.join(root, "Gridfinity/web/node/stack_fit.mjs")], { encoding: "utf8", maxBuffer: 1 << 26 });
    assert.ok(out.includes("all ok"), out.split("\n").filter((l) => /WRONG|problem/.test(l)).join("\n"));
  });
}

// ---------------------------------------------------------------- tracing (OpenCV, synthetic photos)
if (!args.includes("--skip-geometry")) {
  await step("tracing synthetic photos", () => {
    const out = execFileSync(process.execPath, [path.join(root, "Gridfinity/web/node/trace_check.mjs")], { encoding: "utf8", maxBuffer: 1 << 26 });
    assert.ok(out.includes("all ok"), out.split("\n").filter((l) => /WRONG|NOT|problem/.test(l)).join("\n"));
  });
}

// ---------------------------------------------------------------- baseplate layout (no geometry kernel)
await step("baseplate layout", async () => {
  const { plateEnv } = await import("../Gridfinity/web/src/baseplate.js");
  const spec = JSON.parse(fs.readFileSync(path.join(root, "Gridfinity/spec/baseplate_params.json"), "utf8"));
  const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} != ${b}`);
  const drawer = (width, depth, spare_x = "center", spare_y = "front", clearance = 0.5) =>
    plateEnv(spec, { variant: "drawer", width, depth, clearance, spare_x, spare_y, bottom: false, bottom_h: 4, magnets: false, drawer_h: 0 });
  const grid = (x_count, y_count) => plateEnv(spec, { variant: "grid", x_count, y_count, bottom: true, bottom_h: 4, magnets: true });
  const check = (env, what) => {
    for (const q of env.pieces) assert.ok(q.w <= spec.bed[0] + 1e-9 && q.d <= spec.bed[1] + 1e-9, `${what}: piece ${q.id} ${q.w} x ${q.d}`);
    const cols = [...new Set(env.pieces.map((q) => q.col))], rows = [...new Set(env.pieces.map((q) => q.row))];
    near(cols.reduce((s, c) => s + env.pieces.find((q) => q.col === c).w, 0), env.W, `${what}: piece widths`);
    near(rows.reduce((s, r) => s + env.pieces.find((q) => q.row === r).d, 0), env.D, `${what}: piece depths`);
    assert.equal(env.unique.reduce((s, u) => s + u.count, 0), env.pieces.length, `${what}: unique counts`);
    assert.equal(env.unique.reduce((s, u) => s + u.count * u.cells, 0), env.nx * env.ny, `${what}: cells`);
    // every placed piece is its unique piece turned by its quarter turns (same footprint)
    for (const q of env.pieces) {
      const u = env.unique.find((v) => v.id === q.id), [w, d] = q.quarter % 2 ? [u.d, u.w] : [u.w, u.d];
      near(w, q.w, `${what}: piece ${q.id} width`);
      near(d, q.d, `${what}: piece ${q.id} depth`);
    }
  };
  let env = drawer(350, 250);
  assert.deepEqual([env.nx, env.ny, env.pieces.length], [8, 5, 1]);
  near(env.W, 349, "350 drawer width");
  near(env.pad.left, 6.5, "left strip");
  near(env.pad.right, 6.5, "right strip");
  near(env.pad.front, 39, "front strip");
  near(env.pad.back, 0, "back strip");
  env = drawer(350, 250, "right", "back");
  near(env.pad.right, 13, "right strip");
  near(env.pad.back, 39, "back strip");
  env = drawer(127.3, 85.3); // 0.3 mm spare: too narrow for a strip, left free
  assert.deepEqual([env.nx, env.ny, env.pad.left, env.pad.front], [3, 2, 0, 0]);
  near(env.dropped, 0.6, "dropped spare");
  check(drawer(1000, 1000), "drawer 1000");
  check(drawer(600, 380, "left", "back"), "drawer 600");
  env = grid(24, 24);
  check(env, "grid 24");
  assert.deepEqual([env.pieces.length, env.unique.length, env.H], [9, 2, 9]); // 4 corners, 5 plain 8 x 8 pieces
  env = grid(9, 9);
  check(env, "grid 9");
  assert.equal(env.unique.length, 4); // 5x5 corner, two mirrored 5x4 corners, 4x4 corner
  env = grid(8, 8);
  assert.deepEqual([env.pieces.length, env.magnetCount], [1, 256]);
});

// ---------------------------------------------------------------- translations (no geometry kernel)
await step("translations", async () => {
  const { LANGS, translator, siteStrings } = await import("./shared/i18n.js");
  const gridStrings = (await import("../Gridfinity/web/src/strings.js")).default;
  const portalStrings = (await import("./portal/strings.js")).default;
  const problems = [];
  const holes = (s) => [...s.matchAll(/\{(\w+(?::\d)?)\}/g)].map((m) => m[1]);
  const forms = (v) => (v && typeof v === "object" ? Object.values(v) : [v]);
  // a text is {en, de}: both non-empty, the same placeholders, and a plural ({one, other}) in both or in neither
  const text = (v, where) => {
    if (!v || typeof v !== "object" || LANGS.some((l) => !(l in v))) return problems.push(`${where}: not {${LANGS.join(", ")}}`);
    const plural = LANGS.map((l) => typeof v[l] === "object");
    if (plural.some((p) => p !== plural[0])) return problems.push(`${where}: plural in one language only`);
    for (const l of LANGS) {
      if (forms(v[l]).some((f) => typeof f !== "string" || !f.trim())) problems.push(`${where}.${l}: empty`);
      if (plural[0] && !("other" in v[l])) problems.push(`${where}.${l}: no "other" form`);
    }
    const sets = LANGS.map((l) => [...new Set(forms(v[l]).flatMap(holes))].sort().join(" "));
    if (sets.some((s) => s !== sets[0])) problems.push(`${where}: placeholders ${LANGS.map((l, i) => `${l} {${sets[i]}}`).join(" vs ")}`);
  };
  const dicts = { site: siteStrings, grid: gridStrings, portal: portalStrings };
  for (const [name, dict] of Object.entries(dicts)) for (const [k, v] of Object.entries(dict)) text(v, `${name} ${k}`);
  for (const m of JSON.parse(fs.readFileSync(path.join(site, "models.json"), "utf8"))) {
    text(m.title, `models.json ${m.id} title`);
    text(m.summary, `models.json ${m.id} summary`);
    m.facts.forEach((f, i) => text(f, `models.json ${m.id} fact ${i}`));
  }
  for (const f of ["bin_params.json", "baseplate_params.json"]) {
    for (const [name, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, "Gridfinity/spec", f), "utf8")).variants)) {
      text(v.title, `${f} ${name} title`);
      for (const [k, p] of Object.entries(v.parameters)) {
        text(p.label, `${f} ${name}.${k} label`);
        text(p.help, `${f} ${name}.${k} help`);
        for (const [o, label] of p.options ?? []) text(label, `${f} ${name}.${k} option ${o}`);
      }
    }
  }
  // keys are only written as literals: "ns.key" in the code, data-i18n="key" and data-i18n-attr="attr:key;…" in pages
  const keysIn = (rel) => {
    const s = fs.readFileSync(path.join(root, rel), "utf8"), keys = new Set();
    for (const m of s.matchAll(/["'](?:site|portal|update|common|case|box|plate|tool|sheet)\.[A-Za-z]\w*["']/g)) keys.add(m[0].slice(1, -1));
    for (const [, attr] of s.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of attr.split(";")) keys.add(pair.split(":")[1].trim());
    return [...keys].filter((k) => !/\.(m?js|json|html|css|md|png)$/.test(k)); // not file names like "portal.js"
  };
  const files = (dir, re) => fs.readdirSync(path.join(root, dir)).filter((f) => re.test(f)).map((f) => `${dir}/${f}`);
  const users = {
    grid: [...["app", "bin", "baseplate", "insert"].flatMap((d) => files(`Gridfinity/web/${d}`, /^(index\.html|.*\.js)$/)),
      ...files("Gridfinity/web/src", /\.js$/).filter((f) => !f.endsWith("strings.js"))],
    portal: ["site/portal/index.html", "site/portal/portal.js"],
    site: ["site/build.mjs"], // the nav bar
  };
  const used = new Set();
  for (const [name, list] of Object.entries(users)) {
    for (const rel of list) for (const k of keysIn(rel)) {
      used.add(k);
      if (!(k in dicts[name]) && !(k in siteStrings)) problems.push(`${rel}: unknown key ${k}`);
    }
  }
  for (const [name, dict] of Object.entries(dicts)) for (const k of Object.keys(dict)) if (!used.has(k)) problems.push(`${name}: unused key ${k}`);
  // build sheets and the window SVG in both languages: everything filled in, and German differs from English
  const { caseEnv } = await import("../Gridfinity/web/src/expr.js");
  const { buildSheet, windowSVG } = await import("../Gridfinity/web/src/case.js");
  const { binEnv, binBuildSheet } = await import("../Gridfinity/web/src/bin.js");
  const { plateEnv, plateBuildSheet } = await import("../Gridfinity/web/src/baseplate.js");
  const { setClipper, rect } = await import("../Gridfinity/web/src/outline.js");
  const { insertEnv, insertBuildSheet, insertSvg } = await import("../Gridfinity/web/src/insert.js");
  setClipper((await import("node:module")).createRequire(import.meta.url)("clipper-lib"));
  const spec = (f) => JSON.parse(fs.readFileSync(path.join(root, "Gridfinity/spec", f), "utf8"));
  const cs = spec("case_params.json"), bs = spec("bin_params.json"), ps = spec("baseplate_params.json");
  const caseIn = Object.fromEntries(Object.entries(cs.parameters).map(([k, p]) => [k, p.default]));
  const sizes = { Base: [1, 2, 3], Lid: [1, 2, 3], Latch: [1, 2, 3], Seal: [1, 2, 3] };
  const toolIn = { ...Object.fromEntries(Object.entries(bs.variants.insert.parameters).map(([k, p]) => [k, p.default])), auto_size: true, auto_height: true };
  const toolEnv = insertEnv(bs, toolIn, [{ name: "Caliper", outline: rect(-60, -10, 60, 10), height: 16, depth: null, x: 0, y: 0, rot: 0, fingers: "auto" }]);
  assert.ok(toolEnv.ok, `tool insert env: ${toolEnv.problems.map((p) => p.code)}`);
  const sheets = (t) => [
    buildSheet(caseEnv(cs, caseIn), "5x4x6", sizes, t), windowSVG(caseEnv(cs, caseIn), t),
    binBuildSheet(binEnv(bs, { variant: "label", x_count: 3, y_count: 2, z_count: 6, magnets: true, plate_gap: 0 }), "3x2x6", "Box", "fit", t),
    plateBuildSheet(plateEnv(ps, { variant: "drawer", width: 600, depth: 380, clearance: 0.5, spare_x: "left", spare_y: "back", bottom: true,
      bottom_h: 4, magnets: true, drawer_h: 60 }), "600x380mm", "Plate", t),
    plateBuildSheet(plateEnv(ps, { variant: "grid", x_count: 4, y_count: 4, bottom: false, bottom_h: 4, magnets: false }), "4x4", "Plate", t),
    insertBuildSheet(toolEnv, "3x2x4", "Tool Insert", t),
    insertSvg(toolEnv, { title: t("sheet.toolSvgTitle", { tag: "3x2x4" }), scale: t("sheet.toolSvgScale") }),
  ];
  const out = Object.fromEntries(LANGS.map((l) => [l, sheets(translator(gridStrings, l))]));
  for (const l of LANGS) out[l].forEach((s, i) => {
    const bad = /undefined|NaN|\{\w+(?::\d)?\}|\b(?:sheet|common|plate|box|case)\.[a-z]\w*/.exec(s);
    if (bad) problems.push(`sheet ${i} (${l}): "${bad[0]}"`);
  });
  out.de.forEach((s, i) => { if (s === out.en[i]) problems.push(`sheet ${i}: German = English`); });
  assert.deepEqual(problems, [], `translation problems:\n${problems.join("\n")}`);
  assert.equal(translator(gridStrings, "de")("plate.valBoxes", { n: 1, h: 10.55 }), "bis 1 Einheit (10,6 mm)"); // plural, decimal comma
  assert.equal(translator(gridStrings, "en")("plate.valBoxes", { n: 2, h: 17.5 }), "up to 2 units (17.5 mm)");
  for (const [header, want] of [["de-DE,de;q=0.9,en;q=0.8", "de"], ["en-US,de;q=0.5", "en"], ["fr-FR,de;q=0.7", "de"], ["", "en"], ["de;q=0, en;q=0.1", "en"]])
    assert.equal(acceptLanguage(header), want, `Accept-Language: ${header}`);
});

// ---------------------------------------------------------------- build
await step("site build", () => {
  execFileSync(process.execPath, [path.join(site, "build.mjs"), "--version", "test-1", "--out", dist], { stdio: "pipe" });
  const read = (rel) => fs.readFileSync(path.join(dist, rel), "utf8");
  assert.equal(JSON.parse(read("version.json")).version, "test-1");
  assert.ok(!read("index.html").includes("<!--site:"), "portal placeholder left");
  const models = JSON.parse(read("models.json"));
  assert.ok(models.length >= 1, "no models");
  for (const m of models) {
    const html = read(`${m.href}index.html`);
    assert.match(html, /^<!doctype html>/i, `${m.id}: not a full document`);
    assert.ok(html.includes('class="site-nav"') && !html.includes("<!--site:nav-->"), `${m.id}: nav missing`);
    assert.ok(!m.facts.some((f) => Object.values(f).some((s) => /\{\w+\.\w+\}/.test(s))), `${m.id}: unfilled fact`);
    if (m.image) assert.ok(fs.existsSync(path.join(dist, m.image)), `${m.id}: image missing`);
  }
  const wasm = fs.readFileSync(path.join(dist, "vendor/opencascade-gz.wasm"));
  assert.ok(wasm[0] === 0x1f && wasm[1] === 0x8b, "kernel is not gzipped");
  // every relative URL in pages and modules must resolve inside the site
  const broken = [];
  for (const rel of walk(dist).filter((f) => /\.(html|js)$/.test(f) && !f.startsWith("vendor/"))) {
    for (const [, ref] of read(rel).matchAll(/["'`](\.{1,2}\/[^"'`\s$?#]*)["'`]/g)) {
      const target = path.join(dist, path.dirname(rel), ref);
      if (!fs.existsSync(target)) broken.push(`${rel} -> ${ref}`);
    }
  }
  assert.deepEqual(broken, [], "broken relative URLs");
});

// ---------------------------------------------------------------- server (static)
await step("server: static serving", async () => {
  fs.writeFileSync(path.join(tmp, "secret.txt"), "outside the site");
  fs.writeFileSync(path.join(dist, ".hidden"), "dot file");
  const server = createSiteServer({ dir: dist });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port, base = `http://127.0.0.1:${port}`;
  const raw = (p) => new Promise((resolve, reject) => http.get({ host: "127.0.0.1", port, path: p }, (res) => { res.resume(); resolve(res.statusCode); }).on("error", reject));
  try {
    let r = await fetch(`${base}/`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /^text\/html/);
    r = await fetch(`${base}/models/gridfinity-rugged-case`, { redirect: "manual" });
    assert.equal(r.status, 301);
    assert.equal(r.headers.get("location"), "/models/gridfinity-rugged-case/");
    r = await fetch(`${base}/vendor/opencascade-gz.wasm`);
    assert.equal(r.headers.get("content-type"), "application/wasm");
    assert.equal(r.headers.get("content-encoding"), null, "kernel must not be compressed twice");
    const etag = r.headers.get("etag");
    assert.equal(Buffer.from(await r.arrayBuffer())[0], 0x1f);
    r = await fetch(`${base}/vendor/opencascade-gz.wasm`, { headers: { "If-None-Match": etag } });
    assert.equal(r.status, 304);
    r = await fetch(`${base}/vendor/three.module.js`, { headers: { "Accept-Encoding": "gzip" } });
    assert.equal(r.headers.get("content-encoding"), "gzip");
    assert.match(await r.text(), /REVISION/);
    for (const p of ["/..%2fsecret.txt", "/%2e%2e/secret.txt", "/models/../../secret.txt", "/.hidden", "/nothing.js"]) {
      assert.equal(await raw(p), 404, p);
    }
    r = await fetch(`${base}/api/status`);
    const s = await r.json();
    assert.equal(s.mode, "static");
    assert.equal(s.current.version, "test-1");
    r = await fetch(`${base}/api/update`, { method: "POST" });
    assert.equal(r.status, 409);
  } finally {
    server.close();
    fs.rmSync(path.join(dist, ".hidden"));
  }
});

// ---------------------------------------------------------------- untar
function tarOf(entries) { // hand-made ustar archive
  const blocks = [];
  for (const [name, content] of entries) {
    const data = Buffer.from(content), h = Buffer.alloc(512);
    h.write(name, 0, 100);
    h.write("0000644\0", 100);
    h.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124);
    h.write("        ", 148);
    h.write("0", 156);
    h.write("ustar\u000000", 257);
    let sum = 0;
    for (const b of h) sum += b;
    h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

await step("untar", () => {
  const files = untar(zlib.gunzipSync(tarGz(dist)));
  const expected = walk(dist);
  for (const f of expected) assert.ok(files.get(f)?.equals(fs.readFileSync(path.join(dist, f))), f);
  assert.equal([...files.values()].filter(Boolean).length, expected.length);
  assert.equal(untar(tarOf([["a/b.txt", "hi"]])).get("a/b.txt").toString(), "hi");
  for (const bad of ["../evil.txt", "a/../../evil.txt", "/etc/evil", "C:/evil"]) assert.throws(() => untar(tarOf([[bad, "x"]])), /unsafe/, bad);
});

// ---------------------------------------------------------------- updater
await step("updater against a fake GitHub", async () => {
  const releases = [], blobs = new Map();
  let tokenLeaks = 0, dropDownloads = 0;
  const gh = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const json = (code, d) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
    if (u.pathname.startsWith("/storage/")) { // signed download URL: must arrive without the token
      if (req.headers.authorization) { tokenLeaks++; res.writeHead(400); return res.end(); }
      if (dropDownloads > 0) { dropDownloads--; return req.socket.destroy(); } // network failure mid-request
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      return res.end(blobs.get(u.pathname.slice(9)));
    }
    if (req.headers.authorization !== "Bearer test-token") return json(401, { message: "Bad credentials" });
    if (u.pathname === "/repos/me/cad/releases") return json(200, [...releases].reverse());
    const m = /^\/repos\/me\/cad\/releases\/assets\/(\d+)$/.exec(u.pathname);
    if (m && req.headers.accept === "application/octet-stream") {
      res.writeHead(302, { Location: `http://127.0.0.1:${gh.address().port}/storage/${m[1]}` });
      return res.end();
    }
    json(404, { message: "Not Found" });
  });
  await new Promise((r) => gh.listen(0, "127.0.0.1", r));
  const publish = (version, { corrupt = false } = {}) => {
    const dir = path.join(tmp, `release-${version}`);
    fs.cpSync(dist, dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "version.json"), JSON.stringify({ version, commit: "test", builtAt: new Date().toISOString() }));
    const buf = tarGz(dir), id = String(releases.length + 1);
    blobs.set(id, buf);
    releases.push({
      tag_name: `site-${version}`, draft: false, prerelease: false, html_url: `https://example.invalid/${version}`,
      published_at: new Date(Date.UTC(2026, 0, 1, 0, Number(id))).toISOString(),
      assets: [{ id: Number(id), name: "site.tar.gz", size: buf.length, digest: `sha256:${corrupt ? sha256(Buffer.from("x")) : sha256(buf)}` }],
    });
  };

  const data = path.join(tmp, "data");
  let child, out = "", base;
  const start = async () => {
    out = "";
    child = spawn(process.execPath, [path.join(site, "server", "server.mjs")], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env, PORT: "0", DATA_DIR: data, GITHUB_REPO: "me/cad", GITHUB_TOKEN: "test-token",
        GITHUB_API_URL: `http://127.0.0.1:${gh.address().port}`, UPDATE_INTERVAL_MIN: "0", KEEP_VERSIONS: "2", RETRY_DELAYS_S: "0.5,0.5",
      },
    });
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    base = `http://127.0.0.1:${await until(() => /listening on port (\d+)/.exec(out)?.[1], "server start")}`;
  };
  const stop = () => new Promise((r) => { child.once("exit", r); child.kill(); });
  const state = async () => (await fetch(`${base}/api/status`)).json();
  const update = async () => (await fetch(`${base}/api/update`, { method: "POST" })).json();

  try {
    await start();
    let s = await until(async () => { const v = await state(); return v.lastCheck && v; }, "first check");
    assert.match(s.lastError, /no site-\* release/);
    assert.equal((await fetch(`${base}/`)).status, 503, "waiting page while nothing is installed");
    assert.match(await (await fetch(`${base}/`, { headers: { "Accept-Language": "de-DE,de;q=0.9" } })).text(), /lang="de".*Die Website wird installiert/s);

    publish("v1");
    s = await update();
    assert.equal(s.current?.version, "v1", s.lastError ?? "v1 not installed");
    assert.equal((await (await fetch(`${base}/version.json`)).json()).version, "v1");
    assert.equal((await fetch(`${base}/models/gridfinity-rugged-case/`)).status, 200);

    publish("v2");
    dropDownloads = 1;
    s = await update();
    assert.equal(s.current.version, "v2", s.lastError ?? "v2 not installed after a dropped connection");
    assert.match(out, /download: fetch failed .* - retrying in/, "the dropped download was not retried");

    publish("v3", { corrupt: true });
    s = await update();
    assert.match(s.lastError, /checksum/);
    assert.equal(s.current.version, "v2", "a bad download must not replace the site");
    assert.equal(s.updateAvailable, true);

    publish("v4");
    s = await update();
    assert.equal(s.current.version, "v4");
    assert.equal(s.lastError, null);
    assert.deepEqual(s.installed, ["v2", "v4"], "KEEP_VERSIONS=2 keeps the current and one previous version");
    assert.equal(tokenLeaks, 0, "the token was sent to the storage URL");

    await stop();
    await start();
    s = await state();
    assert.equal(s.current?.version, "v4", "the installed version survives a restart");
    assert.equal((await fetch(`${base}/`)).status, 200);
  } catch (e) {
    e.message += `\n--- server log ---\n${out}`;
    throw e;
  } finally {
    if (child?.exitCode === null) await stop();
    gh.close();
  }
});

if (args.includes("--keep")) console.log(`test files kept in ${tmp}`);
else fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `${failures} check(s) failed` : "all checks passed");
process.exitCode = failures ? 1 : 0;
