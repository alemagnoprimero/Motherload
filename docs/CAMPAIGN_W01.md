# W01 implementation notes

This checkpoint implements the approved design-pack foundations and **Broken asteroid (W01)**. W02/W03 are unlocked in the navigation archive after completing W01, but their playable content belongs to the next slice. The other worlds have validated metadata, not implemented mechanics.

## Play and progression

Use `?mode=campaign` to enter the campaign explicitly. A fresh browser opens the campaign; a browser with an existing Legacy save continues opening that mode at the unqualified address. Both modes have links to the other. No automatic terrain, inventory or equipment conversion occurs.

The 40-column, 60-exploration-row asteroid wraps horizontally and reaches 600 m. Arrival air uses negative vertical coordinates, so the design's exploration rows do not lose depth to surface padding. The camera follows the rig and the map stays hidden behind wall-occluded discovery.

The starter veins at columns 20/21 contain seven ordinary packages worth 380/480 CR. The survey beacon is at 100 m; the valve, antenna and navigation core are at 250/400/600 m. Required geometry is protected before caves and optional shelf hazards are placed. The mission corridor is drillable soil, not an already excavated passage.

M1 requires the surveyed beacon, three banked ordinary packages and 200 CR. It opens rank-1 hardware and the anchoring feet. M2 requires the banked valve/antenna and 300 CR, opening the rack and navigation archive. M3 requires the banked core and 500 CR, granting the Frontier certificate and departure. Each payment changes the surface construction. R3 ownership is optional for W01 departure.

Basic trade, banking, refuelling and repair exist at the arrival lander. M1 improves the infrastructure and unlocks blueprints; it does not gate the banking needed to satisfy its own objective. The free salvaged auger is installed for the opening tutorial.

## Economic rules

`src/campaign/config.ts` holds typed numeric W01 rules and all hardware-rank tables. The source JSON is pinned unchanged under `design/v0.1/`, audited at build time, and does not execute as a gameplay script. Later prose effects require separate typed handlers before those worlds can be marked implemented.

Credits are integer tenths of a CR. Refuelling costs 1 CR per energy unit and repair 15 CR/HP; partial transactions round their charge upward to the next 0.1 CR. Rank-1 drill/energy/cargo/hull/engine cost 750/650/700/450/500 CR. Energy/hull purchases fill the new capacity.

Packages preserve identity, origin, value, bulk, mass, tags and balance version. Their lifecycle distinguishes deposits, exposed cargo, carried cargo, safely banked cargo, sold cargo and losses. Banking does not create credits; selling operates on stored packages. Mission objects occupy no cargo bulk, cannot be sold and are tracked separately.

A full hold leaves an exposed package in cleared terrain. Ejection places an intact carried package in nearby open space. Collection, banking and sale move that same identity instead of copying it. Equipping/stowing the rack cannot create an invalid over-capacity save.

Recovery loses carried ordinary cargo/relics and returns unbanked mission objects to their marked sources. Its fee is `min(cash, 25,000, 100 + floor(0.01 × actual equipment spending))` in CR. Equipment spending includes hardware and local tools, excluding construction/services. Half maximum hull/energy is restored. An emergency ordinary salvage package is provided when nearby safe income is depleted; it supplies no story items or blueprints.

The two starter hauls plus initial cash produce 880 CR before costs. M1 leaves at most 680 CR before services. The opening check therefore targets a useful affordable purchase with a reserve rather than promising a 750 CR drill.

## Simulation and persistence

The campaign has its own model, world generation, validation and save namespace. Legacy `src/model.ts` and `src/storage.ts` are retained. The former main module moved to `src/legacy-main.ts`; the new entry chooses a mode before loading its interface and artwork.

IndexedDB database `motherload.campaign.v1` keeps current/backup checkpoints in one transaction, with compare-and-swap revision protection. A failed/aborted write rolls back both records. BroadcastChannel notifies other campaign tabs; revision comparison still guards writes without that notification. Corrupt/future records are protected; a valid backup can be reviewed before explicit restoration/replacement.

