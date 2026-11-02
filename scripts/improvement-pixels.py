"""Pixel measurements for the repeatable Phase 0 browser captures (Pillow).

The text-free capture retains panel backgrounds. Contrast is measured against
actual composited pixels across each text rectangle; no WebGL readback or remote
image fetch is used. Results are evidence, not a substitute for novice/device QA.
"""
import json
import sys
import warnings
from pathlib import Path
from PIL import Image

warnings.filterwarnings("ignore", category=DeprecationWarning, module=__name__)


def linear(channel):
    value = channel / 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def luminance(rgb):
    return sum(weight * linear(channel) for weight, channel in zip((0.2126, 0.7152, 0.0722), rgb))


def measure(entry):
    image = Image.open(entry['image']).convert('RGB')
    samples = list(image.resize((max(1, image.width // 4), max(1, image.height // 4))).getdata())
    dark = sum(0.2126*r + 0.7152*g + 0.0722*b < 40 for r, g, b in samples) / len(samples)
    result = {'darkShareBelow40': round(dark, 5), 'size': list(image.size)}
    if 'textBackground' not in entry:
        return result
    background = Image.open(entry['textBackground']).convert('RGB')
    sx = background.width / entry['viewport']['width']
    sy = background.height / entry['viewport']['height']
    contrasts = []
    for text in entry['texts']:
        box = text['box']
        x0, y0 = max(0, int(box['x']*sx)), max(0, int(box['y']*sy))
        x1, y1 = min(background.width, int((box['x']+box['width'])*sx)), min(background.height, int((box['y']+box['height'])*sy))
        if x1 <= x0 or y1 <= y0:
            continue
        pixels = background.crop((x0, y0, x1, y1)).getdata()
        color, alpha = text['rgb'], text['alpha']
        values = []
        for pixel in pixels:
            fg = luminance([color[i] * alpha + pixel[i] * (1-alpha) for i in range(3)])
            bg = luminance(pixel)
            values.append((max(fg, bg)+0.05)/(min(fg,bg)+0.05))
        contrasts.append({'text':text['text'], 'selector':text['selector'], 'ratio':round(min(values), 3), 'fontSize':text['fontSize']})
    result['minimumHudContrast'] = min((x['ratio'] for x in contrasts), default=None)
    result['hudTextCount'] = len(contrasts)
    result['lowContrast'] = [x for x in contrasts if x['ratio'] < 4.5]
    result['contrasts'] = contrasts
    return result

manifest = Path(sys.argv[1])
entries = json.loads(manifest.read_text())
results = {key: measure(value) for key, value in entries.items()}
if len(sys.argv) > 2:
    Path(sys.argv[2]).write_text(json.dumps(results, indent=2)+'\n')
else:
    print(json.dumps(results, indent=2))
