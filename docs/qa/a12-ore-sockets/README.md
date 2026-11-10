# A12 with T9: ore sockets, ore frames and tier marks without the ring

Evidence for art item A12 (`docs/ART_QUALITY_AUDIT.md` §5.6 rows 24 and 25) with T9 (§5.3: "`oreBadge()` at r=8 with no ring. Remove notches and harness squares. Add an ore socket decal. Full-size HC variant for high contrast and Scan. Update `check-render-assets.mjs`. Badge ≤0.18 of the ore frame"). It answers the director's note from the A4 review: "Minerals sit on top of the blocks, grey lumps with a white-ringed badge; on the board the ore is set into the block, with no ring." Status: in review; the socket default (shallow) ships until the director picks.

## What changed

- **Ore frames (asset 25).** `ore-o1..o4` are redrawn with the kit in `assets/campaign/source/w01-ore.mjs` (side-effect free; `create-w01-sources.mjs` saves what it returns). Each ore uses three top-lit tones (lit top, body, shadow; copper adds a dim side, gold a dark hollow) plus a thin highlight on the lit top edges, in flat facet shapes (O1 4, O2 5, O3 7, O4 7), under one `#14232b` outline at `outlineWidth(96)` = 4.22 units with round joins and thinner facet seams (3.2). Copper's body is the board sample `ore_copper` `#d69d6e` (L\* 69.1); silver's lit top is `ore_silver_top` `#e4e7e3` (L\* 91.3). O1 slag iron keeps the board's pebble shape and is now **lighter than on main**: L\* 74 / 55 / 34 (main 70 / 49 / 30), in the earlier slag grey at half its chroma (`#6d757a`, nearer the board's neutral pebble). In the a04 cell (29, 5) its body facet reads 53.9 against the soil block's 45.4 (main 47.5, so it no longer sinks into the block) and its lit pebbles 72.9 (main 68.8). O4 keeps the gold crown round a dark hollow. Silhouettes were made more distinct (alpha IoU ≤ 0.69, main up to 0.83). The cream notches are gone.
- **Package frames.** The same ore at 0.74 in the plain cargo strap; the orange tag square is gone (T9 "harness squares").
- **Tier mark (T9).** `oreBadge(tier, world)` in `assets/campaign/render-sources.mjs` is now a small dark disc `#0e151d` (the board's mark), radius 8 in the 96 frame, so 0.167 of the frame (≤ 0.18), with no ring and no stroke, at the ore's lower right with about 30 % of the disc on the ore. The glyph is the journal legend's (`src/mineral-legend.ts` `campaignOreMarker`): tier 1 a dot, 2 two vertical bars, 3 three horizontal bars, 4 a triangle, drawn `#e8f0f5` (L\* 94). This matches the board (a dot on the pebble ore, II on copper) and fixes the old mismatch, where the art drew one to four tally bars while the legend said dot / II / ≡ / ▲. `oreMarkGeometry(tier, world)` gives `{cx, cy, r}` and is the one source for the frames, the high-contrast marks and the asset check. **The centres are per world** (`ORE_MARK_CENTRES`), fitted to each world's minerals so the share of the disc on the ore and on the package's ore stays 0.2 to 0.4 in both (W02's minerals differ from W01's; with W01's centres, W02's dot hung off its pebble at 0.06). The code that picks a deposit's frame (`oreNumber()`, `scene.ts`) is untouched.
- **High-contrast variant.** Overlay frames `tier-mark-hc-1..4`, one set in each world's atlas at that world's centres: on the mark's footprint, a light disc `#f4f1e8` (L\* 95.1) inside a thin (1.4-unit) dark outline, with the glyph dark. The game draws `tier-mark-hc-N` over the ore or package at depth 13.05, same place, size and bob, when the high-contrast preference is on; in W02 `image()` finds W02's own. In greyscale it sits 26.0 L\* above copper's body and about 88 above the normal dark mark. This replaces the audit's "8 + 8 + 8 HC per world" full-size frames; see "Budget" below and the accepted deviation in `docs/art-direction/decisions.md`. Scan (T8) does not exist yet; the draw has one switch point (`highContrast`) that T8 can join.
- **Deposit socket (asset 24).** One generic frame, `deposit-socket` (96 × 96 source, logical 48, category `decal`, no icon export), drawn by the game under every deposit at 1 tile, centred on its cell, no bob, depth 12.5, inside the known-cell branch of the deposit loop, `status === "deposit"` only (packages lie over air; relic deposits, which also sit in soil, get it too: see the relic column in the sheet). The seat **hugs O1**, the lowest and commonest ore (both a02 deposits, three of four in a04): its top is O1's outline grown by 2.6 units, its lower part every ore's footprint, so the taller O2 to O4 rise out of it as the board's copper rises out of its rock. On it: a faint translucent `#14232b` recess, a lit lip in band A's lip colour `#f0e6d2` **only along the seat's upward-facing top edge**, tapered at both ends (no side arms), and a contact shadow under the ore. In a04's cell (29, 5) the lip sits directly on the ore's outline at +2.5 L\* over the soil block and the shadow below it at −8.3, the board's "1–2 px rim, +2 to +4 L\*" and "contact shadow, 0 to −10 L\*". It is translucent everywhere (max alpha 65 of 255), so it darkens whatever band it lies on. W02 has no socket of its own: `scene.ts` `image()` falls back to the W01 atlas for frames W02 lacks (verified: the W02 atlas only when `campaign-w02` has the frame).
- **W02.** `assets/campaign/w02/create-sources.mjs` imports `oreBadge` and `oreMarkHighContrast`: its ore and package frames take the new mark at W02's centres, its notches and the gold tag square are removed, and it writes its own `tier-mark-hc-1..4` (`FRONTIER_REQUIRED_FRAMES` lists them; W02 now holds 94 frames). Nothing else in W02 changes.
- **Glint.** The tier 2 to 4 glint moves per world and per frame kind so it lands on a lit facet: W01 ore (x + 0.16, y − 0.04 tile), frame point (65, 44): copper's crystal L\* 84, silver's right shard 91, the crown's right point 87 (the old point, (64, 29), fell on the outline or the rock for all three new shapes); W02 ore (0.14, −0.075), frame point (63, 40): L\* 80 / 85 / 60 (the crown's body facet; no point lands on a lit facet of all three W02 shapes); packages draw the ore at 0.74 from (13, 10), so their points move in: W01 (0.124, −0.053), L\* 80 / 91 / 87; W02 (0.109, −0.088), L\* 80 / 85 / 60. Only the offsets changed.
- **Checks.** `check-render-assets.mjs` now reads the mark from `oreMarkGeometry(tier, world)`: on the W01 and W02 runtime pages at @2x and @3x, for every ore and package frame, it samples the opaque disc (floor 0.75·πr² pixels at each scale) and asserts a dark disc with a light glyph; **the mark's drawn size** (the dark disc's span along the rays right and below the centre, ≤ 0.18 of the frame plus one pixel; today 0.174 including anti-aliasing); **no light ring**, neither inside the rim (rim annulus L\* p95 ≤ 30) nor just outside it (no pixel lighter than L\* 30 in r + 0.5 to r + 2.5 on the side away from the ore); and it keeps the 2 % / 98 % L\* identification-edge gate at the same thresholds (ΔE ≥ 30 and ΔL ≥ 15 against every band's soil and rock page mean, both worlds). For each world's `tier-mark-hc-N` it asserts the mark covers the footprint and draws nothing outside it, that at least 45 % of the disc inside the outline is light (L\* ≥ 85; a dark disc with a light glyph reads 0.1 to 0.3), and that the median of every opaque pixel there, glyph included, is ≥ 20 L\* above copper's body and ≥ 60 above the normal mark. `deposit-socket` must stay translucent (alpha ≤ 160). Mutations that each fail it: the HC marks repainted as dark discs with a light dot ("only 21 % of the disc is light"), a white annulus round every mark ("12 light pixels ring the mark"), the disc drawn at r 10 ("the mark spans 21.0 of 96"), and main's frames ("the mark has a light ring"). `check-campaign-assets.mjs` requires the five new W01 frames. `tests/art-ore.test.mjs` rebuilds every new W01 source byte for byte, checks W02's frames carry `oreBadge(tier, "W02")` and `oreMarkHighContrast(tier, "W02")`, asserts the glyph order equals `campaignOreMarker`'s, the mark size and place in both worlds, no ring, the HC value, the notch and tag removal in both worlds, **every socket variant's stacked fill opacity ≤ 160/255** (so swapping `SOCKET_VARIANT` stays safe), and the frame order.
- **Captures.** `scripts/art-captures.mjs` gains `a04p-dive-60m-phone@3`, the 60 m phone twin of a04 (393 × 851 @3, shaft-tall, `fixture("W01", 6)`). It is marked as a twin, so it stays out of `SHEET_CAPTURES` and the per-PR harness runs exactly the 8 frames it ran before; `ART_CAPTURES=a04` takes both. The nightly visual-sheets job runs `art-captures.mjs` with no filter, so its table and sheets gain the twin's column (about 10 s more). `scripts/art-sheets.py` now labels each column's form from the capture's viewport rather than the `p-` name prefix, so the twin reads "60 m (phone)".

## Tools

| File | What it gives |
|---|---|
| `assets/campaign/source/w01-ore.mjs` | `oreBody`, `oreFrame`, `packageFrame`, `depositSocket(variant)`, `seatOutline`, `SOCKET_VARIANTS`, `SOCKET_VARIANT`, `socketStackedAlpha`, `tierMarkHighContrastFrame`, `ORES`, `ORE_TONES` |
| `assets/campaign/render-sources.mjs` | `oreBadge(tier, world)`, `oreMarkGeometry(tier, world)`, `ORE_MARK_CENTRES`, `oreMarkHighContrast(tier, world)`, `ORE_MARK_GLYPHS` |
| `scripts/art-review-a12.mjs` | Driver: the socket variants with ore-o1..o4 and a relic in real band blocks at the board's scale and the @2x page scale, every W01 and W02 frame alone at 1x and 4x, `review.json` |
| `scripts/art-review-a12.py` | Sheet builder beside the board's shaft crop, with the measures; reuses `scripts/art-review.py` (`alpha_iou`, fonts) through importlib |
| `scripts/art_tiers.py` | Reusable shading-tier counter (structural from SVG fills with `data-zone`, or pixels in zone masks); item 3 reuses it for the rig |
| `docs/qa/a12-ore-sockets/capture.mjs`, `evidence.py` | The captures below (a04 both forms, a02, high contrast) and the before/after images |

Kit modules used: `palette.mjs` (`board`, `band`, `withL`, `shiftL`, `lab`, `OUTLINE`), `svg.mjs` (`polygon`, `polyline`, `layer`, `outlineStroke`, `num`), `random.mjs` (the cracked seat), `records.mjs` (`writeProvenance` for `provenance/w01-ore-sockets.json`, asset 24, and `provenance/w01-ore-frames.json`, asset 25, both written by `create-w01-sources.mjs` with a fixed date), `review.mjs` (`CONCEPT_TILE`, `panelDocument`, `rasterize`).

## Review sheet and the default socket

[`sheet.png`](sheet.png) (measures in [`sheet.json`](sheet.json)): the board's shaft-wide crop [236, 96, 460, 340) with its copper and silver ores, then ores with no socket and the three socket variants at the same 44.14 px per tile (shown 2× nearest). Rows: W01 band A soil, band B rock, band C rock (one tile of each real band page per cell), and a high-contrast row with `tier-mark-hc-N` on top and a package over the back wall. Columns: O1 to O4, a relic deposit, the socket alone. Below: the panels at the @2x page scale and every W01 and W02 frame.

Values are the socket composited over each band page's mean (A soil 51.6, B rock 34.4, C rock 34.8); tiers are `art_tiers.py`'s pixel reading in the socket's own zone (alpha ≥ 12, under the faintest layer, the lip at 6 %), with the tiers still visible round O1 / O2 / O3 / O4 in brackets.

| Socket variant | Look | Tiers, A soil / B rock / C rock | Lip, recess, shadow ΔL\* on A soil | on B rock | Darkest L\* | Cell covered | Max alpha |
|---|---|---|---|---|---|---|---|
| **shallow** (default) | seat hugging O1, faintest recess, lip and contact shadow | 3 (3/3/3/2) / 3 (2/2/2/1) / 3 (3/3/3/2) | +2.4, −2.6, −9.6 | +3.6, −1.4, −5.4 | 28.7 | 34 % | 65 |
| deep | a pocket larger than every ore, cut flat at the top, darker | 3 (3/3/3/3) / 3 (3/3/3/3) / 3 (3/3/3/3) | +2.4, −4.6, −13.6 | +3.6, −2.4, −7.4 | 26.5 | 54 % | 89 |
| cracked | the hugging seat, jagged, five short cracks into the block | 3 (2/1/1/1) / 2 (2/2/2/1) / 2 (2/2/3/1) | +2.4, −2.6, −9.6 | +3.6, merged, −2.4 | 28.7 | 37 % | 109 |

Socket masks (alpha ≥ 12, in place), pairwise alpha IoU: shallow/deep 0.618, shallow/cracked 0.894, deep/cracked 0.638. On rock the cracked seat's crack lines bridge the recess and shadow values, so the tier counter merges them (two tiers). Round O4 the lip passes behind the crown, so two of the shallow seat's three tiers show there; it stays visible beside O1 to O3.

**Default: shallow.** It is the board's treatment: on the board the ore sits straight in the rock with a 1 to 2 px light rim just above it (+2 to +4 L\*) and a 2 to 3 px contact shadow below (0 to −10 L\*), with no recess shape. Shallow's lip meets O1's top at +2.4 L\* on soil and +3.6 on rock, its shadow is −9.6 on soil and −5.4 on rock, and its recess is only −1.4 to −2.6, so the cell never reads as unknown rock (24) or air (15): its darkest pixel is 28.7 on rock. In a04 and on the phone twin the deposit reads as seated, with no bracket or tray round it (`ore-cells-3x.png`). Deep is the alternative if the director wants a visible pocket: it is darker (−13.6 on soil) and its tray shape frames the taller ores; cracked adds lines that compete with the band pages' own cracks. In high contrast the shallow seat keeps the light mark and the terrain rims readable (`high-contrast-cells-3x.png`). The director may swap: `SOCKET_VARIANT` in `w01-ore.mjs` picks the one that ships; with deep and with cracked the rebuilt assets pass `check-render-assets.mjs` (max alpha 89 and 119).

## Measures

**Shading tiers per zone** (`scripts/art_tiers.py`; pixels at 4× on the body without the mark; structural from the source fills in the `data-zone` group):

| Ore | Zone | Tiers, pixels (L\*) | Tiers, structural |
|---|---|---|---|
| ore-o1 slag iron | iron | 3 (34 / 55 / 74) | 3 |
| ore-o2 copper | copper | 5 (44 / 57 / 69 / 80 / 87 highlight) | 4 |
| ore-o3 silver | silver | 4 (46 / 77 / 91 / 98 highlight) | 3 |
| ore-o4 gold | gold | 4 (24 / 50 / 77 / 87) | 4 |
| deposit-socket (shallow) | socket | 3 on every band (lip, recess, contact shadow; table above) | 3 |

**Alpha IoU between frames** at @2x (alpha > 127, as shipped; aim ≤ 0.70, the scenery rule):

| Pair | o1/o2 | o1/o3 | o1/o4 | o2/o3 | o2/o4 | o3/o4 | max (main) |
|---|---|---|---|---|---|---|---|
| ore-oN | 0.688 | 0.658 | 0.638 | 0.640 | 0.613 | 0.667 | **0.688** (0.831) |
| package-oN | 0.741 | 0.772 | 0.734 | 0.740 | 0.692 | 0.771 | **0.772** (0.901) |

The packages stay above 0.70, down from main's 0.84 to 0.90 (max 0.901) to at most 0.772. They share the cargo strap and the mark, which make most of their area at 0.74 scale; the strap is the package's identity and the ore inside it carries the tier, so this is accepted as it stands (the ≤ 0.70 rule is written for scenery frames).

**Tier mark** (`oreMarkGeometry`, r 8 in the 96 frame; overlap = share of the disc on the frame drawn without the mark, alpha ≥ 128):

| | O1 dot | O2 II | O3 ≡ | O4 ▲ |
|---|---|---|---|---|
| W01 centre (cx, cy) | 79, 85 | 79, 74 | 78, 81.5 | 78, 83 |
| W01 overlap, ore / package | 0.315 / 0.213 | 0.303 / 0.309 | 0.305 / 0.295 | 0.292 / 0.287 |
| W02 centre (cx, cy) | 78.5, 80 | 78, 82.5 | 78.5, 79 | 78, 83 |
| W02 overlap, ore / package | 0.294 / 0.294 | 0.308 / 0.299 | 0.281 / 0.305 | 0.313 / 0.294 |
| Diameter / frame: structural, dark disc measured at 4× | 0.167, 0.164 | 0.167, 0.164 | 0.167, 0.164 | 0.167, 0.164 |
| Rim L\* p95 inside; light pixels just outside | 6.5; 0 | 6.5; 0 | 6.5; 0 | 6.5; 0 |
| HC disc L\* (light share inside the outline) vs copper body 69.1 | 95.1 (87 %), +26.0 | 95.1 (75 %), +26.0 | 95.1 (73 %), +26.0 | 95.1 (78 %), +26.0 |

The same values hold in both worlds for size, ring and HC. Main's badge: diameter (28 + 2.5)/96 = 0.318 with a white ring. The board's mark measures about 0.27 tile across; at 0.9 tile the new mark is 0.15 tile, so it follows T9's gate rather than the board (about 7 CSS px on a phone; §9.4's recognition playtest is the check). `check-render-assets.mjs` reports the identification edge at ΔE ≥ 45.2, ΔL ≥ 45.1 across all bands, both worlds, @2x and @3x, the HC marks ≥ 27.6 L\* over copper's body and ≥ 52 % light at the runtime scales.

