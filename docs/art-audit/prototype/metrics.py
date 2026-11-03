"""Metrics for the technique prototype, using the definitions of the earlier audits.

L*, HSV warm/cyan share and edge density follow work/lighting/stats.py; the
axis-aligned boundary share follows work/terrain/boundary.py (same blur, Sobel,
5 degree tolerance and 42 px-per-tile rescale). Region luma for the prototype
uses its own exact region masks (debug-regions-*.png).

Needs `node render.mjs` first (it writes the renders into out/), and CAPTURES set to a
folder that holds the session captures in shots/ and shots2/. Neither is committed. The
working scripts named above (work/...) are not committed either; this file carries the
same definitions.
"""
import json, os
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
SH = os.path.join(os.environ.get('CAPTURES', 'captures'), 'shots') + '/'  # session captures, not committed
BOARD = os.path.join(HERE, '..', '..', 'art-direction', 'd0-target-board.png')
# Concept panel boxes on the board (desktop panels, inner area) and HUD rectangles inside them.
PANELS = {'surface': (227, 142, 918, 500), 'shaft': (227, 527, 918, 879), 'cavern': (227, 903, 918, 1282)}
CONCEPT_HUD = [(8, 5, 308, 45), (366, 5, 690, 45), (8, 45, 166, 82)]
CAPTURE_HUD = [(0, 0, 1080, 450), (2130, 0, 2880, 160), (2810, 600, 2880, 1400), (0, 1640, 470, 1800), (2600, 1640, 2880, 1800), (1180, 1540, 1700, 1800)]
GAME = {'surface': 'a02-spawn-1440x900@2.png', 'shaft': 'a04-dive-60m@2.png', 'cavern': 'c-site-W01-SITE-4-wreck@2.png'}
TILE_DEV = {'surface': 115.2, 'shaft': 130.9, 'cavern': 137.5}  # device px per tile at 1440x900@2


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


res = {'concept': {}, 'game': {}, 'proto': {}, 'proto_regions': {}, 'proto_boundary': {}, 'proto_phone': {}}
board = np.asarray(Image.open(BOARD).convert('RGB')).astype(np.int32)
for k, (x0, y0, x1, y1) in PANELS.items():
    a = board[y0:y1, x0:x1]; m = np.ones(a.shape[:2], bool)
    for hx0, hy0, hx1, hy1 in CONCEPT_HUD: m[hy0:hy1, hx0:hx1] = False
    res['concept'][k] = frame_stats(a, m)
for k, f in GAME.items():
    a = np.asarray(Image.open(SH + f).convert('RGB')).astype(np.int32); m = np.ones(a.shape[:2], bool)
    for hx0, hy0, hx1, hy1 in CAPTURE_HUD: m[hy0:hy1, hx0:hx1] = False
    res['game'][k] = {'file': f, **frame_stats(a, m)}
for k in GAME:
    a = np.asarray(Image.open(f'{OUT}/proto-{k}-1440x900@2.png').convert('RGB')).astype(np.int32)
    m = np.ones(a.shape[:2], bool); m[-60:, -700:] = False  # exclude the corner tag
    res['proto'][k] = frame_stats(a, m)
    # region luma from the exact region masks: 0 unknown solid, 85 known solid, 170 known air, 255 sky
    reg = np.asarray(Image.open(f'{OUT}/debug-regions-{k}-1440x900.png').convert('L'))
    l = luma(a); out = {}
    for name, v in [('unknown_solid', 0), ('known_solid', 85), ('known_air', 170), ('sky', 255)]:
        mm = (reg == v) & m
        if mm.sum() > 1000: out[name] = {'luma_mean': round(float(l[mm].mean()), 1), 'luma_sd': round(float(l[mm].std()), 1), 'share': round(float(mm.mean()), 3)}
    res['proto_regions'][k] = out
    if k != 'surface':
        s = 42.0 / TILE_DEV[k]
        air = rescale(((reg == 170) * 255).astype(np.uint8), s, Image.BILINEAR) > 127
        res['proto_boundary'][k] = round(axis_share(air), 3)
for k in GAME:
    p = f'{OUT}/proto-{k}-393x851@2.png'
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.int32); m = np.ones(a.shape[:2], bool); m[-50:, -420:] = False
    res['proto_phone'][k] = frame_stats(a, m)
