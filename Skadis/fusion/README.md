# SKÅDIS models in Fusion

Script-built accessories for the IKEA SKÅDIS pegboard (grid and hook tab: `../spec/skadis_spec.md`). Each model has
its own Fusion document, found by the attribute `skadis/role = <model>-build` (unsaved documents are all "Untitled").
Fusion must be running; the scripts go through its MCP server (`tools/fusion_mcp.py`).

Axes: X along the board (facing the board, +X points to the left), Y out of the board (front face Y = 0), Z up. mm.

## Commands (from the repository root)

```bash
python -I Skadis/fusion/build.py fit-test            # 9 hook-tab tokens (tab width x gap)
python -I Skadis/fusion/build.py roll-test           # hub ring + 3 mini plugs (bayonet click, brake strength)
python -I Skadis/fusion/build.py roll-holder         # brackets, plug, board/roll context, checks, export
python -I Skadis/fusion/build.py roll-holder --set tab_w=4.4 --set brake_interf=0.5   # other values
python -I Skadis/fusion/build.py roll-holder --steps pose --pose pulled               # picture of a roll change
.venv/Scripts/python.exe Skadis/fusion/print_export.py roll-holder   # print files -> ../models/roll-holder/files/
.venv/Scripts/python.exe Skadis/fusion/print_export.py first-test    # tokens + test pieces on one plate (export/print/)
```

Parameters: `../spec/skadis_params.json` (shared tab and grid) and `../spec/roll_holder_params.json`. `00_doc` writes
them into the document as user parameters (documentation only; the steps read the values from the build).

## Files

| Path | Content |
|---|---|
| `build.py` | Driver: prepends the parameters, `tools/fusion_lib.py`, `cad/_skadis.py` (+ model library) to each step |
| `cad/_skadis.py` | Outlines (polar arcs, rounded polygons), `hook_tab`, `fit_token`, `skadis_board`, labels, appearances, `fresh_component`, `place` |
| `cad/00_doc.py`, `90_report.py`, `95_export.py` | Build document, body report, STL + STEP export to `Skadis/export/<model>/` |
| `cad/fit_test/10_tokens.py` | Fit tokens on a board section |
| `cad/roll_holder/_roll.py` | Hub bayonet features, plug (lugs, detent bumps, brake springs), test ring, exact-check helpers |
| `cad/roll_holder/05_test.py` | Test pieces and a plug-turning check |
| `cad/roll_holder/10_bracket.py`, `20_plug.py`, `30_context.py` | Brackets, plug (+ context copy `_Plug_R`), board and roll |
| `cad/roll_holder/80_check.py` | Exact interference checks (TemporaryBRepManager) |
| `cad/roll_holder/85_pose.py` | Plug poses for pictures |
| `print_export.py` | Print orientation, 3MF plate (`tools/threemf.py`), STEP copies, `tools/stl_check.py` |

## Design notes

- Hook tab: shank 7 mm high through the board, lip 6 mm down behind it, 13 mm in all, with 1 mm chamfers on both
  ends so it passes the rounded 15 mm slot. Mount: insert it about 6 mm higher, push it in, lower it.
- Every tab is flush with its part's print-bed face, so the L-profile lies in the layer plane (the strongest way to
  print a hook) and nothing needs support. Consequence: one slot column of tabs per part.
- Roll holder: the brackets sit 8 pitches (320 mm) apart and are mirror images. The plug is one part for both
  sides: the right hub's bayonet is not mirrored but rotated (frame sign `s` in `_roll.py`). The plug carries every
  part that flexes (lug arms with detent bumps), so it is cheap to reprint.
- The roll runs loose on the plug (Ø 28 in a 30 mm core). Brake springs exist in the code (`brake_interf` > 0), but the
  2026-11 test pieces (0.5 / 1.0 / 1.5 mm) were all too tight, so they are off by default.
- `80_check` expects 0 mm³ everywhere except the detent bumps while turning (and brake pads, if switched on).
- Slice check: `prusa-slicer-console.exe --datadir "%APPDATA%\PrusaSlicer" --printer-profile "Original Prusa XL - 5T
  Input Shaper 0.4 nozzle" --print-profile "0.20mm STRUCTURAL @XLIS 0.4" --material-profile "Generic PETG @XL"
  --no-binary-gcode --dont-arrange --export-gcode -o out.gcode plate.3mf`. Add `--support-material
  --support-material-auto` and look for `;TYPE:Support material` to find overhangs; `--perimeters 4 --fill-density 25%`
  for the times on the download page.

## Fusion gotchas found here

- Hidden occurrences export as empty STL/STEP files: `95_export` turns them on first (`tools/fusion_view.py
  --show-only` hides components).
- A component that had several occurrences keeps its name after they are deleted (the new one becomes "Plug (1)"),
  for the rest of the document's life. So no extra occurrences: the second plug is a context copy.
- In a parametric design an occurrence move (`transform2`) only sticks with a position snapshot (`place()`).
- `Occurrence.boundingBox` came back empty; the proxy body's box (`occ.bRepBodies.item(0)`) is in assembly position.
