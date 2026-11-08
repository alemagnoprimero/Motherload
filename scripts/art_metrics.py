"""Visual-harness measures (audit F3, docs/ART_QUALITY_AUDIT.md §5.2 and §9.2).

A port of docs/art-audit/prototype/metrics.py as an importable module (that
file runs its whole analysis on import). These are copied verbatim, with the
same names, constants and resampling, and scripts/art-metrics-check.py checks
them against metrics.py's own definitions:

    lstar, luma, hsv, edge_density, frame_stats, gblur, axis_share, rescale,
    sobel_l, lab

These are metrics.py's inline steps made into functions over a game capture:

    mean_grad_flat   mean_grad_and_flat() on an image instead of a path
    wall_profile     the shaft wall probe (rows 2.5 and 4.5 of world x = 20)
    headlamp_axis    the cavern headlamp core samples

and these are new:

    shaft_walls          where the wall probe goes on a game shaft: rows 3
                         and 1 above the rig, skipping a wall cell with ore
    ore_cells            the cells holding deposits or exposed ore

    overlay_edge_share   04-overlays.md §6.1: strong edges with and without
                         overlays
    cell_regions         unknown / known solid / known air / sky per device
                         pixel, from the exported campaign; the prototype read
                         its renderer's debug-regions masks instead
    region_stats         the §9.2 region rows built on cell_regions
    cave_air_mask        the natural-cave air mask for axis_share, from known
                         cells (the game draws cells as squares)
    panel_crop           a concept panel at its interior minus the HUD
    scoring_window       a game window cropped around the rig (§4.3)
    matched_window       a game window at the concept panels' tile scale

Needs Python 3 with Pillow and NumPy.
"""
import json
import os

import numpy as np
from PIL import Image, ImageFilter

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ART_DIRECTION = os.path.join(REPO, 'docs', 'art-direction')

# metrics.py: HUD rectangles on a 1440x900@2 capture (device px).
CAPTURE_HUD = [(0, 0, 1080, 450), (2130, 0, 2880, 160), (2810, 600, 2880, 1400), (0, 1640, 470, 1800), (2600, 1640, 2880, 1800), (1180, 1540, 1700, 1800)]
# metrics.py's gradient box on a 2880x1800 capture: below the HUD row, above
# the toolbar, left of the depth rail.
GRADIENT_BOX = (0, 460, 2780, 1560)
# §4.4: the board shows about 15.7 tiles across a 693 px panel (tile about
# 44 px); the tall panels show about 5.6 across 246 px. One scale for all six.
CONCEPT_TILE = 693 / 15.7
# §9.1: concept crops stay at least 5 px inside the panel border.
CONCEPT_INSET = 5


# ---- verbatim from docs/art-audit/prototype/metrics.py ----------------------
def lstar(rgb):
    c = rgb.astype(np.float64) / 255
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    Y = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    return np.where(Y > 216 / 24389, 116 * np.cbrt(Y) - 16, Y * 24389 / 27)


def luma(a):
    a = a.astype(float); return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def hsv(rgb):
    r, g, b = [rgb[..., i].astype(np.float64) / 255 for i in range(3)]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b); d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-9), 0); h = np.zeros_like(mx); m = d > 1e-9
    rr = m & (mx == r); gg = m & (mx == g) & ~rr; bb = m & ~rr & ~gg
    h[rr] = ((g - b)[rr] / d[rr]) % 6; h[gg] = ((b - r)[gg] / d[gg]) + 2; h[bb] = ((r - g)[bb] / d[bb]) + 4
    return h * 60, s, mx


