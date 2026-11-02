# 02 · First session and playability (empirical playtest)

> **Archived audit report** (2026-11-02, baseline commit `dbf0b1a`), supporting [the improvement plan](../../IMPROVEMENT_PLAN.md). Source paths are relative to the repository root; `work/…`, `shots/…` and `analysis/…` are relative to `docs/improvement-plan/`. Review scripts named `*.test.ts` are archived as `*.audit.ts` (see [the folder README](../README.md)). Screenshots and captures (`*.png`) were local review files and are not committed, except the UI mocks, which are stored as `.webp`.

Auditor key: `first-session`. Scope: what a brand-new player experiences in the first 15 minutes of W01 "Broken asteroid", measured by actually playing the game with native keyboard, mouse and touch input. Economy tuning beyond the opening is owned by the economy auditor; it is referenced only where it shapes the first session.

All scripts, logs and screenshots are under `work/first-session/` (below: `work/`). Screenshot names start with the run id and the game time in seconds (for example `A-naive-020.5s-disabled.png` = run A at 20.5 s). Baseline screenshots supplied with the task are under `shots/`.

---

## 1. Assessment

The opening has a fast hook and good bones. The rig starts directly above a hand-placed seam. Pressing Down, which is the one instruction on the title screen, collects the first ore after 1.5 s. The mission locator then guides you to the beacon, back to the lander and into the dock without a single wrong turn. A cautious player who follows the HUD sells 380 CR and funds the first construction stage after **15.2 s of active play**.

The first session still breaks in four predictable ways:

1. **The most natural first action fails, and the failure is harsh.** Holding Down from the start disables the rig after **19.4–20 s at 190 m**, every time: four seeds, keyboard, mouse and touch. The first warning appears at 110 m. The last safe turnaround is at about 165 m. Recovery takes all 20 CR, destroys the 380 CR haul and returns the rig with **less** energy than the start (5 L vs 6 L). After that, the guidance gives no target for finding ore.
2. **The game never teaches its core risk.** W01's stated learning goal is "return reserve", but the game shows no return cost or point of no return. Its three explanatory energy warnings are dead code: the danger banner always hides them. What remains is a 13 px banner that fires late for divers. It also fires falsely on every first trip that completes the beacon objective: "Low energy · return to the lander" while you are parked at the lander.
3. **Onboarding and the first dock visit are mostly unguided.** No tutorial exists, although the design pack and docs refer to one. The objective tracker is hidden while docked. Funding M1 (Lander tab), refuelling and checking upgrades all have to be discovered. The dock also reopens on whichever tab you used last.
4. **The early progression loses its designed "two trips → first upgrade" beat.** After M1 the tracker sends the player to the 250 m valve. That trip uses 72 % of the stock tank and paid 0–90 CR in our runs, so the first purchase slips to trip 3. The next target, the 400 m antenna, cannot be reached with the stock tank from a fresh shaft (runs dry at 350 m). Through the valve shaft it returns with 0.77 L, and that needs perfect play.

The moments that should feel rewarding are flat as well. The first sale, the first construction and the first upgrade are each a single grey status line, sound is muted by default, and the rig does not visibly change. Several rough edges compound this:

- a lost "Hold full" message;
- a false "Bank your carried packages before selling them" after a mission-only trip;
- a sky-texture seam with a duplicated planet on the very first flight out of the shaft;
- a shaft that only accepts you within ±0.11 tile.

None of this needs new worlds or art pipelines. Most fixes are S/M changes in `model.ts`, `main.ts`, `poi.ts`, `missions.ts` and `scene.ts`. A full starting tank plus a forgiving first rescue (FTUE-P1), together with the messaging and dock fixes (FTUE-P2), remove most of the first-15-minute pain within days. A return-reserve gauge (FTUE-P3) and a lightweight guided first sortie (FTUE-P4) then let the game teach its own loop.

---

## 2. Method and artefacts

- **Build under test:** the local Vite dev server `http://127.0.0.1:5173/?mode=campaign` at commit `dbf0b1a`, served from the repository. Read-only: nothing in `<repo>` was modified.
- **Browser:** Chromium `/opt/pw-browsers/chromium` driven by Playwright with native input. The page clock was frozen with `freeze()` and play was advanced in 150–500 ms steps (mostly 250 ms). After every step the harness read the player-visible HUD from the DOM and logged every change in message, danger banner, tracker, locator, dock prompt, overlay, callout and disabled state. Game time below means **active simulated time since Deploy**; dock screens pause the simulation, so dock UI time is extra.
- **Players (scripts):**
  - `work/playtest-a-naive.mjs`: (a) naive diver who holds Down and ignores everything, then (f) recovery.
  - `work/playtest-a2-warnings.mjs`: the same dive captured at each energy threshold on desktop and portrait.
  - `work/playtest-b-cautious.mjs`: (b)+(e) cautious player who follows the tracker. Trip 1 covers the starter seam, beacon, return, dock, sell, M1 and refuel. Trip 2 follows the tracker to the valve. Trip 3 mines the second seam and buys the first upgrade. The first variant, which forgot to refuel, is preserved as `work/B-cautious-norefuel-log.txt`.
  - `work/playtest-c-mouse.mjs` + `work/diag-mouse-stuck.mjs`: (c) about 40 s of mouse hold-to-steer, inspection clicks and click-to-dock.
  - `work/playtest-d-touch.mjs`: (d) portrait 393×851 (isMobile, hasTouch, DPR 2) with the floating joystick via CDP `Input.dispatchTouchEvent`, tap-to-inspect and tap-to-dock.
  - `work/repro.mjs`: R1 (mission-only unload), R2 (side input while airborne) and R8 (shaft re-entry off-centre).
- **Headless simulation (vitest):**
  - `work/sim.audit.ts` → `work/sim-results.json`: naive dive on seeds 10, 4, 73021 and 999 with 6 L and 10 L starts, per-depth return cost (a drive and a fly autopilot from a cloned state), the cautious two-trip opening, and recovery outcome.
  - `work/sim2.audit.ts` → `work/sim2-results.json`: guided M2 trips with the stock 10 L tank.
  - Run with `cd <repo> && npx vitest run --dir work/`.
- **Logs:** `work/<run>-log.txt` (human-readable, timestamped) and `work/<run>-log.json`.
- **Limitations:** the scripted players are faster and more precise than humans and never hesitate, so real-time durations are longer than the game times below. Each browser run uses a random world seed. The opening (starter seams in columns 20/21, beacon, valve) is fixed, and the headless runs show it is identical across seeds. Audio was not evaluated (muted by default). Physical-device comfort is not established by emulation. The only console error in every run was a 404 for `/favicon.ico` (cosmetic).

---

## 3. Measurements

