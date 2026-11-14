# Gridfinity label jig

UV printing jig for the label plates of the Box with Label (`bin_spec.md`): a flat plate with 10 pockets in which the
plates lie face up, flush with the jig's top. Requested by Jan on 2026-11-14 for his xTool O1 Omni UV printer.
Parameters: variant `jig` and block `jig` of `bin_params.json`. Code: `Gridfinity/web/src/jig.js`, page
`Gridfinity/web/jig/`, check `Gridfinity/web/node/jig_build.mjs`.

## Plates
- Taken from the box: (42 x − 5.7 − 2 plate_gap) × (11.6 − 2 plate_gap) × 1.45 mm (`binEnv(..).plate`). The jig's
  `x_count` and `plate_gap` must match the box the labels are for.

## Jig
- Pockets: plate + `clearance` (default 0.15) per side, 1.45 deep (flush), round reliefs Ø 1.4 at the corners (the
  plates have sharp corners, printed pockets rounded ones).
- Nail notch at the outer short end of each pocket: 9 wide, reaching 6 mm out and 3 mm under the plate, 1 mm deeper
  than the pocket.
- Webs 4 mm between pockets; borders 9 mm at the notch ends, 6 mm along the sides; outer corners r 3. The top left
  corner is chamfered 8 mm: label 1 sits next to it; numbers run down the first column, then the second.
- Base under the plates: `base` (default 2.5) → jig 3.95 mm thick.
- Layout: automatic = 2 columns × 5 when that fits the UV print area, else 1 column × 10; or fixed by the user.
  Checked against the xTool O1 Omni's standard baseplate (330 × 420 mm, either orientation) and the 360 × 360 bed.
  Results: 2 columns up to 4 units, 1 column from 5; the UV area takes jigs up to 9 units (390.6 mm), the Prusa XL
  bed up to 8 (348.6 mm); 10 units (432.6 mm) fit neither, the page says so.
- Downloads: the jig STL (prints flat as modelled), a 1:1 layout SVG (jig outline and the plates with their numbers,
  for the UV printer's software), a build sheet.

## Validation (`node node/jig_build.mjs --sweep`, 2026-11-14)
17 configurations: 1–10 units automatic, fixed layouts, plate gap 0.25, clearance 0 and 0.5, base 1.5 and 5. Every jig
is a closed mesh; the real label plate of `src/bin.js` placed in every pocket is free of the jig, its top exactly
flush with the jig's top, and it touches the pocket wall when moved by the clearance + 0.02 mm. Builds take about
2.5 s. CI builds 1, 2 and 10 units (`site/test.mjs`).
