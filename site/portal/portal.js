// Overview page: model cards from models.json, the site version, and the update panel of the self-updating
// server (site/server/server.mjs: GET api/status, POST api/update). Without that server the panel stays hidden.
const $ = (id) => document.getElementById(id);
let loaded = null; // version.json of the files this page came from
let status = null; // last api/status answer
let busy = false;

async function json(url, init) {
  const r = await fetch(url, { cache: "no-store", ...init });
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
  return r.json();
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(iso) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  for (const [unit, n] of [["day", 86400], ["hour", 3600], ["minute", 60]]) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unit);
  return "just now";
}
const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

// ---------- models ----------
function card(m) {
  const body = el("div", { class: "card-body" },
    el("h2", {}, m.title),
    el("p", {}, m.summary),
    el("ul", { class: "facts" }, ...m.facts.map((f) => el("li", {}, f))),
    el("span", { class: "open", "aria-hidden": "true" }, "Open generator →"));
  const a = el("a", { class: "card", href: m.href });
  if (m.image) a.append(el("div", { class: "plate" }, el("img", { src: m.image, alt: `${m.title}, rendered`, loading: "lazy" })));
  a.append(body);
  return a;
}

async function showModels() {
  const box = $("models");
  try {
    const models = await json("models.json");
    box.replaceChildren(...(models.length ? models.map(card) : [el("p", { class: "empty" }, "No models are published yet.")]));
  } catch (e) {
    box.replaceChildren(el("p", { class: "empty" }, `The model list could not be loaded (${e.message}).`));
  }
}

// ---------- site version ----------
async function showVersion() {
  try {
    loaded = await json("version.json");
  } catch {
    return;
  }
  $("site-version").textContent = loaded.version;
  const facts = $("site-facts");
  if (loaded.builtAt) facts.append(el("span", {}, "built ", el("b", {}, when(loaded.builtAt))));
  if (loaded.commit && loaded.commit !== "unknown") facts.append(el("span", {}, "commit ", el("b", {}, loaded.commit)));
}

// ---------- updates ----------
function message(text, tone = "") {
  const m = $("update-msg");
  m.textContent = text;
  m.className = `msg ${tone}`;
}

function render() {
  const btn = $("check");
  $("update").hidden = !status;
  if (!status) return;
  btn.hidden = status.mode !== "updater";
  btn.disabled = busy;
  btn.className = "check";
  btn.textContent = "Check for updates";
  if (status.mode !== "updater") return message("Served from a fixed directory; updates are off.");
  const installed = status.current?.version;
  if (installed && loaded && installed !== loaded.version) {
    btn.className = "check primary";
    btn.textContent = "Reload";
    return message(`Version ${installed} is installed.`, "ok");
  }
  if (busy || status.checking) return message("Checking GitHub for a newer release…", "busy");
  if (status.lastError) return message(`Last check failed: ${status.lastError}`, "err");
  if (status.updateAvailable) {
    btn.className = "check primary";
    btn.textContent = "Install update";
    return message(`Version ${status.latest.version} is available.`, "busy");
  }
  if (status.pinned) return message(`Pinned to version ${status.pinned}.`);
  if (!status.lastCheck) return message("Not checked yet.");
  const auto = status.autoInstall && status.intervalMin > 0 ? ` · installs updates every ${status.intervalMin} min` : "";
  message(`Up to date · checked ${ago(status.lastCheck)}${auto}`, "ok");
}

async function refreshStatus() {
  try {
    status = await json("api/status");
  } catch (e) {
    if (e.status === 404) status = null; // no updater behind this site
  }
  render();
}

async function checkNow() {
  if (status?.current && loaded && status.current.version !== loaded.version) return location.reload();
  busy = true;
  render();
  try {
    status = await json("api/update", { method: "POST" });
    busy = false;
    render();
    if (status.current && loaded && status.current.version !== loaded.version) setTimeout(() => location.reload(), 1500);
  } catch (e) {
    busy = false;
    render();
    message(`Update failed: ${e.message}`, "err");
  }
}

$("check").addEventListener("click", checkNow);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshStatus(); });
setInterval(() => { if (!document.hidden && !busy) refreshStatus(); }, 60_000);

await Promise.all([showModels(), showVersion()]);
await refreshStatus();
