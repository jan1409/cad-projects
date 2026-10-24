// Overview page: model cards from models.json, the site version, and the update panel of the self-updating
// server (site/server/server.mjs: GET api/status, POST api/update). Without that server the panel stays hidden.
// Texts: strings.js (English, German); the language switch re-renders everything in place.
import { translator, pick, applyDom, mountLangSwitch, lang } from "./vendor/i18n.js";
import S from "./strings.js";

const $ = (id) => document.getElementById(id);
const t = translator(S);
let models = null; // models.json, or the Error that loading it gave
let loaded = null; // version.json of the files this page came from
let status = null; // last api/status answer
let busy = false;
let failure = null; // message of the last failed update request

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

function ago(iso) {
  const s = (Date.parse(iso) - Date.now()) / 1000, rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  for (const [unit, n] of [["day", 86400], ["hour", 3600], ["minute", 60]]) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unit);
  return t("portal.justNow");
}
const when = (iso) => new Date(iso).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });

// ---------- models ----------
function card(m) {
  const title = pick(m.title);
  const body = el("div", { class: "card-body" },
    el("h2", {}, title),
    el("p", {}, pick(m.summary)),
    el("ul", { class: "facts" }, ...m.facts.map((f) => el("li", {}, pick(f)))),
    el("span", { class: "open", "aria-hidden": "true" }, t("portal.open")));
  const a = el("a", { class: "card", href: m.href });
  if (m.image) a.append(el("div", { class: "plate" }, el("img", { src: m.image, alt: t("portal.imageAlt", { title }), loading: "lazy" })));
  a.append(body);
  return a;
}

async function loadModels() {
  try {
    models = await json("models.json");
  } catch (e) {
    models = e;
  }
  showModels();
}
function showModels() {
  if (!models) return;
  $("models").replaceChildren(...(models instanceof Error ? [el("p", { class: "empty" }, t("portal.loadFailed", { error: models.message }))]
    : models.length ? models.map(card) : [el("p", { class: "empty" }, t("portal.none"))]));
}

// ---------- site version ----------
async function loadVersion() {
  try {
    loaded = await json("version.json");
  } catch {
    return;
  }
  showVersion();
}
function showVersion() {
  if (!loaded) return;
  const facts = [el("span", {}, t("portal.siteVersion"), " ", el("b", { id: "site-version" }, loaded.version))];
  if (loaded.builtAt) facts.push(el("span", {}, `${t("portal.built")} `, el("b", {}, when(loaded.builtAt))));
  if (loaded.commit && loaded.commit !== "unknown") facts.push(el("span", {}, `${t("portal.commit")} `, el("b", {}, loaded.commit)));
  $("site-facts").replaceChildren(...facts);
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
  btn.textContent = t("update.check");
  if (status.mode !== "updater") return message(t("update.fixed"));
  const installed = status.current?.version;
  if (installed && loaded && installed !== loaded.version) {
    btn.className = "check primary";
    btn.textContent = t("update.reload");
    return message(t("update.installed", { version: installed }), "ok");
  }
  if (busy || status.checking) return message(t("update.checking"), "busy");
  if (failure) return message(t("update.failed", { error: failure }), "err");
  if (status.lastError) return message(t("update.lastFailed", { error: status.lastError }), "err");
  if (status.updateAvailable) {
    btn.className = "check primary";
    btn.textContent = t("update.install");
    return message(t("update.available", { version: status.latest.version }), "busy");
  }
  if (status.pinned) return message(t("update.pinned", { version: status.pinned }));
  if (!status.lastCheck) return message(t("update.never"));
  if (status.autoInstall && status.intervalMin > 0) message(t("update.upToDateAuto", { ago: ago(status.lastCheck), n: status.intervalMin }), "ok");
  else message(t("update.upToDate", { ago: ago(status.lastCheck) }), "ok");
}

async function refreshStatus() {
  try {
    status = await json("api/status");
    failure = null;
  } catch (e) {
    if (e.status === 404) status = null; // no updater behind this site
  }
  render();
}

async function checkNow() {
  if (status?.current && loaded && status.current.version !== loaded.version) return location.reload();
  busy = true;
  failure = null;
  render();
  try {
    status = await json("api/update", { method: "POST" });
    busy = false;
    render();
    if (status.current && loaded && status.current.version !== loaded.version) setTimeout(() => location.reload(), 1500);
  } catch (e) {
    busy = false;
    failure = e.message;
    render();
  }
}

$("check").addEventListener("click", checkNow);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshStatus(); });
setInterval(() => { if (!document.hidden && !busy) refreshStatus(); }, 60_000);
applyDom(t);
mountLangSwitch();
document.addEventListener("langchange", () => {
  applyDom(t);
  showModels();
  showVersion();
  render();
});

await Promise.all([loadModels(), loadVersion()]);
await refreshStatus();
