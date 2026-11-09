# D14: the wreck beacon at SITE-4, reached by native play

Decision D14 (`docs/art-direction/decisions.md`) moved the W01 waypoint beacon from the 95 m route cell to the SITE-4 crew gallery beside the wreck, moved the wreck survey from M1 to M2, and made M1 "bank three ordinary packages". This folder holds the evidence that the beacon is reached by play on the M2 leg.

## Beacon cell

The beacon stands at cell (17, 45), drawn at (17.5, 45.5), on solid floor in row 46. In every generator-2 world, row 45 is air and row 46 is solid at columns 16–18: the gallery ellipse and the row-48 branch are seed-independent there, and only columns 15 and below move with the third shelf's column. Checked over seeds 0–999; `tests/campaign-poi.test.ts` checks seeds 0–99 on each run. The floor run that holds the beacon, per seed:

| Seeds | Floor under row 45 |
| --- | --- |
| 0–10, 12, 13, 15, 16, 18, 19, 1655842461, 1019952531 | columns 16–18 |
| 11, 14, 17, 1152857004 (`fresh-w01`) | columns 15–18 (shelf 3 in column 13 puts its guard ore under column 15) |

Generator-1 claims have no gallery; the same cell is dug like a buried part.

## Time to beacon (§9.4, D1 row: read on the M2 leg)

`POI_CHECKS=leg npm run test:poi` drives the M2 leg in the browser: from the lander at the start of M2 (M1 built after the seam-A haul, rank-1 drill and tank fitted, wreck not surveyed) to the beacon in one dive. It uses keyboard drilling and steering only. Discovery comes from the game's own `refreshVisibility` as the rig moves: no `discovered.fill`, no radius reveal, no teleport. The dive steers to the route column, drills to row 43 (recovering the valve on the way and cutting the 310 m plate), then steers into the gallery to the beacon.

| World | Seed | Game time to beacon | Of which: lander to gallery row | Energy left (of 16 L) | Cells known at the beacon |
| --- | --- | --- | --- | --- | --- |
| `fresh-w01` (audit claim) | 1152857004 | 44.7 s | 43.7 s | 4.19 L | 239 of 2,400 |
| this run's new claim | 1019952531 | 45.0 s | 43.7 s | 4.19 L | 244 of 2,400 |

An earlier run gave 45.05 s (`fresh-w01`) and 45.35 s (seed 1655842461). Wall time (108–133 s) reflects the frozen-clock harness, not a player. Raw values: `time-to-beacon.json`.

This is the dive alone. A player who follows the tracker banks the valve first (a carried part turns the guide home unless the beacon is within 80 m), then surveys the wreck on the antenna dive. The pacing bots measure that whole leg; their numbers are in the pull request.

## Captures

The rig at the beacon in the moment of the survey, 1440×900, as played (HUD on):

- `beacon-site4-native-fresh-w01.jpg`: seed 1152857004.
- `beacon-site4-native-generated.jpg`: seed 1019952531.
