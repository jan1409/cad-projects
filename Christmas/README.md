# Christmas

Parametric Christmas models for the generator site (section `christmas`). Designed in SolidCraft, built in the
browser. The tree comes as a 3MF whose multi-colour paint is already applied, for Bambu Studio, OrcaSlicer or
PrusaSlicer; the Parametric Christmas Star as single-printed points with a lamp socket (E10 or E27).

## Layout

- `solidcraft/` – the SolidCraft designs (master). `christmas_tree_v2.sc` is a snapshot of Jan's
  `D:\CreativeProjects\Solidcraft_Models\Christmas_tree_v2.sc`; `christmas_tree.sc` is v3: v2 plus the tops (Flat,
  Sharp, Star) as configuration rows, built from v2 by `web/node/tree_sc_v3.mjs` (also saved as
  `Solidcraft_Models\Christmas_tree_v3.sc`). After a change in SolidCraft copy the file again and run `tree_check.mjs`.
  `christmas_star.sc` is a snapshot of `Christmas_star_v1.sc`, `e27_nut.sc` of `Christmas_star_e27_nut.sc` (the fixed
  nut; its STL is `web/star/e27_nut.stl`); run `star_check.mjs` after a change.
- `spec/` – `tree_spec.md` (equations, the decoded paint rule, the 3MF format), `tree_params.json` (site spec);
  `star_spec.md` (geometry, lamps with sources, checks), `star_params.json` (site spec, lamp table).
- `reference/` – `tree_paint_reference.json` (the colour runs of Jan's print, sliced by hand) and
  `bambu_x1c_2pla_project_settings.config` (the complete Bambu Studio settings of that print, used to slice test
  files with the Bambu/Orca CLI).
- `web/` – npm workspace: `src/tree.js` (geometry, build sheet), `src/paint3mf.js` (band split, paint, 3MF/STL
  writers, no kernel; several objects per 3MF), `src/star.js` (star parts, layout, lamp checks, build sheet),
  `src/strings.js` (en/de, `tree.*` and `star.*`), `tree/` and `star/` (page, app, worker, `card.png`), `node/` (tools below).
- `export/` – git-ignored output.

## Source chain

SolidCraft `.sc` → JS port (`src/tree.js`, replicad) → mesh split at the band planes and painted per triangle →
3MF flavour. The port is checked against SolidCraft, the 3MF files against the slicers:

```
node Christmas/web/node/tree_sc_v3.mjs        # v3 .sc from the v2 snapshot: tops as configuration rows (headless)
node Christmas/web/node/tree_check.mjs [--top flat|sharp|star]   # JS vs solidcraft-cli, 14 sets x tops, exact booleans (local only)
node Christmas/web/node/tree_build.mjs [height=120 fins=20 ... top=star star_share=25 star_filament=3] [--out Christmas/export/web]
node Christmas/web/node/tree_build.mjs --sweep
node Christmas/web/node/tree_card.mjs [--top star]   # card.png: SolidCraft render of the split, coloured tree (with its star)
python -I tools/slice_paint_check.py --slicer prusa|bambu|orca FILE.3mf --expect Christmas/reference/tree_paint_reference.json
python -I tools/slice_paint_check.py --slicer bambu FILE.3mf --bands "0-7.45,25.36-32.81,..." --height 120
python -I tools/slice_paint_check.py --slicer orca STAR_TREE.3mf --bands "..." --height 129.72 --extra "2:0-5"   # + the star in T2
```

Star: SolidCraft `.sc` → JS port (`src/star.js`) → STL per part, a 3MF with each part once, build sheet, fit test.

```
node Christmas/web/node/star_check.mjs        # JS vs solidcraft-cli, 12 sets x 5 bodies, exact booleans (local only)
node Christmas/web/node/star_build.mjs [diameter=550 slenderness=3 lamp=e27_p45 wall=0.9 fit=0.2] [--assembly] [--out dir]
node Christmas/web/node/star_build.mjs --sweep
node Christmas/web/node/star_assembly.mjs [D] [k]   # 26 placed parts: overlap and gaps
node Christmas/web/node/star_lamps.mjs [--write]   # smallest star per lamp (a_lamp in star_params.json)
node Christmas/web/node/star_card.mjs          # card.png: SolidCraft render of the assembled star
```

`npm test` (CI) builds the smallest, default and largest tree for every top and one without bands, the default star,
every lamp at its smallest star and the largest star, and checks the texts.

## SolidCraft notes

- The app's MCP server is `solidcraft` (port 27878 when the app runs); `C:\Program Files\SolidCraft\solidcraft-cli.exe`
  works without it: `run <script.json> --in design.sc --out x.step|x.stl|x.3mf [--save y.sc]`, `eval` (measure as
  JSON), `script design.sc` (the timeline as a command script), `render design.sc --out x.png --transparent`.
- A script is `{"commands": [{"command": "parameters.change", "params": {"changes": {"H": "150"}}}, ...]}`, the
  same commands as the MCP's `execute`; a rebuild takes about 2 s.
- `.sc` is a ZIP: `document.json` (features, sketches, parameters with expressions and comments) and a mesh cache.
- `sketch.line` takes points whose coordinates are expressions (`["Rn", "-wn/2"]`): profiles that follow the parameters
  with dof 0; a coordinate naming no parameter does not fix the point (write `0*Rn`).
- `solid.loft` to an apex: `sections: [{sketch}, {sketch, point: "p1"}]`; `solid.thread` cuts modelled metric threads
  of any pitch (`M40.4x2.5`); `solid.move {matrix, copy: true}` places copies (the star card).
- `solid.split_body` with a plane keeps the body's name on the side the normal points to and names the other piece
  (`body_name`).
- Variants as configuration rows: `config.configure {features}` adds suppression columns (its first row is "Default"),
  `config.row {name, values: {Feature: true|false}}`, `config.activate {row}`. They also work in headless scripts:
  `tree_check.mjs` activates a row, then changes the parameters.
- `timeline.add {feature}` takes a feature as `document.json` holds it: `tree_sc_v3.mjs` adds sketches whose points
  are all expressions (lines and arcs, no constraints, dof 0), the sharp sketch's fillets in closed form.
- Constraint-solved fillets (v2's FinSketch) start from the saved solution and can flip on another path:
  - H 120 → 168 → 235 differs from 120 → 235;
  - from 260 they don't solve at all.

  Closed-form points don't have this problem. Change parameters in one step from the saved state when comparing.
- A parameter can't be named like a unit (`ft` is feet).
- SolidCraft writes no slicer paint (its `3mf-tagged` export tags triangles with their B-rep face), so the paint
  is written by `src/paint3mf.js`.
