# 05 · HUD and in-game display audit

> **Archived audit report** (2026-11-02, baseline commit `dbf0b1a`), supporting [the improvement plan](../../IMPROVEMENT_PLAN.md). Source paths are relative to the repository root; `work/…`, `shots/…` and `analysis/…` are relative to `docs/improvement-plan/`. Review scripts named `*.test.ts` are archived as `*.audit.ts` (see [the folder README](../README.md)). Screenshots and captures (`*.png`) were local review files and are not committed, except the UI mocks, which are stored as `.webp`.

Dimension owner: HUD and everything shown during active play. This covers gauges and readouts, the mission tracker, messages, warning banners, the extraction card, the toolbar, in-canvas labels and markers, and the touch joystick. It was checked on desktop 1440×900, portrait 393×851, landscape 844×390 and short landscape 568×320. Menus, dialogs and the lander terminal belong to another auditor.

Base path for all artefacts below: `docs/improvement-plan/`.
- My captures are in `work/hud/shots/` and my data in `work/hud/data/`.
- Baseline screenshots are in `shots/`.
- §10 lists every script with its path.

---

## 1. Assessment

The HUD is tidy, careful engineering, but it is not yet a game HUD. It reads like a thin debug overlay, and it does not answer the player's most important question: **"Can I still get home?"**

**What works.** Everything shown is correct, updates at 10 Hz without layout churn, and has accessible names. Touch targets are 44 px or larger.

**The problems:**
- **Equal weight for everything.**
  - The energy gauge is a 123×3 px hairline on desktop and 113×2 px on phones.
  - Its 14 px (desktop) or 12 px (phone) value has the same weight as depth, cargo and credits.
- **No return information.**
  - Nothing estimates the energy needed for the trip home.
  - Once the rig is deeper than about 72–126 m (depending on screen), nothing on screen says where the lander is.
  - The single low-energy cue is a 13 px banner reading "return to the lander". It gives no direction, no distance and no margin.
- **One message at a time.**
  - The message system is a single last-write-wins line.
  - It is muted entirely whenever a danger banner is up. That mutes hazard warnings exactly when the player is most vulnerable.
- **Text on bare terrain.**
  - All text sits directly on the world with only a text shadow.
  - It is fine over fog and sky (early W01).
  - It collapses over explored terrain and the comet's ice: in a W02 shaft, 23 of 24 HUD text elements fall below 4.5:1, and the worst is 1.96:1.
- **Phones lose the play area.**
  - The fixed camera reservations behind the HUD take 36 % of the height in portrait, 55 % at 844×390 and 67.5 % at 568×320.
  - In short landscape only 1.4 rows of ground below the rig stay visible and clear of HUD, and 0.7 rows when a message is up. The player drills blind.
- **Text size.**
  - 96 % of phone HUD text is 12 px.
  - The "Larger text" setting changes none of it.

**What the owner will notice.** The "not up to par" feeling about display and graphics comes largely from four things:
- the hairline gauges;
- the 12 px letter-spaced caps labels;
- the absence of panels, motion and deltas;
- the mixed icon languages (PNG line icons, Unicode glyphs, inline SVG and text marks).

**How fixable it is.** Very.
- The model already exposes everything needed, apart from a return estimate, which other auditors specified (FTUE-P3, PROG-P2).
- Two of the four highest-impact changes are about 70 % CSS: plates/tokens/type (P1) and a priority message queue (P3).
- A simulated 85 % backing plate lifts the worst-case contrast in the W02 shaft from 1.96:1 to 7.27:1 with no other change (M2).
- The redesign keeps the approved composition: energy and hull upper left; depth, cargo and haul upper right; objective and tools in compact areas.
- Mock-ups of the proposed direction were rendered over real HUD-off frames:
  - `work/hud/shots/mock-desktop-normal.webp`, `mock-desktop-critical.webp`
  - `mock-portrait-normal.webp`, `mock-portrait-critical.webp`
  - `mock-landscape-normal.webp`, `mock-landscape-critical.webp`

---

## 2. Strengths (keep these)

1. **Truthful, live state.**
   - Every HUD value is read straight from the simulation in `syncHUD()` (`main.ts:733-898`), and text writes are de-duplicated (`setText`, `main.ts:338-341`).
   - Pause, dock and recovery never desynchronise the readouts.
2. **The approved composition is in place.** Energy and hull are upper left, depth/cargo/haul upper right, objective and tools in corners, as the design pack specifies (`docs/DESIGN_PACK_IMPLEMENTATION.md:130`). The redesign builds on it.
3. **The mission locator works.** It gives an arrow, distance and Tracking/Nearby/Very close bands, uses wrap-aware bearings, and fires band alerts once per target (`poi.ts:234-428`, `main.ts:436-489`). Other auditors' scripted players found every target using it.
4. **The volatile ring is a good world-space cue.** The 0.75 s window is drawn as a shrinking amber arc around the rig (`scene.ts:1824-1838`), exactly where the eye is (`work/hud/shots/h-desktop-volatile-release.png`).
5. **Accessibility basics are in place.**
   - Live regions: `#campaign-message` role=status and `#campaign-danger` role=alert.
   - The direction arrow has a screen-reader label.
   - Touch targets are 44 px or larger.
   - Reduced motion follows the OS setting (`input.ts:56`) and makes POI markers static.
6. **A complete icon set already exists, four of its glyphs unused.** The pack's ten 24/48 px UI glyphs (energy, hull, cargo, depth, mission, map, warning, cooldown, relic, shop) were exported in one clean line style (`work/hud/shots/icon-sheet.png`). Six are in the HUD today; warning and cooldown are ready for alerts and tool states.
7. **The danger banner is suppressed on the disabled card**, so the recovery card does not compete with it (`style.css:1831-1835`). This instinct of one voice per moment is right; it just needs a real priority system.
8. **The geometry is testable.** The scene publishes rig, joystick and POI-marker screen coordinates on `#campaign-game` data attributes (`scene.ts:1960-1993`). My audit scripts and the proposed regression harness (P13) build on them.

---

## 3. Measurements

Method: Playwright with Chromium. Each scenario uses the real game (Vite dev server), a frozen clock and native input or validated checkpoint fixtures.
- `probe()` records the boxes, font sizes and colours of every visible HUD element and text leaf.
- `shotHudOff()` captures the identical frozen frame with the DOM HUD hidden. The canvas does not re-render without `advance()`, so the frame is pixel-identical.
- Python scripts then compute contrast, coverage and colour metrics.

All numbers below are reproducible with the scripts listed in §10.

### M1 · Text density and type scale (first frame after Deploy; `data/probe-*-first.json`)

| Form factor | Text elements | Words | Font sizes used | Text ≤ 12 px | Energy value |
|---|---|---|---|---|---|
| Desktop 1440×900 | 26 | 63 | 12 / 13 / 14 / 16 (arrow) | 69 % (18 of 26) | 14 px bold |
| Portrait 393×851 | 26 | 63 | 12 / 16 (arrow) | 96 % (25 of 26) | 12 px bold |
| Landscape 844×390 | 22 | 51 | 12 / 16 | 95 % | 12 px |
| Short landscape 568×320 | 22 | 51 | 12 / 16 | 95 % | 12 px |

- The design pack's target is "14–16 CSS px body text, supporting text at least 12 px" (`docs/DESIGN_PACK_IMPLEMENTATION.md:134`). The HUD has no 14–16 px body text except the six desktop numeric values.
- Meter bars:
  - energy and hull 123×3 px on desktop (`style.css:201-205`);
  - 113×2 px in portrait and 82×2 px in landscape (`style.css:1326-1329`; the 106 px landscape vital is `:1578-1579`).
- **Larger text and High contrast:** with both enabled, 0 of 26 HUD text sizes change on desktop and on portrait (`data/probe-desktop-largetext.json`, `data/probe-portrait-largetext.json`).
  - `.campaign-large-text` only targets `.campaign-panel` (`style.css:1266-1269`).
  - Canvas labels are fixed at 12 px (`scene.ts:476`).

### M2 · Contrast of HUD text against the world behind it (`contrast.py`; `data/contrast-*.json`)

Method:
- For each text leaf, the HUD-off pixels inside its text box give the background luminance.
- The table reports the WCAG ratio of the text colour against the median (p50) and the brightest decile (p90) of that background.
- Text shadows (`--hud-shadow`, `style.css:8`) improve the local edge but are not counted by WCAG. The crops show how muddy the result is.

| Scene | Text | Median ratio (p50) | Worst ratio (p90) | < 4.5:1 | < 3:1 |
|---|---|---|---|---|---|
| Desktop, W01 surface first frame | 26 | 10.61 | 7.45 | 0 | 0 |
| Desktop, W01 native dive 90 m | 26 | 10.70 | 7.53 | 0 | 0 |
| Desktop, W01 explored stone 320 m | 26 | 7.69 | **3.06** | 5 | 0 |
| Portrait, W01 native dive 90 m | 27 | 9.35 | 3.00 | 4 | 0 |
| Portrait, W01 explored stone 320 m | 26 | 6.70 | **2.00** | 9 | 2 |
| Desktop, W02 surface (load message "Ice comet expedition ready…") | 25 | 10.22 | **2.47** | 1 | 1 |
| Portrait, W02 surface | 25 | 10.54 | **1.46** ("DRILL") | 3 | 2 |
| Desktop, W02 explored ice shaft 120 m | 24 | 4.18 | **1.96** ("ENERGY") | **23** | **11** |
| Portrait, W02 explored ice shaft | 24 | 4.03 | **2.14** | **24** | **14** |
| Short landscape, W01 first frame | 22 | 9.95 | 3.75 | 2 | 0 |

**Plate simulation** (`plate-sim.py`; `data/plate-sim-*.json`): composite a `#0A161C` plate at alpha a behind each text box over the same pixels.

| Plate alpha | Worst min p90 (6 worst scenes) | Text < 4.5:1 |
|---|---|---|
| 0 (today) | 1.46 | 64 of 150 |
| 0.75 | 5.78 | 0 |
| 0.85 | 6.88 | 0 |

**Proposed tokens on an 85 % plate over pure white** (absolute worst case; `data/token-contrast.json`):
- text `#eef5ee` 10.7:1;
- dim `#b4c6bd` 6.6:1;
- label `#9fb4aa` 5.4:1;
- energy `#7fd8e0` 7.2:1;
- caution `#ffc55c` 7.6:1;
- danger `#ff6b4f` 4.2:1, so it is used for fills only, with `#ffb3a3` for danger text.

