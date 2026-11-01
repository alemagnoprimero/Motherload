# Usability review implementation

The campaign is the sole game. The alternate Legacy runtime, routing, assets and test suites were removed at the user's request during this review. Existing browser save bytes are not converted or deleted; older bookmarked mode URLs open the campaign.

## Viewport, warnings and recovery

Active play uses a fixed viewport canvas, persistent energy/hull/cargo gauges, stage guidance and responsive HTML safety messages. Low energy and critical hull warnings persist ahead of routine pickups. Small-screen camera framing preserves readable world labels.

A disabled rig has Request recovery with exact fee, consequences and resulting-condition previews before confirmation. Restored disabled rigs also expose it in their paused header. Disabled rigs already at the lander can use normal repair/refuel services without a recovery fee or cargo loss. Recovery returns paused, raises resources to at least half capacity and preserves healthier conditions.

## Safe restoration and input

Saved, imported and backup-restored runs cannot advance until explicit Resume. The pause header includes current conditions and usable targets. Its measured height reserves scroll space so focused body controls stay visible.

Ctrl/Meta/Alt combinations, composition and focused toolbar/form keys do not become pilot commands. Clicking the world restores gameplay focus. Floating joystick, mouse aiming and optional direction buttons remain available.

## Transactions, feedback and accessibility

Service previews share the transaction's exact total/partial charge and resulting condition. Upgrades show current → next benefits, prerequisites and missing credits. Full holds warn immediately; Down clears stale side-drilling advice. Shape inlays identify known ores, with a pause legend; fog still hides unexplored deposits.

Dialogs have accessible names/descriptions, important targets are at least 44px, and unchanged status text is not repeatedly rewritten. Save recency reports actual successful saves in the current browser session. Load uses the latest checkpoint, including autosaves; Export preserves a separate copy. No new save schema or price table is required.

## Verification

The campaign-only project passes **79 automated tests across eight files**, TypeScript, formatting, source/asset audits and production builds. The preceding usability release passed eight browser checks and five pointer/inspection regressions with no page errors. Four compiled Docker viewport/routing checks passed; a final compiled landscape check verified the visual-only disabled-warning cleanup while retaining its accessible alert.

The browser checks cover 1440×900 desktop, 393×851 portrait and 568×320 landscape, restored airborne saves, critical conditions, named recovery confirmations and cancellation, healthy-resource preservation, exact service/upgrade previews, cargo-preserving repair at the lander, modifier/focus handling, unchanged-status mutation counts, legends, joystick/inspection and retired-link routing. Old localStorage bytes remain exact. The production output contains nine campaign-only files and no retired renderer or atlas. Local output and tested Docker files match by SHA-256.

The mission-landmark iteration passed five new development browser checks and all five against the final compiled Docker build. A focused development rerun checked the refined beacon, short-screen labels and warning priority. Native approaches verify that the survey transmitter is visible before completion and the pressure assembly is recognizable before collection, with discovery reset rather than pre-revealed. Deep mission fixtures isolate recovery, banking, construction and launch guidance; they do not establish earning pace. Additional checks cover actual horizontal seam crossing, unchanged hidden-ore pixels, static reduced-motion markers and zero proximity-status writes during critical warnings. Four existing phone joystick/inspection cases and all three viewport usability cases also passed. See [MISSION_POIS.md](MISSION_POIS.md).

Screenshots and traces remain under ignored `artifacts/`. Physical Android comfort, assistive-technology behavior and sustained device performance still need human testing.
