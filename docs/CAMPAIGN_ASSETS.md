# Campaign artwork: W01

The game uses original, editable 2D artwork derived from the design pack's shape, palette and production rules. W01's SVG sources, atlas, backgrounds and icons are described here; the separate [W02 pipeline](CAMPAIGN_W02.md) adds comet artwork and rank-2 modules. The supplied concept boards are visual references; their images are not cropped into the playable atlases.

## Build and validation

Normal builds use the committed PNG/JSON output under `assets/campaign/generated/`. They do not need Blender, Chromium, Python or Pillow to validate the artwork:

```sh
node scripts/check-campaign-assets.mjs
```

To re-render edited SVG artwork and repack the committed output:

```sh
node scripts/build-campaign-assets.mjs
node scripts/check-campaign-assets.mjs
```

If changing the drawing generator itself, explicitly regenerate the SVG source files first:

```sh
node assets/campaign/source/create-w01-sources.mjs
node scripts/build-campaign-assets.mjs
node scripts/check-campaign-assets.mjs
```

The source-generation command rewrites the individual SVG drawings and `frames.json`; the authoring build does not run it automatically. This allows an edited SVG to be rendered without replacing it from the generator.

The authoring build uses Node, Chromium through Playwright, and Python with Pillow to render and pack editable SVG artwork. Set `CHROMIUM_PATH` or `PYTHON` when those executables are elsewhere. The sources retain named `data-layer` groups so shapes, mechanical components and shading can be revised independently. Regeneration tools are authoring requirements; ordinary browser deployment serves only generated images and their frame metadata.

## Coordinate and loading contract

The logical terrain cell is 48 × 48 px, authored at 96 × 96 px. The compact rig body occupies 42 × 36 logical px; collision is defined by the simulator rather than image opacity. Every rig/module frame has a 128 × 128 px source canvas, representing 64 × 64 logical px, with a shared centre at source coordinate (64, 64) and tread baseline at source y=100. Module layers must use the same position, origin, scale and facing transform as the body to retain their mount alignment.

The scene loads `w01-atlas.png` and `w01-atlas.json` as Phaser texture `campaign-w01`. The named frames are untrimmed and unrotated; no per-frame trimming may move an animation anchor. Two transparent pixels surround every packed frame. Atlas dimensions never exceed 2048 × 2048 px.

| Family | Frames | Source size |
| --- | --- | --- |
| Main interiors | `soil-0` … `soil-7` | 96 × 96 |
| Edge masks | `soil-edge-0` … `soil-edge-15` | 96 × 96 |
| Stone interiors | `stone-0` … `stone-3` | 96 × 96 |
| Hard-rock and bedrock rims | `stone-edge-1` … `15`, `bedrock-edge-1` … `15` | 96 × 96 |
| Bedrock interior | `bedrock-0` | 96 × 96 |
| Separate sky body | `sky-body` | 256 × 256 |
| Cut overlays | `crack-1` … `crack-3` | 96 × 96 |
| Ordinary deposits/packages | `ore-o1` … `ore-o4`, `package-o1` … `package-o4` | 96 × 96 |
| Relic and mission objects | `relic`, `mission-beacon`, `mission-valve`, `mission-antenna`, `mission-core` | 96 × 96 |
| Hazard marker | `warning-shelf` | 96 × 96 |
| Body and cabin | `rig-body-0` … `rig-body-7`, `rig-cabin` | 128 × 128 |
| Independent rank components | `rig-engine-0/1`, `rig-energy-0/1`, `rig-bay-0/1`, `rig-hull-0/1` | 128 × 128 |
| Drill | `rig-drill-idle`, `rig-drill-right-0` … `7`, `rig-drill-down-0` … `7`, `rig-drill-left-0` … `7` | 128 × 128 |
| Rank-1 drill collar | `rig-drill-collar-right-1`, `rig-drill-collar-down-1`, `rig-drill-collar-left-1` | 128 × 128 |
| Local tools and thrust | `rig-feet-stowed`, `rig-feet-deployed`, `rig-rack`, `thrust-0` … `thrust-5` | 128 × 128 |
| Damage overlays | `rig-damage-1` … `rig-damage-3` | 128 × 128 |
| Equipment/item icons | `icon-drill`, `icon-energy`, `icon-cargo`, `icon-hull`, `icon-engine`, `icon-feet`, `icon-rack`, `icon-core` | 128 × 128 |
| Shared UI glyphs | `ui-energy`, `ui-hull`, `ui-cargo`, `ui-depth`, `ui-mission`, `ui-relic`, `ui-map`, `ui-shop`, `ui-warning`, `ui-cooldown` | 96 × 96 |
| Destination icon | `world-w01` | 96 × 96 |
| Lander construction | `dock-stage-0` … `dock-stage-3` | 384 × 288 |
| Refuge construction | `refuge-stage-0` … `refuge-stage-2` | 288 × 192 |
| Relay construction | `relay-stage-0` … `relay-stage-2` | 192 × 192 |

The background planes are separate images: `w01-sky.png` (1024 × 512 transparent stars), `w01-ridge-far.png` and `w01-ridge-near.png` (1024 × 384 each). A runtime gradient and one `sky-body` atlas frame complete the sky; the star field cannot repeat planets. Ridges wrap continuously and have solid lower margins. Their lower contrast and slower motion keep foreground collision edges legible. Deposit sprites, exposed packages, terrain, cracks and collision are separate layers, allowing extraction without baking item identity into a terrain image.

The terrain edge mask uses bit 1 for top, 2 for right, 4 for bottom and 8 for left exposed edges. Damage overlays represent the 75%, 40% and 15% HP thresholds. Equipment and resource/mission icons are exported at 64/128 px under `generated/icons/`; shared UI glyphs are exported at 24/48 px. The build's `frames.json` records all currently authored outputs.

`source/asset-map.json` maps the 29 W01/shared design-pack IDs to their frame, background and icon outputs. The build copies it to `generated/w01-assets.json`, and exports icon aliases using the stable IDs in lowercase: for example, `w01-r1-icon-64.png`, `core-1-drill-icon-128.png` and `ui-energy-icon-24.png`. These aliases retain the same artwork as their declared source icons. The registry allows loadout and item presentation to request stable design IDs without depending on atlas coordinates.

## Production checks

The checker requires all 163 named W01 frames, three backgrounds, the complete 29-ID registry and 114 sized icon exports, including mapped aliases. It validates frame sizes, PNG transparency, frame bounds, non-overlap, transparent gutters, anchor metadata, registry references and alias artwork, and rejects entirely invisible frames. Production pixel checks enforce background seams, transparent rims and material contrast (minimum ΔE 12). The registry's stable IDs are checked against the pinned design manifest. Missing committed output fails validation instead of substituting fallback art.

The W01 art proof must also be inspected in the real game on desktop, portrait and short landscape: compact silhouette, stable tread/drill position, readable mission and ore shapes at inventory size, and hazard cues distinguishable without colour or sound. These visual checks complement file validation; the checker cannot establish animation quality or physical Android performance.

This is the first destination's production set, not completion of the full campaign manifest. New world and loadout pages should be loaded by dependency; equipment and carried-item icons from older destinations must remain available after travel. Measure decoded texture memory as well as PNG download size: a full 2048 × 2048 RGBA page consumes 16 MiB before renderer overhead.
