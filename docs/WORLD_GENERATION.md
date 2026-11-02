# Versioned world generation and content kit

The improvement generator is version 2. New Broken asteroid worlds use balance 0.2; new Ice comet worlds use balance 0.3. A revisit uses the saved world. Loading an older campaign does not regenerate its map, deposits, values, cargo bulk or hazards.

`world-v1.ts` is the frozen original generator with its own original constants. `createW01(seed, 1)` and `createW02(seed, 1)` reproduce that output independently of current balance. Six SHA-256 fixtures cover both worlds at seeds 0, 739 and 4,294,967,295. The development balance switch selects historical generation for comparison, not historical simulation physics.

## Stages

`world.ts` runs the same ordered stages for both destinations:

1. Establish dimensions, mission sources, the single solid route and material density from `WORLD_BANDS`.
2. Shape the band's pockets, ledges, galleries and geodes; connect a branch beside the route every 50 m.
3. Place named sites and eight original field logs.
4. Place deterministic optional hazards away from the required route.
5. Reassert the protected route and mission cells. W01 then seals **every** cell in rows 30–31 with fused plate, including previous cave air.
6. Place assisted entry seams, route pockets and hazard rewards, then weighted veins with exact global rarity counts and a named deep relic.

Layout, hazards and resources use separate deterministic random streams. Decorative changes therefore need not reshuffle the entire economy. Any change to stage order, geometry or random draws still requires a generator-version decision before changing released seed reproduction.

## Economic and navigation contracts

| Rule | W01 | W02 |
| --- | --- | --- |
| Solid shaft column | 20 | 24 |
| Ordinary deposits | 400 | 600 |
| Ordinary value | 19,000 CR | 63,000 CR |
| Assisted entry | Two seven-package seams: 380 / 480 CR | Two ten-package seams: 1,840 CR combined |
| Common bulk in new maps | 1 | 1 for Frost iron / Blue nickel; volatile ores remain 2 |
| Named relic | Surveyor's compass, deep geode | Lantern seed, deep geode |
| Field logs | 8 | 8 |
| Named sites | 6 | 7 |
| Return cache | Thermal auger; 200 CR | Preservation chamber; 600 CR |

W01 uses 16/40/44% of ordinary deposits in rows 0–9/10–39/40–59. Outside assisted seams, minimum ore rows are 0/4/15/32 and depth exponents are 0/1.0/2.4/3.2. Global counts remain 240/120/36/4. Pressure seams appear on approximately 8% of deep soil, outside the route and mission cells. Shelf 2 is below the fused plate instead of cutting a hole through it.

W02 cold pockets and vents are generated per seed and stored in the world. The old constants remain a fallback for old worlds. Optional rewards lie beside hazards; compulsory mission objects do not. The full route remains unexcavated ordinary ice.

## Measured content checks

`tests/campaign-world-v2.test.ts` and `measureWorld()` in `world-metrics.ts` cover 200 seeds of each world. At the initial implementation checkpoint:

- Every seed has the full plate and exact ordinary counts/value.
- W01's 500–600 m reward per cell averages **2.535×** its 100–200 m band.
- Route-adjacent feature coverage is **11/11** fifty-metre bands in W01 and **19/19** in W02; the maximum route-adjacent ore gap is **50 m**.
- All 200 seeds in each world have a cave of at least 40 cells, a signature site in each depth band, and a deep relic within four columns of the route.
- All generated identities and deposit cells remain unique, mission sources stay buried, and hazards vary between seeds.

Coverage measures the presence of a branch, reward or site. It does not establish that every band feels novel to a player. Human discovery, readability and chapter pacing need their separate playtest and calibrated-simulation checks.

Run `npx vitest run tests/campaign-world.test.ts tests/campaign-frontier-world.test.ts tests/campaign-world-v2.test.ts` to reproduce the checks. The original audit data remains unchanged.

## Opening and return guidance

`openingRoute()` in `poi.ts` reads the actual seven seam-B package records. In a fresh version-2 W01, after M1 and before the first hardware purchase, both mission text and the locator point to that seam, then to selling and the expedition tank. It does not replace guidance in old worlds, after a hardware purchase, after a mission part has been collected, or after the seam has been consumed. The initial full hold does not turn the tracker home before the first 100 m shaft is complete; already banked or legacy survey proof remains valid.

A literal tracker-following simulation in `tests/campaign-guidance.test.ts` completes both trips and the 600 CR tank purchase in **31.37 seconds** for seeds 4, 10 and 999. This includes a real 2.1-second shelf warning/collapse fixture and its 3 HP repair bill, with at least 25 CR left and no recovery. It moves the vehicle through the simulator throughout; no teleport or direct hull edit is used. This is an automated active-time result, not a novice playtest.

The locator turns home when the return reserve reaches Turn back or Cannot reach home. After M3, launch remains the primary W01 action. Subsequent optional objectives cover unopened caches, unbanked relics and unread field logs. An equipped specialist tool enables the cache locator; a locked locker does not hide the other goals. A carried relic redirects guidance home before the next objective. Reading guidance never discovers terrain or changes mission ownership.
