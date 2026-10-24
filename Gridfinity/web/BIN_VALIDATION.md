# Gridfinity boxes – validation

Generated with `src/bin.js` on 2026-10-23; checks re-run on 2026-10-24 after the bridge moved to z 5.0, and again after
the label plate moved 0.5 mm down. Spec and design notes: `../spec/bin_spec.md`.

## Against the Onshape references (exact B-rep booleans)

`node node/bin_check.mjs` imports `../reference/bins/*.step` with OpenCascade. It moves each reference into the centred
frame and measures web − Onshape and Onshape − web. Volumes are in cm³.

| reference | part | Onshape | web | diff | web − Onshape | Onshape − web |
|---|---|---|---|---|---|---|
| std_1x1x3 | box | 13.8390 | 13.8452 | 0.0062 | 0.0062 | 0.0000 |
| std_3x2x6 (x 2, y 3) | box | 77.4004 | 77.3987 | −0.0017 | 0.0167 | 0.0183 |
| label_L2xB1xH3 (x 1, y 2) | box | 32.2279 | 29.0013 | −3.2267 | 0.2530 | 3.4803 |
| label_L2xB1xH3 | plate | 0.6100 | 0.6106 | 0.0005 | 0.0008 | 0.0003 |
| label_L4xB5xH6 (x 5, y 4) | box | 261.8198 | 262.9129 | 1.0930 | 2.3583 | 1.2653 |
| label_L4xB5xH6 | plate | 3.4367 | 3.4363 | −0.0003 | 0.0008 | 0.0011 |

`node node/bin_diff.mjs` locates the differences:
- **Groove between the feet** (z 4.75–5.0): both have one, because the baseplate ridges reach z 5.0. Onshape's is V-shaped,
  this one rectangular (0.5 × 0.25): 18 mm³ less material for 2×3, 80 mm³ for 5×4. Until 2026-10-23 the bridge started
  at 4.75 and hit the baseplate ridges by 0.25 mm (found by `node/plate_fit.mjs`).
- **Lip, its support and the 10° slope:** 2.6 deep instead of 2.596. 17 mm³ for 2×3.
- **Scoop, 5×4×6:** tangent quarter round instead of the Onshape arc, which ends 3 mm short of the wall tangent. 995 mm³.
- **Scoop, 1×2×3:** r 13.1 instead of 25. Onshape's scoop rises above the lip there. −3266 mm³.
- **Ledge ends:** two specks of 0.06 mm³ where the ledge meets the side-wall slopes.
- **Label ledge and plate 0.5 mm lower** (user decision 2026-10-24, `plate_drop`): a box stacked on a label box reaches
  T − 0.35 with its feet, so the flush Onshape plate carried it 0.35 mm high (`node/stack_fit.mjs`). The pocket is
  0.5 mm deeper (Onshape − web: 211 mm³ for 1×2, 1186 mm³ for 5×4 = plate area × 0.5) and the ledge underside
  moved down with it (web − Onshape: about 247 mm³ and 1340 mm³). The plate is compared 0.5 mm lower.

The foot profile, magnet holes, wall, floor, ledge profile and plate match Onshape exactly (ledge and plate 0.5 mm lower). Onshape's foot section is
(−17.8, 0) (−18.6, 0.8) (−18.6, 2.6) (−20.75, 4.75), which is the official foot.

## Robustness sweep

`node node/bin_build.mjs --sweep` built 46 configurations, both variants:
- Footprints 1×1 … 10×10 and 1×10, 10×1, 3×7.
- Heights from the minimum to 30.

All parts are closed meshes (0 open STL edges). The largest box (10×10×30) builds in 10–12 s in Node and 7.5 s in Chrome.
CI builds min / default / max of both variants (`site/test.mjs`).

## Rugged Case fit

`node node/bin_case_fit.mjs <n>` builds a closed 3 × 3 × n case and standard boxes over the whole floor, in a corner cell
and in the centre cell. It reports their overlap with lid and base (mm³).

| case n | box h | whole floor | corner cell | centre cell |
|---|---|---|---|---|
| 5 | 4 | 0 | 0 | 0 |
| 5 | 5 | 0 | 0 | 0 |
| 5 | 6 | 4048 (lid) | 1104 (lid) | 933 (lid) |
| 12 | 12 | 0 | 0 | 0 |
| 25 | 25 | 0 | 0 | 0 |

Lifting the h = n boxes still fits at 1.0 mm and collides at 1.25 mm, so the lip clears the lid by 1.0–1.25 mm. Rule:
**case z_count ≥ box height**.
