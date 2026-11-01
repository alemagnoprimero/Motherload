# Motherload · The deep frontier

A single-player browser mining game in Phaser and TypeScript, inspired by Motherload's free edition. The new campaign begins on W01, a broken asteroid with a lander to rebuild, persistent equipment and original illustrated 2D artwork. Legacy mode preserves the earlier single-mine game and its saves.

## Play

Open **https://alemagnoprimero.github.io/Motherload/** on a computer or Android phone. No installation or local server is required. Gameplay changes pushed to `main` are tested, built and deployed automatically.

### Campaign: Broken asteroid

Open **https://alemagnoprimero.github.io/Motherload/?mode=campaign** and choose **Start expedition**. Existing Legacy players can also choose **Menu → Open the new campaign**. The campaign uses a separate save and never converts an existing mine.

1. Hold **Down / S** to mine the starter vein. Hold **Up / W** to fly back; steer with **Left/Right or A/D**. A committed cut finishes before ascent. Side drilling needs a local ledge.
2. The HUD tracks energy, hull, cargo bulk, haul value, credits and the current objective. Survey the beacon at **100 m**, then follow the surface lander marker. Park in its illuminated bay and press **E / Enter** or tap **Dock and trade**.
3. **Unload and sell** banks the haul and sells its ordinary packages. **Store haul** keeps packages safely without selling. Refuel, repair, compare hardware and equip owned attachments inside the dock interface.
4. Fund each construction stage after banking its objective discoveries: beacon/three ore packages, valve at **250 m** plus antenna at **400 m**, then navigation core at **600 m**. The lander changes visibly as it is rebuilt.
5. Rank-1 hardware opens after M1. Anchoring feet cost **400 CR** and deploy while holding **Space**; the **900 CR** cargo rack opens after M2 and requires ownership of the feet. Tank/hull purchases fill their new capacity.
6. Restore the lander and launch to record the Frontier departure. **W01 is the playable campaign chapter in this checkpoint.** The comet and fractured moon are charted as the next chapter and are not yet playable.

The two opening veins retain their 380/480 CR gross rewards. Construction and services come out of that balance; an affordable hull/engine/energy purchase is the early target. A full hold leaves a recoverable package in the world. **Menu → Carried cargo** allows ejection rather than silently destroying extra ore.

**Escape / P** opens pause/settings, checkpoint transfer, recovery and keyboard remapping. **Tab** opens the star map after M2. Touch controls support independent simultaneous holds. Sound starts muted; separate effects, ambience and music settings are available. Controller defaults are shown in Menu; controller remapping/menu navigation and physical-device validation remain follow-up work.

Campaign autosaves run every five active seconds and after transactions. **Menu → Save checkpoint / Export campaign** provides an explicit checkpoint or portable JSON file. IndexedDB stores the campaign separately from Legacy localStorage, with atomic backups and stale-tab protection. Pausing, backgrounding and dock interfaces freeze the simulation. Browser saves do not synchronize between devices automatically.

See [the W01 implementation notes](docs/CAMPAIGN_W01.md), [the approved rollout plan](docs/DESIGN_PACK_IMPLEMENTATION.md), and [campaign artwork](docs/CAMPAIGN_ASSETS.md).

### Legacy mine

Open **https://alemagnoprimero.github.io/Motherload/?mode=legacy**. The default address continues opening Legacy mode when that browser already has a Legacy save. Its ten minerals, original rendered artwork, economy, controls and save format are preserved.

Existing expeditions retain their excavated maps and receive the new discovery system. **New expeditions** use a 600-row mine, reaching roughly 6,000 metres through six geological regions. To explore that deeper world and its revised mineral distribution, choose **Menu → New expedition**. Export your existing expedition first if you want to keep a separate copy; starting over requires confirmation.

### Legacy controls and first expeditions

1. Hold **Down / S** to drill the starter vein below the rig. The stock bay holds seven minerals. The neighboring vein to the right provides a second early expedition. A full bay does **not** block excavation: additional ore is discarded, so sell your load before collecting more valuables.
2. Hold **Up / W** to return through your shaft. Combine Up with **Left/Right or A/D** to steer. Counter-steer to brake momentum. Side drilling requires a ledge under the rig, at any depth; you cannot drill upward.
3. A started cut completes even after releasing its direction. Hold Up during the cut to lift off immediately afterward.
4. Return to the surface and drive to a building's illuminated bay. Press **E / Enter**, or tap the nearby building or its on-screen prompt, to open its interface **inside the game**. The **Exchange** buys your haul, **Fuel** refills your tank, **Repair** restores hull, and **Upgrades** sells equipment. You must visit the correct building. Two starter expeditions normally fund the first $750 upgrade.
5. Explore to find your next route. The lamp reveals nearby tunnels and the first solid wall face; ore and caverns behind rock stay unknown. Discovered terrain is remembered and saved. Your pause menu tracks the next depth milestone.
6. Deeper layers contain fewer deposits but more valuable minerals, harder rock and stronger magma hazards. Drill and tank upgrades extend expeditions; cargo upgrades improve each return; engines lift heavy loads; hull upgrades increase the margin for mistakes. Ordinary drilling does not damage the hull.

