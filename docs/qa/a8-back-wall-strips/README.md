# A8 — native-density cave back-wall strips

Stack order: **A7 → A8 → T4 → T5**. This branch targets A7. It supplies two
band-C silhouette strips; T4 supplies the natural-air slots, parallax and
discovery fade. No terrain, lighting, loader-budget or world-generation code
changes here.

The default is **vaults**: broad angular ceiling and floor profiles echo the
cavern reference without competing with foreground ore. `needles` and
`shelves` remain selectable through `backwallFrames({ variant })` in
`assets/campaign/source/w01-backwall.mjs`; the seed moves internal facet
junctions rather than inventing noisy contours.

Each layered SVG produces a 1024×384 PNG at native @2, logical512×192.
The rasterizer honours `maxDensity: 2` inside both selected cave atlas groups,
so desktop @3 does not enlarge the strips' source pixels. Both strips remain
on the existing cave page. The source record, rasterizer and atlas metadata
are checked together; uncapped frames retain the existing density checks.

## Acceptance

| Check | Result |
| --- | --- |
| Two cool, outline-free, seeded strips | Met; three flat material tiers at native density, family provenance, deterministic SVG/PNG. |
| Native1024×384 @2, logical512×192 | Met on both @2 and @3 atlas selections; no runtime texture or loader-policy addition. |
| Horizontal period | Met; first/last columns are byte-identical, with flat seam collars. |
| Vertical period | Mirrored repeat: alternate four-tile rows flip vertically, making an eight-tile period. The source is not a direct vertical repeat. Shared edges and four-pixel collars match exactly. |
| Silhouette duplicate check | Far/near IoU is0/.001/0 for vaults/needles/shelves. |
| Unlit composite back-wall luma28–42, sd≥4 | Met: default35.724, sd5.281 over `#17242e`. Runtime lighting and known-air clipping are checked in T4. |
| Texture budget | One page per density: cave@2 1088×832=3.453MiB (+1.953); cave@3 1664×896=5.688MiB (+2.438). Expanded A7 desktop peak61.20 projects to63.64MiB, below64. Runtime residency is measured before push. |
| Hidden information, draw calls, parked uploads | Normal placement remains unchanged here. Explicit art poses require the entire source footprint and filter gutter to be known; the game captures and full verification enforce the hard limits. |

## Review and fixtures

The three-variant review uses the cavern board at matched tile scale,
reports silhouette/tier measures, and shows horizontal and mirrored vertical
seams. Default strips are also posed in the original known SITE-4 air pocket
at world centre(13.5,43.5), full extent10⅔×4tiles. This is a fixture-only
preview; it does not stand in for T4's clipping/parallax implementation.

Before/after captures use the same build with empty/populated review poses,
with two identical captures a scene step apart. The 60/150/330m checkpoints
remain context controls. Desktop is1440×900 at backing2; phone is393×851.
Review sheets and measured numbers live here; CI retains routine checks.

## Director decisions

- Confirm `vaults`, or select `needles`/`shelves` by parameter.
- Confirm mirrored vertical repetition. A full-height source that directly
  repeated vertically would enlarge the packed atlas beyond the measured
  desktop headroom; reflection keeps the native art and one-page batch.
- T4 will use .25/.5 horizontal parallax and four ten-tile repeats around
  W01. This compresses the authored horizontal span by6.25% to close the
  world seam; it does not change collision or the camera.
- The remaining whole-frame warmth and lighting targets stay visible in
  the capture report; these dark silhouettes do not add emitters.
