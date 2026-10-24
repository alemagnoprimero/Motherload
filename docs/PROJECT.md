# Project checkpoint — 2026-10-24

## Implemented milestone

- Phaser 3.90.0, strict TypeScript, Vite, locked npm dependencies. No server/database credentials required.
- Seeded destructible terrain with four minerals, stone, magma, and a bedrock floor.
- Keyboard driving/drilling/upward flight, gravity and fall damage; smooth visual interpolation over a deliberately simple grid simulation.
- Cargo limits, sale values, fuel, hull wear/damage, surface selling/refueling/repair.
- Drill, tank, cargo and hull upgrades with three purchasable levels each.
- Complete terrain/position/economy/inventory/condition/upgrade local saves, autosave, load, corruption protection and confirmed new-game reset.
- Pointer-based touch controls, responsive layout, pause on blur/backgrounding, explicit recovery confirmation.
- A separate Ruffle reference lab, pinned download/decompilation script, and original-build research notes.

## Implementation decisions

The original's economy and continuous mass-based physics are documented, but the prototype intentionally uses simpler values for a short first-playable loop. All balance constants are provisional. Source and artwork are newly authored. No original SWF, decompiled source, music or artwork is tracked or bundled into the production app.

The terrain model and save schema are independent of Phaser so their behavior can be tested without a browser. The renderer interpolates position and follows depth. Simulation uses bounded substeps from unsmoothed frame deltas; long background pauses do not consume an entire session of fuel. Surface docking prevents immediately falling back into a mined shaft when interacting with services.

LocalStorage is per origin and browser. Multiple simultaneously active tabs are not coordinated; last writer wins. There is no cloud sync, offline service worker, import/export, or save migration beyond schema version 1. Rendering interpolants, partial drill progress and falling momentum are transient, while the specified persistent state is serialized.

## Validation and scope

Verified in this instance: 11 simulation tests and 10 browser checks passed, strict TypeScript and production build passed, formatting passed, and the pinned reference downloaded, hash-checked, exported 523 scripts, and ran in Ruffle without page errors. Run commands and artifact locations are documented in the README. Automated simulation and Chromium browser checks cover the complete first expedition, upgrades, service gating, save/reload, corrupt saves, full cargo, fuel depletion/recovery, hard falls, magma, pause and touch input. The production build includes a bundle-size warning because Phaser contributes roughly 1.2 MB before gzip; this is a performance follow-up, not a compilation failure.

Desktop and mobile screenshots are captured under ignored `artifacts/`. Chromium touch emulation does not establish real Android performance. Ruffle execution and JPEXS export have been exercised against the identified reference file. Original wall-clock physics measurements remain future research.

A lockfile-only reinstall succeeded using the retained, integrity-checked npm cache (`npm ci --offline --no-audit`). Fresh npm registry requests currently return HTTP 403 despite the saved domain requirement; review/save the network draft before refreshing dependencies online. Cached setup and the current preview work independently of that access.

A local Git commit records this milestone; it is not automatically pushed. Do not treat a saved cloud configuration as publication or proof that a separate task restored local-only commits. Keep/publish the workspace snapshot and push the checkpoint through your normal repository workflow when ready.

## Next steps

1. Playtest the full loop on a computer and a physical Android phone; tune controls, camera, fuel pressure and early upgrade timing.
2. Replace grid movement with continuous acceleration/mass-aware flight if fidelity testing supports it; enforce original grounded side-drill rules.
3. Decide whether to adopt the confirmed original mineral roster, upgrade prices and capacities. Add balance presets only if useful.
4. Measure original drilling/fuel timings in Ruffle and compare with the static formulas. Compare publisher/free-edition hashes when XGen's TLS endpoint works.
5. Add save export/import, migrations, multi-tab conflict handling and resilient backup slots before expanding progression.
6. Profile graphics and bundle size on Android, then add sound, tactile feedback, particles and richer original art.
7. Consider larger/deeper terrain, radiator/engine upgrades, procedural caves, consumables and endgame only after the core loop feels right.
