"""Checks scripts/art_metrics.py against docs/art-audit/prototype/metrics.py.

metrics.py runs its whole analysis on import, so this compiles only its
function definitions (ast) and compares each with the port on the six concept
crops, two synthetic frames and, if given, game captures. Every result must be
identical; mean_grad_flat must equal mean_grad_and_flat on every 2880x1800
frame, and there is always at least one.

Usage: python3 scripts/art-metrics-check.py [capture.png ...]
"""
import ast
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import art_metrics as port  # noqa: E402

METRICS = os.path.join(port.REPO, 'docs', 'art-audit', 'prototype', 'metrics.py')
SAME = ['lstar', 'luma', 'hsv', 'edge_density', 'frame_stats', 'gblur', 'axis_share', 'rescale', 'sobel_l', 'lab']

tree = ast.parse(open(METRICS).read(), METRICS)
defs = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in SAME + ['mean_grad_and_flat']]
missing = set(SAME + ['mean_grad_and_flat']) - {n.name for n in defs}
assert not missing, f'metrics.py no longer defines {sorted(missing)}'
ref = {'np': np, 'Image': Image, 'ImageFilter': ImageFilter}
exec(compile(ast.Module(body=defs, type_ignores=[]), METRICS, 'exec'), ref)


def same(a, b, what):
    if isinstance(a, tuple):
        assert isinstance(b, tuple) and len(a) == len(b), f'{what}: {a} != {b} (metrics.py)'
        for x, y in zip(a, b):
            same(x, y, what)
        return
    if isinstance(a, np.ndarray):
        assert a.shape == b.shape and np.array_equal(a, b), f'{what} differs from metrics.py'
    else:
        assert a == b, f'{what}: {a} != {b} (metrics.py)'


checked = gradients = 0
frames = []
for panel_id in port.panels():
    rgb, mask, _ = port.panel_crop(panel_id)
    frames.append((panel_id, rgb, mask))
rng = np.random.default_rng(3)
synthetic = rng.integers(0, 256, (360, 640, 3)).astype(np.int32)
synthetic[100:260, 200:440] = (40, 60, 70)
frames.append(('synthetic', synthetic, np.ones(synthetic.shape[:2], bool)))
# A 2880x1800 frame, so mean_grad_and_flat is compared on every run.
desktop = np.asarray(Image.fromarray(synthetic.astype(np.uint8)).resize((2880, 1800), Image.NEAREST)).astype(np.int32)
frames.append(('synthetic-2880x1800', desktop, np.ones(desktop.shape[:2], bool)))
for path in sys.argv[1:]:
    rgb = port.load_rgb(path)
    frames.append((os.path.basename(path), rgb, np.ones(rgb.shape[:2], bool)))

for name, rgb, mask in frames:
    for fn in ('lstar', 'luma'):
        same(getattr(port, fn)(rgb), ref[fn](rgb), f'{fn}({name})')
    same(port.hsv(rgb), ref['hsv'](rgb), f'hsv({name})')
    same(port.frame_stats(rgb, mask), ref['frame_stats'](rgb, mask), f'frame_stats({name})')
    l = port.luma(rgb)
    same(port.sobel_l(l), ref['sobel_l'](l), f'sobel_l({name})')
    same(port.gblur(l, 0.8), ref['gblur'](l, 0.8), f'gblur({name})')
    air = l < np.median(l)
    same(port.axis_share(air), ref['axis_share'](air), f'axis_share({name})')
    small = rgb.astype(np.uint8)
    same(port.rescale(small, 0.37), ref['rescale'](small, 0.37), f'rescale({name})')
    same(port.lab(rgb.reshape(-1, 3).mean(0)), ref['lab'](rgb.reshape(-1, 3).mean(0)), f'lab({name})')
    checked += 1
    if rgb.shape[:2] == (1800, 2880):
        tmp = os.path.join('/tmp', f'art-metrics-check-{os.getpid()}.png')
        Image.fromarray(rgb.astype(np.uint8)).save(tmp)
        try:
            same(port.mean_grad_flat(rgb, 130.909), ref['mean_grad_and_flat'](tmp, 130.909), f'mean_grad_flat({name})')
            gradients += 1
        finally:
            os.remove(tmp)

assert gradients, 'mean_grad_and_flat was not compared: no 2880x1800 frame'
print(f'art_metrics matches metrics.py on {checked} frames ({", ".join(SAME)}) and mean_grad_and_flat on {gradients}')
