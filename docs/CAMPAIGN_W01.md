# W01 implementation notes

This checkpoint implements the approved design-pack foundations and **Broken asteroid (W01)**. W02/W03 are unlocked in the navigation archive after completing W01, but their playable content belongs to the next slice. The other worlds have validated metadata, not implemented mechanics.

## Play and progression

The root address opens the campaign directly, including older bookmarked mode URLs. There is one playable game. Retired browser save data is neither selected nor converted/deleted; campaign checkpoints retain their existing IndexedDB namespace.

The 40-column, 60-exploration-row asteroid wraps horizontally and reaches 600 m. Arrival air uses negative vertical coordinates, so the design's exploration rows do not lose depth to surface padding. The camera follows the rig and the map stays hidden behind wall-occluded discovery.

The starter veins at columns 20/21 contain seven ordinary packages worth 380/480 CR. The survey beacon is at 100 m; the valve, antenna and navigation core are at 250/400/600 m. Required geometry is protected before caves and optional shelf hazards are placed. The mission corridor is drillable soil, not an already excavated passage.

M1 requires the surveyed beacon, three banked ordinary packages and 200 CR. It opens rank-1 hardware and the anchoring feet. M2 requires the banked valve/antenna and 300 CR, opening the rack and navigation archive. M3 requires the banked core and 500 CR, granting the Frontier certificate and departure. Each payment changes the surface construction. R3 ownership is optional for W01 departure.

Basic trade, banking, refuelling and repair exist at the arrival lander. M1 improves the infrastructure and unlocks blueprints; it does not gate the banking needed to satisfy its own objective. The free salvaged auger is installed for the opening tutorial.

## Economic rules

`src/campaign/config.ts` holds typed numeric W01 rules and all hardware-rank tables. The source JSON is pinned unchanged under `design/v0.1/`, audited at build time, and does not execute as a gameplay script. Later prose effects require separate typed handlers before those worlds can be marked implemented.

Credits are integer tenths of a CR. Refuelling costs 1 CR per energy unit and repair 15 CR/HP; partial transactions round their charge upward to the next 0.1 CR. Rank-1 drill/energy/cargo/hull/engine cost 750/650/700/450/500 CR. Energy/hull purchases fill the new capacity.

Packages preserve identity, origin, value, bulk, mass, tags and balance version. Their lifecycle distinguishes deposits, exposed cargo, carried cargo, safely banked cargo, sold cargo and losses. Banking does not create credits; selling operates on stored packages. Mission objects occupy no cargo bulk, cannot be sold and are tracked separately.

A full hold leaves an exposed package in cleared terrain. Ejection places an intact carried package in nearby open space. Collection, banking and sale move that same identity instead of copying it. Equipping/stowing the rack cannot create an invalid over-capacity save.

Recovery loses carried ordinary cargo/relics and returns unbanked mission objects to their marked sources. Its fee is `min(cash, 25,000, 100 + floor(0.01 × actual equipment spending))` in CR. Equipment spending includes hardware and local tools, excluding construction/services. Hull/energy rise to at least half maximum; healthier resources are preserved. An emergency ordinary salvage package is provided when nearby safe income is depleted; it supplies no story items or blueprints.

The two starter hauls plus initial cash produce 880 CR before costs. M1 leaves at most 680 CR before services. The opening check therefore targets a useful affordable purchase with a reserve rather than promising a 750 CR drill.

## Simulation and persistence

The campaign owns its model, world generation, validation and save namespace under `src/campaign/`. The entry loads it directly. The retired prototype's runtime, assets, routing and tests have been removed.

IndexedDB database `motherload.campaign.v1` keeps current/backup checkpoints in one transaction, with compare-and-swap revision protection. A failed/aborted write rolls back both records. BroadcastChannel notifies other campaign tabs; revision comparison still guards writes without that notification. Corrupt/future records are protected; a valid backup can be reviewed before explicit restoration/replacement.

Checkpoints record schema, balance and generator versions. All current worlds, excavation/discovery, packages, mission state, equipment, paid prices, conditions and construction are included. Velocity, animation and partial cuts are transient. Pausing/backgrounding freezes simulation; background saving is best effort, so explicit Save/Export remains available.

Saved, imported and backup-restored runs require an explicit Resume expedition action before simulation can advance. Load waits for its asynchronous read to finish and retains the paused menu. Disabled restored rigs can request confirmed recovery directly from that menu's header. Save recency records actual successful saves in the current session, and Load clearly refers to the latest checkpoint including autosaves.

The current W01 validator bounds state JSON to 2 MiB and the checkpoint transport to 16 MiB. Across the initial 100 generated seeds, the largest measured checkpoint was about 93 KiB. Those bounds are not a claim that every future campaign state fits; adding worlds requires a versioned format/size review and chunk-storage work. The present checkpoint is a transactionally saved W01 world record, not the finished fifteen-world persistence implementation.

## Visual and input scope

The renderer uses original layered 2D artwork and separate terrain/deposit/package/collision layers. Art is validated from committed PNG/JSON output; see `CAMPAIGN_ASSETS.md`. Transparent edge gauges and numeric readouts stay live during mining and flight. A compact objective line and equipped-tool icons accompany short contextual cues and item pickup feedback beside the rig. Uninstalled gear does not occupy the active HUD.

The title screen sits over the world. Surface services open a lander terminal beside the visible rig and ship: a side console on wide screens and a bottom console in portrait. The presentation camera frames the uncovered world while simulation and hazard timers remain paused. Hardware and services use icon-led rows with their existing exact prices, prerequisites, effects and service-reserve previews. The pause interface retains checkpoint, cargo, settings and recovery functions.

