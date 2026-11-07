# Improvement plan — implementation review and progress

The owner authorized review and implementation on 2026-11-02 and identified branch `claude/gallant-fermi-vtrek7`. Its three documentation commits, ending at `ea0ef54`, were brought forward without rewriting the archived audits. The source plan is [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md).

The owner then requested implementation of the remaining plan. The continuation below covers the numbered W01/W02 work, including the individually numbered backlog items. The first batch at the end of this document is historical evidence for `17c4931`. The [coverage ledger](IMPROVEMENT_COVERAGE.md) accounts for all 74 item IDs and distinguishes implemented behavior from acceptance evidence. The [visual target board](art-direction/README.md), [interface direction](UI_REDESIGN.md), [balance versions](BALANCE_VERSIONS.md) and [world generation](WORLD_GENERATION.md) describe the current direction.

## W01/W02 continuation

This continuation implements the numbered W01/W02 feature set, with the unmet acceptance targets recorded below. **The Deep Frontier** is the working title; the repository, public address and save namespace remain stable. The owner's instruction to continue authorized the plan's recommended implementation choices. The generated target board is a design reference, not a gameplay screenshot or a record of human art approval.

- **Progression:** versioned new worlds, weighted deeper rewards, a mandatory drill plate, useful load/engine/rack/brace behavior, return-energy guidance, pressure seams, comet training windows and the steam reserve. Existing excavations, package values and bulk are preserved.
- **Content:** four bands per world, route-adjacent caves, recognizable sites, sixteen original field logs, guaranteed deep relics, optional contracts, records/mastery, discovered-only maps and waypoints, and specialist caches for later revisits.
- **Interface and controls:** an immersive title, compact condition/mission HUD, twelve-step first-sortie guidance, separate Trade/Workshop/Construction views, pause pages, star map, dual keyboard bindings, controller remapping, immediate mouse steering and proportional floating-joystick movement.
- **Presentation:** local licensed fonts, native-scale trimmed sprites, streamed macro-terrain, retained rendering, a common Canvas/WebGL light map, rig/camera/particle feedback, deliberate sale/install/construction/travel presentations, and event-driven synthesized sound, music and ambience.
- **Persistence and foundations:** schema 3 migration, immutable completion records, atomic archives, deliberate destructive-action controls, shared world/screen coordinates, modular UI, data overlays and maintained browser/audio/render/pacing tooling.

### Integration evidence

The complete unit suite passes **225 tests**, with five opt-in measurement tests excluded from the ordinary run. Asset checks, TypeScript and production builds pass. The Docker build is healthy and its **81 files match local `dist/` exactly by SHA-256**, including the bundled font licenses. The exact Git checkpoint and published asset verification accompany the delivery.

World generation checks cover 200 seeds per world, exact ordinary-deposit quotas, the unbroken drill plate, legacy terrain hashes and deep relic placement. The measured W01 deep/shallow reward-per-cell ratio is **2.535×**. Native opening tests complete the tracker-directed two trips, a real 3 HP impact and repair, and a 600 CR tank purchase with at least 25 CR left. Two hundred native return paths meet the estimate's −10%/+30% bounds; dedicated tests establish useful engine, brace, tank, hull and reserve behavior.

Offline rendering of the production audio graph measures drilling at **−23.63 to −23.89 dBFS**, with 77–79% of energy above 300 Hz; mute produces digital zero, and the maximum voice count is twelve. Native compiled UI checks verify exact sale totals, intermediate count-up frames, paused simulation, deliberate replacement confirmations, retained focus/control identity and safe presentation skipping. A real-clock test blocks the browser thread through the confirmation threshold: cancellation commits zero times; an uninterrupted release commits exactly once even if the timer callback was delayed.

Trade/Workshop/Construction contain **42/59/53 body words** and fit at 1440×900 without scrolling. Nine phone-panel checks cover 393×851, 844×390 and 568×320, including 44 px controls, useful visible content and readable text. Controller-only docking, sale, purchase, undocking and destination travel pass. Closed cargo details no longer create invisible focus targets. A real rightward crossing of the horizontal seam keeps the HOME label within one pixel of its expected wrapped position.

Seven native storage checks cover IndexedDB, cross-tab messaging, corrupt/future records and atomic archives. An archive survives 75 simulated seconds and fourteen autosaves. A newer write in another tab closes a stale restore confirmation; Load → Resume remains usable. Native warning/service, first emergency tow, shaft-entry and transaction regressions pass on the compiled application.

