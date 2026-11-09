"""After an asset rebuild, find the PNGs whose pixels did not change (art kit).

PNG bytes depend on the zlib build that wrote them, so a rebuild on another
machine rewrites every generated PNG even when no pixel moved. This lists the
modified PNGs under the given paths whose decoded RGBA pixels equal the
committed ones, and with --restore checks them out again, so an art PR
carries only the images that really changed.

Usage: python3 scripts/art-unchanged-pngs.py [--restore] [PATH ...]
       (default path: assets/campaign/generated)
"""
import argparse
import io
import subprocess
import sys

import numpy as np
from PIL import Image


def modified_pngs(paths):
    out = subprocess.run(['git', 'diff', '--name-only', '--', *paths], capture_output=True, text=True, check=True).stdout
    return [line for line in out.splitlines() if line.endswith('.png')]


def pixels(data):
    return np.asarray(Image.open(io.BytesIO(data)).convert('RGBA'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--restore', action='store_true')
    ap.add_argument('paths', nargs='*', default=['assets/campaign/generated'])
    a = ap.parse_args()
    same, changed = [], []
    for path in modified_pngs(a.paths):
        old = subprocess.run(['git', 'show', f'HEAD:{path}'], capture_output=True, check=True).stdout
        new = open(path, 'rb').read()
        a_px, b_px = pixels(old), pixels(new)
        (same if a_px.shape == b_px.shape and (a_px == b_px).all() else changed).append(path)
    for path in changed:
        print(f'changed   {path}')
    for path in same:
        print(f'unchanged {path}')
    if a.restore and same:
        subprocess.run(['git', 'checkout', '--', *same], check=True)
        print(f'restored {len(same)} pixel-identical PNG(s)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
