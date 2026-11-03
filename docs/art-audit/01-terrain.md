# 01 · Terrain, strata, tunnels and caves

Scope: how the ground is drawn: rock, unexplored rock, dug tunnels, natural caves, back walls and the cave shapes the generator produces. Repository: `/home/user/Motherload` at `644e222` (read-only). Captures: `v2/shots/` and `v2/shots2/` in the session scratchpad. Every figure and script cited below is in `art-audit/work/terrain/`, which sits beside this report. Luma means Rec. 709 on 0–255 sRGB. "Tile-normalised" means a capture resampled to a 42 px tile, the concept's scale judged by its 47 px rig (the game rig is 1.28 tiles: 168 px on a 130.9 px tile at 1440×900 @2x).

---

## 1. Verdict

The ground is the part of the game that is furthest from the concept board. It covers 54–84 % of the playfield in every dive capture. The concept shows dark, layered slate. Dug shafts have crisp lit lips, caves have organic arched silhouettes, and the unexplored rock is darker than the rock the lamp has revealed. The game draws a pale, nearly flat blue-grey sheet with dark squares cut out of it. Four measured facts carry most of the gap:

1. **The value hierarchy is inverted.** Unexplored rock is luma 84–89 at every depth from 60 m to 550 m (standard deviation 1.5–1.7). The concept's unexplored rock is 57 (sd 10.6). Below band A, known rock renders *darker* than unknown rock: at 550 m known band-D rock is 55 while unknown is 84. The concept puts revealed rock about 35 levels *above* unexplored rock. The cause is a deliberate code choice (`lighting.ts:72-77`, `terrain.ts:177-181`, `terrain.ts:209-210`). The fix is a small (S) task.
2. **Every boundary is a tile edge.** Tunnels and caves are drawn by clipping each cell to its square (`terrain.ts:162-164`). There is no autotiling, no marching squares, no SDF and no edge sprites. 93 % of the cave boundary in the generated tile map is axis-aligned. Measured on captures it is 65–82 %, against 18 % (desktop) and 23 % (portrait) in the concept's cavern. The generator rasterises flat ellipses onto the grid: 71 % of cave components are three rows tall or less.
3. **The rock material is a coloured brick grid.** All 24 band pages share one plate layout (edge-map overlap 0.95–0.98 between bands and worlds). The plates are 2×1-tile bricks whose joints hug the tile rows. The strata lines and grain in the page sources are painted *underneath* opaque plates, so they never show. At concept scale, unknown rock has 1.3 luma of local texture against the concept's 12.7.
4. **Rims are 2 px pastel strokes.** The rim on a dug face is a straight line 27 levels brighter than the rock, about 0.03 tile wide (`terrain.ts:248-277`). It has no undercut, no top/side lighting difference and no corner treatment. The concept's lip is about 80 levels brighter than the rock, about 0.1 tile wide, and backed by a dark undercut line. Air cells receive no ambient occlusion at all.

A render-only prototype on real W01 tiles (§2.5) closes most of the gap without touching collision: visual air differs from tile air in 3.4 % of pixels, yet the axis-aligned boundary share drops from 93 % to 24 %. The single biggest reason the game does not look like the board is the flat, light, textureless unknown-rock sheet, the largest area on screen, which inverts the concept's darkness hierarchy. Tile-square boundaries are second.

---

## 2. Side-by-side evidence

The main sheet is `work/terrain/cmp-concept-vs-game.jpg`. Each row places a concept panel (from `docs/art-direction/d0-target-board.png`, at 2×) beside a game capture cropped to the same tile scale and the same field of view in tiles.

### 2.1 60 m SHAFT: concept vs `a04-dive-60m@2.png` (and `a07-side-tunnel-150m@2.png`, `p-portrait-04-dive-160m@3.png`)

