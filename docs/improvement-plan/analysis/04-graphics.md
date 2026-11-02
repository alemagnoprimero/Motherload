# 04 · Graphics, art direction and world rendering

> **Archived audit report** (2026-11-02, baseline commit `dbf0b1a`), supporting [the improvement plan](../../IMPROVEMENT_PLAN.md). Source paths are relative to the repository root; `work/…`, `shots/…` and `analysis/…` are relative to `docs/improvement-plan/`. Review scripts named `*.test.ts` are archived as `*.audit.ts` (see [the folder README](../README.md)). Screenshots and captures (`*.png`) were local review files and are not committed, except the UI mocks, which are stored as `.webp`.

Auditor key: `graphics`. Read-only analysis of `<repo>` at `dbf0b1a`. Workspace root: `docs/improvement-plan/`. In this report, `shots/…` and `work/graphics/…` are relative to that root; section 9 lists every artefact with its path.

Boundaries: this report covers art direction, terrain, background and sprite rendering, lighting, atmosphere, post-processing, palette, in-canvas polish and the rendering architecture. Action VFX (particles, shake, juice), camera framing and zoom belong to the feel audit (`analysis/03-feel.md`, FEEL-P3/P4/P8), and the HTML HUD and menus belong to the HUD and menu audits. Those items are referenced, not duplicated.

---

## 1. Assessment

The individual drawings are a sound base: a consistent flat-vector style with dark outlines for the rig, modules, structures, ores and icons, built by an editable, validated SVG→atlas pipeline. The problem is the way the world is put on screen. The owner's "graphics are not up to par" is accurate, and it is mostly a **rendering and terrain-art problem, not a sprite problem**:

1. **The screen is a black void in normal play.** 86–93 % of pixels have luma below 40–50/255 while drilling (`d04`, `d05`, `d20`, `l02`). Unexplored rock is drawn as near-black squares, remembered rock at 42 % opacity, and dug space as the same flat navy as the fog. When the whole map is revealed, the art is visible (`d21`: 3 % dark pixels), but players never see that view.
2. **The terrain is a one-tile wallpaper.** The eight soil variants are shifted copies of one drawing, and the four stone variants differ by 3–6 % of their pixels. Every tile has a light-top/dark-bottom facet, so every row of tiles reads as a stripe. Edge frames are opaque full tiles that erase the variants on every shaft wall, and their rails look like machined pipe rather than rock.
3. **There is no light, only a visibility box.** Opacity is set per tile. Inside the 4.5-tile radius brightness falls by only about 2 levels, then drops 15 levels at the boundary, in tile steps. The lamp sprite sits *behind* the rock. The headlamp that the pinned rig and W01 lighting briefs call for does not exist.
4. **Nothing changes with depth.** At 40 m and 560 m the palette, textures and background are identical (mean luma 69.0 against 65.8), yet rock takes up to 1.74× longer to cut at depth (2.24× in W02). The descent, the core of the genre, has no visual arc.
5. **The backgrounds break.**
   - The 512 px sky texture tiles vertically every time the player climbs to the flight ceiling, even at 1440×900. A second planet or comet appears with a hard seam at y = 512.
   - Two planets show on 1920-wide screens, and at 1440 after crossing the wrap seam.
   - The ridge PNGs are not seamless, and W01's near and far ridges are the same drawing.
   - Beyond the explored strip the horizon is fog, so the base floats over a void.
6. **The canvas ignores devicePixelRatio.** A DPR-3 phone gets 1/9 of its device pixels and a Retina MacBook 1/4, so the 2×-authored art and the in-canvas text are upscaled and soft beside the crisp HTML HUD.
7. **Several readability features fail.**
   - Hard rock (1.85× cut time) differs from soil by only ΔE 3.1, and in W01 an exposed stone face is drawn with the soil edge.
   - W02 ores sit ΔE 9–19 from the ice.
   - The "High-contrast edges" setting changes **zero** canvas pixels.
   - Ore badges draw on top of the rig.
8. **The architecture is immediate-mode.** Each frame the renderer redraws about 430–860 pooled images and five Graphics objects, and re-rasterizes and uploads every label texture. On-screen overdraw is 3.9–6.1 screens. With 4× CPU throttling (a mid-range phone approximation) JS alone takes a median 17.7 ms per frame on a phone viewport and 30.7 ms in an explored scene. The structure must change before richer visuals are added.

Most of the cure is **presentation-only**: simulation, collision, discovery rules and saves stay unchanged.
- **Quick wins (week 1):**
  - Fix the sky, ridges and horizon.
  - Make material edges transparent overlays with distinct stone.
  - Make high contrast work.
  - Fix the badge z-order.
  - Stop the per-frame text uploads.
- **Foundation (weeks 2–3):** DPR-aware rendering, a retained tilemap renderer, per-world texture scoping and budgets.
- **Transformation (weeks 3–8):**
  - A lightmap with a headlamp and soft fog.
  - Opaque "unexplored rock" instead of void.
  - Back walls with ambient occlusion.
  - World-space macro textures with four depth bands per world.
  - An ore colour-family redesign.
  - Rig, atmosphere and surface polish.

## 2. Method and artefacts

- **Code read in full:** `src/campaign/scene.ts` (2,009 lines). Also read: Phaser config (`main.ts:1919-1988`), `layout.ts`, `mineral-legend.ts`, the visibility and cut-time parts of `model.ts`, `world.ts` generation, the SVG generator `assets/campaign/source/create-w01-sources.mjs`, both build scripts, `docs/CAMPAIGN_ASSETS.md`, `docs/DESIGN_PACK_IMPLEMENTATION.md` and the W01/W02/rig/mineral briefs in `design/v0.1/motherload-asset-manifest.json`. Phaser 3.90 internals were checked where a claim depends on them (TextStyle setters, Depth setter, Config defaults).
- **Asset analysis (Python and Pillow):**
  - Frame extraction, alpha coverage and variant pixel differences: `frames.py`, `variety.py`.
  - CIELAB contrast: `lab.py`.
  - Atlas utilisation and decoded memory.
  - Background seam tests.
- **Browser instrumentation (Playwright with Chromium and WebGL through SwiftShader):**
  - `gfx-perf.mjs` wraps WebGL calls and `requestAnimationFrame`. It counts draw calls, texture uploads and submitted and clipped triangle area per frame, records rAF JS time against the real `performance.now`, and takes a CDP CPU profile.
  - A 4× CPU-throttled run.
  - `gfx-dpr2.mjs` checks the HiDPI backing store.
- **Deterministic captures (fake clock and checkpoint fixtures):**
  - `gfx-capture.mjs`: stone exposure, shifted-camera bleed pair, high-contrast pair, depth triptychs for both worlds, ore readability for both worlds, 1280/1920/2560 viewports, a DPR-3 phone and damage stage 3.
  - `gfx-fly.mjs`: flight ceiling in both worlds.
  - `gfx-wrap.mjs`: sky after crossing the wrap seam.
  - `gfx-wreck.mjs`: wreck POI.
  - All W01 fixtures share one base world (`shots/checkpoint-native.json`), so pixel comparisons use the same terrain.
- **Caveat:** headless SwiftShader rasterizes on the CPU, so absolute frame rates here (4–12 fps) say nothing about real GPUs. Draw calls, uploads, overdraw, JS time and relative comparisons are valid. Real-device frame time must still be measured; see the budgets in section 7.5.

## 3. Strengths to keep

- **A coherent illustrated sprite language.** Flat fills, 4 px source outlines in `#14232b` and a restrained palette across the rig, modules, lander, refuge, relay, ores and icons (`w01-atlas.png`). The construction stages read clearly as progression (`e00`–`e03`).
- **Modular rig compositing** with shared 128 px canvases, pivot (64, 64) and tread baseline (`CAMPAIGN_ASSETS.md:34`). Ranked parts and tools from another world stack correctly, with no combinatorial sprite explosion.
- **An editable, deterministic pipeline.** Procedural SVG sources with named `data-layer` groups (the edge rails are already a separate `exposed-edges` layer, `create-w01-sources.mjs:71-91`), plus validation scripts. A re-art pass is cheaper here than in most projects.
- **Information safety by design.** Unknown cells use one geology-independent substrate (`scene.ts:1112-1123`). Wreck art is clipped to known cells. Inspection works only on visible cells. Every proposal below keeps this.
- **Efficient batching already.** WebGL multi-texture batching gives 3–4 draw calls per frame (measured) with one atlas per world.
- **Accessibility intent is present.** Shape badges for ores, reduced motion respected (bob, pulse and chips off), and hazard icons with labels.
- **Distinct world identities.** W01 is grey and orange; W02 is teal and amber, with a comet sky and ice facets. Both follow the pinned palettes, and W02's surface reads as a different place (`d19`).

## 4. Measurements

### 4.1 Renderer configuration and resolution (`perf/perf-all.json`, `perf/dpr-desktop.json`)

| Viewport | DPR | Canvas backing | Device pixels | Share of device pixels rendered |
|---|---|---|---|---|
| Desktop 1440×900 | 1 | 1440×900 | 1440×900 | 100 % |
| Windows laptop at 125 % | 1.25 | 1536×864 | 1920×1080 | 64 % (non-integer upscale) |
| MacBook 1440×900 | 2 | 1440×900 | 2880×1800 | **25 %** |
| Phone 393×851 | 3 | 393×851 | 1179×2553 | **11 %** |

- WebGL is selected by `Phaser.AUTO`, with antialias and stencil on.
- `Scale.NONE` and `width = clientWidth` (`main.ts:1919-1988`) give no DPR handling. `roundPixels` keeps its default `false` (Phaser `Config.js:396`).
- Tiles are drawn at `tile + 0.5` px at fractional camera offsets (`scene.ts:1144`).

### 4.2 Per-frame cost (`gfx-perf.mjs`; medians, p95 in brackets)

