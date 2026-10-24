// Self-updating web server for the generator site (Node 22+, standard library only).
//   node server.mjs                  serve DATA_DIR/versions/<current>/ and install new GitHub releases (container mode)
//   node server.mjs --dir site/dist  serve a built site as is (local development, no updater)
//
// Updates: every UPDATE_INTERVAL_MIN minutes (and on POST /api/update) the server asks GitHub for the newest release
// whose tag starts with RELEASE_PREFIX, downloads its RELEASE_ASSET (site.tar.gz, built by .github/workflows/site.yml),
// checks size and SHA-256, unpacks it next to the running version and switches over by rewriting current.json.
// The previous KEEP_VERSIONS - 1 versions stay on disk; PIN_VERSION=<version> holds (or rolls back to) one release.
//
// Data layout:  DATA_DIR/current.json   {version, installedAt, history: [...]}
//               DATA_DIR/versions/<v>/  unpacked site (index.html, models.json, version.json, models/, vendor/)
// API:          GET /api/health, GET /api/status, POST /api/update (check now; installs a newer release even if AUTO_INSTALL=false)
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";

const env = process.env;
const flag = (v, dflt) => (v === undefined || v === "" ? dflt : !/^(0|false|no|off)$/i.test(v));
export const CONFIG = {
  port: Number(env.PORT ?? 8642),
  dataDir: path.resolve(env.DATA_DIR || "/data"),
  repo: env.GITHUB_REPO || "",
  token: env.GITHUB_TOKEN || "",
  api: (env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, ""),
  asset: env.RELEASE_ASSET || "site.tar.gz",
  prefix: env.RELEASE_PREFIX ?? "site-",
  intervalMin: Number(env.UPDATE_INTERVAL_MIN ?? 15),
  autoInstall: flag(env.AUTO_INSTALL, true),
  keep: Math.max(1, Number(env.KEEP_VERSIONS || 3)),
  pin: env.PIN_VERSION || "",
};

const state = {
  mode: "updater", // or "static" (--dir)
  root: null, // directory being served
  current: null, // version.json of the served site + installedAt
  latest: null, // newest release seen on GitHub
  lastCheck: null,
  nextCheck: null,
  lastError: null,
  checking: null, // promise of the running check
};

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------------------------------------------------------------- tar.gz

// Minimal tar reader (ustar, GNU long names, pax paths): returns Map<relative path, Buffer | null (directory)>.
// Only regular files and directories are kept; absolute paths and ".." are rejected.
export function untar(tar) {
  const files = new Map();
  const text = (buf, a, n) => {
    const s = buf.subarray(a, a + n);
    const z = s.indexOf(0);
    return (z < 0 ? s : s.subarray(0, z)).toString("utf8");
  };
  let off = 0, longName = null, paxPath = null;
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const size = parseInt(text(h, 124, 12).trim() || "0", 8);
    if (!Number.isFinite(size) || size < 0) throw new Error("corrupt tar header");
    const type = h[156] ? String.fromCharCode(h[156]) : "0";
    let name = text(h, 0, 100);
    if (h.subarray(257, 263).toString("latin1") === "ustar\0") {
      const prefix = text(h, 345, 155); // POSIX ustar only; GNU tar stores other data there
      if (prefix) name = `${prefix}/${name}`;
    }
    const body = tar.subarray(off + 512, off + 512 + size);
    if (body.length < size) throw new Error("truncated tar archive");
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === "L") { longName = text(body, 0, body.length); continue; }
    if (type === "x") { paxPath = paxRecords(body).path ?? null; continue; }
    if (type === "g") continue;
    name = paxPath ?? longName ?? name;
    longName = paxPath = null;
    const rel = name.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/\/+$/, "");
    if (!rel || rel === ".") continue;
    if (rel.startsWith("/") || /^[a-z]:/i.test(rel) || rel.includes("\0") || rel.split("/").includes("..")) {
      throw new Error(`unsafe path in archive: ${name}`);
    }
    if (type === "5") files.set(rel, null);
    else if (type === "0" || type === "7") files.set(rel, Buffer.from(body));
    // links, devices and fifos are ignored
  }
  return files;
}