| Aspect | Concept | Game | Evidence |
|---|---|---|---|
| Unexplored rock | Dark slate, luma 57.5 (p10 46 / p90 71, sd 10.6). Strata about 1.8 tiles apart; row means vary 42→73 | Flat blue-grey, luma 88.5 (p10 86 / p90 91, sd 1.7). Row means vary only 86.7→89.5 | `cmp-values.png`, `values.json`, `regions-montage.jpg` |
| Known rock beside the shaft | A lit band about one tile wide at luma 92 (+34 over unknown) | Luma 110 at 60 m (+22). At 150 m the blue column is 82, *below* unknown (88) | `regions-a04-…jpg`, `regions-a07-…jpg` |
| Shaft wall rim | Lip peak 165–177 against rock about 90. A dark undercut of 35 next to air at 50. The rim line wobbles | Peak 138 against rock 111 (+27), about 4 px at @2x (0.03 tile). No undercut. Ruler-straight | Wall luma profiles (§3.4) |
| Shaft interior | Dark navy about 50 outside the headlamp cone, with a warm cone | Flat 51.8 (sd 2.8) at 60 m and 38.8 (sd 1.5) at 150 m. No gradient or texture | `values.json` |
| Width and composition | Shaft about 2.3 rig widths wide (rims at x 518 and 627 on the board, rig 47 px). The rig sits inside the shaft | Shaft is exactly 1 tile and the rig is 1.28 tiles, so the rig covers both rims wherever it sits | `a04`, `a07`, `p-portrait-04` |
| Share of playfield | Unexplored rock fills about 70 % but is dark and textured | 84 % (a04), 79 % (a07) and 59 % (portrait) of the playfield lie within 10 levels of one flat colour | §3.1 measurement |

The game reads as a pale wall with a dark slot cut into it; the concept reads as a deep, layered rock mass with a lit corridor. Phones (`p-portrait-03/04`) and W02 (`e08`, `e09-w02-600m-band-C`, unknown an even lighter teal, RGB ≈ 82,112,123) repeat this.

### 2.2 300 m CAVERN: concept vs `c-site-W01-SITE-4-wreck@2.png` (465 m), `b-550m-band-D@2.png`, `c-site-W01-SITE-5-geode@2.png`, `b-full-reveal-row50@2.png`

| Aspect | Concept | Game |
|---|---|---|
| Silhouette | One arched vault. Overhanging ceiling plates, hanging stalactites, a ragged floor of broken slabs. 18 % of the boundary is axis-aligned (portrait panel 23 %) | Stepped "pixel ellipse". 65 % (site 4), 70 % (550 m), 74 % (geode site) and 82 % (debug reveal at row 50) axis-aligned. Corners are exact right angles |
| Rock around the cave | Large flat-shaded plates with lit top facets and dark cracks. Ceiling rock 51 (sd 26.5): high internal contrast | Cells alternate soil and rock colours tile by tile (brown, purple and slate squares). Known band-C soil is 82–96 (sd 10–16); the plate texture is barely visible |
| Back wall | Cool teal-navy (RGB 25,38,47), luma 36, sd 6.5. Distant rock silhouettes and stalactites in a second layer | Flat warm brown-black at 465 m (RGB 33,30,31, luma 31, sd 3.6). Flat navy at 550 m (luma 24, sd 1.5). The wall page is drawn at 0.55 alpha and half resolution |
| Rim and lighting | Floor and ledge lips catch warm light, the ceiling underside goes to shadow, and rust drips mark band C | The same 2 px stroke on every face. Lighting is a blurred per-tile darkness plus a lamp disc and cone |
| Dressing | Stalactites, rubble, amber crystals, rust drips | None in the terrain code (no stalactite, drip, rubble, decal or AO anywhere in `src/campaign/render/*` or `scene.ts`) |
| Fog edge | Not shown (the board shows a composition target) | A hard staircase of light squares around a dark hole. The fog blur is about 0.35 tile (`lighting.ts:86`), but unknown is drawn lighter than known, so the eye reads light frames around dark cut-outs |

`cmp-boundary-orientation.png` marks every air/rock boundary pixel: red within ±5° of horizontal or vertical, green otherwise. The game's caves are outlined almost entirely in red; its green comes from the lamp disc and sprites, which the threshold mistakes for cave edges, so the game's figures are conservative. The concept's outline is almost entirely green.

### 2.3 SURFACE ground: concept vs `a02-spawn-1440x900@2.png` (`cmp-surface-ground.jpg`)

The concept's surface ground is dark strata (luma 60, sd 20) with bright bevelled hole lips. In the game the ground is the brightest large area in the frame: unknown ground 88 and the known strip beside the rig 120, against sky 67 above the ridges. The lander, lamps and rig lose the figure/ground contrast the concept relies on, and the ground shows the same 2×1 bricks and plain straight edges.

### 2.4 Material pages (`band-pages-w01.png`, `band-page-grid-overlay.png`)

