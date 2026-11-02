"""Report literal pixel parity; never hide antialiased edge outliers."""
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
import json
import sys

root = Path(sys.argv[1])
results = json.loads((root / "results.json").read_text())
results["pixels"] = {}


def pixels(image):
    return image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()


for world in ["W01", "W02"]:
    canvas = Image.open(root / f"canvas-{world}-world.png").convert("RGB")
    webgl = Image.open(root / f"webgl-{world}-world.png").convert("RGB")
    difference = ImageChops.difference(canvas, webgl)
    values = sorted(max(pixel) for pixel in pixels(difference))
    count = len(values)
    dark = sum(.2126 * r + .7152 * g + .0722 * b < 40 for r, g, b in pixels(canvas)) / count
    result = {
        "meanChannelDifference": sum(ImageStat.Stat(difference).mean) / 3,
        "p95MaximumChannelDifference": values[int(count * .95)],
        "maximumChannelDifference": values[-1],
        "sharePixelsWithin3Levels": sum(value <= 3 for value in values) / count,
        "canvasDarkShareBelow40": dark,
        "gates": {"literalParityWithin3": "pass" if values[-1] <= 3 else "unmet", "darkShareBelow45Percent": "pass" if dark <= .45 else "unmet"},
    }
    results["pixels"][world] = result
    print(world, result)

(root / "results.json").write_text(json.dumps(results, indent=2) + "\n")
