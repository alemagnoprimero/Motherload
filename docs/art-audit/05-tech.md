# 05 · Rendering architecture, resolution and technical quality

Dimension key: `tech`. Repository: `/home/user/Motherload` at `644e222` (read-only). Captures: `scratchpad/v2/shots/` and `scratchpad/v2/shots2/`. My own probes, figures and scripts are in `scratchpad/art-audit/work/tech/` (abbreviated `work/` below):

- `tech-probe.mjs` drives the game in Chromium, patching the served `scene.ts` in flight to expose the scene and hooking `texImage2D`. It reads the display list, texture sizes and upload traffic. `PIN_DPR=1` disables the adaptive-resolution sampler.
- `probe/` holds the as-shipped behaviour and `probe-dpr2/` the run with DPR pinned. Each has `probe.json` plus Phaser `renderer.snapshot()` frames without the DOM HUD.
- `hf.py` measures effective resolution; `edges.py` and `edge-stats.json` hold edge density at a common tile scale.
- Figures: `tech-exploded-60m.png`, `tech-resolution-rig.png`, `tech-pattern-seams.png`, `tech-side-by-side.jpg`.

Value, shape and asset content are in the sibling reports `01-terrain.md`, `02-lighting.md` and `03-assets.md`. This report asks whether the renderer can produce the concept, at what resolution and cost.

---

## 1. Verdict

The current renderer cannot produce the concept look, and adding art on top of it would not change that.

Every terrain, fog and light pixel is drawn on the CPU with Canvas 2D into two `CanvasTexture`s. Each texture is re-uploaded whole whenever anything changes. The design premise is written into the code: "Canvas compositing is the reference implementation for both Phaser renderers" (`render/lighting.ts:6`).

The consequences are measurable:

- Every visible object in the frame uses blend mode NORMAL. There is no additive light, multiply or emissive layer (`probe/` and `probe-dpr2/probe.json`: 61–65 visible objects, all `blend0`).
- The "light" is an alpha-only darkening layer. Its maximum darkness over unexplored rock is 0.16, so it changes the frame by about 16 luma (`work/tech-exploded-60m.png`, panel C).
- Terrain boundaries are clipped per square cell (`terrain.ts:162-164`). Rims are 2 px straight strokes (`terrain.ts:248-277`).
- The terrain buffer at DPR 2 is a single 2744×1862 texture, 19.5 MiB. That is 38 % of all resident texture memory. Moving or digging re-uploads it whole, at an average of 1.9 MiB per frame with 19.5 MiB spikes.
- Expensive frames trip the adaptive resolution budget, which only ever ratchets down (`view.ts:103-121`). Here the trigger was software GL; on phones it is the recorded 54.9 ms moving p95, to which these uploads contribute. In the audit captures the world was drawn at backing scale 1.0 on a DPR 2 display and 1.5 on a DPR 3 phone. The sharp DOM HUD then sits over a world upscaled 2×.

Phaser 3.90 is not the limit. Its WebGL path (`TilemapLayer`, `DynamicTexture` draw and erase, ADD and MULTIPLY blending, compressed textures) covers every technique the board needs, within the recorded phone budgets. The Canvas fallback can carry a reduced version.

**The single biggest reason is architectural.** A CPU-composited, upload-per-change terrain and light pipeline makes rich layering unaffordable. It drives the resolution down and has no way to emit light. The fix is to move terrain and light composition to the GPU, keep the existing Canvas code as the fallback, and only then add the edge, decal and set-piece art.

---

## 2. Side-by-side evidence

### 2.1 How a frame is composed today (measured, not inferred)

The table below lists `children.list` read from the running scene at the 60 m fixture, 1440×900 CSS, with DPR pinned at 2 (`work/probe-dpr2/probe.json`). The DOM HUD sits above the canvas.

