# 04 · In-world overlays, readability layers, motion and effects

Scope: everything drawn over the world art (world text, chips, badges, markers, rails, coach cards, toasts, drill UI) and the motion/feedback layer (particles, light FX, camera, rig animation, landing, pickups). Repository state: `origin/main` 644e222, read-only. Evidence lives in `<working folder>/art-audit/work/overlays/` (shortened below to `work/overlays/`). Captures cited as `shots/…` and `shots2/…` are in `…/scratchpad/v2/`.

## 1 Verdict

The concept board has **no in-world text at all**. Its playfield contains art, light and a handful of tiny tier marks. Each of its six panels shows only a compact HUD and one objective pill ("Survey the wreck"). The game layers a complete guidance system on top of the world. At 60 m on desktop, `shots/a04-dive-60m@2.png` shows 5 text items outside the HUD; my probe of the same state with the coach still active counts 9. On top of the text there are 7 white-ringed tier badges, a drill progress bar, a drill target box, seam arrows, a pulsing target ring and a depth rail.

I measured this. With the HUD row, objective card and toolbar masked out, **85% of the strong edges in the 60 m frame belong to overlays** and only 15% to art (method in §6). The DOM chips alone account for 49%. On phone portrait the two seam labels draw on top of each other (`shots2/p-portrait-03-dive-70m@3.png`). The frames read as a debug view because most of the high-contrast detail in them *is* UI.

The motion layer has the opposite problem: almost nothing is there. Debris is flat 4×3 px rectangles that always fly upwards. There is no dust, no sparks, no glow at the drill bit and no warm headlamp light. Measured warmth in front of the rig is R−B −18, against +19 in the concept. Camera shake is off by default. When the rig crosses 0.2 rows below the surface, the camera whips the rig 346 CSS px across the screen and changes zoom by 14% within 120 ms.

**The single biggest reason the frames miss the concept:** guidance that should be on demand or diegetic is drawn permanently, in two unrelated label systems, at full contrast and next to the rig. Meanwhile the light and particle layer that gives the concept its mood is missing. In my estimate, removing or merging about 70% of the overlays and adding roughly six FX families would close more of the visual gap than any single terrain change.

## 2 Side-by-side evidence

Overview sheet: `work/overlays/side-by-side-concept-vs-game.png` (concept panel on the left, game capture on the right, with an overlay count above each row).

### 2.1 Surface (concept panel 1 vs `shots/a02-spawn-1440x900@2.png`, `shots2/p-portrait-02-spawn@3.png`)

| Concept | Game |
|---|---|
| HUD bar plus one objective pill. No text in the world. | 5 world-text items: "SALVAGE LANDER" floating in the sky, "HOME · 150 m" chip, "A" and "B" letters, "↓ Wreck survey beacon · 99 m" chip. |
| Lamp posts with warm glow halos, and cables. | Two 3 px dots and 16%-alpha ellipses (`scene.ts:1324-1332`). They are invisible at capture scale. |
| Physical lander. | Dashed blueprint outline (`dock-stage-0`, `create-w01-sources.mjs:489-503`). Dashes are UI language. |
| Ore lumps on the ground, no badges visible. | 2 ore badges plus 2 yellow seam arrows. |
| Nothing at bottom centre. | Coach card "Hold Down to drill. Skip", reserve chip "Home 0.4L · Safe" (bottom left) and a depth rail with 20+ ticks (right edge). |

The probe (`work/overlays/probe/overlay-inventory.json`, `desktop-spawn`) confirms 3 canvas labels and 4 text-bearing DOM elements in the playfield at spawn. On the phone spawn, three stacked boxes fill the bottom 30% of the screen, on the ground line where the rig sits.

### 2.2 60 m shaft (concept panel 2 vs `shots/a04-dive-60m@2.png`, `shots2/p-portrait-03-dive-70m@3.png`)

Annotated: `work/overlays/annot-a04-60m.png`, `work/overlays/annot-portrait-70m.png`.

