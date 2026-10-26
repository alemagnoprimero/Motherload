# Movement and drilling reference measurements

This document records the movement calibration checkpoint. The later economy, equipment, world and save changes are documented in [PROJECT.md](PROJECT.md).

Measured on 2026-10-26 against the free Miniclip **0.934 (MC)** build identified in [RESEARCH.md](RESEARCH.md). This is a reference for the focused movement/drilling pass, not a claim of complete original-game parity.

## Reproduce locally

Prerequisites: the existing verified `reference/motherload_2017.swf`, JPEXS under `.cache/reference-tools/jpexs`, installed npm dependencies, Chromium, and the Vite preview running on port 5173. The measurement script does not download anything.

```sh
node scripts/reference-measure.mjs
node scripts/reference-test.mjs
```

`PREVIEW_URL` and `CHROMIUM_PATH` override the local URL and browser. To repeat a single scenario while retaining other measurements from the same instrumented SWF, use `REFERENCE_SCENARIO=ground`, `flight`, `mining`, or `committed-cut`. Read actual keyboard event times and sample times from the JSON; requested hold durations are not exact wall-clock durations under load.

Outputs remain under ignored `artifacts/reference-measure/`: `measurements.json`, phase screenshots, a small compiled telemetry probe, and `instrumented.swf`. The separate existing reference test uses the unchanged original SWF and captures `artifacts/original-*.png`. Neither the original SWF nor generated scripts/assets are shipped with the remake.

## Method and limitations

The installed Ruffle API has no `GetVariable` interface. The measurement script therefore compiles a newly authored read-only ActionScript callback in a minimal blank SWF, extracts that one action tag, and inserts it before the original's first frame. Every original tag is retained byte-for-byte; no original script is recompiled or replaced. The callback reads vehicle coordinates, velocity, drilling/flight state, fuel, hull, cargo and nearby tile IDs. It does not reposition the vehicle, alter terrain, seed randomness or change equipment.

- Canonical SWF SHA-256: `4d480aec3dde7de7e3da54a594398388fd3a03f71eefd63668a94ff015ed928d`. The script checks this before and after making its separate copy.
- Measured instrumented copy SHA-256: `9e2d0ad87a35dffe736344a347b9d8258f8ecd282d330e066edc2515fb2d0be7`.
- Ruffle 0.7.1, Chromium, JPEXS 26.4.0; the SWF declares 42 frames/second and uses 50-pixel terrain cells.
- The four scenarios start fresh games in separate browser contexts. Opening and closing Instructions first makes the New Game menu reliable in this build. Each run asserts that the game has actually entered its ground gameplay state.
- Screenshots were inspected to confirm surface driving, airborne diagonal movement, underground side excavation and completed-cut flight. A held key by itself is not treated as a successful action.
- Sampling was requested every 15 ms, but actual median sample gaps ranged from about 31 to 109 ms under headless rendering load, with larger gaps occasionally approaching 300 ms. Timing values below are approximate; source-derived per-frame relationships are more precise than these wall-clock captures.
- Screenshot capture adds time between phases. Those samples are labeled `screenshot-gap`; actual keydown/keyup timestamps are recorded separately. Do not divide endpoint displacement by the requested duration.
- Natural terrain differs between fresh games, and landing/launch animations and cave falls interrupt sequences. Those transitions must be excluded when comparing individual cuts.
- Ruffle reports the previously observed `non-registered character tileEmpty` diagnostics. The measured runs produced no JavaScript page errors. Ruffle behavior is not proof of parity with native Flash.

An exploratory run accidentally entered surface shops; its `explore.json` and unprefixed `dig-left.png` are **excluded** from the results. The accepted scenarios are named `ground`, `flight`, `mining`, and `committed-cut` in `measurements.json`.

## Observations

| Scenario                         | Observed result                                                                                                                                                                                                                                           | What it establishes                                                                                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Short ground input and release   | Vehicle moved along the surface, stayed in gameplay mode, then coasted to rest. A separate valid trace decayed from 2.78870 to 0.20738 original pixels/frame over approximately 1.012 s, exactly 42 applications of a 0.94 factor.                        | Ground release retains momentum. The old remake's much stronger release-only braking was not supported by the reference.                                                                                   |
| Empty diagonal ascent            | Holding Up and Right produced both increasing horizontal velocity and ascent. One trace reached approximately 10.69 px/frame horizontally and −9.23 px/frame vertically after about 0.74 s from the first key event, before release.                      | Simultaneous thrust and steering work; stock flight is considerably faster in cells/second than the first prototype's limits. This short run did not measure all terminal speeds.                          |
| Consecutive downward cuts        | Supported successive cut starts were approximately 1.04–1.10 s apart near the surface. There was no idle settling interval between cuts when support remained and Down stayed held. Falling into caves produced separate launch/fall/landing transitions. | Continuous held-input chaining should be smooth. Cave traversal must not be counted as drilling time.                                                                                                      |
| Supported lateral cuts           | Completed side cuts took approximately 0.77–0.82 s at shallow depths, followed by driving, landing or another cut according to terrain.                                                                                                                   | Side cutting can be faster than downward cutting. The support condition is local to the rig, not the bottom of the world.                                                                                  |
| Up pressed during a downward cut | Up was pressed while the original still reported `digging`, around world y=225. The cut continued to approximately y=255, then the vehicle changed to launching and air states and ascended through the cleared cell.                                     | An already-started cut is committed. Up prevents a new cut and takes effect after the active one finishes; it does not snap the rig back to its starting position.                                         |
| Cargo collection                 | One Ironium changed reported total mass from 198 to 199 and remaining slots from seven to six.                                                                                                                                                            | Cargo uses mineral-specific mass independently of occupied slots. The collected load was too small, and the later flight too collision-constrained, for a controlled loaded-versus-empty speed comparison. |