**F3 table, a04 rows** (`scripts/art-sheets.py --table-only` on HUD-free frames, backing 2, Chrome 156; full tables in [`table-before.md`](table-before.md) and [`table-after.md`](table-after.md)):

| Row | Target | a04 @2 main | a04 @2 A12 | phone twin @3 main | phone twin @3 A12 |
|---|---|---|---|---|---|
| Unknown rock luma (sd) | 45–65, sd ≥ 7 | 61.7 (3.4) ✗ | 61.7 (3.4) ✗ | 62.9 (3.8) ✗ | 62.9 (3.8) ✗ |
| Known lit − unknown | ≥ +15 / ≥ +5 | +60.3 (4) / +61.9 ✓ | +60.3 (4) / +61.9 ✓ | +59.1 (4) / +60.7 ✓ | +59.1 (4) / +60.7 ✓ |
| Unknown − cave air | ≥ +10 | +23.1 ✓ | +23.1 ✓ | +24.4 ✓ | +24.4 ✓ |
| Lit rock − cave air | ≥ +18 | +85.0 ✓ | +85.0 ✓ | +85.1 ✓ | +85.1 ✓ |
| Rock sd within 3 tiles of a light | ≥ 15 | 9.4 ✗ | 9.4 ✗ | 9.5 ✗ | 9.5 ✗ |
| Frame L\* mean (concept) | ±4 | 26.8 (25.9) ✓ | 26.8 (25.9) ✓ | 27.6 (30.1) ✓ | 27.6 (30.1) ✓ |
| Share within ±3 L\* of the mode | ≤ 0.45 | 0.793 ✗ | 0.793 ✗ | 0.486 ✗ | 0.486 ✗ |
| p2–p98 / p98 L\* | ≥ 40 / ≥ 54 | 37.4 / 52.6 ✗ | 37.4 / 52.7 ✗ | 43.6 / 58.0 ✓ | 42.8 / 57.3 ✓ |
| Edge density | ≥ 0.06 | 0.021 ✗ | 0.020 ✗ | 0.022 ✗ | 0.021 ✗ |
| Wall profile | lip ≥ rock + 55; undercut ≤ air − 8 | 109→139→36→37 ✗ | 109→139→36→37 ✗ | 109→153→36→37 ✗ | 109→153→36→37 ✗ |
| Tile-normalised mean gradient | ≥ 2.5 | 1.05 ✗ | **1.02** ✗ | — | — |
| Playfield within 10 luma | ≤ 25 % | 87.5 % ✗ | 87.5 % ✗ | — | — |
| **Headlamp core L\* / b\* (0.35 tile)** | ≥ 70 / +15 to +30 | 84.7 / +21.0 ✓ | **88.3 / +17.6** ✓ | 85.1 / +21.1 ✓ | **89.2 / +17.6** ✓ |
| Overlay edge share | ≤ 20 % | 42 % ✗ | 42 % ✗ | 47 % ✗ | 48 % ✗ |
| Text items | ≤ 1 | 5 ✗ | 5 ✗ | 5 ✗ | 5 ✗ |

