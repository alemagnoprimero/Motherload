# Frontier art and sound kit

The remake uses a newly authored industrial Mars palette: amber vehicle armor, oxidized teal machinery, warm regolith, pale cockpit glass, and strongly contrasting mineral deposits. The rig's body follows the collision footprint; the drill and rotor extend beyond it as tools.

`src/art.ts` creates a reusable texture atlas at startup. It contains 42 terrain variants and 18 vehicle frames for idle, driving, flight, sideways drilling, downward drilling, and damage. Sideways frames mirror for left/right travel. Textures are generated once and reused by the renderer; no external artwork downloads or extracted Motherload assets are required.

Minerals have different silhouettes as well as colors:

| Mineral | Shape |
| --- | --- |
| Ironium | Rough metallic nugget |
| Bronzium | Rounded nodules |
| Silverium | Fan of narrow blades |
| Goldium | Wide faceted bar |
| Platinium | Stepped cubes |
| Einsteinium | Nucleus and orbital nodes |
| Emerald | Long hexagonal crystal |
| Ruby | Angular rosette |
| Diamond | Broad crown and pointed base |
| Amazonite | Asymmetric turquoise spires |

The scene adds exposed cave edges, readable bedrock strata and magma cracks, station signs, a selected-cut outline, drill chips, mineral collection labels, and impact feedback. Tapping or clicking a deposit identifies it. A viewport-following camera keeps tiles readable on phones instead of shrinking the entire world to fit the screen.

Surface buildings highlight their docking bays when the rig is close enough to enter. Their service interfaces are drawn in the Phaser playfield, using the same industrial palette and station identity as the world. Touch controls, equipment comparisons, purchase feedback and the exit control stay inside that interface; there is no separate website shop panel.

`src/audio.ts` synthesizes original motor, drilling, thrust, collection, damage, service, upgrade, and warning sounds. Sound starts only after the player enables it. Volume and mute controls remain available; pausing silences vehicle sounds. These effects use oscillators and a generated noise buffer, not copied recordings or music.

The local specimen sheet is captured under ignored `artifacts/art-kit.html` and `artifacts/art-kit.png`. Runtime artwork is implemented in source, so the playable build does not depend on those review captures. To refine the kit, edit the atlas definitions in `src/art.ts` and the animation/feedback logic in `src/scene.ts`, then inspect both desktop and phone layouts.
