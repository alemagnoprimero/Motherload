# 06 · Menus, lander terminal, navigation and the UI design system

> **Archived audit report** (2026-11-02, baseline commit `dbf0b1a`), supporting [the improvement plan](../../IMPROVEMENT_PLAN.md). Source paths are relative to the repository root; `work/…`, `shots/…` and `analysis/…` are relative to `docs/improvement-plan/`. Review scripts named `*.test.ts` are archived as `*.audit.ts` (see [the folder README](../README.md)). Screenshots and captures (`*.png`) were local review files and are not committed, except the UI mocks, which are stored as `.webp`.

Auditor key: `menus`. Scope: the title screen, the pause menu ("Pilot console"), the lander terminal (Service, Hardware, Attachments, Lander, Cargo, Navigation), the navigation archive, confirmation dialogs, the disabled-rig recovery card, settings, control remapping, save/load/import/export, and the visual design system of the HTML UI (type, colour, spacing, components, icons, motion, focus and controller navigation). The in-play HUD belongs to the HUD auditor (`05-hud.md`); where the two meet (tokens, typeface, notifications) this report reuses that work instead of competing with it.

Work folder (scripts, JSON results, screenshots, mockups): `work/menus/` (below: `work/`). Baseline screenshots: `shots/` (below: `shots/`). A one-page overview of the key evidence and the five redesign mockups is `work/menus-contact-sheet.png`.

---

## 1. Assessment

The menus are **safe and honest but joyless**. Previews are exact, every purchase states its price and consequence, the palette passes contrast, and nothing ever creates debt. What the owner is reacting to is real, though: the UI reads as an admin console bolted onto a game. Four things cause that, and they are fixable without touching the simulation:

1. **No front door and no ceremony.**
   - New players get one button ("Deploy rig") over a dimmed HUD, in system Arial.
   - Returning players never see a title at all: the game boots straight into a 279-word settings page titled "Expedition restored · paused" (`work/shots/m01-returning-boot-desktop.png`).
   - The biggest moments are single 12 px status lines: the first sale, an upgrade, a construction stage, the chapter launch ("Course charted.", static text, 0 animations) and arrival on a new world. Credits jump from 600 to 1,160 CR with no itemisation, and the mission part banked in the same click is not even mentioned.
2. **Text instead of pictures.**
   - 75 % of the words in the five terminal tabs and 77 % of the pause menu are set at 12 px. The approved target was 14–16 px body text (`docs/DESIGN_PACK_IMPLEMENTATION.md:134`).
   - An upgrade is the line "2 speed → 2.8 speed". There is no picture of the rig, no stat bar and no rank progression, and the part keeps the same name at every rank.
   - The interface uses 17 of the 198 icons the art pipeline already exports. It has no planet art, no ore art in the cargo lists and no lander art in the construction tab.
3. **No design system.** `style.css` has 2,204 lines, 176 unique colour literals, 18 font sizes, 5 custom properties (one unused), one system font stack, no `@font-face` and **no animation keyframes**. Each screen was styled locally, so nothing feels like one product.
4. **Interaction debt that bites real players.**
   - **Data loss.** "Start a new campaign" promises that the prior campaign "becomes a backup", but the next autosave, 5 s after resuming, overwrites that backup. The old campaign is then gone (verified, §4 M9).
   - **Controller.** A controller can open the terminal and the pause menu, but it cannot press a single button inside them. Controller-only play stops at the first dock.
   - **Re-render resets.** Every terminal transaction rebuilds the panel with `innerHTML`, which throws keyboard focus to `<body>` and scrolls the list back to the top.
   - **Smaller defects.** The "Travel to Ice comet" button is crushed into a 60 px column. Locked buttons fail silently. Closing the star map drops you out of the terminal.

The plan below fixes the safety and interaction defects first (days), then lays a small design foundation (tokens, two self-hosted typefaces, a component kit). It then rebuilds the five key screens on top of it: title, pause, terminal, star map and dialogs. Mockups of the target are in `work/shots/mock-*.png`. They use only existing game art: the rig modules, lander stages and world icons from `assets/campaign/source/`.

---

## 2. Method and artefacts

- **Build under test:** the repository at `dbf0b1a`, served by my own Vite dev server on `http://127.0.0.1:5186/?mode=campaign`. Port 5173 was down, and another auditor was using 5177. Read-only: nothing in `<repo>` was modified.
- **Browser:** Chromium `/opt/pw-browsers/chromium` with Playwright, using the project helpers from `scripts/campaign-smoke.mjs` (`freeze`, `advance`, `importCheckpoint` …). Viewports: desktop 1440×900, portrait phone 393×851 (DPR 2, touch) and landscape phone 844×390. Fixtures were imported checkpoints mutated in memory.
- **Scripts** (all in `work/`):
  - `menus-lib.mjs`: shared helpers. Includes an in-page `measure()` probe that records every visible text leaf (font size, colour, opacity, word count), the focusable order and the scroll size of a dialog.
  - `cap1-title-pause.mjs` → `cap1-results.json`: title, returning-player boot, pause metrics, real Tab traversal, locked star map, remapping, new-campaign dialog, landscape.
  - `cap2-terminal.mjs` → `cap2-results.json`: sale with a mixed hold, per-tab metrics, mouse and keyboard purchases, focus and scroll after re-render, tab semantics, focus ring.
  - `cap2b-terminal.mjs` → `cap2b-results.json`: Enter key-repeat at the dock, navigation archive geometry, Larger text, W02 rank names.
  - `cap3-gamepad-recovery.mjs` → `cap3-results.json`: fake standard gamepad (`Navigator.prototype.getGamepads` stub) in the pause menu and terminal; disabled rig → recovery → result.
  - `cap4-backstack-phone.mjs` → `cap4-results.json`: overlay back-navigation; phone terminal density and tab overflow.
  - `cap5-launch.mjs` → `cap5-results.json`: the departure splash.
  - `cap6-backup.mjs` → `cap6-results.json`: does the previous campaign survive "Start a new campaign"?
  - `contrast.py` → `contrast.json`: WCAG ratios of the current palette, with opacity composited as the browser does.
  - `token-contrast.json`: the same check for the proposed tokens.
  - `css-token-audit.py` → `css-token-audit.json`: static audit of `style.css`.
  - `mock/index.html` + `mock/tokens.css` + `render-mock.mjs` → `shots/mock-*.png`: redesign mockups using the real SVG art and the proposed tokens and fonts (OFL fonts downloaded to `mock/fonts/`).
- **Screenshots:** `work/shots/m01…m12*.png` (evidence) and `work/shots/mock-{title,workshop,sale,pause,map}.png` (target).
- **Limitations.**
  - The gamepad was emulated through the API, not through physical hardware.
  - Screen readers were not exercised; ARIA findings come from the DOM.
  - Text-density counts come from fresh or fixture states and change slightly with content.
  - The mockups are design targets; their numbers are illustrative unless they are cited as measured.

---

## 3. Strengths to keep

- **Exact, honest previews.** Every service and purchase shows the charge, the resulting condition and the reserve after a basic service (`main.ts:916-941`, `:1035-1046`). Recovery states its fee and consequences before confirmation. Keep this precision in the redesign; present it better rather than remove it.
- **Contrast of the base palette is good.** Body text is 14.5:1, muted copy 7.8:1 and the eyebrow 7.5:1. The focus ring `#a8f0e8` is 13.2:1 on the panel (`work/contrast.json`).
- **Safety architecture.** Restored runs wait for an explicit Resume. Two-tab conflicts are detected (compare-and-swap plus BroadcastChannel). Corrupt saves are protected. Export/import validates and previews (`persistence.ts`).
- **Dialog basics are right.** Native `<dialog>` with `showModal()`. Accessible names and descriptions are set (`main.ts:193-197`). Escape is routed through `cancel` events. 44 px minimum targets. Destructive confirmations focus Cancel first (`cap1-results.json → newCampaignConfirm.focus = "Cancel"`).
- **The terminal sits beside the world.** It is a side console on desktop and a bottom sheet on phones, with the camera framed to the remaining space (`style.css:723-747`, `:1437-1445`; `shots/e05-dock-hardware-unlocked.png`). The restored lander is visible while you shop. That is the right instinct.
- **Accessibility switches exist:** reduced motion (follows `prefers-reduced-motion`), high contrast, Larger text, three audio buses, fullscreen, drill/brace toggles and keyboard remapping. The redesign should make them reach everything rather than add new ones.
- **The art pipeline can feed the UI.** Every rig module, lander stage, ore, package, mission part and world has a layered SVG on a shared canvas (`assets/campaign/source/*.svg`, 128×128 for rig modules). A "paper-doll" rig and illustrated cards need **no new art** to start (see `work/shots/mock-workshop.webp`).

---

## 4. Measurements

### M1 · Front door (`cap1-results.json`)

| Measure | Result |
|---|---|
| Title actions | **1** ("Deploy rig"); no Continue, Settings, Controls or Credits |
| Title logo | `Arial` weight 900, 105 px; `document.fonts` is empty (no web fonts loaded) |
| HUD behind the title | visible at **opacity 0.24** (`style.css:1238-1240`); `shots/d01-title.png` |
| Returning player (save exists) | boots to `overlay = "menu"`, titled **"Expedition restored · paused"**; the title never appears (`main.ts:1900-1918`, `:1989`); `work/shots/m01-returning-boot-desktop.png`, `m01b-returning-boot-phone.png` |
| Title hint | touch instructions are shown on desktop as well (`main.ts:193`) |

### M2 · Pause menu density (`measure()` on `#campaign-menu`)

| Viewport | Words | Words ≤ 12 px | Focusable controls | Scroll height / viewport |
|---|---|---|---|---|
| Desktop 1440×900 | 279 | 216 (**77 %**) | 21 | 1316 / 858 = **1.53 screens** |
| Phone 393×851 | 279 | 214 | 21 | 2063 / 825 = **2.5 screens** |
| Landscape 844×390 | 279 | 218 | 21 | 1297 / 372 = **3.49 screens** |

- **Tab presses from the initial focus (Resume):** Save = 1, Enable sound = 6, Keyboard bindings = **17**, Start a new campaign = **19**, legend = 20 (`tabSequence`).
- **Seven concerns on one page:** checkpoint management (5–6 buttons and 3 status lines), flight record, star map, systems, three prose paragraphs of controls, recovery plus "Start a new campaign", cargo manifest, legend (`main.ts:194`, `:202-209`).

### M3 · Terminal density (desktop, M1 complete, 1,160 CR; `cap2-results.json → tabs`)

