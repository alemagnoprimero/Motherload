"""Art item A12 with T9: the review sheet for the ore sockets, ore frames and
tier marks, beside the board's shaft crop at the board's tile scale.

Reads the review.json that scripts/art-review-a12.mjs writes and lays out:
the board's shaft-wide crop (copper and silver ores in it), then each socket
variant's panel at the same px per tile (and the ores with no socket), each
with its measures; then the panels at the @2x page scale; then the frames.

Measures (written to OUT/sheet.json as well):
- shading tiers per zone (scripts/art_tiers.py, pixel reading): each ore's
  body at 4x without its mark; each socket variant over the band means of
  W01 band A soil, band B rock and band C rock, in the decal's own zone
  (socket alpha >= SOCKET_ALPHA), and, for information, what stays visible
  round each ore (the same zone minus the ore, alpha < 8);
- the socket's values on each band (lip, recess, contact shadow), against
  the unknown-rock and cave-air values it must stay clear of;
- alpha IoU between the socket variants (masks alpha >= SOCKET_ALPHA, in
  place: one frame size, one origin), between ore-o1..o4 and between
  package-o1..o4 at @2x (alpha > 127, art-review.py's alpha_iou);
- the tier mark: diameter over the frame (structural and in pixels), the
  share of the disc lying on the ore (frame rendered without the mark,
  alpha >= 128), the darkest-light check on the disc's rim (no ring), and the
  high-contrast mark's L* against copper's body.

Reuses scripts/art-review.py (alpha_iou, opaque, fonts) through importlib.

Usage: python3 scripts/art-review-a12.py REVIEW.json OUT_DIR
"""
import importlib.util
import json
import os
import sys
from itertools import combinations

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import art_metrics as m  # noqa: E402
import art_tiers as tiers  # noqa: E402

spec = importlib.util.spec_from_file_location('art_review', os.path.join(HERE, 'art-review.py'))
ar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ar)

ROOT = os.path.dirname(HERE)
SOCKET_ALPHA = 12  # about 5 %: under the faintest layer a socket uses (the lip, 7.5 %)
BANDS = [('band A soil', 'w01-a-soil'), ('band B rock', 'w01-b-rock'), ('band C rock', 'w01-c-rock')]
# Values the recess must stay clear of (§6.1 key; scene.ts unknown fill).
UNKNOWN_L, AIR_L = 24.0, 15.0


def lstar(rgb):
    L, _, _ = m.lab(np.asarray(rgb, float).reshape(-1, 3))
    return np.asarray(L)


def band_mean(name):
    px = np.asarray(Image.open(os.path.join(ROOT, 'assets/campaign/generated/bands', f'{name}-2x.png'))
                    .convert('RGB'))[::4, ::4].reshape(-1, 3).astype(float)
    return px.mean(0)


def load(base, rel):
    return Image.open(os.path.join(base, rel)).convert('RGBA')


def composite_cell(socket, ore, colour, size=384):
    """Socket (1 tile) and ore (0.9 tile, centred) over a flat colour."""
    cell = Image.new('RGBA', (size, size), tuple(int(round(c)) for c in colour) + (255,))
    if socket is not None:
        cell.alpha_composite(socket.resize((size, size), Image.Resampling.LANCZOS))
    ore_alpha = np.zeros((size, size), np.int32)
    if ore is not None:
        inner = int(round(size * 0.9))
        small = ore.resize((inner, inner), Image.Resampling.LANCZOS)
        offset = (size - inner) // 2
        cell.alpha_composite(small, (offset, offset))
        ore_alpha[offset:offset + inner, offset:offset + inner] = np.asarray(small)[..., 3]
    return cell, ore_alpha


def ore_measures(base, review):
    out = {}
    for ore in review['ores']:
        tier = ore['tier']
        body = load(base, f'x4/ore-o{tier}-nomark.png')
        alpha = np.asarray(body)[..., 3]
        result = tiers.pixel_tiers(body, zones={ore['zone']: alpha >= 250})[ore['zone']]
        svg = os.path.join(ROOT, f'assets/campaign/source/ore-o{tier}.svg')
        structural = tiers.svg_tiers(svg).get(ore['zone'], {'tiers': []})
        out[f'ore-o{tier}'] = {'zone': ore['zone'], 'tiers': len(result['tiers']), 'levels': result['tiers'],
                               'structural': len(structural['tiers']),
                               'structuralLevels': structural['tiers']}
    return out


