// Download page of a ready-made model (kind "download" in site/models.json): gallery, parts with their files, print
// settings and mounting steps from ./model.json, which site/build.mjs writes from <source>/model.json.
// "Download all" fetches the files and zips them with a build sheet written in the page's current language.
import { zipSync } from "./vendor/fflate.js";
import { translator, pick, applyDom, mountLangSwitch } from "./vendor/i18n.js";
import S from "./strings.js";
import { buildSheet, printRows } from "./sheet.js";

const $ = (id) => document.getElementById(id);
const tr = translator(S); // not "t": a local t would shadow the translator
let model = null;
let shown = 0; // picture in the large view

function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}
const base = (rel) => rel.split("/").pop();
const fileStem = () => model.id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("_"); // skadis-roll-holder -> Skadis_Roll_Holder
const size = (n) => (n >= 1048576 ? tr("dl.sizeMB", { v: n / 1048576 }) : tr("dl.sizeKB", { v: Math.max(1, Math.round(n / 1024)) }));

function save(blob, name) {
  const a = el("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

function link(rel) {
  const a = el("a", { href: rel, className: "fmt" }, base(rel).split(".").pop().toUpperCase(), el("small", { textContent: size(model.sizes[rel]) }));
  a.setAttribute("download", base(rel));
  a.setAttribute("aria-label", tr("dl.download", { file: base(rel) }));
  return a;
}

function row(head, sub, ...links) {
  return el("div", { className: "part" }, el("div", { className: "part-head" }, ...head), ...(sub ? [el("small", { textContent: sub })] : []),
    el("div", { className: "links" }, ...links));
}

function render() {
  const title = pick(model.title);
  document.title = title;
  $("title").textContent = title;
  $("lede").textContent = pick(model.summary);
  $("facts").replaceChildren(...model.facts.map((f) => el("li", { textContent: pick(f) })));
  const img = model.images[shown];
  Object.assign($("hero"), { src: img.file, alt: pick(img.alt) });
  $("caption").textContent = pick(img.alt);
  $("thumbs").replaceChildren(...model.images.map((im, i) => {
    const b = el("button", { type: "button", className: "thumb" }, el("img", { src: im.file, alt: "" }));
    b.setAttribute("aria-label", tr("dl.showImage", { n: i + 1 }));
    b.setAttribute("aria-pressed", String(i === shown));
    b.addEventListener("click", () => { shown = i; render(); });
    return b;
  }));
  $("parts").replaceChildren(...model.parts.map((p) =>
    row([el("strong", { textContent: pick(p.name) }), el("span", { className: "qty", textContent: tr("dl.qty", { n: p.qty }) })], pick(p.orient), ...p.files.map(link))));
  const sheetBtn = el("button", { type: "button", className: "fmt", textContent: tr("dl.sheetSave") });
  sheetBtn.addEventListener("click", () => save(new Blob([buildSheet(model, tr)], { type: "text/markdown" }), `${fileStem()}_BUILD_SHEET.md`));
  $("more").replaceChildren(
    ...(model.files ?? []).map((f) => row([el("strong", { textContent: pick(f.label) })], "", link(f.file))),
    row([el("strong", { textContent: tr("dl.sheet") })], "", sheetBtn));
  $("print").replaceChildren(...printRows(model.print, tr).flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]));
  $("notes").replaceChildren(...(model.print.notes ?? []).map((n) => el("li", { textContent: pick(n) })));
  $("steps").replaceChildren(...model.steps.map((s) => el("li", { textContent: pick(s) })));
}

function message(text, tone = "") {
  Object.assign($("zip-msg"), { textContent: text, className: `msg ${tone}` });
}

async function downloadAll() {
  $("zip").disabled = true;
  message(tr("dl.zipping"), "busy");
  try {
    const rels = [...new Set([...model.parts.flatMap((p) => p.files), ...(model.files ?? []).map((f) => f.file)])];
    const entries = {};
    for (const rel of rels) {
      const r = await fetch(rel);
      if (!r.ok) throw new Error(`${base(rel)}: HTTP ${r.status}`);
      entries[base(rel)] = [new Uint8Array(await r.arrayBuffer()), { level: rel.endsWith(".3mf") ? 0 : 6 }]; // 3MF is a ZIP already
    }
    entries["BUILD_SHEET.md"] = new TextEncoder().encode(buildSheet(model, tr));
    save(new Blob([zipSync(entries)], { type: "application/zip" }), `${fileStem()}.zip`);
    message("");
  } catch (e) {
    message(tr("dl.zipFailed", { error: e.message }), "err");
  } finally {
    $("zip").disabled = false;
  }
}

applyDom(tr);
mountLangSwitch();
try {
  const r = await fetch(new URL("./model.json", import.meta.url));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  model = await r.json();
  render();
  $("zip").disabled = false;
} catch (e) {
  message(tr("dl.loadFailed", { error: e.message }), "err");
}
$("zip").addEventListener("click", downloadAll);
document.addEventListener("langchange", () => {
  applyDom(tr);
  if (model) render();
});
