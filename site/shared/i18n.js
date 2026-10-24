// Site-wide languages (English, German). The site build copies this file to vendor/i18n.js; pages import it as
// ./vendor/i18n.js like the other shared libraries. A text is a plain string or {en, de}; dictionaries map keys to
// such texts, plural texts are {one, other}. translator() and pick() are pure and also run in Node (build sheets).
// Language: ?lang=de|en, then localStorage "site-lang" (shared by all pages of the site), then the browser, then en.
export const LANGS = ["en", "de"];
const STORE = "site-lang";
const browser = typeof document !== "undefined";

// texts of the site frame (nav bar, language switch), available to every translator
const SITE = {
  "site.nav": { en: "Site", de: "Website" },
  "site.allModels": { en: "← All models", de: "← Alle Modelle" },
  "site.version": { en: "site {version}", de: "Website {version}" },
};
const NAMES = { en: "English", de: "Deutsch" };

function initial() {
  if (!browser) return "en";
  const q = new URLSearchParams(location.search).get("lang");
  if (LANGS.includes(q)) {
    try { localStorage.setItem(STORE, q); } catch { /* storage unavailable */ }
    return q;
  }
  try {
    const s = localStorage.getItem(STORE);
    if (LANGS.includes(s)) return s;
  } catch { /* storage unavailable */ }
  for (const l of navigator.languages ?? [navigator.language]) {
    const base = String(l).slice(0, 2).toLowerCase();
    if (LANGS.includes(base)) return base;
  }
  return "en";
}
export let lang = initial();
if (browser) document.documentElement.lang = lang;

export function setLang(l) {
  if (!LANGS.includes(l) || l === lang) return;
  lang = l;
  try { localStorage.setItem(STORE, l); } catch { /* storage unavailable */ }
  try { // keep an explicit ?lang= in step, so a reload shows the chosen language
    const u = new URL(location.href);
    if (u.searchParams.has("lang")) { u.searchParams.set("lang", l); history.replaceState(history.state, "", u); }
  } catch { /* sandboxed */ }
  document.documentElement.lang = l;
  syncSwitches();
  document.dispatchEvent(new CustomEvent("langchange", { detail: l }));
}

export const pick = (text, l = lang) => (text && typeof text === "object" ? text[l] ?? text.en : text);

const plain = new Map(), point = new Map();
// v with exactly `digits` decimals in the language's notation (German: decimal comma); digits omitted = as needed.
// Fixed digits round like toFixed (Intl rounds 45.55 up, toFixed down), so English output matches the old pages.
export function num(v, digits, l = lang) {
  if (!plain.has(l)) {
    const f = new Intl.NumberFormat(l, { maximumFractionDigits: 6, useGrouping: false });
    plain.set(l, f);
    point.set(l, f.formatToParts(1.5).find((p) => p.type === "decimal").value);
  }
  return digits === undefined ? plain.get(l).format(v) : v.toFixed(digits).replace(".", point.get(l));
}

// {name} inserts vars.name; {name:2} formats a number with 2 decimals; plain numbers use the language's notation
export const fill = (s, vars, l) => s.replace(/\{(\w+)(?::(\d))?\}/g, (m, k, d) => {
  const v = vars[k];
  if (v === undefined) return m;
  return typeof v === "number" ? num(v, d === undefined ? undefined : Number(d), l) : String(v);
});

// t(key, vars) in a fixed language, or in the current one when l is omitted; t.num and t.lang belong to the same language
export function translator(dict, l) {
  const t = (key, vars = {}) => {
    const lg = l ?? lang, entry = dict[key] ?? SITE[key];
    if (!entry) return key;
    let s = entry[lg] ?? entry.en;
    if (typeof s === "object") s = s[new Intl.PluralRules(lg).select(vars.n)] ?? s.other;
    return fill(s, vars, lg);
  };
  t.num = (v, digits) => num(v, digits, l ?? lang);
  Object.defineProperty(t, "lang", { get: () => l ?? lang });
  return t;
}

// static texts: data-i18n="key" (text; the element's other data-* attributes fill the placeholders),
// data-i18n-attr="aria-label:key;title:key", data-i18n-pick='{"en":…,"de":…}'
export function applyDom(t, root = document) {
  for (const e of root.querySelectorAll("[data-i18n]")) e.textContent = t(e.dataset.i18n, { ...e.dataset });
  for (const e of root.querySelectorAll("[data-i18n-attr]"))
    for (const pair of e.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      e.setAttribute(attr, t(key));
    }
  for (const e of root.querySelectorAll("[data-i18n-pick]")) e.textContent = pick(JSON.parse(e.dataset.i18nPick));
}

// EN | DE buttons in every [data-lang-switch]
export function mountLangSwitch(root = document) {
  for (const box of root.querySelectorAll("[data-lang-switch]")) {
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", "Sprache / Language");
    box.replaceChildren(...LANGS.map((l) => {
      const b = document.createElement("button");
      Object.assign(b, { type: "button", textContent: l.toUpperCase(), lang: l, title: NAMES[l] });
      b.setAttribute("aria-label", NAMES[l]);
      b.dataset.lang = l;
      b.addEventListener("click", () => setLang(l));
      return b;
    }));
  }
  syncSwitches();
}
function syncSwitches() {
  for (const b of document.querySelectorAll("[data-lang-switch] button")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
}

export const siteStrings = SITE;
