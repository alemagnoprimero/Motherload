# Motherload · The deep frontier

A single-player browser mining game in Phaser and TypeScript, inspired by Motherload's free edition. Mine destructible terrain, explore caves, collect ten minerals, return to sell and service the rig, and buy drill, engine, tank, cargo and hull upgrades. Original 3D models supply the vehicle, buildings and minerals; their rendered sprites keep the browser game lightweight. Sound is newly synthesized.

## Play

Open **https://alemagnoprimero.github.io/Motherload/** on a computer or Android phone. No installation or local server is required. Gameplay changes pushed to `main` are tested, built and deployed automatically.

Existing expeditions retain their excavated maps. To explore the new cave generation and expanded mineral deposits, choose **Tools → New expedition**. Export your existing expedition first if you want to keep a separate copy; starting over requires confirmation.

### Controls and first expeditions

1. Hold **Down / S** to drill the starter vein below the rig. The stock bay holds seven minerals. The neighboring vein to the right provides a second early expedition. A full bay does **not** block excavation: additional ore is discarded, so sell your load before collecting more valuables.
2. Hold **Up / W** to return through your shaft. Combine Up with **Left/Right or A/D** to steer. Counter-steer to brake momentum. Side drilling requires a ledge under the rig, at any depth; you cannot drill upward.
3. A started cut completes even after releasing its direction. Hold Up during the cut to lift off immediately afterward.
4. Return to the surface and drive to a building's illuminated bay. Press **E / Enter**, or tap the nearby building or its on-screen prompt, to open its interface **inside the game**. The **Exchange** buys your haul, **Fuel** refills your tank, **Repair** restores hull, and **Upgrades** sells equipment. You must visit the correct building. Two starter expeditions normally fund the first $750 upgrade.
5. Explore caves and deeper deposits. Mineral weight affects handling; engines improve thrust and acceleration. Hard landings and magma damage the hull. Ordinary drilling does not.

Phones have separate left/right and down/up controls; hold two with different fingers to steer in flight. Fuel, hull and cargo stay beside the playfield in portrait and landscape. **Expand** fills the available screen; native fullscreen is used when supported. Tap or click a mineral to identify it.

You can return to any supported ledge and drill down again, regardless of your deepest point. Down selects the floor while you hold a horizontal direction to align; horizontal steering still works while airborne.

Inside a building, use **arrows / Tab** to select equipment and **Enter** to buy, or tap the canvas controls. Upgrade cards show the actual capacity or performance change. **Escape** or the in-game close button returns to the mine. The rig stays parked while you use a building.

**P / Pause** suspends the expedition. Building interfaces and Tools also pause play, and leaving the browser clears held controls. Enable **♪ On** for sound; adjust volume in Tools. Sound starts muted on each visit.

**Tools → Request recovery** returns the rig to the surface with half its fuel and hull, at the cost of cargo and 20% of credits. It remains available without money and requires confirmation.

### Saves and transfer between devices

**Save** records terrain, position, money, inventory, vehicle condition and upgrades. Autosave runs every five active seconds; background/exit saves are best effort, so use Save before closing after an important purchase or discovery. Loading resets transient velocity and unfinished cut animation, not completed excavation.

- **Tools → Export save** downloads a validated JSON file. **Import save** previews the expedition and asks before replacing current progress.
- The previous valid saved expedition becomes a backup. **Restore backup** asks before replacing the primary save.
- Older schema-1/schema-2 saves migrate to schema 3. Terrain, cash, inventory and position are preserved. Fuel/hull percentages and equipment capability are preserved while the original's smaller units and longer upgrade tables are adopted.
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
npm run test:browser       # dev preview on port 5173
npm run test:production    # Docker/site; defaults to port 8080
```

Browser checks use `/usr/bin/chromium`; set `CHROMIUM_PATH` if needed. `PREVIEW_URL` selects another preview or the public site. The checks cover gameplay, equipment effects, save migration/transfer/recovery, tab conflicts, touch release/cancellation, sound controls, and portrait/landscape layout. Screenshots are written to ignored `artifacts/`. Emulated phones do not establish physical Android performance.

## Create or modify the 3D artwork

The game remains a 2D mining simulation with 3D-authored artwork. Node.js coordinates Blender to build original meshes, export editable GLB models, and render the animated atlas. Phaser displays those renders with terrain detail, atmospheric layers and lighting effects; a Node server or live 3D renderer is not required to play.

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

- `src/model.ts`: world generation, simulation, economy, upgrades and save validation/migration.
- `src/storage.ts`: validated persistence, backups, import/export and conflict protection.
- `src/main.ts`, `src/style.css`: controls, responsive HUD and save tools.
- `src/scene.ts`, `src/station-ui.ts`, `src/art.ts`, `src/audio.ts`: camera, in-game building interfaces, original artwork, animation, feedback and synthesized sound.
- `assets/source/`, `assets/models/`, `assets/generated/`: original 3D model generators, editable models and browser-ready renders.
- `tests/`: simulation and storage regressions.
- `scripts/`: browser validation, production smoke checks and reference research.

Motherload is associated with XGen Studios. This is an independent remake, not an official release. Repository licensing remains for the project owner to choose.
