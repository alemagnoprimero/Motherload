"""Side-by-side sheet: concept panel crop | current game capture | technique prototype.

One row per situation (desktop triple, then portrait triple), plus a framing row.
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
SH = os.path.join(os.environ.get('CAPTURES', 'captures'), 'shots') + '/'  # session captures, not committed
SH2 = os.path.join(os.environ.get('CAPTURES', 'captures'), 'shots2') + '/'  # session captures, not committed
board = Image.open('/home/user/Motherload/docs/art-direction/d0-target-board.png').convert('RGB')
F = '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'
if not os.path.exists(F): F = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font = ImageFont.truetype(F, 22); small = ImageFont.truetype(F, 17); big = ImageFont.truetype(F, 30)

ROWS = [
    ('SURFACE · spawn', (227, 142, 918, 500), SH + 'a02-spawn-1440x900@2.png', OUT + '/proto-surface-1440x900@2.png',
     (936, 142, 1182, 500), SH2 + 'p-portrait-02-spawn@3.png', OUT + '/proto-surface-393x851@2.png',
     'game: a02-spawn (same world)', 'game p-portrait-02'),
    ('60 M SHAFT · column 20', (227, 527, 918, 879), SH + 'a04-dive-60m@2.png', OUT + '/proto-shaft-1440x900@2.png',
     (936, 527, 1182, 879), SH2 + 'p-portrait-03-dive-70m@3.png', OUT + '/proto-shaft-393x851@2.png',
     'game: a04-dive-60m (same world)', 'game p-portrait-03'),
    ('CAVERN · W01-SITE-4 (435 m)', (227, 903, 918, 1282), SH + 'c-site-W01-SITE-4-wreck@2.png', OUT + '/proto-cavern-1440x900@2.png',
     (936, 903, 1182, 1282), HERE + '/game/p-portrait-cavern-site4@3.png', OUT + '/proto-cavern-393x851@2.png',
     'game: c-site-W01-SITE-4 (other seed, same fixture)', 'game (new capture)'),
]
H = 430; GAP = 14; LABEL = 34; PAD = 24
def fit(im, h): return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)

tiles = []
for name, cbox, game, proto, pbox, pgame, pproto, gl, pgl in ROWS:
    ims = [fit(board.crop(cbox), H), fit(Image.open(game).convert('RGB'), H), fit(Image.open(proto).convert('RGB'), H),
           fit(board.crop(pbox), H), fit(Image.open(pgame).convert('RGB'), H), fit(Image.open(pproto).convert('RGB'), H)]
    labels = ['concept (d0-target-board)', gl, 'prototype (real W01 data)', 'concept', pgl, 'prototype']
    tiles.append((name, ims, labels))
extra = [('proto-cavern-gamecam-1440x900@2.png', "cavern, game camera rule (scene.ts:1057-1066): ceiling out of frame"),
         ('proto-shaft-conceptzoom-1440x900@2.png', 'shaft, tile 90 CSS px (concept framing, ~16 tiles across)'),
         ('proto-cavern-conceptzoom-1440x900@2.png', 'cavern, tile 90 CSS px (concept framing)')]
ex = [(fit(Image.open(f'{OUT}/{f}').convert('RGB'), 330), l) for f, l in extra]

width = max(sum(i.width for i in ims) + GAP * (len(ims) - 1) + GAP * 2 for _, ims, _ in tiles) + PAD * 2
height = PAD + 60 + len(tiles) * (H + LABEL + 50) + (330 + LABEL + 50) + PAD + 40
sheet = Image.new('RGB', (width, height), (14, 19, 23))
d = ImageDraw.Draw(sheet)
d.text((PAD, PAD), 'Technique prototype vs concept board vs current game  ·  prototype = real W01 tiles, discovery and sites; game rig/ore/lander sprites; props are placeholder prototype art', font=big, fill=(232, 236, 238))
y = PAD + 60
for name, ims, labels in tiles:
    d.text((PAD, y), name, font=font, fill=(240, 170, 90)); y += LABEL
    x = PAD
    for k, (im, lab) in enumerate(zip(ims, labels)):
        if k == 3: x += GAP * 2
        sheet.paste(im, (x, y)); d.text((x + 6, y + H + 6), lab, font=small, fill=(190, 200, 205)); x += im.width + GAP
    y += H + 50
d.text((PAD, y), 'FRAMING VARIANTS (same renderer, camera only)', font=font, fill=(240, 170, 90)); y += LABEL
x = PAD
for im, lab in ex:
    sheet.paste(im, (x, y)); d.text((x + 6, y + 336), lab, font=small, fill=(190, 200, 205)); x += im.width + GAP
y += 330 + 50
d.text((PAD, y), 'Concept and game frames include HUD; the prototype renders the world only. Phone game captures are @3 from other random seeds; the prototype phone renders are @2 of the same W01 world.', font=small, fill=(150, 160, 165))
sheet.save(f'{OUT}/compare.png', optimize=True)
sheet.convert('RGB').save(f'{OUT}/compare.jpg', quality=88)
print(sheet.size)