function paxRecords(body) { // "<len> key=value\n" records; len counts bytes
  const s = body.toString("latin1"), out = {};
  for (let i = 0; i < s.length;) {
    const sp = s.indexOf(" ", i), len = parseInt(s.slice(i, sp), 10);
    if (!(len > 0)) break;
    const rec = s.slice(sp + 1, i + len - 1), eq = rec.indexOf("=");
    out[rec.slice(0, eq)] = Buffer.from(rec.slice(eq + 1), "latin1").toString("utf8");
    i += len;
  }
  return out;
}

async function writeTree(dest, files) {
  for (const [rel, data] of files) {
    const file = path.join(dest, rel);
    if (!file.startsWith(dest + path.sep)) throw new Error(`unsafe path in archive: ${rel}`);
    if (data === null) await fsp.mkdir(file, { recursive: true });
    else {
      await fsp.mkdir(path.dirname(file), { recursive: true });
      await fsp.writeFile(file, data);
    }
  }
}

// ---------------------------------------------------------------- versions on disk

const versionsDir = () => path.join(CONFIG.dataDir, "versions");
const currentFile = () => path.join(CONFIG.dataDir, "current.json");

async function readJSON(file) {
  return JSON.parse(await fsp.readFile(file, "utf8"));
}

async function writeJSONAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 1));
  await fsp.rename(tmp, file);
}

async function checkSite(dir, version) { // a release must be a complete site
  for (const f of ["index.html", "models.json", "version.json"]) {
    if (!fs.existsSync(path.join(dir, f))) throw new Error(`release ${version} has no ${f}`);
  }
  const info = await readJSON(path.join(dir, "version.json"));
  if (info.version !== version) throw new Error(`release ${version} contains site version ${info.version}`);
  return info;
}

async function activate(version) {
  const dir = path.join(versionsDir(), version);
  const info = await checkSite(dir, version);
  let cur = {};
  try { cur = await readJSON(currentFile()); } catch { /* first install */ }
  const history = [...(cur.history ?? []).filter((v) => v !== version), version].slice(-20);
  const installedAt = new Date().toISOString();
  await writeJSONAtomic(currentFile(), { version, installedAt, history });
  state.root = dir;
  state.current = { ...info, installedAt };
  cache.clear();
  await prune(history);
}

async function prune(history) {
  const keep = new Set(history.slice(-CONFIG.keep));
  for (const d of await fsp.readdir(versionsDir())) {
    if (!keep.has(d) && d !== state.current?.version) {
      await fsp.rm(path.join(versionsDir(), d), { recursive: true, force: true });
      log(`removed old version ${d}`);
    }
  }
}

async function loadCurrent() {
  try {
    const cur = await readJSON(currentFile());
    const dir = path.join(versionsDir(), cur.version);
    state.current = { ...(await checkSite(dir, cur.version)), installedAt: cur.installedAt };
    state.root = dir;
    log(`serving ${cur.version}`);
  } catch (e) {
    if (e.code !== "ENOENT") log(`installed site unusable: ${e.message}`);
    log("no site installed yet - installing the latest release");
  }
}

// ---------------------------------------------------------------- GitHub releases

// fetch rejects with a TypeError ("fetch failed", cause = the socket/TLS error) when the network fails, also while
// reading a body ("terminated"). Those are retried over about 50 s; HTTP errors and timeouts are reported at once.
// (Seen in testing: TLS handshakes reset for a minute or two right after a release was published.)
const RETRY_DELAYS_S = (env.RETRY_DELAYS_S ?? "5,15,30").split(",").map(Number);
const reason = (e) => (e.cause ? `${e.message} (${e.cause.code ?? e.cause.name}: ${e.cause.message})` : e.message);
async function withRetry(what, fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
      if (attempt >= RETRY_DELAYS_S.length) throw new Error(`${what}: ${reason(e)}`);
      log(`${what}: ${reason(e)} - retrying in ${RETRY_DELAYS_S[attempt]} s`);
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_S[attempt] * 1000));
    }
  }
}