The final Docker build also passes eight maintained usability scenarios, five pointer/inspection scenarios, four scoped comet volatile/touch/conflict scenarios and four native terminal alias/consequence probes. Legacy browser fixtures now use the current menus, authored hazard locations and valid schema migration inputs. The full older travel/economy/milestone matrix was not rerun; these scoped results do not imply otherwise.

### Economy and pacing: passing floors and open targets

The maintained pacing report is a policy simulation, not a novice study. Its first hundred-seed experiment exposed planner failures; the raw failures remain recorded. The brace planner incorrectly fell after a supported side cut, and its spend-before-service policy could strand itself at the dock. Native replay of the three remaining wealthy stalled states completes the 600 m core trip by following the real return warning and making a second dive where needed, with zero recoveries. The explicit guided policy now models those behaviors; the older policy remains a comparison.

The fixed-loadout audit contains **80 current runs** and a frozen, source-hashed v0.1 baseline. W01 starting-rig income is **255.72 CR/min**, all-rank-1 income **395.74 CR/min**, and W02 arrival income **635.66 CR/min** (1.606× W01 rank 1). Those income floors pass. Pickup cadence retains **86.49% / 89.81% / 124.46%** of the matching historical W01 rank-0 / W01 rank-1 / W02-arrival cohorts, exceeding the 80% floor.

The exact supported rack comparison earns **391.05 → 416.83 CR/min (+6.59%)**. The supported W02 cargo upgrade earns **832.57 → 869.41 (+4.43%)**. Both miss the explicit **8%** income target; cargo-only comparisons also miss it. Capacity increases are implemented, but they are not relabeled as a passing income result. The strict marginal test preserves these failures. Native tank, engine, hull, brace, drill and steam-reserve capability checks pass separately.

The final guided W01 run uses **100 seeds per policy**, with all 200 chapters completing under the declared assumptions:

| Policy         | Median chapter | Median longest purchase gap | Longest gap across seeds | Recovery behavior                 |
| -------------- | -------------- | --------------------------- | ------------------------ | --------------------------------- |
| Guided skilled | 9.8859 min     | 3.23 min                    | 4.64 min                 | Zero in every seed                |
| Guided novice  | 39.5051 min    | 7.893 min                   | 13.95 min                | 68 seeds use one tow; 32 use none |

The strict 10/40-minute lower bounds remain unmet; the median 8-minute gap bound passes, while the novice tail does not. Novice tows occur late (earliest 29.60 minutes), and this abstract hesitation policy cannot establish human safety or completion time. The two-seed W01/W02 comparison also leaves W02's 60–90-minute and 8-minute-gap targets unmet. No experimental fee sweep has been promoted: construction remains **200/600/1,000 CR**. Artificially increasing fees to compensate for a planner's navigation assumptions would not establish good human pacing.

Current repeatable evidence lives in `artifacts/plan-ui-final/`, `artifacts/audio/`, `artifacts/pacing/marginal-final/`, `artifacts/pacing/current-guided/` and `artifacts/pacing/current-comparison/`; these generated files are ignored locally and retained by the relevant CI jobs. The maintained baseline is [tests/pacing/v01-baseline.json](../tests/pacing/v01-baseline.json). The original proposal's audit files remain unchanged.

### Pacing calibration (open)

Recorded 2026-11-06. Four guardrails in `tests/pacing/campaign.test.mjs` fail in the subset run (`npm run test:pacing`: W01 seeds 1 and 8 for each policy, so each value is the mean of two runs). The results are identical locally on `main` at `07be4c4` and in the `pacing` job's recent pull-request runs:

| Guardrail                             | Result    | Limit     |
| ------------------------------------- | --------- | --------- |
| Skilled, W01 median chapter           | 8.46 min  | 10–18 min |
| Novice, W01 median worst purchase gap | 9.19 min  | ≤8 min    |
| Guided skilled, W01 median chapter    | 9.89 min  | 10–18 min |
| Guided novice, W01 median chapter     | 35.89 min | 40–50 min |

The 100-seed nightly fails the same four guardrails with different values (run 42248096496 on 2026-11-06: skilled 9.48 min, novice worst gap 10.48 min, guided skilled 9.89 min and guided novice 39.51 min; the two guided values are the medians in the 100-seed table of the previous section). It also reports the W02 targets and seven novice seeds that do not complete a world.

