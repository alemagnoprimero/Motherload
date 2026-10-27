# Project status — 2026-10-26

## Current milestone

The planned first-expedition milestone now includes reference-calibrated movement, caves and route planning, original art and sound, mobile gameplay layout, reference economy/equipment, and resilient local saves.

- Continuous movement, simultaneous thrust/steering, supported lateral drilling, committed cuts and collision-safe ledge alignment. Returning to an earlier ore shelf remains drillable with a full bay; excess ore is discarded with a warning, matching the original collection rule.
- Seeded 24 × 100 destructible world with natural cave pockets, intermediate ledges, stone, magma, bedrock and all ten minerals. New expeditions choose a new seed; saves preserve their exact excavated map.
- Fuel in liters, weighted cargo, selling/refueling/repair, and drill/engine/tank/cargo/hull upgrade paths using the verified free-edition tables.
- Original Blender-authored vehicle, building and mineral models, rendered into a browser atlas through a Node.js asset pipeline. Larger world art, textured strata, atmospheric depth, vehicle lighting, animated tools, collection/damage feedback and synthesized sound.
- A game-first desktop and phone layout: compact mission instruments, vital indicators, canvas and simultaneous touch controls fit the viewport. Each surface building has its own interface rendered inside the game, with proximity-gated keyboard and touch transactions. Building interfaces and Tools pause the expedition. Focus/fullscreen mode is available.
- Complete local saves, schema migration, file export/import, validated backup restoration, quota/error protection and cross-tab conflict handling.
- Docker background hosting and automatic GitHub Pages deployment. Public address: https://alemagnoprimero.github.io/Motherload/ .

Source remains independent TypeScript/Phaser code. No original SWF, decompiled scripts, artwork or audio is tracked or included in production.

## Confirmed reference behavior and deliberate remake choices

The verified research build is free Miniclip version `0.934 (MC)`. JPEXS inspection, unchanged-SWF play and separately instrumented Ruffle measurements are recorded in RESEARCH.md and MOVEMENT_REFERENCE.md. Publisher-hosted byte equality with the 2004 release remains unverified.

Adopted static reference facts include the ten mineral names/values/masses, starting $20 / 6 L / 10 HP / seven cargo slots, equipment prices and capacities, engine power, drill-speed ratios, $1/L fuel and $15/HP repair. Ordinary drilling no longer applies blanket hull wear. Up cannot begin an upward cut; side drilling requires local ground support. A started cut finishes before held Up launches the rig.

Full cargo no longer prevents excavation of ore. Like the original's inspected `doneDigging` routine, the tile clears even when its mineral cannot fit in the bay; the extra mineral is discarded. This fixes the reproduced Down-only failure after returning from deeper dirt to an upper ore shelf. Down takes priority over horizontal drilling when both directions are held, while steering remains available in the air.

These parts remain deliberate approximations or usability choices:

| Area | Current choice |
| --- | --- |
| World | 24 × 100 cells instead of 36 × 600; richer deposits move into compressed depth bands. Approximately a quarter of underground space forms connected pockets rather than copying the original's random empty-cell layout. |
| Early progression | Two assisted starter veins make two ordinary return trips sufficient for a $750 upgrade. Each generated world retains at least one of every mineral at an appropriate depth. |
| Movement | Continuous bounded substeps calibrated from a 42 fps reference; launch/landing animation timing and collision shape are not exact Flash equivalents. |
| Heavy cargo | A minimum lift reserve keeps every valid load flyable. Engine upgrades affect acceleration, thrust, speed limits and fuel use; the reserve is a forgiving departure from the original. |
| Drill time | Approximate 1.0 s down / 0.75 s side baseline, row-based depth multiplier and original drill ratios. Stone remains drillable with added resistance. |
| Fuel | Source per-frame values converted using nominal 42 fps: about 0.063 L/s recurring use, 0.126 L/s per movement axis and 0.252 L/s additional drilling use, scaled by engine power. Real-time fuel parity has not been established. Docked idle does not consume fuel. |
| Damage and recovery | Magma costs three HP; impact damage uses a tuned threshold/coefficient. Recovery loses cargo and 20% of credits and restores half fuel/hull. |
| Surface | Drive to the matching building's bay, then press E / Enter or tap to enter its canvas interface. The original automatically enters its shop frames at specific ground tiles; explicit entry avoids opening a shop while merely passing it. Docking prevents falling down a shaft while using services. |
| Saving | Full excavated terrain and position persist, as requested, although the original's inspected save routine does not preserve them. |
| Visual rendering | Actual 3D meshes are authored and rendered offline, then displayed in the existing 2D simulation. There is no real-time 3D physics or camera migration. Node.js runs the asset tooling; the published game remains static browser content. |

The finite, compressed mine and assisted opening are intended for this playable milestone. Long-run progression balance remains a playtest target; original prices alone do not establish original pacing.

## Save behavior and compatibility

