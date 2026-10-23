# Gridfinity Rugged Case – Fusion port

A parametric rebuild of the Onshape "Gridfinity Rugged Box_1" in Fusion. The geometry follows `../spec/case_params.json`.
It is verified against the Onshape originals by exact B-rep booleans: see [VALIDATION.md](VALIDATION.md).

## Run from Claude Code / the terminal (Fusion must be running)
```
python -I Gridfinity/fusion/build.py 5x4x6                      # build all parts + STL export (assembled position)
python -I Gridfinity/fusion/build.py 6x3x5 --wt 2.0             # any size (3-8 x 3-8 x 4-8) / window thickness
python -I Gridfinity/fusion/build.py 5x4x6 --gap 0              # window_gap 0 = exact Onshape original (default 0.2)
.venv/Scripts/python.exe Gridfinity/fusion/print_export.py 6x3x5 --wt 2.0
                                                                # print-oriented STLs, window SVG, BUILD_SHEET.md
python -I Gridfinity/fusion/validate.py                         # regression: rebuild + exact compare of all reference configs
```
- Builds go into the Fusion document tagged `gridfinity/role = case-build` (`cad/00_doc.py`).
  That is "Gridfinity Tools / Gridfinity Rugged Case" when it is open; otherwise a new unsaved one is created.
  Building never saves; `--steps save` stores a new version.
- Sizes are limited to 3–8 × 3–8 × 4–8 (`--force` bypasses this; only `validate.py` uses it for the Onshape reference 3×2×4).
- Single steps: `--steps doc,base,lid,latch,seal,window,report,export`.
  Comparison steps: `ref` (open the reference STEP for this config), `bdiff` (exact B-rep difference), `faces` (face-type histogram).
- Outputs:
  - `../export/fusion/<tag>/`: STL per part, assembled.
  - `../export/print/<tag>/`: print-ready STLs, `*_Window_<t>mm.svg`, `BUILD_SHEET.md` (quantities, M3 screws, print-pause height).

## Run inside Fusion
The script folder is linked (directory junction) into Fusion's personal scripts folder:
`%APPDATA%\Autodesk\Autodesk Fusion 360\API\Scripts\GridfinityRuggedCase` → `FusionScript/GridfinityRuggedCase`.
So it appears under *My Scripts* (Utilities > Add-Ins > Scripts and Add-Ins, shortcut Shift+S), and edits in the workspace apply immediately.
Run it on any open design and enter `x, y, z, window_t[, window_gap]`. It builds the case into that design, using the same code as `build.py`.
The workspace must stay where it is, because the script loads `tools/fusion_lib.py` and `cad/*.py` relative to its real path.

The saved Fusion document is **Gridfinity Tools / Gridfinity Rugged Case**. `build.py` finds it by its design attribute
(`gridfinity/role = case-build`) once it is open. After a rebuild, save a new version in Fusion if you want to keep it.

## Files
| File | Purpose |
|---|---|
| `cad/_case.py` | spec loader + helpers: rounded polygons (same math as the browser generator will use), wall sweeps, cell sketches, taper extrudes, teardrop holes |
| `cad/00_doc.py` | find/create the build document, set the user parameters x_count, y_count, z_count, window_t |
| `cad/10_base.py` … `50_window.py` | one script per part |
| `cad/90_report.py`, `95_export.py` | bounding boxes/volumes, STL export |
| `cad/91_ref.py`, `92_faces.py`, `93_bdiff.py` | open the reference STEP, compare face statistics, exact B-rep differences |
| `cad/01_selftest.py` | checks the Fusion conventions the build relies on (taper sign, plane normals, sweeps) |
| `build.py`, `validate.py`, `compare.py`, `print_export.py` | drivers (compare.py = STL-level comparison with manifold3d) |
