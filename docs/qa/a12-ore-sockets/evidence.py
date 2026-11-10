"""A12 evidence images from two capture folders (before = main, after = this
item), as written by docs/qa/a12-ore-sockets/capture.mjs:

    <out>/a04-before-after.png        a04 at 1440x900 @2, HUD-free, main above
    <out>/a04p-phone-before-after.png the 60 m phone twin, 393x851 @3
    <out>/a02-before-after.png        a02 spawn @2, for context
    <out>/ore-cells-3x.png            every known deposit cell in the a04 frames
                                      and a02, 1.4 tiles square, 3x nearest
                                      (desktop) and 2x nearest (phone), before
                                      and after
    <out>/high-contrast-cells-3x.png  the a04 cells with high contrast on

Usage: python3 docs/qa/a12-ore-sockets/evidence.py BEFORE AFTER OUT
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
PAPER, INK = (238, 238, 234), (24, 24, 24)


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def manifest(folder):
    return json.load(open(os.path.join(folder, 'manifest.json')))['captures']


def labelled(images, labels, scale, horizontal):
    tiles = [im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.LANCZOS)
             for im in images]
    pad, head = 12, 26
    if horizontal:
        W = sum(t.width for t in tiles) + pad * (len(tiles) + 1)
        H = max(t.height for t in tiles) + head + pad * 2
    else:
        W = max(t.width for t in tiles) + pad * 2
        H = sum(t.height + head for t in tiles) + pad * (len(tiles) + 1)
    sheet = Image.new('RGB', (W, H), PAPER)
    draw = ImageDraw.Draw(sheet)
    x = y = pad
    for tile, label in zip(tiles, labels):
        draw.text((x, y), label, fill=INK, font=font(16))
        sheet.paste(tile.convert('RGB'), (x, y + head))
        if horizontal:
            x += tile.width + pad
        else:
            y += tile.height + head + pad
    return sheet


def deposits(capture, view=None):
    """Known deposit cells in view: (column, row, itemId, centre x, y in px)."""
    state = json.load(open(capture['state']))['state']
    world = state['worlds'][state['currentWorld']]
    view, dpr = view or capture['view'], capture['deviceScaleFactor']
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
                out.append((column, row, item['itemId'], x, y))
    return sorted(out)


def cells(before, after, names, zoom, out, suffix=''):
    rows, labels = [], []
    for name, k in zip(names, zoom):
        b, a = before[name], after[name]
        size = round(1.4 * b['view']['tile'] * b['deviceScaleFactor'])
        for tag, capture in (('main', b), ('A12', a)):
            path, view = capture['hudFree'], None
            if suffix:  # the high-contrast frame, with its own camera
                path = path.replace('-hudfree.png', f'{suffix}-hudfree.png')
                view = {**capture['view'], **json.load(open(path.replace('-hudfree.png', '.json')))}
            found = deposits(capture, view)
            frame = Image.open(path).convert('RGB')
            crops = []
            for column, row, item, x, y in found:
                box = (round(x - size / 2), round(y - size / 2), round(x + size / 2), round(y + size / 2))
                crops.append(frame.crop(box).resize((size * k, size * k), Image.Resampling.NEAREST))
            rows.append(crops)
            labels.append(f'{tag}  {name}{" high contrast" if suffix else ""}: '
                          + ', '.join(f'{item[-2:]} ({column},{row})' for column, row, item, _, _ in found))
    pad, head = 10, 24
    W = max(sum(c.width for c in r) + pad * (len(r) + 1) for r in rows)
    H = sum(max(c.height for c in r) + head + pad for r in rows) + pad
    sheet = Image.new('RGB', (W, H), PAPER)
    draw = ImageDraw.Draw(sheet)
    y = pad
    for crops, label in zip(rows, labels):
        draw.text((pad, y), label, fill=INK, font=font(15))
        x = pad
        for crop in crops:
            sheet.paste(crop, (x, y + head))
            x += crop.width + pad
        y += max(c.height for c in crops) + head + pad
    sheet.save(out, optimize=True)


def main():
    before_dir, after_dir, out = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    before, after = manifest(before_dir), manifest(after_dir)
    for name, file, scale, horizontal in (
            ('a04-dive-60m@2', 'a04-before-after.png', 0.375, False),
            ('a04p-dive-60m-phone@3', 'a04p-phone-before-after.png', 0.36, True),
            ('a02-spawn-1440x900@2', 'a02-before-after.png', 0.375, False)):
        images = [Image.open(before[name]['hudFree']), Image.open(after[name]['hudFree'])]
        labelled(images, [f'main: {name}', f'A12: {name}'], scale, horizontal).save(
            os.path.join(out, file), optimize=True)
    pair = ['a04-dive-60m@2', 'a04p-dive-60m-phone@3']
    cells(before, after, pair + ['a02-spawn-1440x900@2'], [3, 2, 3], os.path.join(out, 'ore-cells-3x.png'))
    cells(before, after, pair, [3, 2], os.path.join(out, 'high-contrast-cells-3x.png'), suffix='-hc')
    print(out)


if __name__ == '__main__':
    main()
