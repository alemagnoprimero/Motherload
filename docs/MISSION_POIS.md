# Mission landmarks and guidance

W01's mission objects now belong to visible wreck sites: a survey mast and damaged hull at 100 m, a pressure assembly at 250 m, a broken communications dish at 400 m, and a navigation capsule at 600 m. Distinct silhouettes and labels supplement color. Surveyed and recovered sites retain their wreckage; recovered item icons disappear.

The mission HUD shows the current target's name, direction, straight-line range and proximity. Bearings use the shortest horizontal route around the wrapping world. Part locations come from the saved mission records, rather than a separate display-only list. M2 guides toward the nearer remaining source. Carried mission cargo points back to the lander for banking, and completed requirements guide construction or launch. Dock availability follows actual bay eligibility, including landing.

## Proximity and interaction

- Beyond 80 m: the HUD tracks the mission signal.
- Within 80 m: “Signal nearby,” with a local radio pin or an edge bearing when the target lies outside the viewport.
- Within 30 m: “Very close,” with a precise target marker and contextual excavation/recovery advice.
- Survey: approach within the existing 1.15-cell radius (11.5 m).
- Parts: excavate the source, then approach within the existing 0.9-cell radius (9 m) to collect it.

The last two rules are the simulator's existing strict distance thresholds. This iteration does not change mission completion, terrain generation, rewards, costs or save format. The return locator distinguishes being near the ship from being eligible to dock.

Physical wreck geometry is masked to discovered cells. A nearby radio marker may identify the mission source through unexplored ground, but does not uncover terrain or minerals. Wrecks are scenery over the existing terrain, not excavated rooms or extra collision surfaces. Reduced motion keeps the guidance visible and static.

Closer-band alerts occur once per target per expedition instance, rather than on each distance tick or repeated boundary crossing. Pause and critical-condition warnings suppress new approach announcements. Recovery resets guidance so returned mission parts can be found again.

## Verification

Nine unit checks cover actual source coordinates, wrapped bearings, unchanged discovery, exact collection/survey thresholds, stage/return transitions, stable alert keys and recovery/reload behavior. Run them with `npm test`.

`npm run test:poi` checks native survey movement, excavation/collection, banking and construction transitions on desktop (1440×900), portrait (393×851) and short landscape (568×320). Deep-site fixtures provide valid unlocked states and approach corridors; these checks do not measure earning pace. Further scenarios check actual seam crossing, hidden-ore pixels, reduced-motion marker stability and critical-warning priority. Set `PREVIEW_URL` to exercise the compiled Docker preview. Captures are written to ignored `artifacts/`.

Physical Android comfort and a complete human campaign playthrough remain follow-up testing.
