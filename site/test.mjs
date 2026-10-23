// Site checks, run by CI before every release (npm test):
//   geometry  smallest, default and largest case build with watertight parts (Gridfinity/web/node/sweep.mjs --one)
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
import { createSiteServer, untar } from "./server/server.mjs";

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
}

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
    assert.ok(!m.facts.some((f) => /\{\w+\.\w+\}/.test(f)), `${m.id}: unfilled fact`);
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
  let tokenLeaks = 0;
  const gh = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const json = (code, d) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
    if (u.pathname.startsWith("/storage/")) { // signed download URL: must arrive without the token
      if (req.headers.authorization) { tokenLeaks++; res.writeHead(400); return res.end(); }
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
        GITHUB_API_URL: `http://127.0.0.1:${gh.address().port}`, UPDATE_INTERVAL_MIN: "0", KEEP_VERSIONS: "2",
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

    publish("v1");
    s = await update();
    assert.equal(s.current?.version, "v1", s.lastError ?? "v1 not installed");
    assert.equal((await (await fetch(`${base}/version.json`)).json()).version, "v1");
    assert.equal((await fetch(`${base}/models/gridfinity-rugged-case/`)).status, 200);

    publish("v2");
    s = await update();
    assert.equal(s.current.version, "v2");

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
