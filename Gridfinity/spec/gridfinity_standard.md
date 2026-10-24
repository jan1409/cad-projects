# Gridfinity standard constants

Used by the case, the boxes (bins) and the baseplates.

**Sources:**
- The specification at gridfinity.xyz/specification (and github.com/gridfinity-unofficial/specification), whose profile drawings are images.
- Their numeric encoding in gridfinity-rebuilt-openscad `src/core/standard.scad`, which cites the spec.
- Cross-checked against Jan's Onshape box templates (`../onshape/bin_*`, 4 µm off) and Matthew Wilson's "Parametric Gridfinity" (`../onshape/src_gf_*`).

Values marked *case* were measured on the Rugged Case reference.

| Item | Value | Note |
|---|---|---|
| Grid pitch | 42 × 42 | |
| Height unit | 7 | box height = 7 · units, foot underside to wall top, without the stacking lip |
| Baseplate pocket profile (top → floor) | 2.15 @ 45° · 1.8 vertical · 0.7 @ 45° = 4.65, plus 0.35 vertical clearance = 5 | rebuilt `_BASEPLATE_PROFILE`, `BASEPLATE_HEIGHT`; cell outline 42, corner r 4, opening 36.3 r 1.15; knife-edge ridges between cells; *case* 2.15 / 1.8 / 0.696 = 4.646 without the clearance |
| Box on a baseplate | foot bottom on the pocket floor; both 45° faces in contact, 0.25 clearance on the verticals | `../web/node/plate_fit.mjs` |
| Box outline | 42 · n − 0.5 (0.25 clearance per side), corner r 3.75 | |
| Box foot (bottom → top) | 0.8 @ 45° · 1.8 vertical · 2.15 @ 45° = 4.75 | bottom 35.6 sq r 0.8, vertical part 37.2 sq r 1.6, top 41.5 sq r 3.75 |
| Bridge between feet | at z ≥ 5.0 (Jan's template and these boxes: 5.0; rebuilt: 7) | the baseplate ridges reach 5.0; a bridge from 4.75 hits them by 0.25 |
| Stacking lip (wall top → apex) | 0.7 @ 45° · 1.8 vertical · 1.9 @ 45° = 4.4 high, 2.6 deep | apex rounded r 0.6, so the box is 7 · n + 3.55 tall |
| Magnet holes | Ø 6.5 × 2.4 deep, at (±13, ±13) from each cell centre | for 6 × 2 mm magnets; optional; in baseplates cut into the bottom plate |
| Screw holes | Ø 3 (M3) | optional, not used by the boxes |
| Labels / tabs, wall, floor | not standardised | rebuilt: wall 0.95, tab 36°; Jan's design: wall 1.2, floor top 6.2 |

The Matthew Wilson sketches differ in places, for example a 37.2 bottom and a different lip. The boxes follow the
table above. The case was ported 1:1 and is unaffected: its floor pockets are the baseplate profile.