- **Text.** Concept: none. Game desktop: "↑ HOME · 164 m", "+ Shard silver", "Seam A · shallow ore · mission part", "Wreck survey beacon · 39 m" on a pulsing ring, and "Home 0.9L · Safe". The probe run adds "Collect the marked seam. Skip", for 5 canvas labels plus 4 DOM text elements (`probe/overlay-inventory.json`, `desktop-60m`).
- **Label collisions.** In portrait the "Seam A…" and "Seam B…" labels are drawn at the same y and merge into "SeamSeam B…shallow ore…emission part". The "+ Shard silver" popup sits on the ore and the target chip sits on the ring.
- **Labels over the rig.** "Seam A · shallow ore · mission part" and "+ Shard silver" sit directly above the cabin. The popup overlaps the rig (`work/overlays/game-a04-rig-labels-crop.png`).
- **Tier badges.** The concept shows small dark discs with a light glyph, about 0.19 rig widths (`work/overlays/concept-shaft-ore-zoom.png`). The game's badges are 36 px dark discs with a 2.5-unit **white ring**, about 0.29 rig widths (`work/overlays/game-badge-zoom.png`). Seven are on screen at 60 m and eleven at 150 m (`shots/a05-dive-150m@2.png`). The tier is encoded three times: the badge, beige "notches" under each ore (`create-w01-sources.mjs:192-194`) and, for packages, an orange-squared cargo harness (`:195-206`) that reads as an inventory icon (`shots/a07-side-tunnel-150m@2.png`).
- **Drill UI.** The game draws an amber progress bar above the rig (`rig.ts:254-271`) and a beige rectangle around the target cell (`scene.ts:1849-1858`). The concept shows neither.
- **Light.** The concept has a warm cone from the roof lamp, R−B +19 against −16 ambient, and 2.3× the shaft luminance. In the game the area ahead of the rig measures R−B −18 against −19 for the unknown rock: no warm light at all (`work/overlays/headlamp-compare.png`).
- **Framing.** The concept shows about 15 tile widths across, with the rig at 7.5% of the frame width. The game shows 21 tile widths (`layout.ts:6`, tile = width/22 × zoom 1.05), with the rig at 4.3–4.5%.

### 2.3 300 m cavern (concept panel 3 vs `shots/c-site-W01-SITE-4-wreck@2.png`, `shots/b-330m-plate-band-C@2.png`)

- **Concept:** a lit cavern, a glowing cyan beacon tripod as the waypoint, amber crystal glow, rust drips and a warm lamp pool ahead of the rig (R−B +26). The waypoint is a glowing object.
- **Game:** the waypoint is text. An "↑ HOME · 476 m" chip and an "↑ Wreck survey beacon · 371 m" chip (a target 371 m away, so the chip only says "somewhere up"), a "Collapsed crew gallery" toast, the reserve chip, the depth rail and 5 badges. The site sprite has no light, glow or animation. The lamp pool's R−B +11 comes from the brown band C rock, not the lamp.

### 2.4 W02 (`shots2/e07-w02-dive-80m@2.png`)

Same pattern on the comet: a "+ Frost iron" popup, the HOME chip, a target chip clamped bottom right, a "Hollow rock ahead" toast, the reserve chip and the rail. There is still no light on the ice.

### 2.5 Motion and effects (my captures)

Script `work/overlays/fx-capture.mjs` (fake clock, 60–100 ms steps); frames and per-frame positions in `work/overlays/fx/` and `fx/fx-log.json`; sheets `sheet-drill.png`, `sheet-land.png`, zoom `drill-deep-01-zoom.png`.

