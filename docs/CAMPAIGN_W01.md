# Broken asteroid — current implementation

W01 is the opening destination of the campaign. [Ice comet (W02)](CAMPAIGN_W02.md) is playable after Frontier departure; W03 and later destinations are charted metadata, not playable worlds. Current production rules use schema 3 / balance 0.3, with newly generated W01 claims stamped balance 0.2 / generator 2. [Balance versions and migration](BALANCE_VERSIONS.md) explains how older claims retain their original geometry and package values.

## Play and progression

The root address opens the campaign front door, with Continue for an existing save and New expedition for a fresh claim. There is one game; retired prototype saves are neither selected nor converted/deleted. Starting another campaign archives the previous valid campaign separately from ordinary backup rotation.

The 40-column, 60-row asteroid wraps horizontally and reaches 600 m. Surface air has negative coordinates, so it does not reduce the exploration depth. Wall-occluded discovery conceals minerals and caves until explored; the claim map and waypoints show discovered ground rather than revealing the whole mine.

The two marked opening veins at columns 20/21 contain seven ordinary packages worth 380/480 CR. The opening coach and tracker guide the first haul, return, sale, construction, second seam and upgrade. Coach progress is a pilot preference and can be skipped without blocking controls. The survey beacon is at 100 m; the valve, antenna and navigation core are at 250/400/600 m.

| Stage | Required proof | Construction fee | Result |
| --- | --- | --- | --- |
| M1: Survey the wreck | Survey the 100 m beacon and bank three ordinary packages | 200 CR | Rank-1 hardware and the shaft brace |
| M2: Recover the lander parts | Bank the valve and antenna | 600 CR | External cargo rack |
| M3: Restore the lander | Bank the navigation core | 1,000 CR | Frontier certificate and departure; Ice comet playable, Fractured moon charted |

Basic banking, trade, refuelling and repair are available at the arrival lander before M1. Each paid stage changes its construction. Neither the rack nor all three local tools are mandatory for departure.

New generator-2 worlds have a continuous fused plate across rows 30–31 (310–320 m). It includes cells that would otherwise be cave air, so horizontal wrapping cannot bypass it. A rank-1 drill is required and cuts plate 2.5 times more slowly than the equivalent ordinary material. Existing generator-1 claims retain their original terrain and receive no retroactive barrier.

## Economy and equipment

Credits are integer tenths of a CR. Refuelling costs 1 CR per litre and repair 15 CR per HP; partial purchases display their total cost and resulting condition. Energy and hull upgrades fill their new capacity. Rank-1 drill/energy/cargo/hull/engine cost **750/600/700/450/500 CR**.

| W01 package | New-package value | Bulk |
| --- | --- | --- |
| Slag iron | 28 CR | 1 |
| Rust copper | 53 CR | 1 |
| Shard silver | 120 CR | 1 |
| Core crown | 400 CR | 1 |

The four ordinary counts remain 240/120/36/4, for 400 deposits worth 19,000 CR before optional rewards. Depth weighting places higher-value minerals deeper. The weighted mean remains 47.5 CR; the opening mixes retain their 380/480 CR totals. Current W01 reference spending is 5,950 CR and the ordinary-value floor is 17,850 CR. Versioned source overlays and runtime data are checked during builds.

| Local equipment | Price | Unlock | Effect |
| --- | --- | --- | --- |
| Salvaged auger | Free | Start | Soil cut time ×0.90 |
| Shaft brace | 250 CR | M1; own auger | Deploy against a wall to cut sideways without a floor; bracing reduces drift and thrust energy |
| External cargo rack | 900 CR | M2; no brace prerequisite | Cargo capacity ×1.30, rounded up; loaded acceleration −8% |

Cargo mass now slows ascent; the engine improves loaded climbing. The return-reserve indicator uses the same motion and energy constants as the simulation, including a committed cut's remaining cost. Its states are OK, Plan return, Turn back and Can't reach home. It is guidance for the cleared return route, not a promise that the rig can drill upward through an unexplored ceiling.

Packages keep their identity, origin, stamped value/bulk/mass and balance version through extraction, carrying, banking, sale and loss. Banking creates no credits. Mission objects have no cargo bulk or sale value. A full hold leaves packages exposed in cleared terrain; ejection moves the same package into nearby open space. Rack changes cannot leave the hold over capacity.

