"""A8 matched-scale art evidence; composites are explicitly not T4 captures.

python scripts/art-review-a8.py REVIEW.json OUT --contexts BEFORE/manifest.json

Native @2 raster measurements reuse art-review.py and art_tiers.py. Full
silhouettes on the board are occluded by terrain/props, so only a labelled
visible boundary window is compared. No board pixels enter any asset.
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import art_metrics as m
import art_tiers as tiers

spec = importlib.util.spec_from_file_location('art_review', HERE / 'art-review.py')
ar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ar)
PAPER = (236, 237, 232)
INK = (25, 35, 43)
# A visible near-background crest. The floor and wreck hide its full extent.
# Deliberately stop above the rubble at y=258; do not infer hidden geometry.
BOARD_WINDOW = (275, 190, 385, 258)
BOARD_OCCLUDER = [(326, 258), (343, 238), (350, 238), (338, 258)]
BOARD_NEAR = [(275, 226), (286, 228), (306, 241), (318, 218),
              (339, 195), (361, 213), (385, 208), (385, 258), (275, 258)]


def text(draw, xy, value, size=16, bold=False):
    draw.text(xy, value, fill=INK, font=ar.font(size, bold))


def composite(images, colour, size=None):
    out = Image.new('RGBA', size or images[0].size, colour)
    for im in images:
        out.alpha_composite(im)
    return out


def tiled(images, colour, size, offset=(0, 0), layer_offsets=None, first_row=0):
    """Each parallax slot alternates upright far/near sources every row."""
    out = Image.new('RGBA', size, colour)
    w, h = images[0].size
    ox, oy = offset
    offsets = layer_offsets or [ox] * len(images)
    for layer, x_offset in enumerate(offsets):
        for row in range((0 - oy) // h, (size[1] - oy) // h + 1):
            tile = images[(layer + row + first_row) % len(images)]
            for col in range((0 - x_offset) // w, (size[0] - x_offset) // w + 1):
                out.alpha_composite(tile, (x_offset + col * w, oy + row * h))
    return out


def fixture(variant, base, review, manifest, capture_name):
    """Disclosed material composite in an actual settled fixture.

    The captured visual-air mask clips it. Rectangles preserve the rig,
    wreck and beacon from the source capture. This does not test the T4
    renderer, natural/dug classification, parallax or information safety.
    """
    directory = Path(manifest).resolve().parent
    record = json.loads(Path(manifest).read_text())['captures'][capture_name]
    source = Image.open(directory / Path(record['hudFree']).name).convert('RGBA')
    dpr, view = record['deviceScaleFactor'], record['view']
    scale = review['tile'] / (view['tile'] * dpr)
    source = source.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS)
    air = Image.open(directory / Path(record['fieldAir']).name).convert('L').resize(source.size, Image.Resampling.NEAREST)
    images = [Image.open(base / f['board']).convert('RGBA') for f in variant['frames']]
    # Keep the native authored width for art review. Row parity follows
    # fixed world rows; .25/.5 horizontal offsets belong to the slots,
    # while the upright source profiles exchange those slots every 4 tiles.
    first_row = int(view['scrollY'] // (4 * view['tile']))
    offset = (0, round((first_row * 4 * view['tile'] - view['scrollY'])
                       * review['tile'] / view['tile']))
    offsets = [round(-view['scrollX'] * parallax * review['tile'] / view['tile'])
               for parallax in (0.25, 0.5)]
    layer = tiled(images, review['base'], source.size, offset,
                  layer_offsets=offsets, first_row=first_row)
    keep = ImageDraw.Draw(air)
    for x0, y0, x1, y1 in [(12.6, 44.3, 14.4, 46), (14.1, 43.0, 16.8, 44.5), (17.0, 44.2, 18.6, 46)]:
        rect = tuple(round((v * view['tile'] - (view['scrollX'] if i % 2 == 0 else view['scrollY']))
                           * review['tile'] / view['tile']) for i, v in enumerate((x0, y0, x1, y1)))
        keep.rectangle(rect, fill=0)
    merged = Image.composite(layer, source, air)
    panel = m.panels()['cavern-wide' if 'phone' not in capture_name and 'portrait' not in capture_name else 'cavern-tall']
    box, _ = m.matched_window(view, panel)
    box = tuple(round(v * review['tile'] / view['tile']) for v in box)
    return source.crop(box).convert('RGB'), merged.crop(box).convert('RGB')


def measure(base, review, variant):
    frames = variant['frames']
    native = [Image.open(base / f['x2']).convert('RGBA') for f in frames]
    board = [Image.open(base / f['board']).convert('RGBA') for f in frames]
    rgba = [np.asarray(im).astype(np.int16) for im in native]
    measurements = {}
    for index, (f, px) in enumerate(zip(frames, rgba)):
        measurements[f['name']] = {
            'structural': tiers.svg_tiers(str(base / f['source'])),
            'native2': tiers.visible_svg_tiers(str(base / f['source']), str(base / f['x2']), min_px=2),
            'board': tiers.visible_svg_tiers(str(base / f['source']), str(base / f['board']), min_px=0.5),
            'horizontalSeamMaxRGBA': int(np.abs(px[:, 0] - px[:, -1]).max()),
            'pairedVerticalSeamMaxRGBA': int(np.abs(px[-1] - rgba[(index + 1) % len(rgba)][0]).max()),
            'verticalPartner': frames[(index + 1) % len(frames)]['name'],
            'directVerticalRepeatMaxRGBA': int(np.abs(px[0] - px[-1]).max()),
        }
    combined = np.asarray(composite(native, review['base']))[..., :3]
    luma = m.luma(combined.astype(float))
    # Compare only the visible window at a fixed phase/height. Crop clipping
    # is disclosed, and this must never be called a full-silhouette score.
    counterpart = Image.new('1', (693, 381))
    ImageDraw.Draw(counterpart).polygon(BOARD_NEAR, fill=1)
    near = Image.new('RGBA', (693, 381))
    near.alpha_composite(board[1], (0, 103))
    x0, y0, x1, y1 = BOARD_WINDOW
    a = np.asarray(near)[y0:y1, x0:x1, 3] > 127
    b = np.asarray(counterpart)[y0:y1, x0:x1]
    visible = Image.new('1', (693, 381), 1)
    ImageDraw.Draw(visible).polygon(BOARD_OCCLUDER, fill=0)
    visible = np.asarray(visible)[y0:y1, x0:x1]
    a, b = a & visible, b & visible
    return {
        'frames': measurements,
        'farNearIoU': ar.alpha_iou(rgba[0][..., 3] > 127, rgba[1][..., 3] > 127),
        'compositeLuma': {'mean': float(luma.mean()), 'sd': float(luma.std())},
        'boardVisibleWindowIoU': ar.alpha_iou(a, b),
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('review')
    p.add_argument('out')
    p.add_argument('--contexts', required=True, help='Actual SITE4 before/manifest.json; field-air mask required')
    args = p.parse_args()
    base = Path(args.review).resolve().parent
    review = json.loads(Path(args.review).read_text())
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    results = {v['variant']: measure(base, review, v) for v in review['variants']}
    report = {
        'item': 'A8', 'seed': review['seed'], 'tile': review['tile'],
        'defaultVariant': review['defaultVariant'],
        'method': {
            'raster': review['rasterPath'],
            'silhouettes': 'art-review.py alpha_iou, alpha>127 at native @2, same canvas/phase; no fitting',
            'tiers': 'art_tiers.visible_svg_tiers, flat pixels only, >=2 pixels at @2, >=0.5 at board scale',
            'board': 'Full back-wall alpha is occluded. Compare only the annotated visible near-boundary window, fixed source phase x=0/y=103, no scaling/fitting beyond shared tile scale. This is not a full-silhouette acceptance score.',
            'fixture': 'Explicit art composites on settled A7 SITE4 before screenshots, clipped to the captured visual-air mask. Rectangles preserve source rig/wreck/beacon pixels. Fixed four-world-row parity alternates upright source profiles between .25/.5 parallax slots. Native authored strip width is retained here; T4 uses its world-seam width. Runtime clipping/parallax/safety are not tested here.',
            'seams': 'Maximum per-channel edge difference on native RGBA. X is directly periodic. Y alternates the two upright sources; each source bottom is compared with its partner top. Single-source direct-repeat differences remain explicitly reported.',
        },
        'boardWindow': BOARD_WINDOW, 'boardPolygon': BOARD_NEAR,
        'boardOccluderExcludedFromBothMasks': BOARD_OCCLUDER,
        'sourceContext': Path(args.contexts).name,
        'variants': results,
    }
    (out / 'sheet.json').write_text(json.dumps(report, indent=2) + '\n')
    sheet = Image.new('RGB', (1450, 2400), PAPER)
    draw = ImageDraw.Draw(sheet)
    text(draw, (18, 15), 'A8 back-wall strips · three selectable variants', 25, True)
    text(draw, (18, 50), f'Matched scale {review["tile"]:.2f} px/tile · two layers · authored at @2 · no outlines', 17)
    board = Image.open(ROOT / review['board']).convert('RGB')
    sheet.paste(board, (18, 82))
    annotated = board.crop(BOARD_WINDOW).resize((330, 204), Image.Resampling.NEAREST)
    ImageDraw.Draw(annotated).line([((x-BOARD_WINDOW[0])*3, (y-BOARD_WINDOW[1])*3) for x, y in BOARD_NEAR], fill=(245, 82, 91), width=2)
    ImageDraw.Draw(annotated).polygon([((x-BOARD_WINDOW[0])*3, (y-BOARD_WINDOW[1])*3) for x, y in BOARD_OCCLUDER], outline=(255, 215, 60), width=2)
    sheet.paste(annotated, (740, 82))
    text(draw, (740, 310), 'Visible near-boundary window only.', 17, True)
    text(draw, (740, 338), 'Terrain and props occlude the full strip.', 16)
    text(draw, (740, 364), 'Red annotation is review data, never art input.', 16)
    text(draw, (740, 390), 'Runtime back-wall acceptance belongs to T4.', 16)
    y = 483
    for variant in review['variants']:
        name = variant['variant']
        data = results[name]
        text(draw, (18, y), name + (' · default' if name == review['defaultVariant'] else ''), 23, True)
        text(draw, (18, y+32), 'Disclosed art composite in actual SITE-4: desktop and phone; captured air mask, preserved props.', 16)
        x = 18
        for capture in ['c-site-W01-SITE-4-wreck@2', 'p-portrait-cavern-site4@3']:
            _, merged = fixture(variant, base, review, args.contexts, capture)
            sheet.paste(merged, (x, y+61))
            x += merged.width+24
        images = [Image.open(base / f['board']).convert('RGBA') for f in variant['frames']]
        # Repeat preview stays beside the full game context, at the same scale.
        repeat = tiled(images, review['base'], (440, 354), offset=(-235, 0))
        sheet.paste(repeat.convert('RGB'), (997, y+61))
        text(draw, (997, y+421), 'Two rows; upright profiles exchange slots.', 13)
        text(draw, (997, y+438), f'X join at {images[0].width-235} px; Y join at {images[0].height} px.', 13)
        text(draw, (18, y+458), f'Far/near IoU {data["farNearIoU"]:.3f}/0.70; visible board-window IoU {data["boardVisibleWindowIoU"]:.3f}.', 16)
        tier_counts = [len(z['visible_tiers']) for f in data['frames'].values() for density in ['native2', 'board'] for z in f[density].values()]
        seam_x = max(f['horizontalSeamMaxRGBA'] for f in data['frames'].values())
        seam_y = max(f['pairedVerticalSeamMaxRGBA'] for f in data['frames'].values())
        text(draw, (18, y+484), f'Combined unlit luma {data["compositeLuma"]["mean"]:.2f}, sd {data["compositeLuma"]["sd"]:.2f}; {min(tier_counts)}–{max(tier_counts)} flat tiers per layer at @2 and board scale.', 16)
        text(draw, (18, y+510), f'X seam {seam_x} RGBA; paired Y seam {seam_y} RGBA. Each slot alternates upright far/near sources; measurements are in sheet.json.', 15)
        y += 558
    sheet.crop((0, 0, 1450, y+12)).save(out / 'sheet-variants.png', optimize=True)
    print(json.dumps({name: {k: v for k, v in value.items() if k != 'frames'} for name, value in results.items()}, indent=2))


if __name__ == '__main__':
    main()