- **Debris.** Debris is uniform rectangles of `max(3.5, tile·0.065)` × `max(3, tile·0.045)` CSS px with flat colour (`scene.ts:1940-1947`). Velocity is `vx ±1.5`, `vy ∈ [−2.3, 0]` tiles/s (`scene.ts:758-773`), so it always sprays *upwards*, even when the bit cuts down. In `drill-deep-01-zoom.png` the chips float above the cabin like confetti.
- **Particle budget.** Peak count while drilling was 53 particles of one type (`fx-log.json`, `drill-deep-00`).
- **Missing types.** None of the following exist: dust, sparks, bit glow, impact flash, rotation, ground bounce or material-specific shapes. The coverage doc claims "material debris, sparks, icy particles" (`docs/IMPROVEMENT_COVERAGE.md:38`), but there is a single `Chip` type (`scene.ts:52-60`) and only its colour varies.
- **Pickup feedback.** Each pickup gives 10–16 chips (8 + 2 × tier) and a text popup, `+ ${event.name}`, which rises 12 px over 1.4 s (`scene.ts:972-985, 1949-1955`). Only one popup exists at a time, and it is drawn over the rig whenever the ore sits above it. Nothing travels to the cargo readout, and the HUD does not react (no class toggle on pickup in `ui/application.ts`).
- **Camera whip at the hole mouth.** Between `drill-08` and `drill-10` (120 ms) the rig's screen position jumps from (1065, 712) to (719, 460), 231 px of it in a single 60 ms step,, and tile size goes from 57.6 to 65.45 (+13.6%) (`fx-log.json`). The causes, all of which switch at once when `renderY` crosses 0.2:
  - `zoomTarget` 0.88 vs 1.0 (`scene.ts:788-795`);
  - `targetY = -height*0.78` vs rig-centred framing (`scene.ts:1056-1066`);
  - the 0.4× home-offset pull (`scene.ts:1067-1072`).

  The follow is very stiff: `1 − exp(−dt·22)` gives a 45 ms time constant (`scene.ts:1098`). `sheet-land.png` (first run) shows the same whip repeating while the rig bobs at the hole mouth.
- **Rig animation.** Present: an 8-frame tread cycle while moving, an 8-frame drill at 16 fps, a 6-frame thrust (`rig.ts:55, 61-72, 133-145`), ±0.055 rad lean and up to 2 px load sag (`scene.ts:536-551`). Landing squash is at most 5.5%, decays linearly over 0.25 s and scales around the sprite centre, so the tracks lift instead of compressing. There is no idle motion, drill vibration, exhaust or headlamp flare.
- **Shake.** Shake only fires on damage, lasts 100 ms at 0.002 intensity (`scene.ts:996-999`), and the preference defaults to `shake: false` (`input.ts:90`). A default player never sees it.

## 3 Root causes in code and assets

1. **Guidance is always on, not contextual.** The HOME chip is hidden only when docked (`ui/world-labels.ts:20-31`). The target chip shows whenever any signal exists (`:32-42`). The reserve chip (`ui/guidance.ts:36-44`) and depth rail (`:69-94`) show whenever assists are on, which is the default (`input.ts:91`). The A/B seam arrows and letters are drawn on every W01 generator-2 surface frame with no tutorial condition (`scene.ts:1334-1358`), and the lander nameplate on every surface frame (`scene.ts:1371-1384`). POI labels appear within 3.8 tiles of the rig (`scene.ts:1497-1525`), and the " · mission part" suffix is added to any non-clustered `source` POI, starter seams included (`scene.ts:1508-1514`; title at `poi.ts:284`). Further labels: site names (`scene.ts:1741-1750`), W02 hazard sentences (`:1657-1666, 1698-1707`), "Pressure · move away" (`:1798-1807`) and "UNSTABLE SHELF" (`:1840`).
2. **Two label systems with different typography, and no shared collision solver.**
   - Canvas labels use Inter 13 px with a 3 px dark stroke and a 4 px shadow (`scene.ts:611-655`).
   - DOM chips are 12 px boxed with a 1 px border (`style.css:2626-2646`).
   - `missionLabel()` dodges only the DOM toast, danger and extraction boxes (`scene.ts:720-756`). It never checks other canvas labels, so the two seam labels overlap.
   - `place()` in `world-labels.ts:66-109` checks the DOM obstacles and the home chip, but not canvas labels and not the rig.
   - In total, 21 writers put text over the playfield: 12 canvas call sites (6 `label()`, 6 `missionLabel()`) and 9 DOM elements.
3. **The drill state is shown as UI rather than as material.** The progress bar (`rig.ts:254-271`) and target rectangle (`scene.ts:1855-1858`) duplicate the crack overlays (`scene.ts:1853`).
4. **Tier marks are oversized and baked into the art.**
   - `oreBadge()` is a white-stroked r=14 disc in a 96 px frame (`assets/campaign/render-sources.mjs:8-11`). It is appended to every ore and package frame (`create-w01-sources.mjs:207`, `w02/create-sources.mjs:184`), alongside the notches (`create-w01-sources.mjs:192-194`).
   - The previous graphics audit asked for "1.4× size" badges (`docs/improvement-plan/analysis/04-graphics.md:463`). That fixed a readability failure but turned the badges into the most prominent marks next to the rig.
   - `scripts/check-render-assets.mjs:134` asserts that the baked badge is present, so restyling also means updating this check.
