# Browser generator validation

Browser generator (Gridfinity/web, replicad / OpenCascade) - STEP export imported into Fusion: exact B-rep comparison (Fusion TemporaryBRepManager booleans) of every part against the Onshape reference STEP,
built with window_gap = 0 (the Onshape original; the default 0.2 gap only deepens the lid's window pocket),
run 2026-10-23 by `Gridfinity/fusion/validate.py --web`. Volumes in cm3; *missing* = ref - build, *extra* = build - ref.

| Config | Part | V ref | V build | diff | missing | extra | STL watertight | build ms |
|---|---|---|---|---|---|---|---|---|
| 3x2x4 | Base | 64.5484 | 64.5472 | -0.00122 | 0.00119 | 0.00000 | yes | 1835 |
| 3x2x4 | Lid | 31.2142 | 31.2190 | +0.00485 | n/a (ASM_EDGECOIN_PROBLEM) | n/a (ASM_EDGECOIN_PROBLEM) | yes | 1901 |
| 3x2x4 | Latch | 5.6841 | 5.6842 | +0.00016 | 0.00018 | 0.00037 | yes | 17 |
| 3x2x4 | Seal | 1.0748 | 1.0748 | +0.00000 | 0.00000 | 0.00000 | yes | 3 |
| 3x2x4 | Window | 15.6159 | 15.6159 | +0.00000 | 0.00000 | 0.00000 | yes | 2 |
| 5x4x6 | Base | 195.2523 | 195.2482 | -0.00402 | 0.00399 | 0.00000 | yes | 4629 |
| 5x4x6 | Lid | 66.1991 | 66.2008 | +0.00169 | n/a (ASM_EDGECOIN_PROBLEM) | n/a (ASM_EDGECOIN_PROBLEM) | yes | 4084 |
| 5x4x6 | Latch | 5.6841 | 5.6842 | +0.00016 | 0.00018 | 0.00037 | yes | 15 |
| 5x4x6 | Seal | 1.9215 | 1.9215 | +0.00000 | 0.00000 | 0.00000 | yes | 4 |
| 5x4x6 | Window | 54.0543 | 54.0543 | +0.00000 | 0.00000 | 0.00000 | yes | 1 |
| 8x6x8 | Base | 444.3025 | 444.2929 | -0.00961 | 0.00957 | 0.00000 | yes | 13485 |
| 8x6x8 | Lid | 124.4988 | 124.5012 | +0.00246 | n/a (ASM_INCONS_VERT_ATT) | n/a (ASM_EDGECOIN_PROBLEM) | yes | 5216 |
| 8x6x8 | Latch | 5.6841 | 5.6842 | +0.00016 | 0.00018 | 0.00037 | yes | 10 |
| 8x6x8 | Seal | 2.9799 | 2.9799 | +0.00000 | 0.00000 | 0.00000 | yes | 8 |
| 8x6x8 | Window | 131.7375 | 131.7375 | +0.00000 | 0.00000 | 0.00000 | yes | 1 |
| 5x4x6_w075 | Base | 195.2523 | 195.2482 | -0.00402 | 0.00399 | 0.00000 | yes | 4028 |
| 5x4x6_w075 | Lid | 73.5750 | 73.5767 | +0.00169 | n/a (ASM_EDGECOIN_PROBLEM) | n/a (ASM_EDGECOIN_PROBLEM) | yes | 2678 |
| 5x4x6_w075 | Latch | 5.6841 | 5.6842 | +0.00016 | 0.00018 | 0.00037 | yes | 12 |
| 5x4x6_w075 | Seal | 1.9215 | 1.9215 | +0.00000 | 0.00000 | 0.00000 | yes | 3 |
| 5x4x6_w075 | Window | 25.3380 | 25.3380 | +0.00000 | 0.00000 | 0.00000 | yes | 1 |

Largest deviation: 0.00961 cm3.

Known, accepted deviations:
- Lid: the 0.5 x 2 lead-in on the front inner edge is not faded out over the two front corner arcs (Onshape lofts it to zero there): +2.3 mm3.
- Base: pocket corners differ by rounding of the 4.646 / 2.15 profile values: about -0.05 mm3 per cell.
- Lid: top openings about +0.07 mm3 per cell (offset rounding); Latch about 0.2 mm3 (sketch coordinates rounded to 0.001 mm).
- Lid (browser only): the r 1 rib top-edge rounds are cut explicitly (OpenCascade's fillet follows tangent chains), starting 0.05 mm outside the lid's top-fillet tangent so the STL stays watertight; their ends differ from Parasolid's fillet ends by about 0.1-0.2 mm3 each. Edges of both lids then lie so close together that Fusion's exact boolean (ASM_EDGECOIN_PROBLEM) cannot split the difference into missing/extra; the volume difference stays exact.
