# The Deep Frontier

A single-player 2D browser mining game in Phaser and TypeScript. Restore an asteroid lander, then travel to an ice comet to preserve volatile crystals and build its condenser. Explore depth bands, recover field logs and relics, complete optional contracts, and equip a rig that can reach deeper rewards. The repository and published address retain the original project name.

## Play

Open **https://alemagnoprimero.github.io/Motherload/** on a computer or Android phone. No installation or local server is required. Choose **Deploy rig** for a fresh expedition or **Continue expedition** for an existing save. Imported, loaded and archive-restored runs wait for **Resume expedition**.

- **Keyboard:** arrows or WASD steer, drill and fly. Up provides thrust; Down drills. Side drilling needs a ledge or an equipped shaft brace against a wall. A committed cut finishes before ascent.
- **Touch:** press the playfield to place a floating joystick, then drag from its center. Up flies, Down drills, and either side steers. Return to center for neutral input or lift to release. The center stays fixed while the rig and camera move; each new touch places a new center.
- **Mouse:** press the playfield toward a direction relative to the rig to steer immediately. Clicks on inspectable minerals or the nearby lander use that object's action.
- **Pause:** Escape / P or the on-screen pause button. Fixed direction buttons are an optional fallback under **Pilot controls**. Space deploys an equipped shaft brace; Tab opens navigation after M2. Primary/secondary keyboard bindings and controller mappings can be changed in Controls.
- **Controller menus:** D-pad selects controls, A activates, B returns. Holding an interaction button does not repeatedly open/close the terminal.

Momentum and committed cuts can continue after release. Browser modifier shortcuts and focused toolbar/form keys do not become pilot commands. Click the playfield to return keyboard focus to the rig. Sound starts after Deploy/Continue; mute and the effects, ambience and music levels are remembered. Alarms, haptics, reduced motion and shake have separate settings.

## Your first expedition

1. Drill the starter vein, collect packages and survey the wreck beacon at **100 m**. The mission locator gives its bearing, distance and proximity; approach the wreck's survey mast to complete the survey.
2. Fly back through your shaft and follow the lander marker. Park in its illuminated bay, then press **E / Enter**, click/tap the lander or use **Dock**.
3. **Unload & sell** banks mission cargo and sells ordinary packages. **Bank without sale** stores packages safely. Refuel, repair and compare upgrades in the terminal. Services preview total cost and resulting condition, including partial fills.
4. Fund M1 for **200 CR**, then follow **seam B** for the second haul. The **600 CR expedition tank** is the opening upgrade. The guide continues through the pressure valve at **250 m**, antenna at **400 m**, and navigation core at **600 m**; Construction shows each stage's requirements and fee.
5. Rank-1 hardware opens after M1. In new worlds, the fused plate at **310–320 m** requires a rank-1 drill. A **250 CR shaft brace** enables cuts from a wall without a ledge; the cargo rack increases capacity by 30%, rounded up, without a brace prerequisite. Equipment shows current → next benefits and missing credits. Energy/hull purchases fill the new capacity.
6. Restore the lander and launch. Open **Navigation** at the lander and travel to **W02 Ice comet**. W01 and W02 are playable; Fractured moon and Iron planet remain in development.

The two opening veins retain their 380/480 CR gross rewards. Deeper new W01 bands contain more valuable minerals, with a named relic in the deepest third. Construction and services come out of your balance. A full hold leaves recoverable packages in the world; **Pause → Cargo manifest** allows ejection without duplicating package identities. Heavy cargo slows climbing, making engine upgrades useful.

Low energy and critical hull warnings persist ahead of routine pickups. Disabled rigs have **Request recovery**, also available beside Resume in Pause. Recovery previews the fee, cargo consequences and resulting conditions before confirmation, then returns paused. It raises energy/hull to at least 50%, preserving healthier conditions. If already at the lander, **Lander services** remains available to repair/refuel normally.

A new expedition starts with a full tank. The first emergency tow in each world is **free and keeps cargo and mission items** when the rig is disabled or lacks the estimated energy to return. Voluntary recovery and later tows use the normal fee and cargo-loss rules. The HUD shows return energy, a home notch and increasingly urgent margin states. Shaft alignment assists entry and ascent; the terminal prompts before undocking with less than half a tank.

Both implemented worlds wrap horizontally. Wall-occluded discovery keeps unexplored ore hidden. Known minerals have distinct shape markers explained by the pause menu's ore/hazard legend. The claim map shows surveyed terrain only and saves your waypoints. Discovered sites hold field logs and tool-sealed caches; optional contracts and chapter records remain available after the main milestones.

Mission sites have recognizable wreckage: a survey mast, pressure assembly, communications dish and navigation capsule. Follow the current objective's signal, then excavate the marked debris and approach the exposed part to recover it. Nearby signals gain a world marker and approach alert. The locator points back to the lander when cargo needs banking; surveyed and recovered sites leave wreckage behind. Signals do not expose undiscovered minerals.

## Your comet expedition

Travel previews and banks carried cargo before departure. Your credits, equipment and both excavated worlds persist; arrival waits in the destination's terminal. Conditions carry over, so service the rig before leaving when needed. Navigation also returns you to the asteroid.

