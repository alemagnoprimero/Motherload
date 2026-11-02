# 03 · Game feel, controls, camera, feedback and audio

> **Archived audit report** (2026-11-02, baseline commit `dbf0b1a`), supporting [the improvement plan](../../IMPROVEMENT_PLAN.md). Source paths are relative to the repository root; `work/…`, `shots/…` and `analysis/…` are relative to `docs/improvement-plan/`. Review scripts named `*.test.ts` are archived as `*.audit.ts` (see [the folder README](../README.md)). Screenshots and captures (`*.png`) were local review files and are not committed, except the UI mocks, which are stored as `.webp`.

Dimension owner: motion physics, drilling timing and rules, input, camera, action feedback ("juice") and audio. Static art and world rendering belong to the graphics audit. The economy belongs to the progression audit. This audit was read-only: nothing in `<repo>` was changed.

All paths below are relative to `<repo>` except `work/…` and `shots/…`, which are relative to `docs/improvement-plan/`. "Tile" means one world cell (10 m). The desktop tile is 65 CSS px at 1440×900; phones use 48 CSS px (`src/campaign/layout.ts:2-5`).

---

## 1. Assessment

The simulation is solid. It runs at a fixed 120 Hz with bounded steps (`model.ts:350-358`), so it is deterministic and easy to tune headlessly. Ground handling is crisp: full speed in 0.30 s and reversal in 0.42 s. Cuts chain with a 4 ms gap, and holding Down gives an unbroken drilling flow.

What the owner calls "game quality" is lost in the layers around that simulation.

1. **The game is effectively silent.** Sound starts muted, the choice is not remembered, and the only switch sits inside Pause › Systems. With sound on, 98.7–99.9 % of the continuous mix lies below 150 Hz: a 48–96 Hz triangle hum, 43/64.5 Hz sine ambience, and "music" that is one 130.81 Hz sine note every 12 s. Phone and laptop speakers do not reproduce that range. The drilling mix measures −37 dBFS RMS.
2. **The core verb has almost no payoff.** Straight trips spend 69–83 % of their time in a committed cut, at 49–68 cuts per minute. A cut shows a progress bar and a faint crack overlay. It ends with ten grey squares 2.3 px wide, whatever the material. With sound on, every cut plays the "pickup" chime, while actual cargo pickup has no sound of its own.
3. **Returning to your shaft is a precision tax.** Down enters an existing shaft only within ±0.11 tile (±7 px on desktop). Off-centre, it drills a new shaft beside the old one. The shortest key tap moves the rig 0.17 tile. In the air the rig coasts 5.9 tiles over 5.4 s after you let go.
4. **The camera frames every situation the same way.** At the surface 43 % of the desktop screen is uniform fog. The horizontal "look-ahead" is smaller than the follow lag, so the camera trails. Phones in portrait show 8.2 columns, which is less than the 9-tile lamp diameter.
5. **Progress, danger and impact moments are flat.** A sale is an instant number change plus the same chime. A milestone is an instant sprite swap. A landing has no feedback at all. Low energy is text plus one blip. Running dry freezes the rig in mid-air.

The groundwork for fixing all this already exists:
- WebGL batching measured **1.5 draw calls per frame**, which leaves ample room inside the pinned 150-particle budget.
- Reduced motion is honoured in several places.
- The scene already declares a semantic event hook (`onEvent`) that is simply not connected.
- Separate audio buses and sliders exist.

Most fixes live in the presentation layer and cost S or M. Two model changes are S: a shaft "magnet" and an input buffer.

**Recommended order:**
1. P1 (audio foundation) and P2 (shaft magnet and control fixes).
2. P3 (drilling juice) and P4 (camera).
3. P5 to P8 (rewards, landing and flight, danger, rig motion).
4. P9 (input latency) and P10 (adaptive music).

---

## 2. Method and artefacts

All under `work/feel/`:

| Artefact | What it measures | Output |
|---|---|---|
| `physics.audit.ts` (vitest; imports the real `model.ts`) | Ground, air and vertical motion per engine rank and world. Landing damage against drop height. Drill durations per material, depth, rank and direction. Cut chaining. Mid-cut input. Side-cut trigger. Input buffering. Camera arithmetic. | `physics-results.json` |
| `precision.audit.ts` | Shaft entry against offset, tunnel capture while climbing, ground nudge per tap length, falling onto an opening, hover duty cycle | `precision-results.json` |
| `depletion.audit.ts` | Rig behaviour when energy reaches 0 mid-climb; simulation speed under the scene's dt clamp | `depletion-results.json` |
| `trip.audit.ts` | Time share per activity in straight W01 round trips (seed 73021) | `trip-results.json` |
| `feel-capture.mjs` (Playwright + Chromium, SwiftShader WebGL, frozen clock) | Renderer type, draw calls per frame, surface framing, mid-cut and completion frames, side-cut facing, thrust frame, mouse-hold latency, AudioContext creation and persistence. Offline render of the real `CampaignAudio` (loaded through Vite) with level and spectrum. | `feel-capture-results.json`, `shots/f01…f07*.png`, `shots/zoom3-*.png` |
| `fog-share.py` | Share of the screen that is uniform undiscovered fog (pixel classification) | console output, quoted in §3.5 |

Run the tests with `cd <repo> && npx vitest run --dir <work/feel>`. Run the browser capture with `node <work/feel>/feel-capture.mjs` against the dev server on :5173.

Cross-checks: baseline screenshots in `shots/` (d02, d04, d05, p02, p03, l02, e00–e03). The sibling report `analysis/02-first-session.md` independently found the ±0.11-tile shaft tolerance (its M20, FTUE-F13), the 180 ms mouse threshold, flat payoffs, and silent-by-default audio.

---

## 3. Measurements

### 3.1 Motion (stock rig unless noted; `physics-results.json`)

| Quantity | W01 | W02 | Source |
|---|---|---|---|
| Ground top speed (engine r0 / r1 / r2) | 5.00 / 5.55 / 6.19 tiles/s | same | `model.ts:512` (pinned `min(10, 5√p)`) |
| Ground time to 90 % / 100 % of top | 0.27 s / 0.30 s | same | accel 26, drag 3.2 (`model.ts:497-517`) |
| Ground release: stop (<0.05 t/s) and coast | 1.45 s, 1.54 tiles | same | |
| Ground reversal to −90 % | 0.42 s | same | |
| Full 7-slot Goldium hold | mass factor 1.057, top speed reached in 0.33 s instead of 0.30 s; same top speed and coast | — | pinned `1 + mass/198` (`model.ts:496`) |
| Air top speed / time to 90 % | 5.0 tiles/s / 0.30 s | same | air accel 17.6, drag 0.85 |
| **Air release: stop and coast** | **5.43 s, 5.86 tiles** | same | `model.ts:497` |
| Gravity | 6.35 tiles/s² | 4.04 tiles/s² | `model.ts:523` |
| Climb top speed / time to it | 6.0 tiles/s / 0.35 s | 6.0 / 0.32 s | `model.ts:533-540` |
| Release Up at full climb: time to apex, overshoot | 0.70 s, **1.85 tiles** | 0.97 s, **2.46 tiles** | rank 9 engine: 5.6 / 7.0 tiles |
| Free-fall terminal (r0 / r1 / r2 / r3+) | 6.0 / 6.66 / 7.43 / 7.49 | 4.77 for all ranks | fall is capped by the engine-dependent `maxVertical` |
| Hover duty cycle (ideal 60 Hz controller) | 24 % Up, 42 key toggles per 10 s, ±0.16-tile band | — | `precision-results.json` |

### 3.2 Drilling (`physics-results.json` › drill; durations from cut start to tile cleared)

| Case | Row 0 / 1 | Row 20 | Row 40 | Deepest | Energy per tile |
|---|---|---|---|---|---|
| W01 stock, soil, down (salvaged auger ×0.9) | 0.90 s | 1.13 | 1.35 | 1.56 s (r59) | 0.23–0.49 L |
| W01 stock, stone, down | 1.85 s | 2.31 | 2.77 | **3.21 s** | 0.47–1.01 L |
| W01 stock, soil / stone, side | 0.68 / 1.40 s | — | — | 1.16 / 2.39 s (r58) | |
| W01 rank-1 drill, soil / stone, down | 0.64 / 1.32 s | 0.80 / 1.65 | 0.96 / 1.98 | 1.12 / 2.30 s | |
| W02 stock, ice / frozen rock, down | 1.00 / 1.85 s | 1.25 / 2.31 | 1.50 / 2.77 | 2.23 / **4.14 s** (r99) | up to 1.30 L |
| W02 rank-2 drill, ice / frozen rock, down | 0.50 / 0.93 s | 0.62 / 1.15 | 0.75 / 1.38 | 1.12 / 2.07 s | |

- **Chaining.** With Down held, the next cut starts 4–5 ms after the previous one completes. Five cuts complete at 0.90, 1.81, 2.74, 3.68 and 4.62 s.
- **Committed cuts.** Up pressed during a stock stone cut at the surface is ignored for the remaining 1.59 s. The cut finishes first (`model.ts:424-429`).
- **Side-cut trigger.** A cut starts when the body is **0.146 tile** from the wall, at full 5 tiles/s. Velocity drops to 0 instantly (`model.ts:432`, `model.ts:487`). A hovering rig pushed into a wall never cuts, and neither does Right+Up on the ground (`model.ts:430`).
- **Mid-cut opposite input.** `facing` flips to "left" while the cut continues "down" or "right" (`model.ts:394`).