Crops: `work/hud/shots/crop-w02-shaft-tracker.png`, `crop-w02-shaft-vitals.png`, `crop-portrait-deep-top.png`, `crop-deep-tracker.png`, `crop-w02-arrival-toast.png`.

### M3 · Screen coverage and camera budget (`coverage.py`; `data/coverage.json`)

- Coverage is the union of visible HUD component boxes.
- "Rows clear" counts world rows between the rig and the nearest HUD box in the rig's column band (±1.5 tiles).
- Camera reservations come from `layout.ts:7-15`.

| Scene | HUD coverage | Camera reserve top+bottom | Rows visible below rig | Rows clear below rig | Rows clear above rig |
|---|---|---|---|---|---|
| Desktop first frame | 5.0 % | 56+48 px = 11.6 % | 7.4 | 7.4 | 6.5 |
| Portrait first frame | 16.9 % | 210+100 px = 36.4 % | 8.2 | 5.8 | 5.2 |
| Portrait dive (message up) | 22.0 % | 36.4 % | 8.1 | 4.8 | 5.3 |
| Landscape 844×390 first | 15.1 % | 152+64 px = **55.4 %** | 3.3 | 2.2 | 2.0 |
| Landscape 844×390 dive (message up) | 17.7 % | 55.4 % | 3.2 | **1.5** | 2.0 |
| Short landscape 568×320 first | 27.4 % | 152+64 px = **67.5 %** | 2.5 | **1.4** | 1.3 |
| Short landscape 568×320 dive (message up) | 31.2 % | 67.5 % | 2.4 | **0.7** | 1.4 |

Portrait detail: the tracker spans y 72–209 px under the 10–55 px vitals, so the top 25 % of the screen carries text (`data/probe-portrait-first.json`).

### M4 · Low-energy warning timeline (`hud-capture.mjs lowenergy-*`; `data/timeline-*-lowenergy.json`)

Fixture: W01 at 120 m, 2.7 L of 10 L, Down held, HUD sampled every 100 ms.

| t (portrait) | Energy | Danger banner | Message line |
|---|---|---|---|
| 0.0 s | 2.7 L | – | – |
| 0.5 s | 2.5 L | "Low energy · return to the lander" | – |
| 3.6 s | 1.5 L | "Energy critical · return to the lander" | – |
| 8.2 s | 0.0 L | disabled card | – |

- **Across desktop, portrait and 568×320, `#campaign-message` was never set during the dive** (`messagesSet: []` in all three timelines). The three explanatory texts in `main.ts:880-886` are unreachable, because `showMessage` returns while the danger flag is set (`main.ts:431`). This independently confirms FTUE-F2.
- The 8 % band has no banner of its own.
- The danger banner is about 229×33 px at 13 px bold (`data/joystick-portrait.json`); two lines measure 246×52 px (`data/damage-desktop.json`).
- Sound starts muted (`audio.ts:14`).

### M5 · Message collisions and suppression

- **Hold full lost (native, deterministic).**
  - Holding Down from Deploy fills the hold to 7/7 at 6.5 s (70 m).
  - The visible message at that moment is "Wreck survey beacon · Very close…" (`data/timeline-desktop-cargo.json`).
  - "Hold full" never shows, which agrees with FTUE-F9.
  - The cargo readout "7 / 7" has the same 14 px white style as "0 / 7" (`data/probe-desktop-cargo-full.json`).
- **Hazard card suppressed by low energy.** In a W02 cold pocket:
  - At 8 L the card "Cold mist · move clear · 1.0 s" shows.
  - At 2.2 L the card and the message are hidden, and only the "Low energy" banner remains, while the simulation's `coldWarning` flag is `true` (`data/cold-desktop.json`, `cold-portrait.json`; `work/hud/shots/h-desktop-cold-warning-lowenergy.png`). The cause is `main.ts:695-708`.
- **Triple redundancy without danger.** The same cold-mist warning appears three times at once (`h-desktop-cold-warning.png`):
  - an in-world label;
  - the card;
  - the message "Cold mist forming. Leave the pocket…".
- **Stale message on load.** Every W02 checkpoint load shows the arrival line "Ice comet expedition ready. Follow the mission signal…" (`model.ts:115-118`). It appears even at 120 m in M3 (`h-desktop-tools.png`, `h-small-tools.png`).
- **Expiry behind overlays.**
  - `messageUntil` is a 4 s wall-clock timer (`main.ts:433`) and keeps running while overlays hide the line (`style.css:1230-1237`).
  - Example: the recovery result is set while the menu opens after confirmation (`main.ts:1645-1652`), so it has usually expired unseen by the time the player resumes.

### M6 · Home and target indicators by depth

The lander's world label and edge arrow are drawn only while the surface line is less than 3 tiles above the top of the screen (`scene.ts:1244`, `:1302-1310`).

| Form factor | Rig screen Y | Lander pointer disappears below |
|---|---|---|
| Desktop | 422 px, tile 65 | about 95 m |
| Portrait | 459 px, tile 48 | about 126 m |
| Landscape 844×390 | 232 px, tile 48 | about 78 m |
| Short landscape 568×320 | 200 px, tile 48 | about 72 m |

- **Shown at 60 m:** `shots/d04-drilling-shallow.png`.
- **Absent at 190–200 m:** `work/hud/shots/h-desktop-lowenergy-15.png`, `h-desktop-noreturn.png`.
  - In the second capture (M2, 3.1 L) the only bearing on screen is "↙ Lander pressure valve 111 m".
- **When the tracker targets the lander:** `poi.ts:234-306` points it home only for mission reasons (ore or mission cargo carried, construction, launch). It never does so for energy reasons.
- **Mission target edge marker:** shown only within 80 m (`scene.ts:1421`; `MISSION_SIGNAL_RANGES.near = 8`).
- **No lander marker at all:** `signal.kind !== "lander"` (`scene.ts:1421`).

### M7 · Colour-state distinguishability (`colours.py`; `data/colour-states.json`)

Method: CIE76 ΔE, plus Machado 2009 colour-vision-deficiency simulation.

| State pair | Normal ΔE | Deuteranopia | Protanopia |
|---|---|---|---|
| Energy normal vs critical bar | 67.1 | 63.2 | 56.1 |
| **Hull normal vs critical bar** | **12.0** | **8.8** | **7.3** |
| Task complete vs pending glyph | 18.8 | 8.5 | 11.3 |

- Critical hull changes only the bar tint (`style.css:1806-1809`).
- The hull value stays white: "2 / 10" in `h-desktop-double-warning.png`.

### M8 · World labels and canvas resolution

- **Canvas resolution.** On the DPR-2 phone contexts the canvas backing store is 393×851 for a 393×851 CSS viewport (`data/probe-portrait-first.json` › canvas).
  - Phaser runs with `scale.mode NONE` (`main.ts:1975`).
  - Text objects default to resolution 1 (`node_modules/phaser/src/gameobjects/text/Text.js:249-252`).
  - All in-canvas labels are therefore drawn at half device resolution, visibly softer than the DOM HUD (`shots/p02-surface.png`, `shots/l02-drilling.png`).
  - They also use `system-ui` instead of the DOM's Arial (`scene.ts:475` vs `style.css:2`).
- **Clipping.** On 844×390 the "Wreck…" marker label is clipped at the left edge (`shots/l02-drilling.png`, `work/hud/shots/h-landscape-dive.png`; marker at x = 86, `data/probe-landscape-dive.json`).
  - Beside-labels use `setWordWrapWidth(Math.max(75, anchorX − 14))` (`scene.ts:807-810`).
  - Here the right-aligned anchor is x ≈ 45, so a 75 px wrap box starts at about x = −30.
- **Inspection callout distance.** The callout is drawn at the screen bottom (`scene.ts:1951`), not at the tile:
  - desktop: about 330 px below the tapped ore;
  - portrait: about 207 px below it (`data/inspect-*.json`; `h-desktop-inspect.png`, `h-portrait-inspect.png`).
  - The tapped tile gets no highlight.

### M9 · Phone thumb zone

- In portrait, a touch joystick held at (300, 690) overlaps the low-energy banner box (82–311 × 692–725) (`work/hud/shots/h-portrait-joystick-danger.png`, `data/joystick-portrait.json`).
- On coarse pointers, banners and messages sit at `bottom: 126 px` (`style.css:1918-1922`), inside the lower half where the floating joystick is placed.

### M10 · Extraction cue geometry (`data/probe-*-volatile-release.json`)

| Form factor | Card box | Rig position | Button |
|---|---|---|---|
| Desktop | 560×78 at y 704 | y 423 | 102×44 |
| Portrait | 365×128 at y 559 | y 460 | full-width 345×44 |
| 568×320 | 230×82, top-right | – | – |

- On desktop the card sits 281 px below the rig.
- The card asks the player to read 17 words ("Return the joystick to centre, lift, release the drill key or use Release drill.", `main.ts:684-686`) inside a 0.75 s window. On keyboard it still talks about the joystick.

---

## 4. Findings (most severe first)

### HUD-F1 · Critical · The HUD never answers "can I get home?" It has no return estimate, loses the home bearing below about 72–126 m, and gives energy no more weight than cargo
**Evidence**
- **No return estimate.** No return-cost or margin estimate exists in `model.ts`, `main.ts` or `scene.ts`. A search for estimate/return/reserve finds only the service-reserve copy. The energy UI is the bar plus fixed 25/15/8 % bands (`main.ts:372-380`, `:876-889`).
- **Home bearing disappears at depth (M6).**
  - The lander pointer vanishes below about 95 m on desktop, 126 m in portrait and 72–78 m in landscape (`scene.ts:1244`).
  - Below that, the lander appears only if a mission reason makes the tracker target it (`poi.ts:234-306`).
  - At 200 m with 3.1 L the only bearing on screen points to the valve (`work/hud/shots/h-desktop-noreturn.png`).
  - At 190 m with 1.5 L the banner says "return to the lander" while the tracker still says "Approach the wreck beacon to survey" (`h-desktop-lowenergy-15.png`).
- **No visual priority for energy (M1).** The energy gauge is 123×3 px on desktop and 113×2 px on phones. Its value is 14 px on desktop and 12 px on phones, exactly like depth, cargo and haul. Energy and hull share one 154 px column design (`style.css:167-224`; crop `work/hud/shots/crop-desktop-vitals.png`).

**Player impact:**
- The core risk of the genre (dig deeper or go home) is invisible. Players learn the return cost only by running dry.
- A dry tank costs the carried haul (FTUE-F1: 380 CR lost on the natural first dive).
- Even a cautious player 200 m down may not know which way home is.