async function github(pathname, accept = "application/vnd.github+json") {
  const headers = { Accept: accept, "User-Agent": "cad-site-updater", "X-GitHub-Api-Version": "2022-11-28" };
  if (CONFIG.token) headers.Authorization = `Bearer ${CONFIG.token}`;
  const r = await fetch(`${CONFIG.api}${pathname}`, { headers, redirect: "manual", signal: AbortSignal.timeout(60_000) });
  if (r.ok) return r;
  await r.text().catch(() => ""); // small redirect/error bodies are read, not cancelled, so the connection stays reusable
  if (r.status >= 300 && r.status < 400) return r;
  const hint = {
    401: "GITHUB_TOKEN was rejected (expired or revoked?)",
    403: "access denied or rate limit reached",
    404: `${CONFIG.repo} not found - check GITHUB_REPO and that GITHUB_TOKEN may read it`,
  }[r.status];
  throw new Error(`GitHub answered ${r.status}${hint ? `: ${hint}` : ""}`);
}

function describe(rel) {
  const asset = rel.assets.find((a) => a.name === CONFIG.asset);
  if (!asset) throw new Error(`release ${rel.tag_name} has no ${CONFIG.asset}`);
  return {
    version: rel.tag_name.slice(CONFIG.prefix.length),
    publishedAt: rel.published_at,
    url: rel.html_url,
    asset: { id: asset.id, size: asset.size, digest: asset.digest ?? null },
  };
}

async function latestRelease() {
  if (CONFIG.pin) {
    const tag = encodeURIComponent(CONFIG.prefix + CONFIG.pin);
    return describe(await withRetry("release lookup", async () => (await github(`/repos/${CONFIG.repo}/releases/tags/${tag}`)).json()));
  }
  const list = await withRetry("release list", async () => (await github(`/repos/${CONFIG.repo}/releases?per_page=30`)).json());
  const rel = list
    .filter((x) => !x.draft && !x.prerelease && x.tag_name.startsWith(CONFIG.prefix))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0];
  if (!rel) throw new Error(`no ${CONFIG.prefix}* release in ${CONFIG.repo} yet`);
  return describe(rel);
}