### 3.3 Navigation precision (`precision-results.json`)

| Test | Result |
|---|---|
| S1 · Down at the surface, offset from an existing 1-wide shaft | Offsets 0 to ±0.11 → drops into the shaft. **Offsets 0.12 to 0.45 → drills column+1** (a new tile). Window ±0.11 tile = ±7.2 px desktop, ±5.3 px phone. |
| S3 · Ground nudge per tap length | 17 ms → **0.17 tile**; 33 ms → 0.27; 50 ms → 0.41; 100 ms → 0.81; 150 ms → 1.22; 250 ms → 2.03 |
| S4 · Falling onto the opening with no input | Never enters at any offset: the surface walkway snap holds the rig (`model.ts:544-552`). An aligned Down press is always needed. |
| S2 · Climbing a shaft with Left held past a side tunnel | Captured into the tunnel (engine r0 and r2). This is forgiving. |

### 3.4 Landing and fall damage (`physics-results.json` › landingDamageByDrop)

| Engine rank | Hull lost for a drop of 2 / 4 / 8 / 12 / 16 / 20 / 30 / 50 tiles (W01) |
|---|---|
| r0, r1 | 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 |
| r2, r5, r9 | 0 / 0 / 0 / 0 / **1 / 1 / 1 / 1** |
| W02 (any rank) | never: terminal 4.77 < threshold 7 (`model.ts:586-590`) |

- Future W04 runs at 1.0 g. There the drag-limited terminal is 13.6 tiles/s and the cap is `6√p`. Fall damage would grow with engine rank: r2 1 HP, r5 2 HP, r9 3 HP.
- No landing detection exists in `scene.ts` or `main.ts`. The only touchdown cue is the grounded shadow ellipse (`scene.ts:1702-1705`).

### 3.5 Camera (`scene.ts:983-1009`; `feel-capture-results.json`; `fog-share.py`)

| Quantity | Value |
|---|---|
| Vertical anchor | Rig at 46 % of usable height in every state (`scene.ts:985`). Measured rig screen-Y 422/900 at spawn. |
| Follow smoothing | `1 − e^(−8·dt)`, τ = 0.125 s (`scene.ts:1006`); instant with reduced motion |
| Horizontal look-ahead | `0.06 s × vx` (`scene.ts:984`). At 5 tiles/s: +0.30 tile look-ahead and −0.625 tile lag, so the camera **trails by 0.33 tile**. No vertical look-ahead; lag is 0.75 tile at a 6 tiles/s climb. |
| Fog at the surface start | Desktop: rows 510–900 (43.3 % of the screen) are **98.9 %** uniform fog (`d02-surface-start.png`, `f01-surface-framing.png`). Portrait 393×851: 40.7 % of the screen is 94 % fog (`p02-surface.png`). |
| Field of view | Desktop 22.2 × 13.8 tiles. Portrait 8.2 × 17.7 tiles, with 310 px of HUD reserve. Landscape 844×390: 17.6 × 8.1 tiles but only **174 px (3.6 rows)** between the HUD reserves (`layout.ts:11-14`). The lamp radius is 4.5 tiles, a 9-tile diameter (`model.ts:299-347`). |
| Shake, zoom, fades | None (no `shake`, `zoom`, `flash`, `fade`, `tween` or particle-emitter calls in `scene.ts`) |

### 3.6 Input latency (`feel-capture-results.json`)

| Path | Latency to first effect | Source |
|---|---|---|
| Keyboard | Next frame (key state is polled each update) | `input.ts:211-223`, `scene.ts:891-897` |
| Mouse hold without movement | **180 ms**. Measured: `pointerActive` false at 0–160 ms, true at 180 ms. No aim ring and no cursor change before that. | `pointer.ts:74, 86`; `scene.ts:1637-1694` |
| Touch | Joystick base drawn on press. Steering starts after a 12 px drag. 8-way digital (0.38 ratio), travel 32 px. | `pointer.ts:15-18, 66, 92-104` |
| Gamepad | Digital at a 0.25 axis threshold | `input.ts:321-327` |
| Down tap ending 0 / 50 / 100 / 150 ms before touchdown | Never starts a cut (no buffer) | `physics-results.json` › inputBuffer |

### 3.7 Audio (offline render of the real `audio.ts` in Chromium; `feel-capture-results.json` › audioRender)

| Scenario (default sliders: effects 0.5, ambience 0.3, music 0.15; master 0.5) | Peak | RMS | Energy < 150 Hz | > 300 Hz |
|---|---|---|---|---|
| Drilling hum and ambience | −30.3 dBFS | **−37.3 dBFS** | 98.7 % | 0.2 % |
| Idle underground | −38.6 dBFS | −46.6 dBFS | 99.9 % | 0 % |
| Idle plus the 12 s "music" note | −32.6 dBFS (onset) | −46.4 dBFS | 99.9 % | 0 % |

- The steady-state amplitudes in code agree. The drill hum is 0.09 × 0.5 × 0.5 = 0.0225, about −33 dBFS (`audio.ts:101-110`). The music note is 0.035 × 0.15 × 0.5 ≈ −52 dBFS for 2.2 s every 12 s (`audio.ts:116-119`). Each event blip is −33 dBFS for 80 ms (`audio.ts:58-73`).
- No AudioContext exists until "Enable sound" is clicked: 0 before, 1 after.
- The saved preferences have no sound key, and a fresh session shows "Enable sound" again.

### 3.8 Rendering headroom

- WebGL renderer: the canvas returns no 2D context, and draw calls are counted on the WebGL prototypes.
- **60 draw calls over 40 frames, 1.5 per frame**, both idle at the surface and while drilling (`feel-capture-results.json`). Phaser's multi-texture batch absorbs the atlas images and Graphics.
- The pinned budget is "150 visible particles and one local screen effect" (`docs/DESIGN_PACK_IMPLEMENTATION.md:126`).

### 3.9 Time share and event rates (`trip-results.json`)

| Straight W01 trip (stock, drill corridor) | Total | Committed-cut share | Cuts per minute while drilling |
|---|---|---|---|
| to 150 m | 22.6 s | **69 %** | 61 |
| to 300 m | 41.1 s | **77 %** | 57 |
| to 590 m | 86.5 s | **83 %** | 49 |
| to 590 m, rank-1 drill | 67.1 s | 78 % | 69 |

### 3.10 Other

- **Energy depletion mid-climb.** The rig stops at y 28.99 with the floor at 29.64 and hangs there. `paused()` includes `rigDisabled()` (`main.ts:324-334`), so the simulation stops at once (`depletion-results.json`).
- **Frame-time clamp.** The scene passes at most 0.05 s per frame (`scene.ts:864`). The game runs at 0.75× speed at 15 fps and 0.5× at 10 fps. `model.tick` already substeps at 120 Hz with a 0.25 s cap.

---

## 4. Current feedback inventory

| Event | Visual now | Audio now (only after "Enable sound") | Source |
|---|---|---|---|
| Cut in progress | 8-frame drill animation; 3-stage crack overlay; 5 px progress bar above the rig; W02 thermal auger: contact glow and 3 rising circles | Hum 96 Hz triangle (same for every material) | `scene.ts:1617-1634, 1796-1808, 1840-1867, 1898-1915`; `audio.ts:101-110` |
| Cut complete | 10 grey squares, 2.3 px, 0.25–0.65 s (off with reduced motion) | "pickup" 660→990 Hz blip (mis-routed) | `scene.ts:844-857, 929-940, 1916-1923`; `main.ts:1956-1959` |
| Package collected | "+ Name" label rising 12 px over 1.2 s; 6 orange 2.3 px squares; exposed packages bob | none of its own | `scene.ts:941-956, 1194-1200, 1925-1931` |
| Damage | 0.3 s red rounded-rect outline; persistent damage overlays at 75/40/15 % hull | 180 Hz 80 ms blip | `scene.ts:957-960, 1868-1897`; `main.ts:1960` |
| Low energy (25/15/8 %) | Amber gauge; text banner; toast | one 180 Hz blip per band | `main.ts:365-382, 874-889` |
| Thrust | 6-frame flame sprite | hum 78 Hz | `scene.ts:1706-1716` |
| Landing | none (shadow ellipse when grounded) | none | `scene.ts:1702-1705` |
| Shelf warning / collapse | Warning sprite, yellow line, label / tile disappears | collapse: damage blip if hit | `scene.ts:1592-1615`; `model.ts:778-790` |
| W02 volatile window | Gold arc ring around the rig (per frame); DOM extraction card (synced at 10 Hz) | same per-cut blip; intact via key release: nothing | `scene.ts:1824-1838`; `main.ts:665-726, 1520-1523, 1967-1970` |
| Bank and sell / purchase / milestone | Instant number change / instant layer swap / instant `dock-stage-N` swap | "pickup" / 330 Hz / 392 Hz two-note blips | `main.ts:1497-1509, 1654-1680`; `scene.ts:1247-1254` |
| Departure | Static "Course charted." card for 2.4 s (0.8 s with reduced motion) | none | `main.ts:1693-1695`; `style.css:1211-1229` |
| Docking | Camera pans to frame the lander beside the console | none | `scene.ts:986-999` |
| Music | — | One 130.81 Hz sine, 2.2 s, every 12 s | `audio.ts:116-119` |

---

## 5. Strengths to keep

