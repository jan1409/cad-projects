# CAD_Projects

Workspace for 3D-printing designs. Each object lives in its own folder (`Gridfinity/`, …); `tools/` is shared.
Printers: Prusa XL (360 × 360 mm bed) and Bambu Lab X1C with AMS (256 mm, colour prints). Units: mm everywhere.

## Layout
- `tools/` – shared helpers (stdlib Python unless noted)
  - `fusion_mcp.py` – client for Fusion's built-in MCP server (`ping`, `run`, `screenshot`, `doc`, `read`)
  - `fusion_lib.py` – Fusion API helpers (mm wrappers, `Sk` sketch helper, extrude/fillet/chamfer, `set_par`, `report`); prepend it to part scripts
  - `onshape_api.py` – Onshape REST client (`whoami`, `quota`, `elements`, `features`, `configuration`, `variables`, `parts`, `stl`, `step`)
  - `onshape_summarize.py` – readable summary of a Part Studio feature tree
  - `onshape_sketches.py` – sketches of a feature tree in mm (entities, dimensions, plane); `--png` renders them (venv)
  - `stl_check.py` – size, volume, watertightness, bed contact (`--bed 360x360`)
  - `stl_section.py` – planar sections of STLs overlaid in a PNG, `--vertices` prints exact outlines (venv); use it to overlay generated parts on references
  - `fusion_view.py` – set the Fusion camera (eye/target, `--hide`, `--show-only`, `--ortho`) and take a screenshot (`--transparent`)
  - `card_image.py` – transparent screenshot → cropped, palette-quantised site image (venv, Pillow); `threemf.py` – minimal 3MF writer
  - `slice_paint_check.py` – slices a painted 3MF with the PrusaSlicer / Bambu Studio / OrcaSlicer CLI and lists the filament per layer;
    `--expect` a reference or `--bands`, `--gcode` reads a G-code or `.gcode.3mf`
- `<Object>/` – `onshape/` (source snapshots), `reference/` (ground-truth exports), `spec/`, `fusion/cad/`, `web/`,
  `models/<slug>/` (tracked download files for the site), `export/` (git-ignored)
- `Skadis/` – IKEA SKÅDIS accessories, hook tabs: `spec/skadis_spec.md` (grid research), `spec/*_params.json`,
  `fusion/` (script-built models, see its README), `models/` (roll holder, fit test)
- `Christmas/` – parametric Christmas models (site section `christmas`), designed in SolidCraft: `solidcraft/` (master
  `.sc` snapshots), `spec/tree_spec.md` (equations, decoded paint rule, 3MF format), `spec/star_spec.md` (26-point star:
  skirts, snaps, lamp socket, lamp table), `reference/`, `web/` (npm workspace: tree generator with painted 3MF and
  three tops: flat, sharp, star; star generator `star/`, see the README). The star's site name is "Parametric Christmas Star": never the original's brand name.
- `_input/` – design input from Jan (photos, sliced plates), git-ignored: phone photos carry GPS EXIF data
- `Gridfinity/web/` – browser generators: Rugged Case (`app/`), boxes (`bin/`), baseplates (`baseplate/`), tool insert (`insert/`),
  label jig (`jig/`: UV printing jig for 10 label plates, xTool O1 Omni 330 × 420 mm)
- `.venv/` – uv venv (`.venv/Scripts/python.exe`): numpy, trimesh, manifold3d, shapely, networkx, scipy, rtree, matplotlib, ezdxf
- `Gridfinity/fusion/` – the Fusion port of the case: `build.py <XxYxZ>`, `validate.py`, `print_export.py` (see its README)
- `site/` – generator website: overview page, `models.json` registry, `build.mjs`, `test.mjs`, self-updating server + Docker (see its README and DEPLOY.md)
- `.github/workflows/` – `site.yml` (push to `main` → test → release `site-<version>`), `server-image.yml` (→ `ghcr.io/jan1409/cad-site`)
- npm workspaces (`Gridfinity/web`, `Christmas/web`, `site`): run `npm install`, `npm test`, `npm run build` and `npm run serve` at the repo root; packages are hoisted to the root `node_modules`