| Tab | Words | Words ≤ 12 px | Buttons enabled / disabled |
|---|---|---|---|
| Service | 93 | 78 | 8 / 2 |
| Hardware | 149 | 109 | 11 / 0 |
| Attachments | 111 | 97 | 8 / 1 |
| Lander | 117 | 97 | 6 / 1 |
| Cargo | 53 | 14 | 6 / 2 |
| **All five** | **523** | **395 (75.5 %)** | |

- **Phone (393×851; `cap4-results.json`):**
  - The sheet is 570 px tall (67 % of the screen), and its content viewport is 414 px.
  - Hardware cards are 188–206 px tall, so only **1 card is fully visible**.
  - The tab bar overflows: 361 px of content in 353 px with 5 tabs, and **442 px in 353 px with 6 tabs**. The sixth tab, "Navigation", sits off-screen with no affordance (`work/shots/m11-phone-six-tabs.png`).

### M4 · Transaction feedback (`cap2-results.json`)

| Event | What changes on screen | Animations after 120 ms | Focus afterwards |
|---|---|---|---|
| Unload & sell: a 7-package hold and a carried valve | header 600 → **1,160 CR** instantly; footer line "Sold stored cargo for 560 CR."; haul "0 CR" | 0 | `<body>` |
| (same click) the valve is banked | **not reported**: the bank message is overwritten by the sale message (`main.ts:1654-1660`; `model.ts:829-851`) | – | – |
| Purchase rank-1 energy (mouse) | footer "Salvaged energy installed."; card becomes "OWNED"; credits 1,160 → 510 | 0 | `<body>`; **list scroll 103 → 0 px** |
| Purchase rank-1 hull (keyboard Enter) | as above | – | `<body>` (focus lost) |
| Chapter launch | static "Course charted." overlay for 2.4 s, then the archive (`main.ts:191`, `:1693-1696`) | 0 | – |
| W02 rank-2 drill purchase | card still "Steel auger assembly"; message "Salvaged drill installed." at rank 1 **and** rank 2 (`cap2b-results.json → rankNaming`) | – | – |

- `style.css` has **0 `@keyframes`**. Its four transitions cover button background, the meter width and the message opacity.
- Sound starts muted (`audio.ts:14`), so the "purchase"/"build" chimes are silent by default (FEEL-F1).

### M5 · Keyboard and controller (`cap1`, `cap2`, `cap2b`, `cap3` results)

| Check | Result |
|---|---|
| Fake standard gamepad, pause menu | Start opens it. **D-pad, left stick, A and B do nothing** (focus stays on Resume). Start closes it. |
| Fake gamepad, terminal | LB opens it. **RB, D-pad, A and B do nothing**; focus stays on "Undock". Only Start closes it. Nothing can be sold or bought. |
| Polled menu buttons | only LB (4), RB (5) and Start (9) (`input.ts:287-308`) |
| Docking with **Enter**, then one key-repeat | the dock opens with focus on "Undock"; the repeated keydown **activates Undock and closes the terminal** (`enterRepeat.stillOpenAfterRepeat = false`; Enter is a default interact key, `input.ts:34`) |
| Terminal tabs | `<nav>` holding `<button aria-selected>`: no `role=tablist/tab/tabpanel`; arrow keys do nothing (`arrowOnTab`) |
| Tab focus ring | clipped to two vertical lines by `overflow-x:auto` on the nav (`style.css:769-777`); `work/shots/m05e-tab-focus-ring.png` |
| Back navigation | terminal → Navigation → "Return to mine" leaves **no overlay**; pause → Star map → Esc leaves **no overlay** (`cap4-results.json → backstack`) |

### M6 · Contrast (`contrast.py`; WCAG 2.x, opacity composited over the panel `#101e25`)

| Element | Ratio |
|---|---|
| Body text / muted copy / eyebrow / small card text | 14.48 / 7.80 / 7.46 / 6.79 |
| Enabled secondary button label / primary label | 10.89 / 5.51 |
| **Disabled button label** (`opacity .38`, `style.css:61-64`) | **2.88** |
| **Disabled primary label** | **1.86** |
| **Locked milestone description** (`opacity .52`, `style.css:980-982`) | **3.21** (fails 4.5:1; this is content, not a control) |
| Secondary button border vs panel | 2.84 (below the 3:1 non-text guideline) |

- WCAG exempts inactive controls from 1.4.3. But here the disabled buttons carry the **price** of exactly the things a player is saving for (`shots/d10-dock-hardware.png`), and locked milestones describe the next goals.
- A disabled primary fill vs an enabled secondary fill is only **1.37:1**. "Can't" and "can" look alike apart from the text brightness.

### M7 · Design-system audit (`css-token-audit.py`)

| Measure | Value |
|---|---|
| Lines | 2,204 |
| Colour literals / unique | 190 / **176** |
| Custom properties | 5 (`--console-bg` used once; `--signal` never used) |
| Distinct font sizes | **18** (12 px appears 73 times) |
| Letter-spacing values | 11 |
| Unique padding / gap values | 56 / 34 |
| Media-query blocks | 12; the same two queries are repeated 3–4 times |
| `@font-face` / `@keyframes` | **0 / 0** |
| Font stack | `"Arial", ui-sans-serif, system-ui, sans-serif` only (`style.css:2`) |

### M8 · Art available but unused by the UI

- `main.ts:43-112` references **17** icon files. The pipeline exports **198**: `generated/icons` 114 and `generated/w02-icons` 84.
- **Unused:**
  - destination icons `world-w01`/`world-w02` (the archive draws CSS `clip-path` polygons, and W01 and W04 are identical, `cap2b-results.json → symbols`);
  - ore and package icons (cargo lists are text-only; the legend uses the Unicode glyphs ● Ⅱ ≡ ▲ / ◒ ◈ ✦ ⬡, `main.ts:210-276`);
  - mission-part icons;
  - `ui-shop`, `ui-warning` and `ui-relic` glyphs;
  - lander and refuge construction stages (atlas frames `dock-stage-0…3`, `refuge-stage-*`, `relay-stage-*`).
- A contact sheet of examples is in `work/unused-icons-sheet.png`.

### M9 · Save safety (`cap6-results.json`)

| Scenario | Result |
|---|---|
| Start a new campaign → Restore backup immediately | the old seed is restored ✔ |
| Start a new campaign → Resume → **play 6 s** (one autosave) → Restore backup | the **new** campaign's first checkpoint is restored. **The old campaign is gone.** |

- The cause is by design in `persistence.ts:314-341`. Every save rotates the previous primary into the single backup slot, and autosave runs every 5 s of unpaused play (`main.ts:1950-1954`). That is good crash safety but bad undo.
- The dialogs promise more than this:
  - "The prior valid campaign becomes a backup." (`main.ts:1637`)
  - "Your current valid save becomes the backup." (import, `main.ts:1826`)

### M10 · Remapping and settings (`cap1-results.json`)

- Remapping "Steer left" to J turns `["ArrowLeft","a"]` into `["j"]`: **both defaults are lost** (`input.ts:183`).
- There is no reset to defaults, no swap on conflict and no controller remapping.
- The bindings sit in a collapsed `<details>` at Tab #17.
- Saved preferences contain no sound key. Sound is muted on every load, and the only switch is in Pause › Systems (`main.ts:1838-1844`; FEEL-F1).
- With Larger text on, the Hardware tab still has 45 words at 12 px and 20 at 13 px. The rule only scales `p` and `button` (`style.css:1266-1269`; `work/shots/m08-largetext-hardware.png`).

---

## 5. Findings (most severe first)

### MENU-F1 · Critical · "Start a new campaign" and Import can permanently destroy the previous campaign 5 s after resuming, although the dialog promises a backup
**Evidence**
- `cap6-results.json`: a restore right after a new campaign returns the old seed. After **6 s of play** it returns the new campaign's first checkpoint, and the old campaign is unrecoverable.
- Mechanism: single-slot backup rotation on every write (`persistence.ts:325-328`); autosave every 5 s (`main.ts:1950-1954`).
- The confirmations promise the opposite:
  - "The prior valid campaign becomes a backup." (`main.ts:1637`; `work/shots/m03-new-campaign-confirm.png`)
  - "Your current valid save becomes the backup." (`main.ts:1826`)
- The trigger sits beside "Request recovery" in the same section, with the same neutral styling (`main.ts:194` Recovery section; `cap1-results.json → newCampaignNeighbour`).
- The confirm button is the amber primary "Confirm".

**Player impact:** one mistaken click and 5 seconds of play erase hours of progress, after the game said it was safe. The usability review (`docs/USABILITY_REVIEW.md`) cares about safety, which makes this the highest-trust failure in the UI.

### MENU-F2 · Major · Controller players cannot operate any menu, so controller-only play ends at the first dock
**Evidence**
- `cap3-results.json → pauseWithPad`/`dockWithPad`: D-pad, stick, A and B never move focus or activate anything in the pause menu or the terminal. Start only toggles them closed.
- `pollCommands()` handles only LB/RB/Start (`input.ts:287-308`).
- The pause menu advertises "Controller: left stick / D-pad drive, A thrust … LB interact, RB map, Start pause" (`main.ts:194`). The dock prompt shows "LB Dock" when a pad is connected (`cap3-results.json → dockPrompt`).
- The project records this gap: "controller menu navigation remain[s] follow-up work" (`docs/CAMPAIGN_W01.md:51`; `docs/PROJECT.md:31`). The design pack requires controller validation (`DESIGN_PACK_IMPLEMENTATION.md:132`).

**Player impact:** a player on a handheld PC or a couch setup can mine, but cannot sell, refuel, buy, fund construction or travel. The game looks supported and then dead-ends.

### MENU-F3 · Major · There is no front door: one "Deploy rig" for new players, and returning players never see the title
**Evidence**
- Title markup: an eyebrow, an Arial 900 "MOTHERLOAD", one button and a touch-centric hint (`main.ts:193`; `style.css:1082-1156`). The HUD stays visible at 24 % behind it (`shots/d01-title.png`, `p01-title.png`, `l01-title.png`).
- On boot with a save, `overlay = "menu"` replaces the welcome dialog (`main.ts:1900-1918`). Returning players land in "Expedition restored · paused", a 279-word page (`work/shots/m01-returning-boot-desktop.png`, `m01b-returning-boot-phone.png`).
- No save summary, Continue, New, Settings, Controls or Credits exist anywhere at entry. Sound cannot be switched on before play (FEEL-F1).
- The "← LANDER · 150 m" world label overlaps the title copy on phone and landscape (`shots/p01-title.png`, `l01-title.png`; also FTUE-F8).

