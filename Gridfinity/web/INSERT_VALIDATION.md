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
perimeter length; positive = traced outline larger) and the distance between the outlines both ways. Then Jan's
real photos (`fixtures/photos/`): one piece, at most 200 points, the size as recorded (until measured lengths exist).

| scene | tool | size drawn mm | size traced mm | edges Δ mm (left right bottom top) | mean offset mm | deviation mm p95 / max | result |
|---|---|---|---|---|---|---|---|
| frontal | Caliper 150 | 73.00 × 235.00 | 73.40 × 235.00 | 0.10 0.30 -0.10 0.10 | 0.11 | 0.32 / 1.77 | ok |
| frontal | Lens cap 58 | 57.98 × 57.99 | 58.20 × 58.20 | 0.01 0.21 0.00 0.20 | 0.12 | 0.38 / 0.50 | ok |
| frontal | (sheet found, 2 piece(s), 1.5 s) | | | | | | |
| tilted | Caliper 150 | 75.27 × 235.42 | 75.40 × 235.20 | -0.04 0.16 -0.11 -0.11 | 0.10 | 0.29 / 1.95 | ok |
| tilted | Battery | 38.00 × 70.00 | 38.20 × 70.20 | 0.20 0.00 0.00 0.20 | 0.05 | 0.18 / 0.28 | ok |
| tilted | (sheet found, 2 piece(s), 1.2 s) | | | | | | |
| landscape | Pliers | 180.71 × 39.91 | 180.60 × 40.00 | 0.05 -0.15 0.05 0.05 | 0.14 | 0.25 / 0.32 | ok |
| landscape | Bit | 18.00 × 24.83 | 17.80 × 24.40 | -0.20 0.00 -0.21 -0.21 | 0.13 | 0.23 / 0.38 | ok |
| landscape | (sheet found, 2 piece(s), 1.2 s) | | | | | | |
| hard light | Pliers | 39.91 × 180.71 | 40.20 × 180.60 | 0.05 0.25 0.05 -0.15 | 0.17 | 0.37 / 0.54 | ok |
| hard light | Lens cap 58 | 57.98 × 57.99 | 58.20 × 58.40 | 0.01 0.21 0.20 0.20 | 0.18 | 0.38 / 0.53 | ok |
| hard light | (sheet found, 2 piece(s), 1.7 s) | | | | | | |

| photo | tool | pieces | points | size mm | expected mm | result |
|---|---|---|---|---|---|---|
| pliers.jpg | Needle-nose pliers (Presch 10023) | 1 | 147 | 59.2 × 170.2 | 59.2 × 170.2 (recorded) | ok |
| wrench.jpg | Adjustable wrench 150 mm (ZKH HHT-AWD6) | 1 | 65 | 45.4 × 161.6 | 45.4 × 161.6 (recorded) | ok |

Limits (normal / hard light): size within 0.5 / 0.8 mm, mean offset within 0.25 / 0.4 mm, 95 % of the outline within
0.45 / 0.6 mm, nothing beyond 2.5 mm (the 1 mm closing bridges the caliper's narrow V between its jaws).

History:
- First version (tone only): Jan's photos failed. Polished steel and chrome reflect the paper and have nearly its
  brightness and colour: the wrench came out as 133 × 23 mm (head missing), the pliers' jaws in fragments, and the
  outlines had several hundred points. Since 2026-10-24 edges are a second cue (`toolMask`), the mask is smoothed and
  simplified to 0.25 mm, and a brush corrects what is left.
- The sheet corners came out 0.6 px inside on two sides (the contour runs through the outermost paper pixels, and the
  scale back from the detection image ignored pixel centres), which shifted every outline by about 0.1 mm. Fixed in
  `refineCorners` / `findSheet`.
- OpenCV.js 5.0's `Mat.clone()` shares the pixels: brush strokes ended up in the cached mask and Undo did nothing.
  The worker copies with `copyTo`.

## Browser

Chrome, local site build: the page loads OpenCV.js in the module worker (`import` sets `globalThis.cv`), finds the
sheet in a synthetic photo, traces two pieces, adds them to the layout next to two shapes, drags and overlaps (warning
shown), builds a 2 × 3 × 4 box in 1.2 s, switches between German and English in place. No console errors.

With Jan's photos: the wrench and the pliers trace as one piece each; an Add stroke extends the outline and Undo
takes it back; both go straight into a 5 × 3 box; while editing the pliers' outline the wheel zooms, and "Fewer
points" twice takes it from 152 to 51 points; the box (5 × 3 × 4, two pockets) builds in 3.0 s.