async function download(asset) {
  const buf = await withRetry("download", async () => {
    let r = await github(`/repos/${CONFIG.repo}/releases/assets/${asset.id}`, "application/octet-stream");
    if (r.status >= 300) { // GitHub redirects to a signed storage URL, which must not get the token
      r = await fetch(r.headers.get("location"), { headers: { "User-Agent": "cad-site-updater" }, signal: AbortSignal.timeout(300_000) });
    }
    if (!r.ok) throw new Error(`download failed: HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  });
  if (asset.size && buf.length !== asset.size) throw new Error(`download incomplete: ${buf.length} of ${asset.size} bytes`);
  if (asset.digest?.startsWith("sha256:")) {
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    if (sha !== asset.digest.slice(7)) throw new Error("download checksum does not match the release");
  }
  return buf;
}

async function install(rel) {
  const dest = path.join(versionsDir(), rel.version);
  if (!fs.existsSync(path.join(dest, "index.html"))) {
    const files = untar(zlib.gunzipSync(await download(rel.asset)));
    const tmp = path.join(CONFIG.dataDir, "tmp", `${rel.version}-${Date.now()}`);
    await writeTree(tmp, files);
    await checkSite(tmp, rel.version);
    await fsp.rm(dest, { recursive: true, force: true });
    await fsp.rename(tmp, dest);
  }
  await activate(rel.version);
}

async function runCheck(manual) {
  try {
    if (!CONFIG.repo) throw new Error("GITHUB_REPO is not set");
    const rel = await latestRelease();
    state.latest = { version: rel.version, publishedAt: rel.publishedAt, url: rel.url };
    state.lastError = null;
    if (rel.version !== state.current?.version && (manual || CONFIG.autoInstall || CONFIG.pin || !state.current)) {
      log(`installing ${rel.version}${manual ? " (requested)" : ""}`);
      await install(rel);
      log(`now serving ${rel.version}`);
    }
  } catch (e) {
    state.lastError = reason(e);
    log(`update check failed: ${state.lastError}`);
  }
  state.lastCheck = new Date().toISOString();
}

export function check({ manual = false } = {}) { // concurrent callers share one running check
  state.checking ??= runCheck(manual).finally(() => { state.checking = null; });
  return state.checking;
}

function status() {
  const s = state;
  let installed = [];
  if (s.mode === "updater") try { installed = fs.readdirSync(versionsDir()).sort(); } catch { /* none yet */ }
  return {
    mode: s.mode,
    current: s.current,
    ...(s.mode === "updater" && {
      repo: CONFIG.repo,
      tokenConfigured: Boolean(CONFIG.token),
      latest: s.latest,
      updateAvailable: Boolean(s.latest && s.latest.version !== s.current?.version),
      autoInstall: CONFIG.autoInstall,
      intervalMin: CONFIG.intervalMin,
      pinned: CONFIG.pin || null,
      lastCheck: s.lastCheck,
      nextCheck: s.nextCheck,
      lastError: s.lastError,
      checking: Boolean(s.checking),
      installed,
    }),
  };
}

// ---------------------------------------------------------------- HTTP

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".wasm": "application/wasm",
  ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".json", ".css", ".svg", ".md", ".txt"]);
const cache = new Map(); // file -> {mtimeMs, size, etag, body, gz}

async function load(file) {
  const st = await fsp.stat(file);
  let e = cache.get(file);
  if (!e || e.mtimeMs !== st.mtimeMs || e.size !== st.size) {
    const body = await fsp.readFile(file);
    e = { mtimeMs: st.mtimeMs, size: st.size, body, gz: null, etag: `"${crypto.createHash("sha1").update(body).digest("base64url")}"` };
    cache.set(file, e);
  }
  return e;
}

function sendJSON(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function sendText(res, code, text, type = "text/plain; charset=utf-8", extra = {}) {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(text), ...extra });
  res.end(text);
}

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// the image holds only this file, so the waiting page carries its own texts (the site's are in shared/i18n.js and strings.js)
const WAITING = {
  en: { title: "Installing site", heading: "The site is being installed", failed: "Last attempt failed: ", downloading: "Downloading the latest release…",
    waiting: "Waiting for the next attempt.", repo: "Repository", reload: "This page reloads every 10 seconds." },
  de: { title: "Website wird installiert", heading: "Die Website wird installiert", failed: "Letzter Versuch fehlgeschlagen: ",
    downloading: "Das neueste Release wird heruntergeladen…", waiting: "Warte auf den nächsten Versuch.", repo: "Repository",
    reload: "Diese Seite lädt alle 10 Sekunden neu." },
};
// first supported language of an Accept-Language header ("de-DE,de;q=0.9,en;q=0.8"), by quality; English otherwise
export function acceptLanguage(header = "") {
  const tags = String(header).split(",").map((part, i) => {
    const [tag, ...params] = part.trim().toLowerCase().split(";");
    const q = Number(params.map((p) => p.trim()).find((p) => p.startsWith("q="))?.slice(2) ?? 1);
    return { base: tag.split("-")[0], q: Number.isFinite(q) ? q : 0, i };
  }).filter((t) => t.q > 0 && t.base in WAITING).sort((a, b) => b.q - a.q || a.i - b.i);
  return tags[0]?.base ?? "en";
}
function waitingPage(req) {
  const s = status(), lang = acceptLanguage(req.headers["accept-language"]), w = WAITING[lang];
  const line = s.lastError ? `${w.failed}${s.lastError}` : s.checking || !s.lastCheck ? w.downloading : w.waiting;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="10"><title>${w.title}</title>
<style>body{margin:0;padding:48px max(16px,env(safe-area-inset-left,0px));font:16px/1.5 system-ui,sans-serif;background:#eef1f3;color:#17202a}
@media (prefers-color-scheme:dark){body{background:#101418;color:#e3e8ee}}code{font-family:ui-monospace,Consolas,monospace}</style></head>
<body><h1>${w.heading}</h1><p>${escape(line)}</p><p>${w.repo} <code>${escape(CONFIG.repo || "(GITHUB_REPO not set)")}</code>.
${w.reload}</p></body></html>`;
}

async function api(req, res, pathname) {
  if (pathname === "/api/health") return sendJSON(res, 200, { ok: true, version: state.current?.version ?? null });
  if (pathname === "/api/status" && req.method === "GET") return sendJSON(res, 200, status());
  if (pathname === "/api/update" && req.method === "POST") {
    if (state.mode !== "updater") return sendJSON(res, 409, { error: "updates are off: the site is served from a fixed directory" });
    await check({ manual: true });
    return sendJSON(res, 200, status());
  }
  sendJSON(res, 404, { error: "unknown API call" });
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) return api(req, res, url.pathname);
  if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "Method not allowed", undefined, { Allow: "GET, HEAD" });
  if (!state.root) return sendText(res, 503, waitingPage(req), "text/html; charset=utf-8", { "Retry-After": "10", Vary: "Accept-Language" });

  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return sendText(res, 400, "Bad request"); }
  const root = state.root;
  let file = path.join(root, path.normalize(rel));
  if (rel.includes("\0") || (file !== root && !file.startsWith(root + path.sep)) || /[\\/]\./.test(file.slice(root.length))) {
    return sendText(res, 404, "Not found");
  }
  let st;
  try { st = await fsp.stat(file); } catch { return sendText(res, 404, "Not found"); }
  if (st.isDirectory()) {
    if (!url.pathname.endsWith("/")) return sendText(res, 301, "Moved", undefined, { Location: `${url.pathname}/${url.search}` });
    file = path.join(file, "index.html");
  }
  let e;
  try { e = await load(file); } catch { return sendText(res, 404, "Not found"); }

  const ext = path.extname(file).toLowerCase();
  const headers = {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": "no-cache", // revalidate every time; unchanged files answer 304 thanks to the content hash ETag
    ETag: e.etag,
    "X-Content-Type-Options": "nosniff",
  };
  if (COMPRESSIBLE.has(ext)) headers.Vary = "Accept-Encoding";
  if (req.headers["if-none-match"] === e.etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  let body = e.body;
  if (COMPRESSIBLE.has(ext) && body.length > 1024 && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")) {
    e.gz ??= zlib.gzipSync(body, { level: 9 });
    body = e.gz;
    headers["Content-Encoding"] = "gzip";
  }
  headers["Content-Length"] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : body);
}

