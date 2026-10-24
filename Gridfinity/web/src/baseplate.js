// Gridfinity baseplate geometry with replicad (OpenCascade WASM). Spec: Gridfinity/spec/baseplate_params.json - the
// official baseplate pocket profile, an optional solid bottom plate with magnet holes, border strips that fill a drawer,
// and the split into bed-sized pieces. Frame: z = 0 under the plate, front = -Y; each piece is built centred on its origin.
import { primsToDrawing, roundPolygon } from "./geom2d.js";

// split one axis (padA + 42 n + padB) along cell lines into the fewest balanced pieces no longer than max
export function splitAxis(n, padA, padB, max, pitch = 42) {
  const total = padA + pitch * n + padB;
  for (let k = Math.max(1, Math.ceil(total / max)); k <= n; k++) {
    const cuts = [0];
    for (let j = 1; j < k; j++) cuts.push(Math.min(n - (k - j), Math.max(cuts[j - 1] + 1, Math.round((j * total / k - padA) / pitch))));
    cuts.push(n);
    const pieces = [];
    for (let j = 0; j < k; j++) {
      const a = j === 0 ? padA : 0, b = j === k - 1 ? padB : 0, cells = cuts[j + 1] - cuts[j];
      pieces.push({ start: cuts[j], cells, padA: a, padB: b, length: a + pitch * cells + b });
    }
    if (pieces.every((p) => p.length <= max + 1e-9)) return pieces;
  }
  throw new Error(`cannot split ${n} cells into pieces of at most ${max} mm`);
}

// piece descriptor [nx, ny, left, right, front, back, roundFL, roundFR, roundBR, roundBL], turned 90 deg counter-clockwise
const turn = ([nx, ny, l, r, f, b, fl, fr, br, bl]) => [ny, nx, b, f, l, r, bl, fl, fr, br];
const keyOf = (desc) => desc.map((v) => (typeof v === "number" ? v.toFixed(2) : v ? 1 : 0)).join(",");

// all derived dimensions and the piece layout; shared by the geometry, the datasheet and the build sheet
export function plateEnv(spec, inputs) {
  const o = spec.official, d = spec.design, p = o.pitch;
  const drawer = inputs.variant === "drawer";
  const b = inputs.bottom ? inputs.bottom_h : 0;
  const strip = (v) => (v < d.min_strip ? 0 : v);
  let nx = inputs.x_count, ny = inputs.y_count, pad = { left: 0, right: 0, front: 0, back: 0 }, dropped = 0;
  if (drawer) {
    const fit = (dim, align, lo, hi) => {
      const usable = dim - 2 * inputs.clearance, n = Math.max(1, Math.floor(usable / p + 1e-9)), spare = usable - n * p;
      const a = strip(align === "center" ? spare / 2 : align === lo ? spare : 0), c = strip(align === "center" ? spare / 2 : align === hi ? spare : 0);
      dropped += spare - a - c;
      return [n, a, c];
    };
    [nx, pad.left, pad.right] = fit(inputs.width, inputs.spare_x, "left", "right");
    [ny, pad.front, pad.back] = fit(inputs.depth, inputs.spare_y, "front", "back");
  }
  const W = pad.left + p * nx + pad.right, D = pad.front + p * ny + pad.back, H = o.pocket.height + b;
  const xs = splitAxis(nx, pad.left, pad.right, spec.bed[0], p), ys = splitAxis(ny, pad.front, pad.back, spec.bed[1], p);

  // pieces, lettered row by row from the front left. Pieces equal up to a rotation share one build ("unique"), which
  // keeps the orientation of its first piece; mirror images stay separate parts.
  const pieces = [], unique = [], byKey = new Map();
  ys.forEach((yp, j) => xs.forEach((xp, i) => {
    const lastX = i === xs.length - 1, lastY = j === ys.length - 1;
    const desc = [xp.cells, yp.cells, xp.padA, xp.padB, yp.padA, yp.padB, i === 0 && j === 0, lastX && j === 0, lastX && lastY, i === 0 && lastY];
    const rotations = [desc];
    for (let k = 1; k < 4; k++) rotations.push(turn(rotations[k - 1]));
    const key = rotations.map(keyOf).sort()[0];
    let u = byKey.get(key);
    if (!u) {
      u = { id: String.fromCharCode(65 + unique.length), desc, count: 0, w: xp.length, d: yp.length, cells: xp.cells * yp.cells };
      byKey.set(key, u);
      unique.push(u);
    }
    u.count++;
    // quarter turns (counter-clockwise) that take the unique build to this piece
    let quarter = 0;
    for (let t = u.desc; keyOf(t) !== keyOf(desc); t = turn(t)) quarter++;
    const x0 = xs.slice(0, i).reduce((s, q) => s + q.length, 0), y0 = ys.slice(0, j).reduce((s, q) => s + q.length, 0);
    pieces.push({ col: i, row: j, id: u.id, w: xp.length, d: yp.length, cx: -W / 2 + x0 + xp.length / 2, cy: -D / 2 + y0 + yp.length / 2, quarter });
  }));

  const boxUnits = drawer && inputs.drawer_h > 0 ? Math.floor((inputs.drawer_h - b - d.box_top - d.headroom) / 7 + 1e-9) : null;
  return {
    ...inputs, drawer, b, nx, ny, pad, dropped, W, D, H,
    grid: [p * nx, p * ny],
    split: [xs.length, ys.length], pieces, unique,
    magnetCount: inputs.bottom && inputs.magnets ? nx * ny * 4 : 0,
    boxUnits,
  };
}

