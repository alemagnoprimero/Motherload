# Project status — 2026-10-28

## Current milestone

The planned first-expedition milestone now includes reference-calibrated movement, caves and route planning, original art and sound, mobile gameplay layout, reference economy/equipment, and resilient local saves.

- Continuous movement, simultaneous thrust/steering, supported lateral drilling, committed cuts and collision-safe ledge alignment. Returning to an earlier ore shelf remains drillable with a full bay; excess ore is discarded with a warning, matching the original collection rule.
- New seeded 24 × 600 destructible worlds with six geological regions, progressively scarcer and richer deposits, more resistant rock and stronger magma. Old 100-row worlds remain intact. New expeditions choose a new seed; saves preserve their exact excavated map.
- Local, wall-occluded discovery with remembered explored terrain. Hidden caverns and minerals are indistinguishable from unexplored ground, including through the inspector. A compact frontier goal and first-crossing notices mark progress without exposing mineral locations.
- Fuel in liters, weighted cargo, selling/refueling/repair, and drill/engine/tank/cargo/hull upgrade paths using the verified free-edition tables.
- Original Blender-authored vehicle, building and mineral models, rendered into a browser atlas through a Node.js asset pipeline. Larger world art, textured strata, atmospheric depth, vehicle lighting, animated tools, collection/damage feedback and synthesized sound.
- An immersive canvas fills the desktop/phone viewport. A single pause menu contains vehicle conditions, progression, saving, settings, fullscreen and help. Touch controls overlay the playfield; brief warnings flag low resources. Each surface building retains an interface rendered inside the game, with proximity-gated keyboard and touch transactions.
- Horizontal wrapping covers motion, collision, drilling, exploration and continuous camera travel. Terrain and surface buildings repeat around the same circumference; deposits do not regenerate when crossed.
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
| World | New maps use 24 × 600 cells instead of 36 × 600. Six original depth bands control mineral weights, stone and magma. Caverns become less frequent in deeper strata. Old 100-row maps remain unchanged. |
| Discovery | Nearby air and exposed wall faces are revealed within 4.5 cells; solid rock blocks sight. Previously seen terrain stays remembered and saved. This is an explicit remake exploration rule, not a confirmed original SWF behavior. |
| Early progression | Two assisted starter veins make two ordinary return trips sufficient for a $750 upgrade. Each generated world retains at least one of every mineral at an appropriate depth. |
| Movement | Continuous bounded substeps calibrated from a 42 fps reference; launch/landing animation timing and collision shape are not exact Flash equivalents. |
| Heavy cargo | A minimum lift reserve keeps every valid load flyable. Engine upgrades affect acceleration, thrust, speed limits and fuel use; the reserve is a forgiving departure from the original. |
| Drill time | Approximate 1.0 s down / 0.75 s side baseline, row-based depth multiplier and original drill ratios. Stone remains drillable with added resistance. |
| Fuel | Source per-frame values converted using nominal 42 fps: about 0.063 L/s recurring use, 0.126 L/s per movement axis and 0.252 L/s additional drilling use, scaled by engine power. Real-time fuel parity has not been established. Docked idle does not consume fuel. |
| Damage and recovery | Magma damage rises from three to twelve HP across deeper strata; impact damage uses a tuned threshold/coefficient. Recovery loses cargo and 20% of credits and restores half fuel/hull. |
| Surface | Drive to the matching building's bay, then press E / Enter or tap to enter its canvas interface. The original automatically enters its shop frames at specific ground tiles; explicit entry avoids opening a shop while merely passing it. Docking prevents falling down a shaft while using services. |
| Saving | Full excavated terrain and position persist, as requested, although the original's inspected save routine does not preserve them. |
| Visual rendering | Actual 3D meshes are authored offline; the crawler and buildings use level orthographic renders aligned with the flat 2D terrain. Node.js runs the asset tooling; the published game remains static browser content. |
| Horizontal topology | A periodic 24-column mine replaces hard left/right edges. Canonical saved positions preserve the existing terrain and schema; views may show repeated copies of the same buildings and cells. |

The deeper world, discovery, reward distribution and equipment feasibility are described in [PROGRESSION.md](PROGRESSION.md), including aggregate results across 40 seeds and input-driven excursion checks. [ECONOMY.md](ECONOMY.md) records all economic tables, formulas, purchase comparisons and source tuning controls. Complete human campaign pacing remains a playtest target; original prices alone do not establish original pacing.

## Save behavior and compatibility

The storage key remains `motherload.frontier.v1`; its payload is now schema 4 with a validated 0/1 discovery mask. Schema-1/schema-2/schema-3 imports preserve their entire 100-row terrain, money, inventory, position and expedition statistics. Schema-3 equipment and condition stay unchanged. Earlier equipment maps to a tier that preserves capability, and fuel/hull keep their percentages of capacity. For example, an old eight-slot bay maps to an adequate new bay rather than dropping its eighth mineral.

Existing worlds are not regenerated or expanded during migration. Their old deposits are retained under the stable mineral tile IDs; only discovery around the current vehicle is initialized because older saves did not record sight history. Schema-4 supports both 100-row and 600-row worlds. Use New expedition to enter the deeper world; export first to keep a separate copy of an old run. A fully explored 600-row export remains below the shared 256 KiB import limit, including the normal human-readable formatting.

SaveStore validates every snapshot and import. Ordinary saves rotate the previous valid primary into a backup before replacing it. Backup restoration uses a recovery journal so either a primary-write or backup-rotation failure leaves the preceding and requested expeditions recoverable. Corrupt/future saves are kept intact; a valid backup may be reviewed in memory while saving is blocked until an explicit restore or replacement. Import/New/Restore require confirmation.