The twelve W01 pages (soil/rock/wall × bands A–D) are visibly the same drawing in four colours. With the tile grid overlaid, the plates are 2×1-tile bricks. Their horizontal joints lie within ±0.19 tile of tile rows, and their vertical joints barely stagger. Once tiled every 8 tiles, the page repeats 2.75 times across a 22-column screen. The concept's strata are wavy courses about 1.8 tiles apart, cut into plates 1.5–4 tiles long with staggered joints and bevelled faces.

### 2.5 What closes the gap: render-only prototype (`proto-before-after.png`, `proto.py`)

Both panels use the same W01 tiles: rows 37–49 and columns 4–27 of the fresh seed in `fresh-w01.json`, which contain the deep gallery. The left panel is a schematic of today's renderer in the measured capture colours. The right panel is a short numpy prototype (`proto.py`) that applies:

- a Gaussian-smoothed known-air field at 0.32 tile, plus two octaves of noise, thresholded and clamped to within about 0.3 tile of the collision boundary;
- Voronoi plates squashed horizontally into strata, with lit upper facets and dark cracks;
- a lip highlight on upward-facing faces and a thin rim elsewhere;
- ambient occlusion in the air;
- a cool, textured back wall;
- dark textured unknown rock with a softened per-tile known mask.

| Measure | Today (tile geometry) | Prototype | Concept |
|---|---|---|---|
| Axis-aligned boundary share | 93 % | 24 % | 18–23 % |
| Pixels where visual air ≠ tile air | 0 % | 3.4 % | — |
| Unknown / known solid / air luma | 89 / 55–110 / 24–52 | 42 / 67 / 36 | 57 / 92 / 36 |

The prototype is not final art. It shows that collision, saves and the economy can stay unchanged while silhouette and values move most of the way to the board. It also exposes two generator artefacts smoothing cannot hide: seven 1-tile rock islands float inside caves, and eight 1-cell air pockets become round pockmarks (§3.6).

---

## 3. Root causes in code and assets

### 3.1 Unknown rock is light, flat and constant, by design

- `src/campaign/render/terrain.ts:177-181`: unknown cells fill with a constant `#596771` in W01 and `#5d7782` in W02. Both are the same at every depth.
- `terrain.ts:193` and `:209-210`: the unknown overlay uses the current band's **soil** page at `globalAlpha = 0.23`. This leaves a standard deviation of 1.5–1.7 luma on screen. Known rock and soil draw at alpha 1, walls at 0.55.
- `src/campaign/render/lighting.ts:72-77`: darkness is **0.16 for unknown cells**. Visible known cells get `(1 − ambient) × 0.72`, which is 0.11, 0.24, 0.39 and 0.52 for bands A–D. Remembered cells get up to 0.52. The comment on line 72 states the intent: "Unknown rock stays legible at depth; darkness describes known space". This is the inversion. Below band A, revealed rock is darkened more than unrevealed rock.
- History: the old audit specified unknown rock at L\* 12–20 (`analysis/04-graphics.md:799`) and plan D9 a texture "at ≤30 % brightness" (`IMPROVEMENT_PLAN.md:283`). `IMPROVEMENT_PROGRESS.md:92` records the reinterpretation as opacity "over a neutral rock substrate". The result is L\* 36–38: brighter than the concept's far rock (L\* 24), close to its *lit* rock (L\* 39), and lighter than the baseline (`baseline-contact-sheet.webp`, d05). This axis has moved away from the board.
- Measured effect: within 10 levels of the flat unknown colour lie 84 % of the playfield in a04, 82 % in a05, 79 % in a07, 75 % in a08, 69 % in b-550, 76 % in W02 at 180 m (e08) and 59 % in portrait at 160 m.

### 3.2 Per-cell square rendering, with no edge model

- `terrain.ts:162-164` clips every draw to `rect(x*tile, y*tile, tile, tile)`. Base fill, pattern, stripes and rim are therefore all confined to squares.
- `terrain.ts:141-147`: the only neighbourhood information is a 4-bit mask of exposed N/E/S/W faces, used solely for the rim stroke. There are no diagonal bits, so concave and convex corners cannot be shaped.
- `terrain.ts:149`: the retained-cell signature is `type:mask`, or `unknown`. Any edge shaping needs this signature to grow (to 8 neighbours or 4 corners). The rest of the retained design (buffer shifting at `:80-113`, dirty-cell redraw) can stay.
- Plan D6 asked for "16 corner overlays" per material (`IMPROVEMENT_PLAN.md:319-321`). `IMPROVEMENT_COVERAGE.md:60` reports "all rim masks". What shipped are the 4-bit straight strokes at `terrain.ts:248-277`.

