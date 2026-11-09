# 06 — Technique prototype: how close the game's own data can get to the concept board

**Verdict.** I built a standalone renderer that reads the real W01 world (`fresh-w01.json`: tiles, discovery, deposits, sites) and the game's own atlas. It applies only techniques the game could ship. Three of the five audits' problems close almost entirely through technique, with no new authored art:

- **Value hierarchy.** In the 60 m shaft, unexplored rock lands at luma 52.8 (sd 12.0). The concept has 57 (sd 10.6); the game has 84–89 (sd 1.5–1.7).
- **Organic, bevelled cave edges.** 25.9 % of the cave boundary is axis-aligned. The concept has 17.9 %; the game's c-site-4 has 64.9 %. Visual air differs from collision air on 1.8 % of the frame.
- **Warm headlamp.** In the cavern, at 0.35 tile in front of the lamp, the beam is L\* 83.5 with b\* +17.6. The game's cone adds +7.8 L\* and is cool (b\* −4.8).

Edge density in the shaft is 0.085 (concept 0.077, game 0.028). The single change that moves the picture most is drawing unexplored rock as dark, position-only strata instead of a flat light fog.

What does **not** close is mostly authored art: the lander, lamp posts, wreck, beacon, crystals and rust paint, plus the camera framing. It also shows in the measured gaps. Highlight range is p98 L\* 41–46 against 56–65, and warm-accent share is 0.17–0.62 % against 0.63–3.86 %. The cave back wall is too smooth: 67 % of the cavern frame sits within 10 levels of one value, against a gate of ≤ 25 %. Every decoration in these renders is prototype art drawn in code. It shows placement and lighting technique, not production quality.

Main sheet: [`images/compare.jpg`](images/compare.jpg), a reduced copy of `out/compare.png`, which `compare.py` regenerates.

---

## 1. What was built

| File (under `docs/art-audit/prototype/`; outputs marked † are regenerated and not committed) | Role |
|---|---|
| `index.html`, `proto.js` (922 lines, Canvas 2D) | The renderer. URL parameters: `scene=surface\|shaft\|cavern`, `vw`, `vh`, `dpr`, `camera=game\|frame`, `tilecss`, `ls` (light-map scale), `perf=N`, `debug=regions\|air\|albedo\|light`, `scramble=1`. |
| `render.mjs` | Starts a static server on a free port and drives headless Chromium (`/opt/pw-browsers/chromium`, SwiftShader). Exports exact canvas pixels via `toDataURL`. Writes `out/render-report.json` †. It reads the game atlas from `assets/campaign/generated/`. |
| `metrics.py` | Metrics from the earlier audits, with the same definitions as their working scripts (not committed): L\*, mode share, edge density and warm share from `work/lighting/stats.py`; axis-aligned share from `work/terrain/boundary.py`; `mean_grad` and flat share from `work/terrain/gridlock.py`. Adds a wall-profile probe and a headlamp-axis probe. Writes `out/metrics.json` and `out/metrics.txt`. |
| `compare.py` | Builds `out/compare.png` †: concept crop, then game capture, then prototype, for each situation (desktop, then portrait), plus a framing row. |
| `game/capture-portrait-cavern.mjs`, `game/p-portrait-cavern-site4@3.png` † | Not committed. The one game capture that was missing: portrait 393x851@3 at W01-SITE-4. It uses the same fixture as `c-site-W01-SITE-4` and was captured on a private dev server (port 5247), stopped afterwards. |
| `assets/` | `fresh-w01.json`, and `proto-wreck.svg`/`proto-beacon.svg` from the asset audit (labelled "not game art"). The game's `w01-atlas-3x-0.png/.json` was served from `assets/campaign/generated/` by `render.mjs`; since audit T13b it serves the W01 @3x zone pages listed in `w01-zones.json` instead (same frames, same renderer). Nothing in the game was modified. |

