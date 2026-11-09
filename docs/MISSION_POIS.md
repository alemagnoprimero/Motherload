# Mission landmarks and guidance

W01's mission objects belong to visible wreck sites: a pressure assembly at 250 m, a broken communications dish at 400 m, the wreck survey beacon in the SITE-4 crew gallery at 460 m, and a navigation capsule at 600 m. Distinct silhouettes and labels supplement color. Surveyed and recovered sites retain their wreckage; recovered item icons disappear.

**One beacon (decision D14).** The wreck survey beacon (`W01-BEACON`, drawn with the `mission-beacon` tripod) moved from the 95 m route cell to the crew gallery floor beside the SITE-4 wreck, at cell (17, 45) on solid row 46, and its survey moved from M1 to M2. The 95 m cell has no beacon. M1 (Prove the claim) is three banked ordinary packages; its guide follows marked seam A until the hold is full, then turns home. M2 asks for the valve, the antenna and the wreck survey.

The mission HUD shows the current target's name, direction, straight-line range and proximity. Bearings use the shortest horizontal route around the wrapping world. Part locations come from the saved mission records, rather than a separate display-only list. M2 guides toward the nearer remaining source, the wreck beacon included. Carried mission cargo points back to the lander for banking, except that a part recovered within 80 m of the unsurveyed beacon (the antenna, about 70 m from it) first guides to the survey, which carries nothing. Completed requirements guide construction or launch. Dock availability follows actual bay eligibility, including landing.

## Proximity and interaction

- Beyond 80 m: the HUD tracks the mission signal.
- Within 80 m: “Signal nearby,” with a local radio pin or an edge bearing when the target lies outside the viewport.
- Within 30 m: “Very close,” with a precise target marker and contextual excavation/recovery advice.
- Survey: approach within the existing 1.15-cell radius (11.5 m) of the wreck beacon, once M1 is built.
- Parts: excavate the source, then approach within the existing 0.9-cell radius (9 m) to collect it.

The last two rules are the simulator's existing strict distance thresholds. D14 moved the survey's position and stage; it did not change terrain generation, rewards, costs or the save format. The return locator distinguishes being near the ship from being eligible to dock.

Physical wreck geometry is masked to discovered cells. A nearby radio marker may identify the mission source through unexplored ground, but does not uncover terrain or minerals. Wrecks are scenery over the existing terrain, not excavated rooms or extra collision surfaces. Reduced motion keeps the guidance visible and static.

Closer-band alerts occur once per target per expedition instance, rather than on each distance tick or repeated boundary crossing. Pause and critical-condition warnings suppress new approach announcements. Recovery resets guidance so returned mission parts can be found again.

## Verification

Unit checks (`tests/campaign-poi.test.ts` and neighbours) cover actual source coordinates, the beacon's floor cell over 100 generator-2 seeds, wrapped bearings, unchanged discovery, exact collection/survey thresholds, stage/return transitions, stable alert keys and recovery/reload behavior. Run them with `npm test`.

`npm run test:poi` checks, on desktop (1440×900), portrait (393×851) and short landscape (568×320), the native seam-A haul turning the guide home, an antenna dive that continues natively to the wreck beacon and surveys it, part excavation/collection, banking and construction transitions. Its `leg` check (`POI_CHECKS=leg`) drives the M2 leg by native play, from the lander to the wreck beacon with the rank-1 drill and tank, on the audit's `fresh-w01` claim and on the run's own new claim, with discovery left to the game's own visibility (no revealed map), and writes the time to beacon to `artifacts/mission-poi-leg-time-to-beacon.json`. Deep-site fixtures elsewhere provide valid unlocked states and approach corridors; these checks do not measure earning pace. Further scenarios check actual seam crossing, hidden-ore pixels, reduced-motion marker stability and critical-warning priority. Set `PREVIEW_URL` to exercise the compiled Docker preview. Captures are written to ignored `artifacts/`.

Physical Android comfort and a complete human campaign playthrough remain follow-up testing.