| Depth | Object | Source and resolution | Blend | Updated |
|---|---|---|---|---|
| 0 | `Graphics` background | cleared every frame, never drawn (`scene.ts:1112-1116`) | normal | every frame |
| 1 | sky gradient `Image` | 4×512 canvas, stretched (`scene.ts:213-230`) | normal | static |
| 1.1 | stars `TileSprite` | 512×256 at tileScale 2 (`scene.ts:1139`) | normal | parallax |
| 1.2 | sky body | atlas frame | normal | parallax |
| 2, 3 | ridge-far, ridge-near `TileSprite` | 1024×384 each, scaled to tile/96 (`scene.ts:1166-1175`) | normal | parallax |
| **10** | **retained terrain `Image`** | **CanvasTexture 2744×1862 = 19.5 MiB**, rasterised at min(DPR, 1.5) (`terrain.ts:41`) | normal | full upload on any change (`terrain.ts:280-283`) |
| 11, 12 | `Graphics` edges and contrast | contact ellipses, surface lamp dots, crack rects | normal | every frame |
| 13 | ores and packages (16) | 2× atlas or 3× page | normal | every frame (pooled) |
| 14, 15 | sites and wrecks (8) | atlas, each under a **GeometryMask** (`scene.ts:209, 680`) | normal | every frame |
| **17** | **light map `Image`** | **CanvasTexture 360×225**, ¼ of CSS size (`lighting.ts:27-30`), blurred with `ctx.filter` (`lighting.ts:86`) | normal | full redraw and upload whenever scroll or rig moves (`lighting.ts:37-50`) |
| 17.2 | lamp glow | 256×256 canvas, peak alpha 0.18 (`scene.ts:243-261`) | normal | follows rig |
| 18–23 | rig parts | 3× page on desktop, 2× on touch | normal | every frame |
| 24 | glints and particles | 32×32 canvases, `Graphics` circles | normal | every frame |
| 40, 42 | markers; `Text` labels | Phaser Text at view DPR | normal | 2 labels re-rasterised per frame (see 2.5) |

The measured state of this frame:

- **Draw calls:** 7 on desktop, 4 on phone (budget ≤12 and ≤10).
- **Render textures:** none. No `RenderTexture` or `DynamicTexture` exists.
- **Blend modes:** none other than NORMAL.
- **Fog:** part of the light map, drawn per cell at ¼ resolution then blurred on the CPU.

`work/tech-exploded-60m.png` shows the frame taken apart:

- **A:** the final frame.
- **B:** the terrain texture alone. It is almost identical to A.
- **C:** the light map's whole contribution, (final − no light) × 4. It darkens unexplored rock by a mean 16.4 luma and brightens a 3-tile disc around the rig by 5 luma. The cone area ends up *darker* than with no light at all (L\* 38.4 against 42.2), and its colour shift is b\* +1.1, which is not warm.
- **D:** everything except light.

The lighting system is effectively a 16 % grey veil.

### 2.2 SURFACE panel vs `a02-spawn-1440x900@2.png`

See the top row of `work/tech-side-by-side.jpg`. The concept stacks a sky gradient, stars and a ringed planet, then two or three faceted, snow-lit ranges rising about 35 % of the sky. Below them sit a bevelled crust with pits, glowing lamp posts with halos, cables, crates and a detailed lander.

The game has the same layer *count* behind the ground (gradient, stars, body, two ridges), so parallax is not an architectural gap. The gap is what fills the layers:

- The ridges are low, outline-only polygons.
- The lamp posts are 3 px dots drawn at 95 % alpha with normal blend (`scene.ts:1310-1332`). With normal blend they cannot read as light.
- The crust is the same flat, stroked terrain as underground.
- The lander is the dashed stage-0 frame (`03-assets.md`).

The surface needs an additive halo layer and the edge system from 2.3, not a new background system.

### 2.3 60 M SHAFT panel vs `probe-dpr2/desk60-full.png` and `a04-dive-60m@2.png`

The concept shaft has four features the game lacks:

1. Dark slate unexplored rock with readable strata.
2. A crisp bevelled lip on each shaft wall: a bright edge, a dark undercut and a slight chamfer at the corners.
3. A warm cone that is brightest at the lamp and glows in the air of the shaft.
4. Ores sitting in the wall.

The game draws these instead:

1. A light, nearly uniform sheet, the consequence of fog alpha 0.16 (`lighting.ts:73-77`).
2. A 2 px line on the cell edge.
3. An "erase" of a mostly transparent veil (`lighting.ts:99-150`), which can only *remove* darkness and can never add warm light.
4. A macro texture that repeats every 8 tiles in both axes, with a soft seam where the generator's wrap mask fades the plates out (`render-sources.mjs:62-63`).