The two opening hauls plus starting cash produce 880 CR before expenses. The opening regression targets the **600 CR energy upgrade after M1 and one minor impact**, with a service reserve; it does not promise the 750 CR drill after two trips or establish novice completion time.

## Recovery and hazards

New campaigns start with the full 10 L rank-0 tank. The first emergency tow per world is free and keeps carried ordinary cargo, relics and mission objects. It applies when energy or hull is depleted, or when the return estimate shows insufficient energy even after an equipped steam reserve. The saved `towsUsed` ledger prevents repeated free tows. Voluntary recovery and later tows keep the paid recovery rules.

Paid recovery loses carried ordinary cargo/relics and returns unbanked mission objects to their sources. Its fee is `min(cash, 25,000, 100 + floor(0.01 × actual equipment spending))` CR, with no debt. Hardware and local tools count as equipment spending; construction and services do not. Energy and hull rise to at least half maximum, preserving resources already above that level. Emergency ordinary salvage appears when nearby safe income is exhausted; it supplies no mission objects or blueprints.

Brittle shelves are placed per seed, away from the protected route, and warn for two seconds before collapse. Pressure seams begin below 450 m in optional soil: a cut starts a 1.2-second hiss before a nearby burst. Base damage is 4 HP and hull rank reduces that damage by `1 / (rank + 1)`. Normal falls remain below the ordinary landing-damage threshold.

## World content

The staged generator uses four shared bands: Regolith (rows 0–10), Broken plates (11–29), Iron shelf (30–47) and Core rubble (48–59). Rock density, cave shape, lighting and hazards vary by band. A one-column drillable route has nearby features and mission rooms; it is not a pre-excavated shaft.

Eight field logs, discoverable sites and a deep named relic, **Surveyor's compass**, support exploration. A nearby anomaly ping hints at the relic without exposing its exact hidden cell. Hollow-rock cues and reward pockets provide reasons to leave the direct objective route. A post-restoration cache requires the comet's thermal auger on a return visit.

Two optional contracts supplement the main construction path: sell twelve ordinary packages after acceptance for 120 CR, or reach 450 m and return for 250 CR. Their progress and one-time claims are saved. Chapter records track time, income, best banked haul, mining, recoveries, depth and contracts; mastery reflects completion, banking or selling at least half the ordinary value plus the relic, and a recovery-free completion within twenty minutes when a complete timing history is available. Migrated records with incomplete history cannot gain the speed star from a zero timer.

## Interface and controls

The world remains the main screen. The persistent HUD presents conditions, return guidance and an objective chip; mission details, recent notices and exploration records are available through the game interface. Surface interactions use the paused Trade / Workshop / Construction terminal. Pause contains save data, settings and recovery; New expedition belongs to the front door.

Keyboard, mouse, floating touch joystick and controller share named actions. Mouse press steers immediately except on an inspectable target; touch direction is relative to each gesture's dynamic center. A dead zone gives neutral input, diagonal motion combines thrust and steering, and cancelled gestures or lost focus clear transient controls. Input release does not cancel a committed cut. Fixed directional buttons remain an optional fallback.

Shaft alignment assists Down entry from small offsets, including ledges above the deepest excavation. The brace enables side cuts against a wall without requiring a floor. Air braking and bay assistance reduce overshoot. The settings expose accessibility and input preferences, including reduced motion, high contrast, type scaling, sound and remapping. Sound unlocks after a user action and remembered mute is respected. Physical controller/Android comfort is still a playtest concern.

Mission wreckage, source beacons and wrapped proximity guidance identify the survey and recoverable parts. Home guidance remains available below the surface. Persistent danger notices are separate from routine pickups; disabled rigs have a recovery action with a preview of cost and retained/lost resources. Browser modifier shortcuts and focused form keys do not become pilot movement.

The rendering implementation and asset pipeline are documented in [CAMPAIGN_ASSETS.md](CAMPAIGN_ASSETS.md). World-to-screen mapping and measured HUD safe areas do not alter simulation or save coordinates.

## Persistence and compatibility

IndexedDB database `motherload.campaign.v1` retains its version-1 checkpoint envelope and store. Current/backup writes use compare-and-swap protection; archive insertion, valid-archive pruning and replacement share that transaction. Three valid campaign archives survive later autosaves. Corrupt/future data and unsupported archive bytes are protected rather than silently deleted. BroadcastChannel informs other tabs, with revision checks still authoritative.

