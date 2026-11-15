# T5 before/after game fixtures

The same build and checkpoint with dressing off/on; back walls stay on in both phases.

Explicit terrain path: `field`. Both the parked probe and final captured renderer labels must match the recorded field pin; automatic fallback is not accepted.

Completed canonical pairs: 8/8. All eight are measured.

Each completed screenshot passed two byte-identical captures one 50 ms scene step apart. Original checkpoint hashes, camera, exported geology, discovery, deposits and rig pose agree across each pair. Every baseline/final state field is compared strictly except global elapsed, current-world record elapsed and vehicle energy. The ordinary asynchronous settle may add one recorded 50 ms step: the two elapsed deltas must match, and energy must follow the model's underground idle drain, including its zero clamp. Energy is not claimed unchanged. Raw file hashes and original full baseline hashes remain authenticated and recorded; `captures.json` reports full-state equality, every allowed scalar before/after/delta, and the model rate. All other state differences fail. The driver changes render switches only.

Transit checkpoints initially have no discovered cells; the normal restore/render path discovers nearby cells before the baseline is exported. Discovery is checked against that settled baseline, not against the initially empty array. Terrain tiles must still match the original checkpoint. Raw baseline states, when recorded, are authenticated and compared independently with final tiles and discovery. Initial and post-import discovery counts and baseline availability are retained in `captures.json`.

Sheets show HUD-free frames beside the board at the same tile scale. Measurements reuse `art-sheets.py` scoring windows, which differ from the matched-scale display crop. Ordinary visual target failures remain explicit in `captures.json`.

| Fixture | Edge before → after (≥0.06) | L* before → after (board ±4) | Warm % before → after (cavern 2–5) | Rock sd before → after (≥15) | Changed HUD-free pixels |
|---|---|---|---|---|---|
| [a04-dive-60m@2](sheet-a04-dive-60m@2.png) | 0.067 → 0.067 | 25.5 → 25.5 (25.9) | 0.11 → 0.11 | 19.90 → 19.90 | 0 |
| [a04p-dive-60m-phone@3](sheet-a04p-dive-60m-phone@3.png) | 0.040 → 0.040 | 26.6 → 26.6 (30.1) | 0.38 → 0.38 | 19.00 → 19.00 | 0 |
| [a05-dive-150m@2](sheet-a05-dive-150m@2.png) | 0.068 → 0.068 | 25.5 → 25.5 (25.9) | 0.05 → 0.05 | 45.50 → 45.50 | 0 |
| [a05p-dive-150m-phone@3](sheet-a05p-dive-150m-phone@3.png) | 0.042 → 0.042 | 26.2 → 26.2 (30.1) | 0.10 → 0.10 | 45.70 → 45.70 | 0 |
| [b-330m-plate-band-C@2](sheet-b-330m-plate-band-C@2.png) | 0.078 → 0.083 | 26.2 → 26.2 (21.0) | 0.05 → 0.12 | 14.80 → 17.40 | 52096 |
| [b-330mp-plate-band-C-phone@3](sheet-b-330mp-plate-band-C-phone@3.png) | 0.049 → 0.056 | 27.8 → 27.8 (21.0) | 0.10 → 0.25 | 14.30 → 16.70 | 57740 |
| [c-site-W01-SITE-4-wreck@2](sheet-c-site-W01-SITE-4-wreck@2.png) | 0.081 → 0.086 | 22.4 → 22.4 (21.0) | 0.49 → 0.51 | 32.70 → 37.90 | 67336 |
| [p-portrait-cavern-site4@3](sheet-p-portrait-cavern-site4@3.png) | 0.055 → 0.060 | 20.9 → 20.9 (21.0) | 0.97 → 1.01 | 30.80 → 36.20 | 63587 |

## T4 brightness targets — before → after

These are the unchanged §9.2 known-air and rock-region measurements on the lit game frame, not the unlit asset luma or an isolated back-wall mask. Known air includes dug air and any rendered content inside the sampled cell interiors. Transit fixtures may contain no back-wall fragments; their values remain baseline diagnostics. The fragment counts below identify where the new layer actually contributes.

✓/✗ compares each phase with the stated visual target; failures are reported and never abort this builder. `unavailable` means an existing required region has at most 500 usable pixels. Cooler-than-rock compares mean Lab b* in those same cave-air and known-solid masks: lower b* is bluer on the blue–yellow axis. The table gives air / rock b*; it is a masked-region colour comparison, not a full colour-temperature estimate.

Per-pixel b* is supplied as three equal floating-point channels to the unchanged `region_stats` function, using the same state, view, rig and scoring-window keep mask. Its linear luma then equals b*, and both colour-region pixel counts must match the original luma-region counts. Means retain the helper's one-decimal rounding; original brightness measurements are untouched.

