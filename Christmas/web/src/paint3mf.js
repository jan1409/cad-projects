// Painted 3MF for Bambu Studio, OrcaSlicer and PrusaSlicer, without a geometry kernel (page, worker and Node).
// A mesh is welded, split at horizontal planes so that no triangle crosses a colour boundary, and each triangle gets a
// paint state: 0 = the object's filament (no attribute), n = filament n. A whole (unsplit) triangle is stored as the
// slicers' TriangleSelector code: 1 -> "4", 2 -> "8", 3 -> "0C", 4 -> "1C" ... 16 -> "DC" (uppercase hex).
// Flavours (from the slicers' 3MF readers; see Christmas/spec/tree_spec.md):
//   bambu, orca  paint_color on each triangle; no Application metadata, so both treat the file as a generic 3MF,
//                read the paint and add the filament slots it needs
//   prusa        slic3rpe:mmu_segmentation plus slic3rpe:Version3mf / MmPaintingVersion (also read by 3.0's old loader),
//                and paint_color too, so the file keeps its paint when opened in Bambu Studio or OrcaSlicer
// PrusaSlicer reads paint_color when slic3rpe:mmu_segmentation is missing (2.7.4 and later), so the bambu/orca file
// also works there; the bambu and orca files are the same, only the name and the build sheet differ.
// No Metadata/ folder: a partial slicer config would replace the user's printer and filament presets.

export const FLAVOURS = {
  bambu: { attrs: ["paint_color"], ns: "", meta: [] },
  orca: { attrs: ["paint_color"], ns: "", meta: [] },
  prusa: {
    attrs: ["slic3rpe:mmu_segmentation", "paint_color"],
    ns: ' xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06"',
    meta: [["slic3rpe:Version3mf", "1"], ["slic3rpe:MmPaintingVersion", "1"]],
  },
};

export function paintCode(state) {
  if (!state) return "";
  if (state < 3) return (state << 2).toString(16).toUpperCase();
  if (state > 16) throw new Error(`paint state ${state} > 16`);
  return (state - 3).toString(16).toUpperCase() + "C";
}

// positions (flat xyz) + triangles (flat indices, per-face vertices as replicad meshes them) -> welded mesh with
// shared vertices: {pos: number[], tri: number[]}; degenerate triangles dropped
export function weld(positions, triangles, quantum = 1e-6) {
  const map = new Map(), pos = [], remap = new Int32Array(positions.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
    const key = `${Math.round(x / quantum)},${Math.round(y / quantum)},${Math.round(z / quantum)}`;
    let j = map.get(key);
    if (j === undefined) { j = pos.length / 3; map.set(key, j); pos.push(x, y, z); }
    remap[i] = j;
  }
  const tri = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const a = remap[triangles[i]], b = remap[triangles[i + 1]], c = remap[triangles[i + 2]];
    if (a !== b && b !== c && a !== c) tri.push(a, b, c);
  }
  return { pos, tri };
}

// split every triangle that crosses one of the planes z = zs[i]; new vertices on an edge are shared by both triangles
// of that edge, so a watertight mesh stays watertight. Vertices within snap of a plane are moved onto it first
// (no slivers). Returns a new {pos, tri}.
export function splitAtZ(mesh, zs, snap = 1e-4) {
  let pos = mesh.pos.slice(), tri = mesh.tri.slice();
  for (const z0 of zs) {
    for (let i = 2; i < pos.length; i += 3) if (Math.abs(pos[i] - z0) < snap) pos[i] = z0;
    const cache = new Map(), out = [];
    const cut = (a, b) => { // vertex where edge a-b meets the plane
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      let j = cache.get(key);
      if (j === undefined) {
        const za = pos[3 * a + 2], zb = pos[3 * b + 2], f = (z0 - za) / (zb - za);
        j = pos.length / 3;
        pos.push(pos[3 * a] + f * (pos[3 * b] - pos[3 * a]), pos[3 * a + 1] + f * (pos[3 * b + 1] - pos[3 * a + 1]), z0);
        cache.set(key, j);
      }
      return j;
    };
    for (let i = 0; i < tri.length; i += 3) {
      const v = [tri[i], tri[i + 1], tri[i + 2]], d = v.map((k) => Math.sign(pos[3 * k + 2] - z0));
      if (!(d.includes(1) && d.includes(-1))) { out.push(...v); continue; }
      // rotate so that v[0] is the vertex alone on its side (or the one on the plane)
      let r = d.indexOf(0);
      if (r < 0) r = d.findIndex((s, k) => s !== d[(k + 1) % 3] && s !== d[(k + 2) % 3]);
      const [A, B, C] = [v[r], v[(r + 1) % 3], v[(r + 2) % 3]];
      if (d[r] === 0) { // A on the plane, B and C on opposite sides
        const M = cut(B, C);
        out.push(A, B, M, A, M, C);
      } else { // A alone; B and C on the other side
        const P = cut(A, B), Q = cut(A, C);
        out.push(A, P, Q, P, B, C, P, C, Q);
      }
    }
    tri = out;
  }
  return { pos, tri };
}