## Fusion
- Fusion exposes an MCP server at `http://127.0.0.1:27182/mcp`, registered user-wide as `fusion`. Its tools only load when Fusion runs
  before the Claude Code session starts. Otherwise use `python -I tools/fusion_mcp.py ...`; it is the same server over direct HTTP.
- Scripts must define `def run(_context: str)`; `print()` output comes back. Build: `python -I tools/fusion_mcp.py run tools/fusion_lib.py <Object>/fusion/cad/<nn_part>.py`.
- Gotchas: new "Untitled" docs are Part documents → call `ensure_hybrid_design()` before adding components.
  `Appearances.itemByName` throws on unknown names, so iterate instead. STL/3MF export of an occurrence ignores its transform.
- API conventions (checked by `Gridfinity/fusion/cad/01_selftest.py`):
  - A **positive** taper angle widens the profile along the extrusion.
  - The xZ plane normal is **+Y**.
  - Sweep paths need `comp.features.createPath(curve, True)`; `adsk.fusion.Path.create` fails in sub-components.
  - Sketch arcs are stored CCW, so `endSketchPoint` is not necessarily where you ended the arc; pick the point by position.
- Verify against references with exact B-rep booleans (`adsk.fusion.TemporaryBRepManager`; see `Gridfinity/fusion/cad/93_bdiff.py`),
  not STL diffs, because Onshape STL tessellation noise (~0.1 cm³) hides real differences.
- Faces that end µm away from a fillet tangent leave sliver faces, and Fusion's STL is then not watertight.
  Let overlapping bodies end well inside each other.
- Unsaved build documents are all called "Untitled": tag them with design attributes (`gridfinity/role`, `gridfinity/ref`) and find them by tag.
- More gotchas (`Skadis/fusion/README.md`): hidden occurrences export as empty files; a component that had several
  occurrences keeps its name after deletion ("Plug (1)"); in parametric designs `occ.transform2` needs a position
  snapshot (`design.snapshots.add()`); `Occurrence.boundingBox` is empty, use a proxy body's box.
- Sketch axes: x-plane sketch x → −Z, y → +Y; y-plane sketch x → +X, y → −Z (text on the front face needs a 180° flip).

## SolidCraft
- Jan designs new parametric models in SolidCraft (`D:\CreativeProjects\Solidcraft_Models`); snapshots of the master `.sc`
  go into `<Object>/solidcraft/`. MCP server `solidcraft` (app on 127.0.0.1:27878, tools load only when the app runs);
  call `skill_reference {"skill":"solidcraft-modeling"}` before building.
- `C:\Program Files\SolidCraft\solidcraft-cli.exe` runs headless: `run <script.json> --in design.sc --out x.step [--save y.sc]`
  rebuilds with other parameters in ~2 s (`{"commands":[{"command":"parameters.change","params":{"changes":{"H":"150"}}}]}`),
  `eval` measures, `script` dumps the timeline, `render ... --transparent` makes card images. `.sc` is a ZIP with `document.json`.
- Constraint-solved sketch fillets start from the saved solution and can flip on another parameter path (v2 tree:
  H 120 → 168 → 235 differs from 120 → 235). New sketches: points as closed-form expressions (`tree_sc_v3.mjs`).
- Variants of one design are configuration rows (`config.row` / `config.activate`, they work headless too); new rows can
  be scripted onto Jan's file with `timeline.add` + commands (`Christmas/web/node/tree_sc_v3.mjs`), leaving his file as it is.
- Browser generators port the `.sc` equations to replicad and are checked against `solidcraft-cli` STEPs with exact
  booleans (`Christmas/web/node/tree_check.mjs`). SolidCraft writes no slicer paint.
- replicad's `measureVolume` integrates spherical faces coarsely (0.15 mm³ off): exact checks use
  `oc.BRepGProp.VolumePropertiesGK(shape, props, 1e-9, false, false, false, false, false)`. Long Node runs with many
  builds end in failing booleans (the WASM heap only grows): one child process per probe or set.

