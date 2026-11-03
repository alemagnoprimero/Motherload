# Project status — 2026-11-02

**The Deep Frontier** is the working title of the two-world mining campaign. Development follows the owner's [improvement plan](IMPROVEMENT_PLAN.md); [implementation progress](IMPROVEMENT_PROGRESS.md) records releases, measured gates and remaining validation. The repository, published `/Motherload/` address and browser-save namespace retain their original names.

The follow-up [quality audit](QUALITY_AUDIT_2026-11-02.md) corrects surface camera discontinuity, competing HUD messages and duplicate POI scenery. It records a complete native opening journey and the outstanding Firefox-for-Android rendering report.

W01 Broken asteroid and W02 Ice comet are playable. Both support persistent excavation, minerals, services, upgrades, construction, travel, optional contracts, logs, named relics and specialist caches. W03 and later destinations remain outside this improvement plan's two-world implementation scope.

## Gameplay and interface

The fullscreen game uses transparent condition gauges, a compact mission chip, a return-energy estimate, a home beacon, independent danger/progress messages and a tool dock. Keyboard, immediate mouse steering, the floating touch joystick and controller navigation share the same simulation. The first-sortie guide surveys the beacon, teaches the two starter seams and directs the player to the 600 CR tank.

The title offers Continue, New expedition and Settings. In-game terminals separate Trade, Workshop and Construction; purchases preserve focus. Pause separates settings, controls, records/journal, cargo and save data. The claim map contains only surveyed terrain and persisted waypoints. Sales and installations present their already-committed results while simulation is paused.

New expeditions begin with a full tank. One emergency tow per world preserves cargo; ordinary recovery remains a previewed fee/loss decision. Return estimates, shaft alignment, air braking and bay assistance make travel more legible. Low resources, pressure seams, shelves and volatile cuts have distinct notices and feedback. New comet worlds give three extended volatile training windows.

## Versions and persistence

Schema 3 loads earlier campaign schemas without regenerating their worlds. Existing terrain, mineral values, bulk and vehicle condition remain intact; current display names and rules read at use can change. New W01 uses generator 2/balance 0.2; new W02 uses generator 2/balance 0.3. Versioned overlays and matching checks are described in [BALANCE_VERSIONS.md](BALANCE_VERSIONS.md). The original design pack remains unchanged in `design/v0.1/`.

IndexedDB uses atomic current/backup checkpoints and compare-and-swap protection against stale tabs. Three independent valid campaign archives survive autosaves; unsupported or corrupt records remain protected. Load, import and restoration arrive paused. Export supports manual device transfer; browser saves do not synchronize automatically. Retired prototype save bytes are neither converted nor deleted.

## Rendering, assets and audio

The renderer shares a CSS/device/world View with input and DOM labels, uses retained terrain and streamed depth-band art, and supports both WebGL and Canvas. Local licensed typefaces, native-resolution trimmed sprites, material patterns, headlamp lighting and high-contrast edges support the new HUD and world presentation. Original SVGs and generated outputs remain editable; production builds require Node only.

The event stream drives synthesized material cutting, tiered pickups, warnings, transactions, adaptive music and ambience. Sound unlocks on Deploy/Continue and remembers mute. Reduced motion changes presentation rather than simulation timing. Audio and rendering checks use the actual production implementations.

## Validation boundary and future work

Launch, Docker and verification commands are in [README](../README.md). The maintained pacing harness measures deterministic policies and native capability tests; it does not substitute for novice playtests. Shared-host browser measurements do not establish sustained physical Android performance. Owner review of target/art comparisons, novice testing and hardware checks remain separate evidence requirements.

After the W01/W02 improvement gates, the campaign roadmap adds W03 and subsequent destinations. Chunked storage for a complete fifteen-world campaign and the roadmap's later-world mechanics remain future work. The earlier SWF research remains isolated under `reference/` and is not shipped in the game.