Schema 1/2 checkpoints migrate to schema 3 in memory. Old worlds remain generator 1 / balance 0.1 and retain excavation, discoveries and package economics. Current names resolve by item ID. New reserve, training, contract, record, waypoint, cache, site, log and hazard fields receive explicit defaults and validation. Old W01 campaigns can travel into a newly generated W02 without changing their original claim. Exports are canonical schema-3 snapshots; loading alone does not rewrite the source bytes.

All restored expeditions remain paused until Resume. World timers, pressure/volatile warnings, construction, cargo and conditions persist; velocity, gestures, animation and partial cuts are transient. The state limit remains 2 MiB and transport limit 16 MiB. Those are enforced bounds, not a claim that a future fifteen-world campaign fits this format.

## Current verification

Use `npm test`, `npm run build` and the maintained campaign/browser checks. Current release results and unverified performance or human-pacing targets belong in [IMPROVEMENT_PROGRESS.md](IMPROVEMENT_PROGRESS.md). Automated fixtures that provide funds or open shafts isolate mechanics and interface behavior; they do not prove human earning pace. No physical-device result should be inferred from emulated phone viewports.

## Historical verification before the improvement-plan implementation

The evidence below records earlier releases. Its scenario counts, interface descriptions and measured sizes are historical and are not the current acceptance tally. Initial W01 checkpoints measured about 93 KiB across 100 seeds; the first two-world schema-2 expansion measured at most 240,777 bytes. Current schema-3 content has separate size/round-trip checks.

Final campaign-only test results are recorded in [USABILITY_REVIEW.md](USABILITY_REVIEW.md). The W01 baseline passed ten campaign browser scenarios across focused runs: the native opening, fixture-assisted late mission/departure loop, cargo identity and reload, reserve previews/capacity fills, invalid/cancelled imports, two-tab conflict handling, portrait/landscape multitouch, and phone mineral inspection. The late mission fixture deliberately provides credits and an opened shaft; it is not an earnings or campaign-duration measurement.

The native IndexedDB probe passed actual browser transactions, stale tabs, notifications, rollback, protected data, backup restoration, export/import and untouched unrelated browser save bytes. The earlier rebuilt Docker service passed four campaign phone/inspection scenarios against its compiled assets. Screenshots and detailed traces remain in ignored `artifacts/`; current build/safety verification is recorded in the usability notes.

The subsequent transparent-HUD iteration passed nine focused browser scenarios: live readouts and pointer passthrough, cargo identity/reload, service reserves and capacity fills, invalid/cancelled imports, two-tab conflicts, portrait/landscape touch controls and hardware purchases, and mineral inspection. Its rebuilt Docker service passed five focused desktop/phone HUD, purchase and inspection scenarios against the production bundle. Dock presentation moves while the expedition state stays paused. Phone purchase fixtures provide credits and unlock M1 to isolate interface behavior; they do not measure earnings.

The pointer-control and mission-tracker iteration passed nine focused browser scenarios on desktop, portrait and short landscape. Its healthy rebuilt Docker service passed six focused pointer, mission and inspection scenarios against the production bundle. Native mouse/touch input mines terrain, collects cargo, flies diagonally and enters the lander; short taps still respect mineral visibility. Checks include independent world/pad fingers, cancellation, release during drilling-toggle mode, pause/resume clearing, optional desktop buttons, keyboard thrust, purchases and actual stage banking/payment/reload transitions. Headless tab switches emit no focus event in this environment, so the blur-clearing handler is checked with explicit event dispatch. Mission fixtures isolate presentation and payment behavior, not campaign earning pace. Unit checks also cover hold timing independently of rendering speed.

The floating-joystick iteration passed eight focused development browser scenarios and four phone scenarios against the compiled Docker bundle. Native touch checks cover immediate joystick placement, stationary neutral holds, downward mining, diagonal flight, center stability during camera movement, returning to neutral, fresh centers, independent fingers, cancellation and short-tap inspection/docking. Fixed direction buttons are hidden by default and their explicit fallback remains tested. Six new unit checks cover touch behavior independently of mouse aiming and simulation timing. Physical-device comfort remains a playtest task.

The historical roadmap's W02 work is now delivered. W03 and later worlds, wider device/human playtests and any future chunked multiworld storage remain separate work. The pack's 45-minute W01 and 16-hour campaign durations are design targets, not demonstrated human completion times.
