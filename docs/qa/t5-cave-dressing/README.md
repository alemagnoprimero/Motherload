# T5 — placement on known natural cave faces

Stack order: **A7 → A8 → T4 → T5**. This branch targets T4. W01 bands C/D
now receive the A7 kit automatically: ceiling stalactites and rust drips,
floor rubble and boulders, and floor/wall violet crystals. T2 continues to
draw its rust seams; no world generation, discovery or collision is changed.

The pure planner consumes T4's detached known-only view and A7's small JSON
catalog. Seed and canonical world coordinates choose each frame and its
priority. Unknown contents never enter the choice. The complete source
rectangle, including transparent padding and a two-device-pixel filtering
gutter, must be known. Every occupied support cell must have a known natural
air/solid boundary. Floor placement uses the outer outline's authored contact
baseline.

Crystals reject known deposits in the 3×3 neighbourhood of every occupied
cell. Discovering a nearby ore deposit fades an existing crystal out over
300 ms; eligible newly revealed props fade in over the same interval. A
footprint touching unknown cells is removed immediately, including mid-fade.
HC changes replace the crystal material immediately rather than cross-fading
through the normal value. Frozen captures and reduced motion snap fades.

## Budgets and ordering

The limit is 40 on the field path, 30 on retained WebGL, and 20 on Canvas or
Low quality. Lower backing-quality limits still apply on the field path.
Outgoing fades reserve slots, so transitions cannot exceed the current cap.
Ceiling coverage has priority over secondary props. Placement order is
stable across pooled-sprite reuse and world wrapping.

Ordinary dressing sits at depth 12, boulders at 12.2, both below ore and the rig.
Small ordinal depth offsets preserve overlap order. T6 will supply the true
foreground layer; boulders do not obscure the rig in this delivery. Crystal
siblings use the one existing additive pass and the cave atlas; there is no
new light or shader pass.

## Acceptance and evidence

| Check                                                       | Result / method                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Known natural boundaries only; no hidden-content choices    | Pure-planner tests use readers that throw if unknown contents are consulted, compare scrambled hidden data, and cover the wrapped seam.                                                                                                              |
| Crystal known-ore exclusion                                 | Every occupied source cell contributes its 3×3 neighbourhood; tests include discovery, fade-out and immediate unknown suppression.                                                                                                                   |
| 300 ms fades, HC replacement, hard caps during transitions  | Behavioural tests cover partial/reversed fades and reserved outgoing slots.                                                                                                                                                                          |
| At least 8 ceiling decals per 10 exposed edges at SITE-4    | Actual settled frames cover 11/11 desktop and 10/10 phone-view edges. Pure fixture plans separately cover 10/10 and 7/7 in their smaller test viewports.                                                                                             |
| Phone 10 draw calls, texture 20/40/64 MiB, parked 0 uploads | Full local verification and the dedicated masked-beacon-plus-crystal stress case enforce these limits; ordinary SITE-4 alone is not treated as proof of the masked case.                                                                             |
| Hidden-cave full-frame scramble 0 px                        | T4's 12-case matrix now includes real dressing and checks the reported 40/30/20 caps. Existing fog, POI, terrain scramble, Scan and fallback checks also run.                                                                                        |
| Full-frame art targets                                      | All four §9.2 metrics are measured on eight before/after pairs. Phone SITE4 edge density reaches recorded 0.060; 330 m rock sd rises above 15 in both forms. Remaining warmth, band-C frame-L* and transit-phone edge shortfalls are explicit below. |

`__campaignDebug.caveLayers()` reports actual drawn props and planner limits,
plus exposed/decorated ceiling counts. Its dressing switch supplies a
same-build before/after comparison while keeping T4 back walls enabled. The
source fixtures remain unchanged, and saved images require two identical
captures a scene step apart.

The [eight before/after pairs](captures/README.md) were captured from
unchanged runtime `4b3893661d0e996e0ff3e70f66651541a81f514a`, pinned to
`field=1` and backing 2. Desktop is 1440×900 at DPR 2; phone is 393×851 at
DPR 3. All 16 captures passed exact settled-frame, known-footprint,
crystal-deposit, resource and missing-frame checks. The maximum was nine
draws and zero parked uploads; peak fixture residency was 18.68 MiB desktop
and 12.71 MiB phone. The full residency sweep and masked stress case remain
separate checks.

| Actual after frame | Props / tier cap | Decorated / exposed ceiling anchors | Floor / wall props | Draws |
| ------------------ | ---------------- | ----------------------------------- | ------------------ | ----- |
| 330 m desktop      | 19 / 40          | 7 / 7                               | 7 / 1 left         | 6     |
| 330 m phone        | 19 / 30          | 7 / 7                               | 7 / 1 left         | 6     |
| SITE4 desktop      | 28 / 40          | 11 / 11                             | 12 / 1 right       | 9     |
| SITE4 phone        | 25 / 30          | 10 / 10                             | 10 / 1 right       | 9     |

