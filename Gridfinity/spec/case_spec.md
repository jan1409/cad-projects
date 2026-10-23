# Gridfinity Rugged Case – geometry spec

Shared by the Fusion port (Step 3) and the browser generator (Step 4). The numbers live in
[case_params.json](case_params.json); this file explains them. Everything was derived on 2026-10-23 from the Onshape reference.
Inputs were the feature trees and sketches in `../onshape/`, plus sections and B-rep data of the exports in `../reference/`.
`check_profiles.py` re-verifies the profiles: all vertices lie within 0.0004 mm of the 3×2×4, 5×4×6 and 8×6×8 references
and the window_t 0.75 variant.

## Frame and parameters
- Origin is the XY centre of the cavity; **z = 0 is the floor top** (the plane the bins stand on).
- Front = −Y (latches), back = +Y (hinges).
- The cavity is exactly the Gridfinity grid: **Li × Wi = 42·x_count × 42·y_count**, corner r 4.
- Wall profiles use **s = distance outward from the inner wall**. A profile point at s runs along the cavity outline offset by s,
  with corner radius 4 + s, so all corners are concentric.

| Input | Default | Range | Notes |
|---|---|---|---|
| x_count | 5 | 3–8 | length in cells (Onshape allowed 12; capped at 8 for the Prusa XL bed) |
| y_count | 4 | 3–8 | width in cells (min 3 × 3 footprint, max 8; Onshape allowed 2–12) |
| z_count (n) | 6 | 4–8 | height units (capped at 8) |
| window_t (wt) | 1.6 | 0.75–2.0 | plexiglass thickness |
| window_gap (gap) | 0.2 | 0–0.5 | extra window-pocket depth on the frame side, so the printer bridges 0.2 mm above the plexiglass after the pause; 0 = Onshape original |
| print_layout | false | | parts in print orientation |

| Derived | Formula | 5×4×6 |
|---|---|---|
| split (rim / parting plane) | 7n − 6 | 36 |
| top (lid top) | 7n + 8.8 (independent of wt) | 50.8 |
| bottom (foot pads) | −3.2 | −3.2 |
| hinge_x (hardware centres, ±) | 21·x_count − 27 | 78 |
| outer size X × Y | (Li + 8.52) × (Wi + 22.52) | 218.52 × 190.52 |
| base / lid height | split + 6.6 / top − split + 3.4 | 42.6 / 18.2 |
| seat (window pocket floor) | top − 1.2 − wt − gap | 47.8 |

**Bed check (Prusa XL 360 × 360):** the outer size is (42·x + 8.52) × (42·y + 22.52), so 8 × 8 still fits (344.5 × 358.5 mm).
The ranges are therefore capped at 8 (user decision 2026-10-23).

## Parts
| Part | Material / process | Notes |
|---|---|---|
| Base | FDM | wall sweep + Gridfinity floor + ribs + hinge knuckles + latch catches |
| Lid | FDM, **printed upside down** (top on the bed), print pause for the window | wall sweep + window frame grid + top stacking ribs + hinge knuckle + latch pivots |
| Latch ×2 | FDM | 23.2 wide; same part for both latches |
| Seal | **TPU** (confirmed) | 1.8 × 1.4 ring pressed into the base groove |
| Window | laser-cut plexiglass, cut file as **SVG** (confirmed) | (Li − 4) × (Wi − 4) × wt, corner r 0.2 |
| Screws | 6 × M3 × 30 | 2 hinge pins, 2 latch pivots, 2 latch catches |

## Base
1. **Wall**: sweep `profiles.base_wall` along the perimeter.
   - Inner wall s = 0 from the floor ridge (z 4.646) up to split.
   - Outer wall s = 2.4 (shell 2.4).
   - Bumper band: steps out 1.86 over 4.4 height to s = 4.26 for the last 3 mm below split.
   - Rim at split, with the seal groove s 1.23–3.03, 2 deep.
   - Bottom: the wall ends on the **underside plane z = 0.3**, with a 45° chamfer (z = s) from s = 0.3 up to the outer wall and an r 1 fillet.
