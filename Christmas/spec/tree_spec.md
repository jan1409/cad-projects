# Christmas tree: model and paint

Source of truth: Jan's SolidCraft model. `Christmas/solidcraft/christmas_tree_v2.sc` is a snapshot of
`D:\CreativeProjects\Solidcraft_Models\Christmas_tree_v2.sc` (SolidCraft 0.45, 2026-11-21);
`Christmas/solidcraft/christmas_tree.sc` is v3 (2026-11-22): v2 plus the tops as configuration rows, built from v2 by
`Christmas/web/node/tree_sc_v3.mjs` (headless) and also saved as `Solidcraft_Models\Christmas_tree_v3.sc`. The site
generator (`Christmas/web/src/tree.js`) ports it with the same equations. `Christmas/web/node/tree_check.mjs` compares
the two over a sweep for every top: both boolean differences are 0.0 mm³ for every set.

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

## Tops (configuration rows of v3, spec key `top`)

| Row | Features (the others suppressed) | Shape |
|---|---|---|
| Flat | Fin, Fins | v2: each fin ends 2t wide at H |
| Sharp | FinSketchSharp, FinSharp, FinsSharp | the outline runs (R1, 3p) → (0, H) → (−R1, 3p); the tip is t wide (the fins meet) |
| Star | Fin, Fins, TabSketch, Tab, StarSketch, Star, Slot | the flat tree with a tab, and a separate star body on it |

FinSketchSharp has the v2 outline with the apex (0, H), but every point is an expression, the fillets in closed form.
For a tip C with unit vectors u1 (back along the underside) and u2 (to the next corner), c = u1·u2 and sn = |u1 × u2|:
the tangent points are C + d·u1 and C + d·u2 with d = rc·(1 + c)/sn, and the centre is C + (u1 + u2)·rc/sn (parameters
fux, fuy, fvx·, fvy·, fs·, fd·).

Why not constraints as in v2: SolidCraft solves constraint fillets starting from the saved solution, so the result
depends on the path. Measured on v2:
- 120 → 235 gives 326 333.98 mm³ (= the JS port), but 120 → 168 → 235 gives 323 623.13 mm³ (a fillet flipped);
- from H = 260 the sketch doesn't solve at all.

The closed-form sketch gives the same shape on every path. Jan's FinSketch (rows Flat and Star) is left as it is, so
`tree_check.mjs` changes the parameters in one step from the saved state.

Star (parameters of the .sc; constants under `shape.star` in `tree_params.json`):

```
Ds = max(Dsm, kds·H)          star diameter tip to tip   (Dsm 22 mm; kds = star_share/100, default 0.25)
Rs = Ds/2, kq = 0.45          outer radius, inner/outer radius (regular star 0.382; fuller is sturdier)
fg = 0.2 mm                   fit per side, tab in slot
st = max(5 mm, t + 2fg + 2wl) star thickness (wl = 1.2 mm wall each side of the slot)
wt = 0.9·kq·Rs                tab width
sd = (kq + 0.1)·Rs            slot depth above the star's bottom notch
ms = (sin 54° − kq)/cos 54°   slope of the inner edges of the star's two lower points
gs = ms·(hypot(t, t/2) + cs)  lift of the notch above H (cs = 0.5 mm clearance)
zc = H + gs + kq·Rs           star centre
tb = min(t, wt/2 − 0.5 mm)    tab half-width at H;  tf = wt/2 − tb  (flare height)
```

- The star: a pentagram (one point up, outer Rs, inner kq·Rs) in fin 0's plane, st thick, centred at (0, 0, zc).
- The slot: (wt + 2fg) × (t + 2fg), from below the notch (cut open through the V between the lower points) up to
  sd above it. It is a closed pocket: printed lying flat, it needs only a short bridge.
- Why gs works: the fins' envelope at the top is hypot(t, t/2) from the axis. Below H it widens with
  (R1 − t)/(H − 3p) ≤ kt·kw/(1 − 3kp) ≈ 0.45 per mm, more slowly than the star's lower edge falls (1/ms ≈ 1.6). So the
  closest point is at the top, and the lower points clear the fins by cs everywhere.
- The tab: fin 0 continued above H, t thick. Its outline in fin 0's plane: (∓tb, H − 1 mm) root inside the fin, (±tb, H)
  → out at 45° to (±wt/2, H + tf) → up to H + gs + sd − fg (fg below the slot's end). Everything it adds lies above H.
- Printed height: the tree with its tab is H + gs + sd − fg (129.72 mm at H = 120); with the star on, zc + Rs (143.42 mm).
- The 3MF holds two objects: the tree (bands painted), and the star lying flat beside it at
  (Rb + Rs + 10 mm, 0), painted whole in `star_filament` (state 3 → `0C`; filament 1 → no paint).

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

## Checks (2026-11-21, tops 2026-11-22)

- `tree_check.mjs`: 14 parameter sets × the tops (38 jobs) against `solidcraft-cli` builds of v3, the tree and the
  star in its place: all exact.
- `tree_build.mjs --sweep`: every corner of the range for each top plus the paint and star edges. Results:
  - closed meshes;
  - the star on its tab does not touch the tree;
  - with no fit the tab touches the slot;
  - the slot walls are ≥ 1.27 mm (at the 22 mm star);
  - the tab adds nothing below H.
- `tools/slice_paint_check.py`: the default tree (all flavours) in PrusaSlicer 2.9.6 (XL 5T), Bambu Studio
  02.09.01.70 and OrcaSlicer 2.5.1 (X1C project settings) reproduces Jan's 8 colour runs layer for layer; a 140 mm
  tree at 0° matches its computed bands in all three.
- Jan opened the three default 3MF files in the Bambu Studio, OrcaSlicer and PrusaSlicer windows: the paint is there
  and works (2026-11-21).
- Sharp (default) reproduces Jan's 8 colour runs in all three slicers. Star (default) gives the same runs plus T2 (the
  star in filament 3) in layers 0–24, and the tab up to 129.8 mm (`--extra "2:0-5"`).
- Where a band boundary falls exactly on a layer's mid plane and a flat face lies there (0° undersides, e.g. H = 150),
  the slicer gets that one layer in both colours: the slice plane runs through the face itself. Not a fault of the
  file.
