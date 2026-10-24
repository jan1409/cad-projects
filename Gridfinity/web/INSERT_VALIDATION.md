# Tool insert validation

Rules: `../spec/insert_spec.md`. State of 2026-10-24. All checks run in CI through `site/test.mjs` (smallest, several
tools, tallest box; stacking; tracing).

## Geometry sweep (`node node/insert_build.mjs --sweep`)

Fixture tools from `node/fixtures/tools.json`, each configuration in its own process. Every box is a closed mesh
(no open STL edges, vertices welded at 1 µm).

| Config | Size | Insert top mm | Tools | Box cm³ | open STL edges | build s | result |
|---|---|---|---|---|---|---|---|
| caliper | 6×2×4 | 27.15 | 1 | 438.03 | 0 | 1.4 | ok |
| pliers | 5×1×4 | 27.15 | 1 | 162.94 | 0 | 0.9 | ok |
| lenscap | 2×2×3 | 20.15 | 1 | 106.66 | 0 | 0.8 | ok |
| bit | 1×1×3 | 20.15 | 1 | 30.07 | 0 | 0.6 | ok |
| coin | 1×1×2 | 13.15 | 1 | 20.29 | 0 | 0.6 | ok |
| camera | 2×5×4 | 27.15 | 3 | 303.42 | 0 | 1.5 | ok |
| mixed | 8×4×4 | 27.15 | 4 | 1192.73 | 0 | 3.8 | ok |
| caliper_no-magnets | 6×2×4 | 27.15 | 1 | 441.85 | 0 | 1.0 | ok |
| mixed_no-magnets | 8×4×4 | 27.15 | 4 | 1202.92 | 0 | 2.6 | ok |
| coin_x_1_y_1_z_2 | 1×1×2 | 13.15 | 1 | 20.29 | 0 | 0.6 | ok |
| bit_z_25 | 1×1×25 | 174.15 | 1 | 293.43 | 0 | 0.5 | ok |
| lenscap_z_12_lower_30 | 2×2×12 | 53.15 | 1 | 349.92 | 0 | 0.8 | ok |
| camera_x_7_y_3 | 7×3×4 | 27.15 | 3 | 810.47 | 0 | 2.4 | ok |
| pliers_clearance_0 | 5×1×4 | 27.15 | 1 | 166.02 | 0 | 0.8 | ok |
| pliers_clearance_3 | 5×2×4 | 27.15 | 1 | 378.36 | 0 | 1.3 | ok |
| caliper_depth_10 | 6×2×4 | 21.15 | 1 | 366.26 | 0 | 1.4 | ok |
| mixed_z_8 | 8×4×8 | 55.15 | 4 | 2765.88 | 0 | 3.9 | ok |

Also checked by hand: a 7 mm bit does not fit a 2-unit box (pocket floor 6.2 + 7 > 13.15) and a manual footprint
smaller than the layout is refused (`tooSmall`). Sections of the caliper box: insert surface 27.15, pocket floor
10.65 (16 mm caliper + 0.5), magnet holes and stacking lip unchanged.

## Stacking (`node node/stack_fit.mjs`)

A standard box of the same footprint set onto the box below (seated: z = 0 at T − 0.35); the tools are prisms of their
outline and height standing in their pockets.

| box below | upper box | overlap mm³ | expected | result |
|---|---|---|---|---|
| standard 1×1×3 | lifted 0.01 | 0.000 | free | ok |
| standard 1×1×3 | lowered 0.05 | 10.673 | touches | ok |
| label 1×1×3 + plate | lifted 0.01 | 0.000 | free | ok |
| label 1×1×3 + plate | lowered 0.05 | 10.673 | touches | ok |
| standard 2×2×6 | lifted 0.01 | 0.000 | free | ok |
| standard 2×2×6 | lowered 0.05 | 20.597 | touches | ok |
| label 2×2×6 + plate | lifted 0.01 | 0.000 | free | ok |
| label 2×2×6 + plate | lowered 0.05 | 20.597 | touches | ok |
| insert caliper 6×2×4 | lifted 0.01 | 0.000 | free | ok |
| insert caliper 6×2×4 | lowered 0.05 | 40.443 | touches | ok |
| insert camera 2×5×4 | lifted 0.01 | 0.000 | free | ok |
| insert camera 2×5×4 | lowered 0.05 | 35.482 | touches | ok |
| insert caliper 6×2×4, tools stick out 4 | lifted 0.01 | 0.000 | free | ok |
| insert caliper 6×2×4, tools stick out 4 | lowered 0.05 | 40.443 | touches | ok |
| insert lenscap 2×2×6, lowered 8 | lifted 0.01 | 0.000 | free | ok |
| insert lenscap 2×2×6, lowered 8 | lowered 0.05 | 20.597 | touches | ok |
all ok

