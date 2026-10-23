// Gridfinity Rugged Case geometry with replicad (OpenCascade WASM). Port of Gridfinity/fusion/cad/_case.py and
// 10_base.py ... 50_window.py; the spec is Gridfinity/spec/case_params.json.
// Frame: z = 0 floor top, front (latches) = -Y; all lengths mm. R = the replicad module (browser CDN or npm).
import { caseEnv, profile } from "./expr.js";
import { polygonDrawing, roundPolygon, primsToDrawing } from "./geom2d.js";

const C = Math.SQRT1_2;

export function makeCase(R, spec, inputs) {
  const env = caseEnv(spec, inputs);
  const hl = env.Li / 2, hw = env.Wi / 2;
  const { split, top, hinge_x: xc } = env;

  // ---------- sketches ----------
  const onXY = (drawing, z) => drawing.sketchOnPlane("XY", [0, 0, z]);
  const rrect = (cx, cy, w, h, r) => primsToDrawing(R.draw, roundPolygon([
    [cx - w / 2, cy - h / 2, r], [cx + w / 2, cy - h / 2, r], [cx + w / 2, cy + h / 2, r], [cx - w / 2, cy + h / 2, r]]));
  const cellRect = (cx, cy, off) => rrect(cx, cy, 42 - 2 * off, 42 - 2 * off, 4 - off);
  const cells = [];
  for (let i = 0; i < env.x_count; i++)
    for (let j = 0; j < env.y_count; j++) cells.push([-hl + 21 + 42 * i, -hw + 21 + 42 * j]);
  const cavity = (z, grow = 0) => onXY(rrect(0, 0, env.Li + 2 * grow, env.Wi + 2 * grow, 4 + grow), z);

  // ruled loft through cell outlines [[z, offset], ...]: planes + cones, like Fusion's taper extrude
  const cellLoft = ([cx, cy], sections) => {
    const sk = sections.map(([z, off]) => onXY(cellRect(cx, cy, off), z));
    return sk[0].loftWith(sk.slice(1), { ruled: true });
  };
  const extrudeXY = (drawing, z0, z1) => onXY(drawing, z0).extrude(z1 - z0);

  // (s, z, r) polygon on the front (side -1) / back (+1) wall, extruded along X from x0 to x1
  const prismX = (side, pts, x0, x1) =>
    polygonDrawing(R.draw, pts.map(([s, z, r]) => [side * (hw + s), z, r])).sketchOnPlane("YZ", [x0, 0, 0]).extrude(x1 - x0);
  // (s, z, r) polygon on the +X (side +1) / -X (-1) end wall, extruded along Y from y0 to y1 (XZ normal is -Y)
  const prismY = (side, pts, y0, y1) =>
    polygonDrawing(R.draw, pts.map(([s, z, r]) => [side * (hl + s), z, r])).sketchOnPlane("XZ", [0, y1, 0]).extrude(y1 - y0);
  const cylX = (side, s, z, d, x0, x1) => R.drawCircle(d / 2).translate(side * (hw + s), z).sketchOnPlane("YZ", [x0, 0, 0]).extrude(x1 - x0);

  // sweep a (s, z, r) profile along the cavity outline (corner r 4); starts mid back edge heading -X
  const sweepWall = (pts) => {
    const r = 4;
    const spine = R.draw([0, hw])
      .lineTo([-hl + r, hw]).threePointsArcTo([-hl, hw - r], [-hl + r - r * C, hw - r + r * C])
      .lineTo([-hl, -hw + r]).threePointsArcTo([-hl + r, -hw], [-hl + r - r * C, -hw + r - r * C])
      .lineTo([hl - r, -hw]).threePointsArcTo([hl, -hw + r], [hl - r + r * C, -hw + r - r * C])
      .lineTo([hl, hw - r]).threePointsArcTo([hl - r, hw], [hl - r + r * C, hw - r + r * C])
      .close().sketchOnPlane("XY").wire;
    const prof = polygonDrawing(R.draw, pts.map(([s, z, rr]) => [hw + s, z, rr])).sketchOnPlane("YZ").wire;
    return R.genericSweep(prof, spine, { frenet: true });
  };

  // horizontal hole along X with a print flat (truncated teardrop), flat at distance r from the centre
  const teardropX = (side, s, z, d, x0, x1, flatUp) => {
    const y = side * (hw + s), r = d / 2, g = flatUp ? 1 : -1, k = r * (Math.SQRT2 - 1);
    const t1 = [y - r * C, z + g * r * C], t2 = [y + r * C, z + g * r * C];
    return R.draw(t1).lineTo([y - k, z + g * r]).lineTo([y + k, z + g * r]).lineTo(t2)
      .threePointsArcTo(t1, [y, z - g * r]).close().sketchOnPlane("YZ", [x0, 0, 0]).extrude(x1 - x0);
  };

  // replicad's fuse/cut always run UnifySameDomain (SimplifyResult) after the boolean, and that step can throw
  // although the boolean itself succeeded (e.g. wall + corner foot pad of a 3x3 case). Then fall back to the raw
  // OpenCascade boolean: same solid, only coplanar faces stay unmerged.
  const rawBool = (cls, a, b) => {
    const bld = new (R.getOC()[cls])(a.wrapped, b.wrapped);
    bld.Build();
    const s = R.cast(bld.Shape());
    bld.delete();
    return s;
  };
  const fuse = (a, b) => { try { return a.fuse(b); } catch { return rawBool("BRepAlgoAPI_Fuse", a, b); } };
  const cut = (a, b) => { try { return a.cut(b); } catch { return rawBool("BRepAlgoAPI_Cut", a, b); } };

  // OpenCascade booleans need non-self-interfering arguments: overlapping pieces must not share one compound.
  // fuseTree fuses pairwise (log2(n) levels); cut tools are grouped so that each group's tools are disjoint.
  const fuseTree = (shapes) => {
    let list = shapes;
    while (list.length > 1) {
      const next = [];
      for (let i = 0; i < list.length; i += 2) next.push(i + 1 < list.length ? fuse(list[i], list[i + 1]) : list[i]);
      list = next;
    }
    return list[0];
  };
  const compound = (shapes) => R.makeCompound(shapes);
  // OpenCascade throws bare WebAssembly exceptions: name the build stage so failures can be traced
  const step = (label, fn) => {
    try {
      return fn();
    } catch (e) {
      throw new Error(`${label} failed (${e?.message || "geometry kernel exception"})`);
    }
  };
  const cutGroups = (shape, groups) => groups.filter((g) => g.length).reduce((acc, g) => cut(acc, compound(g)), shape);
  const checker = (fn) => [0, 1].map((par) => cells.filter((_, k) => ((k % env.y_count) + Math.floor(k / env.y_count)) % 2 === par).map(fn));
  const tap = spec.hardware.hole_tap_d, clear = spec.hardware.hole_clearance_d;
  // module-relative x range [a, b] -> absolute, mirrored for the -hinge_x module
  const xr = (m, a, b) => (m > 0 ? [xc + a, xc + b] : [-xc - b, -xc - a]);

  // ---------- base ----------
  function base() {
    const STRIP = 4.26, BOSS = 11.26, under = spec.cells.foot_pad.underside_z;
    const strip = [[2.0, 2.0, 0], [STRIP, STRIP, 1], [STRIP, split, 0], [3.03, split, 0], [3.03, split - 2, 0], [2.0, split - 2, 0]];
    const ribPts = (c, topR) => {
      const tail = [[BOSS, BOSS + c, 3], [BOSS, split, topR], [3.03, split, 0], [3.03, split - 2, 0], [2.0, split - 2, 0]];
      const corner = STRIP + c;
      if (corner > STRIP) {
        const r = Math.min(1, (corner - STRIP) / (2 * Math.tan(Math.PI / 8)));
        return [[2.0, 2.0, 0], [STRIP, STRIP, r], [STRIP, corner, r], ...tail];
      }
      return [[2.0, 2.0, 0], [under, under, 0], [under - c, under, 0], ...tail]; // boss clipped at the underside plane (n = 4)
    };
    const parts = [sweepWall(profile(spec, "base_wall", env))];
    parts.push(extrudeXY(rrect(0, 0, env.Li, env.Wi, 4), under, 4.646));
    // foot pads; the vertical tail up to under + 0.5 lies inside material that is solid anyway (slab, wall) and turns
    // the face-only contact with the slab/wall into a volume overlap - OpenCascade failed on the touching version (3x3)
    for (const cell of cells) parts.push(cellLoft(cell, [[-3.2, 3.2], [under, -under], [under + 0.5, -under]]));
    for (const side of [1, -1])
      for (const [y0, y1] of [[hw - 23, hw - 18], [-(hw - 18), -(hw - 23)]]) parts.push(prismY(side, strip, y0, y1));
    const knuckle = [[2.4, split - 10.268, 0], [10.264, split - 2.404, 0], [7.86, split, 0], [3.03, split, 0], [3.03, split - 2, 0], [2.4, split - 2, 0]];
    for (const m of [1, -1]) {
      for (const [a, b] of [[-15, -11.8], [11.8, 15]]) {
        const [x0, x1] = xr(m, a, b);
        parts.push(prismX(-1, ribPts(split - 28.26, 5), x0, x1));
        parts.push(prismX(1, ribPts(split - 16.26, 0), x0, x1));
      }
      for (const [a, b] of [[-15, -8.8], [8.8, 15]]) {
        const [x0, x1] = xr(m, a, b);
        parts.push(prismX(1, knuckle, x0, x1), cylX(1, 7.86, split, 6.8, x0, x1));
      }
    }
    let shape = step("base: joining the parts", () => fuseTree(parts));
    // baseplate pockets (one ruled loft per cell); also trims the pad tops. Side neighbours touch along the
    // ridge line, so cut in two checkerboard groups.
    const fp = spec.cells.floor_pocket;
    const secs = fp.map((p) => [Number(p.z), Number(p.t)]).reverse(); // bottom up: (0, 2.846) ... (4.646, 0)
    shape = step("base: floor pockets", () => cutGroups(shape, checker((c) => cellLoft(c, secs))));
    // holes: towards the case centre 2.85 (M3 tap), at the case end 3.4; print flat on top
    const holes = [];
    for (const m of [1, -1]) {
      const centre = m > 0 ? [xc - 15, xc - 11.8] : [-xc + 11.8, -xc + 15];
      const end = m > 0 ? [xc + 11.8, xc + 15] : [-xc - 15, -xc - 11.8];
      const kCentre = m > 0 ? [xc - 15, xc - 8.8] : [-xc + 8.8, -xc + 15];
      const kEnd = m > 0 ? [xc + 8.8, xc + 15] : [-xc - 15, -xc - 8.8];
      for (const [[x0, x1], d] of [[centre, tap], [end, clear]]) holes.push(teardropX(-1, 6.76, split - 8, d, x0 - 0.5, x1 + 0.5, true));
      for (const [[x0, x1], d] of [[kCentre, tap], [kEnd, clear]]) holes.push(teardropX(1, 7.86, split, d, x0 - 0.5, x1 + 0.5, true));
    }
    return step("base: screw holes", () => cut(shape, compound(holes)));
  }

  // ---------- lid ----------
  function lid() {
    const { seat } = env;
    const parts = [sweepWall(profile(spec, "lid_wall", env))];
    parts.push(extrudeXY(rrect(0, 0, env.Li, env.Wi, 4), top - 4, seat));
    for (const cell of cells) parts.push(cellLoft(cell, [[top - 5.5, 2.35], [top - 4, 0.85]]));
    parts.push(extrudeXY(rrect(0, 0, env.Li - 1, env.Wi - 1, 3.5), top - 1.2, top)); // ends inside the wall sweep
    const endRib = [[1.0, split, 0], [4.26, split, 0], [4.26, top - 2.635, 1], [1.625, top, 1], [-0.5, top, 0], [0.5, top - 1.0, 0]];
    for (const side of [1, -1])
      for (const [y0, y1] of [[hw - 23, hw - 18], [-(hw - 18), -(hw - 23)]]) parts.push(prismY(side, endRib, y0, y1));
    const frontRib = [[2.0, split, 0], [11.26, split, 5], [11.26, top - 4.8, 3], [6.46, top, 1], [-0.5, top, 0]];
    const knuckle = [[2.4, split, 0], [7.86, split, 0], [10.264, split + 2.404, 0], [2.4, split + 10.268, 0]];
    const centreRib = [[1.0, split + 1, 0], [7.86, split + 1, 0], [10.264, split + 2.404, 0], [4.26, split + 8.408, 1],
      [4.26, top - 2.635, 1], [1.625, top, 1], [-0.5, top, 0], [1.0, top - 1.5, 0]];
    for (const m of [1, -1]) {
      const c = m * xc;
      for (const [a, b] of [[-15, -11.8], [11.8, 15]]) parts.push(prismX(-1, frontRib, c + a, c + b));
      parts.push(prismX(1, knuckle, c - 8.675, c + 8.675), cylX(1, 7.86, split, 6.8, c - 8.675, c + 8.675));
      parts.push(prismX(1, centreRib, c - 1.6, c + 1.6));
    }
    let shape = step("lid: joining the parts", () => fuseTree(parts));
    // cut groups with disjoint tools: the window pocket touches the frame and top openings face to face
    const below = cells.map(([cx, cy]) => extrudeXY(cellRect(cx, cy, 3.15), top - 5.5, seat)); // frame openings 35.7 r 0.85
    const lead = [[-1.0, split - 0.5, 0], [0.625, split - 0.5, 0], [0.0, split + 2, 0], [-1.0, split + 2, 0]];
    below.push(prismX(-1, lead, -(hl - 4), hl - 4)); // front lead-in (not faded over the corner arcs)
    for (const m of [1, -1]) {
      const centre = m > 0 ? [xc - 15, xc - 11.8] : [-xc + 11.8, -xc + 15];
      const end = m > 0 ? [xc + 11.8, xc + 15] : [-xc - 15, -xc - 11.8];
      for (const [[x0, x1], d] of [[centre, tap], [end, clear]]) below.push(teardropX(-1, 6.76, split + 8, d, x0 - 0.5, x1 + 0.5, false));
      below.push(teardropX(1, 7.86, split, clear, m * xc - 9.2, m * xc + 9.2, false));
    }
    const above = cells.map((c) => cellLoft(c, [[top - 1.2, 3.009], [top, 1.809]])); // top openings, 45 deg
    const pocket = [extrudeXY(rrect(0, 0, env.Li - 3, env.Wi - 3, 0.2), seat, top - 1.2)]; // window pocket
    shape = step("lid: openings and window pocket", () => cutGroups(shape, [below, above, pocket]));
    // r 1 on the straight top side edges of the ribs. OpenCascade's fillet always follows tangent edge chains
    // (around the rib profile and down the lid's own edge round) and fails there, while the reference rounds only
    // the straight segment - so the rounding is cut explicitly: r 1 corner profile along each edge, from where the
    // rib starts to protrude to the tangent point of its profile round. The tools start at s = +0.05 rather than on the
    // lid's top-fillet tangent (s = -0.006): ending exactly there leaves sliver faces and a non-watertight STL.
    const roundStart = 0.05;
    const roundTool = (along, u0, d, a0, a1) => {
      const pen = R.draw([u0, top + 0.01]).lineTo([u0 + d, top + 0.01]).lineTo([u0 + d, top])
        .threePointsArcTo([u0, top - 1], [u0 + d * (1 - C), top - (1 - C)]).close();
      return along === "Y"
        ? pen.sketchOnPlane("XZ", [0, a1, 0]).extrude(a1 - a0) // XZ normal is -Y
        : pen.sketchOnPlane("YZ", [a0, 0, 0]).extrude(a1 - a0);
    };
    const rounds = [];
    for (const m of [1, -1]) {
      const c = m * xc;
      for (const [a, b] of [[-15, -11.8], [11.8, 15]]) // pivot ribs (front), flat top s -0.006 .. 6.046
        rounds.push(roundTool("Y", c + a, 1, -(hw + 6.046), -(hw + roundStart)), roundTool("Y", c + b, -1, -(hw + 6.046), -(hw + roundStart)));
      rounds.push(roundTool("Y", c - 1.6, 1, hw + roundStart, hw + 1.211), roundTool("Y", c + 1.6, -1, hw + roundStart, hw + 1.211)); // centre ribs
    }
    for (const side of [1, -1]) { // end ribs, flat top s -0.006 .. 1.211
      const [x0, x1] = side > 0 ? [hl + roundStart, hl + 1.211] : [-(hl + 1.211), -(hl + roundStart)];
      for (const g of [1, -1]) {
        const lo = g * (hw - 23), hi = g * (hw - 18);
        const [ya, yb] = g > 0 ? [lo, hi] : [hi, lo];
        rounds.push(roundTool("X", ya, 1, x0, x1), roundTool("X", yb, -1, x0, x1));
      }
    }
    return step("lid: rib edge rounds", () => cut(shape, compound(rounds)));
  }

  // ---------- latch, seal, window ----------
  function latch() {
    const map = ([y, z]) => [y + 35 - hw, z - 30 + split]; // Rugged Box Sketch 10 frame -> case (front side)
    const on = ([cy, cz], r, deg) => [cy + r * Math.cos((deg * Math.PI) / 180), cz + r * Math.sin((deg * Math.PI) / 180)];
    const CT = [-41.76, 38.0], CB = [-41.76, 22.0], CA = [-23.131, 30.0], CTAB = [-44.933, 12.517];
    const Q = [[-44.423, 35.015], [-41.367, 34.019], [-41.367, 25.981], [-41.749, 23.6], [-40.761, 20.75], [-37.96, 20.75],
      [-41.406, 18.016], [-43.416, 12.009], [-46.45, 13.024], [-44.441, 19.031], [-44.423, 24.985]];
    const prims = [
      { type: "arc", a: Q[0], m: on(CT, 4.0, 71.95), b: Q[1] }, // top boss over the top
      { type: "arc", a: Q[1], m: [CA[0] - 18.674, 30.0], b: Q[2] }, // inner arm
      { type: "line", a: Q[2], b: Q[3] },
      { type: "arc", a: Q[3], m: on(CB, 1.6, 199.1), b: Q[4] }, // hook: lower hole, open towards the wall
      { type: "line", a: Q[4], b: Q[5] },
      { type: "arc", a: Q[5], m: on(CB, 4.0, 308.45), b: Q[6] }, // lower boss, outer bottom
      { type: "line", a: Q[6], b: Q[7] }, // tab
      { type: "arc", a: Q[7], m: on(CTAB, 1.6, -108.5), b: Q[8] }, // tab end
      { type: "line", a: Q[8], b: Q[9] },
      { type: "arc", a: Q[9], m: on(CB, 4.0, 179.8), b: Q[10] }, // lower boss, wall side
      { type: "arc", a: Q[10], m: [CA[0] - 21.874, 30.0], b: Q[0] }, // outer arm
    ].map((p) => ({ ...p, a: map(p.a), b: map(p.b), ...(p.m ? { m: map(p.m) } : {}) }));
    const width = spec.hardware.latch_front.latch_part.width;
    const x0 = xc - width / 2;
    const body = primsToDrawing(R.draw, prims).sketchOnPlane("YZ", [x0, 0, 0]).extrude(width);
    const [hy, hz] = map(CT);
    const hole = R.drawCircle(1.6).translate(hy, hz).sketchOnPlane("YZ", [x0 - 1, 0, 0]).extrude(width + 2);
    return cut(body, hole);
  }

  const seal = () => sweepWall(profile(spec, "seal", env));
  const window_ = () => extrudeXY(rrect(0, 0, env.Li - 4, env.Wi - 4, 0.2), top - 1.2 - env.window_t, top - 1.2);

  return { env, base, lid, latch, seal, window: window_ };
}