The mining screenshots show actual excavated shafts and lateral tunnels. They do not establish a controlled A/B test of every possible ledge shape. A deliberately matched intermediate-ledge scenario and a controlled full-cargo flight benchmark remain unmeasured in the original.

The unchanged-SWF visual check independently showed downward and lateral excavation and mineral collection. Its short final Up+Right input ended around the remaining cut animation, so that final screenshot is not an independent ascent measurement; the separate telemetry flight scenario establishes the diagonal ascent observation above. The accepted earlier ground-decay trace is retained in `artifacts/reference-measure/first-run.json`.

## Static findings supporting the tuning

All citations below refer to ignored exports under `reference/decompiled/scripts/`; no original source is imported into the remake.

| Behavior              | Confirmed source finding                                                                                                                                                                       | Citation                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Ground and air drag   | Ground velocity is multiplied by 0.94 per frame; air horizontal and vertical velocities by 0.98. The factors do not become stronger simply because the direction key is released.              | `frame_4/DoAction.as:57–59`; `frame_1/DoAction.as:2526,2602–2604`                    |
| Acceleration          | Stock engine power is 150; base vehicle mass is 198. Ground horizontal increment is power/mass; air horizontal increment is power/mass/1.5. Cargo adds the distinct mass of each mineral.      | `frame_1/DoAction.as:398–440,2386–2395,2470–2646`                                    |
| Flight                | Grounded launch uses a stronger initial vertical increment; air and transformation states use separate thrust branches. Gravity adds 9.81/30 original pixels/frame each air update after drag. | `frame_1/DoAction.as:2505–2513,2581–2604`                                            |
| Ground support        | Either tread-side contact can establish support. Starting a side cut additionally tests a little below the rig. Up blocks starting a new cut.                                                  | `frame_1/DoAction.as:745–858,2475–2519`                                              |
| Committed cut         | Normal movement logic is skipped while digging. Downward completion immediately starts another cut when supported and Down is held.                                                            | `frame_1/DoAction.as:928–1012,2470–2475`                                             |
| Drill depth           | Drill advance speed is divided by `1 + depthFeet / 1000`. Downward advance is 50 original pixels; lateral advance is 40. Animation setup and loop behavior also affect elapsed time.           | `DefineSprite_430/frame_10–13/DoAction.as`; `DefineSprite_454/frame_2–5/DoAction.as` |
| Ordinary drill damage | The inspected cut routines damage the hull for lava/gas hazards; they do not apply the remake's blanket ordinary-soil wear.                                                                    | `frame_1/DoAction.as:745–858`; the two drilling sprite routines above                |

For comparisons in **tiles/second**, one original tile is 50 pixels. At the nominal 42 fps, the stock empty formulas imply approximately:

- Ground acceleration increment normalized to seconds: 26.73 tiles/s²; air horizontal increment: 17.82 tiles/s². Multiplication by drag occurs after those increments.
- Exponential drag equivalents: 2.599/s on ground and 0.849/s in air.
- Gravity increment normalized to seconds: 11.54 tiles/s².
- Ground steady speed: about 9.97 tiles/s. Air horizontal cap after drag: about 12.35 tiles/s. Upward cap after drag and gravity: about 10.02 tiles/s.

These are source-derived conversions, not independently measured terminal velocities. A continuous 120 Hz simulation does not exactly duplicate the original's 42 Hz discrete update ordering; conversions are calibration targets, not proof of numerical equivalence. Launch/landing animation timing and collision geometry also matter.

The original altimeter uses four pixels per foot, so one 50-pixel cell represents 12.5 ft. Its depth multiplier corresponds to approximately `1 + undergroundRows / 80`. The remake currently labels depth as ten meters per row: feeding those displayed meters directly into the original feet-based expression would mix incompatible scales.

## Boundary for the focused remake pass

The focused implementation uses the findings to improve acceleration/coasting, simultaneous thrust and steering, weighted cargo, supported side-cut alignment and uninterrupted committed cuts. Its stock cut durations are 1.0 s downward and 0.75 s sideways, multiplied by `1 + undergroundRows / 80`; this is a deliberate approximation to the observed shallow timings. The 1.85 stone multiplier and existing upgrade-speed factor remain provisional. The original animation's startup time is not modeled separately.

The new motion settings use acceleration 26 on ground and 17.6 in air, drag 2.6 and 0.85 respectively, gravity 11.54, thrust 26.7, horizontal cap 12.35, upward cap 10.02 and downward cap 16.8, in tile-based units. The remake's four existing ores receive masses 1/2/6/10, corresponding to their reference counterparts, over a base mass of 198. A minimum upward acceleration reserve of 4 tiles/s² is a deliberate usability allowance for existing saves with large cargo bays, while engine progression is still absent. This reserve is not original behavior.

These values and the geometry changes are calibration work, not an exact emulator port. The economy, services, world generator and save compatibility remain stable in this pass. Complete terrain persistence remains an explicit user requirement even though the original save routine differs.

Still requiring further observation: controlled full-load flight, deeper and upgraded drilling timing, tricky ledge/corner geometry, physical Android responsiveness, and comparison with a publisher-hosted original when that endpoint becomes accessible. No final art, cave generation or progression expansion is required to resolve this movement checkpoint.
