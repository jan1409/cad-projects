// Geometry worker for the Christmas star page: loads OpenCascade (gzipped WASM in the shared vendor folder), builds the
// parts with src/star.js (square and triangular point, lamp socket, carrier) and the short fit-test points, meshes
// them and returns welded meshes with their volumes; the page places them and writes the files.
// Messages: in {type: "build", inputs}; out ready / progress / parts / error.
import opencascade from "./vendor/replicad_single.js";
import * as R from "./vendor/replicad.js";
import { starEnv, makeSquarePoint, makeTrianglePoint, makeSocket, makeCarrier, fitTestPiece } from "./src/star.js";
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
  return (await fetch(new URL("./star_params.json", import.meta.url))).json();
}
const ready = loadKernel();
ready.then(() => post({ type: "ready" }), fail);

// the same mesh settings as node/star_build.mjs (the checked print files)
const MESH = { tolerance: 0.01, angularTolerance: 0.1 };

self.onmessage = async ({ data }) => {
  if (data.type !== "build") return;
  try {
    const spec = await ready;
    const env = starEnv(spec, data.inputs);
    const jobs = [
      ["square", () => makeSquarePoint(R, env)],
      ["triangle", () => makeTrianglePoint(R, env)],
      ["socket", () => makeSocket(R, env)],
      ...(env.seat === "bayonet" ? [["carrier", () => makeCarrier(R, env)]] : []),
    ];
    const parts = {}, transfer = [];
    const add = (key, solid) => {
      const m = solid.mesh(MESH), w = weld(m.vertices, m.triangles);
      const pos = new Float64Array(w.pos), tri = new Uint32Array(w.tri);
      parts[key] = { pos, tri, volume: R.measureVolume(solid) / 1000 };
      transfer.push(pos.buffer, tri.buffer);
    };
    for (const [key, make] of jobs) {
      post({ type: "progress", part: key });
      const solid = make();
      add(key, solid);
      if (key === "square" || key === "triangle") add(`${key}_fit`, fitTestPiece(R, env, solid));
      solid.delete();
    }
    post({ type: "parts", parts }, transfer);
  } catch (err) {
    fail(err);
  }
};
