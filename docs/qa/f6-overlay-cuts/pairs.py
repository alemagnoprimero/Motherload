"""Before/after pairs for the F6 evidence, from two measure-text.mjs folders.

Usage: python3 docs/qa/f6-overlay-cuts/pairs.py BEFORE_DIR AFTER_DIR OUT_DIR
       [CASE ...]   (default: the desktop 60 m and spawn cases)
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
GAP, HEAD = 16, 34
CASES = ['desktop-coach-active-60m', 'desktop-coach-skipped-60m', 'desktop-coach-skipped-spawn']


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def count(folder, case):
    for entry in json.load(open(os.path.join(folder, 'results.json'))):
        if f"{entry['form']}-coach-{entry['coach']}-{entry['scene'].replace(' ', '')}" == case:
            return entry['count']


def main():
    before, after, out, *cases = sys.argv[1:]
    for case in cases or CASES:
        images = [Image.open(os.path.join(folder, case + '.png')).convert('RGB') for folder in (before, after)]
        half = [im.resize((im.width // 4, im.height // 4), Image.LANCZOS) for im in images]
        w, h = half[0].size
        pair = Image.new('RGB', (2 * w + GAP, h + HEAD), (238, 238, 234))
        d = ImageDraw.Draw(pair)
        for n, (im, folder, label) in enumerate(zip(half, (before, after), ('main', 'F6'))):
            pair.paste(im, (n * (w + GAP), HEAD))
            d.text((n * (w + GAP) + 4, 7), f'{label}: {count(folder, case)} text items', font=font(18), fill=(30, 30, 30))
        pair.save(os.path.join(out, case + '.png'), optimize=True)


if __name__ == '__main__':
    main()
