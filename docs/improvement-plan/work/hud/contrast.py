"""WCAG contrast of HUD text against the world behind it.

For each probe-<scene>.json there is a matching h-<scene>.png (HUD on) and
h-<scene>-off.png (same frozen frame, DOM HUD hidden). For every visible
text leaf we sample the HUD-off pixels inside its text box and compare the
text colour with the background luminance distribution.

Usage: python3 contrast.py scene [scene ...]   (scene e.g. desktop-first)
Writes data/contrast-<scene>.json and prints a summary table.
"""
import json
import re
import sys

import numpy as np
from PIL import Image

ROOT = "/home/user/Motherload/docs/improvement-plan/work/hud"


def lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def luminance(rgb):
    rgb = np.asarray(rgb, dtype=np.float64)
    r, g, b = lin(rgb[..., 0]), lin(rgb[..., 1]), lin(rgb[..., 2])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def parse_rgb(text):
    vals = [float(v) for v in re.findall(r"[\d.]+", text)[:3]]
    return np.array(vals)


def analyse(scene):
    probe = json.load(open(f"{ROOT}/data/probe-{scene}.json"))["probe"]
    dpr = probe["viewport"]["dpr"]
    off = np.asarray(Image.open(f"{ROOT}/shots/h-{scene}-off.png").convert("RGB"))
    h, w = off.shape[:2]
    lum = luminance(off)
    rows = []
    for leaf in probe["leaves"]:
        b = leaf["box"]
        x0, y0 = max(0, int(b["x"] * dpr)), max(0, int(b["y"] * dpr))
        x1, y1 = min(w, int((b["x"] + b["w"]) * dpr) + 1), min(h, int((b["y"] + b["h"]) * dpr) + 1)
        if x1 <= x0 or y1 <= y0:
            continue
        region = lum[y0:y1, x0:x1].ravel()
        text_l = float(luminance(parse_rgb(leaf["color"])))
        p50, p90, pmax = (float(np.percentile(region, q)) for q in (50, 90, 100))
        rows.append(
            {
                "text": leaf["text"],
                "fontSize": leaf["fontSize"],
                "color": leaf["color"],
                "bgL50": round(p50, 4),
                "bgL90": round(p90, 4),
                "cr50": round(ratio(text_l, p50), 2),
                "cr90": round(ratio(text_l, p90), 2),
                "crMax": round(ratio(text_l, pmax), 2),
                "bgStd": round(float(region.std()), 4),
            }
        )
    summary = {
        "scene": scene,
        "leaves": len(rows),
        "median_cr50": round(float(np.median([r["cr50"] for r in rows])), 2) if rows else None,
        "min_cr90": min((r["cr90"] for r in rows), default=None),
        "below45_at_p90": sum(r["cr90"] < 4.5 for r in rows),
        "below3_at_p90": sum(r["cr90"] < 3.0 for r in rows),
        "below45_at_max": sum(r["crMax"] < 4.5 for r in rows),
    }
    json.dump({"summary": summary, "rows": rows}, open(f"{ROOT}/data/contrast-{scene}.json", "w"), indent=1)
    return summary, rows


if __name__ == "__main__":
    for scene in sys.argv[1:]:
        summary, rows = analyse(scene)
        print(json.dumps(summary))
        for r in sorted(rows, key=lambda r: r["cr90"])[:6]:
            print(f"   cr50={r['cr50']:5} cr90={r['cr90']:5} crMax={r['crMax']:5} fs={r['fontSize']} {r['text'][:40]!r}")
