"""F4 measurements on game captures and concept panels.

Frame statistics are docs/art-audit/prototype/metrics.py's frame_stats (copied
verbatim: importing metrics.py runs its top-level script). The game side masks
metrics.py's CAPTURE_HUD on desktop captures, as metrics.py does; phone
captures (no CAPTURE_HUD) mask the DOM overlay rectangles the capture
recorded. The concept side uses the panel crops in
docs/art-direction/ at their interiors from d0-target-panels.json, minus their
hud_mask. The dark share is scripts/improvement-pixels.py's: the frame
downscaled by 4, share of luma below 40.

Region luma: every cell is classified from the exported campaign state at
capture time (unknown, known solid, known air, sky). Each cell contributes its
interior (20 % to 80 % in both axes) minus overlays, CAPTURE_HUD, the rig box
and ore cells. Lit known is split by material (soil, hard rock, other).
unknown_whole_cells samples whole unknown cells whose neighbours are all
unknown.

Usage: python3 docs/qa/f4-value-rekey/analyse.py <capture-dir> [<capture-dir> ...]  (prints JSON)
"""
import json
import os
import sys
import numpy as np
from PIL import Image

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
CAPTURE_HUD = [(0, 0, 1080, 450), (2130, 0, 2880, 160), (2810, 600, 2880, 1400), (0, 1640, 470, 1800), (2600, 1640, 2880, 1800), (1180, 1540, 1700, 1800)]


# ---- verbatim from docs/art-audit/prototype/metrics.py ----
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
# ---- end of verbatim copy ----