5. **Light is subtractive.**
   - The headlamp only erases darkness: `destination-out` radial plus a cone (`render/lighting.ts:99-133`).
   - The additive lamp is a 0.18-alpha circular radial in NORMAL blend (`scene.ts:243-261`).
   - Nothing adds warm colour. No emissive sources exist for beacons, crystals, lamp posts or thrusters. Glints are 2 px plus-shaped strokes (`scene.ts:263-280, 1256-1268`).
6. **The particle system is one rectangle type** (`scene.ts:52-60, 758-773, 903-919, 1940-1947`): no sprite texture, no blend mode, no per-material behaviour and an upward-only velocity.
7. **Camera.**
   - Framing switches as a hard step at `renderY < 0.2` (`scene.ts:788-795, 1056-1072`), and the follow is stiff (`scene.ts:1098`).
   - Base tile size is width/22 on desktop and a fixed 44 px on phones (`layout.ts:3-7`). That gives about 1.4× the concept's field of view, while most of the extra area is undiscovered rock.
8. **Toasts and the coach share the bottom-centre lane with the target chip.** Both sit at `bottom: 76px` (`style.css:2537-2546, 2574-2589`). With the coach on, toasts move to 124 px (`style.css:2596-2598`) and the target chip is shoved above both (`world-labels.ts:80-87`). In `shots/a03-first-cut-20m@2.png` three boxes stack within 80 px.

## 4 Gaps ranked by visual impact

1. **Permanent guidance text and chips in the playfield** (HOME, target, reserve, seam names, nameplate, A/B): 85% of strong edges at 60 m. This is the main "debug view" cue.
2. **No warm, additive light** (headlamp cone, beacon, crystal and lamp halos). Frames read flat, grey and cool: Δ warmth −37 against the concept at the rig.
3. **Oversized, white-ringed tier badges in triple encoding**: the highest-contrast marks next to the rig, 7–11 per frame, in grid-like columns.
4. **Drill UI over the rig**: progress bar, target box, and the pickup popup printed on the cabin.
5. **Rudimentary particle and impact FX**: upward confetti rectangles; no dust, sparks or bit glow on the core verb.
6. **Camera**: field of view about 1.4× the concept's, and a whip at the surface/shaft threshold.
7. **Label collisions and two label styles** (canvas stroked text vs DOM boxes).
8. **Overloaded bottom-centre lane**: coach, toast and target chip, worst on phones.
9. **Minimal rig motion**: no idle life, centre-anchored squash, no driving dust or exhaust.
10. **UI graphics drawn as world objects**: dashed blueprint lander, depth rail.

## 5 Recommendations

Effort scale: S ≤ 1 day, M 2–4 days, L 1–2 weeks, XL more than 2 weeks. "Impact" means visual distance closed to the concept.

### R1 · Overlay budget and a single world-label system with an on-demand "Scan" view

- **Effort:** M (3–4 d). **Impact:** very high. **Risk:** medium; it changes onboarding and accessibility behaviour, and smoke checks will need updating.
- **What.** Enforce a budget: **at most one text item in the playfield during steady play**, and none within 1.2 tiles of the rig. Everything else appears only while the player holds a new `scan` action or in the pause/journal view. Tab, Q and R are already bound (`input.ts:28-39`), so bind Scan to Shift or F, gamepad L1, and a long-press on the rig on touch.
- **How.**
  1. Create `src/campaign/ui/world-annotations.ts`. It owns every in-world annotation, both canvas and DOM: home, target, POI, site and hazard labels and the pickup popup.
  2. Each request carries a priority (0 = critical hazard, 1 = interaction prompt, 2 = objective in view, 3 = informational), an anchor, a lifetime and an "only on scan" flag.
  3. Per frame, sort by priority and place greedily, avoiding the rig sprite bounds plus 0.6 tile, all other placed labels and the DOM HUD boxes from `cameraSafeArea()`. Drop anything that does not fit.
  4. Render everything through one pooled DOM layer, which already exists as `#campaign-world-labels`. Retire the `scene.ts` `label()` and `missionLabel()` paths except for the loading text.
  5. Give one style to all labels: 11 px Inter 600, letter-spacing .06em, uppercase. Use a 60%-alpha `#0b161c` pill with a 1 px amber or teal hairline on the side facing the anchor and an optional 8 px leader tick. Drop the outlined stroke text and the full boxes.