**Acceptance: met, with one deviation for the lead.** Every a04 row that passed on main still passes, on both forms; the headlamp core, which samples the T1-lite core over `ore-o1` in cell (32, 5), moves as expected and stays in target (b\* margin +2.6 above the +15 floor; it was +19.9 with the darker O1 of the first draft, which a lighter O1 trades for a lit ore that stands off the soil). The deviation: the tile-normalised gradient row, already failing, drops 1.05 → 1.02 at backing 2 (1.00 → 0.97 at backing 1), a deterministic 3 % decrease on frozen-clock captures, so it exceeds the "no worse than noise" rule. The cause is T9 itself: the white rings and cream notches it removes were the frame's hardest small edges, and the socket's edges are soft by design. Edge density falls 0.001 and the phone's overlay edge share rises one point, both on failing rows. On the phone twin the passing p2–p98 row drops 43.6 / 58.0 → 42.8 / 57.3 and stays in target. All these rows wait for T2's material.

The per-PR harness at backing 1 (all 8 §9 frames; `artifacts/improvement/harness/table.md`) moves the same way: a04 headlamp 84.5 / +20.8 → 89.6 / +17.6 and p-portrait-03 87.3 / +21.7 → 89.8 / +16.7, both in target; a04 gradient 1.00 → 0.97 (this reading repeats to ±0.01 between runs); the SITE-4 frames, which show deposits too, lose some gradient and edge density (c-site 1.40 → 1.30, 0.029 → 0.027) and gain one or two points of overlay edge share (c-site 25 → 26 %, cavern-tall 36 → 38 %); p-portrait-03's passing p2–p98 reads 40.5 / 55.3 (main 40.6 / 55.4). Every one of the moved rows except the headlamp fails on main.

