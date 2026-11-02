# 01 — Progression, economy and pacing (quantitative audit)

> **Archived audit report** (2026-11-02, baseline commit `dbf0b1a`), supporting [the improvement plan](../../IMPROVEMENT_PLAN.md). Source paths are relative to the repository root; `work/…`, `shots/…` and `analysis/…` are relative to `docs/improvement-plan/`. Review scripts named `*.test.ts` are archived as `*.audit.ts` (see [the folder README](../README.md)). Screenshots and captures (`*.png`) were local review files and are not committed, except the UI mocks, which are stored as `.webp`.

Scope: economy, pacing, unlock structure, milestones, failure economy and meta-progression of the playable campaign (W01 Broken asteroid, W02 Ice comet). Read-only analysis of `<repo>` at `dbf0b1a`. All scripts, raw outputs and the simulator live in `work/progression/` (outputs in its `out/` folder).

## 1. Assessment

The economy is arithmetically clean (integer tenths, exact previews, no-debt recovery), but the game's progression loop is not doing its job. The core genre promise is: mine, sell, upgrade, then go deeper for better rewards. Measured on the real model, W01 breaks that promise in three ways.

1. **The critical path needs no upgrades.** A true-engine bot holding the controls a player would hold finished all three W01 milestones and departed in **5 trips on 10/10 seeds, with zero purchases**. That took 163-165 s of active play, or about **4.4 minutes** with a 20 s terminal allowance per dock. The design target is 45 minutes. All four objectives sit in one protected soil corridor under the spawn. Re-using that shaft turns "depth" into "a few more trips", and the 1,000 CR of construction fees are covered by the two starter seams.
2. **Depth does not pay in W01.** Ore value is the same at every depth (mean 46.7-49.1 CR in every 100 m band over 50 seeds). Density falls (20.0% to 14.6%) while cut time rises up to 1.74x, so value per cell drops from 9.8 to 6.9 CR. Every simulated policy mines shallow: the completionist bot's median trip depth in W01 is 100 m, and below 200 m it took at most 32% of any band's ore.
3. **Most single purchases are barely felt.** At the same play skill, single rank-1 parts change W01 income by -1.5% to +7.6%; hull is exactly 0%. The two W01 attachments together add +2.4% for 1,300 CR. Payback times are 27-44 minutes, longer than the whole W01 visit. Only the full set of five parts compounds (+39%).

W02 is in better shape: it has a real depth gradient, a skill mechanic (volatile release) and a strong thermal auger. But the hand-off does not step up the curve. An all-rank-1 rig earns **+4.5%** more per minute on arrival than it did in W01, because shallow comet ore pays 36-39 CR per bulk against W01's 47.5, while rank-2 prices triple. Content ends at W02 M3 with leftover credits, no records and no reason to return.

Pacing against the design targets (median of 12 seeds; bot time is a lower bound on human time):

| Policy (simulated) | W01 done | W02 done | W01 + W02 |
| --- | --- | --- | --- |
| True-engine rusher, no purchases (10 seeds) | 4.4 min | (not run) | (not run) |
| Skilled, mission-first, buys useful parts | 7.9 min | 7.5 min | 15.7 min |
| Skilled completionist (buys the whole shop first) | 11.0 min | 21.8 min | 33.6 min |
| Novice model (slow input, cheap-first buys, cautious, 50% volatile success) | 24.9 min | 59.4 min | 83.5 min |
| Design target (config.ts:67, :86) | 45 min | 75 min | 120 min |

The failure economy is fair in one important way: there is no death spiral, because the fee is capped by cash and energy/hull are restored to 50%. Its information is poor, though. Energy warnings are fixed fractions of the tank, not of the return cost. The natural first action, holding Down, strands a fresh rig at 190 m on 40/40 seeds and wipes the whole 380 CR starter haul plus all 20 CR.

Rewards are flat. Values span 30-250 CR in W01 regardless of depth. Rare finds get the same popup and sound as Ironium. The 750 CR relic exists in 62% of W01 maps, and the completionist bot banked 3 of 10 relics present.

**Bottom line:** the economy needs structure more than new numbers. Make depth pay (P1). Make return risk legible (P2). Tie one or two depth gates to specific purchases (P3). Re-spec the dead purchases (P4). Keep it honest with a pacing harness in CI (P5). Contracts (P6) and reward feedback (P7) then supply the interim goals the current 6-milestone structure lacks.

## 2. Strengths (keep these)

- **Exact, trustworthy transactions.** Credits are integer tenths, previews are shared by the UI and charging, partial service rounds up once, and purchases fill the new capacity (model.ts:855-905, 906-934; tests/campaign-model.audit.ts:66-98). Players are never surprised by a price.
- **No-debt recovery with a floor.** Fee = min(cash, 25,000, 100 + 1% of equipment spend) (model.ts:1076-1096). Energy and hull rise to at least 50%, mission objects return to their sources, and emergency salvage spawns when no safe income is near the dock (model.ts:1097-1149). Once broke, a player can always recover for free and still mine. This is a genuine strength; keep it.
- **Guaranteed opening income.** The starter seams (world.ts:5-8, 132-134) pay 380 + 480 CR and fund M1 on the first dock. M1 is paid at about 15 s of active play (calib `opening`: trip 1 ends at 15.4 s with 380 CR).
- **Persistent shafts reward investment.** Falling back down an existing 59-row shaft costs 0.67 L, against about 22 L to dig it at rank 0 (calib). It is the right fantasy; it just needs depth to be worth it.
- **W02 has the right shape.** Rarity escalates with depth (world.ts:386-392): value per cell rises from 8.4 CR at 100-200 m to 14.4-16.3 CR at 600-900 m. Volatile release is a real skill-for-value mechanic. The thermal auger is the best-value single purchase measured (+13.8% income for 1,200 CR).
- **Visible construction payoff.** Each paid milestone changes the base art (e00-e03 screenshots), and the tracker shows fee progress against credits (missions.ts:100-113).
- **Testable, pure simulation.** Because model.ts is DOM-free, a faithful pacing harness was possible (section 4). That makes balance changes measurable.

## 3. Method