All five A7 families appear in both 330 m forms and both SITE4 forms. The
60/150 m fixtures have no eligible C/D dressing, and their before/after
HUD-free pixels match. The [contact review](captures/contact-review.json)
independently transforms the catalog's authored floor/rotated-wall contact
into world coordinates and checks every current support cell as known
solid, with known air along the adjacent anchor strip. It reports zero
authored contact error for all 91 drawn props across the four after frames,
checking 95 support cells. These are submitted source coordinates; device
pixel snapping and the displaced field also require visual inspection.
Both full-size SITE4 frames and the 330 m specimens show attached ceiling
roots and correctly seated floor/wall pieces. The long-drip overlap noted
below remains visible.

Seven pairs have fully equal baseline and final states. Desktop 150 m
differs only by one 50 ms settle step in global/W01 elapsed time and the
corresponding 0.00315 idle energy. The inherited evidence builder preserves
raw hashes and exact scalar values, validates that drift against the
model's 0.063/s drain, and rejects every other state difference.

The unchanged §9.2 masks measure SITE4 edge density 0.081→0.086 desktop
and 0.055→0.060 phone (the helper records three decimals). Near-light rock
sd rises 32.7→37.9 and 30.8→36.2; at 330 m it rises 14.8→17.4 and
14.3→16.7, now above 15. SITE4 frame L* stays 22.4/20.9 against board
21.0. Warm coverage still misses 2–5%: SITE4 reaches only 0.51%/1.01%
and 330 m 0.12%/0.25%. The 330 m frame L* remains 26.2/27.8 against
21.0±4, and its phone edge density is 0.056. The unchanged 60/150 m
phone edges also remain below 0.06. All five T4 brightness/colour
diagnostics still pass; these lit region measurements include dressing
and are not isolated asset measurements. No measurement mask or T1
lighting was changed.

A [focused native reveal](captures/native-reveal-summary.json) used phone
`field=1&backing=2` and stopped after 39 clock steps once discovery and
completed prop fades were observed. Unknown cells decreased 2355→2322;
two new props supplied 34 smoothstep-inverted duration measurements at
300 ms, within floating-point rounding. Nineteen samples contained fades,
with at most eight props fading together and 15 props drawn against the
actual tier cap of 30. Instrumented GL/F1 draws peaked at nine, residency
at 7.62 MiB, and no page errors occurred. This verifies the scene-clock
wiring; it is not a physical-phone frame-rate measurement. Full renderer,
transition and masked-emissive coverage remains with the acceptance suite.

The dedicated masked-beacon stress check passed on phone WebGL with
`field=1`, HC off and on: **10/10 draw calls** in the masked scenes, 8 in
the lit scenes, and 5 with emissives disabled. Both hidden-cell comparisons
were **0 of 14,400 RGBA pixels changed**. Each sample held 7,989,200 resident
texture bytes (7.619 MiB), with no missing frames or page errors. This
synthetic specimen measures the masked ADD case; the full texture and
upload budgets are checked separately by the acceptance suite.

The explicit 0.5×0.5-tile crystal uses the shared known-safe centre
`(18.5,44.5)` in both fixtures and both emissive states. The existing
`reviewFrameKnown` accepted that complete footprint against both actual
settled exports, including their different known-ore sets. The runtime
check requires a drawn base at review depth 12.1 and a positive-alpha
sibling while leaving automatic dressing enabled. The existing emissive
pass needed no production change.

CI repeats this check with `EMISSIVE_CAVE_STRESS=1`, phone WebGL, both HC
states and `EMISSIVE_MAX_DRAWS=10`. Its samples, crops and exact pixel counts
are retained in `artifacts/render-cave-emissive/` in the
`improvement-evidence` artifact.

## Director decisions and limits

- The A7 `facets` defaults remain selected. HC crystals use body L* 42 and
  lit facet 54, with a zero-energy HC sparkle; these values need confirmation.
- Confirm the maximum 0.92 source scale, reduced further when needed for
  the known filtering gutter. It leaves room for the conservative footprint.
- Ceiling roots overlap known rock by 0.28 tile to meet the displaced field
  edge. The shortest stalactites can read as joint decals rather than long
  hanging points; the supplied art review shows their scale.
- Rust drips are static in this pass. The six particle phases are delivered
  by A7 but are not automatically emitted; adding their motion is a separate
  art choice within the same sprite cap.
- In the actual 330 m shallow pocket, the longest rust streaks extend across
  the nearby floor into known rock. Their ceiling roots are attached, but
  the full authored length is not clipped by that floor. Confirm this
  visible overlap; shorter drips or clipping at known floor boundaries are
  the proposed follow-up fallback. The current captures preserve it.
- Boulders stay below the rig pending T6. T1 still owns their eventual
  lighting, as well as the remaining scene-wide warmth and brightness work.
- T4's two upright source profiles exchange parallax slots every four world
  rows; placement preserves that repeat and its top-lit facet orientation.

The scene change only passes the renderer tier, Canvas state and HC option
to the existing cave coordinator. No T1-owned lighting/field file, foundation
view code or other open branch was incorporated.
