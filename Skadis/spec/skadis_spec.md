# IKEA SKÅDIS – board dimensions and interface for printed accessories

Research of 2026-11-21. IKEA publishes **no drawing** of the slots, no board thickness, no wall gap and no load
ratings. The slot geometry below is community-measured, but six independent sources agree on it.
Everything marked **[measure]** has to be checked with calipers on our own boards before the first part is fixed
(checklist in §7).

## 1. Boards (official IKEA data)

| Size W × H (cm) | white | black | wood | notes |
|---|---|---|---|---|
| 36 × 56 | 50320805 | 80534372 | 70347173 | |
| 56 × 56 | 00320803 | 10534375 | 90347172 | |
| 76 × 56 | 10321618 | 50534378 | 10347171 | |
| 76 × 56 double-sided | – | – | – | 00624423, dark grey-blue / dark lilac-red, new in 2026 |
| 36 × 56 double-sided | – | – | – | 20624417 |
| 56 × 37 freestanding | 00541574 | – | – | desk divider with adjustable legs |

- Material: fibreboard with acrylic paint (white/black) or clear acrylic lacquer (wood). Mounting rail: powder-coated steel.
- The product pages list width and height only. Depth, thickness and max load are not published.
- "Pegboard combination" kits are the same boards with a set of accessories.

## 2. Slot grid

```
 x →  0    20    40    60    80    100   (mm, slot centres)
 y=0  ▯           ▯           ▯          row A: a slot every 40 mm
 y=20       ▯           ▯           ▯    row B: the same, shifted 20 mm
 y=40 ▯           ▯           ▯
 y=60       ▯           ▯           ▯
```

| Item | Value | Confidence |
|---|---|---|
| Slot shape | vertical stadium (obround), **5 × 15 mm**, end radius 2.5, straight part 10 | community, consistent; one report measured 5.2 × 15.2 **[measure]** |
| Row spacing (vertical) | **20 mm** | consistent |
| Slot spacing within a row | **40 mm** | consistent |
| Row offset | every other row shifted **20 mm** | consistent |
| Same-column neighbour | 40 mm vertically (rows i and i+2) | derived |
| Diagonal neighbour | (±20, ±20) mm, 28.3 mm apart | derived |
| Equivalent description | a 40 × 40 grid plus a second 40 × 40 grid offset by (20, 20) | |
| Board thickness | **≈ 5 mm**: one maker quotes ±0.2, others "not all exactly 5 mm" | **[measure]** per variant |
| Slot centre to board edge | **20 mm** probably: the custom-board generator's default, which fits 360/560/760 exactly | **[measure]** |

If the edge margin is 20 mm, each board has **27 rows** (y = 20 … 540), alternating 14 rows of type A and 13 of type B:

| Board | slots per row A / B | slots total |
|---|---|---|
| 36 × 56 | 9 / 8 | 230 |
| 56 × 56 | 14 / 13 | 365 |
| 76 × 56 | 19 / 18 | 500 |

Whether the corner positions hold a slot (row A at the top) or not (row B at the top) is open **[measure]**.

## 3. Mounting (assembly instructions AA-1891323-4, 2024)

- A steel **rail** is screwed to the wall (wall screws not included). Distance between the rail's screw holes:
  X = 200 / 400 / 600 mm for the 36 / 56 / 76 boards, which puts the holes 80 mm in from the board edges.
- The board's **top corners** screw through a slot onto the rail's bent end tabs. The **bottom corners** get two
  plastic **spacer cylinders**, screwed through a slot from the front. That is 4 screws and 2 spacers per board.
  → The 4 corner slots are taken by screws, and the rail runs across the back near the top edge **[measure its
  height and position]**, so rear-reaching parts must avoid it.
- **Gap from the back of the board to the wall: ≈ 20 mm** with the original hardware. Printed replacement spacers
  say "20 mm replicates the official spacer", and the Prusa-made board uses 10 mm by comparison **[measure]**.
