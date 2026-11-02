# Improvement plan — implementation review and progress

The owner authorized review and implementation on 2026-11-02 and identified branch `claude/gallant-fermi-vtrek7`. Its three documentation commits, ending at `ea0ef54`, were brought forward without rewriting the archived audits. The source plan is [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md).

## Review and delivery boundary

The proposed order is appropriate: repair first-session failures, validate progression, then build richer presentation and content before W03. The warning suppression and rotating-backup problems were verified in the current code. The existing 107 tests passed before implementation, so the new regressions cover gaps in that baseline rather than assuming it already demonstrated the plan's experience targets.

The pacing audit is a useful deterministic comparison, not a human playtest. Its proposed prices, depth distribution, mass rules, pressure seams and mandatory drill plate must ship together only after the calibrated H1 checks and versioned H2/H8 data work. This batch leaves stored terrain, package values and the v0.1 price table unchanged. Old campaigns keep their current fuel; only new campaigns start full.

The first delivery covers Phase 0 correctness and interim readability. It does **not** declare the entire Phase 0 gate complete: D0 target frames, their review, the final interface mocks and the broader maintained pacing harness remain pending. The plan's multiweek effort estimates, novice completion times and physical-device frame budgets are still targets.

## First implementation batch

| Item | Delivered behavior |
| --- | --- |
| A2 | Full starting tank. One free tow per world when hull or energy is depleted, preserving carried ordinary cargo, relics and mission objects. Voluntary and later recovery retain their existing costs and losses. A strict, backward-compatible tow ledger persists entitlement. Normal falls remain below the damage threshold. |
| B1 | Persistent 25/15/8% energy-band messages, relevant dock tab, exact low-fuel service/undock prompts, truthful combined unload/sale feedback, distance-aware mission guidance, a 2.5-second full-hold message guard, and no world labels on the title. |
| B2 | Down assists shaft entry from offsets up to ±0.45 tile. A 120 ms input buffer helps cuts on landing. Airborne side cuts explain footing. Facing stays stable during a committed cut. Pause/focus loss clears uncommitted assists, preserving an already started cut. |
| F1 | Three independent valid campaign archives, atomic with replacement and pruning; later autosaves cannot erase them. Restores arrive paused. Controller D-pad/A/B menu navigation, interaction repeat protection, retained terminal focus and full-width travel controls. |
| E1a | 85% translucent plates on existing HUD containers, 20 px desktop values, and stronger high-contrast plates. Phone type sizes and camera geometry remain the existing layout until E4. |
| D9 | Neutral opaque unexplored rock with a deterministic 20% texture overlay, regardless of actual hidden material, air or minerals; remembered opacity .65 and visible floor .8. |
| D1/D2 | Gradient plus seamless stars and a separate sky body; wrapping ridges; distinct stone, patterned bedrock, transparent material rims and live high-contrast canvas contours. |
| H5a | Both worlds use the same Chromium SVG rasterizer and Pillow packer. Normal production builds still require neither tool. |
| H0, first part | Maintained fixtures, selective browser/pixel measurements, opening regressions, a PR/manual/nightly workflow, and production seam/contrast checks. Full calibrated campaign pacing remains H1. |

D9 resolves an ambiguity in the proposal: dim texture opacity is applied over a neutral rock substrate, rather than multiplying the already-dark terrain RGB by .30. The latter would retain the black-void problem. Hidden cells use only their coordinate/seed hash, never their underlying geometry or ore. The interim treatment intentionally precedes D0/D4/D6's headlamp, macro-texture and band art.

The archive limit applies to valid checkpoints. Malformed/future archive bytes are preserved, excluded from the restore list and never silently pruned. The database namespace, checkpoint envelope and schema 1/2 compatibility stay intact. Archive creation/pruning and current/backup replacement use the same compare-and-swap transaction; a rejected or aborted write changes none of those records.

## Verification

The opening regression drives the real model across 40 seeds until disablement: at least 290 m, seven opening packages, and all 20 starting CR retained after the first tow. Separate tests cover repeat/voluntary recovery, both worlds, malformed/old-save tow ledgers, returned ledges above the deepest excavation, wrapped shafts, buffered input and committed-cut behavior.

Native IndexedDB checks exercise three-archive retention, same-millisecond/clock-rollback ordering, actual transaction abort after archive insertion/pruning, stale writers/restores, protected malformed/future records, and subsequent successful retry. The existing backup and unrelated-save protections remain covered.