**Outputs** (`out/`; only `metrics.txt`, `metrics.json` and `hidden-info-test.txt` are committed):
- Main renders: `proto-{surface,shaft,cavern}-1440x900@2.png` and `proto-{surface,shaft,cavern}-393x851@2.png`. The desktop surface is committed at half size as `prototype/proto-surface.jpg`.
- Framing variants: `proto-cavern-gamecam-1440x900@2.png` (the game's camera rule), and `proto-shaft-conceptzoom-1440x900@2.png` and `proto-cavern-conceptzoom-1440x900@2.png` (tile 90 CSS px, about the concept's 16 tiles across; committed at half size as `prototype/proto-shaft-conceptzoom.jpg` and `prototype/proto-cavern-conceptzoom.jpg`).
- Debug layers: `debug-{regions,air,albedo,light}-*.png`.
- Hidden-information test: `test-scrambled-{shaft,cavern}-1440x900.png` and `hidden-info-test.txt`.
- Measurements: `swiftshader-baseline.json`, `metrics.json`, `render-report.json`.

**Scenes** (real data; game rules ported, not imported):
- **Surface.** Rig at spawn (20.5, −0.36), with discovery from that position. The camera uses the game's surface rule: `zoom 0.88` (scene.ts:787-795), surface line at 78 % of the height and home pull toward the lander (scene.ts:1057-1072). The tile is 57.6 CSS px.
- **60 m shaft.** Column 20 is cut row by row from spawn. `refreshVisibility` is ported from model.ts:579-626 and re-run every 0.25 row, so discovery is native: only the faces the lamp could see. The rig ends at y 5.64, drilling down. Tile 65.45 CSS px. This is the same world, and the same discovery rule, as `a04-dive-60m@2.png`.
- **Cavern.** This replicates the fixture behind `c-site-W01-SITE-4-wreck@2.png` in `capture-v2.mjs`: `teleport(site.x − 2, site.y + 1, r 6)`, a dug shaft at column 13, a radius-6 reveal, and the rig dropped to the floor at y 45.64 (460 m). Tile 68.7 CSS px (zoom 1.05). The wreck hull is placed at site 4 on the measured visual floor. The beacon (a prototype diegetic waypoint) goes on the first floor spot with ≥ 1.9 tiles of headroom. That spot turned out to be left of the rig, because the pillar at columns 19–22 leaves no headroom on the right. The game capture comes from a different random seed (every fixture clicks Start, and `application.ts:78` seeds randomly), so its terrain differs. Site coordinates are identical.
- **Phone.** 393x851 at DPR 2. The tile follows layout.ts:3-7, which gives **44 CSS px for widths below 600, not 48**: 38.7 at the surface, 44 in the shaft and 46.2 in the cavern.

## 2. Techniques and parameters

All are deterministic from world coordinates, so they are continuous across cells and stable across frames.

