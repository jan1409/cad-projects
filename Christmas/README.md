# Christmas

Parametric Christmas models for the generator site (section `christmas`). Designed in SolidCraft, built in the
browser, downloaded as a 3MF whose multi-colour paint is already applied, for Bambu Studio, OrcaSlicer or PrusaSlicer.

## Layout

- `solidcraft/` – the SolidCraft designs (master). `christmas_tree.sc` is a snapshot of Jan's
  `D:\CreativeProjects\Solidcraft_Models\Christmas_tree_v2.sc`; copy it again after a change in SolidCraft and run
  `tree_check.mjs`.
- `spec/` – `tree_spec.md` (equations, the decoded paint rule, the 3MF format), `tree_params.json` (site spec).
- `reference/` – `tree_paint_reference.json` (the colour runs of Jan's print, sliced by hand) and
  `bambu_x1c_2pla_project_settings.config` (the complete Bambu Studio settings of that print, used to slice test
  files with the Bambu/Orca CLI).
- `web/` – npm workspace: `src/tree.js` (geometry, build sheet), `src/paint3mf.js` (band split, paint, 3MF/STL
  writers, no kernel), `src/strings.js` (en/de), `tree/` (page, app, worker, `card.png`), `node/` (tools below).
- `export/` – git-ignored output.

## Source chain

SolidCraft `.sc` → JS port (`src/tree.js`, replicad) → mesh split at the band planes and painted per triangle →
3MF flavour. The port is checked against SolidCraft, the 3MF files against the slicers:

```
node Christmas/web/node/tree_check.mjs        # JS vs solidcraft-cli builds, 12 sets, exact booleans (local only)
node Christmas/web/node/tree_build.mjs [height=120 fins=20 ...] [--out Christmas/export/web]
node Christmas/web/node/tree_build.mjs --sweep
node Christmas/web/node/tree_card.mjs          # card.png: SolidCraft render of the split, coloured tree
python -I tools/slice_paint_check.py --slicer prusa|bambu|orca FILE.3mf --expect Christmas/reference/tree_paint_reference.json
python -I tools/slice_paint_check.py --slicer bambu FILE.3mf --bands "0-7.45,25.36-32.81,..." --height 120
```

`npm test` (CI) builds the smallest, default and largest tree and one without bands, and checks the texts.

## SolidCraft notes

- The app's MCP server is `solidcraft` (port 27878 when the app runs); `C:\Program Files\SolidCraft\solidcraft-cli.exe`
  works without it: `run <script.json> --in design.sc --out x.step|x.stl|x.3mf [--save y.sc]`, `eval` (measure as
  JSON), `script design.sc` (the timeline as a command script), `render design.sc --out x.png --transparent`.
- A script is `{"commands": [{"command": "parameters.change", "params": {"changes": {"H": "150"}}}, ...]}`, the
  same commands as the MCP's `execute`; a rebuild takes about 2 s.
- `.sc` is a ZIP: `document.json` (features, sketches, parameters with expressions and comments) and a mesh cache.
- `solid.split_body` with a plane keeps the body's name on the side the normal points to and names the other piece
  (`body_name`).
- SolidCraft writes no slicer paint (its `3mf-tagged` export tags triangles with their B-rep face), so the paint
  is written by `src/paint3mf.js`.
