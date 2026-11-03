# 02 · Lighting, colour, value structure and atmosphere

Dimension key: `lighting`. Scope: palette and value hierarchy, headlamp, darkness with depth, fog of war, shadows and ambient occlusion, rim light, emissive accents, sky, planet and mountain layers, and colour grading. Repository state: `origin/main` 644e222, read-only.

Abbreviations: L\* is CIE L\* (0 = black, 100 = white), computed from sRGB. b\* is the CIE yellow-blue axis; positive values are warm. "Luma" is Rec. 709 luma on 0–255, the measure the improvement plan used. File names without a path are captures in `scratchpad/v2/shots/` or `shots2/`. All derived images are in `scratchpad/art-audit/work/lighting/`, abbreviated `work/` below.

---

## 1. Verdict

The pale blue-grey wash is not caused by hue. The concept board is also a cool blue-slate world: whole-frame chroma is 6–10 in both the board and the game, and mean b\* is −1.5 to −7 on the board and −4 to −10 in the game. The problem is value. Measured in L\*, the game's world is a **high-key image with half the concept's tonal range, and its value order is inverted**:

1. **Unexplored rock is too bright.** It fills 60–80 % of every underground frame. The concept shows it at L\* 24; the game draws it at L\* 36–38 on every W01 band (the concept's lit tunnel walls are L\* 38) and at L\* 48 in W02. From 60 m to 550 m it darkens by less than 2 L\*.
2. **The frame has one value.** In the 60 m and 150 m dives, 82 % of non-HUD pixels lie within ±3 L\* of a single value (38.5). The concept spreads its pixels: only 36 % fall within ±3 of its mode. The concept's 2nd–98th percentile range is 45–52 L\*; the game's is 26–30.
3. **There are no highlights and nothing warm emits light.** The concept's 98th-percentile pixel is L\* 54–65 (lamp cores, rims, bulbs). The game's is 39–48. Its "headlamp" is a cool, blue-grey 7–9 L\* lift on fog (b\* −4.8); the concept's is a warm beam (b\* +12) at L\* 72–75 at the lamp.
4. **At depth the order inverts.** At 465 m, the space the player has explored and lit is darker (cave air L\* 10–11, lit soil 24) than the rock they have not explored (L\* 35–36). The headlamp beam is darker than the fog it points into (`lamp-falloff.png`).

The biggest single reason is a deliberate over-correction. The previous audit found a black void (89 % of pixels below luma 40). The plan then set a **one-sided** gate, "≤ 45 % below luma 40", and the implementation met it by fogging unknown rock at only 16 % darkness (`lighting.ts:73-77`) over a light base colour (`terrain.ts:177-181`). It reached 0.3–5.4 % of pixels below luma 40. The concept's own shaft panel has 10 %, and its cavern panel has 42 %. The plan's own D4 gate, "histograms within tolerance of D0", was never measured (`IMPROVEMENT_COVERAGE.md:58`).

A one-day prototype (§2.6) shows that re-keying the darkness and adding an additive warm cone moves the mean value to the concept's level (shaft L\* 38.1 → 21.3; concept 25.7). It does **not** restore the concept's tonal spread. That needs rim and bevel light, occlusion, emissive accents and higher-contrast rock textures (§5).

---

## 2. Side-by-side evidence

### 2.1 Method

- **Concept crops.** Panels were cut from `d0-target-board.png` at their measured borders: desktop x 227–917; surface y 143–499, shaft 527–878, cavern 904–1281; portrait x 937–1180. The results are `work/concept-{surface,shaft,cavern}[_p].png`.
- **HUD masking.** HUD rectangles are excluded from every statistic. Scripts: `work/stats.py` (masks, histograms, edge density), `regions.py` (matched regions), `profile.py` (lamp falloff), `lab.py` (warmth), `mode.py` (value concentration).
- **Comparison sheets.** Each shows colour, a pure-value L\* map and an L\* histogram for concept, current build and prototype:
  - `work/cmp-shaft.png`
  - `work/cmp-cavern.png`
  - `work/cmp-surface.png`
  - `work/cmp-portrait.png`
- **Charts.** `work/value-ladder.png` and `work/lamp-falloff.png`.
- **Re-captures.** The same world (`fresh-w01.json`) was captured before and after the prototype by one script (`work/capture-proto.mjs`), giving `work/caps/base-*.png` and `work/caps/proto-*.png`. `base-dive-60m` matches the layout of `a04-dive-60m@2`.

### 2.2 Whole-frame value and colour (HUD masked)

| Frame | Mean RGB | L\* mean | L\* sd | p5 | p50 | p95 | p98 | share within ±3 L\* of mode | edge density† | warm accents‡ |
|---|---|---|---|---|---|---|---|---|---|---|
| **Concept surface** | 50,64,72 | 25.9 | 10.9 | 14.6 | 23.7 | 42.9 | 64.9 | 35 % | 0.082 | 2.5 % |
| a02-spawn | 56,74,83 | 30.3 | 8.7 | 16.5 | 30.5 | 41.5 | 50.7 | 25 % | 0.031 | 0.25 % |
| **Concept 60 m shaft** | 54,63,69 | 25.7 | 10.6 | 13.7 | 23.5 | 43.9 | 57.4 | 36 % | 0.073 | 0.6 % |
| a04-dive-60m | 80,92,99 | 38.1 | 5.3 | 28.5 | 38.0 | 45.0 | 48.1 | **82 %** | 0.028 | 0.2 % |
| a05-dive-150m | 74,91,100 | 37.4 | 5.5 | 27.6 | 37.6 | 44.1 | 47.7 | **83 %** | 0.029 | 0.35 % |
| e07-w02-dive-80m | 93,122,132 | 49.1 | 10.4 | 28.9 | 48.0 | 74.6 | — | 74 % | 0.032 | 0.02 % |
| **Concept 300 m cavern** | 48,51,52 | 20.8 | 11.2 | 9.5 | 17.6 | 40.3 | 53.6 | 34 % | 0.109 | 3.9 % |
| c-site-W01-SITE-4-wreck (465 m) | 65,67,74 | 28.2 | 11.3 | 9.0 | 35.2 | 37.3 | 39.0 | 57 % | 0.025 | 1.3 % |

† Edge density: fraction of pixels with an L\* gradient above 6 per pixel after resizing to 690 px wide.
‡ Warm accents: pixels with hue 15–55°, S > 0.35 and V > 0.35.

On the legacy luma gate (`work/luma40.py`), pixels below luma 40 / mean luma / luma p99 are: concept shaft 10.1 % / 61 / 183; concept cavern 42.3 % / 51 / 156; a04 0.3 % / 90 / 125; c-site-4 25.4 % / 67 / 99. The game's mean luma is about 30 levels brighter than the concept's, and its brightest 1 % is 55–60 levels dimmer.

### 2.3 60 m shaft: concept vs `a04-dive-60m@2` (`work/cmp-shaft.png`)

**What the concept shows**
- **Rock.** A dark slate mass, L\* 24, with visible strata (region sd 4.7).
- **Walls.** The one-tile columns next to the shaft are lit to L\* 38.
- **Rims.** A near-white bevel line, peak L\* 87–89, runs down both shaft walls.
- **Shaft interior.** Unlit, L\* 13.5, with a teal tint (S 0.42).
- **Headlamp.** A warm beam (b\* +11.6) leaves the lamp at L\* 75 and falls to the surrounding level within about 1.8 tiles (`lamp-falloff.png`).
- **Overall.** The darkest areas are the shaft and the rock far from it; the brightest are the beam, the rims and the ores.

**What the game shows**

| Region | Concept L\* | Game L\* |
|---|---|---|
| Unexplored rock | 24.1 | **37.7**, sd 0.7: texture invisible |
| Discovered wall next to the shaft | 38.4 | 46.7 |
| Shaft interior | 13.5 | 21.4 |
| Wall rim | 87–89 | 57.8 |

- The rim peaks only 11 above the wall; the concept's peaks 50 above.
- **The "cone"** is a trapezoid below the rig. It is 7–9 L\* brighter than the rock beside it (45.5 vs 37.7), cool-coloured (#616d73, b\* −4.8), and fades over about 4 tiles.
- **Around the rig** a cream disc of about 2.5 tiles' radius lifts everything toward grey. Crop: `work/a04-rig-crop.png`.
- **The L\* map** of a04 is nearly a flat grey card, with one histogram spike at 38.

### 2.4 300 m cavern: concept vs `c-site-W01-SITE-4-wreck@2` (465 m) (`work/cmp-cavern.png`)

**What the concept shows**
- **Cave air.** Not black: a deep teal void (L\* 14, S 0.48) with darker rock silhouettes behind it, which gives atmospheric depth.
- **Rock mass.** Ceiling and floor are L\* 21–24, with lit upper faces and rust drips.
- **Emitters.** Three warm or cyan sources:
  - the headlamp (L\* 72 at the lamp);
  - the beacon diamond (L\* 54, S 0.69, cyan);
  - amber crystal clusters, which light a warm floor pool (L\* 45, S 0.48).
- **Overall.** 60 % of pixels are below L\* 20, yet 3.9 % are warm accents.

**What the game shows**

| Region | Game L\* | Concept equivalent |
|---|---|---|
| Discovered pocket (cave air) | 10–11, neutral brown-black #1d1b1d, S 0.07 | teal void, L\* 14 |
| Surrounding unexplored rock | 35.6 (band C), 36.0 (band D) | rock mass, L\* 21–24 |
| Beam side of the lamp, 0.5–1.5 tiles | 23.8 → 18.0 | beam, L\* 72 at the lamp |

- The beam side then jumps *up* to 31.6 at the fog edge 2 tiles away.
- The histogram is bimodal, with peaks at 9 (cave) and 35 (fog) and almost nothing above 39.
- The site sprite and the ores sit under the darkness layer. No beacon, crystal or wreck emits light.
- `c-site-W01-SITE-5-geode@2` has the same structure in lilac: dark explored space inside a lighter fog field.

### 2.5 Surface: concept vs `a02-spawn-1440x900@2` and `d01-surface-M1-built@2` (`work/cmp-surface.png`)

| Element | Concept | Game |
|---|---|---|
| Sky top | L\* 17.5 | 14.5 |
| Sky at horizon | 28.3 | **35.5** (gradient `#14232b → #48616b`) |
| Mountains | three ridge layers with atmospheric perspective, peaks ≈ 31 % of frame height | two ridges, peaks ≈ 11 % of frame height (ground y ≈ 1400, peaks ≈ 1200 of 1800) |
| Ground top row (exposed tiles) | L\* 36, bright lip | 38.9 |
| Deep ground | **20.4** | **37.9**: no falloff below the surface row |
| Planet crescent | saturated amber, glowing | `#987E5B` desaturated tan (crop: crescent S 0.31, b\* low) |
| Emitters | two lamp-post bulbs (L\* 66, b\* +43) with halos, cable glints, lit lander windows | two 3 px dots and 13–16 % alpha ellipses at the dock (`scene.ts:1324-1333, 1359-1360`); warm-accent share 0.25 % vs 2.5 % |

Notes on the game column:
- **Sky:** the horizon is brighter than most of the ridge faces, so the near-ridge faces (#52636a) barely separate from the sky.
- **Mountains:** the game's ridges are equal-height pyramids. Their values are close to the horizon's, so the band reads as a pale zig-zag.
- **Ground:** the whole ground block is one pale value.

### 2.6 Portrait, W02, and what a value-only fix achieves

- **Portrait 393×851@3** (`work/cmp-portrait.png`). Mean L\* is 30.6 (concept) vs 38.3 (game). Same pattern; the tile is smaller in frame, so the lamp covers even less area.
- **W02** (`e07-w02-dive-80m@2`). Unexplored ice-rock is L\* 48.0 (#5c7680), and 74 % of pixels sit within ±3 L\* of 47.5. It is the palest frame in the set.

**The prototype** (`work/proto/`, diffs in `work/proto-*.diff`). The changes:
- Unknown fog 0.16 → 0.34.
- Visible known darkness `0.22 + (1−ambient)·0.45`.
- Unknown base `#596771` → `#30383f`, with the band rock pattern at 0.42 alpha instead of the soil pattern at 0.23.
- The cream lamp removed.
- An additive warm cone (±0.36 rad, 3.4 tiles) and a 1.6-tile pool on a second canvas texture at depth 17.1, blended ADD.

Results:

| Measure | Concept | Current | Prototype |
|---|---|---|---|
| Shaft frame mean L\* | 25.7 | 38.1 | **21.3** |
| Unexplored rock | 24.1 | 37.7 | 18.5 (slightly too dark; tune toward 0.26–0.28) |
| Lit wall next to tunnel | 38.4 | 46.7 | 39.3 |
| Shaft interior | 13.5 | 21.4 | 17.9 |
| Cone 1–2 tiles from lamp | 41.9, b\* +11.6 | 45.5, b\* −4.8 | 46.6, b\* +8.0 |
| 465 m beam side | 31 | 23.5 | 48.2, b\* +21.6 (now overshoots) |
| 465 m unexplored rock | 24 | 35.4 | 17.8 |
| Surface deep ground | 20.4 | 37.9 | 18.9 |
| p98 L\* (shaft) | 57.4 | 48.1 | 43.5 |
| Edge density (shaft) | 0.073 | 0.028 | 0.029 |
| Share within ±3 of mode | 36 % | 82 % | **78 %** |

Conclusions:
- The key and the value order now match the concept (`value-ladder.png`, `proto-dive-60m.png`, `proto-site4-465m.png`).
- The flatness does not change: the share at one value stays at 78 %, edge density is still under half the concept's, and the brightest 2 % is still 14 L\* short.
- The rest is structural: rims, occlusion, emitters and textured rock (§3.4–3.7).
- The prototype also exposes one rule problem. Without occlusion the beam lights unexplored rock below the rig (`proto-dive-60m.png`). The concept confines light to open space and wall faces.

---

## 3. Root causes in code and assets

### 3.1 Unknown rock is lit like known rock, and almost never darkened
**Darkness model.** In `src/campaign/render/lighting.ts:73-77`:
- unknown cells get darkness **0.16**;
- visible known cells get `(1 − ambient) · 0.72`;
- remembered known cells get up to 0.52.

The comment at `:72` states the intent: "Unknown rock stays legible at depth".

**Base colour.** Unknown cells are filled with `#596771` (`#5d7782` in W02) at `src/campaign/render/terrain.ts:177-181`. That is L\* ≈ 43 before fog. Over it goes the **band soil** pattern at 0.23 alpha (`terrain.ts:193, 209-210`). The soil pages are the lightest material in each band: mean RGB 114,124,130 for W01-A and 166,217,226 for W02-A (`assets/campaign/generated/bands/*-soil-2x.png`).

**Result.** Unknown rock is L\* 36–38 everywhere in W01 and L\* 48 in W02. It is the largest area on screen and sits at the concept's *lit-wall* value.

**Inversion.**
- The 0.16 is constant while known-cell darkness grows with band ambient. From band B onward, a lit, visible, discovered tile is fogged harder than an unknown one: 0.24, then 0.39 in band C and 0.52 in band D, against 0.16.
- The ambient values come from `src/campaign/world-content.ts:28,41,54,67` (W01 0.85/0.67/0.46/0.28) and the corresponding W02 entries.
- The deviation from the spec is direct. GFX-P5 specified unknown fog "tinted `#05090d` at max alpha 0.7", and §7.1 set unknown rock at L\* 12–20 (`docs/improvement-plan/analysis/04-graphics.md`). The plan's D4 kept "1 = unknown" in its fog texture (`IMPROVEMENT_PLAN.md:306`).

### 3.2 The acceptance gate rewarded brightness
**Gate.** The plan's only *measured* darkness gate was "≤ 45 % of pixels below luma 40" (`docs/IMPROVEMENT_PLAN.md:311`; T10 at `:46`).

**Reported outcome.** `docs/IMPROVEMENT_PROGRESS.md` reports a drop from 89.5 % to **5.4 %** and calls it "an interim brightness measure".

**Unmeasured gates.** The same D4 gate list includes "the histograms fall within tolerance of D0" and "the headlamp and rig hold the brightest pixels". `docs/IMPROVEMENT_COVERAGE.md:58` records the first as unproven. The second fails in a04: the brightest 0.5 % of non-HUD pixels (L\* ≥ 59) cluster on the ore column, the canvas labels and the rig body. None are in the cone.

### 3.3 The headlamp only removes darkness, so it can never be warm or brighter than its surroundings
**Mechanism.** The radial and the cone are `destination-out` erasures of the darkness texture (`lighting.ts:99-133`). The cone is drawn at `:119-133` with opacity .85 → .55 → 0 over 5.5 tiles, ±0.49 rad, pointing down while drilling (`:113-118`).

**Consequences.**
- An erase can only reveal the underlying terrain colour. Its ceiling is the unfogged material, and it has no hue of its own.
- Over unknown rock the fog is 0.16, so the maximum gain is about 14 %. The measured gain is +7.8 L\*.
- The plan adopted this erase-only design (D4 spec, `IMPROVEMENT_PLAN.md:305-309`). GFX-P5's "additive warm pointlight" step was dropped.

**The cream lamp.** The only warm element is `campaign-lamp` (`src/campaign/scene.ts:244-261`):
- a 256 px radial of `rgba(246,225,175,.18 → .08 → 0)`;
- drawn with **normal** blending at depth 17.2 and 5 tiles wide (`:1177`).

Normal-blending 18 % pale cream over dark colours raises their value and lowers their saturation. Over the shaft interior (`#243540`) it yields about L\* 30–35. This is the visible soft grey disc around the rig in a04, a05 and a07: a "fog-coloured" halo, not light.

### 3.4 No occlusion, no ambient occlusion, no contact shadows
**No occlusion.** The light map is a per-cell darkness fill blurred at `blur(max(2, tile·0.35)px)` on a quarter-resolution canvas (`lighting.ts:27-29, 67-88`). Nothing in it knows about walls. The radial and cone erase through rock.

**No ambient occlusion or contact shadow.** There is no darkening where back wall meets solid face, and no contact shadow under the rig or under props. The terrain draws only a flat base, a pattern and a rim (`terrain.ts:191-277`).

**What the concept does instead.** It separates the shaft interior (L\* 13.5) from the lit wall (L\* 38) with a hard bevel. The game separates them with a 1/4-resolution blur.

### 3.5 Rims are thin, unlit and the same on every side
**Code.** `terrain.ts:248-277` strokes exposed edges with `band.rock[2]` or `band.soil[2]`, which is the base colour **+32 per channel** (`src/campaign/render/bands.ts:23-27`). The stroke is 2 px wide (2.5 px in high contrast), on all four sides alike.

**Measured.** The rim peaks at L\* 58 against a 47 wall. The concept rim is about 4 px at 690 px panel width (≈ 17 device px at 2880) and peaks at L\* 87–89. There is no top-lit or under-shadow distinction, and no reaction to the lamp: the rim is baked into the retained terrain.

### 3.6 Materials have no light direction and little internal contrast
**Band pages.** All band pages (`assets/campaign/generated/bands/w0?-?-{soil,rock,wall}-2x.png`) are flat-shaded slabs. Within each page, luma sd is about 9/255 for soil and rock and 3.7/255 for walls (`work/band-textures.png`). Slabs have no lit top edge or shadowed underside, so even correctly-valued rock reads as a smooth grey card.

**Unknown rock.** It uses that texture at 0.23 alpha over a flat base, giving a region sd of 0.7 L\*. The concept's far rock is sd 4.7 with strata.

**Edge density.** This is why it is 0.025–0.03 against 0.073–0.109 in the concept, and why fixing the key alone leaves the image flat (§2.6).

### 3.7 Emissive accents are missing or subtractive
**Rare ores.** O3/O4 ores get a 0.55 `destination-out` "glint brush" (`lighting.ts:134-154`). It reveals, but does not add, light, and lit O2–O4 get small cross sprites (`scene.ts:1240-1262`).

**Depth order.** Ore sprites (depth 13) and site/structure art (depth 15, e.g. `scene.ts:1768`) sit **under** the darkness map (depth 17). Fog dims them, and none of them emits light.

**Missing assets.** The atlas `assets/campaign/generated/w01-runtime.json` has `site-beacon`, `mission-beacon`, `dock-stage-*`, `refuge-*` and `relay-*`, but no lamp-post or emissive frames. Nothing on the surface matches the concept's two lit lamp tripods; the only lights are the dock dots and ellipses at 13–16 % alpha.

### 3.8 Sky, planet and ridges are pale, small and single-layer
**Sky.** The gradient is generated at `scene.ts:211-226` (`#14232b → #48616b`; W02 `#142b45 → #5d91a0`). Its horizon (L\* 35.5) is 7 L\* brighter than the concept's.

**Ridges.** `assets/campaign/source/w01-ridge-{far,near}.svg` (far `#304753`/`#415865`, peaks at 242/384 px; near `#293E48`/`#52636A`, peaks at 133/384 px) are placed at `surfaceY − 300·tile/96` (`scene.ts:1166-1176`). Peaks rise only about 1.3–1.7 tiles above the ground, with no third, hazed layer and no value step between layers.

**Planet.** `assets/campaign/source/sky-body.svg` paints the lit crescent `#987E5B`, a muted tan, against the concept's saturated amber.

### 3.9 One dark colour for all depths, and no grade
**Fog colour.** It is the constant `rgba(5,9,13,…)` (`lighting.ts:78`). Cave air takes the band back-wall colour (e.g. C `#302a29`, `world-content.ts:57`) plus the wall page at 0.55 alpha. In the 465 m pocket this yields a neutral brown-black (S 0.07) instead of the concept's deep teal atmosphere.

**Grade.** No vignette, colour grade or bloom exists anywhere. GFX-P9 was not implemented: `grep postFX|preFX` in `src/` finds nothing.

---

## 4. Gaps ranked by visual impact

1. **Unexplored rock is the brightest large area and never darkens with depth.**
   - Evidence: L\* 37.7 vs concept 24.1; 82 % of pixels at one value (a04, a05, c-site-4, e07).
   - Cause: `lighting.ts:73-77`, `terrain.ts:177-181`.
2. **Value inversion at depth.** Explored, lit space is darker than unexplored rock from band B down.
   - Evidence: 465 m pocket L\* 10 and lit soil 24 vs fog 35.6 (`cmp-cavern.png`, `lamp-falloff.png`).
3. **No warm, directional, additive headlamp.**
   - Evidence: a cool +7.8 L\* lift (b\* −4.8) vs a warm L\* 72–75 core (b\* +12) falling off over 1.8 tiles. The cream normal-blend lamp adds a grey halo.
   - Cause: `lighting.ts:99-133`, `scene.ts:244-261`.
4. **Highlights are missing.** p98 L\* is 39–48 vs 54–65; rims peak at 58 vs 88; no bevels, no light direction in materials (`terrain.ts:248-277`, band pages).
5. **No occlusion or ambient occlusion.** Light ignores walls, and the boundary between space and solid is a blur (`lighting.ts:86`), not a bevel plus shadow.
6. **No emissive accents.**
   - Surface: warm-accent share 0.25 % vs 2.5 %.
   - Cavern: 1.3 % (all from band C brown soil, none emissive) vs 3.9 %.
   - No lamp posts, no beacon glow, no crystal light, and ores and sites are under the fog.
7. **Cave air is a neutral black hole** (S 0.07, L\* 10) instead of a teal, layered atmosphere (L\* 14, S 0.48, background silhouettes).
8. **Surface atmosphere is shallow and pale.** The horizon is 7 L\* too bright; ridges are 11 % of frame height vs 31 %, with no haze layer; deep ground is L\* 38 vs 20; the crescent is desaturated; the lander area has no lights.
9. **W02 is the extreme case.** Unknown L\* 48 and pale cyan everywhere; the same fix is needed with W02 values.
10. **No per-band grade or vignette.** This is the lowest impact; the concept shows only a mild one.

---

## 5. Recommendations

Effort scale: S ≤ 1 day, M 2–4 days, L 1–2 weeks, XL > 2 weeks. The prototype diffs in `work/proto-*.diff` are a starting point, not production code.

### R1 · Re-key darkness: dim unexplored rock, depth-dependent, two-sided gate — S (1 day) · Impact very high · Risk low–medium
**What.** Put unexplored rock at the concept's value and let it darken with depth. Keep lit tunnel walls about 14 L\* above it.

**How.**
- **Darkness** (`lighting.ts:73-77`):
  - unknown `0.20 + (1−ambient)·0.25`, which targets L\* ≈ 25/23/20/18 for bands A–D;
  - visible `0.15 + (1−ambient)·0.45`;
  - remembered `min(0.6, visible + 0.15)`.
- **Unknown base and pattern** (`terrain.ts:177-181, 193, 210`):
  - base W01 `#30383f`, W02 `#2f4250`;
  - pattern: a dedicated generic rock page, or the band *rock* page, at 0.4–0.5 alpha (not soil at 0.23).
- **Remove the cream lamp** (`scene.ts:244-261, 1177`).
- **High contrast.** Keep the ×0.65 multiplier at `lighting.ts:78`, but floor unexplored rock at L\* 18 so it stays legible.

**Assets.** None (optional: one generic dim-rock page per world).

**Risk.** The build gets darker overall; R2 and R3 put the brightness back where the player is. Check phones at low brightness on a real device.

### R2 · Additive warm headlamp with occlusion — M (2–3 days) · Impact very high · Risk medium
**What.** A warm beam (core L\* ≥ 70, b\* +10…+20) that falls to ambient within 2–2.5 tiles. It lights air and wall faces, never the interior of unexplored rock. Add a 1–1.5-tile warm pool at the lamp.

**How.**
- Add a second quarter-resolution canvas texture with `BlendModes.ADD`. The prototype in `work/proto-lighting.diff` works in WebGL and Canvas.
- Origin: the lamp sprite position. Direction: facing, or down while drilling down. Spread ±20°.
- Clip the beam with a visibility polygon built from solid tiles within 4 tiles of the rig. Cast about 32 rays on the tile grid at quarter resolution; the cost is negligible next to the current per-cell fog loop.
- Erase darkness *inside the same polygon* instead of the unclipped radial at `:99-112`.
- Tone the prototype down at depth: its 465 m beam (L\* 48) overshoots the concept (31 at 0.5–1.5 tiles).
- In reduced-motion mode, keep it static.

**Assets.** None.

**Risk.**
- Warm light over warm band C soil could clip toward orange. Cap channel sums in the add layer.
- Canvas/WebGL parity is already "unmet" (`IMPROVEMENT_COVERAGE.md:58`). Measure it again.

### R3 · Lit rims, bevels and ambient occlusion at every space/solid boundary — M (3–4 days) · Impact high · Risk low
**What.** Replace the uniform 2 px rim (`terrain.ts:248-277`) with:
- a top-and-side **light lip**, 3–4 CSS px, `#cfd2c8`-ish, peak L\* 80–88 where lit;
- a **shadow lip** on underside faces;
- an **AO gradient** of 8–12 px of `#05090d` at 0.45 inside the open cell along every solid face;
- a **contact shadow** ellipse under the rig and props.

**How.**
- Bake rims, lips and AO into the retained terrain as today, so there is no per-frame cost.
- The darkness map then modulates them: rims far from light fall to about L\* 45, and rims in the beam reach 85.
- Draw the lips as a 1-tile-period "dual grid" stroke so corners join; the concept shows continuous bevels round shaft corners.

**Assets.** Optionally a rim/corner sprite set (16 masks × 2 lips) per world. Procedural strokes are acceptable.

### R4 · Light-aware rock materials and a generic unexplored-rock page — L (1–2 weeks for W01 + W02) · Impact high · Risk medium (art time)
**What.** Re-author the band pages so that slabs carry:
- a **top-lit bevel**: +8 L\* top edge, −10 L\* bottom edge, dark crack gaps;
- **strata alternation** of ±6 L\* at a 2–3-tile period;
- **per-band identity** (rust drips in C, crystal seams in D).

Overall each page should keep the pinned palette but sit 8–12 L\* darker than today. Today W01-A soil averages L\* ≈ 51 against the concept's lit-wall value of 38.

Add a world-neutral **unexplored-rock** page: the same strata, no band hue, sd ≥ 4 L\*.

**How.** Existing pipeline (`scripts/build-band-assets.mjs` → `assets/campaign/generated/bands/`); add an sd ≥ 4 L\* gate to `scripts/check-render-assets.mjs`.

**Assets.** 24 band pages (2 worlds × 4 bands × soil/rock/wall), plus 2 unexplored pages, at 2x and 3x.

### R5 · Emissive accents layer — M (3 days) · Impact high · Risk low
**What.** Add these emitters, drawn into the R2 add layer as radial halos, with the sprite itself above the darkness:

| Emitter | Colour | Halo |
|---|---|---|
| Surface lamp posts (2–4 around the lander) | bulb L\* 65, b\* +40 | 1.2 tiles |
| Lit lander windows | — | — |
| Beacons and mission sites | cyan `#4fd8e0`, core L\* 55+ | 1 tile |
| O3/O4 ores and crystal sites | amber `#f0a43c` | 0.6–0.8 tiles; replaces the destination-out glint at `lighting.ts:134-154` |
| Rig tail-lights | — | — |

**How.**
- Build an emitter list from `world.sites`, visible packages and surface props. Draw it after the darkness pass.
- Move emissive sprite parts (bulb and diamond) above depth 17; keep their bodies below.
- Optional slow pulse of ±10 %; none in reduced-motion mode.

**Assets.** `surface-lamp-post` (tripod plus bulb, 2 frames), `beacon-emissive` overlay, `crystal-glow` overlay, `lander-window-glow`. All are small SVGs in the existing atlas pipeline.

### R6 · Cave atmosphere: tinted, layered back space — M (3–4 days) · Impact medium-high · Risk low
**What.** Cave air becomes:
- a deep cool tint (W01 `#18262f`, L\* 14; per band slightly warmer in C and more violet in D);
- one parallax silhouette layer of distant rock and stalactites at L\* 18–22 behind galleries and geodes;
- a faint vertical light falloff (lighter toward a cave's upper void, as in the concept).

**How.**
- Back-wall colours in `world-content.ts` (`backWall`), drawn with the wall page at 0.55 alpha in `terrain.ts:209-210`. Retint the wall pages.
- Add a "cave backdrop" tilesprite masked to known air cells with a low parallax factor. The existing `wreckMask` geometry mask pattern (`scene.ts:1120`) shows the approach.

**Assets.** Two backdrop silhouette strips per world (1024×384 SVG) and retinted wall pages.

### R7 · Surface sky, ridges and planet — M (3 days) · Impact medium · Risk low
**Sky.** Horizon `#2f4654` (L\* 28), top `#122029` (`scene.ts:213`).

**Ridges.** Three layers instead of two, with atmospheric perspective:

| Layer | L\* | Peak height | Parallax |
|---|---|---|---|
| Far haze | about 30, low contrast | 25–30 % of sky height | 0.2 |
| Mid | 22 | — | 0.35 |
| Near | 18, lit facets on one consistent side | — | 0.6 |

The ridges should be varied silhouettes, not repeated equal pyramids.

**Ground.** The first ground row gets a bright lip (shared with R3). The ground falls to L\* 20 below it (handled by R1).

**Planet.** Crescent `#e0a050`-ish at full saturation, plus a 4–6 px soft outer glow on the lit limb.

**Assets.** `w01-ridge-{far,mid,near}.svg`, `w02-ridge-{far,mid,near}.svg`, recoloured `sky-body.svg` (both worlds).

### R8 · Per-band grade and light vignette — S (1 day) · Impact low-medium · Risk low
**What.**
- Underground only: a corner vignette of −6 to −8 L\*.
- The fog colour tinted per band: teal in A/B, slightly warm-neutral in C, violet-blue in D, instead of a constant `rgba(5,9,13)`.

**How.** `cameras.main.postFX.addVignette` in WebGL. A vignette PNG in Canvas. Off in high-contrast mode.

### R9 · Replace the one-sided brightness gate with concept-referenced value checks — S (1 day) · Impact indirect, prevents regression · Risk none
**What.** Extend the visual check scripts with the measures in §6. Use `work/stats.py` as a reference implementation. Remove "≤ 45 % below luma 40" as a standalone gate.

---

## 6. Measurable acceptance

All measures run on fixed fixtures with the HUD masked: spawn, native 60 m and 150 m dives of `fresh-w01.json`, the SITE-4 465 m and SITE-5 550 m pockets, a W02 80 m dive, desktop 1440×900@2 and portrait 393×851@3. Compare against the matching concept crop with `work/stats.py`.

### 6.1 Frame value distribution, per scene vs its concept panel

| Measure | Pass | Today (shaft / cavern) |
|---|---|---|
| L\* mean | within ±4 of concept (shaft 25.7, cavern 20.8, surface 25.9) | 38.1 / 28.2 |
| L\* sd | ≥ 9 | 5.3 / 11.3 |
| p98 − p2 | ≥ 40 | 26.5 / 30.1 |
| Share of pixels within ±3 L\* of the mode | ≤ 45 % (concept 34–36 %) | 82 % / 57 % |
| Earth-mover distance between the 50-bin L\* histograms of capture and concept | ≤ 6 L\* | not measured |

### 6.2 Value ladder: region means, same regions as `regions.py`

| Region | L\* target |
|---|---|
| Unexplored rock | 20–27, decreasing ≥ 4 from band A to band D (today flat 36–38) |
| Lit wall next to the tunnel | 34–42, and ≥ 10 above unexplored rock |
| Tunnel or shaft interior | 10–18 |
| Cave air | 11–17 with chroma ≥ 8 |
| Ordering at every depth | lamp core > rims > lit walls > unexplored rock > tunnel interior |

The ordering check must fail on today's 465 m capture.

### 6.3 Headlamp

- Lamp core L\* ≥ 70 with b\* between +10 and +25.
- Falloff is monotonic to within 3 L\* of ambient by 2.5 tiles along the facing ray (`profile.py`).
- No point of unexplored rock behind a wall rises more than 3 L\* when the rig turns toward it (occlusion test: rig facing a solid wall).
- The headlamp and rig contain the frame's top 1 % of non-label pixels.

### 6.4 Rims and edges

- Rim peak L\* ≥ 75 on lit faces and ≥ 40 above the adjacent wall.
- Edge density ≥ 0.06 at 690 px width (today 0.025–0.03; concept 0.073–0.109).

### 6.5 Emissive accents

Warm-accent share (hue 15–55°, S > 0.35, V > 0.35):
- surface: 1.5–4 %;
- cavern fixtures: 2–5 %.

Cyan-accent share ≥ 0.2 % when a beacon is on screen.

### 6.6 Surface

- Horizon L\* 26–31.
- Ridge peaks ≥ 22 % of frame height at 1440×900, with three distinct ridge-layer L\* values at least 4 apart.
- Deep ground L\* 18–24, with the surface lip at least 12 L\* brighter.
- Planet crescent chroma ≥ 35.

### 6.7 Guards and review

- **Rule guards:**
  - hidden cave and hidden solid rock remain pixel-identical (existing probe);
  - high-contrast mode keeps unexplored rock at L\* ≥ 18;
  - forced Canvas within 3 L\* of WebGL on region means.
- **Side-by-side review.** Regenerate `cmp-shaft`, `cmp-cavern`, `cmp-surface` and `cmp-portrait` with `compose.py`.
  - Pass: the L\* maps (middle row) are indistinguishable in structure at thumbnail size. Bright beam, bright rims, dark shaft, mid-dark rock.
  - Pass: an owner looking at the colour row picks out the headlamp, the beacon and the lamp posts as the brightest things in each frame.

---

### Artefacts

All in `scratchpad/art-audit/work/lighting/`:
- comparison sheets `cmp-{shaft,cavern,surface,portrait}.png`;
- charts `value-ladder.png` and `lamp-falloff.png`;
- crops `band-textures.png`, `a04-rig-crop.png`, `c4-rig-crop.png`, `a02-horizon.png` and `concept-*.png`;
- prototype source `proto/`, diffs `proto-*.diff`, captures `caps/`;
- scripts `*.py` and `capture-proto.mjs`;
- data `stats.json` and `protostats.json`.
