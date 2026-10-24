# Gridfinity baseplates – spec

Two site models share one page (`../web/baseplate/`) and one geometry module (`../web/src/baseplate.js`):
- **Gridfinity Baseplate** (variant `grid`): size in cells, 1–24 × 1–24.
- **Gridfinity Drawer Baseplate** (variant `drawer`): size as the inside of a drawer, 46–1000 mm per side.

Parameters: `baseplate_params.json`. Validation: `../web/BASEPLATE_VALIDATION.md`.

## Sources

There is no Onshape template for the baseplates. The profile comes from gridfinity-rebuilt-openscad, which encodes the
drawings of gridfinity.xyz/specification:
- `src/core/gridfinity-baseplate.scad`: `_BASEPLATE_PROFILE`, `BASEPLATE_HEIGHT = 5`, `BASEPLATE_OUTER_RADIUS = 4`.
- `src/core/standard.scad`: magnet holes.

The Rugged Case floor pockets have the same profile (`case_params.json` `floor_pocket`, measured on the Onshape case).

## Geometry

- **Cell:** 42 × 42; the outer corners of the plate are r 4.
- **Pocket, bottom up** [z above the floor, offset from the cell outline]:
  `[0, 2.85] [0.35, 2.85] [1.05, 2.15] [2.85, 2.15] [5, 0]`.
  - That is 0.35 clearance, then 0.7 @ 45°, 1.8 vertical and 2.15 @ 45°.
  - Corner radius = 4 − offset, so the opening is 36.3 square with r 1.15.
  - The top is a knife edge on the cell line, between cells and at the plate edge, as the standard defines it.
- **Box fit:** a box's foot stands on the pocket floor, and both its 45° faces lie on the plate's 45° faces. The vertical
  faces have 0.25 clearance.
  - The ridges reach z 5.0, so a box needs its bottom between the feet at 5.0 or higher.
  - Our boxes changed to 5.0 on 2026-10-24; before, it was 4.75 (`bin_spec.md`).
- **Bottom plate:** b = 3–8 mm, part of the same print. Total height = 5 + b, with the pocket floor at z = b. Without a
  bottom plate the pockets go through, and the boxes stand on the drawer floor.
- **Magnet holes:** Ø 6.5 × 2.4, at (±13, ±13) from each cell centre, under the box magnets.
  - They are only offered with a bottom plate, and are cut from its top face.
  - At b = 3 the floor under a hole is 0.6 mm.

## Drawer fitting

- **Cells:** n = floor((drawer − 2 · clearance) / 42) per axis. The clearance defaults to 0.5 mm per side.
- **Leftover space:** it becomes a flat border, flush with the grid top, on the chosen side: left / both sides / right,
  and front / both sides / back.
  - A strip narrower than 0.5 mm is dropped instead (no sliver faces); the plate is then that much smaller.
- **Box height hint:** with the optional drawer height, boxes fit up to n = floor((drawer_h − b − 3.55 − 0.5) / 7) units.
  - 3.55 is the stacking lip; 0.5 is headroom.

## Pieces

- **Splitting:** plates larger than the bed (360 × 360) are split along cell lines.
  - Each axis gets the fewest balanced pieces of ≤ 360 mm, and the border strips stay with the edge pieces.
  - The plate's outer corners keep r 4. Corners on split lines are square, so the pieces butt together; the ridge on a
    split line is half on each piece.
- **Lettering:** pieces are lettered row by row from the front left.
- **Shared parts:** pieces that are equal up to a 90/180/270° turn are one part (`A × 4`); the page turns each placed copy.
  - The part keeps the orientation of its first piece.
  - Mirror images stay separate parts. A mirrored piece is a different print, because the top and bottom differ.

## Construction (replicad)

- **Slab:** a rounded rectangle extruded to 5 + b, with r 4 only on the plate's outer corners.
- **Pockets:** one ruled loft per cell through the sections above (planes, cylinders, cones).
  - They are cut in two checkerboard groups, because side neighbours touch along the ridge.
  - This is the same method as the case floor (`case.js`).
- **Magnet holes:** one compound of disjoint cylinders, cut once.
- **Timing:** an 8 × 8 piece takes about 7 s in Node, mostly in the boolean. Smaller cut groups or pockets that reach
  above the top were not faster.
