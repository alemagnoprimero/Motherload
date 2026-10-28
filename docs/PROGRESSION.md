# Exploration and progression

The mine is an expedition into unknown ground. Each trip should establish a route, reveal possible branches, bring home a useful haul, and fund equipment that makes a longer or more demanding trip practical. A screen full of known mineral destinations and a compressed mine undermined that loop.

## Discovery

Sight reaches 4.5 terrain cells around the vehicle and stops at the first solid face. A wall's exposed mineral can be identified; deposits and caves behind it cannot. Corner occlusion prevents looking through touching walls. Surface facilities remain visible. A wider monitor changes framing, not the discovery radius.

Unexplored soil, ore and air render as the same opaque, subdued ground. Terrain sprites, cave-edge highlights and the mineral inspector all respect discovery. Currently illuminated cells are readable; previously seen cells remain dimly remembered. Survey history persists alongside excavated terrain in schema-4 saves. The saved map is ordinary local game data, not an anti-cheat mechanism.

## A deeper mine

New expeditions contain 24 × 600 cells, with a reachable floor at 5,950 m. The old 100-row maps remain intact when loaded. The two modest opening seams support the first $750 upgrade; later deposits are seeded, scattered and discovered through travel.

| Region begins | Region | Ore probability before cave carving | Stone probability | Magma probability | Magma damage per cut |
| --- | --- | --- | --- | --- | --- |
| 0 m | Regolith | 30% | 8% | 0% | — |
| 300 m | Shale | 26% | 14% | 0% | — |
| 900 m | Basalt | 22% | 20% | 0.8% | 3 HP |
| 1,800 m | Crystal beds | 18% | 24% | 2.5% | 4 HP |
| 3,000 m | Molten belt | 15% | 28% | 4.5% | 7 HP |
| 4,500 m | Abyss | 12% | 32% | 6% | 12 HP |

These probabilities describe the generator, not a promise about the next cell. Cave carving removes some deposits, and deeper strata have fewer cave pockets. Mineral selection shifts away from common shallow metals toward more valuable materials. Emeralds cannot appear before 1,800 m, rubies before 3,000 m, diamonds before 3,800 m, or Amazonite before 5,000 m. The rarest deposits remain scarce; the generator retains at least one of each mineral at a valid depth so no expedition loses a mineral entirely to cave carving.

The pause menu supplies the next depth goal without identifying undiscovered mineral locations. Crossing a geological frontier for the first time gives a brief in-game acknowledgement. Returning through that depth or reloading does not replay it. Progress comes from discovery, access, equipment and sale proceeds; depth milestones do not award automatic cash.

The 24-column world now wraps around horizontally. This is a periodic geography, with the same finite deposits and excavated routes after each lap. The camera follows continuously across the seam, and the lamp can reveal cells across it using the same occlusion rules. Saved horizontal positions use canonical coordinates within one circumference. Existing saved terrain remains valid, and the floor/depth scale is unchanged.

## Why equipment matters

All inspected original mineral values, masses, equipment prices and capacities are retained. The extended geography gives those equipment tiers room to matter:

- Drill time increases with depth. More stone adds resistance. A better drill reduces both cutting time and the fuel consumed during a cut.
- Larger tanks support more excavation and the longer return climb. Deeper routes must be opened over multiple trips rather than reached by one stock-tank plunge.
- Larger cargo bays make trips more productive, while mineral mass makes a loaded climb different from an empty one. Engine upgrades help acceleration and ascent.
- Hull upgrades give room to survive increasingly damaging magma and hard landings. Visible hazard faces can be inspected before cutting. Ordinary drilling still causes no blanket hull wear.

There are no equipment-level doors or mandatory depth locks. A player can attempt a difficult route early, avoid hazards and reuse a well-prepared shaft. Consumables, passive temperature damage, radiator upgrades, story and endgame encounters remain future work.

## Compatibility and provenance

Schema-1 through schema-3 saves keep their exact 100-row terrain and possessions. The migration adds discovery around the current vehicle without falsely marking every natural cave as explored. Schema-4 supports both old compact and new deep worlds, validates each discovery flag, and preserves that mask on reload/export/import. New expedition is the explicit way to adopt the new geography and distribution; it retains the existing confirmation and backup behavior.

The local visibility rules, six named strata, deposit probabilities, hazard scaling, frontier feedback and camera changes are remake design choices. They are not claimed as measurements of the original SWF. Original tables and the previously documented movement/reference findings remain separate from these choices.

The complete economic tables, formulas and their tuning locations are in [ECONOMY.md](ECONOMY.md). The immersive-menu, flat-projection and wrapping update changes presentation and traversal; it does not rebalance income, prices or depth bands.

## Balance checks and playtest targets

Aggregating the actual generated cells after cave carving across seeds 1–40 gives the following results. These include the guaranteed rare-mineral fallback and assisted opening seams, not just the input probabilities:

| Region | Cells containing ore | Mean value per ore |
| --- | --- | --- |
| Regolith | 24.22% | $53 |
| Shale | 18.99% | $131 |
| Basalt | 16.16% | $370 |
| Crystal beds | 15.35% | $891 |
| Molten belt | 12.82% | $2,650 |
| Abyss | 10.35% | $7,194 |

Those 40 worlds contained 44 Amazonite deposits, all beyond its minimum depth, and 166 diamonds. Value per haul is not fixed: these averages include rare finds and the player still has to discover, reach and return with them.

A controlled input-driven expedition descended an already opened shaft, braked for landing, attempted five stone cuts and returned to the surface. With an empty bay, stock engine and 10 HP, the stock drill/10 L tank completed the 300 m trip using 5.34 L. At 3,000 m the same rig exhausted its fuel after one completed cut; a tier-3 drill/40 L tank completed all five cuts and returned using 16.20 L with no hull loss. Intermediate upgraded trips at 900/1,800/4,500 m used 7.83/11.25/21.38 L. These are mechanical feasibility checks, not a claim that a natural route is already excavated or that complete human campaign pacing is settled. The progression regression suite reproduces the controlled comparison and aggregate scarcity/value checks.

Verify that the first upgrade remains attainable through ordinary return trips; each deeper region improves the value of a haul; rare high-value minerals never bypass their depth bands; and upgraded drill/tank equipment makes a measurable difference to a deeper excursion. Check that discovered paths survive saving and that the unexplored map cannot be read from cave silhouettes or the inspection control. Longer human playtests should tune trip length, route variety and the feeling of each equipment purchase without merely raising prices.
