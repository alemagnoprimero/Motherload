# 03 — Sprites, props and asset set

Scope: every object on the concept board, compared with the shipped atlases, their SVG sources, the generators that write those SVGs, and the scene code that places them. Terrain, lighting and camera are covered by other reports and appear here only where they decide whether a prop can look like the concept.

Work files are under `<working folder>/art-audit/work/assets/`:

- `concept-asset-inventory.png`: the concept board annotated green, amber or red for each asset.
- `cmp-surface.png`, `cmp-cavern.png`, `cmp-rig-ore.png`: concept and game crops rescaled to one common 96 px tile.
- `cmp-proto.png`: concept, the current game and a layered-SVG prototype I made in this audit.
- `metrics.md`: the shading and detail measurements.
- `game-spawn-lamp-dots.png`: the hidden surface lights.

The prototype sources are in `work/proto/`.

---

## 1 Verdict

The rig, the ore deposits and the sky body already match the concept closely. Their scale is within about 13%, the outline weight is the same share of the tile (about 4–5%), and the silhouettes and palette match. The concept was generated from game captures, and these are the objects it inherited.

Almost everything that makes the board look rich is missing or is a placeholder:

- **Surface:** there is no physical lander at spawn. Stage 0 is a dashed wireframe. There are no lamp posts, tripod lamps, cables, crates, tools or loose rocks.
- **Cavern:** there is no wreck hull, beacon tripod, stalactites, rust drips, amber crystals, boulders or iron shelf.

Of the 21 items marked on the board (`concept-asset-inventory.png`), 8 are comparable, 2 exist far below the concept, and 11 do not exist.

The single biggest reason is the authoring method. Every prop is a few hand-typed polygons emitted by a JavaScript generator (`create-w01-sources.mjs`, `render-sources.mjs`) with flat fills only. None of the 177 W01 or 93 W02 sprite SVGs uses a gradient, filter or opacity. One 6-primitive "wreck" polygon is reused for 6 of 8 landmark kinds, with only the stroke colour changed.

The rasterizer and packer are not the limit. A layered-SVG prototype through the same Chromium path (`cmp-proto.png`) shows that concept-style shading is within reach. The gap is an art-production gap: roughly 60 frames to author, plus about 1–1.5 weeks of placement and layering code.

---

## 2 Side-by-side evidence

**Scale reference.** On the board, one terrain cell is about 45 px:

- the cut blocks on the surface panel are 44–45 px;
- the shaft ores are spaced 45 px apart vertically.

The desktop concept frame is about 15.3 cells wide. The game at 1440 × 900 is 22 cells wide: `campaignTileSize` returns `width / 22` (`src/campaign/layout.ts:6`), which is 65.45 CSS px or 131 device px per cell at @2x. So the concept shows every object about 1.44× larger on screen than the game does. All comparison sheets rescale both sources to a common 96 px cell, marked by the orange bar under each crop.

### 2.1 Surface panel (concept) vs `a02-spawn-1440x900@2.png`, `e01-surface-lander-complete@2.png`, `a01-title-1440x900@2.png`

| Concept asset | Concept | Game | Evidence |
|---|---|---|---|
| Lander | About 2.4 × 2.3 cells (body plus dish). Grey hull with orange door and cargo panels, side lamps, dish on a mast, four splayed legs, gradient shading and a warm under-glow. | **At spawn and on the title screen: a dashed wireframe** over a 4-cell pad (`dock-stage-0`). The restored stage 3 has the same size (2.27 × 2.35 cells), but it is a rocket-shaped capsule with flat fills and no dish. | `cmp-surface.png` rows 1–3; `a01`, `a02`; `create-w01-sources.mjs:482-503` (`stroke-dasharray="12 9"`) |
| Lamp posts (pole, ×1) and tripod work lamps (×2) | 0.35 × 1.2 and 0.8 × 1.5 cells, glowing amber heads with halos | Two 3 px circles and 0.8-cell ellipses. They are drawn **under** the landing pad, so they are invisible. | `game-spawn-lamp-dots.png`: zero warm pixels (R>220, G>190, B<180) in the band around the pad. Code: `scene.ts:1325-1332` draws them at depth 11 at ±1.7 cells; `scene.ts:1360-1370` draws the 4-cell pad at depth 15 over them. |
| Power cables | Orange cable sagging from lander to lamp to crates, about 3 px at the 45 px cell | None | — |
| Crates and power box | 3 boxes, 0.5–0.9 cells, one with a lit screen | None | — |
| Tools (sidebar: cable spool, lamp) | Spool 0.6 cells | None | — |
| Loose rocks and regolith | 4–6 pebbles at 0.2–0.5 cells | None. `surface-salvage` is one grey polygon plus 3 dark lines (2 primitives, 1 fill), repeated at ±5.4–6.9 cells. | `assets/campaign/source/surface-salvage.svg`; `render-sources.mjs:27` |
| Rig | 1.16 cells wide | 1.03 cells wide, same design and outline weight | `cmp-rig-ore.png` row 1 |
| Ringed planet | Crescent-lit disc with bands | Same design (`sky-body`) | `a02` |

