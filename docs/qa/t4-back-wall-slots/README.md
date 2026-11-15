# T4 — known natural-cave back-wall slots

Stack order: **A7 → A8 → T4 → T5**. This branch targets A8. The two A8
strips now draw automatically in known natural air in W01 band C. Dug air
keeps T2's recessed strata. Collision, world generation and save data are
unchanged.

`createKnownCaveView` builds a detached snapshot through T2's existing
`DiscoveredWorldView`: current and pristine contents are read only after
discovery is checked, and deposit status is checked only in known cells.
The pristine copy uses the saved seed and generator version. An unavailable
pristine copy yields no decorated natural air. The cave planner receives no
raw tile, package, site or hazard arrays.

## Drawing and motion

T2's field quad includes opaque cave air, so the slots use depths 10.10/10.11
immediately above that quad and below every prop and the light map. Their
quads are cropped to known natural interiors, inset 0.30 tile beside every
non-natural cardinal or diagonal neighbour. This exceeds the field's 0.28
displacement reach and preserves its rock/lip. No field shader or lighting
code changes.

Horizontal phase depends on world position and camera position, with
parallax factors .25/.5. W01 has four ten-tile repeats; returning a world
width later preserves phase exactly. The authored 10⅔-tile width is therefore
compressed 6.25%. Vertical position is fixed to world rows, four tiles per
source with the two upright sources alternating: far/near in layer 0 and
near/far in layer 1, for an eight-tile vertical period. Each layer retains
its own parallax factor. Matching source-edge colours make the vertical
joins continuous without reflecting facets or adding another atlas page.

Newly revealed cells fade for 300 ms on the scene clock. Newly permitted
margins in already-known neighbours inherit that reveal's alpha, so they do
not pop in. Equal-alpha pieces are coalesced; even an adversarial alternating
phone reveal stays below 512 back-wall quads in the tested fixture. Frozen
captures and reduced motion snap the fade. Parked frames only reuse sprites
and crop/alpha state; they do not update textures.

The common image pool resets its crop before reuse. Full-source crop
coordinates account for atlas trimming and native density. Empty trim
intersections are skipped, and all source transforms stay upright.

## Acceptance and evidence

| Check                                                                        | Result / method                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Natural versus dug, known cells only                                         | Detached adapter and adversarial unreadable-hidden-array tests.                                                                                                                                                                                                                                                                  |
| Seeded world-position phase, wrapped seam                                    | Unit checks cover a complete world lap and alternating upright source-edge continuity.                                                                                                                                                                                                                                           |
| 300 ms reveal and neighbour-margin fade                                      | Behavioural tests cover new cells, new margins, reset, frozen and reduced-motion clocks. Native phone movement also measured 731 cell-centre fade slopes per renderer at 300 ms, with 70 fragments fading simultaneously.                                                                                                        |
| Hidden-cave scramble                                                         | New `T2_CHECKS=caves` compares full frames and the actual rendered plans in 12 cases: desktop/phone × pinned field/retained WebGL/Canvas × Scan off/on. It changes every hidden current/pristine input to the new cave adapter without changing simulation or discovery. Existing fog, POI and terrain scramble checks also run. |
| Phone 10 draw calls, boot 20/active 40 MiB, desktop 64 MiB, parked 0 uploads | Existing render/memory/masked-beacon checks plus targeted cave captures; no new texture or stencil pass. A8 expanded residency peaks at 63.64 MiB desktop and 36.13 MiB phone.                                                                                                                                                   |
| Back-wall luma 28–42 and sd ≥4; brightness ordering                          | Actual SITE4 field frames pass all five masked-region targets on desktop and phone: luma 33.0/33.5, sd 12.0/12.8, unknown-minus-air 25.6/29.2, known-solid-minus-air 60.1/63.9, and mean air b* −7.6/−7.7 below rock −3.8. These sample the existing known-air interiors in the lit game frame, not an isolated strip mask.      |

