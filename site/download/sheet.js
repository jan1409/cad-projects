// Print-setting rows and the build sheet (Markdown) of a download model, in the language of the translator `tr`
// (translator() of site/shared/i18n.js). The sheet is written at download time, so it follows the page's language.
// Pure, no imports: also runs in Node (site/test.mjs).

const pickIn = (tr) => (v) => (v && typeof v === "object" ? v[tr.lang] ?? v.en : v);
const base = (rel) => rel.split("/").pop();

// [label, value] rows of model.print, shared by the page and the sheet
export function printRows(pr, tr) {
  const p = pickIn(tr);
  const rows = [
    [tr("dl.material"), p(pr.material)],
    [tr("dl.layer"), tr("dl.layerVal", { v: pr.layer })],
    [tr("dl.walls"), String(pr.walls)],
    [tr("dl.infill"), tr("dl.infillVal", { n: pr.infill })],
    [tr("dl.supports"), pr.supports ? tr("dl.supportsNeeded") : tr("dl.supportsNone")],
  ];
  if (pr.minutes) rows.push([tr("dl.time"), tr("dl.timeVal", { h: Math.floor(pr.minutes / 60), m: pr.minutes % 60 })]);
  if (pr.grams) rows.push([tr("dl.filament"), tr("dl.filamentVal", { g: pr.grams })]);
  return rows;
}

export function buildSheet(model, tr) {
  const p = pickIn(tr);
  const lines = [`# ${p(model.title)}`, "", p(model.summary), "", `## ${tr("dl.files")}`, ""];
  for (const part of model.parts) {
    lines.push(tr("dl.sheetPart", { n: part.qty, name: p(part.name), files: part.files.map(base).join(", ") }));
    lines.push(tr("dl.sheetOrient", { orient: p(part.orient) }));
  }
  for (const f of model.files ?? []) lines.push(tr("dl.sheetFile", { label: p(f.label), file: base(f.file) }));
  lines.push("", `## ${tr("dl.print")}`, "", ...printRows(model.print, tr).map(([k, v]) => `- ${k}: ${v}`));
  if (model.print.notes?.length) lines.push("", `### ${tr("dl.sheetNotes")}`, "", ...model.print.notes.map((n) => `- ${p(n)}`));
  lines.push("", `## ${tr("dl.mount")}`, "", ...model.steps.map((s, i) => `${i + 1}. ${p(s)}`));
  return lines.join("\n") + "\n";
}
