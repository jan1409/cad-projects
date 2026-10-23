# Gridfinity standard constants

Used by the case, the bins and the baseplates. Sources: gridfinity.xyz (spec drawing by willtree8, WIP), and
Matthew Wilson's "Parametric Gridfinity" sketches (`../onshape/src_gf_*_sketches.txt`). Values marked *case* were measured
on the Rugged Case reference.

| Item | Value | Source |
|---|---|---|
| Grid pitch | 42 × 42 | spec, frame unit Sketch 1 |
| Height unit | 7 | spec, plain bin `#zcount * 7mm` |
| Cell outline corner radius | 4 | frame unit / base unit |
| Baseplate profile (top → floor) | 2.15 @ 45° · 1.8 vertical · 0.7 @ 45° = 4.65 | spec; *case* 2.15 / 1.8 / 0.696 = 4.646 |
| Bin outer size | 42·n − 0.5 (0.25 clearance per side), corner r 3.75 | plain bin Sketch 4 |
| Bin foot | 37.2 sq bottom (2.4 inset) lofted to the 42 r 4 outline; 0.8 / 1.8 / 2.15 profile = 4.75 | base unit Sketch 1/2, spec |
| Magnet holes | Ø6.5 (6 × 2 magnets), 26 mm apart (±13) | base unit Sketch 6, spec |
| Screw holes | Ø3 (M3) | base unit Sketch 6 |
| Stacking lip | 1.2 / 45° / 1.8 / wall_t, r 0.6 | plain bin Sketch 12 |
| Label shelf | 36°, r 0.6, depth `#label_depth` | plain bin Sketch 1 |
| Bin height | 7 · zcount (+ stacking lip) | plain bin Sketch 12 |

Bins and baseplates (Step 5) will take their full parameter sets from the `src_gf_plain_bin`, `src_gf_base_unit`,
`src_gf_frame*` and `src_gf_deep_1x1` / `src_gf_vase_mode` snapshots. The variables (`#wall_t`, `#label_depth`, …) are defined
by `assignVariable` features there and still need extracting.
