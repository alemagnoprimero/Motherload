# A7 — seeded cave dressing

Stack order: **A7 → A8 → T4 → T5**. A7 supplies the art and an explicit,
known-gated game-fixture hook; automatic placement arrives in T5. No terrain,
collision, lighting shader, or generator version changes.

The kit supplies reusable `rock-chunk.mjs` and `rust.mjs` recipes. Three drawn
archetypes (`facets`, `splinter`, `shelf`) use seeded facet junctions and authored
layouts. The default is **facets** for all five families: its broad planes keep
the slate forms quiet beside ore, while the mixed profiles avoid a repeated
ceiling or floor silhouette. The other two remain function parameters in
`assets/campaign/source/w01-dressing.mjs`.

The 52 frames comprise nine stalactites, four rust drips, six drip-particle
phases, six rubble piles, three boulders, and six crystal clusters with normal
and HC bases and additive siblings. Layered SVG is the authoring source; the
checked-in PNG sources are deterministic generated intermediates. The pinned
resvg/Pillow/canonical-PNG path rebuilds them and the cave-zone pages.

## Acceptance

| Check | Result |
| --- | --- |
| Counts, source dimensions, cave atlas, provenance | Met; source/catalog and atlas tests cover the frame inventory. |
| Foreground outline and cool slate/violet palette | Met; one `#14232b` outline at 4.4% of a logical cell; violet body `#bd8df6`. |
| At least three flat tiers per material zone | Met at @4 master for all three variants. Not met for every small zone at @2 or board scale; see the measured review. Keep the authored tiers and flag phone simplification for review. |
| No two silhouettes above IoU .70 | Met for all static shape pairs. The literal all-frame rule is not met: each variant has 15 pairs above .70 (three adjacent particle-phase pairs, six HC base identities, six HC emissive identities). Retain identity across HC and smooth motion; ask the director to confirm these exceptions. |
| Board counterpart IoU | Measured at matched scale, without fitting each shape to improve its score. Dressing is not claimed to pass the hero-prop .70 match threshold. |
| HC crystals distinct from copper | HC dark/body/light L* are approximately 29/42/54 versus copper 69.1. The HC sparkle has zero RGB energy. The body gap is 27 L*, the nearest tier gap about 15 L*. |
| Hidden information | The review hook requires the complete source footprint plus a two-device-pixel gutter to be known. Crystal footprints additionally reject every known deposit in their 3×3 neighbourhood. Shipping placement is unchanged in A7. |
| Texture residency | Expanded residency sample: phone boot 16.84 MiB, active 28.46; larger phone-tile probe boot 19.32, active 33.69; desktop maximum 61.20. Limits are 20/40/64 MiB. |
| Draws, parked uploads, full-frame metrics | Reported with the settled game captures and the local verification run. No additional pass or texture is created by a dressing sprite. |

The source review reports all 1,326 silhouette pairs per variant. Default
static-family maximum IoUs are stalactites .660, rust .366, rubble .537,
boulders .437 and crystals .425. At @2, 17/14/16 material zones in
facets/splinter/shelf lose a tier; at board scale, 34/33/29 do. These are
downsampling losses, not counted antialiasing colours.

## Evidence and reproduction

`scripts/art-review-a7.mjs` renders the three variants through the pinned
raster path. `scripts/art-review-a7.py` uses the existing art-review metrics,
annotated board counterpart masks, and actual game contexts to build the
review sheets and measured JSON. It does not copy board pixels into assets.

`scripts/art-captures-dressing.mjs` captures SITE-4 and the existing 60 m,
150 m and 330 m checkpoints on desktop 1440×900 at backing 2 and phone
393×851. Before/after means the same A7 build with the explicit review poses
empty/populated; A7 does not yet choose placement during normal play. Detail
poses stay in known cells and do not edit geology, discovery or deposits.
Every saved frame must match a second capture one scene step later. The
capture report compares edge density, frame L*, warm share and rock variation
near the light with the board.

Local verification follows every command in `.github/workflows/checks.yml`
`verify`, then pins the T2 checks to `field=1`, repeats the fog/render checks
with `field=0`, and checks the masked beacon in both paths. CI owns the routine
test artifacts; this folder keeps the visual sheets and measurements.

## Director decisions

- Confirm `facets` as the default, or select `splinter`/`shelf` by parameter.
- Confirm the darker HC crystal value and zero-energy HC sparkle.
- Confirm the motion/HC identity exceptions to the literal duplicate rule.
- Accept the documented phone-scale tier losses, or request broader small
  facets in a later art pass.
- Boulders use scenery depth below the rig until T6 provides a foreground
  layer; this fixture does not imply that T6 is delivered.

`scene.ts` changes are limited to the review hook and its rendering hunk;
they overlap later T4/T5 integration. No other open branch was incorporated.
