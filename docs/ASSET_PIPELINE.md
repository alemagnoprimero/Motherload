# Original 3D asset pipeline

The crawler, four surface buildings and ten mineral clusters are actual modeled 3D geometry. Their mesh sources live in `assets/source/`; editable, material-bearing GLB exports live in `assets/models/`. The game uses their orthographic renders as sprites, keeping its existing two-dimensional mining simulation and low browser rendering cost.

Node.js orchestrates this offline pipeline. Blender creates the meshes, applies physically based materials, exports GLB models and renders soft studio lighting with Cycles on the CPU. Python/Pillow assembles those completed renders into a lossless texture atlas. Node.js itself is not a 3D renderer. No extracted Flash artwork, stock asset pack, downloaded texture or generated imitation of an original asset is used.

## Build and reproduce

Normal `npm ci` / `npm run build` uses the committed atlas and **does not require Blender or Python**. Regenerate artwork only when changing its mesh sources:

```sh
# Requires Blender 4.3+, Python 3 and Pillow.
python3 -m pip install Pillow
npm run assets:build
npm run assets:check
npm run dev
```

The checked-in renders were built with Blender 4.3.2 and 64 Cycles samples. Optional environment variables select executables or render quality:

```sh
BLENDER_PATH=/path/to/blender PYTHON_PATH=python3 ASSET_SAMPLES=64 npm run assets:build
```

On Windows, set `BLENDER_PATH` to the full Blender executable path and `PYTHON_PATH` to `python` if `python3` is unavailable. The Node script passes arguments directly to subprocesses, so installation paths may contain spaces.

`--python-exit-code 1` makes Blender exceptions fail the build. Atlas packing rejects incomplete frame sets. Per-frame renders and temporary manifests stay under ignored `.cache/asset-renders/`; only final generated artwork and source models belong in Git.

## Files and rendering contract

- `scripts/build-assets.mjs`: Node entry point for Blender rendering and atlas assembly.
- `assets/source/mesh_tools.py`: beveled solids, pipes, converted mesh lettering and common PBR materials.
- `assets/source/rig_models.py`: tracked crawler, cabin, drill poses, rotor, thrusters and damaged panels.
- `assets/source/station_models.py`: exchange hopper/conveyor, fuel tanks, repair bay/crane and upgrade workshop.
- `assets/source/render_assets.py`: mineral meshes, cameras, lights, GLB exports and sprite rendering.
- `assets/source/pack_assets.py`: atlas layout and Phaser JSONHash metadata.
- `assets/generated/frontier-atlas.png` and `.json`: 32 untrimmed RGBA frames. Vite imports these files as URLs and hashes their production filenames, preventing old textures from being paired with a newer frame map.

The atlas contains 18 crawler poses at 160 × 160 pixels: idle and damaged, plus four frames each for driving, flight, sideways cutting and downward cutting. Four station frames are 384 × 256. Ten transparent mineral frames are 96 × 96, named `ore-3`, `ore-4`, `ore-5`, `ore-6`, and `ore-9` through `ore-14`. The terrain renderer composites those mineral renders with its independently authored rock and soil textures.

Crawler frames share one camera, center and scale so changing animation poses never moves the collision body. Stations are framed against the same ground baseline. The game typically displays the crawler frame at 1.5 terrain cells and each building at 3 × 2 cells. Animation and camera placement remain renderer concerns; sprite imagery never changes the physics collision dimensions.

The GLB exports contain real meshes and materials, ready to inspect in Blender or another glTF viewer. They are source/review artifacts and are not downloaded by players. They currently capture representative static poses, while sprite-frame mechanics are reproduced by the Python source. A future real-time 3D renderer could reuse these models, but this release remains a 2D game with 3D-rendered artwork.