- **Default visibility:**

  | Element | Change |
  |---|---|
  | HOME chip | Hide unless (reserve state is `plan`, `turn` or `stranded`) or (cargo is full) or (the objective step is "Return"). Otherwise show only on Scan. |
  | Target chip | Merge into R3. |
  | Reserve chip | Delete the text chip. `#campaign-return-notch` on the energy bar already shows the reserve. On `turn` or `stranded`, pulse the notch and push a single priority-0 toast. |
  | Depth rail | Show only on Scan, while paused, or while the depth readout is hovered. |
  | A/B seam markers | Draw only while coach steps 0–1 or 7 are active (`onboarding.ts:13-26`). Replace the letters and arrows with physical survey stakes (see R3 assets). |
  | Lander nameplate | Delete. The dock prompt ("E Dock") is the label. |
  | POI labels | Scan only, with the " · mission part" suffix deleted (`scene.ts:1508-1514`). |
  | Hazard sentences ("Pressure · move away", "UNSTABLE SHELF", cold mist, vent) | Keep, as the only always-on world text, at priority 0, max 1 at a time, ≤ 3 words. |

- **Assets:** none, apart from 2 icons (scan glyph, leader tick).
- **Risk detail:** `scripts/feel-smoke.mjs`, `frontier-smoke.mjs`, `plan-ui-smoke.mjs` and `poi-smoke.mjs` reference `campaign-home-beacon`, `campaign-target-beacon`, `worldLabels`, `depth-rail`, `poiMarkerVisible` or `campaign-coach`. Keep the element ids and add a `data-scan` state so the tests can assert both modes.

### R2 · Concept-scale tier marks; drop the notches and the harness UI square

- **Effort:** M (2 d, including the atlas rebuild and the check update). **Impact:** high. **Risk:** low to medium, because tier readability is an accessibility requirement.
- **What.** Change `oreBadge()` (`assets/campaign/render-sources.mjs:8-11`) to the concept's mark: an r=8 disc in the 96 px frame (≈0.17 tile, down from 0.29), fill `#101820` at 90% alpha with **no white ring**, 2 px glyph bars in `#e9e2cc`, tucked to the lower right so that it overlaps the ore silhouette by about 30%. Remove the notches (`create-w01-sources.mjs:192-194`) and the W02 equivalent. Redraw the package harness (`create-w01-sources.mjs:195-206`) as straps on the ore without the orange `#f0a43c` square.
- **Accessibility.** Keep a second, full-size badge frame (`ore-oN-hc`) and select it when `highContrast` is on or while Scan is held. `scene.ts:1230-1233` already chooses frames per item.
- **Tests.** Update `scripts/check-render-assets.mjs:120-140`: lower the sample count from 250 to about 80 and keep the ΔL gate against the band rock.
- **Assets:** 8 ore and 8 package frames per world (16 per world), regenerated from source, plus 8 HC variants per world.

### R3 · Diegetic waypoints in place of text chips

- **Effort:** M (3 d, plus 1–2 d of asset work). **Impact:** high. **Risk:** medium; mission-finding time must not regress.
- **What.**
  - **Target on screen and discovered:** the target is the physical object (`site-beacon`, wreck or cache). Add a looping **beacon emitter**: a cyan diamond sprite with an ADD-blend halo at 0.8 Hz, plus a vertical light shaft 3 tiles tall and fading. This is exactly the concept's cavern tripod. Delete the stroked ring (`scene.ts:1553-1559`) and the text chip.
  - **Target off screen or undiscovered:** draw one icon-only edge chevron, 22 px, amber, on the screen-edge point nearest the bearing (the `scene.ts:1563-1575` logic, restyled). Distance text appears only on Scan. Move the distance into the objective pill instead: "Survey the wreck · 39 m ↓". The concept pill has room for this.
  - **Home:** a teal chevron, shown under the R1 rules.
  - **Seam guidance during the coach:** two physical survey stakes, each a thin pole with a small amber lamp and a ground glow, at seam entries 20.5 and 21.5. These replace the A/B letters and arrows.
- **Assets:** a beacon tripod with an emissive head (sprite plus separate glow layer), a survey stake (sprite plus glow), a 2-colour edge chevron and a soft "signal pulse" ring texture.

