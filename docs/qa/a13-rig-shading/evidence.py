"""A13 capture evidence from two folders written by capture.mjs (before =
item 2's tip 2a6185a, after = this item), all HUD-free at backing 2, Chrome
156, frozen scene clock:

    <out>/a04-before-after.png         a04 at 1440x900 @2: before, after, and
                                       the rig 2.2 tiles square, 3x nearest
    <out>/a04p-phone-before-after.png  the 60 m phone twin at 393x851 @3
    <out>/a02-before-after.png         the a02 spawn @2
    <out>/a02p-phone-before-after.png  the spawn on the phone (393x851 @3,
                                       p-portrait-02-spawn@3: a02's checkpoint)
    <out>/headlamp-emissive.png        a04 and a04p, before and after, 2.6
                                       tiles round the lens: ?debug=no-emissive,
                                       with the emissive, and |difference| x4
                                       (the silhouette outlined, unknown rock
                                       tinted where nothing changed)
    <out>/density-proof.png            the rig in the five probe forms (CI
                                       desktop and phone, 1728x1117 @2,
                                       ?tile=82, phone ?tile=56) with and
                                       without the emissive, labelled with the
                                       page rig-cabin and its sibling came from
    <out>/captures.json                every measure

Measures:
- before -> after: changed pixels per frame, inside the rig box and outside
  it (T1-lite's core follows the lens, so it moves outside the box);
- the emissive (each probe, and the a04/a04p art captures): pixels the
  sibling lifts (with - ?debug=no-emissive), inside the rig's silhouette
  (the union of the drawn rig frames' sources at the rig box, capture.mjs)
  and outside it (also with the silhouette grown 1 and 2 px, for the
  device-pixel snap and, on the phone, the browser's 1.5x upscale of the
  backing-2 canvas to DPR 3), never darker (before A13, pixels that change
  both ways are the same-depth layer swap, not light); on unknown rock (cells not discovered, from the
  exported state) outside the silhouette: pixels and max |dL*| (audit §9.2:
  no lift > 2 L* on unknown rock), and the unknown-rock pixels within 1.5
  tiles of the lens, to show unknown rock lies beside the lamp; the lens
  core's L* (mean of the device pixels within 1.5 units of the lens centre
  (100.2, 44.5), and their max) with and without the sibling;
  each probe reads its own exported checkpoint for the known cells;
- the page each rig layer and the sibling came from, the atlas density and
  guard, draw calls and resident bytes per probe.

Usage: python3 docs/qa/a13-rig-shading/evidence.py BEFORE AFTER OUT
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import art_metrics as m  # noqa: E402

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
PAPER, INK = (238, 238, 234), (24, 24, 24)
LENS = (100.2, 44.5)          # HEADLAMP_LENS, assets/campaign/source/w01-rig.mjs
ART = ['a04-dive-60m@2', 'a04p-dive-60m-phone@3', 'a02-spawn-1440x900@2', 'p-portrait-02-spawn@3']
FILES = {'a04-dive-60m@2': ('a04-before-after.png', 0.375),
         'a04p-dive-60m-phone@3': ('a04p-phone-before-after.png', 0.36),
         'a02-spawn-1440x900@2': ('a02-before-after.png', 0.375),
         'p-portrait-02-spawn@3': ('a02p-phone-before-after.png', 0.36)}
PROBES = ['desktop', 'phone', 'desktop-1728', 'desktop-tile82', 'phone-tile56']
PROBE_LABEL = {'desktop': '1440x900 @2', 'phone': '393x851 @3', 'desktop-1728': '1728x1117 @2',
               'desktop-tile82': '1440x900 @2, ?tile=82', 'phone-tile56': '393x851 @3, ?tile=56'}
# The art capture each CI probe repeats (same fixture, form and backing).
PROBE_TWIN = {'desktop': 'a04-dive-60m@2', 'phone': 'a04p-dive-60m-phone@3'}


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def sheet(rows, title=None):
    """rows: list of (label, [images]) laid out left to right, top to bottom."""
    pad, head = 12, 24
    top = 30 if title else 0
    W = max(sum(im.width for im in ims) + pad * (len(ims) + 1) for _, ims in rows)
    measure = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    W = max([W] + [round(measure.textlength(label, font=font(14))) + 2 * pad for label, _ in rows])
    if title:
        W = max(W, round(measure.textlength(title, font=font(17))) + 2 * pad)
    H = top + sum(max(im.height for im in ims) + head + pad for _, ims in rows) + pad
    out = Image.new('RGB', (W, H), PAPER)
    draw = ImageDraw.Draw(out)
    if title:
        draw.text((pad, 8), title, fill=INK, font=font(17))
    y = top + pad
    for label, ims in rows:
        draw.text((pad, y), label, fill=INK, font=font(14))
        x = pad
        for im in ims:
            out.paste(im.convert('RGB'), (x, y + head))
            x += im.width + pad
        y += max(im.height for im in ims) + head + pad
    return out


def rgb(path):
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.int16)


def small(im, scale):
    return im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.LANCZOS)


def crop(arr, cx, cy, w, h, zoom):
    x0, y0 = round(cx - w / 2), round(cy - h / 2)
    part = Image.fromarray(arr[max(0, y0):y0 + round(h), max(0, x0):x0 + round(w)].astype(np.uint8))
    return part.resize((part.width * zoom, part.height * zoom), Image.Resampling.NEAREST)


def box_mask(shape, box, grow=0):
    mask = np.zeros(shape, bool)
    mask[max(0, box['y'] - grow):box['y'] + box['height'] + grow,
         max(0, box['x'] - grow):box['x'] + box['width'] + grow] = True
    return mask


def changes(a, b, inside):
    d = np.abs(a - b).max(axis=2)
    return {'changed': int((d > 0).sum()), 'over 8 levels': int((d > 8).sum()), 'max': int(d.max()),
            'inside rig box': int((d[inside] > 0).sum()), 'outside rig box': int((d[~inside] > 0).sum()),
            'outside rig box over 8 levels': int((d[~inside] > 8).sum()),
            'max outside rig box': int(d[~inside].max()) if (~inside).any() else 0}


def silhouette(folder, name, shape, box):
    """The rig's silhouette in the frame: alpha > 0 of <name>-rig.png at the box."""
    alpha = np.asarray(Image.open(os.path.join(folder, f'{name}-rig.png')).convert('RGBA'))[..., 3] > 0
    mask = np.zeros(shape, bool)
    h, w = alpha.shape
    y0, x0 = box['y'], box['x']
    ys, xs = slice(max(0, y0), min(shape[0], y0 + h)), slice(max(0, x0), min(shape[1], x0 + w))
    mask[ys, xs] = alpha[ys.start - y0:ys.stop - y0, xs.start - x0:xs.stop - x0]
    return mask