`work/tech-pattern-seams.png` stretches luma 85–125 to show the seams. Texture standard deviation drops from 1.85 to 0.34 luma inside the seam strip. It is invisible today only because the rock has almost no texture contrast; at the concept's ~12 luma texture (`01-terrain.md`) it will show.

`check-render-assets.mjs:57-72` passes this page because it compares edge-pixel equality, not visual continuity.

### 2.4 300 M CAVERN panel vs `c-site-W01-SITE-4-wreck@2.png`

The concept cavern requires five techniques the renderer does not have:

- **An organic outline with stalactites.** This needs sub-cell boundary geometry; the game has per-cell square clipping.
- **Rust drips, amber crystals and boulders.** These need a decal or stamp layer, which does not exist.
- **A cyan beacon with a halo and warm crystal glow.** These need an emissive or additive layer, which does not exist either.
- **Warm light filling the cave air.** This needs an additive light accumulation buffer.
- **A large wreck hull.** This needs multi-tile set-piece sprites drawn under fog. The game draws a 2.8×1.9-tile sprite clipped by a stencil GeometryMask built from known cells (`scene.ts:658-681`). Every masked sprite costs a stencil pass: 8 masked sprites in the 60 m fixture.

The capture also shows a hard horizontal band change at a row boundary. Bands are selected per row with no transition (`bands.ts:44-51`, `terrain.ts:165`).

### 2.5 Sharpness, scaling and aliasing in the @2x and @3x captures

**The audit captures were not rendered at device resolution.** I measured how much gradient energy survives a down-2/up-2 resample (`keep@2`). Content upscaled 2× scores about 0.95 or higher; true device-resolution detail scores lower.

| Crop (`work/tech-resolution-rig.png`) | Backing scale | keep@2 |
|---|---|---|
| DOM HUD text, `a04-dive-60m@2.png` | 2.0 | 0.53 |
| Rig, `a04-dive-60m@2.png` (adaptive, as shipped) | **1.0** | **0.96** |
| Rig, `probe-dpr2/desk60-full.png` (budget pinned) | 2.0 | 0.69 |
| Rig, `p-portrait-03-dive-70m@3.png` (adaptive) | 1.5 | 0.85 |
| Rig, `probe-dpr2/phone60-screen@3.png` (pinned) | 2.0 (cap) | 0.88 |

The probe confirms this directly. As shipped, the backing canvas was 1440×900 on the DPR 2 desktop (`viewDpr` 1) and 590×1277 on the DPR 3 phone (`viewDpr` 1.5). The cause is `RenderScaleBudget` (`view.ts:99-121`):

- Any 3-second window with p95 above 18 ms steps the ceiling down from 2 to 1.5 to 1.
- The ceiling never rises again.

Software GL triggers this quickly. `IMPROVEMENT_PROGRESS.md:58` records a moving p95 of **54.9 ms** on the throttled phone viewport, so mid-range phones should be expected to ratchet to 1.0 within about 6 s and stay there, showing every world pixel upscaled 3× on a DPR 3 screen.

Further scaling artefacts:

- **Terrain is rasterised at no more than 1.5×** (`terrain.ts:41`). Touch devices also shrink the raster tile to 0.88 (`terrain.ts:44`).
  - Desktop at DPR 2: terrain is magnified 1.34× (1.40× below 120 m, where `contextZoom` is 1.05, `scene.ts:788-796`).
  - Phone: 58 raster px per tile are shown on 132 physical px, a **2.28×** magnification.
  - Today's low-frequency terrain hides this; the shaft edge rises over about 2 px at DPR 2. Concept-style 1–2 px crack and bevel lines will blur.
- **Back-wall pages are downsampled from 768 to 384** (`art.ts:91-99`). That is 48 texels per tile shown on 131 device px, a 2.7× magnification.
- **Band pages always load at 2×** (`art.ts:130`), even though 3× pages exist in `bands/manifest.json`.
- **The phone backing scale is capped at 2** (`view.ts:35`), a 1.5× compositor upscale even in the best case; acceptable for this style, unlike the ratchet.
- **Stars are magnified:** the star texture is drawn at tileScale 2 (`scene.ts:1139`), so stars are 4× device-magnified dots at DPR 2.
- **Sprite placement is good:** sprites snap to device pixels (`scene.ts:614-625`); the softness comes from scale, not sampling.

