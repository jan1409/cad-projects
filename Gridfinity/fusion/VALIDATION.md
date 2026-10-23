# Fusion port validation

Exact B-rep comparison (Fusion TemporaryBRepManager booleans) of every part against the Onshape reference STEP,
built with window_gap = 0 (the Onshape original; the default 0.2 gap only deepens the lid's window pocket),
run 2026-10-23 by `Gridfinity/fusion/validate.py`. Volumes in cm3; *missing* = ref - build, *extra* = build - ref.

| Config | Part | V ref | V build | diff | missing | extra | STL watertight |
|---|---|---|---|---|---|---|---|
| 3x2x4 | Base | 64.5484 | 64.5472 | -0.00122 | 0.00119 | 0.00000 | yes |
| 3x2x4 | Lid | 31.2142 | 31.2188 | +0.00461 | 0.00044 | 0.00271 | yes |
| 3x2x4 | Latch | 5.6841 | 5.6842 | +0.00016 | 0.00018 | 0.00037 | yes |
| 3x2x4 | Seal | 1.0748 | 1.0748 | +0.00000 | 0.00000 | 0.00000 | yes |
| 3x2x4 | Window | 15.6159 | 15.6159 | +0.00000 | 0.00000 | 0.00000 | yes |
| 5x4x6 | Base | 195.2523 | 195.2482 | -0.00402 | 0.00399 | 0.00000 | yes |
| 5x4x6 | Lid | 66.1991 | 66.2005 | +0.00145 | 0.00075 | 0.00374 | yes |
| 5x4x6 | Latch | 5.6841 | 5.6842 | +0.00016 | 0.00018 | 0.00037 | yes |
| 5x4x6 | Seal | 1.9215 | 1.9215 | +0.00000 | 0.00000 | 0.00000 | yes |
| 5x4x6 | Window | 54.0543 | 54.0543 | +0.00000 | 0.00000 | 0.00000 | yes |
| 8x6x8 | Base | 444.3025 | 444.2929 | -0.00961 | 0.00957 | 0.00000 | yes |
| 8x6x8 | Lid | 124.4988 | 124.5010 | +0.00222 | 0.00113 | 0.00581 | yes |
| 8x6x8 | Latch | 5.6841 | 5.6842 | +0.00016 | 0.00018 | 0.00037 | yes |
| 8x6x8 | Seal | 2.9799 | 2.9799 | +0.00000 | 0.00000 | 0.00000 | yes |
| 8x6x8 | Window | 131.7375 | 131.7375 | +0.00000 | 0.00000 | 0.00000 | yes |
| 5x4x6_w075 | Base | 195.2523 | 195.2482 | -0.00402 | 0.00399 | 0.00000 | yes |
| 5x4x6_w075 | Lid | 73.5750 | 73.5765 | +0.00145 | 0.00075 | 0.00374 | yes |
| 5x4x6_w075 | Latch | 5.6841 | 5.6842 | +0.00016 | 0.00018 | 0.00037 | yes |
| 5x4x6_w075 | Seal | 1.9215 | 1.9215 | +0.00000 | 0.00000 | 0.00000 | yes |
| 5x4x6_w075 | Window | 25.3380 | 25.3380 | +0.00000 | 0.00000 | 0.00000 | yes |

Largest deviation: 0.00961 cm3.

Known, accepted deviations:
- Lid: the 0.5 x 2 lead-in on the front inner edge is not faded out over the two front corner arcs (Onshape lofts it to zero there): +2.3 mm3.
- Base: pocket corners differ by rounding of the 4.646 / 2.15 profile values: about -0.05 mm3 per cell.
- Lid: top openings about +0.07 mm3 per cell (offset rounding); Latch about 0.2 mm3 (sketch coordinates rounded to 0.001 mm).
