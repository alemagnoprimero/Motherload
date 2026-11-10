"""Art item A13: the review sheets for the rig shading variants and the
emissive headlamp, beside the board's rig at the board's tile scale.

Reads the review.json that scripts/art-review-a13.mjs writes and writes, in
OUT_DIR:

    sheet-board.png     each of the six board panels' rig (rig_box from
                        d0-target-panels.json, 4x nearest) beside the rig
                        before A13 and each variant at the matched scale
                        (CONCEPT_TILE: 128 units = 58.85 px), aligned on the
                        silhouette's bbox centre, with alpha IoU against the
                        board silhouette (bottom-centre and bbox-centre)
    sheet-poses.png     the ten poses of each set at @3 (192 px)
    sheet-drill.png     the drill's eight frames (right and down) of each
                        set at @3, and at phone and board scale
    sheet-emissive.png  the default variant's lamp and indicator unlit and
                        lit, rig-cabin-emissive alone, and the rig with the
                        emissive added (ADD) on a dark cave and on a lit
                        surface background, at a04 desktop (175 device px a
                        rig, from the @4 page), phone (117 backing px, from
                        @2) and board scale; the other variants' lamps
    sheet-scales.png    rig-body-0, rig-cabin, rig-cabin-emissive at @2, @3,
                        @4 per set with the tread-row check
    sheet-icons.png     the HUD icons at 25, 50, 64 and 128 px: before,
                        as shipped, and each variant's rework
    sheet-tiers.png     the idle composite per set with its on-screen zone
                        map and the tiers per zone (swatches)
    contact-<v>.png     every rig and thrust frame of variant v at @2
    sheet.json          every measure

Measures:
- alpha IoU (alpha > 127, bbox-cropped) of the idle composite at the board's
  scale against each panel's board silhouette (rig.md §4.3 recipe: outline
  L* < 20 dilated 1 px, outside flooded from the crop border, inverted,
  eroded 1 px, clipped to rig_box), aligned bottom-centre
  (scripts/art-review.py alpha_iou) and bbox-centre;
- shading tiers per material zone (scripts/art_tiers.py): structural, from
  the fills in each data-zone group of the composite's sources; and on
  screen, from the pixels of the composite (flat pixels only, so
  anti-aliasing and gradients do not count; at least 3 % of the zone's flat
  pixels make a tier) inside each zone's visible mask (the zone-ID render:
  occlusion applied, outline inks excluded), at @2 and @4;
- tiers per frame, honestly (art_tiers.visible_svg_tiers): each variant
  frame's structural tiers per zone against the tiers whose fills reach
  the screen, as at least 8 flat pixels of their colour at @4 in the frame
  rendered alone, inside the zone's mask; the same at the other page
  densities with the pixel minimum scaled by area (4.5 at @3, 2 at @2: a
  fill must cover the same share of the frame); and, on the composites at @2,
  the tiers by fill colour (pixels within 2.5 ΔE of a zone's fill, flat or
  not: anti-aliasing blends match no fill, determinism.md §3) beside the
  flat-pixel reading, which needs bands of 4 px or more;
- the drill: pixels changing by more than 24 (premultiplied) per animation
  step at each scale, and the bit's own interior (non-outline) pixels;
- the hull's yellow (C* > 25, hue 65-100) and the orange (C* > 35, hue
  35-65) at the board's scale against the board's rig: mean, p25, p75 L*
  and mean C*;
- the tread row: the lowest row with any alpha in rig-body-0, exclusive,
  must be 100 * scale / 2 (check-campaign-assets.mjs);
- the lamp: the lens and indicator discs visible in every pose (share of the
  disc's pixels in the composite that equal rig-cabin's own), the halo's
  footprint over layers drawn in front of the cabin in each pose (pixels
  where the sibling has alpha, rig-cabin is opaque and the composite differs
  from it: the glow adds over that layer), the emissive extents, the ADD
  result's radial profile from the lens (L*, b*) and the halo's lift
  outside the rig's silhouette.

The ADD composite follows the runtime: the rig is drawn at depth 18-23,
above the darkness, so it is never darkened; rig-cabin-emissive is drawn
ADD at depth 23.9: out = min(1, dst + src.rgb * src.alpha) on premultiplied
texels (WebGL [ONE, DST_ALPHA] over an opaque canvas, Canvas 'lighter').

Usage: python3 scripts/art-review-a13.py REVIEW.json OUT_DIR
"""
import importlib.util
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import art_metrics as m  # noqa: E402
import art_tiers as tiers  # noqa: E402

spec = importlib.util.spec_from_file_location('art_review', os.path.join(HERE, 'art-review.py'))
ar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ar)

ROOT = os.path.dirname(HERE)
PANELS = ['surface-wide', 'shaft-wide', 'cavern-wide', 'surface-tall', 'shaft-tall', 'cavern-tall']
MATERIAL_ZONES = ['hull', 'paint', 'copper', 'silver', 'steel', 'tracks', 'glass']
# Backgrounds for the ADD composite: the cave air under the darkness
# (rgba(5,9,13,0.9) over band A's back wall) and a lit surface ground.
CAVE = (12, 17, 22)
SURFACE = (150, 158, 150)
PAPER, INK, MUTED = (238, 238, 234), (24, 24, 24), (90, 90, 90)
PASS, FAIL = (20, 120, 60), (170, 40, 40)
DESKTOP_RIG_PX = 65.4545 * 2 * 64 / 48   # a04: 65.45 CSS px per tile x backing 2
PHONE_RIG_PX = 44 * 2 * 64 / 48          # a04p: 44 CSS px per tile x backing 2


def rgba(path):
    return np.asarray(Image.open(path).convert('RGBA'))


def lstar(rgb):
    return np.asarray(m.lab(np.asarray(rgb, float).reshape(-1, 3))[0]).reshape(np.asarray(rgb).shape[:-1])


# ---------------------------------------------------------------- board masks
def dilate(mask, r=1):
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


