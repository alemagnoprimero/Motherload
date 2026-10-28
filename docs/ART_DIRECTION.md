# Frontier art and sound kit

The remake uses a newly authored industrial Mars palette: amber vehicle armor, blue steel machinery, warm regolith, cyan cockpit glass, and contrasting mineral deposits. The scene fills the viewport, with a discreet Menu control and touch driving overlays. Vehicle instruments, settings and save actions share the pause menu. The rig's treads follow the collision footprint; the drill and rotor extend beyond it as tools.

The crawler, surface buildings and minerals are actual original 3D meshes with material-bearing GLB exports. Node.js orchestrates Blender to render them into a 32-frame atlas: 18 crawler animation poses, four distinct buildings and ten mineral clusters. The crawler has beveled armor, tracks and hubs, glazed cockpit panels, an extending auger, rotor and thruster states. The exchange has a hopper and conveyor; the fuel depot has cylindrical tanks; the repair bay has a crane; the workshop has solar panels and equipment housings.

The committed atlas is about 656 KiB at 1536 × 704 pixels. The rig and four buildings use level orthographic elevations: horizontal X and vertical Z align with the game plane, with no isometric roof or foundation skew. Shading preserves their modeled detail. `src/art.ts` loads the atlas and generates 42 shaded 96-pixel terrain variants once, compositing the mineral renders into soil and rock. Vite hashes the PNG and JSON URLs. Normal builds validate those assets and do not require Blender. See [ASSET_PIPELINE.md](ASSET_PIPELINE.md) for authoring commands and model files. The runtime remains a 2D simulation with 3D-rendered sprites.

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

The scene adds a warm sunset, layered distant ridges, surface dust, parallax cave walls, vehicle lighting and contact shadows. Exposed cave edges, bedrock strata, magma cracks, station signs, cut outlines, drill vibration/chips and impact feedback preserve gameplay readability. Tapping illuminated terrain identifies it. The camera follows the rig with local framing: typically 80 pixels per cell on a wide desktop, 72 on a medium viewport, 40 on phones and 32 in short landscape. Those visual sizes do not alter collision or drilling distances.

Three opaque, type-independent ground frames cover unexplored cells, including hidden air. Current sight illuminates exposed faces and tunnels; remembered terrain is dim. Fog covers world effects, and cave-edge highlights only use known neighbors, so neither light nor outlines reveal hidden geology. Geological regions tint the atmosphere, and first frontier crossings receive a brief canvas notice. The pause menu tracks the next depth target without listing undiscovered mineral locations. Numeric depth labels and permanent action-mode overlays are absent from play.

The scene renders repeated terrain and building copies around a horizontal circumference while the camera follows continuously. Texture variants repeat with their canonical cells, including negative world coordinates. Inspection, headlights, shadows, cut markers and particles use the same nearby world copy, so crossing a seam does not expose hidden terrain or teleport effects.

Surface buildings highlight their docking bays when the rig is close enough to enter. Their service interfaces are drawn in the Phaser playfield, using the same industrial palette and station identity as the world. Touch controls, equipment comparisons, purchase feedback and the exit control stay inside that interface; there is no separate website shop panel.

`src/audio.ts` synthesizes original motor, drilling, thrust, collection, damage, service, upgrade, and warning sounds. Sound starts only after the player enables it. Volume and mute controls remain available; pausing silences vehicle sounds. These effects use oscillators and a generated noise buffer, not copied recordings or music.

Review captures live under ignored `artifacts/`, including `scene-new-surface.png`, `scene-new-cavern.png` and `scene-new-phone.png`. They are not production dependencies. Refine geometry in `assets/source/`, regenerate with `npm run assets:build`, and adjust terrain, animation and feedback in `src/art.ts` / `src/scene.ts`. Inspect both desktop and phone layouts, including visible drill deployment and tread contact with intermediate ledges.
