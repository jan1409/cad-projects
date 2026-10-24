# CAD_Projects

Workspace for 3D-printing designs. Each object lives in its own folder (`Gridfinity/`, …); `tools/` is shared.
Printer: Prusa XL (360 × 360 mm bed). Units: mm everywhere.

## Layout
- `tools/` – shared helpers (stdlib Python unless noted)
  - `fusion_mcp.py` – client for Fusion's built-in MCP server (`ping`, `run`, `screenshot`, `doc`, `read`)
  - `fusion_lib.py` – Fusion API helpers (mm wrappers, `Sk` sketch helper, extrude/fillet/chamfer, `set_par`, `report`); prepend it to part scripts
  - `onshape_api.py` – Onshape REST client (`whoami`, `quota`, `elements`, `features`, `configuration`, `variables`, `parts`, `stl`, `step`)
  - `onshape_summarize.py` – readable summary of a Part Studio feature tree
  - `onshape_sketches.py` – sketches of a feature tree in mm (entities, dimensions, plane); `--png` renders them (venv)
  - `stl_check.py` – size, volume, watertightness, bed contact (`--bed 360x360`)
  - `stl_section.py` – planar sections of STLs overlaid in a PNG, `--vertices` prints exact outlines (venv); use it to overlay generated parts on references
- `<Object>/` – `onshape/` (source snapshots), `reference/` (ground-truth exports), `spec/`, `fusion/cad/`, `web/`, `export/` (git-ignored)
- `.venv/` – uv venv (`.venv/Scripts/python.exe`): numpy, trimesh, manifold3d, shapely, networkx, scipy, rtree, matplotlib, ezdxf
- `Gridfinity/fusion/` – the Fusion port of the case: `build.py <XxYxZ>`, `validate.py`, `print_export.py` (see its README)
- `site/` – generator website: overview page, `models.json` registry, `build.mjs`, `test.mjs`, self-updating server + Docker (see its README and DEPLOY.md)
- `.github/workflows/` – `site.yml` (push to `main` → test → release `site-<version>`), `server-image.yml` (→ `ghcr.io/jan1409/cad-site`)
- npm workspaces (`Gridfinity/web`, `site`): run `npm install`, `npm test`, `npm run build` and `npm run serve` at the repo root; packages are hoisted to the root `node_modules`

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
  - A model page needs a `<!--site:nav-->` marker in its `index.html` and must reference the shared libraries as `./vendor/…`.
    Register it in `site/models.json` and add a smoke build to `site/test.mjs`.
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
- Reference STEPs: `node Gridfinity/web/node/step2stl.mjs` splits solids; compare exactly with replicad booleans
  (`bin_check.mjs`) – no Fusion needed for web-only models.

## Release checks
- `npm test` must pass before pushing; CI runs the same suite (geometry min/default/max, site build, server, updater against a fake GitHub).

## Conventions
- Run stdlib tools with `python -I`. `-I` ignores PYTHONIOENCODING, so the tools call `sys.stdout.reconfigure(encoding="utf-8")`.
- Bash heredocs mangle backslash escapes (Python and JS alike). Write non-trivial patch scripts with the Write tool first.
- GNU tar (Git Bash) reads `D:/…` as a remote host, so pass relative paths (and `cwd`).
- PrusaSlicer CLI: `--merge` segfaults, so build multi-object plate 3MFs yourself and slice with `--dont-arrange`; boolean options are bare flags.
- Validate every generated part against the references (`stl_check.py`, or trimesh volume/bbox diffs) before calling it done.