The game fills the browser window. **Menu / Escape / P** opens the single pause interface for fuel, hull, cargo, credits, depth, equipment, saving, sound, fullscreen and help. Closing the menu returns to the mine. Phones have separate left/right and down/up controls over the playfield; hold two with different fingers to steer in flight. Tap illuminated terrain to identify it; unexplored ground does not reveal its contents.

The world wraps horizontally: crossing either side continues into the opposite side at the same depth. The same terrain, excavations and discoveries repeat around the 24-column circumference, so returning around the world never resets deposits. Motion, drilling, visibility, buildings and the camera all cross the seam. Vertical depth remains finite.

You can return to any supported ledge and drill down again, regardless of your deepest point. Down selects the floor while you hold a horizontal direction to align; horizontal steering still works while airborne.

Inside a building, use **arrows / Tab** to select equipment and **Enter** to buy, or tap the canvas controls. Upgrade cards show the actual capacity or performance change. **Escape** or the in-game close button returns to the mine. The rig stays parked while you use a building.

The pause menu and building interfaces suspend the expedition; leaving the browser clears held controls. Enable **♪ On** and adjust volume inside Menu. Sound starts muted on each visit. Brief warnings announce low resources; detailed vehicle conditions are in Menu.

**Menu → Request recovery** returns the rig to the surface with half its fuel and hull, at the cost of cargo and 20% of credits. It remains available without money and requires confirmation.

### Legacy saves and transfer between devices

**Save** records terrain, discoveries, position, money, inventory, vehicle condition and upgrades. Autosave runs every five active seconds; background/exit saves are best effort, so use Save before closing after an important purchase or discovery. Loading resets transient velocity and unfinished cut animation, not completed excavation.

- **Menu → Export save** downloads a validated JSON file. **Import save** previews the expedition and asks before replacing current progress.
- The previous valid saved expedition becomes a backup. **Restore backup** asks before replacing the primary save.
- Older schema-1/schema-2/schema-3 saves migrate to schema 4, preserving their 100-row terrain, cash, inventory and position. Schema-3 equipment and condition are unchanged; earlier equipment retains its capability and fuel/hull percentages. Old saves begin discovery around the vehicle because their previous viewing history was not recorded; natural caves are not automatically revealed.
- A damaged or unsupported primary save is kept intact. A valid backup can be loaded for review; autosave stays blocked until an explicit restoration or replacement.
- If another tab changes the expedition, this tab pauses and offers **Load newer save**. HTTPS/localhost uses Web Locks to serialize writes; older/insecure browsers also check for changed save data before writing.

Saves belong to the current browser and address. Export/import transfers them manually between devices or between localhost and the hosted site; there is no account or cloud synchronization. Clearing site data can remove local saves and backups.

## Run locally

Requires Node.js 22.18+ and npm; Node 24 LTS is recommended. Run these commands **from the project folder containing `package.json`**, not from `C:\Windows\System32`:

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Open `http://localhost:5173`. Keep the terminal running. A phone on the same Wi-Fi can use `http://YOUR-PC-IP:5173`, provided the host firewall permits it. The public website above works away from that network.

Build: `npm run build`. Local production preview: `npm run preview -- --port 4173`. The static `dist/` output works at a domain root or GitHub Pages' `/Motherload/` path.

## Docker

With Docker Desktop or a Docker server running, execute from the project folder:

```sh
docker compose up -d --build
```

Open `http://localhost:8080`. The container runs in the background and restarts with Docker unless explicitly stopped. Your computer must remain on for its local container to be reachable. Run the same command after updating source. Use `docker compose logs --tail=50` for diagnostics and `docker compose down` to stop it. Set `MOTHERLOAD_PORT` to change the host port.

The image builds with Node 24 and serves only production output using unprivileged Nginx, with a health check and read-only runtime filesystem. Research SWFs, exported scripts and original assets are excluded. The cloud workspace container is a development host; GitHub Pages supplies the durable public URL.

Behind an HTTPS proxy, pass its trusted CA as the optional BuildKit secret `--secret id=proxy_ca,src=/path/to/ca.pem`. The Dockerfile retains TLS verification and does not place that CA in the runtime image. Ordinary Docker Desktop installations do not need this environment-specific option.