### R4 · Drill feedback as material, not UI

- **Effort:** M–L (4–6 d). **Impact:** high. **Risk:** low.
- **What.**
  - Delete the progress bar (`rig.ts:254-271`) and the target rectangle (`scene.ts:1854-1858`). Keep them only when `highContrast` or assists-plus-Scan is active.
  - Make the crack stages carry progress. Draw `crack-1..3` tinted by band (dark seams with light chipped edges) and add a `crack-4` "crumbling" frame in the last 15%.
  - Add a **bit glow** at the contact point: an ADD-blend sprite, warm `#ffb35a`, radius 0.25 tile, alpha 0.35→0.8 with progress. W02 already has a weak 0.16-alpha version (`rig.ts:187-208`); generalise it.
  - Replace the single `Chip` type with four emitters, using Phaser's `ParticleEmitter` (Phaser 3.90 has it) or a pooled sprite system:

    | Emitter | Trigger | Shape | Life | Motion and blend |
    |---|---|---|---|---|
    | Chunks | All material | 3 faceted band-tinted sprites per material, random rotation | 0.4–0.7 s | Gravity 18 tiles/s², one floor bounce at 0.3 restitution. Velocity **away from the bit**: for a down-drill, ±60° fan sideways and up from the contact edge, not straight up. |
    | Dust | Soil | Soft round 32 px alpha sprite, scale 0.3→1.1 | 0.6–1.0 s | Alpha 0.35→0, drifts with a slight upward buoyancy. |
    | Sparks | Stone and plate | Velocity-stretched 1×6 px streaks, ADD blend | 80–160 ms | Spawned 18/s while progress > 0.3. |
    | Frost mist | W02 | Pale cyan dust variant | — | Slower and longer-lived. |

  - Cut completion: a crumble burst (8 chunks plus 4 dust), and a 1–1.5 px directional camera kick for 70 ms, governed by the shake/reduced-motion settings (see R7).
- **Assets:** about 20 small procedural frames in `render-sources.mjs`: a dust puff (1 sprite plus a 4-frame variant), a spark streak, 3 chunk sprites per W01 band plus 3 ice chunks, a bit-glow radial and `crack-4`.

### R5 · Additive light layer: headlamp, emissives, halos

- **Effort:** M (3–4 d); coordinate with the lighting and terrain audit. **Impact:** very high. **Risk:** medium (fill rate on phones).
- **What.** Keep the subtractive fog (`render/lighting.ts`) and add a second, **additive** Phaser image layer at depth 17.5 with the ADD blend mode, drawn at quarter resolution like the fog:
  - **Headlamp cone:** from the cabin roof lamp (about (+0.18, −0.32) tiles facing right), along the facing, tilted 25° down when grounded and straight down when drilling down. Half-angle 0.45 rad, length 5 tiles, `#f6d9a0`, alpha 0.55 at the source with quadratic falloff, clipped by solid known cells so it lights walls instead of passing through them. Add a 14 px lens flare at the source.
  - **Emissives:** register point lights for beacon heads (cyan `#56e0ff`), crystals and O3/O4 ore (amber `#ffbe5c`, radius 0.8 tile, slow 0.3 Hz breathe), surface lamp posts and dock lights (warm, radius 1.2 tile), and the thruster (orange, radius 1 tile, only while thrusting).
  - **Dust motes:** 12–20 tiny 2 px motes drifting slowly inside the cone. This sells volumetric light cheaply.
  - Replace the 2 px plus-shaped glints with a 4-point star sprite with a soft core.
- **Assets:** cone gradient texture (256×128), flare, star glint, mote. All four are procedural.

### R6 · Pickup, landing, driving and thrust motion

- **Effort:** M (3 d). **Impact:** medium to high. **Risk:** low.
- **Pickup:**
  - The ore sprite pops out of the cell (scale 1→1.15, 80 ms), then arcs to the rig hatch along a Bézier curve in 250 ms and shrinks.
  - The cargo pip flashes in the HUD with a 150 ms brightness keyframe on `#campaign-cargo-pips i.filled:last-child`.
  - Tier 3–4 add a 6-star sparkle ring.
  - Delete the text popup (`scene.ts:979-985, 1949-1955`). Keep names in the field journal or behind an option, "Show pickup names".