### 3.3 Material pages: one geometry, hidden strata, a seam strip and a halved wall

`assets/campaign/render-sources.mjs:30-69` generates all 24 SVG pages (`assets/campaign/bands/*.svg`), which are rasterised to `assets/campaign/generated/bands/*-2x.png` by `scripts/build-band-assets.mjs`.

- `:48-49`: the `noise(x,y)` used for plate vertices takes no band, world or material input, so every page has the identical plate layout. Measured edge-map overlap of w01-a-rock against w01-d-rock is 0.98, against w02-c-soil 0.95 and against w01-b-soil 0.97.
- `:49`: the vertices form a 4×8 grid of 192×96 page pixels, which is 2×1 tiles, since the page covers 8 tiles at 96 px per tile. Jitter is ±30 px in x and ±18 px in y, so joints stay within about 0.19 tile of the tile rows.
- `:36-45`: the twelve wavy strata lines and the 96 grain marks are drawn *before* the plates. `:51-61` then cover the whole page with opaque plates, so the strata exist only in the source files.
- `:62-63`: plates fade out over 2.5 % at each page edge (a "wrap" mask). This leaves a strip 0.2 tile wide every 8 tiles in both axes, where hidden strata and base colour show through. The strip has lower texture (sd 5.7 against 9.1) and is +2.3 brighter.
- `src/campaign/render/terrain.ts:202`: each pattern spans 8 tiles and is world-aligned, so page boundaries fall on the tile grid.
- `src/campaign/render/art.ts:88-101`: wall pages are redrawn into a 384×384 canvas, half resolution, "intentionally… lower-frequency". `terrain.ts:210` then draws them at 0.55 alpha. Back walls are therefore soft, flat and darkened further by lighting, measuring sd 1.1–3.9 in captures.

### 3.4 Rims and air treatment

- `terrain.ts:248-277`: a 2 px line (2.5 in high contrast) inset 1 px on exposed faces of **solid** cells only. Its colour is `band.rock[2]` or `soil[2]`, which is base +32 per channel (`bands.ts:23-27`). All four faces are identical: no top light, no underside shadow.
- On screen (a04, left wall), luma runs 111 → 138 → 50 over about 4 px at @2x. The concept's left wall runs 90 → 177 → 35 → 50, and its right wall 55 → 172 → 73 → 90. The concept's rim is about 3× the game's contrast and about 3× its relative width, and it adds the undercut.
- Air cells (`type 0`) get `mask = 0` (`terrain.ts:141-147`): no ambient occlusion, no inner shadow, nothing that couples the cave interior to its walls.
- `terrain.ts:41` caps the terrain raster at DPR 1.5, so on @2x screens the terrain is upscaled 1.33×. This is a minor softness cost; memory is the reason (`IMPROVEMENT_PROGRESS.md:52`).

### 3.5 Per-tile material mosaic

- `src/campaign/world.ts:101-107`: each cell independently becomes hard rock with probability `rockChance` (0.04, 0.15, 0.27 or 0.38 by band). Hard rock and soil then use different base colours and pages (`terrain.ts:170-190`).
- In the fresh W01 map, the share of solid-to-solid edges where the material changes is 6 %, 25 %, 30 % and 46 % for bands A–D. In band B, 48 of 101 hard-rock cells are isolated single tiles.
- The deep bands therefore read as a checkerboard of purple and slate squares (`b-full-reveal-row50@2.png`) rather than continuous strata. This mosaic adds tile edges inside solid rock, on top of the cave edges.
- The fused drill plate (`terrain.ts:236-247`) is drawn as diagonal hatching in `#b79672`. It reads as a UI hazard stripe (`b-330m-plate-band-C@2.png`) rather than the concept's "heavy iron shelf".

### 3.6 Generator cave shapes