| # | Technique | How it works in the prototype | Parameters |
|---|---|---|---|
| T1 | **Position-only unknown rock (dark opaque fog)** | Unknown cells count as *visual solid* and are drawn with the band's strata material only. No rock, cave, ore or rim is drawn for them. The light map then darkens them by band. The rim lip is suppressed where the solid side is unknown, so a fog edge never looks like a real wall. | Fog multiplier by band A/B/C/D: 0.50/0.46/0.58/0.53. Remembered: 0.68/0.64/0.70/0.66. Visible: 0.78/0.74/0.80/0.76. Depth dim 0.25 % per row. Fog tint ×(0.94, 0.98, 1.06). |
| T2 | **Terrain field with smooth edges** | Per cell: visual solid = 1. Box-sampled at **16 samples per tile**, then blurred with three Gaussians (natural σ 0.30, dug σ 0.085, sky σ 0.12 tile), mixed by blurred natural/dug/sky weights (σ 0.7). Two noise terms are added: low frequency (1.1/tile; amplitude 0.24 natural, 0 dug) and a high-frequency jag (4.3/tile; 0.08 natural, 0.18 dug). Floors get 70 % less low-frequency wobble so the rig contact stays near collision. The edge is the iso-line F = 0.5, read per pixel by bilinear sampling. Signed distance ≈ (F − 0.5)/\|∇F\|. This is a continuous field and iso-line, i.e. marching squares done per pixel. | `K 16, sigma {nat .30, dug .085, sky .12}, lo {.24, 0, .04}, hi {.08, .18, .10}, floorCalm .7` |
| T3 | **Bevel lip, bevel shadow, undercut, AO** | All derived from the same signed distance. Lip: 0.085 tile on the solid side, blended toward the band's lip colour, weighted by face light (floors 1.0, walls 0.84, ceilings turn into a dark edge). A darker step follows for 0.07 tile, then a 0.03 tile undercut on the air side. AO is a σ 0.42 tile blur of solid, gain 0.58, applied in air only. In bands C/D, ceiling and side lips get a noise-driven rust seam. | `lip .085, bevelShadow .07, undercut .03, aoSigma .42, aoGain .58` |
| T4 | **Continuous slab material** | Anisotropic Worley in world space, with the edge distance computed exactly against the bisector in metric space. Bands A/B are horizontal strata: seed spacing 2.5×0.66 / 2.5×0.60 tiles, x-scale 0.27/0.30, staggered courses, ±0.10/±0.09 alternating course tone. Bands C/D are angular slabs: 1.05×0.86 / 0.82×0.70, x-scale 0.80/0.90. Each slab gets a 0.017 tile dark gap and a 0.075 tile bevel that is lit from above (+44 % on top edges, −30 % on bottom edges). Domain warp is 0.10 tile at 1.3/tile plus 0.022 at 6.5/tile. Rare cracks, ±4 % grain and speckles are added. Seeds are periodic across the 40-column world. | `BANDS[].mat` in proto.js:39-48 |
| T5 | **Hard rock as boulder inclusions** | A second field over *known* rock cells only: σ 0.20, multiplied by (0.8 + 0.4 × noise at 3.3/tile) plus 0.24 fbm, thresholded at 0.58. Fill is a faceted 0.4-tile Worley in the band's rock colour, with a dark 0.02 tile outline and a top-lit rim. 4-connected clusters merge automatically. | `rockSigma .2, rockNoise .24, rockThr .58` |
| T6 | **Back walls** | Dug air shows a recessed copy of the same strata at 50 % value. Natural cave air shows a cool teal wall (W01 `#26404b`/`#233c4c`/`#2b4650`/`#263446`) with two silhouette layers. These are built from a 1.1-tile blur of solid plus vertical-streak noise, so they hug the walls, with a soft top rim. No outlines. | proto.js, natural back-wall branch |
| T7 | **Light map with occlusion** | Quarter device resolution (720×450 on desktop). Per-cell base levels from T1, sharpened bilinear (ramp over half a tile). Lights add colour × attenuation × cone × visibility. Visibility comes from **720 rays** marched on the visual field at 1/32 tile, with 0.30 tile of penetration so wall faces light up but rock interiors do not. Composite: multiply by light/2, add the frame onto itself (×2) for a 0–2× light range, then add the additive layer. | Headlamp: from the cabin front (+0.40, −0.13), 14° down, outer 24°, inner 9°, range 4.3 tiles, I 1.15, colour (1, 0.80, 0.55). Pool: range 2.3, I 0.6. Beacon: cyan range 2.1, I 0.42, plus a warm foot light. Lamp posts: range 2.8, I 0.5. Crystals: range 1.0, I 0.22. |
| T8 | **Additive layer** | Warm cone haze in visual air only (0.34), pool haze 0.15, and emitter halos: lamp flare, lamp posts, the beacon diamond (r 1.0, I 0.42), crystals, O3/O4 glints. **Rim light**: lamp contribution × lip mask × 150, so edges near the lamp glint warm. 46 dust motes in the cone. Emissive cores (bulbs, the beacon diamond, a power-box screen) are drawn after the light map. Underground only, a vignette darkens the corners by 20 %. | proto.js `computeLight`, `composite` |
| T9 | **Procedural cave dressing (prototype art)** | Placed only on *known natural* boundaries, where both the air and the solid cell are known. Never on or beside an ore cell: crystals need a 3×3 neighbourhood free of deposits. Kept out of prop footprints. The exact face is found by marching the field. Ceilings get stalactites (60 %, with a rust tip in band C) and rust drips (72 % in C/D). Floors get pebbles (0–3 per cell) and boulders (35 %, at most 10). Floors and walls get amber crystals (45 % / 30 % in C/D, at most 10). The cavern render ended up with 17 stalactites, 12 drips, 10 pebbles, 3 boulders and 4 crystals. | proto.js:566-661 |
| T10 | **Embedded ores** | The game's `ore-o1..o4` sprites are drawn at 0.84 tile into a dark radial socket. The white badge (r 23 px of 144, centre 114,114) and the notch strip are clipped away, and a small dark disc (r 0.085 tile) with 1–4 tier bars replaces them. | proto.js ores block |
| T11 | **Surface (prototype art)** | Sky gradient `#132530`→`#3a5262` (concept: top `#1c2f3b`, horizon `#364b59`) with sparse stars. The planet follows the game's own placement rule (scene.ts:1144-1149), with a saturated amber crescent and a soft halo. Three faceted ridge layers at parallax 0.2/0.35/0.6, peaks up to 30/19/10 % of the frame height, with haze between layers. Three tripod lamp posts with halos and ground pools, catenary cables, three crates, a power box and 13 rocks. The lander is the existing **stage-1** sprite standing in for a physical stage-0 lander; the real stage-0 frame is a dashed wireframe. | proto.js sky and surface-kit blocks |
| T12 | **Cave-framing camera (prototype rule)** | If the rig stands in a known natural air component at least 5 rows tall, frame the component's vertical centre instead of the rig, clamped so the rig stays 1.2 tiles inside the safe area, and pull 35 % toward the component's centre column. Without it, the game's rule (rig at 43 % of the usable height) cuts the cavern ceiling off: see `proto-cavern-gamecam-1440x900@2.png`. | proto.js camera block |

