# Parametric Christmas Star with Core

Second version of the 26-point star (the magnet version is `star_spec.md`; nothing is shared at run time). The points
snap into a printed frame core instead of holding on to each other. Site name "Parametric Christmas Star with Core" /
"Parametrischer Weihnachtsstern mit Kern"; the original's brand name is never used.

- Master: `Christmas/solidcraft/christmas_star_core.sc` (snapshot of Jan's `Christmas_star_core_v1.sc`, SolidCraft 0.46),
  built by the generators in `Christmas/solidcraft/core_gen/` (`gen.py` parameters, core, points, assembly; `gen_top.py`
  lugs, lamp plate, top point; `gen_fit.py` fit bodies; `gen_lamptube.py` closed lamp plug; `gen_e10.py` scaled lugs and
  the E10 plate). They write SolidCraft command scripts; `batch {path}` runs them in the app (from a folder the MCP may
  read).
- Port: `Christmas/web/src/corestar.js` (same equations), page `Christmas/web/corestar/`, inputs and lamp table
  `corestar_params.json`.

## Parts (D 550, k 3, wall 0.9)

| Part | Count | Volume | Prints |
|---|---|---|---|
| Core | 1 | 77.7 cm³ | on its top window (flat ring), 156.6 mm tall |
| Square point | 17 | 26.4 cm³ | standing on its plug, 205.8 mm |
| Triangular point | 8 | 18.6 cm³ | standing, 201.4 mm |
| Lamp plate (E27 / E10) | 1 | 8.1 / 12.9 cm³ | plate down |
| Top point half | 2 | 13.8 cm³ | standing, 141.9 mm |
| Top sleeve | 1 | 0.9 cm³ | standing |

## Geometry

Rhombicuboctahedron with edge a = D/2/(rs + k), rs = (1+√2)/2, rt = (3+√2)/(2√3); square faces at Rs = rs·a, triangle
faces at Rt = rt·a; hs = k·a, ht = D/2 − Rt (all tips on D/2). Radial planes through centre and edge lean against a face
axis by T = 0.5/rs (squares, 22.5°) and T = 1/(2√3·rt) (triangles, 12.76°); c = 1/√(1+T²).

Point frame: plug end on z = 0, face plane at Z0 = hf + zb, star centre at zc = Z0 − R. A wall at offset δ from the
radial planes has the half width (square) or inradius (triangle) `sw(z, δ) = (z − zc)·T − δ/c`.

- Core = outer polyhedron (faces at R − er) minus inner polyhedron (R − hf), minus 25 window cutters and the top window.
  A cutter is the frustum of the window walls (δ = w, from Z0 − hf − 2 to Z0 + 1) joined with the 45° flank frustum
  (half width `wod − (Z0 − z)` from zx − 0.5 to Z0 + 1). The top window has no flank: the core prints on that flat ring.
  The struts become ridges with 45° flanks; zx = (Z0 − wod − zc·T − w/c)/(1 − T) is where flank and wall meet.
- Point: plug walls at δ = dpl = w + g/2 (outside) and dpi = dpl + tw (inside), the flare at 45° from the plug to the
  pyramid base `wod = R·T − g/(2c)` at Z0 (it rests on the flank), the pyramid to the tip at Z0 + h, wall t.
  zf, zfi, zpi, za: where plug, flare and pyramid meet outside and inside (equations in `corestar.js` / the .sc).
- Snap on every side (−y side, patterned): a 12 mm horizontal arm between a slit above it (zs = Z0 − hf + 0.6) and a
  slit at its free end; it bends along the layers. Barb near the free end: 45° catch face through the catch edge moved
  out by the preload `snap`, crest 0.3, 45° lower face, bp = 0.8 high. The catch edge is the strut's inner face at
  Z0 − hf; the barb pulls the flare onto the flank (no play), a firm pull releases it.
- Top window: four rope lugs in the corners, depth dg = min(14, 0.47·Xc) along the diagonal (Xc: window half width at
  the ring), hole dr = min(7, dg/2) at dg/2 from the corner. The lamp plate (hp from the top point's inner wall at the
  plate top, minus g) rests on the ring, its closed octagonal plug passes 0.5 mm inside the lugs and carries 4 snaps
  (2026-11-23: the first fit test's free-standing tabs broke in PLA). E27: hole hd; E10: sleeve below the plate
  (bore 15.4, 45° seat Ø 12, the holder ends flush with the plate top).
- Top point: hollow pyramid (wall 1.2) from the ring to the normal tip height, cut open at the outer width ws = 18,
  the inner wall thickened over 3 mm to carry a 12 mm spigot; split along the diagonal through two opposite edges
  (gap 0.2; both halves are the same part); the sleeve (slot 8 for the cable) wedges the halves together.

## Lamps and limits (`lampProblems`)

- Base: the triangle's and the lamp plate's snap arms need la/2 + sl + 1 of flat wall; the lugs must not meet; the
  top point needs room for its spigot. Smallest stars: 30 cm (k 2.4), 32 cm (k 3), 37 cm (k 3.6).
- E10 sleeve (Ø 15.1 pre-wired holder): sleeve inside the plug. E27 (thread 40 × 2.5): hole inside the plug, holder
  body Ø 44 through it, shade ring Ø 56.5 inside the top point and clear of the rope holes. All: the widest part passes
  the top window and lugs when the plate comes out; the bulb keeps 5 (E10) or 15 mm (E27) from every plane of the inner
  polyhedron moved in by the plug.
- Smallest star per lamp (k 2.4 / 3 / 3.6): E10 30/32/37, E27 P45 45/53/60, E27 A60 53/61/70 cm.

## Checks

- `node node/corestar_check.mjs`: 12 sets, solidcraft-cli rebuild → STEP with the 7 part bodies, exact boolean
  differences against the JS parts (both 0), volume and bbox → `export/web/corestar_check.md`.
- `node node/corestar_build.mjs [--assembly] [--sweep]`: closed meshes on z = 0, heights, 3MF; the assembly of 30 parts
  has no overlap except the barb preload behind the core (0.283 mm³ for a square point at the default).
- SolidCraft `inspect.interference` on the assembled master: no point touches another; contacts only on the flanks and
  the barbs.

## Log

- 2026-11-23: concept in SolidCraft; core, square and triangle point = analytic volumes; Jan chose the two-part top
  point, the cord on the core and the lamp plate.
- 2026-11-23: Jan's fit test (55 cm, PLA: core crown, short points, lamp plate, top point): "everything fits" except
  the lamp plate's tabs, which broke → closed octagonal plug. Lugs scale with the window; E10 plate added. The snap
  preload stays 0.2 (no other value asked for).
- 2026-11-23: `corestar_check.mjs` default set 0 mm³ for all 7 bodies; the full sweep in `export/web/corestar_check.md`.