def grow(mask, r=1):
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


def lens_px(data):
    exact = data['rigBox']['exact']
    lx = (128 - LENS[0]) if data['flip'] else LENS[0]
    return exact['x'] + lx / 128 * exact['size'], exact['y'] + LENS[1] / 128 * exact['size'], exact['size'] / 128


def lens_core(arr, data):
    cx, cy, unit = lens_px(data)
    H, W = arr.shape[:2]
    Y, X = np.mgrid[0:H, 0:W]
    disc = np.hypot(X + 0.5 - cx, Y + 0.5 - cy) <= 1.5 * unit
    L = m.lab(arr[disc].reshape(-1, 3))[0]
    return {'mean': round(float(L.mean()), 1), 'max': round(float(L.max()), 1), 'px': int(disc.sum())}


def emissive_measures(with_arr, no_arr, data, state, sil):
    """What the sibling adds: inside and outside the silhouette, on unknown rock."""
    d = with_arr - no_arr
    lifted = (d > 0).any(axis=2)
    darker = (d < 0).any(axis=2)
    view, dpr = data['view'], data['devicePixelRatio']
    regions = m.cell_regions(state, view, dpr, lifted.shape)
    unknown = regions['unknown'] & ~grow(sil, 1)
    L_with, L_no = m.lab(with_arr.reshape(-1, 3))[0].reshape(lifted.shape), m.lab(no_arr.reshape(-1, 3))[0].reshape(lifted.shape)
    cx, cy, unit = lens_px(data)
    H, W = lifted.shape
    Y, X = np.mgrid[0:H, 0:W]
    near = np.hypot(X + 0.5 - cx, Y + 0.5 - cy) <= 1.5 * view['tile'] * dpr
    rig_box = box_mask(lifted.shape, data['rigBox'])
    ys, xs = np.nonzero(lifted & rig_box)
    exact = data['rigBox']['exact']
    return {
        'lifted px': int(lifted.sum()),
        'lifted px inside the rig box': int((lifted & rig_box).sum()),
        'lifted px outside the rig box': int((lifted & ~rig_box).sum()),
        'lifted px inside the silhouette': int((lifted & sil).sum()),
        'lifted px outside the silhouette': int((lifted & ~sil & rig_box).sum()),
        'lifted px outside the silhouette grown 1 px': int((lifted & ~grow(sil, 1) & rig_box).sum()),
        'lifted px outside the silhouette grown 2 px': int((lifted & ~grow(sil, 2) & rig_box).sum()),
        'max lift outside the silhouette (levels)': int(d[lifted & ~sil].max()) if (lifted & ~sil).any() else 0,
        'max |dL*| outside the silhouette': round(float(np.abs(L_with - L_no)[lifted & ~sil].max()), 2) if (lifted & ~sil).any() else 0.0,
        'darker px': int(darker.sum()),
        'max lift (levels)': int(d.max()),
        'lift bbox in rig units': [round((xs.min() - exact['x']) / exact['size'] * 128, 1),
                                   round((ys.min() - exact['y']) / exact['size'] * 128, 1),
                                   round((xs.max() + 1 - exact['x']) / exact['size'] * 128, 1),
                                   round((ys.max() + 1 - exact['y']) / exact['size'] * 128, 1)] if len(xs) else None,
        'unknown rock px in frame (outside the silhouette)': int(unknown.sum()),
        'unknown rock px within 1.5 tiles of the lens': int((unknown & near).sum()),
        'unknown rock px lifted': int((lifted & unknown).sum()),
        'unknown rock max |dL*|': round(float(np.abs(L_with - L_no)[unknown].max()), 2) if unknown.any() else None,
        'lens core L* with / without': [lens_core(with_arr, data), lens_core(no_arr, data)],
    }