The storage key remains `motherload.frontier.v1`; its payload is now schema 3. Schema-1/schema-2 imports preserve all terrain, money, inventory, position and expedition statistics. Equipment maps to a new tier that preserves its previous capability. Fuel and hull keep their percentages of capacity. For example, an old eight-slot bay maps to an adequate new bay rather than dropping its eighth mineral.

Existing worlds are not regenerated during migration. Their old deposits are retained under the stable mineral tile IDs. Use New expedition to see the new cave/deposit generator; export first to keep a separate copy of an old run.

SaveStore validates every snapshot and import. Ordinary saves rotate the previous valid primary into a backup before replacing it. Backup restoration uses a recovery journal so either a primary-write or backup-rotation failure leaves the preceding and requested expeditions recoverable. Corrupt/future saves are kept intact; a valid backup may be reviewed in memory while saving is blocked until an explicit restore or replacement. Import/New/Restore require confirmation.

On HTTPS/localhost, Web Locks serialize writes, and each write checks its last-loaded raw value to reject stale tabs. A conflicting tab pauses and cannot resume until it loads the newer save or explicitly replaces it. A raw-value check remains on browsers without Web Locks, but it is not a fully atomic cross-tab transaction there. Explicit confirmed replacement intentionally backs up the latest valid primary.

Autosave runs every five active seconds. Visibility/page-exit saving is best effort because browsers may suspend asynchronous work; Save is the reliable user-visible checkpoint. Velocity, partial cuts and animation state are transient. Local saves do not synchronize automatically across devices; export/import provides manual transfer. If browser storage is inaccessible, the current in-memory expedition can still be played and exported.

## Validation

At this checkpoint, **95 simulation/storage/layout tests and 15 browser scenarios pass**. TypeScript, formatting, generated-asset validation and production builds pass. The rebuilt Docker service is healthy and passes the production smoke checks for gameplay, import, services, upgrades, save/reload and portrait/landscape touch layout.

Simulation and storage regressions cover the complete progression loop, movement/ledge/impact behavior, all minerals and equipment, fuel, cave generation, save compatibility, corrupt data, quota failures, concurrent writers, repeated purchases during pending saves, and interrupted backup restoration. Additional explorations validated 18,000 save snapshots across 30 seeded movement runs, all minerals across 100 generated worlds, and 2,048 combinations of legacy equipment and condition values.

Station layout checks cover nine canvas sizes, including short landscape and narrow portrait windows. Navigation, purchase and exit targets must stay inside the canvas, retain usable touch dimensions and never overlap. Canvas resizing follows the available playfield when the building interface replaces phone driving controls.

Browser scenarios cover natural mining and physical travel to the exchange, a complete descent/return/landing/Down-only cut on an earlier ore shelf with a full bay, canvas service menus, correct building access, service and upgrade persistence, export/import including cancellation and invalid files, backups and corrupt-primary recovery, legacy migration, actual two-tab conflicts, committed cuts, independent touch release/cancellation, pause clearing held input, visible portrait/landscape HUD, focus mode and sound preferences. Asset checks require the actual PNG/JSON atlas to load and contain every expected rig, building and mineral frame; fallback artwork cannot pass. Station checks include opening without buying, rapid purchase input during a pending save, touch navigation and closing, and in-memory trade/export while a damaged primary save remains protected. Synthesized audio was also checked with Chromium audio analysers for active output and silence during mute/backgrounding.

The art specimen and desktop/mobile screenshots are under ignored `artifacts/`. Browser emulation establishes layout and event behavior, not physical Android GPU performance or tactile feel. Production JavaScript remains around 1.26 MB before gzip (about 343 KiB compressed), plus a roughly 721 KiB lossless atlas and small frame metadata; exact build output is reported by `npm run build`. The 5.2 MB editable GLB collection stays out of the playable download.

## Development and delivery

See README.md for launch, Docker, testing and save-transfer instructions. The dev preview uses port 5173, Docker uses 8080, and Pages deploys only `dist/` after tests/build succeed for gameplay changes on `main`. The original reference lab stays separate from production.

Normal builds validate the committed PNG/JSON atlas and hash both files into the production output. Editable GLB models and their original generators are tracked separately. Regenerating art requires Blender/Pillow; ordinary browser builds and hosting do not. See ASSET_PIPELINE.md for authoring commands.

Cloud Docker builds use the existing environment proxy and its trusted CA through a temporary BuildKit secret. TLS verification remains enabled. Live HTTPS browser verification may require the same already-trusted proxy CA in Chromium's trust store. These cloud-specific steps are unnecessary on a normal Docker Desktop installation with registry access.

## Remaining work after this milestone

- Physical Android playtesting, especially thumb comfort, small-screen legibility, interruptions and sustained performance.
- Controlled original loaded-versus-empty flight comparisons, deeper/upgraded drilling timings and fuel calibration. Preserve observed/source-confirmed versus provisional distinctions.
- Larger/deeper campaign progression, temperature/radiator systems, consumables, artifacts, story and endgame encounters. These were follow-on campaign systems, not part of the first-expedition milestone.
- Optional offline installation, cloud synchronization and broader accessibility work after gameplay feedback. No account or server is currently needed.
- Repository licensing remains a project-owner decision.
