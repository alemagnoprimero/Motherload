"""Lossless atlas packing; this only assembles authored Blender renders."""
import json
from pathlib import Path
import sys
from PIL import Image

source, target = (Path(value) for value in sys.argv[1:3])
manifest = json.loads((source / 'manifest.json').read_text())
if len(manifest['frames']) != 32:
    raise ValueError('A complete build requires 18 rig, four station and ten mineral frames')
ordered = sorted(manifest['frames'], key=lambda item: (-item['height'], item['name']))
width = 1536
x = y = row_height = 0
frames = {}
positions = []
for frame in ordered:
    if x + frame['width'] > width:
        x = 0
        y += row_height
        row_height = 0
    positions.append((frame, x, y))
    frames[frame['name']] = {
        'frame': {'x': x, 'y': y, 'w': frame['width'], 'h': frame['height']},
        'rotated': False,
        'trimmed': False,
        'spriteSourceSize': {'x': 0, 'y': 0, 'w': frame['width'], 'h': frame['height']},
        'sourceSize': {'w': frame['width'], 'h': frame['height']},
    }
    x += frame['width']
    row_height = max(row_height, frame['height'])
height = ((y + row_height + 63) // 64) * 64
atlas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
for frame, px, py in positions:
    rendered = Image.open(source / frame['file']).convert('RGBA')
    if frame['name'].startswith('building-'):
        bounds = rendered.getchannel('A').getbbox()
        if not bounds or bounds[0] < 1 or bounds[1] < 1 or bounds[2] >= rendered.width or bounds[3] >= rendered.height:
            raise ValueError(f"Building must fit inside its camera frame: {frame['name']}")
    atlas.paste(rendered, (px, py))
target.mkdir(parents=True, exist_ok=True)
atlas.save(target / 'frontier-atlas.png', optimize=True)
(target / 'frontier-atlas.json').write_text(json.dumps({
    'frames': frames,
    'meta': {
        'app': 'Motherload original 3D asset pipeline',
        'generator': 'scripts/build-assets.mjs',
        'source': 'assets/source/render_assets.py',
        'image': 'frontier-atlas.png',
        'format': 'RGBA8888',
        'size': {'w': width, 'h': height},
        'scale': '1',
        'blender': manifest['blender'],
        'samples': manifest['samples'],
    },
}, indent=2) + '\n')
print(f'Packed {len(frames)} original 3D renders into {width}×{height} atlas')
