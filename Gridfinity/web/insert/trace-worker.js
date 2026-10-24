// Image worker for the tool insert page: loads OpenCV.js (shared vendor folder, about 3.6 MB gzipped) on first use,
// finds the sheet in the photo and traces the tools on it (src/trace.js). The photo stays here between messages.
// Messages in: {type: "photo", width, height, data (RGBA)}, {type: "trace", corners, paper: [w, h] mm, sensitivity}.
// Out: {type: "ready"}, {type: "sheet", found, corners}, {type: "traced", width, height, data (RGBA of the rectified
// sheet), ppm, wMm, hMm, halfPixel, tools: [{outline, area}]}, {type: "error", message, code}.
import { findSheet, rectify, traceTools } from "./src/trace.js";

const post = (msg, transfer = []) => self.postMessage(msg, transfer);
const fail = (err, code) => post({ type: "error", message: String(err?.message ?? err), code: code ?? err?.code });

const ready = (async () => {
  await import("./vendor/opencv.js"); // sets globalThis.cv to a promise of the module
  return await globalThis.cv;
})();
ready.then(() => post({ type: "ready" }), (e) => fail(e, "opencv"));

let photo = null; // cv.Mat CV_8UC4

self.onmessage = async ({ data }) => {
  try {
    const cv = await ready;
    if (data.type === "photo") {
      photo?.delete();
      photo = cv.matFromImageData({ data: new Uint8ClampedArray(data.data), width: data.width, height: data.height });
      const s = findSheet(cv, photo);
      post({ type: "sheet", found: s.found, corners: s.corners });
    } else if (data.type === "trace") {
      if (!photo) throw new Error("no photo");
      const ppm = 5;
      const rect = rectify(cv, photo, data.corners, data.paper, ppm);
      const res = traceTools(cv, rect.mat, { ppm, sensitivity: data.sensitivity ?? 0 });
      const rgba = new Uint8ClampedArray(rect.mat.data); // copy out of the WASM heap
      const { width, height } = { width: rect.mat.cols, height: rect.mat.rows };
      rect.mat.delete();
      res.mask.delete();
      post({ type: "traced", width, height, data: rgba.buffer, ppm, wMm: rect.wMm, hMm: rect.hMm, halfPixel: res.halfPixel, tools: res.tools },
        [rgba.buffer]);
    }
  } catch (err) {
    fail(err);
  }
};