| # | Measurement | Result | Method / evidence |
|---|---|---|---|
| M1 | Time to first ore (Down held from Deploy) | **1.5 s** browser (0.9 s cut + 0.5 s idle); 0.9 s headless | A-naive-log.txt 1.50 s; sim-results.json `firstOre` |
| M2 | Hold full (7/7) during a straight dive | 7.25 s at **70 m**, 4.0 L left | A-naive-log.txt; sim `holdFull` |
| M3 | Beacon surveyed | 9.25 s at 90 m, 3.4 L left | A-naive-log.txt; sim `beacon` |
| M4 | Danger banner "Low energy" / "Energy critical" | 12.0 s at 110 m / 15.25 s at 140 m | A-naive-log.txt; A2-warn-desktop-log.txt |
| M5 | Rig disabled (naive dive, 6 L start) | **20.0 s at 190 m**, browser. Headless: 19.37 s at 190 m on seeds 10/4/73021/999 (identical) | A-naive-log.txt; sim-results.json `disabledAt` |
| M6 | Last safe turnaround (naive dive) | 160 m (1.11 L vs 0.76 L return). Margin −0.02 L at 170 m. About **5 s after the first warning** | sim-results.json `rows`, `lastSafeTurnaround` |
| M7 | Energy to return to the lander (150 m away) | 0.28 L at 10 m · 0.57 L at 100 m · 0.76 L at 160 m · 0.85 L at 190 m (≈ 0.27 + 0.0305 L per 10 m of depth) | sim-results.json `returnDriveCost` |
| M8 | Recovery after the naive dive | Fee **20 CR (100 % of cash)**. **7 packages / 380 CR destroyed**. Energy **5/10** (start was 6/10). No locator target afterwards ("Mine 3 ore packages and bank them") | A-naive-log.txt 20.5–21.5 s; sim `recovery`; `A-naive-021.5s-after-recovery-world.png` |
| M9 | Naive dive with a full 10 L start | Disabled at 300 m / 32.1 s; last safe turnaround 240 m | sim-results.json `naiveFullTank` |
| M10 | Cautious trip 1 (keyboard), Deploy → docked | **15.2 s**. Arrived with 2.3/10 L; danger banner on since 13.75 s | B-cautious-log.txt |
| M11 | First sale / M1 funded | Both at 15.2 s game time (dock paused). 20 → 400 → 200 CR; refuel 7.7 CR → 192.3 CR | B-cautious-log.txt |
| M12 | Purchasable after trip 1 | **Nothing**. Cheapest unlocked items: feet 400 CR, hull 450 CR | B-cautious-log.txt "Purchasable after trip 1" |
| M13 | Trip 2 following the tracker (valve, 250 m) | 33 s active. Docked with 2.8/10 L (72 % of the tank used). Ore found: 0 CR in run 2, 90 CR in run 1 | B-cautious-log.txt; B-cautious-norefuel-log.txt |
| M14 | First upgrade following the tracker | After **trip 3** (second seam, 480 CR) at **65.95 s** active game time. Bought energy 650 CR, leaving 15 CR | B-cautious-log.txt |
| M15 | First upgrade via the design's two-trip route (seam A, then seam B) | 33.5 s active game time, 672.5 CR after trip 2 | sim-results.json `cautious` |
| M16 | Guided valve trip, headless, from 10 L | Returns with 3.06 L | sim2-results.json `valve` |
| M17 | Antenna (400 m) with the stock 10 L tank | Fresh column: **runs dry at 350 m**. Via the opened valve shaft: returns with **0.77 L** (92 % of the tank, perfect play) | sim2-results.json |
| M18 | Touch portrait trip 1 | Beacon 9.55 s; docked by tapping the lander at **16.65 s**. Joystick centred at the touch point (196,680), knob travel 32 px | D-touch-log.txt |
| M19 | Mouse trip 1 | Drilling by holding below the rig: the rig stayed within 7 px on screen. Flight up-left carried the rig over the lander at the altitude cap and **round the 40-column world** (x 0.64 → 39.39 → 19.39 in 4 s). No dock | C-mouse-log.txt; C2-mouse-diag-log.txt |
| M20 | Shaft re-entry tolerance | Rig must be within ±0.11 tile of the shaft centre. At 0.25 tile off-centre, Down drills the neighbouring column. Keyboard needed 4 fine taps to align | R8-shaft-reentry-log.txt; B-cautious-log.txt line 106 |
| M21 | Danger banner geometry | 243×33 px, 13 px text. Desktop top-centre (y = 60); portrait y = 692, in the joystick/thumb zone | A2-warn-*-log.txt |
| M22 | Energy-warning messages actually displayed | **0 of 3** across runs A, A2, B, C and D (logic makes them unreachable; see F2) | logs + `main.ts:431`, `:877-889` |
| M23 | First-trip inputs (keyboard) | 11 actions: Deploy, hold ↓, hold ↑, hold ←, E, Unload & sell, Lander tab, Fund construction, Service tab, Refuel, Undock. The tab/button steps from Lander tab onwards are not prompted | B-cautious-log.txt |
| M24 | Failures observed | Naive diver: 1 (A). Cautious player who forgot to refuel: 1 (disabled at 61.55 s, 49 m, 480 CR aboard; B-norefuel). Mouse: 1 (overshoot then energy ran out at 110 m). Cautious player who refuelled: 0. Touch: 0 | logs |

**Rough real-time estimate (clearly an estimate, not measured):** a novice moves at perhaps half the scripted efficiency and spends 30–60 s per dock visit reading tabs. On that basis the guided route reaches its first upgrade after about 4–6 minutes and three dock visits. One early energy failure pushes the first upgrade to roughly 8–12 minutes, because the lost 380 CR forces at least two extra trips into unseeded terrain.

---

## 4. Friction logs (curated, timestamped game time)

### A · Naive diver, keyboard, 1440×900 (`work/A-naive-log.txt`)
```
 0.00  Deploy. Tracker: "01/03 Survey the wreck · ○Survey beacon 100 m · ○Bank ore 0/3 · ○Construction 20/200 CR",
       locator "↓ Wreck survey beacon 99 m Tracking", next "Approach the wreck beacon to survey".
       (No prompt to press ↓; the model's first instruction is suppressed.)
 1.50  First ore (+ Ironium, 12 px popup). HAUL 30 CR.
 2.50  "Wreck survey beacon · Signal nearby…"
 7.25  Cargo 7/7 — but the message shown is "Wreck survey beacon · Very close…"; "Hold full" never appears.  [F9]
 9.25  "Beacon surveyed · Return to the lander"; locator flips to "↖ Salvage lander 175 m".
11.25  "Hold full: Bronzium remains here (1 bulk)…"
12.00  Danger banner "Low energy · return to the lander" (13 px, top centre). No "Reserve at 25%" message.  [F2]
15.25  "Energy critical · return to the lander".
20.00  Disabled at 190 m, 7/7 cargo (380 CR). Card: "Energy depleted · Cost 20 CR · Energy 5/10 L…"
20.50  Confirm → recovery. Paused menu "Expedition restored · paused". CR 0, energy 5.0/10, cargo 0.
21.50  At lander. Next: "Mine 3 ore packages and bank them". No locator. The seam 150 m away is not indicated.
22–24  Natural follow-up: pressing ↓ at the lander drills a 30 m hole beside the bay (4.1 L left).
```
### B · Cautious player following the HUD, keyboard (`work/B-cautious-log.txt`)
```
 9.25  Beacon surveyed at 90 m with 7/7 cargo. 12.00 out of the shaft (2.7 L).
13.75  "Low energy · return to the lander" while correctly driving home.  [F2]
15.20  Dock prompt after 1 small correction; E opens Service tab. Unload & sell → "Sold stored cargo for 380 CR." (footer)
       Tracker hidden while docked; nothing points to the Lander tab.  [F5]  Funded M1 on Lander tab. Refuel 7.7 CR.
       Hardware: everything disabled (192.3 CR; cheapest 400/450).  [F6]
15.70  Undock. Next: "Excavate the marked debris", locator "↘ Lander pressure valve 292 m" (standing on the surface).  [F16]
20.70  Aligned with own shaft after 4 fine taps.  [F13]
39.70  Valve secured at 250 m. 48.65 docked with 2.8/10 L. Dock opened on the *Attachments* tab.  [F5]
       Unload & sell → "Bank your carried packages before selling them." (the valve *was* banked).  [F10]
53.30  Trip 3 to Seam B (column 21). 60.05 "Hold full: 7/7 bulk." 65.95 docked, sold 480 CR → 665 CR.
65.95  First purchase possible: energy 650 CR → "Salvaged energy installed." (footer). 15 CR left.  [F7]
```
### B-norefuel · the same player forgets to refuel (`work/B-cautious-norefuel-log.txt`)
```
48.65  Undock with 2.8/10 L and 282 CR: no prompt.  [F11]
52.65  Low-energy banner. 56.55 "Energy critical". 61.55 disabled at 49 m with Seam B's 480 CR aboard.
```
### C · Mouse hold-to-steer (`work/C-mouse-log.txt`, `work/C2-mouse-diag-log.txt`)
```
 0.80  Short click on the ore below the rig → callout "Ironium · 30 CR · 1 bulk" (good).
 2.15  Holding 15 px below the rig does nothing (inside the 20 px minimum). Holding 160 px below drills smoothly.
14.00  Holding above flies out of the shaft. Holding up-left climbs to the altitude cap (y = −5.5) at ~5 tiles/s.
14.90  Sky seam: the backdrop repeats with a hard edge and a second planet.  [F12]
15–21  Passes over the bay while airborne (dock needs landed, |vy| < 1). Lands at x 1.9, continues left,
       wraps 0.64 → 39.39 and drives all the way back to the shaft (x 19.4).  [F17]
       Each short mouse nudge needs ≥ 180 ms before it steers (tap threshold), so fine corrections are coarse.
```
### D · Touch portrait 393×851 (`work/D-touch-log.txt`)
```
 0.80  Tap on ore → callout. 1.05–9.55 joystick held 45 px down from (196,680): drills; beacon at 9.55 s.
 9.55  Message "Beacon surveyed · Return to the lander" renders over the joystick ring.  [F18]
13.30  Danger banner appears at the bottom, inside the thumb zone.  [F18]
13.80  Flying: the same sky seam is visible in portrait.  [F12]
16.65  Tap on the lander → dock (bottom sheet). Sold 380 CR. Banner still says "return to the lander".  [F2]
```