### 2.6 Detail density at a common tile scale

`work/edges.py` resamples every frame to the concept's 43 px tile. It then counts the share of pixels whose Sobel gradient exceeds 20 luma per pixel (outlines, lips, rims):

| Frame | Strong-edge share | Luma p2 / p98 |
|---|---|---|
| Concept surface / shaft / cavern | 0.064 / 0.051 / 0.065 | 24–30 / 131–159 |
| `a02` surface | 0.021 | 39 / 123 |
| `a04` 60 m (as shipped) / pinned DPR 2 | 0.024 / 0.036 | 26–46 / 115–127 |
| `c-site-4` 465 m / `b-330m` | 0.021 / 0.026 | 25–26 / 94–102 |

The game has a half to a third of the concept's edge structure, even though its counts include HUD and ore badges. Its p98 is 20–60 luma below the concept's.

---

## 3. Root causes in code and assets

1. **CPU composition by design.**
   - `lighting.ts:6` makes Canvas 2D the reference renderer.
   - `RetainedTerrain` rasterises each dirty cell with `save/clip/fillRect/pattern/stroke` (`terrain.ts:132-279`) and then calls `this.texture.refresh()` (`terrain.ts:281`). That is a full `texImage2D` of the whole buffer.
   - Measured: 7 terrain uploads of 2744×1862 in 90 moving frames, 1.88 MiB per frame on average while moving (`probe-dpr2/probe.json`). On the phone: 870×1508, 0.52 MiB per frame.
2. **The buffer is the largest texture in the game.**
   - 19.49 MiB of the 50.7 MiB resident at W01 60 m on desktop DPR 2, plus an equal CPU-side canvas.
   - The 2× atlas (5.5 MiB) stays resident after the 3× page (11.5 MiB) loads (`art.ts:149-182`; both listed in `probe-dpr2/probe.json`).
   - So about 25 MiB of a 64 MiB budget is architecture overhead. `IMPROVEMENT_PROGRESS.md:52` records **0.48 MiB headroom** in the W02 desktop fixture, so no concept art fits until this is fixed.
3. **No light emission is possible.**
   - The light map uses only `destination-out` over a dark veil (`lighting.ts:99-152`). Its darkness values are 0.16 unknown, ≤0.52 remembered, and (1 − ambient) × 0.72 visible (`lighting.ts:72-77`).
   - The warm lamp is a normal-blend gradient at alpha 0.18 (`scene.ts:254`).
   - No object anywhere uses `BlendModes.ADD`.
   - The fog blur relies on `ctx.filter` (`lighting.ts:86`), which older Safari releases ignored. Fog would silently turn into hard ¼-resolution blocks on those devices, so this must be checked on the oldest supported iOS.
4. **No sub-cell geometry.**
   - Each cell is clipped to its own square (`terrain.ts:162-164`). The rim is a 4-bit mask stroked as straight lines (`terrain.ts:139-145`, `248-277`).
   - There is no corner case, no chamfer, no undercut and no ambient occlusion. The renderer has no slot where edge or decoration sprites could go.
5. **The macro material generator.**
   - `render-sources.mjs:46-63` lays one 4×8 quad-plate grid per page.
   - It hides the wrap by masking plates to nothing in a 2.5 % margin, which produces the seam in 2.4. The strata lines are drawn *under* opaque plates (`render-sources.mjs:36-40` then `:63`).
   - Patterns are applied at alpha 0.23 for unknown cells and 0.55 for walls (`terrain.ts:208-214`).
6. **The resolution policy.** `view.ts:103-121` is a one-way ratchet with an 18 ms threshold, which is below the measured moving p95. `terrain.ts:41,44` caps the terrain raster, and `art.ts:91-99,130` halves or fixes the page scales.
7. **Steady-state uploads.**
   - `missionLabel` sets a beside-wrap width every frame (`scene.ts:710-714`), after `label()` has set the default width (`scene.ts:648-649`). The width alternates, so Phaser re-rasterises 2 text textures (468×60) every frame even when stationary: 2 uploads per frame, 0.21 MiB.
   - The light map signature includes scroll and rig position (`lighting.ts:37-50`), so it is redrawn, blurred and uploaded every moving frame.
