// Card image of the Christmas star, rendered by SolidCraft from the master model: a script on top of the .sc (not saved
// into it) places copies of the parts where src/star.js puts them (starLayout), removes the originals and colours the
// pieces; solidcraft-cli renders it with a transparent background, and tools/card_image.py crops and quantises it.
//   node node/star_card.mjs [--width 1600 --height 1600]   -> ../web/star/card.png (raw render in ../../export/card/)
//   SOLIDCRAFT_CLI overrides the path of solidcraft-cli.exe
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { starEnv, starLayout } from "../src/star.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const repo = path.resolve(root, "..");
const CLI = process.env.SOLIDCRAFT_CLI ?? "C:/Program Files/SolidCraft/solidcraft-cli.exe";
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const spec = JSON.parse(fs.readFileSync(path.join(root, "spec/star_params.json")));
const inputs = Object.fromEntries(Object.entries(spec.parameters).map(([k, p]) => [k, p.default]));
const env = starEnv(spec, inputs);

const BODY = { square: "PointSquare", triangle: "PointTriangle", socket: env.seat === "bayonet" ? "SocketBayonet" : "SocketSleeve", carrier: "Carrier" };
const changes = { D: String(env.D), k: String(env.k), t: String(env.t), g: String(env.g) };
if (env.seat === "bayonet") Object.assign(changes, { Do: String(env.Do), holeD: String(env.holeD), Ll: String(env.Ll) });
const commands = [{ command: "parameters.change", params: { changes } }];
const points = [], lamp = [];
starLayout(env).forEach(({ part, m }, i) => {
  const name = `Star${i + 1}`;
  commands.push({ command: "solid.move", params: { bodies: [BODY[part]], copy: true, matrix: m.slice(0, 12).map((v) => Number(v.toFixed(12))), body_name: name } });
  (part === "socket" || part === "carrier" ? lamp : points).push(name);
});
commands.push({ command: "solid.remove", params: { bodies: ["PointSquare", "PointTriangle", "SocketBayonet", "SocketSleeve", "Carrier"] } });
commands.push({ command: "appearance.assign", params: { bodies: points, color: spec.colors.point } });
commands.push({ command: "appearance.assign", params: { bodies: lamp, color: spec.colors.lamp } });

const out = path.join(root, "export/card");
fs.mkdirSync(out, { recursive: true });
const script = path.join(out, "star_card_script.json"), design = path.join(out, "star_card.sc"), raw = path.join(out, "star_card_raw.png");
fs.writeFileSync(script, JSON.stringify({ commands }, null, 1));
execFileSync(CLI, ["run", script, "--in", path.join(root, "solidcraft/christmas_star.sc"), "--save", design, "--quiet"], { stdio: "inherit" });
execFileSync(CLI, ["render", design, "--out", raw, "--transparent", "--overwrite", "--width", opt("--width", "1600"), "--height", opt("--height", "1600")],
  { stdio: "inherit" });
const py = path.join(repo, ".venv/Scripts/python.exe");
execFileSync(py, [path.join(repo, "tools/card_image.py"), raw, path.join(root, "web/star/card.png")], { stdio: "inherit" });
