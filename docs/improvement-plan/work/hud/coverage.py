"""HUD coverage, text density and camera budget per form factor.

Reads data/probe-<scene>.json; prints and writes data/coverage.json.
Coverage = union of visible HUD component boxes / viewport area.
Also reports words and text elements on screen, and how many world rows
remain visible above/below the rig (tile size from layout.ts rules).
"""
import json
import math
import sys

import numpy as np

ROOT = "/home/user/Motherload/docs/improvement-plan/work/hud"
PARTS = ["energyVital", "hullVital", "rightCluster", "menuButton", "objective", "toolbar",
         "message", "danger", "extraction", "dockPrompt"]


def tile_size(w, h):
    if h <= 420 or w < 600:
        return 48
    return max(48, min(76, round(w / 22)))


def safe_area(w, h, coarse):
    if w < 760 or coarse:
        return (152, 64) if h <= 420 else (210, 100)
    return (56, 48)


def analyse(scene, coarse):
    p = json.load(open(f"{ROOT}/data/probe-{scene}.json"))["probe"]
    W, H = p["viewport"]["w"], p["viewport"]["h"]
    grid = np.zeros((H, W), dtype=bool)
    parts = {}
    for key in PARTS:
        v = p["named"].get(key)
        if not v or not v["visible"]:
            continue
        b = v["box"]
        x0, y0 = max(0, int(b["x"])), max(0, int(b["y"]))
        x1, y1 = min(W, int(math.ceil(b["x"] + b["w"]))), min(H, int(math.ceil(b["y"] + b["h"])))
        grid[y0:y1, x0:x1] = True
        parts[key] = round((x1 - x0) * (y1 - y0) / (W * H) * 100, 2)
    words = sum(len(l["text"].split()) for l in p["leaves"])
    tile = tile_size(W, H)
    top, bottom = safe_area(W, H, coarse)
    rig_y = float(p["game"].get("rigScreenY", 0) or 0)
    rig_x = float(p["game"].get("rigScreenX", 0) or 0)
    # Lowest HUD pixel row in the column band around the rig (±1.5 tiles).
    band = grid[:, max(0, int(rig_x - 1.5 * tile)) : min(W, int(rig_x + 1.5 * tile))]
    covered_rows = np.where(band.any(axis=1))[0]
    top_hud = int(covered_rows[covered_rows < rig_y].max()) if (covered_rows < rig_y).any() else 0
    bottom_hud = int(covered_rows[covered_rows > rig_y].min()) if (covered_rows > rig_y).any() else H
    return {
        "scene": scene,
        "viewport": f"{W}x{H}",
        "coverage_pct": round(grid.mean() * 100, 1),
        "parts_pct": parts,
        "text_elements": len(p["leaves"]),
        "words": words,
        "font_sizes": sorted({l["fontSize"] for l in p["leaves"]}),
        "share_12px_or_less": round(sum(l["fontSize"] <= 12 for l in p["leaves"]) / max(1, len(p["leaves"])) * 100),
        "tile": tile,
        "camera_safe_top_bottom": [top, bottom],
        "camera_reserved_pct": round((top + bottom) / H * 100, 1),
        "rig_y": round(rig_y),
        "rows_visible_below_rig": round((H - rig_y) / tile, 1),
        "rows_clear_below_rig_in_rig_column": round((bottom_hud - rig_y) / tile, 1),
        "rows_clear_above_rig_in_rig_column": round((rig_y - top_hud) / tile, 1),
    }


if __name__ == "__main__":
    scenes = sys.argv[1:] or [
        "desktop-first", "portrait-first", "landscape-first", "small-first",
        "portrait-dive", "landscape-dive", "small-dive",
    ]
    out = []
    for scene in scenes:
        coarse = not scene.startswith("desktop")
        r = analyse(scene, coarse)
        out.append(r)
        print(json.dumps(r))
    json.dump(out, open(f"{ROOT}/data/coverage.json", "w"), indent=1)
