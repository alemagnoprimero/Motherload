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

Each layered SVG produces a 1024×384 PNG at native @2, logical 512×192.
The rasterizer honours `maxDensity: 2` inside both selected cave atlas groups,
so desktop @3 does not enlarge the strips' source pixels. Both strips remain
on the existing cave page. The source record, rasterizer and atlas metadata
are checked together; uncapped frames retain the existing density checks.

## Acceptance

| Check | Result |
| --- | --- |
| Two cool, outline-free, seeded strips | Met; both material zones in each of the three variants retain three flat tiers at native @2 and at the 44.14 px/tile review scale. Family provenance and deterministic SVG/PNG are recorded. |
| Native 1024×384 @2, logical 512×192 | Met on both @2 and @3 atlas selections; no runtime texture or loader-policy addition. |
| Horizontal period | Met; first/last columns are byte-identical, with flat seam collars. |
| Vertical period | Upright paired repeat: each parallax slot alternates far/near sources every four world rows, with opposite phase in the other slot. The complete period is eight tiles. Both transparent joins and the shared `#111f29` opaque edge match exactly. |
| Facet orientation | Both sources remain upright throughout the paired repeat, retaining the authored top-lit facets and three material tiers. No image inversion is used. |
| Silhouette duplicate check | Far/near IoU is 0/.001/0 for vaults/needles/shelves. |
| Unlit composite back-wall luma 28–42, sd ≥4 | Met: default 33.887, sd 5.940 over `#17242e`. Runtime lighting and known-air clipping are checked in T4. |
| Hard gate: texture residency | One page per density: cave @2 1088×832 = 3.453 MiB (+1.953 MiB); cave @3 1664×896 = 5.688 MiB (+2.438 MiB). Expanded runtime residency peaks at 63.64 MiB on desktop (limit 64), 36.13 MiB on the enlarged-tile phone (active limit 40), and 19.32 MiB at phone boot (limit 20). |
| Hard gates: hidden information, draws, parked uploads | Met locally: the final upright-source `verify` job and field/fallback supplements passed on the final runtime/assets source tree; information probes remain at 0 px. All 16 actual captures explicitly report the field renderer and pass settled equality, draw and texture gates. SITE-4 draws both strips with 9 calls on each form, below the phone 10 / desktop 12 limits; all parked uploads are 0. |
| Whole-frame §9.2 targets | Mixed. SITE-4 after L* 22.4 desktop / 21.0 phone meets board ±4 and rock sd 32.7 / 30.8 exceeds 15. Desktop edge density 0.081 meets 0.06; phone 0.055 does not. Warm share 0.49% / 0.97% remains below 2–5%. The six transit controls change 0 pixels; existing 330 m value/rock-sd and phone-edge shortfalls remain. |

## Review and fixtures

The three-variant review uses the cavern board at matched tile scale,
reports silhouette/tier measures, and shows horizontal and upright paired
vertical seams. Full board silhouettes are occluded; the visible-window
comparison excludes foreground occluders and is labelled as a partial reading:
.599/.593/.702 for vaults/needles/shelves. A complete board silhouette score
cannot be measured without inventing occluded geometry; the partial window
and contextual art review are the fallback.

See the [three-variant sheet](sheet-variants.png) and [measured data](sheet.json).
Its game contexts are explicitly labelled composites on captured A7 SITE-4
frames. They are art previews, not actual A8 runtime captures or T4 acceptance.
The [actual before/after sheets and §9.2 table](captures/README.md) show the
default strips in the original known SITE-4 pocket at centre (13.5,43.5),
full extent 10⅔×4 tiles. Both source frames draw on desktop and phone. These
single-band preview poses leave visible straight outer edges; they do not
prove T4 repeated coverage, clipping, parallax or runtime seam acceptance.
Facets remain upright and the rig and foreground stay clearly readable.

All 16 captures use the same build with empty/populated review poses and two
identical screenshots a scene step apart. Every manifest explicitly reports
`terrainRenderer: field`; the presence of a debug hook alone is not treated
as renderer proof. The 60/150/330 m controls are byte-identical before/after.
Desktop is 1440×900 at backing 2; phone is 393×851. SITE-4 resident textures
are 11.88 MiB desktop and 7.62 MiB phone, including the field texture; the expanded
worst-case residency is recorded above.

The final upright-source full local `verify` and all field/fallback
supplements passed on the final runtime/assets source tree, completed at 23:19 UTC. Review sheets
and measured numbers live here; CI retains routine checks. This local result
does not claim that a pull request's CI has completed.

## Director decisions

- Confirm `vaults`, or select `needles`/`shelves` by parameter.
- Confirm the upright paired repeat: profiles exchange the .25 and .5
  parallax slots every four world rows, with an eight-tile cycle. The sources
  keep their authored orientation, fixed alpha/trim bounds and existing
  atlas pages; the shared dark edge closes both opaque joins.
- T4 will use .25/.5 horizontal parallax and four ten-tile repeats around
  W01. This compresses the authored horizontal span by 6.25% to close the
  world seam; it does not change collision or the camera.
- Review the remaining whole-frame warm-share and phone edge-density gaps
  in the actual sheets. Source luma and shading-tier passes do not satisfy
  those goals. Keep the cool back-wall palette as the fallback; defer
  lighting and emitter warmth to their owners, then remeasure the full frame.
