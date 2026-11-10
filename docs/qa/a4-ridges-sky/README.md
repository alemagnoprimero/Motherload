# A4: W01 ridge layers and sky body

Evidence for art item A4 (`docs/ART_QUALITY_AUDIT.md` §5.3; §5.6 rows 12 and 13): three W01 ridge layers (far, mid, near) and the sky body recoloured with the board's crescent, unflipped, as extensions of `ridges()` and `skyBody()` in `assets/campaign/phase0-sources.mjs`. The director picked variant A and signed it at round 2 in the a02 spawn capture on 2026-11-08. A4 is the first art session, so it also builds the shared generator kit that later sessions import.

## What changed

- **Ridges (asset 12).** Three seeded, faceted layers, one page each, 1024 × 384 at @2x (10.7 tiles wide, as §5.6 sets): far (a pale, low-contrast range), mid (the board's pyramids, lit faces to the left) and near (dark foothills). Heights are tiles above each page's ground row: y 384 for far and mid, y 300 for near, which the game places 0.875 tile lower. Each page tiles: shapes are drawn periodically, a low col covers the 12 px either side of x = 0 with nothing above it there, and a base band fills the bottom quarter, so the asset check's seam and opaque-base rules hold. The tallest mid peak is 2.65 tiles, which is 32.7 % of the board's frame at its tile scale (board: about 31 %, 2.5 tiles).
- **Sky body (asset 13).** The same disc, crescent and band paths, recoloured to the board samples: disc `#334a57`, bands `#4d6472`, crescent `#d79a61` darkening to L\* 61.5 at the tips (the one soft gradient, for curvature). Lit from the right, as drawn (D9 withdrawn).
- **Sky gradient (`src/campaign/scene.ts`).** W01's stops move from `#14232b` and `#48616b` to `#112631` (the board's L\* 13.8 at its top rows, in `sky_top`'s hue) and `#354c59` (`sky_horizon`'s hue at L\* 31), so the sky just above the ridges reads L\* 28 at spawn. The gradient still stretches from the screen top to the surface line; anchoring it to the ground is T7's.
- **Interim slot (`src/campaign/render/art.ts`).** The game has two ridge slots: parallax 0.35 standing on the page's bottom edge and 0.6 standing 0.875 tile lower. Until T7 adds the 0.2 slot, W01's 0.35 slot loads `w01-ridge-mid.png` (one file map, marked for T7) and the 0.6 slot loads `w01-ridge-near.png`. `w01-ridge-far.png` is built and checked, not yet loaded. W02 is unchanged.
- **Checks.** `check-campaign-assets.mjs` takes the three W01 layers (W02 keeps two), compares every pair's skylines (still under 40 % agreement) and maps `w01-ridge-mid`. `tests/art-kit.test.mjs` checks the kit, that the committed sources are exactly what the generator writes, that the W02 drawings are unchanged, and that every shape clears the seam.

Palette sources: the swatch cards (`docs/art-direction/swatches/w01-swatches.json`) hold the band rock roles and the violet only; the sky, ridge and planet values come from the board samples in `docs/art-audit/data/palette.json` (`sky_top`, `sky_horizon`, `ridge_far_lit`, `ridge_near_shadow`, `planet_disc`, `planet_crescent`), which the style guide keeps for sky, props and emitters. No board pixels are copied; provenance records are in `assets/campaign/source/provenance/`.

## The art kit (`assets/campaign/kit/`)

| Module | What it gives |
|---|---|
| `random.mjs` | Seeded random streams (mulberry32 on a FNV-1a hash); `fork(name)` streams stay stable however the parent is used |
| `palette.mjs` | The swatch cards and board samples as tokens; Lab, LCh and lightness moves with `art_metrics.py`'s Lab, so a value set here reads the same in the §9 measures; facet tiers; the top-lit bevel factors |
| `svg.mjs` | One number format (sources rebuild byte-identically), layered groups, gradients, the outline rule (4.4 % of a cell, `#14232b`), periodic drawing for tiling pages, bevel strips |
| `emissive.mjs` | `-emissive` siblings: one description gives the base frame (lit parts drawn unlit) and the ADD frame |
| `records.mjs` | `frames.json` upserts for assets authored outside `create-w01-sources.mjs`; provenance records checked against D5 (redrawn share, underlays with tool, prompt, date and SHA-256, no board pixels) |
| `review.mjs` | Panels at the board's tile scale composed as the game layers them, rasterized with the asset pipeline's Chromium |

Scripts: `scripts/art-review.py` (the review sheet beside the board's crop, the surface measures, the IoU duplicate check, and game frames measured against the sky they were drawn with), `scripts/art-review-a4.mjs` (this session's driver), `scripts/art-unchanged-pngs.py` (after a rebuild, puts back the PNGs whose pixels did not change: PNG bytes depend on the zlib build). `scripts/art_metrics.py` gains the surface measures: `skyline_tops`, `ridge_mask_from_sky`, `gradient_sky`, `horizon_lstar`, `ridge_heights`.

## Review