**Player impact:** the first screen every session is either a prototype splash or a settings dump. This is the most visible part of the owner's "menu and display not up to par".

### MENU-F4 · Major · Selling, buying, building and launching produce no reward feedback
**Evidence**
- **Sale:** credits change 600 → 1,160 CR with one 12 px footer line, no itemisation and no animation (`work/shots/m05a-service-with-cargo.png` → `m05b-after-unload-sell.png`; `cap2-results.json → afterSell`).
- **Banked mission part:** a mission part banked by the same click is never mentioned. `bank()` writes "Banked … 1 mission objects" and `sell()` immediately overwrites it (`main.ts:1654-1660`; `model.ts:829-851`).
- **Purchase:** the footer says "Salvaged energy installed." and the card flips to "OWNED" (`m05d-hardware-after-buy.png`).
- **Chapter launch:** a static text overlay with 0 animations; the lander does not move (`work/shots/m12-launch-splash.png`).
- **W02 arrival:** the Service tab opens with a footer sentence (`shots/d16-w02-arrival.png`).
- **Motion and sound:** 0 `@keyframes` in `style.css`; sound is muted by default (`audio.ts:14`).
- Related: FTUE-F7 (first-session payoffs) and PROG-F9 (big finds not celebrated). This finding covers the terminal and transition screens they do not.

**Player impact:** the loop's rewards register as bookkeeping. This is a direct cause of the owner's dissatisfaction with progression feel.

### MENU-F5 · Major · The terminal is a wall of 12 px text, with no rig view, no visual comparison, ambiguous states and rank-blind names
**Evidence**
- **Density:** 523 words across five tabs, 75.5 % at ≤ 12 px (M3).
- **Abstract comparisons:** an upgrade is "2 speed → 2.8 speed" (abstract units) followed by a 25-word reserve sentence, for example "Need 240 CR more for this upgrade. Reserve after purchase/basic service: 0 CR. 285 CR more needed for purchase and full service." (`main.ts:1029-1046`; `m05d-hardware-after-buy.png`).
- **Weak states:** disabled vs enabled is opacity only (2.88:1 and 1.86:1 labels; M6). Locked milestones fall to 3.21:1.
- **Rank-blind names:** labels are constant per slot (`main.ts:1007-1013`), and the purchase message is always "Salvaged {key} installed" (`model.ts:932`).
  - At rank 2 on the comet the drill is still "Steel auger assembly" (`work/shots/m09-w02-rank2-drill.png`).
  - The design pack names ranks "Salvaged / Survey / Hydraulic assembly" (`design/v0.1/motherload-asset-manifest.json`, CORE-1…3).
- **Duplicated jobs:** Service ("Unload & sell", "Bank without sale") and Cargo ("Sell stored cargo", "Bank carried cargo and missions") repeat each other under different labels (`main.ts:969-982`, `:1265-1283`).
- **Internal IDs** appear in milestone copy (R2/R3/W02/W03; also PROG-F11, FTUE-F16).
- **No picture of the rig.** The rig's modular art exists (`rig-*.svg`), but the terminal never shows it, so an upgrade has no visible before/after.

**Player impact:** shopping, the main reward of the loop, feels like reading a spreadsheet. Players cannot see at a glance what they can afford, what they are saving for, or what changed.

### MENU-F6 · Major · The pause menu is one long page that mixes seven concerns and puts "Start a new campaign" next to recovery
**Evidence**
- 279 words, 21 controls, 1.53–3.49 screens (M2).
- Three prose paragraphs explain touch, mouse and keyboard controls (`main.ts:194`). The two-column grid leaves a tall dead area beside "Pilot controls" (`shots/d07-pause-menu-scrolled.png`, `work/shots/m02b-remap-after.png`).
- When the rig is disabled, "Request recovery" appears twice, in the header and in the Recovery section (`shots/d06-pause-menu.png`, `d07-pause-menu-scrolled.png`).
- "Start a new campaign" is 19 Tab presses deep, inside "Recovery" (`cap1-results.json`).
- "Star map" sits under "Flight record" and is a dead button before M2 (MENU-F11).
- Cargo manifest and legend are appended at runtime below the fold (`main.ts:202-209`).

**Player impact:** pausing, the one menu every player opens, gives no clear answer to "Where am I, what next, how do I change X". Settings are hard to find on phones, and destructive actions sit beside routine ones.

### MENU-F7 · Major · Terminal interactions break keyboard and mouse flow
**Evidence**
- Every transaction calls `renderDock()`, which replaces `#campaign-dock-content.innerHTML` (`main.ts:1286`, `:1497-1510`). As a result:
  - focus falls to `<body>` after mouse and keyboard purchases and after a sale;
  - the list scroll resets from 103 px to 0 (`cap2-results.json → mousePurchase`, `keyboardPurchase`).
- Initial focus is "Undock". Docking with Enter (a default interact key) and holding it for one auto-repeat closes the terminal (`cap2b-results.json → enterRepeat`).
- Tabs have no tab semantics or arrow keys (`tablistSemantics`, `arrowOnTab`), and their focus ring is clipped (`work/shots/m05e-tab-focus-ring.png`).

**Player impact:** after every purchase, reaching the fifth upgrade again costs a re-scroll, or up to 12 Tab presses (Undock, five tabs and the scroll region come first; `cap2-results.json → dockTabSequence`). Keyboard users can be ejected from the dock, and screen-reader users are not told which tab is selected.

### MENU-F8 · Major · There is no UI design system; the look is "admin console"
**Evidence**
- M7: 176 unique colours, 18 font sizes, 56 padding values, 5 tokens, a single Arial stack, no motion.
- Every control starts from one generic `button` style (`style.css:39-79`). Tabs and link-like secondary actions are then re-skinned by one-off overrides (`style.css:778-792`, `:891-899`) instead of component variants.
- Panels are flat 1 px boxes with a 50 px gold tick (`style.css:563-615`). The same flat language covers the title, the dialogs and the archive (`shots/d13c-after-confirm.png`, `d15-travel-confirm.png`).
- The HUD auditor reached the same conclusion for in-play UI (HUD-F11).

**Player impact:** the menus do not look like the illustrated game they belong to. This is the root of "graphics not up to par" on every non-canvas screen, and every new screen will repeat the inconsistency.

### MENU-F9 · Moderate · Save management exposes storage internals while autosave already does the work
**Evidence**
- The Checkpoint section shows:
  - five buttons ("Save checkpoint", "Load latest autosave", "Export campaign", "Import campaign", "Restore backup");
  - a sixth conditional button, "Save this run instead";
  - three status lines and an explanatory paragraph (`main.ts:194`, `:295-299`; `shots/d06-pause-menu.png`).
- Autosave runs every 5 s while unpaused, plus on blur and pagehide (`main.ts:1879-1892`, `:1950-1954`). Two consequences:
  - "Save checkpoint" is almost always redundant;
  - "Load latest autosave" is effectively "undo the last ≤ 5 s".
- "Restore backup" goes back exactly one rotation (M9). Its disabled state gives no reason (`work/shots/m01-returning-boot-desktop.png`).
- Conflict copy speaks in storage terms ("Load the newer checkpoint or export this tab", `main.ts:516-518`).

**Player impact:** players must understand checkpoints, autosaves, backups and tabs to feel safe. The one thing they need ("my progress is saved; here is how to move it") is buried.

### MENU-F10 · Moderate · Navigation archive: a crushed travel button, placeholder planets, a list instead of a map, and no arrival moment
**Evidence**
- "Travel to Ice comet" auto-places into the 60 px icon column (`style.css:1169-1176`; `main.ts:1353-1359`) and renders 60×80 px over four lines on desktop and phone (`cap2b-results.json`; `shots/d13c-after-confirm.png`; `work/shots/m07-navigation-phone.png`).
- Planet "art" is CSS: W01 and W04 share the same polygon and gradient (`style.css:1197-1210`). The illustrated `world-w01`/`world-w02` icons go unused.
- The archive lists 4 of 15 worlds with prose status; no route structure is shown (`main.ts:1295`).
- The travel confirmation is one paragraph ending in "Confirm", and reports "Bank 0 cargo packages and 0 mission objects" (`shots/d15-travel-confirm.png`). It warns "refuel … before leaving" but offers no refuel action.
- Arrival opens on the Service tab (`shots/d16-w02-arrival.png`).

**Player impact:** travel, the campaign's biggest progression beat, feels like a settings list. The broken button is the first thing the owner noticed.

### MENU-F11 · Moderate · Overlays have no back-stack, and locked features fail silently
**Evidence**
- Before M2, "Star map" in the pause menu is enabled. Pressing it writes a message to `#campaign-message`, which is `visibility:hidden` while any overlay is open (`main.ts:532-539`; `style.css:1230-1237`). The player sees nothing (`cap1-results.json → lockedStarMap`; `shots/d09-star-map-early.png`).
- `openOverlay()` closes every dialog, and `closeOverlay()` returns straight to gameplay (`main.ts:490-528`):
  - terminal → Navigation → "Return to mine" undocks you;
  - pause → Star map → Esc resumes play (`cap4-results.json`).
- "Navigation" looks like a terminal tab but opens a different dialog (`main.ts:195`).

**Player impact:** buttons that do nothing and "back" that throws you out break trust and orientation.

### MENU-F12 · Moderate · Confirmation dialogs are generic, and recovery ends in the settings page
**Evidence**
- One dialog template (`main.ts:197`, `:1460-1473`) serves six different decisions: launch, travel, recovery, import, restore and new campaign.
  - Every one uses the same eyebrow, "EXPEDITION DECISION", and the same buttons, "Cancel / Confirm".
  - The destructive "Begin a new campaign?" uses the amber primary style (`work/shots/m03-new-campaign-confirm.png`).
- Consequences are paragraphs; the recovery body is 43 words (`cap3-results.json → recoveryConfirm_desktop`; `work/shots/m06b-recovery-confirm-desktop.png`).
- After recovery the game opens the full pause menu ("Expedition restored · paused"). The outcome message ("Recovered for 100 CR. Carried cargo lost…") is hidden behind it (`work/shots/m06c-after-recovery-desktop.png`; `main.ts:1645-1652`).
- The disabled-rig card itself (`work/shots/m06a-disabled-overlay-desktop.png`) is clear and should be kept.

**Player impact:** players learn to click "Confirm" without reading. After the most painful event in the game they get no summary of what they lost, and are dropped into a menu.

