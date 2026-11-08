"""Review sheet at the board's tile scale, with the IoU duplicate check (art kit).

Every art round is shown beside the board at matched scale (style guide §8,
audit §6.4). An art session's driver composes its candidate panels and writes
review.json (scripts/art-review-a4.mjs is the first); this script lays them
out under the board's crop with their measures and writes:

    SHEET.png            the board, then each candidate with its measures
    SHEET-grid.png       the board and up to three candidates, 2 x 2, no text
    SHEET.json           the measures

review.json, paths relative to it:
    panel      concept panel id (docs/art-direction/d0-target-panels.json)
    variants   [{style, panel (PNG), layers? {name: PNG of that layer alone
               in the panel}, pages? {name: PNG of the page at 1x}}]
    ground     the panel's ground line; adds the surface measures (A4, T7)
    pageGround {name: row}, each backdrop page's ground row; the IoU then
               compares the silhouettes above it, aligned there
    tile       px per tile in the panel (art_metrics.CONCEPT_TILE)
    planet     [x, y, w, h], the sky body, left out of the horizon measure
    frames     [{label, captures (an art-captures.mjs folder), capture (its
               name), sky ([top, bottom] of scene.ts's sky gradient)}]: game
               frames measured against the sky they were drawn with

Checks on pages (style guide §3, §8; audit W3 and W8): alpha IoU <= 0.70
between any two frames. Ridge pages also get the asset check's rules
(check-campaign-assets.mjs): first and last columns identical, bottom quarter
opaque, and skyline agreement < 0.40 between layers.

Usage: python3 scripts/art-review.py REVIEW.json SHEET.png
"""
import json
import os
import sys
from itertools import combinations

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import art_metrics as m  # noqa: E402

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
INK, MUTED, PAPER = (24, 24, 24), (90, 90, 90), (238, 238, 234)
PASS, FAIL = (20, 120, 60), (170, 40, 40)

# The board's surface props in the surface-wide panel (lander and dish, the
# small lamp, tripod lamps, cable, crates, rig, rocks): not A4 art, so the
# backdrop statistics leave them out on the board and on every candidate.
SURFACE_PROPS = [(68, 78, 176, 268), (44, 220, 72, 268), (184, 198, 220, 268), (150, 230, 250, 268),
                 (226, 238, 298, 268), (330, 215, 410, 268), (512, 192, 568, 268), (582, 244, 693, 268)]


def font(size, bold=False):
    path = FONT.replace('DejaVuSans.ttf', 'DejaVuSans-Bold.ttf') if bold else FONT
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def rgba(path):
    return np.asarray(Image.open(path).convert('RGBA')).astype(np.int32)


def opaque(path):
    return rgba(path)[..., 3] > 127


# ---------------------------------------------------------------- page checks
def alpha_iou(a, b, silhouette_only=False):
    """Alpha IoU of two masks on one canvas, aligned bottom-centre (props
    stand on the floor, originY 1). With `silhouette_only`, rows solid in
    both masks are left out: two full-width backdrops share their solid
    mass, which carries no silhouette."""
    h, w = max(a.shape[0], b.shape[0]), max(a.shape[1], b.shape[1])

    def place(mask):
        canvas = np.zeros((h, w), bool)
        y0, x0 = h - mask.shape[0], (w - mask.shape[1]) // 2
        canvas[y0:, x0:x0 + mask.shape[1]] = mask
        return canvas
    a, b = place(a), place(b)
    if silhouette_only:
        keep = ~(a.all(1) & b.all(1))
        a, b = a[keep], b[keep]
    union = (a | b).sum()
    return round(float((a & b).sum() / union), 3) if union else 0.0


def first_rows(mask):
    any_ = mask.any(0)
    return np.where(any_, mask.argmax(0), mask.shape[0])


def skyline_agreement(a, b, tolerance=8):
    """check-campaign-assets.mjs: share of columns whose skylines (first row
    with alpha > 127) are within 8 px."""
    return round(float((np.abs(first_rows(a) - first_rows(b)) <= tolerance).mean()), 3)


def page_rules(path):
    px = rgba(path)
    return {'seam': bool((px[:, 0] == px[:, -1]).all()),
            'opaque_base': bool((px[int(px.shape[0] * 0.75):, :, 3] == 255).all())}


# ---------------------------------------------------------------- measures
def backdrop_mask(shape, panel, ground):
    """Rows 5 to the ground line, minus the board's HUD and props."""
    mask = np.zeros(shape, bool)
    mask[m.CONCEPT_INSET:ground - 2, m.CONCEPT_INSET:shape[1] - m.CONCEPT_INSET] = True
    for x0, y0, x1, y1 in list(panel['hud_mask']) + SURFACE_PROPS:
        mask[y0:y1, x0:x1] = False
    return mask


