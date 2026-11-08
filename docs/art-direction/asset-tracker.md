# The Deep Frontier: asset tracker

Started 2026-11-03 (step 2). One row per asset in `docs/ART_QUALITY_AUDIT.md` §5.6, in that table's order. The audit stays the spec for cells, page sizes and frames; this file tracks how each asset is made, who makes it and how far along it is. Every art session updates its rows at the end.

## How to read it

- **Pipeline** (D5 in `decisions.md`; pipeline C, painted raster, is gone):
  - **SVG**: hand-written layered SVG in `assets/campaign/source/` with `data-layer` groups, rasterized by the existing Chromium path (pipeline B).
  - **Generator**: a seeded script that writes SVG frames or pages, so every variant and every density rebuilds byte-identically. New scripts are pipeline P; extensions of today's generators (`phase0-sources.mjs`, `render-sources.mjs`, `source/create-w01-sources.mjs`) are named in the row.
  - **Shader**: parameters of the T2 field shader or the T1 light stack. Canvas and Medium-tier pages are baked from the same shader code.
  - **Underlay allowed**: a generated image may guide the silhouette (hero props only), with a provenance record; see D5.
- **Pri:** P0 slice, P1 W01 rollout, P2 W02, P3 menus.
- **Status:** Not started; Exists, to rework (something ships today and gets replaced); In progress; In review; Done (the director signed it off in a fixture).
- **Owner:** the session that makes the asset. "Art (A2)" is a chat in this Project for item A2, one asset item per chat, following the art session template; chats deliver files and a Claude Code session commits them. "Code (T2)" is a Claude Code session on that item.
- **Waits on:** decisions, items or assets that must land first. A1 (style guide and swatch cards) and T13a (art seen in a fixture) gate every art row and are not repeated below.

## Assets