- `world.ts:154-159` `ellipse()`: an air cell is carved when the tile centre lies inside the ellipse. There is no radius noise and no smoothing pass.
- `world.ts:162-200` `shapeBands()`: pockets and ledges use `rx 1.8–3.8` and `ry 1.0–2.1` rows. Galleries use `rx 4–6`; geodes use `ry 2.8`. A route branch every 50 m is a 3×2 notch, and there is one deep gallery `ellipse(route−7, 43, 6.2, 3.4)`.
- Sites are carved by `world.ts:261` with radii 2.1/3.1 × 1.5, plus a straight 1-row corridor to the route (`:262-267`).
- Measured on `fresh-w01.json` (`w01-tilemap.png`):
  - 491 air cells in 31 components; median component height is 2 rows, and 22 of 31 components are 3 rows tall or less;
  - the mean straight run along a boundary is 1.69 tiles;
  - there are 799 right-angle corner vertices in a 40×60 map;
  - 7 solid islands of 1 tile sit inside caves, and 8 air components are a single cell.
- Only the deep gallery (rows 37–45, 9 rows by 11–13 cells) is as large as the concept's cavern (about 9×5.5 tiles visible). Every other natural space is ≤5 rows tall, and flat, low caves cannot become vaulted however well their edges are drawn.

---

## 4. Gaps ranked by visual impact

1. **Inverted, flat unexplored rock (very high).** It occupies 54–84 % of the playfield in every dive at every depth, in both worlds and on phones. Luma is 84–89 against the concept's 57, and texture sd is 1.5–1.7 against 10.6. Known rock goes darker than unknown below band A (−29 luma at 550 m).
2. **Tile-square silhouettes for caves and the fog edge (very high in caves, high in shafts).** The boundary is 65–82 % axis-aligned in captures and 93 % in geometry, against 18–23 % in the concept. Every cave reads as a pixel blob.
3. **Rock material without strata or depth (high).** All bands share one 2×1 brick layout and the grain is hidden. Local texture is 1.3 (unknown) to 9 (known, debug reveal) against the concept's 12.7. Mean gradient at tile scale is 0.84–1.53 in dive captures, and 2.2–2.3 even when fully revealed, against 3.5–3.75 in the concept.
4. **Missing lip and undercut on dug faces, and no ambient occlusion (high).** The rim is +27 luma and 0.03 tile wide, against about +80 and 0.1 tile. Interiors are flat, so tunnels look like holes rather than excavations.
5. **Per-tile soil/hard-rock checkerboard (medium-high, grows with depth).** 46 % of solid edges change material in band D.
6. **Back wall and cave dressing absent (medium-high in caves).** The back wall is flat (sd 1.1–3.9 against 6.5), warm brown in band C where the concept is cool teal, and drawn at half resolution. There are no stalactites, drips, rubble or crystals.
7. **Generator geometry (medium; caps how far rendering alone can go).** Caves are 1–3 rows tall, with 1-tile islands and pockets.
8. **Shaft composition (medium).** A 1-tile shaft holds a 1.28-tile rig, so both rims are hidden exactly where the player looks. The concept's shaft is about 2.3 rig widths wide. This is shared with the rig and camera dimension.
9. **Bright surface ground (medium, first impression).** Ground luma is 88–120 against 60 in the concept, which flattens the spawn composition.
10. **Small rendering issues (low).** A 0.2-tile seam strip every 8 tiles, the DPR 1.5 terrain raster on @2x, and the hatched fused plate.

---

## 5. Recommendations

Ordered by impact per effort. Effort: S ≤ 1 day, M 2–4 days, L 1–2 weeks, XL > 2 weeks.

### R1 · Restore the value hierarchy: dark textured unknown, lit known (S, impact very high, risk low)

- **What.** Unknown rock dark and band-tinted, with readable strata. Revealed rock always brighter than unknown, with the brightest rock nearest the lamp.
- **How.**
  - `terrain.ts:177-181`: replace the constant with a per-band unknown colour, darkened from `band.rock[1]` to luma 50–60 in W01 (W02 about 65–75 to keep the ice identity).
  - `terrain.ts:209-210`: raise the unknown pattern alpha from 0.23 to about 0.6–0.7, using the band's *rock* page so the texture reads. The band is a function of depth, so the pixels still depend only on public position data.
  - `lighting.ts:73-77`: invert the order to unknown ≥ remembered ≥ visible. For example, unknown `0.30 + (1 − ambient) × 0.35`, remembered `min(0.45, …)`, visible `(1 − ambient) × 0.45`. The lamp disc and cone (`:99-133`) then lift the revealed ring well above unknown, as in the concept's lit column.
  - Optionally, add a small luma lift for known solid cells that touch known air.
