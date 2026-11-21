// Parametric Christmas tree: a port of Jan's SolidCraft model (Christmas/solidcraft/christmas_tree.sc) with the same
// equations, plus the two-colour paint rule decoded from his print (Christmas/spec/tree_spec.md).
// The tree is N/2 flat plates, each the full 3-tier silhouette, extruded t thick about its mid plane and turned by
// 360°/N about Z, so the tree has N fins. Frame: Z up, the base on z = 0, the trunk on the Z axis.
// Spec: Christmas/spec/tree_params.json. Runs in the page's worker and in Node (replicad passed in as R).

// derived sizes, without the geometry kernel. inputs: height, fins, fin_t, angle, bands, band_share
export function treeEnv(spec, inputs) {
  const { kw, kt, kp, ks, kr } = spec.shape;
  const H = inputs.height, N = inputs.fins, t = inputs.fin_t, a = (inputs.angle * Math.PI) / 180;
  const Rb = kw * H, R1 = kt * Rb, R2 = R1 + (Rb - R1) / 3, R3 = R1 + (2 * (Rb - R1)) / 3;
  const p = kp * H, sf = ks * H;
  const s = (sf * p) / (p + Math.tan(a) * ((Rb - R1) / 3 + sf)); // horizontal lip under each tier
  const dr = s * Math.tan(a); // height of the tier underside
  const rc = kr * H; // rounding of the tier tips
  // bands of filament 2: from the base and from the start of each tier underside, h tall (a share of the pitch);
  // never longer than the gap to the next band
  const h = Math.min((inputs.band_share / 100) * p, p - dr - 0.5);
  const bands = inputs.bands ? [[0, h], ...[1, 2, 3].map((k) => [k * p - dr, k * p - dr + h])] : [];
  return { ...inputs, H, N, t, a, Rb, R1, R2, R3, p, s, dr, rc, h, bands, diameter: 2 * Rb };
}

// silhouette in the sketch plane (u = x, v = z), counter-clockwise from the left base corner; round: tip rounded by rc
export function treeOutline(env) {
  const { H, t, Rb, R1, R2, R3, p, s, dr } = env;
  const right = [
    [Rb, 0], [R3 - s, p - dr], [R3, p, true], [R2 - s, 2 * p - dr], [R2, 2 * p, true], [R1 - s, 3 * p - dr], [R1, 3 * p, true], [t, H],
  ];
  const left = right.slice().reverse().map(([u, v, round]) => [-u, v, round]);
  return [[-Rb, 0], ...right, ...left.slice(0, -1)]; // the left base corner is the first point
}

const rawBool = (R, cls, a, b) => {
  const bld = new (R.getOC()[cls])(a.wrapped, b.wrapped);
  bld.Build();
  const shape = R.cast(bld.Shape());
  bld.delete();
  return shape;
};
// replicad's fuse ends with UnifySameDomain, which can throw after a successful boolean: fall back to the raw one
const fuse = (R, a, b) => { try { return a.fuse(b); } catch { return rawBool(R, "BRepAlgoAPI_Fuse", a, b); } };

// the tree as one solid; env from treeEnv
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
  return list[0];
}

export const treeTag = (env) => `${env.H}mm_${env.N}fins`;

// Markdown build sheet; title: the model title in the sheet's language; slicer: bambu | orca | prusa;
// t: translator of src/strings.js
const SLICER_STEPS = { bambu: "tree.sheetBambu", orca: "tree.sheetOrca", prusa: "tree.sheetPrusa" };
export function treeBuildSheet(env, title, slicer, colors, t) {
  const lines = [
    `# ${title} ${treeTag(env)}`,
    "",
    `- ${t("tree.sheetSize", { h: env.H, d: env.diameter })}`,
    `- ${t("tree.sheetFins", { n: env.N, t: env.t })}`,
    `- ${t("tree.sheetAngle", { a: env.angle })}`,
    `- ${env.bands.length ? t("tree.sheetBands", { n: env.bands.length, h: env.h }) : t("tree.sheetNoBands")}`,
    "",
    `## ${t("tree.sheetPrinting")}`,
    "",
  ];
  if (env.bands.length) {
    lines.push(`- ${t("tree.sheetFilaments", { main: colors.main, band: colors.band })}`, `- ${t(SLICER_STEPS[slicer])}`);
  } else lines.push(`- ${t("tree.sheetOneColour")}`);
  lines.push(`- ${t("tree.sheetLayers")}`, `- ${t("tree.sheetStl")}`);
  return lines.join("\n") + "\n";
}
