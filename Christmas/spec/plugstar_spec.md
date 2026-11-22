# Plug-Together Star: model, connector, checks

Source of truth: the SolidCraft model `Christmas/solidcraft/plug_star.sc`, a snapshot of
`D:\CreativeProjects\Solidcraft_Models\Plug_star_v1.sc` (SolidCraft 0.45, 2026-11-22). The site generator
(`Christmas/web/src/plugstar.js`) ports it with the same equations; `Christmas/web/node/plugstar_check.mjs` compares
the three bodies over a sweep. Idea: a photo of a friend's paper-like 3-D star whose single-coloured points plug
together; Jan chose the hidden snap connector (2026-11-22).

The star: N points (4–8), each a **triangular bipyramid**: the tip T and the two inner corners I1, I2 in the star plane,
the centre C raised to ±hc above and below it. A point fills its sector of 360°/N (its side faces lie fit/2 behind the
sector planes, so neighbours never touch), and slides **radially** onto a hidden **connector** in the star plane: a hub
disc with one tongue per point, each tongue split into two barbed prongs that click into a pocket inside the point.
Every point moves only along its own axis, so the points go in in any order, the last one too (a ring of rigid parts
plugged into each other could not close).

## Geometry

Inputs (spec key ↔ .sc name): `diameter` D = 200 (circle through the tips), `points` N = 5 (`pts`), `tip_angle`
α = 40° (`alpha`), `depth` = 22 % (thickness at the centre / D, `depth` 0.22), `fit` = 0.15 or 0.20 mm (a choice:
0.15 clicked best in PLA in Jan's fit test, 0.20 for other materials), `hanger` (point 0 with a hole). Frame: star centre at the origin, star plane XY, the point's axis on +X.

```
Rt = D/2,  hc = depth·Rt,  β = α/2,  φ = 180°/N
ri = Rt·sin β / sin(β + φ)           inner corner radius (triangle O–T–I: angles φ at O, β at T)
T = (Rt, 0, 0),  I1,2 = ri·(cos φ, ∓sin φ, 0),  C± = (0, 0, ±hc)
ox = fit/2 / sin φ                   inner edge of a point (both side faces fit/2 behind the sector planes)
ms = hc·(1 − ri/Rt·cos φ)/(ri·sin φ)  sideways slope of the faces: z_top(x, y) = hc·(1 − x/Rt) − ms·|y|
```

Connector (all lengths × sc = max(1, D/250), so it grows with stars larger than 250 mm; the strain in the prongs stays
the same): thickness tk 3, tongue width wt 6.2 (both prongs), slit sw 2.2, barb depth bd 0.8, barb land bl 0.8, prong
length Lp 12.

```
rh    = (wt/2 + 2·sc)/tan φ          hub radius: the channel walls stay ≥ 1.3 mm from the side faces
uslit = rh + 2·sc                    slit end (round, Ø sw)
ucat  = uslit + Lp                   barb catch face starts (45°)
uend  = ucat + bd + bl + bd·√3       tongue end (30° lead-in ramp)
```

Tongue outline (u along the axis, v across): (0, ±wt/2) → (ucat, ±wt/2) → 45° out to (ucat + bd, ±(wt/2 + bd)) →
land to ucat + bd + bl → 30° in to (uend, ±wt/2).

Point: the bipyramid (lofts from the kite T–I2–O–I1 to C+ and C−), minus everything outside the wedge from (ox, 0)
(`SideCut`), minus the hub slot (cylinder rh + fit, height tk + 2·fit) and the pocket (`Pocket`, height tk + 2·fit):

```
(0, ±wf) → (ucat + fit, ±wf) → 45° to (ucat + fit + bd, ±(wf + bd)) → (uend, ±(wf + bd))      wf = wt/2 + fit
```

The pocket's 45° shoulder lies on the line of the barb's catch face, and its end on the tongue end: the seated state is
the modelled one (distance 0 at both). Printed, the pocket comes out a little short and the tongue a little long, so the
barbs stay slightly bent and pull the point in against the tongue end. Pulled hard, the 45° faces push the prongs in and
let the point go (estimated: about 13 N to push in, 20+ N to pull out at scale 1).

Prong strain while passing the channel: deflection bd − fit = 0.6 per prong, ε ≈ 1.5·δ·b/L² ≈ 1.3 % (b = 2 mm,
L = 12 mm) for PLA. The prongs bend in the plane of the layers (the connector prints flat).

Hanging hole (Ø hangd 3·sc, along Z, point 0): as far in as the outline needs (hangm 2.5·sc beside it) and as the
thickness at its edge needs (hangt 3·sc):

```
hangx = Rt − max((hangd/2 + hangm)/tan β, (hangt/2 + hangd/2·√(depth² + ms²))/depth)
```

## Checks of a size (`plugProblems`)

- wall over the pocket ≥ 1.2: `z_top(uend, wf + bd) − (tk/2 + fit)` (the pocket's far corner is its thinnest spot);
- jaw over the hub slot ≥ 1.5: `hc·(1 − (rh + fit)/ri) − (tk/2 + fit)` (the top face along a side face falls linearly
  from hc at the centre to 0 at I);
- the hanging hole ≥ 3·sc beyond the pocket end.

`minDiameter` searches the diameter grid. At the defaults the smallest star is 100 mm; thin, slim, many-pointed stars
need more, at most 130 mm (N 6–8, α 30°, 15 %, either fit).

## The .sc timeline

| Features | Body |
|---|---|
| ArmPlan (kite, points as expressions), ArmApexTop/Bot (a point at ±hc) → ArmTop (loft, new), ArmBottom (loft, join); SideCutPlan → SideCut (symmetric through all, cut); HubSlot (cylinder cut); PocketPlan → Pocket (extrude cut) | Point |
| HangCopy (move, copy of Point), HangHole (cylinder cut) | PointHang |
| Hub (cylinder, new); TonguePlan → Tongue (join); SlitEnd (cylinder cut), Slit (box cut); Tongues (circular pattern of the three, count pts) | Connector |

## Printing

- Points lie on their side face at −φ (`printPose`: that face on z = 0, tip up, the star's thickness along Y); the outer
  faces on the bed side overhang 4–40° from vertical over the whole range. The hub slot, the pocket (3.4 mm wide) and the
  hanging hole have short bridged ceilings: PrusaSlicer's auto supports put support into them, which could not be
  removed, so **supports off** (build sheet).
- Connector flat, 100 % infill.
- Fit test (page): the connector and a short point per fit (0.15 in filament 2, 0.20 in filament 3), each placed with
  its own fit's pose.
- One plate per colour with an AMS: mixed on one plate the default star needed about 375 g of purge in Bambu Studio.

## Checks

- 2026-11-22: SolidCraft, default: bipyramid 35 565.39 mm³ = analytic; after side cut and slots 34 882.21 (hand
  estimate 34 882); connector 1 624.64 (hand 1 624.7); hanging hole 28.7 mm³ (hand 28.74). Rebuilds without errors at
  N 4/8, α 30/60, depth 15/35 %, D 150/500, fit 0.4.
- 2026-11-22: Jan's fit test (connector + short points at fit 0.15/0.20/0.30, PLA, X1C): 0.15 fits best. The fit became
  a choice of 0.15 (default) and 0.20; the .sc default is 0.15.
- 2026-11-22: `plugstar_check.mjs`, 15 sets (every parameter at both ends, three mixed): JS vs SolidCraft, both boolean
  differences 0 mm³ for all three bodies.
- 2026-11-22: `plugstar_assembly.mjs` (D 200/100/260/300/400, N 4/5/6/8): seated parts overlap 0 mm³, neighbour gap =
  fit exactly, tongue end and catch touch (distance 0); a point pulled out step by step never meets its neighbours nor
  the hub or tongue core, only the barbs (largest interference 5.8 mm³ at scale 1 = 2 barbs × 0.97 mm² × 3 mm, as
  computed).
- 2026-11-22: slicers, default star: PrusaSlicer 2.9.6, Bambu Studio 02.09.01.70 and OrcaSlicer 2.5.1 print every point
  in its filament (T0, T1, T2, T0, T1, connector T0). PrusaSlicer (XL, 2 perimeters, 15 %): one point 15.1 g, 51 min;
  connector 1.9 g. `tools/slice_paint_check.py` moves every item by (128, 128): check a page 3MF from a copy shifted
  back to the origin.