---

## 5. README "Your first expedition" vs what the game teaches

| README step | What the game actually shows | Gap |
|---|---|---|
| 1. "Drill the starter vein, collect packages and survey the wreck beacon at 100 m…" | The tracker says "Survey beacon · 100 m" and the locator says "↓ 99 m". The word "seam"/"vein" never appears: the model's opening line "Mine the marked seam…" (`model.ts:101-102`) is filtered out by `presentationMessage` (`main.ts:413-417`). The seams are not visually marked (no seam code in `scene.ts`) | Partial. The beacon is guided; the seam is not |
| 2. "Fly back through your shaft and follow the lander marker. Park in its illuminated bay, then press E…" | The game shows "Return to the lander", "↖ Salvage lander 175 m", a 12 px "← LANDER · 150 m" edge label, and "Land in the illuminated bay to dock" within 30 m, then the "E Dock"/"TAP Dock" prompt | Good. The lander itself was never shown before |
| 3. "Unload & sell… Refuel, repair and compare upgrades in the terminal…" | The terminal opens on Service with a primary Unload & sell (first visit only; later visits reopen the last tab). No refuel or upgrade prompt. The tracker is hidden while docked | Partial |
| 4. "Complete and fund the three stages… The live checklist tracks… the next action" | The checklist works in the field. Inside the dock, where funding happens, it is hidden (`style.css:1230-1237`) | Partial |
| 5. "Rank-1 hardware opens after M1…" | The Hardware tab shows "Blueprint: complete Survey the wreck". After M1 nothing is affordable (192 CR) | Accurate, but no next earning step is suggested |
| Controls: "Side drilling needs a ledge"; "Short clicks/taps inspect…" | Only in the pause menu's Pilot controls text (`main.ts:194`) and README. The title teaches only "Up flies · Down drills" (`main.ts:193`) | Not taught in play |
| (not in README) Energy drains even when idle underground (0.063 L/s, `model.ts:411`); drilling costs 0.315 L/s; a full hold leaves ore behind; recovery destroys carried cargo | Learned only by failure | Missing |

---

## 6. Strengths

- **Instant hook.** The seam sits directly under the spawn; the first ore arrives 1.5 s after Deploy and HAUL counts up. The rig is never idle in the first minute.
- **The mission locator works.** Every scripted player (keyboard, mouse, touch) found the beacon and the lander using only the HUD: arrow, distance and Tracking/Nearby/Very close bands, plus "Land in the illuminated bay to dock".
- **Touch works in emulation.** The floating joystick appears exactly at the touch point, has a 32 px knob clamp and returns cleanly to neutral. Tap-to-inspect and tap-to-dock both work (D-touch-log).
- **Mouse drilling is stable.** The camera keeps the rig within about 7 px on screen, so a held pointer keeps steering in the same direction.
- **Safety UI is honest.** Services preview exact costs ("2.34 → 10/10 L. Cost 7.7 CR"). Recovery previews fee, cargo loss and resulting conditions. No soft-lock or page error occurred in any run.
- **Inspection callouts** ("Ironium · 30 CR · 1 bulk") are a good teaching hook to build on.
- **The opening is deterministic.** The starter seams, beacon and valve produced identical timings on four seeds, which makes onboarding tunable and testable.

---

## 7. Findings

Severity order: critical, then major, moderate and minor.

