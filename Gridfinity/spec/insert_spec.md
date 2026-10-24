# Gridfinity tool insert

A standard Gridfinity box (`bin_spec.md`) whose floor slab is raised to the fill top F, with one pocket per tool:
the tool outline plus clearance plus finger cutouts. The tools come from a photo of them lying on a sheet of paper.
Parameters: variant `insert` and block `insert` of `bin_params.json`. Code: `Gridfinity/web/src/insert.js`,
`outline.js`, `trace.js`.

## Stacking
- T = 7 n (wall top). A box set on top seats on the stacking lip with its z = 0 at T + lip.height − foot.height
  = **T − 0.35**: the lip is the baseplate pocket profile without its 0.35 floor clearance, so the upper box's feet
  dip 0.35 mm into the opening.
- Fill top and every tool top stay `stack_gap` = 0.5 below that: **F ≤ T − 0.85**, and pocket floor + tool height
  ≤ T − 0.85. `node/stack_fit.mjs` checks this with the tools as prisms (outline × height) in their pockets.
- F is kept 0.1 mm away from T − 1.2 (bottom of the lip support) and from the start of the 10° lean, so no face ends
  a few µm from another (sliver faces).

## Box
- The floor slab of `makeBin` (inset 0.6 from the outline, so it overlaps the wall) gets its top at F
  (`inputs.fill_top`); everything else is the standard box, including magnet holes.
- F = T − 0.85 − (largest tool protrusion) − `fill_lower`. A tool sticks out when its pocket depth is less than its
  height; `fill_lower` lowers the insert in tall boxes to save material.
- Height n (automatic): the smallest n ≥ 2 with every pocket floor F − depth ≥ 6.2 (the standard floor top).
- Footprint (automatic): the pockets (outline + clearance, without finger cutouts) need 42 n − 8.1 mm per direction
  (0.25 outline clearance + 2.6 lip depth + 1.2 `min_wall`, both sides); at most `max_units` = 8 (336 mm, the bed).
  The automatic size centres the layout; a manual size keeps the tools where they are (layout frame = box frame).

## Pockets
- Region: the tool outline offset by `clearance` (default 0.6 mm per side) with round joins (`arc_tol` 0.02 mm).
- Depth: tool height + `depth_extra` (0.5) unless set per tool.
- Finger cutouts: circles (default Ø 22) unioned with the region and clipped to the allowed area (the opening under
  the lip minus `min_wall`), as deep as the pocket. Automatic: two, where the tool's minor principal axis through
  its centroid leaves the outline (round shapes: the Y axis). Manual: free circles in the tool's frame.
- Pockets with the same floor are merged in 2D (disjoint pieces), deepest first; each group is one prism cut from the
  floor to F + 1. Overlapping pockets and walls thinner than `min_wall` are warnings, not errors.
- Errors that block the build: no tools, a missing height, depth ≤ 0, layout too large for 8 × 8, manual footprint
  or height too small, a pocket outside the allowed area, more than 30 height units.

## Automatic layout
Each tool lies straight with the long side along X: as photographed when its principal axis is within 4° of the
sheet's axes, otherwise along its principal axis (straightens a tool that lay askew). A diagonal minimum-area
orientation only when the tool doesn't fit the printer straight. Shelf packing, tallest first; every row length from the widest
tool up to 8 cells is tried and the one with the fewest cells wins (then the squarest). Spacing: whole pockets
(including finger cutouts) plus `min_wall` + 1 mm.

## Tracing (browser, OpenCV.js 5.0)
1. Photo scaled to at most 3000 px (EXIF orientation applied by the browser).
2. Sheet: whiteness V − S, Otsu, the largest contour, convex hull reduced to 4 corners; each side is then fitted as a
   line through the contour points along its middle 80 % and moved half a pixel outward (the contour runs through
   the outermost paper pixels). The corners stay draggable on the page.
3. Rectified at 5 px/mm (A4: 1050 × 1485 px), keeping the sheet's orientation in the photo.
4. Tools, two cues joined:
   - tone: lightness against a quadratic paper-brightness model fitted to the paper pixels (lighting gradients), or
     colour distance from the paper's colour cast, whichever is larger; Otsu threshold (at least 15 % darker than the
     paper), moved by the sensitivity slider; opening 3 px.
   - edges: polished metal reflects the paper and has nearly its tone, but a clear outline. Canny on the blurred
     lightness, thresholds 2.3 / 5.5 × the 90th percentile of the paper's own gradient noise (moved by the slider).
   - Joined, the 4 mm border cleared (the sheet's edge must not form a loop), closed into regions: dilate 1 mm, fill
     the outer contours, erode 1 mm. Notches narrower than 2 mm get bridged, which a pocket doesn't mind.
5. Brush strokes (Add / Erase, round dabs along the stroke) are painted into the mask; they survive re-traces with
   another sensitivity. The worker keeps the rectified sheet and the mask, so a stroke re-traces in milliseconds.
6. Outer contours of at least 80 mm²; the mask is smoothed first (Gaussian 0.35 mm), the outline simplified to
   0.25 mm (the wrench photo: 65 points, the pliers: 147). No half-pixel correction: edge pixels lie on the boundary.
7. On the page: pieces can be left out, outlines edited (points, with zoom and pan), simplified further ("Fewer
   points": 0.45, 0.8, 1.5 mm …), mirrored and scaled to a measured length.

Accuracy on synthetic photos (`node/trace_check.mjs`): outlines come out 0.05–0.18 mm larger on average; the sides
away from a drop shadow are within ±0.2 mm, the shadow side grows by up to 0.3 mm. Real photos (`fixtures/photos/`):
the pliers and the chrome wrench come out as one piece each. Real photos add parallax: a tool's top edge looks larger by its height over the camera distance (20 mm at
50 cm: 4 %), so the page asks for photos from far away with zoom and offers the length correction.