| Tool | What it does | File |
| --- | --- | --- |
| Primitive calibration (true engine) | Times and energy for every cut (rank 0-2, soil/rock, rows 0-59, down/side); flight, fall and surface drive by engine rank and cargo mass; 1-3 tile tunnel shuffles | `calib.audit.ts` -> `out/calib.json` |
| Fresh dive (true engine, 40 seeds) | Hold Down from spawn until disabled | `calib.audit.ts` (`freshDive`) |
| Safe dive (true engine) | Deepest round trip by tank (6/10/16/25 L) and drill rank, flying home at a computed reserve | `calib.audit.ts` (`safeDive`) |
| W01 rusher (true engine, 10 seeds) | Beacon/seam trip, column-21 seam, then a progressive corridor shaft for valve/antenna/core; pays milestones; no purchases | `rusher.audit.ts` -> `out/rusher.json` |
| Pacing simulator | Runs on the **real** `Campaign` state: generated terrain, packages, wall-occluded discovery (`refreshVisibility`), pickups (`updateObjects`) and the real bank/sell/refuel/repair/buy/payMilestone/recover/travel methods. Only motion is abstracted, cell by cell. Each move is charged with the model's own cut formula and energy rates, plus flight/fall/tunnel timings calibrated above. The planner is Dijkstra over known terrain (unknown = soil), chasing the best value per energy with a return-energy reserve; it explores the cheapest frontier and extends a shaft progressively toward mission objects. | `sim.ts` |
| Policies | skilled-balanced (mission-first, buys cargo, energy, drill...), skilled-completionist (buys the whole local shop before missions), skilled-rusher (no W01 buys), novice-completionist (+0.35 s per move, 40 s per dock, 35% reserve, cheapest-first buying, 50% volatile success). Skilled models use a 20 s terminal allowance per dock and 85% volatile success. | `campaign.audit.ts` -> `out/campaign.json` |
| Marginal value of each purchase | Same bot, mine-only for 15 simulated minutes per loadout, 8 seeds | `marginal.audit.ts` -> `out/marginal-w01.json`, `out/marginal-w02.json` |
| World economy | Ore density, mean value and value per cell by 100 m band; relics; 50 seeds per world | `worldstats.audit.ts` -> `out/worldstats.json` |
| World usage | Share of each band's ore banked, discovery %, relics found, at completion | `usage.audit.ts` -> `out/usage.json` |
| Proposal experiments | Depth-weighted W01 placement, drill-gated plate, retuned fees, shaft-brace feet, W02 commons at bulk 1 | `world-variant-steep.ts`, `steep.audit.ts`, `retune.audit.ts` -> `out/steep-*.json`, `out/retune-*.json` |

Run any of them with: `cd <repo> && npx vitest run --testTimeout=1800000 --dir work/progression <name>`.

**Limits.** Bot time is a lower bound on human time; the novice model is a crude multiplier, not a playtest. The simulator ignores the optional W01 shelves and W02 vents/cold pockets, so hull damage is under-counted, but those hazards are optional and avoidable in the real game too (F3). The mission-first bot mines opportunistically, so its W01 times sit between the rusher and a typical explorer.

## 4. Measurements

### 4.1 Primitives (true engine, `out/calib.json`)

Cut time is `max(0.25, dir x material x min(5, 1 + row/80) x tool / (drill/2))` (model.ts:475-485). The direction factor is 1 down and 0.75 sideways, rock is x1.85, and the W01 auger is x0.9 on soil only. Energy while cutting below the surface is 0.315 L/s (0.063 idle + 0.252 drilling; model.ts:404-418).

| Cut (down) | Row 0 | Row 30 | Row 59 |
| --- | --- | --- | --- |
| Soil, drill rank 0 (2.0) | 0.90 s / 0.22 L | 1.25 s / 0.39 L | 1.57 s / 0.49 L |
| Rock, drill rank 0 | 1.87 s / 0.47 L | 2.55 s / 0.80 L | 3.22 s / 1.01 L |
| Soil, drill rank 1 (2.8) | 0.65 s / 0.16 L | 0.90 s / 0.28 L | 1.13 s / 0.35 L |
| Soil, drill rank 2 (4.0) | 0.47 s / 0.11 L | 0.63 s / 0.20 L | 0.78 s / 0.24 L |

| Movement | Engine 0 | Engine 1 | Engine 2 |
| --- | --- | --- | --- |
| Fly up 59 rows (open shaft) | 10.17 s / 1.92 L | 9.15 s / 1.76 L | 8.20 s / 1.62 L |
| Fly up 59 rows with 12 packages (13.5 mass) | 10.18 s / 1.92 L | 9.15 s / 1.76 L | 8.20 s / 1.62 L |
| Fall 59 rows | 10.72 s / 0.67 L, no damage | 9.88 s / 0.61 L, no damage | 9.22 s / 0.57 L, **-1 HP** |
| Surface drive spawn to dock (15 tiles) | 3.93 s / 0.31 L | 3.80 s / 0.28 L | 4.08 s / 0.29 L |

Cargo mass has no measurable effect on climbing (massFactor = 1 + mass/198, model.ts:496; the climb is capped by vmax = 6 sqrt(power), model.ts:533).

### 4.2 Opening, dives and range (true engine)

| Scenario | Result |
| --- | --- |
| Opening trip 1: hold Down at spawn to the 100 m beacon, return, bank, sell, M1, refuel | 15.4 s active; haul 380 CR; 192.5 CR after M1 (200 CR) and refuel (20/20 seeds) |
| Opening trip 2: column-21 seam | 31.5 s cumulative; haul 480 CR; 669.7 CR |
| Fresh rig, hold Down until disabled | **Disabled at 190 m after 19.4 s, hold 7/7 (380 CR), on 40/40 seeds.** Recovery then costs all 20 CR (d05-underground.png) and the haul is lost. |
| Deepest safe one-shot round trip, 6 L start / 10 L / 16 L (rank 1) / 25 L (rank 2), drill rank 0 | 140 m / 250 m / 390 m / 570 m |
| Same with drill rank 1 | 190 m / 320 m / 500 m / 600 m |
| W01 rusher, no purchases (10 seeds) | M1 0.6 min, M2 3.3 min, M3 + departure **4.4 min** (with 20 s per dock; 163-165 s active). 5 trips. 0 recoveries. Leaves with 111-552 CR. |

Trip log, rusher seed 0 (`out/rusher.json`): beacon trip 380 CR; seam 480 CR; shaft to 320 m 120 CR (valve); to 470 m 120 CR (antenna, M2); to 600 m 90 CR (core, M3 paid with 171 CR left).

### 4.3 World economy (50 seeds per world, `out/worldstats.json`)

| W01 band | Deposit density | Mean value | Value / cell | Cut-time factor |
| --- | --- | --- | --- | --- |
| 0-100 m (incl. starter seams) | 20.0% | 49.1 CR | 9.82 | 1.00-1.11 |
| 100-200 m | 16.6% | 46.9 | 7.77 | 1.13-1.24 |
| 200-300 m | 17.2% | 47.1 | 8.12 | 1.25-1.36 |
| 300-400 m | 16.2% | 46.7 | 7.56 | 1.38-1.49 |
| 400-500 m | 15.4% | 47.8 | 7.35 | 1.50-1.61 |
| 500-600 m | 14.6% | 47.0 | 6.87 | 1.63-1.74 |

W01 holds 400 deposits worth **19,000 CR** per world. The relic (750 CR) is absent in 38% of maps; mean 0.76 per map.

| W02 band | Density | Mean value | Value / cell |
| --- | --- | --- | --- |
| 0-100 m (incl. starter veins) | 15.7% | 78.9 | 12.40 |
| 100-200 m | 11.7% | 71.7 | 8.36 |
| 400-500 m | 13.5% | 119.7 | 16.18 |
| 600-700 m | 12.1% | 119.3 | 14.39 |
| 700-800 m | 12.0% | 135.9 | 16.25 |
| 900-1000 m | 12.8% | 119.3 | 15.28 |

W02 holds 600 deposits worth **63,000 CR**; its relic (3,000 CR) is absent in 40% of maps. Per bulk, shallow W02 ore (0-200 m, 2 bulk per package) pays **36-39 CR/bulk** against W01's 47.5.

