// Geometry worker for the baseplate pages: loads OpenCascade (gzipped WASM in the shared vendor folder), builds every
// unique piece with src/baseplate.js and returns preview meshes plus STLs (pieces print as modelled, bottom down).
// Messages: in {type: "build", inputs}; out progress / part / done / error.
import opencascade from "./vendor/replicad_single.js";
import * as R from "./vendor/replicad.js";
import { plateEnv, makePiece } from "./src/baseplate.js";

const post = (msg, transfer = []) => self.postMessage(msg, transfer);

async function loadKernel() {
  const res = await fetch(new URL("./vendor/opencascade-gz.wasm", import.meta.url));
  if (!res.ok) throw new Error(`could not load the geometry kernel (${res.status})`);
  let buf = await res.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] === 0x1f && head[1] === 0x8b) { // still gzipped (a server may already have decoded it)
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  R.setOC(await opencascade({ wasmBinary: buf }));
  return (await fetch(new URL("./baseplate_params.json", import.meta.url))).json();
}
const ready = loadKernel();
ready.then(() => post({ type: "ready" }), (err) => post({ type: "error", message: String(err.message ?? err) }));

const STL = { tolerance: 0.01, angularTolerance: 0.1, binary: true };

self.onmessage = async ({ data }) => {
  if (data.type !== "build") return;
  try {
    const spec = await ready;
    const env = plateEnv(spec, data.inputs);
    for (const [index, u] of env.unique.entries()) {
      post({ type: "progress", id: u.id, index, total: env.unique.length });
      const shape = makePiece(R, spec, env, u);
      const m = shape.mesh({ tolerance: 0.05, angularTolerance: 0.25 });
      const positions = new Float32Array(m.vertices), normals = new Float32Array(m.normals), indices = new Uint32Array(m.triangles);
      const stl = await shape.blobSTL(STL).arrayBuffer();
      const volume = R.measureVolume(shape) / 1000;
      shape.delete();
      post({ type: "part", id: u.id, positions, normals, indices, stl, volume }, [positions.buffer, normals.buffer, indices.buffer, stl]);
    }
    post({ type: "done" });
  } catch (err) {
    post({ type: "error", message: String(err?.message ?? err) });
  }
};