| Scenario | rAF JS ms | Draw calls | `texImage2D` per frame (bytes) | Triangles | On-screen overdraw | Submitted geometry |
|---|---|---|---|---|---|---|
| Surface idle 1440×900 | 3.8 (6.9) | 3 | 6 (84,000) | 1,512 | **3.9 screens** | 5.2 screens |
| Drilling 1440×900 | 5.4 (6.9) | 3 | 9 (108,528) | 2,430 | 4.2 | 5.7 |
| Explored deep scene 1440×900, moving | 6.1 (9.1) | 4 | 0 | 4,564 | **6.1** | **18.7** |
| Phone 393×851, drilling | 4.0 (5.9) | 3 | 6 (66,864) | 1,912 | 4.5 | 7.6 |
| **Phone, 4× CPU throttle** | **17.7 (35.9)**, max 54.2 | 3 | 6 | — | — | — |
| **Explored deep, 4× CPU throttle** | **30.7 (42.4)** | 4 | 0 | — | — | — |

- **JS breakdown** (CPU profile, explored scene; `perf/deep-profile.cpuprofile`):

  | Part | Share of JS |
  |---|---|
  | Phaser WebGL render | 45 % |
  | `scene.update` | 42 % |
  | of which `image()` pooling | 9 % |
  | of which HUD sync | 7 % |
  | of which simulation tick | 7 % |
  | of which `refreshVisibility` | 3 % |
  | display-list depth sort | 1.7 % |

  Rendering work is therefore about 70 % of JS.
- **Text uploads.** Each visible label is re-rasterized and uploaded three times per frame. `setColor`, `setAlign` and `setWordWrapWidth` each call `TextStyle.update` → `Text.updateText` → `canvasToTexture` (Phaser `TextStyle.js:756-760, 964-971, 1014-1020`; `Text.js:1452-1455`). The callers are in `scene.ts:492-499`.
- **Off-screen geometry.** Underground, the parallax "plates" are about 3,000 px tall polygons (`scene.ts:1039-1055`, using `surfaceY` far above the screen), hence 18.7 screens submitted against 6.1 on screen. Phaser re-triangulates them with earcut every frame.

### 4.3 What the player sees (`work/graphics/darkness-stats.json`; luma = Rec. 709 on screenshots)

| Frame | Pixels with luma < 40 | < 50 | Mean luma |
|---|---|---|---|
| `d02` surface start | 68.6 % | 78.7 % | 42.9 |
| `d04` 60 m shaft | **89.0 %** | 89.6 % | 36.7 |
| `d05` 180 m | 85.8 % | 89.2 % | 36.1 |
| `l02` landscape phone | 87.0 % | 88.1 % | 38.4 |
| `p03` portrait phone | 77.4 % | 78.9 % | 43.3 |
| `d20` W02 70 m | 53.2 % | **92.9 %** | 45.0 |
| `d21` debug: whole map revealed | 3.0 % | 16.1 % | 68.0 |

Lighting profile along a lit corridor floor (`cap/lighting-steps.json`): tile luma 94.6 → 92.6 from 0.9 to 4.1 tiles from the rig, then **77.7 at 5.1 tiles**, a 15-level cliff at the 4.5-tile visibility boundary. The model behind it is `alpha = lit ? max(0.58, 1 − 0.055·d) : 0.42` (`scene.ts:1138`).

Bleed-through (`cap/bleed-results.json`, same world, camera shifted 4 tiles): identical remembered rock cells change by a mean 1.8–2.4 levels, with 13–20 % of pixels changing by more than 4 levels. The diff shows the vertical plate bands sliding behind "solid" rock (`cap/diff-bleed-below.png`).

### 4.4 Asset variety and contrast (`variety.json`, `lab-contrast.json`, `frame-alpha-stats.json`)

**Terrain variety and edge frames**

| Quantity | W01 | W02 |
|---|---|---|
| Interior variants 1–7 vs 0: pixels differing by more than 8 levels | 21–42 % (mean abs diff 4–9) | 23–39 % |
| Hard-rock variants 1–3 vs 0 | **3.2–6.2 %** | 20–36 % |
| Edge frames opaque | **100 %** of pixels, all 16 masks | 100 % |
| Edge-0 vs interior-0 | 0 % differ (same drawing) | 0 % |

Row sawtooth (`cap/seam-results.json`): within each tile row, luma runs from about 74 at the top facet to about 56 at the bottom, then jumps about 10 levels at the next boundary. The period is exactly one tile.

**Material and ore contrast (CIELAB ΔE76)**

| Pair | W01 | W02 |
|---|---|---|
| Soil vs hard rock | **ΔE 3.1** (L\* 40.5 vs 37.5) | ΔE 22.2 |
| Ore fill vs terrain | ΔE 40–65 | **ΔE 9.4–19.2** (ΔL\* 5.7–10.2) |
| Closest ore pair | O1–O3 **5.9** | O1–O2 **4.6**, O3–O4 8.8 |

High-contrast setting (`bleed-results.json` › `highContrastVsNormal`): canvas world region on vs off, mean diff **0.000**, max 0.

### 4.5 Depth (`cap/depth-results.json`, `cap/triptych-w01-depth.png`, `cap/triptych-w02-depth.png`)

| World and row | Mean RGB | Mean luma |
|---|---|---|
| W01 row 4 / 30 / 56 | (58,71,79) / (59,72,79) / (55,68,76) | 69.0 / 69.6 / 65.8 |
| W02 row 6 / 50 / 94 | (58,105,121) / (57,102,118) / (57,104,120) | 96.1 / 93.9 / 94.8 |

Meanwhile cut time scales as `min(5, 1 + row/80)` (`model.ts:479`): ×1.74 at the W01 floor and ×2.24 at the W02 floor. Stone appears with 12 % probability everywhere (`world.ts:59-62, 296-298`).

### 4.6 Backgrounds (PNG analysis; `cap/g05-*`, `cap/g10-*`, `cap/g12-*`)

**PNG seams and silhouettes**

| Layer | Left/right edge alpha mismatch | Silhouette agreement far vs near |
|---|---|---|
| W01 ridge-far / ridge-near | 157 / 157 of 384 rows | **100 %** (same drawing, `create-w01-sources.mjs:786-791`) |
| W02 ridge-far / ridge-near | 118 / 61 rows | 83.8 % |
| Skies (1024×512) | seamless colour, but contain the planet/comet and a dust band (W01 band: y 442 at the left edge, 355 at the right) | — |

**When the sky tiles**

| Situation | Sky band height | Result |
|---|---|---|
| Rig at flight ceiling y = −5.5, 1440×900 | ≈ 780 px | Texture restarts at y = 512 with a second planet or comet (`g10-w01`, `g10-w02`) |
| 2560×1440 spawn | 698 px | Same, plus 2.5 horizontal repeats (`g05-surface-2560x1440`) |
| 1920×1080 spawn | 532 px | Two planets (`g05-surface-1920x1080`) |
| 1440×900 after crossing the wrap seam | — | Two planets (`g12-w01-after-wrap-1440`) |

### 4.7 Tile size, view and rig (`layout.ts:2-5`, `scene.ts:1696`, `variety.json`)

**Tile size and view**

| Viewport | Tile (CSS px) | View (tiles) | Device px per tile |
|---|---|---|---|
| 1280×1024 | 58 | 22.1×17.7 | 58 |
| 1440×900 | 65 | 22.2×13.8 | 65 (130 on a MacBook, rendered at 65) |
| 1920×1080 | 76 (cap) | 25.3×14.2 | 76 |
| 2560×1440 | 76 (cap) | **33.7×18.9** (pinned nominal 22×14) | 76 |
| Phone 393×851 | 48 | 8.2×17.7 | 144 at DPR 3 (rendered at 48 from a 96 px source) |

**Rig on screen and animation**
- At a 65 px tile the rig occupies about 62×53 px (body bbox 92×43 source px of 128; cabin top to tread 78 source px), about 0.95×0.8 tiles.
- Animation frames barely differ:
  - Drill-down frames 1–7 differ from frame 0 in **0–0.48 %** of pixels, and the 8-frame drill loops hold only 4 unique frames (n+4 = n).
  - Body and tread frames differ in 0.3–3.0 %.
  - Thrust has 3 unique frames of 6 (n+3 = n).

### 4.8 Texture memory (`atlas-utilisation.json`)

- **W01 atlas:** 2048×1344, 10.5 MiB decoded. Page utilisation 83.6 %, but trimmed bounding boxes would need only **47.3 %** of the frame area.
- **W02 atlas:** 1024×1472, 5.8 MiB; trimmed would be 68.6 %.
- **Backgrounds:** six at 1.5–2 MiB each.
- **All of it is loaded at boot for both worlds:** 26.3 MiB decoded (`scene.ts:103-183`).

---

## 5. Findings

Ordered by severity, then by player impact.

### GFX-F1 · Critical · In normal play the world is a black void: unexplored and remembered rock render as near-black squares

**Evidence**
- 86–93 % of the screen is near-black while drilling (§4.3: `d04` 89.0 % below luma 40, `d05` 85.8 %, `l02` 87.0 %, `d20` 92.9 % below 50). The fully revealed debug frame `d21` has only 3.0 %.
- Unknown cells are a `fillRect` in `#111c24` plus a soil image at **alpha 0.07** (`scene.ts:1104-1123`). Remembered (known, not visible) cells draw at alpha 0.42 over a navy background (`scene.ts:1138`).
- The visibility radius is 4.5 tiles with wall occlusion (`model.ts:298-347`), so a shaft reveals one tile on each side and everything else stays void (`d04`, `p03`).
- The known/unknown boundary is a hard staircase of squares (`d05`, `g01`). The faint repeating soil texture in the fog shows the tile grid even where nothing is known (`d02` lower half).

**Player impact.** This is the first and lasting impression. The world feels empty and unfinished; there is no sense of being inside a rock mass. Most of every frame carries no information and no mood. This is the main reason the graphics "are not up to par".

### GFX-F2 · Major · The terrain is a one-tile wallpaper: near-identical variants, opaque edge tiles and a striped row pattern

