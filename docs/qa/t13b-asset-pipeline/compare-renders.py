"""Frame-by-frame comparison of the committed campaign PNGs with a git revision.

Audit T13b moved the SVG rasterizer from Chromium screenshots to resvg. This
compares what ships: every frame of the full @2x and @3x atlas pages of both
worlds, rebuilt at its source size from its trim rectangle, and every other
generated PNG whole (backgrounds, band pages, icons). Differences are measured
on premultiplied RGBA, so faint rim pixels with a large colour change do not
dominate:

- max: the largest channel difference, 0 to 255;
- mean: the mean absolute channel difference over all pixels and channels;
- iou128, iou_any: intersection over union of the alpha masks at alpha >= 128
  and alpha > 0 (1.0: the same silhouette);
- share_gt8, px_gt32: pixels whose largest channel difference exceeds 8 and 32.

Usage: python3 docs/qa/t13b-asset-pipeline/compare-renders.py [REVISION] [OUT]
       (default 1a0b5db, the last Chromium-built tree, and this folder)
Writes OUT/compare-renders.csv, OUT/compare-renders.json, OUT/compare-worst.png
(each set's item with the largest mean difference: before, after, and the
largest channel difference × 4, on grey) and prints the per-set summary as Markdown.
"""
import csv
import io
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

GENERATED = 'assets/campaign/generated'


def show(revision, path):
    if revision is None:
        return Path(path).read_bytes()
    return subprocess.run(['git', 'show', f'{revision}:{path}'], check=True, capture_output=True).stdout


def image(revision, path):
    return Image.open(io.BytesIO(show(revision, path))).convert('RGBA')


def frames(revision, world, scale):
    """{name: RGBA array at source size} from every full atlas page at this scale."""
    index = json.loads(show(revision, f'{GENERATED}/{world}-pages-{scale}x.json'))
    out = {}
    for page in index['pages']:
        atlas = json.loads(show(revision, f'{GENERATED}/{page["data"]}'))
        sheet = image(revision, f'{GENERATED}/{page["image"]}')
        for name, entry in atlas['frames'].items():
            f, s, src = entry['frame'], entry['spriteSourceSize'], entry['sourceSize']
            canvas = Image.new('RGBA', (src['w'], src['h']))
            canvas.paste(sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), (s['x'], s['y']))
            out[name] = (np.asarray(canvas).astype(np.int32), entry.get('source') == 'raster')
    return out


def premultiplied(x):
    y = x.copy()
    y[..., :3] = (x[..., :3] * x[..., 3:4] + 127) // 255
    return y


def measure(a, b):
    if a.shape != b.shape:
        return dict(shape=f'{a.shape[1]}x{a.shape[0]} vs {b.shape[1]}x{b.shape[0]}')
    d = np.abs(premultiplied(a) - premultiplied(b))
    worst = d.max(-1)
    return dict(
        w=a.shape[1], h=a.shape[0], max=int(d.max()), mean=round(float(d.mean()), 4),
        share_gt8=round(float((worst > 8).sum() / worst.size), 5), px_gt32=int((worst > 32).sum()),
        iou128=iou(a[..., 3] >= 128, b[..., 3] >= 128), iou_any=iou(a[..., 3] > 0, b[..., 3] > 0),
        identical=bool((a == b).all()))


def iou(ma, mb):
    """1.0 when neither mask has a pixel (a translucent frame has none at alpha >= 128)."""
    union = (ma | mb).sum()
    return round(float((ma & mb).sum() / union), 4) if union else 1.0


SHEET_CELL = 160


def sheet(worst, path):
    """One row per item: before, after, |difference| × 4, each fitted to SHEET_CELL px."""
    rows = []
    for _, _, _, a, b in worst:
        d = np.clip(np.abs(a - b).max(-1) * 4, 0, 255).astype(np.uint8)
        cells = [Image.fromarray(a.astype(np.uint8)), Image.fromarray(b.astype(np.uint8)), Image.fromarray(d).convert('RGBA')]
        k = SHEET_CELL / max(a.shape[:2])
        size = (max(1, round(a.shape[1] * k)), max(1, round(a.shape[0] * k)))
        row = Image.new('RGB', (3 * SHEET_CELL + 16, SHEET_CELL), (24, 24, 24))
        for i, cell in enumerate(cells):
            cell = cell.resize(size, Image.Resampling.NEAREST if k >= 1 else Image.Resampling.LANCZOS)
            grey = Image.new('RGBA', cell.size, (96, 96, 96, 255))
            grey.alpha_composite(cell)
            row.paste(grey.convert('RGB'), (i * (SHEET_CELL + 8), 0))
        rows.append(row)
    out = Image.new('RGB', (rows[0].width, len(rows) * (SHEET_CELL + 8) - 8), (0, 0, 0))
    for i, row in enumerate(rows):
        out.paste(row, (0, i * (SHEET_CELL + 8)))
    out.save(path, optimize=True)


