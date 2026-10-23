// Minimal static server for the bundled generator: node tools/serve.mjs [port]  ->  http://localhost:8642/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "dist");
const port = Number(process.argv[2] || 8642);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".wasm": "application/wasm", ".svg": "image/svg+xml" };

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.normalize(path.join(root, url === "/" ? "index.html" : url));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
  fs.createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`Gridfinity Rugged Case generator: http://localhost:${port}/`));
