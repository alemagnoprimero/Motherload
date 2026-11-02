# Balance versions and save compatibility

The active production balance is **0.3**, with schema **3** and generator **2**. W01's new worlds carry balance **0.2**; new W02 worlds carry **0.3**. Each world and package records its own version, independently of the current rules.

## Source data

`design/v0.1/motherload-balance-v01.json` remains the original design source. `design/v0.2/balance-overlay.json` adds the W01 recommendations and `design/v0.3/balance-overlay.json` adds the comet changes. `scripts/check-campaign-data.mjs` composes the active version, recomputes each budget, ordinary-value floor and complete route total, then compares them with runtime configuration. A changed source price or fee cannot silently bypass that comparison.

| Contract | 0.1 | W01 0.2 / W02 0.3 |
| --- | --- | --- |
| Rank-1 energy tank | 650 CR | 600 CR |
| W01 construction | 200 / 300 / 500 CR | 200 / 600 / 1,000 CR |
| W01 ores | 30 / 60 / 100 / 250 CR | 28 / 53 / 120 / 400 CR |
| W01 reference budget | 5,350 CR | 5,950 CR |
| W01 ordinary floor | 16,050 CR | 17,850 CR |
| W02 common-package bulk | 2 | 1 in new worlds |
| W02 second local gear | 2,200 CR | 1,600 CR steam reserve |
| W02 reference budget | 18,600 CR | 18,000 CR |

The original W01 ore counts retain their 47.5 CR weighted mean. The two seven-package opening seams still total 380 and 480 CR. The current W01 budget therefore needs 400 ordinary deposits, not 500. These arithmetic checks are distinct from the pacing and upgrade-capability measurements.

## Existing campaigns

Migration is additive and runs at the strict decode boundary. Schema 1 and 2 load as schema 3, while each old world remains generator 1 / balance 0.1. Terrain, discoveries, package values, bulk, ownership and condition are preserved. An old asteroid campaign can travel to a newly generated comet without changing its original claim.

Unpaid fees and rules read at use follow the current balance. Display names resolve by item ID and are rewritten during migration, while stored value and bulk remain unchanged. The new ledgers and timers receive explicit defaults and are validated on import. Unknown schema, balance or generator versions remain protected rather than being interpreted as current data.

## Developer comparison

On the Vite development server only, append `?balance=0.1`, `?balance=0.2` or `?balance=0.3` before starting a new test campaign. This selects the economic data and the matching generation defaults. Use a disposable browser profile for comparisons: rules read at use apply to any campaign opened in that development session. Improved controls and simulation code remain shared, so the switch is not a replay of historical physics.

Production builds ignore this parameter and always select 0.3. The normal Node build checks also use 0.3. Frozen generator-1 tests verify original seed reproduction independently of this preview.
