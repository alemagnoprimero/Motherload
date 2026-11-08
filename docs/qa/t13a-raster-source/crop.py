"""The T13a evidence images from an art-captures folder with the placeholder.

Writes test-raster-60m-frame.png (the frame as captured, at half the CSS
size) and test-raster-60m-closeup.png (the shaft around the placeholder and
the rig, at device pixels).

Usage: python3 docs/qa/t13a-raster-source/crop.py CAPTURES_DIR OUT_DIR
"""
import json
import os
import sys

from PIL import Image

NAME = 't13a-test-raster-60m@2'


def main():
    captures, out = sys.argv[1:3]
    capture = json.load(open(os.path.join(captures, 'manifest.json')))['captures'][NAME]
    frame = Image.open(capture['file']).convert('RGB')
    frame.resize((frame.width // 4, frame.height // 4), Image.LANCZOS).save(
        os.path.join(out, 'test-raster-60m-frame.png'), optimize=True)
    view, dpr = capture['view'], capture['deviceScaleFactor']
    t = view['tile'] * dpr
    x, y = view['rigScreenX'] * dpr, view['rigScreenY'] * dpr
    frame.crop((round(x - 2.5 * t), round(y - 3.6 * t), round(x + 2.5 * t), round(y + 1.2 * t))).save(
        os.path.join(out, 'test-raster-60m-closeup.png'), optimize=True)


if __name__ == '__main__':
    main()
