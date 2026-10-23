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
- Kernel: `replicad` 1.1.0 + `replicad-opencascadejs` 1.1.0 (OpenCascade WASM, ~22 MB uncompressed); verified in Node 24 (init ~0.1 s).
- A hosted page (claude.ai Artifact) must load the WASM from jsDelivr/unpkg with exact versions, not embed it (16 MB page limit).

## Conventions
- Run stdlib tools with `python -I`. `-I` ignores PYTHONIOENCODING, so the tools call `sys.stdout.reconfigure(encoding="utf-8")`.
- Bash heredocs mangle Python with backslash escapes. Write non-trivial patch scripts to a file first.
- PrusaSlicer CLI: `--merge` segfaults, so build multi-object plate 3MFs yourself and slice with `--dont-arrange`; boolean options are bare flags.
- Validate every generated part against the references (`stl_check.py`, or trimesh volume/bbox diffs) before calling it done.