## Validate

```sh
npm test
npm run build
npm run format:check
npm run campaign:check      # pinned design data and committed W01 artwork
npm run test:campaign:browser # new campaign, dev preview on port 5173
node scripts/campaign-storage-smoke.mjs # native IndexedDB contract checks
npm run test:browser       # dev preview on port 5173
npm run test:production    # Docker/site; defaults to port 8080
node scripts/discovery-smoke.mjs # focused hidden-terrain and deep-world checks
node scripts/immersive-wrap-smoke.mjs # focused pause-menu and wrapping checks
```

Browser checks use `/usr/bin/chromium`; set `CHROMIUM_PATH` if needed. `PREVIEW_URL` selects another preview or the public site. The checks cover gameplay, equipment effects, save migration/transfer/recovery, tab conflicts, touch release/cancellation, sound controls, and portrait/landscape layout. Screenshots are written to ignored `artifacts/`. Emulated phones do not establish physical Android performance.

See [PROGRESSION.md](docs/PROGRESSION.md) and [ECONOMY.md](docs/ECONOMY.md) for Legacy exploration and balance. Campaign source records and provenance are pinned under [design/v0.1](design/v0.1/README.md); its curated runtime definitions are in `src/campaign/config.ts`.

## Create or modify campaign artwork

The campaign uses editable layered SVG sources, a committed atlas and separate background planes. Node coordinates the authoring export; ordinary builds validate committed files without requiring Chromium or Python. See [CAMPAIGN_ASSETS.md](docs/CAMPAIGN_ASSETS.md).

```sh
npm run campaign:assets
npm run campaign:check
```

## Create or modify the 3D artwork

The game remains a 2D mining simulation with 3D-authored artwork. Node.js coordinates Blender to build original meshes, export editable GLB models, and render the animated atlas. The crawler and stations use level orthographic elevations matching the game's flat terrain plane. Phaser displays those renders with terrain detail, atmospheric layers and lighting effects; a Node server or live 3D renderer is not required to play.

```sh
npm run assets:build
npm run assets:check
```

Asset authoring requires Blender and Python with Pillow; see [the asset pipeline](docs/ASSET_PIPELINE.md) for setup and model sources. Normal `npm ci`, builds, Docker and GitHub Pages use the committed renders and do **not** require Blender. Builds validate the atlas, and Vite gives its PNG/JSON content-based URLs so updated art does not reuse stale cached frames.

## Original reference research

Java 21, Python 3, curl and SHA-256 tools are used for the separate reference lab:

```sh
bash scripts/setup-reference.sh
# With the dev server running, open /reference/ and select:
# reference/motherload_2017.swf
node scripts/reference-test.mjs
node scripts/reference-measure.mjs
```

The setup pins the identified free Miniclip SWF and official JPEXS 26.4.0 distribution, verifies SHA-256 hashes, and exports research scripts into ignored directories. Ruffle 0.7.1 is locked in npm dependencies. The measurement runner creates a separate read-only telemetry copy; the canonical SWF remains unchanged. No original code, graphics, sounds or SWF are bundled in the remake.

The reference is identified as version `0.934 (MC)`; it has not been proven byte-identical to the publisher's original 2004 distribution. See [research evidence](docs/RESEARCH.md), [movement measurements and limitations](docs/MOVEMENT_REFERENCE.md), [art and sound direction](docs/ART_DIRECTION.md), and [current project decisions and remaining work](docs/PROJECT.md).

## Source layout

- `src/main.ts`: mode routing; `src/legacy-main.ts` preserves the single-mine interface.
- `src/campaign/`: campaign definitions, simulation, generation, persistence, input, sound, interface and scene.
- `design/v0.1/`: pinned design JSON and source provenance, excluded from browser imports.
- `assets/campaign/`: editable illustrated sources and committed W01 output.
- `src/model.ts`: Legacy world generation, simulation, economy, upgrades and save validation/migration.
- `src/storage.ts`: validated persistence, backups, import/export and conflict protection.
- `src/legacy-main.ts`, `src/style.css`: Legacy controls, immersive playfield and pause menu.
- `src/scene.ts`, `src/station-ui.ts`, `src/art.ts`, `src/audio.ts`: camera, in-game building interfaces, original artwork, animation, feedback and synthesized sound.
- `assets/source/`, `assets/models/`, `assets/generated/`: original 3D model generators, editable models and browser-ready renders.
- `tests/`: simulation and storage regressions.
- `scripts/`: browser validation, production smoke checks and reference research.

Motherload is associated with XGen Studios. This is an independent remake, not an official release. Repository licensing remains for the project owner to choose.