In the concept the lander is the brightest, most detailed object at spawn. In the game it is a 6-primitive outline, which is also the hero object behind the title wordmark (`a01`).

### 2.2 60 m shaft panel vs `a04-dive-60m@2.png`, `p-portrait-03-dive-70m@3.png`

| Asset | Concept | Game |
|---|---|---|
| Copper ore (o2) | 0.7 cells, 3–4 shaded facets, contact shadow, embedded at the wall face, small "II" tag | 0.7 cells, 5 facets, 4 px outline. Floats centred on the cell like a sticker, with a 0.3-cell black badge disc and pip dots (`ore-o2.svg`). |
| Silver ore (o1) | Light top faces, dark underside, a rim of rock around it | Same silhouette, but dark grey facets. It reads as rock, not metal. |
| Headlamp | Warm, additive, directional cone of about 3 × 2 cells | Radial glow at 0.18 alpha (`scene.ts:243-261`) plus a cone that only removes darkness in the light map (`lighting.ts:124-131`). No warm beam sprite. |

The ore is the second-closest match after the rig (`cmp-rig-ore.png` row 2). The difference is shading and embedding, not drawing.

### 2.3 300 m cavern panel vs `c-site-W01-SITE-4-wreck@2.png`, `c-site-W01-SITE-1-survey@2.png`, `c-site-W01-SITE-5-geode@2.png`, `c-site-W01-SITE-6-cache@2.png`, `b-330m-plate-band-C@2.png`

| Asset | Concept | Game |
|---|---|---|
| Wreck hull | 4.8 × 1.5 cells, half-buried. Cylindrical hull with 4 plate seams, 3 portholes, an open ribbed end, 6 broken ribs, rust streaks and rubble. | `site-wreck` is 6 primitives (794 bytes). The hull polygon covers 2.0 × 0.74 cells of a 2.8 × 1.9-cell canvas. **It floats about 1.9 cells above the cave floor:** in `c-site-4` its bottom is at device y≈619 and the floor at y≈871, so 252 px, or 1.9 cells of 131 px (`cmp-cavern.png`). |
| Beacon tripod | 0.9 × 2.3 cells: cream legs, orange body, emissive cyan diamond, amber light pool | No tripod. `site-beacon` is the same wreck wedge with an antenna stroke on top; the survey ring is a runtime overlay. |
| Amber crystals | 3 clusters, 0.5–1.2 cells, faceted, lit edges and sparkles | None. `site-geode` is a 3-primitive blue zig-zag (`site-geode.svg`, 605 bytes). |
| Stalactites and rust drips | About 12 hanging points and orange drip runs along the ceiling | None. No asset file or code mentions them (grep for `stalac`, `drip` or `rubble` in `src/` and `assets/` finds only a mission name). |
| Boulders and rubble | Foreground boulders, 1–3 cells, overlapping the floor edge | None |
| Iron shelf (sidebar) | Rusted riveted plates | The "plate" material is canvas-stroked diagonal lines (`terrain.ts:236-246`), visible as orange hatching in `b-330m-plate-band-C`. |
| Cache or locker | — | `site-cache` is a box outline (5 primitives) floating mid-cave (`c-site-6`) |
| Field logs | — | A 0.9 × 0.6-cell copy of `site-survey` (`scene.ts:1768`), floating in open air (`c-site-6` at display (700, 620)) |

### 2.4 Measurements (`work/assets/metrics.md`)

Method: matched crops, both resampled to the concept's 45 px cell. The gradient magnitude of luma splits each crop's pixels into three bins: flat (<1.5), soft shading (1.5–12) and edges (≥12). The colour column counts distinct colours after quantizing RGB to 16 levels per channel.

