# Frontier art and sound kit

The remake uses a newly authored industrial Mars palette: amber vehicle armor, blue steel machinery, warm regolith, cyan cockpit glass, and contrasting mineral deposits. Compact charcoal instruments leave most of the screen for the mine. The rig's treads follow the collision footprint; the drill and rotor extend beyond it as tools.

The crawler, surface buildings and minerals are actual original 3D meshes with material-bearing GLB exports. Node.js orchestrates Blender to render them into a 32-frame atlas: 18 crawler animation poses, four distinct buildings and ten mineral clusters. The crawler has beveled armor, tracks and hubs, glazed cockpit panels, an extending auger, rotor and thruster states. The exchange has a hopper and conveyor; the fuel depot has cylindrical tanks; the repair bay has a crane; the workshop has solar panels and equipment housings.

The committed atlas is about 721 KiB at 1536 × 704 pixels. `src/art.ts` loads it and generates 42 shaded 96-pixel terrain variants once, compositing the mineral renders into soil and rock. Vite hashes the PNG and JSON URLs. Normal builds validate those assets and do not require Blender. See [ASSET_PIPELINE.md](ASSET_PIPELINE.md) for authoring commands and model files. The runtime remains a 2D simulation with 3D-rendered sprites rather than a real-time 3D engine.

Minerals have different silhouettes as well as colors:

| Mineral | Shape |
| --- | --- |
| Ironium | Rough metallic nugget |
| Bronzium | Rounded nodules |
| Silverium | Tall rounded metallic clusters |
| Goldium | Beveled gold cuboids |
| Platinium | Angular silver-violet blocks |
| Einsteinium | Radial crystals around a luminous core |
| Emerald | Hexagonal prismatic cluster |
| Ruby | Angular red crystal spires |
| Diamond | Broad octahedral jewel |
| Amazonite | Asymmetric turquoise spires |

The scene adds a warm sunset, layered distant ridges, surface dust, parallax cave walls, vehicle lighting and contact shadows. Exposed cave edges, bedrock strata, magma cracks, station signs, cut outlines, drill vibration/chips and impact feedback preserve gameplay readability. Tapping or clicking a deposit identifies it. The camera follows the rig with larger terrain cells: typically 56 pixels on desktop, 40 on phones and 32 in a short landscape viewport. Those visual sizes do not alter collision or drilling distances.

Surface buildings highlight their docking bays when the rig is close enough to enter. Their service interfaces are drawn in the Phaser playfield, using the same industrial palette and station identity as the world. Touch controls, equipment comparisons, purchase feedback and the exit control stay inside that interface; there is no separate website shop panel.

`src/audio.ts` synthesizes original motor, drilling, thrust, collection, damage, service, upgrade, and warning sounds. Sound starts only after the player enables it. Volume and mute controls remain available; pausing silences vehicle sounds. These effects use oscillators and a generated noise buffer, not copied recordings or music.

Review captures live under ignored `artifacts/`, including `scene-new-surface.png`, `scene-new-cavern.png` and `scene-new-phone.png`. They are not production dependencies. Refine geometry in `assets/source/`, regenerate with `npm run assets:build`, and adjust terrain, animation and feedback in `src/art.ts` / `src/scene.ts`. Inspect both desktop and phone layouts, including visible drill deployment and tread contact with intermediate ledges.
