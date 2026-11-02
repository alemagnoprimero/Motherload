# Maintained progression measurements

`sim.ts` promotes the archived progression planner into the checked source tree.
It uses generated production worlds and real transaction methods. Motion is an
abstract cell traversal using the shared motion/cut formulas. It is **not a human
playtest**, and chapter timings do not establish the novice acceptance gate.

`calibration.test.ts` compares predicted cuts and steady flight with independent
60 Hz production ticks, failing when drift exceeds 10%. Startup/braking and
navigation are also exercised by the native opening and 200 return paths in
`campaign-progression-model.test.ts`; they must pass before interpreting the
planner's chapter report. Hazard opportunities and hesitation in an abstract
planner cannot certify physical-device or human results.

Run `npm run test:pacing` for the pull-request subset. Run
`npm run test:pacing:nightly` for the 100-seed report. Reports are written to
ignored `artifacts/pacing/`; every seed retains its completion flag, purchases,
trips, recovery count and gaps. A stopped or timed-out run is never counted as a
completed chapter. `PACING_SEEDS` and `PACING_WORLDS` can select smaller diagnostic
runs, but release measurements use the committed defaults.

The report separates mathematical guardrails from experience targets. Mandatory
mechanical gates (plate purchase, opening reserve, motion calibration and return
accuracy) fail tests. Chapter-duration and pickup-cadence results retain explicit
pass/fail and source assumptions rather than silently replacing missing evidence.

The default report retains five separately named policies. `rusher`, `skilled`
and `novice` are the promoted planner's spend-first policies. The latter two
use the energy-first purchase plans declared in `campaign.test.mjs`; they are
**not exact replays of the audit's earlier hull-first or cargo-first bot**.
`guided-skilled` and `guided-novice` retain the same reserve, hesitation and
volatile-success assumptions, but service before construction, accept/claim real
contracts, request recovery after a low-fuel stall, and extend a straight shaft
toward the visible mission POI. The last behavior follows the native return
warning and makes another trip when it turns red. Ordinary mining still uses
Dijkstra routing. These differences are explicit policy choices, not calibration
constants fitted to chapter-duration targets.

`PACING_POLICY_SET=baseline|guided|all` selects diagnostic comparisons. The default
is `all`; nightly uses 100 seeds per policy. `PACING_ARTIFACTS` keeps comparison
runs separate. Income fields distinguish total ordinary CR from ordinary CR/min.
Contract rewards are progress events but are excluded from ordinary ore income.

The command exits unsuccessfully if chapter completion, duration or gap targets
fail, even when all native mechanical tests pass. A CI failure is therefore
useful evidence of an unmet design target; it must not be relabeled a passing
release check. The existing 100-seed fee experiment and failed-state traces are
retained separately from current-rule reports. The original seven failed novice
states exposed two planner errors (falling after brace movement and construction
spending before service) plus winding return routes; native progressive dives
completed the three remaining rich states without recovery. This does not by
itself establish the chapter pacing targets.

Nightly CI shards the five policies into separate bounded jobs with
`PACING_POLICIES`; each shard still runs all 100 seeds and both chapters. The PR
job runs the two-seed W01 comparison together under a two-minute test timeout.
A local unsharded nightly can take substantially longer than a single CI shard.

Run `PACING_CAPABILITIES=1 npx vitest run tests/pacing/marginal.test.mjs --maxWorkers=1`
for the maintained eight-seed paired 15-minute fixed-loadout marginal-income
report. It disables purchases during each measured interval and retains failed
income/cadence gates. `PACING_CAP_LOADOUTS`, `PACING_CAP_WORLDS`, and
`PACING_CAP_ARTIFACTS` select diagnostic cohorts without changing the release
assertions; capability tests provide separate native evidence for parts that do
not qualify through income uplift.

`v01-baseline.json` preserves the pre-improvement remake's source and planner hashes,
the policy, eight seeds, and all 24 measured baseline rows. Pickup cadence uses
the fixed `[120,900)` second window and a 13-minute denominator. The current
report pairs matching seeds before checking the 80% floor; extra diagnostic
seeds do not silently change that comparison. Income uses the actual elapsed
time, including completion of the final trip after minute 15.

`PACING_CAP_REPORT_INPUTS` accepts comma-separated `runs.json` paths to recheck
saved cohorts without rerunning simulations. Later inputs replace an identical
world/loadout/seed row, so corrected runs can supersede an older measurement
explicitly. Reports list their input paths and every executed check. A partial
cohort report does not establish checks whose comparator is absent. The bare
rank-zero rack fixture is a counterfactual; `rank1-brace` versus `rank1-rack`
isolates the rack on a progression-supported loadout. W02 `rank2-small-bay`
versus `rank2` isolates the cargo upgrade after the other rank-two purchases.

## Current measured chapter result

The final W01 run used 100 deterministic seeds per guided policy, current
production fees (200/600/1,000 CR), real contracts, service-first spending and
progressive POI shafts. It completed in 386 seconds. It **exited 1** because both
chapter-duration medians are below their required floors; the assertions were
not relaxed.

| Policy         | Completed | Median minutes | Target minutes | Median worst gap | Longest gap |
| -------------- | --------- | -------------- | -------------- | ---------------- | ----------- |
| Guided skilled | 100/100   | 9.886          | 10–18          | 3.230 min        | 4.640 min   |
| Guided novice  | 100/100   | 39.505         | 40–50          | 7.893 min        | 13.950 min  |

All skilled runs had zero recoveries. The novice policy had one recovery in 68
seeds and none in 32. All occurred after 29.60 simulated minutes (median 35.69),
so this is not evidence of an early-session recovery failure, nor is it a human
safety result. The fixed per-cell hesitation policy and cell-level navigation
are still abstractions. Raw per-seed events, trips, policy definitions and
failure strings are in `artifacts/pacing/current-guided/`.

Earlier evidence is deliberately separate: the original 100-seed 1,100 CR fee
experiment completed 93/100 novice runs before the brace fixes; the same raw
failure data and traces remain under `artifacts/pacing/fee-sweep-hundred-1100.json`
and `traces-before-brace/`. Native production controls subsequently completed
all three remaining rich states through progressive dives with refueling, so
the archived routing failures do not establish unreachable generated worlds.
No production fee was changed to fit these measurements.

The final direct-POI two-world diagnostic used two seeds per guided policy and
completed all four W02 chapters. Guided novice W02 measured 49.926 minutes and
a median worst gap of 8.9925 minutes, failing the 60–90 minute and ≤8 minute targets.
This is a small diagnostic, not a 100-seed W02 acceptance result; the nightly
matrix is configured to collect the latter. The actual PR command, including
native calibration/return-path tests, completed in 59.5 seconds with 10 mechanical
tests passing and the strict pacing target test failing as reported.
