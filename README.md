# Motherload · The deep frontier

A single-player browser mining prototype in Phaser 3 and TypeScript. New geometric placeholder artwork; no original game assets are included. Keyboard and touch controls, mining, cargo, fuel, hull damage, surface services, four upgrade paths, and complete local terrain persistence are implemented.

## Play online or keep a container running

The hosted game is at https://alemagnoprimero.github.io/Motherload/ once the **Publish playable game** deployment is green. Open the same address on a computer or Android phone. No Node.js, ZIP extraction or local server is needed for that version. Gameplay changes pushed to `main` are built, tested and published by `.github/workflows/pages.yml`; only the production `dist/` files are uploaded.

To host it yourself with Docker Desktop or a Docker server, run this once from the project folder:

```sh
docker compose up -d --build
```

Open `http://localhost:8080`. The container runs in the background and restarts when Docker starts, unless you explicitly stop it. Your PC must be on and Docker must be running. A phone on the same Wi-Fi can use `http://YOUR-PC-IP:8080`; access away from that network needs a hosted site or a configured server/domain. A container in this temporary Codex workspace is not permanent hosting.

Update the source, then run the same command to rebuild. `docker compose logs --tail=50` shows startup output; `docker compose down` stops/removes the local container. Set `MOTHERLOAD_PORT` to change the host port. The image builds with Node 24 and serves static files using Nginx on port 8080, as an unprivileged user, with a health check. The Compose service has a read-only root filesystem and a temporary writable `/tmp`.

Saves remain local to each browser and address. Moving from localhost to the hosted URL starts a separate save; desktop and phone progress do not synchronize. Keep a consistent URL for each device. No game accounts or server-side save service are configured.

For production validation, set `PREVIEW_URL` to the container/site URL and run `npm run test:production`. This launches isolated desktop and mobile browser contexts and checks mining, save/reload, selling, an upgrade, and touch input without requiring the development-only reference lab.

## Run locally for development

Requires Node.js 22+ and npm. From this repository:

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Open `http://localhost:5173`. For an Android phone on the same network, use the computer's reachable IP with port 5173. A remote cloud preview requires the host application's port forwarding; a localhost URL on your phone refers to the phone itself.

Production: `npm run build`, then `npm run preview -- --port 4173`. The static `dist/` directory can be hosted on any static server. This build does not include the separate research lab or original SWF.

## First expedition

1. Hold **Down / S** to mine the four iron deposits directly below the starting rig. They fill four cargo slots and are worth $100.
2. Hold **Up / W** to fly back through your shaft to depth 0 m. Hold **Up + Left/Right** together to steer in flight. The rig stays docked when you release thrust.
3. Click **Sell minerals**, **Refuel**, and **Repair**. Purchase the **Drill assembly** for $100; it reduces excavation time immediately.
4. Explore sideways with **Left/Right or A/D**, then drill deeper for more valuable minerals. The drill cannot cut upward. Side drilling requires support beneath the rig; land on a ledge at any depth before cutting into a wall. A cut finishes after you release its direction; hold **Up** to lift off as soon as it completes. The rig coasts after you release steering; press the opposite direction to brake. Heavy minerals reduce acceleration and climb speed. Magma and hard landings damage the hull.
5. **Save** and reload the page. Terrain, inventory, credits, fuel, hull, upgrades and position are restored. **Load** restores the most recent snapshot. Autosave runs every five active seconds, after services, and on page exit/backgrounding.

**P / Pause** suspends the simulation; losing focus also pauses it. Phones show four press-and-hold direction buttons; two fingers can hold Up and a horizontal direction together. Recovery returns you to the surface with half fuel/hull, but forfeits cargo and 20% of credits. It works even if you have no credits. Recovery and New expedition require an in-game confirmation.

Older prototype saves migrate automatically to schema 2 with fractional vehicle positions. Keep the same browser, host and port when updating to retain your existing save. Saves use localStorage key `motherload.frontier.v1`; they belong to the current browser and origin. Private browsing, cleared site data, a different port, or a different device may not retain the same save. Invalid/unsupported saves are left intact and autosave is suspended until a new expedition is explicitly started. No backend or account is required.

## Validate

```sh
npm test                  # simulation and save-schema tests
npm run build             # strict TypeScript + production bundle
npm run test:browser       # requires dev server on port 5173 and Chromium
```

Browser tests use `/usr/bin/chromium`; set `CHROMIUM_PATH` if yours is elsewhere. `PREVIEW_URL` overrides the tested URL. The tests drive actual keyboard and touch input, complete the mining/selling/service/upgrade loop, reload saves, test pause/recovery/reset/corrupt-save protection, and check responsive layout. Screenshots are written to ignored `artifacts/`. Android touch is emulated in Chromium; physical-device performance is not yet verified.

## Original reference lab

Java 21, Python 3, curl and SHA-256 tools are available in the prepared cloud environment. Run:

```sh
bash scripts/setup-reference.sh
# With npm run dev already running, open /reference/ and select:
# reference/motherload_2017.swf
node scripts/reference-test.mjs
```

The setup script downloads the identified free Miniclip SWF from the exact CrazyGames listing location and the official JPEXS 26.4.0 distribution. It checks pinned SHA-256 hashes and exports scripts into ignored `reference/decompiled/`. JPEXS lives in ignored `.cache/reference-tools/jpexs/`. Re-running setup validates existing downloads before reuse. Ruffle 0.7.1 is locked in npm dependencies. The local file chooser does not upload the SWF.

For repeatable movement research, run `node scripts/reference-measure.mjs` with the dev server running. It checks the canonical SWF hash, creates a separate instrumented copy with a read-only telemetry callback, and captures actual positions, velocities, cut transitions, and fuel under ignored `artifacts/reference-measure/`. See [movement measurements and limitations](docs/MOVEMENT_REFERENCE.md). `node scripts/movement-capture.mjs current` captures remake scenarios through keyboard and touch controls. Neither research runner is part of the production game.

See [research findings](docs/RESEARCH.md) for provenance, edition identification, original mechanics, citations, and explicit differences in the prototype. The publisher-hosted file could not be compared because XGen's upstream TLS verification failed. The verified reference is the identified syndicated `0.934 (MC)` build, not a claim of byte equality with the 2004 original.

## Project layout

- `src/model.ts`: deterministic world, simulation, economy, upgrades, save validation.
- `src/main.ts`: Phaser scene, original placeholder drawing, keyboard/touch input, UI and storage.
- `src/style.css`: responsive interface.
- `tests/model.test.ts`: simulation regression coverage.
- `scripts/browser-test.mjs`: end-to-end browser checks.
- `reference/index.html`: separate local Ruffle research player.
- [Project notes and next steps](docs/PROJECT.md).

Motherload is associated with XGen Studios. This is an independent prototype, not an official release. No license to redistribute the original game or assets is implied. Repository licensing remains to be chosen by the project owner.

If your Docker build runs behind an organization HTTPS proxy, its trusted CA can be supplied as a temporary BuildKit secret (`--secret id=proxy_ca,src=/path/to/trusted-ca.pem`). The Dockerfile adds that CA to Node's normal trust store only during dependency installation. It does not disable certificate verification or place the CA in the runtime image. Proxy build arguments and DNS configuration must match that host's network; ordinary Docker Desktop installations do not need this cloud-specific setup.
