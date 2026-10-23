# Gridfinity Rugged Case – browser generator

A standalone web page that builds the case with OpenCascade (replicad, WASM) and exports the print set.
No Fusion and no Onshape needed. It runs the same geometry as the Fusion port, and is verified against the Onshape
original by exact B-rep booleans: [VALIDATION.md](VALIDATION.md).

- **Published (private):** https://claude.ai/artifact/Pq6FKQCp2CJHJzkV4yBBk4
  - Downloads go through the viewer's save dialog. There the print set comes as a ZIP (STL is not on the artifact
    download list), plus the window SVG and the build sheet.
- **Home server:** part of the generator site (`../../site/`, overview page + self-updating container on port 8642).
- **Local:** `npm install` at the repo root (npm workspaces), then here `node tools/bundle.mjs`, `node tools/serve.mjs`,
  and open http://localhost:8642/. Works offline except the Google Fonts (system fallbacks). Locally the single STLs
  download directly as well.

## Layout
| Path | Purpose |
|---|---|
| `src/case.js` | the geometry: port of `../fusion/cad/_case.py` + `10_base.py` … `50_window.py`, reads `../spec/case_params.json` |
| `src/expr.js`, `src/geom2d.js` | spec expression evaluator (no eval) and the rounded-polygon math (same as the Fusion port) |
| `app/index.html`, `app/app.js` | the page: parameters, live datasheet, footprint, three.js preview, downloads |
| `app/worker.js` | builds the parts in a Web Worker (loads the gzipped kernel, returns preview meshes and print STLs) |
| `node/build.mjs` | the same build headless: `node node/build.mjs 5x4x6 [--wt 1.6] [--gap 0.2] [--force]` → `../export/web/<tag>/` (STLs, `case.step`, print set) |
| `tools/bundle.mjs` | assembles `dist/` (page, modules, spec, vendor files, gzipped kernel as `vendor/opencascade-gz.wasm`) |
| `tools/serve.mjs` | static server for `dist/` |

## Gridfinity boxes (bins)
Two site models, Standard Box and Box with Label, share one page. The site build writes `model.json` with the variant
next to it. Spec: `../spec/bin_spec.md` and `bin_params.json`. Validation: [BIN_VALIDATION.md](BIN_VALIDATION.md).

| Path | Purpose |
|---|---|
| `src/bin.js` | geometry: wall + lip swept along the outline, ruled-loft feet, label ledge, scoop, plate; `binEnv` for the datasheet |
| `bin/index.html`, `bin/app.js`, `bin/worker.js` | the page (controls generated from the variant's parameters), worker, card images |
| `node/bin_build.mjs` | `node node/bin_build.mjs label 3 2 6 [--out dir]` builds and checks one box; `--sweep` runs 46 configurations |
| `node/bin_check.mjs`, `node/bin_diff.mjs` | exact comparison with the Onshape STEPs in `../reference/bins/`, and where they differ |
| `node/bin_case_fit.mjs` | interference check of boxes in a closed Rugged Case (which heights fit) |
| `node/step2stl.mjs` | splits a STEP into one STL per solid and prints volumes / bounding boxes |

Run the box pages through the site: `npm run build` and `npm run serve` at the repo root.

## Validation
`python -I Gridfinity/fusion/validate.py --web` builds every reference configuration with `node/build.mjs`, imports
`case.step` into Fusion and compares it exactly with the Onshape STEP (Fusion MCP server must be running).

## Things that differ from the Fusion build (and why)
- **Booleans**: OpenCascade needs non-self-interfering arguments. Pieces are fused pairwise (`fuseTree`), and cut tools
  are grouped so that each group's tools are disjoint (pockets as a checkerboard; lid cuts below / above / pocket).
- replicad's fuse/cut always run UnifySameDomain afterwards. That step threw for the 3×3 case although the boolean had
  succeeded, so `fuse`/`cut` in `case.js` fall back to the raw OpenCascade boolean (same solid, coplanar faces unmerged).
  The foot pads continue 0.5 mm above the underside plane into solid material, so they overlap the slab instead of
  only touching it (no geometry change).
- `node node/sweep.mjs` builds every footprint 3–8 × 3–8 (z 6) plus the height extremes and checks that all STLs are
  watertight (`../export/web/sweep.md`).
- **Rib top-edge rounds** are cut explicitly with r 1 corner tools. OpenCascade's fillet always follows tangent edge
  chains, runs down the lid's own edge round and fails. The tools start at s = +0.05; starting exactly on the lid's
  fillet tangent left sliver faces and a non-watertight STL.
- **Tapered extrusions** are ruled lofts between rounded rectangles: the same planes and cones as Fusion's taper.
- replicad's `translate`/`rotate` consume their input shape: clone first when the original is still needed.
- replicad's XZ plane has its normal along −Y; sketch there at y1 and extrude by (y1 − y0).