**Hidden-information guarantee (measured).** With `scramble=1`, the renderer randomises every undiscovered tile after discovery has been computed (about 45 % become air, 25 % hard rock) and moves every hidden deposit. The shaft and cavern renders are then compared with the normal ones: **0 differing pixels, maximum difference 0** (`out/hidden-info-test.txt`). This holds because T1, T2, T5, T7 and T9 read unknown cells only as "solid, band B".

## 3. Results against the concept and the game

Frame statistics at 1440x900. Concept and game frames are HUD-masked as in `work/lighting/stats.py`; the prototype excludes only its corner tag. See `out/metrics.txt`.

| | L\* mean | L\* sd | p2–p98 | p98 | ≤±3 L\* of mode | warm % | edge density |
|---|---|---|---|---|---|---|---|
| Surface: concept / game a02 / **prototype** | 26.0 / 30.3 / **24.6** | 11.0 / 8.7 / **8.5** | 52.4 / 36.4 / **31.9** | 64.9 / 50.7 / **46.0** | .352 / .247 / **.295** | 2.46 / 0.25 / **0.62** | .087 / .031 / **.048** |
| 60 m shaft: concept / game a04 / **prototype** | 25.9 / 38.1 / **22.8** | 10.9 / 5.3 / **7.4** | 49.9 / 26.6 / **32.5** | 60.9 / 48.2 / **41.1** | .364 / .824 / **.405** | 0.63 / 0.23 / **0.17** | .077 / .028 / **.085** |
| Cavern: concept / game c-site-4 / **prototype** | 21.0 / 28.2 / **19.8** | 11.6 / 11.3 / **8.8** | 47.7 / 30.0 / **39.8** | 56.4 / 38.9 / **42.9** | .334 / .575 / **.487** | 3.86 / 1.26 / **0.62** | .113 / .025 / **.076** |

Region and structure measurements:

| Measure | Concept | Game today | Prototype | Audit gate |
|---|---|---|---|---|
| Unexplored rock, luma (sd) | 57 (10.6) | 84–89 (1.5–1.7) | shaft **52.8 (12.0)**, cavern **46.8 (8.6)**, surface ground **60.6 (16.0)** | 45–65, sd ≥ 7 ✔ |
| Known (lit or remembered) rock, luma | lit band 88 | 55 at 550 m (below the unknown) | shaft **84.8**, cavern **62.9** | ≥ unknown + 15 ✔ (+32, +16) |
| Cave air, luma | 33–44 | 24–39 | **46.2** (includes lit areas) | — |
| Axis-aligned share of the air boundary | cavern 17.9 %, shaft 40.5 % | c-site-4 64.9 %, a04 64.8 % | cavern **25.9 %**, shaft 69.4 % | natural cave ≤ 30 % ✔ (the dug shaft is straight by design) |
| Visual vs collision air | — | identical (square cells) | cavern **1.83 %** of frame (5.3 % of the air union); shaft 0.14 % (2.2 %) | ≤ 5 % ✔ on frame basis |
| Wall profile, rock → lip → undercut → air (luma) | 90 → 177 → 35 → 50 | 111 → 138 → 50 | **62–80 → 226 → 36 → 50** (shaft, row 4.5) | lip ≥ +55, undercut ≤ −8 ✔ |
| Tile-normalised mean gradient (`gridlock.py`) | 3.5–3.75 | 0.93 | shaft **2.47**, cavern **2.27** | ≥ 2.5 ✘ (just under) |
| Playfield within 10 luma of one value | — | a04 86.4 %, c-site-4 61.4 % | shaft **48.8 %**, cavern **67.3 %** | ≤ 25 % ✘ |
| Headlamp axis at 0.35 / 0.8 / 1.5 tile | core L\* 75, b\* +26 at the lamp, gone by ~1.8 tiles | +7.8 L\*, b\* −4.8 | **83.5/+17.6, 73.7/+14.8, 45.4/+14.7** | core ≥ 70, b\* +15…+30 ✔ |
| Hidden-cave identity | — | passes | **0 px changed under scramble** | must pass ✔ |