| Object | Source | Flat % | Soft-gradient % | Edge % | Luma P5–P95 | Colours (16-level) |
|---|---|---|---|---|---|---|
| Lander | concept | 33.1 | **28.6** | 38.3 | 25–203 | **314** |
| Lander | game, stage 3 (`e01`) | 44.6 | 16.1 | 39.3 | 46–204 | 192 |
| Lander | game, stage 0 (`a02`, spawn) | 51.2 | 19.4 | 29.4 | **40–126** | 84 |
| Wreck | concept | 37.8 | **36.4** | 25.8 | 27–115 | **165** |
| Wreck | game `site-wreck` | **63.8** | 21.7 | 14.5 | 28–81 | **27** |
| Rig | concept | 27.4 | 33.7 | 38.9 | 22–184 | 290 |
| Rig | game | 23.5 | 18.5 | 58.1 | 29–175 | 146 |
| Shaft wall and ore | concept | 48.5 | 31.9 | 19.6 | 31–**163** | 355 |
| Shaft wall and ore | game `a04` | 69.7 | 17.8 | 12.5 | 46–**125** | 143 |
| Wreck | **prototype** (`proto-wreck.svg`) | 54.7* | **30.3** | 15.0 | 22–125 | **115** |

\*The prototype was measured over a plain gradient backdrop, which inflates "flat".

Atlas-level facts (`w01-atlas.json`/`.png`):

- **Shared landmark silhouette.** `site-core` and `site-mission` have alpha-mask IoU **1.00** with `site-wreck`; `site-survey`, `site-beacon` and `site-antenna` have **0.90**. All five cover 100% of the wreck's pixels. Only the cache (0.67) and geode (0.80) differ.
- **Few dominant colours.** In `site-wreck`, 6 colours cover 90% of opaque pixels. `dock-stage-3`, the richest prop, has 17 colours at ≥1% coverage; its top 6 cover 59%.
- **Primitive counts per source SVG:**
  - `site-geode` 3, `surface-salvage` 2, `site-cache` 5, `site-wreck` 6, `dock-stage-0` 6;
  - `dock-stage-3` 26, `rig-body-0` 26.

  A concept-level hero prop needs roughly 60–150 primitives plus gradients. My prototype wreck has about 50 primitives and 7 gradients.
- **No shading features in sprite sources.** 0 of 177 W01 and 0 of 93 W02 SVGs use a gradient, filter or opacity. Only the 24 band-material SVGs use gradients, and only as edge-wrap masks (`render-sources.mjs:62`).
- **Line weight is not the problem.** Outlines are about 4.4% of a cell in the concept (2 px per 45 px) and 4.2–5.2% in the game (4–5 px per 96 px); the single outline colour `O = "#14232b"` (`create-w01-sources.mjs:14`) also matches. Keep both.

### 2.5 Prototype (`cmp-proto.png`)

I wrote `work/proto/proto-wreck.svg` (480 × 176, 5 × 1.8 cells) and `proto-beacon.svg` (112 × 232) by hand in one short session. Both use only:

- linear gradients for cylinder shading, legs and the orange body;
- radial gradients for the contact shadow, the open end and the light pool;
- one `feGaussianBlur` glow on the diamond;
- seam pairs (a dark line plus a light line), rivets, rust-streak shapes with fading opacity, a rim-light stroke and a front "burying mound".

I rendered them with the same `playwright-core` Chromium screenshot path the repo uses (`scripts/rasterize-campaign-svgs.mjs`). The soft-gradient share rose from 21.7% to 30.3% (concept 36.4%), and colours from 27 to 115 (concept 165).

It still lacks texture (grain, mottled rust, chipped paint, ambient occlusion in creases), which is where the remaining labour sits.

---

## 3 Root causes in code and assets

1. **Programmer-typed vector art with no shading vocabulary.**
   - `assets/campaign/source/create-w01-sources.mjs` (889 lines) and `assets/campaign/w02/create-sources.mjs` (660 lines) emit every sprite from hand-typed path coordinates.
   - Their helpers `path`, `rect`, `circle` and `layer` only take fill, stroke and width. There is no gradient, mask, filter or opacity helper, so nothing authored this way can have soft shading.
   - Example: `lander(stage)` at `create-w01-sources.mjs:482-580` builds the restored ship from 26 flat primitives.
2. **One landmark drawing for all site kinds.**
   - `sceneryFrames()` (`assets/campaign/render-sources.mjs:12-28`) loops over 8 kinds. Each one gets the same ground polygon and the same 3-facet wedge, with only `color` changed, plus an antenna or diamond overlay.
   - The scene then maps every POI or site kind onto these frames (`scene.ts:658-680`, `scene.ts:1724-1735`).