2. **Floor**: slab from z = 0.3 up to the ridge apex 4.646, plus one **foot pad** per cell (`cells.foot_pad`).
   - Each pad is a 35.6 sq r 0.8 face at z −3.2 that tapers at 45° *up to z = 0.3*, ending 0.3 beyond the cell outline.
   - Nothing else of the base goes below z = 0.3. So the V-notches between pads run out through the wall, and a small star-shaped void
     sits under every grid crossing. Both are in the reference; a closed bottom ring would add 0.3 cm³.
   - **On top**, after joining the pads, each cell gets the standard baseplate pocket `cells.floor_pocket`
     (2.15 @45° / 1.8 vertical / 0.696 @45°, apex 4.646 on the cell outline, outline r 4).
     The pocket tool must stop exactly at the apex, or its 45° flank notches the inner wall.
   - The case sits on any Gridfinity baseplate, or on another case's lid.
3. **End ribs**: 5 mm wide, on both X end walls at |y| = Wi/2 − 23 … Wi/2 − 18. They are a strip at s = 4.26 from the bottom chamfer
   (r 1) up to the rim, and continue on the lid. No side fillets on the base.
4. **Hardware zone** (see below): ribs, two hinge knuckles at the back, latch catch at the front.

## Lid
1. **Wall**: sweep `profiles.lid_wall`.
   - Rim at split with the **seal tongue** (1.5 wide, 0.4 tip, 0.9 deep, 40° flanks, centred on the groove).
   - Bumper band mirrored above split.
   - Outer wall s = 2.4 up to a 2 mm 45° top chamfer with r 1 fillets.
   - **Front wall only**: a 0.5 × 2 lead-in on the inner bottom edge (`lid_wall_front_override`) so the lid clears the base while swinging shut.
     Onshape fades it out over the two front corner arcs with lofts. The Fusion port ends it at the corner tangents (+2.3 mm³, accepted).
   - The sweep only reaches down to top − 4 inside the cavity; the frame below comes from the per-cell skirts (next item).
2. **Window frame grid** (below the window, z top − 5.5 … window seat): 6.3 wide ribs on every cell boundary.
   - Slab over the cavity from top − 4 to the seat.
   - **Per-cell skirts** underneath: 37.3 sq r 1.65 at top − 5.5, growing at 45° to 40.3 sq r 3.15 at top − 4.
     That leaves a 1.5 deep 45° groove under every boundary, probably where the bins' stacking lips land.
     The grooves run out into the wall; that's why the skirts are per cell and not part of the wall sweep.
   - Through openings 35.7 sq r 0.85, cut after joining.
3. **Window pocket**: (Li − 3) × (Wi − 3), corner r 0.2, from the seat (top − 1.2 − wt − gap) to top − 1.2.
   - The window has 0.5 clearance per side.
   - The window **top stays at top − 1.2 for every wt**; only the seat moves.
   - With the default gap of 0.2 the pocket is 0.2 deeper than the plexiglass, on the frame side. The Onshape original has gap 0.
   - The pocket is fully enclosed, so the window goes in during a print pause (confirmed).
   - Process: print the lid upside down. **Pause at 1.2 + wt + gap above the bed** (3.0 mm at wt 1.6), once the top ribs and the open pocket are done.
     Drop the plexiglass in and resume; the frame bridges over the window with 0.2 mm to spare.
4. **Top stacking ribs** (top − 1.2 … top): cell openings offset 3.009 at top − 1.2 (35.98 sq r 0.99), widening at 45° to
   offset 1.809 at the lid top (38.38 sq r 2.19).
   - Each boundary rib is 1.2 high and 3.62 wide on top. It fits the V-notches under a stacked case.
   - The top slab ends 0.5 inside the cavity outline. The wall sweep carries the edge, and its top fillet starts at s = −0.006.
     A slab ending at s = 0 leaves a µm sliver that breaks the STL.
5. **Hardware zone**: hinge knuckle + centre rib (back), latch pivot ribs (front), end ribs.
   - Lid ribs run flat back onto the lid top (filling the top chamfer behind them).
   - Their straight top side edges have **r 1 fillets** (pivot ribs, hinge centre ribs, end ribs).

## Hardware zone (size-independent module, mirrored to x = ±hinge_x)
Positions are relative to the module centre x = ±hinge_x, the inner wall (s) and split. They are verified on 3×2×4, 5×4×6 and 8×6×8.
The exact outlines are in `../onshape/hardware_sections.txt`; the 2-D source sketches are in `../onshape/src_rugged_box_sketches.txt`.