- **A deterministic 120 Hz simulation with bounded steps** (`model.ts:350-358`). Feel can be measured and regression-tested headlessly; this audit's harness took minutes.
- **Responsive ground handling:** top speed in 0.30 s, reversal in 0.42 s. Simultaneous thrust and steering work.
- **Seamless cut chaining:** a 4 ms gap with Down held. A visible progress bar and 3 crack stages mark committed cuts.
- **Forgiving tunnel capture:** climbing a shaft with a direction held enters side tunnels automatically (S2). The **surface walkway** stops accidental drops into your own shafts.
- **Layered modular rig art:** it reflects upgrades (r0–r2 layers) and hull damage stages. Thrust and drill animation frames exist.
- **The dock "presentation camera"** pans to frame the lander next to the console (`scene.ts:986-999`). It is a polished touch.
- **Reduced motion is respected.** The default comes from `prefers-reduced-motion` (`input.ts:56`). Chips, ore bob, W02 plumes, camera easing and CSS animations all honour it.
- **Robust input architecture:** named actions, remapping, hold/toggle options, gamepad, modifier and focus protection, an immediately drawn touch joystick, and an optional button fallback.
- **Cheap rendering:** 1.5 WebGL draw calls per frame leaves large headroom for particles within the pinned budget.
- **Audio scaffolding:** three buses with sliders, and an `onEvent` hook in the scene bindings (`scene.ts:21`) waiting to be connected.

---

## 6. Findings

Ordered by severity, then by player impact.

### FEEL-F1 · Critical · Sound is off by default, not remembered, and inaudible on phone and laptop speakers when on

**Evidence**
- How sound is switched:
  - `audio.ts:14` sets `muted = true`, and `unlock()` returns early while muted (`audio.ts:16-17`).
  - The only switch is "Enable sound" in Pause › Systems (`main.ts:194`, handler `main.ts:1838-1844`).
  - The "Deploy rig" click is a valid user gesture but does not start audio (`main.ts:1747-1755`).
  - `README.md:14` documents "Sound starts muted".
- Browser check: 0 AudioContexts until the button is pressed. Saved preferences have no sound key (`input.ts:40-52`), and a fresh session shows "Enable sound" again.
- Offline render of the real synth:
  - Drilling: RMS −37.3 dBFS, with 98.7 % of the energy below 150 Hz and 0.2 % above 300 Hz.
  - Idle: −46.6 dBFS, with 99.9 % below 150 Hz.
- The sources are a triangle hum at 48, 78 or 96 Hz (`audio.ts:31-35, 101-110`), sine ambience at 43 and 64.5 Hz (`audio.ts:39-45`), and "music" of one 130.81 Hz note every 12 s at about −52 dBFS (`audio.ts:116-119`).
- The pinned audio direction is not implemented:
  - W01: "Dry pneumatic knock, ticking fuel pump, restrained metallic percussion."
  - W02: "Glass ticks, damped motor, descending breath for vent warnings; a bell confirms intact extraction." (`design/v0.1/motherload-balance-v01.json` worlds[0].audio, worlds[1].audio)

**Player impact:** Every first session is silent. Players who find the switch still hear almost nothing on the speakers most players use. All other feedback channels must then carry the game's feel alone.

### FEEL-F2 · Major · Drilling fills 69–83 % of a trip but gives almost no sensory feedback

**Evidence**
- `trip.audit.ts`: straight trips spend 69 % (150 m), 77 % (300 m) and 83 % (590 m) of their time in committed cuts, at 49–68 cuts per minute.
- During a cut there is only the drill animation, a 3-stage crack overlay and a 5 px progress bar (`scene.ts:1617-1634, 1796-1808, 1898-1915`). There is no debris while cutting and no rig vibration. The sound is one hum pitch for soil, stone, ore and ice alike (`audio.ts:106-110`).
- Completion is `burst()`: 10 squares of 2.3 px (tile × 0.035) lasting 0.25–0.65 s, always grey `0xa8b0b4` (`scene.ts:844-857, 929-940, 1916-1923`). They are not visible at normal viewing distance (`shots/f03-cut-complete-chips.png`, `shots/zoom3-f03-cut-complete-chips.png`).
- The pinned briefs are only partly met:
  - W01 "Short grey chips on cuts" exists in this minimal form.
  - W02 "frost fragments fall" is absent.
  - The W02 "steam" is three translucent circles (`scene.ts:1840-1867`).

**Player impact:** The core verb feels like waiting on a bar. Soil, stone, ore and ice feel the same, so depth and material carry no texture or reward.

### FEEL-F3 · Major · Re-entering your own shaft needs ±0.11-tile alignment; a near miss drills a new shaft beside it

**Evidence**
- When the column under the rig's centre is open, `model.ts:434-444` cuts the nearest solid support column instead of letting the rig drop. S1: offsets 0.12–0.45 all drilled column+1.
- The window is ±0.11 tile (±7 px desktop, ±5 px phone). The shortest tap moves the rig 0.17 tile; 50 ms moves 0.41 and 100 ms moves 0.81 (S3). The nudge step is larger than the window.
- Falling onto the opening never enters it, because of the walkway snap (`model.ts:544-552`, S4). Every re-entry needs a stationary, aligned Down press.
- Corroborated by `02-first-session.md` M20 and FTUE-F13: 4 fine taps to align, and R8 drilled the neighbouring column.

**Player impact:** Every return trip risks a 0.9–3.2 s parallel cut costing 0.23–1.0 L. Extra holes pile up around the shaft, and the moment reads as "imprecise controls".

### FEEL-F4 · Major · The camera frames every situation the same way: half the surface view is fog, and the camera trails the rig

**Evidence**
- `scene.ts:983-985` places the rig at 46 % of usable height in every state. The horizontal target adds only `0.06 s × vx`. Smoothing τ is 0.125 s (`scene.ts:1006`).
- At the surface, 43.3 % of the desktop screen is 98.9 % fog (`d02-surface-start.png`). In portrait, 40.7 % is 94 % fog (`p02-surface.png`). The lander, base construction and sky (the visible progression) get the other half.
- Look-ahead is smaller than lag: at 5 tiles/s the camera trails by 0.33 tile. Vertically it trails by 0.75 tile when climbing, with no bias toward the direction of travel while drilling or falling.
- Zoom is fixed per device (`layout.ts:2-5`):
  - Portrait shows 8.2 columns, less than the 9-tile lamp diameter.
  - Landscape 844×390 leaves 3.6 rows between the HUD reserves (`l02-drilling.png`).

**Player impact:** The most rewarding view (lander, base, sky) is squeezed. Dives and climbs show less in the direction you are moving. Phones crop what the lamp reveals.

### FEEL-F5 · Major · Progress and reward moments are flat (sale, upgrade, milestone, departure)

**Evidence**
- **Bank and sell** (`main.ts:1654-1668`): the number changes instantly, with the same two-note blip as every cut. No count-up or transfer animation exists; `main.ts` has no animate, tween or requestAnimationFrame usage.
- **Milestone payment** (`main.ts:1678-1680`): a 392/588 Hz blip and an instant `dock-stage-N` swap (`scene.ts:1247-1254`). The stage art (e00–e03) is good, but the change is not staged.
- **Hardware upgrades** swap rig layers instantly (`scene.ts:1718-1795`).
- **Departure** shows a static card for 2.4 s (`main.ts:1693-1695`, `style.css:1211-1229`).
- Corroborated by `02-first-session.md` FTUE-F7.

**Player impact:** Progress arrives as a changed number. This is a direct contributor to the owner's dissatisfaction with progression: the game never celebrates the milestones it asks players to work toward.

### FEEL-F6 · Major · Sound cues are wired to the wrong events and are not distinct

**Evidence**
- `main.ts:1956-1959` plays "pickup" whenever `stats.mined` increases, which is every completed cut (49–68 per minute). Real cargo pickup has no cue of its own, and sales reuse "pickup" (`main.ts:1663-1667`).
- The scene emits semantic `cut`, `pickup` and `damage` events (`scene.ts:21, 939, 955, 959`), but the `createCampaignScene` call never passes `onEvent` (`main.ts:1925-1979`).
- W02 volatile extraction:
  - Intact extraction by releasing the key goes through `model.ts:381-383` with no audio.
  - Only the on-screen Release drill button plays a blip (`main.ts:1520-1523`), despite the pinned "a bell confirms intact extraction".
  - The "completion cue" for this timing mechanic sounds exactly like any other cut.
  - The DOM release card updates at only 10 Hz (`main.ts:1967-1970`).
- Every damage cause and every energy band share one 180 Hz, 80 ms blip (`main.ts:887, 1960`).
- Second notes are scheduled with `setTimeout(85 ms)` (`audio.ts:70-72`), so they jitter under load and ignore pause.

**Player impact:** With sound on, the reward chime becomes a metronome and loses its meaning. The one timing-critical W02 mechanic has no distinct sound.

### FEEL-F7 · Moderate · Landings give no feedback, and fall damage depends on engine rank

**Evidence**
- Fall speed is clamped by the engine-dependent `maxVertical` (`model.ts:533-540`). Damage applies only above 7 tiles/s (`model.ts:586-590`).
- Measured (`physics.audit.ts`):
  - Ranks r0–r1: 0 HP from any drop up to 50 tiles.
  - Rank ≥2 in W01: 1 HP from 16-tile drops.
  - W02: never.
  - In 1.0 g W04 the loss would grow with engine rank (§3.4).
- No landing dust, sound, squash or shake exists anywhere. The only cue is the grounded shadow (`scene.ts:1702-1705`).

