# Onshape source snapshot – Gridfinity Rugged Case

Snapshot taken 2026-10-23 with `tools/onshape_api.py`. The JSON files are the full feature trees; the `*_summary.txt` files are
readable digests (`tools/onshape_summarize.py`).

## Derive chain
```
Gridfinity Rugged Box_1  (Jan1409, public)  d/94acae54cd8b397fb4edc00c/w/989750bc44e9e7da81f295bd
├─ Assembly   d91f17ee00a0d5ff6f6d2a8f  "Gridfinity Rugged Case Assembly"  (link target)
├─ BOM        3ca85afb96e5fff3744f957d
└─ PartStudio 4883f94d7b0fe4d97107430a  "Gridfinity Case"  (50 features)       -> case_features.json
   ├─ Derived 1 <- "Parametric Rugged Box" (Matthew Wilson, public)
   │              d/a84fd41eac14a7770471e4aa/v/4f17845ad987bb12a233ee7b/e/470dbc6700db9e5787298184 (47 features)
   │              -> src_rugged_box_features.json
   │              overrides: length = 42mm*x_count, width = 42mm*y_count, depth = 7mm*z_count + 6.4mm,
   │                         split_height = 7mm*z_count - 6mm, shell_t = 2.4mm, hinge_width = 30mm, inner_fillet = 4mm
   └─ Derived 2 <- "Parametric Gridfinity" (Matthew Wilson, public)
                  d/193b91861be68112c6f15cf6/v/8726e58aa6bf6e0633a31c89/e/eb59c86155cf511680aecb14 "Gridfinity frame unit"
                  -> src_gf_frame_unit_features.json
```
The same "Parametric Gridfinity" version also holds the references for bins and baseplates (Step 5):
`src_gf_frame` (9c5d9a88…), `src_gf_base_unit` (988e42de…), `src_gf_plain_bin` (3b425f61…),
`src_gf_deep_1x1` (07629c2d…), `src_gf_vase_mode` (30e23890…).
The Rugged Box document also contains a STEP blob "Rugged Box Parametric V2.step" (element 9b9f30b66289a8e155ebc0c1).

## Configuration inputs (case_configuration.json)
| Input | Default | Range |
|---|---|---|
| x_count | 5 | 3–12 (integer) |
| y_count | 4 | 2–12 (integer) |
| z_count | 6 | 4–12 (integer) |
| window_t | 1.6 mm | 0.75–2.0 mm |
| Print_Layout | false | boolean |

Rugged Box source defaults (src_rugged_box_configuration.json): length 120, width 70, depth 50, split_height 30, shell_t 2.4,
hinge_width 30, inner_fillet 5 (all mm).

## Parts (default config)
Base, Lid, Latch ×2 (identical, size-independent), Seal, and the window ("Part 6", plexiglass, thickness window_t).
Part IDs change between configurations; list them with `onshape_api.py parts <url> <config>`.

## Reference exports (../reference/)
Per-part STLs for 3×2×4, 5×4×6 (default) and 8×6×8, plus `5x4x6/case_5x4x6.step` (whole Part Studio).
`5x4x6_w075/` holds Lid + Window at window_t = 0.75: the lid top and the window top stay put, only the window seat moves.

## Derived data
- `*_sketches.txt` + `sketches/<studio>/*.png` – every sketch in mm (`tools/onshape_sketches.py`)
- `hardware_sections.txt` – exact hinge/latch zone outlines at x = 64.6 / 67.7 / 75 / 88.3 / 91.4 (5×4×6)
- The geometry spec built from all of this: `../spec/case_spec.md` + `../spec/case_params.json`
Observed overall sizes (assembled layout, Print_Layout = false):
- Base: X = 42·x + 8.52, Y = 42·y + 22.52 (hinges + latches add 14 mm in Y), height = 7·z + 0.6
- Lid: same X/Y, height 18.2 (constant)
- Window: (42·x − 4) × (42·y − 4) × window_t
- Seal: (42·x + 6.06) × (42·y + 6.06) × 1.4
- Latch: 23.2 × 8.77 × 31.08 (constant)
- 12×12 (max) would be ~512 mm, which exceeds the Prusa XL bed; the generator must warn or limit.

## Credits / licence
Base geometry derives from Matthew Wilson's public Onshape documents. Check the licence and credit them before publishing a generator.
