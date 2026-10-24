// Image worker for the tool insert page: loads OpenCV.js (shared vendor folder, about 3.6 MB gzipped) on first use,
// finds the sheet in the photo and traces the tools on it (src/trace.js). The photo, the rectified sheet and the tool
// mask stay here between messages, so brush strokes and the sensitivity re-trace quickly.
// Messages in: {type: "photo", width, height, data (RGBA)}, {type: "trace", seq, corners, paper: [w, h] mm,
// sensitivity, strokes}. Out: {type: "ready"}, {type: "sheet", found, corners}, {type: "traced", seq, ppm, wMm, hMm,
// tools: [{outline, area}], and when the sheet changed: width, height, data (RGBA of the rectified sheet)},
// {type: "error", message, code}.
import { findSheet, rectify, toolMask, paintMask, maskTools } from "./src/trace.js";

const post = (msg, transfer = []) => self.postMessage(msg, transfer);
const fail = (err, code) => post({ type: "error", message: String(err?.message ?? err), code: code ?? err?.code });

const ready = (async () => {
  await import("./vendor/opencv.js"); // sets globalThis.cv to a promise of the module
  return await globalThis.cv;
})();
ready.then(() => post({ type: "ready" }), (e) => fail(e, "opencv"));

const PPM = 5;
let photo = null; // cv.Mat CV_8UC4
let rect = null, rectKey = ""; // rectified sheet for corners + paper
let base = null, baseKey = ""; // tool mask before the brush strokes, for that sheet + sensitivity

function forget() {
  rect?.mat.delete();
  base?.mask.delete();
  rect = base = null;
  rectKey = baseKey = "";
}

self.onmessage = async ({ data }) => {
  try {
    const cv = await ready;
    if (data.type === "photo") {
      photo?.delete();
      forget();
      photo = cv.matFromImageData({ data: new Uint8ClampedArray(data.data), width: data.width, height: data.height });
      const s = findSheet(cv, photo);
      post({ type: "sheet", found: s.found, corners: s.corners });
    } else if (data.type === "trace") {
      if (!photo) throw new Error("no photo");
      const rk = JSON.stringify([data.corners, data.paper]);
      let sheetChanged = false;
      if (rk !== rectKey) {
        forget();
        rect = rectify(cv, photo, data.corners, data.paper, PPM);
        rectKey = rk;
        sheetChanged = true;
      }
      const bk = String(data.sensitivity ?? 0);
      if (bk !== baseKey) {
        base?.mask.delete();
        base = toolMask(cv, rect.mat, { ppm: PPM, sensitivity: data.sensitivity ?? 0 });
        baseKey = bk;
      }
      const mask = new cv.Mat();
      base.mask.copyTo(mask); // not clone(): in this OpenCV.js build the clone shares the pixels with the original
      paintMask(cv, mask, data.strokes, PPM);
      const tools = maskTools(cv, mask, { ppm: PPM });
      mask.delete();
      const msg = { type: "traced", seq: data.seq, ppm: PPM, wMm: rect.wMm, hMm: rect.hMm, tools };
      if (!sheetChanged) return post(msg);
      const rgba = new Uint8ClampedArray(rect.mat.data); // copy out of the WASM heap
      post({ ...msg, width: rect.mat.cols, height: rect.mat.rows, data: rgba.buffer }, [rgba.buffer]);
    }
  } catch (err) {
    fail(err);
  }
};