**Player impact:** The rig feels weightless. An engine upgrade quietly introduces a penalty that players cannot learn from feedback.

### FEEL-F8 · Moderate · Air control is slippery: full speed in 0.3 s, but 5.4 s and 5.9 tiles to coast to a stop

**Evidence**
- Air drag is 0.85/s whatever the input (`model.ts:497`). Release from 5 tiles/s takes 5.43 s and covers 5.86 tiles, against 1.45 s and 1.54 tiles on the ground.
- Releasing Up at full climb overshoots 1.85 tiles in W01 and 2.46 in W02; with a rank-9 engine, 5.6 and 7.0 tiles.
- `02-first-session.md` FTUE-F17: a mouse player flew past the lander and wrapped from x 0.64 to 39.39.

**Player impact:** Stopping over a shaft or the landing bay requires counter-steering. Overshoots burn energy, and flight feels icy rather than piloted.

### FEEL-F9 · Moderate · Danger is shown mostly as text; pinned shelf dust is missing; running dry freezes the rig mid-air

**Evidence**
- **Low energy:** an amber gauge, a text banner and one blip per band (`main.ts:365-382, 874-889`). Nothing happens in the world.
- **Damage:** a 0.3 s red outline and the shared blip (`scene.ts:957-960, 1888-1897`).
- **Shelves:** the warning shows a sprite, a line and a label (`scene.ts:1592-1615`). On collapse the tile vanishes (`model.ts:784-789`), with no falling piece and no dust. The pinned W01 fx brief asks for "two visible dust puffs before shelf failure".
- **Depletion:** the simulation pauses at once (`main.ts:324-334`), leaving the rig 0.65 tile above the floor (`depletion-results.json`), and the hum cuts instantly.

**Player impact:** Danger has to be read rather than felt. The failure moment is abrupt and physically odd.

### FEEL-F10 · Moderate · Mouse steering responds only after 180 ms; touch and gamepad steering are digital

**Evidence**
- `pointer.ts:74, 86` activates a mouse gesture only after 8 px of movement or 180 ms. The aim ring and cursor appear only once active (`scene.ts:1637-1694`).
- Measured in the browser: no response until 180 ms. The approved target is "acknowledge standard input within 100 ms" (`docs/DESIGN_PACK_IMPLEMENTATION.md:132`).
- Touch is 8-way digital with 32 px travel and a 12 px dead zone (`pointer.ts:15-18, 92-104`). The gamepad stick is digital at 0.25 (`input.ts:321-327`). No partial throttle exists for the fine positioning F3 demands.

**Player impact:** Mouse corrections feel laggy. Touch and gamepad players cannot feather speed.

### FEEL-F11 · Minor · The rig has no secondary motion

**Evidence**
- Tread frames advance only when |vx| > 0.3 (`scene.ts:1698-1700`).
- Thrust is a 6-frame sprite with no exhaust and no ground downwash (`scene.ts:1706-1716`).
- `image()` sets position, size and flip only (`scene.ts:413-462`). There is no lean when accelerating, no squash or stretch, and no idle bob.

**Player impact:** The rig reads as a sticker sliding over the map, not a heavy machine with suspension and thrusters.

### FEEL-F12 · Minor · The body flips backwards during a committed side cut, and the pickup label covers the progress bar

**Evidence**
- `model.ts:394` updates `facing` even during a cut, while the drill frames are drawn unflipped (`scene.ts:1796-1808`). In `shots/zoom3-f05-sidecut-opposite-input.png` the body faces left while the drill bites right, so the bit appears to come out of the rear tank.
- In `physics-results.json` › chaining, `facingAfterLeftMidCut` is "left" during a down cut.
- The pickup label sits at py − 0.9 tile (`scene.ts:1925-1931`) and overlaps the progress bar at py − 0.61 tile during chained cuts (`shots/zoom3-f03-cut-complete-chips.png`).

**Player impact:** Small, visible glitches that undercut polish.

### FEEL-F13 · Minor · No input buffering, and no feedback when a side cut is refused mid-air

**Evidence**
- A Down tap ending 0–150 ms before touchdown never starts a cut (`physics-results.json` › inputBuffer).
- A side press while hovering is silently ignored. `model.ts:430` requires `supported` and shows no message, whereas `docs/RESEARCH.md:100` intended "an explicit explanation".
- Corroborated by `02-first-session.md` FTUE-F15.

**Player impact:** Early presses are lost. Players conclude that side drilling is broken when they see wall ore they cannot reach.

### FEEL-F14 · Minor · Cargo load cannot be felt

**Evidence**
- A full 7-slot Goldium hold gives a mass factor of 1.057. Top speed is reached in 0.33 s instead of 0.30 s; top speed and coast are unchanged. This follows the pinned rule `gravity_mass_factor = 1 + cargo_mass/198`.
- Nothing presents the load: no suspension sag, no engine strain and no pitch change.

**Player impact:** A full hold, the moment that should feel valuable and heavy, feels the same as an empty one.

---

## 7. Proposals

Ordered by priority (player impact per unit of effort). Effort: S ≤ 1 day, M 2–4 days, L 1–2 weeks, XL > 2 weeks, for one experienced developer.

### FEEL-P1 · Audio foundation: on by default, audible on small speakers, wired to real events (addresses F1, F6) · Effort M · Impact high

**Change**
- Start audio from the Deploy click and remember the choice.
- Add a master limiter and raise the defaults.
- Wire a typed event stream from the model and scene to the audio.
- Replace the sub-bass patches with small-speaker-friendly synthesised cues that follow the pinned per-world briefs.

**Implementation**
- `input.ts:40-87`:
  - Add `sound: boolean` (default `true`), `alarm: boolean`, `haptics: boolean` and `shake: "off" | "low" | "full"` to `PilotPreferences`, then load and save them.
  - Change the bus defaults to effects 0.8, ambience 0.5, music 0.45 (`input.ts:58-60`).
- `main.ts:1747-1755` (Deploy rig): `audio.muted = !preferences.sound; await audio.unlock();`. Add a one-tap speaker toggle to the title card (`main.ts:193`) and the HUD toolbar (`main.ts:182-189`), with `aria-pressed`.
- `audio.ts`:
  - Signal chain: buses (sfx, ui, ambience, music) → master `GainNode` (0.9) → `DynamicsCompressorNode` (threshold −14 dB, knee 6, ratio 6, attack 0.003, release 0.2) → destination.
  - A shared 2 s white-noise `AudioBuffer`.
  - Helpers `noise(bandHz, q, dur, gain, at)`, `tone(type, f, dur, gain, at, glideTo)` and `knock(at)`.
  - Schedule every note on `context.currentTime`, never `setTimeout`.
  - Cap voices at 12, and rate-limit identical cues to 60 ms.
- Event stream:
  - In `model.ts`, add `events: FeelEvent[]` with `drainEvents()`. Push events at the source:
    - `cutStart{material, dir}` at `model.ts:466-490`
    - `cutComplete{material}` in `advanceCut` (`model.ts:597-630`)
    - `pickup{tier}` in `updateObjects`, package carried (`model.ts:740-756`)
    - `mission`
    - `land{speed}` in `moveAxis`, y collision (`model.ts:586-592`)
    - `damage{cause, amount}` (`model.ts:797-800`)
    - `volatileWindow`, `volatileIntact` and `volatileRupture` in `finishVolatile` (`model.ts:642-672`)
    - `shelfWarning` and `shelfCollapse` (`model.ts:778-790`)
    - `coldWarning` and `vent`
  - `scene.update` drains the queue each frame and forwards it to the FX code and `bindings.onEvent`.
  - `main.ts` passes `onEvent` into `createCampaignScene` (`main.ts:1925`). It replaces `main.ts:1956-1961` with a mapping to audio and haptics. `transact()` emits `sell`, `bank`, `purchase` and `build`.
- Patches:
  - **W01:** cut start is a "pneumatic knock" (60 ms band-passed noise at 900 Hz plus a 110 Hz thump with a 2nd harmonic). The cut loop is band-passed noise per material (soil 650 Hz Q1.2; stone 1.4 kHz Q3 plus 20 clicks/s), with gain at 0.6 + 0.4 × progress. A low "fuel pump" tick accompanies thrust. Completion is a 120 ms noise "crunch". Pickup is the pinned short rising two-note cue, pitched by ore tier.
  - **W02:** glass ticks (2.5–3.5 kHz pings) on ice cuts, a damped motor, a descending breath (noise swept 1.8 kHz → 300 Hz) for vent warnings, and a bell (inharmonic partials 1, 2.76, 5.4) for intact extraction.

**Acceptance**
1. On a fresh profile at 1440×900 and 393×851, after Deploy an AudioContext is "running" without opening Pause.
2. The mute choice persists across reloads, and one-tap mute exists on the title and in the HUD.
3. An offline render (the `feel-capture.mjs` method) of the W01 drilling layer measures RMS −24 ± 3 dBFS, with ≥ 40 % of its energy above 300 Hz and peaks ≤ −3 dBFS.
4. A unit test with a mock sink over a scripted 60 s W01 run finds one cut-complete cue per mined tile and one pickup cue per carried package. A sale emits `sell`, not `pickup`.
5. Intact extraction by key release emits the bell; a rupture emits a distinct cue.
6. No `setTimeout` notes remain, and pause silences queued cues within 50 ms.

**Dependencies:** none.