- Several boards: the rails sit 565 mm apart vertically, with 165 mm between the inner holes of neighbouring
  rails. Both figures work out to a **5 mm gap between boards**. With 20 mm edge margins, the slot spacing
  across a seam is then 45 mm instead of 40, so a multi-slot accessory must not straddle two boards **[verify]**.
- Without drilling: SKÅDIS connector 10320789 clamps to a desk or shelf up to 50 mm thick (W 20 × D 50 × H 180).
  The wardrobe connector is 10477643.

## 4. How accessories lock into the board

**A. Drop-in L-tab** (IKEA hooks and most printables). A tab passes through the slot, and its lip hangs down
behind the board. To mount, insert it about 10 mm high, then lower it until the tab rests on the bottom of the
slot. To remove, lift it. The load bears on the slot's lower edge, in fibreboard. Reference values
(buildcad.ai hook):
- tab width 4.6 mm (0.2 play per side), adjustable 4.0–4.9
- tab plus latch height 13.1 mm (must stay ≤ 14 to pass the 15 mm slot)
- gap behind the front plate 5.3 mm (board 5.0 + 0.3 play; play adjustable 0.1–0.8, board 4.5–6)
- lip 6 mm, plate height below the slot 20 mm
- a second tab, or a peg in a slot 40 mm away (same row or same column), stops the part from twisting

**B. Push-in snap clips** (SKÅPA, `nmattia/skapa`, `src/model/manifold.ts`). Each clip is a pair of prongs:
- 1.5 mm thick, 1.9 mm apart (4.9 mm over both), 12 mm tall, 6.5 mm long
- a 0.6 mm bump per side (6.1 mm over both), at 4.3–5.9 mm from the face, with 45° ramps at 3.7–4.3 and 5.9–6.5
- clip pairs every 40 mm horizontally and vertically; clips above the first level get a 45° chamfer so they print
  without supports
- pushed straight in, so no lift is needed (good for boxes)

**C. T-nuts** (Printables 228663, `mayjs/skadis_tnut_openscad`): screw anything onto the board. Clearance 0.3,
mounting hole 2.8 (M3) or 2.3 (M2), keep-out Ø 7.

**D. IKEA's own fittings**: steel hooks (D 25 × H 60 mm, "two prongs at the bottom, curved top"), and an acetal
"wall fitting" on the containers. All are "no tools needed". Their lock geometry is not published
**[measure an original part if we want to match its feel]**.