`src/campaign/layout.ts` supplies the shared viewport contract used by the renderer and browser checks. Camera framing and contextual-prompt anchors follow the actual console bounds; collision and save coordinates remain simulation data.

Keyboard and independent touch controls share named actions. Keyboard remapping, drill/brace hold-toggle options, reduced motion, high-contrast edges, larger text, fullscreen and three sound volume buses are available. Default controller gameplay includes pause/resume; controller remapping and controller menu navigation remain follow-up work. Physical controller/Android comfort and performance are not established by browser emulation.

Touch controls use a floating joystick centered at the first screen position of each gesture. Direction follows the finger's displacement from that center, independently of the rig and camera; returning to its dead zone gives neutral input. The base and bounded knob appear at the touch position, and a new gesture places a new center. Diagonal dragging combines thrust and steering. Mouse holds retain rig-relative world aiming. Short taps retain mineral inspection and lander entry. Gestures are transient input, do not latch the keyboard drilling toggle, and clear on cancellation, focus loss or menus. Releasing input does not cancel the simulator's committed cut or remove vehicle momentum. Fixed direction buttons are an explicit optional fallback on any device.

The live mission tracker names each current-stage requirement, distinguishes objects still at their source from carried and banked objects, and tracks the construction fee against available credits. It directs the player to the next discovery, return/banking, earning or construction action, then advances after actual construction payment. The departure stage points to launching from the lander. These instructions reflect existing model/configuration rules; they do not change rewards, prices or saved progression.

Persistent HTML energy/hull warnings take priority over routine messages. Disabled rigs have a responsive recovery overlay with exact fee, consequences and resulting conditions before confirmation. Normal lander services remain accessible to disabled rigs already in its bay. Services use model-shared total/partial previews; known ores have shape inlays explained by the pause legend. Browser modifier shortcuts and focused toolbar/form keys do not become pilot commands. See [USABILITY_REVIEW.md](USABILITY_REVIEW.md).

## Verification and remaining work

The model checks include 100-seed mission/resource generation, source-budget arithmetic, duplicate-safe package handling, save validation, fog occlusion and varied-input snapshots. One input-driven opening includes two physical trips, a shelf hit, repairs, M1 and a hull purchase with reserve. A separate pre-funded route test isolates excavation/flight/tool feasibility to all mission depths and departure; it does not prove complete human earning pace.

Final campaign-only test results are recorded in [USABILITY_REVIEW.md](USABILITY_REVIEW.md). The W01 baseline passed ten campaign browser scenarios across focused runs: the native opening, fixture-assisted late mission/departure loop, cargo identity and reload, reserve previews/capacity fills, invalid/cancelled imports, two-tab conflict handling, portrait/landscape multitouch, and phone mineral inspection. The late mission fixture deliberately provides credits and an opened shaft; it is not an earnings or campaign-duration measurement.

The native IndexedDB probe passed actual browser transactions, stale tabs, notifications, rollback, protected data, backup restoration, export/import and untouched unrelated browser save bytes. The earlier rebuilt Docker service passed four campaign phone/inspection scenarios against its compiled assets. Screenshots and detailed traces remain in ignored `artifacts/`; current build/safety verification is recorded in the usability notes.

The subsequent transparent-HUD iteration passed nine focused browser scenarios: live readouts and pointer passthrough, cargo identity/reload, service reserves and capacity fills, invalid/cancelled imports, two-tab conflicts, portrait/landscape touch controls and hardware purchases, and mineral inspection. Its rebuilt Docker service passed five focused desktop/phone HUD, purchase and inspection scenarios against the production bundle. Dock presentation moves while the expedition state stays paused. Phone purchase fixtures provide credits and unlock M1 to isolate interface behavior; they do not measure earnings.

The pointer-control and mission-tracker iteration passed nine focused browser scenarios on desktop, portrait and short landscape. Its healthy rebuilt Docker service passed six focused pointer, mission and inspection scenarios against the production bundle. Native mouse/touch input mines terrain, collects cargo, flies diagonally and enters the lander; short taps still respect mineral visibility. Checks include independent world/pad fingers, cancellation, release during drilling-toggle mode, pause/resume clearing, optional desktop buttons, keyboard thrust, purchases and actual stage banking/payment/reload transitions. Headless tab switches emit no focus event in this environment, so the blur-clearing handler is checked with explicit event dispatch. Mission fixtures isolate presentation and payment behavior, not campaign earning pace. Unit checks also cover hold timing independently of rendering speed.

The floating-joystick iteration passed eight focused development browser scenarios and four phone scenarios against the compiled Docker bundle. Native touch checks cover immediate joystick placement, stationary neutral holds, downward mining, diagonal flight, center stability during camera movement, returning to neutral, fresh centers, independent fingers, cancellation and short-tap inspection/docking. Fixed direction buttons are hidden by default and their explicit fallback remains tested. Six new unit checks cover touch behavior independently of mouse aiming and simulation timing. Physical-device comfort remains a playtest task.

Remaining campaign work includes W02/W03, subsequent worlds and tools, chunked multiworld persistence, complete controller accessibility, broader telemetry and human full-run pacing. The pack's 45-minute W01 and 16-hour campaign are design targets, not demonstrated completion times. Normal builds do not need the authoring tools or supplied PDF/HTML/concept images.