**Deviation:** This changes the documented default "Sound starts muted" (`README.md:14`). That default is not a design-pack decision; owner decision D1. The patches implement the pinned W01/W02 audio briefs.

### FEEL-P2 · Shaft magnet, input buffer, refusal feedback and mid-cut facing fix (addresses F3, F12 part, F13) · Effort S · Impact high

**Change**
- When Down is pressed with the rig's centre over an open cell, steer the rig into that opening instead of cutting the neighbouring column.
- Buffer cut intents for 120 ms.
- Explain refused side cuts.
- Freeze `facing` during a cut.

**Implementation** (all in `model.ts`)
- Shaft magnet, `model.ts:434-444`: if `controls.down && this.tile(tx, ty) === 0`, set `this.alignX = Math.floor(this.wrap(vehicle.x)) + 0.5`. Do not retarget to the support column.
- In the movement block (`model.ts:493-517`), while `alignX` is set and Down is held, set `velocityX = clamp(campaignDelta(x, alignX, width) * 14, -3, 3)`. The walkway snap is already off while Down is held, so once the feet clear the rim the rig drops. Clear `alignX` once below the rim, or after 0.35 s.
- Keep the existing behaviour when the centre is over solid rock: cut that tile.
- Buffer: `private bufferedCut?: { dir: "down" | "left" | "right"; until: number }`. Set it on a press edge while unsupported. Consume it on the first supported step before `state.elapsed > until` (window 0.12 s). This needs press-edge detection (store the previous controls).
- Refusal: if `!supported && horizontal && !controls.up && this.blocked(x + horizontal * 0.05, y)`, set the message "Side drilling needs footing · land on a ledge first" and emit `refused`. Rate-limit both to once per 3 s. The renderer shows 3 sparks at the wall and plays a dull tick.
- Facing: `model.ts:394` becomes `if (horizontal && !this.cut) this.facing = …`.

**Acceptance**
1. Vitest: Down at offsets {0, ±0.2, ±0.3, ±0.45} above an open shaft enters it within 0.25 s with no new tile cut. At ±0.55, the neighbouring tile is cut.
2. A Down tap that ends 100 ms before touchdown starts a cut on landing. A tap ending 300 ms before does not.
3. Pushing into a wall while hovering yields at most one explanation per 3 s.
4. The opposite direction pressed mid-cut leaves `facing` unchanged. After the cut, facing follows the input.
5. All 107 existing tests pass.

**Dependencies:** none. P11 is recommended to lock in the numbers.

**Deviation:** This changes the support-column target choice derived from the reference calibration (`docs/RESEARCH.md:100,129`; `docs/MOVEMENT_REFERENCE.md`). It is not a pinned design-pack value. The ledge rule and committed cuts remain (owner decision D5).

### FEEL-P3 · Shared world-space FX layer and drilling/collection juice (addresses F2, F12 part, F14 part) · Effort M · Impact high

**Change**
- Replace the 2.3 px chips with Phaser particle emitters: debris per material while cutting, a completion burst, contact sparks or steam, and an ore pop with a magnet into the rig and a HUD bump.
- Add a small rig jitter on hard material.
- Enforce the pinned particle budget.

**Implementation** (`scene.ts`)
- Textures: in `create()`, after the lamp texture at `scene.ts:238-256`, generate pre-coloured textures with `this.make.graphics({}, false)` and `generateTexture`:
  - `fx-chip-soil` `0x8c8a80`, `fx-chip-stone` `0x5d6b73`, `fx-chip-ice` `0xd8f4f6`, `fx-chip-ore1…4` (ore colours), 6×6 px
  - `fx-spark` 2×6 px
  - `fx-dust`: a soft radial gradient of 32 px, made like the lamp canvas texture
  - Pre-coloured textures keep parity with the Canvas renderer, because `setTint` and `particleTint` are WebGL-only.
- Coordinate space: the scene draws in screen space with a manual camera (`cx`/`cy`). Create `this.fxWorld = this.add.container(0, 0).setDepth(24)` and, after `scene.ts:1011-1012`, call `this.fxWorld.setPosition(-cx, -cy)` each frame. Emit at world pixels `(unwrappedX + delta) * tile`, as `burst()` does today. Particles then stick to the world as the camera moves.
- Emitters, using the Phaser 3.60+ API available in 3.90:
  ```ts
  this.debris = this.add.particles(0, 0, "fx-chip-soil", {
    lifespan: { min: 280, max: 520 }, speed: { min: 40, max: 140 },
    angle: { min: 200, max: 340 }, gravityY: 420, rotate: { min: 0, max: 360 },
    scale: { start: 1, end: 0.3 }, alpha: { start: 1, end: 0 },
    quantity: 2, frequency: 45, emitting: false, maxParticles: 40,
  });
  this.fxWorld.add(this.debris);
  // while campaign.drillTarget: debris.setTexture(`fx-chip-${material}`); debris.setPosition(contactX, contactY); debris.start();
  // cone by direction: down → 200–340° (spray up and out); right → 120–240°; left → −60–60°
  // on cutComplete: this.burst.explode(12, cellX, cellY); this.dust.explode(6, cellX, cellY + tile * 0.3);
  ```
  - Gravity: W01 420 px/s², W02 260 px/s² (scale by world gravity).
  - Stone adds `fx-spark` at 20 %, with `blendMode: "ADD"` in WebGL only.
  - Ice: frost fragments fall and steam rises, using `fx-dust` with negative `gravityY`, per the pinned W02 fx.
- Material: add `get drillMaterial()` in `model.ts` returning `this.tile(cut.x, cut.y)` while a cut is active. Keep the value at `cutComplete`, before the tile clears.
- Ore pop and magnet: on `pickup`, take a pooled Image in `fxWorld` at the package cell and run `this.tweens.chain({ targets: ghost, tweens: [{ scale: { from: 0.7, to: 1.15 }, duration: 120, ease: "Back.Out" }, { x: rigX, y: rigY, scale: 0.4, alpha: 0.2, duration: 180, ease: "Quad.In" }] })`. Add 4 sparkle particles in the ore colour. In `main.ts`, toggle a CSS `bump` class on the cargo readout (scale 1 → 1.18 → 1 over 180 ms) and count HAUL up over 300 ms.
- Rig jitter on stone: add ±0.6 px of hash noise to px/py for all rig layers while `drillMaterial === 2`. This is a local effect, not a screen shake.
- Budget: the cap is 150 on desktop and 75 when `(pointer: coarse)`. Sum `emitter.getAliveParticleCount()` and skip emission above the cap. Expose `data-fx-particles` on `#campaign-game` for tests.
- Reduced motion: no emitters. Instead, flash the completed tile outline for one frame (white, alpha 0.6).
- Remove `burst()` and `chips` (`scene.ts:844-857, 902-908, 1916-1924`).

**Acceptance**
1. At 50 % of a soil cut, a screenshot shows ≥ 6 debris particles in the soil colour at the contact point. Stone shows grey chips plus sparks. Ice shows falling white fragments and rising steam.
2. Completion chips are ≥ 6 px at 65 px tiles and coloured by material.
3. A pickup triggers the pop, magnet and HUD bump within 400 ms. Goldium is visibly and audibly distinct from Ironium.
4. `data-fx-particles` stays ≤ 150 on desktop and ≤ 75 on coarse pointers, and is 0 with reduced motion.
5. ≤ 4 WebGL draw calls per frame while drilling (`feel-capture.mjs` instrumentation). A forced `type: Phaser.CANVAS` build shows correct colours.
6. Manual check on a mid-range Android phone: p95 frame time ≤ 16.7 ms during continuous drilling.

**Dependencies:** FEEL-P1 (event stream, sounds). The visuals can ship first using the scene's existing change detection.

**Deviation:** None. It stays within "150 visible particles and one local screen effect" (`docs/DESIGN_PACK_IMPLEMENTATION.md:126`) and follows the W01/W02 fx briefs.

### FEEL-P4 · Context-aware camera: framing by state, real look-ahead, zoom by context and device (addresses F4) · Effort M · Impact high

**Change**
- Replace the fixed 46 % anchor with an anchor blended by state through a critically damped spring.
- Add filtered horizontal look-ahead.
- Zoom out at the surface and dock, and zoom slightly in when deep.
- Fade on teleports.
- Fit the 9-tile lamp diameter on phones (owner decision D7).

**Implementation** (`scene.ts:983-1009`)
```ts
const surface = campaign.renderY < 0.5 || dock;
const falling = campaign.velocityY > 2 || campaign.drillDirection === "down";
const rising = campaign.velocityY < -3;
const desired = surface ? (portrait ? 0.60 : 0.64) : falling ? 0.38 : rising ? 0.56 : 0.44;
const w = reduced ? 2.5 : 5;                       // spring stiffness (rad/s)
this.anchorVel += (w * w * (desired - this.anchor) - 2 * w * this.anchorVel) * dt;
this.anchor += this.anchorVel * dt;
const lookTarget = reduced ? 0 : Phaser.Math.Clamp(campaign.velocityX * 0.35, -2.5, 2.5);
this.look += (lookTarget - this.look) * (1 - Math.exp(-dt / 0.4));
let targetX = this.unwrappedX * tile - width / 2 + this.look * tile;
let targetY = campaign.renderY * tile - (safe.top + usable * this.anchor);
```
- Zoom: `zoomTarget` is 0.88 at the surface or dock, 1.0 underground and 1.05 at ≥ 400 m. Ease it with τ 0.5 s. Set `this.tile = Math.round(baseTile * this.zoom * 2) / 2`, and rescale `cameraX`/`cameraY` by the tile ratio so the rig stays put.
- Exclude zoom-driven tile changes from the snap key `size` (`scene.ts:1000-1004`); use width and height only.
- Portrait base tile (`layout.ts:2-5`): `clamp(round(width / 9.4), 40, 48)` when `width < 600 && height > width`.
- Teleports: when `jumped` (`scene.ts:923`), call `this.cameras.main.fadeOut(90)`, then `fadeIn(120)` on `camerafadeoutcomplete`.
- Reduced motion: slower spring, no look-ahead, zoom fixed at 1.
- The dock framing (`scene.ts:988-999`) keeps priority.