The limits were not loosened, and no limit or script changed. Pull requests no longer run the `pacing` job. The nightly run (100 seeds per policy, both worlds) and manual runs (the same two-seed subset) still enforce these guardrails, and each job reports its failures in its `artifacts/pacing/summary.json`, so the calibration stays visible until it is resolved.

### Rendering measurements and remaining limits

A separate maximum-quality probe pins actual DPR 2 and lets both worlds’ neighbouring art pages finish loading. Desktop textures measure **45.64 MiB at boot / 55.77 MiB in W01 / 63.52 MiB in W02**, under 64 MiB; the W02 fixture has 0.48 MiB headroom. Phone measurements are **19.43 / 29.55 / 31.80 MiB**, under 20 MiB boot and 40 MiB active. Terrain sampling is capped at 1.5 with 2× macro pages; foreground sprites retain native 3× pages and the canvas/text can use DPR 2. This measured fixture does not certify every possible future content combination. `npm run test:render:memory` retains this strict check in CI.

The compiled Canvas/WebGL matrix passes all eight desktop/phone cases. Phone boot textures measure **19.43 MiB**, with a measured active peak of **30.68 MiB**, below the 20/40 MiB budgets. HUD values remain 18 px on touch layouts, the viewport does not scroll, audio unlocks from the native gesture and reduced motion removes moving particles. These are viewport emulations, not physical Android measurements.

Both renderers keep hidden air and solid rock pixel-identical in both worlds. The retained shaft fixtures submit **one actual WebGL draw**, use **2.094/2.088 screens of clipped triangle area**, and perform zero stationary terrain uploads. Shifting the terrain buffer and returning preserves the original terrain pixels; the separately animated rig is excluded from that terrain comparison. Pixel parity remains approximate: mean Canvas/WebGL channel differences are **0.373/0.514 levels**, with edge outliers up to **63**. Literal all-pixel ≤3 parity is **not passed**.

A rejected sprite-resampling cache raised phone boot textures to 22.44 MiB and moving 4×-throttled frame p95 to 86 ms. It was removed. Terrain now uses a stable raster independent of animated camera zoom and reuses buffered pixels as the view moves. The subsequent isolated moving p95 is **54.9 ms on the phone viewport / 52.8 ms in the fully explored deep fixture**, with median 19.6/24.6 ms and one or two typical uploads per frame. The **12 ms target remains unmet**. A bounded CPU profile attributes 87.8% of samples to native/unsymbolized runtime; it does not justify claiming those samples are exclusively game JavaScript or a specific GPU cost.

The compiled 15-second adaptive probe records a requested cap of 2 and actual transitions through 1.5 to 1, with matching 590×1277 and 393×851 backing canvases. Adaptive resolution now measures the complete frame from Phaser `PRE_STEP` through `POST_RENDER`, including interface work and render submission. The earlier scene-only timer missed those costs. Its requested quality cap and actual resolution are reported separately. This correction is not a claim that the strict frame-time target or physical-device gate has passed. Raw rejected and corrected measurements remain in `artifacts/render-budget-final/`, `artifacts/render-budget-stable/` and `artifacts/render-profile/`.

### Acceptance boundaries

Implementation coverage does not imply all 74 acceptance gates have passed. Physical Android performance, novice comprehension/completion, human mineral recognition and owner art approval need their respective reviews. Renderer parity/performance and economy distributions have numerical limits and raw results in the coverage ledger. Later W03+ chapters, per-seed mission columns and cosmetic liveries remain the explicitly later campaign scope.

## Historical Phase 0 release — `17c4931`

The following sections describe the earlier release only. References to pending work and unchanged v0.1 prices in them are historical, not the status of the continuation above.

### Review and delivery boundary

The proposed order is appropriate: repair first-session failures, validate progression, then build richer presentation and content before W03. The warning suppression and rotating-backup problems were verified in the current code. The existing 107 tests passed before implementation, so the new regressions cover gaps in that baseline rather than assuming it already demonstrated the plan's experience targets.

The pacing audit is a useful deterministic comparison, not a human playtest. Its proposed prices, depth distribution, mass rules, pressure seams and mandatory drill plate must ship together only after the calibrated H1 checks and versioned H2/H8 data work. This batch leaves stored terrain, package values and the v0.1 price table unchanged. Old campaigns keep their current fuel; only new campaigns start full.