def tracked_pngs(revision):
    if revision is None:
        names = subprocess.run(['git', 'ls-files', '-co', '--exclude-standard', GENERATED], check=True, capture_output=True, text=True).stdout
    else:
        names = subprocess.run(['git', 'ls-tree', '-r', '--name-only', revision, GENERATED], check=True, capture_output=True, text=True).stdout
    return {n for n in names.splitlines() if n.endswith('.png')}


def main():
    revision = sys.argv[1] if len(sys.argv) > 1 else '1a0b5db'
    out = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).parent)
    rows, worst = [], []

    def keep(row, a, b):
        """Each set's item with the largest mean difference, for the sheet."""
        rows.append(row)
        if row.get('mean', 0) > max((w[0] for w in worst if w[1] == row['set']), default=0):
            worst[:] = [w for w in worst if w[1] != row['set']] + [(row['mean'], row['set'], row['name'], a, b)]

    for world in ('w01', 'w02'):
        for scale in (2, 3):
            before, after = frames(revision, world, scale), frames(None, world, scale)
            for name in sorted(before.keys() & after.keys()):
                (a, raster), (b, _) = before[name], after[name]
                keep(dict(set=f'{world.upper()} @{scale}x frames' + (' (raster source)' if raster else ''), name=name, **measure(a, b)), a, b)
    atlas_pages = set()
    for revision_ in (revision, None):
        for world in ('w01', 'w02'):
            for scale in (2, 3):
                for kind in ('', 'runtime-'):
                    index = json.loads(show(revision_, f'{GENERATED}/{world}-pages-{kind}{scale}x.json'))
                    atlas_pages |= {f'{GENERATED}/{p["image"]}' for p in index['pages']}
    for path in sorted((tracked_pngs(revision) & tracked_pngs(None)) - atlas_pages):
        rel = path[len(GENERATED) + 1:]
        group = ('band pages @' + rel[-6:-4]) if rel.startswith('bands/') else 'W01 icons' if rel.startswith('icons/') else 'W02 icons' if rel.startswith('w02-icons/') else 'backgrounds'
        a = np.asarray(image(revision, path)).astype(np.int32)
        b = np.asarray(image(None, path)).astype(np.int32)
        keep(dict(set=group, name=rel[:-4], **measure(a, b)), a, b)
    keys = ['set', 'name', 'w', 'h', 'max', 'mean', 'share_gt8', 'px_gt32', 'iou128', 'iou_any', 'identical', 'shape']
    with open(out / 'compare-renders.csv', 'w', newline='') as fh:
        writer = csv.DictWriter(fh, fieldnames=keys, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)
    (out / 'compare-renders.json').write_text(json.dumps(dict(revision=revision, rows=rows), indent=1) + '\n')
    sheet(worst, out / 'compare-worst.png')
    print('Sheet rows, top to bottom: ' + ', '.join(f'`{w[2]}` ({w[1]}, mean {w[0]:.3f})' for w in worst))
    print()
    print('| Set | items | identical | size mismatches | max diff | mean of means | worst mean (item) | IoU≥128 min / mean | IoU>0 min |')
    print('|---|---|---|---|---|---|---|---|---|')
    for group in dict.fromkeys(r['set'] for r in rows):
        rs = [r for r in rows if r['set'] == group]
        ok = [r for r in rs if 'max' in r]
        top = max(ok, key=lambda r: r['mean'])
        low = min(ok, key=lambda r: r['iou128'])
        print(f"| {group} | {len(rs)} | {sum(r['identical'] for r in ok)} | {len(rs) - len(ok)} | {max(r['max'] for r in ok)} | "
              f"{np.mean([r['mean'] for r in ok]):.3f} | {top['mean']:.3f} (`{top['name']}`) | "
              f"{low['iou128']:.4f} (`{low['name']}`) / {np.mean([r['iou128'] for r in ok]):.4f} | {min(r['iou_any'] for r in ok):.4f} |")


if __name__ == '__main__':
    main()
