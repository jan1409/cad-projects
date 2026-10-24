// Gridfinity box (bin) geometry with replicad (OpenCascade WASM). Spec: Gridfinity/spec/bin_params.json - official
// Gridfinity dimensions (feet, outline, stacking lip, magnet holes) plus the Onshape design's wall, floor, label ledge,
// label plate and scoop. Frame: centred in X/Y, z = 0 under the feet; the label sits on the +Y wall and runs along X.
import { polygonDrawing, primsToDrawing, roundPolygon } from "./geom2d.js";

const C = Math.SQRT1_2;
const rad = (deg) => (deg * Math.PI) / 180;

// all derived dimensions; shared by the geometry, the datasheet and the build sheet
export function binEnv(spec, inputs) {
  const o = spec.official, d = spec.design, lip = o.lip;
  const nx = inputs.x_count, ny = inputs.y_count, nz = inputs.z_count;
  const label = inputs.variant === "label";
  const W = o.pitch * nx - 2 * o.clearance, D = o.pitch * ny - 2 * o.clearance, T = o.height_unit * nz;
  // the r 0.6 round between the outer face and the 45 deg lip face lowers the apex by r / tan(22.5 deg) - r
  const top = T + lip.height - lip.top_r / Math.tan(Math.PI / 8) + lip.top_r;
  const supportLow = T - d.lip_support - (lip.depth - d.wall) / Math.tan(rad(d.support_angle)); // inner wall starts leaning in
  const scoopR = label ? Math.min(d.scoop.r, T - d.floor_top - d.lip_support - 0.5) : 0;
  const L = d.label, gap = inputs.plate_gap ?? 0;
  const plate = label ? [W - 2 * lip.depth - 2 * gap, L.depth - (lip.depth - d.wall) - 2 * gap, L.plate_t] : null;
  return {
    ...inputs, label, W, D, T, top, supportLow, scoopR, plate,
    floor: d.floor_top, wall: d.wall,
    inner: [W - 2 * d.wall, D - 2 * d.wall],
    opening: [W - 2 * lip.depth, D - 2 * lip.depth],
    depth: T - d.floor_top,
    capacity: ((W - 2 * d.wall) * (D - 2 * d.wall) * (T - d.floor_top)) / 1e6, // litres, gross
  };
}