def crescent(rgb, box):
    x, y, w, h = (int(round(v)) for v in box)
    patch = rgb[y:y + h, x:x + w]
    H, S, V = m.hsv(patch)
    warm = (H >= 15) & (H <= 55) & (S > 0.35) & (V > 0.35)
    if warm.sum() < 20:
        return None
    L, A, B = m.lab(np.median(patch[warm], 0))
    return {'L': round(float(L), 1), 'chroma': round(float(np.hypot(A, B)), 1)}


def surface_measures(base, variant, review, panel, rgb, mask):
    ground, tile = review['ground'], review['tile']
    layers = {name: opaque(os.path.join(base, path)) for name, path in variant['layers'].items()}
    ridge = np.zeros(rgb.shape[:2], bool)
    for layer in layers.values():
        ridge |= layer
    tops = m.skyline_tops(ridge, ground)
    x, _, w, _ = review['planet']
    exclude = np.zeros(rgb.shape[1], bool)
    exclude[int(x):int(x + w)] = True
    out = {'horizon_L': m.horizon_lstar(rgb, tops, ground, exclude),
           **m.ridge_heights(tops, ground, rgb.shape[0], tile)}
    # Each layer's L*, where it is the front layer above the ground line.
    seen = np.zeros(rgb.shape[:2], bool)
    above = np.zeros(rgb.shape[:2], bool)
    above[:ground - 1] = True
    lightness = m.lstar(rgb)
    out['layer_L'] = {}
    for name in ('near', 'mid', 'far'):
        if name not in layers:
            continue
        front = layers[name] & ~seen & above
        seen |= layers[name]
        out['layer_L'][name] = round(float(lightness[front].mean()), 1) if front.sum() > 200 else None
    values = [v for v in out['layer_L'].values() if v is not None]
    out['layer_gap'] = round(min(abs(a - b) for a, b in combinations(values, 2)), 1) if len(values) > 1 else None
    out['crescent'] = crescent(rgb, review['planet'])
    return out


def measure(base, variant, review, panel, board_mask):
    rgb = m.load_rgb(os.path.join(base, variant['panel']))
    out = {'backdrop': m.frame_stats(rgb, board_mask)}
    if 'ground' in review and variant.get('layers'):
        out.update(surface_measures(base, variant, review, panel, rgb, board_mask))
    pages = {name: os.path.join(base, path) for name, path in variant.get('pages', {}).items()}
    if pages:
        masks = {name: opaque(path) for name, path in pages.items()}
        out['pages'] = {name: page_rules(path) for name, path in pages.items()}
        # The asset check's measure, on the pages as they are.
        out['skyline_agreement'] = {f'{a}-{b}': skyline_agreement(masks[a], masks[b]) for a, b in combinations(masks, 2)}
        if review.get('pageGround'):
            # Backdrop pages: compare the silhouettes above each page's ground
            # row, aligned there, as the game stands them on the surface.
            masks = {name: mask[:review['pageGround'][name]] for name, mask in masks.items()}
        out['iou'] = {f'{a}-{b}': alpha_iou(masks[a], masks[b], bool(review.get('pageGround'))) for a, b in combinations(masks, 2)}
    return out


def game_surface(capture, sky, panel):
    """The surface measures on a game capture (art-captures.mjs): the skyline
    is found against the sky gradient scene.ts draws (`sky`: its top and
    bottom colours), and the frame statistics are taken in the panel's
    scoring window, as the §9.2 table takes them."""
    rgb = m.load_rgb(capture['hudFree'])
    dpr, view = capture['deviceScaleFactor'], capture['view']
    surface = -view['scrollY']
    ground = int(round(surface * dpr))
    model = m.gradient_sky(sky[0], sky[1], min(view['height'], surface) * dpr, rgb.shape)
    tops = m.skyline_tops(m.ridge_mask_from_sky(rgb, model), ground)
    sky_like = ~m.ridge_mask_from_sky(rgb, model, tolerance=4)
    values = []
    for x, top in enumerate(tops):
        y0, y1 = max(0, top - int(6 * dpr)), max(0, top - int(2 * dpr))
        if top < ground and y1 > y0 and sky_like[y0:y1, x].any():
            values.append(m.lstar(rgb[y0:y1, x][sky_like[y0:y1, x]]))
    heights = ground - tops
    tile = view['tile'] * dpr
    gw, gh = (int(v) for v in panel['game_window'].split('x'))
    window, _ = m.scoring_window(view, panel)
    crop = m.crop_device(rgb, window, dpr)
    out = {'horizon_L': round(float(np.median(np.concatenate(values))), 1) if values else None,
           'peak_tiles': round(float(heights.max()) / tile, 2),
           'mean_tiles': round(float(heights.mean()) / tile, 2),
           'peak_share_frame': round(float(heights.max()) / rgb.shape[0], 3),
           'peak_share_window': round(float(heights.max()) / (gh * dpr), 3),
           'tiles_across': round(view['width'] / view['tile'], 1),
           'window': m.frame_stats(crop, np.ones(crop.shape[:2], bool)),
           'crescent': crescent(rgb, (0, 0, rgb.shape[1], max(1, int(np.min(tops)) - 2)))}
    return out