def disc_geometry(shape, g):
    k = shape[0] / 96
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    return k, np.hypot((xx + 0.5) / k - g['cx'], (yy + 0.5) / k - g['cy'])


def mark_measures(base, review):
    """Per world, tier and frame: the mark's size (structural and the dark
    disc's measured span), the share of the disc lying on the drawing (frame
    without the mark, alpha >= 128), the rim inside the disc and the
    right-and-below quarter outside it (no light ring), and the
    high-contrast mark's light share and value against copper's body."""
    out = {}
    # Copper's body: the body facet's tone (the board's ore_copper), and the
    # median of every copper facet pixel, as check-render-assets.mjs reads it.
    body_L = round(float(lstar(tiers.hex_rgb(review['ores'][1]['tones']['body']))[0]), 1)
    copper = np.asarray(load(base, 'ore-o2-nomark.png')).astype(float)
    cl = tiers.lab_image(copper[..., :3])
    chroma = np.hypot(cl[..., 1], cl[..., 2])
    median_L = round(float(np.median(cl[..., 0][(copper[..., 3] >= 245) & (chroma > 12) & (cl[..., 0] > 20)])), 1)
    for world, prefix, key in (('W01', '', 'mark'), ('W02', 'w02-', 'markW02')):
        for ore in review['ores']:
            tier, g = ore['tier'], ore[key]
            for family in ('ore', 'package'):
                name = f'{prefix}{family}-o{tier}'
                px = np.asarray(load(base, f'x4/{name}.png')).astype(float)
                bare_px = np.asarray(load(base, f'x4/{name}-nomark.png'))
                bare = bare_px[..., 3]
                k, dist = disc_geometry(px.shape, g)
                L = lstar(px[..., :3]).reshape(px.shape[:2])
                dark = (px[..., 3] >= 128) & (L <= 30)
                # The dark disc's span: from the centre along the rays right
                # and down (away from the drawing), past the glyph.
                cy, cx = int(g['cy'] * k), int(g['cx'] * k)
                def reach(dy, dx):
                    step, edge = int(0.6 * g['r'] * k), 0
                    while 0 <= cy + dy * step < px.shape[0] and 0 <= cx + dx * step < px.shape[1] \
                            and dark[cy + dy * step, cx + dx * step]:
                        edge = step
                        step += 1
                    return (edge + 0.5) / k
                span = 2 * max(reach(0, 1), reach(1, 0)) / 96
                rim = (dist >= g['r'] - 1.5) & (dist <= g['r'] - 0.25) & (px[..., 3] >= 245)
                yy, xx = np.mgrid[0:px.shape[0], 0:px.shape[1]]
                angle = np.degrees(np.arctan2((yy + 0.5) / k - g['cy'], (xx + 0.5) / k - g['cx']))
                outside = (dist >= g['r'] + 0.5) & (dist <= g['r'] + 2.5) & (angle >= 0) & (angle <= 90) \
                    & (px[..., 3] >= 128)
                outside_L = L[outside]
                out[name] = {'world': world,
                             'overlap': round(float((bare[dist <= g['r']] >= 128).mean()), 3),
                             'diameter': round(2 * g['r'] / 96, 3),
                             'pixelSpan': round(float(span), 3),
                             'rimL95': round(float(np.percentile(L[rim], 95)), 1),
                             'outsideLightPx': int((outside_L > 30).sum())}
            hc = np.asarray(load(base, f'x4/{prefix}tier-mark-hc-{tier}.png')).astype(float)
            k, dist = disc_geometry(hc.shape, g)
            inner = (dist <= g['r'] - 2) & (hc[..., 3] >= 245)
            hcL = lstar(hc[..., :3][inner])
            disc_L = float(np.median(hcL))
            out[f'{prefix}tier-mark-hc-{tier}'] = {
                'world': world, 'discL': round(disc_L, 1), 'lightShare': round(float((hcL >= 85).mean()), 3),
                'copperBodyL': body_L, 'dL': round(disc_L - body_L, 1), 'copperMedianL': median_L,
                'dLMedian': round(disc_L - median_L, 1)}
    return out