### MENU-F13 · Moderate · Text size and "Larger text" fall short of the pinned 14–16 px target, and disabled or locked information is hard to read
**Evidence**
- 75–77 % of menu words are at ≤ 12 px (M2, M3), against "Target 14–16 CSS px body text" (`docs/DESIGN_PACK_IMPLEMENTATION.md:134`).
- Larger text scales only `p` and `button` inside panels (`style.css:1266-1269`). 65 Hardware-tab words stay at 12–13 px with it on (`cap2b-results.json → largeTextHardware`).
- Disabled prices measure 2.88:1 and 1.86:1, and locked milestone copy 3.21:1 (M6).
- High contrast affects only HUD text shadows and meters (`style.css:1254-1265`), never the panels.

**Player impact:** phone players and low-vision players struggle most in exactly the screens where decisions are made.

### MENU-F14 · Moderate · Remapping is lossy and minimal, and settings are not remembered
**Evidence**
- Rebinding replaces the whole binding list: Arrow + WASD becomes one key (M10; `work/shots/m02b-remap-after.png` shows "Steer left: J").
- There is no reset to defaults and no swap on conflict ("J is assigned to Steer left. Choose another key."). There is no controller remapping.
- Tab is the default star-map key (`input.ts:35`).
- The sound on/off state is not persisted (FEEL-F1).

**Player impact:** players who customise controls lose the alternate keys they rely on and cannot undo. Sound has to be re-enabled every session.

### MENU-F15 · Moderate · Phone layouts show one card at a time and hide tabs
**Evidence**
- The terminal sheet is 67 % of the screen with a 414 px content viewport, so 1 hardware card is fully visible (M3; `work/shots/m10-phone-hardware.png`, `shots/p05-dock-hardware.png`).
- The sixth tab is off-screen (`m11-phone-six-tabs.png`).
- The pause menu spans 2.5 screens in portrait and 3.49 in landscape (`shots/p04-pause.png`, `work/shots/m04-pause-landscape.png`).
- Header buttons stack in a column (`style.css:1923-1926`).

**Player impact:** shopping on a phone becomes a scroll-and-read exercise, and Navigation is effectively hidden after M2.

### MENU-F16 · Minor · The UI ignores most of the art the pipeline already produces
**Evidence:** 17 of 198 exported icons are used (M8). There are no ore or package icons in cargo lists or the legend, no mission-part icons, CSS planets instead of `world-w0x`, and no construction-stage art in the Lander tab, although `dock-stage-0…3`, `refuge-stage-*` and `relay-stage-*` exist (`docs/CAMPAIGN_ASSETS.md`; `work/unused-icons-sheet.png`).

**Player impact:** the screens look less illustrated than the game actually is, and the cheapest visual upgrade available is being skipped.

---

## 6. Redesign specification

### 6.1 Principles

1. **Show, then tell.** Every decision screen leads with a picture: the rig, the lander stage, the planet, the item icon. Numbers come second, and prose last (≤ 2 lines per card).
2. **One next step.** Every screen has one primary action, which is also the default focus and the default A/Enter. The "Next" strip (FTUE-P4) is a shared component.
3. **Earned moments.** Sale, install, construction, launch and arrival each get a short (≤ 1.5 s), skippable, sound-backed beat. Reduced motion gets a static equivalent.
4. **Safe by design, quiet by default.** Autosave is the default and is shown as one status chip. Destructive actions are rare, isolated, red and reversible (archives).
5. **One input model.** Mouse, touch, keyboard and gamepad reach every control. Focus is always visible, restored after updates, and never lands on an exit.
6. **One system.** Tokens, two typefaces and roughly 15 components, shared with the HUD tokens in `05-hud.md` §5.4.

### 6.2 Screen map (target)

```
BOOT ─▶ TITLE ─┬─ Continue ───────────────▶ PLAY
               ├─ New expedition (archive + hold-to-confirm) ─▶ PLAY
               ├─ Settings ─┐                 (same panels as Pause › Settings)
               ├─ Controls ─┤
               └─ Credits   │
PLAY ─ Esc/Start ─▶ PAUSE [Expedition | Cargo | Field guide | Settings | Controls | Save data] ─ Quit to title
PLAY ─ E/LB at lander ─▶ TERMINAL [Trade | Workshop | Construction | (Navigation)]
                           ├─ Sale summary (sheet) ─▶ "Next" CTA
                           ├─ Install beat (inline)    ├─ Construction beat (1.5 s)
                           └─ Navigation ─▶ STAR MAP ─▶ Pre-flight ─▶ Launch sequence ─▶ Arrival card ─▶ TERMINAL (new world)
Overlay stack: every child screen returns to its parent (Esc / B / Back), never straight to PLAY.
```

### 6.3 Wireframes

Desktop renders of A, B (Workshop), C (sale), D (pause) and E (map) are in `work/shots/mock-title.webp`, `mock-workshop.webp`, `mock-sale.webp`, `mock-pause.webp` and `mock-map.webp`. They use the real SVG art and the proposed tokens and fonts.

**A · Title (desktop 1440×900, live world behind, HUD hidden)**
```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                     [♪ Sound on] [⛶]       │
│  M O T H E R L O A D            (SVG wordmark, stencil, amber drop edge)    │
│  T H E   D E E P   F R O N T I E R                     ◐ planet             │
│  ────────                                                                   │
│                                                                             │
│  ┌──────────────────────────────┐                                           │
│  │ ▶ Continue expedition      › │  ← focused, A/Enter                       │
│  └──────────────────────────────┘                                           │
│  ┌──────────────────────────────┐            ┌──┐   ╔═╗                     │
│  │ ⬢ Broken asteroid · Stage 2/3│        ⌂refuge│  │  ║ ║ lander  ┬ relay   │
│  │ 1,160 CR · deepest 312 m     │   rig ▣═╗     └──┘  ╚═╝         │         │
│  │ Saved 2 min ago · this browser│ ════════════════════════════════════════ │
│  └──────────────────────────────┘  (GFX-P10 framing, slow parallax drift)  │
│  [ New expedition        NEW SEED ]                                         │
│  [ Settings ]  [ Controls ]  [ Credits ]                                    │
│                                                                             │
│ v0.2 · saves stay in this browser · Export in Save data   ↑↓ Select  Ⓐ OK   │
└────────────────────────────────────────────────────────────────────────────┘
First run: "Begin expedition" replaces Continue and the save card shows the
destination brief ("Broken asteroid · 600 m · Recover the core").
```
Phone (393×851): the wordmark is at the top, the world band in the middle with the lander in view, and the buttons in the bottom thumb zone. Continue sits 64 px tall at the bottom. Settings, Controls and Credits share one row of three.

**B · Terminal: Workshop (desktop, panel 760 px; phone = 90 % sheet with a sticky CTA)**
```
┌ LANDER TERMINAL · W01 ─────────────────────── (CR 1,160)  [Undock Esc] ┐
│ NEXT ▸ Fund stage 2 · antenna still at 400 m       [Go to Construction ›]│
│ [Q] Trade │ Workshop │ Construction ① │ Navigation 🔒               [E] │
├───────────────────────────┬─────────────────────────────────────────────┤
│ YOUR RIG                  │ ENERGY · rank 0 → 1        (Blueprint ready)│
│      ┌──────────────┐     │ ▣ Salvaged reservoir                        │
│      │  (rig SVG    │     │ Capacity      ████████▒▒▒▒░░░░   10 → 16 L  │
│      │  stack, new  │     │ Cutting time  ████████▒▒▒▒░░░░   32 → 51 s  │
│      │  part glows) │     │ Refill cost   ███░░░░░░░░░░░░░        +6 CR │
│      └──────────────┘     │ "A bigger tank. Purchase fills it."          │
│ [Drill ▮▯▯] [Energy ▮▯▯]◀ │ ┌─────────────────────────────────────────┐ │
│ [Cargo ▮▯▯] [Hull   ▮▯▯]  │ │ After: 510 CR · full service 4 CR       │ │
│ [Engine▮▯▯] [Mobility  ⌧] │ │                 [ Install · 650 CR ]    │ │
│ [Processor 🔒 stage 2 ]   │ └─────────────────────────────────────────┘ │
│                           │ OTHER UPGRADES                               │
│                           │ ▣ Hull · Salvaged plating     +8 HP   450 CR │
│                           │ ▣ Drill · Salvaged auger   ×1.4  750 · need 240│
├───────────────────────────┴─────────────────────────────────────────────┤
│ [Q][E] Tabs  [↑↓] Slot  [Enter]/Ⓐ Install  Ⓑ Back          Uplink ready│
└──────────────────────────────────────────────────────────────────────────┘
```

**C · Terminal: Trade, and the sale summary sheet**
```
Trade (at rest)                              Sale summary (after "Unload & sell")
┌ HOLD 7/7 · 560 CR ───────────────────┐    ┌ CARGO SOLD ─────── +1 mission part ┐
│ ▣Ironium ×3  ▣Bronzium ×2  ▣Silv ×1  │    │ ▣ Ironium     ×3   30     90 CR    │
│ ▣Goldium ×1 (rare)  ◆Valve (mission) │    │ ▣ Bronzium    ×2   60    120 CR    │
│ [ Unload & sell · 560 CR ]  (A)      │    │ ▣ Silverium   ×1  100    100 CR    │
│ [ Bank only ] (Y)                    │    │ ▣ Goldium ★   ×1  250    250 CR    │
├ SERVICE ─────────────────────────────┤    │ TOTAL (count-up 0.8 s)  +560 CR    │
│ ⚡ 4.2 → 10 L  ███████░░░  [Refuel 5.8]│    │ Balance 600 → 1,160 CR             │
│ ⛨ 7 → 10 HP   ██████░░░░  [Repair 45] │    │ ◆ Pressure valve banked · stage 2  │
│ [ Full service · 50.8 CR ]           │    │   1 of 2 parts                     │
├ WAREHOUSE (stored) ──────────────────┤    │ [Stay in Trade] [Upgrade the rig ›]│
│ 0 packages                [Sell all] │    └────────────────────────────────────┘
└──────────────────────────────────────┘
```

**D · Terminal: Construction**
```
┌ STAGE 2 OF 3 · RECOVER THE LANDER PARTS ────────────────────────────────┐
│  now ▸ [dock-stage-1 art]    next ▸ [dock-stage-2 art, ghosted 40 %]     │
│  ✓ Pressure valve banked                                                 │
│  ○ Antenna · 400 m · not found   [Show on star map ↗] (locator)          │
│  ○ Fund 300 CR · you have 1,160 ✓                                        │
│  Unlocks: External cargo rack · Navigation archive (data-driven, PROG-P9)│
│  [ Fund stage 2 · 300 CR ]  (disabled → "Bank the antenna first")        │
│  ── stage 1 ✓ installed ── stage 3 🔒 restore the lander (600 m core) ── │
└──────────────────────────────────────────────────────────────────────────┘
Funding beat: the panel slides aside 1.2 s → the lander art cross-fades to the next stage
with sparks → "BLUEPRINTS UNLOCKED" cards (icons) → back, with focus on [View in Workshop].
```

