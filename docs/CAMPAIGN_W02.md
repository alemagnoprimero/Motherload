# Ice comet — current implementation

W02 is the second playable destination after Broken asteroid. It supports persistent travel and return visits, rank-2 hardware, ice extraction, volatile preservation, cold pockets, vents and three local tools. Newly generated comets use balance 0.3 / generator 2. Fractured moon and Iron planet are charted destinations, not playable worlds.

## Travel and continuity

Finish W01's three construction stages and record Frontier departure at its lander. Open Navigation while docked and choose Ice comet. Travel previews current conditions and banks carried cargo and mission objects at the departing station. It is free and preserves energy, hull, reserve, credits and equipment. Arrival remains paused in the destination terminal until Undock.

Visited worlds retain independent terrain, discovery, packages, objectives and timers. Returning never regenerates a claim. No carried cargo remains stranded in an inactive world, and only the active world simulates. Rank-2 hardware keeps its effects when returning to W01.

## Comet progression

The 48-column, 100-row comet wraps horizontally and reaches 1,000 m, with gravity 0.35g. The protected route remains drillable ice rather than a pre-excavated passage. Mission sites have physical landmarks, nearby markers and direction/range guidance.

| Stage | Required proof | Construction fee | Result |
| --- | --- | --- | --- |
| M1: Sample the thermal seam | Bank five Helion thermal samples from 150 m | 400 CR | Heated refuge and steam-reserve blueprint |
| M2: Recover without rupture | Bank three intact cryosilicate packages from the marked 450 m vein or deeper | 600 CR | Preservation chamber blueprint |
| M3: Stabilize the comet fuel | Bank the cryogenic catalyst from 1,000 m | 1,000 CR | Completed project, Planetary certificate and Iron planet chart |

Thermal samples occupy the mission compartment and have no cash value. Intact cryosilicate is ordinary cargo with bulk and sale value; its construction proof survives sale after banking. The marked eight-deposit vein and further deep cryosilicate provide replacement attempts. The preservation chamber unlocks after M2 and is therefore not required to satisfy it.

## Extraction and equipment

A completed volatile cut starts a release window. In a new generator-2 comet, the first three volatile cuts allow **1.5 seconds**; later cuts allow **0.75 seconds**. Existing generator-1 comets retain the 0.75-second rule. The saved training counter and explicit window duration prevent reloads from resetting or shortening the third training attempt.

Release drilling to preserve the package. Holding drilling past the window ruptures it. Centering the joystick, lifting, taking off or using Release drill releases pressure; a committed cut still finishes. A visual countdown/ring and sound cue identify the window. Pausing freezes it, and checkpoints preserve its remaining duration.

| Tool | Price | Unlock | Effect |
| --- | --- | --- | --- |
| Thermal auger | 1,200 CR | Arrival | Ice cut time ×0.55; drilling energy ×1.20; other materials unchanged |
| Steam reserve | 1,600 CR | M1; own auger | Banks 20% of actual ice-drilling energy, up to 5 L; manual release or automatic feeding when the main tank reaches zero |
| Preservation chamber | 4,000 CR | M2; own reserve | Start a volatile cut with Precision: cut time ×1.35; intact ordinary volatile value +30%, applied once |

Reserve recovery excludes idle energy and cannot exceed the cut's spending. It must be charged by drilling before it can rescue an empty tank; purchasing it does not grant a free full reserve. Stowing the utility does not erase stored reserve, but feeding requires it to be equipped. Chamber bonuses exclude mission objects and relics, and ejection/recollection cannot repeat processing. Owned and installed equipment remain distinct.

Cold pockets warn for 1.5 seconds before reducing acceleration by 25% for four seconds. Vents deal 6 HP at most once per three seconds of contact. New worlds place these optional pockets per seed, away from the required route. Deep pressure seams hiss for 1.2 seconds after a cut before bursting nearby; hull rank reduces their base 4 HP damage. The dock clears cold effects, and basic arrival services are available before M1.

## Economy and content

Ordinary mineral weights remain 60/30/9/1, with values **50/120/300/1,200 CR**. In new comets, Frost iron and Blue nickel use **one bulk**; volatile Cryosilicate and Helion ice retain **two bulk**. Existing packages keep their stored bulk and values. The two opening veins total 1,840 CR in twenty packages. The current reference budget is 18,000 CR and the ordinary-value floor is 54,000 CR, excluding relics and preservation bonuses; 600 ordinary deposits supply 63,000 CR.

Rank-2 drill/energy/cargo/hull/engine cost **2,200/1,800/2,400/1,200/1,600 CR**. Current source data is v0.1 plus the checked v0.2/v0.3 overlays, not an unchanged v0.1 runtime contract. Service costs and previews retain the shared fixed-point accounting. [BALANCE_VERSIONS.md](BALANCE_VERSIONS.md) records the arithmetic and migration rules.

Four shared bands structure the descent: Snow crust (rows 0–14), Blue glacier (15–44), Clathrate (45–74) and Black ice (75–99). Cave styles, rock density, lighting and hazard roles change with depth. Eight field logs, mission rooms, discovery sites, rare pockets and the named deep relic **Lantern seed** provide exploration goals. A post-project cache requires the preservation chamber.

Optional contracts pay 300 CR for six intact volatile sales after acceptance, or 500 CR for reaching 800 m and returning. Claims are one-time and saved. Chapter records, mastery and return-visit signals accompany the completed main project. These additions do not imply that the 75-minute human pacing target has been demonstrated.

## Artwork and controls

Original editable SVG sources live in `assets/campaign/w02/`. The renderer uses the shared world/view, lighting, depth-band, effects and HUD systems; authoring uses resvg and Pillow (byte-identical rebuilds, audit T13b) while normal builds consume committed assets with Node only. Atlas/resolution details and current measurements are maintained in [CAMPAIGN_ASSETS.md](CAMPAIGN_ASSETS.md).

The same keyboard, mouse, floating joystick and controller actions apply in both worlds. Precision, reserve release, mission guidance, danger notices and recovery remain in the game interface. Accessibility settings apply to the comet as well as the asteroid; physical Android comfort/performance still requires device testing.

## Checkpoints and verification

State schema 3 accepts legacy schema-1/2 campaigns and migrates them in memory without regenerating worlds or rewriting package economics. Existing comet hazards default to their original positions; new comet positions are stored per world. The database namespace and checkpoint envelope remain version 1, preserving compare-and-swap, archives and protected-backup behavior. Loading alone leaves the original saved bytes untouched, and restores remain paused.

Pending volatile duration, training count, reserve, climate and pressure timers, logs, sites, contracts and records are saved. Partial drilling, velocity and pointer gestures remain transient. The enforced limits are 2 MiB state and 16 MiB transport. The first schema-2 expansion historically measured at most **240,777 bytes** across 100 two-world exports; that number predates the added content and is not the current size claim.

Run `npm test`, `npm run build` and `npm run test:frontier`. Browser fixtures shorten late travel and provide construction funds to isolate mechanics; they are not human earning-pace evidence. Current release checks and outstanding human/device gates are recorded in [IMPROVEMENT_PROGRESS.md](IMPROVEMENT_PROGRESS.md). Earlier expansion checks remain historical evidence in [USABILITY_REVIEW.md](USABILITY_REVIEW.md).