def iou_measures(base, review):
    def masks(names, threshold, scale='x1'):
        out = {}
        for name in names:
            alpha = np.asarray(load(base, review['frames'][name][scale] if name in review['frames']
                                    else name))[..., 3]
            out[name] = alpha >= threshold
        return out
    result = {}
    sockets = {v['variant']: np.asarray(load(base, v['socket']))[..., 3] >= SOCKET_ALPHA
               for v in review['variants']}
    result['sockets'] = {f'{a}/{b}': ar.alpha_iou(sockets[a], sockets[b]) for a, b in combinations(sockets, 2)}
    for family in ('ore', 'package'):
        for suffix in ('', '-nomark'):
            frames = masks([f'{family}-o{t}{suffix}' for t in range(1, 5)], 128)
            tag = lambda name: name.split('-')[1]  # noqa: E731  ore-o2-nomark -> o2
            result[f'{family}{suffix}'] = {f'{tag(a)}/{tag(b)}': ar.alpha_iou(frames[a], frames[b])
                                           for a, b in combinations(frames, 2)}
    return result


def socket_measures(base, review):
    """Per variant and band: the socket's tiers over the block (the decal's own
    zone: socket alpha >= SOCKET_ALPHA), the tiers left visible round each ore
    (the same zone minus the ore), the lip, recess and shadow values against
    the block, and the translucency figures the asset check gates."""
    out = {}
    ores = [load(base, f'x4/ore-o{t}.png') for t in range(1, 5)]
    for v in review['variants']:
        socket = load(base, v['socket4'])
        record = {}
        for label, name in BANDS:
            colour = band_mean(name)
            bare, _ = composite_cell(socket, None, colour)
            s_alpha = np.asarray(socket.resize(bare.size, Image.Resampling.LANCZOS))[..., 3]
            zone = s_alpha >= SOCKET_ALPHA
            own = tiers.pixel_tiers(bare, zones={'socket': zone}, keep_outline=True)['socket']['tiers']
            by_ore = []
            for ore in ores:
                cell, ore_alpha = composite_cell(socket, ore, colour)
                result = tiers.pixel_tiers(cell, zones={'socket': zone & (ore_alpha < 8)}, keep_outline=True)['socket']
                by_ore.append(len(result['tiers']))
            Ls = lstar(np.asarray(bare)[..., :3]).reshape(s_alpha.shape)
            block_L = float(lstar(colour)[0])
            levels = [L for L, _ in own]
            named = {}
            if levels:
                named = {'shadowDL': round(levels[0] - block_L, 1), 'lipDL': round(levels[-1] - block_L, 1)}
                if len(levels) >= 3:
                    named['recessDL'] = round(levels[1] - block_L, 1)
            record[label] = {'tiers': len(own), 'levels': own, 'tiersByOre': by_ore, 'blockL': round(block_L, 1),
                             **named,
                             'darkestL': round(float(np.percentile(Ls[zone], 1)), 1),
                             'lightestL': round(float(np.percentile(Ls[zone], 99)), 1),
                             'aboveUnknown': round(float(np.percentile(Ls[zone], 1)) - UNKNOWN_L, 1)}
        alpha = np.asarray(load(base, v['socket']))[..., 3]
        record['coverage'] = round(float((alpha >= SOCKET_ALPHA).mean()), 3)
        record['maxAlpha'] = int(alpha.max())
        record['shareAbove160'] = round(float((alpha > 160).mean()), 4)
        out[v['variant']] = record
    return out


# ---------------------------------------------------------------- the sheet
def text_block(draw, x, y, lines, width, size=14):
    f = ar.font(size)
    for line in lines:
        colour = ar.INK
        if isinstance(line, tuple):
            line, colour = line
        draw.text((x, y), line, fill=colour, font=f)
        y += size + 5
    return y