### HUD-F2 · Major · Warnings are generic, late and small. They mute every other message, so hazard warnings vanish when energy is low, and critical hull is nearly invisible
**Evidence**
- **Generic banners.** The only low-energy cue is a 13 px banner of about 229×33 px with "Low energy / Energy critical · return to the lander" (`main.ts:372-380`, `style.css:1784-1802`; M4). It has no icon, distance, margin or escalation at 8 %.
- **Dead band messages.** The three explanatory band messages are never shown on any form factor (M4: `messagesSet: []`). Root cause: `main.ts:431` exits `showMessage` while `data-campaign-danger` is true, and `syncSafety` sets that flag at the same 25 % threshold before the band check at `:876-889`.
- **Danger mutes all routine messages** (`main.ts:431`; `style.css:1803-1805`). This includes:
  - "Brittle shelf cracking! Move clear" (`model.ts:780`);
  - damage reports (`model.ts:799`);
  - "Hold full".
- **The cold-mist card is also suppressed under low energy** (`main.ts:695-708`; M5; `h-desktop-cold-warning-lowenergy.png`). Its 1.0 s countdown disappears while the slow-down is still coming.
- **Critical hull (≤ 25 %)** only tints the 3 px bar, by ΔE 12.0 (7.3 under protanopia). The value text stays white (M7; `style.css:1806-1809`; `h-desktop-double-warning.png`).
- **Sound is muted by default** (`audio.ts:14`), so the `warning` blip (`main.ts:887`) is silent for new players (FEEL-F1).

**Player impact:**
- The one alarm the game has is easy to miss and says nothing actionable.
- When energy is low, the player also loses hazard warnings, so they are slowed by cold or hit by a shelf without warning at the worst moment.
- Low hull is effectively silent.

### HUD-F3 · Major · Text sits on the world with no plate, so readability collapses over explored terrain and comet ice
**Evidence**
- The styling is deliberate: "Instruments are projected over the world. No dashboard surfaces or blur." (`style.css:143`, `:144-156`). Legibility relies on a two-layer dark text shadow with 3 px and 9 px blur (`style.css:8`).
- Measured over explored ground (M2):
  - W02 shaft: **23 of 24** text elements fall below 4.5:1 and 11 below 3:1, with a median of 4.18 and a worst of 1.96:1 for "ENERGY".
  - Portrait W02 shaft: 24 of 24 below 4.5:1.
  - Portrait W01 at 320 m: worst 2.0:1.
  - W02 load message ("Ice comet expedition ready…") over the ice ridge: 2.47:1 (`work/hud/shots/crop-w02-arrival-toast.png`).
  - Portrait comet surface "DRILL": 1.46:1.
- Crops: `work/hud/shots/crop-w02-shaft-tracker.png`, `crop-portrait-deep-top.png`.
  - The tracker text overlaps the beacon wreck art and ore icons.
  - The Unlock line and pending glyphs become faint.
- An 85 % plate raises the worst case to 6.88:1 with zero failures (M2 plate simulation).

**Player impact:**
- Text gets harder to read as the game progresses: more explored terrain, and the bright W02.
- The HUD visually merges with the art. This is a large part of why the screen looks unpolished.

### HUD-F4 · Major · On phones, the HUD and its fixed camera reservations hide the dig face, and warnings sit under the thumb
**Evidence**
- **Fixed reservations.** `campaignSafeArea()` (`layout.ts:7-15`) reserves fixed pixel bands regardless of the actual HUD:
  - 210+100 px in portrait (36 % of the height);
  - 152+64 px in landscape: 55 % at 844×390 and 67.5 % at 568×320.
- **Rows below the rig (M3).** At 568×320 only 2.5 rows are visible below the rig, 1.4 clear of HUD, and 0.7 with a message up.
  - The toolbar (y 268–312) and the message line (y 235–252) sit in the rig's column (`work/hud/shots/h-small-dive.png`, `h-small-tools.png`).
- **Tracker footprint.** In portrait it covers y 72–209 px over the shaft. In short landscape it covers 17 % of the screen (M3).
- **Thumb-zone placement.**
  - On touch, banners and messages are at `bottom: 126 px` / `124 px` (`style.css:1918-1922`, `:1410-1414`), in the joystick area.
  - A held joystick overlaps the low-energy banner (M9; `h-portrait-joystick-danger.png`).
- **Wrapping in landscape.** With the full W02 loadout, tracker lines wrap ("Construction · 1,000 / CR ready", "Cryogenic catalyst · / 1000 m") (`h-small-tools.png`).

**Player impact:**
- In landscape on a phone, players dig with about one row of look-ahead. They cannot see ore, caves or hazards coming.
- The thumb covers the one warning that matters.

### HUD-F5 · Major · Notifications are one last-write-wins line with no queue or priority: messages are dropped, duplicated, stale or expire unseen
**Evidence**
- `showMessage()` overwrites immediately and shows for a fixed 4 s (`main.ts:429-435`). There is no queue, priority, coalescing or minimum display time.
- **Dropped.** "Hold full" is replaced by a proximity alert in the same tick on every opening dive (M5; FTUE-F9). Everything is dropped while a danger banner shows (HUD-F2).
- **Duplicated.**
  - Proximity alerts restate the tracker. "Wreck survey beacon · Signal nearby. Approach the wreck beacon to survey." repeats the tracker's locator and next line (`shots/p03-drilling.png`, `shots/l02-drilling.png`).
  - Cold mist is shown three times at once (M5).
- **Stale.** The W02 arrival line replays on every load (`model.ts:115-118`; `h-desktop-tools.png` at 120 m in M3).
- **Expired unseen.** The 4 s timer keeps running while overlays hide the line (`main.ts:433`; `style.css:1230-1237`).
- **No visual weight.** Messages are 13 px (12 px on phones) without a plate or icon, so they read at 2.47:1 over ice (M2).

**Player impact:**
- Players miss key lessons (cargo limit, hazards) and learn to ignore the line, which mostly repeats the tracker.

### HUD-F6 · Major · Type is too small and flat, and the Larger text / High contrast settings do not reach the HUD
**Evidence**
- 69 % of desktop and 96 % of phone HUD text is 12 px or smaller. The energy value is 12 px on phones (M1).
- Labels such as "ENERGY", "HULL", "HAUL", "DRILL", "MOBILITY" and "PROCESSOR" are 12 px caps (letter-spaced vitals labels at `style.css:190-194`; toolbar labels at `:478-481`). Values are 14 px on desktop and 12 px on phones.
- The design target is 14–16 px body text (`docs/DESIGN_PACK_IMPLEMENTATION.md:134`).
- `.campaign-large-text` changes only panel paragraphs and buttons (`style.css:1266-1269`). With Larger text plus High contrast, 0 of 26 HUD text sizes changed (M1; `work/hud/shots/h-portrait-largetext-contrast.png`).
- High contrast only adds a heavier shadow and a 1 px meter outline (`style.css:1256-1265`).
- Canvas labels are hard-coded at 12 px (`scene.ts:476`).

**Player impact:**
- On a phone at arm's length, the vital numbers are the smallest text on screen.
- Players who need larger text get no help in play, where it matters most.

### HUD-F7 · Moderate · The HUD does not show change: no deltas, no motion and no full-hold state, and pickups show no value
**Evidence**
- `style.css` has **zero `@keyframes`**. It has three transitions: button background, meter width 0.12 s, and message opacity 0.16 s (`style.css:49`, `:210`, `:409`).
- Credits, haul and hull change silently in place (`main.ts:741-751`).
- Pickups:
  - The only pickup feedback is a 12 px canvas "+ Name" label for 1.2 s, rising 12 px, with no value (`scene.ts:941-956`, `:1925-1931`).
  - Routine "X secured. n/7 bulk." messages are filtered out (`main.ts:415-416`).
- The cargo readout looks identical at 7/7 and 0/7 (M5).
- Damage gives a 0.3 s outline around the rig. The hull readout does not react (`scene.ts:957-960`, `:1888-1897`).

**Player impact:**
- Reward and loss do not register. The player cannot tell what a pickup was worth, or that the hold just filled.
- This contributes to the flat progression feel (PROG-F9, FEEL-F5).

### HUD-F8 · Moderate · The mission tracker is a seven-line text block that repeats itself, ignores danger and names one object five ways
**Evidence**
- The tracker shows seven lines: step and title, three tasks, locator, next, and reward (`main.ts:176`, `missions.ts:44-114`). At 12–13 px it spans 266×139 px on desktop (`data/probe-desktop-first.json`).
- **Three lines for one action:**
  - task "Survey beacon · 100 m";
  - locator "Wreck survey beacon 99 m Tracking";
  - next "Approach the wreck beacon to survey" (`shots/d02-surface-start.png`).
- The reward line ("Unlock: rank 1 hardware + anchoring feet") is permanent.
- **No danger awareness.** At 1.5 L the next line still says "Approach the wreck beacon to survey" (`work/hud/shots/h-desktop-lowenergy-15.png`). The next line comes from `poi.ts:388` and ignores vehicle condition.
- **Five noun phrases for the beacon:**
  - "Survey the wreck" (`config.ts:463`);
  - "Survey beacon" (`missions.ts:49`);
  - "Wreck survey beacon" (`poi.ts:115`);
  - "wreck beacon" (`poi.ts:388`);
  - "Wreck signal" / "Survey wreck" (`scene.ts:1465-1476`, `poi.ts:116`).
- **Mixed names for the home base:**
  - W01: "Salvage lander" (signal name and toast) beside the world label "LANDER RESTORED" (`shots/e03-lander-stage-3.png`).
  - W02: "COMET REFUGE" (world label), "Comet lander" (signal) and "Comet refuge" (dock title).

**Player impact:**
- High reading load: 63 words on the first frame (FTUE-F4). Players cannot tell which line matters.
- The guidance contradicts the danger banner at the moment of greatest risk.

### HUD-F9 · Moderate · World-space indicators are limited and fragile: short-range only, no lander marker, edge clipping, half-resolution text, and inspection detached from the tile
**Evidence**
- **Range and coverage (M6).**
  - The mission edge marker appears only within 80 m (`scene.ts:1421`).
  - There is no world marker for the lander (`signal.kind !== "lander"`).
  - Off-screen markers show no distance text; only on-screen ones are labelled (`scene.ts:1461-1486`).
