# Improvement plan: playability, progression, graphics and interface

Date: 2026-11-02. Status: **Final proposal; awaiting owner review.**

**Scope.** The playable campaign at `dbf0b1a`: W01 Broken asteroid and W02 Ice comet. The plan merges seven read-only audits (PROG, FTUE, FEEL, GFX, HUD, MENU, WORLD; [reports 01–07](improvement-plan/analysis/)) and three critiques. Disputed claims were re-checked in the code.

**Conventions.**
- **Effort** assumes one experienced developer: S ≤1 day, M 2–4 days, L 1–2 weeks, XL >2 weeks.
- **Dev.** marks a change that deviates from an approved decision or a pinned v0.1 value.
- **Sign-off** marks a visible change to an unpinned choice (§6).
- **Content** uses genre conventions only.
- **Depth** on the HUD = (row + 1) × 10 m.
- **"Five resolutions"** means 1280×720, 1440×900, 1920×1080, 2560×1440 and 3440×1440, all at DPR 1.
- **Evidence** is archived in [`docs/improvement-plan/`](improvement-plan/README.md): audit reports, UI mocks, fixtures and measurement scripts. Paths such as `work/…` and `shots/…` are relative to that folder.
- **Captures** (d01–d21, e00–e03, e05–e07, l01–l02, p01–p05 and the audits' own) were local review files and are not committed. The [baseline contact sheet](improvement-plan/baseline-contact-sheet.webp) shows twelve of them.

## 1. Executive summary

The engineering base is sound; the loop and its presentation are not.

1. **No progression spine.** A bot that buys nothing finishes W01 in 4.4 min, and the novice model in 24.9 min, against a 45-min target. Ore value is flat with depth. Rank-1 parts change income by −1.5% to +7.6%.
2. **The first session punishes the obvious move.** Holding Down strands a fresh rig at 190 m on 40/40 seeds, and recovery takes all 20 CR plus the 380 CR haul. The warnings never display, and there is no tutorial.
3. **Risk is invisible.** Nothing estimates the energy needed to return. The last safe turnaround comes 5.5 s after the first warning, and the lander pointer vanishes below 72–126 m.
4. **The world is a void.** While drilling, 86–89% of pixels sit below luma 40. Terrain repeats one drawing, and a DPR-3 phone renders only 11% of its pixels.
5. **Feedback is muted.** Sound is off by default and sub-bass when on, and a sale is one line of text.
6. **The interface reads as a debug console.** Up to 96% of HUD text is ≤12 px, and contrast falls to 1.46:1. The next autosave erases the campaign that a new one promised to back up. A gamepad cannot use the menus.
7. **The route is empty and partly borrowed.** Only 4.2 of 11 depth bands on the mission route hold anything new, and W01's mineral names and values copy the reference game.

**Thesis.** Stop what breaks the first hour. Give the economy a spine and make risk legible. In parallel, rebuild rendering and the UI on shared foundations: a view transform, a retained renderer and UI modules. Then deepen both worlds with a content kit before W03.

**For the player.** Phase 0 (≈3 calendar weeks with two developers) keeps the first haul, fixes the warnings and sky, and makes rock and HUD readable. Phase 1 (≈9 weeks more) teaches the loop, shows the way home, pays for depth and upgrades, and adds sound. Phase 2 brings lit, banded rock, sharp phones and a redesigned HUD, terminal and title; Phase 3 fills every band. The core plan is ≈45 developer-weeks (≈52 with 15% contingency), or ≈24 calendar weeks with two developers (≈28 with contingency). §5 gives cut lines at 6 and 12 weeks.

## 2. Experience targets

| # | Target | Baseline | Goal | Gate |
|---|---|---|---|---|
| T1 | First ore; first sale and M1 | 1.5 s; 15.2 s active | ≤3 s; ≤3 min real time for 4 of 5 novices | P1 |
| T2 | First useful upgrade | Trip 3; the test buys hull (0% income) | Trip 2 (≤35 s active), even after one minor impact, with ≥25 CR left; ≤8 min for 4 of 5 novices | P1 |
| T3 | First failures | Every hold-Down dive fails and loses the haul | First tow keeps the haul (P0). "Turn back" ≥3 s before disablement; ≤1 of 5 novices recovers in 10 min (P1) | P0, P1 |
| T4 | Chapter pacing (H1) | Rusher 4.4 min; skilled 7.9; novice 24.9 (W01), 59.4 (W02) | A purchase on the critical path; skilled W01 10–18 min; novice W01 40–50, W02 60–90 | P1, P3 |
| T5 | Gaps, cadence, purchases (H1) | Novice worst gap 10.3 min; parts −1.5% to +7.6% | Worst gap ≤8 min (median of seeds); every part ≥ +8% or passes a capability test; pickups per minute in minutes 2–15 ≥80% of v0.1 | P1, P3 |
| T6 | Discovery on the route (H3) | New content in 4.2/11 (W01) and 4.2/19 (W02) bands; 100 m ore drought; relic seen on 4.5% of seeds | ≥7/11 and ≥12/19; drought ≤60 m; relic seen on ≥60% | P1, P3 |
| T7 | Return information | None | Estimate within −10%/+30% (P1); lander beacon at any depth (P2) | P1, P2 |
| T8 | HUD readability (H7) | 64 of 150 texts below 4.5:1; 69–96% ≤12 px; 63 first-frame words; 1.4 clear rows at 568×320 | All ≥4.5:1 (P0). ≤40 words while coaching (P1). Values ≥7:1 and ≥18 px; nothing below 12 px; ≤25 words; ≥6/3.5/3 clear rows at 393×851/844×390/568×320 (P2) | P0–P2 |
| T9 | Menus (H6) | 75–77% of words ≤12 px; gamepad inert; old campaign erased | Archives and a gamepad stopgap (P0). ≥80% of words ≥14 px; a gamepad-only script docks, buys and travels (P3) | P0, P3 |
| T10 | World rendering | 86–89% of pixels below luma 40; sky seam; 11% of device pixels | ≤60% below luma 40 (P0), ≤45% (P2); one sky body, no seam at the five resolutions; canvas at CSS × min(DPR, cap) | P0–P2 |
| T11 | Audio and input | Silent; drilling −37.3 dBFS; mouse 180 ms | On after Deploy; mute remembered; −24 ± 3 dBFS with ≥40% of energy above 300 Hz; ≤100 ms (approved) | P1 |
| T12 | Performance | 35.9 ms p95 JS per frame (phone viewport, 4× CPU throttle); 26.25 MiB of textures | P0–P1: p95 JS ≤ +10%. P2, Pixel 6a / Galaxy A54-class phone: p95 ≤16.7 ms, p99 ≤33 ms at render scale ≥1.5; textures ≤20 MiB at boot, ≤40 MiB per world on touch devices | P0–P2 |

## 3. Keep

- The deterministic, DOM-free simulation, with exact transactions (`model.ts:855-934`) and no-debt recovery (`model.ts:1076-1149`).
- A fast opening: first ore 1.5 s after Deploy, and the pinned 380/480 CR seams fund M1.
- Persistent worlds, wall-occluded discovery and the mission locator.
- Flat-vector sprites, the modular rig, construction stages (e00–e03) and editable SVG sources.
- W02's depth rarity, volatile skill and thermal auger (best value per CR: +13.8% for 1,200 CR).
- Save safety, the terminal beside the world, and the accessibility switches, extended to every layer.

## 4. Workstreams

About 85 audit proposals and the critiques' additions merge into 74 items. Effort midpoints: S 1 day, S–M 2, M 3, M–L 5, L 7.5. Items without a spec take their acceptance criteria from §4.10.

### 4.1 A: Progression and economy

**Diagnosis (PROG-F1–F8).**
- Every W01 objective sits in one soil corridor (`world.ts:28-58`), and the starter seams nearly cover the 1,000 CR of fees.
- Ore ignores depth: value per cell falls from 9.8 to 6.9 CR while cut time rises 1.74×.
- Hull takes no damage: hard landings need a fall faster than 7 cells/s (`model.ts:586`), but falls cap at 6–6.66.
- Load never slows climbing.
- In W02, income rises only 4.5% while prices triple.

| ID | Change (sources) | Why / evidence | Effort | Impact | Depends on |
|---|---|---|---|---|---|
| A1 | Depth-weighted W01 ore; one relic per world, in the deepest third (PROG-P1, P7d) | Prototype: 500–600 m pays 2.7× the 100–200 m band | S | High | H1, H2, H8 |
| A2 | Full 10 L start; one free tow per world for a disabled rig, keeping cargo; no landing damage below the fall cap (FTUE-P1, PROG-P2). **Dev.** research start; pinned recovery rule | The first dive loses 400 CR | S | High | — |
| A3 | Fused plate in rows 30–31 that needs drill rank 1; fees M2 600, M3 1,000 (M1 200); energy rank 1 costs 600 CR (PROG-P3). **Dev.** pinned fees and price; new material | No purchase needed | M | High | A1, H1, H2, H8 |
| A4a | Rack +30%, rounded up, no prerequisite; feet become a 250 CR shaft brace; load slows climbing until the engine is upgraded (PROG-P4). **Dev.** pinned gear, mass and vertical rules | Rack +1 bulk; engine −1.5% | M | High | A3, B3 |
| A4b | Condenser becomes a 1,600 CR steam reserve (PROG-P4). **Dev.** pinned gear | −1.5% | S–M | Medium | A4a, H2 |
| A5a | 1.5 s release window for the first three volatile cuts (PROG-P8). **Dev.** pinned 0.75 s | 6–17 ruptures per run | S | Medium | H2 |
| A5b | W02 balance 0.3: common ores at bulk 1 in new W02 worlds; fees set by H1; jobs for rank-2 energy, hull and engine (PROG-P8). **Dev.** pinned bulk and fees | Rank-2 energy −4.6%, hull 0%, engine +2.8% | M | High | H1, A4a, A9, G3 |
| A6 | Two optional contracts per world (PROG-P6) | Variety between milestones | M | Medium | H1, H2 |
| A7 | Unlock text matches the real gates; rank-correct part names (PROG-P9). **Dev.** pinned milestone copy | `config.ts:466` | S | Medium | — |
| A8 | Records, mastery stars, chapter summary (PROG-P10) | 5 of 6 stats are never shown | M | Medium | A6, G5 |
| A9 | Pressure seams: about 8% of soil below 450 m hisses for 1.2 s after a cut, then deals 4 HP unless the rig moves away (PROG-P3c). **Dev.** new hazard | Gives hull a job | S–M | Medium | A1, H2 |

**Opening arithmetic.** The pack's Phase 1 gate reads: "Two novice opening trips fund a useful purchase with service reserve, including one minor impact" (`DESIGN_PACK_IMPLEMENTATION.md:99`). Replaying `tests/campaign-model.test.ts:129-160` with M1 paid gives the credits below; seeds 10, 4 and 999 agree. The impact is a 3 HP hit, repaired for 45 CR. The second column shows credits after the second sale, and the remaining columns show what is left after each purchase.

| Start, impact | Credits after sale 2 | Tank 650 | Tank 600 | Engine 500 | Hull 450 |
|---|---|---|---|---|---|
| 6 L, none | 672.5 | 22.5 | 72.5 | 172.5 | 222.5 |
| 6 L, 3 HP | 627.3 | −22.7 | 27.3 | 127.3 | 177.3 |
| 10 L, none | 676.5 | 26.5 | 76.5 | 176.5 | 226.5 |
| 10 L, 3 HP | 631.3 | −18.7 | 31.3 | 131.3 | 181.3 |

**The gate purchase is energy rank 1 at 600 CR.** It leaves at least 27 CR in every case, and the new tank fills on purchase. After A4a, the engine also qualifies. The drill (750 CR) and the cargo bay (700 CR) are never affordable. M1 stays at 200 CR, because at 250 the 600 CR tank misses by 18.7 CR. H1 runs this scenario in place of the hull purchase at `tests/campaign-model.test.ts:150`.

**Fees.** Measured with the audit harness, using A1 placement and the plate, on 6 seeds:

| Fees M1/M2/M3 (CR) | Skilled W01 | Novice W01 | Novice worst gap, median/max | Deposits |
|---|---|---|---|---|
| 200/300/500 (pinned) | 7.5 min | 37.3 min | 7.4/8.1 min | 400 |
| 200/600/1,000 (proposed) | 11.9 | 41.1 | 7.7/8.2 | 400 |
| 200/900/1,600 (draft) | 14.4 | 45.8 | 12.1/22.3 | 500 |

The fees feed the pinned ore floor (3 × budget, `check-campaign-data.mjs:125`), and that floor sets the deposit count (`world.ts:154-161`). The proposed set has a 5,950 CR budget and a 17,850 CR floor, so W01 keeps 400 deposits worth 19,000 CR. The draft's 13.6/48.0 min figures used fees of 250/900/1,600 and an abstract gate. H1 re-measures the full set on 100 seeds before OD2 is decided.

**Inherited values, judged on merit.** Each value below is identical to `docs/RESEARCH.md`:

| Value | Call | Reason |
|---|---|---|
| 20 CR start cash | Keep | The first sale comes at 15 s |
| 6 of 10 L at start | Change (A2) | Causes the 190 m failure |
| 1 CR per litre; 15 CR per HP | Keep | Refuelling stays frictionless; with A9, a hit costs 60 CR |
| Ore values 30/60/100/250 | Change (G1). **Dev.** | The reference's signature table |
| Rank-0 drill 2, engine 150 | Keep | Unit bases of the pinned formulas |
| Rank-0 tank 10 L, hull 10, cargo 7 | Keep | Cargo 7 matches the 7-package seams |
| Drill 2.8/4, tank 25/40/60, hull 30; drill R1 750 CR | Keep | Follow from the pack's ×1.4–1.6 ladders; H1 may tune them |
| Mass factor 1 + mass/198 | Change (A4a: /80). **Dev.** | Load must be felt |

**A1 spec.** Port the audit prototype into `createW01` (`world.ts:162-217`): minimum rows 0/4/15/32, weight (1 + row/15)^k with k = 0/1.0/2.4/3.2, and band shares of 16/40/44%. Seams, mission cells and the 240/120/36/4 ore counts stay unchanged, and the relic goes in rows 40–59. *Acceptance (100 seeds):*
- band floors (`tests/campaign-world.test.ts:40-49`) hold on the v0.2 budget;
- 500–600 m pays ≥2× the 100–200 m band per cell;
- all rank-1 parts together earn ≥368 CR/min, today's rank-0 rate (measured 368.4);
- rank 0 keeps ≥60% of today's income (measured 62%).

**A2 spec.**
- `model.ts:64` starts at `HARDWARE_LEVELS.energy[0]`.
- `recover()` (`model.ts:1097-1149`) is free and keeps cargo when the rig is disabled and its world is not yet in `progress.towsUsed`. After B3 ships, "Can't reach home" also counts.
- The pause menu's always-available recovery (`main.ts:194`, `:1645-1651`) keeps the pinned fee.
- `model.ts:586` uses `max(7, maxVertical + 0.3)`.
- Decode defaults `towsUsed` to `[]` and accepts only known world ids. `BALANCE_VERSION` stays 0.1, because no stored value changes.

*Acceptance:*
- hold-Down fails no earlier than 290 m (measured: 300 m);
- the first tow keeps 7 packages and 20 CR;
- voluntary recovery still charges the fee;
- old saves load, and a malformed `towsUsed` is rejected.

**A3 spec.**
- Every cell in rows 30–31 becomes tile 4, including air. On 136/200 seeds the row-29 cave slot (`world.ts:74-88`) leaves air there, so a solid-only plate could be bypassed.
- Shelf 2 (`world.ts:92-99`) moves outside rows 28–32, keeping `tests/campaign-world.test.ts:79-83` passing.
- The cut start (`model.ts:446-486`) refuses tile 4 below drill rank 1 and cuts it ×2.5 slower otherwise.
- The plate gets its own art frames; otherwise `scene.ts:1143` draws it as stone.

*Acceptance (200 seeds):*
- no path leads from row 29 to row 32 through non-plate cells;
- no-purchase policies cannot reach the antenna;
- T4 and T5 (W01) hold.

**A4a and A9 spec.**
- **Rack:** ×1.3, rounded up (`model.ts:190-197`).
- **Brace:** deploys against walls and allows side cuts with no floor (`model.ts:395-403`).
- **Load:** a mass factor of 1 + mass/80 and a vertical cap of 6·p^0.75 go in B3's motion table.
- **Seams:** generated per world, never on route or mission cells, and timed like shelves (`model.ts:768-791`).

*Acceptance (H1):*
- the rank-1 engine climbs 59 rows with a full hold ≥15% faster;
- the brace reaches a wall ore without a ledge;
- the rack earns ≥ +8%;
- hull rank 1 halves deep repair spend;
- every seam hit follows a visible tell of ≥1.2 s.

### 4.2 B: First session and playability

**Diagnosis (FTUE-F2–F11).**
- `showMessage` returns while the danger flag is set (`main.ts:431`, `:877-889`). That flag uses the same 25% threshold as the warnings, so the warnings never show. Meanwhile, the danger banner fires on every correct first trip.
- There is no tutorial.
- The dock reopens on the last-used tab.
- "Hold full" is overwritten within a tick.
- A detour after M1 delays the first purchase to trip 3.

| ID | Change (sources) | Why / evidence | Effort | Impact | Depends on |
|---|---|---|---|---|---|
| B1 | Fix bundle (FTUE-P2): band text in the danger banner; refuel prompts at the dock and on undocking below 50%; Unload & sell reports what happened; dock opens on the relevant tab; distance-aware locator text; no world labels on the title; a 2.5 s guard on "Hold full" | 0 of 3 warnings shown; a false "Bank" message (`model.ts:839`) | M | High | — |
| B2 | Shaft magnet; 120 ms cut buffer; footing hint; facing frozen mid-cut (FEEL-P2, FTUE-P6) | Shaft-entry window is ±0.11 tile | S | High | — |
| B3 | Return-reserve gauge on one shared motion table: estimate, home notch, margin states, locator turns home (FTUE-P3, PROG-P2a, HUD-P2) | Last safe turn comes 5.5 s after the warning | M | High | B1 |
| B4 | Opening routed through seam B; marked seams; upgrade advice when a trip needs more than 85% of the tank (FTUE-P5) | First purchase at 66 s vs 33.5 s on the designed route | M | High | B3 |
| B5 | Guided first sortie: 12 skippable coach lines driven by game state, an in-dock Next strip, a quieter first frame (FTUE-P4) | No tutorial; 63 first-frame words | M | High | B1, B3, B4, E2, H4a |

**B3 spec.** `config.ts` exports one `MOTION` table:
- energy use: 0.063 idle, 0.126 per axis, 0.252 drilling;
- ground speed: min(10, 5√p);
- vertical speed: min(12, 6√p);
- the mass factor.

`tick()` uses this table instead of the literals at `model.ts:388`, `:411-415`, `:496`, `:512` and `:533`.

The estimate is a pure function that adds three parts:
- rows to climb ÷ vertical speed × (0.126·mf + 0.063);
- wrapped distance to the bay ÷ ground speed × 0.126·mf;
- the rest of any committed cut.

Let m = energy − estimate and b = max(1 L, one cut). The states are:
- OK: m > 2b;
- Plan return: m ≤ 2b;
- Turn back: m ≤ b;
- Can't reach home: m ≤ 0.

*Acceptance:*
- within −10%/+30% of a simulated return, over 10 depths × 20 seeds, in the default test run;
- "Turn back" appears ≥3 s before disablement;
- no warning on a correct first trip;
- readable in grayscale.

**B5 spec.** A pure `coachStep()` lives in `src/campaign/onboarding.ts`. `#campaign-coach` anchors to the rig through H4a, or to the HUD as a fallback. Progress is stored in `PilotPreferences` (`input.ts:38-49`), not in the save. While coaching, the tracker's "next" and "unlock" lines are hidden.

*Acceptance:*
- each step shows once, in order;
- restored saves resume where they left off;
- input is never blocked;
- the first upgrade comes after trip 2;
- the first frame shows ≤40 words.

### 4.3 C: Game feel, camera and audio

**Diagnosis (FEEL-F1–F8).** Movement responds well, reaching full speed in 0.30 s, but the feedback around it is muted:
- Sound is off by default (`audio.ts:14`). When it is on, 98.7% of the drilling mix sits below 150 Hz.
- The pickup chime fires on every cut, because `onEvent` (`scene.ts:21`) is never passed (`main.ts:1925`).
- Cuts fill 69–83% of a trip, yet end in 2.3 px grey squares.
- The drill animation frames differ by ≤0.48%.
- A fixed camera anchor leaves 43% of the surface view as fog.

| ID | Change (sources) | Why / evidence | Effort | Impact | Depends on |
|---|---|---|---|---|---|
| C1 | Audio on after Deploy, remembered mute, limiter, event stream, small-speaker patches (FEEL-P1) | Silent by default; 49–68 chimes a minute | M | High | — |
| C2 | World-space FX: debris by material, sparks, W02 steam and frost, ore pop (FEEL-P3) | Chips are invisible at play distance | M | High | C1, H4a |
| C3 | Camera framing by state, look-ahead, context zoom, fades (FEEL-P4). **Dev.** zoom changes the pinned 22 × 14 view | 43% fog at spawn | M | High | E4, H4a |
| C4 | Reward beats: tiered popups, sale count-up, install flash, construction sequence, launch (FEEL-P5, MENU-P6, FTUE-P8, PROG-P7, HUD-P9) | A sale is one 12 px line | L | High | C1, C2, H6 |
| C5a | Air brake, apex damping, bay assist (FEEL-P6, FTUE-P10) | 5.9-tile coast; overshooting the bay ends mouse runs | S–M | Medium | B3 |
| C5b | Landing dust and thud (FEEL-P6) | No landing feedback | S | Low | C2 |
| C6 | Alarm and rim, damage flash, pinned shelf dust, power-down, volatile bell, haptics (FEEL-P7) | Danger is shown as text only | M | Medium | C1, C2 |
| C7a | Auger twist frames, distinct thrust flames (GFX-P8) | Frames differ by ≤0.48% | S–M | Medium | H5a |
| C7b | Lean, squash, exhaust, load sag, readable damage (FEEL-P8) | Rigid rig | M | Low | C2, D4 |
| C8 | Mouse steers on press unless the press lands on an inspectable object (FEEL-P9) | 180 ms hold vs the approved 100 ms (`pointer.ts:74`) | S | Medium | — |
| C9 | Adaptive music and ambience (FEEL-P10) | One note every 12 s | L | Medium | C1 |

**C1 spec.**
- `PilotPreferences` gains sound (on by default), alarm, haptics and shake.
- `audio.unlock()` runs synchronously before the first `await` in the Deploy and Continue handlers. Deploy currently awaits `persist()` first (`main.ts:1747-1755`).
- `audio.ts` adds a compressor (−14 dB, 6:1) and a limit of 12 voices.
- `model.ts` emits typed events (cut by material, pickup by tier, landing, damage, volatile, shelf), routed through `onEvent`.

*Acceptance:*
- the AudioContext is running after the first click;
- mute survives a reload;
- T11 passes in an offline render;
- each cut and each pickup plays exactly one cue.

**C4 spec.** State commits first; the presentation follows, any input skips it, and no simulation time passes. `model.sell()` returns a per-ore breakdown, shown in a sale sheet outside the re-rendered containers.

*Acceptance:*
- a 7-package sale shows ≥10 intermediate values and ends on the model value;
- each beat lasts ≤1.5 s, and the launch beat ≤2.5 s;
- reduced motion crossfades instead.

**Canvas rule.** `Phaser.AUTO` (`main.ts:1920`) falls back to Canvas silently, and on Canvas postFX and preFX do nothing. Every effect that uses postFX, preFX, tint or ADD blending must name a Canvas fallback, such as a CSS rim for the alarm. H7's Canvas smoke test enforces this.

### 4.4 D: Graphics and world rendering

**Diagnosis (GFX-F1–F11).**
- Unknown cells are a dark fill under a 7% texture (`scene.ts:1104-1124`).
- Remembered cells draw at 42% opacity.
- Light is per-tile opacity, with a 15-level cliff at its edge.
- The headlamp glow is drawn beneath the terrain (depth 5 vs 10–11; `scene.ts:238-256`), so it never lights rock.
- Terrain repeats one drawing, and stone sits only ΔE 3.1 from soil.
- The sky shows a seam at the flight ceiling.
- The canvas ignores devicePixelRatio.

| ID | Change (sources) | Why / evidence | Effort | Impact | Depends on |
|---|---|---|---|---|---|
| D0 | Target frames painted over captures in the GFX §7.2 palettes: surface at spawn, a lit 60 m shaft and a 300 m cave, at 1440×900 and 393×851. **Sign-off** | D4 and D6 cost ≈5 weeks, and the world has no visual target | S–M | High | — |
| D1 | Gradient sky, seamless stars, one sky body, seamless ridges (GFX-P1) | Seam and a second planet (`g10-w01-flying-ceiling.png`, `g05-surface-1920x1080.png`) | M | High | H5a |
| D2 | Distinct stone and bedrock; High-contrast edges drawn in the canvas (GFX-P2, part) | High contrast changes 0 canvas pixels | S–M | High | H5a |
| D3a | Desktop: min(DPR, 2) for mouse and trackpad, pixel snapping, sharp labels, dynamic resolution (GFX-P3, part) | A DPR-2 laptop renders 25% of its pixels | M | High | H4a |
| D3b | Phones at min(DPR, 2), @3x art pages, the pinned 22-column view on large screens (GFX-P3). **Dev.** untrimmed-frames rule | 11% of device pixels at DPR 3 | M | High | H4, H5b, D3a |
| D4 | Opaque known terrain, dim "unexplored rock", light map with headlamp, depth ambient, glints (GFX-P5). **Sign-off** | 86–89% of pixels near-black | L | High | H4, D0 |
| D5 | Ore tier colour families, glints, baked badges (GFX-P7). **Dev.** pinned mineral palettes | W02 ore vs ice ΔE 9.4–19.2 | M | High | H5b |
| D6 | Macro-texture terrain, rims, back walls, four depth bands per world; a W01 slice first (GFX-P6). **Dev.** palettes extend the pinned five | Luma 69.0/69.6/65.8 at 40/300/560 m | XL | High | H4, H5b, D4, D0 |
| D7 | Surface dressing, base lights (GFX-P10). **Sign-off** | Base floats over a void | M | Medium | D1 |
| D8 | Wrecks and hazards as atlas art (GFX-P11) | ≈270 lines of runtime line art | M | Low | H4, G4 |
| D9 | Interim: unknown cells as dim textured rock; remembered opacity 0.65; lit floor 0.8 (GFX-P5 prototype). **Sign-off** | Fixes the void before Phase 2 | S | High | — |

**D9 spec.** Every unknown cell draws the same hash-chosen rock texture at ≤30% brightness, whatever lies underneath. In `scene.ts:1138`, remembered cells go from 0.42 to 0.65 and the lit floor from 0.58 to 0.8.

*Acceptance:*
- ≤60% of pixels below luma 40 in the d04/d05 fixtures;
- a hidden-cave fixture matches solid rock;
- p95 JS stays within +10%.

**D1 spec.** Replace the sky TileSprite (`scene.ts:1059-1064`) with three layers: a gradient, seamless stars and one wrapped sky body. Remove the baked planets and rebuild the ridges to wrap seamlessly.

*Acceptance* (at the five resolutions, at spawn and at the ceiling, in both worlds):
- exactly one sky body;
- no step of more than 6 levels;
- the asset checks fail if a seam appears.

**D3a spec.** Through H4a's View:
- the game renders at client size × dpr;
- the camera zooms by dpr;
- labels use `resolution: dpr`;
- scrolling snaps to device pixels.

Dynamic resolution steps 2 → 1.5 → 1 when p95 frame time over 3 s exceeds 18 ms. *Acceptance:* `canvas.width === round(clientWidth · min(dpr, 2))` at DPR 1, 1.25 and 2.

**D4 spec.**
- Known terrain is opaque, and all unknown cells share one rock texture.
- A per-cell `fogRT` (1 = unknown, 0.45 = remembered, 0 = visible) softens edges.
- A quarter-size `lightRT` holds the band's darkness (W01 ambient runs 0.85 → 0.28). Radial, cone and glint brushes erase it using destination-out, which works on both renderers.

*Acceptance:*
- ≤45% of pixels below luma 40 in d04/d05;
- the hidden cave matches solid rock;
- no step larger than 6 levels at the visibility edge;
- the headlamp and rig hold the brightest pixels;
- forced Canvas is within 3 levels of WebGL;
- the histograms fall within tolerance of D0;
- frame JS rises by ≤1 ms.

**D6 spec.** Each material in each band gets:
- a seamless 8 × 8-tile texture;
- 16 corner overlays;
- a back wall.

W01 alone needs ≈27 MiB at @2x and ≈61 MiB at @3x. So use multi-page atlases, and keep only the current band ±1 resident. The build order is:
1. a W01 slice of bands A–B, surface, dock and HUD, at final quality;
2. owner review against D0;
3. W01 bands C–D;
4. W02.

*Acceptance:*
- adjacent bands differ by ΔE ≥10;
- tile-phase luma varies by ≤4 levels;
- soil and hard rock differ by ΔL\* ≥8 in grayscale;
- T12's memory budgets hold.

**Depth bands (rows), for D6 and G3.**

| World | A | B | C | D |
|---|---|---|---|---|
| W01 | 0–10 Regolith: teaching | 11–29 Broken plates: ledges, shelves | 30–47 Iron shelf: A3 plate, cavities ≥40 cells | 48–59 Core rubble: halls, relic geode, seams |
| W02 | 0–14 Snow crust | 15–44 Blue glacier: clear ice, cold pockets | 45–74 Clathrate: bubble galleries, vents | 75–99 Black ice: pressure ice, guarded geodes |

### 4.5 E: HUD and in-game display

**Diagnosis (HUD-F1–F11).** The HUD is truthful but never answers "can I get home?".
- Energy is a 123 × 3 px hairline.
- Text sits on the world with only a shadow (`style.css:143`), so 23 of 24 elements fall below 4.5:1 in a W02 shaft. An 85% plate would lift the worst case to 6.88:1.
- During danger, the single message line is muted.
- Fixed reserves take 36–67.5% of phone height (`layout.ts:7-15`).
- The wireframes and mocks are listed in §9.2.

| ID | Change (sources) | Why / evidence | Effort | Impact | Depends on |
|---|---|---|---|---|---|
| E1a | Interim plates: CSS tokens; 85% plates on existing containers; 18–20 px values at widths ≥900 px (HUD-P1, part). **Sign-off** | 64 of 150 texts below 4.5:1 | S–M | High | — |
| E1b | UI foundation: two OFL typefaces, icons, `--ui-scale`, full type scale, high contrast in every layer (HUD-P1, MENU-P3). **Sign-off** | 176 unique colours | M–L | High | E1a, H6 |
| E2 | Notice queue: priority lanes, minimum display times, a Recent list (HUD-P3) | "Hold full" gets lost | M | High | H6 |
| E3 | World-space DOM layer: lander beacon at any depth, target beacon, clamped labels, popups (HUD-P4, P12) | Pointer vanishes below 72–126 m | M | High | E1b, B3, H4a |
| E4 | Measured safe area; per-device layouts; objective chip; tool dock; cargo pips (HUD-P5–P7, P11). **Dev.** reward line moves into a drawer; tool icons | 63 first-frame words | L | High | E1b, E3 |
| E5 | Rig-anchored, input-aware cues of ≤4 words (HUD-P8) | A 17-word card in a 0.75 s window | S | Medium | E2, H4a, A5a |
| E6 | Depth rail (HUD-P10) | Depth is only a number | M | Medium | B3, E4 |

**E1a spec.** CSS only; phones keep today's sizes until E4.

*Acceptance:*
- all HUD text ≥4.5:1 on the six worst scenes;
- phone clear rows do not fall below the T8 baseline.

**E2 spec.** `notices.ts` defines four priorities:
- P0, critical: shown while the condition holds;
- P1, hazard: ≥2 s, shown even during danger;
- P2, progress: ≥2.5 s;
- P3, info: dropped when stale.

*Acceptance:*
- "Hold full · 7/7" shows for ≥2.5 s;
- the cold card shows at 2.2 L;
- the 25/15/8% texts appear.

**E4 spec.** `cameraSafeArea(rects)` reads the HUD boxes, and the portrait top band is ≤150 px.

*Acceptance:*
- T8's P2 goals pass;
- no HUD box covers the rig;
- layouts match the mocks at 1440×900, 393×851 and 844×390.

### 4.6 F: Menus, terminal and navigation

**Diagnosis (MENU-F1–F16).**
- "Start a new campaign" puts the old save in the single backup slot, which every write replaces (`persistence.ts:326`). The next autosave therefore erases it.
- The gamepad triggers only interact, map and pause (`input.ts:287-308`).
- Returning players boot into a 279-word pause page.
- Transactions rebuild the terminal with `innerHTML` (`main.ts:942-1286`), which drops focus.
- 75–77% of menu words are ≤12 px, against the pinned 14–16 px.

| ID | Change (sources) | Why / evidence | Effort | Impact | Depends on |
|---|---|---|---|---|---|
| F1 | Archive the outgoing campaign (keep 3, restorable); 300 ms repeat guard; full-width travel button; gamepad stopgap (D-pad focus, A, B) (MENU-P1, P2). **Dev.** documented save UI | Old campaign lost; 60 × 80 px travel button (d13c) | M–L | High | — |
| F2a | Front door in current styles: Continue with a save card, New expedition (archives the old one), Settings (MENU-P4, part). **Dev.** documented save UI | Game boots into the pause page | S–M | High | F1 |
| F2b | Title: wordmark, key art, sound chip; Deploy pans from the lander to the rig (MENU-P4, GFX-P10, FTUE-P7). **Sign-off** | One button that overlaps the title (d01) | M | High | E1b, C1, H4a |
| F3 | Terminal as Trade / Workshop / Construction: rig preview, stat bars, locked reasons, Next strip (MENU-P5). **Sign-off** | 523 words, 75.5% ≤12 px | L | High | E1b, H6, A7, B5 |
| F4 | Pause menu in tabs with Save data and a back stack; New campaign moves to the title (MENU-P7, P2). **Dev.** documented save UI | 279 words | L | Medium | E1b, F1, F2a |
| F5 | Focus manager, spatial gamepad navigation, hint bar (MENU-P8) | Gamepad play ends at the dock | M | High (gamepad) | F1, H6 |
| F6 | Verb buttons, keep/lose lists, hold-to-confirm, recovery card (MENU-P9) | 7 decisions share "Confirm" | S | Medium | E1b |
| F7 | Star map and travel sequence (MENU-P10) | Planets drawn in CSS | M | Medium | E1b, C4 |
| F8 | Primary and secondary keys, reset, gamepad remap (MENU-P11) | Rebinding drops both defaults | M | Medium | F4 |

**F1 spec.** `CampaignBackend.commit(expected, current, backup, archive?)` (`persistence.ts:25-33`) writes `archive:<ISO>` and prunes to three archives, all in one IndexedDB transaction.

*Acceptance:*
- after a new campaign and 60 s of play, the old seed restores;
- an aborted transaction changes nothing;
- holding Enter at the lander keeps the terminal open;
- a fake gamepad can sell, buy and undock.

**F3 spec.** `ui/terminal/{trade,workshop,construction}.ts` replace `renderDock`.

*Acceptance:*
- each tab fits without scrolling at 1440×900, with ≤60 body words;
- every upgrade shows numbers and a bar;
- the first dock completes from the Next strip alone.

### 4.7 G: World and content variety

**Diagnosis (WORLD-F1–F14).** Both worlds share one skeleton:
- a six-column soil or ice corridor holds every objective (`world.ts:58`, `:274`);
- caves sit on a fixed row ladder;
- rock is evenly dithered;
- hazards are fixed (`frontier.ts:125-134`).

A W01 descent that follows the locator discovers 7.8% of the world and sees no cave or hazard.

| ID | Change (sources) | Why / evidence | Effort | Impact | Depends on |
|---|---|---|---|---|---|
| G1 | Original W01 mineral names and values; names looked up by item id (WORLD-P7). **Dev.** pinned `ore_names`, `ore_values` | Both copy the reference | S–M | Medium | H2, H8 |
| G2 | One-column route with a feature touching it in every W01 band, in generator v2 (WORLD-P1) | Corridor holds no rock or air on 200/200 seeds | M | High | H2 |
| G3 | Four bands per world as data: material, cave style, hazard role, signature site (WORLD-P4). **Dev.** new materials and hazards | Rock is 8.6–10.3% in every band | L | High | H3, G2, D6 |
| G4 | Set pieces, mission rooms, 6–10 field logs per world (WORLD-P5, P9) | No lore | L | High | G3 |
| G5 | Named relic in a deep site, with an anomaly ping (WORLD-P6). **Dev.** relic variants | Relic seen on 4.5% of seeds | M | Medium | A1, G4 |
| G6 | Per-seed hazards that guard rewards (WORLD-P8) | Same three shelves on every seed | M | Medium | G3, C6, H2 |
| G7 | Hollow-knock hints; rare pockets every 50 m (WORLD-P11, P12) | Hidden air gives no hint | M | Medium | G2 |
| G8 | Claim map and waypoints (WORLD-P10) | No map | M | Medium | G4 |
| G9 | Tool-sealed caches; events after M3 (WORLD-P13). **Dev.** later tools on earlier worlds | Guidance stops after departure | L | Medium | G4, A8 |

**G1 spec.** The owner picks names; WORLD-P7 suggests Slag iron, Rust copper, Shard silver and Core crown. The candidate values are 28/53/120/400 CR:
- none matches a reference value;
- the weighted mean stays exactly 47.5 CR;
- O1 and O2 fall by 7% and 12%, while O3 and O4 rise by 20% and 60%;
- the seams keep their totals: A = 5 × O1 + 2 × O3 = 380, and B = O1 + 4 × O2 + 2 × O3 = 480.

The critique's 22/58/140/400 cannot make 480 from 7 packages. Packages store their names (`world.ts:113-131`), so display names come from `names.ts`, and schema 3 rewrites the stored names. *Acceptance:* no reference name appears in the UI or in exports, and old saves show the new names.

**G2 and H3 spec.** In generator v2, a one-cell route at W01 column 20 replaces `protectedColumn`. It ships with A1, A3 and A9 in one version bump. `ensureRouteFeature(band)` extends a cave or stamps a pocket, and no shelf sits beside the route (pinned). H3 later stages both generators, reproducing v2 exactly, then adds W02's route.

*Acceptance (200 seeds):*
- the route is never air or rock, except at the plate;
- T6 is met;
- no invalid seeds;
- v1 seeds reproduce.

### 4.8 H: Enablers

**Diagnosis.**
- **Unmaintained tooling.** The review's harness, fixtures and capture scripts exist only as an archive in `docs/improvement-plan/work/`, which no check runs, and CI runs only on pushes to main.
- **Balance is locked.** `npm run build` checks fees, prices, W02 bulk and route totals against v0.1 (`check-campaign-data.mjs:192-256`), so any balance change fails the deploy.
- **Strict decoding.** `decodeCampaign` rejects other versions (`model.ts:1243-1250`), packages from other balance versions (`:1369-1392`) and tiles above 3 (`:1360`). It reads a missing field as "incomplete" (`:1632-1634`), and the save then opens protected.
- **Mixed coordinates.** `scene.ts` compares DOM rectangles with canvas pixels (`:831`, `:978-989`, `:1954`).
- **Inkscape dependency.** The W02 build needs Inkscape, which is absent.

| ID | Change (sources) | Why / evidence | Effort | Impact | Depends on |
|---|---|---|---|---|---|
| H0 | Promote the archived fixtures and the capture, contrast, performance and first-session scripts into `tests/fixtures/` and `scripts/`; honour `CHROMIUM_PATH`; PR workflow and nightly runs | Gates rely on archived, unmaintained scripts | M | High | — |
| H1 | Pacing harness with calibration and per-phase guardrails (PROG-P5) | Pacing is unchecked | M | High | H0 |
| H2 | Schema 3: versions per world and per package, per-world tile ranges, defaults and validators for new fields, `migrate(v2→v3)` | Any version bump makes saves "unsupported" | M | High | H0 |
| H3 | Staged generator; content metrics (WORLD-P3) | W02 copies W01's skeleton | M | High | H2, G2 |
| H4a | View transform: split `update()` with no visual change; one View object; settings binding; frame-target API | 7 items change the world-to-screen mapping | M–L | High | H0 |
| H4 | Retained renderer: dirty-cell layers, multi-page atlases, render and memory budgets (GFX-P4) | 35.9 ms p95 JS | L | High | H4a, H5b |
| H5a | Rasterize W02 art with Chromium, like W01 | 8 sources match within 0.49 levels | S | Medium | — |
| H5b | @2x/@3x pages, trimmed packing, seam and contrast checks, visual baselines (GFX-P13). **Dev.** untrimmed-frames rule | No resolution-aware art | M–L | Medium | H5a |
| H6 | UI modules with a keyed DOM patcher, stable test hooks, smoke-test migration (MENU-P12) | Dock re-renders after every save (`main.ts:1401`) | L | High | H0 |
| H7 | Feel and HUD bounds; `?renderer=canvas` smoke test; offline audio render (FEEL-P11, HUD-P13) | Canvas is never tested | M | Medium | H0, H4a |
| H8 | Design data v0.2, selected by `BALANCE_VERSION`; deploy filter `design/**`; dev-only balance switch | The build rejects every A3–A5b value | S–M | High | H2 |

**H0 spec.**
- Fixtures go in `tests/fixtures/` and scripts in `scripts/`.
- Each PR runs unit tests, the build, a pacing subset under 2 minutes, and smoke tests in Chrome.
- 100-seed runs happen nightly.
- Performance budgets stay advisory on shared runners.

*Acceptance:* every Phase 0 gate number comes from a committed script.

**H1 spec.** Move the audit simulator (`work/progression/sim.ts`) to `tests/pacing`.
- **P1 guardrails:** T4 and T5 for W01; the A4a and A9 capability tests; the one-impact opening; A1's income floors.
- **P3 adds:** W02's T4 and T5; W02 arrival income ≥1.25× the W01 end rate; the steam reserve rescuing a 0 L event at 400 m.
- **Calibration** fails on more than 10% drift.

**H2 spec.** Decode accepts every known version, migrates v2 to v3 next to the schema-1 upgrade (`model.ts:1625`), and never rewrites stored terrain or values. Defaults for new fields:

| Field | Default | Item |
|---|---|---|
| `towsUsed` | [] | A2 |
| `volatileTraining` | 0 | A5a |
| `pressureSeams` | [] | A9 |
| `vehicle.reserve` | 0 | A4b |
| contracts, records, waypoints, caches | empty | A6, A8, G8, G9 |
| relic ids | `<world>-J<n>` | G5 |
| `world.hazards` | today's W02 constants | G6 |

*Acceptance:* both fixtures load and play; a save with no new fields loads; a v1 save can travel to a new W02; export and import round-trip.

**H4a spec.**
- Split `update()` (`scene.ts:860` onward, ≈1,150 lines) into render modules, with SSIM ≥0.98 against today's output.
- One `View` object (CSS size, dpr, tile, scroll, `worldToScreen`, `screenToWorld`) serves the scene, pointer mapping (`scene.ts:261-265`), DOM comparisons and the camera.
- Canvas data attributes expose the View, so smoke tests stop recomputing layout (`campaign-smoke.mjs:461-466`).
- Changing a setting marks retained layers dirty.

*Acceptance:* SSIM parity, and toggling High contrast changes canvas edges within one frame.

**H6 spec.** *Acceptance:*
- `main.ts` under 600 lines;
- no `innerHTML` on containers that hold focusable controls;
- focus and scroll survive transactions;
- stable hooks for the 47 `#campaign-*` ids;
- all 107 unit tests and smoke tests pass, with 2–3 days budgeted for migrating the smoke tests.

**H8 spec.** Add `design/v0.2/`, or keep v0.1 plus an overlay of approved deviations. `check-campaign-data.mjs` loads the matching version and recomputes budgets and route totals. A test asserts that W01 has 400 deposits. *Acceptance:* the build passes on v0.2 and fails on any mismatch.

### 4.9 Merged items and resolved conflicts

- **Merged:** return estimates (PROG-P2a, FTUE-P3, HUD-P2) into B3; first-failure forgiveness (FTUE-P1, PROG-P2b) into A2; messages into E2; shaft entry into B2; mouse into C8; bay assist into C5a; labels into E3; duplicates into E1a/E1b, C4, F2a/F2b, C7a/C7b and A1 + G5.
- **Fees:** PROG-P3's 250/900/1,600 is replaced by 200/600/1,000, which keeps the gate purchase affordable and novice gaps ≤8 min without contracts.
- **Fall damage:** threshold above the fall cap; height-based damage is OD3.
- **Relic absence:** the code rolls 25% (samples 26–30%); PROG's 38–40% does not reproduce.

### 4.10 Acceptance for items without a spec

| Item | Acceptance (source) |
|---|---|
| B1 | The three warning texts appear; Unload & sell reports both actions; undocking below 50% offers a refuel (FTUE-P2) |
| B2 | Shaft entry works at ±0.45 tile (P0 gate); a side cut without footing shows a hint |
| B4 | A script that only follows the tracker buys its first upgrade after trip 2, within ≤35 s active (FTUE-P5) |
| C2 | ≥6 debris particles at 50% of a soil cut; ≤150 particles on desktop, ≤75 on touch, 0 with reduced motion; correct on Canvas (FEEL-P3) |
| C3 | Fog at spawn ≤25% at 1440×900 and 393×851 (now 43% and 41%); fades ≤200 ms; no zoom with reduced motion (FEEL-P4) |
| D2 | Stone vs soil ΔE ≥12; High contrast changes canvas edges |
| D3b, H4 | SSIM ≥0.98; p95 JS ≤12 ms at 4× throttle; ≤12 draw calls; overdraw ≤3 screens; T12 (GFX-P3, P4) |
| D5 | Ore vs terrain ΔE ≥30 and ΔL\* ≥15; tiers distinct in grayscale; new players name ores correctly in ≥90% of trials (GFX-P7) |
| E3 | Beacon visible at 200 m on all four form factors, within ±10 m; no label outside the viewport (HUD-P4) |
| F2a, F2b, F4–F6 | Returning players land on Continue; screens match the approved mocks; T9's gamepad-only flow passes |
| G3, G4 | Each band's signature feature on ≥95% of seeds; W01's largest cave ≥40 cells on ≥90%; ≥4 sites in W01 and ≥6 in W02, all reachable (WORLD-P4, P5) |
| A4b, A5b | H1's P3 guardrails |

## 5. Roadmap

Work runs in two tracks. **Track A** covers systems, economy, UI flows and content. **Track B** covers rendering, art, feedback and UI architecture. One developer runs the tracks in sequence; two developers run them in parallel. Durations use day midpoints and exclude a 15% contingency.

| Phase | Track A, in order | Track B, in order | Dev-weeks | Calendar weeks (two devs) |
|---|---|---|---|---|
| 0: Quick wins and foundations | H0, A2, B1, B2, F1 (13 d) | H5a, D9, E1a, D1, D2, D0 (11 d) | 4.8 | 2.6 |
| 1: Core loop and first hour | H2, H8, H1, B3; generator v2 / balance 0.2 (A1, G2, A3, A9, G1); A4a, A7, B4, A5a, C5a, C8, F2a (35 d) | H4a, D3a, C1, H6, H7, E2, C2, C4, C7a, E5, B5 (40 d) | 15.0 | 8.0 |
| 2: Graphics and interface | E1b, E3, E4, C3, F2b, F3, H7 (HUD), H3 (33 d) | H5b, H4, D3b, D4, D5, D6 (W01) (36 d) | 13.8 | 7.2 |
| 3: Content depth and polish | G7, G3 (W01, then W02), G4, G5, G6, A5b, A4b, A8 (32 d) | D6 (W02), C6, A6, C5b, F4, F5, F6 (26 d) | 11.6 | 6.4 |
| **Total** | | | **≈45 (≈52)** | **≈24 (≈28)** |

**Cross-track waits.** B5 waits for B3 and B4. E5 waits for A5a, G6 for C6, G3's W02 half for D6 (W02; G7 goes first to absorb the wait), and A8 for A6. C3 follows E4. Phase 2's critical path is H5b → H4 → D4 → D6: 30 of its 36 days.

**Cut lines (one developer).**
- **6 weeks:** Phase 0, then B3 (on today's bar) and C1.
- **12–13 weeks:** add H2, H8, H1, the generator v2 / balance 0.2 bundle, A4a, A7, B4, E2 (on today's DOM) and B5 (anchored to the HUD).

Neither cut line includes the Phase 2 graphics overhaul.

**Phase 0: Quick wins and foundations.**
*Exit gate:*
- the first tow keeps the haul, and the rig fails no earlier than 290 m;
- warnings appear;
- an old campaign survives a new one;
- shaft entry works at ±0.45 tile;
- one sky body and no seam at the five resolutions;
- stone vs soil ΔE ≥12;
- ≤60% of pixels below luma 40;
- all HUD text ≥4.5:1;
- p95 JS within +10%;
- the owner approves D0 and the mocks;
- CI is green, with tests updated per §7.1.

*The player notices:* a first dive that teaches instead of wiping the haul, and a readable world and HUD.

**Phase 1: Core loop and first hour.**
*Exit gate:*
- W01 meets T2, T4 and T5, and the W01 route meets T6;
- T7's estimate, T8's 40-word cap, T10 on desktop, and T11 are met;
- the Canvas smoke test passes;
- p95 JS stays within +10%;
- 4 of 5 novice playtesters meet T1–T3.

*The player notices:* a coach, a way home, an upgrade after trip 2, deep rock that pays, and sound.

**Phase 2: Graphics and interface.** Midway gate: the owner approves the W01 slice against D0.
*Exit gate:*
- T7's beacon, T8, T10 and T12 are met;
- the terminal fits without scrolling at 1440×900;
- the UI matches the mocks;
- the owner approves the before/after captures.

*The player notices:* a lit, banded world, sharp phones, a real title and a workshop that shows the rig.

**Phase 3: Content depth and polish.**
*Exit gate:*
- W02 meets T4–T6;
- the world audit's thresholds hold;
- W02 arrival income is ≥1.25× the W01 end rate;
- novice ruptures are ≤5 per run;
- T9 is met;
- every event in the feel matrix has a visual and an audio cue.

*The player notices:* something new in every band, fair hazards, a comet that pays, contracts and full gamepad play.

**Backlog (≈10 developer-weeks, with or after W03).** C7b, C8 (analogue part), C9, D7, D8, E6, F7, F8, G8, G9, per-seed mission columns, liveries.

**How this relates to the design pack.**
- **Phase 1 gate.** The pack's Phase 1 gate fails today: the tracker buys on trip 3, the test's "useful" hull earns 0%, and with one impact the 650 CR tank is 18.7 CR short. A2, the 600 CR tank, A4a and B4 restore the gate, and H1 runs it.
- **New worlds.** W03 waits for the content kit (OD12). From W04 on, each world is data for the shared generator and renderer.
- **Validation.** H0, H1, H3 and §8 make the pack's validation gates standing checks.

## 6. Owner decisions needed

| # | Decision | Recommendation | Items | Deviation |
|---|---|---|---|---|
| OD1 | Chapter length | Keep the 45/75 min targets; Phase 1 aims for W01 in 40–50 min (novice) and 10–18 min (skilled) | A1, A3 | None |
| OD2 | Balance 0.2 (W01) and 0.3 (W02) | Approve A1, A3 (plate; fees 200/600/1,000; tank 600 CR), A4a, A9 and the G1 values as one H1-checked set. Reject 900/1,600: it causes 12–22 min gaps and 500 deposits. W02 bulk 1 only in new worlds | A1, A3–A5b, A9, G1 | Pinned fees, price, gear, mass and vertical rules, ore values, bulk, 0.75 s window; new material and hazard |
| OD3 | Opening and recovery | Full 10 L start; one free cargo-keeping tow per world for a disabled rig; voluntary recovery unchanged; no ordinary fall damage | A2, G5 | Research start; pinned recovery rule |
| OD4 | Controls and feel | Shaft magnet, air brake and bay assist in Phase 1; sound on after Deploy; shake off; no cut-cancel | B2, C1, C5a, C6 | None |
| OD5 | Title | Choose an original title before the wordmark. "Motherload", `motherload-remake` and the README's "inspired by Motherload's free edition" tie the game to the reference. "The Deep Frontier" could be the working title | F2b | Branding only |
| OD6 | W01 minerals and inherited values | Rename, and re-value at 28/53/120/400; keep the other values per §4.1, or have H1 re-derive the starting rig | G1, D5 | Pinned `ore_names`, `ore_values` |
| OD7 | Art direction | Approve D0 first. Then: dim textured unexplored rock; four bands per world; off-palette ore hues; no constant colour grade; decide procedural vs commissioned terrain against D0 | D0, D4–D7, D9, F2b | D5 and D6 extend the pinned palettes; the rest is sign-off |
| OD8 | Interface style | Approve the mocks at the Phase 0 gate: 85% plates, Inter and Big Shoulders Display (OFL), chamfered panels | E1a, E1b, F2b, F3, F4 | Sign-off |
| OD9 | HUD details | Reward line in the drawer; tool icons with tooltips; assists on, with a toggle | B3, E4, E6 | Approved objective/reward and tool display |
| OD10 | View and resolution | Restore the 22-column view on large monitors; cap DPR at 2 (3 on desktop); trimmed frames; test a 44 px portrait tile and C3's zoom | C3, D3a, D3b, H5b | Pinned 48 px tile and 22 × 14 view; untrimmed frames |
| OD11 | Menus, saves and audio | Boot to the title; keep 3 archives; New campaign only on the title. Commission or record the most frequent sounds (drill loop per material, pickup tiers, sale); synthesize the rest | F1–F8, C1, C9 | Documented save UI |
| OD12 | Content order | Content kit before W03; an original depth arc for W04 | §5 | Approved Phase 2 order; pinned W04 text |
| OD13 | World content | One-column route; per-seed hazards; new materials; one named relic per world; the owner approves log text | G2–G9, A6 | New materials; relic variants |
| OD14 | Scope | Two developers on the track split, or a §5 cut line | §5 | None |

## 7. Risks and mitigations

| Risk | Evidence | Mitigation |
|---|---|---|
| Saves lock out on a version change | Decode rejects new versions and tile 4; missing fields fail | H2 first in Phase 1; A2 sets its own default; F1 archives saves |
| The build pins balance data | `check-campaign-data.mjs` asserts v0.1 values | H8 before A3; fees that keep 400 deposits |
| Values stamped into packages | `world.ts:113-131` | §7.2 rules; names looked up by id |
| Tests assert today's values | See §7.1 | Update each assertion with its approved rule; stable hooks |
| Art tooling and capacity | W02 needs Inkscape; D6 is XL | H5a in Phase 0; D0 first; W01 slice before scaling |
| Phone performance and memory | 35.9 ms p95 JS; D6 adds ≈27–61 MiB per world | H4 before D3b and D4; band streaming; non-regression checks |
| Canvas fallback | WebGL effects vanish on Canvas | §4.3 rule; H7 smoke test |
| Accessibility regressions | New motion, audio, colour states | Reduced motion never changes timing (pinned); every sound has a visual twin |
| Originality | Ore names and values; title; W04 brief | G1 and OD5 in Phase 1; §4.1 records what is kept and why |
| Balance interactions | A1 cuts rank-0 shallow income by 38% | Income and cadence floors; B4; the Phase 1 playtest |
| Scope creep | ≈45 core plus ≈10 backlog developer-weeks | Phase gates; cut lines; no new worlds before the kit |

**7.1 Test impact (reviewed at each gate).**

| Assertion | Item | New expectation |
|---|---|---|
| Recovery fee and lost cargo (`campaign-model.test.ts:99-127`, `:262-296`; `usability-smoke.mjs:403-426`; `frontier-smoke.mjs:483-498`) | A2 | First tow is free and keeps cargo |
| 6 L opening buys hull (`campaign-model.test.ts:129-160`) | A2, A3 | Buys the 600 CR tank after an impact, with ≥25 CR left |
| Rack needs feet (`:349-370`) | A4a | No prerequisite |
| All-soil corridor; shelf positions (`campaign-world.test.ts:76-83`) | A3, G2 | Plate rows; shelf 2 moved |
| Ore floors (`campaign-world.test.ts:39-49`) | A1, H8 | v0.2 budget |
| `/Ironium.*30/` (`campaign-smoke.mjs:488`, `:895`; `usability-smoke.mjs:261`) | G1 | New names and values |
| 180 ms hold (`pointer.ts:74`) | C8 | Press steers |
| "0.75 seconds" copy (`frontier.ts:111`) | A5a | Training-window copy |
| Asset rules (`check-campaign-assets.mjs:189-364`) | H5b, D3b, D6 | Trim metadata |
| v0.1 equality (`check-campaign-data.mjs:192-256`) | H8 | Data chosen by version |
| 47 `#campaign-*` ids | H6, E2, E4, F2a–F6 | Stable hooks |

**7.2 Migration rules.**
- **New campaigns** get everything.
- **Existing worlds** keep their stored terrain, deposits and package values. A v1 W01 has no plate or seams, and an existing W02 keeps bulk 2.
- **Rules read at use** reach every save. This covers unpaid fees, the brace (owned feet convert), the free tow (`towsUsed` defaults to []) and mineral names looked up by id.
- **W02 hazards** move into world state at today's positions.

## 8. Measurement and playtest protocol

**8.1 Automated checks.**
- **Every PR (H0):** unit tests, build, pacing subset, smoke tests, the Canvas smoke test and B3's accuracy test.
- **Nightly:** 100-seed pacing (T2, T4, T5); 200-seed world metrics (T6); feel and HUD bounds (T7, T8); offline audio render (T11); render and memory budgets (T12 proxy); SSIM baselines (T10); gamepad-only menus (T9); first-session scripts for naive, cautious, mouse and touch players (T1–T3).
- **Each phase exit:** a mid-range Android phone, owned or in a remote lab, checks T12.

**8.2 First-session playtest.**
- *Who:* 5–8 newcomers, at least two on Android phones in portrait; from Phase 3, one with a gamepad.
- *Setup:* a fresh profile, default settings, the exit build, local telemetry, and screen and voice recorded with consent.
- *Brief:* "This is a mining game. Play for 20 minutes however you like and think aloud."
- *Record:* times to first ore, sale, M1 and purchase (and which item); each recovery's depth, cause and cargo lost; dock tab sequences; undocks below 50% energy; missed shaft entries.
- *Debrief:* What were you trying to do? How did you know how far you could go? Did your purchase help? What were your best and worst moments? Would you keep playing?
- *Pass:* 4 of 5 meet T1–T3, no blockers, and the three most common confusions are filed.

**8.3 Capture matrix.**
- *Viewports:* the five resolutions at DPR 1; 1440×900 at DPR 2; 393×851 at DPR 3; 844×390 and 568×320 at DPR 2.
- *States:* title, first frame, 60 m shaft, 180 m stone, revealed deep fixture, flight ceiling, W02 surface and shaft, each energy state, volatile window, cold pocket, terminal tabs, pause, star map, recovery.
- One frozen-clock script captures all of them from both fixtures.

**8.4 Before and after.** At each phase exit:
1. Recapture the baseline set.
2. Build side-by-side sheets.
3. Measure dark-pixel share, HUD contrast, text sizes and word counts.
4. The owner reviews the pairs, with D0 and the mocks alongside from Phase 2.

## 9. Appendix

**9.1 Evidence index.** Paths are relative to `docs/improvement-plan/`. Captures (`*.png`) were local review files and are not committed.

| Problem | Key measurement | Captures | Source |
|---|---|---|---|
| No purchase needed | 5 trips, 0 purchases, 163–165 s, 10/10 seeds | — | PROG-F1 |
| Depth and purchases | 9.8 → 6.9 CR per cell; parts −1.5% to +7.6% | d21, d10-dock-hardware | PROG-F2, PROG-F3 |
| First dive fails | 190 m after 19.4 s, 40/40 seeds | d05 | FTUE-F1 |
| Black void | 86–89% below luma 40; 3% when revealed | d04, d05, d20, l02, d21 | GFX-F1 |
| Sky and terrain | Seam and two planets; stone ΔE 3.1 | `g10-w01-flying-ceiling.png`, `g05-surface-1920x1080.png`, e00 | GFX-F2, GFX-F4 |
| Soft HiDPI | 11% of device pixels at DPR 3 | p02, p03 | GFX-F5 |
| HUD | Worst contrast 1.46:1; 1.4 clear rows | p02, p03, l02, d20 | HUD-F3, HUD-F6 |
| Menus | Terminal 523 words; pause 279 words | d01, d06, d13c, p04, p05 | MENU-F1–F10 |
| Empty route; reference names | 7.8% of the world discovered | d04, d20 | WORLD-F1, WORLD-F14 |
| Opening gate, fees, plate | 631.3 CR after an impact; fee sweep; 136/200 bypass seeds | — | `work/critique-*` re-runs |

**9.2 UI specification index.** The specifications are in the archived reports, and the mocks are shown in the [archive README](improvement-plan/README.md#ui-mocks-for-sign-off). At the Phase 0 gate, consolidate the approved versions into `docs/UI_REDESIGN.md`. Mock paths are relative to `docs/improvement-plan/work/`.

| Items | Specification | Mock |
|---|---|---|
| E1a, E1b | 05-hud §5.4; 06-menus §6.4–6.6 (`menus/mock/tokens.css`) | — |
| E2 | 05-hud §5.7 | — |
| E3, E4 | 05-hud §5.2–5.3 | `hud/shots/mock-{desktop,portrait,landscape}-{normal,critical}.webp` |
| F2a, F2b, F3, F4 | 06-menus §6.3 | `menus/shots/mock-title.webp`, `mock-workshop.webp`, `mock-pause.webp` |
| C4, F7 | MENU-P6, MENU-P10 | `menus/shots/mock-sale.webp`, `mock-map.webp` |
| D0, D6 | 04-graphics §7.2–7.4 | D0 frames (to be produced) |
