# Gridfinity baseplates – validation

Generated with `src/baseplate.js` on 2026-10-24. Spec and design notes: `../spec/baseplate_spec.md`.

There is no Onshape baseplate to compare against. The baseplates are checked in three ways:
- against the official profile, using exact boolean fits with the boxes;
- for closed meshes and exact sizes over the whole parameter range;
- for the layout rules (`site/test.mjs`).

## Boxes on the baseplate (exact B-rep booleans)

`node node/plate_fit.mjs` builds a 3 × 3 baseplate without and with a 4 mm bottom plate. It intersects it with
standard boxes from `src/bin.js` (3 units, no magnets) standing on the pocket floor (z = b). Overlap volumes are in mm³.
The upper 45° band is z b+2.85…b+5 and the lower one b+0.35…b+1.05.

| bottom plate | box | move | overlap | upper 45° | lower 45° | result |
|---|---|---|---|---|---|---|
| none | corner cell | lifted 0.01 | 0.000 | 0.000 | 0.000 | free |
| none | corner cell | lowered 0.05 | 17.846 | 14.407 | 3.075 | touches both faces |
| none | corner cell | lifted 0.01, shifted 0.3 | 35.608 | 23.461 | 6.387 | touches |
| none | centre cell | lifted 0.01 | 0.000 | 0.000 | 0.000 | free |
| none | centre cell | lowered 0.05 | 17.846 | 14.407 | 3.075 | touches both faces |
| none | 2 × 2 cells | lifted 0.01 | 0.000 | 0.000 | 0.000 | free |
| none | 2 × 2 cells | lowered 0.05 | 73.557 | 59.800 | 12.301 | touches both faces |
| 4 mm | corner cell | lifted 0.01 | 0.000 | 0.000 | 0.000 | free |
| 4 mm | corner cell | lowered 0.05 | 81.363 | 14.407 | 3.075 | touches both faces and the floor |
| 4 mm | 2 × 2 cells | lifted 0.01 | 0.000 | 0.000 | 0.000 | free |
| 4 mm | 2 × 2 cells | lowered 0.05 | 327.624 | 59.800 | 12.301 | touches both faces and the floor |

(Excerpt; the tool prints 18 rows, all as expected.) The box foot therefore seats on both 45° faces and the floor at
the same time, as the standard intends.

**Bridge fix.** The first run failed for the 2 × 2 box: 18.1 mm³ of overlap while lifted, all in the upper band. The
box bridge between the feet started at z 4.75, but the baseplate ridges between cells reach 5.0. The boxes now bridge at
5.0, as Jan's Onshape template does (`BIN_VALIDATION.md`), and the run is clean.

## Robustness sweep

`node node/plate_build.mjs --sweep` builds each configuration in its own process. For every unique piece it checks:
- the bounding box (width, depth, 5 + b, standing on z = 0);
- open STL edges.

35 configurations, 0 problems: every piece is a closed mesh (0 open STL edges) with the exact bounding box. Selection
(volume per part in cm³, `A×4` = four pieces of part A):

| configuration | layout | parts | build s (Node) |
|---|---|---|---|
| grid 1 × 1 | 42 × 42 × 5, 1 piece | A 1.4 | 0.4 |
| grid 8 × 8 | 336 × 336 × 5, 1 piece | A 92.6 | 11.4 |
| grid 9 × 9 | 378 × 378 × 5, 4 pieces | A 36.2, B 28.9, C 28.9, D 23.2 | 6.7 |
| grid 24 × 24, bottom 8, magnets | 1008 × 1008 × 13, 9 pieces | A×4 975.4, B×5 975.5 | 24.0 |
| grid 5 × 5, bottom 3, magnets | 210 × 210 × 8, 1 piece | A 160.4 | 2.5 |
| drawer 350 × 250, each of the 9 alignments | 8 × 5 cells, 349 × 249 × 5, 1 piece | A 139.6 | 2.6–4.0 |
| drawer 46 × 46 | 1 × 1 cell, 45 × 45 × 5 | A 2.7 | 0.3 |
| drawer 127.3 × 85.3 (0.3 mm spare, dropped) | 3 × 2 cells, 126 × 84 × 5 | A 8.6 | 0.6 |
| drawer 500 × 400, bottom 4, magnets | 11 × 9 cells, 499 × 399 × 9, 4 pieces | A 275.5, B 234.8, C 280.5, D 239.6 | 9.4 |
| drawer 1000 × 1000 | 23 × 23 cells, 999 × 999 × 5, 9 pieces | 7 parts (D×2, E×2) | 38.1 |
| drawer 1000 × 1000, bottom 8, magnets | 999 × 999 × 13, 9 pieces | 7 parts | 74.8 |

The full table is written to `../export/web/plate_sweep.md`. The sharp ridges on the plate edge and on the split lines
needed no special handling. In Chrome, a 4 × 4 plate builds in 2.2 s, 8 × 5 cells in 4.5 s, a 9 × 9 plate with bottom
plate (4 pieces) in 6.8 s, and the 500 × 400 drawer with magnets in 11.3 s.

## Layout checks

`site/test.mjs` ("baseplate layout"). These run without the geometry kernel, in CI before every release:
- Pieces fit the 360 × 360 bed.
- The piece widths and depths add up to the plate size, and the parts' counts and cells add up.
- Every placed piece is its part turned by its quarter turns.
- Drawer fitting, with values checked by hand:
  - 350 × 250 gives 8 × 5 cells, 6.5 + 6.5 side strips and a 39 front strip;
  - right / back moves the strips there;
  - 0.3 mm spare is dropped.
- Splits:
  - 24 × 24 cells: 9 pieces as 2 parts (4 corners, 5 plain 8 × 8);
  - 9 × 9 cells: 4 parts, because the two 5 × 4 corners are mirror images.