**Spec**
```
 Surface now             Surface proposed          Drilling down proposed    Climbing proposed
+------------------+    +------------------+      +------------------+      +------------------+
| sky              |    | sky, planet      |      | shaft above      |      | more shaft above |
|                  |    | lander, base     |      |  [rig] 38 %      |      |                  |
|  [rig] 47 %      |    |                  |      |                  |      |  [rig] 56 %      |
|==================|    |  [rig] 64 %      |      | rock below:      |      |                  |
| fog 43 % (98.9 %)|    |==================|      | more room for    |      |                  |
|                  |    | fog <= 25 %      |      | the next tiles   |      |                  |
+------------------+    +------------------+      +------------------+      +------------------+
Horizontal at 5 tiles/s: now trails 0.33 tile; proposed ~1.1 tiles more view ahead than behind.
```

**Acceptance**
1. At the W01 spawn, `fog-share.py` measures ≤ 25 % fog on 1440×900 (now 43 %) and on 393×851 (now 41 %).
2. During a down cut, rig screen-Y settles at 36–42 % of usable height. When climbing faster than 3 tiles/s, it settles at 52–60 %.
3. At a steady 5 tiles/s, the rig sits 0.8–1.6 tiles behind the screen centre.
4. A state change never produces a camera speed step larger than one frame of the spring's response (recorded `rigScreenY` trace).
5. Recovery and travel use a ≤ 200 ms fade.
6. With reduced motion there is no look-ahead and no zoom change.

**Dependencies:** none.

**Deviation:** None for framing or look-ahead; the pack only asks for screen-relative camera and inputs (`docs/DESIGN_PACK_IMPLEMENTATION.md:90`). The smaller portrait tile trades legibility for field of view (owner decision D7).

### FEEL-P5 · Reward and milestone celebrations (addresses F5) · Effort M · Impact high

**Change**
- Animate sale and banking.
- Stage upgrades.
- Turn milestone payment into a short build sequence with a fanfare.
- Animate departure.
- Every celebration can be skipped and has a reduced-motion variant.

**Implementation**
- **Sale:** in `main.ts` `transact()` (`main.ts:1497-1509`), record credits before and after.
  - Count up with `requestAnimationFrame` and easeOutCubic over `clamp(400 + 250·log10(Δ/10 + 1), 500, 1200)` ms.
  - Play coin ticks (2.2 kHz, 25 ms, +1 semitone every 3 ticks, at most 14) and a final cha-ching: two notes plus a noise shimmer.
  - Cargo rows fly to the credit readout with `Element.animate([{ transform: "none", opacity: 1 }, { transform: \`translate(${dx}px,${dy}px) scale(.4)\`, opacity: 0 }], { duration: 420, delay: i * 60, easing: "cubic-bezier(.5,0,.75,0)" })`.
  - Any key or tap completes the animation instantly.
- **Upgrade:** on `purchase`, re-draw the changed rig layer with a 300 ms additive "install" flash (`this.tweens.add({ targets: overlay, alpha: { from: 0.9, to: 0 } })`) and play a wrench clank.
- **Milestone:** on `build`, keep a dedicated (non-pooled) Image of the new `dock-stage-N` (`scene.ts:1247-1254`).
  - Tween `y` from +6 px and `alpha` from 0 to 1 over 600 ms.
  - Fire welding sparks with `explode` every 120 ms at 3 anchor points for 1.2 s.
  - In WebGL, apply `img.preFX?.addShine(0.6, 0.35, 3)` and remove it after 1.2 s; on Canvas, skip it.
  - Show a DOM banner `#campaign-celebration` ("MILESTONE 1/3 COMPLETE · Anchoring feet unlocked").
  - Play a fanfare (C5–E5–G5–C6 at 110 ms spacing plus a 1.2 s pad swell) and duck the music by 6 dB.
  - Set `data-celebration` for tests.
- **Departure:** replace the static card with a 2.4 s lift-off of the lander sprite, using a flame emitter and engine roar. Keep the 0.8 s reduced-motion timing (`main.ts:1693-1694`).
- **Optional hit-stop** for rare finds (Goldium, Helion ice) and milestones: presentation-only, holding the rendered frame for 70 ms while the simulation runs, as `docs/DESIGN_PACK_IMPLEMENTATION.md:134` requires. Never during a volatile window. Owner decision D10.

**Acceptance**
1. Selling 7 packages shows ≥ 10 intermediate credit values within 0.5–1.2 s, and the final value equals the model.
2. A milestone shows a 1.2–1.8 s sequence: sparks, stage reveal, banner and fanfare. `data-celebration` is set, and the sequence can be skipped.
3. An upgrade shows the install flash on the changed layer.
4. With reduced motion, there are crossfades only and the same audio.
5. No simulation time advances during celebrations; the dock is already paused.

**Dependencies:** FEEL-P1 and FEEL-P3.

**Deviation:** None.

### FEEL-P6 · Landing and flight retune: air brake, apex damping, landing feedback, coherent fall rule, bay assist (addresses F7, F8) · Effort M · Impact medium

**Change**
- Add drag in the air when there is no horizontal input.
- Damp the apex when Up is released.
- Emit a landing event with feedback.
- Make fall damage independent of engine rank (owner decision D3).
- Help the rig settle into the lander bay.

**Implementation**
- `model.ts:497`: `drag = onGround ? 3.2 : horizontal ? 0.85 : 2.6`.
- Apex: after `model.ts:540`, `if (!controls.up && this.velocityY < 0) this.velocityY *= Math.exp(-1.2 * dt)`.
- Fall cap: clamp the downward speed with a per-world terminal (W01 6.0, W02 4.8, later from data) instead of `maxVertical`. Keep `maxVertical` for powered ascent.
- Damage rule, per owner decision D3, one of:
  - (a) remove it;
  - (b) height-based: track `fallStartY` when support is lost; at ≥ 12 tiles deal `1 + floor((drop − 12) / 6)` HP, with a falling whistle after 8 tiles;
  - (c) keep the current rule.
- Landing: in the `moveAxis` y-collision branch (`model.ts:586-592`), push `land{speed}` when `velocityY > 1.5`, before zeroing it.
  - The renderer fires two tread dust emitters (angles 160–200° and 340–20°, count 4 + 2·speed) and squashes the rig (scaleY 0.88, scaleX 1.10, 70 ms, then a spring back).
  - Above 4.5 tiles/s, add a 2 px local rig jolt.
  - Audio: a 70 Hz thud plus a 2 kHz noise click so phones hear it. Gamepad rumble scales with speed.
- Bay assist: when airborne within ±1.5 tiles of `dockX` with no horizontal input and `vy ≥ 0`, apply `velocityX *= exp(-6·dt)` and a nudge toward `dockX` of at most 1.5 tiles/s.

**Acceptance**
1. Simulation: releasing at 5 tiles/s in the air stops the rig in ≤ 2.0 s and ≤ 2.2 tiles. Ground and counter-steer values are unchanged.
2. Releasing Up at full climb overshoots ≤ 1.2 tiles in W01 (now 1.85).
3. `land` fires for impacts above 1.5 tiles/s, and dust appears within 100 ms.
4. Fall damage is identical across engine ranks 0–9 (unit test).
5. A scripted fly-home with no horizontal input over the bay docks without overshoot.

**Dependencies:** FEEL-P1 and FEEL-P3.

**Deviation:**
- The air brake and apex damping depart from the historical reference calibration: "factors do not become stronger simply because the direction key is released" (`docs/MOVEMENT_REFERENCE.md`). That calibration is not pinned in the design pack (owner decision D4).
- A separate fall cap reinterprets the pinned `maximum_vertical_travel_cells_per_second = min(12, 6·√(power))`. Changing the damage rule is owner decision D3.

### FEEL-P7 · Danger and status feedback: alarm, damage, pinned shelf puffs, power-down, volatile cues and haptics (addresses F9, F6 part) · Effort M · Impact medium

**Change**
- Make danger felt in the world and in sound, not only in text.
- Every cue keeps a visible counterpart when sound is off.

**Implementation**
- **Low-energy alarm:**
  - `audio.alarm(band)` schedules a soft two-tone beep (880/660 Hz, 120 ms each) every 4 s at ≤ 25 %, 2 s at ≤ 15 % and 1 s at ≤ 8 %, and ducks the music 6 dB. It can be muted (`preferences.alarm`).
  - Visual in WebGL: `this.cameras.main.postFX.addVignette(0.5, 0.5, 0.92, 0)` created once, with `strength` tweened 0 ↔ 0.25 at band ≥ 2.
  - Visual in Canvas: `#campaign-game[data-energy-band="3"]::after { box-shadow: inset 0 0 120px #ffa03c59 }`.
  - The lamp flickers at ≤ 8 % (`this.lamp.setAlpha(0.6 + 0.4·noise)`).
