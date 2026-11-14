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

| Check                                                 | Result                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Counts, source dimensions, cave atlas, provenance     | Met; source/catalog and atlas tests cover the frame inventory.                                                                                                                                                                                                                                                                 |
| Foreground outline and cool slate/violet palette      | Met; one `#14232b` outline at 4.4% of a logical cell; violet body `#bd8df6`.                                                                                                                                                                                                                                                   |
| Ordinary art goal: three flat tiers per material zone | Met for all 40 non-emissive material zones at @4. Not met throughout native @2 or the small matched-scale display; default passes 23/40 and 6/40 respectively. Retain the authored tiers and submit broader small facets as the director fallback.                                                                             |
| Ordinary art goal: no two silhouettes above IoU .70   | Met for all static shape pairs. The literal all-frame rule is not met: each variant has 15 pairs above .70 (three adjacent particle-phase pairs, six HC base identities, six HC emissive identities). Retain identity across HC and smooth motion; ask the director to confirm these exceptions.                               |
| Board counterpart IoU                                 | Measured at matched scale, without fitting each shape to improve its score. Dressing is not claimed to pass the hero-prop .70 match threshold.                                                                                                                                                                                 |
| HC crystals distinct from copper                      | HC dark/body/light L* are approximately 29/42/54 versus copper 69.1. The HC sparkle has zero RGB energy. The body gap is 27 L*, the nearest tier gap about 15 L*.                                                                                                                                                              |
| Hard gate: hidden information                         | The hook requires the complete source footprint plus a two-device-pixel gutter to be known; crystals reject known deposits in the surrounding 3×3 neighbourhood. The full local `verify` job and supplemental pinned-field, fallback fog/render and Scan checks completed; every hidden-information comparison stayed at 0 px. |
| Hard gate: texture residency                          | Expanded residency sample: phone boot 16.84 MiB, active 28.46; larger phone-tile probe boot 19.32, active 33.69; desktop maximum 61.20. Limits are 20/40/64 MiB.                                                                                                                                                               |
| Hard gate: draws and parked uploads                   | All 22 after views, including the 14 detail views: maximum 9 draws and 0 parked uploads. Phone masked-beacon probes also pass with HC off/on: field 9 draws, retained fallback 8. Detail residency is 5.67 MiB phone / 9.44 MiB desktop.                                                                                       |
| Ordinary art goals: SITE-4 full-frame measures        | Desktop edge density .084, phone .057 (target .06); frame L* 22.7/21.6 against board 21.0; rock sd 32.7/30.8 (target 15). Warm share .51%/1.02% is below 2–5%. Keep the cool dressing; the lighting/emitter work owns the remaining warmth.                                                                                    |

The source review checks all 1,326 silhouette pairs per variant and lists every
pair above .70. Default
static-family maximum IoUs are stalactites .660, rust .366, rubble .537,
boulders .437 and crystals .425.

The table separates full raster-master readings from smaller rendered source
images. Each denominator is 40 material zones, including HC palette alternatives
and particle phases, excluding the 12 additive-light siblings.

| Variant    | @4 raster master, 192 px/tile | Native @2, 96 px/tile | Matched review scale, 44.14 px/tile |
| ---------- | ----------------------------- | --------------------- | ----------------------------------- |
| `facets`   | 40/40 retain ≥3 tiers         | 23/40                 | 6/40                                |
| `splinter` | 40/40                         | 26/40                 | 7/40                                |
| `shelf`    | 40/40                         | 24/40                 | 11/40                               |

Counts use flat colour patches, excluding antialiasing: at least 8 pixels per
fill at @4, 2 at @2, and 0.5 at matched scale. A zero count means no qualifying
flat patch survived that reduction, not an absent or uncoloured sprite. These
source readings do not assert that every lit runtime patch retains three tiers.

The unchanged 330 m controls also miss ordinary frame targets: desktop/phone
L* 26.2/27.9 against board 21.0, and rock sd 14.8/14.3 against 15. Phone transit
edge densities .040/.042/.049 remain below .06. Their before/after pixels are
identical. Preserve terrain/collision and the cool dressing; carry these
remaining contrast and lighting goals into the terrain/lighting art review.

## Evidence and reproduction

`scripts/art-review-a7.mjs` renders the three variants through the pinned
raster path. `scripts/art-review-a7.py` uses the existing art-review metrics,
annotated board counterpart masks, and actual game contexts to build the
review sheets and measured JSON. It does not copy board pixels into assets.

Review sheets: [stalactites](sheet-stalactite.png), [rust](sheet-rust.png),
[rubble](sheet-rubble.png), [boulders](sheet-boulder.png),
[crystals](sheet-crystal.png), [HC comparison](sheet-crystal-contrast.png),
and [all measured pairs and tiers](sheet.json).

`scripts/art-captures-dressing.mjs` captures SITE-4 and the existing 60 m,
150 m and 330 m checkpoints on desktop 1440×900 at backing 2 and phone
393×851. Before/after means the same A7 build with the explicit review poses
empty/populated; A7 does not yet choose placement during normal play. Detail
poses stay in known cells and do not edit geology, discovery or deposits.
Every saved frame matches a second capture one scene step later. Explicit A7
wall poses use the logical grid face and can leave a gap from T2's displaced
visual boundary; T5 owns automatic contact with those cave faces. The
capture report compares edge density, frame L*, warm share and rock variation
near the light with the board.
See the [before/after sheets and measurements](captures/README.md). The eight
canonical before/after pairs and all 14 grouped normal/HC/rust detail views are
complete. Actual generated-frame coverage is **52/52 on each form**, including
base and additive siblings. The family sheets use the full detail fields at
matched tile scale; phone group/HC views report 33.6 CSS px/tile in their
manifest, while the rust view retains its native tile scale.

Local verification follows every command in `.github/workflows/checks.yml`
`verify`, then pins the T2 checks to `field=1`, repeats the fog/render checks
with `field=0`, and checks the masked beacon in both paths. CI owns the routine
test artifacts; this folder keeps the visual sheets and measurements. The full
local `verify` job and all supplemental checks completed at
2026-11-14 22:33:22 UTC: pinned-field checks, field/retained masked-beacon probes
with both HC states, and fallback fog/render checks. Hidden comparisons stayed
at 0 px. CI status remains separate from these local results.

## Director decisions

- Confirm `facets` as the default, or select `splinter`/`shelf` by parameter.
- Confirm the darker HC crystal value and zero-energy HC sparkle.
- Confirm the motion/HC identity exceptions to the literal duplicate rule.
- Accept the documented native @2 and matched-scale tier losses, or request broader small
  facets in a later art pass.
- Boulders use scenery depth below the rig until T6 provides a foreground
  layer; this fixture does not imply that T6 is delivered.

`scene.ts` changes are limited to the review hook and its rendering hunk;
they overlap later T4/T5 integration. No other open branch was incorporated.