### 4.4 Sinks against sources

| | W01 | W02 |
| --- | --- | --- |
| Ordinary ore in the ground | 19,000 CR | 63,000 CR |
| Hardware ranks available | rank 1: 3,050 CR | rank 2: 9,200 CR |
| Local tools | 1,300 CR | 7,400 CR |
| Construction fees | 1,000 CR (5.3% of ore) | 2,000 CR (3.2% of ore) |
| Critical path (fees only) | 1,000 CR | 2,000 CR |
| Full refuel (largest tank) | 16 CR (rank 1) | 25 CR (rank 2) |
| Median haul per trip (skilled-balanced) | 380 CR (p90 580) | 650 CR (p90 1,550) |
| Design target net income | 118.9 CR/min | 248 CR/min |
| Simulated gross income | 222 (novice) to 481 (skilled completionist) CR/min | 328 to 885 CR/min |

### 4.5 Full-campaign pacing (12 seeds, `out/campaign.json`)

| Policy | 1st useful buy | W01 M1 / M2 / M3 | W02 M1 / M2 / M3 (cumulative) | Worst gap between gains | Credits left at end |
| --- | --- | --- | --- | --- | --- |
| Skilled-balanced | 2.5 min | 0.6 / 3.4 / 7.9 | 9.1 / 11.3 / 15.7 | median 3.8 min (max 5.1) | 118-2,313 CR |
| Skilled-completionist | 1.8 | 0.6 / 7.5 / 11.0 | 25.8 / 28.6 / 33.6 | 3.9 (max 5.8) | 156-4,238 |
| Skilled-rusher (no W01 buys) | 15.8 | 0.6 / 3.4 / 15.4 (*) | 16.5 / 17.8 / 23.7 | 12.0 (max 17.1) | 0-1,711 |
| Novice-completionist | 6.7 | 1.2 / 17.5 / 24.9 | 60.0 / 69.4 / 83.5 | 10.3 (max 13.0) | 0-1,481 |

All 48 runs completed both worlds with 0 recoveries. Values are medians in minutes from the start. (*) This policy's mission advance only runs once no ore is affordable, so its W01 M3 is slower than the true-engine rusher's 4.4 min; it is not the critical-path measure. The novice buys hull and engine first because they are cheapest, and reaches a useful part at 6.7 min.