3. **The spawn lander is a blueprint by design.** `dock-stage-0` is a dashed outline (`create-w01-sources.mjs:491-503`), and the scene shows stage `min(3, completedMilestones)` (`scene.ts:1306`, drawn at `scene.ts:1360-1370`). The first screen, and the title (`a01`), therefore always show the least physical version of the most important prop. W02's refuge does the same (dashed module in `e06-w02-surface@2.png`).
4. **Surface "dressing" is runtime dots hidden under the pad.** `scene.ts:1305-1335` draws `surface-salvage` at ±5.4–6.9 cells and lamp dots at ±1.7 cells, at depth 11. The 4 × 3-cell `dock-stage` image at depth 15 covers ±2 cells. The D7 item marked done in `docs/IMPROVEMENT_COVERAGE.md:61` has no visible lights in `a02`.
5. **Props are not grounded or layered.**
   - Sites are drawn centred (`originY` 0.5) at the site coordinate, with a fixed 2.6–2.8 × 1.75–1.9-cell box. Nothing finds the floor beneath them, so they hover (`c-site-4`).
   - The scene has no front layer: no occluding mound or rubble at a depth above the rig (rig layers sit at depth 18–23 in `rig.ts:62-156`).
   - Wrecks share the cell-square `wreckMask` (`scene.ts:208-209`), so a partly known site is cut into hard cell squares (`c-site-1`, the beacon at right).
6. **No decoration system for caves.** No frame family, placement rule or render pass exists for ceiling or floor dressing. The terrain renderer knows exposed edges (the edge-mask bit field in `CAMPAIGN_ASSETS.md`: 1 top, 2 right, 4 bottom, 8 left), but nothing consumes it for props.
7. **The iron-shelf material is a placeholder.** `material === "plate"` strokes four diagonal lines per cell at 0.65 alpha (`src/campaign/render/terrain.ts:236-246`).
8. **The plan itself downgraded props.**
   - `docs/IMPROVEMENT_PLAN.md` rates D7 "Surface dressing" as Medium impact and D8 "Wrecks and hazards as atlas art" as **Low** impact (line 280).
   - D8 was satisfied by moving the old runtime line art into atlas frames ("shapes use generated atlas frames", `IMPROVEMENT_COVERAGE.md:62`). It did not redesign them.
   - The asset checks (`scripts/check-campaign-assets.mjs`) validate contracts: sizes, gutters, trims, transparency, anchors. They cannot fail on art quality or on silhouette reuse.
9. **Resolution headroom matters if the camera follows the concept.**
   - Runtime pages are 96 px per cell (@2x) and 144 px (@3x, desktop only: `scene.ts:835-839`).
   - At the concept's 15.3-cell framing, 1440 × 900 @2x needs 188 px per cell, so new masters should be authored at 4× (192 px).

---

## 4 Gaps ranked by visual impact

1. **Spawn lander is a wireframe** (`a01`, `a02`, `p-landscape-02-spawn`). It is the first-screen focal object and the title hero. Luma P95 is 126 against 203 in the concept.
2. **Cavern landmarks are tiny flat wedges, floating and shared.** There is no wreck hull or beacon tripod (`c-site-1`, `c-site-4`). Five of eight site frames have IoU ≥ 0.90.
3. **No cave dressing:** stalactites, rust drips, amber crystals, boulders. Every deep capture (`b-330m`, `b-450m`, `b-550m`, `c-site-5`) reads as a grid of cells with stickers, where the concept reads as a place.
4. **No surface kit:** lamps, tripods, cables, crates, tools, rocks. The concept surface has about 12 props in a 5-cell span; the game has one polygon heap.
5. **No warm light emitters on props.** The concept uses 5 emissive points on the surface, the beacon diamond and the crystal sparkles to set value contrast. The game has none visible (lamp dots hidden; `game-spawn-lamp-dots.png`).
6. **Flat interior shading on every existing sprite.** The soft-gradient share is 16–22% against the concept's 29–36%, and the colour count is 27–192 against 165–355.
7. **Ores sit on top of cells rather than in them.** There is no socket or rim, and the badge disc is heavy (`cmp-rig-ore.png`).
8. **Iron shelf is a hatch pattern** (`b-330m-plate-band-C`).
9. **Field logs and caches are generic and float** (`c-site-6`).
10. **W02 parity.** The same gaps repeat on the comet (`e06`, `e07`, `e08`), with the dashed refuge module at spawn.

---

## 5 Recommendations

### 5.1 Pipeline: what produces concept-level assets, and what each route costs

