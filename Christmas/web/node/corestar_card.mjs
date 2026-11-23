// Card image of the Christmas star with core, rendered by SolidCraft from the master model: the .sc already holds the
// assembled star (copies of the parts on the core); a script on top of it (not saved into the master) removes the
// part originals and the fit-test bodies and colours the pieces; solidcraft-cli renders it with a transparent
// background, and tools/card_image.py crops and quantises it.
//   node node/corestar_card.mjs [--width 1600 --height 1600]   -> ../web/corestar/card.png (raw render in ../../export/card/)
//   SOLIDCRAFT_CLI overrides the path of solidcraft-cli.exe
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const repo = path.resolve(root, "..");
const CLI = process.env.SOLIDCRAFT_CLI ?? "C:/Program Files/SolidCraft/solidcraft-cli.exe";
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const spec = JSON.parse(fs.readFileSync(path.join(root, "spec/corestar_params.json")));

const points = [...Array.from({ length: 17 }, (_, i) => `PointSq_${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `PointTri_${i + 1}`), "TopHalf_1", "TopHalf_2"];
const commands = [
  { command: "solid.remove", params: { bodies: ["PointSq", "PointTri", "LampPlate", "LampPlateE10", "TopHalf", "TopSleeve", "FitCrown", "FitSq", "FitTri", "FitLamp"] } },
  { command: "appearance.assign", params: { bodies: points, color: spec.colors.point } },
  { command: "appearance.assign", params: { bodies: ["Core"], color: spec.colors.core } },
  { command: "appearance.assign", params: { bodies: ["LampPlate_1", "TopSleeve_1"], color: spec.colors.lamp } },
];
const out = path.join(root, "export/card");
fs.mkdirSync(out, { recursive: true });
const script = path.join(out, "corestar_card_script.json"), design = path.join(out, "corestar_card.sc"), raw = path.join(out, "corestar_card_raw.png");
fs.writeFileSync(script, JSON.stringify({ commands }, null, 1));
execFileSync(CLI, ["run", script, "--in", path.join(root, "solidcraft/christmas_star_core.sc"), "--save", design, "--quiet"], { stdio: "inherit" });
execFileSync(CLI, ["render", design, "--out", raw, "--transparent", "--overwrite", "--width", opt("--width", "1600"), "--height", opt("--height", "1600")],
  { stdio: "inherit" });
const py = path.join(repo, ".venv/Scripts/python.exe");
execFileSync(py, [path.join(repo, "tools/card_image.py"), raw, path.join(root, "web/corestar/card.png")], { stdio: "inherit" });