Checkpoints record schema, balance and generator versions. All current worlds, excavation/discovery, packages, mission state, equipment, paid prices, conditions and construction are included. Velocity, animation and partial cuts are transient. Pausing/backgrounding freezes simulation; background saving is best effort, so explicit Save/Export remains available.

The current W01 validator bounds state JSON to 2 MiB and the checkpoint transport to 16 MiB. Across the initial 100 generated seeds, the largest measured checkpoint was about 93 KiB. Those bounds are not a claim that every future campaign state fits; adding worlds requires a versioned format/size review and chunk-storage work. The present checkpoint is a transactionally saved W01 world record, not the finished fifteen-world persistence implementation.

## Visual and input scope

The renderer uses original layered 2D artwork and separate terrain/deposit/package/collision layers. Art is validated from committed PNG/JSON output; see `CAMPAIGN_ASSETS.md`. Transparent edge gauges and numeric readouts stay live during mining and flight. A compact objective line and equipped-tool icons accompany short contextual cues and item pickup feedback beside the rig. Uninstalled gear does not occupy the active HUD.

The title screen sits over the world. Surface services open a lander terminal beside the visible rig and ship: a side console on wide screens and a bottom console in portrait. The presentation camera frames the uncovered world while simulation and hazard timers remain paused. Hardware and services use icon-led rows with their existing exact prices, prerequisites, effects and service-reserve previews. The pause interface retains checkpoint, cargo, settings and recovery functions.

`src/campaign/layout.ts` supplies the shared viewport contract used by the renderer and browser checks. Camera framing and contextual-prompt anchors follow the actual console bounds; collision and save coordinates remain simulation data.

Keyboard and independent touch controls share named actions. Keyboard remapping, drill/brace hold-toggle options, reduced motion, high-contrast edges, larger text, fullscreen and three sound volume buses are available. Default controller gameplay includes pause/resume; controller remapping and controller menu navigation remain follow-up work. Physical controller/Android comfort and performance are not established by browser emulation.

## Verification and remaining work

The model checks include 100-seed mission/resource generation, source-budget arithmetic, duplicate-safe package handling, save validation, fog occlusion and varied-input snapshots. One input-driven opening includes two physical trips, a shelf hit, repairs, M1 and a hull purchase with reserve. A separate pre-funded route test isolates excavation/flight/tool feasibility to all mission depths and departure; it does not prove complete human earning pace.

At this checkpoint, **166 simulation/storage/configuration/layout tests pass**. Ten campaign browser scenarios passed across focused runs: the native opening, fixture-assisted late mission/departure loop, cargo identity and reload, reserve previews/capacity fills, invalid/cancelled imports, two-tab conflict handling, portrait/landscape multitouch, and phone mineral inspection. The late mission fixture deliberately provides credits and an opened shaft; it is not an earnings or campaign-duration measurement.

The native IndexedDB probe passed actual browser transactions, stale tabs, notifications, rollback, protected data, backup restoration, export/import and unchanged Legacy bytes. Focused Legacy regression passed mining, physical trading, services/upgrades, reload and portrait/landscape stations/controls after mode routing changed. The healthy rebuilt Docker service passed four campaign phone/inspection scenarios against its compiled assets. TypeScript, formatting, source/asset checks and production builds pass. Screenshots and detailed traces remain in ignored `artifacts/`.

The subsequent transparent-HUD iteration passed nine focused browser scenarios: live readouts and pointer passthrough, cargo identity/reload, service reserves and capacity fills, invalid/cancelled imports, two-tab conflicts, portrait/landscape touch controls and hardware purchases, and mineral inspection. Its rebuilt Docker service passed five focused desktop/phone HUD, purchase and inspection scenarios against the production bundle. Dock presentation moves while the expedition state stays paused. Phone purchase fixtures provide credits and unlock M1 to isolate interface behavior; they do not measure earnings.

Remaining campaign work includes W02/W03, subsequent worlds and tools, chunked multiworld persistence, complete controller accessibility, broader telemetry and human full-run pacing. The pack's 45-minute W01 and 16-hour campaign are design targets, not demonstrated completion times. Normal builds do not need the authoring tools or supplied PDF/HTML/concept images.