// paint state per triangle: `state` where the triangle bounds material inside one of the [z0, z1] intervals, else 0.
// The test point is the centroid moved a hair into the material (against the normal): a flat face lying on a boundary,
// like the bottom face on z = 0, takes the colour of the material it closes (the slicers colour the bottom layers
// from it).
export function statesByZ(mesh, intervals, state = 2) {
  const { pos, tri } = mesh, states = new Uint8Array(tri.length / 3);
  for (let i = 0; i < states.length; i++) {
    const [a, b, c] = [tri[3 * i], tri[3 * i + 1], tri[3 * i + 2]];
    const ux = pos[3 * b] - pos[3 * a], uy = pos[3 * b + 1] - pos[3 * a + 1], uz = pos[3 * b + 2] - pos[3 * a + 2];
    const vx = pos[3 * c] - pos[3 * a], vy = pos[3 * c + 1] - pos[3 * a + 1], vz = pos[3 * c + 2] - pos[3 * a + 2];
    const nz = ux * vy - uy * vx, len = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, nz) || 1;
    const zc = (pos[3 * a + 2] + pos[3 * b + 2] + pos[3 * c + 2]) / 3 - (nz / len) * 1e-6;
    if (intervals.some(([z0, z1]) => zc > z0 && zc < z1)) states[i] = state;
  }
  return states;
}

// checks used by the Node tools and the tests: edges not shared by exactly one opposite pair, signed volume (mm³),
// triangles crossing a plane, bounding box
export function meshStats(mesh, zs = []) {
  const { pos, tri } = mesh, edges = new Map();
  let vol = 0, crossing = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], pos[i]); hi[i % 3] = Math.max(hi[i % 3], pos[i]); }
  for (let i = 0; i < tri.length; i += 3) {
    const [a, b, c] = [tri[i], tri[i + 1], tri[i + 2]];
    for (const [u, w] of [[a, b], [b, c], [c, a]]) {
      const key = u < w ? `${u},${w}` : `${w},${u}`;
      edges.set(key, (edges.get(key) ?? 0) + (u < w ? 1 : 1000));
    }
    const ax = pos[3 * a], ay = pos[3 * a + 1], az = pos[3 * a + 2], bx = pos[3 * b], by = pos[3 * b + 1], bz = pos[3 * b + 2];
    const cx = pos[3 * c], cy = pos[3 * c + 1], cz = pos[3 * c + 2];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    for (const z0 of zs) if (Math.min(az, bz, cz) < z0 - 1e-9 && Math.max(az, bz, cz) > z0 + 1e-9) crossing++;
  }
  let open = 0;
  for (const n of edges.values()) if (n !== 1001) open++;
  return { triangles: tri.length / 3, vertices: pos.length / 3, open, volume: vol, crossing, bbox: [lo, hi] };
}

const num = (v) => {
  const s = (Math.round(v * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
};
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`;
const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

// the 3MF's files as {path: Uint8Array}, to be zipped by the caller (fflate zipSync); states: paint state per
// triangle (or null), flavour: bambu | orca | prusa
export function threemfEntries({ mesh, states = null, name = "Model", flavour = "bambu" }) {
  const F = FLAVOURS[flavour];
  if (!F) throw new Error(`unknown 3MF flavour "${flavour}"`);
  const { pos, tri } = mesh, out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>',
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"${F.ns}>`);
  for (const [k, v] of F.meta) out.push(` <metadata name="${k}">${v}</metadata>`);
  out.push(" <resources>", `  <object id="1" type="model" name="${xmlEsc(name)}">`, "   <mesh>", "    <vertices>");
  for (let i = 0; i < pos.length; i += 3) out.push(`     <vertex x="${num(pos[i])}" y="${num(pos[i + 1])}" z="${num(pos[i + 2])}"/>`);
  out.push("    </vertices>", "    <triangles>");
  const codes = new Map();
  for (let i = 0; i < tri.length; i += 3) {
    const s = states ? states[i / 3] : 0;
    if (s && !codes.has(s)) codes.set(s, paintCode(s));
    const paint = s ? F.attrs.map((a) => ` ${a}="${codes.get(s)}"`).join("") : "";
    out.push(`     <triangle v1="${tri[i]}" v2="${tri[i + 1]}" v3="${tri[i + 2]}"${paint}/>`);
  }
  out.push("    </triangles>", "   </mesh>", "  </object>", " </resources>", " <build>", '  <item objectid="1"/>', " </build>", "</model>", "");
  const enc = new TextEncoder();
  return { "[Content_Types].xml": enc.encode(CONTENT_TYPES), "_rels/.rels": enc.encode(RELS), "3D/3dmodel.model": enc.encode(out.join("\n")) };
}

// binary STL of a mesh (no colours)
export function stlBytes(mesh, header = "binary STL") {
  const { pos, tri } = mesh, n = tri.length / 3, buf = new ArrayBuffer(84 + 50 * n), dv = new DataView(buf);
  const head = new TextEncoder().encode(header.slice(0, 79));
  new Uint8Array(buf, 0, 80).set(head);
  dv.setUint32(80, n, true);
  for (let i = 0; i < n; i++) {
    const o = 84 + 50 * i, [a, b, c] = [tri[3 * i], tri[3 * i + 1], tri[3 * i + 2]];
    const p = (k, j) => pos[3 * k + j];
    const ux = p(b, 0) - p(a, 0), uy = p(b, 1) - p(a, 1), uz = p(b, 2) - p(a, 2);
    const vx = p(c, 0) - p(a, 0), vy = p(c, 1) - p(a, 1), vz = p(c, 2) - p(a, 2);
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    [nx, ny, nz, p(a, 0), p(a, 1), p(a, 2), p(b, 0), p(b, 1), p(b, 2), p(c, 0), p(c, 1), p(c, 2)]
      .forEach((v, j) => dv.setFloat32(o + 4 * j, v, true));
  }
  return new Uint8Array(buf);
}
