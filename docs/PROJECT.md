# Project status — 2026-11-01

Motherload has one playable campaign. W01 Broken asteroid includes mining, flight, discovery, package collection/banking/sale, services, rank-1 hardware, three local attachments, three construction milestones, recovery, full checkpoints and Frontier departure. W02/W03 are charted after W01 but remain future playable content.

The retired prototype's alternate mode, routing, runtime source, artwork pipeline and tests were removed. The root address and old bookmarked mode URLs open the campaign. Retired localStorage data is left untouched; no automatic conversion/deletion occurs. Campaign IndexedDB checkpoints retain their current format.

## Interface and controls

The canvas fills desktop and phone viewports. Compact condition gauges, live stage missions and priority safety warnings overlay the world. Surface services appear beside the lander while simulation pauses. Prices, current → next equipment benefits, prerequisites, total service charges and resulting conditions are visible before purchases.

Touch uses a floating joystick centered at each initial press. Dragging controls direction relative to that screen position; returning to its dead zone gives neutral input. Mouse aiming, keyboard controls and optional direction buttons accompany it. Browser shortcuts and focused form/toolbar keys do not become pilot actions.

Saved, imported and backup-restored runs wait for explicit Resume. Disabled rigs can request confirmed recovery directly, including from the paused header; rigs already at the lander can use normal services. Recovery retains fees/cargo consequences while preserving resources above half capacity. Warnings take priority over routine pickups.

Known ores have distinct shape markers and a pause legend. Wall-occluded discovery keeps unexplored minerals hidden. The palette, panels and visible keyboard focus are preserved.

## Source, persistence and art

`src/campaign/` owns the simulator, renderer, interface, audio, input, configuration and IndexedDB persistence. `src/main.ts` loads that game directly. Design JSON remains pinned unchanged in `design/v0.1/`; typed handlers implement W01 rules rather than executing prose.

Checkpoints preserve exact terrain/discovery, packages, missions, equipment, paid prices, conditions and money. Transactions rotate current/backup records together and reject stale writers. Corrupt/future data remains protected. Export/import provides manual device transfer; no server account or automatic synchronization is required.

Campaign art uses layered SVG sources and a committed atlas, backgrounds and icons. Normal builds need no browser/Blender/Python authoring tools. The original SWF/reference research lab remains separate and never ships in `dist/`.

## Validation and next work

Current verification is recorded in [USABILITY_REVIEW.md](USABILITY_REVIEW.md) and [CAMPAIGN_W01.md](CAMPAIGN_W01.md). Launch, Docker, test and export instructions are in the root README.

Next work includes W02/W03, later destinations/tools, chunked multiworld persistence, complete controller menu accessibility, human full-run pacing and physical Android testing. The pack's 45-minute opening and 16-hour campaign are targets, not demonstrated completion times. W01 and original research do not establish complete fifteen-world gameplay or exact Flash timing parity.