| Route | Suits | Cost per hero prop | Cost per small prop | Editability | Main risk |
|---|---|---|---|---|---|
| **A. Current: code-generated SVG** (coordinates typed in `.mjs`) | Parametric families only: ore tiers, edge masks, icons | Reaching concept detail this way is impractical: 3–5 days per prop, and it still looks typed | — | Code review only | This is today's ceiling |
| **B. Hand-authored layered SVG** (Inkscape, Figma or Affinity → `.svg` committed under `source/`). Gradients, masks, `feTurbulence` grain, baked through the existing Chromium rasterizer. | Hard-surface and mechanical props: lander, lamps, crates, cables, beacon, wreck, site props, rig | 1–2 days | 2–4 hours | High: diffable, resolution-independent, re-exports at any scale | Rust and grain texture is slow in vectors. Needs a style sheet so artists stay consistent. |
| **C. Painted raster** (Krita or Photoshop at a 4× master, 192 px per cell; Lanczos down to @3x and @2x) | Organic dressing: stalactites, rust drips, boulders, rubble, crystal clusters, iron-shelf plates | 1.5–3 days | 3–6 hours | Medium: layered PSD/KRA masters plus exported PNG | Re-export churn. Edges must keep the 4–5% outline rule. |
| **D. Generated, then cleaned and painted over.** The concept board is our own IP and can serve as a style reference. Generate candidate sheets, remove the background, flatten perspective to a pure side view, clamp to the pinned palette, normalize outlines, then paint over (C) or trace (B). | First-pass variety for rocks, rubble, stalactite and crystal variants | 0.5–1 day of cleanup | 1–2 hours | Low until painted over | Style drift between batches, 3/4-view perspective errors, alpha fringes, and provenance recording (keep `generated/provenance.json` up to date). Never ship raw outputs. |

**Recommendation: B plus C, with D only as an underlay.**

Use B for everything mechanical (the board itself says "Vector · No perspective"), C for cave dressing, where noise and softness carry the look, and keep A for ore tiers, edge masks and icons.

Pipeline work (M, 2–3 days):

1. Let `frames.json` entries point to a hand-authored SVG or to a raster PNG master (`"source": "raster"`), so the packer can skip the Chromium step for C.
2. Author masters at 4× and add an optional @4x page if the camera moves to the concept framing.
3. Add an `-emissive` layer convention: a second frame drawn with `BlendModes.ADD` and fed into the light map.
4. Split atlases by zone: `w01-props-surface` and `w01-props-cave`, each at most 2048 × 1024 @3x, so they fit the 40 MiB touch and 64 MiB desktop texture budgets (`scripts/render-memory.mjs:120`).
5. Remove the requirement that props share `sceneryFrames()`.

### 5.2 Recommendations

**R1. Make a physical lander at spawn and restore it in physical stages.** Effort M (3–4 days). Impact: very high (title plus first screen). Risk: low.

- What: replace `dock-stage-0`'s wireframe with a grounded, damaged lander:
  - tilted 3°, one leg buckled;
  - orange cargo doors hanging open and missing panels as dark holes;
  - dish mast folded;
  - sparks from 2 emissive frames.
- Stages 1 and 2 add panels. Stage 3 closes the hull, raises the dish and lights the side lamps.
- Keep the 4 × 3-cell canvas and 2.3–2.4-cell body; the scale already matches.
- How: route B, with separate frames for the body per stage, the dish and the emissive overlay (rows 1–3 of 5.3). Move the label off the body (`scene.ts:1371-1381` places "SALVAGE LANDER" over it).

**R2. Surface operations kit, and fix the hidden lights.** Effort L (1–1.5 weeks including placement). Impact: high. Risk: low.

- Assets (route B): pole lamp; tripod work lamp with its own light pool; cable texture strip plus plug ends; crates and power box with an emissive screen; cable spool, tool rack and jerry can; 8 regolith rocks; 3 salvage heaps replacing `surface-salvage`.
- How:
  - Replace `scene.ts:1325-1332` with a deterministic, seed-hashed layout per dock period: lamps at ±2.6 and ±4.2 cells (outside the pad), crates at +2.8 to +3.6, rocks scattered in ±8 cells.
  - Draw cables with `Phaser.GameObjects.Rope` on a 2-segment catenary between anchor points: lander socket, tripod, power box.
  - Emissive heads get ADD-blended halo sprites and a light-map contribution.
  - Depth: props at 14–15, halos at 16; never under the pad.

**R3. Unique, grounded, layered landmarks.** Effort L–XL (2–2.5 weeks). Impact: very high in caves. Risk: medium (reveal rules).