| # | Asset | Item | Pipeline | Pri | Status | Owner | Waits on |
|---|---|---|---|---|---|---|---|
| 1 | Lander, physical damaged stage 0, at the D12 scale | A2 | SVG; underlay allowed | P0 | Exists, to rework (`dock-stage-0` is a wireframe) | Art (A2) | D12 |
| 2 | Lander stages 1 to 3 | W5 | SVG on asset 1's layers; underlay allowed | P1 | Exists, to rework (`dock-stage-1` to `3`) | Art (W5) | asset 1 |
| 3 | Lander dish, 6-frame scan | A2 | SVG; frames by transforming one dish group | P0 | Not started | Art (A2) | asset 1 |
| 4 | Lander emissive: windows, lamps, sparks | A2 | SVG `-emissive` sibling of asset 1 | P0 | Not started | Art (A2) | asset 1; T13b convention; T1 to see it glow |
| 5 | Pole lamp, ADD head | A3 | SVG with an emissive sibling | P0 | Not started | Art (A3) | T7 for placement |
| 6 | Tripod lamp, head, ground pool | A3 | SVG with an emissive sibling | P0 | Not started | Art (A3) | T7 |
| 7 | Cable strip and plug ends | A3 | SVG; the cable curve is code (Rope or bezier, T7) | P0 | Not started | Art (A3) | T7 |
| 8 | Crates ×3; power box with ADD screen | A3 | SVG | P0 | Not started | Art (A3) | |
| 9 | Cable spool, tool rack, jerry can | A3 | SVG | P0 | Not started | Art (A3) | |
| 10 | Regolith rocks ×8 | A3 | Generator (rock-chunk recipe, shared with 18 and 19) | P0 | Not started | Art (A3) | |
| 11 | Salvage heaps ×3 | A3 | SVG | P0 | Exists, to rework (`surface-salvage`) | Art (A3) | |
| 12 | W01 ridges far, mid, near | A4 | Generator (`ridges()` and `w01RidgeLayout()` in `assets/campaign/phase0-sources.mjs`, preset "pyramids"; art kit in `assets/campaign/kit/`) | P0 | Done: signed 2026-11-08 at round 2 in the a02 spawn capture (variant A of three; one dominant peak a page, foothills to 1.45 tiles). Pages `w01-ridge-far`, `-mid`, `-near`, 1024 × 384 at @2x; evidence in `docs/qa/a4-ridges-sky/` | Art (A4) | T7 for the far layer's 0.2 slot; until then the game's 0.35 slot shows the mid layer (`src/campaign/render/art.ts`) |
| 13 | Sky-body recolour, keeping the board's crescent | A4 | Generator (`skyBody()` in the same file) | P0 | Done: signed 2026-11-08 with asset 12. The board's crescent unflipped, disc `#334a57`, crescent `#d79a61` darkening to the tips; the W01 sky gradient (`scene.ts`) moves to `#112631` to `#354c59`, horizon L\* 28 at spawn | Art (A4) | T7 for the gradient's anchoring to the ground and the planet's size (disc 2.85 tiles in game, about 2.1 on the board) |
| 14 | Wreck hull, five rib arcs: back, front mound, rust | A5 | SVG; rust from a generated recipe built here and reused by A7 and A14; underlay allowed | P0 | Exists, to rework (shared wedge `site-wreck`) | Art (A5) | T6 for layering in the game |
| 15 | Beacon tripod, ADD diamond and pool; wall-mounted variant | A6 | SVG; underlay allowed | P0 | Exists, to rework (the game draws the `mission-beacon` object icon at 1.2 × 1.6 tiles, `src/campaign/render/poi-art.ts`; the `site-beacon` wedge is in the atlas but never drawn) | Art (A6) | D14 (which variant leads) |
| 16 | Stalactites ×9 | A7 | Generator | P0 | Not started | Art (A7) | T5 for placement (prototype render until then) |
| 17 | Rust drips ×4, drip particle, rust seams | A7 | Generator for drips and particle; seams as a T2 inclusion on known joints near ceilings, not decal strips (signed in A1, 2026-11-08; T2's acceptance includes the band-C ceiling seams) | P0 | Not started | Art (A7); seams in Code (T2) | T5 for drips; T2 for seams |
| 18 | Floor rubble ×6 | A7 | Generator (rock-chunk recipe) | P0 | Not started | Art (A7) | T5 |
| 19 | Foreground boulders ×3 | A7 | Generator (rock-chunk recipe) | P0 | Not started | Art (A7) | T5; T6 (layer 4) |
| 20 | Violet crystals, ADD sparkle (D8; body `#bd8df6` on the band-C card) | A7 | Generator; the hue is a parameter; in high-contrast mode a value of its own, distinct from copper ore (A1 rider, set in A7) | P0 | Not started | Art (A7) | T5 |
| 21 | Back-wall silhouette strips, band C ×2 | A8 | Generator (periodic strip that tiles by world position) | P0 | Not started | Art (A8) | T4 slots (prototype render until then) |
| 22 | Material look, bands A, B and C | A9, A10; A15 for band B | Shader (T2); Canvas and Medium pages baked from it | P0 | Exists, to rework (band pages in `assets/campaign/generated/bands`) | Code (T2 with A9, A10; band B in T14 with A15) | D6; swatch cards A, B and C (signed 2026-11-08) |
| 23 | Hard-rock plate fill and cracks, A and C | A9, A10 | Shader (T2); frames baked for Medium and Low | P0 | Not started | Code (T2 with A9, A10) | D6 |
| 24 | Ore sockets | A12 | Generator (`create-w01-sources.mjs` with new gradient helpers) | P0 | Not started | Code (A12 with T9) | |
| 25 | Ore and package frames with a small mark, plus HC | A12 | Generator (`create-w01-sources.mjs`) | P0 | Exists, to rework (ore already at concept level; mark and HC change) | Code (A12 with T9) | |
| 26 | Light brushes: cone, halo, flare, glint, mote | A11 | Generator (procedural, built in T1) | P0 | Not started | Code (T1) | T2 |
| 27 | Drill FX: chunks, dust, spark, bit glow, cracks 1 to 4 | A11 | Generator (procedural in T12; cracks extend `crack-1` to `crack-3`) | P0; cracks P1 | Exists, to rework (rectangle debris, 3 crack frames) | Code (T12; cracks in W6) | T1 |
| 28 | Edge chevron, pulse ring, Scan glyph, leader tick | T8 | SVG | P0 | Not started | Code (T8) | D3 |
| 38 | Plate and shelf page, 3 crack decals | A14 | Generator (new periodic page script; reuses the wrap masks and hash noise of the band pages in `assets/campaign/render-sources.mjs`, not their plate layout) | P0 | Exists, to rework (the plate layer is diagonal stripes drawn in code, `src/campaign/render/terrain.ts`) | Art (A14) | T14 for the 330 m check |
| 40 | Rig shading, emissive headlamp | A13 | Generator (rig frames in `create-w01-sources.mjs`, new gradient helpers) | P0 under the recommended D1 | Exists, to rework (rig at concept level, flat shading) | Code (A13) | D1 |
| 29 | Material and inclusions, band D | W1 | Shader | P1 | Exists, to rework (band D pages) | Code (W1) | D6; G1 |
| 30 | Back-wall strips, bands A, B, D ×6 | W1 | Generator (A8 recipe with band parameters) | P1 | Not started | Art (W1) | asset 21 |
| 31 | Band dressing: pebbles, fractures, cables, crystal seams, wall cracks (about 16) | W1 | Generator (A7 recipes); fractures and crystal seams may become T2 inclusions | P1 | Not started | Art (W1) | assets 16 to 20 |
| 32 | Survey mast site | W3 | SVG | P1 | Exists, to rework (shared wedge) | Art (W3) | |
| 33 | Lander valve store | W3 | SVG | P1 | Exists, to rework (shared wedge) | Art (W3) | |
| 34 | Antenna workshop | W3 | SVG | P1 | Exists, to rework (shared wedge) | Art (W3) | |
| 35 | Thermal service locker | W3 | SVG | P1 | Exists, to rework (`site-cache`) | Art (W3) | |
| 36 | Amber geode centrepiece | W3 | SVG base with clusters from the A7 crystal generator | P1 | Exists, to rework (`site-geode`) | Art (W3) | asset 20 |
| 37 | Field-log data pad | W3 | SVG | P1 | Exists, to rework (drawn today with the `ui-mission` HUD glyph at 0.45 tile; `docs/art-audit/03-assets.md` still describes an older `site-survey` copy) | Art (W3) | |
| 39 | Survey stake with lamp | W5 | SVG | P1 | Not started | Art (W5) | |
| 41 | Pad, refuge, relay shading | W5 | Generator (existing frames with new gradient helpers) | P1 | Exists, to rework | Code (W5) | |
| 42 | Smoke and exhaust puff; cabin indicator | W6 | Generator (procedural) | P1 | Not started | Code (W6) | |
| 43 | W02 physical refuge, stages 0 to 3 | X2 | SVG | P2 | Exists, to rework | Art (X2) | D13 |
| 44 to 46 | Cryo lamps, frost crates, rocks; W02 ridges, comet body; frozen wreck, condenser beacon | X2 | SVG for the props; generators for rocks, ridges and comet body (`ridges()` and `skyBody()` comet variants) | P2 | Exists, to rework (ridges, comet body) | Art (X2) | D13 |
| 47 to 48 | Ice stalactites, frost lips, bubbles; W02 materials, inclusions, back walls | X2 | Generators for dressing and back walls (A7 and A8 recipes); shader for materials and inclusions | P2 | Exists, to rework (W02 band pages) | Art (X2) for dressing and back walls; Code (X2) for the shader parameters | D13 |
| 49 | Frost mist, ice chunks | X3 | Generator (procedural) | P2 | Not started | Code (X3) | |
| 50 | Navigation-map body portraits ×4 | U2 | SVG | P3 | Exists, to rework (flat icons) | Art (U2) | |
| 51 | Launch and travel exhaust plume, ADD | U3 | Generator (6 frames from one phase parameter) | P3 | Not started | Code (U3) | |
| 52 | Dual-grid edge tiles, only if the T2 spike fails | T2-fallback | Generator (baked from the field code) | P0 if needed | Not needed unless the spike fails | Code (T2) | T2 spike result |

**By pipeline.** SVG: 1 to 9, 11, 14, 15, 28, 32 to 37, 39, 43, 50, and the props in 44 to 46. Generator: 10, 12, 13, 16 to 21, 24 to 27, 30, 31, 38, 40 to 42, 49, 51, 52, and the rocks, ridges, comet body, dressing and back walls in 44 to 48. Shader: 22, 23, 29, and the W02 materials and inclusions in 47 to 48.

**Where this differs from §5.6's Pipe column.** D5 removes every C: 16 to 21, 30, 31 and 38 become generators; 22, 23 and 29 become shader parameters; 14 stays SVG with rust from a generated recipe; 36 becomes an SVG base with generated crystal clusters; 44 to 48 split as their rows say. Four rows also move from B (B/C for 10) to a generator although D5 does not require it: 12 and 13, because today's ridges and sky body already come from `ridges()` and `skyBody()`; 10, because the eight rocks are variants of one shape; 51, because the six plume frames are one shape at six phases. They still output layered SVG, and the director can send any of them back to hand-written SVG at the start of its session.

## Director's notes from reviews

Every note from a review becomes a tracked item (audit §6.4), with the item that owns it.

| Date, review | Note | Owner | State |
|---|---|---|---|
| 2026-11-08, A4 round 2 (a02 spawn) | The lit ground under the rig is a flat, square, even row: the light map gives every visible cell the same light (`lighting.ts`), so its edge follows the grid and the headlamp's radial adds nothing inside it | T1 (pool and headlamp falloff) with T2's material (rock sd ≥ 15 within 3 tiles of a light); an interim soft pool may come first | Open |
| 2026-11-08, A4 round 2 (a02 spawn) | Minerals sit on top of the blocks, grey lumps with a white-ringed badge; on the board the ore is set into the block, with no ring | A12 (assets 24, 25) with T9 | Open |

## Art items

Effort in executor-days, the audit's artist-day unit, so the numbers drop into §5.7. Only A7, A8 and A14 are re-estimated; the rest keep the audit's figures until their own sessions re-estimate them.

| Item | Assets | Audit | Now | Owner | Note |
|---|---|---|---|---|---|
| A1 | Style guide, swatch cards, review template | 2 to 3 d | not re-estimated | Chat (step 6) | Done: signed 2026-11-08, cards A, B and C as delivered, with two riders in `decisions.md` (A7 sets the crystals' high-contrast value; T2's acceptance includes the band-C ceiling seams). Files: `scripts/swatch-cards.py`, cards A to D and `w01-swatches.json` in `docs/art-direction/swatches/`; `style-guide.md` with the review record, Project only |
| A2 | 1, 3, 4 | 3 to 3.5 d | not re-estimated | Art (A2) | underlay allowed |
| A3 | 5 to 11 | 5.5 d | not re-estimated | Art (A3) | rocks (10) by generator; builds the rock-chunk recipe |
| A4 | 12, 13 | 1.5 d | not re-estimated | Art (A4) | Done: signed 2026-11-08 at round 2 (variants A, B and C at the board's scale, A picked; two rounds in the a02 spawn capture). Built the shared generator kit (`assets/campaign/kit/`, `scripts/art-review.py`, `scripts/art-unchanged-pngs.py`) and the surface measures in `scripts/art_metrics.py` |
| A5 | 14 | 3.5 to 4.5 d | not re-estimated | Art (A5) | rust generated, not painted; underlay allowed |
| A6 | 15 | 2 d | not re-estimated | Art (A6) | underlay allowed |
| A7 | 16 to 20 | 5.5 d painted | **3.5 to 4.25 d** | Art (A7) | re-estimated below |
| A8 | 21 | 1 d painted | **0.5 to 0.75 d** | Art (A8) | re-estimated below |
| A9, A10 | 22, 23 | 6 to 8 d | not re-estimated | Code (T2) | shader parameters plus baked pages |
| A11 | 26, 27 | in T1, T12 | in T1, T12 | Code (T1, T12) | |
| A12 | 24, 25 | 1.5 d | not re-estimated | Code (A12) | |
| A13 | 40 | 2.5 to 3 d | not re-estimated | Code (A13) | |
| A14 | 38 | 2 to 3 d painted | **1 to 1.5 d** | Art (A14) | re-estimated below |
| A15 | band B part of 22 | 1 d | not re-estimated | Code (T14) with the director | |

## Re-estimate of A7, A8 and A14 (2026-11-03, under D5)

| Item | Audit, painted | Now, generator | Director reviews | Where the time goes |
|---|---|---|---|---|
| A7, cave dressing (16 to 20) | 5.5 d | 3.5 to 4.25 d | 2 to 3 | Recipes: stalactites 0.5, rust drips and drip particle 0.5, rust seam strips 0 to 0.25 (none if A1 makes seams a T2 inclusion, §5.6 row 17), rubble 0.25, boulders 0.5, crystals with the ADD sparkle 0.75. Review set-up in context 0.5. Revisions 0.5 to 1 |
| A8, band-C back-wall strips (21) | 1 d | 0.5 to 0.75 d | none of its own; reviewed with A7 | A two-layer periodic silhouette strip, cool and without outlines, 2 variants at @2x density, tiling by world position |
| A14, plate and shelf page (38) | 2 to 3 d | 1 to 1.5 d | 1 to 2 | A new periodic page script that reuses the band pages' wrap masks and hash noise from `render-sources.mjs` (today's plate layer is code-drawn stripes, so there is no plate art to extend): rivets, rust from the shared recipe, top-lit bevels, 3 crack decals for the unstable states (with `warning-shelf`); checks greyscale ΔL\* ≥ 8 against soil (T14) |
| Shared generator kit | none | 1 d, once | none | Seeded random source, palette tokens from the A1 cards, facet and bevel helpers, the outline rule, `-emissive` siblings, `frames.json` and provenance writers, and a review sheet at matched scale with the IoU duplicate check. Built in A4 (2026-11-08): `assets/campaign/kit/` with `scripts/art-review.py`; `docs/qa/a4-ridges-sky/README.md` lists what each module gives |
| **Total** | **8.5 to 9.5 d** | **5 to 6.5 d, plus the 1 d kit** | **3 to 5** | |

**Why it drops.** Code writes the variants: one recipe yields every stalactite, rubble pile and crystal cluster, and a revision is a parameter edit that regenerates all of them. Late decisions cost little for the same reason: D6 (band colour), D8 (crystal hue) and D1 (page density) change parameters, not drawings.

**The larger gain comes later.** Rows 30 and 31 (P1) and the ice dressing and back walls in 47 to 48 (P2) become parameter sets of these generators. W1's "about 10 d" of art for assets 29 to 31 should shrink a lot; re-estimate it before Phase 2.

**Risk: programmer art** (§6.3, option 1). Each family starts from two or three archetype shapes drawn by hand against the board's cavern crop, with seeded variation on top, never from raw noise. The first review is a sheet of variants beside `d0-target-cavern-wide.png` at matched scale.

**Reviewing before T5 and T4 exist.** The prototype's SITE-4 render already places stalactites, drips, pebbles, boulders and crystals on known natural boundaries (`docs/art-audit/prototype/proto.js`), so generated frames can be judged there first. Once T13a lands, a few frames placed by hand in the SITE-4 fixture give the in-game view.

**Order.** The P0 order in `art-programme-sequence.md` (a Project doc in Claude, not in the repo) is A4, A2, A3, A6, A5, A7, A8, A14 (§5.3 lists the items in another order). So A4 builds the kit; A3 builds the rock-chunk recipe for the regolith rocks, which rubble and boulders reuse; and A5 (wreck) builds the rust recipe that A7 and A14 reuse. A2 runs right after A4, so the lander's provenance record already uses the kit's writer.

## Size (§5.6 note, redone under D5)

Decoded at @3x and untrimmed, the authored big rows come to about 60 MiB: back-wall strips 27.0, iron shelf (as three full pages) 15.2, ridges 10.1, lander 7.8. The audit's 182 MiB also counted the 24 material pages of 22 and 29 (121.5 MiB). Its plan already generated those pages rather than painting them (A9 and A10) and already dropped them on the WebGL High tier; under D5 they leave the authored list as shader parameters, and Medium and Low (Canvas) load pages baked from the same shader code. So the drop from 182 to 60 MiB is bookkeeping, not memory.

Resident memory barely moves. The audit's measures stand (strips and far ridges at @2x density, the shelf as one page plus crack decals, one lander stage resident), so the new art stays at about 10.4 MiB in the surface zone and 29.7 MiB in the cave zone on Medium and Low, as in the audit. The only new saving is on High, where the shader also draws the hard-rock fill and cracks of 23 (1.16 MiB at @3x): the cave zone comes to 28.6 MiB, the §7 desktop cave-zone projection moves from 53.1 to 51.9 MiB and phone High from 35.8 to 35.3 MiB. Phone Medium stays at 40.8 MiB, over the 40 MiB budget until F8b. What D5 does change is time: no source is a raster master, so every density, including the @4x desktop pages under D1, is a re-render with no art time.

Computed by `docs/art-direction/asset-budget.py` (delivered in step 2, to commit with the board crops); it starts from `docs/art-audit/data/budget.py` and marks each change.