**Budget.** No page grew: W01 runtime 2048 × 704 (@2x) and 2048 × 1472 (@3x), W02 runtime 1024 × 576 and 2048 × 704, full atlases unchanged in size (W01 @3x stays one 2048 × 2048 page; W02 1024 × 1088 and 2048 × 1280). The eight high-contrast marks trim to 16 × 16 px at @2x (24 × 25 at @3x), the socket to 72 × 56. `npm run test:render:memory` reads byte for byte what main read: desktop boot 47,663,924, W01 58,280,756, W02 66,407,220; phone boot 20,176,176, W01 30,793,008, W02 33,152,304. Eight full-size HC ore frames would have added about 0.5 MiB to each W01 page set and failed desktop W02 (0.67 MiB headroom). WebGL draw calls in a view with about a hundred known deposits (sockets, ores and, with high contrast on, the HC marks) read 6 in W01 and in W02, high contrast off or on (limit 12); `npm run test:render`'s own view reads 3.

## Captures

Main (`origin/main` 33b09e2) and this tree, each served from a private copy, Chrome 156, `ART_BACKING=2`, HUD-free:
- [`a04-before-after.png`](a04-before-after.png): a04 at 1440 × 900 @2.
- [`a04p-phone-before-after.png`](a04p-phone-before-after.png): the 60 m phone twin at 393 × 851 @3.
- [`a02-before-after.png`](a02-before-after.png): the spawn, for context (two slag deposits at row 0).
- [`ore-cells-3x.png`](ore-cells-3x.png): every known deposit cell in those frames, 1.4 tiles square, 3× nearest (desktop) and 2× (phone), main above A12.
- [`high-contrast-cells-3x.png`](high-contrast-cells-3x.png): the a04 cells with high contrast on (main draws the same ringed badge; A12 draws `tier-mark-hc-N`).