// Print orientation (same as Gridfinity/fusion/print_export.py): rotation [axis, deg] then drop onto z = 0, centred.
export const PRINT = {
  Base: { file: "Base", qty: 1, rot: null, note: "feet down, no supports" },
  Lid: { file: "Lid", qty: 1, rot: [[1, 0, 0], 180], note: "upside down (top on the bed); pause for the window" },
  Latch: { file: "Latch_x2", qty: 2, rot: [[0, 1, 0], 90], note: "on its side, holes vertical" },
  Seal: { file: "Seal_TPU", qty: 1, rot: null, note: "flat, TPU" },
};

export function toPrint(shape, part) {
  const p = PRINT[part];
  // replicad's rotate/translate consume their input: work on a clone so the assembled shape stays usable
  let s = p.rot ? shape.clone().rotate(p.rot[1], [0, 0, 0], p.rot[0]) : shape.clone();
  const [[x0, y0, z0], [x1, y1]] = s.boundingBox.bounds;
  return s.translate([-(x0 + x1) / 2, -(y0 + y1) / 2, -z0]);
}

export function windowSVG(env) {
  const w = env.Li - 4, h = env.Wi - 4, r = 0.2, m = 1;
  const x0 = m, y0 = m, x1 = m + w, y1 = m + h, f = (v) => v.toFixed(3);
  const d = `M ${f(x0 + r)} ${f(y0)} H ${f(x1 - r)} A ${r} ${r} 0 0 1 ${f(x1)} ${f(y0 + r)} V ${f(y1 - r)} ` +
    `A ${r} ${r} 0 0 1 ${f(x1 - r)} ${f(y1)} H ${f(x0 + r)} A ${r} ${r} 0 0 1 ${f(x0)} ${f(y1 - r)} V ${f(y0 + r)} ` +
    `A ${r} ${r} 0 0 1 ${f(x0 + r)} ${f(y0)} Z`;
  const W = w + 2 * m, H = h + 2 * m;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" viewBox="0 0 ${f(W)} ${f(H)}">\n` +
    `  <title>Gridfinity Rugged Case window ${w.toFixed(1)} x ${h.toFixed(1)} mm, r ${r}</title>\n` +
    `  <path d="${d}" fill="none" stroke="#ff0000" stroke-width="0.1"/>\n</svg>\n`;
}

