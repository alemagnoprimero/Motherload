# Resident texture budget for the new art, decoded RGBA (4 B/px), from the §5.6 asset table sizes at @3x.
M = 2**20
def mib(w, h, n=1): return w * h * 4 * n / M
full = {  # every frame at its full canvas, as the table lists it (no trimming)
 'lander 1-4': mib(576,432,1+3+4) + mib(96,108,6),
 'ridges 12': mib(1536,576,3),
 'strips 21+30 (8 strips)': mib(1536,576,8),
 'shelf 38 (3 pages)': mib(1152,1152,3),
 'materials 22+29 (4 bands x 2 x 3 var)': mib(1152,1152,24),
}
print('untrimmed @3x:', {k: round(v,1) for k,v in full.items()}, 'sum', round(sum(full.values()),1))
# Resident per zone with the measures proposed in §7: one lander stage resident, emissive frames trimmed to ~25 %,
# back-wall strips and far/mid ridges shipped at @2x density (low-frequency, behind darkness), shelf as one page +
# crack decals, no material pages on the WebGL High tier.
surface = {
 'lander: one stage + dish + trimmed emissive': mib(576,432,1) + mib(96,108,6) + mib(576,432,4)*0.25,
 'surface kit 5-11': mib(51,174,2)+mib(117,216,2)+mib(288,58,2)+mib(96,15)+mib(30,30,2)+mib(144,108,6)+mib(120,120,3)+mib(120,72,8)+mib(360,180,3),
 'ridges: near @3x, far+mid @2x': mib(1536,576,1) + mib(1024,384,2),
}
cave = {
 'strips: bands B,C,D x 2 @2x density': mib(1024,384,6),
 'shelf: one page + 3 crack decals': mib(1152,1152,1) + mib(288,288,3),
 'wreck back/front/rust x 2 states + ribs (asset 14, 7x2 cells)': mib(1008,288,4) + mib(288,348,1),
 'beacon 3 states + 8 pulse + wall variant': mib(168,348,12),
 'dressing 16-20': mib(144,144,6)+mib(288,174,3)+mib(144,144,4)+mib(48,96,6)+mib(144,96,6)+mib(432,216,3)+mib(174,174,6),
 'inclusions, sockets, ore+package+HC': mib(159,159,12)+mib(144,144,8)+mib(144,144,24),
}
for name, z in (('surface zone', surface), ('cave zone', cave)):
    print(name, {k: round(v,2) for k,v in z.items()}, 'sum', round(sum(z.values()),1))
print('field texture W01 640x960', round(mib(640,960),2), 'W02 768x1600', round(mib(768,1600),2))
print('quarter-res light 720x450', round(mib(720,450),2), '; full-frame target 2880x1800', round(mib(2880,1800),1))

# §7 projections (MiB). Baselines are the recorded render-memory fixtures (docs/IMPROVEMENT_PROGRESS.md:52-54):
# desktop W01 middle 55.77, phone W01 middle 29.55. Terrain-buffer and duplicate-atlas sizes are from 05-tech.md.
# Assumptions (estimates, to be measured): resident band pages about 20 MiB on desktop @3x and about 9 MiB on
# phones @2x (current band plus neighbours); @4x hero pages for rig, ore and hero props about 9 MiB; phones load
# @3x only for rig and ore (about 4 MiB).
cave_new = sum(cave.values())
desktop_high = 55.77 - 19.5 + mib(640, 960) - 5.5 - 20 + mib(720, 450) + cave_new + 9
print('desktop W01 cave zone, High tier:', round(desktop_high, 1), '; keeping band pages:', round(desktop_high + 20, 1))
phone_light = mib(295, 638)  # quarter resolution of 393x851 at DPR 3
phone_high = 29.55 - 5 + mib(640, 960) - 9 + cave_new * (2 / 3) ** 2 + 4 + phone_light
phone_medium = 29.55 - 5 + mib(640, 960) + cave_new * (2 / 3) ** 2 + phone_light
print('phone W01 cave zone, High:', round(phone_high, 1), '; Medium without compression:', round(phone_medium, 1))