The first delivery covers Phase 0 correctness and interim readability. It does **not** declare the entire Phase 0 gate complete: D0 target frames, their review, the final interface mocks and the broader maintained pacing harness remain pending. The plan's multiweek effort estimates, novice completion times and physical-device frame budgets are still targets.

### First implementation batch

| Item           | Delivered behavior                                                                                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A2             | Full starting tank. One free tow per world when hull or energy is depleted, preserving carried ordinary cargo, relics and mission objects. Voluntary and later recovery retain their existing costs and losses. A strict, backward-compatible tow ledger persists entitlement. Normal falls remain below the damage threshold. |
| B1             | Persistent 25/15/8% energy-band messages, relevant dock tab, exact low-fuel service/undock prompts, truthful combined unload/sale feedback, distance-aware mission guidance, a 2.5-second full-hold message guard, and no world labels on the title.                                                                           |
| B2             | Down assists shaft entry from offsets up to ±0.45 tile. A 120 ms input buffer helps cuts on landing. Airborne side cuts explain footing. Facing stays stable during a committed cut. Pause/focus loss clears uncommitted assists, preserving an already started cut.                                                           |
| F1             | Three independent valid campaign archives, atomic with replacement and pruning; later autosaves cannot erase them. Restores arrive paused. Controller D-pad/A/B menu navigation, interaction repeat protection, retained terminal focus and full-width travel controls.                                                        |
| E1a            | 85% translucent plates on existing HUD containers, 20 px desktop values, and stronger high-contrast plates. Phone type sizes and camera geometry remain the existing layout until E4.                                                                                                                                          |
| D9             | Neutral opaque unexplored rock with a deterministic 20% texture overlay, regardless of actual hidden material, air or minerals; remembered opacity .65 and visible floor .8.                                                                                                                                                   |
| D1/D2          | Gradient plus seamless stars and a separate sky body; wrapping ridges; distinct stone, patterned bedrock, transparent material rims and live high-contrast canvas contours.                                                                                                                                                    |
| H5a            | Both worlds use the same Chromium SVG rasterizer and Pillow packer. Normal production builds still require neither tool.                                                                                                                                                                                                       |
| H0, first part | Maintained fixtures, selective browser/pixel measurements, opening regressions, a PR/manual/nightly workflow, and production seam/contrast checks. Full calibrated campaign pacing remains H1.                                                                                                                                 |

D9 resolves an ambiguity in the proposal: dim texture opacity is applied over a neutral rock substrate, rather than multiplying the already-dark terrain RGB by .30. The latter would retain the black-void problem. Hidden cells use only their coordinate/seed hash, never their underlying geometry or ore. The interim treatment intentionally precedes D0/D4/D6's headlamp, macro-texture and band art.

The archive limit applies to valid checkpoints. Malformed/future archive bytes are preserved, excluded from the restore list and never silently pruned. The database namespace, checkpoint envelope and schema 1/2 compatibility stay intact. Archive creation/pruning and current/backup replacement use the same compare-and-swap transaction; a rejected or aborted write changes none of those records.

### Verification of the historical batch

The opening regression drives the real model across 40 seeds until disablement: at least 290 m, seven opening packages, and all 20 starting CR retained after the first tow. Separate tests cover repeat/voluntary recovery, both worlds, malformed/old-save tow ledgers, returned ledges above the deepest excavation, wrapped shafts, buffered input and committed-cut behavior.

Native IndexedDB checks exercise three-archive retention, same-millisecond/clock-rollback ordering, actual transaction abort after archive insertion/pruning, stale writers/restores, protected malformed/future records, and subsequent successful retry. The existing backup and unrelated-save protections remain covered.

Asset output reproduces byte-identically across two complete authoring builds: 211 generated files. Node-only checks enforce background seams, rim transparency and material contrast. Minimum material ΔE is 15.5 in W01 and 21.3 in W02 (target ≥12). Deliberately damaged seam, opaque-rim and indistinct-stone probes fail validation.

All 137 automated tests across thirteen files pass, together with TypeScript, source/asset validation and production builds. One existing 100-seed test now allows 15 seconds on shared hosts without reducing its 60,000-deposit coverage; frame-performance checks remain separate. The final Docker image's twelve files match local `dist/` exactly by SHA-256.