def frame_lines(r, board):
    rows = [(f"Ridge peak {r['peak_tiles']:.2f} tiles, {r['tiles_across']} tiles across", None),
            (f"  {100 * r['peak_share_frame']:.1f} % of the frame, {100 * r['peak_share_window']:.1f} % of the scoring window", None),
            (f"Skyline mean {r['mean_tiles']:.2f} tiles above ground", None),
            (f"Horizon L* {r['horizon_L']} (board 27.5; T7 26 to 31)", 26 <= r['horizon_L'] <= 31 if r['horizon_L'] else None)]
    if r.get('crescent'):
        rows.append((f"Crescent L* {r['crescent']['L']}, chroma {r['crescent']['chroma']} (≥35)", r['crescent']['chroma'] >= 35))
    w = r['window']
    rows += [(f"Window L* mean {w['L_mean']} (board {board['L_mean']})", None),
             (f"Window warm share {w['warm_pct']:.2f} % (board {board['warm_pct']:.2f} %)", None),
             (f"Window edge density {w['edge_density']:.3f} (board {board['edge_density']:.3f})", None)]
    return rows


# ---------------------------------------------------------------- the sheet
def lines_for(name, r, board):
    """(text, ok) lines for one candidate; ok is None, True or False."""
    rows = []
    if 'peak_share' in r:
        rows.append((f"Ridge peak {100 * r['peak_share']:.1f} % of frame ({r['peak_tiles']:.2f} tiles); board about 31 %",
                     27 <= 100 * r['peak_share'] <= 35))
        rows.append((f"Skyline mean {r['mean_tiles']:.2f} tiles above ground", None))
        rows.append((f"Horizon L* {r['horizon_L']} (board 27.5; T7 26 to 31)", 26 <= r['horizon_L'] <= 31 if r['horizon_L'] else None))
        layer_text = ', '.join(f'{k} {v}' for k, v in r['layer_L'].items() if v is not None)
        rows.append((f"Layer L*: {layer_text}; closest pair {r['layer_gap']} apart (≥4)", r['layer_gap'] >= 4 if r['layer_gap'] else None))
        if r.get('crescent'):
            rows.append((f"Crescent L* {r['crescent']['L']}, chroma {r['crescent']['chroma']} (≥35)", r['crescent']['chroma'] >= 35))
    b, c = r['backdrop'], board
    rows.append((f"Backdrop L* mean {b['L_mean']} (board {c['L_mean']}), sd {b['L_sd']} ({c['L_sd']})", None))
    rows.append((f"Warm share {b['warm_pct']:.2f} % (board's backdrop {c['warm_pct']:.2f} %)", None))
    rows.append((f"Edge density {b['edge_density']:.3f} (board {c['edge_density']:.3f})", None))
    if 'iou' in r:
        worst = max(r['iou'].values())
        rows.append((f"Alpha IoU between layers ≤ {worst:.2f} (≤0.70)", worst <= 0.70))
        agree = max(r['skyline_agreement'].values())
        rows.append((f"Skyline agreement ≤ {100 * agree:.0f} % (<40 %)", agree < 0.40))
        rules = all(p['seam'] and p['opaque_base'] for p in r['pages'].values())
        rows.append(('Pages: seam columns match, base opaque', rules))
    return rows


def draw_rows(draw, x, y, rows, size=15):
    f = font(size)
    for text, ok in rows:
        mark = '' if ok is None else (' ✓' if ok else ' ✗')
        draw.text((x, y), text + mark, font=f, fill=INK if ok is None else (PASS if ok else FAIL))
        y += size + 7
    return y