Asset output reproduces byte-identically across two complete authoring builds: 211 generated files. Node-only checks enforce background seams, rim transparency and material contrast. Minimum material ΔE is 15.5 in W01 and 21.3 in W02 (target ≥12). Deliberately damaged seam, opaque-rim and indistinct-stone probes fail validation.

All 137 automated tests across thirteen files pass, together with TypeScript, source/asset validation and production builds. One existing 100-seed test now allows 15 seconds on shared hosts without reducing its 60,000-deposit coverage; frame-performance checks remain separate. The final Docker image's twelve files match local `dist/` exactly by SHA-256.

Compiled browser checks verify all three warning bands, truthful mission-only banking, the first native hold-Down dive/tow, and four shaft-entry offsets. On the final Docker build, an archived campaign survived **75.25 seconds of actual simulation and fourteen autosaves**, then restored the original seed and exact terrain paused. Cross-tab notification during an open archive confirmation closes the stale decision and leaves Load → Resume usable. Gamepad D-pad/A/B can dock, sell, purchase energy and undock; held Enter does not close the terminal, and selected controls have a measured visible 2 px focus ring after mouse input.

The existing four scoped comet regressions and five usability checks also pass on that build: volatile cargo, both touch layouts, cross-tab storage, three viewport sizes, keyboard input and service purchases. The service probe now advances its fake clock beyond the intentional 300 ms interaction guard before pressing E again; production input behavior was not relaxed for the test.

Hidden-cave and hidden-solid-rock captures are pixel-identical in both worlds. High contrast changes actual canvas contours. Twenty captures cover both worlds at spawn/flight ceiling across the five desktop resolutions; title world labels are absent. Twelve desktop/portrait/short-landscape shaft and danger captures have minimum measured HUD contrast **6.041:1** (target ≥4.5:1). Six additional disabled-state captures keep the 44 px recovery targets within the viewport.

| Capture | Baseline pixels below luma 40 | Final pixels below luma 40 |
| --- | --- | --- |
| W01 desktop shaft | 89.5% | 5.4% |
| W02 desktop shaft | 56.2% | 5.2% |
| W01 portrait shaft | 72.0% | 17.6% |

The remaining portrait/short-landscape shaft captures range from 17.6% to 26.7% dark pixels. This is an interim brightness measure, not approval of final terrain art. Root review inspected the actual desktop surface/shaft and portrait comet captures; the missing-texture checkerboard found during development was corrected before these measurements.

Performance remains a shared-host proxy. The initial three 4× CPU-throttled phone-viewport runs measured p95 JS **16.8/10.2/10.7 ms**, against baseline **12.8/12.1/13.2 ms**. An isolated rerun with other work idle measured **11.6/10.9/11.6 ms**. All raw runs are retained, including the slower outlier; these measurements do not establish physical-device frame rate or universal non-regression. The atlas/background images now total approximately **29.5 MiB decoded**, before renderer/DOM overhead. The later streaming and render-scale work is still necessary for the plan's Phase 2 texture/device budgets. Some diagonal arrow glyphs also lack fallback coverage in this Linux capture environment; the icon/type foundation must replace that dependency.

Local capture files belong under ignored `artifacts/`; the archived proposal's measurements are preserved unchanged. Final browser/pixel evidence is in `artifacts/improvement-production-final/`; the isolated performance rerun is in `artifacts/improvement-production-perf-isolated/results.json`. The workflow retains these measurement directories as downloadable artifacts. Repeatable commands follow below.

## Repeat the checks

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

## Next delivery

1. Produce and review D0's desktop/portrait surface, shaft and deep-cave target frames beside the supplied HUD/menu mocks. The interim terrain is not final art.
2. Promote/calibrate the full H1 pacing harness and establish H2/H8 versioned migrations and balance data before changing stored-world generation or economic contracts.
3. Add B3's shared motion/return-energy estimate, then the combined W01 progression bundle and first-sortie guidance in the plan's dependency order. Sound/event feedback and the shared view/UI foundations can progress alongside that work.
4. Continue the graphics/interface and content phases, then implement W03 using those shared systems.

The final title, full HUD redesign, new mineral names, expanded color palettes and later content are still unimplemented design work; this batch makes no claim that the corresponding mock or art review gates have passed.