8. **Masks as stencil.** Every wreck, site and cold-pocket sprite uses a GeometryMask from known cells (`scene.ts:680, 1491, 1646, 1735, 1769, 1793`), costing extra GPU passes for something a fog layer drawn above them would do for free.

---

## 4. Gaps ranked by visual impact

1. **No additive or emissive light path.** Without it there is no warm cone, no lamp or beacon glow and no hot core. The concept's brightest, warmest pixels cannot be produced (root cause 3).
2. **Square, stroke-only terrain boundaries.** There are no edge or corner sprites, bevels, undercuts or AO, and no slot for them (root cause 4).
3. **Resolution collapse.** The world is drawn at backing 1.0 on DPR 2 and DPR 3 screens after the ratchet, against crisp DOM HUD text (root cause 6, section 2.5).
4. **No decal or stamp layer and no set-piece pipeline.** Stalactites, drips, crystals, boulders and wreck hulls have nowhere to live (root causes 4 and 8).
5. **Texture budget consumed by architecture.** 19.5 MiB of terrain buffer and 5.5 MiB of duplicate atlas leave no room for concept art (root cause 2).
6. **Material page artefacts.** The 8-tile repeat, the wrap-fade seams and strata hidden under plates will become visible as soon as contrast rises (root cause 5).
7. **Hard row-boundary band changes.** There is no dithered transition (`bands.ts:44-51`).
8. **Frame-time cost.** p95 is 54.9 ms against a 12 ms target, and the upload spikes feed straight into gap 3 (root causes 1 and 7).

---

## 5. Recommendations

### 5.1 Technique feasibility in Phaser 3.90

Costs below are judged against the recorded phone budgets:

- draw calls ≤10;
- overdraw ≤3.0 screens (the game measures 2.09 today);
- 0 steady uploads;
- ≤40 MiB active textures (24.5 MiB measured);
- p95 ≤12 ms.

| Technique the board needs | WebGL (3.90) | Canvas fallback | Phone cost | Code to change |
|---|---|---|---|---|
| Continuous strata: world-aligned macro tiles, frame = (x mod 8, y mod 8) | `Tilemap` + `TilemapLayer`; the 768 px page is a 64-tile tileset as-is | `TilemapLayer` canvas renderer (drawImage per tile) | ~200 quads per layer; no uploads; textures already budgeted | new `render/terrain-gpu.ts`; `art.ts` tilesets |
| Edge autotiling: dual-grid marching squares, 16 cases × variants, half-tile offset | second `TilemapLayer` offset −½ tile; per-tile tint for band colour | same | +0.25 screens overdraw; 2–4 MiB atlas if tinted and shared | generator in `render-sources.mjs`; layer in `terrain-gpu.ts` |
| Baked bevel, undercut and AO | baked into edge tiles (fixed top-left key) | same | 0 runtime | edge atlas |
| Normal-mapped lighting (Light2D) | available; doubles texture memory; per-pixel light loop | **not supported**: renders unlit | high on low-end GPUs | defer: not needed to match the board |
| Light cone mask: additive, clipped to air | `DynamicTexture` (¼ res): `draw` cone and halo brushes, `erase` solid cells, show with `BlendModes.ADD` | `DynamicTexture` is canvas-backed; ADD maps to `lighter` | +1 draw, +0.3 screens, 0 uploads | rewrite `lighting.ts`; brushes made in `create()` |
| Dark fog hiding unknown cells, with soft edges | one texel per cell (40×60 W01, 48×100 W02), LINEAR filter, scaled by tile; MULTIPLY or alpha | same (smoothed drawImage) | ≤19 KB upload only on discovery | replaces the `ctx.filter` blur (`lighting.ts:67-88`) |
| Soft contact shadows | MULTIPLY ellipse sprites; AO already baked | `multiply` | trivial | `rig.ts:57-60`, prop placement |
| Decals and cave stamps (stalactites, drips, crystals) | deco `TilemapLayer` or pooled sprites keyed to edge cases | same | ≤60 sprites; 4 MiB per world | new `render/decor.ts` |
| Emissive layer (lamps, beacon, crystals, O3/O4) | ADD sprites at depth 31 | `lighter` | ≤20 quads | `scene.ts:1310-1332`, POI and ore loops |
| Bloom, vignette, grade | `postFX` (WebGL only); bloom = several full-screen passes | none | bloom over budget at DPR 2; vignette fine | bake halos instead; put vignette into the darkness texture |
| Layered parallax | `TileSprite` (exists) | same | surface only | art plus `scene.ts:1166-1176` |
| Large set pieces under fog | sprites drawn *below* the darkness layer; no stencil | same | removes up to 8 stencil passes | `scene.ts:658-681` |