- Assets: the wreck hull (hero, 5 × 1.7 cells) and five more distinct site props:
  - survey mast;
  - lander valve store;
  - antenna workshop;
  - geode, rebuilt as amber crystals for W01;
  - thermal service locker.
- Each has two states (sealed/opened, or dormant/active) and **back and front layers**.
- Plus the beacon tripod (0.9 × 2.4 cells) with a separately animated emissive diamond: a pulse tween or 8 frames, in dormant, active and surveyed states.
- How:
  - Snap each site to the first solid cell below its coordinate and draw at `originY` 1. The prop's opaque bottom row must sit within ±2 device px of the floor-cell top.
  - Draw the back layer at depth 14 and the front mound or rubble at depth 24, so the rig passes "inside" the wreck.
  - Replace the cell-square `wreckMask` (`scene.ts:208-209`) for scenery with a feathered mask derived from the light or known map, so partial reveals do not show hard squares. The rule that unknown cells reveal nothing stays the same.
- Delete the shared wedge in `render-sources.mjs:12-24`. Route B, with a C texture pass for rust.

**R4. Cave dressing decals and their placement.** Effort L (1.5–2 weeks). Impact: high. Risk: medium (must never leak hidden terrain or minerals; performance).

- Assets (route C, with D as an optional underlay):
  - stalactites: 6 at 1 × 1 cell, 3 clusters at 2 × 1.2;
  - rust drips: 4, at 1 × 1 and 1 × 2, plus a 6-frame drip particle;
  - floor rubble: 6;
  - foreground boulders: 3, at 1, 2 and 3 cells;
  - amber crystal clusters: 3 sizes, floor and wall versions, each with an emissive sparkle;
  - wall cracks: 4.
- How:
  - In the retained terrain pass, for **known** cells only: if the bottom edge is exposed (bit 4), place a ceiling decal with p = 0.35 (rust variant p = 0.25 in bands C and D). If the top edge is exposed (bit 1), place rubble with p = 0.2.
  - Place crystals only in lit cells of cavities larger than 6 cells.
  - Hash the choice by (seed, x, y). Draw at depth 13 (behind the rig) or 24 (front boulders).
  - Cap the count per screen at 40.
  - Dressing must be cosmetic only. Amber crystals are not minerals, and they must not coincide with ore cells.

**R5. A shading pass on the existing sprites.** Effort M (3–4 days). Impact: medium-high. Risk: low.

- Rig: gradient glass, specular strip, track grime, emissive headlamp layer (all 8 body frames plus cabin).
- Ore: a socket or rim decal per tier, which seats the ore in the rock; a smaller badge (glyph with an outline, no 0.3-cell disc); light top faces on silver.
- Landing pad, refuge, relay: gradients and a rim light.
- How: add `linear()` and `radial()` gradient helpers and a `rim()` helper to the generator, keeping route A for these families, then re-render @2x and @3x.

**R6. Iron-shelf material.** Effort M (2–3 days). Impact: medium at 300–400 m. Risk: low.

- Replace the hatch strokes (`terrain.ts:236-246`) with a band-material page of riveted rust plates: 384 × 384 logical, like the existing `bands/*-rock` pages, plus the 16-mask rim set.
- Add 3 crack overlays for the unstable states, coordinated with `warning-shelf`.
- Route C.

**R7. W02 parity set.** Effort L (1.5 weeks). Impact: medium (second world). Risk: low.

- Physical refuge stage 0, cryo lamps, frost crates, ice stalactites, a frozen wreck variant and a condenser beacon, reusing the R2–R4 code.

**R8. Field logs and caches as their own props.** Effort S (1 day). Impact: low-medium. Risk: low.

- A data-pad marker (0.5 × 0.4 cell, 2-frame LED blink) replaces the 0.9-cell `site-survey` copy (`scene.ts:1768`).
- The cache becomes a grounded locker with an open state.

**R9. Art-quality checks in CI.** Effort S–M (1–2 days). Impact: protects all of the above. Risk: low.

- Extend `scripts/check-campaign-assets.mjs` to fail when:
  - two scenery frames have alpha IoU > 0.7;
  - a hero frame (lander, wreck, beacon, site) has fewer than 40 colours covering ≥ 0.1%;
  - any frame in the concept coverage list is missing.
- Extend `scripts/render-acceptance.mjs` to measure the metrics in section 6 on fixture captures.

### 5.3 Asset production list

Sizes are logical cells (1 cell = 48 px @1x). Canvases are given @2x, as the repo authors them, with @3x and an optional @4x derived. B means layered SVG, C painted raster, A the existing generator.

