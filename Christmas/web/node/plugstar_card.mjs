// Card image of the plug-together star, rendered by SolidCraft from the master model: a script on top of the .sc (not
// saved into it) places copies of the point where src/plugstar.js puts them (plugLayout), turned towards the default
// camera (from front right above) and tilted a little (down by --tilt, sideways by --side) so that the faces show; the originals and the hidden connector
// are removed, every point gets its default filament colour. solidcraft-cli renders it with a transparent background,
// tools/card_image.py crops and quantises it.
//   node node/plugstar_card.mjs [--width 1600 --height 1600] [--tilt 0.45] [--side 0]   -> ../plugstar/card.png (raw render in ../../export/card/)
//   SOLIDCRAFT_CLI overrides the path of solidcraft-cli.exe
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { plugEnv, plugLayout, defaultAssign } from "../src/plugstar.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const repo = path.resolve(root, "..");
const CLI = process.env.SOLIDCRAFT_CLI ?? "C:/Program Files/SolidCraft/solidcraft-cli.exe";
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const spec = JSON.parse(fs.readFileSync(path.join(root, "spec/plugstar_params.json")));
const inputs = Object.fromEntries(Object.entries(spec.parameters).map(([k, p]) => [k, p.default]));
const env = plugEnv(spec, inputs);
const assign = defaultAssign(env.N);

// view frame: the star's normal towards the camera (1, -1, 1), tilted down by `tilt`; point 0 up on the screen
const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const cam = norm([1, -1, 1]);
const up0 = norm([-cam[0] * cam[2], -cam[1] * cam[2], 1 - cam[2] * cam[2]]);
const tilt = Number(opt("--tilt", "0.45")), side = Number(opt("--side", "0"));
const right0 = cross(up0, cam);
const z = norm(cam.map((c, i) => c - tilt * up0[i] - side * right0[i])), x = norm(cross(up0, z)), y = cross(z, x);
const V = [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]]; // columns: star x, y, z in the world
const mul = (m) => { // V · m (m row-major 4x4 rotation about Z) -> row-major 3x4
  const out = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) out.push(c < 3 ? V[r][0] * m[c] + V[r][1] * m[4 + c] + V[r][2] * m[8 + c] : 0);
  return out.map((v) => Number(v.toFixed(12)));
};

const changes = { D: `${env.D} mm`, pts: String(env.N), alpha: `${env.alpha} deg`, depth: String(env.depth), fit: `${env.fit} mm` };
const commands = [{ command: "parameters.change", params: { changes } }];
const bySlot = {};
plugLayout(env).forEach(({ part, index, m }) => {
  if (part === "connector") return;
  const name = `Star${index + 1}`;
  commands.push({ command: "solid.move", params: { bodies: [part === "point_hang" ? "PointHang" : "Point"], copy: true, matrix: mul(m), body_name: name } });
  (bySlot[assign[index]] ??= []).push(name);
});
commands.push({ command: "solid.remove", params: { bodies: ["Point", "PointHang", "Connector"] } });
for (const [slot, bodies] of Object.entries(bySlot)) commands.push({ command: "appearance.assign", params: { bodies, color: spec.colors[slot - 1] } });

const out = path.join(root, "export/card");
fs.mkdirSync(out, { recursive: true });
const script = path.join(out, "plugstar_card_script.json"), design = path.join(out, "plugstar_card.sc"), raw = path.join(out, "plugstar_card_raw.png");
fs.writeFileSync(script, JSON.stringify({ commands }, null, 1));
execFileSync(CLI, ["run", script, "--in", path.join(root, "solidcraft/plug_star.sc"), "--save", design, "--quiet"], { stdio: "inherit" });
execFileSync(CLI, ["render", design, "--out", raw, "--transparent", "--overwrite", "--width", opt("--width", "1600"), "--height", opt("--height", "1600")],
  { stdio: "inherit" });
const py = path.join(repo, ".venv/Scripts/python.exe");
execFileSync(py, [path.join(repo, "tools/card_image.py"), raw, path.join(root, "web/plugstar/card.png")], { stdio: "inherit" });