### 5.2 Ranked changes

**R1 · Fix the resolution policy and make it visible · S · impact high · risk low.**

- **What:** stop the one-way ratchet.
- **How:**
  - Ignore asset-loading and resize windows.
  - Step down only when p95 exceeds 24 ms for two consecutive windows.
  - Step back up after 10 s at p95 below 12 ms.
  - Floor at 1.5 when `devicePixelRatio` is 2 or more, unless the frame stays above 33 ms.
  - Add the backing scale to the debug overlay and to every capture manifest.
- **Code:** `view.ts:99-121`, `scene.ts:781-830`.
- **Acceptance:** desktop captures score keep@2 ≤0.75 (section 6).

Land this first, or every art review judges 2×-upscaled pixels.

**R2 · Zero steady-state uploads · S · impact medium (frame time) · risk low.**

- Compare the beside-wrap width before calling `setWordWrapWidth` (`scene.ts:710-714`), or give beside-labels their own pooled objects.
- Drop scroll from the light signature once R3 moves lighting to the GPU.

**R3 · GPU light stack: darkness plus additive warm light plus emissive · M · impact very high · risk medium.**

- **What:** replace `CampaignLighting` with three pieces:
  - a ¼-resolution darkness `DynamicTexture` at depth 30, filled with band ambient, with the vignette folded in;
  - an ADD light accumulation `DynamicTexture` at depth 31, holding the lamp halo and a rotated cone brush. Erase solid and unknown cells from it using a ¼-resolution solid mask, so light stays in the air and on lit faces;
  - ADD emissive sprites for lamp posts, the beacon, crystals and O3/O4 ores.
- **Fog:** move it to the per-cell texel texture (5.1) and drop `ctx.filter`.
- **Assets:** cone, halo and glint brushes, generated procedurally as `campaign-lamp` is today.
- **Values:** take them from `02-lighting.md`. Its prototype took the shaft from L\* 38.1 to 21.3.
- **Code:** `render/lighting.ts` (rewrite), `scene.ts:243-261, 1177-1185`.
- **Canvas:** the same `DynamicTexture` calls work there; ADD maps to `lighter`.
- **Risk:** light leaking through rock if the erase mask lags; test with a hidden-cave fixture.

**R4 · GPU terrain renderer, keeping the Canvas renderer as fallback · L · impact high (enabler) · risk medium.**

- **What:** use `TilemapLayer`s, back-to-front: back wall (air cells), ground (known solid), unknown (generic rock), edges (R5), decor (R6). The tileset is the existing band page sliced as a 96 px (2×) or 144 px (3×) grid. The tile index is `(y mod 8) × 8 + (x mod 8)`.
- **Wrap:** the world is only 40 or 48 columns wide, so mirror the first ~26 columns into extra map columns and mirror every `putTileAt`.
- **Extrusion:** emit tilesets with 2 px extruded tile borders (`addTilesetImage(…, margin 2, spacing 4)`). Otherwise the bilinear filter will show seams at fractional zoom (`contextZoom` 0.88 and 1.05).
- **Code:** new `render/terrain-gpu.ts`; `scene.ts:1179`; `art.ts:57-91, 112-147` (load 3× pages on desktop quality 3); `build-band-assets.mjs` (extruded tilesets).
- **Fallback:** keep `RetainedTerrain` for `renderer=canvas` (`application.ts:1894-1898`).
- **Gains:** frees 19.5 MiB of GPU memory and as much CPU memory on desktop DPR 2 (5 MiB on phones), and removes the 19.5 MiB upload spikes.
- **Risk:** the tile-edge sampling seams above; the Canvas fallback becomes the slow path (acceptable as fallback).

**R5 · Dual-grid edge and corner system · M code + L art · impact very high · risk medium (readability).**