### FTUE-F1 · Critical · The natural first action ends in failure after 20 s, and recovery erases the whole first haul
**Evidence**
- Holding Down from Deploy (the title's only gameplay instruction, `main.ts:193`) disabled the rig at **190 m after 20.0 s** in the browser (`work/A-naive-log.txt`, `A-naive-020.5s-disabled.png`). Headless results were identical: **19.37 s on all four seeds** (`work/sim-results.json`).
- Start energy is 6 of 10 L (`model.ts:64`). Drilling burns 0.252 + 0.063 L/s (`model.ts:405-415`).
- Recovery (`model.ts:1076-1146`) charged **20 CR = all cash**, set the 7 carried packages (380 CR) to `lost`, and returned the rig with **5/10 L, less than the 6 L start**.
- Afterwards the tracker said "Mine 3 ore packages and bank them" with **no locator target** (`A-naive-021.5s-after-recovery-world.png`).

**Player impact:** the first lesson is total loss. The next attempt starts worse than the first, and the one-time 380 CR seam is gone, which delays the first upgrade by at least two extra trips.

### FTUE-F2 · Major · Energy warnings are tied to a fixed share of the tank, their explanatory text is unreachable, and they fire falsely on good play
**Evidence**
- The three warning messages ("Reserve at 25% · check your return route…", "Energy low · return through your cleared route.", "Emergency reserve · …request recovery in Menu.") are sent through `showMessage` (`main.ts:877-889`).
- `showMessage` returns early whenever `data-campaign-danger` is true (`main.ts:431`). `syncSafety` sets that flag at the same ≤25 % threshold just before (`main.ts:365-381`). The messages are therefore never shown: **0 occurrences** in runs A, A2, B, C and D.
- What players get is a 13 px, 243×33 px banner (`style.css:1784-1802`; A2 logs) that also hides every routine message (`style.css:1803-1805`). The audio cue (`main.ts:887`) is silent by default (`audio.ts:14 muted = true`).
- Because the thresholds are a share of capacity, not a share of return cost, **every first trip that completes the beacon objective** triggers "Low energy · return to the lander" while driving home: 13.75 s keyboard, 13.30 s touch, 15.0 s mouse. The rig reaches the bay with 2.2–2.5 L, which is ≤ 25 %; headless the opening is identical on all seeds. The banner stays up while parked and docked, partly hidden behind the dock panel (`B-norefuel-015.2s-trip1-dock-service.png` shows "Low energy · return to the lan…" clipped; `D-touch-016.4s-touch-at-lander.png`).

**Player impact:** the warnings come too late to explain anything to a diver and too early for a correct player. Players learn to ignore them.

### FTUE-F3 · Major · The game never shows return cost or the point of no return, although that is W01's design goal
**Evidence**
- The W01 entry in `design/v0.1/motherload-balance-v01.json` says: "mechanic": "Learn controlled digging, cargo limits and **return reserve**".
- No return estimate exists in `model.ts`, `main.ts` or `scene.ts` (the only energy UI is the bar and the 25/15/8 % bands).
- Measured return costs are small and non-obvious: 0.28–0.85 L from 10–190 m (M7). The safe-turnaround window closes about 5 s after the first warning (M6).
- `docs/DESIGN_PACK_IMPLEMENTATION.md:174` itself flags the short early energy budget ("Starting energy is six") as a risk to measure.

**Player impact:** players cannot plan a trip, and failure feels arbitrary rather than like a skill to master.

### FTUE-F4 · Major · There is no onboarding: the title's two lines are the whole tutorial
**Evidence**
- The title gives only "Touch: press to place your joystick, then drag. Up flies · Down drills · Mouse or Arrows / WASD" (`main.ts:193`).
- The model's opening instruction "Mine the marked seam, then bank your haul at the lander" (`model.ts:101-102`) is deliberately filtered out (`main.ts:413-417`).
- The design pack lists the auger as "Free after tutorial" (design JSON, W01-R1). `docs/CAMPAIGN_W01.md:15` says the auger is "installed for the opening tutorial". No tutorial code exists: `grep -ri tutorial src/` returns nothing.
- Rules learned only from README or the pause menu (`main.ts:194`), or nowhere:
  - side drilling needs a ledge;
  - taps/clicks inspect;
  - energy drains even when idle underground (`model.ts:411`);
  - a full hold leaves ore behind;
  - recovery destroys carried cargo;
  - "bank" vs "sell";
  - M1 is funded on the Lander tab.
- The first frame shows about 17 separate text elements: HUD, 3-task tracker, locator, next, unlock line, tool slot, edge label (`A-naive-000.5s-first-frame.png`, `shots/d02-surface-start.png`).

**Player impact:** discovery happens by failure (F1). The dense first frame does not say which of its elements matter now.

### FTUE-F5 · Major · The first dock visit is unguided, and the terminal reopens on the last tab used
**Evidence**
- While any overlay is open, CSS hides the objective tracker and messages (`style.css:1230-1237`). After Unload & sell, the required next step "Lander → Fund construction" is therefore invisible. Refuelling is never suggested.
- The dock remembers `dockTab` (`main.ts:129`, `:1732`) and only resets it after travel (`main.ts:1780`). On trip 2 it opened on **Attachments** with mission cargo aboard (`B-cautious-log.txt:184`, `B-cautious-048.7s-trip2-dock-opened.png`).
- Trip 1 requires 11 inputs. The steps after Unload & sell (Lander tab, Fund construction, Service tab, Refuel) are not prompted (M23).

**Player impact:** players can leave without funding M1 or refuelling. B-norefuel shows the knock-on failure (F11).

### FTUE-F6 · Major · After M1 the tracker routes away from the designed two-trip first upgrade and towards a target the stock tank barely reaches
**Evidence**
- Design: "Two novice opening trips fund a useful purchase with service reserve" (`docs/DESIGN_PACK_IMPLEMENTATION.md:99`, `:155`). The headless two-trip route (seam A then seam B) reaches 672.5 CR after 33.5 s (M15).
- In play, the post-M1 tracker shows "Excavate the marked debris" and "↘ Lander pressure valve 292 m" (`missions.ts:94-97`, `poi.ts:401-404`). The valve trip used 72 % of the 10 L tank and paid 0 CR (run 2) or 90 CR (run 1) in ore. The first purchase came only after trip 3, at **65.95 s** (B log).
- The next tracker target, the 400 m antenna, **runs dry at 350 m** from a fresh column. Via the valve shaft it returns with **0.77 L** with perfect play (`work/sim2-results.json`).

**Player impact:** the first upgrade, the main early goal, arrives a full trip late. The guidance then sends the player on a trip that only a perfect run survives without an energy upgrade nobody recommends.

### FTUE-F7 · Moderate · The payoff moments (first sale, first construction, first upgrade) are flat
**Evidence**
- First sale: a footer line "Sold stored cargo for 380 CR." (`B-cautious-015.2s-trip1-after-sell.png`).
- M1: "M1 complete. Construction installed and new blueprints unlocked." (`…trip1-after-m1.png`).
- First upgrade: "Salvaged energy installed." (`B-cautious-00066s-trip3-first-upgrade.png`). The rig looks identical afterwards (`B-cautious-066.8s-after-first-upgrade-world.png`).
- Ore pickup is a 12 px "+ Ironium" label (`A-naive-001.5s-first-ore.png`; label style `scene.ts:464-490`).
- Sound starts muted (`audio.ts:14`), so the "pickup", "build" and "purchase" cues (`main.ts:1497-1509`) are silent for first-time players.

**Player impact:** this bears directly on the owner's "game quality" complaint. The loop's rewards register as bookkeeping, not as progress.

### FTUE-F8 · Moderate · The start hides the lander, and its 12 px edge label overlaps the title
**Evidence**
- Spawn is column 20.5 and the dock is column 5.5, i.e. 150 m apart (`config.ts:350-351`).
- Tile sizes are 65 px on 1440 px desktop (±11 tiles visible) and 48 px in portrait (±4 tiles) (`layout.ts:2-5`). The lander is therefore off-screen at Deploy on every layout (`shots/d02-surface-start.png`, `shots/p02-surface.png`).
- The only pointer to it is a 12 px "← LANDER · 150 m" label (`scene.ts:1300-1309`). On the title screen it overlaps "Up flies · Down drills" in portrait (`shots/p01-title.png`; crop `work/shots/crop-p01-title-label.png`) and collides with the "BROKEN ASTEROID / Recover the core" block on desktop (`shots/d01-title.png`; crop `work/shots/crop-d01-title-label.png`).

**Player impact:** the player never sees home before they need it, and their first impression contains a text collision.

### FTUE-F9 · Moderate · The "Hold full" message is lost on every first trip
**Evidence**
- `model.ts:752` sets "Hold full: 7/7 bulk. Return to the lander to bank your haul." when the 7th starter package is collected at 70 m.
- In the same tick the beacon enters the 30 m "close" band (`poi.ts:64-69`). `syncMissionSignal` calls `showMessage` with "Wreck survey beacon · Very close…" (`main.ts:478-488`), replacing it.
- A-naive-log at 7.25 s shows cargo 7/7 and only the proximity message (`A-naive-007.3s-hold-full.png`). This is deterministic: the seam always fills at 70 m, which is 29 m from the beacon.

**Player impact:** the cargo limit is not taught at the moment it matters. Ore is then left behind silently until 110 m.

### FTUE-F10 · Moderate · Unload & sell reports a false error after a mission-only trip
**Evidence**
- The `bank-sell` command runs `bank()` then `sell()` (`main.ts:1654-1661`). With no ordinary packages, `sell()` overwrites the bank result with "Bank your carried packages before selling them." (`model.ts:839`).
- Reproduced natively on trip 2 (`B-cautious-log.txt:187`) and with a fixture (`work/R1-unload-mission-only-log.txt`, `R1-unload-mission-only-000.8s-unload-mission-only.png`). In both cases the tracker then shows "✓ Pressure valve · banked".

**Player impact:** the first mission success reads as an error.

### FTUE-F11 · Moderate · The game lets you undock with a nearly empty tank without a word
**Evidence**
- `closeOverlay()` (`main.ts:509-529`) has no departure check.
- In B-norefuel the player undocked at 48.65 s with 2.8/10 L and 282 CR. The banner appeared 4 s later, and the rig was disabled at 61.55 s at 49 m with Seam B's 480 CR aboard (`work/B-cautious-norefuel-log.txt`, `B-norefuel-060.6s-trip3-hold.png`).
- The banner text ignores `atDock` (`main.ts:372-378`).

**Player impact:** an avoidable second failure that costs the one-time 480 CR seam.

### FTUE-F12 · Moderate · The sky backdrop tiles vertically on the first flight out of the shaft (duplicate planet, hard seam)
**Evidence**
- `scene.ts:1063` sizes the sky TileSprite to `min(height, surfaceY)` and only scrolls `tilePositionX`. The texture `assets/campaign/generated/w01-sky.png` is 1024×512, so once the surface line is more than 512 px down the screen the sky repeats.
- Visible in `C2-mouse-diag-014.9s-upleft-end.png` (seam at y ≈ 510, second planet cut off) and in portrait in `D-touch-013.8s-touch-flying.png`.

**Player impact:** a visible rendering error in the first 15 seconds of flight. It undermines "crisp illustrated art" (overlaps the visual auditor; listed because every first trip hits it).

### FTUE-F13 · Moderate · Re-entering your own shaft needs ±0.11-tile precision; near-misses drill a new column
**Evidence**
- In `model.ts:430-445`, when the column under the rig's centre is open, Down drills the nearest *solid* support column instead of letting the rig drop.
- R8: a rig at x = 20.75 over the open shaft in column 20 drilled column 21 and moved to x = 21.5 (`work/R8-shaft-reentry-log.txt`, `R8-shaft-reentry-006.2s-offcentre-after-down.png`).
- The keyboard player needed 4 fine taps to align (B log line 106). Mouse presses only steer after 180 ms (`pointer.ts:74`, `:86`).

**Player impact:** wasted energy and confusing extra holes at the start of every repeat trip.

### FTUE-F14 · Moderate · Early expeditions last 15–35 s of active play against a 2–4 min design target, so the first session is mostly commute and dock UI
**Evidence**
- Measured active durations were trip 1 15.2 s, trip 2 33 s and trip 3 17 s, with three dock sessions in 66 s of play (B log).
- `docs/DESIGN_PACK_IMPLEMENTATION.md:174` proposes 2–4 min early expeditions and notes "ten energy units provide about 32 seconds of continuous underground cutting…".

**Player impact:** the first 15 minutes feel like a staccato of tiny trips and menu visits. Tuning belongs to the economy auditor; FTUE-P1 and FTUE-P5 change it the most.

### FTUE-F15 · Minor · Side drilling gives no feedback when you are airborne or hovering
**Evidence**
- A side cut requires `!controls.up && supported` (`model.ts:430`).
- R2: Up+Right inside the shaft for 0.6 s produced no cut and no message while the rig rose past seven visible wall ores (`R2-ledge-010.6s-hover-right.png`, `work/R2-ledge-log.txt`).
- The rule appears only as one sentence in the pause menu (`main.ts:194`) and the README.

**Player impact:** players conclude that side drilling is broken, and the wall ore they can see is unreachable.

### FTUE-F16 · Minor · Guidance and terminal copy is not distance-aware and leaks internal IDs
**Evidence**
- At the surface 292 m from the valve, "next" reads "Excavate the marked debris" (B log 15.70 s; `poi.ts:401-404` via `main.ts:455-456`).
- Milestone cards show "Unlock **R2** and a surface service dock", "Unlock **R3**…" and "open **W02 and W03**" (`config.ts:466`, `:474`, `:482`; B log "Lander tab"). The "surface service dock" already exists from the start (`docs/CAMPAIGN_W01.md:15`).

**Player impact:** instructions arrive at the wrong moment, and jargon dilutes the story.

### FTUE-F17 · Minor · Flight past the lander is easy to overshoot with mouse or held keys
**Evidence**
- Holding up-left carried the rig at the altitude cap y = −5.5 (`model.ts:570`) at about 5 tiles/s over the bay. Docking requires being landed with |vy| < 1 (`model.ts:211-219`).
- The rig wrapped from x 0.64 to 39.39 and drove back to x 19.39 within 4 s (`work/C2-mouse-diag-log.txt`). There is no braking aid or bay capture.
- Each corrective mouse press is dead for its first 180 ms (`pointer.ts:74`).

**Player impact:** a mouse user who flies home can circle the asteroid and burn reserve. Humans will see the lander, so the risk is moderate, not certain.

### FTUE-F18 · Minor · In portrait, the tracker covers the top quarter, and banners sit in the joystick thumb zone
**Evidence**
- The tracker spans about y 70–205 CSS px over the shaft (`D-touch-009.6s-touch-drilling.png`, `shots/p03-drilling.png`).
- The message is drawn across the joystick ring at 9.55 s (same screenshot). The danger banner sits at y = 692 (`A2-warn-portrait-016.8s-energy-8pct.png`).

**Player impact:** the thumb covers warnings at the moment they matter, and the view of the shaft is reduced.

---

## 8. Proposals (highest priority first)

### FTUE-P1 · Start with a full tank and forgive the first failure (S · high)
Addresses F1, F11, F14.

**What**
1. Start W01 with a **full 10/10 L tank**. On merits:
   - 6 L gives a 19 s dive budget and a 5 s window between the first warning and the point of no return.
   - 10 L moves the failure point to 300 m and the last safe turnaround to 240 m, well past the 100 m first objective (M9).
   - Trip 1 then returns with about 6.3 L, so the "Low energy" banner no longer fires on correct play.
   - The 20 CR start is fine: the first sale (380 CR) arrives within 15 s.
2. **Rescue tow before M1:** until M1 is funded, recovery is free and the tow keeps carried cargo and mission objects (towed to the bay). It shows a one-time coaching card (wireframe in §9).
3. Recovery never returns less energy than the W01 starting value before M1. Today it returns 5 L against a 6 L start; with change 1 this becomes "at least the starting tank".

**Implementation**
- `model.ts:64`: `energy: HARDWARE_LEVELS.energy[0]`.
- `model.ts recover()` (`:1097-1146`): if `!state.progress.completed.includes(1)` (or `stats.recoveries < 1`), set `cost = 0` and skip the `lost` / `source` loops. Keep cargo `carried` and move the vehicle to the dock.
- `recoveryPreview` (`:1076-1095`) mirrors this so the confirm text stays exact.
- `main.ts recoveryCopy()` (`:351-358`) uses tow wording for the first rescue.
- Update `tests/campaign-model.audit.ts` (the recovery tests at lines ~105–127 assert the current fee) and add tests for "pre-M1 tow keeps cargo" and "post-M1 recovery unchanged".

**Acceptance**
- Headless naive dive with a 10 L start is disabled at ≥ 290 m.
- A cautious trip 1 reaches the dock with ≥ 5 L and no danger banner.
- The first pre-M1 recovery keeps 7 packages and 20 CR.
- A recovery after M1 matches the pinned formula exactly.
- `npm test` passes.

**Dependencies:** none.

**Deviation:** start energy 6 L is the value inherited from `docs/RESEARCH.md` "Start" (not pinned in `design/v0.1`). The free pre-M1 tow deviates from the **pinned** design rule `rules.recovery = min(cash, 25000, 100 + floor(0.01 × spend))`. Reason: first-session forgiveness, since the pinned fee plus total cargo loss erases the guaranteed opening income.

### FTUE-P2 · Fix the first-session messaging and dock rough edges (bundle) (M · high)
Addresses F2, F5, F9, F10, F11, F12, F16, F8 (title overlap).

Each item is an S fix with a repro:

| Item | Fix (files) | Acceptance |
|---|---|---|
| a. Dead warning text | Put the band text into `#campaign-danger` itself instead of `showMessage` (`main.ts:365-381`, `:876-889`). Danger becomes e.g. "Reserve 25 % · check your return route" (later replaced by FTUE-P3's margin text). Add a 2 s pulse on the energy instrument | A2 runs show the band text; logs contain it |
| b. Banner at the lander | When `campaign.atDock`: "Low energy · refuel here (7.7 CR)" if affordable, otherwise hide. Hide `#campaign-danger` while the dock overlay is open and show the same line in the dock header | `D-touch-016.4s` scenario shows the refuel text; no clipped banner behind the dock panel |
| c. Message priority | Add a tiny queue in `main.ts showMessage`: priority safety > cargo/full > milestone/survey > proximity > routine, with ≥ 2.5 s minimum display for priorities ≥ cargo. Proximity alerts (`main.ts:478-488`) cannot replace a higher-priority message | Trip 1 shows "Hold full" at 70 m |
| d. Unload & sell wording | Compose one message from the `bank()`/`sell()` results, e.g. "Banked Lander pressure valve · no ore to sell" (`main.ts:1654-1661`; return details from `model.ts bank()/sell()` instead of overwriting `message`) | R1 repro shows the correct text |
| e. Dock tab | On `openOverlay("dock")`, select Service if cargo/mission objects are aboard or energy/hull is not full; otherwise Lander if `missionReady && funded`; otherwise the last tab (`main.ts:129`; `openOverlay` at `:490-506`) | Trip 2 opens on Service |
| f. Departure check | On Undock with energy < 50 % and credits ≥ refuel cost, show an inline row in the dock: **[Refuel 7.7 CR & undock]** (primary) / [Undock anyway] (`main.ts closeOverlay` + `renderDock`) | B-norefuel path shows the prompt; one click refuels and leaves |
| g. Sky seam | Align the sky texture's bottom to the horizon: `tilePositionY = 512 − visibleSkyHeight`, clamped. Above the texture, fill with its top colour (or extend `w01-sky.png`/`w02-sky.png` with a vertical fade) (`scene.ts:1059-1064`) | Screenshots at the altitude cap on 1440×900, 393×851 and 844×390 show one planet and no seam |
| h. Title overlap | Do not draw world labels (edge "LANDER" label) while `overlay === "welcome"` (`scene.ts:1300-1309` reading `bindings.isPaused()`/overlay) | `p01`/`d01` equivalents have no text collision |
| i. Distance-aware next | In `poi.ts:387-404`, when `band === "distant"` and the target is buried, use "Descend to {depth} m ({arrow})" rather than "Excavate the marked debris" | B log at 15.70 s reads "Descend to 250 m" |
| j. Player-facing milestone copy | Add `playerDescription` to `W01_MILESTONES` (`config.ts:461-484`) and keep the pinned design strings unchanged. Example: "Survey the wreck at 100 m and bank 3 ore. Unlocks rank-1 hardware and Anchoring feet." | No "R2/R3/W02/W03" text in the terminal |

**Dependencies:** none. Item c's queue is reused by FTUE-P4.

**Deviation:** none (presentation only). Item j keeps the pinned design text in data and only changes display copy.

### FTUE-P3 · Return-reserve gauge and point-of-no-return alarm (M · high)
Addresses F1, F2, F3.

**What**
- A live estimate of the energy needed to get home, drawn as a **notch on the energy bar** plus a compact "HOME ≈ 0.6 L" readout whenever the rig is below the surface. Wireframe in §9.
- Warnings move from fixed tank shares to **margin bands**:
  - Caution: `E < 2R + 1.0 L` → "Plan your return · {spare} L spare".
  - Turn back: `E < 1.25R + 0.3 L` → red pulse, "Turn back now".
  - Point of no return: `E < R` → "Can't make it home · Recovery {fee}" with the preview.
  - On a 6 L naive dive these fire at about 120 m, 156 m and 170 m. With FTUE-P1's 10 L start they fire at about 230, 270 and 290 m.
  - The existing 25 % banner stays as a floor.

**Implementation**
- `model.ts`: add a pure `get returnEstimate()` built from the same constants as `step()`:
  - `ascentRows = max(0, y − SURFACE_Y)`;
  - `vUp = min(12, 6√power)`, `vGround = min(10, 5√power)`;
  - `R = ascentRows/vUp × (0.126·mf·reserve + 0.063) + |Δx to dockX|/vGround × 0.126·mf + 0.05`.
  - The stock rig calibrates to ≈ 0.0305 L/row + 0.018 L/cell (`work/sim-results.json`). Using 0.025 L/cell is slightly conservative, which is intended.
  - v2: breadth-first search over discovered open cells (40×60 = 2,400 cells, cheap) when the straight route is blocked, so side tunnels are handled.
- `main.ts syncHUD()`: set `--home-notch` on `.energy-meter` and write `#campaign-home` text.
- `style.css`: notch (2 px, high-contrast) and a stripe for the margin zone.
- Unit tests compare `returnEstimate` with the simulated autopilot return (the `returnTrip` helper in `work/sim.audit.ts`) at 10 depths on 20 seeds.

**Acceptance**
- Estimate within −10 %/+30 % of the simulated cost.
- On the naive dive, "Turn back now" appears ≥ 1 s before the measured last safe turnaround.
- No band fires on a correct trip 1 with a 10 L start.
- Reduced-motion uses a static style.

**Dependencies:** P2a (banner rework).

**Deviation:** none. This adds to the approved persistent HUD (conditions) and realises the design's "return reserve" goal.

### FTUE-P4 · Guided first sortie: contextual coach prompts plus an in-dock "next step" strip (M · high)
Addresses F4, F5, F9, F15.

**What:** a non-blocking, skippable step machine that teaches by doing, one line at a time. Full spec in §9. It covers:
- drill (with the seam highlighted);
- ore and hold;
- the energy notch;
- survey;
- fly up;
- find the lander;
- dock;
- Unload & sell → Lander tab → Fund construction → Refuel (as a pulsing strip at the top of the terminal);
- "mine Seam B for your first upgrade";
- first purchase.

**Implementation**
- New `src/campaign/onboarding.ts`: a pure function `coachStep(campaign, progress) → {id, text, anchor} | undefined` driven only by state. It is never time-gated, so restored saves resume correctly.
- `main.ts` renders `#campaign-coach` (aria-live polite) anchored to the rig (`data-rig-screen-x/y` already exist) or to HUD/dock elements via `data-coach` attributes (`.pulse` class).
- Completed steps are stored in `PilotPreferences` keyed by `campaign.state.id` (`input.ts:39-50`), so the checkpoint schema does not change.
- A "Skip guidance" link on the title and a "Guidance" toggle in Systems.
- Prompts are suppressed while a danger band is active. The danger text then carries the hint, e.g. "Turn back now · hold ↑ to fly".

**Acceptance**
- The B script receives steps 1–11 in order, each exactly once.
- A restored campaign resumes at the right step.
- Skip removes all prompts.
- No prompt blocks input.
- Unit tests for the step machine.
- A browser smoke test on desktop and portrait.

**Dependencies:** P2c (message queue), P3 (the notch the coach points at), P5 (Seam B target).

**Deviation:** none. The design pack already references a tutorial ("Free after tutorial").

### FTUE-P5 · Route the early economy through the second seam, mark the seams, and check trip feasibility (M · high)
Addresses F6, F14, F4.

**What**
1. After M1, while no hardware or gear has been bought and starter deposits remain, the tracker inserts **"First upgrade · mine Seam B (480 CR) → 150 m"** before the valve. The locator targets the nearest remaining starter deposit.
2. Draw the design's **marked seams**: amber corner brackets on remaining starter deposit cells and surface stakes "SEAM A · 380 CR" and "SEAM B · 480 CR" above columns 20/21 while deposits remain. The opening message "Mine the marked seam" then becomes true.
3. **Trip check:** when a tracker target's estimated round trip uses more than 85 % of `maxEnergy`, the tracker says "Antenna needs a bigger tank · Riveted reservoir 16 L (650 CR)" and the Hardware tab badges it.
   - Estimate: descent cut time × 0.315 L/s + P3's return estimate.

**Implementation**
- `missions.ts campaignMission()` adds the sub-task for M2 (`:84-109`).
- `poi.ts campaignSignal()` returns a synthetic POI for the seam (`:271-282`).
- `scene.ts` draws brackets and stakes in the terrain loop (`:1079-1110`) using the existing `label()`. Starter IDs are `W01:deposit:{row}:{20|21}` (`world.ts:113-134`).
- The feasibility helper lives in `poi.ts`, shared with P3.

**Acceptance**
- The B script, following only the tracker, buys its first upgrade after trip 2, in ≤ 35 s active game time.
- A headless "follow the tracker" bot never departs on a target with an estimated margin below 15 % without the recommendation being shown.
- Seam markers disappear when the seams are exhausted.

**Dependencies:** P3 (estimate) for item 3 only.

**Deviation:** none. Tracker ordering and markers are not pinned, and this realises the design text "first two marked seams" and the two-trip first purchase. Coordinate antenna reachability with the economy auditor.

### FTUE-P6 · Shaft re-entry assist and a one-time ledge hint (S · medium)
Addresses F13, F15.

**What**
- When Down is pressed, the rig is supported, the column under its centre is open below, and the centre is within ±0.35 tile of that column, slide the rig horizontally into the shaft (bounded by `moveAxis` collision) instead of drilling the support column.
- Holding a side direction against a solid wall while airborne for more than 0.4 s shows "Land on a ledge or the shaft floor to drill sideways" once per 60 s.

**Implementation:** `model.ts step()` (`:430-445`): before the support search, if `tile(floor(x), ty) === 0` and `|x − (floor(x) + 0.5)| ≤ 0.35`, set `velocityX` toward the centre (or snap if unobstructed) and `return` without starting a cut. The ledge hint goes in the movement branch when `horizontal && !supported && blocked(x ± ε)`.

**Acceptance**
- R8 (x = 20.75 over open column 20) drops into the shaft and drills column 20 below.
- R2 shows the hint once.
- Existing support/side-cut tests pass.

**Dependencies:** none.

**Deviation:** a small movement assist. Not a pinned value or an approved decision.

### FTUE-P7 · Introduce the lander at Deploy (S · medium)
Addresses F8.

**What (option A, recommended)**
- On Deploy, the camera opens on the lander for 1.2 s with the caption "SALVAGE LANDER · sell · refuel · build", then pans to the rig in 1.3 s.
- Any input skips the pan. Reduced motion replaces the pan with a cut.

**Implementation**
- `scene.ts`: an `introUntil` timer interpolates the camera target between `dockX` and `renderX`. The camera currently follows `renderX`.
- `main.ts` (`#campaign-start` handler, `:1747-1755`) starts the intro.

**Option B (owner decision):** move the lander to about 40–50 m from the seam so both are on-screen on desktop.
- Portrait needs ≤ 35 m.
- The refuge and relay art offsets (`scene.ts:1276-1299`: −4 and +3.5 tiles) would collide with the shaft corridor (`world.ts:58`, columns 18–23), so art placement must move too.
- This makes it **M**.

**Acceptance**
- The first 2.5 s after Deploy show the lander on 1440×900, 393×851 and 844×390.
- Input works immediately.

**Dependencies:** none. P4 can reuse the caption.

**Deviation:** option A none. Option B changes documented W01 geometry ("about 150 m"), which is not a pinned design value.

### FTUE-P8 · Payoff moments for the first sale, construction and upgrade (M · medium)
Addresses F7.

**What**
- **Sale:** "+380 CR" count-up on the dock credits (0.8 s), with chips flying from the cargo icon.
- **Construction:**
  - briefly frame the lander behind the panel (or collapse the panel for 1.5 s) while the new stage art fades in with a construction flash;
  - a "BLUEPRINTS UNLOCKED" card lists the unlocks with a [View hardware] button.
- **Upgrade:**
  - the changed HUD stat flashes its delta ("ENERGY 10 → 16");
  - the rig sprite shows the part (back tank, hull plates, thruster, rack, drill bit). This is an art request through `assets/campaign/source` → atlas.
- **Pickups:** show value ("+30 CR Ironium") beside the name.
- **Sound:** unlock audio on the Deploy click, which is a valid user gesture, with effects at 50 % and a visible mute toggle. Alternatively ask "Sound on?" on the title.

**Implementation**
- `main.ts transact()` (`:1497-1509`) emits typed events.
- `scene.ts` gets a `celebrate(kind)` effect.
- `style.css` keyframes.
- `audio.ts` (`:14-17`) default/unlock.

**Acceptance**
- Each moment is visible ≥ 0.8 s.
- Static variants exist for reduced motion.
- No added blocking pause > 1.5 s.
- Sound plays after Deploy unless muted.

**Dependencies:** none (art for rig parts can come later).

**Deviation:** the current behaviour "Sound starts muted" (README) is an implementation choice, not an approved design decision. Flagged for the owner.

### FTUE-P9 · First-session HUD progressive disclosure and portrait placement (M · medium)
Addresses F4, F18.

**What**
- Until the first dock: show Energy (with notch), Depth, Cargo and Haul, and a one-line objective with the locator.
- Reveal Hull on first damage or first dock, CR and Construction after the first sale, and the "Unlock:" line only in the dock.
- Portrait:
  - collapse the tracker to one line after 6 s of movement (tap to expand);
  - move `#campaign-message` and `#campaign-danger` to the top band under the vitals;
  - never place banners within 120 px of an active joystick centre.

**Implementation**
- `main.ts syncHUD()` sets `body[data-first-session]`.
- `style.css` rules for the hidden elements and the portrait media query (`style.css:1919`, `:1954` blocks).
- Persist "first dock done" in the same preference record as P4.

**Acceptance**
- On 393×851 the first frame leaves ≥ 70 % of the height for the world.
- No banner overlaps the joystick in the D-touch script.
- After the first dock the HUD equals today's.

**Dependencies:** P4 (shared persistence).

**Deviation:** temporarily deviates from the approved "persistent HUD with conditions, current objective and equipped tools" during the first trip only. Reason: reduce first-frame load. Everything is persistent again after the first dock.

### FTUE-P10 · Landing assist near the lander and faster mouse steering (S · low)
Addresses F17, F13.

**What**
- Within 3 cells of the bay and ≤ 2 cells above the surface, while the tracker's target is the lander:
  - clamp horizontal speed to 3 cells/s;
  - light the bay beam;
  - once landed inside ±1.65 cells, ease the rig to the bay centre.
- Mouse: start steering immediately when the pointer moves more than 8 px, and lower the hold threshold from 180 to 120 ms (`pointer.ts:74`, `:86`). Taps keep the < 120 ms, < 8 px rule.

**Acceptance**
- The C-mouse up-left/left script docks without nudges.
- Keyboard behaviour away from the bay is unchanged.
- Pointer unit tests (`tests/campaign-pointer.audit.ts`) are updated.

**Dependencies:** none.

**Deviation:** a small physics assist near the bay. Not a pinned value.

---

## 9. Specs and wireframes

**Energy instrument with home notch (P3)**
```
ENERGY  4.2 / 10            HOME ≈ 0.6 L · spare 3.6
[██████████████████████▏··|·························]
                       now   ^ notch = return estimate (R)
caution: bar tint amber when E < 2R + 1.0 · turn back: red pulse when E < 1.25R + 0.3
```

**Coach sequence (P4).** One line at a time. Keyboard / touch wording is chosen with the existing `actionKey()`.

| # | Trigger (state) | Prompt | Anchor | Done when |
|---|---|---|---|---|
| 1 | Deployed, no cut yet | "Hold ↓ to drill into Seam A" / "Drag down to drill" | above rig + seam brackets | first package carried |
| 2 | first package | "Ore goes in your hold (7). HAUL shows its value." | cargo + haul readouts | 3 packages or 4 s |
| 3 | depth ≥ 40 m | "Digging burns energy. The notch is what you need to get home." | energy bar | 4 s |
| 4 | hold full | "Hold full. Survey the beacon just below, then head home." | rig | beacon surveyed |
| 5 | beacon surveyed | "Hold ↑ to fly up your shaft" / "Drag up" | rig | depth 0 |
| 6 | surface, not docked | "Your lander is ← 150 m. Land in the lit bay." | edge arrow (enlarged) | atDock |
| 7 | atDock (first time) | "Press E (or tap the lander) to dock" | dock prompt | dock open |
| 8 | dock open, cargo aboard | strip: "① Unload & sell" | pulse button | sold |
| 9 | sold, M1 ready and funded | strip: "② Lander tab → Fund construction (200 CR)" | pulse tab | M1 paid |
| 10 | M1 paid, energy < max | strip: "③ Refuel before leaving (7.7 CR)" | pulse button | refuel or undock |
| 11 | undocked after M1, no purchases | "Mine Seam B → 150 m to afford your first upgrade (400–650 CR)" | tracker + seam stakes | first purchase |
| 12 | first purchase | "Upgrade installed. Next: the pressure valve at 250 m." | tracker | — |

**In-dock next-step strip (P4, P2e)**
```
┌ LANDER TERMINAL / W01 ──────────────────── 400 CR  [Undock] ┐
│ NEXT ▸ ② Fund construction · Lander tab · 200 CR      [Go]  │  ← pulses; disappears when done
│ Service · Hardware · Attachments · Lander● · Cargo          │
```

**First-rescue card (P1)**
```
┌ RESCUE TOW · first one is free ─────────────────────────────┐
│ Your energy ran out at 190 m. The tow brings you and your     │
│ 7 packages (380 CR) back to the lander.                       │
│ Tip: the white notch on the energy bar is the energy you      │
│ need to get home. Turn back before the bar reaches it.        │
│                                           [Tow me home]       │
└──────────────────────────────────────────────────────────────┘
```

---

## 10. Suggested sequencing

1. **Week 1 (quick wins):**
   - P1 (S): start tank and pre-M1 tow.
   - P2 (M): bundle a–j.
   - P6 (S): shaft assist and ledge hint.
   - P7 option A (S): camera intro.
   - These remove the first-20-second failure, the dead warnings, the false errors and the sky seam.
2. **Week 2:**
   - P3: return gauge.
   - P5: Seam B routing, seam markers, trip check.
3. **Week 3:**
   - P4: coach and dock strip.
   - P8: payoff moments; rig-part art can follow.
   - P9: progressive HUD.
   - P10: landing assist.
4. **Re-run:** all `work/playtest-*.mjs` scripts and `work/sim*.test.ts` after each step. The acceptance numbers above are written against these exact scripts.

---

## 11. Owner decisions

1. **Starting tank:** raise the W01 start from 6/10 L (inherited from the original-game research) to a full 10/10 L? Recommended.
2. **First-failure forgiveness:** make recovery free and cargo-preserving before M1 (or for the first N recoveries)? This deviates from the pinned recovery formula. Recommended: before M1 only.
3. **Tutorial style:** non-blocking coach prompts (recommended), or a scripted mini-mission with locked steps?
4. **Lander introduction:** camera intro only (recommended), or relocate the lander and seams about 40–50 m apart (geometry and art-offset change)?
5. **Sound default:** keep "starts muted", or unlock audio on the Deploy click with a visible mute toggle?
6. **First-session HUD:** accept a temporary progressive reveal until the first dock, deviating from the always-persistent HUD decision during trip 1 only?
7. **Early progression intent:** confirm that the first upgrade should land after the second trip (Seam B). Also decide whether the 400 m antenna should explicitly require the energy upgrade (an announced gate) or be made comfortably reachable with the stock tank. Coordinate with the economy auditor.

---

## 12. Evidence index

- Scripts: `work/lib.mjs`, `work/playtest-a-naive.mjs`, `work/playtest-a2-warnings.mjs`, `work/playtest-b-cautious.mjs`, `work/playtest-c-mouse.mjs`, `work/diag-mouse-stuck.mjs`, `work/playtest-d-touch.mjs`, `work/repro.mjs`, `work/sim.audit.ts`, `work/sim2.audit.ts`.
- Logs: `work/A-naive-log.txt`, `work/A2-warn-desktop-log.txt`, `work/A2-warn-portrait-log.txt`, `work/B-cautious-log.txt`, `work/B-cautious-norefuel-log.txt`, `work/C-mouse-log.txt`, `work/C2-mouse-diag-log.txt`, `work/D-touch-log.txt`, `work/R1-unload-mission-only-log.txt`, `work/R2-ledge-log.txt`, `work/R8-shaft-reentry-log.txt`.
- Data: `work/sim-results.json`, `work/sim2-results.json`, `work/B-after-trip2.json` (checkpoint after the cautious run).
- Key screenshots (`work/shots/`):
  - `A-naive-000.5s-first-frame.png`, `A-naive-001.5s-first-ore.png`, `A-naive-007.3s-hold-full.png`, `A-naive-009.3s-beacon-surveyed.png`;
  - `A-naive-020.5s-disabled.png`, `A-naive-020.5s-recovery-confirm.png`, `A-naive-021.5s-after-recovery-world.png`;
  - `A2-warn-desktop-014.5s-energy-15pct.png`, `A2-warn-portrait-016.8s-energy-8pct.png`;
  - `B-cautious-00012s-trip1-out-of-shaft.png`, `B-cautious-015.2s-trip1-dock-service.png`, `B-cautious-015.2s-trip1-after-sell.png`, `B-cautious-015.2s-trip1-after-m1.png`, `B-cautious-015.7s-trip2-start.png`;
  - `B-cautious-048.7s-trip2-dock-opened.png`, `B-cautious-00066s-trip3-first-upgrade.png`, `B-cautious-066.8s-after-first-upgrade-world.png`;
  - `B-norefuel-015.2s-trip1-dock-service.png`, `B-norefuel-060.6s-trip3-hold.png`;
  - `C-mouse-000.8s-inspect-ore.png`, `C-mouse-026.7s-mouse-at-lander.png`, `C2-mouse-diag-014.9s-upleft-end.png`;
  - `D-touch-009.6s-touch-drilling.png`, `D-touch-013.8s-touch-flying.png`, `D-touch-016.4s-touch-at-lander.png`, `D-touch-016.7s-touch-dock-sold.png`;
  - `R1-unload-mission-only-000.8s-unload-mission-only.png`, `R2-ledge-010.6s-hover-right.png`, `R8-shaft-reentry-004.4s-offcentre-before-down.png`, `R8-shaft-reentry-006.2s-offcentre-after-down.png`.
- Baseline screenshots used: `shots/d01-title.png`, `shots/d02-surface-start.png`, `shots/d04-drilling-shallow.png`, `shots/p01-title.png`, `shots/p02-surface.png`, `shots/p03-drilling.png`, `shots/l02-drilling.png`.
