"""Lossless trimmed multi-page packing. Source rectangles preserve all rig anchors.
Frames with "source": "raster" (audit T13a) are packed like the others and keep
that mark in their atlas entry. PNGs are saved with fast compression: the build
re-encodes them with scripts/png-canonical.mjs (audit T13b).

  pack-campaign-atlas.py ROOT WORLD 2              full @2x atlas (the checks read it)
  pack-campaign-atlas.py ROOT WORLD SCALE runtime  legacy runtime pages (until the
                                                   game reads the zone pages)
  pack-campaign-atlas.py ROOT WORLD zones PLAN     zone pages (audit T13b): PLAN is
      a JSON file {"groups": [{stem, zone, hero, stage?, density, frames}], "result": path}
      written by the world build from scripts/campaign-zones.mjs. Each group is
      packed into pages of at most 2048 x 1024 at the width (a multiple of 64)
      that needs the fewest decoded bytes, the narrowest on a tie; the page list
      goes to "result" for the build to write the manifest."""
import json, math, sys
from pathlib import Path
from PIL import Image

PADDING = 2
root = Path(sys.argv[1]); world = sys.argv[2]
folder = 'source' if world == 'w01' else 'w02'
source = root / 'assets/campaign' / folder
out = root / 'assets/campaign/generated'
manifest = json.loads((source / 'frames.json').read_text())
records = {record['name']: record for record in manifest['frames']}
base_renders = root / ('.cache/campaign-renders' if world == 'w01' else '.cache/frontier-renders')


def renders_for(scale):
    """Render folder of a page scale: @2x renders at scale 1, @3x at 1.5, @4x at 2."""
    return base_renders if scale == 2 else Path(f'{base_renders}-{scale}x')


def load(names, scale):
    """(record, image, alpha bounding box) per frame; the box is the trim."""
    entries = []
    for name in names:
        image = Image.open(renders_for(scale) / (name + '.png')).convert('RGBA')
        entries.append((records[name], image, image.getbbox() or (0, 0, 1, 1)))
    return entries


def shelf_pack(entries, width, max_height):
    """Shelves of decreasing height, fixed order; a new page when one is full.
    Returns [(placed, height)] with heights rounded up to 64, or None when a
    frame does not fit the page at all."""
    pages = []; page = []; x = y = PADDING; shelf = 0
    for record, image, box in sorted(entries, key=lambda entry: (-(entry[2][3] - entry[2][1]), -(entry[2][2] - entry[2][0]), entry[0]['name'])):
        w, h = box[2] - box[0], box[3] - box[1]
        if w + 2 * PADDING > width or h + 2 * PADDING > max_height:
            return None
        if x + w + PADDING > width: x = PADDING; y += shelf + PADDING * 2; shelf = 0
        if y + h + PADDING > max_height:
            pages.append((page, math.ceil((y + shelf + PADDING) / 64) * 64)); page = []; x = y = PADDING; shelf = 0
        page.append((record, image, box, x, y)); x += w + PADDING * 2; shelf = max(shelf, h)
    pages.append((page, math.ceil((y + shelf + PADDING) / 64) * 64))
    return pages


def write_page(name, placed, width, height, scale, extra_meta=None, version='0.2'):
    atlas = Image.new('RGBA', (width, height)); frames = {}
    for record, image, box, x, y in placed:
        w, h = box[2] - box[0], box[3] - box[1]; atlas.paste(image.crop(box), (x, y)); sw, sh = image.size
        frames[record['name']] = {'frame': {'x': x, 'y': y, 'w': w, 'h': h}, 'rotated': False, 'trimmed': box != (0, 0, sw, sh), 'spriteSourceSize': {'x': box[0], 'y': box[1], 'w': w, 'h': h}, 'sourceSize': {'w': sw, 'h': sh}, 'pivot': record.get('pivot', {'x': .5, 'y': .5}), 'logicalSize': {'w': record['logicalWidth'], 'h': record['logicalHeight']}, **({'source': 'raster'} if record.get('source') == 'raster' else {})}
    atlas.save(out / (name + '.png'), compress_level=1)
    meta = {'app': 'Deep Frontier original layered SVG artwork', 'version': version, 'image': name + '.png', 'format': 'RGBA8888', 'size': {'w': width, 'h': height}, 'scale': str(scale), 'logicalTile': 48, 'rigPivot': [v * scale / 2 for v in manifest['rigPivot']], 'rigTreadBaseline': manifest['rigTreadBaseline'] * scale / 2, 'framePadding': PADDING, **(extra_meta or {})}
    (out / (name + '.json')).write_text(json.dumps({'frames': frames, 'meta': meta}, indent=2) + '\n')
    return {'image': name + '.png', 'data': name + '.json', 'frames': list(frames), 'width': width, 'height': height, 'bytes': width * height * 4}


if sys.argv[3] == 'zones':
    plan = json.loads(Path(sys.argv[4]).read_text()); result = []
    for group in plan['groups']:
        entries = load(group['frames'], group['density']); best = None
        for width in range(64, 2048 + 1, 64):
            pages = shelf_pack(entries, width, 1024)
            if pages is None: continue
            cost = (sum(width * height for _, height in pages), len(pages), width)
            if best is None or cost < best[0]: best = (cost, width, pages)
        if best is None: raise SystemExit(f"{group['stem']}: a frame is larger than a 2048 x 1024 page")
        _, width, pages = best
        for n, (placed, height) in enumerate(pages):
            tags = {'zone': group['zone'], 'hero': group['hero'], **({'stage': group['stage']} if 'stage' in group else {})}
            info = write_page(f"{group['stem']}-{n}", placed, width, height, group['density'], tags, '0.3')
            result.append({**info, **tags, 'stem': group['stem'], 'density': group['density']})
    Path(plan['result']).write_text(json.dumps(result, indent=2) + '\n')
    # The sky backdrop the game loads (512 x 256 from the @2x render).
    sky = Image.open(base_renders / (world + '-sky.png')).convert('RGBA')
    sky.resize((512, 256), Image.Resampling.LANCZOS).save(out / (world + '-sky-runtime.png'), compress_level=1)
    print(f'{world} zones: {len(result)} page(s), ' + ', '.join(f"@{d}x {sum(p['bytes'] for p in result if p['density'] == d) / 2**20:.2f} MiB" for d in (2, 3, 4)) + ' decoded')
    sys.exit(0)

scale = int(sys.argv[3]); runtime = len(sys.argv) > 4 and sys.argv[4] == 'runtime'
width = 2048 if world == 'w01' or scale == 3 else 1024
names = [record['name'] for record in manifest['frames'] if not (runtime and record['name'].split('-')[0] in ('soil', 'stone', 'ice', 'frozen', 'bedrock'))]
pages = shelf_pack(load(names, scale), width, 2048)
pageinfo = []
for n, (placed, height) in enumerate(pages):
    family = 'runtime' if runtime else 'atlas'
    name = f'{world}-{family}' if scale == 2 and n == 0 else f'{world}-{family}-{scale}x-{n}'
    pageinfo.append(write_page(name, placed, width, height, scale))
(out / f'{world}-pages-{"runtime-" if runtime else ""}{scale}x.json').write_text(json.dumps({'scale': scale, 'pages': pageinfo}, indent=2) + '\n')
print(f'{world} {"runtime" if runtime else "full"} @{scale}x: {len(pages)} trimmed page(s), {sum(p["bytes"] for p in pageinfo) / 2**20:.2f} MiB decoded')
