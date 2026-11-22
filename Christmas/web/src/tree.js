// Parametric Christmas tree: a port of Jan's SolidCraft model (Christmas/solidcraft/christmas_tree.sc) with the same
// equations, plus the two-colour paint rule decoded from his print (Christmas/spec/tree_spec.md).
// The tree is N/2 flat plates, each the full 3-tier silhouette, extruded t thick about its mid plane and turned by
// 360°/N about Z, so the tree has N fins. Frame: Z up, the base on z = 0, the trunk on the Z axis.
// Tops (the configuration rows of the .sc): flat (Jan's v2: fins end 2t wide), sharp (the outline meets in an apex),
// star (flat top plus a tab in fin 0's plane; a separate flat 5-point star with a slot plugs onto it).
// Spec: Christmas/spec/tree_params.json. Runs in the page's worker and in Node (replicad passed in as R).

const DEG = Math.PI / 180;

// derived sizes, without the geometry kernel. inputs: height, fins, fin_t, angle, bands, band_share, top, star_share,
// star_filament
export function treeEnv(spec, inputs) {
  const { kw, kt, kp, ks, kr } = spec.shape;
  const H = inputs.height, N = inputs.fins, t = inputs.fin_t, a = inputs.angle * DEG;
  const Rb = kw * H, R1 = kt * Rb, R2 = R1 + (Rb - R1) / 3, R3 = R1 + (2 * (Rb - R1)) / 3;
  const p = kp * H, sf = ks * H;
  const s = (sf * p) / (p + Math.tan(a) * ((Rb - R1) / 3 + sf)); // horizontal lip under each tier
  const dr = s * Math.tan(a); // height of the tier underside
  const rc = kr * H; // rounding of the tier tips
  // bands of filament 2: from the base and from the start of each tier underside, h tall (a share of the pitch);
  // never longer than the gap to the next band
  const h = Math.min((inputs.band_share / 100) * p, p - dr - 0.5);
  const bands = inputs.bands ? [[0, h], ...[1, 2, 3].map((k) => [k * p - dr, k * p - dr + h])] : [];
  const top = inputs.top ?? "flat";
  const star = top === "star" ? starSizes(spec.shape.star, { H, t }, inputs) : null;
  return {
    ...inputs, top, H, N, t, a, Rb, R1, R2, R3, p, s, dr, rc, h, bands, diameter: 2 * Rb, star,
    printHeight: star ? star.tabTop : H, // the tree as printed (with its tab)
    fullHeight: star ? star.zc + star.Rs : H, // with the star on
  };
}

// the star and its tab (names of the .sc parameters in brackets); the tab is fin 0 continued above H, t thick
function starSizes(S, { H, t }, inputs) {
  const Ds = Math.max(S.min_diameter, ((inputs.star_share ?? 25) / 100) * H), Rs = Ds / 2, q = S.q, fit = S.fit; // Ds Rs kq fg
  const st = Math.max(S.t_min, t + 2 * fit + 2 * S.wall); // star thickness (st)
  const wt = S.tab_w * q * Rs; // tab width (wt)
  const sd = (q + S.slot_extra) * Rs; // slot depth above the star's bottom notch (sd)
  const ms = (Math.sin(54 * DEG) - q) / Math.cos(54 * DEG); // slope of the lower points' inner edges (ms)
  const gs = ms * (Math.hypot(t, t / 2) + S.clearance); // lift of the notch above H: the lower points clear the fins (gs)
  const zc = H + gs + q * Rs; // star centre (zc)
  const tb = Math.min(t, wt / 2 - 0.5); // tab half-width at H, no wider than fin 0's top (tb)
  const tf = wt / 2 - tb; // height of the 45 deg flare to the full width (tf)
  const tabTop = H + gs + sd - fit;
  return { Ds, Rs, q, fit, st, wt, sd, ms, gs, zc, tb, tf, tabTop, filament: Number(inputs.star_filament ?? 3) };
}

// the tab's outline in fin 0's plane (u = x, v = z): a 1 mm root inside the fin, then out at 45 deg to wt
export function tabOutline(env) {
  const { H } = env, { tb, tf, wt, tabTop } = env.star;
  return [[-tb, H - 1], [tb, H - 1], [tb, H], [wt / 2, H + tf], [wt / 2, tabTop], [-wt / 2, tabTop], [-wt / 2, H + tf], [-tb, H]];
}

// silhouette in the sketch plane (u = x, v = z), counter-clockwise from the left base corner; round: tip rounded by rc
export function treeOutline(env) {
  const { H, t, Rb, R1, R2, R3, p, s, dr } = env;
  const side = [[Rb, 0], [R3 - s, p - dr], [R3, p, true], [R2 - s, 2 * p - dr], [R2, 2 * p, true], [R1 - s, 3 * p - dr], [R1, 3 * p, true]];
  const top = env.top === "sharp" ? [[0, H]] : [[t, H], [-t, H]];
  const left = side.slice().reverse().map(([u, v, round]) => [-u, v, round]);
  return [[-Rb, 0], ...side, ...top, ...left.slice(0, -1)]; // the left base corner is the first point
}

// the star's outline about its centre: 10 points, one point up, outer radius Rs, inner q Rs
export function starOutline(star) {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? star.Rs : star.q * star.Rs, ang = (90 + 36 * i) * DEG;
    return [r * Math.cos(ang), r * Math.sin(ang)];
  });
}