Phone renders (`proto-*-393x851@2.png`): L\* 24.5 / 23.1 / 20.1, edge density 0.025 / 0.057 / 0.057, cavern p2–p98 47.4. The surface edge density is low because at tile 38.7 most of a 9:19 frame is sky.

## 4. What got close and what did not, and why

| Element | Result | Why (technique or art) |
|---|---|---|
| Unexplored rock and the value ladder | **Close.** Dark textured strata everywhere, lighter where discovered, the warm lamp brightest. Matches the concept's shaft panel (`images/compare.jpg`, row 2). | Technique only (T1, T4, T7). In the game this is lighting.ts:72-77 plus terrain.ts:177-181/209-210. |
| Continuous strata | **Close in shaft and surface.** Courses run across cells and bands change along a wobbling line. Mean gradient 2.47 against 3.5–3.75. | Technique. The rest of the gap is painted detail (speckle, chips, painted bevels) on the concept's plates. |
| Shaft walls | **Close.** Crisp near-white lip, dark undercut, lit band beside the shaft. | Technique (T2, T3, T7). The concept's 2.3-rig-wide shaft is a game-design difference: the game digs 1-tile shafts. |
| Cave silhouette | **Close in shape language**: arched, lumpy, chamfered, with stalactites, rust seams and silhouettes behind. **Not** the concept's single grand arch. | The W01 gallery is a tall chamber with ledges, a 1-cell pillar under the rig and one-cell pockets. That is generator geometry (terrain audit R7), not rendering. |
| Hard rock | **Partly.** It reads as embedded boulders instead of grid squares, but it is still cell-sized and outlined. | Technique is adequate. Real boulder art (asset audit R5: 48 frames) would read better. Greyscale readability is not validated. |
| Headlamp | **Close in the cavern**: warm cone with motes and glinting rims. **Weak in the 1-tile shaft**: the cone hits the wall after 0.1 tile. | Technique. Shaft composition is a camera, rig-size and shaft-width question (terrain audit R8). |
| Highlights and tonal range | **Not close.** p98 41–46 against 56–65; sd 7.4–8.8 against 10.9–11.6. | Both. Lit surfaces are a small share of the frame, and the concept paints bright top bevels on most plates and lights them warm. A production shader could push albedo × light further; the rest is art. |
| Warm accents | **Not close.** 0.17–0.62 % against 0.63–3.86 %. | Mostly art. The concept's warm share comes from the orange lander and crates, lamp glow, painted rust fields and crystal clusters. The prototype's rust and crystals are code placeholders limited by honest placement rules (no crystals next to ore). |
| Cave back wall | **Partly.** The cool teal value is right, but at 67 % flat share it is too smooth. | Art. The concept's distant rock is painted. Two procedural silhouette layers cannot replace two painted backdrop strips per band (lighting audit R6). |
| Surface | **Layout close, quality not.** Ridges, planet, lamp posts, cables and crates are all there. | Art. The stand-in lander is the flat stage-1 frame. Lamps, crates and rocks are simple shapes. The fresh world has no dug holes, which the concept surface shows. |
| Wreck and beacon | **Grounded and lit**, but placeholder. | Art. They are the asset audit's layered-SVG prototypes; production props need about 2–2.5 weeks (asset audit R3). |
| Framing | **Not the concept's.** The game shows about 22 tiles across on desktop and 8.9 on phone; the concept shows about 16 and 6. | Camera. The concept-zoom variants (`proto-*-conceptzoom-*`) look much closer with the same renderer. This is an owner decision (tech audit R10). |