On HTTPS/localhost, Web Locks serialize writes, and each write checks its last-loaded raw value to reject stale tabs. A conflicting tab pauses and cannot resume until it loads the newer save or explicitly replaces it. A raw-value check remains on browsers without Web Locks, but it is not a fully atomic cross-tab transaction there. Explicit confirmed replacement intentionally backs up the latest valid primary.

Autosave runs every five active seconds. Visibility/page-exit saving is best effort because browsers may suspend asynchronous work; Save is the reliable user-visible checkpoint. Velocity, partial cuts and animation state are transient. Local saves do not synchronize automatically across devices; export/import provides manual transfer. If browser storage is inaccessible, the current in-memory expedition can still be played and exported.

## Validation

At this checkpoint, **122 simulation/storage/layout tests and 23 browser scenarios pass**. TypeScript, formatting, generated-asset validation and production builds pass. The rebuilt Docker service is healthy and passes the four focused immersive/wrapping scenarios against the production bundle. The browser regression also covers hidden terrain/inspection, discovery/deep-world saves, gameplay, import, services, upgrades and portrait/landscape touch layout.

Simulation and storage regressions cover the complete progression loop, movement/ledge/impact behavior, all minerals and equipment, fuel, cave generation, save compatibility, corrupt data, quota failures, concurrent writers, repeated purchases during pending saves, and interrupted backup restoration. Current progression tests also cover sight occlusion, exact discovery persistence, old/new world boundaries, portable large saves, 40-seed scarcity/value curves, stronger magma and actual shallow/deep equipment excursions. Earlier checkpoint explorations validated 18,000 save snapshots across 30 seeded movement runs, all minerals across 100 generated worlds, and 2,048 combinations of legacy equipment and condition values.

Station layout checks cover nine canvas sizes, including short landscape and narrow portrait windows. Navigation, purchase and exit targets must stay inside the canvas, retain usable touch dimensions and never overlap. The canvas fills the viewport in play and menu modes; driving controls hide during menus and building interactions. Station entry prompts reserve space above touch controls.

Browser scenarios cover natural mining and physical travel to the exchange, a complete descent/return/landing/Down-only cut on an earlier ore shelf with a full bay, canvas service menus, correct building access, service and upgrade persistence, export/import including cancellation and invalid files, backups and corrupt-primary recovery, legacy migration, actual two-tab conflicts, committed cuts, independent touch release/cancellation, pause clearing held input, portrait/landscape pause-menu status, fullscreen and sound preferences. Asset checks require the actual PNG/JSON atlas to load and contain every expected rig, building and mineral frame; fallback artwork cannot pass. Station checks include opening without buying, rapid purchase input during a pending save, touch navigation and closing, and in-memory trade/export while a damaged primary save remains protected. Synthesized audio was also checked with Chromium audio analysers for active output and silence during mute/backgrounding.

Four immersive/wrapping scenarios check viewport-filling play, a single menu and paused simulation, opposite-edge ore rendering/inspection, native seam drilling and flight with save/reload, and physical station access after wrapping. Twelve model regressions cover repeated laps, airborne steering, wrapped collision and cuts, sight/occlusion, and canonical saves.

Four discovery browser scenarios compare actual pixels for hidden ore versus hidden soil and caves, check the inspector cannot reveal them, verify positive mineral rendering/inspection after native drilling, preserve discovered terrain through retreat/export/reload, and exercise mining/flight below the old 100-row boundary. HUD checks cover first-frontier goals, legacy floor limits and in-game notices that do not replay on reload.

The art specimen and desktop/mobile screenshots are under ignored `artifacts/`. Browser emulation establishes layout and event behavior, not physical Android GPU performance or tactile feel. Production JavaScript remains around 1.27 MB before gzip (about 346 kB compressed), plus a roughly 656 KiB lossless atlas and small frame metadata; exact build output is reported by `npm run build`. The 5.2 MB editable GLB collection stays out of the playable download.

## Development and delivery

See README.md for launch, Docker, testing and save-transfer instructions. The dev preview uses port 5173, Docker uses 8080, and Pages deploys only `dist/` after tests/build succeed for gameplay changes on `main`. The original reference lab stays separate from production.

Normal builds validate the committed PNG/JSON atlas and hash both files into the production output. Editable GLB models and their original generators are tracked separately. Regenerating art requires Blender/Pillow; ordinary browser builds and hosting do not. See ASSET_PIPELINE.md for authoring commands.

Cloud Docker builds use the existing environment proxy and its trusted CA through a temporary BuildKit secret. TLS verification remains enabled. Live HTTPS browser verification may require the same already-trusted proxy CA in Chromium's trust store. These cloud-specific steps are unnecessary on a normal Docker Desktop installation with registry access.

## Remaining work after this milestone

- Physical Android playtesting, especially thumb comfort, small-screen legibility, interruptions and sustained performance.
- Controlled original loaded-versus-empty flight comparisons, deeper/upgraded drilling timings and fuel calibration. Preserve observed/source-confirmed versus provisional distinctions.
- Longer human progression playtests, temperature/radiator systems, consumables, artifacts, story and endgame encounters. The 600-row exploration and depth-progression foundation is implemented; these additional campaign systems remain follow-on work.
- Optional offline installation, cloud synchronization and broader accessibility work after gameplay feedback. No account or server is currently needed.
- Repository licensing remains a project-owner decision.
