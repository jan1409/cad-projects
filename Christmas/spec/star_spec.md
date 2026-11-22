# Parametric Christmas Star: model, lamps, checks

Source of truth: the SolidCraft model `Christmas/solidcraft/christmas_star.sc`, a snapshot of
`D:\CreativeProjects\Solidcraft_Models\Christmas_star_v1.sc` (SolidCraft 0.45, 2026-11-22), and the fixed E27 nut
`Christmas/solidcraft/e27_nut.sc` (`Christmas_star_e27_nut.sc`). The site generator (`Christmas/web/src/star.js`)
ports the star with the same equations; `Christmas/web/node/star_check.mjs` compares the five bodies over a sweep.

The star: 25 hollow pyramids ("points") on the faces of a rhombicuboctahedron (17 squares, 8 triangles); the top square
carries the lamp socket. There is no core part: every point carries its own piece of the core, the **skirt**, the cone
from the star centre over its face cut off at depth d. Neighbouring skirt walls meet in the plane through the centre
and their common edge, so each point slides in radially in any order (a cone moved outwards along its axis stays
inside its own place), and the parts can be printed standing on the skirt rim without supports.

## Geometry

Inputs (spec key ↔ .sc name): `diameter` D = 550 (tip to tip), `slenderness` k = 3.0 (square point height / edge),
`wall` t = 0.9, `fit` g = 0.2 (gap between neighbouring skirt walls), `lamp` (sets Do, holeD, Ll or holeS, sh, sw).

```
rs = (1+√2)/2 ≈ 1.2071           centre to a square face, per edge
rt = (3+√2)/(2√3) ≈ 1.2743       centre to a triangle face, per edge
a  = D/2 / (rs + k)              edge of the rhombicuboctahedron (all tips on the sphere D/2)
hs = k·a,  ht = D/2 − rt·a       point heights (the triangle point is 0.067a shorter)
d  = max(kd·a, (dm + mfit + 2.2)·cos tht)   skirt depth (kd 0.2; deep enough for the magnets in small stars)
Rs = rs·a,  Rt = rt·a
ths = atan(0.5/rs) = 22.5°       square skirt wall tilt;  tht = atan(1/(2√3·rt)) ≈ 12.76° triangle
```

Square point, frame: skirt bottom on z = 0, axis +Z, face at z = d, tip at z = d + hs. Half-widths:

```
wo0 = a/2·(Rs−d)/Rs − g/2/cos ths     skirt outside, bottom (the wall sits g/2 behind the plane)
wod = a/2 − g/2/cos ths               skirt outside at the face = pyramid base
wi0 = wo0 − ts/cos ths,  wid = wod − ts/cos ths      skirt inside (ts = hm + mrec + mskin = 2.9)
wpi = wod − t/cos(atan(wod/hs))       pyramid cavity base;  apex of the cavity at d + hs·wpi/wod
```

Triangle point: the same with inradii (ro0, rod, ri0, rid, rpi; a/(2√3) instead of a/2, Rt, tht), a corner on +Y.

Magnets (2026-11-22, replacing the snap bumps of the first fit test, which held nothing): on every skirt wall two
press-fit pockets for disc magnets dm 5 × hm 2 at ±s along the edge (s = 0.25a, counted anticlockwise seen from
outside), vb = max(rp + 1.2, 0.45·d) down the wall; pocket Ø dm + magnet_fit (0.1, a page parameter picked with the
fit test's pocket block), mrec + hm deep along the wall normal (the magnet ends mrec 0.1 below the surface, mskin 0.8
behind it). A dot (Ø 1.5, 0.5 deep) beside the +s pocket marks it. Stack all magnets into one column and mark its top:
marked faces out in the dotted pockets, unmarked out in the others. Neighbours run along a shared edge in opposite
directions, so every wall fits every wall in any turn: a dotted pocket always faces an undotted one, coaxial, the
mouths the fit gap apart, and the pair attracts. Magnets per star: 17·8 + 8·6 + 8 = 192. Every point is held by
its neighbours whatever the order; the whole star hangs by the socket's 8 pairs (check big stars before hanging).

Lamp socket (top square, held by its magnets like a point): a shallow skirt `ds = (vb + rp + 1)·cos ths` (deep enough
for its magnets, wide enough for the lamp) under a plate tp 2.5, two cord holes Ø 3 along a diagonal at
`re = √2·wid − 1.5 − 1.5`. Two variants:

- **bayonet**: opening Do, 3 notches (to Rn = Do/2 + Ll + cl), under the plate 3 stops and 3 detent ramps. The
  **carrier** (tube with the holder bore holeD, 45° cone resting on the opening edge, rim, 3 lugs of 30°) turns in by
  60° clockwise seen from above. The lamp holder is clamped through the whole carrier (10 mm): the shade ring or
  clamp ring on top, the printed nut or the holder flange underneath, and comes out with the carrier.
- **sleeve** (E10 pre-wired holder, measured by Jan 2026-11-22: collar Ø 15.1 at the lamp end, body Ø 12.9, 24 long;
  LED Ø 9.8): a sleeve holeS 15.4 hanging below the plate, `sh = hlS + 0.5 + (holeS − ledS)/2 − tp` long, so the holder
  ends flush with the plate top; at its lower end a 45° seat narrows to ledS 12 (the collar sits on it, the bulb passes).
  The sleeve may merge with the socket's own walls in small stars, never stick out of them. The holder is pushed in from
  above, bulb first, and pulled out by its cable.

The socket prints **plate down** (`printPose`: turned 180° about X, plate top on z = 0): printed as modelled, the plate
would overhang the skirt cavity (PrusaSlicer put 80 support layers under it); turned over it needs none.

`Do = max(holeD + 2(tw + cr), largest part below the carrier + 1.5)`; lug length Ll = 3 (2 below a 25 mm opening).

## The .sc timeline

| Features | Body |
|---|---|
| SqBot, SqTop, SqApex → SqSkirt, SqPyramid; SqCavBot, SqCavTop → SqSkirtCavity; SqPyrIn, SqApexIn → SqPyramidCavity; SqMagN, SqMagS, SqMagDot (cylinder cuts along the wall normal), SqMagnets (4×) | PointSquare |
| Tr… the same with triangles, TrMagnets (3×) | PointTriangle |
| SkBot, SkTop → SkSkirt; SkCavity; SkPlate; SocketCopy (→ SocketSleeve); SkOpening; SkNotch, SkNotches; SkStop, SkRamp, SkStops; SkCordHole, SkCordHoles; SkMagN, SkMagS, SkMagDot, SkMagnets (last: the pockets stay clear) | SocketBayonet |
| SsSleeve, SsBore, SsCordHole, SsCordHoles, SsLedgeProfile → SsLedge (revolve cut: seat and bulb passage); SsMag…, SsMagnets | SocketSleeve |
| CaProfile → CaBody (revolve); CaLugProfile → CaLug (revolve 30°, symmetric), CaLugs | Carrier |

Polylines whose points are expressions (`sketch.line`) keep every profile parametric; squares and triangles are
`sketch.polygon.circumscribed` (radius = half-width or inradius) with one edge held horizontal.

## Lamps

| Lamp | Mount | Below the carrier/plate (envelope, clearance) | Sources |
|---|---|---|---|
| E10 pre-wired holder | sleeve Ø 15.4, seat Ø 12 | holder Ø 15.1 × 21.7 (1.5), bulb Ø 9.8 × 22 (5) | plastic holder with 25 cm cable (CYIOU, 12-pack; DAOKAI the same: Ø 15 × 23 drawing), measured; LED E10 6 V 10 SMD 0.7 W 0.11 A, Ø 9.8 measured |
| E10 panel holder | hole Ø 14.5, clamp ring on top (≈ Ø 22), flange Ø 17.7 below | flange (1.5), bulb (5) | 14.5 mm panel hole, body Ø 17.7 (RS PRO 589-777; Scharnberger+Hasenbein 82342), clamps up to 13 mm |
| E27 P45 | hole Ø 41, shade ring Ø 56.5 on top, printed nut Ø 45 below | nut Ø 44 × 8 (2), holder Ø 40 × 4 (2), cap Ø 28 × 22 (10), glass Ø 45 × 55 (20) | thread 40 × 2.5 (IEC 60399), holder Ø 38.5–40 × 58, shade rings Ø 55–56.5 (Vossloh-Schwabe/Houben catalogue p. 99–104); P45 Ø 45 × 77 (Ledvance) |
| E27 A60 | as above | … glass Ø 60 × 86 (20) | A60 Ø 60 × 105–108 (Signify, Ledvance) |

`a_lamp` (smallest edge at which the envelope keeps its clearances from every placed point, exact B-rep distances,
one process per probe; the socket is left out, the lamp sits in it by design): `node node/star_lamps.mjs --write`.
Results (magnet walls 2.9): E10 sleeve 23.9, E10 panel 27.3, E27 P45 57.4, E27 A60 66.8 mm (D 201/230/483/562 at k 3). The generator
only offers lamps that fit (`socketProblems`: lugs inside the skirt, plate rim, passage, cord holes, `a_lamp`;
`minDiameter`). Smallest star per lamp:

| k | E10 sleeve | E10 panel | E27 P45 | E27 A60 |
|---|---|---|---|---|
| 2.4 | 200 | 240 | 450 | 560 |
| 3.0 | 240 | 270 | 520 | 650 |
| 3.6 | 270 | 310 | 590 | 740 |

At k 3 the bayonet geometry (lugs inside the shallow socket skirt) and, for the E10 sleeve, the cord holes beside the
sleeve set the limit, not the bulb clearance.

The ready-made E27 pendants on Amazon (KEAGAR, kwmobile) have only a short shade-ring thread at the lamp end (KEAGAR
drawing: Ø ≈ 35 mm, one ring ≈ 11 mm high, holder 80 long), not the long 40 × 2.5 sleeve the carrier assumes: the E27
carrier, socket and nut wait for Jan's measurements of his KEAGAR holder.

Notes for the build sheet: LED only (5–6 W for E27), never incandescent (glass 155–230 °C); socket, carrier and nut in
PETG (PLA softens at 55 °C, PETG ≈ 75 °C); LED bulbs run 30–85 °C at the base; hang by a cord through the two corner
holes, never by the cable; the bulb must not touch the star. E10: LED 6.3 V ≈ 0.1 A on 4 × AA (≈ 80 h).

## Printing

Every part stands on its skirt rim, tip up, without supports (skirt 22.5°/12.8° outwards, pyramid ≈ 10° inwards).
Tallest part: d + hs; Bambu X1C (256) up to D ≈ 670 at k 3, Prusa XL (360) up to the 900 maximum. Brim recommended.
The E27 nut prints flat; its thread is M40.4 × 2.5 (0.4 mm play), to be confirmed by the fit test (40.2/40.4/40.6).

## Checks

- 2026-11-22: square point at D 450/200/900 and k 3/3.6/2.4: SolidCraft volume = analytic volume (to 0.0001 mm³).
- 2026-11-22: assembly (`node/star_assembly.mjs`), 26 parts placed, 48 edges: overlap 0.0 mm³ at D 200/450/900; neighbour
  walls 0.135–0.150 mm apart (the bump sits concentric in the dimple); tips exactly on ±D/2. (Snap version, replaced.)
- 2026-11-22: `star_check.mjs`, 12 sets × 5 bodies (D 200–900, k 2.4–3.6, wall 0.8–1.6, fit 0.1–0.4, every lamp): both
  boolean differences 0.0 mm³ everywhere (also after moving the sleeve below the plate).
- 2026-11-22: PrusaSlicer 2.9.6 (XL, PETG, auto supports): carrier 0 support layers; socket 0 when turned over (80 as
  modelled); points only under the 0.5 mm snap bumps (snap version), with magnets inside the pockets (they print without: supports off); the nut inside
  its thread (prints without). One square point at D 500: 2 h 17 min, 28 g.
- Fit test (`Christmas/export/fit_test/`): plates `Passprobe_1_Ecke_PLA.3mf` (3 short squares + 1 short triangle, D 250),
  `Passprobe_2_E10-Sockel_PETG.3mf` (sleeve socket for the pre-wired holder, 26.2 tall, no supports), optional
  `Passprobe_3_E10-Einbau_PETG_optional.3mf`; E27 parts and nut M40.2/40.4/40.6 × 2.5 held back (`E27_erst_nach_Messung/`).
- replicad's `measureVolume` integrates spherical faces coarsely (0.15 mm³ off on a point): the checks use
  `BRepGProp.VolumePropertiesGK` with eps 1e-9.
- 2026-11-22: Jan's fit test (snap version): the bumps neither click nor hold; four points around a corner fall apart.
  Replaced by magnets (pressed in, no glue); a central click hub (as on the plug-together star) is proposed as a second
  joint.
- 2026-11-22: magnets: SolidCraft square 31 607.229 and triangle 22 226.358 mm³ = analytic (8/6 pockets and dots);
  `star_check.mjs` 13 sets (magnet_fit 0 and 0.3 too), both boolean differences 0 for all five bodies (the socket's
  pockets are cut last in both, else the E10 sleeve fills them in small stars); `star_assembly.mjs` at D 550/210/900/310:
  no overlap, walls 0.200 apart, all 192 pockets paired, coaxial (0.0000°), mouths 0.2 ± 0.001 apart, dotted always
  facing undotted. At D 280 k 3.6 E10 panel (now below its 310 limit) the carrier's lugs meet the thicker socket wall:
  `socketProblems` blocks it.