- **Assets.** None.
- **Risk.** The hidden-cave/hidden-rock identity check still passes, because the inputs stay independent of hidden geometry. The progress doc's dark-pixel gates (≤45–60 % below luma 40) need re-basing on the concept: its shaft panel has 18 % of pixels below luma 45 and its cavern 56 %, against 2–14 % below 40 in today's dives.

### R2 · Bevelled lips, undercuts and ambient occlusion on every exposed face (M, impact high, risk low)

- **What.** The concept's lip: a highlight 0.08–0.12 tile wide on the solid side, at rock +60–80 luma for upward and side faces, softer on ceilings. A dark undercut of 2–3 px at air −10 to −15 on the air side. A 0.25–0.35 tile occlusion gradient into air cells. A small deterministic jag every 0.3–0.6 tile from `hash(x, y, face)`.
- **How.**
  - Extend the mask at `terrain.ts:141-147` to 8 neighbours, so convex and concave corners get rounded or chamfered lips instead of overlapping strokes.
  - Draw the lip with a short gradient stroke clipped to the solid cell. Draw the undercut and occlusion in the *air* cell, which today has `mask = 0`, from that cell's own solid-neighbour mask.
  - Compute top-lit or bottom-shadow per face from the face normal.
- **Assets.** None, or optionally 16 corner-case alpha masks if Canvas path work proves slow.
- **Risk.** The cell signature grows from 16 to 256 cases (only dirty cells redraw, `terrain.ts:150`). The rig at 1.28 tiles covers 1-tile shaft lips, so draw the lip inside the solid cell, where it stays visible beside the rig.

### R3 · Organic silhouettes rendered from the tile grid (L, impact very high in caves, risk medium)

- **What.** Natural caves and the fog edge lose their staircase. Player-dug shafts stay straight but chiselled. Collision is unchanged.
- **How.** Run marching squares on the known-air *corner* field: each corner value is the mean of its four cells, and unknown cells count as solid, so nothing leaks. Place each vertex by interpolation, plus a deterministic jitter from `hash(world.seed, corner)`. Use an amplitude of about 0.25 tile for natural cave air and about 0.05 for dug cells, and clamp to ±0.3 tile of the true boundary. Each cell's contour depends only on its 3×3 neighbourhood, so it fits the retained per-cell renderer: `ctx.fill(path)` for the air bite, then R2's lip and undercut stroked along the same path. This stays Canvas-native, which fits the project rule that Canvas compositing is the reference for both renderers (`lighting.ts:6`).
  - Natural versus dug: regenerate the pristine tiles once at load from `seed + generatorVersion`; pristine air is natural cave, other air is dug. No save change.
- **Assets.** None required, or 16 cases × 3 variants of edge alpha masks if an artist wants hand-drawn contours.
- **Risk.**
  - Visual and collision mismatch must stay ≤ 0.3 tile; the prototype disagrees on 3.4 % of pixels.
  - Dirty cells per mined cell rise from up to 5 to up to 9.
  - The signature change must invalidate the retained buffer correctly (`terrain.ts:61-79`).
  - Test that a known cell beside hidden air draws identically to one beside hidden rock.

### R4 · New band material pages: strata courses, per-band geometry, visible grain (L, impact high, risk low-medium)

- **What.**
  - Pages read as layered slate. Courses are 0.6–1.4 tiles tall with a mean period of about 1.8 tiles, plates are 1.5–4 tiles long with staggered joints, and each plate has a flat-shaded bevel (lit upper facet, darker lower lip) and dark crack lines.
  - Each band gets its own geometry seed and identity: regolith pebbles in A, long fractures in B, rust seams and iron lamination in C, crystal seams in D, and the equivalents in W02.
  - Grain and strata are drawn *on top of* the plates.
- **How.**
  - In `render-sources.mjs:48-61`, seed `noise` with world, band and material.
  - Generate vertices toroidally, wrapping modulo the page, and delete the wrap-fade mask at `:62-63`.
  - Move the strata and grain loops (`:36-45`) after the plates.
  - Lengthen the period to 16 tiles, or ship 2–3 page variants per material chosen by `hash(macroX, macroY)` in `terrain.ts:193-207`.
  - Keep wall pages at native resolution by deleting the halving in `art.ts:88-101`.
  - For board-level illustration, commission painted pages to the same contract (768 px per 8 tiles at @2x, seamless, band palettes from `world-content.ts:19-130`).
