"""The §9.1 capture sheets and the §9.2 table (audit F3), from art-captures.

Reads an art-captures folder (manifest.json, each frame, its HUD-free twin,
light map and exported state) and writes to --out:

    table.json, table.md    §9.2 checks per frame: game, concept, target
    sheet-<name>.png        §9.1 per frame: concept crop, game frame at the
                            concept panels' tile scale, both L* maps and the
                            L* histograms (unless --table-only)
    sheets.png              every sheet, at half size

With --history, it also compares the dark shares in pixels.json across the
nightly runs in that folder (runs.json from `gh run list`, and
<run id>/improvement/pixels.json from `gh run download`) and writes
dark-shares.json and a section of table.md.

Usage: python3 scripts/art-sheets.py --captures DIR --out DIR
       [--history DIR] [--table-only]
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import art_metrics as m  # noqa: E402

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def font(size, bold=False):
    path = FONT.replace('DejaVuSans.ttf', 'DejaVuSans-Bold.ttf') if bold else FONT
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def r1(v):
    return None if v is None else round(float(v), 1)


# metrics.py's edge density resamples to 690 px wide: the wide panels' own
# width (693 px), and the width it used for every game frame, phone included.
EDGE_WIDTH, WIDE = 690, 693


def scene_kind(g):
    """surface, shaft or cavern: the kind of concept panel the frame is
    scored against (the 330 m plate frame uses the cavern panel)."""
    return g['panel'].split('-')[0]


def measure(name, c):
    """Every §9.2 measure the harness takes on one frame."""
    dpr = c['deviceScaleFactor']
    view = c['view']
    rig = c['rig']
    full = m.load_rgb(c['file'])
    free = m.load_rgb(c['hudFree'])
    state = json.load(open(c['state']))
    panel = m.panels()[c['panel']]
    window, anchor = m.scoring_window(view, panel)
    crop = m.crop_device(free, window, dpr)
    stats = m.frame_stats(crop, np.ones(crop.shape[:2], bool))
    l = m.luma(crop)
    keep = np.zeros(free.shape[:2], bool)
    x0, y0, x1, y1 = (int(round(v * dpr)) for v in window)
    keep[y0:y1, x0:x1] = True
    out = {
        'scene': c['scene'], 'panel': c['panel'], 'backing': c['backingScale'],
        'window': [round(v, 1) for v in window], 'rig_anchor': [round(v, 3) for v in anchor],
        'target_anchor': panel['rig_anchor_fraction'],
        'frame': {**stats, 'luma_mean': r1(l.mean()), 'luma_sd': r1(l.std())},
        'regions': m.region_stats(free, state, view, dpr, rig, keep),
        'tiles_across': round(view['width'] / view['tile'], 1),
        'overlay': m.overlay_edge_share(full, free, (view['width'], view['height']), c.get('hud', [])),
    }
    if dpr == 2 and full.shape[:2] == (1800, 2880):
        grad, flat = m.mean_grad_flat(free, view['tile'] * dpr)
        out['mean_gradient'], out['flat_share'] = grad, flat
    walls = m.shaft_walls(state, rig)
    if walls:
        out['wall'] = m.wall_profile(free, view, dpr, walls)
    if c['scene'] == 'SITE-4':
        air, hard = m.cave_air_mask(state, view, dpr, free.shape[:2])
        out['boundary_axis_share'] = round(m.axis_share_excluding(air, hard), 3)
        out['boundary_axis_share_all'] = round(m.axis_share(air), 3)
        out['headlamp'] = m.headlamp_axis(free, view, dpr, rig)
    return out


def concept(panel_id):
    rgb, mask, _ = m.panel_crop(panel_id)
    l = m.luma(rgb)[mask]
    stats = m.frame_stats(rgb, mask)
    # metrics.py never scored the tall panels: keep the wide panels' px per
    # tile rather than upsample them 2.8x, which halves their edge density.
    stats['edge_density'] = round(m.edge_density(rgb, mask, width=round(EDGE_WIDTH * rgb.shape[1] / WIDE)), 3)
    return {**stats, 'luma_mean': r1(l.mean()), 'luma_sd': r1(l.std())}


def fmt(v, digits=1, pct=False):
    if v is None:
        return '—'
    if pct:
        return f'{100 * v:.{digits}f} %'
    return f'{v:.{digits}f}'


def ok(passed):
    return '' if passed is None else (' ✓' if passed else ' ✗')


ROWS = []


def row(label, target, cell):
    ROWS.append((label, target, cell))


def wall_cell(g, _):
    walls = g.get('wall')
    if not walls:
        return '—'
    # The upper probe row (3 above the rig) when it reached plain rock.
    w = walls[min(walls, key=lambda key: float(key[3:]))]
    rock, lip, under, air = w['rock_-0.4tile'], w['lip_peak'], w['undercut_min'], w['air_+0.2tile']
    return f"{rock:.0f}→{lip:.0f}→{under:.0f}→{air:.0f}{ok(lip >= rock + 55 and under <= air - 8)}"


def unknown_cell(g, _):
    u = g['regions']['unknown']
    return '—' if not u else f"{u['luma']:.1f} ({u['sd']:.1f}){ok(45 <= u['luma'] <= 65 and u['sd'] >= 7)}"


def diff_cell(key, at_least):
    def cell(g, _):
        v = g['regions'][key]
        return '—' if v is None else f'{v:+.1f}{ok(v >= at_least)}'
    return cell


def lit_cell(g, _):
    """Both clauses: lit known solid near the lamp (blank under 3 cells) and
    all known solid in the window. ✓ needs both, ✗ any measured failure."""
    r = g['regions']
    lamp, everywhere = r['known_lit_minus_unknown'], r['known_solid_minus_unknown']
    if lamp is None and everywhere is None:
        return '—'
    near = '—' if lamp is None else f'{lamp:+.1f}'
    far = '—' if everywhere is None else f'{everywhere:+.1f}'
    fails = (lamp is not None and lamp < 15) or (everywhere is not None and everywhere < 5)
    passed = False if fails else (True if lamp is not None and everywhere is not None else None)
    return f"{near} ({r['lit_cells']}) / {far}{ok(passed)}"


def frame_cell(key, digits, test=None, pct=False, kinds=None):
    """A frame statistic with the concept's in brackets; ✓/✗ only on the
    scene kinds §9.2 sets the target for."""
    def cell(g, c):
        v, cv = g['frame'][key], c[key]
        s = f'{fmt(v / 100 if pct else v, digits, pct)} ({fmt(cv / 100 if pct else cv, digits, pct)})'
        applies = test and (kinds is None or scene_kind(g) in kinds)
        return s + (ok(test(v, cv)) if applies else '')
    return cell


def warm_cell(g, c):
    """§9.2: 1.5-4 % at the surface and 2-5 % in the cavern."""
    v, cv = g['frame']['warm_pct'], c['warm_pct']
    band = {'surface': (1.5, 4), 'cavern': (2, 5)}.get(scene_kind(g))
    return f'{v:.2f} ({cv:.2f})' + (ok(band[0] <= v <= band[1]) if band else '')


row('Unknown rock luma (sd)', '45–65, sd ≥7 (G1)', unknown_cell)
row('Known lit minus unknown: near the lamp (cells) / all known solid', '≥+15 near the lamp; ≥+5 everywhere (G1)', lit_cell)
row('Unknown rock minus cave air', '≥+10 (G1)', diff_cell('unknown_minus_cave_air', 10))
row('Lit rock minus cave air (all known solid)', '≥+18 (G1)', diff_cell('solid_minus_cave_air', 18))
row('Rock sd within 3 tiles of a light', '≥15 (G1; needs art)',
    lambda g, _: '—' if not g['regions']['rock_near_light'] else f"{g['regions']['rock_near_light']['sd']:.1f}{ok(g['regions']['rock_near_light']['sd'] >= 15)}")
row('Frame L\\* mean (concept)', 'within ±4 of the concept; shaft and cavern (G1)', frame_cell('L_mean', 1, lambda v, cv: abs(v - cv) <= 4, kinds=('shaft', 'cavern')))
row('Frame luma mean (sd)', '—', lambda g, c: f"{g['frame']['luma_mean']:.1f} ({g['frame']['luma_sd']:.1f})")
row('Share within ±3 L\\* of the mode (concept)', '≤0.45; shaft (G1)', frame_cell('within3_of_mode', 3, lambda v, cv: v <= 0.45, kinds=('shaft',)))
row('p2–p98 / p98 L\\* (concept)', '≥40 / ≥54; shaft (G1; needs art)',
    lambda g, c: f"{g['frame']['L_range_p2_p98']:.1f} / {g['frame']['L_p98']:.1f} ({c['L_range_p2_p98']:.1f} / {c['L_p98']:.1f})"
    + (ok(g['frame']['L_range_p2_p98'] >= 40 and g['frame']['L_p98'] >= 54) if scene_kind(g) == 'shaft' else ''))
row('Edge density (concept)', '≥0.06; shaft and cavern (G1)', frame_cell('edge_density', 3, lambda v, cv: v >= 0.06, kinds=('shaft', 'cavern')))
row('Warm-accent share, % (concept)', '1.5–4 % surface; 2–5 % cavern (G1)', warm_cell)
row('Natural-cave boundary, axis-aligned share', '≤30 % (G1), cavern; hard rock excluded',
    lambda g, _: '—' if 'boundary_axis_share' not in g else f"{100 * g['boundary_axis_share']:.1f} %{ok(g['boundary_axis_share'] <= 0.30)}")
row('Wall profile (rock → lip → undercut → air)', 'lip ≥ rock +55; undercut ≤ air −8 (G1)', wall_cell)
row('Tile-normalised mean gradient', '≥2.5 (G1)',
    lambda g, _: '—' if 'mean_gradient' not in g else f"{g['mean_gradient']:.2f}{ok(g['mean_gradient'] >= 2.5)}")
row('Playfield within 10 luma of one value', '≤25 % (G2)',
    lambda g, _: '—' if 'flat_share' not in g else f"{100 * g['flat_share']:.1f} %{ok(g['flat_share'] <= 0.25)}")
row('Headlamp core L\\* / b\\* (0.35 tile)', '≥70 / +15 to +30 (G1), cavern',
    lambda g, _: '—' if not g.get('headlamp', {}).get('0.35tile') else f"{g['headlamp']['0.35tile']['L']:.1f} / {g['headlamp']['0.35tile']['b']:+.1f}{ok(g['headlamp']['0.35tile']['L'] >= 70 and 15 <= g['headlamp']['0.35tile']['b'] <= 30)}")
row('Overlay edge share', '≤20 % (G1)',
    lambda g, _: '—' if g['overlay']['overlay_share'] is None else f"{100 * g['overlay']['overlay_share']:.0f} %{ok(g['overlay']['overlay_share'] <= 0.20)}")
row('Framing, tiles across', 'per D1, still pending (G1)', lambda g, _: f"{g['tiles_across']:.1f}")

NOT_MEASURED = [
    ('Brightness order: lamp > rims > walls > unknown > interior and cave air', 'needs the T1 light layers'),
    ('Floor contact; walls and ceilings visual vs collision air', 'needs the T2 field geometry'),
    ('Headlamp core outside the cavern; warm accents by emitter', 'needs T1 emitters'),
    ('Objective size; HAUL; bar labels; tier badge diameter', 'HUD work (H items); DOM boxes are in the manifest'),
    ('Board inventory; prop grounding; hero props structural', 'art items and owner review'),
    ('p95 on a physical phone', 'read on a remote real device with ?debug=frametime'),
    ('Hidden information under full-frame scramble', 'F7; the inset-crop checks still run in verify'),
]


def table_markdown(results, concepts, manifest):
    names = list(results)
    head = '| Check | Target | ' + ' | '.join(f"{results[n]['scene']} ({'phone' if n.startswith('p-') else 'desktop'})" for n in names) + ' |'
    lines = [head, '|' + '---|' * (len(names) + 2)]
    for label, target, cell in ROWS:
        lines.append(f'| {label} | {target} | ' + ' | '.join(cell(results[n], concepts[results[n]['panel']]) for n in names) + ' |')
    lines += ['', 'Frames: ' + ', '.join(f"`{n}` ({results[n]['panel']}, backing {results[n]['backing']}, rig at {results[n]['rig_anchor'][0]:.2f}, {results[n]['rig_anchor'][1]:.2f} of the window against {results[n]['target_anchor'][0]}, {results[n]['target_anchor'][1]})" for n in names) + '.']
    lines += ['', 'Values in brackets are the concept panel\'s, scored at its interior minus the HUD and at least 5 px inside the border. Game values are scored on the HUD-free frame in the panel\'s window (1440×743, 1440×792 for the cavern, 393×572 and 393×608 on the phone), cropped around the rig at the panel\'s anchor and clamped to the frame. ✓ and ✗ compare with the target only on the scene kinds §9.2 sets it for (shaft, cavern or surface, by the frame\'s panel; the 330 m frame uses the cavern panel). Edge density is measured as metrics.py measured it, 690 px wide, on every game frame (its phone renders included) and on the 693 px wide panels; the tall panels, which it never scored, keep the wide panels\' px per tile. Known lit minus unknown gives lit known solid (any kind, within 2.5 tiles of the rig, with its cell count in brackets; blank under 3 cells) and then all known solid in the window; ✓ needs both clauses, ✗ any measured one failing. Lit rock minus cave air uses all known solid, as 06-prototype.md §3 did. "Rock" is solid terrain of every kind, as in 06-prototype.md §3; the rock sd row pools the kinds, so a soil and hard-rock mix raises it.']
    lines += ['', 'Not measured by the harness:', ''] + [f'- {a}: {b}.' for a, b in NOT_MEASURED]
    return '\n'.join(lines) + '\n'


def lstar_image(rgb):
    return Image.fromarray(np.clip(m.lstar(rgb) * 2.55, 0, 255).astype(np.uint8)).convert('RGB')


def histogram_image(series, size=(320, 0)):
    w = size[0]; h = size[1] or 300
    img = Image.new('RGB', (w, h), (250, 250, 247)); d = ImageDraw.Draw(img)
    pad, top = 30, 26
    d.rectangle([pad, top, w - 8, h - 24], outline=(170, 170, 165))
    peak = max(max(hist) for _, hist, _ in series) or 1
    for label, hist, color in series:
        pts = [(pad + (w - 8 - pad) * i / 99, h - 24 - (h - 24 - top) * v / peak) for i, v in enumerate(hist)]
        d.line(pts, fill=color, width=2)
    f = font(13)
    for t in (0, 25, 50, 75, 100):
        x = pad + (w - 8 - pad) * t / 100
        d.text((x - 8, h - 20), str(t), font=f, fill=(90, 90, 90))
    d.text((pad, 4), 'L* histogram', font=font(14, True), fill=(30, 30, 30))
    x = pad + 120
    for label, _, color in series:
        d.line([(x, 12), (x + 16, 12)], fill=color, width=3); d.text((x + 20, 4), label, font=f, fill=(60, 60, 60)); x += 90
    return img


def sheet(name, c, result, concept_stats):
    """§9.1 for one frame: the concept crop, the game frame at the panels' tile
    scale around the rig, both L* maps and the histograms."""
    dpr = c['deviceScaleFactor']
    view = c['view']
    p = m.panels()[c['panel']]
    crgb, cmask, _ = m.panel_crop(c['panel'])
    pw, ph = p['size']
    free = m.load_rgb(c['hudFree'])
    box, _ = m.matched_window(view, p)
    game = Image.fromarray(m.crop_device(free, box, dpr).astype(np.uint8)).resize((pw, ph), Image.LANCZOS)
    garr = np.asarray(game).astype(np.int32)
    window, _ = m.scoring_window(view, p)
    scored = m.crop_device(free, window, dpr)
    hc, _ = np.histogram(m.lstar(crgb[cmask]), bins=100, range=(0, 100))
    hg, _ = np.histogram(m.lstar(scored.reshape(-1, 3)), bins=100, range=(0, 100))
    hc = (hc / max(1, hc.sum())).tolist(); hg = (hg / max(1, hg.sum())).tolist()
    # The concept L* map dims what the statistics leave out: the HUD
    # rectangles and the band inside the panel border.
    cl = np.asarray(lstar_image(crgb)).astype(np.float64)
    cl[~cmask] = cl[~cmask] * 0.3 + np.array([238, 238, 234]) * 0.7
    tiles = [Image.fromarray(crgb.astype(np.uint8)), game, Image.fromarray(cl.astype(np.uint8)), lstar_image(garr)]
    hist = histogram_image([('concept', hc, (190, 110, 40)), ('game', hg, (40, 110, 170))], (330, ph))
    pad, head = 12, 74
    width = pad + sum(t.width + pad for t in tiles) + hist.width + pad
    img = Image.new('RGB', (width, head + ph + pad), (238, 238, 234)); d = ImageDraw.Draw(img)
    d.text((pad, 6), f"{name} · {c['scene']} · {c['panel']} · backing {c['backingScale']}", font=font(18, True), fill=(20, 20, 20))
    captions = ['concept (F0 target)', f"game, panel tile scale\n{view['width'] / view['tile']:.1f} tiles across in game",
                'concept L*\nunscored HUD and border dimmed', 'game L*']
    x = pad
    for t, cap in zip(tiles, captions):
        d.multiline_text((x, 32), cap, font=font(13), fill=(60, 60, 60), spacing=2)
        img.paste(t, (x, head)); x += t.width + pad
    img.paste(hist, (x, head))
    g = result['frame']
    d.text((x, 34), f"L* mean {g['L_mean']} (concept {concept_stats['L_mean']})", font=font(13), fill=(60, 60, 60))
    return img


def dark_shares(history):
    runs_file = os.path.join(history, 'runs.json')
    # A failed `gh run list` leaves runs.json empty or missing: no metadata.
    try:
        runs = json.load(open(runs_file))
    except (OSError, ValueError):
        runs = []
    meta = {str(r['databaseId']): r for r in runs}
    series = {}
    used = []
    for run_id in sorted(os.listdir(history), key=lambda s: -int(s) if s.isdigit() else 0):
        path = os.path.join(history, run_id, 'improvement', 'pixels.json')
        if not os.path.exists(path):
            continue
        used.append({'run': run_id, **{k: meta.get(run_id, {}).get(k) for k in ('createdAt', 'headSha')}})
        for capture, value in json.load(open(path)).items():
            series.setdefault(capture, []).append(value['darkShareBelow40'])
    rows = {k: {'values': v, 'min': min(v), 'max': max(v), 'spread_pp': round(100 * (max(v) - min(v)), 3)} for k, v in sorted(series.items())}
    return {'runs': used, 'captures': rows}


def dark_markdown(shares):
    runs = shares['runs']
    lines = ['## Dark shares across the last nightly runs', '']
    if not runs:
        return '\n'.join(lines + ['No nightly run with `improvement/pixels.json` was found.', ''])
    commits = {r['headSha'] for r in runs if r['headSha']}
    note = (f' They cover {len(commits)} commits: a change merged inside the window shows here as spread, not only run-to-run noise.'
            if len(commits) > 1 else '')
    lines += [f"{len(runs)} run(s): " + ', '.join(f"{r['run']} ({(r['createdAt'] or '')[:10]}, {(r['headSha'] or '')[:7]})" for r in runs) + '.' + note, '',
              '| Capture | Runs | Min | Max | Spread |', '|---|---|---|---|---|']
    for k, v in shares['captures'].items():
        lines.append(f"| `{k}` | {len(v['values'])} | {100 * v['min']:.3f} % | {100 * v['max']:.3f} % | {v['spread_pp']:.3f} pp |")
    return '\n'.join(lines) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--captures', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--history')
    ap.add_argument('--table-only', action='store_true')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    manifest = json.load(open(os.path.join(a.captures, 'manifest.json')))
    frames = {k: v for k, v in manifest['captures'].items() if v.get('panel')}
    results = {k: measure(k, v) for k, v in frames.items()}
    concepts = {p: concept(p) for p in sorted({v['panel'] for v in frames.values()})}
    out = {'base': manifest['base'], 'backingPin': manifest['backingPin'], 'frames': results, 'concept': concepts}
    md = '# §9.2 table\n\n' + table_markdown(results, concepts, manifest)
    if a.history:
        out['darkShares'] = dark_shares(a.history)
        md += '\n' + dark_markdown(out['darkShares'])
    json.dump(out, open(os.path.join(a.out, 'table.json'), 'w'), indent=1)
    open(os.path.join(a.out, 'table.md'), 'w').write(md)
    if not a.table_only:
        sheets = []
        for name, c in frames.items():
            img = sheet(name, c, results[name], concepts[c['panel']])
            img.save(os.path.join(a.out, f'sheet-{name}.png'), optimize=True)
            sheets.append(img)
        width = max(s.width for s in sheets)
        canvas = Image.new('RGB', (width, sum(s.height for s in sheets)), (238, 238, 234))
        y = 0
        for s in sheets:
            canvas.paste(s, (0, y)); y += s.height
        canvas.resize((canvas.width // 2, canvas.height // 2), Image.LANCZOS).save(os.path.join(a.out, 'sheets.png'), optimize=True)
    print(md)


if __name__ == '__main__':
    main()
