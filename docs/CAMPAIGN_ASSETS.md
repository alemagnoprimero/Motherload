# Campaign artwork and rendering

The game uses original, editable 2D artwork derived from the design pack's shape, palette and production rules. W01's SVG sources, atlas, backgrounds and icons are described here; the separate [W02 pipeline](CAMPAIGN_W02.md) adds comet artwork and rank-2 modules. The supplied concept boards are visual references; their images are not cropped into the playable atlases.

## Build and validation

Normal builds use the committed PNG/JSON output under `assets/campaign/generated/`. They do not need Blender, Chromium, Python or Pillow to validate the artwork:

```sh
node scripts/check-campaign-assets.mjs
node scripts/check-frontier-assets.mjs
node scripts/check-render-assets.mjs
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

The scene loads compact `w01-runtime.png/json` as `campaign-w01`; the full `w01-atlas` family remains an authoring/validation output. Runtime pages omit the superseded tile drawings because the retained renderer reads continuous band materials. W02 loads when needed, while W01's shared rig and scenery remain available after travel.

Frames are now **trimmed, never rotated**. `sourceSize`, `spriteSourceSize`, logical size and normalized pivot preserve the original animation canvas; transparent padding can be removed without moving a mount or tread. Two transparent pixels surround packed rectangles. Native @2x and @3x renders come from the SVG, not an upscaled @2x PNG. The packer can emit several pages, each at most 2048 × 2048. At @3x, the same rig uses a 192 × 192 source canvas, pivot (96, 96) and tread baseline 150. The table below describes the @2x source dimensions, before trimming.

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
| Hazard markers | `warning-shelf`, `pressure-seam`, `cold-pocket` | 96 × 96 |
| Shared landmark art | `site-wreck/survey/mission/cache/geode/beacon/antenna/core` | 192 × 128 |
| Surface salvage | `surface-salvage` | 192 × 96 |
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

The background planes are separate images: `w01-sky.png` (1024 × 512 transparent stars), `w01-ridge-far.png` and `w01-ridge-near.png` (1024 × 384 each). A runtime gradient and one `sky-body` atlas frame complete the sky; the star field cannot repeat planets. Ridges wrap continuously and have solid lower margins. The runtime star page is sampled at 512 × 256 with twice the texture scale to save 1.5 MiB; the source/validation backdrop stays 1024 × 512. Their lower contrast and slower motion keep foreground collision edges legible. Deposit sprites, exposed packages, terrain, cracks and collision are separate layers, allowing extraction without baking item identity into a terrain image.

The terrain edge mask uses bit 1 for top, 2 for right, 4 for bottom and 8 for left exposed edges. Damage overlays represent the 75%, 40% and 15% HP thresholds. Equipment and resource/mission icons are exported at 64/128 px under `generated/icons/`; shared UI glyphs are exported at 24/48 px. The build's `frames.json` records all currently authored outputs.

`source/asset-map.json` maps the 29 W01/shared design-pack IDs to their frame, background and icon outputs. The build copies it to `generated/w01-assets.json`, and exports icon aliases using the stable IDs in lowercase: for example, `w01-r1-icon-64.png`, `core-1-drill-icon-128.png` and `ui-energy-icon-24.png`. These aliases retain the same artwork as their declared source icons. The registry allows loadout and item presentation to request stable design IDs without depending on atlas coordinates.

## Production checks

The W01 full atlas contains 174 named frames (the original 163 plus eleven scenery/hazard drawings). The checker requires the established frame contract, three backgrounds, the complete 29-ID registry and 114 sized icon exports, including mapped aliases. It validates frame sizes, PNG transparency, frame bounds, non-overlap, transparent gutters, anchor metadata, registry references and alias artwork, and rejects entirely invisible frames. Production pixel checks enforce background seams, transparent rims and material contrast (minimum ΔE 12). The registry's stable IDs are checked against the pinned design manifest. Missing committed output fails validation instead of substituting fallback art.

The W01 art proof must also be inspected in the real game on desktop, portrait and short landscape: compact silhouette, stable tread/drill position, readable mission and ore shapes at inventory size, and hazard cues distinguishable without colour or sound. These visual checks complement file validation; the checker cannot establish animation quality or physical Android performance.

This is the first destination's production set, not completion of the full campaign manifest. New world and loadout pages should be loaded by dependency; equipment and carried-item icons from older destinations must remain available after travel. Measure decoded texture memory as well as PNG download size: a full 2048 × 2048 RGBA page consumes 16 MiB before renderer overhead.


## Continuous band materials and residency

`src/campaign/world-content.ts` is the shared definition of four depth bands per world: names, ranges, material colours, ambient and gameplay roles. `assets/campaign/render-sources.mjs` turns those colours into editable SVG materials: irregular plates, fractures and back walls over an eight-cell period. `scripts/build-band-assets.mjs` writes 48 native-resolution pages (eight bands × three materials × two scales) and their manifest. This authoring command intentionally regenerates its procedural SVG sources:

```sh
npm run render:assets
node scripts/check-render-assets.mjs
```

The scene loads the current band at boot and its immediate neighbours during excavation, releasing other band pages. Touch devices select @2x foreground pages. Back walls are lower-frequency 384 × 384 runtime textures. Macro materials use @2x pages because retained terrain sampling caps at 1.5; native @3x foreground sprites remain available on desktop when CSS tile size and DPR need them. The runtime sprite families currently consume **5.50 / 11.50 MiB** for W01 @2x/@3x and **2.25 / 5.50 MiB** for W02. These figures are decoded RGBA page sizes, not PNG download size, and do not include materials, backgrounds, text, the framebuffer or renderer overhead.

The material validator measures maximum opposite-edge difference **2 levels**, soil/hard-rock separation **ΔL ≥9.1**, and adjacent bands **ΔE ≥12.4**. The original sky/rim checks also run. A generated page is not proof of an approved final illustration: compare actual gameplay captures with `docs/art-direction/` and the improvement plan's D0 target before closing the art review gate.

## Shared view and renderer

`CampaignView` owns CSS size, DPR, tile size, camera scroll and world/CSS conversion. Pointer hit tests, DOM beacons and renderer coordinates use it. Backing canvas size is CSS size × the backing scale: 1, 1.5 or 2, at most min(device DPR, the Render quality setting, 2). A quality tier chosen at boot sets a floor: High (WebGL with fragment `highp` on a fine pointer) 2.0, Medium (a coarse pointer, or no `highp`) 1.5, Low (Canvas) 1.0. Full-frame cost above 18 ms p95 for three seconds lowers the scale one level, never below the floor; ten seconds of one-second slices below 12 ms p95 raise it one level. A raise undone within 8 s doubles the wait before the next raise to that level, up to 160 s, until a raise to it holds for 60 s. Frames are not measured for 1 s after boot, after a resize, or while assets load, and the windows run on the scene clock (frame dt clamped to 50 ms). `?backing=1|1.5|2` pins the scale; `?debug=frametime` shows the 10 s p95, the backing scale and the policy's state (next step, a raise on probation, doubled waits) on screen (`docs/qa/f1-resolution-policy/`, `docs/qa/f3-visual-harness/`). For captures and tests, `?overlays=0` hides every annotation, and `window.__campaignDebug` exposes the light map, the annotation switch, the scene clock, the camera fade and the budget's state (`src/campaign/debug.ts`). Measurement spans Phaser `PRE_STEP` through `POST_RENDER`, including simulation, DOM updates and renderer submission; it does not stop at the end of scene drawing commands. Camera scroll snaps to device pixels; text rasterizes at the active DPR. Desktop framing restores 22 columns. Portrait and short landscape use 44 px cells. The surface camera favors the horizon and can frame both rig and lander on desktop; the exact ≤25% spawn-fog target still requires its specified capture measurement. The context profiles use 0.88× at the surface/dock and 1.05× underground, with 1.08× inspection zoom; Reduced motion disables zoom and velocity look-ahead. Recovery/world changes fade in over 180 ms when motion is enabled.

Rendering is divided into View, art residency, retained terrain, lighting, modular rig and diagnostics modules under `src/campaign/render/`. Terrain retains a buffered visible grid and redraws changed cells; ordinary frames move the image without re-uploading the entire atlas. Terrain caching caps its own sampling at 1.5 on both desktop and touch while sprites/text retain the chosen canvas DPR. The backdrop is therefore not claimed to be sampled at full DPR2. Lighting uses quarter-size canvas compositing (`destination-out`) for radial/cone headlamps and softened visibility, identically on WebGL and forced Canvas. Unknown material never reads the hidden tile type, cave, deposit or rim. The headlamp is above rock rather than behind it.

Sprites use their shared native atlas pages with display bounds aligned to device pixels. A tested per-size sprite cache reduced backend edge differences but exceeded the phone boot memory budget and produced uploads during animated zoom, so it was removed. The retained terrain uses a stable whole-pixel cell size independent of camera zoom; the phone raster is sampled at the minimum camera profile. The image scales with View while its material pixels stay unchanged. The buffer adds three cells per dimension on desktop and four on touch. When scrolling reaches its margin, existing pixels and cell signatures shift together and only entering rows/columns are redrawn. Entering strips are cleared explicitly; jumps larger than the buffer clear the whole canvas, including sky after recovery. Opaque terrain replaces the older fully covered background polygons, and the lighting quad excludes visible sky. Shared geometry masks are attached only to actual scenery sprites; the obsolete empty masked Graphics object has been removed.

Wrecks, optional sites, caches and pressure seams use shared atlas drawings clipped to discovered terrain. Standalone unread field logs have known-only terminal markers. Material debris, sparks, frost, landing dust, damage rims and rig load/squash feedback consume the same typed simulation event stream as audio. Particles cap at 75 on touch or 150 on desktop and are absent with Reduced motion. Tier glints and their light-map brushes only appear on currently visible minerals. A small dark tier mark with a light glyph (dot, two vertical bars, three horizontal bars, triangle, as in the journal legend), baked at the ore's lower right with no ring, keeps tier identification independent of hue; with high contrast on, a light `tier-mark-hc-N` overlay from the world's own atlas covers it. Every deposit sits in a translucent `deposit-socket` decal drawn under it in its known cell (art item A12; W02 draws W01's). Install events flash the specific changed rig module; construction raises the new atlas stage with sparks. These 1.2-second effects use presentation time while simulation remains paused; Reduced motion uses crossfades, and skipping the reward ends the effect. New auger frames change 1.32–2.41% of the full source canvas between adjacent frames (old audit maximum 0.48%), with a stable source pivot.

`#campaign-game` exposes the actual renderer, View snapshot, active particles, resident texture bytes, dirty terrain cells/uploads and actual WebGL draw submissions. The Canvas counter is omitted rather than treating display-object count as GPU draw calls. Browser checks must establish the frame, memory, fog-edge, contrast, visibility and viewport budgets; source validation cannot substitute for those measurements. D0 owner review, new-player ore identification and physical Android frame targets remain external validation gates.