## Checks run

| Check | Result |
|---|---|
| `node assets/campaign/source/create-w01-sources.mjs`, `node assets/campaign/w02/create-sources.mjs`, twice | byte-identical (288 sources, both `frames.json` and the provenance records) |
| `npm run campaign:assets` and `npm run frontier:assets`, twice (Chrome 156) | all 283 files under `assets/campaign/generated/` byte-identical between the two runs; `art-unchanged-pngs.py --restore` then put back the 3 ridge PNGs whose pixels equal the committed ones (zlib bytes only); a third rebuild plus restore reproduced that tree exactly. 74 files stay changed, each holding changed ore, package, socket or mark pixels, or the JSON that lists them (`w02-assets.json`: frame count 90 → 94) |
| `npm run assets:check` (check-campaign-assets, check-frontier-assets, check-render-assets) | pass; the four mutations above each fail it |
| Socket swap: `SOCKET_VARIANT` = deep, then cracked, rebuilt in a private copy | `check-render-assets.mjs` passes (max alpha 89, 119) |
| `npm test -- --maxWorkers=2` | 300 passed, 5 skipped (main 294 + 6 in `tests/art-ore.test.mjs`) |
| `npm run format:check`, `npm run build` | pass |
| `npm run test:render` (private copy) | pass: hidden geology identical on Canvas and WebGL, both worlds; draws 3; camera round trip |
| `IMPROVEMENT_CHECKS=fog npm run test:improvements` | pass: "Both worlds hide caves identically to solid rock; high contrast changes actual canvas edges" |
| `IMPROVEMENT_CHECKS=harness npm run test:improvements` | pass: 8 §9 fixtures at backing 1 (the phone twin is not added) |
| `npm run test:render:memory` | pass, identical bytes (above) |
| Draw-call probe, W01 and W02 with known deposits, high contrast off and on | 6 draws each, no unsupported draws |