1. **Variants at the board's tile scale** ([`variants.png`](variants.png), close-up [`variants-bands-2x.png`](variants-bands-2x.png)). Same sky, planet and palette; three silhouettes: A pyramids, B a serrated range, C spires and buttes. Picked: **A**.
2. **Round 1** in the a02 spawn capture: A as shown.
3. **Round 2** (signed): one dominant peak a page with the others 1.45 to 2.3 tiles and uneven spacing; foothills up to 1.45 tiles. [`rounds-board-scale.png`](rounds-board-scale.png) shows the board, main, round 1 and round 2 at the board's tile scale; [`a02-before-after.png`](a02-before-after.png) and [`p-portrait-02-spawn-before-after.png`](p-portrait-02-spawn-before-after.png) show the whole frames.

At the board's scale (variant A after round 2; every value in [`measures.json`](measures.json)):

| Measure | A, round 2 | Board | Target |
|---|---|---|---|
| Ridge peak, share of frame | 32.7 % (2.65 tiles) | about 31 % (2.5 tiles) | near 31 % |
| Horizon L\* | 28.8 | 27.5 (sample), 28.3 (audit) | T7: 26 to 31 |
| Layer L\*, far / mid / near | 31.2 / 35.4 / 20.6 | haze about 30, lit faces 41.5, foothills 19 to 24 | 3 values at least 4 apart (02-lighting.md §6.6) |
| Crescent L\* / chroma | 65.3 / 41.8 | 65 / 42 | chroma ≥ 35 |
| Skyline agreement, most similar pair | 25 % | | < 40 % (asset check) |
| Silhouette IoU above the shared base, most similar pair | 0.59 | | ≤ 0.70 (style guide §3) |

In the game, captured with `art-captures.mjs` at backing 2 (main at 0fac0df with step 7 applied), HUD-free; frame statistics in the §4.3 scoring window:

| a02 spawn, 1440 × 900 @2 | Main | Round 1 | Round 2 | Target |
|---|---|---|---|---|
| Horizon L\* | 36.3 | 28.0 | **28.4** | 26 to 31 (T7) |
| Ridge peak, tiles above ground | 1.71 | 2.66 | **2.66** | board 2.5 |
| Ridge peak, share of the 900 px frame | 10.9 % | 17.0 % | **17.0 %** | ≥ 22 % (T7), see below |
| Crescent L\* / chroma | 54.4 / 23.3 | 65.3 / 41.8 | **65.3 / 41.8** | chroma ≥ 35 |
| Window L\* mean | 27.6 | 25.5 | **25.2** | board 26.3 |
| Window cyan share | 3.66 % | 0.02 % | **0.02 %** | emitters only |
| Window warm share | 0.26 % | 0.28 % | 0.28 % | 1.5 to 4 % (A2, A3, T7) |

The phone spawn (393 × 851 @3) moves the same way: horizon L\* 37.1 to 29.2, peak 1.70 to 2.65 tiles, crescent chroma 23 to 41.

**The 22 % line is the camera's, not the art's.** The ridges are set in tiles to match the board at its scale. At today's surface camera (25 tiles across, zoom 0.88) 2.66 tiles is 17 % of 900 px; at D1's play camera (about 18.5 tiles across at the surface) it is about 23 %. The line falls due with T11. **Repetition:** at today's camera the 10.7-tile page repeats 2.3 times a screen (about 1.7 at D1's); a wider page would hide it but §5.6 fixes the page, so it stays. The old sky's lower half read as cyan; the new sky does not.

## Checks run

`npm test` (294 passed, 5 skipped), `npm run format:check`, `npm run build` (with `campaign:check`), `IMPROVEMENT_CHECKS=visual,fog,sky,harness npm run test:improvements` (pass, the sky body check included), `test:hud:surface`, `test:surface:render`, `test:render`: pass. Regenerating `create-w01-sources.mjs` twice changes no byte; W02's sources regenerate byte-identically. A rebuild with `npm run campaign:assets` changes the pixels of the ridge pages, the atlas pages (the sky body frame) and nothing else.

## Director's notes from this review (tracked items)

- **The lit ground under the rig is a flat, square row.** The light map darkens each cell by what the rig can see (`lighting.ts`), so every visible cell gets the same light with a grid edge; the headlamp's radial adds nothing inside it. Owner: T1 (pool and headlamp falloff) with T2's material (rock sd ≥ 15 within 3 tiles of a light). An interim soft pool can come first.
- **Minerals sit on top of the blocks.** The grey lumps carry a white-ringed badge; on the board the ore is set into the block with no ring. Owner: A12 (ore sockets and ore frames, assets 24 and 25) with T9 (smaller mark, no ring, socket decal, high-contrast variant).

## Reproduce

```
PYTHON=python3 npm run assets:rebuild   # since T13b (resvg, byte-identical); A4 used Chromium, then art-unchanged-pngs.py --restore
node scripts/art-review-a4.mjs artifacts/art-review-a4
python3 scripts/art-review.py artifacts/art-review-a4/review.json artifacts/art-review-a4/sheet.png
ART_CAPTURES=a02,p-portrait-02 ART_BACKING=2 node scripts/art-captures.mjs
```
