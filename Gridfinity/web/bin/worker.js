// Geometry worker for the box pages: loads OpenCascade (gzipped WASM in the shared vendor folder), builds the box with
// src/bin.js and returns preview meshes plus print-oriented STLs. Messages: in {type: "build", inputs}; out progress /
// part / done / error.
import opencascade from "./vendor/replicad_single.js";
import * as R from "./vendor/replicad.js";
import { makeBin, plateToPrint } from "./src/bin.js";

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
  return (await fetch(new URL("./bin_params.json", import.meta.url))).json();
}
const ready = loadKernel();
ready.then(() => post({ type: "ready" }), fail);

const STL = { tolerance: 0.01, angularTolerance: 0.1, binary: true };

self.onmessage = async ({ data }) => {
  if (data.type !== "build") return;
  try {
    const spec = await ready;
    const bin = makeBin(R, spec, data.inputs);
    const parts = [["Box", bin.box, (s) => s]];
    if (bin.plate) parts.push(["Plate", bin.plate, (s) => plateToPrint(s, bin.env)]);
    for (const [part, make, toPrint] of parts) {
      post({ type: "progress", part });
      const shape = make();
      const m = shape.mesh({ tolerance: 0.05, angularTolerance: 0.25 });
      const positions = new Float32Array(m.vertices), normals = new Float32Array(m.normals), indices = new Uint32Array(m.triangles);
      const p = toPrint(shape);
      const stl = await p.blobSTL(STL).arrayBuffer();
      const volume = R.measureVolume(shape) / 1000;
      if (p !== shape) p.delete();
      shape.delete();
      post({ type: "part", part, positions, normals, indices, stl, volume }, [positions.buffer, normals.buffer, indices.buffer, stl]);
    }
    post({ type: "done" });
  } catch (err) {
    fail(err);
  }
};
