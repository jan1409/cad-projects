// Geometry worker for the plug-together star page: loads OpenCascade (gzipped WASM in the shared vendor folder), builds
// the parts with src/plugstar.js (point, point with hanging hole, connector) and the fit test's short points (one per
// fit to choose from: fit_0, fit_1, ...), meshes them and returns welded meshes (star frame) with their volumes and
// areas; the page places them and writes the files.
// Messages: in {type: "build", inputs}; out ready / progress / parts / error.
import opencascade from "./vendor/replicad_single.js";
import * as R from "./vendor/replicad.js";
import { plugEnv, makePoint, makeConnector, fitTestPiece, meshArea, fitOptions } from "./src/plugstar.js";
import { weld } from "./src/paint3mf.js";

const post = (msg, transfer = []) => self.postMessage(msg, transfer);
// code "kernel" lets the page say it in its language; other errors come from OpenCascade and pass through as text
const fail = (err) => post({ type: "error", message: String(err?.message ?? err), code: err?.code, status: err?.status });

async function loadKernel() {
  const res = await fetch(new URL("./vendor/opencascade-gz.wasm", import.meta.url));
  if (!res.ok) throw Object.assign(new Error(`could not load the geometry kernel (${res.status})`), { code: "kernel", status: res.status });
  let buf = await res.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] === 0x1f && head[1] === 0x8b) { // still gzipped (a server may already have decoded it)
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  R.setOC(await opencascade({ wasmBinary: buf }));
  return (await fetch(new URL("./plugstar_params.json", import.meta.url))).json();
}
const ready = loadKernel();
ready.then(() => post({ type: "ready" }), fail);

// the same mesh settings as node/plugstar_build.mjs (the checked print files)
const MESH = { tolerance: 0.01, angularTolerance: 0.1 };

self.onmessage = async ({ data }) => {
  if (data.type !== "build") return;
  try {
    const spec = await ready;
    const env = plugEnv(spec, data.inputs);
    const parts = {}, transfer = [];
    const add = (key, solid) => {
      const m = solid.mesh(MESH), w = weld(m.vertices, m.triangles);
      const pos = new Float64Array(w.pos), tri = new Uint32Array(w.tri);
      parts[key] = { pos, tri, volume: R.measureVolume(solid), area: meshArea({ pos, tri }) };
      transfer.push(pos.buffer, tri.buffer);
    };
    post({ type: "progress", part: "point" });
    const point = makePoint(R, env, false);
    add("point", point);
    point.delete();
    fitOptions(spec).forEach((fit, i) => {
      const e = plugEnv(spec, { ...data.inputs, fit }), p = makePoint(R, e, false);
      add(`fit_${i}`, fitTestPiece(R, e, p));
      p.delete();
    });
    if (env.hanger) {
      post({ type: "progress", part: "point_hang" });
      add("point_hang", makePoint(R, env, true));
    }
    post({ type: "progress", part: "connector" });
    add("connector", makeConnector(R, env));
    post({ type: "parts", parts }, transfer);
  } catch (err) {
    fail(err);
  }
};
