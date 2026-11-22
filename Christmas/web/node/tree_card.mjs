// Card image of the Christmas tree, rendered by SolidCraft from Jan's model: a script on top of the .sc (not saved
// into it) activates a top (default Star: the tree with its star), splits the tree at the band planes of src/tree.js
// and colours the pieces and the star, solidcraft-cli renders it with a transparent background, and
// tools/card_image.py crops and quantises it for the site.
//   node node/tree_card.mjs [--top flat|sharp|star] [--width 1600 --height 1600]
//   -> ../web/tree/card.png (raw render in ../../export/card/)
//   SOLIDCRAFT_CLI overrides the path of solidcraft-cli.exe
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { treeEnv } from "../src/tree.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const repo = path.resolve(root, "..");
const CLI = process.env.SOLIDCRAFT_CLI ?? "C:/Program Files/SolidCraft/solidcraft-cli.exe";
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const spec = JSON.parse(fs.readFileSync(path.join(root, "spec/tree_params.json")));
const top = opt("--top", "star"), ROW = { flat: "Flat", sharp: "Sharp", star: "Star" };
const inputs = { ...Object.fromEntries(Object.entries(spec.parameters).map(([k, p]) => [k, p.default])), top };
const env = treeEnv(spec, inputs);

// split from the bottom up: the split keeps "Tree" above the plane and names the piece below
const planes = env.bands.flat().filter((z) => z > 1e-9).sort((a, b) => a - b);
const commands = [{ command: "config.activate", params: { row: ROW[top] } }], band = [], main = ["Tree"];
planes.forEach((z, i) => {
  const name = `Piece${i + 1}`;
  commands.push({ command: "solid.split_body", params: { body: "Tree", plane: { origin: [0, 0, Number(z.toFixed(6))], normal: [0, 0, 1] }, body_name: name } });
  // the pieces alternate: band, tree, band, ... (the first band starts on the bed)
  (i % 2 === 0 ? band : main).push(name);
});
commands.push({ command: "appearance.assign", params: { bodies: main, color: spec.colors.main } });
commands.push({ command: "appearance.assign", params: { bodies: band, color: spec.colors.band } });
if (env.star) commands.push({ command: "appearance.assign", params: { bodies: ["Star"], color: spec.colors.star } });

const out = path.join(root, "export/card");
fs.mkdirSync(out, { recursive: true });
const script = path.join(out, "card_script.json"), design = path.join(out, "card.sc"), raw = path.join(out, "card_raw.png");
fs.writeFileSync(script, JSON.stringify({ commands }, null, 1));
execFileSync(CLI, ["run", script, "--in", path.join(root, "solidcraft/christmas_tree.sc"), "--save", design, "--quiet"], { stdio: "inherit" });
execFileSync(CLI, ["render", design, "--out", raw, "--transparent", "--overwrite", "--width", opt("--width", "1600"), "--height", opt("--height", "1600")],
  { stdio: "inherit" });
const py = path.join(repo, ".venv/Scripts/python.exe");
execFileSync(py, [path.join(repo, "tools/card_image.py"), raw, path.join(root, "web/tree/card.png")], { stdio: "inherit" });