`npm run test:render` uses deterministic imported expeditions to compare forced Canvas and WebGL, including byte-identical hidden-air versus hidden-solid regions. Its report retains every pixel outlier and labels unmet targets explicitly. Test-only WebGL instrumentation sums viewport-clipped submitted triangle area, counts texture uploads and rejects unsupported geometry from a claimed budget pass. Test-only Canvas instrumentation samples the actual blurred fog and finished light map; their adjacent alpha steps bound the lighting contribution but do not establish a monotonic whole-tile falloff or ore-fill contrast.

Run `PREVIEW_URL=http://127.0.0.1:5173/ node scripts/render-budget.mjs` separately on an idle host for native-clock 4× CPU-throttled phone and explored-world samples. Geometry accounting and fog copies are disabled during timing. `RENDER_BUDGET_STRICT=1` makes unmet numeric budgets fail the command; the default report preserves the numbers and gate status because a shared SwiftShader host cannot establish physical-device frame time.

Keep intermediate measurements when comparing changes. `artifacts/render-budget-final/` records the rejected cached-sprite candidate's isolated phone p95 of 18.9 ms idle / 86 ms moving, and `artifacts/feel-final/` records its 22.44 MiB boot failure. Those are regressions, not accepted budgets. Compiled `artifacts/feel-compiled-final/` passes eight renderer/viewport combinations with phone boot 19.43 MiB and active at most 30.68 MiB. `artifacts/render-stable/` records byte-identical hidden geology, a retained-terrain camera round trip (excluding the vehicle footprint), 1 draw and approximately 2.09 screens of clipped triangle area in each shaft, and zero stationary uploads. Fog alpha steps are 1 level; completed light-map steps are 5/4. Literal Canvas/WebGL parity is still unmet: mean channel difference 0.373/0.514, p95 maximum difference 2, largest sprite-edge outlier 63.

