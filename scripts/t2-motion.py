"""T2 motion measure (scripts/t2-field.mjs "motion", audit §9.3).

Reads JSON on stdin. `before`, `target` and `frames` are PNG data URLs of the
field quad alone (FieldDebug.colour) through one fixed camera: `before` is
the frame before a dig, `target` the first frame after it with the scene
clock frozen (every change shown at once) and `frames` the frames after it
with the clock running, 1/60 s apart. `view` is the scene's view snapshot,
`dpr` the backing scale and `cell` the dug cell.

Prints, per frame, how much of the change is still to come (mean absolute
luma difference from `target` over that from `before`: 1 before, 0 when
there) for the dug cell (`dig`) and for the changed pixels farther than 1.2
tiles from it, which are revealed cells (`reveal`); and the largest luma
change from `before` to `target` among far pixels that are not within 1.25
tiles of a reveal either (`farMaxLuma`).
"""

import base64
import io
import json
import sys

import numpy as np
from PIL import Image


def luma(url):
    image = Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1])))
    rgb = np.asarray(image.convert("RGB")).astype(np.float64)
    return rgb @ np.array([0.2126, 0.7152, 0.0722])


def grow(mask, block, blocks):
    """Dilate `mask` by `blocks` blocks of `block` px each way."""
    height, width = mask.shape
    by, bx = -(-height // block), -(-width // block)
    padded = np.zeros((by * block, bx * block), dtype=bool)
    padded[:height, :width] = mask
    coarse = padded.reshape(by, block, bx, block).any(axis=(1, 3))
    grown = coarse.copy()
    for oy in range(-blocks, blocks + 1):
        for ox in range(-blocks, blocks + 1):
            shifted = np.zeros_like(coarse)
            y0, y1 = max(0, oy), by + min(0, oy)
            x0, x1 = max(0, ox), bx + min(0, ox)
            shifted[y0:y1, x0:x1] = coarse[y0 - oy : y1 - oy, x0 - ox : x1 - ox]
            grown |= shifted
    return np.repeat(np.repeat(grown, block, axis=0), block, axis=1)[:height, :width]


def main():
    data = json.load(sys.stdin)
    before, target = luma(data["before"]), luma(data["target"])
    frames = [luma(url) for url in data["frames"]]
    view, dpr = data["view"], data["dpr"]
    tile = view["tile"] * dpr
    height, width = before.shape
    ys, xs = np.mgrid[0:height, 0:width]
    # Device pixel to world tile, as the shader maps it.
    wx = (xs + 0.5 + view["scrollX"] * dpr) / tile
    wy = (ys + 0.5 + view["scrollY"] * dpr) / tile
    cx, cy = data["cell"]
    inside = (wx >= cx) & (wx < cx + 1) & (wy >= cy) & (wy < cy + 1)
    # Distance from the dug cell's edge, in tiles.
    dx = np.maximum(np.maximum(cx - wx, wx - (cx + 1)), 0)
    dy = np.maximum(np.maximum(cy - wy, wy - (cy + 1)), 0)
    far = np.hypot(dx, dy) > 1.2
    delta = np.abs(target - before)
    reveal = far & (delta > 12)

    def remaining(mask):
        total = delta[mask].mean() if mask.any() else 0
        if total <= 0:
            return []
        return [round(float(np.abs(f[mask] - target[mask]).mean() / total), 3) for f in frames]

    # A revealed cell reaches as far as a dug one: leave out 1.25 tiles
    # around every reveal pixel.
    still = far & ~grow(reveal, max(1, int(tile * 0.25)), 5)
    print(
        json.dumps(
            {
                "digPixels": int(inside.sum()),
                "digChange": round(float(delta[inside].mean()), 1),
                "revealPixels": int(reveal.sum()),
                "dig": remaining(inside),
                "reveal": remaining(reveal),
                "farMaxLuma": round(float(delta[still].max()), 2) if still.any() else 0.0,
                "farPixels": int(still.sum()),
            }
        )
    )


main()