| # | Asset | Cells (w×h) | @2x canvas | States / frames | Layers | Route | Priority | Est. |
|---|---|---|---|---|---|---|---|---|
| 1 | Lander body, physical stages 0–3 | 2.4×2.4 on a 4×3 canvas | 384×288 | 4 stages | body, doors/panels, legs | B | P0 | 3 d |
| 2 | Lander dish | 0.6×0.7 | 64×72 | 6-frame scan or tween | — | B | P0 | 0.5 d |
| 3 | Lander emissive (windows, side lamps, sparks) | 4×3 | 384×288 | 2 flicker + 2 spark | ADD | B | P0 | 0.5 d |
| 4 | Pole lamp and halo | 0.35×1.2 | 34×116 | on/off | body, ADD head | B | P0 | 0.5 d |
| 5 | Tripod work lamp, halo and ground pool | 0.8×1.5 (+2×0.4 pool) | 78×144 | on/off | body, ADD head, ADD pool | B | P0 | 0.5 d |
| 6 | Cable strip and plug ends | — | 64×10 strip; 2× 20×20 | — | Rope texture | B | P0 | 0.5 d + 0.5 d code |
| 7 | Crates (3), power box with screen | 0.5–1.0 | ≤96×72 each | screen 2 frames | body, ADD screen | B | P0 | 1.5 d |
| 8 | Tools: cable spool, tool rack, jerry can | 0.5–0.8 | ≤80×80 | — | — | B | P0 | 1 d |
| 9 | Regolith rocks | 0.2–0.8 | ≤80×48 | 8 variants | — | B/C | P0 | 0.5 d |
| 10 | Salvage heaps (replace `surface-salvage`) | 2.5×1.25 | 240×120 | 3 variants | — | B | P0 | 1 d |
| 11 | Wreck hull (hero) | 5×1.7 | 480×164 | sealed / surveyed | back, front mound, rust texture | B+C | P1 | 2–3 d |
| 12 | Beacon tripod and diamond | 0.9×2.4 | 112×232 | dormant/active/surveyed; 8-frame or tween pulse | body, ADD diamond, ADD pool | B | P1 | 1 d |
| 13 | Survey mast site | 2×2.4 | 192×232 | intact/surveyed | back, front | B | P1 | 1 d |
| 14 | Lander valve store site | 2.5×1.6 | 240×154 | sealed/opened | back, front | B | P1 | 1–1.5 d |
| 15 | Antenna workshop site | 2.8×2 | 268×192 | sealed/opened | back, front | B | P1 | 1–1.5 d |
| 16 | Thermal service locker (cache) | 1.5×1.1 | 144×106 | closed/open | body, ADD indicator | B | P1 | 1 d |
| 17 | Amber crystal clusters (W01 geode and dressing) | 0.5 / 0.8 / 1.2 | ≤116×116 | 3 sizes × floor/wall + sparkle | body, ADD | C | P1 | 1.5 d |
| 18 | Stalactites | 1×1 (6), 2×1.2 (3) | 96×96, 192×116 | 9 variants | — | C | P1 | 1.5 d |
| 19 | Rust drips | 1×1, 1×2 | 96×96, 96×192 | 4 + 6-frame drip particle | — | C | P1 | 1 d |
| 20 | Floor rubble | 0.5–1 | ≤96×64 | 6 | — | C | P1 | 0.5 d |
| 21 | Foreground boulders | 1, 2, 3 | ≤288×144 | 3 | front layer | C | P1 | 1 d |
| 22 | Ore sockets / embed rims | 1×1 | 96×96 | 4 tiers × 2 | under-ore decal | A+gradients | P1 | 1 d |
| 23 | Ore badge restyle | 0.25 | in `ore-o*` | 4 | — | A | P1 | 0.5 d |
| 24 | Headlamp beam | 6×3 | 288×144 (soft, can be @1x) | right/left/down | ADD | B | P1 | 0.5 d |
| 25 | Drill chips and dust | 0.1–0.3 | ≤32×32 | 6 | particles | B | P1 | 0.5 d |
| 26 | Iron-shelf plates material and rims | 8×8 page | 768×768 + 16 rims | 3 crack states | — | C | P1 | 2–3 d |
| 27 | Field-log data pad | 0.5×0.4 | 48×40 | LED 2 frames | ADD LED | B | P2 | 0.5 d |
| 28 | Rig shading pass | 1.33 canvas | 128×128 | 8 body + cabin + modules | + emissive headlamp | A+gradients | P2 | 2 d |
| 29 | Pad, refuge, relay shading pass | existing | existing | existing | — | A+gradients | P2 | 1 d |
| 30 | W02 parity set (refuge stage 0, cryo lamps, frost crates, ice stalactites, frozen wreck, condenser beacon) | as W01 equivalents | — | as W01 | — | B/C | P2 | 7–8 d |

