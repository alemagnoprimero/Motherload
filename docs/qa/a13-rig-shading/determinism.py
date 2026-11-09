"""A13 evidence: compare the determinism.mjs crops of two trees (before =
item 2's tip 2a6185a, after = this item).

For each tree, renderer (WebGL, Canvas) and target (a04, r1), every
warm-up's crop is compared with A's, the same scene on a page that drew
nothing before it:
- inside the rig's silhouette shrunk 2 px (so the device-pixel snap of the
  silhouette never counts), the pixels that differ and the largest
  difference: a layer-order change shows here;
- outside the silhouette grown 2 px (background, light map), the same: the
  sky, stars and seams are not part of the question and differ by 1 or 2
  levels between page histories in both trees;
and N (?debug=no-emissive) against A: the pixels the emissive lifts, all
inside the silhouette grown 1 px, never darker.

Writes OUT/determinism.json and OUT/determinism.png (per tree, the target
and renderer with the most differing silhouette pixels: A, the warm-up that
differs most, and the difference x4).

Usage: python3 docs/qa/a13-rig-shading/determinism.py BEFORE AFTER OUT
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
PAPER, INK = (238, 238, 234), (24, 24, 24)
SEQS = ['B', 'D', 'E', 'F', 'G']


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default()


def load(folder, name):
    return np.asarray(Image.open(os.path.join(folder, name + '.png')).convert('RGB'), dtype=np.int16)


def morph(mask, r, grow):
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            shifted = np.roll(np.roll(mask, dy, 0), dx, 1)
            out = (out | shifted) if grow else (out & shifted)
    return out


def compare(folder):
    results = json.load(open(os.path.join(folder, 'results.json')))
    report = {}
    for target in ('a04', 'r1'):
        sil = np.asarray(Image.open(os.path.join(folder, f'{target}-rig.png')).convert('RGBA'))[..., 3] > 0
        inside, outside = morph(sil, 2, False), ~morph(sil, 2, True)
        near = morph(sil, 1, True)
        for renderer in ('webgl', 'canvas'):
            key = f'{renderer} {target}'
            A = load(folder, f'{renderer}-{target}-A')
            assert A.shape[:2] == sil.shape, f'{key}: crop {A.shape} vs silhouette {sil.shape}'
            rec = {'silhouette px (shrunk 2 px)': int(inside.sum()),
                   'drawn': [f['frame'] for f in next(r for r in results if r['name'] == f'{renderer}-{target}-A')['drawn']]}
            for seq in SEQS:
                d = np.abs(load(folder, f'{renderer}-{target}-{seq}') - A).max(axis=2)
                rec[seq] = {'inside px': int((d[inside] > 0).sum()), 'inside max': int(d[inside].max()),
                            'outside px': int((d[outside] > 0).sum()), 'outside max': int(d[outside].max())}
            N = load(folder, f'{renderer}-{target}-N')
            lift = A - N
            lifted = (lift != 0).any(axis=2)
            rec['N (no-emissive)'] = {'px': int(lifted.sum()), 'outside the silhouette grown 1 px': int((lifted & ~near).sum()),
                                      'never brighter without the emissive': bool((lift >= 0).all()),
                                      'max lift': int(np.abs(lift).max())}
            rec['comparisons with silhouette pixels changed'] = sum(rec[s]['inside px'] > 0 for s in SEQS)
            report[key] = rec
    return report


def main():
    before, after, out = sys.argv[1:4]
    report = {'before (2a6185a)': compare(before), 'after (A13)': compare(after)}
    for tag, rep in report.items():
        changed = sum(r['comparisons with silhouette pixels changed'] for r in rep.values())
        total = len(SEQS) * len(rep)
        worst = max((r[s]['inside px'], r[s]['inside max']) for r in rep.values() for s in SEQS)
        rep['summary'] = {'comparisons': total, 'with silhouette pixels changed': changed,
                          'largest (px, levels)': list(worst),
                          'outside max levels': max(r[s]['outside max'] for k, r in rep.items() if k != 'summary' for s in SEQS)}
    with open(os.path.join(out, 'determinism.json'), 'w') as handle:
        json.dump(report, handle, indent=2)
        handle.write('\n')

    # The sheet: per tree, the worst pair.
    rows = []
    for tag, folder in (('before (2a6185a)', before), ('after (A13)', after)):
        rep = report[tag]
        key, seq = max(((k, s) for k in rep if k != 'summary' for s in SEQS),
                       key=lambda ks: (rep[ks[0]][ks[1]]['inside px'], ks))
        renderer, target = key.split()
        A, X = load(folder, f'{renderer}-{target}-A'), load(folder, f'{renderer}-{target}-{seq}')
        diff = np.clip(np.abs(X - A) * 4, 0, 255)
        ims = [Image.fromarray(a.astype(np.uint8)).resize((a.shape[1] * 2, a.shape[0] * 2), Image.Resampling.NEAREST)
               for a in (A, X, diff)]
        rows.append((f'{tag}, {renderer} {target}: after no warm-up (A) | after warm-up {seq} | difference x4: '
                     f'{rep[key][seq]["inside px"]} px inside the silhouette, max {rep[key][seq]["inside max"]}; '
                     f'{rep["summary"]["with silhouette pixels changed"]} of {rep["summary"]["comparisons"]} comparisons change it', ims))
    pad, head = 12, 24
    W = max(sum(im.width for im in ims) + pad * (len(ims) + 1) for _, ims in rows)
    H = 30 + sum(max(im.height for im in ims) + head + pad for _, ims in rows) + pad
    sheet = Image.new('RGB', (W, H), PAPER)
    draw = ImageDraw.Draw(sheet)
    draw.text((pad, 8), 'The rig after different warm-ups (desktop @2, 2x nearest): same-depth layers swap before A13; '
              'one depth per layer after', fill=INK, font=font(16))
    y = 30 + pad
    for label, ims in rows:
        draw.text((pad, y), label, fill=INK, font=font(13))
        x = pad
        for im in ims:
            sheet.paste(im, (x, y + head))
            x += im.width + pad
        y += max(im.height for im in ims) + head + pad
    sheet.save(os.path.join(out, 'determinism.png'), optimize=True)
    print(json.dumps({tag: rep['summary'] for tag, rep in report.items()}, indent=1))


if __name__ == '__main__':
    main()