The socket is drawn only in known cells, so the hidden-geology inset crops (render-acceptance's 5 px inset and the fog check's 3 px inset; F7's full-frame scramble does not exist yet) cannot see it. `npm run test:campaign:browser` is not part of CI and was not run; its stale "300 CR" expectation fails on main too.

## Director's notes

- 2026-11-08, A4 round 2: "Minerals sit on top of the blocks, grey lumps with a white-ringed badge; on the board the ore is set into the block, with no ring." Addressed here, awaiting review: the socket seats every deposit (lip on the ore's top, contact shadow below), O1 is lifted off the soil block (body 8.5 L\* above the cell in a04; main 2.1), and the mark has no ring. O1 stays a slag grey by design: the board's dot-marked pebble is silver, and a silver O1 would collide with O3.

## Reproduce

```
PYTHON=python3 npm run assets:rebuild   # since T13b: resvg, byte-identical; A12's PNGs were first rendered by Chromium 156
node scripts/art-review-a12.mjs artifacts/art-review-a12
python3 scripts/art-review-a12.py artifacts/art-review-a12/review.json docs/qa/a12-ore-sockets
# captures, from a private copy served with npx vite --port P (main: git archive origin/main)
PREVIEW_URL=http://127.0.0.1:P/ CHROMIUM_PATH=/opt/pw-browsers/chromium-1248/chrome-linux64/chrome node docs/qa/a12-ore-sockets/capture.mjs OUT 2
python3 scripts/art-sheets.py --captures OUT --out OUT-sheets --table-only
python3 docs/qa/a12-ore-sockets/evidence.py BEFORE AFTER docs/qa/a12-ore-sockets
```
