"""A7 review sheets and measured numbers, using art-review.py's IoU/font
helpers and art_tiers.py's structural and honest flat-pixel tier counters.

Usage: python3 scripts/art-review-a7.py REVIEW.json OUT [--context PNG]

The optional context is an actual settled A7 SITE-4 capture. Variant strips
are art review composites on the same historical T2 fixture, explicitly
labelled; they are not runtime placement or lighting acceptance evidence.
The board polygons below are hand annotations for review only, not art input.
They are drawn over the reference crops so their boundaries can be reviewed.
No silhouette is resized to improve IoU: generated masks retain the board's
44.14 px/tile scale; the visible silhouette is only aligned to its anchor.
"""
import argparse
import importlib.util
import json
import os
from itertools import combinations
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
import sys
sys.path.insert(0, str(HERE))
import art_tiers as tiers  # noqa: E402
import art_metrics as m  # noqa: E402

spec = importlib.util.spec_from_file_location('art_review', HERE / 'art-review.py')
ar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ar)

# Visible, individual exemplars in the wide cavern crop, in board pixels.
# Occluded masses are not completed by inference. Rust is one hanging run,
# rubble one small floor stone, and boulder one upright floor block.
COUNTERPARTS = {
    'stalactite': [(528, 77), (541, 80), (539, 103), (536, 135),
                   (533, 132), (531, 105)],
    'rust': [(195, 143), (201, 140), (199, 165), (198, 189),
             (196, 193), (195, 172)],
    'rubble': [(130, 277), (137, 272), (142, 271), (149, 275),
               (154, 277), (157, 279), (132, 279)],
    'boulder': [(613, 291), (619, 271), (629, 255), (636, 252),
                (644, 271), (647, 292), (633, 296)],
    'crystal': [(59, 260), (56, 245), (60, 241), (67, 249),
                (73, 262), (76, 253), (80, 254), (86, 265),
                (84, 271), (71, 270), (64, 266)],
}
FAMILIES = list(COUNTERPARTS)
PAPER = (236, 237, 232)
INK = (25, 35, 43)
MUTED = (75, 85, 90)
FAIL = (174, 45, 38)


def rgba(path):
    return np.asarray(Image.open(path).convert('RGBA'))


def trimmed(mask):
    yy, xx = np.nonzero(mask)
    if not len(xx):
        return mask[:1, :1]
    return mask[yy.min():yy.max() + 1, xx.min():xx.max() + 1]


def anchored_iou(a, b, anchor='floor', trim=False):
    if trim:
        a, b = trimmed(a), trimmed(b)
    if anchor == 'ceiling':
        a, b = np.flipud(a), np.flipud(b)
    return ar.alpha_iou(a, b)


def primary(frame):
    return not (frame.get('animation') or '-hc' in frame['name']
                or frame['name'].endswith('-emissive'))


def counterpart(family):
    points = COUNTERPARTS[family]
    x0 = min(p[0] for p in points)
    x1 = max(p[0] for p in points) + 1
    y0 = min(p[1] for p in points)
    y1 = max(p[1] for p in points) + 1
    im = Image.new('1', (x1 - x0, y1 - y0))
    ImageDraw.Draw(im).polygon([(x - x0, y - y0) for x, y in points], fill=1)
    return np.asarray(im, bool), (x0, y0, x1, y1)


def measure_frame(base, frame):
    source = str(base / frame['source'])
    structure = tiers.svg_tiers(source)
    result = {'family': frame['family'], 'animation': frame.get('animation'),
              'structural': structure, 'density': {}}
    for label, min_px in [('x2', 2), ('x4', 8), ('board', 0.5)]:
        result['density'][label] = tiers.visible_svg_tiers(
            source, str(base / frame[label]), min_px=min_px)
    if primary(frame):
        mask = rgba(base / frame['board'])[..., 3] > 127
        board_mask, box = counterpart(frame['family'])
        result['boardIoU'] = anchored_iou(mask, board_mask, frame.get('anchor'), trim=True)
        result['boardBox'] = list(box)
    return result