export function createSiteServer({ dir } = {}) {
  if (dir) {
    state.mode = "static";
    state.root = path.resolve(dir);
    try { state.current = JSON.parse(fs.readFileSync(path.join(state.root, "version.json"), "utf8")); } catch { state.current = null; }
  }
  return http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      log(`error on ${req.method} ${req.url}: ${e.stack ?? e}`);
      if (!res.headersSent) sendText(res, 500, "Internal error");
      else res.destroy();
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : null;
  const port = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : CONFIG.port;
  const server = createSiteServer({ dir });
  if (!dir) {
    await fsp.mkdir(versionsDir(), { recursive: true });
    await fsp.rm(path.join(CONFIG.dataDir, "tmp"), { recursive: true, force: true });
    await loadCurrent();
    log(`updates from ${CONFIG.repo || "(GITHUB_REPO not set)"}, ${CONFIG.token ? "with" : "without"} token, ` +
      (CONFIG.intervalMin > 0 ? `every ${CONFIG.intervalMin} min, auto-install ${CONFIG.autoInstall ? "on" : "off"}` : "periodic checks off") +
      (CONFIG.pin ? `, pinned to ${CONFIG.pin}` : ""));
    const periodic = async () => {
      await check();
      if (CONFIG.intervalMin > 0) {
        state.nextCheck = new Date(Date.now() + CONFIG.intervalMin * 60_000).toISOString();
        setTimeout(periodic, CONFIG.intervalMin * 60_000).unref();
      }
    };
    periodic();
  }
  server.listen(port, () => log(`listening on port ${server.address().port}${dir ? `, serving ${path.resolve(dir)}` : ""}`));
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { server.close(); process.exit(0); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