The isolated stable-raster phone moving p95 fell from 86 to 54.9 ms, and p95 texture uploads from 21 to 2; the explored-world moving p95 is 52.8 ms (`artifacts/render-budget-stable/`). The 12 ms CPU proxy target remains unmet. A bounded profile (`artifacts/render-profile/`) is dominated by unsymbolized native/program samples; it does not establish a single remaining game-JavaScript bottleneck. `scripts/render-adaptive.mjs` separately records requested versus actual DPR under sustained load so adaptive resolution is verified rather than assumed. Physical Android acceptance remains open.

`scripts/render-memory.mjs` freezes the clock before navigation and pumps frames while networking settles, measuring actual requested DPR2 without adaptive fallback. The compiled report (`artifacts/render-memory-compiled/`) measures desktop boot/W01 middle/W02 middle at **45.64 / 55.77 / 63.52 MiB**, and phone at **19.43 / 29.55 / 31.80 MiB**. Both middle-band fixtures include their neighbours and retain shared W01 pages after travel. W02 desktop has only 0.48 MiB headroom in this fixture; this is not a universal peak claim. Native adaptive verification remains separate: `artifacts/render-adaptive-final/` records requested 2, actual 1.5 then 1, and matching 590 × 1277 then 393 × 851 phone backing sizes.