def sheet(review, base, measures, out_dir):
    Z = 2  # nearest-neighbour zoom for the board-scale row
    board = Image.open(os.path.join(ROOT, review['board']['file'])).convert('RGB').crop(tuple(review['board']['crop']))
    panels = [('Board: d0-target-shaft-wide.png', board.convert('RGBA'))]
    panels.append(('No socket (ores only)', load(base, review['none'])))
    for v in review['variants']:
        tag = ' (default)' if v['variant'] == review['default'] else ''
        panels.append((f"Socket: {v['variant']}{tag}", load(base, v['panel'])))
    gap, pad = 24, 24
    widths = [p.width * Z for _, p in panels]
    W = pad * 2 + sum(widths) + gap * (len(panels) - 1)
    page_panels = [(v['variant'], load(base, v['page'])) for v in review['variants']]
    H = 2400
    canvas = Image.new('RGB', (max(W, 1800), H), ar.PAPER)
    draw = ImageDraw.Draw(canvas)
    draw.text((pad, 14), 'A12 with T9: ore sockets, ore frames and tier marks at the board\'s tile scale '
              f'({review["tile"]:.2f} px per tile, shown at {Z}x nearest)', fill=ar.INK, font=ar.font(20, True))
    x, y0 = pad, 52
    bottom = y0
    rows = [r['label'] for r in review['rows']]
    for index, (title, image) in enumerate(panels):
        draw.text((x, y0), title, fill=ar.INK, font=ar.font(15, True))
        big = image.resize((image.width * Z, image.height * Z), Image.Resampling.NEAREST)
        canvas.paste(big.convert('RGB'), (x, y0 + 24))
        y = y0 + 30 + big.height
        if index == 0:
            lines = ['Copper (top left) and silver ores (left,', 'right of the rig): dark disc, light glyph,',
                     'no ring; a lit rim above, a shadow below.']
        elif index == 1:
            lines = ['Rows: ' + rows[0] + ',', rows[1] + ', ' + rows[2] + ',', rows[3] + '.',
                     'Columns: O1..O4, a relic deposit, the socket', 'alone (HC row: a package over the back wall).']
        else:
            v = review['variants'][index - 2]
            s = measures['sockets'][v['variant']]
            lines = []
            for label, _ in BANDS:
                b = s[label]
                ok = b['tiers'] >= 3
                lines.append((f"{label}: {b['tiers']} tiers (round O1..O4: {'/'.join(map(str, b['tiersByOre']))}), "
                              f"lip {b.get('lipDL', 0):+.1f}, shadow {b.get('shadowDL', 0):+.1f} L* "
                              f"(block {b['blockL']})", ar.PASS if ok else ar.FAIL))
            lines.append(f"coverage {s['coverage']:.0%} of the cell, max alpha {s['maxAlpha']}")
            darkest = min(s[label]['darkestL'] for label, _ in BANDS)
            lines.append((f'darkest {darkest} vs unknown rock {UNKNOWN_L:.0f}, air {AIR_L:.0f}',
                          ar.PASS if darkest >= UNKNOWN_L else ar.FAIL))
        bottom = max(bottom, text_block(draw, x, y, lines, big.width, 13))
        x += big.width + gap
    # IoU and marks
    y = bottom + 16
    iou = measures['iou']
    draw.text((pad, y), 'Alpha IoU', fill=ar.INK, font=ar.font(16, True))
    y += 24
    lines = ['Socket variants (alpha >= %d, in place): ' % SOCKET_ALPHA +
             ', '.join(f'{k} {v:.3f}' for k, v in iou['sockets'].items())]
    for family in ('ore', 'package'):
        values = iou[family]
        worst = max(values.values())
        lines.append((f'{family}-o1..o4 at @2x (alpha > 127, as shipped): ' +
                      ', '.join(f'{k} {v:.3f}' for k, v in values.items()) + f'; max {worst:.3f} (<= 0.70)',
                      ar.PASS if worst <= 0.70 else ar.FAIL))
    y = text_block(draw, pad, y, lines, W, 14) + 10
    draw.text((pad, y), 'Tier mark (oreMarkGeometry: r 8 in the 96 frame, centres per world)', fill=ar.INK,
              font=ar.font(16, True))
    y += 24
    marks = measures['marks']
    lines = []
    for world, prefix in (('W01', ''), ('W02', 'w02-')):
        for t in range(1, 5):
            o, p = marks[f'{prefix}ore-o{t}'], marks[f'{prefix}package-o{t}']
            hc = marks[f'{prefix}tier-mark-hc-{t}']
            good = (o['diameter'] <= 0.18 and o['pixelSpan'] <= 0.18 and p['pixelSpan'] <= 0.18
                    and 0.2 <= o['overlap'] <= 0.4 and 0.2 <= p['overlap'] <= 0.4 and o['rimL95'] <= 30
                    and o['outsideLightPx'] == 0 and p['outsideLightPx'] == 0 and hc['dL'] >= 20)
            lines.append((f"{world} O{t} {review['ores'][t - 1]['glyph']}: diameter {o['diameter']:.3f} "
                          f"(pixels {o['pixelSpan']:.3f}) of the frame; on the ore {o['overlap']:.0%} "
                          f"(package {p['overlap']:.0%}); rim L* p95 {o['rimL95']}, light px outside "
                          f"{o['outsideLightPx'] + p['outsideLightPx']} (no ring); HC disc L* {hc['discL']} "
                          f"({hc['lightShare']:.0%} light) vs copper body {hc['copperBodyL']} (dL {hc['dL']:+.1f})",
                          ar.PASS if good else ar.FAIL))
    ores = measures['ores']
    lines.append('Ore shading tiers (pixels, 4x, body without the mark): ' + ', '.join(
        f"O{t} {ores[f'ore-o{t}']['tiers']} ({'/'.join(str(int(L)) for L, _ in ores[f'ore-o{t}']['levels'])})"
        for t in range(1, 5)))
    y = text_block(draw, pad, y, lines, W, 14) + 14
    # page-scale close-ups
    draw.text((pad, y), 'The socket variants at the @2x page scale (96 px per tile)', fill=ar.INK, font=ar.font(16, True))
    y += 26
    x = pad
    for name, image in page_panels:
        draw.text((x, y), name, fill=ar.INK, font=ar.font(14, True))
        canvas.paste(image.convert('RGB'), (x, y + 20))
        x += image.width + gap
    y += 20 + page_panels[0][1].height + 18
    # frames strip
    draw.text((pad, y), 'Frames at 2x the @2x page: W01 then W02 ore-o1..o4, package-o1..o4; '
              'tier-mark-hc-1..4 (W01, W02)',
              fill=ar.INK, font=ar.font(16, True))
    y += 26
    x = pad
    strip = [f'{w}{f}-o{t}' for w in ('', 'w02-') for f in ('ore', 'package') for t in range(1, 5)] + \
        [f'{w}tier-mark-hc-{t}' for w in ('', 'w02-') for t in range(1, 5)]
    size = 186
    tile = Image.new('RGBA', (size, size), (87, 94, 100, 255))
    for name in strip:
        if x + size > canvas.width:
            x = pad
            y += size + 6
        cell = tile.copy()
        cell.alpha_composite(load(base, review['frames'][name]['x4']).resize((size, size), Image.Resampling.LANCZOS))
        canvas.paste(cell.convert('RGB'), (x, y))
        x += size + 6
    y += size + pad
    canvas = canvas.crop((0, 0, canvas.width, min(H, y)))
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, 'sheet.png')
    canvas.save(path, optimize=True)
    return path


def main():
    review_path, out_dir = sys.argv[1], sys.argv[2]
    review = json.load(open(review_path))
    base = os.path.dirname(os.path.abspath(review_path))
    measures = {
        'ores': ore_measures(base, review),
        'sockets': socket_measures(base, review),
        'iou': iou_measures(base, review),
        'marks': mark_measures(base, review),
    }
    measures['default'] = review['default']
    measures['socketAlphaThreshold'] = SOCKET_ALPHA
    measures['tile'] = review['tile']
    path = sheet(review, base, measures, out_dir)
    with open(os.path.join(out_dir, 'sheet.json'), 'w') as handle:
        json.dump(measures, handle, indent=2)
        handle.write('\n')
    print(path)
    print(json.dumps({k: measures[k] for k in ('iou',)}, indent=1))


if __name__ == '__main__':
    main()