def dark_share(path):
    """scripts/improvement-pixels.py measure(): quarter-size frame, share of luma < 40."""
    image = Image.open(path).convert('RGB')
    small = np.asarray(image.resize((max(1, image.width // 4), max(1, image.height // 4)))).astype(float)
    return round(float((luma(small) < 40).mean()), 5)


def concept():
    meta = json.load(open(f"{REPO}/docs/art-direction/d0-target-panels.json"))
    out = {}
    for key, panel in meta["panels"].items():
        a = np.asarray(Image.open(f"{REPO}/docs/art-direction/{panel['file']}").convert('RGB')).astype(np.int32)
        x0, y0, x1, y1 = panel["interior"]
        m = np.zeros(a.shape[:2], bool); m[y0:y1, x0:x1] = True
        for hx0, hy0, hx1, hy1 in panel["hud_mask"]:
            m[hy0:hy1, hx0:hx1] = False
        out[key] = frame_stats(a, m)
    return out


def stat(values):
    if values.size < 200:
        return None
    return {'luma': round(float(values.mean()), 1), 'sd': round(float(values.std()), 1), 'n': int(values.size)}


def capture(png, meta_path):
    meta = json.load(open(meta_path))
    a = np.asarray(Image.open(png).convert('RGB')).astype(np.int32)
    H, W = a.shape[:2]
    dsf = meta['deviceScaleFactor']; v = meta['view']; world = meta['world']
    tile, sx, sy = v['tile'], v['scrollX'], v['scrollY']
    l = luma(a); L = lstar(a)
    # Cell coordinates of every device pixel.
    X = (np.arange(W) + 0.5) / dsf + sx; Y = (np.arange(H) + 0.5) / dsf + sy
    cx = np.floor(X / tile).astype(int); fx = X / tile - cx
    cy = np.floor(Y / tile).astype(int); fy = Y / tile - cy
    CX, CY = np.meshgrid(cx, cy); FX, FY = np.meshgrid(fx, fy)
    width, rows = world['width'], world['rows']
    tiles = np.array(world['tiles']); disc = np.array(world['discovered'])
    inside = (CY >= 0) & (CY < rows)
    idx = np.where(inside, np.clip(CY, 0, rows - 1) * width + np.mod(CX, width), 0)
    known = inside & (disc[idx] == 1); solid = inside & (tiles[idx] != 0)
    # Cells holding a deposit or an exposed item show an ore sprite.
    ore = np.zeros(width * rows, bool)
    for item in world.get('packages', []):
        if item['status'] in ('deposit', 'exposed'):
            yy = int(np.floor(item['y'])); xx = int(np.floor(item['x'])) % width
            if 0 <= yy < rows: ore[yy * width + xx] = True
    sprite = inside & ore[idx]
    interior = (FX >= 0.2) & (FX <= 0.8) & (FY >= 0.2) & (FY <= 0.8)
    keep = np.ones((H, W), bool)
    for x0, y0, x1, y1 in v['overlays']:
        keep[max(0, int(y0 * dsf) - 4):min(H, int(y1 * dsf) + 4), max(0, int(x0 * dsf) - 4):min(W, int(x1 * dsf) + 4)] = False
    if (W, H) == (2880, 1800):
        for hx0, hy0, hx1, hy1 in CAPTURE_HUD:
            keep[hy0:hy1, hx0:hx1] = False
    rx, ry = v['rigScreenX'] * dsf, v['rigScreenY'] * dsf; half = tile * dsf * 0.75
    keep[max(0, int(ry - half)):int(ry + half), max(0, int(rx - half)):int(rx + half)] = False
    ru, rv = (v['rigScreenX'] + sx) / tile, (v['rigScreenY'] + sy) / tile
    dist = np.hypot(CX + 0.5 - ru, CY + 0.5 - rv)
    sel = keep & interior
    unknown = sel & inside & ~known
    ksolid = sel & known & solid & ~sprite
    kair = sel & known & ~solid
    kind = np.where(inside, tiles[idx], 0)
    # Unknown cells whose eight neighbours are unknown too, sampled whole.
    unk_cell = np.zeros(width * rows, bool)
    for cyy in range(rows):
        for cxx in range(width):
            if disc[cyy * width + cxx] == 1: continue
            ok = True
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy = cyy + dy
                    if 0 <= yy < rows and disc[yy * width + (cxx + dx) % width] == 1: ok = False
            unk_cell[cyy * width + cxx] = ok
    unknown_whole = keep & inside & unk_cell[idx]
    res = {
        'name': meta['name'], 'backing': v['dpr'], 'tile': round(tile, 3), 'rig': [round(v['rigX'], 2), round(v['rigY'], 2)],
        'highContrast': v.get('highContrast'),
        'unknown': stat(l[unknown]), 'unknown_far': stat(l[unknown & (dist > 6)]), 'unknown_near': stat(l[unknown & (dist <= 6)]),
        'unknown_Lstar': round(float(L[unknown].mean()), 1) if unknown.any() else None,
        'unknown_Lstar_p2': round(float(np.percentile(L[unknown], 2)), 1) if unknown.any() else None,
        'unknown_whole_cells': stat(l[unknown_whole]),
        'lit_known': stat(l[ksolid & (dist <= 2.5)]), 'known_solid': stat(l[ksolid]),
        'lit_soil': stat(l[ksolid & (dist <= 2.5) & (kind == 1)]), 'lit_rock': stat(l[ksolid & (dist <= 2.5) & (kind == 2)]),
        'lit_other': stat(l[ksolid & (dist <= 2.5) & (kind >= 3)]),
        'known_air': stat(l[kair]), 'known_air_near': stat(l[kair & (dist <= 2.5)]), 'known_air_far': stat(l[kair & (dist > 2.5)]),
        'dark_share_below40': dark_share(png),
    }
    # Frame statistics as metrics.py masks them: CAPTURE_HUD only on desktop captures;
    # phones (no CAPTURE_HUD) mask the recorded overlay rectangles.
    m = np.ones((H, W), bool)
    if (W, H) == (2880, 1800):
        for hx0, hy0, hx1, hy1 in CAPTURE_HUD:
            m[hy0:hy1, hx0:hx1] = False
    else:
        for x0, y0, x1, y1 in v['overlays']:
            m[max(0, int(y0 * dsf) - 4):min(H, int(y1 * dsf) + 4), max(0, int(x0 * dsf) - 4):min(W, int(x1 * dsf) + 4)] = False
    res['frame'] = frame_stats(a, m)
    u = res['unknown']; lk = res['lit_known']; ka = res['known_air']
    res['lit_minus_unknown'] = round(lk['luma'] - u['luma'], 1) if u and lk else None
    for mat in ('soil', 'rock', 'other'):
        s_ = res[f'lit_{mat}']
        res[f'lit_{mat}_minus_unknown'] = round(s_['luma'] - u['luma'], 1) if u and s_ else None
    res['unknown_minus_air'] = round(u['luma'] - ka['luma'], 1) if u and ka else None
    return res


if __name__ == "__main__":
    out = {'concept': concept(), 'captures': {}}
    for d in sys.argv[1:]:
        for f in sorted(os.listdir(d)):
            if f.endswith('.png') and os.path.exists(os.path.join(d, f[:-4] + '.json')):
                out['captures'][f"{os.path.basename(os.path.normpath(d))}/{f[:-4]}"] = capture(os.path.join(d, f), os.path.join(d, f[:-4] + '.json'))
    print(json.dumps(out, indent=1))
