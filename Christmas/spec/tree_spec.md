# Christmas tree: model and paint

Source of truth: Jan's SolidCraft model, `Christmas/solidcraft/christmas_tree.sc`, a snapshot of
`D:\CreativeProjects\Solidcraft_Models\Christmas_tree_v2.sc` (SolidCraft 0.45, 2026-11-21). The site generator
(`Christmas/web/src/tree.js`) ports it with the same equations. `Christmas/web/node/tree_check.mjs` compares the two
over a sweep: both boolean differences are 0.0 mm³ for all 12 sets.

## Model (the .sc timeline)

| Feature | What it does |
|---|---|
| FinSketch | 3-tier silhouette on the XZ plane (sketch x → X, y → Z), points fixed by expressions, tips filleted with `d1 = rc` |
| Core | cylinder r = 0.4 t, height p, on the axis: only the seed body, inside the first fin |
| Fin | symmetric extrude of the whole sketch, total thickness t (a plate through the axis) |
| Fins | circular pattern of Fin about Z: N/2 plates over 180° − 360°/N, so N fins |

Inputs (spec key ↔ .sc name): `height` H = 120, `fins` N = 20 (even), `fin_t` t = 2, `angle` a = 30°.
Shape ratios (constants, `shape` in `tree_params.json`): kw 0.30, kt 0.46, kp 0.23, ks 0.04, kr 0.0125.

```
Rb = kw·H                     base radius
R1 = kt·Rb                    top tier tip;  R2 = R1 + (Rb−R1)/3,  R3 = R1 + 2(Rb−R1)/3
p  = kp·H                     tier pitch (tips at z = p, 2p, 3p)
sf = ks·H                     tier step at a flat underside
s  = sf·p / (p + tan a·((Rb−R1)/3 + sf))     horizontal lip under each tier
dr = s·tan a                  height of the tier underside
rc = kr·H                     tip rounding
```

Silhouette, counter-clockwise from (−Rb, 0): (Rb, 0) → (R3−s, p−dr) → **(R3, p)** → (R2−s, 2p−dr) → **(R2, 2p)** →
(R1−s, 3p−dr) → **(R1, 3p)** → (t, H) → (−t, H) → the mirror image. Bold corners are rounded with rc; the inner
corners stay sharp. The underside of tier k runs from (Rk−s, k·p−dr) up to the tip at angle a from the bed (0° = flat).

Default tree: Ø 72 × 120 mm, 78 576.30 mm³ (SolidCraft and replicad agree to the last digit shown).

## Paint (decoded from Jan's print)

`_input/Christmas_tree_plate_2.gcode.3mf` is a sliced plate exported from Bambu Studio 02.09.01.70 for the X1C with
AMS. It holds G-code only, no mesh and no paint, but every layer prints with a single filament
(`tools/slice_paint_check.py --gcode` reads it):

| Layers (0-based, 0.2 mm) | z mm | Filament |
|---|---|---|
| 0–36 | 0–7.4 | 2 (lilac #D4B1DD) |
| 37–126 | 7.4–25.4 | 1 (pink #F330F9) |
| 127–163 | 25.4–32.8 | 2 |
| 164–264 | 32.8–53.0 | 1 |
| 265–301 | 53.0–60.4 | 2 |
| 302–402 | 60.4–80.6 | 1 |
| 403–439 | 80.6–88.0 | 2 |
| 440–599 | 88.0–120 | 1 |

So the bands start at the base and at each tier underside (k·p − dr = 25.36, 52.96, 80.56) and are h tall, with
7.34 < h < 7.50 (a slicer colours a layer by its mid-height plane). Rule in the generator:

- bands `[0, h]` and `[k·p − dr, k·p − dr + h]` for k = 1..3, h = `band_share` % of p (default 27 % → 7.45 mm at
  H = 120), never closer than 0.5 mm to the next band; scales with H.
- The reference as data: `Christmas/reference/tree_paint_reference.json`.

## Painted 3MF

The mesh (replicad, tolerance 0.01 mm / 0.1 rad) is welded, split at the band planes so no triangle crosses one
(`splitAtZ`, new edge vertices shared, still closed), and each triangle gets a paint state: 2 = filament 2 when it
bounds material inside a band (test point: centroid moved 1 µm into the material, so the bottom face and flat
undersides on a band boundary take the band's colour), else none (the object's filament 1).

Whole triangles use the slicers' TriangleSelector code: state 1 `4`, 2 `8`, 3 `0C`, 4 `1C`, … (uppercase hex). Read in
the source of PrusaSlicer 2.9.7, Bambu Studio 02.09.01.70 and OrcaSlicer 2.5.1:

- Bambu Studio and Orca read `paint_color` in any 3MF. Without `Application` metadata the file counts as a generic
  3MF: they read the paint and add the filament slots it needs (Bambu shows a non-blocking notice). A file that
  claims to be from BambuStudio but has no project settings gets "load geometry only" and no filament slots.
- PrusaSlicer reads `slic3rpe:mmu_segmentation`, and `paint_color` when that is missing (2.7.4+). Write
  `slic3rpe:Version3mf = 1` and `slic3rpe:MmPaintingVersion = 1`, and no `Application` (PrusaSlicer 3.0 alphas use
  the old loader only then). Paint only slices on a printer with two or more extruders.
- No `Metadata/` folder: a partial slicer config replaces the user's printer and filament presets in all three.
- Flavours (`FLAVOURS` in `paint3mf.js`): `bambu` / `orca` = `paint_color`; `prusa` = both attributes + the two
  `slic3rpe:` metadata lines. The flavours differ only in name and build sheet; each one slices correctly in both
  PrusaSlicer and Bambu Studio.

## Checks (2026-11-21)

- `tree_check.mjs`: 12 parameter sets against `solidcraft-cli` builds, all exact.
- `tree_build.mjs --sweep`: 24 configurations (every corner of the range), closed meshes, ≤ 10 s each.
- `tools/slice_paint_check.py`: the default tree (all flavours) in PrusaSlicer 2.9.6 (XL 5T), Bambu Studio
  02.09.01.70 and OrcaSlicer 2.5.1 (X1C project settings) reproduces Jan's 8 colour runs layer for layer; a 140 mm
  tree at 0° matches its computed bands in all three.
- Jan opened the three default 3MF files in the Bambu Studio, OrcaSlicer and PrusaSlicer windows: the paint is there
  and works (2026-11-21).
- Where a band boundary falls exactly on a layer's mid plane and a flat face lies there (0° undersides, e.g. H = 150),
  the slicer gets that one layer in both colours: the slice plane runs through the face itself. Not a fault of the
  file.