export function buildSheet(env, tag, sizes) {
  const pause = 1.2 + env.window_t + env.window_gap;
  const rows = Object.entries(PRINT).map(([part, p]) => {
    const s = sizes[part];
    return `| Gridfinity_Rugged_Case_${tag}_${p.file}.stl | ${p.qty} | ${s.map((v) => v.toFixed(1)).join(" x ")} | ${p.note} |`;
  });
  return [
    `# Gridfinity Rugged Case ${tag} - build sheet`, "",
    `Inner space ${env.Li} x ${env.Wi} mm (${env.x_count} x ${env.y_count} Gridfinity cells), ${env.z_count} height units. ` +
    `Outside ${(env.Li + 8.52).toFixed(1)} x ${(env.Wi + 22.52).toFixed(1)} mm.`, "",
    "| File | Qty | Size mm (print orientation) | Orientation |", "|---|---|---|---|", ...rows,
    `| Gridfinity_Rugged_Case_${tag}_Window_${env.window_t.toFixed(2)}mm.svg | 1 | ${(env.Li - 4).toFixed(1)} x ${(env.Wi - 4).toFixed(1)} x ${env.window_t.toFixed(2)} | laser-cut plexiglass, cut on the red line |`,
    "", "## Window insert (print pause)",
    `The lid prints upside down. Add a pause (M601 / 'Add pause' in PrusaSlicer) before the first layer that starts at or above **${pause.toFixed(2)} mm**,`,
    `i.e. when the top ribs and the open window pocket (${(env.window_t + env.window_gap).toFixed(2)} mm deep = ${env.window_t.toFixed(2)} plexiglass + ${env.window_gap.toFixed(2)} gap) are finished.`,
    `Drop the plexiglass in (protective film off) and resume: the next layers bridge ${env.window_gap.toFixed(2)} mm above it and lock it in.`,
    "", "## Hardware",
    "- 6 x M3 x 30 screws: 2 hinge pins (back), 2 latch pivots (lid, front), 2 latch catches (base, front).",
    "  The screw goes in through the 3.4 mm hole at the case end and threads into the 2.85 mm hole towards the centre.",
    "- Seal in TPU, pressed into the groove on the base rim.", "",
  ].join("\n");
}