def edge_density(im, mask, width=690):
    h = round(im.shape[0] * width / im.shape[1])
    small = np.asarray(Image.fromarray(im.astype(np.uint8)).resize((width, h), Image.LANCZOS)).astype(np.int32)
    m = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).resize((width, h), Image.NEAREST)) > 0
    L = lstar(small); gx = np.zeros_like(L); gy = np.zeros_like(L)
    gx[:, 1:-1] = (L[:, 2:] - L[:, :-2]) / 2; gy[1:-1, :] = (L[2:, :] - L[:-2, :]) / 2
    g = np.hypot(gx, gy); m[0, :] = m[-1, :] = False; m[:, 0] = m[:, -1] = False
    return float((g[m] > 6).mean())


def frame_stats(im, mask):
    px = im[mask]; L = lstar(px); H, S, V = hsv(px)
    hist, edges = np.histogram(L, bins=100, range=(0, 100)); mode = edges[np.argmax(hist)] + 0.5
    warm = (H >= 15) & (H <= 55) & (S > 0.35) & (V > 0.35)
    cyan = (H >= 170) & (H <= 200) & (S > 0.35) & (V > 0.35)
    p = np.percentile(L, [2, 50, 98])
    return {'L_mean': round(float(L.mean()), 1), 'L_sd': round(float(L.std()), 1), 'L_p2': round(float(p[0]), 1), 'L_p98': round(float(p[2]), 1),
            'L_range_p2_p98': round(float(p[2] - p[0]), 1), 'within3_of_mode': round(float((np.abs(L - mode) <= 3).mean()), 3),
            'warm_pct': round(100 * float(warm.mean()), 2), 'cyan_pct': round(100 * float(cyan.mean()), 2),
            'edge_density': round(edge_density(im, mask), 3)}


def gblur(x, r):
    return np.asarray(Image.fromarray(np.clip(x, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(float)


def axis_share(air, tol=5):
    """boundary.py: blur the air mask, Sobel, share of boundary gradient within 5 deg of an axis."""
    m = gblur(air.astype(float) * 255, 1.5) / 255
    p = np.pad(m * 255, 1, mode='edge')
    gx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:] - p[:-2, :-2] - 2 * p[1:-1, :-2] - p[2:, :-2]) / 8
    gy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:] - p[:-2, :-2] - 2 * p[:-2, 1:-1] - p[:-2, 2:]) / 8
    mag = np.hypot(gx, gy); b = (m > 0.15) & (m < 0.85)
    th = np.degrees(np.arctan2(gy, gx)) % 180
    d = np.minimum.reduce([np.abs(th), np.abs(th - 90), np.abs(th - 180)])
    return float((mag * (b & (d <= tol))).sum() / max(1e-9, (mag * b).sum()))


def rescale(a, s, resample=Image.LANCZOS):
    im = Image.fromarray(a); return np.asarray(im.resize((round(im.width * s), round(im.height * s)), resample))


def sobel_l(l):
    p = np.pad(l, 1, mode='edge')
    gx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:] - p[:-2, :-2] - 2 * p[1:-1, :-2] - p[2:, :-2]) / 8
    gy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:] - p[:-2, :-2] - 2 * p[:-2, 1:-1] - p[:-2, 2:]) / 8
    return np.hypot(gx, gy)


def lab(rgb):
    c = np.asarray(rgb, float) / 255; lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]); xyz = lin @ M.T / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return 116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])
# ---- end of the verbatim block ----------------------------------------------


def load_rgb(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.int32)


