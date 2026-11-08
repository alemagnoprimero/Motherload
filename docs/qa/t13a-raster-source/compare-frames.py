"""Compares every frame of the W01 atlases with a git revision, at source size.

Adding a frame moves others on the page, so the PNGs differ byte for byte;
this rebuilds each frame's full source rectangle from both sides and reports
the frames whose pixels differ, and the frames only one side has.

Usage: python3 docs/qa/t13a-raster-source/compare-frames.py [REVISION]
       (default origin/main)
"""
import io
import json
import subprocess
import sys

import numpy as np
from PIL import Image

PAGES = ['w01-atlas', 'w01-runtime', 'w01-atlas-3x-0', 'w01-runtime-3x-0']
GENERATED = 'assets/campaign/generated'


def load(revision, page):
    if revision is None:
        return json.load(open(f'{GENERATED}/{page}.json')), Image.open(f'{GENERATED}/{page}.png').convert('RGBA')
    show = lambda path: subprocess.run(['git', 'show', f'{revision}:{path}'], check=True, capture_output=True).stdout
    return json.loads(show(f'{GENERATED}/{page}.json')), Image.open(io.BytesIO(show(f'{GENERATED}/{page}.png'))).convert('RGBA')


def frame(atlas, image, name):
    entry = atlas['frames'][name]
    f, s, src = entry['frame'], entry['spriteSourceSize'], entry['sourceSize']
    out = Image.new('RGBA', (src['w'], src['h']))
    out.paste(image.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), (s['x'], s['y']))
    return np.asarray(out).astype(int)


def main():
    revision = sys.argv[1] if len(sys.argv) > 1 else 'origin/main'
    for page in PAGES:
        old_atlas, old_image = load(revision, page)
        new_atlas, new_image = load(None, page)
        old, new = set(old_atlas['frames']), set(new_atlas['frames'])
        changed = []
        for name in sorted(old & new):
            a, b = frame(old_atlas, old_image, name), frame(new_atlas, new_image, name)
            if a.shape != b.shape or (a != b).any():
                d = np.abs(a - b).max(2) if a.shape == b.shape else None
                changed.append(f'{name} ({int((d > 0).sum())} px, max {int(d.max())})' if d is not None else f'{name} (size)')
        print(f'{page}: {len(old & new)} shared frames, changed: {", ".join(changed) or "none"}; '
              f'added: {", ".join(sorted(new - old)) or "none"}; removed: {", ".join(sorted(old - new)) or "none"}')


if __name__ == '__main__':
    main()