- **Ribs**: 3.2 thick plates at x_rel ∈ [−15, −11.8] and [11.8, 15].
  - **Base, front and back**: a strip at s = 4.26 from the bottom chamfer (r 1) plus a 45° boss to s = 11.26.
    - The boss's lower face is z = s + split − 28.26 (front) or s + split − 16.26 (back), with an r 1 concave corner at the strip and r 3 at s = 11.26.
    - The front boss ends in an r 5 round at the rim.
    - If the boss face reaches below the bottom chamfer (n = 4, front), the rib is **clipped flat at z = 0.3**. That's the same underside plane as the floor.
  - **Lid, front**: (2, split) → r 5 at (11.26, split) → r 3 at (11.26, top − 4.8) → r 1 at (6.46, top) → flat top back onto the lid.
  - **Lid, back**: no ribs at these positions; instead a centre rib x_rel ±1.6 over the knuckle (45° gusset continued to s = 4.26, 2.635 top chamfer).
- **Hinge (back)**: pin axis s = 7.86, z = split, knuckle Ø6.8.
  - Base knuckles at x_rel [−15, −8.8] and [8.8, 15], each with a 45° gusset down to the wall at split − 10.268.
  - Lid knuckle at x_rel [−8.675, 8.675], mirrored gusset. The gap per side is 0.125.
  - Holes: lid Ø3.4; base knuckle towards the case centre Ø2.85 (M3 tap); base knuckle at the case end Ø3.4 (screw head outside).
  - Horizontal holes get a print flat on top (1.408 wide, 45° shoulders).
- **Latch (front)**: pivot axis on the lid at (s 6.76, split + 8) and catch axis on the base at (s 6.76, split − 8), both between the front ribs.
  - Holes: rib at the case end Ø3.4, rib towards the centre Ø2.85.
- **Latch part**: a profile extruded 23.2 wide (x_rel ±11.6).
  - Two Ø8 bosses 16 apart with Ø3.2 holes.
  - The lower boss is slotted, so it snaps over the catch screw.
  - Curved arms 3.2 thick (arc radii 21.874 / 18.674), plus a handle tab 10 long at 18.5° with an r 1.6 end.
  - Source: Rugged Box Sketch 10, mapped with y_case = y_src − (Wi/2 − 35), z_case = z_src + split − 30.

## Gridfinity compatibility
- Bins stand directly on the floor pockets (standard baseplate profile), so any standard bin fits. The usable height is up to the lid frame underside at top − 5.5 = 7n + 3.3.
- The case underside fits a Gridfinity baseplate, and another case's lid.
- Constants: [gridfinity_standard.md](gridfinity_standard.md).

## Validation
- `check_profiles.py` checks the wall, lid and seal profiles against the references.
- Bounding boxes follow `validation.bbox` in the JSON for every size.
- Volumes for 5×4×6 are reference values for the Fusion and browser builds (`validation.volume_cm3_5x4x6`).
- Section overlays: `tools/stl_section.py <plane> <png> reference.stl generated.stl --vertices`.

## Decisions (2026-10-23)
- The Fusion port is a **1:1 replica** of this spec, validated against the references. Improvements come afterwards as separate changes.
- Seal in TPU; window cut file as SVG; lid printed upside down with a print pause.

## Fusion port (Step 3, done 2026-10-23)
- Implemented in `../fusion/` (see its README). It is verified by exact B-rep booleans against the Onshape STEPs of 3×2×4, 5×4×6, 8×6×8
  and 5×4×6 at window_t 0.75. Every part is within 0.01 cm³; seal and window are identical. Results: `../fusion/VALIDATION.md`.
- Print orientation (`print_layout`) is handled by `../fusion/print_export.py`:
  base feet down, lid upside down, latches on their side, seal flat, window as SVG.

## Improvements over the Onshape original (user decisions 2026-10-23)
- `window_gap` = 0.2: the window pocket is 0.2 deeper than the plexiglass. The pause height becomes 1.2 + wt + gap.
- Ranges capped at 8 units in X, Y and Z: 8 × 8 is the largest case that fits the Prusa XL bed. Minimum footprint 3 × 3 (y_count min 3).
- Validation against Onshape runs with window_gap = 0.