def measure_variant(base, variant):
    frames = variant['frames']
    result = {'frames': {f['name']: measure_frame(base, f) for f in frames},
              'families': {}, 'intentionalIdentity': {}}
    for family in FAMILIES:
        selected = [f for f in frames if f['family'] == family and primary(f)]
        masks = {f['name']: rgba(base / f['x2'])[..., 3] > 127 for f in selected}
        pairs = {f'{a}/{b}': anchored_iou(masks[a], masks[b],
                 'ceiling' if family in ('stalactite', 'rust') else 'floor')
                 for a, b in combinations(masks, 2)}
        result['families'][family] = {
            'pairs': pairs,
            'maxIoU': max(pairs.values(), default=0),
            'over070': {pair: value for pair, value in pairs.items() if value > 0.70},
            'boardIoU': {f['name']: result['frames'][f['name']]['boardIoU'] for f in selected},
        }
    # HC is a palette alternative to one crystal, not another scenery shape.
    # Record its identity explicitly instead of quietly dropping these pairs.
    lookup = {f['name']: f for f in frames}
    for f in frames:
        if f['name'].endswith('-hc'):
            base_name = f['name'][:-3]
            result['intentionalIdentity'][f'{base_name}/{f["name"]}'] = ar.alpha_iou(
                rgba(base / lookup[base_name]['x2'])[..., 3] > 127,
                rgba(base / f['x2'])[..., 3] > 127)
    particles = [f for f in frames if f.get('animation')]
    result['motionPairs'] = {
        f'{a["name"]}/{b["name"]}': ar.alpha_iou(
            rgba(base / a['x2'])[..., 3] > 127, rgba(base / b['x2'])[..., 3] > 127)
        for a, b in combinations(particles, 2)
    }
    # Also publish the literal all-frame reading. Colour/ADD alternatives and
    # animation phases are intentionally correlated, but must remain visible
    # as acceptance exceptions rather than disappearing from the evidence.
    all_masks = {f['name']: rgba(base / f['x2'])[..., 3] > 127 for f in frames}
    all_pairs = {}
    for a, b in combinations(frames, 2):
        # Same ceiling families use their top attachment; all other pairs
        # use the existing helper's bottom-centre alignment. No scaling or
        # best-fit translation is used to maximise the score.
        anchor = 'ceiling' if a.get('anchor') == b.get('anchor') == 'ceiling' else 'floor'
        all_pairs[f'{a["name"]}/{b["name"]}'] = anchored_iou(
            all_masks[a['name']], all_masks[b['name']], anchor)
    result['allFrames'] = {
        'pairCount': len(all_pairs),
        'maxIoU': max(all_pairs.values(), default=0),
        'over070': {pair: value for pair, value in all_pairs.items() if value > 0.70},
    }
    copper_l = float(tiers.lch(tiers.hex_rgb('#d69d6e'))[0])
    hc = {}
    for f in frames:
        if not f['name'].endswith('-hc'):
            continue
        zones = result['frames'][f['name']]['structural']
        fills = zones.get('crystal', {}).get('fills', [])
        levels = [float(tiers.lch(tiers.hex_rgb(c))[0]) for c in fills]
        hc[f['name']] = {'materialL': [round(v, 1) for v in sorted(levels)],
                         'copperL': round(copper_l, 1),
                         'minimumCopperGap': round(min(abs(v - copper_l) for v in levels), 1)}
    result['highContrast'] = hc
    return result


def write_text(draw, xy, text, size=17, fill=INK, bold=False):
    draw.text(xy, text, font=ar.font(size, bold), fill=fill)


def reference_tile(board, family):
    _, box = counterpart(family)
    x0, y0, x1, y1 = box
    margin = 15
    crop_box = (max(0, x0 - margin), max(0, y0 - margin),
                min(board.width, x1 + margin), min(board.height, y1 + margin))
    crop = board.crop(crop_box).convert('RGB')
    draw = ImageDraw.Draw(crop)
    pts = [(x - crop_box[0], y - crop_box[1]) for x, y in COUNTERPARTS[family]]
    draw.line(pts + [pts[0]], fill=(245, 82, 91), width=1)
    return crop.resize((crop.width * 3, crop.height * 3), Image.Resampling.NEAREST)


