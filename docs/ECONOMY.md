# Economy and progression tuning guide

This is the current economy in the source, with the numbers needed to discuss changes. The loop is **discover → excavate → carry → return → sell → service → upgrade → reach farther**. Sale proceeds are the only ordinary cash income. Depth milestones acknowledge progress but do not pay a cash bonus.

The mineral values/masses, starting resources, equipment tables and service prices come from the inspected free-edition reference. The six geological regions, mineral probabilities/minimum depths, cave layout, opening seams, damage scaling and continuous-time fuel/drill tuning are remake decisions. See [RESEARCH.md](RESEARCH.md) for reference evidence and [PROGRESSION.md](PROGRESSION.md) for exploration behavior and balance checks.

## Cash flow and starting resources

| Item | Current rule |
| --- | --- |
| Start | $20, 6 L fuel in a 10 L tank, 10/10 HP, seven mineral slots, stock equipment |
| Sale | Receive the sum of the carried minerals' fixed values; sale empties the bay |
| Fuel | $1/L, purchased up to tank capacity or the available balance; whole-credit rounding can charge a fractional litre at the next dollar |
| Repair | $15/HP, up to maximum hull or the available balance; partial repairs are allowed |
| Recovery | Lose all cargo and 20% of cash (`floor(cash × 0.8)`), return to the surface with half maximum fuel/hull |
| Full bay | Excavation continues, but additional minerals are discarded without income |
| Equipment purchase | Pay the next tier's price, immediately gain its capability; tank/hull purchases do not refill fuel or repair hull |

For an ordinary completed trip:

```text
net cash = sale proceeds − fuel bill − repair bill − equipment purchases
```

There is no tax, interest, escalating service price, ore-price market, automatic milestone payout or equipment resale. Terrain and discovery persist, so an established shaft is a durable investment even after its ore has been sold. Fuel's money cost is deliberately small relative to mineral values: its main job is to limit expedition range. Repairs and recovery are stronger cash penalties.

The opening has two assisted seven-item seams worth **$380** and **$480**. Together with the initial $20, that is **$880 before operating costs**, enough for one **$750** upgrade after two safe trips. This is an onboarding allowance, not the distribution used throughout the mine. The normal two-trip upgrade regression verifies that the first purchase remains attainable after travel and refuelling.

## Mineral rewards

Each mineral occupies **one cargo slot**, regardless of mass. Mass affects handling separately. Minimum depth below is the generator's eligibility rule for a new 600-row expedition, not an equipment lock or a promise that a deposit appears immediately there. Existing saved terrain keeps its previous deposits.

| Mineral | Sale value | Mass units | Earliest eligible depth |
| --- | ---: | ---: | ---: |
| Ironium | $30 | 1 | 0 m |
| Bronzium | $60 | 1 | 20 m |
| Silverium | $100 | 1 | 50 m |
| Goldium | $250 | 2 | 150 m |
| Platinium | $750 | 3 | 300 m |
| Einsteinium | $2,000 | 4 | 900 m |
| Emerald | $5,000 | 6 | 1,800 m |
| Ruby | $20,000 | 8 | 3,000 m |
| Diamond | $100,000 | 10 | 3,800 m |
| Amazonite | $500,000 | 12 | 5,000 m |

Surface rows are empty; Ironium's 0 m eligibility means it may occupy the first underground cell, not a surface building tile.

A full stock bay of Ironium sells for $210; the same seven slots of Silverium sell for $700, or Goldium for $1,750. One Platinium funds a first-tier upgrade before service costs. One Amazonite equals the $500,000 final-tier price of a drill, tank, hull or engine. These comparisons explain why moving valuable minerals shallower or making them more common changes the whole upgrade curve.

## Equipment scale

Tier 0 is the starting equipment. Each price below is the cost of the **next individual purchase**, not its cumulative cost. All five systems use the same price schedule for the tiers they possess.

| Tier | Purchase price | Drill speed | Tank, L | Cargo slots | Hull, HP | Engine power |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | Included | 2 | 10 | 7 | 10 | 150 |
| 1 | $750 | 2.8 | 15 | 15 | 17 | 160 |
| 2 | $2,000 | 4 | 25 | 25 | 30 | 170 |
| 3 | $5,000 | 5 | 40 | 40 | 50 | 180 |
| 4 | $20,000 | 7 | 60 | 70 | 80 | 190 |
| 5 | $100,000 | 9.5 | 100 | 120 | 120 | 200 |
| 6 | $500,000 | 12 | 150 | — | 180 | 210 |

Fully upgrading one of drill/tank/hull/engine costs **$627,750**; fully upgrading cargo costs **$127,750**. Buying every upgrade costs **$2,638,750**, before fuel, repairs and recovery losses.

The first purchase's benefit differs substantially by system even though each costs $750:

- **Drill:** 40% more nominal drill speed, or about 28.6% less time per cut. Fuel spent during those cuts falls with their duration.
- **Tank:** 50% more capacity after refuelling, enabling a longer trip or more return reserve.
- **Cargo:** seven to fifteen slots, about 114% more capacity if the player can actually fill them and return.
- **Hull:** 70% more maximum HP after repair, protecting the cargo and the run.
- **Engine:** about 6.7% more power. Acceleration, thrust and speed limits improve, while fuel consumption also rises with engine power.

