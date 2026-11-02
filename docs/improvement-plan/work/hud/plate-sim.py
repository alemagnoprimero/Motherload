"""Simulate a translucent HUD plate behind every text leaf and recompute WCAG contrast.

Composite: bg' = a * plate + (1 - a) * world (sRGB-space alpha blend, as browsers do).
Usage: python3 plate-sim.py <alpha> scene [scene ...]
"""
import json
import sys

import numpy as np
from PIL import Image

from contrast import ROOT, luminance, parse_rgb, ratio

PLATE = np.array([0x0A, 0x16, 0x1C], dtype=float)  # proposed --hud-plate base colour


def run(alpha, scene):
    probe = json.load(open(f"{ROOT}/data/probe-{scene}.json"))["probe"]
    dpr = probe["viewport"]["dpr"]
    off = np.asarray(Image.open(f"{ROOT}/shots/h-{scene}-off.png").convert("RGB")).astype(float)
    comp = alpha * PLATE + (1 - alpha) * off
    lum = luminance(comp)
    h, w = lum.shape
    crs = []
    for leaf in probe["leaves"]:
        b = leaf["box"]
        x0, y0 = max(0, int(b["x"] * dpr)), max(0, int(b["y"] * dpr))
        x1, y1 = min(w, int((b["x"] + b["w"]) * dpr) + 1), min(h, int((b["y"] + b["h"]) * dpr) + 1)
        if x1 <= x0 or y1 <= y0:
            continue
        p90 = float(np.percentile(lum[y0:y1, x0:x1], 90))
        crs.append(ratio(float(luminance(parse_rgb(leaf["color"]))), p90))
    return {
        "scene": scene,
        "alpha": alpha,
        "min_cr90": round(min(crs), 2),
        "median_cr90": round(float(np.median(crs)), 2),
        "below45": sum(c < 4.5 for c in crs),
        "below7": sum(c < 7 for c in crs),
        "n": len(crs),
    }


if __name__ == "__main__":
    alpha = float(sys.argv[1])
    rows = [run(alpha, s) for s in sys.argv[2:]]
    for r in rows:
        print(json.dumps(r))
    json.dump(rows, open(f"{ROOT}/data/plate-sim-{alpha}.json", "w"), indent=1)