def contact_panel(base, frames, tile, family):
    """Art on an actual T2 fixture crop; these are disclosed composites.

    Each sprite has its authored cell scale. Fixed placements keep the three
    variants registered. This is a material/silhouette comparison, never a
    claim about the runtime's collision, ore exclusion, lighting or masking.
    """
    backdrop = Image.open(ROOT / 'docs/qa/t2/frame-site4.jpg').convert('RGBA')
    # The committed T2 frame is 1440px across at 68.727px/tile (1440/22 *1.05).
    scale = tile / (1440 / 22 * 1.05)
    backdrop = backdrop.resize((round(backdrop.width * scale), round(backdrop.height * scale)),
                               Image.Resampling.LANCZOS)
    # A real, known cave wall/floor forms the background of each contact cell.
    # Contact columns are separate crops, rather than invented terrain.
    cell_w, cell_h = 145, 116
    width = max(693, min(6, len(frames)) * cell_w)
    rows = (len(frames) + 5) // 6
    panel = Image.new('RGBA', (width, rows * (cell_h + 26)), PAPER + (255,))
    draw = ImageDraw.Draw(panel)
    for i, f in enumerate(frames):
        x, y = (i % 6) * cell_w, (i // 6) * (cell_h + 26)
        # Fixed crop coordinates in the matched-scale T2 screenshot.
        if family in ('stalactite', 'rust'):
            crop = backdrop.crop((257, 46, 257 + cell_w, 46 + cell_h))
        else:
            crop = backdrop.crop((235, 200, 235 + cell_w, 200 + cell_h))
        sprite = Image.open(base / f['board']).convert('RGBA')
        sx = (cell_w - sprite.width) // 2
        sy = 31 if family in ('stalactite', 'rust') else cell_h - sprite.height - 8
        crop.alpha_composite(sprite, (sx, sy))
        panel.alpha_composite(crop, (x, y))
        write_text(draw, (x + 3, y + cell_h + 3), f['name'].replace('cave-', ''), size=11)
    return panel.convert('RGB')


def runtime_rows(manifest_path, family):
    if not manifest_path:
        return []
    folder = Path(manifest_path).resolve().parent
    captures = json.loads(Path(manifest_path).read_text())['captures']
    rows = []
    prefixes = (f'a7-{family}',) + (('a7-group-',) if family != 'rust' else ())
    names = [name for name in captures
             if name.startswith(prefixes) and '-desktop@' in name
             and (family == 'crystal' or '-hc-' not in name)]
    # The canonical overview contains every family. It also gives a useful
    # real-game context while optional exhaustive detail shots are pending.
    if not names:
        names = [name for name in captures if name == 'c-site-W01-SITE-4-wreck@2']
    for name in names:
        phone = ('p-portrait-cavern-site4@3' if name == 'c-site-W01-SITE-4-wreck@2'
                 else name.replace('-desktop@2', '-phone@3'))
        pair = []
        for form, key in [('desktop', name), ('phone', phone)]:
            if key not in captures:
                continue
            record = captures[key]
            image = m.load_rgb(str(folder / Path(record['hudFree']).name))
            panel = m.panels()['cavern-wide' if form == 'desktop' else 'cavern-tall']
            box, scale = m.matched_window(record['view'], panel)
            crop = (image if name.startswith('a7-') else
                    m.crop_device(image, box, record['deviceScaleFactor']))
            # Scale from device px to board px, never stretch a clipped crop.
            crop = Image.fromarray(crop.astype(np.uint8))
            crop = crop.resize((round(crop.width * scale / record['deviceScaleFactor']),
                                round(crop.height * scale / record['deviceScaleFactor'])), Image.Resampling.LANCZOS)
            pair.append((form, crop))
        rows.append((name.split('-desktop@')[0], pair))
    return rows


def family_sheet(base, review, results, family, out, context, contexts=None):
    board = Image.open(ROOT / review['board']).convert('RGB')
    variants = review['variants']
    contacts = []
    for v in variants:
        selected = [f for f in v['frames'] if f['family'] == family
                    and (primary(f) or f.get('animation'))]
        contacts.append(contact_panel(base, selected, review['tile'], family))
    context_h = 0
    runtime = None
    rows = runtime_rows(contexts, family)
    width = max(1250, max((sum(im.width + 24 for _, im in pair) + 18
                           for _, pair in rows), default=0))
    if context:
        runtime = Image.open(context).convert('RGB')
        runtime = runtime.resize((693, round(runtime.height * 693 / runtime.width)), Image.Resampling.LANCZOS)
        context_h = runtime.height + 44
    context_h += sum(max(im.height for _, im in pair) + 52 for _, pair in rows)
    height = 500 + context_h + sum(im.height + 115 for im in contacts)
    sheet = Image.new('RGB', (width, height), PAPER)
    draw = ImageDraw.Draw(sheet)
    write_text(draw, (18, 15), f'A7 {family} · three seeded variants', 25, bold=True)
    write_text(draw, (18, 50), f'Matched scale: {review["tile"]:.2f} px/tile. Outlines, facets and size retained.', 16)
    sheet.paste(board, (18, 80))
    write_text(draw, (730, 80), 'Board counterpart: manual visible mask', 16, bold=True)
    ref = reference_tile(board, family)
    if ref.height > 200:
        ref = ref.resize((round(ref.width * 200 / ref.height), 200), Image.Resampling.NEAREST)
    sheet.paste(ref, (730, 111))
    write_text(draw, (730, 330), 'Red boundary is review annotation only.', 15)
    write_text(draw, (730, 355), 'IoU keeps scale; only anchor is aligned.', 15)
    write_text(draw, (730, 380), 'No board pixels enter generated art.', 15)
    y = 480
    if runtime:
        write_text(draw, (18, y), 'Actual A7 SITE-4 fixture · default variant · settled capture', 17, bold=True)
        sheet.paste(runtime, (18, y + 30))
        y += runtime.height + 44
    for title, pair in rows:
        write_text(draw, (18, y), f'Actual settled default · {title} · matched tile scale', 17, bold=True)
        x = 18
        for form, im in pair:
            sheet.paste(im, (x, y + 30))
            x += im.width + 24
        y += max(im.height for _, im in pair) + 52
    for v, contact in zip(variants, contacts):
        name = v['variant']
        data = results[name]['families'][family]
        default = review['defaultVariants'][family] == name
        write_text(draw, (18, y), f'{name}{" · default" if default else ""}', 21, bold=True)
        write_text(draw, (18, y + 29),
                   'Art review composites on T2 SITE-4 crop; contact columns are not runtime placement.', 15)
        sheet.paste(contact, (18, y + 52))
        ty = y + 54 + contact.height
        board_values = list(data['boardIoU'].values())
        write_text(draw, (18, ty),
                   f'Scenery pair IoU max {data["maxIoU"]:.3f} / 0.70; '
                   f'board counterpart IoU {min(board_values):.3f}–{max(board_values):.3f} at native scale.',
                   15, fill=FAIL if data['over070'] else INK)
        selected_names = [f['name'] for f in v['frames'] if f['family'] == family and primary(f)]
        counts = []
        for frame_name in selected_names:
            for zone in results[name]['frames'][frame_name]['density']['x4'].values():
                counts.append(len(zone['visible_tiers']))
        write_text(draw, (18, ty + 23),
                   f'Visible flat shading tiers at @4: {min(counts, default=0)}–{max(counts, default=0)} '
                   '(≥3 per material zone). Per-frame, @2 and matched-scale readings in sheet.json.',
                   15, fill=FAIL if counts and min(counts) < 3 else INK)
        y += contact.height + 115
    sheet.crop((0, 0, width, y + 18)).save(out / f'sheet-{family}.png', optimize=True)


def crystal_contrast_sheet(base, review, results, out):
    """Normal, ADD sparkle and HC at the same scale on the fixture crop.

    ADD is computed as the source's premultiplied RGB, matching the existing
    pass. The HC sibling has zero RGB (adds no light). These rows expose both
    facts to the director without suggesting a new lighting implementation.
    """
    name = review['defaultVariants']['crystal']
    variant = next(v for v in review['variants'] if v['variant'] == name)
    frames = {f['name']: f for f in variant['frames']}
    copper = Image.open(base / 'copper-board.png').convert('RGBA')
    image = Image.new('RGB', (1050, 790), PAPER)
    draw = ImageDraw.Draw(image)
    write_text(draw, (18, 15), 'A7 crystals · high-contrast value and ADD sibling', 24, bold=True)
    write_text(draw, (18, 50),
               'Default facets. T2 fixture composites at 44.14 px/tile, shown 1.6× nearest for value review.', 16)
    headings = ['base (sparkle off)', 'base + ADD sparkle', 'high contrast', 'HC, greyscale']
    for col, heading in enumerate(headings):
        write_text(draw, (20 + col * 255, 90), heading, 17, bold=True)
    for index in range(3):
        frame = frames[f'cave-crystal-floor-{index}']
        hc = frames[f'cave-crystal-floor-{index}-hc']
        sibling = frames[f'cave-crystal-floor-{index}-emissive']
        base_frame = Image.open(base / frame['board']).convert('RGBA')
        hc_frame = Image.open(base / hc['board']).convert('RGBA')
        glow = rgba(base / sibling['board']).astype(float)
        for column, selected in enumerate([base_frame, base_frame, hc_frame, hc_frame]):
            panel = contact_panel(base, [frame], review['tile'], 'crystal').crop((0, 0, 145, 116)).convert('RGBA')
            # Reset to the actual fixture crop, then place exactly one base.
            fixture = Image.open(ROOT / 'docs/qa/t2/frame-site4.jpg').convert('RGBA')
            scale = review['tile'] / (1440 / 22 * 1.05)
            fixture = fixture.resize((round(fixture.width * scale), round(fixture.height * scale)), Image.Resampling.LANCZOS)
            panel = fixture.crop((235, 200, 380, 316))
            x, y = (145 - selected.width) // 2, 116 - selected.height - 8
            panel.alpha_composite(selected, (x, y))
            if column == 1:
                px = np.asarray(panel).copy()
                target = px[y:y + glow.shape[0], x:x + glow.shape[1], :3].astype(float)
                px[y:y + glow.shape[0], x:x + glow.shape[1], :3] = np.clip(
                    target + glow[..., :3] * glow[..., 3:4] / 255, 0, 255).round().astype(np.uint8)
                panel = Image.fromarray(px)
            panel.alpha_composite(copper, (7, 116 - copper.height - 8))
            if column == 3:
                panel = panel.convert('L').convert('RGB')
            panel = panel.resize((232, 186), Image.Resampling.NEAREST)
            image.paste(panel.convert('RGB'), (18 + column * 255, 119 + index * 194))
    info = next(iter(results[name]['highContrast'].values()))
    write_text(draw, (18, 710),
               f'HC material L*: {info["materialL"]}; copper body L* {info["copperL"]}. '
               f'Minimum tier gap {info["minimumCopperGap"]} L*.', 17)
    write_text(draw, (18, 740),
               'Director decision: HC body L* 42, with the sparkle suppressed to retain the dark value cue.', 17)
    write_text(draw, (18, 766),
               'The 3×3 known-ore exclusion is a separate runtime gate; copper here is a labelled comparison.', 14)
    image.save(out / 'sheet-crystal-contrast.png', optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('review')
    parser.add_argument('out')
    parser.add_argument('--context', help='actual settled default A7 SITE-4 capture')
    parser.add_argument('--contexts', help='after/manifest.json from art-captures-dressing.mjs; includes actual family detail frames')
    args = parser.parse_args()
    base = Path(args.review).resolve().parent
    review = json.loads(Path(args.review).read_text())
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    results = {v['variant']: measure_variant(base, v) for v in review['variants']}
    report = {
        'item': 'A7', 'tile': review['tile'], 'seed': review['seed'],
        'defaultVariants': review['defaultVariants'],
        'method': {
            'iou': 'art-review.py alpha_iou; alpha >127; scenery pairs at @2; ceiling anchors top-centre, floor anchors bottom-centre',
            'allFrameIoU': 'All 52 frames including animation, HC and emissive siblings; same-ceiling pairs align top-centre, other pairs bottom-centre; no scaling or best-fit translation; every pair over 0.70 listed',
            'boardIoU': 'manual visible counterpart polygons, unscaled drawing at 44.14 px/tile, trimmed visible bounds and anchor alignment only',
            'tiers': 'art_tiers.visible_svg_tiers; flat pixels only; minimum 2 pixels at @2, 8 at @4, 0.5 at matched scale',
            'exemptions': 'HC palette alternatives preserve their base silhouette; -emissive siblings hold light, not scenery; drip phases are one animation. Identity and motion pair values are reported separately.',
            'context': 'Variant contact columns are disclosed art review composites of authored art over a committed T2 SITE-4 capture. They do not measure placement, masking, lighting or collision.',
        },
        'boardPolygons': COUNTERPARTS,
        'actualRuntimeContext': os.path.basename(args.context) if args.context else None,
        'actualRuntimeDetailManifest': os.path.basename(args.contexts) if args.contexts else None,
        'variants': results,
    }
    (out / 'sheet.json').write_text(json.dumps(report, indent=2) + '\n')
    for family in FAMILIES:
        family_sheet(base, review, results, family, out, args.context, args.contexts)
    crystal_contrast_sheet(base, review, results, out)
    for name, data in results.items():
        short = []
        for frame_name, frame in data['frames'].items():
            if frame_name.endswith('-emissive'):
                continue
            for zone, measured in frame['density']['x4'].items():
                if len(measured['visible_tiers']) < 3:
                    short.append([frame_name, zone, len(measured['visible_tiers'])])
        print(json.dumps({'variant': name,
                          'iouOver070': {f: d['over070'] for f, d in data['families'].items() if d['over070']},
                          'shortOfThreeAt4x': short}, indent=1))


if __name__ == '__main__':
    main()