These are alternative investments rather than mandatory level gates. A bigger bay only pays when capacity is the bottleneck; a bigger tank does little if the player returns immediately with a full small bay. The current shared price schedule favors different systems at different stages and is a useful future tuning target.

## Where minerals appear

New mines are 24 columns around and 600 rows deep, with a reachable floor at **5,950 m** and ten metres per terrain row. Horizontal wrapping repeats the same finite circumference; it does not generate fresh ore each time the player crosses a seam. Old compact saves retain their 100-row geography and 950 m floor.

The generator first chooses magma, stone, ore or ordinary soil for each underground cell. It then carves caves, which can remove those contents. Deeper regions have fewer cave pockets. The base probabilities are:

| Region begins | Region | Ore chance | Stone chance | Magma chance | Magma damage |
| --- | --- | ---: | ---: | ---: | ---: |
| 0 m | Regolith | 30% | 8% | 0% | — |
| 300 m | Shale | 26% | 14% | 0% | — |
| 900 m | Basalt | 22% | 20% | 0.8% | 3 HP |
| 1,800 m | Crystal beds | 18% | 24% | 2.5% | 4 HP |
| 3,000 m | Molten belt | 15% | 28% | 4.5% | 7 HP |
| 4,500 m | Abyss | 12% | 32% | 6% | 12 HP |

Once a cell is selected as ore, the following **relative weights** select its mineral. Ineligible minerals are removed by minimum depth, and the remaining weights are normalized. For example, Abyss Amazonite weight 0.2 is about 0.2% of ore selections after 5,000 m, not 0.2% of all cells. Before 5,000 m it is ineligible.

| Mineral | Regolith | Shale | Basalt | Crystal beds | Molten belt | Abyss |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ironium | 50 | 10 | 0 | 0 | 0 | 0 |
| Bronzium | 30 | 25 | 8 | 0 | 0 | 0 |
| Silverium | 18 | 40 | 25 | 10 | 0 | 0 |
| Goldium | 2 | 23 | 43 | 32 | 15 | 5 |
| Platinium | 0 | 2 | 20 | 35 | 30 | 20 |
| Einsteinium | 0 | 0 | 4 | 20 | 36 | 36 |
| Emerald | 0 | 0 | 0 | 3 | 15 | 25 |
| Ruby | 0 | 0 | 0 | 0 | 3.8 | 12.8 |
| Diamond | 0 | 0 | 0 | 0 | 0.2 | 1 |
| Amazonite | 0 | 0 | 0 | 0 | 0 | 0.2 |

After cave carving, any mineral that has disappeared entirely receives one replacement deposit at a valid depth. This keeps every mineral discoverable in each generated mine. It particularly affects the rarest resource: the previous 40-seed baseline contained 44 Amazonite deposits across 40 worlds, so the fallback is a material part of its effective rarity.

## Realized rewards, rather than input probabilities

The established 40-seed generation baseline, measured after cave carving and the rare-mineral/opening allowances, is:

| Region | Actual cells containing ore | Mean value per ore | Mean value per underground cell |
| --- | ---: | ---: | ---: |
| Regolith | 24.22% | $53 | $12.76 |
| Shale | 18.99% | $131 | $24.81 |
| Basalt | 16.16% | $370 | $59.73 |
| Crystal beds | 15.35% | $891 | $136.83 |
| Molten belt | 12.82% | $2,650 | $339.61 |
| Abyss | 10.35% | $7,194 | $744.23 |

Thus the deepest region has fewer than half as many ore cells as the surface region, but each ore averages roughly 136 times the value. The baseline mean gross value of the entire finite mine was approximately **$4.40 million**, including rare finds. That exceeds the $2.64 million all-upgrades bill on paper; finding, carrying and returning with that value is the challenge. It is not an estimate of money earned per minute, an assumption that the player mines everything, or a guarantee about one seed. Rare high-value deposits can dominate averages.

## Time, fuel and risk formulas

Let `E = enginePower / 150`, and let `A` be the number of active movement axes: horizontal movement counts as one and upward thrust counts as one. Down alone uses gravity or drilling, rather than another movement axis.

```text
fuel used per second = E × (underground idle + current activity)
underground idle = 0.063 L/s, or 0 while docked
current activity = 0.252 L/s while an existing cut is in progress
                 = A × 0.126 L/s otherwise
```

At stock engine power, underground idle is about **0.063 L/s**, single-axis travel **0.189 L/s**, and diagonal thrust or drilling **0.315 L/s**. Surface driving is approximately 0.126 L/s. A 10 L tank supplies about 53 seconds of single-axis underground movement or 32 seconds of continuous underground drilling before reserves; an actual trip mixes these activities. Fuel timing uses the nominal 42 fps conversion of inspected reference per-frame amounts and remains remake calibration, not measured exact Flash timing.

