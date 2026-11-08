"""Tables for the F5 evidence, from two camera-smoke.mjs results.json files.

camera-smoke.mjs records each descent from spawn through 120 m frame by
frame on the scene clock (one frame is 50 ms): the rig's screen position,
the tile size, the rig's movement since the previous frame and the zoom
change over the last 100 ms. The rig's motion does not depend on the
camera, so the two runs' frames line up by time.

Usage: python3 docs/qa/f5-camera-transition/tables.py BEFORE.json AFTER.json
"""
import json
import sys


def descents(path):
    return {(form['name'], kind): d for form in json.load(open(path)) for kind, d in form['descents'].items()}


def frames(before, after, key, first, last):
    """Per frame from t=first to t=last, both runs side by side."""
    b = {s['t']: s for s in before[key]['samples']}
    a = {s['t']: s for s in after[key]['samples']}
    lines = ['| t (s) | rig row | rig move, CSS px: main → F5 | zoom change per 100 ms: main → F5 |', '|---|---|---|---|']
    for t in sorted(t for t in a if first <= t <= last and t in b):
        lines.append(f"| {t:.2f} | {a[t]['y']:.2f} | {b[t]['move']:.1f} → {a[t]['move']:.1f} | "
                     f"{100 * b[t]['zoom100']:.2f} % → {100 * a[t]['zoom100']:.2f} % |")
    return '\n'.join(lines)


def main():
    before, after = descents(sys.argv[1]), descents(sys.argv[2])
    out = ['## Worst frame per descent', '',
           '| Form | Descent | Frames | Rig move, CSS px per 50 ms: main → F5 | Zoom change per 100 ms: main → F5 |',
           '|---|---|---|---|---|']
    for key in after:
        b, a = before[key]['worst'], after[key]['worst']
        out.append(f"| {key[0]} | {key[1]} | {len(after[key]['samples'])} | {b['move']:.1f} → {a['move']:.1f} | "
                   f"{100 * b['zoom100']:.2f} % → {100 * a['zoom100']:.2f} % |")
    out += ['', 'Limits: 40 CSS px per 50 ms; 3 % per 100 ms.', '',
            '## Desktop drop through the surface blend', '',
            'The rig falls from spawn (row −0.36) down the open seam column; the blend spans rows −0.4 to 1.6 on F5 (0 to 4 on main).', '',
            frames(before, after, ('desktop', 'drop'), 0, 1.6), '',
            '## Desktop drill through 120 m', '',
            'The rig drills down from spawn; on main the zoom target stepped from 1.0 to 1.05 past 120 m, and F5 blends it over 100 to 140 m.', '']
    drill = [s for s in before[('desktop', 'drill')]['samples']]
    peak = max(drill, key=lambda s: s['zoom100'])['t']
    out += [frames(before, after, ('desktop', 'drill'), round(peak - 0.6, 2), round(peak + 0.6, 2)), '']
    print('\n'.join(out))


if __name__ == '__main__':
    main()
