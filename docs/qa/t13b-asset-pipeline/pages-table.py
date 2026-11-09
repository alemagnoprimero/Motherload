"""Audit T13b: the README's "Pages" tables, from the committed zone pages.
Reads assets/campaign/generated/w0X-zones.json and the PNG and manifest files,
so a later item can refresh the tables after changing the art.

Prints: one row per page (key, zone, page set, density, size, decoded MiB,
PNG KiB, frames); the page count and PNG and manifest sizes; decoded MiB per
(world, zone, density), the surface with one lander stage and all four in
brackets.

Usage: python3 docs/qa/t13b-asset-pipeline/pages-table.py [REPO_ROOT]
"""
import json
import math
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
generated = root / 'assets/campaign/generated'
MIB = 2**20
ZONES = ['core', 'surface', 'shaft', 'cave']
manifests = {world: json.loads((generated / f'{world}-zones.json').read_text()) for world in ('w01', 'w02')}


def mib(size):
    """MiB to three places, halves rounded up (1.3125 -> 1.313), as the docs print them."""
    return f'{math.floor(size / MIB * 1000 + 0.5) / 1000:.3f}'


def page_set(page):
    if 'stage' in page:
        return f"lander stage {page['stage']}"
    return 'hero' if page['hero'] else 'rest'


def order(page):
    """Hero pages, then the rest, then the lander stages, as the zones list them."""
    return (ZONES.index(page['zone']), 0 if page['hero'] and 'stage' not in page else 2 if 'stage' not in page else 1,
            page.get('stage', 0), page['density'])


print('| page (key `campaign-<page>`) | zone | set | density | size | decoded MiB | PNG KiB | frames |')
print('|---|---|---|---|---|---|---|---|')
png_bytes = 0
for world, manifest in manifests.items():
    pages = sorted(manifest['pages'], key=order)
    for page in pages:
        size = (generated / page['image']).stat().st_size
        png_bytes += size
        stem = page['image'][:-4]
        print(f"| `{stem}` | {page['zone']} | {page_set(page)} | @{page['density']}x | {page['width']} × {page['height']} "
              f"| {mib(page['bytes'])} | {size / 1024:.1f} | {len(page['frames'])} |")
count = sum(len(manifest['pages']) for manifest in manifests.values())
sizes = {world: (generated / f'{world}-zones.json').stat().st_size / 1024 for world in manifests}
print()
print(f"{count} pages, {png_bytes / 1024:.1f} KiB of PNG. The two manifests are {sizes['w01']:.1f} KiB (W01) and {sizes['w02']:.1f} KiB (W02).")
print()
print('| world | zone | @2x | @3x | @4x (hero pages only) |')
print('|---|---|---|---|---|')
for world, manifest in manifests.items():
    for zone in ZONES:
        pages = [page for page in manifest['pages'] if page['zone'] == zone]
        if not pages:
            continue
        cells = []
        for density in (2, 3, 4):
            at = [page for page in pages if page['density'] == density]
            if not at:
                cells.append('—')
                continue
            stages = [page for page in at if 'stage' in page]
            rest = sum(page['bytes'] for page in at if 'stage' not in page)
            if stages:
                one = rest + max(page['bytes'] for page in stages if page['stage'] == 0)
                every = rest + sum(page['bytes'] for page in stages)
                cells.append(f'{mib(one)} ({mib(every)})')
            else:
                cells.append(mib(rest))
        print(f"| {world.upper()} | {zone} | " + ' | '.join(cells) + ' |')