def mean_grad_flat(rgb, tile_dev, box=GRADIENT_BOX):
    """metrics.py mean_grad_and_flat() on an RGB array: resample to 42 px per
    tile, take the box (2880x1800 device px; scaled to other frame sizes),
    luma, blur 0.8, mean Sobel; flat share = within 10 luma of the mode."""
    im = Image.fromarray(rgb.astype(np.uint8)); sc = 42.0 / tile_dev
    fx, fy = im.width / 2880, im.height / 1800
    im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS); a = np.asarray(im)
    x0, y0, x1, y1 = round(box[0] * fx * sc), round(box[1] * fy * sc), round(box[2] * fx * sc), round(box[3] * fy * sc)
    l = luma(a[y0:y1, x0:x1]); lb = np.asarray(Image.fromarray(np.clip(l, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(float)
    hist, _ = np.histogram(l, bins=256, range=(0, 256)); mode = np.argmax(hist)
    return round(float(sobel_l(lb).mean()), 2), round(float((np.abs(l - mode) <= 10).mean()), 3)


def shaft_walls(state, rig, rows_above=(3, 1), reach=4):
    """Where metrics.py's wall probe goes on a game shaft: for the rows 3 and 1
    above the rig's (the prototype probed rows 2.5 and 4.5 above its rig at
    5.6), the first solid cell left of the rig, within `reach` cells, with air
    to its right. A row whose wall cell holds a deposit is left out: the probe
    would read the ore sprite as rock. Returns {row + 0.5: wall world x}, upper
    row first."""
    world = campaign_world(state)
    width, rows = world['width'], world['rows']
    tiles = world['tiles']
    ore = ore_cells(world)
    col, row = int(np.floor(rig[0])), int(np.floor(rig[1]))

    def tile(x, y):
        return tiles[y * width + x % width] if 0 <= y < rows else 0

    walls = {}
    for y in (row - k for k in rows_above):
        for x in range(col, col - reach, -1):
            if tile(x, y) == 0 and tile(x - 1, y) != 0:
                if ((x - 1) % width, y) not in ore:
                    walls[y + 0.5] = x
                break
    return walls


def wall_profile(rgb, view, dpr, walls):
    """metrics.py's shaft wall probe: 29 samples from 0.45 tile inside the rock
    to 0.25 tile into the air across a left shaft wall, each the mean luma of a
    5-row band; `walls` maps world rows to the wall's world x (metrics.py: x =
    20 at rows 2.5 and 4.5 of the prototype shaft)."""
    l = luma(rgb); tile, cx, cy = view['tile'], view['scrollX'], view['scrollY']; prof = {}
    for wy, wall_x in walls.items():
        Y = int((wy * tile - cy) * dpr); X = (wall_x * tile - cx) * dpr
        xs = [int(X + t * tile * dpr) for t in np.linspace(-0.45, 0.25, 29)]
        if Y < 2 or Y + 3 > l.shape[0] or min(xs) < 0 or max(xs) >= l.shape[1]:
            continue
        row = [round(float(l[Y - 2:Y + 3, x].mean()), 0) for x in xs]
        prof[f'row{wy}'] = {'rock_-0.4tile': row[1], 'lip_peak': max(row[10:18]), 'undercut_min': min(row[17:24]), 'air_+0.2tile': row[-2], 'samples': row}
    return prof


def headlamp_axis(rgb, view, dpr, rig):
    """metrics.py's headlamp core: Lab L* and b* of 13x13 px patches 0.35, 0.8
    and 1.5 tiles along a ray 14 degrees below horizontal from (rig.x + 0.40,
    rig.y - 0.13), the prototype's lamp for a right-facing rig."""
    tile, cx, cy = view['tile'], view['scrollX'], view['scrollY']; core = {}
    for d in (0.35, 0.8, 1.5):
        ang = np.radians(14); wx = rig[0] + 0.40 + np.cos(ang) * d; wy = rig[1] - 0.13 + np.sin(ang) * d
        X, Y = int((wx * tile - cx) * dpr), int((wy * tile - cy) * dpr)
        if Y < 6 or X < 6 or Y + 7 > rgb.shape[0] or X + 7 > rgb.shape[1]:
            continue
        patch = rgb[Y - 6:Y + 7, X - 6:X + 7].reshape(-1, 3)
        L_, A_, B_ = lab(patch.mean(0)); core[f'{d}tile'] = {'L': round(float(L_), 1), 'b': round(float(B_), 1)}
    return core


def overlay_edge_share(full, hudfree, css_size, hud_boxes, threshold=80, grow=3):
    """04-overlays.md §6.1: downsample to the CSS size (1440x900 on desktop),
    take the luma gradient magnitude, count pixels above 80 in the playfield
    with the HUD row, objective card and toolbar masked; overlay share =
    (edges(full) - edges(?overlays=0)) / edges(full). Each HUD box grows by
    `grow` CSS px, the Sobel radius plus the downsample's footprint, so the
    masked elements' own outlines do not count as overlay edges.

    The audit's edge-share.py is not committed. The magnitude here is the
    unnormalised 3x3 Sobel (8 x sobel_l, the SciPy and OpenCV convention): it
    puts the game's art edges at about 1 % of pixels, the order of the audit's
    0.007, where metrics.py's normalised sobel_l gives 0.03 %."""
    w, h = css_size
    mask = np.ones((h, w), bool)
    for x0, y0, x1, y1 in hud_boxes:
        x0, y0, x1, y1 = x0 - grow, y0 - grow, x1 + grow, y1 + grow
        mask[max(0, int(y0)):min(h, int(np.ceil(y1))), max(0, int(x0)):min(w, int(np.ceil(x1)))] = False
    mask[0, :] = mask[-1, :] = False; mask[:, 0] = mask[:, -1] = False

    def edges(rgb):
        small = np.asarray(Image.fromarray(rgb.astype(np.uint8)).resize((w, h), Image.LANCZOS)).astype(np.int32)
        return (8 * sobel_l(luma(small)) > threshold) & mask

    e_full, e_free = edges(full), edges(hudfree)
    n_full, n_free = int(e_full.sum()), int(e_free.sum())
    return {'edges_full': n_full, 'edges_hudfree': n_free, 'playfield_px': int(mask.sum()),
            'overlay_share': round((n_full - n_free) / n_full, 3) if n_full else None,
            'art_edge_density': round(n_free / max(1, int(mask.sum())), 4)}


def campaign_world(state):
    """The current world of an exported checkpoint (or of its state)."""
    st = state.get('state', state)
    return st['worlds'][st['currentWorld']]


def ore_cells(world):
    """(x, y) of every cell holding a deposit or exposed ore."""
    width, rows = world['width'], world['rows']
    cells = set()
    for item in world.get('packages', []):
        if item['status'] in ('deposit', 'exposed'):
            yy = int(np.floor(item['y'])); xx = int(np.floor(item['x'])) % width
            if 0 <= yy < rows:
                cells.add((xx, yy))
    return cells


def cell_grid(view, dpr, shape):
    """Cell coordinates and fractional position of every device pixel."""
    H, W = shape
    tile, sx, sy = view['tile'], view['scrollX'], view['scrollY']
    X = (np.arange(W) + 0.5) / dpr + sx; Y = (np.arange(H) + 0.5) / dpr + sy
    cx = np.floor(X / tile).astype(int); fx = X / tile - cx
    cy = np.floor(Y / tile).astype(int); fy = Y / tile - cy
    return np.meshgrid(cx, cy), np.meshgrid(fx, fy)


def cell_regions(state, view, dpr, shape):
    """Per device pixel: the cell under it, and whether it is sky, unknown,
    known solid or known air, and the tile code (1 soil, 2 hard rock, 4 plate).
    The prototype's region masks came from its renderer (debug-regions-*.png,
    0 unknown solid / 85 known solid / 170 known air / 255 sky)."""
    world = campaign_world(state)
    width, rows = world['width'], world['rows']
    tiles = np.array(world['tiles']); disc = np.array(world['discovered'])
    (CX, CY), (FX, FY) = cell_grid(view, dpr, shape)
    inside = (CY >= 0) & (CY < rows)
    idx = np.where(inside, np.clip(CY, 0, rows - 1) * width + np.mod(CX, width), 0)
    known = inside & (disc[idx] == 1); solid = inside & (tiles[idx] != 0)
    ore = np.zeros(width * rows, bool)
    for xx, yy in ore_cells(world):
        ore[yy * width + xx] = True
    return {'CX': CX, 'CY': CY, 'FX': FX, 'FY': FY, 'inside': inside, 'sky': ~inside & (CY < 0),
            'unknown': inside & ~known, 'known_solid': known & solid, 'known_air': known & ~solid,
            'kind': np.where(inside, tiles[idx], 0), 'ore': inside & ore[idx]}


def stat(v):
    return {'luma': round(float(v.mean()), 1), 'sd': round(float(v.std()), 1), 'n': int(v.size)} if v.size > 500 else None


# Fewer lit cells than this and "near the lamp" is the block under the tracks.
MIN_LIT_CELLS = 3


def region_stats(rgb, state, view, dpr, rig, keep=None):
    """The §9.2 region rows on a HUD-free frame. Each cell contributes its
    interior (20 % to 80 % in both axes); ore cells and the rig box are left
    out. "Lit" is known solid of any kind within 2.5 tiles of the rig, scored
    only with at least MIN_LIT_CELLS cells; "near a light" is within 3 tiles
    (the rig's lamp is the only light in these fixtures). As in 06-prototype.md
    §3, "rock" is solid terrain of every kind: hard rock is named as such."""
    H, W = rgb.shape[:2]
    r = cell_regions(state, view, dpr, (H, W))
    l = luma(rgb)
    sel = (r['FX'] >= 0.2) & (r['FX'] <= 0.8) & (r['FY'] >= 0.2) & (r['FY'] <= 0.8)
    if keep is not None:
        sel &= keep
    rx, ry = view['rigScreenX'] * dpr, view['rigScreenY'] * dpr; half = view['tile'] * dpr * 0.75
    sel[max(0, int(ry - half)):int(ry + half), max(0, int(rx - half)):int(rx + half)] = False
    dist = np.hypot(r['CX'] + 0.5 - rig[0], r['CY'] + 0.5 - rig[1])
    unknown = sel & r['unknown']
    solid = sel & r['known_solid'] & ~r['ore']
    air = sel & r['known_air']
    lit = solid & (dist <= 2.5)
    lit_cells = int(np.unique(r['CY'][lit] * 100003 + r['CX'][lit]).size)
    out = {
        'unknown': stat(l[unknown]),
        'known_lit': stat(l[lit]) if lit_cells >= MIN_LIT_CELLS else None,
        'lit_cells': lit_cells,
        'cave_air': stat(l[air]),
        'rock_near_light': stat(l[solid & (dist <= 3)]),
        'known_solid': stat(l[solid]),
    }
    u, a, k, s = out['unknown'], out['cave_air'], out['known_lit'], out['known_solid']

    def diff(x, y):
        return round(x['luma'] - y['luma'], 1) if x and y else None
    out['known_lit_minus_unknown'] = diff(k, u)
    out['known_solid_minus_unknown'] = diff(s, u)
    out['unknown_minus_cave_air'] = diff(u, a)
    out['lit_minus_cave_air'] = diff(k, a)
    # 06-prototype.md §3 scored "lit rock minus cave air" on all known solid
    # (cavern 62.9 - 46.2): around a cavern few solid cells lie near the lamp.
    out['solid_minus_cave_air'] = diff(s, a)
    return out


def cave_air_mask(state, view, dpr, shape, scale_to=42.0):
    """The known-air mask and a hard-rock mask, resampled as metrics.py
    resamples the prototype's air mask (42 px per tile, bilinear, > 127).
    Every known air cell counts as natural: the SITE-4 fixture digs nothing."""
    r = cell_regions(state, view, dpr, shape)
    s = scale_to / (view['tile'] * dpr)
    air = rescale((r['known_air'] * 255).astype(np.uint8), s, Image.BILINEAR) > 127
    hard = rescale(((r['known_solid'] & (r['kind'] == 2)) * 255).astype(np.uint8), s, Image.BILINEAR) > 127
    return air, hard


def axis_share_excluding(air, exclude, tol=5):
    """axis_share() with the boundary band also kept clear of `exclude`
    (dilated by 3 px), for §9.2's "hard rock excluded"."""
    grown = gblur(exclude.astype(float) * 255, 1.5) > 1
    m = gblur(air.astype(float) * 255, 1.5) / 255
    p = np.pad(m * 255, 1, mode='edge')
    gx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:] - p[:-2, :-2] - 2 * p[1:-1, :-2] - p[2:, :-2]) / 8
    gy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:] - p[:-2, :-2] - 2 * p[:-2, 1:-1] - p[:-2, 2:]) / 8
    mag = np.hypot(gx, gy); b = (m > 0.15) & (m < 0.85) & ~grown
    th = np.degrees(np.arctan2(gy, gx)) % 180
    d = np.minimum.reduce([np.abs(th), np.abs(th - 90), np.abs(th - 180)])
    return float((mag * (b & (d <= tol))).sum() / max(1e-9, (mag * b).sum()))