**Label box:** the first run found that the label plate, flush with the wall top T as in the Onshape design,
carried a box set on top 0.35 mm high (overlap z T − 0.34 … T across the plate). Since 2026-10-24 the plate and its
ledge sit 0.5 mm lower (`plate_drop`, see `BIN_VALIDATION.md`); label boxes now stack like standard boxes.

## Tracing (`node node/trace_check.mjs`)

Synthetic photos (3000 × 2250 px): an A4 sheet on a dark desk, tools from the fixtures (one red), drop shadows to the
bottom right (25 % darker, hard light 42 %), a lighting gradient (25 %, hard light 45 %), perspective from the
camera, blur 0.8 px and noise. Compared with the drawn outlines: bounding box, mean offset (area difference per
perimeter length; positive = traced outline larger) and the distance between the outlines both ways.

| scene | tool | size drawn mm | size traced mm | edges Δ mm (left right bottom top) | mean offset mm | deviation mm p95 / max | result |
|---|---|---|---|---|---|---|---|
| frontal | Caliper 150 | 73.00 × 235.00 | 73.40 × 235.00 | 0.00 0.40 0.00 0.00 | 0.11 | 0.40 / 1.00 | ok |
| frontal | Lens cap 58 | 57.98 × 57.99 | 58.20 × 58.40 | -0.09 0.31 0.11 0.30 | 0.16 | 0.41 / 0.48 | ok |
| frontal | (sheet found, 2 piece(s), 1.4 s) | | | | | | |
| tilted | Caliper 150 | 75.27 × 235.42 | 75.60 × 235.20 | 0.06 0.26 -0.01 -0.21 | 0.13 | 0.37 / 1.00 | ok |
| tilted | Battery | 38.00 × 70.00 | 38.20 × 70.20 | 0.10 0.10 0.10 0.10 | 0.10 | 0.10 / 0.10 | ok |
| tilted | (sheet found, 2 piece(s), 1.1 s) | | | | | | |
| landscape | Pliers | 180.71 × 39.91 | 180.80 × 40.19 | 0.15 -0.05 0.15 0.13 | 0.16 | 0.32 / 0.39 | ok |
| landscape | Bit | 18.00 × 24.83 | 17.80 × 24.60 | -0.10 -0.10 -0.11 -0.11 | 0.12 | 0.23 / 0.27 | ok |
| landscape | (sheet found, 2 piece(s), 1.2 s) | | | | | | |
| hard light | Pliers | 39.91 × 180.71 | 40.20 × 180.60 | -0.05 0.35 -0.05 -0.05 | 0.21 | 0.49 / 0.56 | ok |
| hard light | Lens cap 58 | 57.98 × 57.99 | 58.40 × 58.40 | 0.11 0.31 0.30 0.10 | 0.21 | 0.51 / 0.63 | ok |
| hard light | (sheet found, 2 piece(s), 2.1 s) | | | | | | |

Limits (normal / hard light): size within 0.5 / 0.8 mm, mean offset within 0.25 / 0.4 mm, 95 % of the outline within
0.45 / 0.6 mm, nothing beyond 1.5 mm (the drawn shapes have sharp concave corners, which the 1 mm closing rounds).
The sides away from the shadow are within ±0.1 mm; the shadow side grows by 0.3–0.55 mm, which the default clearance of
0.6 mm per side absorbs.

Found while building the check: the sheet corners came out 0.6 px inside on two sides (the contour runs through the
outermost paper pixels, and the scale back from the detection image ignored pixel centres), which shifted every outline
by about 0.1 mm. Fixed in `refineCorners` / `findSheet`.

Real photos are not in the suite yet: `node node/trace_check.mjs <photo.jpg> [--paper A4] [--png dir]` traces one and
lists the tools found.

## Browser

Chrome, local site build: the page loads OpenCV.js in the module worker (`import` sets `globalThis.cv`), finds the
sheet in a synthetic photo, traces two pieces, adds them to the layout next to two shapes, drags and overlaps (warning
shown), builds a 2 × 3 × 4 box in 1.2 s, switches between German and English in place. No console errors.
