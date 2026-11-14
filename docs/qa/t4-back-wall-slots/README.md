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

| Check | Result / method |
| --- | --- |
| Natural versus dug, known cells only | Detached adapter and adversarial unreadable-hidden-array tests. |
| Seeded world-position phase, wrapped seam | Unit checks cover a complete world lap and alternating upright source-edge continuity. |
| 300 ms reveal and neighbour-margin fade | Behavioural tests cover new cells, new margins, reset, frozen and reduced-motion clocks. |
| Hidden-cave scramble | New `T2_CHECKS=caves` compares full frames and the actual rendered plans in 12 cases: desktop/phone × pinned field/retained WebGL/Canvas × Scan off/on. It changes every hidden current/pristine input to the new cave adapter without changing simulation or discovery. Existing fog, POI and terrain scramble checks also run. |
| Phone 10 draw calls, boot 20/active 40 MiB, desktop 64 MiB, parked 0 uploads | Existing render/memory/masked-beacon checks plus targeted cave captures; no new texture or stencil pass. A8 expanded residency peaks at 63.64 MiB desktop and 36.13 MiB phone. |
| Back-wall luma 28–42 and sd ≥4; brightness ordering | Runtime frame measurements are pending the final before/after captures. A8's source-composite measurements are recorded in its own evidence and are not substituted for a lit runtime measurement. |

The new caves check is part of the `verify` job, the default T2 suite and
the Firefox/WebKit T2 workflow lists.
Its artifacts use `artifacts/render-caves`, retained by the existing workflow
upload. Ordinary HUD is hidden during its pixel comparison; Scan annotations
remain visible. Positive layer counts prevent an empty renderer from passing.

`__campaignDebug.caveLayers()` reports the last rendered fragments. Its
`backWalls` switch supplies same-build before/after fixtures; its hidden-input
override exists only for the adversarial render test. No option mutates the
campaign.

## Director decisions and limits

- Confirm .25/.5 parallax and the 6.25% horizontal compression needed for the
  chosen world-periodic phase.
- Confirm the conservative 0.30-tile inset. It keeps field edges intact and
  can leave a plain-air collar beside narrow cave boundaries.
- Confirm the eight-tile vertical rhythm from alternating upright source
  pairs. It preserves authored facet orientation and the existing texture
  budget; each layer keeps its own parallax factor as its source changes.
- The new slots do not supply T1 lighting or T5 foreground dressing.

Scene integration is one coordinator call plus its state/debug/reset and
pooled-crop reset. It overlaps the later T5 hunk; no other open branch or
T1-owned field/lighting code was incorporated.