- **What:** sample cell corners. Each half-offset quad picks one of 16 cases from its four neighbouring cells (solid or air, known or unknown). Draw 3–4 hash-chosen variants per case.
- **What the edge art carries:** a bright bevel lip on up-facing faces, a dark undercut on down-facing faces, 45° and rounded corner cuts, and AO baked into the air side. Ceiling cases get stalactite variants and floor cases rubble.
- **Geometry limit:** keep the edge within ±0.15 tile of the collision boundary. `01-terrain.md` §2.5 shows the axis-aligned boundary share falls from 93 % to 24 % with 3.4 % pixel deviation.
- **Asset list:**
  - 16 cases × 4 variants for each of soil, rock, plate and bedrock, plus a W02 ice set;
  - drawn in greyscale and tinted per band (Phaser per-tile tint in WebGL; pre-tinted pages for Canvas);
  - built in the existing SVG generator.
- **Code:** `render-sources.mjs` (new `createEdgeSources`), `terrain-gpu.ts`, `check-render-assets.mjs` (case-coverage tests).

**R6 · Decal and set-piece layer · M code + L art · impact high · risk low.**

- **Decals:** placed by deterministic hash on *known* cells, keyed to edge cases and bands:
  - band B: cables and plates;
  - band C: rust drips under ceilings;
  - band D: amber crystals on floors;
  - W02: frost streaks and bubbles.
  Target 5–8 % of eligible cells, at most 60 on screen.
- **Set pieces:** the wreck hull (6×3 tiles), beacon tripod, detailed lander stages, lamp posts, crates and cables. Draw them as multi-tile sprites below the darkness layer. That removes the GeometryMasks (`scene.ts:680` and the five other `setMask` sites).
- **Assets:** one decal page and one set-piece page per world (see `03-assets.md` for the inventory).

**R7 · Texture budget restructuring · M · impact enabling · risk low.**

- Unload the 2× atlas once the 3× pages are resident (`art.ts:149-182`; `scene.ts:503-510` lookup).
- Move the frames shared between worlds into a common atlas, so W01 no longer keeps the W02 atlas.
- Load opaque terrain pages as compressed textures (ASTC, ETC2 or BC7 through Phaser `load.texture`), with a PNG fallback for Canvas.
- Restore the full-resolution wall page (`art.ts:91-99`).
- Without R4 and R7, the 0.48 MiB headroom (`IMPROVEMENT_PROGRESS.md:52`) blocks R5 and R6.

**R8 · Fix the macro page generator · S–M · impact medium · risk low.**

- Make plates truly periodic: wrap geometry modulo 768 instead of masking (`render-sources.mjs:62-63`).
- Draw strata *over* the plate fills at a readable contrast.
- Break the 8-tile period with two page variants chosen per 8×8 block by hash.
- Add a 2-row dithered band-transition tile set.
- Extend `check-render-assets.mjs` with a strip-texture test, plus the tile-phase luma test the old plan proposed (`04-graphics.md` P6 acceptance 2).

**R9 · Background and surface emissives · S code + M art · impact medium · risk low.**

- Add 3–4 ridge `TileSprite`s with facets rising to about 35 % of the sky, and a ringed sky body.
- Use stars at tileScale 1 from a 2× source (`scene.ts:1139`).
- Give lamps ADD halos (R3).

**R10 · Camera framing decision (owner) · S code · impact medium · risk gameplay.**

- The concept frames about 16 tiles across on desktop and about 6 across in portrait (43 px tile on 690 px and 243 px panels). The game frames 22 and 8.9 (`layout.ts:3-7`).
- Matching the board's detail per tile means either adopting that zoom, which costs view distance and needs 3× pages on phones, or accepting less visible detail.
- Decide this before authoring the edge and decal art, because it fixes the texel density.

**R11 · Visual acceptance harness · M · impact enabling · risk low.**

- Productise `work/tech-probe.mjs`: pinned DPR, six fixtures equivalent to the concept panels (desktop and portrait × surface, 60 m, 300 m), `renderer.snapshot()` without HUD, upload hooks, and the metrics in section 6.
- Store the outputs as CI artefacts next to `render-budget.mjs`.

**Not recommended now:**