Overall, looking at `images/compare.jpg`: shaft and cavern move from "debug view" to "same family as the concept". The surface moves less, because its gap is mostly props.

## 5. Frame time (1440x900 at DPR 2, 40 frames, this 4-CPU container, SwiftShader)

| Stage | Surface | Shaft | Cavern | Notes |
|---|---|---|---|---|
| Light map + additive layer, JS per frame, p50 / p95 (ms) | 26.0 / 40.9 | 16.4 / 26.5 | 24.9 / 39.4 | Quarter resolution, 720×450. At **eighth resolution (`ls=8`) the cavern takes 9.3 / 15.5**. Phone: 5.9–12.2 p50. |
| Composite, p50 (ms) | 844 | 920 | 974 | **Not meaningful.** On this software rasteriser a single full-screen canvas copy takes 145 ms, and copy + multiply + add take 243 ms (`out/swiftshader-baseline.json`). On a GPU these are a few textured quads. |
| One-off terrain bake (ms) | 2 883 | 4 561 | 4 675 | Fields 0.74–0.98 s, plus a JS per-pixel pass over 5.2 MP of 1.6–3.5 s. Phone: 1.4–1.9 s. |

Reading: as written, the CPU light map costs a phone frame on its own, and the CPU terrain bake is far too slow for runtime digging. **Both techniques belong on the GPU in the game.** Rays stay on the CPU (720 rays × 138 steps ≈ 1–2 ms). The polygon becomes a triangle fan drawn into a DynamicTexture with ADD blending. The terrain field, edges and material become one fragment shader reading a small field texture. The per-pixel maths is cheap for a GPU (about 12 bilinear taps plus 9 Worley seeds) but expensive in JS.

## 6. Engineering effort to bring each technique into `src/campaign/render/*`

Estimates are for one engineer who knows the code, and exclude art.