**Evidence**
- **Variants are shifted copies.** Soil variants vary only by `a = (i*13)%24`, `b = (i*7)%18` (`create-w01-sources.mjs:31-61`). Stone varies by `i*3`/`i*5` on one facet (`:93-111`), so stone variants differ from stone-0 in only 3.2–6.2 % of pixels (§4.4).
- **Edge frames hide the variants.** All 16 `soil-edge-N` frames are 100 % opaque full tiles whose substrate is variant 0 (0 % pixel difference). Drawn over the interior at depth 11 (`scene.ts:1176-1187`), they replace the variant on every exposed cell, so every shaft wall is the same drawing repeated (`d04`, `z-d21-rig.png`). W02's ice and frozen-rock edges behave the same (`w02-edges.png`).
- **The rails read as metal pipe.** They are straight notched double lines in grey and dark blue on every exposed side (`create-w01-sources.mjs:72-90`), more machined pipe than broken plate. The W01 brief says "angular broken plates".
- **Every row is a stripe.** Each tile has a light upper facet (`#687680`) and a dark lower facet (`#434f58`). The resulting one-tile sawtooth swings about 18 luma levels per row, with about 10-level jumps at the boundaries (`seam-results.json`). Cracks and bands stop at tile borders (`z-d21-topleft.png`).

**Player impact.** The grid itself becomes the dominant visual pattern. The world reads as wallpaper rather than a geological mass, which works against the "crisp illustrated 2D" direction (`DESIGN_PACK_IMPLEMENTATION.md:12`).

### GFX-F3 · Major · Lighting is a hard, tile-quantized visibility box; the lamp sits behind the rock and there is no headlamp

**Evidence**
- **Opacity stands in for light.** Lighting is per-tile opacity (`scene.ts:1133-1138`): one alpha per tile, so there is no gradient inside a tile.
- **The falloff is a cliff, not a curve.** Measured floor tiles go 94.6 → 92.6 luma within the radius, then 77.7 just outside it (`lighting-steps.json`). In W02 the lit cells form a bright square frame (`g07-w02-ores-lit.png`).
- **The lamp lights only empty air.** It is a 256 px radial canvas texture with peak alpha 0.18 (`scene.ts:238-256`), placed at depth 5, below the tiles at depth 10 (`scene.ts:1077`).
- **The pinned briefs are unmet.** The rig brief has a "fixed headlamp" (manifest `RIG-CABIN`), and W01 lighting says the "warm headlamp is the brightest moving object". No beam, shadow, emissive ore or structure light exists.
- **Darkness never grows.** The background is a constant `#17232b` (W02 `#102b3d`) at all depths (`scene.ts:1030-1031`).

**Player impact.**
- There is no mood, no tension and no "pool of light in the dark" — the strongest visual device in the dig-down genre.
- The rig does not stand out as the hero.
- The tile-stepped edges add to the grid look.

### GFX-F4 · Major · The backgrounds break on common screens and on every climb to the flight ceiling

**Evidence**
- **The sky tiles in both directions.** The sky is a 1024×512 `TileSprite` sized to `(width, min(height, surfaceY))` with only `tilePositionX` set (`scene.ts:1059-1064`).
  - Whenever `surfaceY > 512` the texture repeats vertically. At the flight ceiling (`model.ts:570`, y ≥ −5.5) on the baseline 1440×900 the band is about 780 px: a hard seam at y = 512 and a second planet or comet under the ridges (`cap/g10-w01-flying-ceiling.png`, `cap/g10-w02-flying-ceiling.png`, `ev-sky-tiling.png`). The same happens at spawn on 2560×1440 (`g05-surface-2560x1440.png`).
  - Horizontally, the planet is baked into the 1024 px tile, so two planets show on 1920-wide screens (`g05-surface-1920x1080.png`) and at 1440 after the player crosses the wrap seam (`g12-w01-after-wrap-1440.png`).
  - The W02 comet tail is cut at the tile edge (x = 835 in `g10-w02`).
- **The ridges are not seamless.** Edge alpha mismatches in 157 rows (W01) and 118/61 rows (W02), so a vertical cut appears every 1024×tile/96 px (693 px at 1440). See `z-d02-surface.png` at x ≈ 325 and 480.
- **The two W01 parallax ridges are one drawing.** `ridges(near)` changes only the colour (`create-w01-sources.mjs:786-791`), so near and far silhouettes agree 100 %. Both are floating boulder rows with transparent bottoms.
- **The horizon floats.** Surface-row cells beyond the explored strip are drawn as fog, so the lander, refuge and relay sit on a slab over a black void (`d02`, `e00`–`e03`, `g12`). There is no foreground dressing.
- FTUE-F12 (02-first-session) reports the vertical tiling on the first flight. This finding adds the horizontal duplication, the ridge seams, the identical layers and the horizon.

**Player impact.**
- Visible bugs on every return trip and on the most common desktop resolution.
- They undermine trust in the polish of everything else.
- The surface — the base and progression showcase — looks unfinished.

### GFX-F5 · Major · The canvas ignores devicePixelRatio; on HiDPI screens art and canvas text are upscaled 2–3× and soft

**Evidence**
- **Measured backing stores** (§4.1): the phone backs 393×851 for 1179×2553 device pixels (11 %); a MacBook backs 1440×900 for 2880×1800 (25 %); a 125 % Windows laptop gets a non-integer 1.25× upscale.
- **Cause:** `new Phaser.Game({ width: clientWidth, height: clientHeight, scale: { mode: NONE } })` and the `ResizeObserver` resize (`main.ts:1919-1988`) never use `devicePixelRatio`.
- **Visible softness:** the DPR-3 crop shows a soft rig outline and fuzzy tiles next to crisp HTML HUD text (`ev-phone-dpr3.png`, `z-phone-dpr3-rig.png`, `p03`). In-canvas labels such as "LANDER · 180 m" are visibly blurrier than the HUD (`p03`).
- **Desktop softness too:** `roundPixels: false`, fractional camera offsets and `tile + 0.5` display sizes (`scene.ts:1144`) resample every tile at sub-pixel offsets.
- **The 2× art is wasted.** It is authored at 96 px per 48-px logical tile, yet a phone at DPR 3 renders 48 px tiles and upscales to 144 device px.

**Player impact.**
- On phones and most laptops — a large share of a browser game's audience — "crisp illustrated 2D" becomes blurry.
- Thin outlines and the 13 px ore badges lose definition.
- Text in the world looks broken next to the HUD.

### GFX-F6 · Major · Hard rock is unreadable: ΔE 3.1 from soil, and in W01 an exposed stone face is drawn as soil

**Evidence**
- **Stone looks like soil.** Stone costs 1.85× the cut time (`model.ts:478`), and more energy follows. Its interior differs from soil by ΔE 3.1 (L\* 37.5 vs 40.5, `lab-contrast.json`), barely above a just-noticeable difference.
- **The exposed face uses soil art.** W01 selects `soil-edge-${mask}` for every material (`scene.ts:1176-1182`). The edge frame is opaque, so an exposed stone cell is drawn exactly like soil.
  - Capture: the stone column beside a pocket shows soil art, while the same column below the floor shows stone facets (`cap/g01-w01-stone-exposure.png`, annotated `ev-stone-exposure.png`).
- **Bedrock is hidden the same way.** Its dark overlay (`scene.ts:1162-1170`) shares depth 11 with the opaque edge images and is covered when exposed.
  - Capture at the W01 floor: the undrillable bedrock row directly under the rig is drawn as light, ordinary soil, while the unexposed bedrock rows below are dark (`cap/g13-w01-exposed-bedrock.png`, `cap/z-bedrock.png`).
  - The player learns it is bedrock only from the "bedrock ends here" message after trying to drill.

**Player impact.** The cells next to the rig are exactly where the player chooses which way to drill. Harder rock is invisible there, so energy cost cannot be planned and the material system cannot be learned. This hurts the progression and economy loop the owner is unhappy with.

### GFX-F7 · Major · Nothing changes with depth: no strata, colour or atmosphere progression

**Evidence**
- **No band progression:** mean terrain colour is identical at rows 4, 30 and 56 in W01 (luma 69.0 / 69.6 / 65.8) and at rows 6, 50 and 94 in W02 (96.1 / 93.9 / 94.8) (§4.5, `triptych-w01-depth.png`, `triptych-w02-depth.png`).
- **Constant inputs:** the renderer has one background colour (`scene.ts:1030`) and one tile set per world (`scene.ts:424-439`). Generation places stone uniformly at 12 % (`world.ts:59-62`).
- **Difficulty rises invisibly:** cut time rises 74 % (W01) to 124 % (W02) with depth (`model.ts:479`) with no visual cue.
- **The pinned W03 brief already names "horizontal strata"** (manifest W03), but W01 and W02 have none.

**Player impact.**
- Depth is the progression axis of the genre, and here it gives no visual reward, no milestone and no warning of harder rock.
- It ties directly into the owner's progression complaint: going deeper looks the same as staying shallow.
- See PROG-F2, "depth does not pay"; the two should be solved together.

### GFX-F8 · Major · Excavated space has no back wall; underground parallax plates become stripes and bleed through rock

**Evidence**
- **Dug cells are empty background.** They draw nothing: the player sees the background fill `#17232b` plus three planes of polygons at alpha 0.45 (`scene.ts:1030-1058`).
- **The plates collapse into stripes underground.** Their y is tied to `surfaceY`, so in deep scenes they become about 3,000 px tall slanted strips that show as vertical bands in caves and tunnels (`z-d21-topleft.png`, `g02a-deep-x8.png`). This accounts for 18.7 screens of submitted geometry against 6.1 on screen (§4.2).
- **Tunnels look like fog.** The colour (`#17232b`, L\* ≈ 13) is close to the fog `#111c24`, so dug space and unknown space look alike. There is no ambient occlusion at rock faces and no texture.
- **The plates show through rock.** Tiles are translucent (alpha 0.42–0.97), so the plates slide behind solid ground: 13–20 % of pixels change after a 4-tile camera move (`diff-bleed-below.png`).

**Player impact.** Tunnels do not read as carved spaces in rock. The player's own excavation — their mark on the world — is invisible as an achievement. Moving bands inside "solid" rock look like glitches.

### GFX-F9 · Moderate · Ore readability: W02 ores blend into the ice, close ore pairs, and badges that depend on light and draw over the rig