- **Assets** (per world, ×2 worlds).
  - 4 bands × {strata rock, soil or regolith, back wall} = 12 pages at @2x (and @3x per the existing pipeline).
  - Plus 4 hard-rock inclusion sheets (see R5).
- **Risk.** Memory: the 16-tile period quadruples page bytes. Band streaming (`art.ts:57-86`) and the 40 MiB phone budget must be re-measured. W02 has only 0.48 MiB of desktop headroom (`IMPROVEMENT_PROGRESS.md:52`), so prefer page variants over a bigger period there.

### R5 · Hard rock as inclusions; the fused plate as an iron shelf (M, impact medium-high, risk medium for readability)

- **What.**
  - Draw hard-rock cells over the continuous strata as irregular boulder or inclusion sprites about 0.9 tile wide, with a darker, cooler facet pattern, instead of full-tile colour swaps. Merge 4-connected rock clusters into one larger boulder silhouette with R3's corner logic.
  - Replace the diagonal hatch (`terrain.ts:236-247`) with a riveted iron-shelf strip: plate edges, rust streaks and bolt heads.
- **How.** Keep the soil page as the cell base. Draw `rock-inclusion-{band}-{0..5}` chosen by hash and clipped to the cell plus 0.1 tile. Hard rock must stay identifiable in greyscale (plan D6: ΔL\* ≥ 8).
- **Assets.** 6 inclusion variants × 4 bands × 2 worlds = 48 frames. Fused plate: 3 shelf frames plus 2 rust decals.
- **Risk.** Players must still predict drill time; validate with the D5/D6 material checks and a five-player recognition test.

### R6 · Cave back wall and dressing (M, impact medium-high in caves, risk low)

- **What.** A cool back wall at luma 30–40 with distant rock silhouettes (sd 5–8), plus band dressing on *known* exposed faces only:
  - stalactites under ceilings (a solid cell whose south neighbour is known air);
  - rubble and slabs on floors;
  - rust drips in band C, amber crystals in band D;
  - icicles, frost lips and bubble clusters in W02.
- **How.** A wall page redesign as in R4. A dressing pass in the retained renderer keyed by `hash(seed, x, y)`, with about 30 % density on qualifying faces, drawn after the lip so it overhangs.
- **Assets** per world: stalactites ×6, floor rubble ×6, drips ×4, crystal or ice clusters ×4, and 2 back-wall silhouette layers per band.
- **Risk.** Dressing must never be placed from unknown cells.

### R7 · Generator: vaulted, organic caves with a minimum feature size (M, impact medium, risk medium)

- **What.**
  - Ellipse radii perturbed in polar angle by noise (±25 %).
  - One or two cellular-automaton smoothing passes on the cave mask only.
  - Remove solid islands under 2 cells and fill air pockets under 2 cells.
  - Gallery and geode bands use `ry ≥ 3`, so the deep gallery and the wreck and geode sites can form domes about 5–7 rows tall like the board's cavern.
- **How.** In `world.ts:154-200`, using the existing layout random stream. Bump `generatorVersion` to 3 and add new fixture hashes. Old saves keep their stored tiles (`WORLD_GENERATION.md` describes the versioning).
- **Risk.** Re-run the 200-seed contracts (cave ≥40 cells, protected route and mission cells, sealed rows 30–31, deposit quotas). Do it after R3, which already removes most of the staircase.

### R8 · Shaft composition and surface ground (S–M, coordinate with the rig/camera and surface audits)

- **Shaft.** In a 1-tile shaft the 1.28-tile rig hides both lips. Either draw the rig at ≤ 1.0 tile while it is inside a vertical shaft, or have R2/R3 add a render-only 0.1-tile over-carve into *known* solid on each side of dug vertical runs.
- **Surface ground.** Apply R1 to row 0–1 unknown cells, so the ground lands at luma 55–65. Give surface holes R2's bevel.

### R9 · Minor (S)

- Remove the page-edge fade strip (covered by R4).
- Consider a DPR 2 terrain raster on desktop when memory headroom allows (`terrain.ts:41`).

**Suggested order:** R1 (one day, the biggest visible change), R2, R3, R4 with R5, R6, R7. Review a W01 band A–B slice against the board before scaling to C–D and W02, as plan D6 intended.

---

## 6. Measurable acceptance