- **Clipping.** Beside-labels clip off the left edge on short screens (M8; `shots/l02-drilling.png`).
- **Resolution and font.** All canvas labels render at 1× on 2× screens and in a different font from the DOM HUD (M8; compare the soft "← LANDER · 150 m" with the crisp DOM text in `shots/p02-surface.png`).
- **Inspection.** The callout is a bare 12 px line at the screen bottom, 207–330 px from the tapped tile, with no highlight (M8; `work/hud/shots/h-desktop-inspect.png`, `h-portrait-inspect.png`).
- **Title overlap.** The world label shows through the title screen and overlaps it (`shots/p01-title.png`; FTUE-F8).

**Player impact:**
- Navigation help disappears just when the player is deep or far.
- Labels look blurry and amateurish on phones.
- Inspection, a good teaching hook, feels disconnected.

### HUD-F10 · Moderate · Extraction and hazard cues are long, input-agnostic text away from the rig, inside sub-second windows
**Evidence**
- **Too much to read.** The release card asks for 17 words inside a 0.75 s window: "Return the joystick to centre, lift, release the drill key or use Release drill." (`main.ts:684-686`).
- **Wrong input wording.** The card mentions the joystick on keyboard play (`work/hud/shots/h-desktop-volatile-release.png`).
- **Far from the rig.** On desktop the card is 281 px below the rig, while the ring around the rig carries the real cue (M10).
- **Duplicated.** The tracker repeats "Release drilling now to preserve the crystal" (`missions.ts:237-238`).
- **Cold pocket.** It shows label + card + message, but the card drops under low energy (M5).
- **568×320.** The card is placed top-right beside a tracker squeezed to 50 vw (`style.css:2162-2204`; `h-small-volatile-release.png`).

**Player impact:**
- W02's signature skill is taught through text nobody can read in time. Volatile losses that "hit novices hardest" (PROG-F10) are partly a cueing problem.

### HUD-F11 · Moderate · The visual language reads as a debug overlay, not a designed game HUD
**Evidence**
- **Hairlines and caps.** 3 px meters, 12 px letter-spaced caps labels, and the Arial system font (`style.css:2`). No frames, plates, depth or motion (`work/hud/shots/crop-desktop-vitals.png`, `crop-desktop-toolbar.png`).
- **Five icon languages:**
  - PNG line glyphs for vitals and cargo;
  - Unicode status glyphs (○ ↑ ✓ ◇) and arrows (↓ ↙ ◉) in the tracker (`main.ts:774-777`, `poi.ts:339-350`);
  - an inline SVG pause icon (`main.ts:200`);
  - a text "CR" mark;
  - illustrated item art at 31 px in the toolbar, where the feet icon is two hairlines (`work/hud/shots/icon-sheet.png`).
- **Unused designed glyphs.** The warning, cooldown, relic and shop glyphs from the manifest were exported (`assets/campaign/generated/icons/ui-warning-48.png` etc.) but are referenced nowhere in `src/` (grep).
- **Inconsistent units.** "HAUL 0 CR" (suffix) sits beside "CR 20" (prefix mark) (`main.ts:171-172`).
- **Unexplained disabled control.** The map button sits greyed at 38 % opacity until M2 (`main.ts:868-869`, `style.css:61-64`).

**Player impact:**
- The screen looks unfinished, which is a direct cause of the owner's "display not up to par".

### HUD-F12 · Minor · Several states are encoded by colour alone, and the critical hull tint fails colour-vision-deficiency checks
**Evidence**
- **Energy:** critical swaps cyan for amber (ΔE 67; fine), but with no shape, pattern or icon change.
- **Hull:** critical is ΔE 12.0, falling to 7.3 under protanopia, with no text colour change (M7).
- **Signal bands:** differ by colour and word (`style.css:381-391`).
- **Mission status:** glyph shape differs, which is good, but colour carries the emphasis.

**Player impact:**
- About 1 in 12 men with red–green colour-vision deficiency will not see the hull go critical.

### HUD-F13 · Minor · The toolbar shows static names and grows crowded, but not the tool states the design asked for
**Evidence**
- **Before M1** it shows only "DRILL / Salvaged auger" plus a disabled map (`shots/d02-surface-start.png`).
- **With the full W02 loadout** it has four labelled 12 px slots: "Space · Mobility / Anchoring feet", "HOLD Q / Precision", "UTILITY / Condenser active" (`work/hud/shots/h-desktop-tools.png`). On phones it competes with the message line (`h-small-tools.png`).
- **Missing cooldowns.** The design asked for "active tool/utility cooldowns" (`docs/DESIGN_PACK_IMPLEMENTATION.md:130`). The only states shown are a faint background on `aria-pressed` (`style.css:493-496`, `:2096-2099`). Neither the cooldown glyph nor charge or active state is displayed.

**Player impact:**
- A corner of prime screen space holds information that rarely changes, while tool states the player needs are not shown.

### HUD-F14 · Minor · The dock prompt and lander labels collide with the lander art and disagree on names
**Evidence**
- The "E Dock" prompt uses a 44 % translucent plate (`#0d1a1b70`, `style.css:417-432`), anchored 0.72 tile above the rig (`scene.ts:1999-2000`). On the restored lander it sits over the cabin window (`shots/e03-lander-stage-3.png`).
- In the same frame the world label says "LANDER RESTORED" while the toast and tracker say "Salvage lander · Dock available".

**Player impact:**
- Small, but it is the most-seen screen in the game: every trip ends here.

---

## 5. Redesign specification

### 5.1 Principles

1. **One question per corner.**
   - Upper left: "Can I survive and get home?" (energy, return margin, hull).
   - Upper right: "What am I carrying and where am I?" (depth, cargo, haul, credits).
   - Bottom left: "What am I doing?" (objective).
   - Bottom right: "What can I use?" (tools).
2. **Priority is visible.**
   - Energy and the return margin are the largest, highest-contrast element.
   - Everything else is secondary.
   - Alerts use one dedicated lane.
3. **Every text element sits on a plate**, so contrast is guaranteed, not left to the world behind it.
4. **Show change.** Deltas, state transitions and pulses, within reduced-motion rules.
5. **World-space cues live where the eye is.** Rig-anchored cues for sub-second actions; edge beacons for off-screen targets at any distance.
6. **Phones get fewer words, not smaller ones.**
   - One-line objective; icon-only tools; alerts at the top, away from the thumbs.
   - The camera budget is measured from the real HUD, not from constants.
7. **Respect the approved composition and the pack's type targets.** Every deviation is flagged.

### 5.2 Wireframes

Desktop 1440×900. See `work/hud/shots/mock-desktop-normal.webp` and `mock-desktop-critical.webp`. Legend: `[E]` energy icon, `[H]` hull icon, `^` home notch, `//` hatched zone, `#` fill, `.` empty segment, `|` segment break.
```
+----------------------------------------------------------------------------------------------------+
|+- VITALS plate 392 x ~110 ---------------------+            +- HAUL plate ~300 x 56 -----------+ +--+|
|| [E] ENERGY  2.9 / 10 L  [HOME 0.6 L, spare 2.3]|            | DEPTH  CARGO 2/7   HAUL  CREDITS | |II||
||          ^                                    |            | 90 m   ##.....     90 CR  20 CR  | +--+|
||   [//|####|....|....|....|....|....|....]  12px|            +----------------------------------+    |
|| [H] HULL  10/10  [######################]  6px |                                     LANDER 0 m -+ |
|+-----------------------------------------------+                                                 |  |
|              +- ALERT LANE (P0/P1) <= 560 px, y ~100 ------+     /^ LANDER 190 m . 0.6 L     90 m >|  |
|              | /!\ TURN BACK NOW . home 0.9 L . 0.3 L spare |     (edge beacon, any depth)  Wreck 100 <> |
|              +---------------------------------------------+                                    |  |
|   [WRECK SIGNAL . 72 m]                                                             safe to 230 m -+ | depth rail
|        ( o )                         +60 CR Bronzium                                              |//| 10 px
|                                         [ rig ]                                      Valve 250 m -|//|
|                                                                                                   |//|
|                       +- TOASTS (P2/P3) max 2, centred ------------+               Antenna 400 m -|//|
|                       | | Bronzium secured  +60 CR . hold 2/7      |                 Core 600 m -+--+
|+- OBJECTIVE CHIP <= 420 x 64 ---------+ +---------------------------------------------+ +- TOOL DOCK -------+|
|| (o) 1/3  Survey the wreck   *oo  [O] |                                                | [drill][feet][map]||
||    (<-) Wreck beacon 72 m . nearby   |                                                +-------------------+|
|+--------------------------------------+                                                                     |
+----------------------------------------------------------------------------------------------------+
```

Portrait 393×851. See `mock-portrait-normal.webp` and `mock-portrait-critical.webp`. Top band ≤ 150 px including the chip; the lower 45 % holds no text except the tool dock.
```
+-----------------------------------------+
|+- VITALS 8..325 x 8..96 -------+  +--+  |
|| [E] 2.9 / 10 L        [^ 0.6 L]|  |II|  |
||   [//|###|...|...|...|...]    |  +--+  |
|| [H] 10/10  90 m  ##.....  20 CR|        |
|+--------------------------------+        |
|+- OBJECTIVE CHIP (1 line, tap v) -----+  |
|| 1/3 Survey the wreck    (<-) 72 m  v |  |
|+--------------------------------------+  |
|   [ ALERT / TOAST LANE  y 150..190 ]     |
|                    /^ LANDER 180 m    |  |
|                                       |  | depth rail 8 px
|              [ rig ]                  >  | (labels on tap)
|       >= 6 rows of ground below       |//|
|                                       |//|
|   thumb zone: floating joystick;      |//|
|   no banner within 120 px of it       +--+
|                        +- TOOL DOCK -+   |
|                        | [feet][map] |   |
|                        +-------------+   |
+-----------------------------------------+
```

Landscape 844×390 and 568×320. See `mock-landscape-normal.webp` and `mock-landscape-critical.webp` (rendered at 568×320). Top band: the vitals plate (at most 96 px tall) at the left edge and the objective chip (at most 64 px) in the centre column, plus the alert lane when active. The camera reserves only what covers the rig's column: about 72 px at the top and 56 px at the bottom.
```
+-------------------------------------------------------------------+
|+- VITALS 208 x 88 ------+ +- OBJECTIVE CHIP (flex) ---------+ +--+|
|| [E] 1.2 /10 [TURN BACK]| | 1/3 Survey the wreck          v | |II||
|| [#|//|..|..|..|..|..]  | | (<-) Wreck beacon 72 m . nearby| +--+|
|| [H] 10/10  90 m  2/7   | +--------------------------------+   | |
|+------------------------+   [ /!\ TURN BACK NOW . 0.3 L spare ] | |
|                                                                 | |
|                        [ rig ]                                 |/|
|                 >= 3 rows visible below                        |/|
|   (left thumb: joystick)                       +- TOOLS -----+   |
|                                                | [feet][map] |   |
+-------------------------------------------------------------------+
```