**E · Pause: Expedition tab (desktop rail; phone = segmented tabs on top)**
```
┌──────────────┬─────────────────────────────────────────────────────────┐
│ Paused       │ [ Resume expedition  Esc ]   ✓ Saved 12 s ago   W01·180 m│
│ ▸ Expedition │ ┌ RIG CONDITION ─────────┐ ┌ STAGE 1 OF 3 ──────────────┐ │
│   Cargo      │ │ ⚡ ▰▰▱▱▱▱ 2.2/10 L (amber)│ │ ✓ Survey beacon · 100 m    │ │
│   Field guide│ │ ⛨ ▰▰▰▰▰▰ 10/10          │ │ ○ Bank 3 ore · 0/3 (2 on)  │ │
│ ──────────── │ │ ▣ ▰▰▱▱▱▱ 2/7            │ │ ○ Fund 200 CR              │ │
│   Settings   │ │ ⚠ Home needs ≈1.9 L     │ │ Unlocks: rank-1 · feet     │ │
│   Controls   │ └────────────────────────┘ └────────────────────────────┘ │
│   Save data  │ ┌ FLIGHT RECORD ─────────┐ ┌ HOLD · 2 · 60 CR ──────────┐ │
│ ──────────── │ │ Credits 20 · Deepest 180│ │ ▣ Ironium ×2   60  [Eject] │ │
│   Quit to    │ └────────────────────────┘ └────────────────────────────┘ │
│   title      │ ┌ RECENT (HUD-P3 log) ──────────────────────────────────┐ │
│              │ │ ! Hold full · Bronzium left at 122 m          0:41 ago│ │
│              │ └───────────────────────────────────────────────────────┘ │
│              │ Stuck? Recovery tows you home.   [Request recovery · 20 CR]│
└──────────────┴─────────────────────────────────────────────────────────┘
Settings tab: Audio (Sound on/off · Master · Effects · Interface · Ambience · Music) ·
Display (Fullscreen · Text size 100/120/140 % · High contrast · Reduced motion) ·
Gameplay (Drill hold/toggle · Feet hold/toggle · Direction buttons · Navigation assists).
Controls tab: device tabs [Keyboard | Controller | Touch], with a diagram plus a binding
table (Primary | Secondary | ⟲), [Reset all].
Save data tab: current campaign card · [Export file] · [Import file] ·
Archived campaigns (≤ 3: Restore / Export / Delete) · Advanced ▸ "Rewind to previous
autosave (12:41:07)".
```

**F · Star map (desktop; phone = map on top, details as a sheet)**
```
┌ NAVIGATION · FRONTIER ERA ───────────────────────────┬ W02 · SELECTED ROUTE ─┐
│                    ◇ Ice comet (available)           │   [comet art 120 px]   │
│        ╱‾‾‾‾‾‾‾‾‾‾                ╲ ┄┄┄┄              │   Ice comet            │
│  ◎ Broken asteroid                   ◌ Iron planet    │   0.35 g · 1000 m      │
│   (you are here 3/3) ╲┄┄┄┄ ◌ Fractured moon ┄┄╱       │ ✓ cargo banked (0)     │
│                           (charted · in development)  │ ! arrive 6/10 L [Refuel]│
│ legend: ● visited ● available ● locked ┄ future       │ ✓ hull 10/10           │
│                                                       │ [ Launch to Ice comet ›]│
└───────────────────────────────────────────────────────┴────────────────────────┘
Launch sequence 2.5 s (skippable): lander lifts, camera pans up, map route draws,
then the arrival card "ICE COMET · 0.35 g · first goal: thermal seam at 150 m"
[Enter refuge].
```

**G · Dialog variants and recovery outcome**
```
NEUTRAL/PRIMARY                     DESTRUCTIVE                       RECOVERY OUTCOME
┌ TRAVEL ───────────────────┐      ┌ ⚠ START A NEW CAMPAIGN ────────┐ ┌ TOWED HOME ──────────────┐
│ Travel to Ice comet?      │      │ Your current campaign is        │ │ −100 CR recovery fee     │
│ You keep: rig, credits,   │      │ archived (Save data) and can be │ │ Lost: 4 packages (180 CR)│
│  shafts, stored cargo     │      │ restored later.                 │ │ Kept: banked cargo, gear │
│ Banked first: 0 packages  │      │ Hold to confirm ▓▓▓▓░░ 1 s      │ │ Energy 5/10 · Hull 10/10 │
│ [Cancel] [Travel ›]       │      │ [Cancel]   [Hold: Start new]    │ │ [Back to work] (focused) │
└───────────────────────────┘      └─────────────────────────────────┘ └──────────────────────────┘
```

### 6.4 Design tokens (shared with HUD §5.4; full file `work/mock/tokens.css`)

```css
:root {
  --font-logo: "Saira Stencil One", "Big Shoulders Display", sans-serif; /* or an SVG wordmark (D2) */
  --font-display: "Big Shoulders Display", "Arial Narrow", sans-serif;   /* titles, numbers in big type */
  --font-ui: "Inter", "Arial", sans-serif;                               /* = HUD --hud-font */
  --ui-scale: 1;                         /* 1.2 / 1.4 from Settings › Text size */
  --text-xs: calc(12px*var(--ui-scale)); /* captions only */
  --text-sm: calc(14px*var(--ui-scale)); /* secondary body */
  --text-md: calc(16px*var(--ui-scale)); /* body, buttons */
  --text-lg: calc(20px*var(--ui-scale)); --text-xl: calc(28px*var(--ui-scale)); --text-2xl: calc(40px*var(--ui-scale));
  --surface-1:#0f1d24; --surface-2:#152831; --surface-3:#1d3640; --surface-4:#26454f;
  --line:#2e4a52; --line-strong:#56757a;
  --text-1:#eef4ea; --text-2:#c0d0c8; --text-3:#97aea7;
  --accent:#f2b65a; --accent-hi:#ffd08a; --accent-ink:#1c1306;
  --credit:#f3c47e; --energy:#7fd8e0; --hull:#e8a28f; --ok:#8fe0b8; --caution:#ffc55c;
  --danger:#ff6b4f; --danger-ink:#ffb3a3; --locked:#6f8a88;
  --radius-sm:4px; --radius-md:8px; --radius-lg:14px; --chamfer:12px;
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s6:24px; --s8:32px;
  --dur-fast:120ms; --dur-med:220ms; --dur-slow:420ms; --dur-count:800ms;
  --ease-out:cubic-bezier(.2,.8,.2,1); --ease-spring:cubic-bezier(.34,1.56,.64,1);
  --focus:0 0 0 2px var(--surface-1), 0 0 0 4px #a8f0e8;
}
```

Contrast of the proposed tokens is verified in `work/token-contrast.json`:
- `text-1` / `text-2` / `text-3` on `surface-1`: 15.4 / 10.7 / 7.3.
- `text-3` on `surface-4` is 4.36, so `text-3` must never be used on `surface-4`.
- `locked` reaches 4.6 on `surface-1` only, and must always be paired with a lock icon.
- `accent-ink` on `accent`: 10.1.
- Button edge `line-strong` on `surface-1`: 3.46.

### 6.5 Typography

- **Faces (all SIL OFL, self-hosted woff2 latin subsets measured in `work/mock/fonts/`):**
  - display: Big Shoulders Display (variable, 35.4 KB);
  - UI: Inter (variable, 48.3 KB; tabular figures via `font-variant-numeric: tabular-nums`);
  - logo: either Saira Stencil One (20.8 KB) or, preferably, an SVG wordmark drawn in the existing layered-SVG pipeline (0 KB of font at runtime).
  - Total **≈ 84 KB** for two families.
  - Use `font-display: swap` with `size-adjust`/`ascent-override` fallbacks so the swap causes no layout shift. The wordmark is SVG, so the title never flashes.
- **Scale:** 12 (caption) / 14 (secondary) / 16 (body, buttons) / 20 (card title, values) / 28 (screen title, display face) / 40+ (hero). Rules:
  - caps labels stay at 12 px with +0.14 em tracking;
  - body text is never below 14 px;
  - all numbers use tabular figures;
  - the display face is reserved for titles, big values and the star map.
- **Larger text** sets `--ui-scale` (1.2 / 1.4), so every token scales together, unlike today's `p`/`button` rule.

### 6.6 Component library (`src/campaign/ui/components.ts` + `ui.css`)

| Component | Variants and states | Notes |
|---|---|---|
| Button | primary · secondary · ghost · danger · **locked** (dashed edge, lock, reason) · **short** (price + "need 240" + credit progress) · loading | replaces `opacity .38`; `aria-disabled` keeps it focusable so the reason can be read |
| Tabs | top (terminal, phone pause) · rail (desktop pause) | `role=tablist/tab/tabpanel`, roving tabindex, ←/→/Home/End, Q/E, LB/RB; badge slot ("1/2") |
| Panel / Sheet | side (desktop terminal) · modal (pause, dialogs) · bottom sheet with 50 %/90 % snaps (phone) | chamfered corner, 3 px accent tick, header slot, hint-bar slot |
| Card / ItemRow | icon · title · meta · price · actions | used by cargo, warehouse, legend, upgrades |
| Slot (paper-doll) | empty · owned · selected · locked · new | rank pips, glow on install |
| StatBar | now / gain / loss segments, numeric before → after | normalised to the chapter's rank range |
| Price / Credits chip | neutral · gain · spend | count-up/down animation hook |
| Chip / Badge | ok · accent · caution · locked | "Owned", "Rare", "Blueprint ready", "In development" |
| KeyCap / PadGlyph | keyboard · standard pad (A/B/X/Y/LB/RB) | follows the last-used device |
| HintBar | per screen | lists the 3–5 actions that are live now |
| NextStrip | single CTA | FTUE-P4 content |
| Toggle switch, Slider with value, Segmented control | – | replace bare checkboxes and unlabelled ranges |
| Dialog | neutral · primary · danger (hold-to-confirm) | consequence lists: You keep / You lose / Cost |
| SummarySheet | sale · construction · recovery outcome · arrival | shared count-up and stagger timing |
| StatusChip (save) | saved · saving · offline · conflict | one line, replaces three status paragraphs |

