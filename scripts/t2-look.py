"""T2 material and geometry measures (scripts/t2-field.mjs "look").

Reads the manifest scripts/art-captures.mjs wrote into the directory given
as the only argument and prints, per capture, the §9.2 rows T2 answers for:
unknown rock luma and sd, lit known rock less unknown (all kinds, and hard
rock alone), rock sd within 3 tiles of the lamp, the geometry rows on the
field's air mask (floors, pillar tops, walls and ceilings), the natural-cave
boundary's axis-aligned share in the cavern fixtures, and the frame's L*
against its concept panel's where it has one. Region rows use each cell's
interior, as art-sheets.py does (art_metrics.region_stats).
"""

import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import art_metrics as m  # noqa: E402


def measure(capture):
    dpr = capture['deviceScaleFactor']
    view = capture['view']
    state = json.load(open(capture['state']))
    free = m.load_rgb(capture['hudFree'])
    rig = capture['rig']
    rig = (rig['x'], rig['y']) if isinstance(rig, dict) else tuple(rig)
    regions = m.region_stats(free, state, view, dpr, rig)
    out = {
        'world': capture['world'],
        'terrainRenderer': capture.get('terrainRenderer'),
        'unknown': regions['unknown'],
        'lit_cells': regions['lit_cells'],
        'known_lit_minus_unknown': regions['known_lit_minus_unknown'],
        'rock_near_light': regions['rock_near_light'],
        'unknown_minus_cave_air': regions['unknown_minus_cave_air'],
    }
    # Lit hard rock alone (F4's open row): known hard-rock cells within 2.5
    # tiles of the rig, interiors, less unknown rock.
    r = m.cell_regions(state, view, dpr, free.shape[:2])
    interior = (r['FX'] >= 0.2) & (r['FX'] <= 0.8) & (r['FY'] >= 0.2) & (r['FY'] <= 0.8)
    near = np.hypot(r['CX'] + 0.5 - rig[0], r['CY'] + 0.5 - rig[1]) <= 2.5
    hard = interior & near & r['known_solid'] & (r['kind'] == 2) & ~r['ore']
    luma = m.luma(free)
    if hard.sum() > 500 and regions['unknown']:
        out['hard_lit_minus_unknown'] = round(float(luma[hard].mean()) - regions['unknown']['luma'], 1)
    if capture.get('fieldAir'):
        out['geometry'] = m.field_geometry(capture['fieldAir'], state, view)
        if capture.get('scene', '') and capture['scene'].startswith('SITE-4'):
            visual = m.visual_air(capture['fieldAir'], free.shape[:2])
            air, hard_mask = m.cave_air_mask(state, view, dpr, free.shape[:2], visual=visual)
            out['boundary_axis_share'] = round(m.axis_share_excluding(air, hard_mask), 3)
    return out


def main():
    directory = sys.argv[1]
    manifest = json.load(open(os.path.join(directory, 'manifest.json')))
    print(json.dumps({name: measure(c) for name, c in manifest['captures'].items()}))


main()