### 5.3 Component specifications

**Vitals plate: energy and home margin** (P1, P2)

| Property | Desktop | Phone |
|---|---|---|
| Plate | 392 px wide, padding 10/12, radius 6, `--hud-plate` | full width minus pause button, padding 8/10 |
| Energy value | 20 px bold tabular, unit "L" 12 px dim | 18 px |
| Gauge | 350×12 px, radius 3 | 270×10 px |
| Segments | one per `max(1, ceil(capacity/20))` L | same |
| Notch | at the return estimate R: 3 px white bar with 1 px dark outline and a ⌂ glyph above; position lerped over 200 ms to avoid jitter | same |
| Home zone | 0 → R: red 135° hatch, 3 px stripes | same |
| Turn zone | R → R + b: amber hatch (b = buffer, see states) | same |
| Right chip | "⌂ HOME 0.6 L · spare 2.3" | "⌂ 0.6 L" |

Energy states. m = E − R is the margin; b = max(1.0 L, energy for one cut at the current row).

| State | Condition | Fill | Chip | Alert lane | Motion |
|---|---|---|---|---|---|
| OK | m > 2b | cyan `--energy` | "⌂ HOME R · spare m" | – | – |
| Plan | b < m ≤ 2b | cyan | amber "PLAN RETURN · m spare" | one P1 toast | chip pulse ×2 |
| Turn back | 0 < m ≤ b | amber → red | red "TURN BACK · m spare" | P0 "TURN BACK NOW · home R · m spare" with ⚠ glyph | plate pulse ×2 at 1 Hz, then steady 2 px outline |
| No return | m ≤ 0 | red, striped | "CAN'T REACH HOME" | P0 "Can't reach home · Recovery {fee}" and a Menu hint | steady |
| Floor (kept) | E ≤ 25 % / ≤ 15 % | as today | – | existing texts, now actually shown | – |
| At dock | `campaign.atDock` | as state | "Refuel {cost}" if < 50 % | none | – |

- In reduced motion, pulses become a static 2 px outline and an icon.
- Every state has a distinct icon and pattern (hatch or stripe) as well as colour.

**Hull** (P1, P2)
- 6 px bar with one segment per HP.
- Critical (≤ 25 %): red fill, red value text, ⚠ glyph and a hatch.
- Damage: a "−6" delta chip next to the value (600 ms) and a 300 ms bar flash. Reduced motion: opacity only.

**Haul plate: depth, cargo, haul, credits** (P1, P7)
- Depth: 20 px value.
- Cargo: one pip per bulk unit up to 20 (beyond that, grouped segments).
  - Pip colour follows the package tier, with the legend's shape markers inside 10 px pips (CVD-safe).
  - Mission objects show as diamond pips.
- Full hold: amber plate outline and a "FULL" chip.
- Refused pickup: the last pip flashes red, and a P2 toast reads "Hold full · Bronzium left here".
- Haul: credit colour, with "+60" deltas.
- Credits: always "{n} CR", suffix style everywhere.

**Depth rail** (P10)
- **Geometry:** 10 px wide on desktop, 8 px on phones, along the right edge between the top band and the tool dock. The scale runs from 0 to `world.depth`.
- **Markers:**
  - ⌂ surface/lander (0 m);
  - ▶ rig (white, labelled);
  - ◆ current target (mission colour);
  - ○ other known targets (dim);
  - a tick at the deepest point reached (`stats.largestDepth`);
  - optional pins for known hazards.
- **Safe band:** green from the surface down to the depth reachable with the current energy while keeping the return margin; hatched red below that.
- **Labels:** at least 14 px apart; collisions collapse into the nearer label. On phones, tap the rail to show labels for 3 s.

**Objective chip and drawer** (P6)
- **Collapsed:**
  - mission icon, "1/3" (12 px, mission colour), title (14 px bold), and task pips ●○○;
  - locator line: arrow chip 22 px, target name, distance, band word.
  - Desktop shows 2 lines; phones show 1 line (title + arrow + distance).
- **Drawer:**
  - Opens with the O key, a tap on ▾, or the gamepad Back button.
  - It also auto-expands for 4 s when the objective changes.
  - Contents: tasks with ✓ ○ ↑ ◇ glyphs, then the reward line.
- **Danger override:** in the Turn back or No return state, the locator shows "⌂ Lander ↖ 190 m" instead of the mission target.
- **De-duplication:** a "next" line that repeats the locator action is dropped. Names come from one glossary (§5.6).

**Alert lane** (P3, P2)
- Position: centred under the vitals band (desktop y ≈ 100; phones under the chip).
- Holds at most 1 P0 and 1 P1.
- Plate: dark red (`rgba(60,14,10,.9)`) with a `#ff6b4f` border for P0; dark amber for P1.
- Content: ⚠ `ui-warning` glyph, 16 px bold text (15 px on phones) and a countdown where one exists (cold mist).
- Persistence: shown while the condition holds; P1 hazards stay for at least 2 s.
- Never inside the joystick exclusion zone: 120 px around an active joystick centre (P5).

**Toasts** (P3)
- Plate with a 4 px priority stripe, a 22 px icon (ui-* glyphs) and 14 px text (13 px on phones). Maximum width 560 px / 92 vw.
- At most two visible. They enter with a 160 ms fade and 8 px slide, and exit with a 200 ms fade.
- Position: bottom-centre above the tool dock on desktop; the top lane on phones.

**World-space layer** (P4, P12)
- **Implementation:** a DOM layer `#campaign-world-ui` (pointer-events none), above the canvas and below the HUD. Positions come from per-frame scene coordinates. Text is crisp at any DPR and uses the HUD font.
- **Edge beacon** (lander and mission target):
  - a pill with an arrow rotated toward the target, the name and distance, plus the home cost for the lander;
  - drawn whenever the target is off-screen, at any distance;
  - clamped to the world safe rectangle (viewport minus HUD plates minus 8 px), never clipped;
  - at most 3 beacons.
- **Target pin** (on screen): the existing ring, plus a plated label measured and clamped to the viewport.
- **Pickup popup:** "+60 CR Bronzium", 13 px bold, rising 16 px over 900 ms. Reduced motion: fade only.
- **Inspection card:**
  - corner brackets on the tile, plus a plated card 8 px above it (below it if near the top);
  - contents: ore icon, name, value, bulk, "Ready to collect" or "Behind rock", and its legend shape marker;
  - closes after 4.5 s, on the next drag, or on tap elsewhere.
- **Dock prompt:** a solid plate above the lander roof (not over the cabin), "E Dock" / "Tap Dock", using the glossary name.

**Extraction cue** (P8)
- A rig-anchored pill of 4 words or fewer, input-aware:
  - "RELEASE ↓ NOW" (keyboard: key name);
  - "LIFT FINGER" (touch joystick);
  - "RELEASE (B)" (gamepad).
- The countdown sits inside the existing ring.
- On touch, the 44 px "Release drill" button stays as a bottom-centre thumb target.
- The explanatory sentence moves to the legend and a first-time coach hint (FTUE-P4).
- The cold pocket uses one rig-anchored cue (label plus countdown arc), not three, and it is never suppressed by the danger state.

**Tool dock** (P11)
- 44 px icon buttons with key caps.
- Shows only stateful or actionable tools:
  - anchoring feet: ready / anchored;
  - precision: armed;
  - condenser: active pulse or charge;
  - map: locked state with a lock badge and the tooltip "Unlocks at M2".
- Cooldowns or charges use the pack's `ui-cooldown` ring.
- The drill name moves to the tooltip, pause and dock screens.

### 5.4 Design tokens

```css
:root {
  /* type */
  --hud-font: "Inter", "Arial", sans-serif;      /* self-hosted OFL face, tabular figures (owner pick, D2) */
  --hud-scale: 1;                                  /* .campaign-large-text → 1.2; phones keep ≥ 12 px floor */
  --t-label: calc(11px * var(--hud-scale));        /* caps, 600, +0.08em (labels only, never values) */
  --t-body:  calc(14px * var(--hud-scale));        /* 13 px phones */
  --t-value: calc(20px * var(--hud-scale));        /* 18 px portrait, 16 px short landscape */
  --t-alert: calc(16px * var(--hud-scale));
  --t-world: calc(13px * var(--hud-scale));        /* DOM world labels */
  /* surfaces */
  --hud-plate: rgba(10, 22, 28, .85);              /* high contrast: .95 + 2 px edge */
  --hud-plate-edge: rgba(150, 190, 185, .22);
  --hud-radius: 6px;  --hud-gap: 8px;  --hud-pad: 10px 12px;
  /* text (contrast on the plate over white / over stone) */
  --hud-text: #eef5ee;   /* 10.7 / 15.6 */
  --hud-dim:  #b4c6bd;   /*  6.6 /  9.7 */
  --hud-label:#9fb4aa;   /*  5.4 /  7.9 */
  /* semantic */
  --energy: #7fd8e0; --hull: #e8a28f; --credit: #f0c27e; --mission: #f6cf8f;
  --ok: #8fe0b8; --caution: #ffc55c; --danger-fill: #ff6b4f; --danger-text: #ffb3a3;
  /* layers */
  --z-world-ui: 9; --z-hud: 10; --z-toast: 11; --z-alert: 18; --z-card: 24;
}
```

### 5.5 Motion rules