rep = json.load(open(f'{OUT}/render-report.json'))
res['render'] = {k: {kk: v.get(kk) for kk in ['tile', 'zoom', 'framing', 'timing', 'perf', 'disagreement', 'counts', 'props']} for k, v in rep.items() if k.startswith('proto-')}
json.dump(res, open(f'{OUT}/metrics.json', 'w'), indent=1)
hdr = f"{'':9s}{'set':8s}{'L*':>6s}{'sd':>6s}{'p2':>6s}{'p98':>6s}{'rng':>6s}{'mode3':>7s}{'warm%':>7s}{'cyan%':>7s}{'edge':>7s}"
print(hdr)
for k in GAME:
    for st in ['concept', 'game', 'proto']:
        r = res[st][k]
        print(f"{k:9s}{st:8s}{r['L_mean']:6.1f}{r['L_sd']:6.1f}{r['L_p2']:6.1f}{r['L_p98']:6.1f}{r['L_range_p2_p98']:6.1f}{r['within3_of_mode']:7.3f}{r['warm_pct']:7.2f}{r['cyan_pct']:7.2f}{r['edge_density']:7.3f}")
print(json.dumps(res['proto_regions'], indent=0))
print('boundary axis-aligned share', res['proto_boundary'])
print('phone', json.dumps(res['proto_phone']))

# ---------------------------------------------------------------- terrain-audit gates (01-terrain.md C1, D1) + probes
def sobel_l(l):
    p = np.pad(l, 1, mode='edge')
    gx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:] - p[:-2, :-2] - 2 * p[1:-1, :-2] - p[2:, :-2]) / 8
    gy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:] - p[:-2, :-2] - 2 * p[:-2, 1:-1] - p[:-2, 2:]) / 8
    return np.hypot(gx, gy)
def mean_grad_and_flat(path, tile_dev):
    """gridlock.py mean_grad on a frame resampled to 42 px/tile, box (0,460,2780,1560)*scale; flat share = within 10 luma of the mode."""
    im = Image.open(path).convert('RGB'); sc = 42.0 / tile_dev
    im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS); a = np.asarray(im)
    x0, y0, x1, y1 = 0, round(460 * sc), round(2780 * sc), round(1560 * sc)
    l = luma(a[y0:y1, x0:x1]); lb = np.asarray(Image.fromarray(np.clip(l, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(float)
    hist, _ = np.histogram(l, bins=256, range=(0, 256)); mode = np.argmax(hist)
    return round(float(sobel_l(lb).mean()), 2), round(float((np.abs(l - mode) <= 10).mean()), 3)
gates = {}
for k, f in [('shaft', 'a04-dive-60m@2.png'), ('cavern', 'c-site-W01-SITE-4-wreck@2.png')]:
    gates[k] = {'game': mean_grad_and_flat(SH + f, 130.909), 'proto': mean_grad_and_flat(f'{OUT}/proto-{k}-1440x900@2.png', TILE_DEV[k])}
res['terrain_gates_mean_grad_flat'] = gates
# wall profile across the left shaft wall (world x = 20) at world rows 2.5 and 4.5, and the headlamp core in the cavern
rr = rep['proto-shaft-1440x900@2']; tile = rr['tile']; cx, cy = rr['camX'], rr['camY']
a = np.asarray(Image.open(f'{OUT}/proto-shaft-1440x900@2.png').convert('RGB')).astype(np.int32); l = luma(a)
prof = {}
for wy in (2.5, 4.5):
    Y = int((wy * tile - cy) * 2); X = (20 * tile - cx) * 2
    xs = [int(X + t * tile * 2) for t in np.linspace(-0.45, 0.25, 29)]
    row = [round(float(l[Y - 2:Y + 3, x].mean()), 0) for x in xs]
    prof[f'row{wy}'] = {'rock_-0.4tile': row[1], 'lip_peak': max(row[10:18]), 'undercut_min': min(row[17:24]), 'air_+0.2tile': row[-2], 'samples': row}
res['shaft_wall_profile'] = prof
def lab(rgb):
    c = np.asarray(rgb, float) / 255; lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]); xyz = lin @ M.T / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return 116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])
rc = rep['proto-cavern-1440x900@2']; tile = rc['tile']; cx, cy = rc['camX'], rc['camY']; rig = rc['rig']
a = np.asarray(Image.open(f'{OUT}/proto-cavern-1440x900@2.png').convert('RGB')).astype(np.int32)
core = {}
for d in (0.35, 0.8, 1.5):
    ang = np.radians(14); wx = rig['x'] + 0.40 + np.cos(ang) * d; wy = rig['y'] - 0.13 + np.sin(ang) * d
    X, Y = int((wx * tile - cx) * 2), int((wy * tile - cy) * 2); patch = a[Y - 6:Y + 7, X - 6:X + 7].reshape(-1, 3)
    L_, A_, B_ = lab(patch.mean(0)); core[f'{d}tile'] = {'L': round(float(L_), 1), 'b': round(float(B_), 1)}
res['cavern_headlamp_axis'] = core
json.dump(res, open(f'{OUT}/metrics.json', 'w'), indent=1)
print('gates', gates); print('profile', {k: {kk: vv for kk, vv in v.items() if kk != 'samples'} for k, v in prof.items()}); print('headlamp', core)
