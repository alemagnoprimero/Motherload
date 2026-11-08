"""Before/after pairs for the T1-lite evidence, from two art-captures folders.

For each frame: the frame as captured (annotations on), both sides at half
the CSS size, and a close-up of the HUD-free twin around the rig at device pixels.

Usage: python3 docs/qa/t1-lite-headlamp/pairs.py BEFORE_DIR AFTER_DIR OUT_DIR
       [NAME ...]   (default: a04-dive-60m@2 c-site-W01-SITE-4-wreck@2)
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
GAP, HEAD = 16, 34


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def pair(left, right, labels):
    w, h = left.size
    out = Image.new('RGB', (2 * w + GAP, h + HEAD), (238, 238, 234))
    d = ImageDraw.Draw(out)
    for n, (image, label) in enumerate(zip((left, right), labels)):
        out.paste(image, (n * (w + GAP), HEAD))
        d.text((n * (w + GAP) + 4, 7), label, font=font(18), fill=(30, 30, 30))
    return out


def closeup(capture):
    """The HUD-free frame from 2.5 tiles behind the rig to 3 ahead, and 2
    above to 1.5 below, at device pixels."""
    view, dpr = capture['view'], capture['deviceScaleFactor']
    t = view['tile'] * dpr
    x, y = view['rigScreenX'] * dpr, view['rigScreenY'] * dpr
    box = (round(x - 2.5 * t), round(y - 2 * t), round(x + 3 * t), round(y + 1.5 * t))
    return Image.open(capture['hudFree']).convert('RGB').crop(box)


def main():
    before_dir, after_dir, out_dir, *names = sys.argv[1:]
    names = names or ['a04-dive-60m@2', 'c-site-W01-SITE-4-wreck@2']
    os.makedirs(out_dir, exist_ok=True)
    before = json.load(open(os.path.join(before_dir, 'manifest.json')))['captures']
    after = json.load(open(os.path.join(after_dir, 'manifest.json')))['captures']
    for name in names:
        b, a = before[name], after[name]
        short = name.split('@')[0]
        full = [Image.open(c['file']).convert('RGB') for c in (b, a)]
        half = [im.resize((im.width // 4, im.height // 4), Image.LANCZOS) for im in full]
        pair(*half, ('main', 'T1-lite')).save(os.path.join(out_dir, f'{short}-frame.png'), optimize=True)
        pair(closeup(b), closeup(a), ('main, HUD-free', 'T1-lite, HUD-free')).save(
            os.path.join(out_dir, f'{short}-lamp.png'), optimize=True)


if __name__ == '__main__':
    main()