Totals:

- **Art:** about 40–45 artist-days (8–9 weeks for one artist on routes B and C), 30% less if route D supplies the dressing underlays.
- **Code:** about 7–9 days for the R2–R4 placement, layering, emissive and mask work, plus 2–3 days of pipeline changes and 1–2 days of CI checks.
- **Texture memory:** about 240 cell² of new art comes to about 20 MB at @3x and 9 MB at @2x before trimming. Zone-split pages keep the resident set to 1 surface page plus 1 cave page.

Suggested order: rows 1–10 (one 2-week sprint to fix the first screen), then 11–17 and 24, then 17–23 and 26, then P2.

---

## 6 Measurable acceptance

**Fixture captures.** Each fixture is captured at 1440 × 900 @2x and 393 × 851 @2x/@3x, driven like `capture-v2.mjs`:

- **S1:** spawn at the lander, stage 0. Repeat at stage 3.
- **S2:** a 60 m shaft with copper and silver deposits exposed in the walls.
- **S3:** a W01 cavern of at least 6 × 4 cells at 280–340 m containing the wreck site and the beacon, fully known and lit.
- **S4:** the iron-shelf band.

**Coverage.** Every item on the board's inventory has a shipped frame visible in S1–S4. There are 21 marked items (`concept-asset-inventory.png`); headlamp and planet are excluded as other dimensions. A script checks this from the atlas JSON and the scene's rendered image list (`render-probe.mjs` can expose frame names). The target is 0 red items and at most 2 amber.

**Scale**, measured on the opaque bounding boxes in S1–S3, in cells:

| Object | Target |
|---|---|
| Lander body | 2.2–2.6 wide |
| Rig | 1.0–1.25 wide |
| Pole lamp | 1.1–1.4 tall |
| Tripod | 1.3–1.7 tall |
| Wreck | ≥ 4.0 wide and ≥ 1.3 tall |
| Beacon, including diamond | ≥ 2.0 tall |
| Ore | 0.6–0.8 |

**Grounding.** For every site and surface prop, the bottom opaque row is within ±2 device px of the supporting cell's top edge. Today the wreck is 252 px off in `c-site-4`.

**Shading and detail.** Use the same method as `work/scripts/metrics.py`: crop at the matched 45 px cell, luma-gradient bins, 16-level colour count.

| Crop | Soft-gradient share | Distinct colours | Flat share | Luma P95 |
|---|---|---|---|---|
| Lander | ≥ 25% (now 16.1 / 19.4) | ≥ 250 (now 192 / 84) | ≤ 40% | — |
| Wreck | ≥ 30% (now 21.7) | ≥ 130 (now 27) | — | — |
| Shaft wall and ore | — | — | ≤ 55% (now 69.7) | ≥ 150 (now 125; concept 163) |

**Uniqueness.** No two scenery frames have alpha IoU > 0.70. Today five pairs score ≥ 0.90, and two score 1.00.

**Emitters.** S1 contains at least 4 warm emissive points, each with ≥ 30 px² of pixels at R > 220, G > 170, B < 160. Today there are 0. S3 contains a cyan beacon diamond (≥ 60 px² at B > 200, G > 200, R < 140) and at least 2 amber crystal clusters.

**Cave dressing density.** In S3, there are at least 8 ceiling decals per 10 exposed ceiling edges in known cells, and at least 3 floor rubble or boulder pieces. In a hidden-cave fixture, 0 decals appear on unknown cells (the reveal rule from `docs/art-direction/README.md`).

**Edge detail.** The wreck crop's edge share is ≥ 20% (now 14.5; concept 25.8).

**Side-by-side review.** Render S1–S3 next to the matching concept panels at the same cell scale, as in `cmp-*.png`. At least 3 reviewers, including the owner, mark each of the 21 inventory items as "matches", "close" or "missing". The bar is ≥ 18 matches or close, with 0 missing. Keep the sheets in `docs/art-direction/` as the regression baseline.

**Budget.** `scripts/render-memory.mjs` still passes: touch at most 40 MiB, desktop at most 64 MiB. `render-budget.mjs` p95 frame time moves by at most +10% in S3 with full dressing.
