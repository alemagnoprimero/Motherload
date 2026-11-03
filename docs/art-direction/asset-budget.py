"""Resident texture budget for the new art under decision D5 (no painted raster), decoded RGBA at 4 bytes per pixel.

Recomputes the size note in docs/ART_QUALITY_AUDIT.md §5.6 and the cave-zone projections in §7.
It starts from docs/art-audit/data/budget.py (same frame sizes, same baselines, same assumptions)
and marks every difference with CHANGED. The only change to resident memory is that on the
High tier the shader also draws hard-rock fill 23. Run: python3 docs/art-direction/asset-budget.py
"""
M = 2**20


def mib(w, h, n=1):
    return w * h * 4 * n / M


# Untrimmed @3x, every frame at its full canvas, as the §5.6 table lists the big rows.
authored = {
    "lander 1-4 (hand-written SVG)": mib(576, 432, 1 + 3 + 4) + mib(96, 108, 6),
    "ridges 12 (generator)": mib(1536, 576, 3),
    "strips 21+30, 8 strips (generator)": mib(1536, 576, 8),
    "shelf 38 as 3 pages (generator)": mib(1152, 1152, 3),
}
# CHANGED: material pages 22+29 leave the authored list. The audit's untrimmed sum counted 24 of
# them (4 bands x soil, rock x 3 variants), generated in its plan (A9, A10), not painted, and
# already dropped on the WebGL High tier. Under D5 they are shader parameters, and Medium and
# Low (Canvas) load pages baked from the same shader code. Bookkeeping only: resident memory
# does not change here.
material_pages = mib(1152, 1152, 24)
print("untrimmed @3x, authored rows:", {k: round(v, 1) for k, v in authored.items()},
      "sum", round(sum(authored.values()), 1))
print("material pages, now baked from shader code (audit's untrimmed figure):", round(material_pages, 1))

# Resident per zone with the §7 measures: one lander stage resident, emissive frames trimmed to
# about 25 %, strips and far/mid ridges at @2x density, shelf as one page plus crack decals.
surface = {
    "lander: one stage + dish + trimmed emissive": mib(576, 432, 1) + mib(96, 108, 6) + mib(576, 432, 4) * 0.25,
    "surface kit 5-11": mib(51, 174, 2) + mib(117, 216, 2) + mib(288, 58, 2) + mib(96, 15) + mib(30, 30, 2)
    + mib(144, 108, 6) + mib(120, 120, 3) + mib(120, 72, 8) + mib(360, 180, 3),
    "ridges: near @3x, far+mid @2x": mib(1536, 576, 1) + mib(1024, 384, 2),
}
hard_rock_23 = mib(159, 159, 12)  # 6 frames per band, A and C
cave_common = {
    "strips: bands B,C,D x 2 @2x density": mib(1024, 384, 6),
    "shelf: one page + 3 crack decals": mib(1152, 1152, 1) + mib(288, 288, 3),
    "wreck back/front/rust x 2 states + ribs (asset 14)": mib(1008, 288, 4) + mib(288, 348, 1),
    "beacon 3 states + 8 pulse + wall variant": mib(168, 348, 12),
    "dressing 16-20": mib(144, 144, 6) + mib(288, 174, 3) + mib(144, 144, 4) + mib(48, 96, 6)
    + mib(144, 96, 6) + mib(432, 216, 3) + mib(174, 174, 6),
    "sockets, ore+package+HC (24, 25)": mib(144, 144, 8) + mib(144, 144, 24),
}
# CHANGED: on High the shader draws hard-rock fill and cracks (23), so its frames are not resident.
cave_high = dict(cave_common)
cave_low = dict(cave_common, **{"hard-rock fill 23 (baked)": hard_rock_23})
for name, z in (("surface zone", surface), ("cave zone, High", cave_high), ("cave zone, Medium/Low", cave_low)):
    print(name, {k: round(v, 2) for k, v in z.items()}, "sum", round(sum(z.values()), 1))

# §7 projections (MiB), same baselines and assumptions as budget.py (measured fixtures:
# desktop W01 55.77, phone W01 29.55; band pages about 20 MiB desktop @3x, about 9 MiB phone @2x;
# @4x hero pages about 9 MiB; phones load @3x only for rig and ore, about 4 MiB).
field, light, phone_light = mib(640, 960), mib(720, 450), mib(295, 638)
high, low = sum(cave_high.values()), sum(cave_low.values())
desktop_high = 55.77 - 19.5 + field - 5.5 - 20 + light + high + 9
phone_high = 29.55 - 5 + field - 9 + high * (2 / 3) ** 2 + 4 + phone_light
phone_medium = 29.55 - 5 + field + low * (2 / 3) ** 2 + phone_light
print("desktop W01 cave zone, High:", round(desktop_high, 1), "(audit 53.1); keeping band pages:", round(desktop_high + 20, 1))
print("phone W01 cave zone, High:", round(phone_high, 1), "(audit 35.8); Medium without compression:",
      round(phone_medium, 1), "(audit 40.8)")