export function makePiece(R, spec, env, u) {
  const o = spec.official, p = o.pitch, b = env.b, H = env.H;
  const [nx, ny, l, , f, , ...round] = u.desc;
  const hw = u.w / 2, hd = u.d / 2;

  // ---------- helpers ----------
  const onXY = (drawing, z) => drawing.sketchOnPlane("XY", [0, 0, z]);
  const rrect = (cx, cy, w, h, r) => primsToDrawing(R.draw, roundPolygon([
    [cx - w / 2, cy - h / 2, r], [cx + w / 2, cy - h / 2, r], [cx + w / 2, cy + h / 2, r], [cx - w / 2, cy + h / 2, r]]));
  // replicad's fuse/cut end with UnifySameDomain, which can throw after a successful boolean: fall back to the raw one
  const rawBool = (cls, a, c) => {
    const bld = new (R.getOC()[cls])(a.wrapped, c.wrapped);
    bld.Build();
    const s = R.cast(bld.Shape());
    bld.delete();
    return s;
  };
  const cut = (a, c) => { try { return a.cut(c); } catch { return rawBool("BRepAlgoAPI_Cut", a, c); } };
  const step = (label, fn) => {
    try {
      return fn();
    } catch (e) {
      throw new Error(`${label} failed (${e?.message || "geometry kernel exception"})`);
    }
  };

  const cells = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) cells.push([i, j, -hw + l + p / 2 + p * i, -hd + f + p / 2 + p * j]);

  // slab: outer corners of the whole plate keep r 4, corners on split lines are square so the pieces butt together
  const r = o.outer_r;
  const outline = primsToDrawing(R.draw, roundPolygon([
    [-hw, -hd, round[0] ? r : 0], [hw, -hd, round[1] ? r : 0], [hw, hd, round[2] ? r : 0], [-hw, hd, round[3] ? r : 0]]));
  let body = onXY(outline, 0).extrude(H);

  // pockets: ruled lofts through the official sections; without a bottom plate they cut through (start below z = 0).
  // Side neighbours touch along the ridge line, so cut in two checkerboard groups of disjoint tools.
  const secs = o.pocket.sections.map(([z, off], k) => [k === 0 && b === 0 ? -0.5 : z + b, off]);
  const pocket = (cx, cy) => {
    const sk = secs.map(([z, off]) => onXY(rrect(cx, cy, p - 2 * off, p - 2 * off, r - off), z));
    return sk[0].loftWith(sk.slice(1), { ruled: true });
  };
  for (const par of [0, 1]) {
    const tools = cells.filter(([i, j]) => (i + j) % 2 === par).map(([, , cx, cy]) => pocket(cx, cy));
    if (tools.length) body = step("pockets", () => cut(body, R.makeCompound(tools)));
  }
  if (b > 0 && env.magnets) {
    const m = o.magnet, holes = [];
    for (const [, , cx, cy] of cells)
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
        holes.push(R.drawCircle(m.d / 2).translate(cx + sx * m.offset, cy + sy * m.offset).sketchOnPlane("XY", [0, 0, b - m.depth]).extrude(m.depth + 0.1));
    body = step("magnet holes", () => cut(body, R.makeCompound(holes)));
  }
  return body;
}

