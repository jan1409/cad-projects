// Geometry worker for the Christmas tree page: loads OpenCascade (gzipped WASM in the shared vendor folder), builds the
// tree with src/tree.js, meshes it and splits the mesh at the band planes with src/paint3mf.js, so that every triangle
// is painted whole. Returns the print mesh (vertices, triangles, paint state per triangle); the page makes the 3MF.
// Messages: in {type: "build", inputs}; out ready / progress / mesh / error.
import opencascade from "./vendor/replicad_single.js";
import * as R from "./vendor/replicad.js";
import { treeEnv, makeTree } from "./src/tree.js";
import { weld, splitAtZ, statesByZ } from "./src/paint3mf.js";

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
  return (await fetch(new URL("./tree_params.json", import.meta.url))).json();
}
const ready = loadKernel();
ready.then(() => post({ type: "ready" }), fail);

// the same mesh settings as node/tree_build.mjs (the checked print files)
const MESH = { tolerance: 0.01, angularTolerance: 0.1 };

self.onmessage = async ({ data }) => {
  if (data.type !== "build") return;
  try {
    const spec = await ready;
    const env = treeEnv(spec, data.inputs);
    post({ type: "progress", step: "tree" });
    const tree = makeTree(R, env);
    const m = tree.mesh(MESH), volume = R.measureVolume(tree) / 1000;
    tree.delete();
    post({ type: "progress", step: "paint" });
    const split = splitAtZ(weld(m.vertices, m.triangles), env.bands.flat().filter((z) => z > 1e-9));
    const states = statesByZ(split, env.bands);
    const pos = new Float64Array(split.pos), tri = new Uint32Array(split.tri);
    post({ type: "mesh", pos, tri, states, volume }, [pos.buffer, tri.buffer, states.buffer]);
  } catch (err) {
    fail(err);
  }
};