Bank five thermal samples at **150 m**, three intact cryosilicates from **450 m**, then the catalyst at **1000 m**. The HUD tracks each goal and its construction fee. New comet worlds give the first three volatile cuts a **1.5-second training window**, then use **0.75 seconds**: release drilling to preserve the package. Lift the joystick or return to neutral; keyboard toggle users can press Down again or use **Release drill**. Pause freezes the window.

The thermal auger cuts ice faster. The steam reserve banks a portion of spent drilling energy for an emergency, and the preservation chamber adds a Precision hold action (**Q** by default). Rank-2 hardware becomes available on the comet. New comet worlds use bulk 1 for common minerals; existing worlds preserve their stored package bulk and value. See [versioned balance and migration rules](docs/BALANCE_VERSIONS.md).

## Saving

Autosave runs every five active seconds and after transactions. **Save checkpoint** records the current expedition; **Load latest autosave** uses the latest browser checkpoint, which autosave can replace after a manual Save. Restored runs wait for Resume. Status reports actual successful saves and their recency in this browser.

**Export campaign** retains a separate JSON file and enables manual device transfer. Import and backup restoration require confirmation. IndexedDB checkpoints include excavation/discovery, package identities, money, equipment, conditions and missions, with atomic backups and stale-tab protection. Background saving is best effort; use Save/Export before closing after an important discovery. Browser saves do not synchronize automatically.

Starting a new campaign from the title keeps the previous valid saved campaign in **Pause → Save data → Campaign archives**, independently of the rotating autosave backup. The three newest valid archives are retained. Restore previews the expedition and returns paused; replacing a different current expedition archives it in the same transaction. Replacement/import/restore decisions support a deliberate hold, or two activations with a keyboard, controller or screen reader.

Old bookmarked mode URLs now open this same campaign. Retired browser save bytes are neither converted nor deleted; imports accept campaign checkpoints only.

## Run locally

Requires Node.js 22.18+ and npm; Node 24 LTS is recommended. Run from the folder containing `package.json`, not `C:\Windows\System32`:

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Open `http://localhost:5173` and leave the terminal running. A phone on the same Wi-Fi can use `http://YOUR-PC-IP:5173`, subject to the host firewall. The public website works away from that network.

Build with `npm run build`; preview production with `npm run preview -- --port 4173`. Static `dist/` works at a domain root or GitHub Pages' `/Motherload/` path.

## Docker

```sh
docker compose up -d --build
```

Open `http://localhost:8080`. The container runs in the background and restarts with Docker unless stopped. Repeat the command after updates. `docker compose logs --tail=50` shows diagnostics; `docker compose down` stops it. Set `MOTHERLOAD_PORT` to change the port. GitHub Pages provides the durable public address.

The image builds with Node 24 and serves production files using unprivileged Nginx, a health check and a read-only runtime filesystem. Research SWFs and authoring tools stay outside production. Behind an HTTPS proxy, pass its trusted CA as the optional BuildKit secret `--secret id=proxy_ca,src=/path/to/ca.pem`; TLS verification stays enabled and the CA is not copied into the runtime image.

## Validate and author assets

```sh
npm test
npm run format:check
npm run build
npm run test:browser       # campaign preview on port 5173
npm run test:usability     # responsive HUD, safety, restore and input
npm run test:poi           # mission landmarks, proximity and recovery guidance
npm run test:frontier      # travel, comet extraction and stage progression
npm run test:opening       # native model opening / emergency tow / shaft entry
npm run test:improvements  # Phase 0 browser and pixel measurements (Pillow)
npm run test:pacing        # calibrated simulation and a bounded seed subset
npm run test:pacing:nightly # full pacing distribution
npm run test:feel          # Canvas, display bounds and input/feedback checks
npm run test:audio         # offline rendering of the production audio graph
npm run test:plan-ui       # terminal sizing, transaction focus and deliberate confirmations
npm run test:render        # hidden-terrain privacy, renderer parity and draw diagnostics
npm run test:render:memory # maximum-quality desktop/phone texture budgets
npm run test:production    # compiled game, defaults to port 8080
npm run test:campaign:storage
```

Browser checks use `/usr/bin/chromium`; override with `CHROMIUM_PATH`. `PREVIEW_URL` selects another preview. Screenshots go to ignored `artifacts/`. Browser emulation establishes layout/events, not physical Android comfort or sustained GPU performance.

The pacing command retains strict income, duration and purchase-gap targets, including unmet targets. Read its per-policy report before treating an exit failure as an unreachable world; the planner and native return checks cover different evidence. Current outcomes are recorded in [implementation progress](docs/IMPROVEMENT_PROGRESS.md).

Normal builds validate committed campaign artwork. `npm run campaign:assets` regenerates it from editable SVGs and needs the tools in [CAMPAIGN_ASSETS.md](docs/CAMPAIGN_ASSETS.md).

See [current rules and limits](docs/CAMPAIGN_W01.md), [project status](docs/PROJECT.md), the [improvement plan](docs/IMPROVEMENT_PLAN.md) and [implementation progress](docs/IMPROVEMENT_PROGRESS.md). The [campaign roadmap](docs/DESIGN_PACK_IMPLEMENTATION.md) still records the later destinations. Original Flash research remains separate under `reference/`; see [RESEARCH.md](docs/RESEARCH.md).