Compiled browser checks verify all three warning bands, truthful mission-only banking, the first native hold-Down dive/tow, and four shaft-entry offsets. On the final Docker build, an archived campaign survived **75.25 seconds of actual simulation and fourteen autosaves**, then restored the original seed and exact terrain paused. Cross-tab notification during an open archive confirmation closes the stale decision and leaves Load → Resume usable. Gamepad D-pad/A/B can dock, sell, purchase energy and undock; held Enter does not close the terminal, and selected controls have a measured visible 2 px focus ring after mouse input.

The existing four scoped comet regressions and five usability checks also pass on that build: volatile cargo, both touch layouts, cross-tab storage, three viewport sizes, keyboard input and service purchases. The service probe now advances its fake clock beyond the intentional 300 ms interaction guard before pressing E again; production input behavior was not relaxed for the test.

Hidden-cave and hidden-solid-rock captures are pixel-identical in both worlds. High contrast changes actual canvas contours. Twenty captures cover both worlds at spawn/flight ceiling across the five desktop resolutions; title world labels are absent. Twelve desktop/portrait/short-landscape shaft and danger captures have minimum measured HUD contrast **6.041:1** (target ≥4.5:1). Six additional disabled-state captures keep the 44 px recovery targets within the viewport.

| Capture            | Baseline pixels below luma 40 | Final pixels below luma 40 |
| ------------------ | ----------------------------- | -------------------------- |
| W01 desktop shaft  | 89.5%                         | 5.4%                       |
| W02 desktop shaft  | 56.2%                         | 5.2%                       |
| W01 portrait shaft | 72.0%                         | 17.6%                      |

The remaining portrait/short-landscape shaft captures range from 17.6% to 26.7% dark pixels. This is an interim brightness measure, not approval of final terrain art. Root review inspected the actual desktop surface/shaft and portrait comet captures; the missing-texture checkerboard found during development was corrected before these measurements.

Performance remains a shared-host proxy. The initial three 4× CPU-throttled phone-viewport runs measured p95 JS **16.8/10.2/10.7 ms**, against baseline **12.8/12.1/13.2 ms**. An isolated rerun with other work idle measured **11.6/10.9/11.6 ms**. All raw runs are retained, including the slower outlier; these measurements do not establish physical-device frame rate or universal non-regression. The atlas/background images now total approximately **29.5 MiB decoded**, before renderer/DOM overhead. The later streaming and render-scale work is still necessary for the plan's Phase 2 texture/device budgets. Some diagonal arrow glyphs also lack fallback coverage in this Linux capture environment; the icon/type foundation must replace that dependency.

Local capture files belong under ignored `artifacts/`; the archived proposal's measurements are preserved unchanged. Final browser/pixel evidence is in `artifacts/improvement-production-final/`; the isolated performance rerun is in `artifacts/improvement-production-perf-isolated/results.json`. The workflow retains these measurement directories as downloadable artifacts. Repeatable commands follow below.

### Repeat the historical checks

```sh
npm test
npm run test:opening
npm run format:check
npm run build
npm run dev -- --port 5173 --strictPort
```

In another terminal, with Chromium and Python/Pillow available:

```sh
npm run test:improvements
npm run test:campaign:storage
```

`PREVIEW_URL` selects the server, `CHROMIUM_PATH` selects Chromium, and `IMPROVEMENT_CHECKS=behavior,visual,fog,sky,perf` runs the full measurement set. `IMPROVEMENT_ARTIFACTS` chooses the output directory. Performance runs are advisory on shared/virtual hosts; they do not establish Pixel 6a or Galaxy A54 hardware performance.

### Next delivery as recorded at Phase 0

1. Produce and review D0's desktop/portrait surface, shaft and deep-cave target frames beside the supplied HUD/menu mocks. The interim terrain is not final art.
2. Promote/calibrate the full H1 pacing harness and establish H2/H8 versioned migrations and balance data before changing stored-world generation or economic contracts.
3. Add B3's shared motion/return-energy estimate, then the combined W01 progression bundle and first-sortie guidance in the plan's dependency order. Sound/event feedback and the shared view/UI foundations can progress alongside that work.
4. Continue the graphics/interface and content phases, then implement W03 using those shared systems.

The final title, full HUD redesign, new mineral names, expanded color palettes and later content are still unimplemented design work; this batch makes no claim that the corresponding mock or art review gates have passed.
