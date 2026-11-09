"""Audit T13b capture evidence from two folders written by captures.mjs
(before = item 1's tip 1a0b5db, Chromium-rendered legacy pages; after = this
item, resvg-rendered zone pages), all HUD-free at backing 2:

    <out>/a04-before-after.png         a04 at 1440x900 @2: before, after, and
                                       the pixels that changed (after dimmed;
                                       1-8 levels amber, more than 8 magenta)
    <out>/a04p-phone-before-after.png  the 60 m phone twin at 393x851 @3
    <out>/a02-before-after.png         the a02 spawn @2
    <out>/sprites-3x.png               the sprites of those frames, nearest:
                                       the rig box and every known deposit
                                       (and a02's lander), before above after
    <out>/w02-ice-vent-before-after.png the W02 vent cave on desktop and phone:
                                       before (the vent never drawn), after,
                                       and the vent's cell 3x
    <out>/captures.json                changed pixels per capture

Usage: python3 docs/qa/t13b-asset-pipeline/captures.py BEFORE AFTER OUT
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
PAPER, INK = (238, 238, 234), (24, 24, 24)
NAMES = ['a04-dive-60m@2', 'a04p-dive-60m-phone@3', 'a02-spawn-1440x900@2']
VENTS = ['w02-ice-vent@2', 'w02-ice-vent-phone@3']
DOCK_X = 5.5  # W01's dock column (src/campaign/config.ts dockX)


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def sheet(rows, title=None):
    """rows: list of (label, [images]) laid out left to right, top to bottom."""
    pad, head = 12, 24
    top = 30 if title else 0
    W = max(sum(im.width for im in ims) + pad * (len(ims) + 1) for _, ims in rows)
    H = top + sum(max(im.height for im in ims) + head + pad for _, ims in rows) + pad
    out = Image.new('RGB', (W, H), PAPER)
    draw = ImageDraw.Draw(out)
    if title:
        draw.text((pad, 8), title, fill=INK, font=font(17))
    y = top + pad
    for label, ims in rows:
        draw.text((pad, y), label, fill=INK, font=font(15))
        x = pad
        for im in ims:
            out.paste(im.convert('RGB'), (x, y + head))
            x += im.width + pad
        y += max(im.height for im in ims) + head + pad
    return out


def diff(before, after):
    a = np.asarray(before.convert('RGB'), dtype=np.int16)
    b = np.asarray(after.convert('RGB'), dtype=np.int16)
    d = np.abs(a - b).max(axis=2)
    changed = d > 0
    ys, xs = np.nonzero(changed)
    stats = {
        'pixels': int(d.size),
        'changed': int(changed.sum()),
        'changed share': round(float(changed.mean()), 5),
        'over 8 levels': int((d > 8).sum()),
        'over 32 levels': int((d > 32).sum()),
        'max': int(d.max()),
        'mean': round(float(np.abs(a - b).mean()), 4),
        'bbox': [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1] if len(xs) else None,
    }
    # The changed pixels over the after frame, dimmed.
    view = (b * 0.35).astype(np.uint8)
    view[(d > 0) & (d <= 8)] = (240, 170, 40)
    view[d > 8] = (240, 40, 200)
    return stats, Image.fromarray(view)


def small(im, scale):
    return im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.LANCZOS)


def crop(im, cx, cy, w, h, zoom):
    box = (round(cx - w / 2), round(cy - h / 2), round(cx + w / 2), round(cy + h / 2))
    part = im.crop(box)
    return part.resize((part.width * zoom, part.height * zoom), Image.Resampling.NEAREST)


def deposits(capture):
    """Known deposit cells in view: (column, row, centre x, y in device px)."""
    state = json.load(open(capture['state']))['state']
    world = state['worlds'][state['currentWorld']]
    view, dpr = capture['view'], capture['deviceScaleFactor']
    out = []
    for item in world['packages']:
        if item['status'] != 'deposit':
            continue
        column, row = int(item['x']), int(item['y'])
        if not world['discovered'][row * world['width'] + column % world['width']]:
            continue
        for wrap in (-1, 0, 1):
            x = ((column + wrap * world['width'] + 0.5) * view['tile'] - view['scrollX']) * dpr
            y = ((row + 0.5) * view['tile'] - view['scrollY']) * dpr
            if 0 <= x < view['width'] * dpr and 0 <= y < view['height'] * dpr:
                out.append((column, row, x, y))
    return sorted(out)


def main():
    before_dir, after_dir, out = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    before = json.load(open(os.path.join(before_dir, 'manifest.json')))['captures']
    after = json.load(open(os.path.join(after_dir, 'manifest.json')))['captures']
    report = {}
    files = {'a04-dive-60m@2': ('a04-before-after.png', 0.375, False),
             'a04p-dive-60m-phone@3': ('a04p-phone-before-after.png', 0.36, True),
             'a02-spawn-1440x900@2': ('a02-before-after.png', 0.375, False)}
    sprite_rows = []
    for name in NAMES:
        b, a = before[name], after[name]
        assert b['view'] == a['view'], f'{name}: the two runs framed the scene differently'
        ib, ia = Image.open(b['hudFree']).convert('RGB'), Image.open(a['hudFree']).convert('RGB')
        stats, changed = diff(ib, ia)
        report[name] = stats
        file, scale, horizontal = files[name]
        panels = [small(ib, scale), small(ia, scale), small(changed, scale)]
        labels = ['before (1a0b5db: Chromium renders, legacy pages)',
                  'after (resvg renders, zone pages)',
                  f"changed: {stats['changed']:,} px ({stats['changed share'] * 100:.2f} %), "
                  f"{stats['over 8 levels']:,} by more than 8 levels, max {stats['max']}"]
        if horizontal:
            out_im = sheet([(f'{name}: ' + ' | '.join(labels), panels)])
        else:
            out_im = sheet([(f'{label}', [p]) for label, p in zip(labels, panels)], title=name)
        out_im.save(os.path.join(out, file), optimize=True)
        # Sprites: the rig box, every known deposit, a02's lander.
        dpr, tile = a['deviceScaleFactor'], a['view']['tile']
        zoom = 3 if dpr == 2 else 2
        box = a['rigBox']
        spots = [('rig', box['x'] + box['width'] / 2, box['y'] + box['height'] / 2,
                  box['width'] * 1.25, box['height'] * 1.25)]
        size = 1.4 * tile * dpr
        for column, row, x, y in deposits(a)[:4]:
            spots.append((f'deposit ({column},{row})', x, y, size, size))
        if name.startswith('a02'):
            x = (DOCK_X * tile - a['view']['scrollX']) * dpr
            surface = -a['view']['scrollY'] * dpr
            spots.append(('lander', x, surface - 1.4 * tile * dpr, 4.4 * tile * dpr, 3.4 * tile * dpr))
            zoom = 2
        for tag, image in (('before', ib), ('after', ia)):
            sprite_rows.append((f'{name} {tag}: ' + ', '.join(s[0] for s in spots),
                                [crop(image, x, y, w, h, zoom if s != 'lander' else 1)
                                 for s, x, y, w, h in spots]))
    sheet(sprite_rows, title='Sprites before (Chromium, legacy pages) and after (resvg, zone pages), nearest').save(
        os.path.join(out, 'sprites-3x.png'), optimize=True)

    vent_rows = []
    for name in VENTS:
        vb = json.load(open(os.path.join(before_dir, name + '.json')))
        va = json.load(open(os.path.join(after_dir, name + '.json')))
        for key in ('tile', 'scrollX', 'scrollY'):
            assert vb[key] == va[key], f'{name}: framing differs'
        ib = Image.open(os.path.join(before_dir, name + '-hudfree.png')).convert('RGB')
        ia = Image.open(os.path.join(after_dir, name + '-hudfree.png')).convert('RGB')
        stats, changed = diff(ib, ia)
        dpr, tile = va['dpr'], va['tile']
        x = (va['vent']['x'] * tile - va['scrollX']) * dpr
        y = (va['vent']['y'] * tile - va['scrollY']) * dpr
        cell = tile * dpr
        a_ = np.asarray(ia, dtype=np.int16)
        b_ = np.asarray(ib, dtype=np.int16)
        x0, y0 = round(x - cell / 2), round(y - cell / 2)
        region = (slice(y0, y0 + round(cell)), slice(x0, x0 + round(cell)))
        d = np.abs(a_[region] - b_[region]).max(axis=2)
        stats['vent cell'] = {'changed': int((d > 0).sum()), 'over 32 levels': int((d > 32).sum()),
                              'pixels': int(d.size)}
        stats['drawn after'] = va['drawn']
        stats['pages after'] = va['pages']
        report[name] = stats
        scale = 0.3 if dpr == 2 else 0.33
        zoom = 3 if dpr == 2 else 2
        vent_rows.append((f"{name}: before (1a0b5db) | after | 2 × 2 cells round the vent, before and after, {zoom}x nearest",
                          [small(ib, scale), small(ia, scale),
                           crop(ib, x, y, cell * 2, cell * 2, zoom), crop(ia, x, y, cell * 2, cell * 2, zoom)]))
    sheet(vent_rows, title='W02 ice vent (8.5, 48.5): the old prefix filter dropped ice-vent from the runtime pages; '
          'the zone pages carry it').save(os.path.join(out, 'w02-ice-vent-before-after.png'), optimize=True)
    with open(os.path.join(out, 'captures.json'), 'w') as handle:
        json.dump(report, handle, indent=2)
        handle.write('\n')
    print(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