**Evidence**
- **W02 ores blend into the ice.** Ore fills are ΔE 9.4–19.2 from ice (ΔL\* 5.7–10.2), and pairs are as close as O1–O2 ΔE 4.6 and O3–O4 8.8 (`lab-contrast.json`). In grayscale only the outlines and badges remain (`ev-w02-ores-gray.png`).
- **W01 has a close pair.** O1 and O3 sit at ΔE 5.9 (`ev-w01-ores-gray.png`). O1 is about 60 % of all deposits in both worlds (fixture counts), so low-value grey rocks cover the map (`d21`).
- **The pinned palettes cause this.** Every mineral is assigned the world's five-colour palette (manifest `W01-O1` … `W02-O4`), and W02's palette is entirely cool apart from one amber.
- **Badges have three problems.** They are 13 px discs at the bottom-right of the cell (`scene.ts:1230-1238`, `mineral-legend.ts:37-65`). They:
  - draw only when the cell is lit, so remembered ores lose their symbol;
  - draw on the `screen` Graphics at depth 40, **over the rig** at depths 18–23, while drilling into or past an ore cell (`z-phone-dpr3-rig.png`, `z-l02-badge-over-rig.png`);
  - are softened further by the DPR issue.

**Player impact.** In W02 the player cannot spot valuable ore at a glance, which slows the scan → plan → dig loop. The badge over the rig looks like a rendering bug.

### GFX-F10 · Moderate · The "High-contrast edges" setting does nothing in the world; "Larger text" ignores canvas labels

**Evidence**
- With `highContrast: true` the canvas world region is pixel-identical to normal (mean and max diff 0; `cap/g08-deep-x8-high-contrast.png` vs `g02a`).
- `scene.ts` has no high-contrast or large-text input (`CampaignSceneBindings`, `scene.ts:14-26`). The CSS rules affect only the HTML HUD (`style.css:1254-1265`).
- The pack requires "high-contrast outlines" (`DESIGN_PACK_IMPLEMENTATION.md:132`) and "grayscale item/hazard distinction".

**Player impact.** Low-vision and colour-blind players who turn the option on get nothing in the playfield, which compounds F6 and F9. A setting that does nothing erodes trust in the other settings.

### GFX-F11 · Moderate · An immediate-mode renderer with high overdraw and per-frame text uploads; too heavy for mid-range phones and blocks richer visuals

**Evidence**
- **Everything is rebuilt each frame.** Every frame clears five Graphics objects and re-applies texture, position, size, depth, alpha and flip to 430–860 pooled images (`scene.ts:1019-1028, 1094-1241, 413-462`).
  - `image()` runs two regex tests per call, plus two string replaces in W02 (`scene.ts:424-439`).
  - `setDepth` queues a full display-list sort each frame (Phaser `Depth.js:52-60`).
- **Text is re-uploaded.** Six to nine label textures (67–109 KB) are uploaded per frame because of style setters (§4.2).
- **The stencil mask is rebuilt from scratch.** The wreck `GeometryMask` is regenerated with one rect per known cell every frame (`scene.ts:1125-1131`).
- **Layout is read per frame.** `getComputedStyle` and `getBoundingClientRect` run per label per frame (`scene.ts:817-840, 1952-1957`), and `matchMedia` per frame (`:973`).
- **Overdraw and cost.**
  - On-screen overdraw is 3.9–6.1 screens, mostly alpha-blended.
  - With 4× CPU throttling, phone JS is 17.7 ms median (p95 35.9) and the explored scene 30.7 ms (p95 42.4), above the 16.7 ms budget before any GPU work.
- **Texture scoping is ignored.** Both worlds' atlases and backgrounds load at boot (26.3 MiB decoded), against the asset contract that world pages are "scoped to the destination" (`DESIGN_PACK_IMPLEMENTATION.md:124`). The pack also asks to "render visible terrain chunks only" (`:125`).

**Player impact.**
- Today desktop is fine, but mid-range phones are likely to drop frames.
- DPR-correct rendering (F5) multiplies fill by 4–9×.
- Lighting and back walls (F1, F3, F8) add layers.
- Without a restructure, the visual fixes would make mobile performance worse.

### GFX-F12 · Moderate · Rig presentation: near-static animation frames and damage states that are hard to read

**Evidence**
- **The animation frames barely change.**
  - The 8-frame drill loops (down and right) contain only 4 unique frames, each repeated: frame n+4 equals frame n. Each differs from frame 0 by ≤ 0.48 % of pixels.
  - Thrust has 3 unique frames out of 6.
  - Body and tread frames are all unique but differ by only 0.3–3 % (`variety.json`; pairwise identity check).
- **The rig is small.** It is about 62×53 px at a 65 px tile.
- **There is no light of its own.** No headlamp beam (F3), no thruster light and no rim separation from the grey terrain.
- **Damage is barely visible.** Stage 3 (15 % hull) adds only thin dark scratches that are hard to see at actual size (`cap/z-damage3.png`, `scene.ts:1868-1887`).
- The pack asks for "idle/drive/drill/thrust/dock animation timing" and functional damage overlays (`DESIGN_PACK_IMPLEMENTATION.md:122`).
- Secondary motion is covered by FEEL-F11/FEEL-P8.

**Player impact.**
- The hero vehicle feels inert.
- Drilling, 69–83 % of a trip (FEEL measurements), shows almost no animated tool.
- A critically damaged rig looks nearly healthy.

### GFX-F13 · Minor · Mission wrecks and hazards are runtime line-art that does not match the illustrated sprites

**Evidence**
- About 270 lines of hand-placed `Graphics` polygons and lines draw the wrecks (`scene.ts:504-778`), with 1.4–4 px strokes and flat fills, at depth 14 *over* known rock.
- Cold pockets and vents are similar ellipses, wisps and triangles (`scene.ts:1489-1591`).
- Capture: `cap/g11-w01-wreck-beacon.png`. The wreck reads as a schematic laid over the rock rather than a buried hull, and its line weight differs from the atlas sprites (2 px outlines at 1×).

**Player impact.** Mission sites, the story beats of each world, look like placeholder diagrams. The art is also hard to iterate without code changes.

### GFX-F14 · Minor · In-canvas typography is fixed 12 px system-ui with a blurred stroke, in a different face from the HUD

**Evidence**
- Canvas labels: `fontFamily: "system-ui, sans-serif"`, 12 px, stroke 3 and shadow blur 4 (`scene.ts:473-488`).
- The HUD uses Arial first (`style.css:2`).
- Labels do not scale with tile size (48–76 px) or the Larger-text preference (no `largeText` in `scene.ts`).
- They are upscaled on HiDPI (F5). Edge labels overlap the title (FTUE-F8, `p01`, `d01`).

**Player impact.** World labels look like a different, lower-quality UI layer and are hard to read on large monitors and phones.

### GFX-F15 · Minor · The title screen has no art direction of its own

**Evidence**
- In `d01` the title is HTML over the live spawn view.
- About 45 % of the frame below the horizon is fog, and the HUD numbers remain visible (dimmed) behind the title.
- The planet and ridges show the seam artefacts of F4, and the lander is off-screen to the left.
- There is no key art, no motion and no composed framing.

**Player impact.** The first screen sets expectations, and currently it says "prototype".

---

## 6. Proposals

Ordered by priority: impact per effort, then dependencies. Effort is for one experienced developer: S ≤ 1 day, M 2–4 days, L 1–2 weeks, XL > 2 weeks.

### GFX-P1 · Fix the backdrop and the horizon · M (about 2–3 days) · Impact high · Addresses F4 (and F1 at the surface)

**Change**
- Never tile a painted sky.
- Make the ridges seamless and distinct, with a solid base.
- Draw a continuous ground crust across the whole surface row.

**Implementation**
- **Sky** (`scene.ts:226-229, 1059-1064`). Replace the single `TileSprite` with three objects:
  1. A gradient that always fills the sky band from y = 0 to `surfaceY`: a 1×256 canvas texture made like `campaign-lamp` (`scene.ts:238-255`), stretched.
  2. A *seamless* star `TileSprite` (new 512×512 `w01-stars.png` with wrap-safe star positions). Set `tilePositionX = cx·0.08` and `tilePositionY = −surfaceY·0.05`.
  3. A single `Image` for the planet or comet (new atlas frame `sky-body`) at a fixed world longitude, parallax k = 0.05. Its screen x is `(L·tile − cx)·k + width·0.6`, wrapped modulo `world.width·tile·k`, so at most one instance is ever visible.
- **Generators.** Remove the planet and dust band from `sky()` (`create-w01-sources.mjs:743-785`).
- **Ridges** (`ridges()`, `create-w01-sources.mjs:786+`, and the W02 equivalent in `assets/campaign/w02/create-sources.mjs`):
  - Generate shapes in [0, 1024) and draw any shape that crosses an edge a second time at x ± 1024, so the PNG wraps.
  - Use different seeds, sizes and values for far (lower, wider, lower contrast) and near (taller, darker, more facets).
  - Add a solid ground band in the bottom 25 % so ridges never float. Anchor that band to overlap `surfaceY` by at least 8 px (`scene.ts:1066-1075`).
- **Horizon crust** (`scene.ts:1103-1124`). When `row === 0 && !known`, draw a generic `crust-N` frame (top rim, no ore) instead of the fog square. This is safe: W01 never carves rows < 8 and W02 never carves rows < 10 (`world.ts:65-73, 300-309`), and digging always reveals.
- **Checks.** Add seam tests to `scripts/check-campaign-assets.mjs` and `check-frontier-assets.mjs`: zero edge-column alpha mismatches, and far/near silhouette agreement below 40 %.

**Acceptance**
1. At 1280×720, 1440×900, 1920×1080, 2560×1440 and 3440×1440, both at spawn and at the flight ceiling, in W01 and W02:
   - no full-width sky row has a luminance step greater than 6 levels;
   - exactly one planet or comet is visible;
   - ridge alpha columns match across every texture period.
2. At 1440×900 after crossing the wrap seam (`gfx-wrap.mjs`), one planet is visible.
3. At spawn, row 0 is continuous across the screen and no ore sprite appears in unknown crust cells.
4. `check-campaign-assets.mjs` fails on a non-seamless background.