const rawBool = (R, cls, a, b) => {
  const bld = new (R.getOC()[cls])(a.wrapped, b.wrapped);
  bld.Build();
  const shape = R.cast(bld.Shape());
  bld.delete();
  return shape;
};
// replicad's fuse/cut end with UnifySameDomain, which can throw after a successful boolean: fall back to the raw one
const fuse = (R, a, b) => { try { return a.fuse(b); } catch { return rawBool(R, "BRepAlgoAPI_Fuse", a, b); } };
const cut = (R, a, b) => { try { return a.cut(b); } catch { return rawBool(R, "BRepAlgoAPI_Cut", a, b); } };

// the tree as one solid (with the tab for the star); env from treeEnv
export function makeTree(R, env) {
  const pts = treeOutline(env);
  let pen = R.draw(pts[0]);
  for (let i = 1; i < pts.length; i++) {
    pen = pen.lineTo(pts[i].slice(0, 2));
    if (pts[i][2]) pen = pen.customCorner(env.rc);
  }
  // the XZ plane: sketch x -> +X, sketch y -> +Z, normal -Y; start at y = t/2, so the plate spans y = -t/2..t/2
  const plate = pen.close().sketchOnPlane("XZ", [0, env.t / 2, 0]).extrude(env.t);
  const plates = Array.from({ length: env.N / 2 }, (_, k) => (k === 0 ? plate : plate.clone().rotate((k * 360) / env.N, [0, 0, 0], [0, 0, 1])));
  // fuse pairwise, balanced (never a compound of overlapping solids)
  let list = plates;
  while (list.length > 1) {
    const next = [];
    for (let i = 0; i < list.length; i += 2) next.push(i + 1 < list.length ? fuse(R, list[i], list[i + 1]) : list[i]);
    list = next;
  }
  if (!env.star) return list[0];
  const tab = tabOutline(env);
  let tpen = R.draw(tab[0]);
  for (let i = 1; i < tab.length; i++) tpen = tpen.lineTo(tab[i]);
  return fuse(R, list[0], tpen.close().sketchOnPlane("XZ", [0, env.t / 2, 0]).extrude(env.t));
}

// the star lying flat for printing (z = 0..st, its centre over the origin, one point towards +Y), with the slot for
// the tab: a closed pocket from the bottom notch, cut open through the V between the lower points
export function makeStar(R, env) {
  const S = env.star, pts = starOutline(S);
  let pen = R.draw(pts[0]);
  for (let i = 1; i < pts.length; i++) pen = pen.lineTo(pts[i]);
  const body = pen.close().sketchOnPlane("XY").extrude(S.st);
  const half = S.wt / 2 + S.fit, notch = -S.q * S.Rs;
  const slot = R.makeBox([-half, notch - S.ms * half - 1, S.st / 2 - (env.t / 2 + S.fit)], [half, notch + S.sd, S.st / 2 + (env.t / 2 + S.fit)]);
  return cut(R, body, slot);
}

// the printed star moved to its place on the tree: upright in fin 0's plane (XZ), centred at (0, 0, zc)
export const starPose = (shape, env) => shape.rotate(90, [0, 0, 0], [1, 0, 0]).translate(0, env.star.st / 2, env.star.zc);

// where the star lies on the plate in the 3MF: beside the tree, flat
export const starOffset = (env) => [env.Rb + env.star.Rs + 10, 0, 0];

export const treeTag = (env) => `${env.H}mm_${env.N}fins` + (env.top === "flat" ? "" : `_${env.top}`);

// Markdown build sheet; title: the model title in the sheet's language; slicer: bambu | orca | prusa;
// t: translator of src/strings.js
const SLICER_STEPS = { bambu: "tree.sheetBambu", orca: "tree.sheetOrca", prusa: "tree.sheetPrusa" };
export function treeBuildSheet(env, title, slicer, colors, t) {
  const S = env.star;
  const topLine = S ? t("tree.sheetTopStar", { d: S.Ds, s: S.st }) : env.top === "sharp" ? t("tree.sheetTopSharp") : t("tree.sheetTopFlat", { w: 2 * env.t });
  const lines = [
    `# ${title} ${treeTag(env)}`,
    "",
    `- ${t("tree.sheetSize", { h: env.H, d: env.diameter })}`,
    `- ${t("tree.sheetFins", { n: env.N, t: env.t })}`,
    `- ${t("tree.sheetAngle", { a: env.angle })}`,
    `- ${env.bands.length ? t("tree.sheetBands", { n: env.bands.length, h: env.h }) : t("tree.sheetNoBands")}`,
    `- ${topLine}`,
  ];
  if (S) lines.push(`- ${t("tree.sheetHeightStar", { h: env.printHeight, a: env.fullHeight })}`);
  lines.push("", `## ${t("tree.sheetPrinting")}`, "");
  if (env.bands.length) {
    lines.push(`- ${t("tree.sheetFilaments", { main: colors.main, band: colors.band })}`, `- ${t(SLICER_STEPS[slicer])}`);
  } else lines.push(`- ${t("tree.sheetOneColour")}`);
  if (S) {
    lines.push(`- ${t("tree.sheetStarPrint")}`, `- ${t("tree.sheetStarFilament", { n: S.filament })}`);
    if (S.filament === 3) lines.push(`- ${t("tree.sheetStarThird")}`);
    lines.push(`- ${t("tree.sheetStarFit", { f: S.fit })}`);
  }
  lines.push(`- ${t("tree.sheetLayers")}`, `- ${t("tree.sheetStl")}`);
  return lines.join("\n") + "\n";
}