// border sides as literal keys of src/strings.js (they translate the names of env.pad)
export const SIDES = { left: "plate.left", right: "plate.right", front: "plate.front", back: "plate.back" };

// title: the model title in the sheet's language; t: translator of src/strings.js (site/shared/i18n.js)
export function plateBuildSheet(env, tag, title, t) {
  const sides = Object.entries(env.pad).filter(([, v]) => v > 0).map(([k, v]) => `${t(SIDES[k])} ${t.num(v, 1)}`);
  const list = sides.join(", ") || t("common.none"), boxUnits = Math.max(0, env.boxUnits ?? 0);
  const lines = [
    `# ${title} ${tag}`,
    "",
    env.drawer ? `- ${t("sheet.plateDrawer", { w: env.width, d: env.depth, c: env.clearance })}` : null,
    `- ${env.b ? t("sheet.platePlateBottom", { w: env.W, d: env.D, h: env.H, b: env.b }) : t("sheet.platePlate", { w: env.W, d: env.D, h: env.H })}`,
    `- ${t("sheet.plateGrid", { nx: env.nx, ny: env.ny, w: env.grid[0], d: env.grid[1] })}`,
    env.drawer ? `- ${env.dropped > 0.005 ? t("sheet.plateStripsDropped", { list, d: env.dropped }) : t("sheet.plateStrips", { list })}` : null,
    `- ${env.magnetCount ? t("sheet.magnets", { n: env.magnetCount }) : env.b ? t("sheet.noMagnets") : t("sheet.plateOpen")}`,
    env.boxUnits !== null ? `- ${t("sheet.plateDrawerH", { h: env.drawer_h, n: boxUnits, bh: 7 * boxUnits + 3.55 })}` : null,
    "",
    `## ${t("sheet.platePiecesHead")}`,
    "",
    env.pieces.length === 1 ? t("sheet.plateOnePiece") : t("sheet.plateManyPieces", { n: env.pieces.length }),
    "",
    ...env.unique.map((u) => {
      const v = { id: u.id, count: u.count, w: u.w, d: u.d, cx: u.desc[0], cy: u.desc[1] };
      return `- ${u.count > 1 ? t("sheet.platePieceCount", v) : t("sheet.platePiece", v)}`;
    }),
    "",
    ...(env.pieces.length > 1 ? layoutRows(env).map((row) => `    ${row}`).concat([""]) : []),
    `## ${t("sheet.printing")}`,
    "",
    `- ${t("sheet.platePrint")}`,
    env.pieces.length > 1 ? `- ${t("sheet.plateTurn")}` : null,
  ];
  return lines.filter((l) => l !== null).join("\n") + "\n";
}

// piece letters as a grid, back row first
function layoutRows(env) {
  const rows = [];
  for (let j = env.split[1] - 1; j >= 0; j--) rows.push(env.pieces.filter((q) => q.row === j).sort((a, c) => a.col - c.col).map((q) => q.id).join(" "));
  return rows;
}