The ≥18 row uses all known solid minus cave air, matching the existing audit/prototype measure; it does not substitute the smaller near-lamp subset. Per-region counts and unavailability reasons are recorded in `captures.json`.

| Fixture | Back-wall fragments before → after | Cave-air luma 28–42 | Cave-air sd ≥4 | Unknown − air ≥10 | All known solid − air ≥18 | Mean b*: air / rock (air < rock) |
|---|---|---|---|---|---|---|
| a04-dive-60m@2 | 0 → 0 | 39.5 ✓ → 39.5 ✓ | 7.1 ✓ → 7.1 ✓ | 18.7 ✓ → 18.7 ✓ | 58.0 ✓ → 58.0 ✓ | -5.2 / -4.8 ✓ → -5.2 / -4.8 ✓ |
| a04p-dive-60m-phone@3 | 0 → 0 | 39.5 ✓ → 39.5 ✓ | 6.9 ✓ → 6.9 ✓ | 19.8 ✓ → 19.8 ✓ | 58.0 ✓ → 58.0 ✓ | -5.2 / -4.7 ✓ → -5.2 / -4.7 ✓ |
| a05-dive-150m@2 | 0 → 0 | 35.7 ✓ → 35.7 ✓ | 7.0 ✓ → 7.0 ✓ | 23.3 ✓ → 23.3 ✓ | 65.4 ✓ → 65.4 ✓ | -6.7 / -3.1 ✓ → -6.7 / -3.1 ✓ |
| a05p-dive-150m-phone@3 | 0 → 0 | 35.6 ✓ → 35.6 ✓ | 6.9 ✓ → 6.9 ✓ | 24.2 ✓ → 24.2 ✓ | 65.9 ✓ → 65.9 ✓ | -6.6 / -3.0 ✓ → -6.6 / -3.0 ✓ |
| b-330m-plate-band-C@2 | 16 → 16 | 40.3 ✓ → 41.9 ✓ | 19.7 ✓ → 21.0 ✓ | 19.6 ✓ → 18.0 ✓ | 50.3 ✓ → 47.3 ✓ | -6.5 / -0.5 ✓ → -6.2 / -0.7 ✓ |
| b-330mp-plate-band-C-phone@3 | 18 → 18 | 39.9 ✓ → 41.5 ✓ | 19.4 ✓ → 20.5 ✓ | 21.9 ✓ → 20.3 ✓ | 50.9 ✓ → 47.8 ✓ | -6.5 / -0.4 ✓ → -6.2 / -0.7 ✓ |
| c-site-W01-SITE-4-wreck@2 | 141 → 141 | 33.0 ✓ → 33.3 ✓ | 12.0 ✓ → 12.5 ✓ | 25.6 ✓ → 25.3 ✓ | 60.1 ✓ → 57.2 ✓ | -7.6 / -3.8 ✓ → -7.5 / -3.9 ✓ |
| p-portrait-cavern-site4@3 | 119 → 119 | 33.5 ✓ → 33.7 ✓ | 12.8 ✓ → 13.1 ✓ | 29.2 ✓ → 29.0 ✓ | 63.9 ✓ → 60.5 ✓ | -7.7 / -3.8 ✓ → -7.6 / -3.9 ✓ |

After-capture visual targets not met:

- a04p-dive-60m-phone@3: edge_density.
- a05p-dive-150m-phone@3: edge_density.
- b-330m-plate-band-C@2: frame_L_mean, warm_pct.
- b-330mp-plate-band-C-phone@3: edge_density, frame_L_mean, warm_pct.
- c-site-W01-SITE-4-wreck@2: warm_pct.
- p-portrait-cavern-site4@3: warm_pct.

## Runtime and snapshot checks

The driver samples five parked frames after warming caches. Draw calls, resident bytes, zero uploads and zero missing atlas frames are required for both phases. Boot residency and hidden-information scramble invariance remain separate verify checks.

Back-wall snapshots record their source crop, world bounds and reveal alpha. The driver checks current known air and crop-to-world mapping; independent pristine-natural classification belongs to the runtime/unit suite. Dressing snapshots retain full source bounds, known-cell checks and crystal-deposit exclusions. Settled alpha bounds do not test the timed reveal transition.

Planned ceiling coverage uses the planner's eligible boundary counts; it may still be reported with dressing disabled. Actual coverage independently counts distinct rendered ceiling anchors inside the viewport against the same exposed-ceiling denominator. Both must reach 80% at SITE-4 in T5 after captures wherever ceilings are exposed. Transit coverage is reported without that threshold.