export function makeBin(R, spec, inputs) {
  const env = binEnv(spec, inputs);
  const o = spec.official, d = spec.design, lip = o.lip;
  const { W, D, T } = env;
  const hw = W / 2, hd = D / 2, bridge = d.bridge_z;

  // ---------- helpers ----------
  const onXY = (drawing, z) => drawing.sketchOnPlane("XY", [0, 0, z]);
  const rrect = (cx, cy, w, h, r) => primsToDrawing(R.draw, roundPolygon([
    [cx - w / 2, cy - h / 2, r], [cx + w / 2, cy - h / 2, r], [cx + w / 2, cy + h / 2, r], [cx - w / 2, cy + h / 2, r]]));
  const outline = (inset, z0, z1) => onXY(rrect(0, 0, W - 2 * inset, D - 2 * inset, o.corner_r - inset), z0).extrude(z1 - z0);
  // (y, z) polygon extruded along X over the whole box width (clipped to the outline afterwards)
  const prismX = (pts) => polygonDrawing(R.draw, pts).sketchOnPlane("YZ", [-hw - 1, 0, 0]).extrude(W + 2);

  // replicad's fuse/cut end with UnifySameDomain, which can throw after a successful boolean: fall back to the raw one
  const rawBool = (cls, a, b) => {
    const bld = new (R.getOC()[cls])(a.wrapped, b.wrapped);
    bld.Build();
    const s = R.cast(bld.Shape());
    bld.delete();
    return s;
  };
  const fuse = (a, b) => { try { return a.fuse(b); } catch { return rawBool("BRepAlgoAPI_Fuse", a, b); } };
  const cut = (a, b) => { try { return a.cut(b); } catch { return rawBool("BRepAlgoAPI_Cut", a, b); } };
  const common = (a, b) => { try { return a.intersect(b); } catch { return rawBool("BRepAlgoAPI_Common", a, b); } };
  const step = (label, fn) => {
    try {
      return fn();
    } catch (e) {
      throw new Error(`${label} failed (${e?.message || "geometry kernel exception"})`);
    }
  };

  const cells = [];
  for (let i = 0; i < env.x_count; i++)
    for (let j = 0; j < env.y_count; j++) cells.push([-hw - o.clearance + 21 + 42 * i, -hd - o.clearance + 21 + 42 * j]);

  // ---------- box ----------
  function box() {
    // wall + stacking lip: one (s inward, z) profile swept along the outline; the lip apex gets the r 0.6 round.
    // Wall and floor start at the bridge height (5.0), above the baseplate ridges; the feet reach up to it.
    const wallProfile = [
      [0, bridge, 0],
      [0, T + lip.height, lip.top_r],
      [lip.depth - lip.inner, T + lip.inner + lip.vertical, 0],
      [lip.depth - lip.inner, T + lip.inner, 0],
      [lip.depth, T, 0],
      [lip.depth, T - d.lip_support, 0],
      [d.wall, env.supportLow, 0],
      [d.wall, bridge, 0],
    ];
    const wall = step("wall", () => {
      const r = o.corner_r;
      const spine = R.draw([0, hd])
        .lineTo([-hw + r, hd]).threePointsArcTo([-hw, hd - r], [-hw + r - r * C, hd - r + r * C])
        .lineTo([-hw, -hd + r]).threePointsArcTo([-hw + r, -hd], [-hw + r - r * C, -hd + r - r * C])
        .lineTo([hw - r, -hd]).threePointsArcTo([hw, -hd + r], [hw - r + r * C, -hd + r - r * C])
        .lineTo([hw, hd - r]).threePointsArcTo([hw - r, hd], [hw - r + r * C, hd - r + r * C])
        .close().sketchOnPlane("XY").wire;
      const prof = polygonDrawing(R.draw, wallProfile.map(([s, z, rr]) => [hd - s, z, rr])).sketchOnPlane("YZ").wire;
      return R.genericSweep(prof, spine, { frenet: true });
    });
    // floor slab, inset 0.6 so it overlaps the wall instead of sharing its outer face
    let body = step("floor", () => fuse(wall, outline(0.6, bridge, d.floor_top)));

    // feet: ruled lofts through the official sections, vertical up to the bridge, then 0.75 up into the floor slab;
    // disjoint, so one compound
    const feet = cells.map(([cx, cy]) => {
      const sections = [...o.foot.sections, [bridge, o.foot.sections.at(-1)[1]], [bridge + 0.75, 1.0]];
      const sk = sections.map(([z, off]) => onXY(rrect(cx, cy, 42 - 2 * off, 42 - 2 * off, 4 - off), z));
      return sk[0].loftWith(sk.slice(1), { ruled: true });
    });
    body = step("feet", () => fuse(body, R.makeCompound(feet)));

    if (env.label) {
      // label ledge on the +Y inner wall, along X; pocket top at T - plate_t, back face = lip support plane
      const L = d.label, yWall = hd - d.wall, yFront = yWall - L.depth, zt = T - L.plate_t, zb = zt - L.front;
      const slope = Math.tan(rad(90 - L.support_angle)), yIn = hd - 0.6;
      const ledge = prismX([
        [yFront, zt, 0], [hd - lip.depth, zt, 0], [hd - lip.depth, T - d.lip_support, 0], [yIn, T - d.lip_support, 0],
        [yIn, zb - (yIn - yFront) * slope, 0], [yFront, zb, 0]]);
      body = step("label ledge", () => fuse(body, common(ledge, outline(0, o.foot.height, T))));
    }
    if (env.scoopR >= 3) {
      // scoop: concave quarter round between the floor and the -Y inner wall, across the whole width
      const y0 = -hd + d.wall, r = env.scoopR, z0 = d.floor_top;
      const scoop = R.draw([y0 - 0.6, z0 - 0.5]).lineTo([y0 + r, z0 - 0.5]).lineTo([y0 + r, z0])
        .threePointsArcTo([y0, z0 + r], [y0 + r - r * C, z0 + r - r * C]).lineTo([y0 - 0.6, z0 + r]).close()
        .sketchOnPlane("YZ", [-hw - 1, 0, 0]).extrude(W + 2);
      body = step("scoop", () => fuse(body, common(scoop, outline(0, o.foot.height, T))));
    }
    if (env.magnets) {
      const m = o.magnet, holes = [];
      for (const [cx, cy] of cells)
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
          holes.push(R.drawCircle(m.d / 2).translate(cx + sx * m.offset, cy + sy * m.offset).sketchOnPlane("XY", [0, 0, -0.1]).extrude(m.depth + 0.1));
      body = step("magnet holes", () => cut(body, R.makeCompound(holes)));
    }
    return body;
  }

  // ---------- label plate (in place: in the pocket between ledge and lip, flush with the wall top) ----------
  function plate() {
    const [pl, pw, pt] = env.plate, yBack = hd - lip.depth - (inputs.plate_gap ?? 0);
    return onXY(rrect(0, yBack - pw / 2, pl, pw, 0), T - pt).extrude(pt);
  }

  return { env, box, plate: env.label ? plate : null };
}

// print orientation: the box prints as modelled; the plate lies flat on the bed
export function plateToPrint(shape, env) {
  return shape.clone().translate(0, 0, -(env.T - env.plate[2]));
}

// title: the model title in the sheet's language; rugged: the translated Rugged Case fit; t: translator of src/strings.js
export function binBuildSheet(env, tag, title, rugged, t) {
  const lines = [
    `# ${title} ${tag}`,
    "",
    `- ${t("sheet.boxOutside", { w: env.W, d: env.D, top: env.top, wall: env.T })}`,
    `- ${t("sheet.boxInside", { iw: env.inner[0], id: env.inner[1], depth: env.depth, ow: env.opening[0], od: env.opening[1] })}`,
    `- ${t("sheet.boxGrid", { x: env.x_count, y: env.y_count, z: env.z_count })}`,
    `- ${env.magnets ? t("sheet.magnets", { n: env.x_count * env.y_count * 4 }) : t("sheet.noMagnets")}`,
    env.label ? `- ${t("sheet.boxPlate", { a: env.plate[0], b: env.plate[1], c: env.plate[2] })}` : null,
    rugged ? `- ${t("sheet.boxRugged", { fit: rugged })}` : null,
    "",
    `## ${t("sheet.printing")}`,
    "",
    `- ${t("sheet.boxPrintBox")}`,
    env.label ? `- ${t("sheet.boxPrintPlate")}` : null,
  ];
  return lines.filter((l) => l !== null).join("\n") + "\n";
}
