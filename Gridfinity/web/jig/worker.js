// Geometry worker for the label jig page: loads OpenCascade (gzipped WASM in the shared vendor folder), builds the jig
// with src/jig.js and returns the preview mesh plus the STL; the plates in their pockets come along as a second mesh
// (preview only). Messages: in {type: "build", inputs}; out ready / progress / part / done / error.
import opencascade from "./vendor/replicad_single.js";
import * as R from "./vendor/replicad.js";
import ClipperLib from "./vendor/clipper.js";
import { setClipper } from "./src/outline.js";
import { jigEnv, makeJig } from "./src/jig.js";

setClipper(ClipperLib);
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
const meshOf = (shape) => {
  const m = shape.mesh({ tolerance: 0.05, angularTolerance: 0.25 });
  return { positions: new Float32Array(m.vertices), normals: new Float32Array(m.normals), indices: new Uint32Array(m.triangles) };
};

self.onmessage = async ({ data }) => {
  if (data.type !== "build") return;
  try {
    const spec = await ready;
    const env = jigEnv(spec, data.inputs);
    post({ type: "progress", part: "Jig" });
    const jig = makeJig(R, spec, env);
    const m = meshOf(jig), stl = await jig.blobSTL(STL).arrayBuffer(), volume = R.measureVolume(jig) / 1000;
    jig.delete();
    post({ type: "part", part: "Jig", ...m, stl, volume }, [m.positions.buffer, m.normals.buffer, m.indices.buffer, stl]);
    // the plates, lying in their pockets (preview)
    const [pl, pw, pt] = env.plate;
    const plates = R.makeCompound(env.pockets.map((p) =>
      R.drawRectangle(pl, pw).translate((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2).sketchOnPlane("XY", [0, 0, env.H - pt]).extrude(pt)));
    const pm = meshOf(plates);
    post({ type: "part", part: "Plates", ...pm }, [pm.positions.buffer, pm.normals.buffer, pm.indices.buffer]);
    post({ type: "done" });
  } catch (err) {
    fail(err);
  }
};
