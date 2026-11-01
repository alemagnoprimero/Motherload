# Ice comet — first Frontier expansion

W02 is the next playable destination after Broken asteroid. It adds travel and return visits, rank-2 hardware, ice extraction, volatile preservation, cold pockets and three local tools. This is the first half of Phase 2; Fractured moon remains in development, and Iron planet is charted after the comet project rather than presented as playable.

## Travel and continuity

Finish W01's three construction stages and record Frontier departure at its lander. Open Navigation at a lander and choose Ice comet. Travel requires docking, previews the current conditions and banks carried cargo and mission objects at the departing world's station. It is free and preserves energy, hull, credits and owned equipment. Arrival stays paused in the destination's terminal until Undock.

The asteroid and comet retain independent terrain, discovery, deposits, stored packages and local objectives. Returning never regenerates a visited world. Cargo is banked before travel, so no carried package becomes inaccessible in an inactive world. Owned equipment remains available across destinations; installed rank-2 hardware keeps its benefits and visible modules on return visits. Only the active world simulates.

## Comet progression

The 48-column, 100-row world wraps horizontally and reaches 1000 m. Gravity is 0.35g. A central route remains drillable ice; it is not an already excavated passage. Mission sites use the same nearby markers and live direction/range guidance as W01.

| Stage | Required proof | Construction | Result |
| --- | --- | --- | --- |
| M1: Sample the thermal seam | Bank five Helion thermal samples from 150 m | 400 CR | Heated surface refuge and condenser blueprint |
| M2: Recover without rupture | Bank three intact cryosilicate packages from the marked 450 m vein or deeper | 600 CR | Preservation chamber blueprint |
| M3: Stabilize the comet fuel | Bank the cryogenic catalyst from 1000 m | 1000 CR | Completed condenser project, Planetary certificate and W04 chart |

The five thermal samples have no cash value and occupy the protected mission compartment. Intact cryosilicate is ordinary cargo with bulk and sale value. Its proof survives sale after banking. Additional deep cryosilicate can replace failed attempts; an eight-deposit marked vein provides several chances. The chamber unlocks after M2, so it is not required to satisfy M2.

## Extraction and tools

On completing a volatile cut, release drilling within **0.75 seconds** to preserve the package. Continuing to drill past that window ruptures it. Returning the joystick to neutral, lifting or taking off releases drilling, including diagonal ascent; toggle users can press Down again or use the visible **Release drill** action. A countdown cue and world ring identify the window. Committed cuts still finish after input release. Pausing freezes the window, and checkpoints retain its remaining time.

| Tool | Price | Unlock | Effect |
| --- | --- | --- | --- |
| Thermal auger | 1200 CR | Arrival | Ice cutting time ×0.55; drilling energy ×1.20 while installed; other materials keep their cutting time |
| Vapour condenser | 2200 CR | M1; own auger | Return 20% of energy actually spent drilling each ice cut, once after extraction |
| Preservation chamber | 4000 CR | M2; own condenser | Hold Precision/Q while starting a volatile cut: time ×1.35 and intact ordinary volatile value +30%, applied once |

Condenser refunds exclude idle energy and cannot exceed actual cut spending. Chamber bonuses exclude mission objects and relics; ejection/recollection cannot repeat processing. Utility ownership and equipped slots remain distinct. These are typed effects, not evaluated design-pack prose.

Cold pockets show **1.5 seconds** of warning before reducing acceleration by 25% for four seconds. Ice vents deal six hull damage, at most once per three seconds of contact. Their optional pockets lie away from the required corridor and have visible warnings. The dock clears cold effects. M1 improves the heated refuge's construction; basic safe arrival services remain available before it, following the approved opening-service rule.

## Economy and artwork

The ordinary resource mix is 60/30/9/1, with base values **50/120/300/1200 CR**, bulk two and distinct silhouettes. Cryosilicate begins deeper than the opening; rare Helion crowns appear from 650 m. The opening's two veins contain **1840 CR** gross in twenty packages, permitting the thermal auger plus service reserve without requiring that tool to earn it. The post-carving ordinary-value floor is **55,800 CR**, excluding relics and preservation bonuses.

Rank-2 drill/energy/cargo/hull/engine purchases cost **2200/1800/2400/1200/1600 CR**. Prices and effects are cross-checked against the unchanged v0.1 source data. Service costs retain W01's fixed-point accounting and exact previews. The pack's 75-minute destination duration remains a tuning target, not a measured human completion time.

Original editable SVGs live in `assets/campaign/w02/`. The 73-frame world atlas is 1024×1472 RGBA (5.75 MiB decoded), with three backgrounds and exported icons. It includes rank-2 modular hardware and surface construction states. The registry traces seventeen implemented design briefs and records remaining art variants explicitly. Author with `npm run frontier:assets` using Inkscape and Pillow; normal builds use only Node and committed outputs.

## Checkpoints and verification

State schema 2 accepts and migrates W01 schema-1 checkpoints in memory. Loading does not rewrite the original record. The next successful save keeps the prior raw primary as its atomic backup. IndexedDB namespace and checkpoint envelope remain version 1, preserving stale-tab and protected-backup behavior.

One hundred generated two-world exports measured at most **240,777 bytes**, within the existing 2 MiB state and 16 MiB transport bounds. This is a measured two-world record, not the finished fifteen-world chunk-storage system. Pending volatile windows and climate timers persist; partial drilling, velocity and pointer gestures remain transient.

Run `npm test`, `npm run build` and `npm run test:frontier`. Browser fixtures shorten late travel and provide construction funds to isolate mechanics; they are not evidence of human earning pace. Release verification and remaining device limitations are recorded in [USABILITY_REVIEW.md](USABILITY_REVIEW.md).
