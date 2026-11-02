# Project status — 2026-11-02

The owner supplied an [improvement plan](IMPROVEMENT_PLAN.md) for W01/W02. Work now follows that plan before adding W03; its [implementation review and progress](IMPROVEMENT_PROGRESS.md) distinguishes the first Phase 0 batch from remaining visual, economic and playtest gates.

Motherload has one playable campaign with two destinations. W01 Broken asteroid includes mining, flight, discovery, package collection/banking/sale, services, rank-1 hardware, three local attachments, three construction milestones, recovery, full checkpoints and Frontier departure. [W02 Ice comet](CAMPAIGN_W02.md) adds persistent travel/returns, rank-2 hardware, volatile extraction, cold hazards, three local tools and the Planetary certificate. W03 and later destinations remain in development; the complete Frontier branch still awaits W03.

The retired prototype's alternate mode, routing, runtime source, artwork pipeline and tests were removed. The root address and old bookmarked mode URLs open the campaign. Retired localStorage data is left untouched; no automatic conversion/deletion occurs. Campaign IndexedDB keeps its namespace and checkpoint envelope; state schema 2 migrates existing W01 saves while preserving the preceding raw checkpoint as the next save's backup.

## Interface and controls

The canvas fills desktop and phone viewports. Compact condition gauges, live stage missions and priority safety warnings overlay the world. Surface services appear beside the lander while simulation pauses. Prices, current → next equipment benefits, prerequisites, total service charges and resulting conditions are visible before purchases.

Touch uses a floating joystick centered at each initial press. Dragging controls direction relative to that screen position; returning to its dead zone gives neutral input. Mouse aiming, keyboard controls and optional direction buttons accompany it. Browser shortcuts and focused form/toolbar keys do not become pilot actions. Down assists entry into a nearby excavated shaft, and a short cut-input buffer helps when landing. Gamepad menus support D-pad focus, A activation and B return; full spatial menu navigation remains future work.

Saved, imported and backup-restored runs wait for explicit Resume. New campaigns start with a full tank. The first disabled-rig tow per world is free and preserves cargo and mission items; voluntary and subsequent recovery retain their fees and cargo consequences. Recovery preserves resources above half capacity. Disabled rigs at the lander can use normal services. Warnings take priority over routine pickups and state the current low-energy band; undocking below half a tank prompts a service preview.

Known ores have distinct shape markers and a pause legend. Wall-occluded discovery keeps unexplored minerals hidden. The palette, panels and visible keyboard focus are preserved.

Mission objectives have distinct wreck landmarks, a persistent bearing/range readout, nearby world markers and proximity alerts. Guidance follows actual saved source positions, accounts for horizontal wrapping and switches to the lander for banking/construction. Physical wreckage follows discovered terrain and remains after survey/recovery; radio markers do not reveal ores. See [mission guidance](MISSION_POIS.md).

## Source, persistence and art

`src/campaign/` owns the simulator, renderer, interface, audio, input, configuration and IndexedDB persistence. `src/main.ts` loads that game directly. Design JSON remains pinned unchanged in `design/v0.1/`; typed handlers implement W01/W02 rules rather than executing prose.

Checkpoints preserve exact terrain/discovery, packages, missions, equipment, paid prices, conditions and money. Transactions rotate current/backup records together and reject stale writers. Replacing a valid campaign also retains a separate archive, with the three newest valid archives restorable from Pause. Archive creation/pruning and checkpoint replacement are atomic; malformed/future records remain protected. Export/import provides manual device transfer; no server account or automatic synchronization is required.

Campaign art uses layered SVG sources and a committed atlas, backgrounds and icons. Normal builds need no browser/Blender/Python authoring tools. The original SWF/reference research lab remains separate and never ships in `dist/`.

## Validation and next work

Current verification is recorded in [USABILITY_REVIEW.md](USABILITY_REVIEW.md) and [CAMPAIGN_W01.md](CAMPAIGN_W01.md). Launch, Docker, test and export instructions are in the root README.

Next work includes W03 to complete the first branch, later destinations/tools, chunked multiworld persistence, complete controller menu accessibility, human full-run pacing and physical Android testing. The pack's 45-minute opening and 16-hour campaign are targets, not demonstrated completion times. W01/W02 and original research do not establish complete fifteen-world gameplay or exact Flash timing parity.