| Event | Normal motion | Reduced motion |
|---|---|---|
| Value increase (credits, haul) | +delta chip rises 12 px and fades over 600 ms; number counts up over 300 ms | delta chip fades in place; number jumps |
| Value decrease (hull, energy cost) | −delta chip in state colour, 600 ms; 300 ms bar flash | chip only |
| Gauge fill change | width 150 ms ease-out | instant |
| Notch move | lerp 200 ms | instant |
| State entry (Plan, Turn back, hull critical) | plate pulse ×2 at 1 Hz, then steady outline | steady outline from the start |
| Toast enter / exit | 160 ms fade + 8 px slide / 200 ms fade | fade 120 ms / fade 120 ms |
| Alert lane P0 | appears at once; glyph pulses ×2 | appears at once, static |
| Objective change | drawer slides open over 200 ms, auto-collapses after 4 s; completed task ✓ scales 1 → 1.2 → 1 | drawer opens without slide; no scale |
| World beacons and pins | ring pulse (today: ±2 px sine) | static (today's rule kept) |

- Motion never changes mechanical timing, as the pack requires.
- All motion is gated by `.campaign-reduced-motion`, which already follows `prefers-reduced-motion` (`input.ts:56`).

### 5.6 Accessibility and copy

- **Contrast.**
  - All HUD text reaches 4.5:1 or better against its plate composited over any world pixel, checked by `contrast.py` and `plate-sim.py` in CI (P13).
  - Values and alert text reach 7:1 or better.
  - Non-text state fills reach 3:1 or better.
- **Larger text.** `--hud-scale: 1.2`. It applies to the HUD, the world layer and toasts. The phone layout re-flows to wrap the chip to two lines rather than shrink.
- **High contrast.** Plate alpha 0.95, a 2 px edge, and pattern fills on every state.
- **Colour-vision safety.** Every state has colour plus an icon plus a pattern or word, and each cargo-pip tier carries its shape marker.
- **Screen readers.**
  - The alert lane is the only `role=alert`.
  - Toasts are `role=status` and are spoken once per key.
  - The objective chip has an `aria-describedby` drawer.
  - Energy state changes are announced as text ("Turn back, 0.3 litres spare").
- **Glossary** (`src/campaign/names.ts`): one display name per object.
  - Wreck beacon (W01 M1).
  - Lander (W01, stage-specific labels only on the world sign).
  - Refuge (W02), used in every tracker, world-label, toast and dock string.
- **Copy lengths.**
  - Alerts: 6 words or fewer, plus numbers.
  - Toasts: 9 words or fewer.
  - Sub-second cues: 4 words or fewer.

### 5.7 Message priority table (P3)

| Priority | Examples (source) | Lane | TTL / minimum | Coalesce key | When overlay open | When danger is up |
|---|---|---|---|---|---|---|
| P0 critical | Turn back / no return; hull critical; energy depleted (`syncSafety`) | alert | while condition holds | state | hidden, re-shown on close | – |
| P1 hazard | cold mist, shelf cracking, vent hit, falling shelf (`model.ts:703-711`, `:780`, `:799`) | alert (second slot) | ≥ 2 s or countdown | hazard id | queued | **shown** |
| P2 progress | hold full / pickup refused, mission part recovered, beacon surveyed, construction ready, upgrade installed (`model.ts:737`, `:750-766`, …) | toast | 3 s, minimum 2.5 s | event type + item | queued, timers paused | shown (below the alert) |
| P3 info | proximity bands, sold cargo, arrival (`main.ts:478-488`, `model.ts:851`) | toast | 2.5 s | target id | dropped if stale | dropped |

Rules:
- At most 2 toasts at once, and a queue of at most 4. Older P3 items are dropped first.
- A P3 is suppressed when its text equals the tracker's current locator or action.
- The pause menu gets a "Recent" list of the last 5 P1/P2 items, so nothing important is lost.

---

## 6. Proposals (highest priority first)

### HUD-P1 · Visual foundation: tokens, plates, type scale, and settings that reach the HUD
- **Addresses:** F3, F6, F11, F12 (part)
- **Effort:** M. **Impact:** high

**Change**
- Introduce the §5.4 tokens.
- Put every HUD group on a plate:
  - vitals plate;
  - haul plate;
  - objective chip;
  - toasts;
  - alert lane;
  - tool dock;
  - world labels.
- Adopt the type scale: values 20/18/16 px, body 14 px, labels 11–12 px caps.
- Use suffix units everywhere.
- Use one icon language: the pack's UI glyphs for vitals, warning and cooldown; SVG for the pause button and arrows. Unicode glyphs are removed from the tracker.
- Make Larger text and High contrast apply to the HUD.

**Implementation**
- **`style.css`.**
  - Add tokens at `:root` (lines 1-12).
  - Replace the shadow-only rules (`:143-514`) with plate classes.
  - Rewrite the three responsive blocks (`:1296-1565`, `:1566-1782`, `:1918-2204`) around `--hud-scale`.
  - `.campaign-large-text { --hud-scale: 1.2 }`.
  - `.campaign-high-contrast { --hud-plate: rgba(10,22,28,.95) }` plus a 2 px edge.
- **Font.** Self-host the chosen OFL font under `assets/fonts/` with `@font-face` (Vite bundles it), with fallback to Arial.
- **`main.ts`.**
  - HUD markup (`:163-189`): wrap groups in plate elements.
  - Swap the Unicode status glyphs for inline SVG (`:774-777`).
  - `HUD_ART` (`:43-112`) adds `warning` and `cooldown` (`ui-warning-48.png`, `ui-cooldown-48.png`).
- **`scene.ts` `label()`** (`:464-501`): read `--hud-scale` for font size, or migrate labels to the DOM layer (P4).

**Acceptance**
- `contrast.py` on the six worst scenes in M2 gives at least 4.5:1 for every HUD text element and at least 7:1 for values.
- With Larger text enabled, every HUD text leaf grows by at least 20 % (probe diff).
- High contrast raises plate alpha to at least 0.95.
- `npm test` and the usability, POI and frontier smoke tests still pass.
- Desktop, portrait and landscape screenshots match the §5.2 wireframes.

**Dependencies:** none. Build it alongside P13.

**Deviation:** replaces the implemented "projected instruments, no dashboard surfaces" style (`style.css:143`). That style is an implementation choice, not an approved decision, but the change is visible, so owner sign-off is needed (D1). It brings the HUD into line with the approved type targets (`DESIGN_PACK_IMPLEMENTATION.md:134`).

### HUD-P2 · Energy and home instrument with margin-based alert states
- **Addresses:** F1, F2, F12
- **Effort:** M. **Impact:** high

**Change**
- Build the §5.3 vitals plate:
  - segmented gauge;
  - home notch at the return estimate R;
  - hatched home and turn zones;
  - "⌂ HOME R · spare m" chip.
- Use the five energy states with icon, pattern and pulse.
- Hull critical gets red text, a glyph and a hatch.
- The alert lane carries numeric, actionable text.
- Keep the 25/15 % bands as a floor and make their texts visible.

**Implementation**
- **`model.ts`:** `get returnEstimate()` as specified by FTUE-P3 / PROG-P2 (straight-route v1, then breadth-first search over discovered cells for v2):
  - rows to the surface × lift cost per row;
  - plus the wrapped horizontal distance to the dock × drive cost per cell;
  - plus the remaining energy of any committed cut.
- **`main.ts` `syncHUD()`** (`:741-761`):
  - compute m and b;
  - set `data-energy-state` and the CSS variables `--energy-pct`, `--home-pct` and `--turn-pct` on the vitals plate.
- **`syncSafety()`** (`:365-385`):
  - generate alert text from the state ("TURN BACK NOW · home 0.9 L · 0.3 L spare");
  - stop routing band texts through `showMessage` (`:876-889`).
- **`style.css`:** gauge layers (fill, hatch zones, notch, segments) via CSS gradients, as in `work/hud/mock/mock.html`.
- **Tests:**
  - unit test for state thresholds;
  - browser fixture for each state on three form factors.

**Acceptance**
- The notch lies within −10 %/+30 % of the simulated return cost at 10 depths on 20 seeds (shared harness with FTUE-P3).
- On the naive dive, "Turn back" appears at least 1 s before the last safe turnaround.
- No state fires on a correct first trip.
- Each state is identifiable in a grayscale screenshot (icon and pattern).
- Hull critical shows red text and a glyph.
- Reduced motion produces no animation (computed style check).

**Dependencies:** P1; `returnEstimate` from FTUE-P3 / PROG-P2 (the same function; implement once).

**Deviation:** none. It adds to the approved persistent conditions. Keeping the 25/15 % floor is an owner choice (D7).

### HUD-P3 · Notification system: priority queue, lanes, coalescing and seen-tracking
- **Addresses:** F2, F5, F10 (part)
- **Effort:** M. **Impact:** high

**Change**
- Replace the single message line with the §5.7 queue: an alert lane (P0/P1) and up to two toasts (P2/P3).
- Hazards are never muted by low energy.
- Duplicates are coalesced, and P3 items that repeat the tracker are dropped.
- Timers pause while overlays are open.
- The pause menu gets a "Recent" list.

**Implementation**
- **New `src/campaign/notices.ts`:**
  - pure `NoticeQueue` with `push({key, priority, text, icon, ttl, minTtl})`, `tick(dt, {overlay, danger, trackerText})` and `visible()`;
  - unit-testable without the DOM.
- **Message sources.** Classify model messages.
  - v1: map the existing strings in `presentationMessage()` (`main.ts:413-428`) to `{key, priority}`.
  - v2: add `campaign.events: {type, payload}[]` in `model.ts` next to every `this.message =` (50 sites, `grep -c "this.message =" model.ts`), so priorities stop depending on wording.
- **`main.ts`:**
  - `showMessage()` (`:429-435`) becomes `notices.push`;
  - render alert and toast plates (`#campaign-alerts`, `#campaign-toasts`);
  - `syncExtractionCue` no longer checks `campaignDanger` (`:695-708`);
  - remove `body[data-campaign-danger] .campaign-message {visibility:hidden}` (`style.css:1803-1805`);
  - `syncMissionSignal` band alerts (`:478-488`) become P3 items keyed by target.
- **Stale load message.** Drop the W02 constructor message on load (`model.ts:115-118`); show the arrival line only after actual travel (`model.ts:1171`, `:1214`).

**Acceptance**
- The opening dive shows "Hold full · 7/7" for at least 2.5 s although the proximity alert fires in the same tick (`data/timeline-desktop-cargo.json` scenario).
- With 2.2 L in a cold pocket the cold card and countdown are visible (`cold-*` scenario).
- No item expires while an overlay is open.
- The three band texts appear in the low-energy timelines.
- Queue unit tests cover priority, coalescing, minimum TTL and overlay pause.
- `role=alert` is used only by P0.

**Dependencies:** P1 for styling. FTUE-P2a/c propose a lighter version of the same fix; implement this one instead.

**Deviation:** none.

### HUD-P4 · World-space indicator layer: home beacon at any depth, edge markers, crisp labels
- **Addresses:** F1, F9, F14 (part)
- **Effort:** M. **Impact:** high

**Change**
- Render world labels and indicators in a DOM layer (§5.3).
- Always show a lander beacon (direction, distance and home cost) when the lander is off-screen, at any depth.
- Show the mission target beacon at any distance (today only within 80 m).
- Clamp labels inside the world safe rectangle; nothing is clipped.
- Hide world labels under the title screen (FTUE-P2h).

**Implementation**
- **`scene.ts`:**
  - Replace `this.label(...)` calls for the lander edge label, mission labels, POI marker label, hazard labels, popup and inspection (`:1264-1309`, `:1404-1486`, `:1524-1533`, `:1580-1590`, `:1613`, `:1925-1958`) with pushes onto `indicators: {kind, id, x, y, text, tone, edge?, angle?}[]`.
  - Pass the array through a new binding `onIndicators(list)`. Keep the Phaser ring and arc graphics.
  - Remove the lander gating at `:1244` for the beacon (keep it for the stage label).
  - Remove `signal.band !== "distant"` and the `kind !== "lander"` exclusion at `:1421`.
- **`main.ts`:**
  - `#campaign-world-ui` renderer with element pooling and plain DOM writes;
  - edge clamping against `hudSafeRects()` from P5;
  - home cost text from P2's estimate.
- **Rendering:** text is crisp at any DPR, uses the HUD font and follows `--hud-scale`.

**Acceptance**
- At 200 m on all four form factors the lander beacon is visible, with a distance within ±10 m of `delta(x, dockX)`.
- An automated bounding-box check finds no label outside the viewport, including the `l02` case.
- On DPR 2, world-label glyph edges are as sharp as the DOM HUD (visual check, or measured with a text-edge sharpness script).
- No label renders while the welcome dialog is open.
- Frame time does not regress more than 1 ms on the desktop profile (FEEL-P11 harness).

**Dependencies:** P1; P2 (home cost); P5 (safe rectangles; until then use the current constants).

**Deviation:** none.

### HUD-P5 · Form-factor layouts and a measured camera safe area
- **Addresses:** F4, F8 (phone part), F13 (phone part)
- **Effort:** L. **Impact:** high

**Change**
- Implement the §5.2 layouts:
  - portrait top band of at most 150 px with the one-line chip;
  - landscape single top band;
  - alerts and toasts at the top on phones;
  - icon-only tool dock bottom-right;
  - joystick exclusion: no banner within 120 px of an active joystick centre.
- Replace `campaignSafeArea()` constants with the measured HUD rectangles, so the camera reserves only what is actually covered.

**Implementation**
- **`layout.ts`:** keep `campaignTileSize`; add `cameraSafeArea(rects, width, height)` that returns `{top, bottom}` reservations for the rig's column band only.
- **`main.ts`:** a `ResizeObserver` over the plate elements publishes `hudSafeRects()` through a new scene binding `getSafeArea()`.
- **`scene.ts`:** use it at `:970-974` and in `missionLabel()` (`:812-841`).
- **`style.css`:** replace the portrait and landscape blocks (`:1296-1782`, `:1918-2204`).
- **Touch:** the scene's joystick centre (`data-joystick-center-x/y`, `scene.ts:1965-1969`) drives a CSS class that moves the alert lane.

**Acceptance**
- While drilling, rows visible below the rig and clear of HUD (`coverage.py`):
  - portrait: at least 6 (today 5.8; 4.8 with a message);
  - 844×390: at least 3.5 (today 2.2 / 1.5);
  - 568×320: at least 3.0 (today 1.4 / 0.7).
- Idle HUD coverage in portrait is 12 % or less (today 16.9 %).
- No HUD box intersects the rig box on any form factor.
- In the touch script, no banner intersects the joystick circle.
- The usability and frontier phone scenarios pass.

**Dependencies:** P1, P3 (lanes), P6 (chip), P11 (dock).

**Deviation:** the pack prefers showing fewer cells to shrinking labels (`DESIGN_PACK_IMPLEMENTATION.md:120`). This proposal keeps label sizes and reduces words instead. Tool names leave the phone HUD (icons only); see P11.

### HUD-P6 · Objective chip, drawer, danger-aware locator and one naming glossary
- **Addresses:** F8, F1 (part), F14 (naming)
- **Effort:** M. **Impact:** medium

**Change**
- Collapse the seven-line tracker into the §5.3 chip.
- Tasks and reward move into an expandable drawer, which auto-expands for 4 s on objective change.
- In the Turn back state the locator switches to the lander.
- Names come from one glossary.

**Implementation**
- **`main.ts`:**
  - objective markup (`:176`) becomes chip + drawer;
  - `syncHUD` objective block (`:762-786`) and `syncMissionSignal` (`:436-489`) render the chip;
  - add an O key to `input.ts` `ACTION_LABELS` and `DEFAULT_KEYS` (`:13-37`) as "objective";
  - a tap on ▾ toggles the drawer.
- **`missions.ts`:** return `{step, title, tasks, reward, progress: [done, total]}`. "next" is used only when it differs from the locator action.
- **`poi.ts`:** when P2's state is Turn back or worse and the rig is not docked, `campaignSignal` targets the lander, with `returning = true` and `action = "Return to the lander"`.
- **New `src/campaign/names.ts`:** used by `poi.ts:115-116`, `:295`, `missions.ts:44-62`, `scene.ts:1268-1276`, `:1306`, `:1465-1476` and `main.ts:419-420`, `:804-811`.

**Acceptance**
- First-frame text in the default state has 25 words or fewer (today 63).
- The chip is at most 2 lines on desktop and 1 line on phones.
- The low-energy fixture shows the lander locator.
- Each object uses its single glossary name everywhere (unit test over the generated strings).
- The drawer opens and closes by key and by tap, and screen readers expose it.

**Dependencies:** P1, P2.

**Deviation:** the reward line is no longer always visible; it is in the drawer, auto-shown on change. This departs from the approved persistent "current objective/reward" (`DESIGN_PACK_IMPLEMENTATION.md:130`) → D3.

### HUD-P7 · Cargo pips and hold state
- **Addresses:** F7 (part), F5 (hold full)
- **Effort:** S. **Impact:** medium

**Change**
- Cargo becomes bulk pips coloured by tier with shape markers.
- A FULL state, and refusal feedback with a P2 toast.

**Implementation**
- **`main.ts` `syncHUD`** (`:748`): render pips from `campaign.cargo` (bulk, `itemId`, tags) into the haul plate.
- **Tier markers:** reuse `campaignOreMarker` from `src/mineral-legend.ts`.
- **Full and refusal states:** `data-full` when `cargoBulk === capacity`; the refusal flash comes from P3's `cargo-refused` event (`model.ts:755`).

**Acceptance**
- Pips equal bulk for 0–20 capacity; beyond that, grouped segments.
- The 7/7 frame shows FULL (`cargo-desktop` scenario).
- A refused pickup flashes and toasts.
- Tiers are distinguishable in grayscale.

**Dependencies:** P1, P3.

**Deviation:** none.

### HUD-P8 · Extraction and hazard cues anchored at the rig and input-aware
- **Addresses:** F10
- **Effort:** S. **Impact:** medium

**Change**
- Rig-anchored, input-aware release pill of 4 words or fewer, plus a countdown inside the ring.
- The card is reduced to title + timer; the explanation moves to the legend and the first-time coach.
- Cold mist becomes one rig-anchored cue with a countdown arc, never suppressed.

**Implementation**
- **`main.ts` `syncExtractionCue()`** (`:665-727`):
  - text from `actionKey("primary"/"down")` and the pointer kind;
  - pill positioned from the rig coordinates (`data-rig-screen-x/y`).
- **`scene.ts`:** draw the cold arc (`:1489-1535`) like the volatile arc (`:1824-1838`).
- **`style.css`** extraction blocks (`:2039-2107`, `:2128-2204`) are simplified.
- The 44 px Release button stays on touch.

**Acceptance**
- The release cue has 4 words or fewer.
- Its centre is within 1.5 tiles of the rig on all form factors.
- Keyboard play shows a key name, touch shows "Lift finger", gamepad shows its button.
- The cold cue is visible with 2.2 L.
- The 0.75 s window and the frontier smoke volatile tests are unchanged.

**Dependencies:** P1, P3.

**Deviation:** none; the mechanics are unchanged.

### HUD-P9 · Change feedback and motion system
- **Addresses:** F7
- **Effort:** M. **Impact:** medium

**Change**
- Delta chips for credits, haul, hull and energy cost.
- Count-ups.
- Pickup popups with value ("+60 CR Bronzium").
- State pulses.
- Every effect follows the §5.5 rules, including reduced motion.

**Implementation**
- **`main.ts` `syncHUD`:** keep the previous values and, on a difference, spawn pooled `.hud-delta` elements next to the readout.
- **`scene.ts` popup** (`:941-956`): emit value and name to P4's layer instead of the canvas label.
- **`style.css`:** `@keyframes hud-rise`, `hud-pulse`, `hud-flash`; `.campaign-reduced-motion` overrides to opacity only.
- **Coordination:** world effects come from FEEL-P3/P5 and reward tiers from PROG-P7; this proposal is the HUD half only.

**Acceptance**
- Every credit, haul or hull change produces a visible delta within 100 ms.
- A sale counts up in 300 ms or less.
- With reduced motion no element has a non-identity transform during deltas (computed style sampling).
- No layout shift: deltas are absolutely positioned.

**Dependencies:** P1, P4.

**Deviation:** none.

### HUD-P10 · Depth rail with mission markers and safe-depth band
- **Addresses:** F1 (part), F8 (target depths)
- **Effort:** M. **Impact:** medium

**Change**
- The §5.3 rail on the right edge on all form factors.

**Implementation**
- **`main.ts`:** new `renderDepthRail()` using:
  - `campaign.depth`;
  - `campaign.activeWorldDefinition` depth;
  - `campaignPois(campaign)` → `depthMeters`;
  - `state.stats.largestDepth`;
  - known hazards (`W02_HAZARDS`, `world.shelves` where `isKnown`).
- **Safe band:** depth where `E − cost(descend Δ) − R(depth+Δ) = b`, using the per-row dig and lift costs from P2.
- **Markup:** inside the HUD root, with the right-cluster safe rectangle registered with P5.

**Acceptance**
- Markers match target depths ±5 m.
- The safe band is within ±1 row of a headless harness replay.
- The rail is hidden on the surface when no target is deeper than the screen (optional).
- It is readable in grayscale.

**Dependencies:** P2 (estimate), P1, P5.

**Deviation:** adds an element. The approved composition puts the "depth/route distance" readout at the upper right, and it stays there. Mission depths are already listed in the tracker, so the rail reveals nothing new. The safe band is an assist → D5.

### HUD-P11 · Tool dock with real state
- **Addresses:** F13, F11 (part)
- **Effort:** S. **Impact:** low

**Change**
- 44 px icon buttons with key caps.
- Shows ready, active, charge and cooldown using the pack's cooldown glyph.
- The locked map shows a lock badge and "Unlocks at M2".
- Static names move to tooltips, pause and dock.

**Implementation**
- **`main.ts` toolbar markup** (`:182-188`) and `syncHUD` toolbar section (`:787-870`).
- **`style.css`** toolbar blocks (`:448-514`, `:1381-1409`, `:1658-1693`, `:2128-2160`).

**Acceptance**
- On phones the dock is at most 3×44 px plus gaps.
- Feet, precision and condenser state changes are visible within 100 ms.
- The locked map explains itself on hover or tap.

**Dependencies:** P1, P5.

**Deviation:** the drill name is no longer shown in play. The approved "equipped tools" stay visible as icons → D6.

### HUD-P12 · Inspection card, dock prompt and label polish
- **Addresses:** F9 (part), F14
- **Effort:** S. **Impact:** low

**Change**
- **Inspection:** tile brackets plus a plated card next to the tile, with icon, value, bulk, status and legend marker.
- **Dock prompt:** a solid plate above the lander roof, using the glossary name.

**Implementation**
- **`scene.ts`** inspection (`:374-412`, `:1933-1958`) emits a card indicator to P4's layer.
- **`scene.ts`** brackets go on the existing `edges` graphics.
- **Dock prompt:** `style.css:417-447`; position from the lander top rather than the rig (`scene.ts:1999-2000`).

**Acceptance**
- The card is within 1.5 tiles of the tapped tile on all form factors.
- Its text contrast is at least 7:1.
- The prompt does not overlap the lander sprite's cabin box.

**Dependencies:** P4, P1.

**Deviation:** none.

### HUD-P13 · HUD regression harness (contrast, coverage, overlap, clipping)
- **Addresses:** all, as a guard
- **Effort:** S. **Impact:** low (enabler)

**Change**
- Turn this audit's probe, contrast and coverage method into `npm run test:hud`.

**Implementation**
- **`scripts/hud-smoke.mjs`:**
  - adapted from `work/hud/hud-lib.mjs` and `hud-capture.mjs`;
  - scenes: first frame, explored stone, W02 ice, low energy, volatile, cold, on four viewports.
- **Thresholds:**
  - minimum p90 contrast of 4.5 (7 for values);
  - minimum rows clear below the rig per form factor (P5);
  - no label outside the viewport;
  - no banner over the joystick.
- **Python step:** contrast via a small Node PNG reader (`pngjs` is not installed; either add it as a dev dependency or keep the Python step).

**Acceptance**
- The harness fails on today's build for contrast and rows, and passes after P1 and P5.
- It runs in under 2 minutes.

**Dependencies:** none.

**Deviation:** none.

### Suggested order

| Step | Proposals | Note |
|---|---|---|
| 1 | P1 + P13 | Foundation and guard; immediately visible quality jump |
| 2 | P3 | Small, removes lost and contradictory messages |
| 3 | P2 | With FTUE-P3's estimate |
| 4 | P4 | Home beacon at any depth |
| 5 | P6, P7, P8 | |
| 6 | P5 | Biggest phone gain; needs steps 1–5 in place |
| 7 | P9, P10, P11, P12 | |

---

## 7. Owner decisions

- **D1 · Backing plates.** Replace the "projected, no surfaces" HUD style with translucent plates. Recommendation: yes, at 85 % opacity; it is the single largest readability and polish gain (M2).
- **D2 · Typeface.**
  - Keep Arial, or self-host an OFL face with tabular figures.
  - The mock uses Inter, which is neutral and highly legible.
  - A more "industrial" condensed face (for example Barlow Semi Condensed or Rajdhani) would give more character for value readouts.
- **D3 · Objective reward line** moves into the drawer (auto-shown for 4 s on change) instead of being always visible. This deviates from the approved persistent "current objective/reward".
- **D4 · Phone priorities.**
  - On short landscape, show credits and haul only when they change (toast/delta) rather than permanently.
  - Move alerts and toasts to the top band.
- **D5 · Assist level.** Should the depth rail's safe band and the always-on home beacon be default-on assists or an option? Recommendation: on by default, with a "Navigation assists" toggle in Systems.
- **D6 · Tool names.** The tool dock shows icons with key caps; names move to tooltips, pause and dock. This relaxes the approved "equipped tools" display from name to icon.
- **D7 · Fixed bands.** Keep the 25 %/15 % energy bands as a floor once margin-based states exist. Recommendation: keep 25 % as a soft caution only.
- **D8 · Mineral names (outside the HUD dimension; affects every popup and callout).**
  - W01's ores are "Ironium, Bronzium, Silverium, Goldium" with values 30/60/100/250 (`config.ts:371-404`). These are the first four minerals of the 2004 Flash game (`docs/RESEARCH.md:42-45`), and they are pinned in the design pack JSON.
  - Under this review's originality rule, I recommend renaming them; their values are evaluated by the progression auditor.
  - The HUD shows these names on every pickup and inspection.

---

## 8. Event → HUD response matrix (target state)

| Event | HUD element | World layer | Message lane | Notes |
|---|---|---|---|---|
| Ore collected | pip fills (tier colour), haul +delta | "+60 CR Bronzium" popup | – (P3 only if first of its kind) | FEEL-P3 sparkle |
| Hold full | FULL outline | – | P2 "Hold full · return or eject" | never dropped |
| Pickup refused | last pip flashes red | ore stays highlighted | P2 "Bronzium left here" | |
| Energy Plan | chip amber | lander beacon gains cost | P1 once | |
| Energy Turn back | gauge red, plate pulse | lander beacon highlighted | P0 | locator switches home |
| Energy no return | striped red | – | P0 + recovery fee | |
| Damage | hull −delta, flash | rig flash (FEEL-P7) | P1 "Ice vent −6 hull" | |
| Hull critical | red value, glyph, hatch | – | P0 | |
| Cold pocket warning | – | rig countdown arc | P1 with countdown | shown during low energy |
| Volatile release window | – | ring and "RELEASE ↓ NOW" pill | – | ≤ 4 words |
| Target band change | chip band word | target pin or edge beacon | P3 (suppressed if it repeats the chip) | |
| Objective change | drawer auto-opens 4 s, ✓ animation | – | P2 "Beacon surveyed" | |
| Sale or credits change | credits count-up | – | P2 in the dock feedback line | |
| Load or restore | – | – | none (no stale arrival line) | |

---

## 9. Cross-references to other auditors

- **First-session (02):**
  - FTUE-F2, F3, F9 and F18 overlap HUD-F1, F2, F4 and F5 on the same root causes. My evidence is independent (timelines, probes, coverage).
  - FTUE-P3's `returnEstimate` is the data source for HUD-P2, P4 and P10.
  - FTUE-P2a/c is superseded by HUD-P3.
  - FTUE-P9's progressive disclosure is compatible with HUD-P6 (the chip is the "one-line objective").
- **Progression (01):** PROG-P2(a) is the same estimate; PROG-P7 reward tiers feed HUD-P9 deltas and popups.
- **Feel (03):** FEEL-P7 (alarm, vignette, flashes) is the world and audio half of HUD-P2 and P3. FEEL-P3/P5 are the world half of HUD-P9.
- **Graphics (04):** canvas DPR handling (M8) affects all art. HUD-P4 removes text from the canvas regardless of how the graphics auditor resolves the DPR question.

---

## 10. Artefacts

Scripts (read-only against the repo). Run with `cd <repo> && node <script> <scenario…>`; set `HUD_URL` to use another dev server.
- `work/hud/hud-lib.mjs`
  - Helpers: open, freeze, probe, `shotHudOff`, fixtures.
- `work/hud/hud-capture.mjs`
  - Scenarios: `first-*`, `deep-*`, `w02-*`, `lowenergy-*`, `damage-desktop`, `cargo-desktop`, `volatile-*`, `cold-*`, `inspect-*`, `joystick-portrait`, `dive-*`, `prefs-*`, `noreturn-desktop`.
- `work/hud/hud-capture-tools.mjs`
  - Full W02 loadout.
- `work/hud/hud-capture-off.mjs`
  - HUD-off dive frames.
- `work/hud/contrast.py`
  - M2 contrast.
- `work/hud/plate-sim.py`
  - Plate simulation.
- `work/hud/coverage.py`
  - M3 coverage.
- `work/hud/colours.py`
  - M7 colour states.
- `work/hud/mock/mock.html` and `work/hud/mock/render.mjs`
  - Redesign mocks.

Data (`work/hud/data/`):
- probes: `probe-*.json`;
- contrast: `contrast-*.json`, `plate-sim-*.json`, `token-contrast.json`;
- timelines: `timeline-*-lowenergy.json`, `timeline-desktop-cargo.json`;
- scenarios: `cold-*.json`, `damage-desktop.json`, `inspect-*.json`, `joystick-portrait.json`, `volatile-*.json`, `noreturn-desktop.json`;
- layout and colour: `coverage.json`, `colour-states.json`.

Screenshots (`work/hud/shots/`). Key files:
- **Current state (`h-*`):**
  - `h-desktop-w02-shaft.png`, `h-portrait-deep.png`
  - `h-desktop-lowenergy-15.png`, `h-portrait-lowenergy-08.png`
  - `h-desktop-double-warning.png`
  - `h-desktop-cold-warning.png`, `h-desktop-cold-warning-lowenergy.png`
  - `h-desktop-volatile-release.png`, `h-portrait-volatile-release.png`, `h-small-volatile-release.png`
  - `h-portrait-joystick-danger.png`
  - `h-small-dive.png`, `h-landscape-dive.png`
  - `h-desktop-noreturn.png`
  - `h-desktop-inspect.png`, `h-portrait-inspect.png`
  - `h-desktop-tools.png`, `h-small-tools.png`
  - `h-portrait-largetext-contrast.png`
- **Crops (`crop-*`):** `crop-w02-shaft-tracker.png`, `crop-w02-shaft-vitals.png`, `crop-portrait-deep-top.png`, `crop-desktop-vitals.png`, `crop-desktop-toolbar.png`.
- **Icon sheet:** `icon-sheet.png`.
- **Mocks (`mock-*`):** `mock-desktop-normal.webp`, `mock-desktop-critical.webp`, `mock-portrait-normal.webp`, `mock-portrait-critical.webp`, `mock-landscape-normal.webp`, `mock-landscape-critical.webp`.

All browser sessions ran one at a time and were closed. Nothing in `<repo>` was modified. When the shared server on 5173 went down, a private Vite server on port 5177 was used for the last captures.