- **Landing:** anchor the squash at the track base (set origin y to the sprite's ground line for `rig-*` layers in `scene.ts:536-551`). Use a critically damped spring (0.18 s) instead of the linear decay. Emit two dust puffs that slide left and right along the floor, with the count scaled by impact speed.
- **Driving:** a track-dust trail at the ground contact when |vx| > 0.3 and grounded: 1 puff per 120 ms, plus pebble kicks on soil.
- **Thrust:** exhaust particles (6 per 100 ms, warm core fading to grey smoke) plus the R5 thruster light.
- **Idle and drilling:** a 1 px bob at 1.1 Hz, a cabin indicator blink every 2.4 s, and ±0.6 px body jitter at about 25 Hz while drilling. Reduced motion disables all of this, as now.
- **Assets:** smoke puff (can share the dust sprite) and a 2-frame cabin indicator.

### R7 · Camera framing and zoom

- **Effort:** S for the whip fix; M for the zoom change with playtest. **Impact:** medium to high. **Risk:** medium, because the zoom changes how far ahead the player can see.
- **Fix the whip.** Replace the boolean `renderY < 0.2` with a blend factor `s = smoothstep(−0.4, 1.6, renderY)`. Interpolate the zoom target (0.88→1.0), `targetY` (surface framing → dive framing) and the home pull (0.4→0) with `s`. Change the follow to a critically damped spring with ω ≈ 9 (≈110 ms) instead of `exp(−dt·22)` (`scene.ts:1098`). Keep the jump/teleport snap.
- **Zoom toward the concept.** Change `campaignTileSize` (`layout.ts:3-7`) to `width/17` on desktop (about 85 px at 1440; the concept is about width/15), 52 px on phone portrait (7.5 tiles across; the concept shows about 6.2) and 48 px on landscape phones. Add speed-based pull-out: zoom 0.9× when |vy| > 4 tiles/s (falls, fast ascents), easing back over 0.6 s. Below the surface the extra field of view mostly shows undiscovered rock (in `shots/a08-dive-250m@2.png` discovered cells cover roughly 10–15% of the frame by visual estimate), so little gameplay information is lost. Validate with the energy and return planning playtests.
- **Shake.** Split the preference into "impact kicks" (≤ 1.5 px, default on, off with reduced motion) and damage "shake" (default off). This needs accessibility sign-off.

### R8 · One notice lane; coach moved into the objective pill

- **Effort:** S–M (2 d). **Impact:** medium. **Risk:** low.
- **Coach.** Move it from bottom centre (`style.css:2574-2589`) into a second line of the objective pill, top left: "▸ Hold Down to drill · Skip". It becomes part of the one element the concept already has.
- **Toasts** (`#campaign-message`): one lane, top centre under the HUD row; one line of ≤ 48 characters; 2.5 s for priority 2–3; a 50% plate instead of a box; never shown together with a coach line.
- **Rewrites.** Shorten long strings such as the 72-character beacon notice in `shots/a03-first-cut-20m@2.png` to "Beacon signal · 79 m ↓".
- **Context action** ("TAP Read field log", "E Dock"): on desktop, render it as a keycap bubble anchored to the object (it moves with the world). On touch, keep the bottom button.

### R9 · Remove UI-language world graphics

- **Effort:** S for code; the art is L and belongs to the surface/lander audit. **Impact:** medium. **Risk:** low.
- Replace the dashed "planned lander" (`create-w01-sources.mjs:489-503`) and dashed "blueprint" layers (`:575-590, 620-630`) with physical states (wrecked hull, tarp, scaffolding, crates). Show the construction preview only in the dock's construction tab.
- Turn the critical-state full-screen stroke rectangle (`rig.ts:233-243`) into a soft 25%-alpha edge vignette: the alarm stays, the frame line goes.

### R10 · Instrumentation so overlay creep cannot return

- **Effort:** S (1 d). **Impact:** indirect. **Risk:** none.
- Add a dev query flag, `?overlays=0`, that hides all annotations, chips, badges-HC, bars and markers. This lets the §6 overlay-share metric be computed exactly instead of by masking.
- Expose `dataset.overlayText` (count of visible text annotations) and `dataset.overlayNearRig` (count intersecting the rig exclusion box) next to the existing `worldLabels` (`scene.ts:2056-2058`).

**Suggested order.** R1 and R7-whip first (about 4 days, and the largest visual change). Then R2 and R4 together, since both rebuild the atlas. Then R5 (with the lighting owner), then R3, R6, R8 and R9.

## 6 Measurable acceptance

All measurements use the capture harness (`capture-v2.mjs` pattern, fake clock) on the fixed fresh-W01 fixture, at 1440×900@2 and 393×851@3, plus the W02 80 m state.

1. **Overlay share of strong edges.** Downsample to 1440×900, take the luma gradient magnitude, and count pixels above 80 in the playfield (HUD row, objective pill and toolbar masked). Overlay share = (edges(full) − edges(`?overlays=0`)) / edges(full). Today: **85%** at 60 m, of which 49% is DOM chips and 36% canvas badges and labels (`work/overlays/edge-share.py` on `probe/desktop-60m*.png`; until R10 exists, canvas overlays are masked by hand). Target: **≤ 20%** at 20/60/150 m and at site captures after the coach. The concept has 0% overlay edges and twice the game's art edge density (0.015 vs 0.007 of pixels).
2. **Text budget.** `overlayText` ≤ 1 in steady play after the coach (today 9 at desktop 60 m and 6 at portrait 60 m, from `probe/overlay-inventory.json`). The count is 0 when no hazard or interaction is active. Hazards may raise it to 2.
3. **Rig clearance and collisions.** `overlayNearRig` = 0 in every capture (today the popup and seam label sit on the cabin in `a04`), and no two annotation rectangles intersect (today `p-portrait-03` has an overlap).
4. **Badge scale.** Measured in the atlas: badge outer diameter ≤ 0.18 of the ore frame (today 0.32, with stroke). No pure-white ring pixels (L > 240) inside the badge in the default style. The HC variant still passes the existing ΔL check.
5. **Warm headlamp.** In a 120×240 px region ahead of the lamp at 60 m: mean R−B ≥ +10 while unlit rock stays ≤ −10 (concept +19/−16; today −18/−19), and luminance ratio cone/unlit wall ≥ 1.4 (concept 1.45; today 1.2). At the 300 m cavern the pool R−B is ≥ +18 (concept +26).
6. **Camera continuity.** In the surface-to-shaft sequence (`fx-capture.mjs`), the rig's screen position changes ≤ 40 CSS px per 50 ms (today 231 px horizontally in one 60 ms step) and tile size ≤ 3% per 100 ms (today 13.6% in 120 ms).
7. **Framing.** Tiles across: desktop 16–17 (today 21), portrait 7–7.5 (today 8.9). Rig width ≥ 6% of the desktop frame width (today 4.3–4.5%; concept 7.5%).
8. **FX presence**, from per-type dataset counters during a 1 s down-drill in soil and in stone: ≥ 3 particle types active (chunk, dust, spark on stone); ≥ 40% of chunks moving downward or sideways when drilling down (today 0%); a pickup arc visible in 3 consecutive 80 ms frames; landing dust on both sides of the rig.
9. **Side-by-side review.** Produce panel-matched frames (spawn, 60 m shaft, 300 m-class cavern; desktop and portrait) next to the six concept panels, in the format of `work/overlays/side-by-side-concept-vs-game.png`. Three reviewers who have not seen the work circle everything they read as "UI in the playfield" (median ≤ 2 per frame; `annot-a04-60m.png` marks 17 today) and rate "matches the concept's mood" from 1 to 5 (median ≥ 4).
10. **No regressions.** `feel-smoke`, `poi-smoke`, `frontier-smoke` and `plan-ui-smoke` pass in both Scan modes, and a first-session playtest shows no increase in time-to-beacon or time-to-first-bank.

Evidence index (`work/overlays/`): `side-by-side-concept-vs-game.png`, `annot-a04-60m.png`, `annot-portrait-70m.png`, `pair-60m-dom-stripped.png`, `headlamp-compare.png`, `game-badge-zoom.png`, `concept-shaft-ore-zoom.png`, `sheet-drill.png`, `sheet-land.png`, `drill-deep-01-zoom.png`, `probe/overlay-inventory.json`, `fx/fx-log.json`. Scripts: `overlay-probe.mjs`, `fx-capture.mjs`, `annotate.py`, `edge-share.py`.