## Painted 3MF (multi-colour)
- Paint per triangle, whole triangles only (split the mesh at the colour boundaries first): state n = filament n, code
  1 `4`, 2 `8`, 3 `0C`, 4 `1C` (uppercase hex). Bambu Studio / Orca: `paint_color`; PrusaSlicer: `slic3rpe:mmu_segmentation`
  (+ `slic3rpe:Version3mf`/`MmPaintingVersion` = 1), and it falls back to `paint_color`. Write no `Application` metadata and no
  `Metadata/` configs (a partial config replaces the user's presets). Writer: `Christmas/web/src/paint3mf.js`.
- Slicer CLIs: PrusaSlicer needs `--center 180,180` (objects at the origin are "outside"); Bambu's CLI cannot use its
  system presets (inherited values stay unresolved, two filament files crash it), so `slice_paint_check.py` slices a copy
  wrapped as a Bambu project with complete settings (`Christmas/reference/bambu_x1c_2pla_project_settings.config`).
  OrcaSlicer is the Microsoft Store install (`C:\Program Files\WindowsApps\OrcaSlicer.OrcaSlicer_<version>_x64__…`): pass it
  absolute paths (it does not start in the caller's folder) and tag projects as it does (`BambuStudio-02.08.01.55` + `OrcaSlicer`).

## Onshape
- `onshape_api.py` reads `ONSHAPE_ACCESS_KEY` / `ONSHAPE_SECRET_KEY` from the env, or from the Windows user registry if VS Code wasn't restarted.
- **Free plan → small yearly API quota.** Use `--anon` for public documents (feature trees, elements); check usage with `quota`.
  Configuration, variables, parts and exports need the keys. Part IDs can change between configurations, so list `parts` per config.
- The official Onshape Labs FeatureScript MCP is registered user-wide as `onshape` (OAuth via `/mcp`).

## Browser generators
- Kernel: `replicad` 1.1.0 + `replicad-opencascadejs` 1.1.0 (OpenCascade WASM, 23 MB raw, 7 MB gzipped). The same
  geometry module runs in Node (validation) and in a Web Worker (page). Example: `Gridfinity/web/` (see its README).
- OpenCascade pitfalls:
  - Never fuse/cut with a compound of overlapping solids; fuse pairwise and group disjoint cut tools.
  - replicad's fuse/cut end with UnifySameDomain, which can throw after a successful boolean: keep a raw
    `BRepAlgoAPI_Fuse/Cut` fallback. Prefer volume overlap to face-only contact between pieces.
  - Test the whole parameter range (a sweep), not just the reference sizes: only 3×3 failed.
  - The fillet always follows tangent chains, so cut special edge rounds explicitly.
  - Don't end faces exactly on a fillet tangent (sliver faces → non-watertight STL).
  - replicad's `translate`/`rotate` consume their input; `clone()` first.
- claude.ai Artifact hosting:
  - Artifacts can't fetch from CDNs at runtime, so ship the libraries and the kernel as the page's own files (`files`).
  - `.gz` is not a served type; the gzipped kernel goes as `.wasm`, and the worker gunzips it (DecompressionStream).
    Limit: 15 MB per binary file.
  - Downloads need the `downloads` capability. Its allowlist has no STL/3MF, so offer a ZIP (fflate) plus SVG/MD.
- Generator site (home server, `http://<server>:8642`): the GitHub repo is `jan1409/cad-projects` (private).
  - A push to `main` publishes a release, and the container installs it within 15 min (or via "Check for updates").
  - The overview page has sections (`site/sections.json`: Gridfinity, SKÅDIS models, Christmas; later SKÅDIS parametric); every
    `models.json` entry names its `section` and a `kind`: `generator` (default) or `download`.
  - A generator page needs a `<!--site:nav-->` marker in its `index.html` and must reference the shared libraries as
    `./vendor/…`. Register it in `site/models.json` and add a smoke build to `site/test.mjs`.
  - Download models (ready-made, e.g. from Fusion) all use `site/download/`; their content is `<Object>/models/<slug>/`
    (`model.json`, `card.png`, `images/`, `files/` with STL/3MF/STEP ≤ 10 MB, every file listed). The `model registry`
    test checks them; see `site/README.md`.
  - Card images: transparent Fusion screenshot, cropped and palette-quantised (~40 KB). For web-only models, export a
    coloured STEP (`R.exportSTEP([{shape, color}])`), import it into a temporary Fusion doc, then screenshot it.
  - Several models can share one app: `variant` in `site/models.json` → `model.json` next to the page (Gridfinity boxes).
  - English and German: `site/shared/i18n.js` (→ `vendor/i18n.js`) picks the language (`?lang=`, stored choice, browser)
    and re-renders in place on `langchange`. Every visible text is `{en, de}`: in `models.json`, the spec labels, and the
    `strings.js` dictionaries (`site/portal/`, `Gridfinity/web/src/`). German uses "du"; Rugged Case/Baseplate/Box stay.
    - Write whole sentences with `{placeholders}` (`{v:1}` = 1 decimal, comma in German), never glued fragments, and
      only literal keys: `npm test` checks that every key exists, is used, and has both languages.
    - File names stay English; build sheets are written at download time in the page's language.
    - Don't name a local `t`: it shadows the translator (an empty file list was the result once).
- Gridfinity boxes: official dimensions in `Gridfinity/spec/gridfinity_standard.md` (from gridfinity-rebuilt's
  `standard.scad`; the spec site only has drawings). Jan's Onshape box templates match them to 4 µm.
- Gridfinity baseplates: `Gridfinity/spec/baseplate_spec.md`. Check boxes against baseplates with `plate_fit.mjs`;
  it found that a box bridge from 4.75 hits the baseplate ridges (they reach 5.0), so boxes now bridge at 5.0.
- Stacking: a box set on top seats at T − 0.35 (T = 7n), its feet dip into the opening; anything inside must stay
  below that (`stack_fit.mjs`). That is why the label plate sits 0.5 mm below T (`plate_drop`; Onshape: flush).
- Gridfinity tool insert (`Gridfinity/spec/insert_spec.md`, `Gridfinity/web/insert/`): tools traced from a photo on a
  sheet of paper, entirely in the browser.
  - OpenCV.js (`@techstark/opencv-js`, one 13 MB file with embedded WASM): the module worker does
    `await import("./vendor/opencv.js")`, then `await globalThis.cv`. Node must `require` it (its Node branch calls require).
    `Mat.clone()` (5.0.0-release.1) shares the pixels with the original: copy with `src.copyTo(new cv.Mat())`.
  - Polished metal is about as bright as the paper: the tracer finds it through edges (Canny, closed into regions), not tone.
  - 2D offsets: `clipper-lib` 6.4.2. `clipper2-js` 1.2.4 returns broken offsets. The site ships it as
    `vendor/clipper.js` with `export default globalThis.ClipperLib` appended; modules get it through `setClipper()`.
  - Test the tracing on synthetic photos (`trace_check.mjs`), not only by eye: it found a 0.6 px corner bias.
- Reference STEPs: `node Gridfinity/web/node/step2stl.mjs` splits solids; compare exactly with replicad booleans
  (`bin_check.mjs`) – no Fusion needed for web-only models.

## Release checks
- `npm test` must pass before pushing; CI runs the same suite (geometry min/default/max, site build, server, updater against a fake GitHub).
- A test that blocks its process (`execFileSync`) for more than 5 s between requests to a Node server reuses keep-alive
  sockets the server has closed (ECONNRESET): yield to the event loop first (the updater test's `publish`).

## Conventions
- Run stdlib tools with `python -I`. `-I` ignores PYTHONIOENCODING, so the tools call `sys.stdout.reconfigure(encoding="utf-8")`.
- Bash heredocs mangle backslash escapes (Python and JS alike). Write non-trivial patch scripts with the Write tool first.
- GNU tar (Git Bash) reads `D:/…` as a remote host, so pass relative paths (and `cwd`).
- PrusaSlicer CLI: `--merge` segfaults, so build multi-object plate 3MFs yourself (`tools/threemf.py`) and slice with `--dont-arrange`;
  boolean options are bare flags (`--no-binary-gcode` for readable G-code; the XL writes binary G-code by default).
  `--support-material --support-material-auto` + counting `;TYPE:Support material` finds overhangs. Profiles: see `Skadis/fusion/README.md`.
- Validate every generated part against the references (`stl_check.py`, or trimesh volume/bbox diffs) before calling it done.
