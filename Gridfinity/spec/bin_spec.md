# Gridfinity boxes (bins) – spec

Two models on the generator site share one geometry module (`../web/src/bin.js`), one page (`../web/bin/`) and one
parameter file (`bin_params.json`):

| Model | Width × length | Height | Extras |
|---|---|---|---|
| Gridfinity Standard Box | 1–10 × 1–10 cells | 2–30 units | magnet holes (optional) |
| Gridfinity Box with Label | 1–10 × 1–10 cells | 3–30 units | label ledge + label plate on the back (+Y) wall, scoop at the front (−Y) |

Frame: centred in X/Y, z = 0 under the feet. Width = X (Onshape "Breite"/slotsWide), length = Y ("Laenge"/slotsDeep),
height in 7 mm units ("Hoehe"/slotHeight).

## Sources

- **Standard box:** Onshape "TemplateBox_HeightAdjust" (Part Studio "Template", the version the label box derives).
  - It has the same 25 features as "TemplateBox" (the linked document), but its height is `HeightUnit (7 mm) × slotHeight`.
  - "TemplateBox" uses `42 mm × slotHeight`, which is not the Gridfinity height unit.
- **Label box:** Onshape "Gridfinity_box_Beschriftung" (Part Studio "GridFinityStorageWithLabel").
  - It derives the template and adds the label ledge, the plate ("Beschriftungsplatte") and the scoop.
  - The "Base" part is a kept boolean tool (z −1…4, 42 mm cells) and is not printed.
  - The dividers behind the rollback bar are inactive.
  - The `Label_Text` configuration is not used by any feature.
- Snapshots: `../onshape/bin_*`. References: `../reference/bins/*.step` (std 1×1×3 and 2×3×6, label 1×2×3 and 5×4×6).

## Geometry

**Official** (see `gridfinity_standard.md`):
- **Outline:** 42·n − 0.5, r 3.75.
- **Feet per cell:** 0.8 / 1.8 / 2.15, bottom 35.6.
- **Bridge:** the bottom between the feet starts at z 5.0. The feet continue vertically from 4.75 to 5.0, because the
  baseplate ridges between cells reach 5.0 (`baseplate_params.json`, checked by `../web/node/plate_fit.mjs`).
- **Stacking lip:** 0.7 / 1.8 / 1.9 above the wall top T = 7·h, apex r 0.6, so the top is at T + 3.55.
- **Magnet holes:** Ø 6.5 × 2.4 at ±13.

**Jan's design** (not standardised):
- **Wall and floor:** wall 1.2; floor top 6.2.
- **Under the lip:** a 1.2 high vertical support at the lip depth (2.6). Below it, the inner wall leans out at 10° to the
  1.2 wall (starting at T − 9.14).
- **Label ledge**, along X on the +Y inner wall:
  - Top at T − 1.45.
  - 13 deep from the inner wall, 0.95 front edge.
  - Supported at 60° from the wall.
  - It runs into the side walls; its back is the lip-support plane.
- **Label plate:** fills the pocket between ledge front and lip, flush with the wall top.
  - Size: (W − 5.2) × 11.6 × 1.45; for 1 cell 36.3 × 11.6.
  - Printed flat and UV-printed.
  - `plate_gap` (default 0, like the Onshape plate) shrinks it per side.
- **Scoop:** a concave quarter round between floor and the −Y inner wall, across the width, r = min(25, T − 7.9).

## Differences from the Onshape designs

Exact B-rep comparison: `../web/node/bin_check.mjs`, results in `../web/BIN_VALIDATION.md`.

| Where | Onshape | Generator | Why |
|---|---|---|---|
| Lip depth / lower lip step | 2.596 / 0.696 | 2.6 / 0.7 | official values; Onshape reuses the baseplate's 4.646 (0.004 mm) |
| Between the feet, z 4.75–5.0 | V groove (the feet's 45° faces continue to the cell line) | 0.5 wide rectangular groove | both clear the baseplate ridge; the rectangle keeps the feet disjoint for OpenCascade (18 mm³ for 2×3) |
| Scoop | arc r 25 at every height, ending 3 mm short of tangent at the wall | tangent quarter round, r limited to T − 7.9 | Onshape's scoop reaches into the lip at 4 units and rises 3.9 mm above it at 3 units |

Everything else matches to < 0.001 cm³.

## Rugged Case fit

A box h units high fits a closed Rugged Case of z_count n ≥ h: the stacking lip clears the lid by 1.0–1.25 mm. This
holds over the whole floor, in corner cells and in centre cells, for n = 5, 12 and 25
(`../web/node/bin_case_fit.mjs`). The footprint must fit the case's x × y (3–8). The box pages show the smallest case,
and the case page shows the tallest box.