- **Damage:**
  - Hit flash: redraw the rig layers with `setTintFill(0xffffff)` at alpha 0.8 for 60 ms in WebGL; on Canvas, a white silhouette ellipse.
  - 8 sparks, a metal clank plus noise burst, and a hull creak loop below 25 % hull.
  - Optional shake through a custom "trauma" offset added to `cx/cy` only, so screen-space overlays such as the joystick do not shake: offset = 6 px × trauma² × noise, with trauma decaying at 1.6/s. Default off (D2).
- **Shelves (pinned W01 fx):**
  - On `shelfWarning`, `dust.explode(6, …)` at warning start and again at 1.0 s.
  - On `shelfCollapse`, a falling-block Image tween (+1 tile, ±20°, alpha → 0, 300 ms), 10 dust particles and a rumble.
- **Depletion:**
  - Delay the disabled card by 700 ms (the simulation is already stopped).
  - Fade the lamp to 0.25, glide the hum from 96 to 30 Hz with a relay click, and apply WebGL `postFX.addColorMatrix().desaturate()` for that moment.
  - Optionally let the model apply gravity until grounded before disabling, so the rig no longer hangs mid-air; no fall damage on this settle.
- **W02 volatile:**
  - On `volatileWindow`: a bell "ting" at 1.8 kHz plus a rising tone across the 0.75 s window, `navigator.vibrate?.(25)`, and `pad.vibrationActuator?.playEffect("dual-rumble", { duration: 80, weakMagnitude: 0.6, strongMagnitude: 0.2 })`.
  - On `volatileIntact`: the pinned "clean ring" (radius tween 0.72 → 1.2 tile, alpha → 0, 350 ms) and the pinned bell.
  - On `volatileRupture`: falling frost fragments and a descending crack.
  - Sync the DOM release card on the event, not on the 10 Hz HUD tick (`main.ts:1967-1970`).

**Acceptance**
1. Every event in §8.1 has both a visual and an audio cue, and the visual cue remains with sound off (pinned, `docs/DESIGN_PACK_IMPLEMENTATION.md:134`).
2. The shelf warning shows two dust puffs.
3. Depletion plays a 0.6–0.8 s power-down before the card.
4. Shake is off by default (or as decided) and persists; reduced motion forces it off.
5. Haptics use feature detection and respect the setting.

**Dependencies:** FEEL-P1 and FEEL-P3.

**Deviation:** Full-screen shake goes against the pack's restraint guidance ("restrained effects … one local screen effect", `docs/DESIGN_PACK_IMPLEMENTATION.md:126`; the W04 fx brief says it "never shakes the entire screen by default"). It is therefore off by default (owner decision D2). The shelf puffs implement the pinned W01 brief.

### FEEL-P8 · Rig secondary motion and load cues (addresses F11, F12 part, F14) · Effort M · Impact medium

**Change**
- Add lean, squash and stretch, an idle bob, exhaust and downwash particles, and tread dust.
- Present the load as suspension sag and engine strain.
- Move the pickup label clear of the progress bar.

**Implementation**
- Rig transform and layers:
  - Extend `image()` (`scene.ts:413-462`) with `rotation` and `scaleX/scaleY`.
  - Compute one rig transform per frame:
    - lean = `clamp(-axSmoothed × 0.004, -0.07, 0.07)` rad in the air, decaying to 0 when grounded;
    - squash as a spring state, excited by `land`, `cutStart` (0.94 along the cut axis) and side-cut engage;
    - idle bob of ±0.8 px at 1.1 Hz when grounded and still.
  - Pivot at the treads (origin 0.5, 0.78, with a y correction).
  - Apply the transform to every rig layer (`scene.ts:1696-1895`).
- Exhaust: two particle points at ±0.22 tile below the nozzles, smoke at 6/s. When a floor lies within 1.5 tiles below (a ray using `campaign.tile`), emit sideways downwash dust at the hit point.
- Tread dust: 2–3 dust particles behind the treads when |ax| > 10 tiles/s² on the ground.
- Load cues: hum frequency × (1 − 0.08 × cargoBulk / capacity), and a body sag of +1.5 px × fill ratio. This is presentation only; the mass formula is unchanged.
- Pickup label (`scene.ts:1925-1931`): place it at py − 1.15 tile while a cut is active, or beside the rig.
- Reduced motion: no lean, bob or squash; the exhaust shows as the existing flame only.

**Acceptance**
1. A flight screenshot shows a 2–4° lean into the steering direction, and the rig is level when grounded.
2. Exhaust appears while thrusting, and downwash appears within 1.5 tiles of a floor.
3. The label never overlaps the progress bar.
4. A full hold lowers the hum pitch by ≥ 6 %.
5. Reduced motion shows no lean, bob or squash.

**Dependencies:** FEEL-P3.

**Deviation:** None. Presentation only; the pinned mass formula stays.

### FEEL-P9 · Input responsiveness and analogue control (addresses F10, F3 part) · Effort M · Impact medium

**Change**
- Mouse steering responds on press unless the press lands on something inspectable.
- Touch and gamepad gain proportional horizontal throttle for fine positioning.
- A joystick haptic tick.
- An optional early cut-cancel window (owner decision D6).

**Implementation**
- Mouse:
  - `pointer.ts` `begin(…, immediate)`. In `scene.ts` pointerdown (`scene.ts:276-298`), hit-test inspectables (packages, missions, lander) with the logic of `inspectAt` (`scene.ts:374-411`) and pass `immediate = !inspectable`.
  - In `controls()` and `end()`, set `active ||= immediate`.
  - Draw the aim ring from the press, faded until active (`scene.ts:1679-1694`).
- Throttle:
  - Add `throttleX?: number` to `CampaignControls` (`types.ts:104-112`).
  - Touch: `throttle = clamp((|dx| − deadZone) / (0.6·travel − deadZone), 0.35, 1)`, with joystick travel raised from 32 to 40 px (`pointer.ts:17`).
  - Gamepad: map |axes[0]| from 0.25–1 to 0.35–1 (`input.ts:321-322`).
  - The model multiplies `acceleration` by `throttleX ?? 1` (`model.ts:502-510`).
- Haptics: `navigator.vibrate?.(8)` when leaving the dead zone (Android), behind the setting.
- Optional cut cancel at `model.ts:424-429`: `if (controls.up && this.cut.progress < 0.2 && !volatileCut) this.cut = undefined`, with no energy refund.

**Acceptance**
1. A mouse press away from inspectables shows the ring and steers within one frame (≤ 33 ms, browser check). A tap on a visible ore or the lander still inspects or docks.
2. With half throttle, a 100 ms ground input moves ≤ 0.4 tile (now 0.81).
3. Gamepad rumble works where `vibrationActuator` exists.
4. If adopted, the cancel window never applies to volatile cuts.

**Dependencies:** none (pairs well with P2).

**Deviation:** The cut-cancel window changes the approved committed-cut rule ("A started cut finishes before ascent", `main.ts:194`, `docs/CAMPAIGN_W01.md:53`): owner decision D6. The throttle adds a control dimension with no pinned conflict. Meeting the 100 ms acknowledgement target implements an approved requirement (`docs/DESIGN_PACK_IMPLEMENTATION.md:132`).

### FEEL-P10 · Adaptive music and layered ambience (addresses F1) · Effort L · Impact medium

**Change**
- Replace the 12 s single note with a depth-adaptive score and a living ambience bed.
- Each world gets its own palette from the pinned briefs.

**Implementation**
- New `src/campaign/music.ts` with a `MusicDirector`:
  - A lookahead scheduler: a 25 ms `setInterval` that schedules notes up to 0.12 s ahead on `AudioContext.currentTime`.
  - Stems per world as 16-step patterns: pad chord, bass pulse, percussion and melody motif.
  - W01 per its brief: pneumatic knocks, a ticking pump and metallic percussion.
  - W02 per its brief: glass ticks, bells and airy pads.
  - Layers selected by depth band: W01 0–100, 100–400 and 400–600 m; W02 0–150, 150–450 and 450–1000 m.
  - A danger layer at ≤ 25 % energy or hull, a warm and slow dock layer, and milestone stingers.
  - Crossfades with `setTargetAtTime` (τ 1.2 s).
- Ambience:
  - Noise "wind": lowpass at 500 Hz plus bandpass at 1.2 kHz, with a 0.07 Hz LFO.
  - Cave drips underground: sine pings at 1.2–3 kHz, 40 ms, every 2–7 s.
  - A `ConvolverNode` with a generated 1.4 s impulse; reverb wet rises from 5 % to 20 % with depth.
  - `StereoPannerNode` panning of cues by x offset (±1 at 6 tiles), which also prepares the pinned W03 "directional stereo".
- Sample option (owner decision D8): 3 loops × 2 worlds, Opus in WebM with an AAC fallback, 64 kbps mono, about 0.5 MB each, fetched after Deploy and decoded with `decodeAudioData`.

**Acceptance**
1. Music is continuously present at RMS −26 ± 3 dBFS with ≥ 30 % of its energy above 300 Hz.
2. Band changes crossfade over 3–5 s without clicks.
3. The danger layer enters at ≤ 25 % and leaves within 3 s of recovering.
4. Scheduling drift is ≤ 10 ms over 10 minutes (OfflineAudioContext test).
5. Any downloaded audio is ≤ 1.5 MB per world and lazy-loaded.

**Dependencies:** FEEL-P1.