**Dependencies:** none. Coordinate with FTUE-F12.
**Deviation:** none. "Three subdued parallax planes" (`DESIGN_PACK_IMPLEMENTATION.md:126`) is kept; the star plane is the third.

### GFX-P2 · Readability quick wins: material edges, distinct stone, working high contrast, badge z-order, text caching · M (2 days) · Impact high · Addresses F6, F10, F9 (badge), F2 (walls), F11 (text)

**Change and implementation**
1. **Transparent edge overlays.**
   - Export the existing `exposed-edges` layer alone as `soil-rim-N` and `stone-rim-N` (`create-w01-sources.mjs:71-91`), on a transparent background, with a darker, angular rim for stone.
   - Do the same for W02 `ice-rim-N` and `frozen-rock-rim-N`.
   - In `scene.ts:1176-1187`, choose the rim by material (`type === 2 ? "stone" : "soil"`) and draw it over the interior variant, which stays visible.
   - Bedrock gets its own pattern-coded rim (diagonal hatch, not colour alone).
2. **Distinct stone until P6.** Regenerate `stone(i)` (`:93-112`):
   - a body about 10 L\* darker and cooler (for example `#3a4652`) with lighter facet rims;
   - four genuinely different facet layouts (rotate and mirror).
   - Use art changes, not `setTint`, so the Canvas renderer matches.
3. **Badge z-order.** Draw ore markers into a new `this.badges` Graphics at depth 19 (below the rig layers at 20–23) instead of `this.screen` (`scene.ts:1231`).
4. **High contrast in the canvas.**
   - Add `highContrast?: () => boolean` to `CampaignSceneBindings` (`scene.ts:14-26`) and pass `() => preferences.highContrast` from `main.ts:1925-1973`.
   - When on:
     - draw a 2 px `#E8F0F5` line on every exposed solid face (same mask bits), a dashed outline on the known/unknown boundary and a light ring around every known ore;
     - draw badges at 1.4× size, also in remembered cells;
     - hatch stone and bedrock.
5. **Label caching.** In `label()` (`scene.ts:464-501`), store the last colour, align, origin and wrap width per pooled `Text`, and call setters only on change.

**Acceptance**
1. In the `g01` fixture, exposed stone vs exposed soil cells have mean ΔE ≥ 12 and grayscale ΔL ≥ 8. A 10-cell shaft wall shows ≥ 4 distinct interior variants.
2. In a capture of the rig drilling into an ore cell, no badge pixel falls inside the rig's bounds.
3. With high contrast on, every air/solid boundary differs from off, and boundary lines reach ≥ 3:1 contrast against both rock and air.
4. Instrumented run (`gfx-perf.mjs`): steady-state `texImage2D` is 0 per frame while label text is unchanged (now 6–9).
5. Atlas frame lists and checker counts are updated for the new rim frames (for example +16 stone rims and +16 bedrock rims).

**Dependencies:** none. W02 rims need the W02 build (Inkscape today; see P13).
**Deviation:** none. This implements the pinned "secondary-material variants" and "high-contrast outlines" (`DESIGN_PACK_IMPLEMENTATION.md:123, 132`).

### GFX-P3 · Crisp HiDPI rendering and resolution-aware art · M (3–4 days) · Impact high · Addresses F5, F14 (part)

**Change**
- Render at device resolution with a cap.
- Snap the camera to device pixels.
- Ship @3x art pages chosen by device pixels per tile.
- Restore the nominal 22-column view on large monitors.

**Implementation**
- **Game size** (`main.ts:1919-1988`):
  - `const dpr = Math.min(devicePixelRatio || 1, coarse ? 2 : 3)`.
  - Create the game at `round(clientWidth·dpr) × round(clientHeight·dpr)`, keep the canvas CSS size at client size, and apply the same in the `ResizeObserver`.
  - Watch `matchMedia("(resolution: …)")` changes so a window dragged between monitors updates.
- **Scene** (`scene.ts`):
  - In `create()`, call `this.cameras.main.setZoom(dpr).setOrigin(0, 0)`. All existing screen-space math keeps working in CSS pixels.
  - Replace raw `this.scale.width` and `this.scale.height` with `viewW = this.scale.width / dpr` and `viewH` (`scene.ts:263-264, 498, 790-791, 966-967, 1999-2000`). The pointer mapping in `point()` divides by dpr.
  - Give every Text `resolution: dpr` (`scene.ts:107-119, 473-488`).
- **Crispness:**
  - Snap scroll with `cx = Math.round(this.cameraX·dpr)/dpr` (same for `cy`).
  - Set `render: { antialias: true, roundPixels: true }`.
  - Once terrain is opaque (P5), draw tiles at exact integer sizes, with no `+0.5` overlap.
- **Art pages** (P13):
  - Export @2x (96 px tiles, today) and @3x (144 px).
  - Pack **trimmed** frames (Phaser JSON-hash `trimmed`, `spriteSourceSize`, `sourceSize` restore the source canvas, so origins and anchors are preserved). W01's trimmed frame area is 47.3 % of untrimmed, so a 3× W01 page fits in 2048² (about 2.45 MP of 4.2 MP).
  - Load @3x when `tile·dpr > 110`.
- **Large monitors** (`layout.ts:2-5`): when @3x is loaded, raise the tile cap from 76 to `round(width/22)`, up to 116. This restores the pinned 22×14 view at 2560×1440 (33.7×18.9 today). Coordinate the final zoom with FEEL-P4.
- **Dynamic resolution:** if the p95 frame time over 3 s exceeds 18 ms, step dpr down (2 → 1.5 → 1) and expose `data-render-scale`.

**Acceptance**
1. `canvas.width === round(clientWidth·min(dpr, cap))` at DPR 1, 1.25, 2 and 3 (`gfx-dpr2.mjs`).
2. On a DPR-3 phone capture, the rig outline's 10–90 % edge rise is ≤ 2 device px, and canvas labels are as sharp as HUD text (same edge width ± 1 px).
3. A slow 0.2 tile/s pan shows no sub-pixel shimmer: frame-to-frame differences on static rock are 0 after offset correction.
4. On a mid-range Android phone (Pixel 6a or Galaxy A54 class), p95 frame time is ≤ 16.7 ms while drilling at cap 2. If not met, dynamic resolution engages.
5. Resident decoded textures for the active world are ≤ 40 MiB on coarse-pointer devices.

**Dependencies:** GFX-P13 for @3x pages and trimming; the DPR and snapping part can ship first. GFX-P4 is advised before the phone cap goes to 2 (fill rises 4×).
**Deviation:**
- Lifts the technical asset rule "frames are untrimmed" (`CAMPAIGN_ASSETS.md:36`). Anchors are preserved by trim metadata. This is an owner decision because the rule is documented.
- Restoring 22×14 on large monitors *returns* the build to a pinned value (`DESIGN_PACK_IMPLEMENTATION.md:120`).

### GFX-P4 · A retained world renderer with texture scoping and performance budgets (enabler) · L (1–1.5 weeks) · Impact high · Addresses F11; enables P5–P7

**Change**
- Stop rebuilding the world each frame: terrain becomes Phaser `TilemapLayer`s updated only when cells change.
- Remove the per-frame masks and DOM reads.
- Load textures per world.
- Make the budgets testable.

**Implementation**
- **Tilemap layers.** Build one blank tilemap per world, `this.make.tilemap({ tileWidth: 96, tileHeight: 96, width: world.width + PAD, height: world.rows + 4 })`, with layers:
  1. `back`: back wall for dug or air cells
  2. `ground`: interiors
  3. `deco`: decals
  4. `rim`: edge overlays
  5. `unknown`: generic unexplored rock

  Details:
  - Tilesets are grid PNGs with 2 px extruded borders from P13.
  - Each frame only call `layer.setScale(tile/96).setPosition(-cx, -cy)`.
  - **Wrap:** the extra PAD columns mirror columns [0, PAD); when the camera crosses a period, offset the layers by ±`world.width·tile`, as the dock loop does (`scene.ts:1245-1300`).
- **Dirty cells.** Add `consumeDirtyCells()` to `Campaign`. Mark a cell dirty where a tile is cut or collapses, and on first discovery (`model.ts:345`). The scene recomputes rim and AO indices for each dirty cell and its 8 neighbours and calls `putTileAt`. The existing `image()` pool stays for ores, structures, the rig and POIs (tens of objects, not hundreds).
- **Wrecks without a stencil.** Order the layers ground → wrecks → `unknown`: opaque unknown rock hides buried wreck parts. The per-frame `GeometryMask` (`scene.ts:223-225, 1125-1131`) is removed.
- **Underground background.** Replace the plates (`scene.ts:1032-1058`) with the `back` layer; draw sky and ridges only when `surfaceY > 0`.
- **DOM reads.** Cache `matchMedia` (listen for `change`). Read HUD overlay rectangles once per HUD sync (`main.ts` `syncHUD`) into a shared object instead of per label per frame (`scene.ts:817-840, 1952-1957`).
- **Texture scoping.**
  - Split atlases into `shared-rig` (rig, modules, tools and icons from all worlds, about 1 page) and per-world `wNN-world` pages (terrain tilesets, structures, backgrounds).
  - Load the active world in `preload`. On travel, load the destination's pages during the launch sequence (`main.ts` `launchUntil`) and destroy the previous world's textures after arrival.
  - `image()` then needs no world regex (`scene.ts:424-439`): frames are looked up in a prebuilt map.
- **Budget script.** Commit `scripts/render-budget.mjs`, based on `work/graphics/gfx-perf.mjs`, asserting the section 7.5 budgets in CI with SwiftShader and 4× CPU throttling.

**Acceptance**
1. Before any art change, visual parity with the current renderer: SSIM ≥ 0.98 on the `g01`, `g02a`, `g04` and `g07` fixtures.
2. The `render-budget.mjs` budgets pass:
   - phone viewport at 4× throttle: rAF JS p95 ≤ 12 ms (now 35.9);
   - explored scene: ≤ 12 ms (now 42.4);
   - draw calls ≤ 12;
   - steady-state uploads 0;
   - on-screen overdraw ≤ 3.0 screens (now 3.9–6.1).