def panels():
    return json.load(open(os.path.join(ART_DIRECTION, 'd0-target-panels.json')))['panels']


def panel_crop(panel_id):
    """A concept panel crop and its scoring mask: the interior from
    d0-target-panels.json, at least CONCEPT_INSET px inside the window (§9.1),
    minus hud_mask."""
    p = panels()[panel_id]
    rgb = load_rgb(os.path.join(ART_DIRECTION, p['file']))
    h, w = rgb.shape[:2]
    mask = np.zeros((h, w), bool)
    x0, y0, x1, y1 = p['interior']
    x0, y0 = max(x0, CONCEPT_INSET), max(y0, CONCEPT_INSET)
    x1, y1 = min(x1, w - CONCEPT_INSET), min(y1, h - CONCEPT_INSET)
    mask[y0:y1, x0:x1] = True
    for hx0, hy0, hx1, hy1 in p['hud_mask']:
        mask[hy0:hy1, hx0:hx1] = False
    return rgb, mask, p


def scoring_window(view, panel):
    """§4.3: the panel's game window (1440x743, 1440x792, 393x572 or 393x608
    CSS px), placed so the rig sits at the panel's rig_anchor_fraction and
    clamped to the frame. Returns (x0, y0, x1, y1) in CSS px and where the rig
    actually sits in it."""
    gw, gh = (int(v) for v in panel['game_window'].split('x'))
    fx, fy = panel['rig_anchor_fraction']
    W, H = view['width'], view['height']
    x0 = min(max(0, view['rigScreenX'] - fx * gw), max(0, W - gw))
    y0 = min(max(0, view['rigScreenY'] - fy * gh), max(0, H - gh))
    x1, y1 = min(W, x0 + gw), min(H, y0 + gh)
    return (x0, y0, x1, y1), ((view['rigScreenX'] - x0) / gw, (view['rigScreenY'] - y0) / gh)


def matched_window(view, panel):
    """The game region that shows as many tiles as the concept panel: the
    panel's size divided by its tile scale, around the rig at the panel's
    rig_anchor_fraction, clamped to the frame. Returns CSS px and the scale
    from CSS px to panel px."""
    w, h = panel['size']
    s = CONCEPT_TILE / view['tile']
    gw, gh = w / s, h / s
    fx, fy = panel['rig_anchor_fraction']
    W, H = view['width'], view['height']
    x0 = min(max(0, view['rigScreenX'] - fx * gw), max(0, W - gw))
    y0 = min(max(0, view['rigScreenY'] - fy * gh), max(0, H - gh))
    return (x0, y0, min(W, x0 + gw), min(H, y0 + gh)), s


def crop_device(rgb, box, dpr):
    x0, y0, x1, y1 = (int(round(v * dpr)) for v in box)
    return rgb[y0:y1, x0:x1]