Ruptured volatile packages per W02 run: skilled 0-4, novice 6-17. Mining-trip depth (median of each trip's maximum): completionist 100 m (W01) and 210 m (W02); novice 90 m / 220 m.

### 4.6 Marginal value of each purchase (mine-only bot, 15 min x 8 seeds, median income)

| W01 loadout | CR/min | vs base | Payback | Felt effect in play |
| --- | --- | --- | --- | --- |
| Base (rank 0) | 368 | 0 | | |
| + drill 1 (750) | 396 | **+7.6%** | 27 min | cuts 29% faster |
| + cargo 1 (700) | 390 | +6.1% | 31 min | 7 to 12 bulk, but the trip becomes energy-bound |
| + energy 1 (650) | 383 | +4.1% | 44 min | 10 to 16 L, but the trip becomes cargo-bound |
| + engine 1 (500) | 362 | -1.5% (noise) | never | +11% flight speed |
| + hull 1 (450) | 368 | **0.0%** | never | none (no damage sources in normal play) |
| + feet R2 + rack R3 (1,300) | 377 | +2.4% | 150 min | rack +1 bulk |
| All five rank-1 parts (3,050) | 511 | +38.9% | 21 min | |
| All rank-1 parts + R2 + R3 (4,350) | 575 | +56.4% | | |

| W02 loadout (arrival = all rank 1) | CR/min | vs arrival |
| --- | --- | --- |
| Arrival | 534 | 0 (W01 end rig in W01: 511, so **+4.5%** for the world change) |
| + thermal auger (1,200) | 607 | **+13.8%** |
| + cargo 2 (2,400) | 616 | +15.5% |
| + drill 2 (2,200) | 595 | +11.5% |
| + engine 2 (1,600) | 548 | +2.8% |
| + energy 2 (1,800) | 509 | -4.6% |
| + hull 2 (1,200) | 534 | 0.0% |
| All rank 2 (9,200) | 699 | +31.0% |
| + auger | 872 | +63.4% |
| + condenser (2,200) | 859 | **-1.5% vs the row above** (no income effect) |
| + preservation chamber (4,000) | 911 | +6.0% vs the row above |

Anchoring feet, measured directly (`feet.audit.ts` -> `out/feet.json`): a 30-row climb with Brace held costs 1.0073 L against 1.0075 L without; the feet are deployed for 0 frames while climbing. The only effect is a shorter ground skid, 1.23 tiles in 0.80 s instead of 1.53 tiles in 1.45 s.

### 4.7 World usage at completion (skilled-completionist, 10 seeds, `out/usage.json`)

- W01: 19-29% of cells discovered. Ore banked: 60-91% of the 0-100 m band, 16-55% of 100-200 m, 0-31% of 200-300 m, 0-32% (typically under 15%) of each band from 300 to 600 m. Relics present in 7/10 maps (10 relics), banked 3 (30%).
- W02: 26-36% of cells discovered. Ore banked: 61-97% of 0-200 m, 38-72% of 200-400 m, 10-53% of 400-600 m, 1-12% of 600-800 m and 0-5% of 800-1000 m, the richest zone. Relics present in 8/10 maps (11 relics), banked 2 (18%).

### 4.8 Proposal experiments (same harness, 6 seeds, medians)

All of these are measured, not assumed.

**P1 prototype (`world-variant-steep.ts`).** Depth-weighted placement: minimum rows 0/4/15/32, weight (1 + row/15)^k with k = 0/1.0/2.4/3.2, band shares 16/40/44%. It keeps the exact 240/120/36/4 ore counts, the starter seams, the mission cells and the existing 100-seed budget floors (tests/campaign-world.audit.ts:40-49), all re-checked in `steep.audit.ts`.

| W01 band | Current value / cell | P1 value / cell |
| --- | --- | --- |
| 0-100 m | 9.82 | 6.37 |
| 100-200 m | 7.77 | 4.77 |
| 200-300 m | 8.12 | 5.97 |
| 300-400 m | 7.56 | 7.27 |
| 400-500 m | 7.35 | 10.37 |
| 500-600 m | 6.87 | **12.75 (2.7x the 100-200 m band)** |

Marginal value of purchases on the same 6 seeds (`out/steep-marginal.json`):

| Loadout | Current CR/min (vs base) | With P1 CR/min (vs base) | Mining-trip depth, current to P1 |
| --- | --- | --- | --- |
| Base | 368 | 228 | 90 to 95 m |
| + drill 1 | +12.0% | **+25.9%** | 115 to 125 m |
| + energy 1 | +2.6% | **+11.5%** | 110 m |
| + cargo 1 | +7.3% | +10.3% | 120 m |
| + engine 1 | +1.1% | +1.2% | 95 to 100 m |
| All rank 1 | +38.0% | **+61.5%** | 145 to 185 m |

The 6-seed "current" numbers differ slightly from the 8-seed table in section 4.6 (seed noise); the comparison above is paired.

W01 completion, M3 in minutes (`out/steep-campaign.json`, `out/retune-campaign.json`):

| Variant | Skilled mission-first | Skilled completionist | Novice model | Buys only what is required |
| --- | --- | --- | --- | --- |
| Current game | 7.7 | 11.4 | 24.2 | 4.4 (true-engine rusher) |
| P1 placement | 8.9 | 15.7 | 37.3 | not run |
| P1 + plate at 310 m needing drill rank 1 | 7.5 | 15.7 | 37.3 | 7.1 (must buy the drill) |
| P1 + plate + fees 250/900/1,600 | **13.6** | not run | **48.0** (41.4-60.4) | **12.1** |

With the retuned fees, the worst gap between gains rises to a median 6.6 min (skilled) and 11.3 min (novice, max 19.8). That is why contracts (P6) must accompany any fee increase.

Other experiments:
- **W02 commons at bulk 1** (Frost iron, Blue nickel): arrival-rig income 525 to **662 CR/min (+26%)** (`out/retune-w02bulk.json`).
- **Anchoring feet as a shaft brace** (side cuts allowed while touching a wall): 362 to 348 CR/min (-4%, within seed noise) (`out/retune-brace.json`). The brace is a capability, not an income lever; validate it by playtest.

## 5. Findings

Severity reflects player impact on progression and pacing. Every number below can be reproduced from the files in section 3.

### PROG-F1 — Critical: the W01 critical path needs no upgrades and ends in about 4 minutes, so the upgrade loop is optional
**Evidence.**
- True-engine rusher (`rusher.audit.ts`, `out/rusher.json`): 10/10 seeds pay M1-M3 and depart in **5 trips with zero purchases**, using 163-165 s of active play (263-265 s with 20 s per dock) and leaving with 111-552 CR.
- **Why it works.** All four objectives (beacon row 9, valve row 24, antenna row 39 in column 21, core row 59) sit in the protected all-soil corridor under the spawn (world.ts:28-50, :58; config.ts:354-357), on every seed. Re-using a shaft makes depth cheap: falling 59 rows costs 0.67 L, while a fresh 10 L rig can safely dive 250 m (section 4.2). So each trip extends the shaft 150-200 m.
- **Money is not a gate.** Fees total 1,000 CR (config.ts:460-485) against 860 CR from the two starter seams (world.ts:5-8) plus corridor ore.
- **The shop is a side activity.** Mission-first skilled bot: W01 in 7.9 min. A bot that buys the entire W01 shop first: 11.0 min. Novice model: 24.9 min. Target: 45 min (config.ts:67). Median trip depth is 330 m for the mission-first bot and 100 m for the shop-first bot (`out/campaign.json`).

**Player impact.** Nothing in W01 requires the economy, so upgrades feel optional and the chapter ends before a buy-upgrade-go-deeper rhythm forms. Players who explore still finish in roughly a third to a half of the intended time.

### PROG-F2 — Major: depth does not pay in W01 (flat value, falling density, rising cost)
**Evidence.**
- world.ts:162-179 draws ore types from one shuffled pool and only splits deposit counts 20/50/30% by band, so ore type is independent of depth.
- Over 50 seeds, mean value is 46.7-49.1 CR in every 100 m band, density falls from 20.0% to 14.6%, and value per cell falls from 9.82 to 6.87 CR (`out/worldstats.json`).
- Cut time grows by min(5, 1 + row/80) (model.ts:479), 1.74x at 600 m. A deep cell therefore returns about 40% of a shallow cell's value per second of drilling, before the longer flight home.
- Bots stay shallow. Mining-trip depth is 100 m (skilled completionist) and 90 m (novice) in W01. At completion they had banked 60-91% of 0-100 m ore and 0-32% of any band below 200 m, with 19-29% of the map discovered (`out/usage.json`).
- Contrast: W02 gates rarity by depth (world.ts:386-392). Its value per cell rises from 8.4 CR (100-200 m) to 14.4-16.3 CR (600-900 m).

**Player impact.** Risk and reward are inverted. The "deep frontier" offers only cost, five-sixths of the asteroid is filler, and drill and energy upgrades have nothing to unlock.

### PROG-F3 — Major: single purchases are barely felt, and four are effectively dead
**Evidence.** All figures are mine-only income from the same bot over 15 minutes and 8 seeds (section 4.6).
- **W01.** Drill +7.6%, cargo +6.1%, energy +4.1%, engine -1.5% (noise), hull 0.0%. Paybacks are 27, 31 and 44 minutes for drill, cargo and energy, longer than a W01 visit. Only the full set of five compounds (+38.9%).
- **Hull** (W01 450 CR, W02 1,200 CR): 0%. Damage comes only from three optional W01 shelves (3 HP; model.ts:768-791, config.ts:458), two optional W02 vents (6 HP; frontier.ts:130-133, :142) and hard landings. Hard landings need a fall faster than 7 cells/s (model.ts:586-590), but fall speed is capped at 6 (rank 0) or 6.66 (rank 1) by model.ts:533. The design acceptance test buys hull as its "useful purchase" (tests/campaign-model.audit.ts:129-160).
- **Anchoring feet** (400 CR, required for the rack): thrust saving applies only while grounded (model.ts:395-403). Measured: 1.0073 L against 1.0075 L for a 30-row climb, feet deployed for 0 frames in flight. The only effect is a 1.23-tile skid instead of 1.53 (`out/feet.json`).
- **External rack** (900 CR): +20% rounded down (model.ts:190-197) gives +1 bulk at cargo 7 and +2 at 12. Cargo rank 1 gives +5 for 700 CR.
- **Engine:** 59-row climb 10.2 s at rank 0, 9.15 s at rank 1, 8.2 s at rank 2. Cargo mass does not change climb time (section 4.1).
- **W02.** Thermal auger +13.8%, cargo 2 +15.5% and drill 2 +11.5% are felt. Engine 2 +2.8%, energy 2 -4.6% and hull 2 0.0% are not. The vapour condenser (2,200 CR) changes income by -1.5%.

**Player impact.** Spending feels unrewarding. A novice who buys the cheapest part first gets hull, which does nothing; their first useful purchase comes at 6.7 min against 1.8-2.5 min for informed policies. "Upgrade satisfaction", the genre's main motivator, is missing.

### PROG-F4 — Major: the W02 hand-off does not step up the curve
**Evidence.**
- W02 ores weigh 2 bulk (frontier.ts:22-59). Shallow comet ore (0-200 m: Frost iron and Blue nickel only) therefore pays 36-39 CR per bulk against W01's 47.5 (`out/worldstats.json`).
- The W01 end-game rig (all rank 1) earns 511 CR/min in W01 and 534 CR/min on arrival at W02, **+4.5%**.
- Rank-2 prices are 1,200-2,400 CR against 450-750 CR for rank 1 (config.ts:20-36), so the time to afford a part roughly doubles to triples.
- W02 only "feels richer" after rank 2 plus the thermal auger (10,400 CR, +63%) or when mining below 450 m. Bots rarely go there: 1-12% of 600-800 m ore and 0-5% of 800-1,000 m ore banked (`out/usage.json`).

**Player impact.** A new world should feel like a promotion. Instead the first comet trips pay less per hold than the asteroid while prices triple, and the rich deep comet goes unseen.

### PROG-F5 — Major: no long-term structure; content ends at W02 M3 with nothing to spend, chase or return for
**Evidence.**
- After W02 M3 the tracker says "Iron planet charted · chapter in development" (missions.ts:129-151). Leftover credits at the end: 118-2,313 CR (balanced) and 156-4,238 CR (completionist), with nothing to buy (`out/campaign.json`).
- W01 caps hardware at rank 1 (model.ts:140-142), so its shop is exhausted after about 11 min for a completionist.
- Statistics exist (mined, ordinary income, recoveries, largest depth, expeditions; types.ts:94-101), but the pause "Flight record" shows only credits, deepest discovery, milestones, destination, stored cargo and mission objects (main.ts:610-626).
- Searches of src/ found no records, achievements, contracts, bounties or mastery goals.
- Worst gap between gains (purchase or milestone) per run: median 3.8-3.9 min for skilled bots and 10.3 min (max 13.0) for the novice model.

**Player impact.** Players have no reason to keep going after the six milestones or to revisit a claim. The ending is abrupt, and slower players get long stretches with no new gain.

### PROG-F6 — Moderate: milestones are single-shaft fetch quests with token fees, identical on every seed
**Evidence.**
- Fees are 200/300/500 CR in W01 (config.ts:460-485), 5.3% of the 19,000 CR of ore. W02's 400/600/1,000 CR are 3.2% of 63,000 CR.
- In the balanced run M2 follows M1 by 2.8 min and M3 follows M2 by 4.5 min. The fees forced only 6 fee-saving trips across 12 skilled-balanced W01 runs (0.5 per run) and none in W02 (`out/campaign.json`, trip kinds).
- Objective coordinates are constants. W01: columns 20-21 at rows 9/24/39/59 (world.ts:28-50). W02: samples in columns 22-26 at row 14, the marked vein in columns 22-25 at rows 44-45, and the catalyst in column 24 at row 99 (world.ts:275-290, :357-364). All lie in protected corridors (world.ts:58, :274), so the locator always points straight down from the spawn.
- The construction stages are a genuine visual reward (e00-e03 screenshots). The goals behind them are not.

**Player impact.** Milestones ask for no exploration, planning or saving, every replay is the same, and "paying CR into construction" carries no weight.

### PROG-F7 — Moderate: the failure economy is fair but blind; the natural first action wipes the opening, and warnings are not depth-aware
**Evidence.**
- **First-session failure.** Holding Down from the spawn disables a fresh 6 L rig at 190 m after 19.4 s with a full 7/7 hold (380 CR) on 40/40 seeds (`out/calib.json`). Recovery costs min(cash, 25,000, 100 + 1% of equipment spend) = all 20 CR (model.ts:1076-1096; d05-underground.png), and carried cargo is lost (model.ts:1101). That is the entire tutorial payout, almost two M1 fees.
- **Warnings ignore return cost.** Energy warnings fire at 25% and 15% of the tank (main.ts:373-376). From 600 m the trip home costs 1.92 L flying plus 0.31 L on the surface, plus up to 0.49 L (soil) or 1.01 L (rock) to finish a committed cut (section 4.1). With the starting 10 L tank the first warning (2.5 L) therefore arrives after the point of no return, with no "return point" anywhere in the HUD.
- **What works.** Recovery never creates debt, restores energy and hull to at least 50%, and spawns emergency salvage (model.ts:1089-1145). A broke player always recovers for free, so there is no death spiral.

**Player impact.** New players lose their first 400 CR to the most natural input. Later, deep trips with small tanks become traps that the HUD does not foresee.

### PROG-F8 — Moderate: services carry no economic weight, so "efficiency" upgrades only buy range
**Evidence.**
- Refuelling costs 1 CR per litre (model.ts:859). A full 16 L tank costs 16 CR against a median 380 CR haul (4%); a full 25 L tank costs 25 CR against a 650 CR median W02 haul.
- The condenser refunds 20% of ice-drilling energy (model.ts:631-641), worth well under 1 CR per trip, and measured at -1.5% income. Energy rank 2 measured -4.6%.
- Repair (15 CR/HP) is the only meaningful service price, but damage barely exists (F3). No simulated run took any hull damage.

**Player impact.** No refuel or repair decision ever matters, and items sold as "fuel economy" are invisible. The energy bar acts as a timer, not a resource.

### PROG-F9 — Moderate: reward cadence is flat and big finds are not celebrated or even heard
**Evidence.**
- W01 values are 30/60/100/250 CR at 60/30/9/1 weights at every depth (F2). Skilled-balanced hauls: median 380 CR, p90 580 CR (1.5x the median).
- The pickup popup shows only the name ("+ Ironium"; scene.ts:941-956), never the value or rarity.
- The scene's pickup event is never wired: main.ts:1925-1941 passes no `onEvent`. The "pickup" chime plays on every mined cell (main.ts:1956-1958; audio.ts:58-73), so finding Goldium sounds exactly like cutting dirt.
- The sale message is one line, "Sold stored cargo for X CR." (model.ts:851), with no breakdown or best find.
- Relics (750 CR in W01, 3,000 CR in W02) are absent in 38-40% of maps (world.ts:219-220). The completionist bot banked 3 of 10 W01 relics and 2 of 11 W02 relics that existed (`out/usage.json`).

**Player impact.** No jackpot moments and little anticipation. The best item in each world is unseen by most players, and nothing marks a good run.

### PROG-F10 — Moderate: W02 volatile losses scale with value and hit novices hardest, with no ramp
**Evidence.**
- Cryosilicate and Helion ice are 10% of comet deposits but 37% of ordinary value: (9 x 300 + 1 x 1,200) / (100 x 105) from frontier.ts:22-59.
- Holding any drilling input past the 0.75 s window ruptures the package (frontier.ts:140; model.ts:380-392, :642-672).
- Ruptured packages per W02 run: 0-4 at the skilled 85% success rate, **6-17** at the novice 50% rate (`out/campaign.json`). Each Helion lost is 1,200 CR, one rank-2 hull.
- The only ramp is one safe tutorial crystal (world.ts:361-362). The +30% chamber bonus arrives only after M2 and 4,000 CR (frontier.ts:83-91).

**Player impact.** The comet's skill mechanic mostly destroys value for the players who most need income, which compounds F4's flat hand-off.

### PROG-F11 — Minor: unlock and reward text is inconsistent, uses designer IDs, and promises things that already exist
**Evidence.**
- The Lander tab prints the design-pack descriptions (main.ts:1199). M1 reads "Unlock R2 and a surface service dock" (config.ts:466) although services exist from the start (CAMPAIGN_W01.md:15), while the tracker says "Unlock: rank 1 hardware + anchoring feet" (missions.ts:121-125). See e07-dock-lander-stage1.png and d10-dock-lander.png.
- M2 promises "the star map", but the map only lists destinations; travel needs M3 and departure (main.ts:532-539; model.ts:1182-1186).
- Before M1 the Hardware tab lists five priced but disabled parts, each with "Blueprint: complete Survey the wreck." (main.ts:1081; d10-dock-hardware.png). This is minor in practice: M1 lands at 0.6-1.2 min in every simulated run.

**Player impact.** Players cannot tell what a milestone actually grants, so rewards feel arbitrary.

### PROG-F12 — Minor: engine rank 2 adds hidden fall damage in W01
**Evidence.**
- Fall speed is capped at min(12, 6 sqrt(power)) = 7.43 cells/s at engine rank 2 (model.ts:533), above the 7.0 hard-landing threshold (model.ts:586-590).
- Measured: every W01 fall of 20 rows or more with engine 2 costs 1 HP (calib `flight`: hull 10 to 9). Ranks 0 and 1 never take damage. W02's low gravity keeps falls at 4.75 cells/s.

**Player impact.** Returning to the asteroid after upgrading the engine makes routine shaft descents cost repairs, which reads as a bug and punishes an upgrade.

## 6. Proposals

Ordered by player impact per unit of effort. Effort: S is 1 day or less, M is 2-4 days, L is 1-2 weeks, XL is more than 2 weeks. "Deviation" marks any change to an approved decision or pinned v0.1 value.

### PROG-P1 — Make depth pay in W01 with depth-weighted ore placement
- **Addresses:** F2, F1, F3 (and F4 indirectly: the W01 end-game rate becomes 368 CR/min, so the comet's 534 CR/min reads as a +45% promotion).
- **Change:**
  - Replace the depth-blind placement (world.ts:162-217) with rarest-first, depth-weighted placement.
  - Minimum rows 0/4/15/32 (Ironium, Bronzium, Silverium, Goldium); weight (1 + row/15)^k with k = 0/1.0/2.4/3.2.
  - Band shares 16/40/44% (from 20/50/30).
  - Starter seams, mission cells, relic logic and the exact 60/30/9/1 counts stay unchanged.
- **Implementation:**
  - Port `createW01Steep` from `work/progression/world-variant-steep.ts` into `createW01`. It reuses the W02 pattern (world.ts:386-424) plus a weighted shuffle (key = random()^(1/w)).
  - Bump `GENERATOR_VERSION` to 2 (config.ts:5) and let `decodeCampaign` accept 1 and 2 (model.ts:1244-1246). Saved worlds keep their stored terrain, so old campaigns are unaffected.
  - Add a 100-seed assertion to tests/campaign-world.audit.ts.
- **Acceptance:**
  - Over 100 seeds: ore counts stay exactly 240/120/36/4; the existing band floors pass (already verified on the prototype).
  - Value per cell at 500-600 m is at least 2.0x the 100-200 m band (prototype 2.67x).
  - In the harness, each of drill 1, energy 1 and cargo 1 gives at least +10% income (prototype +25.9/+11.5/+10.3%).
  - Novice-model W01 takes at least 35 min (prototype 37.3).
- **Impact:** high. **Effort:** S. **Depends on:** none.
- **Deviation:** no pinned number changes (values, weights, counts, bulk, budget floors are kept). It changes generator behaviour, so new seeds produce different maps; record it as generator v2.

### PROG-P2 — Make return risk legible and soften the first failure
- **Addresses:** F7, F12.
- **Change:**
  - (a) A depth-aware return estimate with "Turn back" and "Critical" warnings, plus a tick mark on the energy bar.
  - (b) The first recovery on each world is free and banks the carried cargo instead of destroying it ("rescue drone"); later recoveries are unchanged.
  - (c) Start with a full tank: 6 to 10 L.
  - (d) The hard-landing threshold never sits below the fall-speed cap.
- **Implementation:**
  - model.ts: add `get returnEstimate()`. Rows to surface x (0.063 + 0.126 x movementFactor) / vmax, plus wrapped distance to the dock x 0.0207 x mf, plus the energy left in a committed cut (cut.seconds x (1 - progress) x 0.315). These are the calibrated constants: 0.0315 L/row at rank 0 and 0.31 L for 15 surface tiles.
  - main.ts:367-380 (`syncSafety`): margin = energy - returnEstimate. "Turn back" when margin is at most max(1.0 L, one cut at the current row); "Critical" when at most 0.3 L.
  - Energy bar (main.ts:749-761): draw the estimate as a tick.
  - model.ts `recover()` (:1097-1149): if `progress.graceUsed` lacks the current world, the fee is 0 and carried packages become `banked`. Persist `graceUsed: string[]` and default it on decode.
  - model.ts:64: energy 6 to 10.
  - model.ts:586: threshold `Math.max(7, maxVertical + 0.3)`.
- **Spec (HUD):**
  `ENERGY 7.4/16 L [=========|--]  return 2.1 L` (the "|" marks the return point). The bar turns amber with "Turn back · 1.0 L spare" and red with "Critical · return now".
- **Acceptance:**
  - A harness check at 0-600 m depth and 6/10/16/25 L tanks: "Turn back" fires while energy still covers the return plus one cut.
  - A fresh hold-Down run is warned at least 3 s before disablement.
  - The first recovery keeps cargo; engine rank 2 falls in W01 deal 0 damage.
  - Update the recovery tests (tests/campaign-model.audit.ts:99-127, 262-298).
- **Impact:** high. **Effort:** S. **Depends on:** none.
- **Deviation:** (c) changes the research-inherited start (docs/RESEARCH.md "Start" row: 6 L), judged on merit as a needless first-session trap. (b) relaxes the approved recovery rule "ordinary cargo/relic loss" (DESIGN_PACK_IMPLEMENTATION.md:145) for one recovery per world.

### PROG-P3 — Tie W01 depth to the equipment curve and make construction a saving goal
- **Addresses:** F1, F6, F3 (hull).
- **Change:**
  - (a) **Fused-plate stratum** at rows 30-31 (310-320 m), the full width including the corridor, between the valve (250 m) and the antenna (400 m). It needs drill rank 1 and cuts 2.5x slower than soil. Tracker task: "Breach the plate at 310 m · Steel auger assembly required".
  - (b) **Fees** W01 200/300/500 to 250/900/1,600; W02 400/600/1,000 to 600/1,800/3,500 (the W02 numbers scale by the measured W02/W01 income ratio and are not yet simulated).
  - (c) **Pressure seams below 450 m:** about 8% of deep soil cells hiss for 1.2 s after being cut, then deal 4 HP unless the rig has moved 1 cell away. This gives hull a job: 10 HP survives 2 hits, 18 HP survives 4.
- **Implementation:**
  - world.ts `createW01`: after carving, set rows 30-31 to a new material 4 (mission cells untouched).
  - model.ts cut start (:446-486): if material is 4 and the drill rank is below 1, set a message and do not cut; otherwise apply factor 2.5. `decodeCampaign` must accept tile 4 (model.ts:1360).
  - scene.ts: plate tile art via the assets pipeline.
  - missions.ts: add a "plate" task while M2 is current and the drill rank is below 1.
  - config.ts/frontier.ts: fee constants.
  - Pressure seams: a per-world list like `shelves`, with a timer modelled on model.ts:768-791.
- **Acceptance (harness):**
  - A no-purchase policy cannot reach the antenna.
  - A policy that buys only the drill finishes W01 in at least 10 min (prototype 12.1).
  - Skilled mission-first 12-18 min (prototype 13.6); novice model 40-55 min (prototype 48.0).
  - With pressure seams, hull rank 1 cuts repair spend on deep trips by at least 50%.
  - With P6, the novice's worst gap between gains is at most 8 min (prototype without P6: 11.3).
- **Impact:** high. **Effort:** M. **Depends on:** P1 (depth below the plate must pay), P5 (to tune).
- **Deviation:** new material and hazard not in the v0.1 pack; construction fees are pinned (balance JSON `milestone_fees` [200,300,500] and [400,600,1000]).

### PROG-P4 — Re-spec the purchases that are not felt
- **Addresses:** F3, F8.
- **Change (tuned values):**

| Item | Now | Proposed | Measured or expected effect |
| --- | --- | --- | --- |
| External rack W01-R3 | +20% rounded down (7 to 8, 12 to 14); requires feet | **+30% rounded up** (7 to 10, 12 to 16, 20 to 26); no prerequisite | +3 to +4 bulk, comparable per CR to cargo rank 1 |
| Anchoring feet W01-R2 | thrust -20% only while grounded (0 frames in flight); skid 1.53 to 1.23 tiles | **Shaft brace**: hold next to a wall to hang without thrust and side-cut without a floor; 400 to 250 CR | Capability, not income (sim -4%, noise); unlocks branch pockets at any row |
| Vapour condenser W02-R2 | 20% ice-drilling refund (income -1.5%) | **Steam reserve**: bank 20% of ice-drilling energy into a separate 5 L reserve that auto-feeds at 0 L; 2,200 to 1,600 CR | Converts a no-op into anti-stranding insurance |
| Engine (all ranks) | climb unaffected by load; +11% speed per rank | massFactor 1 + mass/80 (from /198); vertical cap 6 x power^0.75 (from 6 sqrt(power)) | A full 12-bulk hold climbs about 17% slower at rank 0; rank 1 restores it |
| Hull (all ranks) | 0% effect | Unchanged price; gets a job from P3 pressure seams | Repair savings at depth |

- **Implementation:**
  - config.ts:441-459: rack multiplier, `requires: null`, prices.
  - model.ts:190-197: use `Math.ceil` for capacity.
  - model.ts:395-403 and :430: let feet deployment and side-cut support accept wall contact.
  - model.ts:631-641 plus a persisted `vehicle.reserve`.
  - model.ts:496, :533: mass and engine constants (co-own with the movement/feel review).
- **Acceptance:** in the harness, every hardware rank and tool has either at least +8% income or a declared, scripted non-income test: brace reaches a wall ore without a ledge; the steam reserve turns a 0 L event at 400 m into a safe return; a rank-1 engine climbs 59 rows with a full hold at least 15% faster than rank 0.
- **Impact:** high. **Effort:** M. **Depends on:** P3 (hull role), P5.
- **Deviation:** pinned effect texts and values (rack, feet, condenser; balance JSON W01/W02 gear) and pinned rules (`gravity_mass_factor`, `maximum_vertical_travel_cells_per_second`).

### PROG-P5 — Commit the pacing harness and guard balance in CI
- **Addresses:** F1-F4 regression risk and the pack's own validation plan (DESIGN_PACK_IMPLEMENTATION.md:162-176: telemetry, pacing and "no duration claim by arithmetic alone").
- **Change:** move `sim.ts`, the policies and `calib.audit.ts` into `tests/pacing/`; add `npm run pacing` (a table printout plus `artifacts/pacing.json`) and a `pacing.audit.ts` with guardrails.
- **Implementation:** about 2 CPU-minutes for 12 seeds x 4 policies. A calibration test re-measures true-engine primitives and fails on more than 10% drift from the abstract cost model. Add an optional local-only playtest summary (net CR/min, packages/min, time between gains), as the pack planned.
- **Guardrails:**
  1. The critical path needs at least one purchase (after P3); skilled mission-first W01 takes 12-20 min.
  2. Novice model: W01 35-55 min, W02 60-90 min.
  3. Every part and tool clears +8% income or has a tagged non-income test.
  4. W01 value per cell at 500-600 m is at least 2x the 100-200 m band.
  5. W02 arrival income is at least 1.25x the W01 end rate.
  6. The novice's worst gap between gains is at most 8 min.
  7. 0 recoveries for skilled policies.
- **Sample output:**

```
policy               W01 M1/M2/M3 (min)  W02 M1/M2/M3   worst gap  CR/min W01/W02  recoveries
skilled-balanced     0.6 / 5.9 / 13.6    ...            6.6        ...             0
novice-completionist 1.2 / 31.8 / 48.0   ...            11.3 FAIL  ...             0
```

- **Impact:** high (enabler). **Effort:** M. **Depends on:** none. **Deviation:** none.

### PROG-P6 — Contracts: optional bounties that fill the gaps between milestones
- **Addresses:** F5, F6, F9.
- **Change:** two active contracts per world, offered at the lander, each paying 25-50% of a typical full hold. Contracts are never required for milestones and refresh after each construction payment.

| W01 examples | W02 examples |
| --- | --- |
| Survey sample: bank 3 Silverium (+150 CR) | Cold chain: bank 4 intact cryosilicate (+600 CR) |
| Deep haul: dock from 350 m or deeper with at least 8 bulk (+200 CR) | Crown run: bank a Helion ice from 650 m or deeper (+800 CR) |
| Clean hull: 2 trips below 300 m without damage (+120 CR) | Steady hands: 5 intact volatiles in a row (+500 CR) |
| Relic hunter: bank the asteroid relic (+300 CR) | Vent dancer: bank a full hold without hull damage below 500 m (+400 CR) |

- **Implementation:**
  - New `src/campaign/contracts.ts` with typed predicates; no prose parsing, per the pack's rule.
  - A per-trip summary recorded at dock arrival (model.ts:793-795): max depth, damage taken, packages, intact and ruptured counts.
  - State `progress.contracts` per world (schema, decode validation).
  - UI: a Lander-tab card, plus one tracker line.
- **Spec (dock card):**
  `CONTRACT · Deep haul  [ 6 / 8 bulk from 350 m+ ]  Reward 200 CR  [Track]`
  The tracker line reads "Contract · Deep haul 6/8 bulk".
- **Acceptance:**
  - Novice model: median gap between meaningful gains (purchase, milestone or contract) at most 3 min, worst at most 8 min, in W01 and W02 (currently 3.2 and 10.3-13 min).
  - Contract payouts stay at most 15% of world income.
- **Impact:** high. **Effort:** M. **Depends on:** P5.
- **Deviation:** a new system, though it fits the pack's "objective predicates" boundary (DESIGN_PACK_IMPLEMENTATION.md:50).

### PROG-P7 — Reward feedback: show value, rarity and jackpot moments
- **Addresses:** F9, F10.
- **Change:**
  - (a) The popup reads "+ Silverium · 100 CR", tinted by tier (common, uncommon, rare, jackpot).
  - (b) Wire the scene's pickup event to audio and give rare and jackpot finds their own cues. Today `onEvent` is never passed (main.ts:1925-1941), and the "pickup" chime plays on every mined cell (main.ts:1956-1958).
  - (c) A **haul report** on Unload & sell: count and value by ore, total, best find, deepest point and new records.
  - (d) **One relic in every world**, placed in the deepest third (W01 rows 40+, W02 rows 60+), with an "anomaly" ping within 6 cells using the POI band logic.
  - (e) On a volatile rupture, show the value lost ("Cryosilicate ruptured · -300 CR").
- **Implementation:** scene.ts:941-956; main.ts:1925 bindings; audio.ts:58-73 new cue variants; `model.sell()` returns a breakdown; world.ts:219-241 and :426-448 relic placement; poi.ts anomaly signal.
- **Spec (haul report):**

```
HAUL REPORT · Trip 7 · deepest 420 m
  Ironium x4  120 · Bronzium x3 180 · Silverium x2 200
  Best find: Silverium (100 CR)          Total +500 CR
  New record: deepest trip on this claim
```

- **Acceptance:** a browser smoke test confirms a distinct popup and cue per tier; a relic exists on 100/100 seeds; the completionist model banks the relic on at least 60% of seeds (currently 30% W01, 18% W02).
- **Impact:** medium-high. **Effort:** S-M. **Depends on:** none.
- **Deviation:** the relic count changes from a 0/1/2 roll (world.ts:219-220) to exactly 1; relic values unchanged.

### PROG-P8 — Fix the W02 hand-off curve
- **Addresses:** F4, F10.
- **Change:**
  - Frost iron and Blue nickel go to **bulk 1**; volatile ores keep bulk 2. Measured: arrival income +26% (525 to 662 CR/min).
  - A volatile primer: the first 3 volatile cuts in W02 use a 1.5 s window, labelled "training window", then 0.75 s.
- **Implementation:** frontier.ts:22-40 (bulk); frontier-world tests; model.ts:620-627 reads a persisted `world.volatilePractice` counter.
- **Acceptance:** W02 arrival income is at least 1.25x the W01 end rate (with P1 the ratio is about 1.8); novice-model ruptures are at most 5 per W02 run (currently 6-17).
- **Impact:** medium. **Effort:** S. **Depends on:** none.
- **Deviation:** pinned W02 bulk 2 (balance JSON W02 `bulk: 2` and ore bulk) and the pinned 0.75 s window.

### PROG-P9 — Generate player-facing reward and unlock text from data
- **Addresses:** F11.
- **Change:**
  - Lander-tab and tracker rewards come from the actual gates. M1: "Unlocks: 5 rank-1 hardware blueprints · Anchoring feet". M2: "Unlocks: External cargo rack · Navigation archive (view routes)". M3: "Frontier certificate · travel to the Ice comet".
  - Before M1, show one "Blueprints unlock at Survey the wreck" card instead of five disabled price cards.
- **Implementation:** a shared `milestoneRewards(world, id)` derived from `W0x_GEAR.milestone`, `hardwareUnlocked` and the travel gates, used by missions.ts:115-126 and main.ts:1180-1215. Keep the config descriptions for traceability only.
- **Acceptance:** a unit test checks each milestone's reward list against the real gates; no "R1/R2/R3" or "surface service dock" strings appear in player-facing UI.
- **Impact:** medium. **Effort:** S. **Depends on:** none. **Deviation:** none (display only).

### PROG-P10 — Records, mastery and an end-of-chapter loop
- **Addresses:** F5.
- **Change:**
  - A per-world claim record: % of ore value banked, deepest point, best haul, relics, fastest M3, recoveries.
  - Three mastery stars per world: (1) M3; (2) 50% of ore value plus the relic; (3) M3 within 20 min with 0 recoveries. Stars show on the star-map cards.
  - Post-W02 survey contracts on W01 (P6 engine) that use comet tools.
  - A credit sink: cosmetic rig and lander liveries (no stat effect), 1,000-5,000 CR.
- **Implementation:** the stats already exist (types.ts:94-101); add per-world `records` (persistence and decode); main.ts:610-626 flight record; star display in renderMap (main.ts:1296-1370); a "Workshop" dock tab.
- **Acceptance:** paying W02 M3 shows a chapter summary with records and next goals; each world has at least 3 post-M3 goals; leftover credits have a use.
- **Impact:** medium. **Effort:** M. **Depends on:** P6.
- **Deviation:** none against approved decisions (no combat, no mandatory reset); cosmetics are an addition for the owner to confirm.

### PROG-P11 — Vary mission sites per seed and require one lateral branch
- **Addresses:** F6.
- **Change:**
  - Place the W01 valve and antenna at per-seed columns within ±8 of the spawn, each with its own protected soil access column. Depths stay at 250/400 m.
  - Put at least one objective behind a 3+ cell lateral tunnel.
  - Split the W02 samples into two pods at rows 12-16.
- **Implementation:** world.ts:28-58 and :275-295 (mission placement; `protectedColumn` becomes a per-mission set). poi.ts guidance already follows saved positions (MISSION_POIS.md). Add per-seed reachability tests.
- **Acceptance:** over 100 seeds, each object appears in at least 8 distinct columns, every object is reachable through soil, and mission paths include a lateral tunnel of at least 3 cells.
- **Impact:** medium. **Effort:** M. **Depends on:** P5.
- **Deviation:** none for columns (the pack pins only depths: "valve at 250 m, antenna at 400 m").

### Recommended order
1. **Week 1:** P1, P2 and P9 (S each), then P5 so every later change is measured.
2. **Week 2:** P3 and P4 together (they share the hull role and fee tuning), then P7.
3. **Week 3:** P6, then P8, P10 and P11.

Re-run the harness after each step against the guardrails in P5.

## 7. Owner decisions

1. **Chapter length.** Keep the 45/75 min W01/W02 targets? The current content supports roughly 4-25 min for W01. P1 + P3 bring the novice model to about 48 min and a skilled player to about 14 min. Alternatively, accept a shorter, denser chapter carried by contracts (P6).
2. **Pinned-value deviations to approve:** W01/W02 construction fees (P3); rack, feet and condenser effects (P4); engine and mass rules (P4, together with the movement review); W02 commons at bulk 1 and the volatile training window (P8).
3. **Gate style.** A hard gate (plate needs drill rank 1, with a clear tracker message) or a soft gate (a very slow cut)? Recommendation: hard gate. A soft gate is bypassed by shaft reuse.
4. **Opening and recovery.** Start with a full 10 L tank instead of the research-inherited 6 L, and allow one free cargo-saving recovery per world (P2)?
5. **Relics.** Exactly one per world with an anomaly ping (P7), or keep the random 0-2 with 38-40% of maps having none?
6. **Contracts.** Strictly optional (recommended), or may a contract substitute for "bank 3 ore" in M1?
7. **Credit sinks.** Are cosmetic liveries acceptable as the end-game sink (P10)?
8. **Mission sites.** May objective columns vary per seed (P11), given the pack pins only depths?