3. After boot in W01, resident decoded textures are ≤ 20 MiB (now 26.3 with both worlds), and W02 pages load only on travel.
4. All existing unit and browser smoke tests pass (`npm test`, `scripts/campaign-smoke.mjs`, `frontier-smoke.mjs`, `poi-smoke.mjs`).

**Dependencies:** none (P2's label caching can land first).
**Deviation:** none. This implements "render visible terrain chunks only" and "pages scoped to the destination" (`DESIGN_PACK_IMPLEMENTATION.md:124-125`).

### GFX-P5 · Light, darkness and soft fog: replace per-tile alpha with a light map · L (about 1 week) · Impact high · Addresses F1, F3, F8 (bleed)

**Change**
- Draw all known terrain **opaque**, in true colours.
- Draw unknown cells as dim **unexplored rock**, never void.
- Express light and darkness in one low-resolution light map, with:
  - a warm headlamp cone;
  - ambient light that falls with depth;
  - a smooth falloff and soft fog edges;
  - emissive ores and structure lights.
- Discovery and visibility rules stay unchanged; this is presentation only.

**Implementation**
- **Opaque terrain.** Remove the alpha arguments (`scene.ts:1138, 1144, 1186, 1200`). The `unknown` layer (P4) uses one generic rock texture for every unknown cell; air and ore never change its look.
- **Fog texture.**
  - Keep a `fogRT` DynamicTexture of `world.width × world.rows` texels (40×60 or 48×100), with 1 = unknown, 0.45 = remembered and 0 = visible.
  - Update texels only for dirty cells, plus the visible set each tick.
  - Draw it scaled to `tile` with LINEAR filtering, tinted `#05090d` at max alpha 0.7 (unknown), so cells blend over about one tile with rounded corners.
- **Light map.**
  - Keep a `lightRT` RenderTexture at ¼ of view size, drawn at depth 30 with scale 4, above terrain and the rig body but below in-world markers and labels.
  - Each frame:
    - `clear()` and `fill(ambientColor, 1 − ambient(depthBand))`;
    - `erase()` a smoothstep radial brush (radius 4.5 tiles, matching the lamp) at the rig;
    - `erase()` a cone brush (length 3.5 tiles, 50°) rotated to the drill or facing direction;
    - `erase()` small glint brushes for known O3/O4 ores and structure windows.
  - Brushes are canvas textures generated in `create()`, as `campaign-lamp` is today.
  - `erase` and destination-out blending work in WebGL and Canvas alike.
- **Warm accents** (WebGL): add an additive `pointlight` (Phaser PointLight pipeline) for the headlamp tint and ore glints. Canvas uses a normal-blend translucent sprite.
- **Ambient by depth band** (spec in §7.2): W01 0.85 → 0.28, W02 0.9 → 0.3. The headlamp stays constant, so it becomes the brightest moving thing (pinned W01 lighting brief).
- **Remove the old lamp** (`scene.ts:238-256, 1077`) and the plates (P4).

**Acceptance**
1. In fixtures equivalent to `d04` and `d05`, pixels with luma < 40 are ≤ 45 % (now 86–89 %).
2. Mean colour of unknown cells varies by < 2 levels across cells: no cave or ore silhouettes leak. An automated check renders a fixture with a hidden cave and compares the unknown-cell colour histogram with a solid-rock fixture.
3. No luma step greater than 6 levels at the visibility boundary (now 15); the falloff is monotonic over ≥ 1 tile.
4. Bleed-through test (`gfx-capture.mjs bleed`): mean diff ≤ 1 level on remembered rock (now 1.8–2.4).
5. In W01 underground scenes, the 99th-percentile luma pixels belong to the headlamp or rig.
6. With `type: Phaser.CANVAS` forced, the darkness renders identically (within 3 levels).
7. Cost: at most +1 draw call, +0.5 screen of overdraw and +1 ms JS at 4× throttle.

**Dependencies:** GFX-P4, which supplies the opaque layers. A prototype on the current renderer is possible: set alpha to 1 and add the light map.
**Deviation:** none to rules ("wall-occluded discovery" is unchanged). The look of undiscovered cells changes from near-black to dim rock, which is owner decision D1. The headlamp *implements* the pinned rig and W01 lighting briefs.

### GFX-P6 · Terrain, back-wall and depth-band art overhaul · XL (about 3–4 weeks for W01 and W02) · Impact high · Addresses F2, F7, F8, F6 (fully)

**Change**
- Replace per-cell drawings with world-space macro textures.
- Add rounded autotile rims with rim light and contact shadow.
- Give dug and cave cells a back wall with ambient occlusion.
- Add four depth bands per world with dithered transitions and decals.

**Implementation**
- **Macro textures** (per material per band):
  - Author a seamless 8×8-tile texture (768×768 px at @2x, 1152 at @3x) in the SVG generator, using wrap-safe geometry and long broken plates (W01) or long ice facets and trapped bubbles (W02), matching the pinned briefs.
  - Slice it into 64 tileset frames. Cell (x, y) uses frame `(x mod 8, y mod 8)`, so the repetition period becomes 8 tiles and bands continue across cell borders.
- **Rims** (dual-grid corner tiles):
  - 16 corner-configuration overlays × 2 variants per material, drawn on a half-tile offset, give rounded outer and inner corners without 47 blob tiles.
  - Upward faces get a light lip (W01 dust) or frost rim (W02). Downward faces get a 6 px contact shadow.
  - W02 keeps "crisp dark outlines at ice boundaries" (pinned).
  - Corner radius ≤ 10 % of a tile, so collision edges stay readable.
- **Back wall:**
  - A darker, desaturated band texture for air and dug cells.
  - Plus ambient-occlusion overlays: 4 edge plus 4 corner gradients, 10–14 px, composited from the 8-neighbour mask into the `back`/`deco` layers on change.
  - Optional drill-scrape marks need a presentation-only `dug` bitset, because the model does not distinguish natural from dug air.
- **Depth bands:** `depthBands[]` per world in `config.ts` and `frontier.ts` (row ranges, tileset, back-wall colour, ambient, decal set, grade). Transitions use a 2-row hash-dither so there is no straight line.
- **Decals:** 5–8 % of non-ore cells, chosen by hash (W01: salvage plates, cables, fossilised plating; W02: bubbles, frozen streaks).
- **Hard rock and bedrock:** hard rock is −10 L\*, cooler, with a different facet pattern. Bedrock is a pattern-coded dark band.
- **Generation (optional):** stone probability rising with depth, or veins, changes play. Coordinate with PROG-P1; rendering bands need no simulation change.

**Acceptance**
1. Depth triptychs (`gfx-capture.mjs depth`): mean terrain colour differs between adjacent bands by ΔE ≥ 10, and back-wall L\* falls monotonically by ≥ 4 per band.
2. Row sawtooth (`seam-results.json` method): tile-phase luma profile amplitude ≤ 4 levels (now about 18), and no visible 1-tile period.
3. Grayscale: soil vs hard rock ΔL\* ≥ 8; terrain vs back wall ΔL\* ≥ 15.
4. In the `g01` fixture, exposed and interior cells share interior art; rims are overlays.
5. Owner design review on surface, 300 m shaft and deep cave, at 1440×900, 393×851 and 844×390.
6. Budgets from §7.5 still pass.

**Dependencies:** GFX-P4, GFX-P5, GFX-P13. Pair with PROG-P1 if depth-weighted geology is adopted.
**Deviation:** within-world depth bands and palette variants extend the pinned five-colour world palette (owner decision D2). Decals and back walls are presentation only.

### GFX-P7 · Ore and pickup readability redesign · M (3–4 days) · Impact high · Addresses F9

**Change**
- Colour families by tier that hold across worlds: common = dull and dark, mid = saturated, rare = bright cool with a glint, top = warm gold or amber with glow and twinkle.
- Value contrast against the world's terrain.
- Shape badges integrated into the sprites.

**Implementation**
- **W02 recolours** (`assets/campaign/w02/create-sources.mjs`):

  | Ore | New colour | Note |
  |---|---|---|
  | O1 Frost iron | slate `#4A5560` with rust chips `#8C5A3C` | — |
  | O2 Blue nickel | cobalt `#2F4FA8` | darker than the ice |
  | O3 Cryosilicate | mint `#49D8C6` with glint | — |
  | O4 Helion ice | amber `#F7C673` core in the crown | pinned accent |

- **W01:** separate O1 (darker steel `#7E8A92` with chips) from O3 (bright `#F2FBFF` with blue-white glint).
- **Glints:** two-frame sparkle sprites for O3 and O4, at random phases every 2–4 s, never on unknown cells. Reduced motion shows a static highlight.
- **Badges:** bake the shape glyph into the `ore-*` and `package-*` frames at 0.28 tile with a light ring, so it is visible in remembered cells too. The runtime `drawOreMarker` is kept only for high contrast (P2), drawn below the rig.
- **Exposed packages:** a soft outline pulse ring, in the existing W02 volatile ring style.

**Acceptance**
1. `lab.py`: ore fill vs terrain ΔE ≥ 30 and ΔL\* ≥ 15 (or ≤ −15 for dark ores) in both worlds; within-world pairwise ΔE ≥ 20.
2. In the grayscale `g07` captures, all four ores are distinguishable by value step plus silhouette.
3. Playtest: 5 new players name the ore type in ≥ 90 % of 20 trials on desktop and portrait.
4. No badge is drawn over the rig.

**Dependencies:** none for W01; W02 needs its build (P13).
**Deviation:** using hues outside the world's five-colour palette (rust, cobalt) deviates from the per-mineral palettes pinned in the manifest (owner decision D3). Baking badges in changes the current always-overlay accessibility marker (owner decision D4).

### GFX-P8 · Rig presentation and animation pass · M (3–4 days) · Impact medium · Addresses F12

**Change**
- A headlamp beam sprite (with P5), a cabin glow and a thruster light.
- Readable animation: auger frames with a twisting highlight sweep and 6 distinct thrust flames.
- Damage states readable at 65 px.
- A 1 px warm rim light on the rig's upper outline and a contact shadow scaled by ground distance (extends `scene.ts:1702-1705`).

**Implementation**
- **Generator:** rig drawing functions in `create-w01-sources.mjs`. For the drill: 4 distinct twist frames repeated, with a highlight band moving 25 % per frame. For treads: a 2 px plate offset per frame plus wheel spokes.
- **Damage:**
  - Stage 1: scuffs.
  - Stage 2: dented panels plus spark puffs every 1.5 s (FEEL-P3 emitter).
  - Stage 3: smoke trail plus a flickering headlamp in the light map.
  - Overlays stay functional, as pinned.
- **Pack timings:** apply the pack's idle/drive/drill/thrust/dock timings.

**Acceptance**
1. Each drill frame differs from the previous by ≥ 3 % of pixels inside the drill bbox (now 0–0.48 %); no two thrust frames are identical.
2. Blind test: players classify healthy, damaged or critical from 1440×900 screenshots with ≥ 90 % accuracy.
3. The rig is the most saturated object on screen (p95 chroma in the rig bbox exceeds every other region).

**Dependencies:** GFX-P5 (headlamp), FEEL-P3 (particles), FEEL-P8 (secondary motion).
**Deviation:** none.

### GFX-P9 · Atmosphere and post-processing with fallbacks · M (2–3 days) · Impact medium · Addresses F1, F7 (mood)

**Change**
- A subtle vignette and a per-band colour grade (saturation −10 % to −30 % with depth, cool shift).
- Bloom only on the emissive light map or glint layer (desktop WebGL).
- Ambient motes in the headlamp cone, within the particle budget.

**Implementation**
- **WebGL:** `this.cameras.main.postFX.addVignette(0.5, 0.5, 0.85, 0.3)` and `addColorMatrix()`, updated on band change. Bloom on a dedicated emissive layer through `preFX.addBloom` (Phaser 3.90 FX in `src/fx`).
- **Canvas:** a pre-rendered vignette PNG overlay and no grade.
- **Off switches:** everything is off with high contrast (no vignette) and in a "low power" mode that engages automatically when P3's dynamic resolution reaches 1.
- **Dust motes:** at most 20 particles per cone, counting toward FEEL-P3's 150 / 75 budget.

**Acceptance**
1. FX on vs off costs ≤ 1.5 ms GPU at 1080p on a mid-range GPU (manual) and adds ≤ 2 draw calls.
2. The Canvas renderer shows the vignette overlay with no errors.
3. In-canvas labels and markers are drawn after the grade (contrast unchanged).

**Dependencies:** GFX-P5.
**Deviation:** a constant global vignette and grade may conflict with "restrained effects … one local screen effect" (`DESIGN_PACK_IMPLEMENTATION.md:126`). Owner decision D5.

### GFX-P10 · Surface dressing, base staging and title presentation · M (3–4 days) · Impact medium · Addresses F4 (rest), F15

**Change**
- **Surface dressing:** foreground rocks, wreck fragments and antenna lights at hash positions along the surface (never on the pad), plus a dust skirt where the ridges meet the ground.
- **Base:** window and pad lights, and a far-visible beacon light at the lander that also helps the return trip.
- **Title:** while the welcome overlay is open, the camera frames the lander and planet. Use FEEL-P4's surface zoom of 0.88, slow parallax drift and darkness off; optionally add a key-art illustration layer. Hide the canvas-side world labels while the title is up, and coordinate hiding the HUD with the HUD audit.

**Implementation**
- New atlas frames for dressing, drawn in the `image()` pool at depth 16 within ±(width/2 + 2 tiles).
- The welcome framing extends the existing dock framing branch (`scene.ts:988-999`) with `interfaceMode === "welcome"`.

**Acceptance**
1. At spawn on 1440×900 and 393×851: a continuous horizon, ≥ 3 distinct dressing silhouettes and the lander in frame.
2. The title capture shows no HUD numerals and no overlapping world label.

**Dependencies:** GFX-P1, FEEL-P4.
**Deviation:** none.

### GFX-P11 · Mission wrecks and hazards as illustrated, embedded art · M (3 days) · Impact low · Addresses F13

**Change**
- Move the wreck kinds (beacon, valve, antenna, core, sample, cryo, catalyst) and hazards (cold pocket, vent) from `Graphics` code (`scene.ts:504-778, 1489-1591`) into SVG sources and atlas frames, with source and recovered states.
- Draw wrecks *between* known ground and the unknown-rock layer (P4), so buried parts look embedded, with an ambient-occlusion skirt.
- Cold mist becomes a soft animated sprite and vents get 4-frame animation.

**Acceptance**
1. No runtime line-art remains for wrecks and hazards: `wreck()` and the hazard line code are removed.
2. Outline weight matches the atlas (2 px at 1×).
3. `poi-smoke.mjs` passes unchanged.

**Dependencies:** GFX-P4.
**Deviation:** none.

### GFX-P12 · In-canvas typography · S (1 day) · Impact low · Addresses F14

**Change**
- One typeface across the HUD and canvas: use the HUD stack, or self-host a single display face for both.
- Labels scale with the tile: `max(12, tile·0.2)` px, ×1.25 with Larger text.
- Text at device resolution (P3).
- A small dark rounded plate at 75 % opacity instead of stroke plus blur.
- `BitmapText` for frequently changing distance labels.

**Acceptance**
1. The label font family matches the HUD.
2. Label x-height is ≥ 6 CSS px at every tile size, and Larger text scales canvas labels ×1.25.
3. Zero label re-rasterizations per frame in the steady state.

**Dependencies:** GFX-P3 (resolution), GFX-P2 (caching).
**Deviation:** none.

### GFX-P13 · Asset pipeline and visual QA upgrades (enabler) · M (3 days) · Impact medium · Supports P2–P11

**Change**
- **One rasterizer.** Use Chromium through Playwright, already a dev dependency, for W02 too. `scripts/build-frontier-assets.mjs:19-37` requires Inkscape, which is not installed in this environment; W01 uses Chromium (`build-campaign-assets.mjs:16-41`).
- **Output scales and packing:**
  - Multi-scale export (@2x, @3x).
  - Trimmed packing with pivots.
  - Grid tilesets with 2 px edge extrusion for tilemap layers.
  - Split pages: `shared-rig` and per world.
- **Checks** added to `check-campaign-assets.mjs`:
  - seamless backgrounds;
  - material and ore CIELAB contrast thresholds (`lab.py` logic);
  - decoded-memory budget per world.
- **Visual regression:** `scripts/visual-baseline.mjs` renders the key fixtures from `work/graphics/gfx-capture.mjs` (stone, bleed, depth, ores, viewports, ceiling, phone, landscape) and compares them with approved baselines.

**Acceptance**
1. On a machine with only Node, Playwright Chromium and Pillow, both builds and both checks pass.
2. The checker fails on a seam, a contrast regression or a budget overrun.
3. The visual baseline script reports per-fixture SSIM.

**Dependencies:** none.
**Deviation:** none to design. The authoring toolchain changes, and the "untrimmed" rule goes to owner decision D6.

---

## 7. Specifications

### 7.1 Art direction targets: value hierarchy (CIELAB L\*, measured with `lab.py`)

| Layer | L\* range | Chroma | Rule |
|---|---|---|---|
| Unknown rock (after light map) | 12–20 | ≤ 6 | Uniform, textured, never shows contents |
| Back wall (dug and caves) | 14–28, darker with depth | ≤ 10 | Ambient occlusion 10–14 px at faces |
| Terrain interior | 32–50 per band | 4–14 | Texture contrast ±6 L\*; no one-tile period |
| Hard rock | terrain −8 to −12 | cooler | Distinct facet pattern (works in grayscale) |
| Rims on lit faces | terrain +15–20 | — | Top lip light, underside shadow |
| Ores | terrain ±20 or more | ≥ 25 for O2–O4 | O3/O4 glint; pairwise ΔE ≥ 20 |
| Rig | cabin 65–75, headlamp ≥ 90 | ≥ 50 | Brightest moving object (pinned W01) |
| World markers and labels | ≥ 85 | — | Always above the light map |

### 7.2 Palettes per world and depth band (derived from the pinned world palettes; bands are an extension, D2)

**W01 Broken asteroid** (pinned `17232B 56616A A8B0B4 F0A43C F6E1AF`)

| Band | Depth | Rows | Terrain (dark / base / light) | Back wall | Ambient | Decals and identity |
|---|---|---|---|---|---|---|
| A Regolith | 0–110 m | 0–10 | `#474F55 / #636D73 / #7D878C` | `#22303A` | 0.85 | Pebbles, scattered salvage plates |
| B Broken plates | 120–290 m | 11–29 | `#3A444C / #56616A / #6F7B83` | `#1A2630` | 0.60 | Long plate fractures, cables |
| C Iron shelf | 300–470 m | 30–47 | `#37332F / #545150 / #6E6966`, rust `#7A5A44` | `#171B20` | 0.42 | Rusted beams; heavier hard rock |
| D Core rubble | 480–590 m | 48–59 | `#30333F / #4A4E5C / #646A7A`, glints `#F6E1AF` | `#10131B` | 0.28 | Crystal seams |

Hard rock is −10 L\* and +10° toward blue per band. Bedrock is `#1B2026` with a diagonal hatch.

**W02 Ice comet** (pinned `102B3D 3C8196 B8E6EB 49D8C6 F7C673`)

| Band | Depth | Rows | Ice (dark / base / light) | Back wall | Ambient | Identity |
|---|---|---|---|---|---|---|
| A Snow crust | 0–140 m | 0–14 | `#6FAFC0 / #A7D9E2 / #D2EEF3` | `#1C3E50` | 0.90 | Frost rims, snow lip |
| B Blue glacier | 150–440 m | 15–44 | `#3C8196 / #74B7C8 / #B8E6EB` | `#143447` | 0.65 | Long facets, melt channels |
| C Clathrate | 450–740 m | 45–74 | `#2C6378 / #4F93A8 / #8CC8D6` | `#0F283A` | 0.45 | Trapped bubbles `#B8E6EB` |
| D Black ice | 750–990 m | 75–99 | `#1D4456 / #34697F / #5E92A6` | `#0A1C2A` | 0.30 | Turquoise and amber volatile glints |

Frozen rock is −12 L\* and desaturated.

### 7.3 Layer stack (target; depth values for `setDepth`)

| Depth | Layer | Notes |
|---|---|---|
| 0 | Sky gradient (surface only) | P1 |
| 1–3 | Stars, sky body, far ridge, near ridge (with ground band) | P1; only when `surfaceY > 0` |
| 8 | `back` tilemap (back wall and ambient occlusion) | P4/P6 |
| 10 | `ground` tilemap (macro textures) | P6 |
| 11 | `deco` tilemap (decals) | P6 |
| 12 | `rim` tilemap (dual-grid rims) | P2/P6 |
| 13 | Wrecks (atlas) | P11; between ground and unknown |
| 14 | `unknown` tilemap (generic rock) | P4/P5 |
| 15 | Ores, packages, structures, dressing | P7/P10 |
| 18–23 | Rig layers | Existing order |
| 24 | World FX (FEEL-P3 particles) | — |
| 25 | `fogRT` (soft unknown and remembered shading) | P5 |
| 30 | `lightRT` (darkness with headlamp, glints erased) | P5 |
| 31 | Emissive additions (WebGL additive point lights) | P5/P9 |
| 38 | Badges in high-contrast mode, drill target, POI ring | P2 |
| 42 | Labels | P12 |
| Camera | postFX vignette and grade | P9 |

### 7.4 Wireframe: a 180 m shaft before and after (1440×900)

```
NOW                                                     TARGET
+--------------------------------------------------+    +--------------------------------------------------+
| HUD                                              |    | HUD (soft scrim from the vignette)               |
|################## near-black fog ################|    |::::::: unexplored rock: dim, textured, band B ::|
|#########  [rock][air][rock]  ####################|    |::::.... remembered rock (soft edge, 55%) ......:|
|#########  [rock][air][rock]  ####################|    |::..[rim][back wall+AO][rim]....  * ore glint ..:|
|#########  [rock][RIG][rock]  ####################|    |::..[rock]  headlamp cone >>>  [rock] ..........:|
|##################################################|    |:::.[rock][   RIG   ][rock] warm pool of light .:|
|  86-89% of pixels luma < 40; per-tile steps      |    |~~~~~~ dithered strata transition to band C ~~~~~|
+--------------------------------------------------+    +--------------------------------------------------+
```

The surface at spawn: today the horizon breaks into fog squares and ridges float. In the target, a continuous crust, ridges with a ground band, one planet, and dressing and lights at the base.

### 7.5 Performance budgets (to be asserted by `scripts/render-budget.mjs`; real devices checked by hand)

| Metric | Desktop (≤ DPR 2) | Mobile (coarse pointer, cap DPR 2) | Today | Method |
|---|---|---|---|---|
| rAF JS p95 at 4× CPU throttle | ≤ 12 ms | ≤ 12 ms | 42.4 (deep) / 35.9 (phone) | CDP throttle plus rAF wrapper |
| Draw calls per frame | ≤ 12 | ≤ 10 | 3–4 | WebGL wrapper |
| Steady-state texture uploads | 0 | 0 | 6–9 per frame | `texImage2D` count |
| On-screen overdraw | ≤ 3.5 screens | ≤ 3.0 | 3.9–6.1 | Clipped triangle area |
| Resident decoded textures | ≤ 64 MiB | ≤ 40 MiB | 26.3 (2 worlds, 1×) | Atlas metadata |
| Particles | ≤ 150 | ≤ 75 | — | FEEL-P3 |
| Real-device p95 frame time | ≤ 16.7 ms | ≤ 16.7 ms on mid-range, ≤ 20 ms on low-end with dynamic resolution | unmeasured | Pixel 6a or Galaxy A54 class; iPhone 12 |

### 7.6 Incremental roadmap (quick wins first)

| Weeks | Proposals | Visible result |
|---|---|---|
| 1 | P1, P2 (and P12 if time allows) | No sky or ridge seams; one planet; continuous horizon; readable stone; working high contrast; no badge over the rig; no per-frame text uploads |
| 2–3 | P13, P4, then P3 | Crisp HiDPI; budgets in CI; per-world textures. Visuals at parity, foundation ready |
| 3–4 | P5, P7 | The big jump: lit rock instead of void, headlamp, soft fog, depth darkness, readable ores |
| 5–7 | P6 (W01 bands A–B first, then C–D, then W02), P8 | Rich terrain, back walls, strata, a living rig |
| 8 | P9, P10, P11 | Mood, surface dressing, title framing, illustrated wrecks |

For W03–W15, each new world becomes palette + band table + macro texture set + rims + backgrounds within the same budgets. The pipeline from P13 and the renderer from P4 scale without code changes.

---

## 8. Owner decisions

- **D1 · Unknown rock.** Keep near-black fog (current), or show "unexplored rock" at about 25–35 % brightness with soft edges (recommended, P5)? The information rules are unchanged either way.
- **D2 · Depth bands.** Approve four depth bands per world with palette variants derived from the pinned five-colour world palette (P6, §7.2)? This extends a pinned value.
- **D3 · Ore colours.** May ores use hues outside the world palette for readability? For example rust and cobalt in W02, with amber for the top tier (P7). This deviates from the per-mineral palettes in the manifest.
- **D4 · Shape badges.** Bake them into the ore sprites (recommended), keep the overlay always on (current), or make them an accessibility option?
- **D5 · Screen treatment.** Allow a constant vignette and per-band colour grade, given the pinned "restrained effects … one local screen effect" (P9)?
- **D6 · Resolution policy.** DPR cap 2 on phones and 3 on desktop with dynamic resolution (recommended), and lifting the documented "frames are untrimmed" rule in favour of trim metadata (P3, P13)?
- **D7 · Large monitors.** Restore the pinned nominal 22-column view on ≥ 2400 px screens (needs @3x art), or keep today's wider 76 px cap view (33.7 columns at 2560)? Coordinate with FEEL-P4 zoom.
- **D8 · Art production.** Continue procedural SVG generators for the terrain macro textures, or commission hand-authored layered SVG and illustration for terrain and title key art? This is a budget and style decision.
- **D9 · Title screen.** A static key-art illustration, or a framed live-world attract mode (P10)?

---

## 9. Evidence index (paths relative to `docs/improvement-plan/`)

Root: `docs/improvement-plan/`

**Scripts**
- `work/graphics/gfx-perf.mjs`: WebGL/rAF instrumentation, overdraw, CPU profile, 4× throttle (parts: `desktop`, `deep`, `phone`, `all`, `throttle`).
- `work/graphics/gfx-capture.mjs`: fixtures (parts: `stone`, `bleed`, `depth`, `w02`, `viewports`).
- `work/graphics/gfx-fly.mjs`: flight ceiling.
- `work/graphics/gfx-wrap.mjs`: wrap seam.
- `work/graphics/gfx-wreck.mjs`: wreck POI.
- `work/graphics/gfx-dpr2.mjs`: HiDPI backing store.
- `work/graphics/gfx-bedrock.mjs`: exposed bedrock at the W01 floor. The shared dev server on 5173 went down late in the audit, so this script ran against a private Vite server on 5184 serving the same unmodified repository.
- `work/graphics/frames.py`, `…/variety.py`, `…/lab.py`: asset statistics.

**Data**
- `…/work/graphics/perf/perf-all.json`, `perf-throttle.json`, `dpr-desktop.json`, `deep-profile.cpuprofile`
- `…/work/graphics/variety.json`, `lab-contrast.json`, `frame-alpha-stats.json`, `atlas-utilisation.json`, `darkness-stats.json`
- `…/work/graphics/cap/bleed-results.json`, `seam-results.json`, `depth-results.json`, `lighting-steps.json`, `capture-meta-*.json`

**Captures**
- `…/work/graphics/cap/g01-w01-stone-exposure.png` (annotated: `…/work/graphics/ev-stone-exposure.png`)
- `…/work/graphics/cap/g02a-deep-x8.png`, `g02b-deep-x12.png`, `diff-bleed-below.png`, `pair-bleed-*.png`
- `…/work/graphics/cap/g08-deep-x8-high-contrast.png`
- `…/work/graphics/cap/g04-w01-depth-row{4,30,56}.png`, `g04-w02-depth-row{6,50,94}.png`, `triptych-w01-depth.png`, `triptych-w02-depth.png`
- `…/work/graphics/cap/g07-w01-ores-lit.png`, `g07-w02-ores-lit.png` (grayscale pairs: `…/work/graphics/ev-w01-ores-gray.png`, `ev-w02-ores-gray.png`)
- `…/work/graphics/cap/g05-surface-2560x1440.png`, `g05-surface-1920x1080.png`, `g05-surface-1280x1024.png`
- `…/work/graphics/cap/g10-w01-flying-ceiling.png`, `g10-w02-flying-ceiling.png` (composite: `…/work/graphics/ev-sky-tiling.png`)
- `…/work/graphics/cap/g12-w01-after-wrap-1440.png`
- `…/work/graphics/cap/g06-phone-dpr3.png`, `z-phone-dpr3-rig.png` (composite: `…/work/graphics/ev-phone-dpr3.png`)
- `…/work/graphics/cap/g09-damage-stage3.png`, `z-damage3.png`
- `…/work/graphics/cap/g11-w01-wreck-beacon.png`
- `…/work/graphics/cap/g13-w01-exposed-bedrock.png`, `z-bedrock.png`

**Zoomed crops and atlas sheets**
- Crops: `…/work/graphics/z-d21-topleft.png`, `z-d21-rig.png`, `z-d02-surface.png`, `z-d04-rig.png`, `z-l02-badge-over-rig.png`
- Sheets: `…/work/graphics/w01-terrain-interiors.png`, `w01-edges.png`, `w01-ores.png`, `w02-terrain-interiors.png`, `w02-edges.png`, `w02-ores.png`

**Baseline screenshots used:** `shots/d01`, `d02`, `d04`, `d05`, `d19`, `d20`, `d21`, `e00`–`e03`, `p03`, `l02`.
