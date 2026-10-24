// Geometry worker: loads OpenCascade (gzipped WASM next to the page), builds the case with src/case.js and returns
// preview meshes plus print-oriented STLs. Messages: in {type: "build", inputs, tag}; out progress / part / done / error.
// The page writes the window SVG and the build sheet itself (in its language) from the env and sizes of "done".
import opencascade from "./vendor/replicad_single.js";
import * as R from "./vendor/replicad.js";
import { makeCase, toPrint, PRINT } from "./src/case.js";

const post = (msg, transfer = []) => self.postMessage(msg, transfer);
// code "kernel" lets the page say it in its language; other errors come from OpenCascade and pass through as text
const fail = (err) => post({ type: "error", message: String(err?.message ?? err), code: err?.code, status: err?.status });

async function loadKernel() {
  // gzipped kernel (7 MB instead of 23 MB); named .wasm because artifacts only serve known types
  const res = await fetch(new URL("./vendor/opencascade-gz.wasm", import.meta.url));
  if (!res.ok) throw Object.assign(new Error(`could not load the geometry kernel (${res.status})`), { code: "kernel", status: res.status });
  let buf = await res.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] === 0x1f && head[1] === 0x8b) { // still gzipped (a server may already have decoded it)
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  R.setOC(await opencascade({ wasmBinary: buf }));
  return (await fetch(new URL("./case_params.json", import.meta.url))).json();
}
const ready = loadKernel();
ready.then(() => post({ type: "ready" }), fail);

const STL = { tolerance: 0.01, angularTolerance: 0.1, binary: true };

self.onmessage = async ({ data }) => {
  if (data.type !== "build") return;
  try {
    const spec = await ready;
    const kase = makeCase(R, spec, data.inputs);
    const sizes = {};
    for (const part of ["Base", "Lid", "Latch", "Seal", "Window"]) {
      post({ type: "progress", part });
      const t0 = performance.now();
      const shape = kase[part.toLowerCase()]();
      const m = shape.mesh({ tolerance: 0.05, angularTolerance: 0.25 });
      const positions = new Float32Array(m.vertices), normals = new Float32Array(m.normals), indices = new Uint32Array(m.triangles);
      let stl = null;
      if (PRINT[part]) {
        const p = toPrint(shape, part);
        const [[a0, b0, c0], [a1, b1, c1]] = p.boundingBox.bounds;
        sizes[part] = [a1 - a0, b1 - b0, c1 - c0];
        stl = await p.blobSTL(STL).arrayBuffer();
        p.delete();
      }
      const volume = R.measureVolume(shape) / 1000;
      shape.delete();
      const transfer = [positions.buffer, normals.buffer, indices.buffer];
      if (stl) transfer.push(stl);
      post({ type: "part", part, positions, normals, indices, stl, volume, ms: Math.round(performance.now() - t0) }, transfer);
    }
    post({ type: "done", env: kase.env, sizes });
  } catch (err) {
    fail(err);
  }
};