def outline(mask):
    return mask & ~(np.roll(mask, 1, 0) & np.roll(mask, -1, 0) & np.roll(mask, 1, 1) & np.roll(mask, -1, 1))


def main():
    before_dir, after_dir, out = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    report = {'before': {}, 'after': {}, 'before -> after': {}, 'probes': {}}
    man = {tag: json.load(open(os.path.join(d, 'art', 'manifest.json')))['captures']
           for tag, d in (('before', before_dir), ('after', after_dir))}

    # Before -> after, full frame and the rig magnified.
    for name in ART:
        b, a = man['before'][name], man['after'][name]
        assert b['view'] == a['view'], f'{name}: the two runs framed the scene differently'
        ib, ia = rgb(b['hudFree']), rgb(a['hudFree'])
        inside = box_mask(ib.shape[:2], a['rigBox'])
        report['before -> after'][name] = changes(ib, ia, inside)
        file, scale = FILES[name]
        dpr, tile = a['deviceScaleFactor'], a['view']['tile']
        box = a['rigBox']
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        span = 2.2 * tile * dpr
        zoom = 3 if dpr == 2 else 2
        full = [small(Image.fromarray(ib.astype(np.uint8)), scale), small(Image.fromarray(ia.astype(np.uint8)), scale)]
        rig = [crop(ib, cx, cy, span, span, zoom), crop(ia, cx, cy, span, span, zoom)]
        stats = report['before -> after'][name]
        if dpr == 3:
            rows = [(f'{name}: before (2a6185a) | after (A13), {a["viewport"]["width"]}x{a["viewport"]["height"]} @{dpr}', full),
                    (f'the rig, 2.2 tiles square, {zoom}x nearest: before | after', rig)]
        else:
            rows = [('before (2a6185a, item 2)', full[:1]), ('after (A13)', full[1:]),
                    (f'the rig, 2.2 tiles square, {zoom}x nearest: before | after', rig)]
        sheet(rows, title=f'{name}: HUD-free, backing 2, frozen clock; {stats["changed"]:,} px changed, '
                          f'{stats["inside rig box"]:,} inside the rig box').save(os.path.join(out, file), optimize=True)

    # Probes: the emissive's lift, unknown rock, pages.
    probes = {}
    for tag, d in (('before', before_dir), ('after', after_dir)):
        folder = os.path.join(d, 'probes')
        for name in PROBES:
            data = json.load(open(os.path.join(folder, f'{name}.json')))
            no = json.load(open(os.path.join(folder, f'{name}-no-emissive.json')))
            assert data['view'] == no['view'], f'{tag} {name}: no-emissive framed differently'
            w, n = rgb(os.path.join(folder, f'{name}.png')), rgb(os.path.join(folder, f'{name}-no-emissive.png'))
            sil = silhouette(folder, name, w.shape[:2], data['rigBox'])
            state = json.load(open(os.path.join(folder, f'{name}-state.json')))
            probes[(tag, name)] = (data, no, w, n, sil, state)
    for (tag, name), (data, no, w, n, sil, state) in probes.items():
        rec = {
            'renderer': data['renderer'], 'density': data['atlasDensity'], 'guard': data['atlasGuard'],
            'pages': data['atlasPages'], 'draw calls': data['drawCalls'], 'draw calls no-emissive': no['drawCalls'],
            'emissive sprites': data['emissiveSprites'], 'resident bytes': data['residentTextureBytes'],
            'resident MiB': round(data['residentTextureBytes'] / 2 ** 20, 2),
            'tile': data['view']['tile'], 'rig px': data['rigBox']['width'],
            'rig layers': {f['frame']: f['texture'] for f in data['drawn']},
            'emissives': [{'frame': e['frame'], 'texture': e['texture'], 'base': e['base']['frame'],
                           'base texture': e['base']['texture'], 'depth': e['depth'], 'blend': e['blendMode'],
                           'base depth': e['base']['depth']} for e in (data['emissives'] or [])],
            'core hero pages': data['coreHeroPages'],
            'frame misses': data['frameMisses'],
            'silhouette px': int(sil.sum()),
        }
        rec.update(emissive_measures(w, n, data, state, sil))
        report['probes'].setdefault(name, {})[tag] = rec
    # The CI probes repeat the art captures: same pixels?
    for name, twin in PROBE_TWIN.items():
        for tag, d in (('before', before_dir), ('after', after_dir)):
            w = probes[(tag, name)][2]
            art = rgb(man[tag][twin]['hudFree'])
            report['probes'][name][tag]['px differing from the art capture ' + twin] = int((np.abs(w - art).max(axis=2) > 0).sum())
    # The art captures' own emissive comparison (a04, a04p).
    for tag, d in (('before', before_dir), ('after', after_dir)):
        nem = json.load(open(os.path.join(d, 'art-no-emissive', 'manifest.json')))['captures']
        for name in ART[:2]:
            a, n = man[tag][name], nem[name]
            assert a['view'] == n['view']
            w, no = rgb(a['hudFree']), rgb(n['hudFree'])
            probe = 'desktop' if name.startswith('a04-') else 'phone'
            data = probes[(tag, probe)][0]
            assert data['view'] == a['view'], f'{tag} {name}: the probe framed differently'
            sil = probes[(tag, probe)][4]
            report[tag][name] = emissive_measures(w, no, data, json.load(open(a['state'])), sil)

    # Headlamp sheet: no-emissive | emissive | difference x4, a04 and a04p,
    # 2.6 tiles round the lens; in the difference, unknown rock is tinted.
    rows = []
    for name in ART[:2]:
        probe = 'desktop' if name.startswith('a04-') else 'phone'
        for tag, d in (('before', before_dir), ('after', after_dir)):
            nem = json.load(open(os.path.join(d, 'art-no-emissive', 'manifest.json')))['captures']
            a = man[tag][name]
            w, no = rgb(a['hudFree']), rgb(nem[name]['hudFree'])
            data, sil = probes[(tag, probe)][0], probes[(tag, probe)][4]
            dpr, tile = a['deviceScaleFactor'], a['view']['tile']
            cx, cy, unit = lens_px(data)
            span = 2.6 * tile * dpr
            unknown = m.cell_regions(json.load(open(a['state'])), a['view'], dpr, w.shape[:2])['unknown'] & ~grow(sil, 1)
            delta = w - no
            diff = np.clip(np.abs(delta) * 4, 0, 255)
            quiet = (delta == 0).all(axis=2)
            diff[unknown & quiet] = (34, 40, 72)
            diff[outline(sil)] = (90, 140, 255)
            rec = report[tag][name]
            if tag == 'before' and not (rec['lifted px'] or rec['darker px']):
                what = 'nothing changes: no rig sibling, no lens at (100.2, 44.5) before A13'
            elif tag == 'before':
                what = (f'{rec["lifted px"]} px lighter and {rec["darker px"]} darker: the same-depth layer swap (two page histories), not light; '
                        'no lens at (100.2, 44.5) before A13')
            else:
                what = (f'{rec["lifted px"]} px lifted, never darker; {rec["lifted px outside the silhouette grown 2 px"]} more than 2 px outside '
                        f'the silhouette; unknown rock: {rec["unknown rock px lifted"]} px lifted; lens core L* '
                        f'{rec["lens core L* with / without"][0]["mean"]} (unlit {rec["lens core L* with / without"][1]["mean"]})')
            rows.append((f'{name} {tag}: {what}',
                         [crop(no, cx, cy, span, span, 2), crop(w, cx, cy, span, span, 2),
                          crop(diff, cx, cy, span, span, 2)]))
    sheet(rows, title='The headlamp underground (a04, 60 m), 2.6 tiles round the lens, 2x nearest: ?debug=no-emissive | '
                      'with the emissive | |difference| x4 (silhouette blue, unknown rock tinted)').save(
        os.path.join(out, 'headlamp-emissive.png'), optimize=True)

    # Density proof: the rig per probe form, before and after, with and
    # without the emissive.
    rows = []
    for name in PROBES:
        ims, parts = [], []
        for tag in ('before', 'after'):
            data, no, w, n, sil, _ = probes[(tag, name)]
            rec = report['probes'][name][tag]
            box = data['rigBox']
            cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
            span = box['width'] * 1.15
            ims += [crop(n, cx, cy, span, span, 2), crop(w, cx, cy, span, span, 2)]
            cabin = rec['rig layers'].get('rig-cabin', '?').replace('campaign-w01-', '')
            sib = next((e['texture'] for e in rec['emissives'] if e['frame'] == 'rig-cabin-emissive'), None)
            parts.append(f'{tag}: rig-cabin{" + rig-cabin-emissive" if sib else ""} from {cabin}, '
                         f'{rec["draw calls"]} draws ({rec["draw calls no-emissive"]} without)')
        rec = report['probes'][name]['after']
        rows.append((f'{PROBE_LABEL[name]}, density {rec["density"]}, {rec["rig px"]} px rig: ' + ' | '.join(parts), ims))
    sheet(rows, title='The rig at each page density, 2x nearest: before no-emissive | before | after no-emissive | after '
                      '(the glow is rig-cabin-emissive from the same page as rig-cabin)').save(
        os.path.join(out, 'density-proof.png'), optimize=True)

    with open(os.path.join(out, 'captures.json'), 'w') as handle:
        json.dump(report, handle, indent=2)
        handle.write('\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'probes'}, indent=1))
    for name, recs in report['probes'].items():
        for tag, rec in recs.items():
            print(name, tag, {k: rec[k] for k in ('density', 'guard', 'draw calls', 'draw calls no-emissive', 'resident MiB',
                                                   'lifted px', 'lifted px outside the silhouette grown 1 px',
                                                   'unknown rock px within 1.5 tiles of the lens', 'unknown rock px lifted',
                                                   'unknown rock max |dL*|')})


if __name__ == '__main__':
    main()