```text
cut seconds = direction × material × depth resistance ÷ (drillSpeed / 2)
direction = 1 downward, 0.75 sideways
material = 1.85 for stone, 1 otherwise
depth resistance = 1 + max(0, vehicleY − surfaceRow) × 0.0125
                 ≈ 1 + depthMetres / 800
```

The approximation omits a small vehicle-position offset. Stock downward soil cuts are about 1 second near the surface, 4.75 seconds at 3,000 m, and 8.44 seconds near the floor. Max drill speed reduces those durations to one sixth. Ordinary cutting does not wear hull. Magma applies the region's fixed HP damage when its cut completes; a hard landing above seven terrain cells/second applies `max(1, round((fallSpeed − 7) × 0.6))` HP.

Cargo handling uses `massFactor = 1 + carriedMineralMass / 198`. Horizontal acceleration is divided by this factor. Thrust is scaled by engine power and divided by mass, with a minimum lift reserve so valid loads remain flyable. Engine power also raises speed limits and fuel consumption; it is not simply a fuel-efficiency upgrade. Exact movement and drag constants live in `MOTION`.

There are no depth access locks. Range, excavation time, load, route preparation and damage create the practical progression barrier. In controlled tests with a previously opened access shaft, a stock rig completed five stone cuts at 300 m and returned using 5.34 L. At 3,000 m stock equipment exhausted its fuel after one completed cut, whereas a tier-3 drill and 40 L tank completed five cuts and returned using 16.20 L. A natural route still has to be opened over prior expeditions.

## Payback examples and limits

A rough capacity payback is `upgrade price ÷ extra realized net proceeds per trip`. For the first cargo upgrade, eight additional Ironium slots would add $240 gross per completely utilized trip, so $750 takes about four such trips to recover before extra costs. Eight additional Silverium would add $800 gross and could cover it in one trip. Neither case is guaranteed: fuel, discovery and travel may prevent filling the bigger bay, and a heavier load changes the return.

Drill and tank purchases chiefly buy access and time. Since fuel costs only $1/L, a $750 drill will not repay quickly through fuel-bill savings alone. It can repay by allowing more ore to be found before the return, making hard rock economical, or reducing the time needed to establish a shaft. Hull and engine purchases chiefly protect or transport the haul. This distinction matters when comparing upgrade choices using cash alone.

The current checks establish mechanical feasibility and broad reward ordering. They do not establish a final campaign duration, optimal purchase order, typical player income per minute, route variety, or physical Android handling. Full human expeditions are still needed to tune satisfaction and perceived grind.

## Where to adjust the balance

The current values are static constants and formulas in [src/model.ts](../src/model.ts), rather than an external balance configuration or an in-game economy editor. Use symbol names to locate them; line numbers move as the game changes.

| Desired change | Source controls | Coupled effects to check |
| --- | --- | --- |
| More money per successful haul | `ORES.value` | Changes every upgrade's effective price and can erase late-game goals, especially Diamond/Amazonite |
| More frequent finds | `STRATA.oreChance`, cave carving | Changes discovery frequency and income together; compare realized post-cave density |
| More exciting rare finds | `DEPOSITS.weights`, `DEPOSITS.depth`, missing-mineral fallback | Minimum depth and fallback can matter more than a very small weight; check per-world counts, not only averages |
| Faster/slower first purchase | `starter`, starting `money`, tier-1 `UPGRADE_PRICES` | Preserve a viable first return and service allowance; avoid requiring hidden perfect knowledge |
| Different purchase order | `UPGRADE_PRICES`, per-system `UPGRADE_LEVELS` | Prices currently share a schedule; a system-specific cost design needs an explicit new structure |
| Longer expeditions | Tank levels, fuel rates, drill time | More range can bypass several regions or make cargo the new bottleneck |
| Faster excavation | Drill levels, direction/material/depth multipliers | Also reduces drilling fuel, so it affects access as well as perceived speed |
| More useful engines/cargo | Mass factor, `MOTION`, engine/cargo levels | Heavy loads, minimum lift, ascent speed and fuel rate must be tested together |
| Greater danger | Magma chance/damage, impact formula, hull levels | Increased losses can slow income more than raising shop prices; check opportunities to react |
| Longer campaign geography | `HEIGHT`, ten-metre depth conversion, `STRATA.depth`, deposit minima | Length, resistance, travel costs, loot counts, save limits and old-map compatibility all interact |
| More expensive mistakes | Repair price, recovery percentage, cargo loss | Can create a downward spiral if the player cannot afford to resume |

Generation changes affect **new expeditions**; saved terrain is not regenerated. Changing sale values or service/upgrade formulas affects existing expeditions immediately. Changing equipment array lengths or capacities needs a save-compatibility review before release.

For the next balance decision, choose a target for the first upgrade's number of trips, the typical shallow/deep expedition length, the desired lifetime of each equipment tier, and how much of the campaign a single rare find should fund. Then adjust one group of controls, repeat the seeded generation and input-driven trip checks, and play several complete human expeditions. This keeps the discussion tied to player experience rather than changing all prices and probabilities at once.