All scripts are in `work/terrain/` and run on standard capture fixtures: `a04-dive-60m`, `a07-side-tunnel-150m`, `b-330m-plate-band-C`, `b-550m-band-D`, `c-site-W01-SITE-4-wreck`, `c-site-W01-SITE-5-geode`, `b-full-reveal-row25/50`, `e08`/`e09` (W02), and `p-portrait-03/04`. All are captured with `capture-v2.mjs`. They should be ported into `scripts/` next to `improvement-pixels.py`.

| # | Gate | Today | Concept | Target | Script |
|---|---|---|---|---|---|
| A1 | Unknown rock mean luma (W01) | 84–89 | 57 | 45–65; W02 ≤ 80 | `values.py` |
| A2 | Unknown rock texture: sd over the region / mean local sd per tile window | 1.5–1.7 / 1.3 | 10.6 / 12.7 | ≥ 7 / ≥ 8 | `values.py`, local-sd snippet |
| A3 | Strata: range of row-mean luma across unknown rock, and its period | 2.8, none | 31, about 1.8 tiles | ≥ 15, period 1.5–2.5 tiles | profile snippet |
| A4 | Known lit solid minus unknown, at every depth | +22 (60 m) to −29 (550 m) | +34 | ≥ +15 within the lamp radius, ≥ +5 everywhere | `values.py` |
| A5 | Unknown luma differs between adjacent bands | ≤ 4 (84.1–88.5 across 60–550 m) | — | ≥ 4 luma or ΔE ≥ 6 | `values.py` |
| B1 | Natural-cave boundary axis-aligned share (±5°) | 65–82 % (captures), 93 % (tiles) | 18 % / 23 % | ≤ 30 % | `boundary.py` |
| B2 | Visual air vs collision air disagreement | 0 % | — | ≤ 5 % of pixels; max offset ≤ 0.3 tile | `proto.py` method, in a test |
| B3 | Dug-shaft rim profile: lip peak above rock / undercut below air / lip width | +27 / none / 0.03 tile | +80 / −15 / about 0.1 tile | ≥ +55 / ≤ −8 / 0.07–0.13 tile | wall-profile snippet |
| B4 | Air cells within 0.3 tile of a wall darker than mid-cave air (ambient occlusion) | 0 | yes | ≥ 8 luma darker | profile snippet |
| C1 | Mean gradient magnitude, tile-normalised, dive captures | 0.84–1.53 | 3.5–3.75 | ≥ 2.5 | `gridlock.py` (`mean_grad`) |
| C2 | Edge-map overlap between any two band pages | 0.95–0.98 | — | ≤ 0.35 | page-overlap snippet |
| C3 | Back-wall luma / sd in caves of ≥ 12 cells | 24–39 / 1.1–3.9 | 36 / 6.5 | 28–42 / ≥ 4, hue cooler than rock | `values.py` |
| C4 | Solid-to-solid edges with a square material change (band D) | 46 % | about 0 | ≤ 10 % straight material edges ≥ 0.5 tile | tilemap snippet plus `boundary.py` on a rock mask |
| D1 | Playfield within 10 levels of one flat colour | 54–84 % | — | ≤ 25 % | flat-share snippet |
| D2 | Hidden-cave identity | passes | — | still passes, including for known cells adjacent to hidden air | existing improvement smoke |
| D3 | Memory and frame time | 55.8 / 63.5 MiB desktop | — | within T12 budgets after R4 | `npm run test:render:memory` |

**Review gate.** Regenerate `cmp-concept-vs-game.jpg`, which places each concept panel beside the matching capture at equal tile scale, together with `cmp-boundary-orientation.png` and `cmp-values.png`. The owner then scores each panel pair 1–5 on four questions: "same rock", "same tunnel edge", "same cave shape", "same darkness order". Pass when every pair scores ≥ 4 and all A–D gates pass on W01 bands A–B. Then repeat for C–D and W02.

---

Artefacts in `work/terrain/`: the comparison sheets (`cmp-*.jpg/png`), the prototype (`proto-before-after.png`, `proto.py`), the page sheets (`band-pages-w01.png`, `band-page-grid-overlay.png`), the cave geometry (`w01-tilemap.png`), the verified sample rectangles (`regions-*.jpg`, `regions.json`) and the metric scripts with their JSON output (`values`, `boundary`, `gridlock`, `edges`, `sbs`).