**Deviation:** None for synthesis, which implements the pinned audio briefs. Recorded or commissioned assets would add a licensing and pipeline step (owner decision D8).

### FEEL-P11 · Feel regression harness, debug overlay and frame-time policy (supports all) · Effort S · Impact low (enabler)

**Change**
- Turn this audit's measurements into regression bounds.
- Add a `?feel=1` overlay.
- Decide the dt-clamp policy.

**Implementation**
- `tests/campaign-feel.audit.ts`, built from `work/feel/physics.audit.ts` and `precision.audit.ts`. Bounds cover acceleration, coast (ground and air), apex, drill durations per material and rank, shaft entry, the input buffer, landing events and fall damage independent of engine rank.
- `?feel=1` DOM overlay showing vx, vy, cut seconds and progress, camera anchor, look-ahead and zoom, live particles and audio voices.
- `scene.ts:864`: either raise the clamp to 0.1 s (the model already substeps at 120 Hz with a 0.25 s cap), keeping real time down to 10 fps, or document the intentional slow motion below 20 fps.

**Acceptance**
1. At least 12 bounded assertions run inside `npm test`.
2. The overlay toggles via the URL.
3. The dt policy is documented.

**Dependencies:** none.

**Deviation:** None. It makes concrete the pack's statement that "movement feel … remain[s] targets to measure" (`docs/DESIGN_PACK_IMPLEMENTATION.md:38`).

---

## 8. Specifications

### 8.1 Event → feedback matrix (proposed)

| Event | Visual | Audio (bus) | Haptic | Reduced motion | Budget |
|---|---|---|---|---|---|
| Cut start | Rig squash 0.94 along the axis, 60 ms; contact spark | Pneumatic knock (sfx) | — | No squash; spark flash only | — |
| Cutting | Debris 2 per 45 ms in material colour; stone sparks; ±0.6 px rig jitter on stone; W02 steam up, frost down | Grind loop per material, gain 0.6 + 0.4·progress | Gamepad weak 0.15 on stone (optional) | No particles; existing crack overlay | ≤ 40 |
| Cut complete | 12 chips of 6–9 px, 6 dust puffs, tile crumble fade 80 ms | Crunch, 120 ms, pitch per material | — | 1-frame tile outline flash | ≤ 20 |
| Pickup | Pop (Back.Out 120 ms), magnet to rig (180 ms), 4 sparkles; HUD cargo bump; HAUL count-up | Rising two-note (pinned W01), pitch by tier; chord for tier 4 | Android 15 ms (optional) | Fade at the rig; text update | ≤ 10 |
| Hold full | Cargo readout red pulse ×2 | Clunk plus two falling notes | — | Colour only | — |
| Land (> 1.5 t/s) | Tread dust 4 + 2·v; squash 0.88/1.10 for 70 ms; jolt 2 px above 4.5 t/s | 70 Hz thud plus 2 kHz click, gain ∝ v | Gamepad strong ∝ v | Static dust sprite 150 ms | ≤ 16 |
| Side-cut engage | Squash toward the wall; 3 sparks | Clank | — | Sparks only | — |
| Refused side cut | 3 sparks; "needs footing" label (once per 3 s) | Dull tick | — | Label only | — |
| Thrust | Flame (existing), exhaust 6/s, downwash near floors | Band-noise whoosh rising with vy; W01 pump tick | — | Flame only | ≤ 24 |
| Damage | White hit flash 60 ms, 8 sparks, red rim 300 ms; shake only if enabled | Metal clank plus noise; hull creak below 25 % | Gamepad 120 ms; Android 40 ms | Static red rim | 1 local screen effect |
| Shelf warning / collapse | 2 dust puffs (pinned) / falling block tween 300 ms plus dust | Creak, two-stage crack / rumble plus thud | Gamepad on collapse | Static puffs / instant | ≤ 12 |
| Low energy 25/15/8 % | Amber rim (pulse at ≥ 15 %), lamp flicker at 8 % | Alarm every 4 / 2 / 1 s, music ducked | — | Static rim | 1 local screen effect |
| Depletion | 0.7 s power-down: lamp dims, desaturate (WebGL) | Hum glide 96 → 30 Hz, relay click | — | Instant dim | — |
| Volatile window / intact / rupture | Ring flash / clean ring expands (pinned) / frost fragments fall (pinned) | Bell plus rising tone / bell (pinned) / descending crack | Android 25 ms; gamepad weak 80 ms | Ring only | ≤ 12 |
| Sale | Rows fly to credits; count-up 0.5–1.2 s | Coin ticks rising, cha-ching | — | Instant plus one chime | — |
| Purchase | Install flash on the new layer | Wrench clank plus confirm | — | Crossfade | — |
| Milestone | 1.6 s build: sparks, stage rises in, shine (WebGL), banner | Fanfare plus pad swell, music ducked | Gamepad | Crossfade, banner, fanfare | ≤ 40 |

### 8.2 Audio mix sheet

| Item | Target |
|---|---|
| Chain | sources → sfx / ui / ambience / music buses → master 0.9 → compressor (−14 dB, ratio 6, attack 3 ms, release 200 ms) → output |
| Default sliders | Effects 0.8 · Ambience 0.5 · Music 0.45 (now 0.5 / 0.3 / 0.15, with master 0.5) |
| Loudness | SFX peaks −10 ± 3 dBFS; drilling loop RMS −24 ± 3; music RMS −26 ± 3; ambience RMS −32 ± 3 dBFS |
| Small speakers | ≥ 40 % of loop energy above 300 Hz; every low sound has a harmonic or noise layer at 200 Hz–2 kHz; high-pass the SFX at 80 Hz |
| Ducking | Warnings, damage and milestones duck music and ambience by 6 dB (attack 50 ms, release 400 ms) |
| Voices | At most 12 simultaneous; identical cues at least 60 ms apart; all scheduling on AudioContext time |
| Settings | Sound on/off (persisted, default on per D1), alarm loop on/off, haptics on/off, shake off/low/full (default off per D2) |

### 8.3 Particle budget (pinned limit 150 visible, one local screen effect)

| Pool | Desktop | Coarse pointer |
|---|---|---|
| Drilling debris | 40 | 20 |
| Completion and dust | 20 | 10 |
| Thrust exhaust and downwash | 24 | 12 |
| Landing dust | 16 | 8 |
| Pickup sparkle | 10 | 5 |
| Hazards and collapse | 20 | 10 |
| Celebrations (dock is paused, other pools idle) | 40 | 20 |
| Reserve | 20 | 10 |

- One emitter per pool, with `maxParticles` set.
- Use `explode()` / `emitParticleAt()`; never create emitters per event.
- Use pre-coloured textures for Canvas parity.
- The global cap is checked through `getAliveParticleCount()`.

### 8.4 Reduced-motion rules (extending the current behaviour)

- No moving particles, shake, lean, bob, squash, look-ahead or zoom.
- Flashes last ≤ 1 frame, or become static tints.
- Count-ups and sequences become crossfades.
- Audio is unchanged.
- **Never alter simulation timing** (pinned, `docs/DESIGN_PACK_IMPLEMENTATION.md:134`): hit-stop, if adopted, is render-only.

---

## 9. Owner decisions

| ID | Decision | Recommendation |
|---|---|---|
| D1 | Sound on by default after Deploy, against the documented "Sound starts muted" (`README.md:14`) | On, with a one-tap mute on the title and HUD, remembered |
| D2 | Full-screen shake given the pack's restraint guidance (`DESIGN_PACK_IMPLEMENTATION.md:126`; W04 fx brief) | Off by default; local rig jolts and flashes instead; Low and Full available in settings |
| D3 | Fall damage: (a) remove, (b) height-based ≥ 12 tiles with a warning, (c) keep the engine-dependent rule | (a) for the no-combat tone, or (b) if risk on returns down long shafts is wanted. Not (c). |
| D4 | Air brake and apex damping against the historical reference calibration (`MOVEMENT_REFERENCE.md`) | Adopt (it is an original game now); keep ground values |
| D5 | Shaft magnet replacing the reference-derived support-column choice | Adopt |
| D6 | Committed cuts: allow cancel in the first 20 % (non-volatile) | Optional; adopt only if playtests show accidental side cuts frustrate |
| D7 | Phone portrait tile 42–44 px to fit the 9-tile lamp, against 48 px legibility | Test 44 px with the graphics and HUD audits |
| D8 | Audio sources: synthesis only, or hybrid with CC0 or commissioned one-shots and music stems | Synthesis for SFX and ambience now; commission music stems when W03 starts |
| D9 | Haptics default (Android vibrate, gamepad rumble; iOS unsupported) | On for gamepad; on for Android touch with a setting |
| D10 | Presentation-only hit-stop (70 ms) on rare finds and milestones | Optional; never during volatile windows |

## 10. Suggested sequencing

| Step | Proposals | Rough effort |
|---|---|---|
| Week 1 | P1 audio foundation, P2 shaft magnet and fixes, P11 harness | ~5–6 days |
| Week 2 | P3 FX layer and drilling juice, P4 camera | ~6–8 days |
| Week 3 | P5 rewards, P6 landing and flight, P7 danger | ~8–10 days |
| Week 4 | P8 rig motion, P9 input | ~5–6 days |
| Parallel or longer | P10 adaptive music | 1–2 weeks |

Re-run `work/feel/*.test.ts`, `feel-capture.mjs` and `fog-share.py` after each step to show movement against the acceptance bounds above.