def board_crop(panel, pad):
    p = m.panels()[panel]
    im = np.asarray(Image.open(os.path.join(ROOT, 'docs/art-direction', p['file'])).convert('RGB'))
    x0, y0, x1, y1 = p['rig_box']
    return im[y0 - pad:y1 + pad, x0 - pad:x1 + pad], p


def board_mask(panel, pad=2, threshold=20):
    """rig.md §4.3: the board rig's silhouette inside rig_box."""
    crop, _ = board_crop(panel, pad)
    dark = dilate(lstar(crop.astype(float)) < threshold, 1)
    h, w = dark.shape
    outside = np.zeros_like(dark)
    queue = deque([(i, j) for i in range(h) for j in (0, w - 1)] + [(i, j) for j in range(w) for i in (0, h - 1)])
    while queue:
        i, j = queue.popleft()
        if i < 0 or j < 0 or i >= h or j >= w or outside[i, j] or dark[i, j]:
            continue
        outside[i, j] = True
        queue.extend([(i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)])
    mask = ~dilate(outside, 1)
    keep = np.zeros_like(mask)
    keep[pad:h - pad, pad:w - pad] = True
    return mask & keep


def bbox(mask):
    ys, xs = np.nonzero(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def crop_mask(mask):
    x0, y0, x1, y1 = bbox(mask)
    return mask[y0:y1, x0:x1]


def iou_centre(a, b):
    """Alpha IoU with the two bbox centres on one point."""
    a, b = crop_mask(a), crop_mask(b)
    h, w = max(a.shape[0], b.shape[0]) + 2, max(a.shape[1], b.shape[1]) + 2

    def place(mask):
        c = np.zeros((h, w), bool)
        y, x = (h - mask.shape[0]) // 2, (w - mask.shape[1]) // 2
        c[y:y + mask.shape[0], x:x + mask.shape[1]] = mask
        return c
    a, b = place(a), place(b)
    return round(float((a & b).sum() / (a | b).sum()), 3)


# ---------------------------------------------------------------- composites
def over(bg, layer):
    """Normal alpha compositing of an RGBA uint8 layer on an RGB float image."""
    a = layer[..., 3:4] / 255.0
    return bg * (1 - a) + layer[..., :3] * a


def add(base, emissive):
    """ADD on premultiplied texels: min(255, dst + rgb * alpha)."""
    a = emissive[..., 3:4] / 255.0
    return np.minimum(255.0, base + emissive[..., :3].astype(float) * a)


def scene(rig, emissive, background, lit=True):
    bg = np.ones(rig.shape[:2] + (3,)) * np.array(background, float)
    out = over(bg, rig)
    if lit and emissive is not None:
        out = add(out, emissive)
    return out


def resample(img, size):
    return np.asarray(Image.fromarray(img).resize((size, size), Image.Resampling.BILINEAR))


def to_img(arr):
    return Image.fromarray(np.clip(np.round(arr), 0, 255).astype(np.uint8))


# ---------------------------------------------------------------- tiers
def structural(texts):
    return {z: {'tiers': len(r['tiers']), 'levels': [t[0] for t in r['tiers']], 'fills': r['fills']}
            for z, r in tiers.svg_tiers(''.join(texts)).items()}


def zone_masks(zone_img, ids):
    px = zone_img.astype(np.int32)
    out = {}
    for zone, colour in ids.items():
        c = [int(colour[i:i + 2], 16) for i in (1, 3, 5)]
        mask = (px[..., 0] == c[0]) & (px[..., 1] == c[1]) & (px[..., 2] == c[2]) & (px[..., 3] == 255)
        if mask.any():
            out[zone] = mask
    return out


def by_fill(render, zone_img, ids, texts, min_share=tiers.MIN_SHARE):
    """Tiers per zone from the pixels that match one of the zone's fills
    (within 2.5 ΔE, flat or not; anti-aliasing blends match none)."""
    masks = zone_masks(zone_img, ids)
    masks.pop('unzoned', None)
    fills = {z: r['fills'] for z, r in tiers.svg_tiers(''.join(texts)).items() if z in masks}
    counts = tiers.fill_pixels(render, fills, masks, flat=False)
    out = {}
    for zone, per in counts.items():
        total = sum(per.values()) or 1
        levels = [float(tiers.lch(tiers.hex_rgb(f))[0]) for f, n in per.items() if n / total >= min_share]
        out[zone] = {'tiers': len(tiers.tiers_from_levels(levels)), 'px': per}
    return out


MATERIAL = {'hull', 'paint', 'copper', 'silver', 'steel', 'tracks', 'glass', 'rank1', 'pads', 'flame'}


# The per-frame honest reading's pixel minimum: 8 flat px at @4, scaled by
# area at the other densities (the same share of the frame).
HONEST_MIN_PX = {'x4': 8, 'x3': 8 * (1.5 / 2) ** 2, 'x2': 8 * (1 / 2) ** 2}


def honesty(base, review, s, ids, scale='x4'):
    """Per frame of variant s: structural vs visible tiers per zone (the
    frame alone at `scale`, its zone twin as the masks)."""
    out = {}
    for name, rel in review['frames'][s].items():
        src = os.path.join(base, 'x2', f'{s}-src-{name}.svg')
        img = os.path.join(base, scale, f'{rel}.png')
        twin = os.path.join(base, scale, f'{s}-allz-{name}.png')
        if not (os.path.exists(src) and os.path.exists(img)):
            continue
        masks = zone_masks(rgba(twin), ids)
        result = tiers.visible_svg_tiers(src, img, masks, min_px=HONEST_MIN_PX[scale])
        out[name] = {z: {'structural': len(r['tiers']), 'visible': len(r['visible_tiers']), 'hidden': r['hidden']}
                     for z, r in result.items()}
    return out


def premul(img):
    a = img.astype(float)
    return a[..., :3] * a[..., 3:4] / 255.0


def drill_motion(paths):
    """Pixels changing by more than 24 (premultiplied) per step of a loop."""
    frames = [premul(rgba(p)) for p in paths]
    steps, peak = [], 0.0
    for i in range(len(frames)):
        diff = np.abs(frames[(i + 1) % len(frames)] - frames[i]).max(-1)
        steps.append(int((diff > 24).sum()))
        peak = max(peak, float(diff.max()))
    return {'changed_per_step': steps, 'min': min(steps), 'max': max(steps), 'max_delta': round(peak)}


def hue_stats(rgb, mask):
    L, a, b = (np.asarray(v) for v in m.lab(rgb[mask].reshape(-1, 3).astype(float)))
    C = np.hypot(a, b)
    H = np.degrees(np.arctan2(b, a)) % 360
    yellow = L[(C > 25) & (H >= 65) & (H <= 100)]
    orange = (C > 35) & (H >= 35) & (H < 65)
    return {'yellow_px': int(len(yellow)), 'yellow_mean_L': round(float(yellow.mean()), 1),
            'yellow_p25_L': round(float(np.percentile(yellow, 25)), 1),
            'yellow_p75_L': round(float(np.percentile(yellow, 75)), 1),
            'orange_px': int(orange.sum()), 'orange_mean_C': round(float(C[orange].mean()), 1) if orange.any() else 0}


def on_screen(render, zone_img, ids):
    """Tiers per zone on screen. Sources without data-zone groups (the rig
    before A13) fall back to art_tiers.py's LCh rule (hull, copper, glass,
    silver, dark), outline excluded."""
    masks = zone_masks(zone_img, ids)
    masks.pop('unzoned', None)
    if not masks:
        result = tiers.pixel_tiers(render)
        return {z: {'tiers': len(r['tiers']), 'levels': r['tiers'], 'px': r['px'], 'visible_px': None,
                    'rule': 'LCh'} for z, r in result.items()}
    result = tiers.pixel_tiers(render, zones=masks, keep_outline=True)
    return {z: {'tiers': len(r['tiers']), 'levels': r['tiers'], 'px': r['px'],
                'visible_px': int(masks[z].sum())} for z, r in result.items()}


# ---------------------------------------------------------------- text
def font(size, bold=False):
    return ar.font(size, bold)


def label(draw, xy, text, size=13, colour=INK, bold=False):
    draw.text(xy, text, fill=colour, font=font(size, bold))


def framed(img, zoom, background=(70, 80, 88)):
    """An RGBA render on a flat background, zoomed nearest."""
    arr = img if isinstance(img, np.ndarray) else np.asarray(img)
    if arr.shape[-1] == 4:
        arr = over(np.ones(arr.shape[:2] + (3,)) * np.array(background, float), arr)
    im = to_img(arr)
    return im.resize((int(im.width * zoom), int(im.height * zoom)), Image.Resampling.NEAREST)


# ---------------------------------------------------------------- main
def main(review_path, out_dir):
    base = os.path.dirname(os.path.abspath(review_path))
    review = json.load(open(review_path))
    os.makedirs(out_dir, exist_ok=True)
    sets = ['before'] + review['variants']
    ids = review['zoneIds']
    path = lambda scale, name: os.path.join(base, scale, f'{name}.png')
    metrics = {'item': 'A13', 'default': review['default'], 'before': review['before'],
               'lens': review['lens'], 'indicator': review['indicator'], 'sets': {}}

    # ---- board silhouettes and IoU
    masks = {p: board_mask(p) for p in PANELS}
    metrics['board'] = {p: {'rig_box': m.panels()[p]['rig_box'], 'silhouette_bbox': list(bbox(masks[p])),
                            'silhouette_px': int(masks[p].sum())} for p in PANELS}
    for s in sets:
        rec = metrics['sets'][s] = {}
        idle = rgba(path('board', review['sets'][s]['composites']['idle']))
        sm = idle[..., 3] > 127
        x0, y0, x1, y1 = bbox(sm)
        rec['board_scale_bbox_px'] = [x0, y0, x1, y1]
        rec['board_scale_size_px'] = [x1 - x0, y1 - y0]
        rec['iou'] = {p: {'bottom_centre': ar.alpha_iou(crop_mask(sm), crop_mask(masks[p])),
                          'bbox_centre': iou_centre(sm, masks[p])} for p in PANELS}
        rec['iou_min'] = min(min(v.values()) for v in rec['iou'].values())
        flipped = rgba(path('board', review['sets'][s]['composites']['flipped']))[..., 3] > 127
        rec['iou_flipped_mirrored'] = {p: ar.alpha_iou(crop_mask(flipped[:, ::-1]), crop_mask(masks[p])) for p in PANELS}
        # Composite bbox in frame units at @2 (alpha > 127).
        x2 = rgba(path('x2', review['sets'][s]['composites']['idle']))
        rec['units_bbox'] = list(bbox(x2[..., 3] > 127))

    # ---- tiers
    for s in sets:
        rec = metrics['sets'][s]
        rec['tiers'] = {}
        frames = review['frames'][s]
        for pose, comp in review['sets'][s]['composites'].items():
            texts = [open(os.path.join(base, f'{comp}.svg')).read()]
            entry = {'structural': structural(texts)}
            for scale in ('x2', 'x4'):
                render = rgba(path(scale, comp))
                zones = rgba(path(scale, comp + '-zones'))
                entry['screen_' + scale] = on_screen(render, zones, ids)
                if s != 'before':
                    entry['by_fill_' + scale] = by_fill(render, zones, ids, texts)
            rec['tiers'][pose] = entry
        rec['frame_structural'] = {}
        for name in frames:
            src = os.path.join(base, 'x2', f'{s}-src-{name}.svg')
            if os.path.exists(src):
                rec['frame_structural'][name] = {z: v['tiers'] for z, v in structural([open(src).read()]).items()}

    # ---- tread row, frame sizes
    expect = {'x2': 100, 'x3': 150, 'x4': 200}
    for s in sets:
        rec = metrics['sets'][s]
        rec['tread'] = {}
        for scale, want in expect.items():
            row = {}
            for frame in ('rig-body-0', 'rig-cabin', 'rig-cabin-emissive'):
                f = path(scale, f'{s}-frame-{frame}')
                if not os.path.exists(f):
                    continue
                a = rgba(f)[..., 3]
                rows = np.nonzero(a.any(1))[0]
                row[frame] = {'size': list(a.shape[::-1]), 'bottom': int(rows.max()) + 1 if len(rows) else None}
            row['expected'] = want
            row['pass'] = row.get('rig-body-0', {}).get('bottom') == want
            rec['tread'][scale] = row

    # ---- tiers per frame, honestly (@4; and @3, @2 with the minimum scaled)
    for s in review['variants']:
        rec = metrics['sets'][s]
        for scale, key in (('x4', ''), ('x3', '_x3'), ('x2', '_x2')):
            rec['frames_visible' + key] = honesty(base, review, s, ids, scale)
            short = {n: {z: v for z, v in zs.items() if z in MATERIAL and (v['visible'] < 3 or v['hidden'])}
                     for n, zs in rec['frames_visible' + key].items()}
            rec['frames_short' + key] = {n: zs for n, zs in short.items() if zs}
        rec['honest_min_px'] = HONEST_MIN_PX

    # ---- the drill's animation
    for s in sets:
        rec = metrics['sets'][s]
        rec['drill'] = {}
        for d, names in review['drill'][s].items():
            rec['drill'][d] = {scale: drill_motion([path(scale, n) for n in names])
                               for scale in ('board', 'x2', 'x3', 'x4')}
        # The bit's interior (non-outline) pixels, right-facing frame 0.
        rec['drill']['bit_interior_px'] = {}
        for scale, k in (('x2', 1), ('x3', 1.5), ('x4', 2)):
            a = rgba(path(scale, review['drill'][s]['right'][0]))
            sub = a[:, int(105.5 * k):]
            rec['drill']['bit_interior_px'][scale] = int(((sub[..., 3] > 250) & (lstar(sub[..., :3].astype(float)) > 22)).sum())

    # ---- yellow and orange at the board's scale
    metrics['board_hues'] = {}
    for p in ('surface-wide', 'shaft-wide', 'cavern-wide'):
        crop, _ = board_crop(p, 2)
        metrics['board_hues'][p] = hue_stats(crop, masks[p])
    for s in sets:
        idle = rgba(path('board', review['sets'][s]['composites']['idle']))
        metrics['sets'][s]['hues'] = hue_stats(idle[..., :3], idle[..., 3] > 200)

    # ---- lamp visibility and emissive
    for s in review['variants']:
        rec = metrics['sets'][s]
        cabin = rgba(path('x4', f'{s}-frame-rig-cabin'))
        emissive = rgba(path('x4', f'{s}-frame-rig-cabin-emissive'))
        cabin_flipped = rgba(path('x4', f'{s}-frame-rig-cabin-flipped'))
        k = 2  # @4: 2 px per unit
        yy, xx = np.mgrid[0:256, 0:256]
        vis = {}
        for name, (cx, cy, r) in {'lens': (review['lens']['x'], review['lens']['y'], 2.8),
                                  'indicator': (review['indicator']['x'], review['indicator']['y'], 1.6)}.items():
            disc = (xx + 0.5 - cx * k) ** 2 + (yy + 0.5 - cy * k) ** 2 <= (r * k) ** 2
            vis[name] = {}
            for pose, comp in review['sets'][s]['composites'].items():
                img = rgba(path('x4', comp))
                ref = cabin_flipped if pose in review['emissiveFlip'] else cabin
                d = disc[:, ::-1] if pose in review['emissiveFlip'] else disc
                same = np.all(img[d] == ref[d], axis=1)
                vis[name][pose] = round(float(same.mean()), 3)
        rec['lamp_visible_share'] = vis
        # The halo's footprint over layers in front of the cabin, per pose.
        a_em = emissive[..., 3]
        cover = {}
        for pose, comp in review['sets'][s]['composites'].items():
            img = rgba(path('x4', comp))
            flipped = pose in review['emissiveFlip']
            ref = cabin_flipped if flipped else cabin
            em_a = a_em[:, ::-1] if flipped else a_em
            over_front = (em_a > 0) & (ref[..., 3] == 255) & np.any(img != ref, axis=-1)
            cover[pose] = {'px': int(over_front.sum()), 'px_alpha_gt_32': int((over_front & (em_a > 32)).sum()),
                           'max_alpha': int(em_a[over_front].max()) if over_front.any() else 0}
        rec['halo_over_front_layers_x4'] = cover
        a = emissive[..., 3]
        ex = bbox(a > 0)
        rec['emissive'] = {
            'bbox_units': [round(v / k, 1) for v in ex],
            'bbox_alpha_gt_32_units': [round(v / k, 1) for v in bbox(a > 32)],
            'max_alpha': int(a.max()),
            'px_alpha_gt_0_at_x4': int((a > 0).sum()),
            'size': list(a.shape[::-1]),
        }
        idle = rgba(path('x4', review['sets'][s]['composites']['idle']))
        for bgname, bg in (('cave', CAVE), ('surface', SURFACE)):
            lit = scene(idle, emissive, bg)
            unlit = scene(idle, emissive, bg, lit=False)
            cx, cy = int(review['lens']['x'] * k), int(review['lens']['y'] * k)
            core = lit[cy - 2:cy + 2, cx - 2:cx + 2].reshape(-1, 3).mean(0)
            ring = []
            for r in (6, 10, 14, 18):
                ang = np.linspace(0, 2 * np.pi, 48, endpoint=False)
                pts = [(int(cy + r * np.sin(t)), int(cx + r * np.cos(t))) for t in ang]
                pts = [(y, x) for y, x in pts if 0 <= y < 256 and 0 <= x < 256]
                dl = [float(lstar(lit[y, x][None])[0] - lstar(unlit[y, x][None])[0]) for y, x in pts]
                ring.append(round(float(np.mean(dl)), 1))
            Lc, ac, bc = (float(np.ravel(v)[0]) for v in m.lab(core[None]))
            lab_lit = tiers.lab_image(lit)
            dL = lab_lit[..., 0] - tiers.lab_image(unlit)[..., 0]
            yy, xx = np.mgrid[0:256, 0:256]
            rr = np.hypot(xx + 0.5 - review['lens']['x'] * k, yy + 0.5 - review['lens']['y'] * k) / k
            outside = idle[..., 3] < 10
            profile = []
            for r0 in range(0, 10):
                band = (rr >= r0) & (rr < r0 + 1)
                out_band = band & outside
                profile.append({'r': [r0, r0 + 1], 'L': round(float(lab_lit[..., 0][band].mean()), 1),
                                'b': round(float(lab_lit[..., 2][band].mean()), 1),
                                'dL': round(float(dL[band].mean()), 1),
                                'outside_px': int(out_band.sum()),
                                'outside_dL': round(float(dL[out_band].mean()), 1) if out_band.any() else 0.0})
            # White (L* > 95) inside the lens disc only: the bulb core, not the
            # ring (the chrome bezel round it may brighten under the halo).
            white = (lab_lit[..., 0] > 95) & (rr <= 3.2)
            rec['emissive'][bgname] = {'lens_core_Lab': [round(Lc, 1), round(ac, 1), round(bc, 1)],
                                       'halo_dL_at_units_3_5_7_9': ring,
                                       'lens_white_radius_units': round(float(rr[white].max()), 2) if white.any() else 0.0,
                                       'profile': profile,
                                       'outside_silhouette_max_dL': max(p['outside_dL'] for p in profile)}

    # ---- icons: per-icon change against before (alpha IoU, mean dL)
    metrics['icons'] = {}
    for s in ['shipped'] + review['variants']:
        metrics['icons'][s] = {}
        for icon, name in review['icons'][s].items():
            a = rgba(os.path.join(base, 'icon64', f'{name}.png'))
            b = rgba(os.path.join(base, 'icon64', f'{review["icons"]["before"][icon]}.png'))
            ma, mb = a[..., 3] > 127, b[..., 3] > 127
            both = ma & mb
            la = lstar(a[..., :3].astype(float))
            lb = lstar(b[..., :3].astype(float))
            metrics['icons'][s][icon] = {
                'iou_vs_before': round(float(both.sum() / (ma | mb).sum()), 3),
                'mean_L': round(float(la[ma].mean()), 1), 'mean_L_before': round(float(lb[mb].mean()), 1),
                'outline_share': round(float(((la < 20) & ma).sum() / ma.sum()), 3),
                'outline_share_before': round(float(((lb < 20) & mb).sum() / mb.sum()), 3),
            }

    json.dump(metrics, open(os.path.join(out_dir, 'sheet.json'), 'w'), indent=1)
    sheets(review, metrics, base, out_dir, masks, path)
    return metrics


# ---------------------------------------------------------------- sheets
def sheets(review, metrics, base, out_dir, masks, path):
    sets = ['before'] + review['variants']
    default = review['default']
    names = {s: (f'{s} (default)' if s == default else s) for s in sets}

    # sheet-board: rows = panels; columns = board, before, variants (4x)
    Z, PAD = 4, 8
    cell_w = (54 + 2 * PAD) * Z
    cell_h = (38 + 2 * PAD) * Z
    cols = 1 + len(sets)
    sheet = Image.new('RGB', (160 + cols * (cell_w + 10), 40 + len(PANELS) * (cell_h + 34) + 84), PAPER)
    d = ImageDraw.Draw(sheet)
    label(d, (10, 8), 'A13 rig at the board\'s scale (44.14 px/tile, 128 units = 58.85 px), 4x nearest. '
          'IoU vs the board silhouette: bottom-centre / bbox-centre', 15, bold=True)
    for j, s in enumerate(['board'] + sets):
        label(d, (160 + j * (cell_w + 10), 26), names.get(s, 'board rig_box'), 13, bold=True)
    for i, p in enumerate(PANELS):
        y = 44 + i * (cell_h + 34)
        crop, info = board_crop(p, PAD)
        bg = tuple(int(v) for v in np.median(np.concatenate([crop[0], crop[-1], crop[:, 0], crop[:, -1]]), 0))
        label(d, (10, y + 10), p, 14, bold=True)
        mb = masks[p]
        label(d, (10, y + 30), f'board {mb.shape[1] - 4}x{mb.shape[0] - 4} box', 11, MUTED)
        sheet.paste(Image.fromarray(crop).resize((crop.shape[1] * Z, crop.shape[0] * Z), Image.Resampling.NEAREST),
                    (160, y))
        bx0, by0, bx1, by1 = bbox(mb)
        bcx, bcy = (bx0 + bx1) / 2 + PAD - 2, (by0 + by1) / 2 + PAD - 2
        for j, s in enumerate(sets):
            rig = rgba(path('board', review['sets'][s]['composites']['idle']))
            sm = rig[..., 3] > 127
            x0, y0, x1, y1 = bbox(sm)
            canvas = np.ones((crop.shape[0], crop.shape[1], 3)) * np.array(bg, float)
            ox, oy = int(round(bcx - (x0 + x1) / 2)), int(round(bcy - (y0 + y1) / 2))
            layer = np.zeros(canvas.shape[:2] + (4,), np.uint8)
            for yy in range(rig.shape[0]):
                ty = yy + oy
                if 0 <= ty < canvas.shape[0]:
                    xs = slice(max(0, ox), min(canvas.shape[1], ox + rig.shape[1]))
                    layer[ty, xs] = rig[yy, xs.start - ox:xs.stop - ox]
            img = framed(over(canvas, layer), Z)
            x = 160 + (j + 1) * (cell_w + 10)
            sheet.paste(img, (x, y))
            iou = metrics['sets'][s]['iou'][p]
            ok = min(iou.values()) >= 0.7
            label(d, (x, y + cell_h + 2), f'IoU {iou["bottom_centre"]:.3f} / {iou["bbox_centre"]:.3f}', 13, PASS if ok else FAIL)
    # Footer: the yellow and orange at the board's scale, against the board.
    y = 44 + len(PANELS) * (cell_h + 34)
    hue = lambda h: (f'yellow L* mean {h["yellow_mean_L"]:.1f} p25 {h["yellow_p25_L"]:.1f} p75 {h["yellow_p75_L"]:.1f}'
                     f'  orange C* {h["orange_mean_C"]:.1f} ({h["orange_px"]} px)')
    label(d, (10, y), 'Hues at the board\'s scale (yellow: C* > 25, hue 65-100; orange: C* > 35, hue 35-65):', 13, bold=True)
    label(d, (10, y + 18), '   '.join(f'board {p}: ' + hue(metrics['board_hues'][p]) for p in ('surface-wide', 'shaft-wide')), 11)
    label(d, (10, y + 34), '   '.join(f'{names[s]}: ' + hue(metrics['sets'][s]['hues']) for s in sets[:2])
          + f'   board cavern-wide: ' + hue(metrics['board_hues']['cavern-wide']), 11)
    label(d, (10, y + 50), '   '.join(f'{names[s]}: ' + hue(metrics['sets'][s]['hues']) for s in sets[2:]), 11)
    sheet.save(os.path.join(out_dir, 'sheet-board.png'))

    # sheet-poses: rows = sets, cols = poses (@3, 192 px)
    poses = review['poses']
    W = 196
    sheet = Image.new('RGB', (130 + len(poses) * W, 40 + len(sets) * (W + 20)), PAPER)
    d = ImageDraw.Draw(sheet)
    label(d, (10, 8), 'Poses at @3 (192 px = 1.333 tiles); emissive added (ADD) on the variants', 15, bold=True)
    for j, pose in enumerate(poses):
        label(d, (130 + j * W, 26), pose, 12, bold=True)
    for i, s in enumerate(sets):
        y = 44 + i * (W + 20)
        label(d, (10, y + 80), names[s], 13, bold=True)
        em = review['sets'][s]['emissive']
        for j, pose in enumerate(poses):
            comp = review['sets'][s]['composites'][pose]
            rig = rgba(path('x3', comp))
            e = None
            if em:
                e = rgba(path('x3', em + ('-flipped' if pose in review['emissiveFlip'] else '')))
            sheet.paste(to_img(scene(rig, e, (61, 71, 80))), (130 + j * W, y))
    sheet.save(os.path.join(out_dir, 'sheet-poses.png'))

    # sheet-emissive (default variant, plus the other variants' lamp)
    sheet = Image.new('RGB', (1500, 1300), PAPER)
    d = ImageDraw.Draw(sheet)
    label(d, (10, 8), f'Headlamp and cabin indicator ({default}): rig-cabin unlit, rig-cabin-emissive, '
          'and the rig + emissive (ADD at depth 23.9, the rig above the darkness)', 15, bold=True)
    cabin4 = rgba(path('x4', f'{default}-frame-rig-cabin'))
    em4 = rgba(path('x4', f'{default}-frame-rig-cabin-emissive'))
    idle4 = rgba(path('x4', review['sets'][default]['composites']['idle']))
    # Lamp zoom: frame units 78..112 x 22..56 at @4, x4 more.
    box = (78 * 2, 22 * 2, 112 * 2, 56 * 2)
    zoom_unlit = to_img(scene(idle4, em4, CAVE, lit=False)).crop(box).resize((272, 272), Image.Resampling.NEAREST)
    zoom_lit = to_img(scene(idle4, em4, CAVE)).crop(box).resize((272, 272), Image.Resampling.NEAREST)
    alone = to_img(scene(np.zeros_like(em4), em4, (0, 0, 0))).crop(box).resize((272, 272), Image.Resampling.NEAREST)
    for k, (img, text) in enumerate([(zoom_unlit, 'unlit (rig-cabin), cave'), (zoom_lit, 'lit (+ emissive ADD), cave'),
                                     (alone, 'rig-cabin-emissive alone on black')]):
        sheet.paste(img, (10 + k * 290, 50))
        label(d, (10 + k * 290, 326), text, 12)
    zs = to_img(scene(idle4, em4, SURFACE)).crop(box).resize((272, 272), Image.Resampling.NEAREST)
    sheet.paste(zs, (880, 50))
    label(d, (880, 326), 'lit, surface daylight', 12)
    # Scales: desktop a04 (175 px from @4), phone (117 backing px from @2, shown 1.5x = physical), board.
    y = 360
    label(d, (10, y), f'a04 desktop: {DESKTOP_RIG_PX:.1f} device px per rig (from @4)    phone a04p: '
          f'{PHONE_RIG_PX:.1f} backing px (from @2), shown at 1.5x (physical)    board: 59 px (x3)', 13, bold=True)
    y += 22
    x = 10
    for pose in ('idle', 'flipped'):
        comp = review['sets'][default]['composites'][pose]
        emname = f'{default}-emissive' + ('-flipped' if pose in review['emissiveFlip'] else '')
        for bgname, bg in (('cave', CAVE), ('surface', SURFACE)):
            for which, scale, size, show in (('desktop', 'x4', int(round(DESKTOP_RIG_PX)), 1.0),
                                             ('phone', 'x2', int(round(PHONE_RIG_PX)), 1.5),
                                             ('board', 'board', 59, 3.0)):
                rig = rgba(path(scale, comp))
                e = rgba(path(scale, emname))
                if rig.shape[0] != size:
                    rig, e = resample(rig, size), resample(e, size)
                for lit in (False, True):
                    img = to_img(scene(rig, e, bg, lit))
                    img = img.resize((int(img.width * show), int(img.height * show)),
                                     Image.Resampling.BILINEAR if show == 1.5 else Image.Resampling.NEAREST)
                    if x + img.width > 1490:
                        x = 10
                        y += 200
                    sheet.paste(img, (x, y))
                    label(d, (x, y + img.height + 1), f'{pose} {bgname} {which} {"lit" if lit else "unlit"}', 10, MUTED)
                    x += img.width + 8
    y += 210
    label(d, (10, y), 'Other variants (lamp zoom, cave, lit):', 13, bold=True)
    for k, s in enumerate(review['variants']):
        c = rgba(path('x4', review['sets'][s]['composites']['idle']))
        e = rgba(path('x4', f'{s}-frame-rig-cabin-emissive'))
        img = to_img(scene(c, e, CAVE)).crop(box).resize((204, 204), Image.Resampling.NEAREST)
        sheet.paste(img, (10 + k * 220, y + 20))
        label(d, (10 + k * 220, y + 226), names[s], 12)
    sheet.save(os.path.join(out_dir, 'sheet-emissive.png'))

    # sheet-scales: tread rows
    sheet = Image.new('RGB', (2280, 60 + len(sets) * 300), PAPER)
    d = ImageDraw.Draw(sheet)
    label(d, (10, 8), 'rig-body-0, rig-cabin, rig-cabin-emissive at @2 / @3 / @4; red line = row 100*scale/2 '
          '(lowest alpha row of rig-body-0 must end there)', 15, bold=True)
    for i, s in enumerate(sets):
        y = 40 + i * 300
        label(d, (10, y), names[s], 13, bold=True)
        x = 10
        for scale in ('x2', 'x3', 'x4'):
            tr = metrics['sets'][s]['tread'][scale]
            for frame in ('rig-body-0', 'rig-cabin', 'rig-cabin-emissive'):
                f = path(scale, f'{s}-frame-{frame}')
                if not os.path.exists(f):
                    continue
                img = framed(rgba(f), 1, (40, 46, 52) if 'emissive' in frame else (70, 80, 88))
                if frame == 'rig-body-0':
                    dd = ImageDraw.Draw(img)
                    dd.line([(0, tr['expected']), (img.width, tr['expected'])], fill=(230, 40, 40))
                sheet.paste(img, (x, y + 20))
                txt = f'{scale} {frame.replace("rig-", "")}'
                if frame == 'rig-body-0':
                    txt += f' bottom {tr[frame]["bottom"]}/{tr["expected"]}'
                label(d, (x, y + 22 + img.height), txt, 10, PASS if (frame != 'rig-body-0' or tr['pass']) else FAIL)
                x += img.width + 6
    sheet.save(os.path.join(out_dir, 'sheet-scales.png'))

    # sheet-icons: 128 and 64/50 at 1x, 25 at 1x and 3x nearest
    icons = list(review['icons']['before'])
    icon_sets = ['before', 'shipped'] + review['variants']
    frozen = {'drill', 'cargo', 'hull', 'engine', 'rack'}
    cw = 128 + 4 + 64 + 4 + 75 + 16
    sheet = Image.new('RGB', (150 + len(icons) * cw, 60 + len(icon_sets) * 160), PAPER)
    d = ImageDraw.Draw(sheet)
    label(d, (10, 8), 'HUD icons at 128, 64, 50 and 25 px (25 also at 3x nearest; the HUD shows them at 22-31 CSS px). '
          'Shipped: drill, cargo, hull, engine, rack keep the pre-A13 drawing; energy, feet follow the rework', 15, bold=True)
    icon_names = {'before': 'before', 'shipped': 'shipped',
                  **{v: f'rework {v}' + (' *' if v == default else '') for v in review['variants']}}
    for i, s in enumerate(icon_sets):
        y = 50 + i * 160
        label(d, (10, y + 50), icon_names[s], 13, bold=True)
        for j, icon in enumerate(icons):
            name = review['icons'][s][icon]
            x = 150 + j * cw
            ic = lambda size: framed(rgba(os.path.join(base, f'icon{size}', f'{name}.png')), 1, (32, 44, 52))
            sheet.paste(ic(128), (x, y))
            sheet.paste(ic(64), (x + 132, y))
            sheet.paste(ic(50), (x + 132, y + 68))
            small = rgba(os.path.join(base, 'icon25', f'{name}.png'))
            sheet.paste(framed(small, 1, (32, 44, 52)), (x + 200, y))
            sheet.paste(framed(small, 3, (32, 44, 52)), (x + 200, y + 29))
            if i == 0:
                label(d, (x, 30), icon, 12, bold=True)
            if s == 'shipped':
                label(d, (x, y + 130), 'pre-A13 (frozen)' if icon in frozen else 'rework (facets)', 11,
                      MUTED if icon in frozen else PASS)
    sheet.save(os.path.join(out_dir, 'sheet-icons.png'))

    # sheet-drill: the eight frames, right and down, per set
    sheet = Image.new('RGB', (150 + 8 * 104, 50 + len(sets) * 4 * 104), PAPER)
    d = ImageDraw.Draw(sheet)
    label(d, (10, 8), 'Drill frames 0-7 (16 fps): right and down at @3 (crop, 1x), right at phone (117 px rig, '
          'bilinear from @2, 3x) and board scale (59 px, 4x); pixels changed per step at @2', 15, bold=True)
    y = 40
    for s in sets:
        rec = metrics['sets'][s]['drill']
        for row, (d_, scale, size, zoom, crop) in enumerate((
                ('right', 'x3', 192, 1, (86, 46, 128, 90)), ('down', 'x3', 192, 1, (40, 86, 88, 128)),
                ('right', 'x2', int(round(PHONE_RIG_PX)), 3, (88, 50, 128, 86)),
                ('right', 'board', 59, 4, (86, 44, 128, 92)))):
            label(d, (10, y + 30), f'{names[s]}', 12, bold=True)
            mo = rec[d_]['x2' if scale != 'board' else 'board']
            label(d, (10, y + 48), f'{d_} {"@3" if scale == "x3" else ("phone" if scale == "x2" else "board")}', 11, MUTED)
            label(d, (10, y + 64), f'{mo["min"]}-{mo["max"]} px/step', 11, MUTED)
            for i, name in enumerate(review['drill'][s][d_]):
                img = rgba(path(scale, name))
                if img.shape[0] != size:
                    img = resample(img, size)
                k = size / 128
                box_ = tuple(int(round(c * k)) for c in crop)
                tile = framed(img[box_[1]:box_[3], box_[0]:box_[2]], zoom, (40, 46, 52))
                tile = tile.crop((0, 0, min(tile.width, 100), min(tile.height, 100)))
                sheet.paste(tile, (150 + i * 104, y))
            y += 104
    sheet.save(os.path.join(out_dir, 'sheet-drill.png'))

    # sheet-tiers: idle at @4 with the zone map and tier swatches
    sheet = Image.new('RGB', (1500, 60 + len(sets) * 300), PAPER)
    d = ImageDraw.Draw(sheet)
    label(d, (10, 8), 'Shading tiers per material zone on screen (idle composite; art_tiers.py pixel reading at @4, '
          'flat pixels, zone masks after occlusion) and structural (data-zone fills)', 15, bold=True)
    for i, s in enumerate(sets):
        y = 40 + i * 300
        comp = review['sets'][s]['composites']['idle']
        sheet.paste(framed(rgba(path('x4', comp)), 1), (10, y + 20))
        sheet.paste(framed(rgba(path('x4', comp + '-zones')), 1), (276, y + 20))
        label(d, (10, y), names[s], 13, bold=True)
        t = metrics['sets'][s]['tiers']['idle']
        if s != 'before':
            short = metrics['sets'][s]['frames_short']
            by2 = t.get('by_fill_x2', {})
            label(d, (10, y + 280 - 4), f'frames with a material zone under 3 visible tiers or a hidden fill (alone): '
                  f'@4 {len(short)}, @3 {len(metrics["sets"][s]["frames_short_x3"])}, '
                  f'@2 {len(metrics["sets"][s]["frames_short_x2"])}    idle @2 flat / by fill: ' + '  '.join(
                      f'{z} {t["screen_x2"].get(z, {}).get("tiers", 0)}/{by2.get(z, {}).get("tiers", 0)}'
                      for z in MATERIAL_ZONES if z in by2 or z in t['screen_x2']), 11,
                  PASS if not short else FAIL)
        x0 = 545
        for k, zone in enumerate(MATERIAL_ZONES):
            yy = y + 20 + k * 36
            scr = t['screen_x4'].get(zone)
            st = t['structural'].get(zone)
            ok = scr is not None and scr['tiers'] >= 3
            label(d, (x0, yy), f'{zone:7s} screen {scr["tiers"] if scr else 0}  struct {st["tiers"] if st else 0}', 12,
                  PASS if ok else FAIL)
            if scr:
                for n, (L, share) in enumerate(scr['levels'][:8]):
                    v = int(round(255 * (((L + 16) / 116) ** 3 if L > 8 else L / 903.3) ** (1 / 2.2)))
                    d.rectangle([x0 + 230 + n * 90, yy, x0 + 250 + n * 90, yy + 18], fill=(v, v, v), outline=INK)
                    label(d, (x0 + 254 + n * 90, yy + 2), f'L{L:.0f} {share * 100:.0f}%', 10, MUTED)
    sheet.save(os.path.join(out_dir, 'sheet-tiers.png'))

    # contact sheets
    for s in [default]:
        frames = review['frames'][s]
        n = len(frames)
        cols = 12
        sheet = Image.new('RGB', (cols * 134 + 10, 40 + ((n + cols - 1) // cols) * 150), PAPER)
        d = ImageDraw.Draw(sheet)
        label(d, (10, 8), f'Every rig and thrust frame, {names[s]}, @2 (128 px)', 15, bold=True)
        for k, (name, rel) in enumerate(frames.items()):
            x, y = 10 + (k % cols) * 134, 34 + (k // cols) * 150
            sheet.paste(framed(rgba(path('x2', rel)), 1, (40, 46, 52) if 'emissive' in name else (70, 80, 88)), (x, y))
            label(d, (x, y + 130), name.replace('rig-', ''), 9, MUTED)
        sheet.save(os.path.join(out_dir, f'contact-{s}.png'))


if __name__ == '__main__':
    result = main(sys.argv[1], sys.argv[2])
    print('board hues ' + json.dumps(result['board_hues']))
    for s, rec in result['sets'].items():
        iou = ' '.join(f'{p.split("-")[0][:2]}{p.split("-")[1][0]} {v["bottom_centre"]:.3f}/{v["bbox_centre"]:.3f}'
                       for p, v in rec['iou'].items())
        print(f'{s:8s} IoU {iou}  min {rec["iou_min"]:.3f}')
        t = rec['tiers']['idle']
        print('         screen@4 ' + ' '.join(f'{z}:{t["screen_x4"].get(z, {}).get("tiers", 0)}' for z in MATERIAL_ZONES)
              + '  @2 ' + ' '.join(f'{z}:{t["screen_x2"].get(z, {}).get("tiers", 0)}' for z in MATERIAL_ZONES)
              + '  struct ' + ' '.join(f'{z}:{t["structural"].get(z, {}).get("tiers", 0)}' for z in MATERIAL_ZONES))
        if 'by_fill_x2' in t:
            print('         @2 by fill ' + ' '.join(f'{z}:{t["by_fill_x2"].get(z, {}).get("tiers", 0)}' for z in MATERIAL_ZONES))
        print('         tread ' + ' '.join(f'{k}:{v.get("rig-body-0", {}).get("bottom")}/{v["expected"]}' for k, v in rec['tread'].items()))
        print('         drill ' + ' '.join(f'{d}@{sc}:{v[sc]["min"]}-{v[sc]["max"]}(max {v[sc]["max_delta"]})'
                                       for d, v in rec['drill'].items() if d != 'bit_interior_px' for sc in ('board', 'x2', 'x3'))
              + f' bit interior {rec["drill"]["bit_interior_px"]}')
        print('         hues ' + json.dumps(rec['hues']))
        if 'frames_short' in rec:
            print(f'         frames short of 3 visible tiers or with hidden fills: {len(rec["frames_short"])} '
                  + json.dumps(dict(list(rec['frames_short'].items())[:6])))
            for key in ('_x3', '_x2'):
                short = rec['frames_short' + key]
                print(f'         ... at {key[1:]}: {len(short)} frames, {sum(len(v) for v in short.values())} zone-frames')
        if 'halo_over_front_layers_x4' in rec:
            print('         halo over front layers @4 ' + json.dumps(rec['halo_over_front_layers_x4']))
        if 'lamp_visible_share' in rec:
            print('         lens visible ' + json.dumps(rec['lamp_visible_share']['lens']))
            print('         indicator visible ' + json.dumps(rec['lamp_visible_share']['indicator']))
            print('         emissive ' + json.dumps(rec['emissive']))