The new caves check is part of the `verify` job, the default T2 suite and
the Firefox/WebKit T2 workflow lists.
Its artifacts use `artifacts/render-caves`, retained by the existing workflow
upload. Ordinary HUD is hidden during its pixel comparison; Scan annotations
remain visible. Positive layer counts prevent an empty renderer from passing.
The test keeps the annotation root on a consistent compositor layer: an
unchanged-input control exposed one-level rounding changes in Chromium's
rotated HOME arrow. Labels, geometry and Scan stay visible and unchanged.
Every case now also requires an unchanged-input full-frame control to match
at exactly 0 pixels before the hidden-input comparison.
After each Scan change, the harness requires annotation plans and active HUD
obstacle geometry to remain identical for at least 300 ms, sampled every 50 ms
with a bounded timeout. Scan reveals the return-reserve advisory on the HUD's
100 ms update; the annotation solver's 120 ms obstacle cache can then lag that
new box. Two screenshots only 50 ms apart could capture the temporary HOME
label position. The wait observes the real layout; it neither freezes nor
hides annotations, and both exact-zero pixel checks remain mandatory.

`__campaignDebug.caveLayers()` reports the last rendered fragments. Its
`backWalls` switch supplies same-build before/after fixtures; its hidden-input
override exists only for the adversarial render test. No option mutates the
campaign.

The [eight before/after pairs](captures/README.md) use the unchanged runtime
at `992901d5930f0c29a2a01537579a89e81eb607bd`, pinned `field=1`, backing 2,
desktop 1440×900 at DPR 2 and phone 393×851 at DPR 3. All 16 screenshots
passed exact settled-frame checks, actual known-air/crop checks, no missing
frames, zero parked uploads and the resource limits. The maximum was nine
draws; peak fixture residency was 18.68 MiB desktop and 12.71 MiB phone.
These fixture numbers do not replace the wider residency sweep above.

The broader §9.2 targets remain explicit: SITE4 warm coverage is only
0.49% desktop and 0.97% phone against 2–5%; phone edge density is 0.055
against 0.06. At 330 m, frame L* remains 26.2/27.8 against board 21.0±4,
and near-light rock sd is 14.8/14.3 against 15. Back-wall placement does
not resolve those foreground/lighting shortfalls; the measurement masks and
T1-owned rendering are unchanged.

Two desktop pairs differ by one ordinary 50 ms asynchronous settle step.
Their only state differences are global elapsed time, W01 record elapsed
time and idle energy (0.00315 at the model's 0.063/s drain). The evidence
authenticates the original raw files and hashes, reports those exact scalar
values and verifies every other baseline/final state field strictly. It
also rejects elapsed drift beyond one recorded step, inconsistent idle
energy, or any change in hidden worlds, discovery, deposits, pose or hull.
Six pairs have fully equal baseline and final states.

A separate [native phone reveal run](captures/native-reveal-summary.json)
restored SITE4 with distant cells unknown, then moved up/right/left through
actual discovery. Both pinned
field and retained renderers reduced unknown cells from 2355 to 2281 and
showed 124 fade frames, with at most 156 actual back-wall fragments. Across
731 consecutive cell-centre samples each, the inferred fade duration was
0.300000000000000 s within floating-point rounding. Actual instrumented
draws peaked at 9/8 and residency at 7.62/25.32 MiB respectively; both runs
had no page errors. This checks the running scene-clock wiring separately
from the frozen canonical captures.

## Director decisions and limits

- Confirm .25/.5 parallax and the 6.25% horizontal compression needed for the
  chosen world-periodic phase.
- Confirm the conservative 0.30-tile inset. It keeps field edges intact and
  leaves visible rectangular/plain-air collars beside narrow cavities and
  the small SITE4 pedestal in both actual desktop and phone frames. The
  lower cavern also returns to broad plain air outside the eligible rows.
  These are visible limitations of the conservative crop, not a claim of
  seamless art integration. An unavailable pristine view or unsafe margin
  keeps the existing plain-air/terrain rendering.
- Confirm the eight-tile vertical rhythm from alternating upright source
  pairs. It preserves authored facet orientation and the existing texture
  budget; each layer keeps its own parallax factor as its source changes.
- The new slots do not supply T1 lighting or T5 foreground dressing.

Scene integration is one coordinator call plus its state/debug/reset and
pooled-crop reset. It overlaps the later T5 hunk; no other open branch or
T1-owned field/lighting code was incorporated.