def sheet(base, review, panel, board_rgb, results, board_stats, path, frames=()):
    pw, ph = panel['size']
    text_w, pad, head = 560, 16, 34
    strip_scale = 1 / 3
    blocks = []
    # The board.
    blocks.append(('Board: d0-target-surface-wide.png (F0 target pending)', Image.fromarray(board_rgb.astype(np.uint8)),
                   [(f"Backdrop L* mean {board_stats['L_mean']}, sd {board_stats['L_sd']}", None),
                    (f"Warm share {board_stats['warm_pct']:.2f} % (props left out)", None),
                    ('Ridges peak about 31 % of frame, 2.5 tiles (audit)', None),
                    ('Horizon L* 27.5 (sample), 28.3 (audit)', None)], None))
    for variant in review['variants']:
        name = variant['style']
        image = Image.open(os.path.join(base, variant['panel'])).convert('RGB')
        strip = None
        if variant.get('pages'):
            pages = [Image.open(os.path.join(base, p)).convert('RGBA') for p in variant['pages'].values()]
            sw = int(pages[0].width * strip_scale)
            sh = int(pages[0].height * strip_scale)
            strip = Image.new('RGB', (len(pages) * (sw + pad), sh + 22), PAPER)
            d = ImageDraw.Draw(strip)
            for i, (label, page) in enumerate(zip(variant['pages'], pages)):
                tile = Image.new('RGBA', page.size, (40, 60, 72, 255))
                tile.alpha_composite(page)
                strip.paste(tile.convert('RGB').resize((sw, sh), Image.LANCZOS), (i * (sw + pad), 20))
                d.text((i * (sw + pad), 2), f'{label} page (1024 x 384, @2x)', font=font(13), fill=MUTED)
        blocks.append((f"Variant {name}", image, lines_for(name, results[name], board_stats), strip))
    for label, capture, measures, panel_stats in frames:
        rgb = m.load_rgb(capture['hudFree'])
        box, _ = m.matched_window(capture['view'], panel)
        matched = Image.fromarray(m.crop_device(rgb, box, capture['deviceScaleFactor']).astype(np.uint8)).resize((pw, ph), Image.LANCZOS)
        full_w = pw + pad + text_w
        full = Image.fromarray(rgb.astype(np.uint8))
        full = full.resize((full_w, round(full.height * full_w / full.width)), Image.LANCZOS)
        strip = Image.new('RGB', (full_w, full.height + 22), PAPER)
        ImageDraw.Draw(strip).text((0, 2), 'the whole HUD-free frame', font=font(13), fill=MUTED)
        strip.paste(full, (0, 20))
        blocks.append((f"In game: {label} (left: the board's tile scale around the rig)", matched,
                       frame_lines(measures, panel_stats), strip))
    width = pad + pw + pad + text_w + pad
    height = sum(head + ph + (b[3].height + pad if b[3] else 0) + pad for b in blocks) + pad
    img = Image.new('RGB', (width, height), PAPER)
    d = ImageDraw.Draw(img)
    y = pad
    for title, image, rows, strip in blocks:
        d.text((pad, y), title, font=font(19, True), fill=INK)
        y += head
        img.paste(image, (pad, y))
        draw_rows(d, pad + pw + pad, y + 4, rows)
        y += ph + pad
        if strip:
            img.paste(strip, (pad, y))
            y += strip.height + pad
    img.save(path, optimize=True)
    # 2 x 2 grid of panels for a phone.
    tiles = [(t, i) for t, i, _, _ in blocks][:4]
    grid = Image.new('RGB', (2 * pw + 3 * pad, 2 * (ph + head) + 3 * pad), PAPER)
    g = ImageDraw.Draw(grid)
    for k, (title, image) in enumerate(tiles):
        gx, gy = pad + (k % 2) * (pw + pad), pad + (k // 2) * (ph + head + pad)
        g.text((gx, gy), title.split(':')[0], font=font(20, True), fill=INK)
        grid.paste(image, (gx, gy + head))
    grid.save(path.replace('.png', '-grid.png'), optimize=True)


def main():
    review_path, out = sys.argv[1], sys.argv[2]
    base = os.path.dirname(os.path.abspath(review_path))
    review = json.load(open(review_path))
    board_rgb, _, panel = m.panel_crop(review['panel'])
    mask = backdrop_mask(board_rgb.shape[:2], panel, review.get('ground', board_rgb.shape[0]))
    board_stats = m.frame_stats(board_rgb, mask)
    results = {v['style']: measure(base, v, review, panel, mask) for v in review['variants']}
    # The board's statistics over its whole panel, as the §9.2 table scores it.
    full_stats = m.frame_stats(*m.panel_crop(review['panel'])[:2])
    frames, frame_results = [], {}
    for frame in review.get('frames', []):
        folder = os.path.join(base, frame['captures'])
        capture = json.load(open(os.path.join(folder, 'manifest.json')))['captures'][frame['capture']]
        for key in ('hudFree', 'file'):
            capture[key] = os.path.join(folder, os.path.basename(capture[key]))
        r = game_surface(capture, frame['sky'], panel)
        frame_results[frame['label']] = r
        frames.append((frame['label'], capture, r, full_stats))
    sheet(base, review, panel, board_rgb, results, board_stats, out, frames)
    json.dump({'board': board_stats, 'board_panel': full_stats, 'variants': results, 'frames': frame_results},
              open(out.replace('.png', '.json'), 'w'), indent=1)
    for name, r in {**results, **frame_results}.items():
        print(name, json.dumps({k: v for k, v in r.items() if k not in ('pages',)}))


if __name__ == '__main__':
    main()