| Technique | Where in the game today | Route | Effort | Risk |
|---|---|---|---|---|
| T1 value re-key | lighting.ts:72-77 (unknown 0.16, visible up to 0.52), terrain.ts:177-181/209-210 (flat `#596771` plus soil at 0.23) | Per-band fog/remembered/visible levels as in §2; draw unknown with the band strata page at full value and let darkness do the rest | **1–2 d** | Low. Hidden-info safety already holds: the stamp is `"unknown"` (terrain.ts:148-149). Retune the high-contrast mode. |
| T4 slab material | render-sources.mjs:30-69 (opaque plates over strata, fade mask, one layout for all bands) | **(a)** Offline: generate periodic Worley pages per band and material (seed spacing must divide the page: 8 tiles → sx 2.0/2.67), 2–3 variants, @2x/@3x. **(b)** Inside the T2 shader. | (a) **2–3 d** + rebake; (b) inside T2 | Low. Memory (tech audit: 0.48 MiB of W02 headroom). |
| T2+T3 field edges, lip, undercut, AO | terrain.ts:162-164 (per-cell clip), 248-277 (2 px rims), 141-147 (4-bit mask); terrain raster capped at DPR 1.5 (terrain.ts:41) | **Preferred:** new `render/terrain-shader.ts`. A field texture of 16 texels per tile (whole W01 at R8 ≈ 0.6 MB) is updated with `texSubImage2D` on dig or discovery; one Phaser shader quad computes F, the distance, lip, AO and material; RetainedTerrain stays as the Canvas fallback with T1 only. **Alternative:** dual-grid baked edge tiles (tech audit R5), rendered offline by this prototype's field code. | Shader **8–12 d**; baked tiles **6–9 d** + atlas memory | Medium. Collision mismatch (1.8 % of frame); WebGL1 precision on older iOS; quality tiers for phones at DPR 3; periodic noise across the 40-column wrap (the prototype's value noise is not periodic yet). |
| T5 boulder inclusions | Per-cell rock fill, terrain.ts:177-247 | A second field channel in the same shader | **1–2 d** after T2 | Medium. Greyscale readability ΔL\* ≥ 8 and drill-time predictability need a playtest. |
| T6 back walls | Wall pages halved (art.ts:88-101) at 0.55 alpha | Natural/dug flag from pristine tiles (regenerate from seed; no save change), teal wall plus silhouette layers in the shader; later, painted strips | **2–3 d** | Low |
| T7+T8 light stack (occlusion, 0–2 range, rim light) | lighting.ts:99-152 (destination-out erase), scene.ts:243-261 (18 % cream normal blend) | CPU ray cast to a triangle-fan mesh drawn into a quarter-resolution ADD DynamicTexture; base levels as a 1-texel-per-cell texture with linear filtering (replaces `ctx.filter` blur at lighting.ts:86); composite shader albedo × light × 2 + additive; rim term reads the same lip mask | **6–9 d** | Medium. Phone fill rate; temporal stability of the ray edges (needs smoothing over 2–3 frames); high-contrast and reduced-motion variants. |
| T9 cave dressing placement | None exists | Hash placement over known natural boundary faces, field-marched contact point, exclusion rules (ore 3×3, props, at most N per screen), redrawn with dirty cells | **3–4 d** code; art 1.5–2 wk (asset audit R4) | Medium. Amber crystals can be read as ore, so they need a playtest. |
| T10 ore tier marks and sockets | render-sources.mjs:8-11 (r 14 white-ringed badge), scene.ts:1225-1240 | Regenerate 16 ore/package frames per world without the badge, small glyph, socket drawn under the ore | **2 d** (overlays audit R2) | Low |
| T11 surface sky, ridges, planet, kit | scene.ts:1137-1176 (2 ridge TileSprites, desaturated body), 1325-1332 (hidden lamp dots) | 3 ridge layers with parallax, recoloured body; seed-placed surface kit outside the pad | **2–3 d** code + **L** art | Low |
| T12 cave framing | scene.ts:1057-1066 (rig at 43 % of usable height) | Component-based framing with hysteresis, plus the camera-whip fix (overlays audit R7a) | **1–2 d** | Medium (gameplay: seeing ahead while digging). |
| Scramble test | — | Port `scramble=1` as a renderer test: randomise unknown tiles and expect identical pixels | **1 d** | None. It protects T1, T2 and T9. |

**Total:** about 6–8 engineer-weeks for the W01 technique set, plus W02 retuning (about 1 week). On top comes the art the prototype only stands in for: about 40–45 artist-days of props by the asset audit's estimate, plus painted back-wall strips and decals.

## 7. Risks and limits of this prototype

- **Placeholder art is not production art.** All dressing, surface kit, ridges and the planet are drawn in code. Wreck and beacon are the asset audit's prototype SVGs. The lander is the stage-1 sprite at a stage-0 moment.
- **Single frames.** Motion was not judged: shimmer of the 720-ray light edges, decoration pop-in as cells are discovered, the cost of redrawing the field on each dig.
- **Collision honesty.** Natural walls move by up to about 0.2 tile. On a 1-cell pillar (the rig's perch in the cavern) the visual top is rounded, so the rig appears to balance on a nub.
- **Performance figures are CPU and SwiftShader numbers.** Only the JS light-map time is representative. The shader route has not been measured on a real phone GPU.
- **Art direction choices not settled.** I kept the game's band identities (band C brown, band D violet); the concept's cavern is neutral slate. The beacon is a prototype diegetic waypoint, not a game object at site 4.
- **Wrap seam.** The Worley seeds are periodic over 40 columns; the value noise is not, so a view crossing x = 0 would show a seam. None of the three views does.
- **Not measured:** owner review, accessibility (high contrast, colour-vision checks), W02.

## 8. Reproduce

From the repository root, after `npm ci`:

```
node docs/art-audit/prototype/render.mjs perf=40      # all renders, debug layers, scramble test, frame-time probe
CAPTURES=<folder with shots/ and shots2/> python3 docs/art-audit/prototype/metrics.py > docs/art-audit/prototype/out/metrics.txt
CAPTURES=<folder with shots/ and shots2/> python3 docs/art-audit/prototype/compare.py   # out/compare.png and out/compare.jpg
```

The captures and `game/p-portrait-cavern-site4@3.png` are not committed, so `metrics.py` and `compare.py` run only where they exist. `render.mjs` needs only the repository.