| Phase / fixture | Max draws / limit | Parked uploads | Resident MiB / limit | Back-wall fragments | Dressing props | Planned / actual ceiling coverage |
|---|---|---|---|---|---|---|
| before/a04-dive-60m@2 | 5 / 12 | 0 | 12.99 / 64 | 0 | 0 | — / — |
| before/a04p-dive-60m-phone@3 | 5 / 10 | 0 | 9.26 / 40 | 0 | 0 | — / — |
| before/a05-dive-150m@2 | 4 / 12 | 0 | 18.68 / 64 | 0 | 0 | — / — |
| before/a05p-dive-150m-phone@3 | 4 / 10 | 0 | 12.71 / 40 | 0 | 0 | — / — |
| before/b-330m-plate-band-C@2 | 4 / 12 | 0 | 11.88 / 64 | 16 | 0 | 7/7 (100.0%) / 0/7 (0.0%) |
| before/b-330mp-plate-band-C-phone@3 | 4 / 10 | 0 | 7.62 / 40 | 18 | 0 | 7/7 (100.0%) / 0/7 (0.0%) |
| before/c-site-W01-SITE-4-wreck@2 | 9 / 12 | 0 | 11.88 / 64 | 141 | 0 | 11/11 (100.0%) / 0/11 (0.0%) |
| before/p-portrait-cavern-site4@3 | 9 / 10 | 0 | 7.62 / 40 | 119 | 0 | 10/10 (100.0%) / 0/10 (0.0%) |
| after/a04-dive-60m@2 | 5 / 12 | 0 | 12.99 / 64 | 0 | 0 | — / — |
| after/a04p-dive-60m-phone@3 | 5 / 10 | 0 | 9.26 / 40 | 0 | 0 | — / — |
| after/a05-dive-150m@2 | 4 / 12 | 0 | 18.68 / 64 | 0 | 0 | — / — |
| after/a05p-dive-150m-phone@3 | 4 / 10 | 0 | 12.71 / 40 | 0 | 0 | — / — |
| after/b-330m-plate-band-C@2 | 6 / 12 | 0 | 11.88 / 64 | 16 | 19 | 7/7 (100.0%) / 7/7 (100.0%) |
| after/b-330mp-plate-band-C-phone@3 | 6 / 10 | 0 | 7.62 / 40 | 18 | 19 | 7/7 (100.0%) / 7/7 (100.0%) |
| after/c-site-W01-SITE-4-wreck@2 | 9 / 12 | 0 | 11.88 / 64 | 141 | 28 | 11/11 (100.0%) / 11/11 (100.0%) |
| after/p-portrait-cavern-site4@3 | 9 / 10 | 0 | 7.62 / 40 | 119 | 25 | 10/10 (100.0%) / 10/10 (100.0%) |

| Phase / fixture | Known air cells checked | Dressing known cells checked | Maximum crop-to-world error | Visible alpha min–max |
|---|---|---|---|---|
| before/a04-dive-60m@2 | 0 | 0 | 0.00000000 | —–— |
| before/a04p-dive-60m-phone@3 | 0 | 0 | 0.00000000 | —–— |
| before/a05-dive-150m@2 | 0 | 0 | 0.00000000 | —–— |
| before/a05p-dive-150m-phone@3 | 0 | 0 | 0.00000000 | —–— |
| before/b-330m-plate-band-C@2 | 16 | 0 | 0.00000000 | 1.000–1.000 |
| before/b-330mp-plate-band-C-phone@3 | 18 | 0 | 0.00000000 | 1.000–1.000 |
| before/c-site-W01-SITE-4-wreck@2 | 141 | 0 | 0.00000000 | 1.000–1.000 |
| before/p-portrait-cavern-site4@3 | 119 | 0 | 0.00000000 | 1.000–1.000 |
| after/a04-dive-60m@2 | 0 | 0 | 0.00000000 | —–— |
| after/a04p-dive-60m-phone@3 | 0 | 0 | 0.00000000 | —–— |
| after/a05-dive-150m@2 | 0 | 0 | 0.00000000 | —–— |
| after/a05p-dive-150m-phone@3 | 0 | 0 | 0.00000000 | —–— |
| after/b-330m-plate-band-C@2 | 16 | 46 | 0.00000000 | 1.000–1.000 |
| after/b-330mp-plate-band-C-phone@3 | 18 | 46 | 0.00000000 | 1.000–1.000 |
| after/c-site-W01-SITE-4-wreck@2 | 141 | 59 | 0.00000000 | 1.000–1.000 |
| after/p-portrait-cavern-site4@3 | 119 | 53 | 0.00000000 | 1.000–1.000 |

Snapshot validation limits:

- Canonical fixtures freeze the scene clock: existing knowledge must be fully revealed. No discovery, geology, collision or checkpoint contents are edited.
- Known current air and source bounds are checked independently. Pristine natural-air classification and discovery transitions are covered by the separate runtime/unit suite.
