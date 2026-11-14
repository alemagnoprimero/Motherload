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

| Check | Result / method |
| --- | --- |
| Known natural boundaries only; no hidden-content choices | Pure-planner tests use readers that throw if unknown contents are consulted, compare scrambled hidden data, and cover the wrapped seam. |
| Crystal known-ore exclusion | Every occupied source cell contributes its 3×3 neighbourhood; tests include discovery, fade-out and immediate unknown suppression. |
| 300 ms fades, HC replacement, hard caps during transitions | Behavioural tests cover partial/reversed fades and reserved outgoing slots. |
| At least 8 ceiling decals per 10 exposed edges at SITE-4 | Pure fixture plans cover 10/10 desktop and 7/7 phone-view edges; settled game counts are reported with the captures. |
| Phone 10 draw calls, texture 20/40/64 MiB, parked 0 uploads | Full local verification and the dedicated masked-beacon-plus-crystal stress case enforce these limits; ordinary SITE-4 alone is not treated as proof of the masked case. |
| Hidden-cave full-frame scramble 0 px | T4's 12-case matrix now includes real dressing and checks the reported 40/30/20 caps. Existing fog, POI, terrain scramble, Scan and fallback checks also run. |
| Full-frame art targets | Before/after SITE-4 and 60/150/330 m measurements remain explicit, including inherited shortfalls in phone edge density, band-C frame brightness, rock variation and warmth. |

`__campaignDebug.caveLayers()` reports actual drawn props and planner limits,
plus exposed/decorated ceiling counts. Its dressing switch supplies a
same-build before/after comparison while keeping T4 back walls enabled. The
source fixtures remain unchanged, and saved images require two identical
captures a scene step apart.

## Director decisions and limits

- The A7 `facets` defaults remain selected. HC crystals use body L* 42 and
  lit facet 54, with a zero-energy HC sparkle; these values need confirmation.
- Ceiling roots overlap known rock by 0.28 tile to meet the displaced field
  edge. The shortest stalactites can read as joint decals rather than long
  hanging points; the supplied art review shows their scale.
- Rust drips are static in this pass. The six particle phases are delivered
  by A7 but are not automatically emitted; adding their motion is a separate
  art choice within the same sprite cap.
- Boulders stay below the rig pending T6. T1 still owns their eventual
  lighting, as well as the remaining scene-wide warmth and brightness work.
- T4's mirrored back-wall rhythm and reflected facet-orientation shortfall
  remain visible and unchanged by placement.

The scene change only passes the renderer tier, Canvas state and HC option
to the existing cave coordinator. No T1-owned lighting/field file, foundation
view code or other open branch was incorporated.
