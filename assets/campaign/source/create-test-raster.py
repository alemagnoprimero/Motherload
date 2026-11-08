"""Draws test-raster.png, the dev placeholder for the raster asset path.

Audit T13a: a PNG listed in frames.json with "source": "raster" is resampled,
packed and shown like any SVG frame. This test card exercises that path: it
is delivered at @3x (144 px for a 48 px tile), so the @3x pages copy it and
the @2x pages resample it; it has hard 1 px lines, a half-transparent band and
transparent corners, so resampling and alpha show at a glance. It is not art,
and the game draws it only with ?debug=test-raster (in the 60 m scene).

Run: python3 assets/campaign/source/create-test-raster.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 144  # 48 px logical tile at @3x
INK, PINK, TEAL, WHITE = (20, 35, 43, 255), (255, 63, 180, 255), (43, 217, 200, 255), (255, 255, 255, 255)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def main():
    card = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle((6, 6, SIZE - 7, SIZE - 7), radius=18, fill=INK)
    checker = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    c = ImageDraw.Draw(checker)
    for y in range(0, SIZE, 18):
        for x in range(0, SIZE, 18):
            c.rectangle((x, y, x + 17, y + 17), fill=PINK if (x + y) // 18 % 2 == 0 else TEAL)
    mask = Image.new('L', (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle((13, 13, SIZE - 14, SIZE - 14), radius=12, fill=255)
    card.paste(checker, (0, 0), mask)
    d.line((13, 13, SIZE - 14, SIZE - 14), fill=WHITE, width=1)
    d.line((13, SIZE - 14, SIZE - 14, 13), fill=WHITE, width=1)
    d.rounded_rectangle((30, 46, SIZE - 31, 98), radius=10, fill=INK)
    d.text((SIZE // 2, 62), 'T13a', font=font(26), fill=WHITE, anchor='mm')
    d.text((SIZE // 2, 86), 'RASTER', font=font(13), fill=TEAL, anchor='mm')
    band = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(band).rectangle((13, SIZE - 30, SIZE - 14, SIZE - 20), fill=(255, 255, 255, 128))
    card.alpha_composite(band)
    card.save(Path(__file__).with_name('test-raster.png'), optimize=True)


if __name__ == '__main__':
    main()