**Our tab (all SKÅDIS models here, `skadis_params.json`):** a drop-in L-tab, **4.8 wide, gap 5.1**, shank 7 high,
lip 6 down × 3.5 thick, 13 mm in all, with 1 mm chamfers on both ends. Each tab is flush with its part's print-bed face,
so the L-profile is in the layer plane and nothing needs support.
- Fit test 2026-11 (Jan's IKEA boards, PETG, Prusa XL): W 4.8 / G 5.1 best, W 4.8 / G 5.3 a bit loose. Both best
  values sit at the edge of the tested range (W 4.4–4.8, G 5.1–5.5), and the slots are likely wider than 5.0
  (one measurement: 5.2 × 15.2).
- A flat 4.8 mm tab rests on the round end of a nominal 5 mm slot about 1.8 mm above its lowest point (`tab_seat()`);
  centred, the chamfered 13 mm tab clears the round ends of a nominal slot by about 0.2 mm.

## 5. Official accessories (IKEA DE, 24 of 46 items read)

| Item | Article | Notes |
|---|---|---|
| Hook | 50335618 (2 pack), 20320802 (5 pack) | steel, D 25 × H 60 |
| Hook 19 mm | 20519888 (5 pack) | |
| Hook rack | 40519887 | 12 hooks, steel |
| Container | 20320798 | steel, epoxy coated |
| Container with lid | 80335909 (3 pack) | W 70 × D 85 × H 80; PET box, steel lid, acetal wall fitting |
| Storage basket set of 3 (mesh) / felt basket | 50517760 / 10599499 | |
| Shelf / display shelf | 00320799 / 20591841 | |
| Clip | 00321614 (2 pack) | plastic spring clips |
| Elastic cord | 40321631 (3 pack) | |
| 7-piece accessory set | 20586420 | cup, clips, hooks, shelf |
| Connector (desk/shelf), connector for wardrobe | 10320789, 10477643 | |

There was no roll holder among the items read.

## 6. Printing advice from the community

- Print hooks **on their side** so the layers run along the arm (the load direction). Use 0.2 mm layers, 4 walls
  and ≥ 30 % infill. 4 walls make the small tabs nearly solid.
- **PETG** for heavy tools, **PLA** for light ones.
- Boards vary by a few tenths of a millimetre, so print a test coupon first, and make tab width, board thickness
  and play behind the board parameters.
- Printed holes come out about 0.2 mm small.
- Keep heavy loads close to the board: long arms lever the tab against the slot's lower edge. Two rows of tabs
  (or tab plus anti-lift peg) for boxes and heavier items.
- The 5.3 mm bridge behind an L-tab prints without support on most printers.

## 7. Measure on our boards (calipers)

1. Board thickness of each variant we own (white / black / wood / double-sided), at 3 points.
2. Slot width and length on 5 slots, mid-board and near the edges.
3. Spacing over 10 slots in a row (should be 400.0 mm) and over 20 rows in a column (400.0 mm), to detect scale.
4. Distance from slot centre to the top and side edges. Does the corner position hold a slot?
5. Gap from board back to wall, spacer length, and the rail's height, thickness and distance from the top edge.
6. Board corner radius, and any chamfer or burr at the slot edges (front vs back).
7. Optional: tab thickness, length and lip depth of an original IKEA hook and container fitting.

## 8. Sources

- IKEA product pages: [56×56 white](https://www.ikea.com/de/en/p/skadis-pegboard-white-00320803/),
  [36×56 white](https://www.ikea.com/gb/en/p/skadis-pegboard-white-50320805/),
  [76×56 white](https://www.ikea.com/nl/en/p/skadis-pegboard-white-10321618/),
  [36×56 wood](https://www.ikea.com/fi/en/p/skadis-pegboard-wood-70347173/),
  [56×56 black](https://www.ikea.com/qa/en/p/skadis-pegboard-black-10534375),
  [double-sided](https://www.ikea.com/de/en/p/skadis-pegboard-double-sided-dark-grey-blue-dark-lilac-red-00624423/),
  [series](https://www.ikea.com/de/en/cat/skadis-series-37813/), [hook](https://www.ikea.com/de/en/p/skadis-hook-white-20320802/),
  [container with lid](https://www.ikea.com/de/en/p/skadis-container-with-lid-white-80335909/),
  [connector](https://www.ikea.com/de/en/p/skadis-connector-white-10320789/)
- [Assembly instructions AA-1891323-4](https://www.ikea.com/de/en/assembly_instructions/skadis-pegboard-white__AA-1891323-4-100.pdf)
- [pegboardly: SKÅDIS sizes & dimensions](https://pegboardly.com/skadis/skadis-sizes-and-dimensions)
- [buildcad.ai hook](https://buildcad.ai/library/skadis-hook), [buildcad.ai tool holder](https://buildcad.ai/library/skadis-tool-holder)
- [Autodesk Skadis Generator](https://marketplace.autodesk.com/apps/880f2e71-a0b1-41ec-b148-294452d2419c)
- GitHub: [nmattia/skapa](https://github.com/nmattia/skapa) ([skapa.build](https://skapa.build)),
  [EmilBjorn/Skadis-generator](https://github.com/EmilBjorn/Skadis-generator),
  [mayjs/skadis_tnut_openscad](https://github.com/mayjs/skadis_tnut_openscad)
- Wall gap: [MakerWorld spacer 47432](https://makerworld.com/en/models/47432),
  [Printables 140497](https://www.printables.com/model/140497-spacer-for-the-skadis-for-prusa);
  thickness ±0.2: [MakerWorld 208330](https://makerworld.com/zh/models/208330)