- **Light2D normal maps.** WebGL only, doubles memory, and the board reads as baked top-light plus an additive cone.
- **postFX bloom.** Several full-screen passes at DPR 2 exceed the phone fill budget; baked halos give the same look.

**Expected cost of R3 + R4 + R5 + R6 together (estimate):**

| Measure | Estimate | Reasoning or budget |
|---|---|---|
| Draw calls | 5–9 | Phaser's multi-texture batch merges consecutive tile layers; the stencil masks are gone |
| Overdraw | ~2.7 screens | back/ground/unknown are mutually exclusive (1.0), edges and decals 0.35, darkness 1.0, additive 0.3 |
| Steady uploads | 0 | |
| Phone textures | ~24.5 − 5 + 12 ≈ 32 MiB | budget 40 MiB |
| Desktop textures | ~50.7 − 19.5 − 5.5 + 16 ≈ 42 MiB | budget 64 MiB |

These are projections for R11 to verify, not measurements.

### 5.3 Suggested order

1. R1, then R2 (≤2 days). After this, every review shows true-resolution pixels.
2. R3 (largest visible jump; can run on the current terrain).
3. R7 and R4.
4. R8 and R5.
5. R6 and R9.

R10 is decided before R5 art starts. R11 runs from the first step.

---

## 6. Measurable acceptance

All metrics run in the R11 harness on six fixtures that match the concept panels. Each fixture is captured at a pinned backing scale and also as shipped after 60 s of scripted play. Current values come from this audit.

| # | Gate | Current | Target |
|---|---|---|---|
| T1 | Backing scale after 60 s of scripted play (`dataset.renderScale`), desktop DPR 2 / phone DPR 3 | 1.0 / 1.5 in this environment | 2.0 / ≥1.5 on reference hardware; recovers to the ceiling within 15 s of a hitch |
| T2 | Rig crop keep@2 (`hf.py`), desktop @2 | 0.96 shipped, 0.69 pinned | ≤0.75 |
| T3 | texImage2D in stationary frames | 2 per frame, 0.21 MiB | 0 |
| T4 | Upload bytes while moving | 1.88 MiB/frame average, 19.5 MiB spikes | ≤64 KiB/frame average; no single upload >256 KiB outside asset streaming |
| T5 | Resident textures, desktop W02 / phone active | 63.52 MiB (recorded) / 24.5 MiB | ≤56 MiB (8 MiB headroom) / ≤36 MiB, *after* the concept art lands |
| T6 | Draw calls, desktop / phone | 7 / 4 | ≤12 / ≤10 |
| T7 | p95 frame time, 4× throttle, phone viewport moving | 54.9 ms | ≤16.7 ms (12 ms stretch); physical device ≤16.7 ms |
| T8 | Objects with ADD blend in an underground frame | 0 | ≥1 light buffer plus emissives; warm cone core b\* ≥ +8 (`02-lighting.md`: concept +12, game −4.8) |
| T9 | Strong-edge share (Sobel >20 at a 43 px tile, HUD masked) | 0.021–0.036 | 0.045–0.075 (concept 0.051–0.065) |
| T10 | Luma p98 underground at a 43 px tile | 94–127 | ≥130 (concept 131–147) |
| T11 | Axis-aligned share of the cave and tunnel boundary (`01-terrain.md` method) | 65–82 % | ≤35 % (concept 18–23 %) |
| T12 | Texture standard deviation in unknown rock at a 43 px tile; strip dropout at 8-tile seams | 1.3–1.9 luma; dropout to 0.34 | ≥8 luma; no 1-tile strip below 70 % of the surrounding standard deviation |
| T13 | Hidden information | passes (`IMPROVEMENT_COVERAGE.md:58`) | still passes on both renderers: unknown-cell histogram identical over hidden caves and ores; additive light never brightens unknown cells by more than 2 L\* |
| T14 | Canvas fallback | pixel parity "≤3" fails at maxima of 63 | replace with an *information* parity test plus an archived visual pair; ADD falls back to `lighter`; no bloom or normal maps required |
| T15 | Side-by-side review | — | the owner reviews the six harness frames beside the six board panels at 1440×900 and 393×851 and signs off each one |

T1–T7 test whether the renderer can afford the look, T8–T12 whether the frames have the concept's structure, and T13–T15 keep the rules intact and leave the final judgement to the owner.