### 6.7 Motion and UI sound

| Event | Motion (normal) | Reduced motion | Sound (Interface bus; all > 300 Hz so laptop and phone speakers play it, cf. FEEL-F1) |
|---|---|---|---|
| Panel open/close | fade + scale .98→1, 160 ms ease-out | fade 100 ms | soft hiss-click 1.2 kHz, 40 ms |
| Focus move (pad/keys) | ring slides 90 ms | instant | tick 1.8 kHz, 12 ms, −30 dB |
| Tab switch | underline slides 180 ms; content cross-fade 120 ms | instant | click 1.4 kHz |
| Confirm / Back | button press scale .97, 60 ms | none | 660→990 Hz up / 990→660 Hz down, 90 ms |
| Denied (locked, short) | 3 px shake ×2, 180 ms + reason pulse | reason highlight | 180 Hz square, 120 ms, quiet |
| Install | button → "Installed ✓" morph 220 ms; slot glow 600 ms; part pops 1.15→1 (spring); credits count down 600 ms | static ✓ and new value | thump 140 Hz + ratchet click 2 kHz + chime 520/780 Hz |
| Sale | rows stagger 60 ms; total counts up 800 ms; header credits count up | final values | coin ticks 2.4 kHz per 10 %, closing arpeggio 523/659/784 Hz |
| Construction funded | 1.2 s stage cross-fade + spark burst (GFX); unlock cards stagger | cards only | three-note fanfare + low swell |
| Launch / arrival | 2.5 s lift-off + route draw; arrival card slides in | cut to the card | rumble ramp + whoosh; arrival chord |

- Every beat is skippable with A, Enter or Esc.
- Mechanical state commits **before** the animation, so saves and timing are unaffected.
- Implement the sounds in `audio.ts` as `ui(kind)` on a new "Interface" bus, defaulting to 0.5 and saved in preferences.

### 6.8 Focus and controller navigation

- **FocusManager** (`src/campaign/ui/focus.ts`):
  - an overlay stack (`push(screen)`, `pop()`), each screen declaring its initial focus;
  - the default initial focus targets: title → Continue/Begin; pause → Resume; terminal → the Next CTA, or the selected tab when there is no CTA; confirm → Cancel for danger dialogs, the primary action otherwise; star map → the current or selected node.
- **Restoration:** after any re-render, re-focus the element with the same `data-command`. If it is gone or disabled, use the next actionable sibling in the same card, then the tab. Restore `scrollTop`.
- **Repeat guard:** for 300 ms after an overlay opens, ignore `keydown` events with `repeat === true` and gamepad A held from before the opening.
- **Keyboard:**
  - Tab/Shift+Tab move focus;
  - arrows move within lists, grids and tabs (roving tabindex);
  - Q/E or PageUp/PageDown switch tabs;
  - Enter/Space activate; Esc goes back (pops the stack);
  - the star map uses M as well as Tab, because Tab conflicts with focus navigation.
- **Gamepad (standard mapping):**
  - D-pad or left stick: spatial navigation to the nearest focusable in that direction (rect centres, a 45° cone, wrapping inside the panel), with a 180 ms first repeat and 90 ms after; stick dead zone 0.5;
  - A activate · B back · LB/RB tabs · X compare/details · Y secondary action (Bank only, Eject) · Start pause/resume · View star map.
- **HintBar** shows the glyphs of the last-used device: keyboard caps or pad glyphs. Touch hides it.
- **Focus visibility:** a `--focus` ring of two box-shadows that is never clipped. Tab containers drop `overflow` on desktop and use an inset ring on phones.

### 6.9 Copy rules

- **Buttons say the verb and the price:** "Install · 650 CR", "Travel to Ice comet", "Tow me home · 20 CR", "Start new campaign". Never "Confirm".
- **Consequences are lists:** You keep / You lose / Cost / You arrive with. At most 40 words of prose per dialog.
- **Names come from one glossary** (HUD-P6 `names.ts`), with per-rank hardware names from the design pack and no designer IDs (PROG-P9). Save language is "Saved", "Export", "Archive". "Checkpoint", "autosave" and "backup" only appear in Advanced.

---

## 7. Proposals (highest priority first)

Effort is for one experienced developer: S ≤ 1 day, M 2–4 days, L 1–2 weeks, XL > 2 weeks.

### MENU-P1 · Safety and interaction fixes (M, 2–3 days · impact high)
**Addresses:** F1 (mitigation), F7, F10 (button), F11, F15 (tabs), parts of F4 and F5.

**What and how**
1. **Archive before replacing a campaign.**
   - Add `CampaignStore.archive(label)`. In the same IndexedDB transaction as `replace()`, it copies the outgoing raw primary to key `archive:<ISO time>` in the existing `checkpoints` object store and keeps the newest 3 (`persistence.ts:314-352`, `CampaignBackend.commit` gains an optional `archive` argument).
   - Call it from `replaceCampaign()` for New/Import/Restore (`main.ts:1474-1496`).
   - Correct the copy: "Your current campaign is archived. Restore it from Save data."
2. **Focus and scroll restoration in `renderDock`/`renderMenu`/`renderMap`.** Remember `activeElement.dataset.command` and the scroll container's `scrollTop` before the `innerHTML` swap, and restore them afterwards with the fallback chain in §6.8 (`main.ts:1286`, `:586-632`, `:1290-1370`).
3. **Terminal focus.**
   - Initial focus moves to the selected tab, not Undock.
   - Add the repeat guard in `input.ts` keydown (`:150-219`) and in `pollCommands`.
4. **Real tabs.**
   - `role="tablist"`/`tab`/`tabpanel`, `aria-controls`, roving tabindex and arrow keys.
   - Move "Navigation" out of the tab row into a header "Star map" button, or make it a real tab.
   - Fix the clipped ring with an inset box-shadow (`style.css:769-792`).
5. **Travel button.** `.world-card > button, .world-card > .travel-reason { grid-column: 2; justify-self: start; }` (`style.css:1169-1196`).
6. **Locked actions explain themselves.**
   - Disable the pause "Star map" before M2 with a visible reason line.
   - Route `showMessage()` to the open overlay's status line: `#campaign-dock-message`, or a new `#campaign-menu-message` (`main.ts:429-435`, `:532-539`).
7. **Back-stack.**
   - `openOverlay(kind)` pushes the current overlay and `closeOverlay()` pops to it.
   - The archive's close label becomes "Back" when it has a parent (`main.ts:490-528`, `:196`).
8. **Messages and names.**
   - "Unload & sell" reports both results ("Banked the pressure valve · sold 7 packages for 560 CR").
   - Hardware labels and install messages come from a per-rank table that uses the design-pack series names, Salvaged / Survey / Hydraulic assembly (`main.ts:1007-1013`, `model.ts:932`).
9. **Polish.**
   - Spacing above "Protected mission compartment" (Cargo tab).
   - Distinct W04 symbol until P10.
   - Phone tab row: icons, short labels and an edge fade; scroll the selected tab into view.

**Acceptance**
- `cap6-backup.mjs` variant: New campaign → resume → play 60 s → Save data lists the old campaign → Restore returns the old seed.
- After any purchase, `document.activeElement` is the same command's button (or its fallback), and `scrollTop` is unchanged ±1 px.
- Holding Enter at the lander for 1 s leaves the terminal open.
- Arrow keys switch tabs. An ARIA check (for example axe-core's `aria-allowed-attr` rule) passes on the terminal: no `aria-selected` on plain buttons.
- The travel CTA renders on one line and is ≥ 200 px wide at 1440×900 and 393×851.
- Pressing a locked star map shows its reason inside the menu.
- Terminal → Navigation → Back returns to the terminal; pause → Star map → Esc returns to pause.
- The W02 rank-2 drill card and message name the rank-2 part.
- Unit tests cover the archive rotation in `tests/campaign-storage.audit.ts`.

**Dependencies:** none. **Deviation:** none from approved decisions. Archives live under new keys of the existing IndexedDB namespace (`motherload.campaign.v1`). The namespace and checkpoint envelope stay stable, as approved.

### MENU-P2 · Autosave-first save model and a "Save data" screen (M, 3–4 days · impact high)
**Addresses:** F9, F1, F3 (save summary).

**What**
- The pause header shows one status chip: "✓ Saved 12 s ago · this browser", "Saving…", or "⚠ Not saved: export now".
- Remove "Save checkpoint" and "Load latest autosave" from the main UI.
- The **Save data** tab and title panel contain:
  - a current-campaign card (world, stage, credits, play time, last saved);
  - **Export file** (primary) and **Import file**;
  - **Archived campaigns** (≤ 3: Restore, Export, Delete);
  - *Advanced ▸* "Rewind to previous autosave (hh:mm:ss)", which is today's "Restore backup", now with its time and reason.
- Conflict and protected states become one blocking dialog with three plain choices:
  - "Use the newer save from your other tab";
  - "Keep playing this run" (archives the other run and replaces it);
  - "Export this run first".
- `CampaignStore.load()` returns a summary (world, credits, milestones, `savedAt`, `elapsed`) for the title card.

**How**
- `main.ts:194` (Checkpoint section), `:295-299`, `:1371-1459`, `:1587-1633`.
- `persistence.ts`: `summary()`, `listArchives()`, `restoreArchive(id)`.
- Keep the explicit-Resume rule for restored runs. Continue on the title is that explicit action.

**Acceptance**
- The main pause view shows ≤ 1 save status line and 0 storage-jargon words ("checkpoint", "autosave", "backup").
- The existing storage smoke (`scripts/campaign-storage-smoke.mjs`) and two-tab conflict checks still pass, with the new dialog text.
- Export → Import round-trips the same seed and credits.
- Archive tests pass.

**Dependencies:** P1 (archive). **Deviation:** changes the save UI documented in README/USABILITY_REVIEW ("Load uses the latest checkpoint…"). That is an implementation choice, not an approved decision. Explicit Resume after a restore is kept.

### MENU-P3 · Design foundation: tokens, two typefaces, component kit (M, 3–4 days · impact high)
**Addresses:** F8, F13 (and enables P4–P11).

**What**
- `src/campaign/ui/tokens.css` as in §6.4, shared with HUD-P1.
- Self-host Big Shoulders Display and Inter (woff2 plus OFL licence files) under `assets/fonts/`, with `@font-face` and fallback metrics.
- Restyle the existing markup through components (§6.6). The first pass changes classes, not structure.
- Replace `opacity:.38/.52` disabled states with the locked and short variants.
- Larger text becomes `--ui-scale` (Settings offers 100/120/140 %).
- High contrast raises panel borders to 2 px and maps `text-2`/`text-3` to `text-1`.

**How**
- `style.css` is split into `tokens.css`, `ui.css` (components) and `hud.css` (HUD owner).
- `button()` (`main.ts:899-915`) gains `variant`/`reason`/`shortBy` parameters.
- Vite bundles the fonts (`vite.config.ts` needs no change).

**Acceptance (automated with the `measure()` probe over all dialogs at three viewports)**
- ≥ 80 % of words are ≥ 14 px, and none are < 12 px.
- Every text leaf is ≥ 4.5:1, computed with opacity.
- Larger text 120 % scales 100 % of text leaves by ≥ 1.2×.
- ≤ 10 colour literals outside `tokens.css`.
- Font payload ≤ 100 KB.
- CLS ≤ 0.05 during font swap.
- Screenshots of all screens at three viewports are reviewed by the owner.

**Dependencies:** coordinate with HUD-P1 (same token file; typeface decision D2). **Deviation:** none from approved decisions (the type target comes from the pinned `DESIGN_PACK_IMPLEMENTATION.md:134`). It does replace the flat "narrow terminal" look of the current implementation (`style.css:563` comment), so the owner should approve the mockups (D3).

### MENU-P4 · Title screen and front door (M, 3–4 days + 1 day wordmark art · impact high)
**Addresses:** F3, F14 (sound reachable).

**What**
- Always boot to the title. Hide the HUD, toolbar, objective and world labels while the title is up. Use GFX-P10's lander framing with a slow parallax drift.
- **Logo:** SVG wordmark plus "The deep frontier" (matches `index.html` `<title>`).
- **Menu:** Continue expedition (focused, with the save card) / Begin expedition on a first run · New expedition (archive + hold-to-confirm) · Settings · Controls · Credits.
- Sound chip top-right (FEEL-P1 default). Input-aware hint (no touch text on desktop).
- **Deploy transition:** menu fades in 300 ms, the camera eases to the rig in 600 ms, the HUD fades in.
- **Credits panel:** owner, engine (Phaser, MIT), fonts (OFL), tools.

**How**
- `main.ts:193` markup, `:1747-1755` start, `:1900-1918` boot (keep `resumeRequired` semantics: Continue clears it).
- `style.css` title block → `ui/title.css`.
- New `assets/campaign/source/logo.svg` → exported PNG/SVG.
- `scene.ts` welcome framing (GFX-P10).
- Settings and Controls reuse the pause tab panels.

**Acceptance**
- A returning boot shows the title with Continue focused; one Enter or A resumes play.
- A probe of the title finds 0 HUD numerals and no overlapping world label at three viewports.
- New expedition from the title archives the current campaign.
- Reduced motion = no drift or fades.
- Time to interactive within +100 ms of today.

**Dependencies:** P3, P2 (summary), GFX-P10 (framing), FEEL-P1 (sound default). **Deviation:** none. "The title screen sits over the world" (`docs/CAMPAIGN_W01.md:47`) is kept. Restored runs still require an explicit action (Continue) before simulation.

### MENU-P5 · Lander terminal redesign: Trade / Workshop / Construction (L, 1.5–2 weeks · impact high)
**Addresses:** F5, F15, F16 (and F4 with P6).

**What**
- **Tabs:** Trade (unload/sell/bank, service, hold and warehouse lists with icons), Workshop (hardware plus attachments), Construction (stages with art).
- **Navigation:** a header button, or a 4th tab when unlocked.
- **Workshop:**
  - the paper-doll rig is built by stacking the module SVGs that share the 128×128 canvas (`assets/campaign/source/rig-*.svg`): installed ranks are shown, and the newly installed part glows;
  - slot buttons carry rank pips;
  - the detail pane shows stat bars (now / gain) with plain-language effects, price states (affordable · short with progress · locked with reason · installed · max for this chapter), and a compact "Other upgrades" list with deltas.
- **Construction:** the current and next stage art (`dock-stage-*`, `refuge-stage-*`, `relay-stage-*` frames), a live checklist, data-driven unlocks (PROG-P9), and a Fund CTA.
- **Next strip** (FTUE-P4) at the top of every tab.
- **Phone:** a 90 % bottom sheet with snap points, icon tabs, a sticky CTA bar, and one paper-doll row of slots that scrolls horizontally.

**How**
- Replace `renderDock()` (`main.ts:942-1289`) with `ui/terminal/{trade,workshop,construction}.ts` built on the P3 components and the P12 keyed renderer.
- Derived stats come from `HARDWARE_LEVELS` (`config.ts:13-19`) and the model's preview helpers.
- Stat-bar normalisation uses the ranks reachable in the current chapter.
- Export 256 px PNG fallbacks of the rig modules via `scripts/build-campaign-assets.mjs` if SVG stacking is too costly on low-end phones.

**Acceptance**
- At 1440×900 all hardware and attachment slots and the selected detail are visible without scrolling.
- At 393×851 the selected detail plus the CTA are visible without scrolling.
- ≤ 60 words of body copy per tab at rest; 0 words < 12 px.
- Every upgrade shows a numeric before/after plus a bar.
- The rank-2 part shows its rank-2 name and art.
- Hallway check: 5 testers name the cheapest affordable upgrade in < 5 s.
- The FTUE first-dock sequence (sell → fund → refuel) completes with the Next strip alone.

**Dependencies:** P3, P12 (renderer), PROG-P9 (reward text), FTUE-P4 (Next strip content). **Deviation:** none from approved decisions. The pack asks for in-game building transactions and current → next comparisons, and this reorganises them. It changes the tab names the README documents.

### MENU-P6 · Reward and milestone beats with UI sound (M, 3–4 days · impact high)
**Addresses:** F4.

**What**
- **Sale summary sheet:** itemised by item type with icons, rare highlight (PROG-P7 tiers), total count-up, balance before → after, mission parts banked with stage progress, and a Next CTA.
- **Install beat** (§6.7).
- **Construction beat:** the panel steps aside, the stage art cross-fades, unlock cards appear, focus lands on "View in Workshop".
- **Launch:** sequence, then route draw, then the **arrival card** on the new world before its terminal.
- **UI sound set** on an Interface bus (§6.7).

**How**
- `transact()` (`main.ts:1497-1510`) returns typed results. For example, `{kind:"sale", lines, total, before, after, banked:[…]}` is built from the package list before `sell()` mutates it (`model.ts:836-852`).
- A `SummarySheet` component.
- `audio.ts` `ui(kind)`.
- Launch and arrival use `#campaign-launch` (`main.ts:191`) upgraded to a sequence; lander lift-off needs scene support (GFX D10).

**Acceptance**
- Each event shows a visible change for ≥ 600 ms with a sound (when sound is on).
- Every beat is skippable and ≤ 1.5 s by default (launch ≤ 2.5 s).
- Reduced motion gives static summaries.
- The sale summary's total equals the credit delta in the save.
- Mission parts banked by "Unload & sell" are listed.

**Dependencies:** P3. The sale sheet can ship before P5. **Deviation:** the sound default follows FEEL owner decision D1.

### MENU-P7 · Pause menu information architecture (M, 3–4 days · impact medium-high)
**Addresses:** F6, F9 (with P2), F14 (with P11), F15.

**What**
- **Tabs:**
  - Expedition: Resume, rig condition (with HUD-P2's return estimate), current stage checklist, flight record, Recent log (HUD-P3), recovery (danger style, with fee);
  - Cargo: manifest with icons and Eject;
  - Field guide: ore art plus marker plus value, hazards, and short illustrated "how to" cards replacing the three prose paragraphs;
  - Settings, Controls, Save data;
  - Quit to title.
- **Layout:** a rail on desktop, segmented tabs on phones, a two-column card grid on landscape.
- **"Start a new campaign"** moves to the title.

**How:** `main.ts:194` markup, `:202-209` appended sections, `:586-632` `renderMenu` → `ui/pause/*.ts`.

**Acceptance**
- The Expedition tab fits without scrolling at 1440×900 and 844×390 (≤ 1.0 screen).
- ≤ 120 visible words.
- Resume is focused (0 Tab presses); any setting is ≤ 2 actions from pause.
- New campaign is absent from pause.
- The legend shows the actual ore art for W01 and W02.

**Dependencies:** P3, P2; HUD-P2/P3 for return estimate and Recent log (degrades gracefully without them). **Deviation:** none (the pack keeps settings and expanded records in pause).

### MENU-P8 · Controller and keyboard navigation layer (M, 3–4 days · impact high for pad/keyboard players, medium overall)
**Addresses:** F2, F7.

**What:** the §6.8 FocusManager, spatial navigation, a gamepad mapping in menus (A/B/LB/RB/X/Y/Start/View), the HintBar with glyphs for the last-used device, and repeat guards.

**How**
- `input.ts:287-308` `pollCommands()` gains menu actions while an overlay is open (`blocked()` true).
- New `ui/focus.ts`.
- `actionKey()` (`main.ts:633-650`) is reused for glyphs.

**Acceptance:** a new `scripts/menus-gamepad-smoke.mjs`, built from `work/cap3-gamepad-recovery.mjs`, uses only the fake pad to:
1. open pause, change Text size, resume;
2. dock, sell, buy an upgrade, fund construction, undock;
3. open the star map and travel.

Throughout, focus is always visible, and the HintBar shows pad glyphs after pad input.

**Dependencies:** P1 (focus restoration). P5/P7 benefit, but this layer works on the current markup. **Deviation:** none (the pack requires controller validation).

### MENU-P9 · Dialog system and recovery outcome (S, 1–2 days · impact medium)
**Addresses:** F12, F1 (danger tone).

**What**
- `ask({ title, keep, lose, cost, confirmLabel, tone, holdMs })` replaces `ask(title, copy, op)` (`main.ts:1460-1473`), with verb labels.
- Danger tone plus hold-to-confirm for New/Import/Restore.
- Travel pre-flight with inline Refuel/Repair actions.
- Recovery confirm as lists. After recovery, an **outcome card** ("Towed home · −100 CR · lost 4 packages (180 CR) · Energy 5/10") with "Back to work" focused, instead of the full pause menu (`main.ts:1645-1652`).

**Acceptance**
- No dialog uses "Confirm".
- All three destructive flows use the danger tone and hold.
- Dialog prose ≤ 40 words.
- The recovery outcome stays on screen until dismissed and lists the cargo lost (count and CR).

**Dependencies:** P3 for styling (it can ship on today's CSS). **Deviation:** none.

### MENU-P10 · Star map and travel sequence (M, 3–4 days · impact medium)
**Addresses:** F10, F16.

**What**
- An SVG node map of `WORLD_CATALOG` (era columns, branch links), using `world-w0x` art. Undeveloped worlds appear as locked silhouettes, as the pack allows.
- Status chips; a selected-route panel with a pre-flight checklist (cargo banked, arrival energy/hull with Refuel/Repair, what persists) and a full-width "Launch to …" CTA.
- Keyboard and pad node navigation.
- Launch → arrival handoff to P6.
- Before M2 the map opens in an "offline" state with the reason instead of a silent message.

**How:** `renderMap()` (`main.ts:1290-1370`) → `ui/starmap.ts`; `WORLD_CATALOG` (`config.ts:56`) gains map coordinates; `travelPreview()` already supplies counts.

**Acceptance**
- W01–W04 have distinct art.
- The CTA is one line and full width.
- Travel needs ≤ 3 actions from the terminal.
- Arrival shows the card before the destination terminal.
- Back returns to the opener (P1).

**Dependencies:** P1, P3, P6 (sequence), GFX art for W03/W04 silhouettes (or tinted placeholders). **Deviation:** none.

### MENU-P11 · Remapping and settings completeness (M, 2–3 days · impact medium)
**Addresses:** F14, F13.

**What**
- Each action gets a primary and a secondary binding column. A conflict offers to swap. Reset per action and Reset all.
- Controller remapping for the standard mapping.
- The Controls tab shows a device diagram.
- Persist sound on/off and an Interface volume.
- A Text size control (P3). High contrast applies to panels. A Navigation assists toggle (HUD D5).
- Change the default star-map key from Tab to M, keeping Tab as the secondary binding, if the owner agrees (Tab conflicts with focus navigation).

**How**
- `input.ts:26-37` (defaults), `:38-100` (preferences schema with a version number and migration), `:158-190` (remap logic).
- `renderBindings()` (`main.ts:570-585`).

**Acceptance**
- Remapping Steer left to J keeps ArrowLeft as the secondary binding.
- Reset restores `DEFAULT_KEYS`.
- Sound state survives a reload.
- A pad remap of "Interact" to Y works in play and in prompts.
- Unit tests extend `tests/campaign-input.audit.ts`.

**Dependencies:** P7 (Controls tab). **Deviation:** none.

### MENU-P12 · UI architecture and regression harness (L, about 1 week · impact medium, enabler)
**Addresses:** F7, F8 (sustainably); supports P4–P11.

**What**
- Split `main.ts` (1,997 lines; markup, rendering, commands and boot in one file) into `src/campaign/ui/` modules: `title`, `pause/*`, `terminal/*`, `starmap`, `dialogs`, `focus`, `components`, `sound-ui`.
- Render with a keyed DOM patcher that preserves nodes, focus and scroll (about 150 lines in-house, or lit-html/Preact; see D7).
- Add `scripts/menus-smoke.mjs`, promoted from `work/cap*.mjs`, which asserts:
  - the `measure()` thresholds (sizes, words, contrast);
  - focus restoration and the back-stack;
  - the pad flows;
  - the travel CTA geometry;
  - the archive restore;
  - screenshots at three viewports.

**Acceptance**
- `main.ts` < 600 lines.
- No `innerHTML =` on containers holding focusable controls.
- `npm test` (107 tests) and the existing smoke scripts pass.
- `menus-smoke` passes in CI.

**Dependencies:** none (start in parallel with P3). **Deviation:** adding a UI library would be the project's second runtime dependency after Phaser, which is owner decision D7.

---

## 8. Incremental order

| Week | Ship | Player-visible result |
|---|---|---|
| 1 | **P1** fixes, **P9** dialogs, P2's archive | No data-loss trap, no crushed travel button, focus and scroll stay put, honest locked states, readable confirmations, recovery outcome |
| 2 | **P3** tokens, fonts and components; **P2** save model; start **P12** | Every existing screen restyled in one system; one save chip; Save data tab |
| 3 | **P4** title, **P7** pause IA | A real front door with Continue; a pause menu that fits on one screen |
| 4–5 | **P5** terminal (on P12's renderer) | Paper-doll workshop, stat bars, construction art, phone sheet |
| 6 | **P6** beats and UI sound; **P8** controller layer | Rewarding sale, install and construction; full pad play |
| 7 | **P10** star map, **P11** remapping/settings, harness hardening | Map-based travel with launch and arrival; complete settings |

Total: about 6–7 developer-weeks plus small art tasks (wordmark, optional 256 px rig exports, lift-off and spark effects via GFX). Weeks 1–2 alone remove every defect in §5 rated Critical, and most of the moderate ones.

---

## 9. Owner decisions

- **D1 · Boot destination.** Returning players boot to the title with Continue focused (recommended: one extra press, and the game finally has a front door), or straight into the paused expedition as now.
- **D2 · Typefaces and logo.**
  - Recommended: Big Shoulders Display (display) + Inter (UI, shared with HUD-D2), with the logo as a custom SVG wordmark.
  - Alternatives for the display face: Chakra Petch, Oxanium or Saira Condensed.
  - See `work/shots/mock-title.webp` for the stencil wordmark direction.
- **D3 · Shape language.** Chamfered industrial panels, 8 px cards and amber CTAs (as mocked) vs the current flat hairline terminal.
- **D4 · Save model.** Remove the manual Save/Load buttons in favour of autosave + Save data, and keep up to 3 archived campaigns (a checkpoint measured at most about 93 KiB for W01 and 240,777 bytes for two worlds, per `docs/CAMPAIGN_W01.md:41` and `docs/CAMPAIGN_W02.md:49`).
- **D5 · New campaign.** Recommended: title only, with hold-to-confirm and automatic archive.
- **D6 · Terminal tabs.** Consolidate to Trade / Workshop / Construction (+ Navigation), or keep five or six tabs.
- **D7 · UI rendering.** An in-house keyed renderer (no dependency) vs lit-html or Preact (about 4–5 KB gzip, MIT/BSD).
- **D8 · Controller scope.** Standard mapping with generic A/B/X/Y glyphs (recommended first), or per-brand glyph sets.
- **D9 · UI sound palette** (synth, matching FEEL's direction) and a separate Interface volume.
- **D10 · Ceremony length.** Construction ≤ 1.5 s and launch ≤ 2.5 s, both skippable. Decide whether the lander physically lifts off, which needs scene and art work (GFX).
- **D11 · W01 ore names** (Ironium, Bronzium, Silverium, Goldium) coincide with the 2004 game's minerals (HUD-D8). Rename them before building item art into sale summaries and the field guide, so the new UI does not cement them.
- **D12 · Default star-map key.** M (recommended) instead of Tab, which collides with keyboard focus navigation.

---

## 10. Cross-references

- **05-hud (HUD):**
  - Token set and typeface (HUD-P1, D2) are shared with P3.
  - The "Recent" log (HUD-P3) and return estimate (HUD-P2) feed the pause Expedition tab (P7).
  - The naming glossary (HUD-P6) feeds §6.9.
  - Mineral names: D11 = HUD-D8.
- **02-first-session (FTUE):**
  - The in-dock Next strip (FTUE-P4) is a P5 component.
  - Payoff moments (FTUE-P8) are implemented on the terminal side by P6.
  - Terminal reopening on the last tab (FTUE-F5) is resolved by P5's Next strip and initial focus.
  - The lander label over the title (FTUE-F8) is fixed by P4's label hiding.
- **03-feel (FEEL):** the sound default and audibility (FEEL-F1, P1, D1) underpin P4's sound chip and P6's UI sounds.
- **04-graphics (GFX):**
  - Title framing (GFX-P10, D9) is the background of P4.
  - Lift-off and construction effects for P6.
  - Canvas typography (GFX-P12) should use the P3 font.
- **01-progression (PROG):** unlock text from data (PROG-P9) feeds Construction (P5); reward tiers (PROG-P7) feed the sale summary highlight (P6); records (PROG-P10) belong in the Expedition tab.

---

## 11. Evidence index (paths relative to `docs/improvement-plan/`)

- Report: `analysis/06-menus.md`
- Scripts and results: `work/menus/{menus-lib.mjs, cap1-title-pause.mjs, cap2-terminal.mjs, cap2b-terminal.mjs, cap3-gamepad-recovery.mjs, cap4-backstack-phone.mjs, cap5-launch.mjs, cap6-backup.mjs, contrast.py, css-token-audit.py, render-mock.mjs}` and `{cap1,cap2,cap2b,cap3,cap4,cap5,cap6}-results.json`, `contrast.json`, `token-contrast.json`, `css-token-audit.json`
- Evidence screenshots: `work/menus/shots/`
  - `m01-returning-boot-desktop.png`, `m01b-returning-boot-phone.png`
  - `m02-remap-list.png`, `m02b-remap-after.png`, `m03-new-campaign-confirm.png`, `m04-pause-landscape.png`
  - `m05a-service-with-cargo.png`, `m05a2-cargo-tab-with-cargo.png`, `m05b-after-unload-sell.png`, `m05c-hardware-before-buy.png`, `m05d-hardware-after-buy.png`, `m05e-tab-focus-ring.png`, `m05f-lander-tab.png`
  - `m06a/b/c-*-desktop|phone.png`, `m07-navigation-desktop|phone.png`, `m08-largetext-hardware.png`, `m09-w02-rank2-drill.png`
  - `m10-phone-hardware.png`, `m11-phone-six-tabs.png`, `m12-launch-splash.png`, `m12b-after-splash.png`
- Mockups: `work/menus/shots/mock-title.webp`, `mock-workshop.webp`, `mock-sale.webp`, `mock-pause.webp`, `mock-map.webp` (source: `work/menus/mock/index.html`, `mock/tokens.css`)
- Overview sheets: `work/menus/menus-contact-sheet.png`, `work/menus/unused-icons-sheet.png`
- Baseline screenshots used: `shots/`
  - title: `d01-title.png`, `p01-title.png`, `l01-title.png`
  - pause and star map: `d06`–`d09`, `p04-pause.png`
  - terminal: `d10-dock-*.png`, `e05`–`e07`, `d12-dock-lander-complete.png`, `d17-w02-dock-hardware.png`, `d18-w02-dock-tools.png`, `p05-dock-*.png`
  - launch, navigation and travel: `d13b-confirm.png`, `d13c-after-confirm.png`, `d15-travel-confirm.png`, `d16-w02-arrival.png`
