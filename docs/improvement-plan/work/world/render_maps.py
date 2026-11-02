"""Render generated W01/W02 worlds as annotated maps, plus 200-seed cave heatmaps.

Input: out/worlds-dump.json (from dump.audit.ts). Output: maps/*.png
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(BASE, "out", "worlds-dump.json")))
os.makedirs(os.path.join(BASE, "maps"), exist_ok=True)

C = 12  # pixels per cell
MARGIN_L = 64
MARGIN_T = 26
try:
    FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
    FONT_B = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 12)
except OSError:
    FONT = FONT_B = ImageFont.load_default()

ORE = {1: (150, 150, 150), 2: (196, 120, 60), 3: (120, 230, 230), 4: (255, 205, 40)}
CORRIDOR = {"W01": (18, 23), "W02": (22, 27)}
SHAFT = {"W01": 20, "W02": 24}
HAZ_W02 = {"cold": [(10.5, 28.5), (37.5, 61.5)], "vent": [(8.5, 48.5), (39.5, 83.5)]}


def render(world, legend=True):
    w, h = world["width"], world["rows"]
    icy = world["id"] == "W02"
    W = MARGIN_L + w * C + (230 if legend else 10)
    H = MARGIN_T + h * C + 10
    img = Image.new("RGB", (W, H), (20, 24, 30))
    d = ImageDraw.Draw(img)
    base = (120, 150, 165) if icy else (98, 104, 110)
    rock = (52, 70, 84) if icy else (52, 56, 62)
    for k, t in enumerate(world["tiles"]):
        c, r = k % w, k // w
        x0, y0 = MARGIN_L + c * C, MARGIN_T + r * C
        col = (8, 10, 14) if t == 0 else rock if t == 2 else base
        d.rectangle([x0, y0, x0 + C - 1, y0 + C - 1], fill=col)
    # corridor outline and the strip a mission-following shaft actually sees
    c0, c1 = CORRIDOR[world["id"]]
    s = SHAFT[world["id"]]
    d.rectangle(
        [MARGIN_L + (s - 1) * C, MARGIN_T, MARGIN_L + (s + 2) * C - 1, MARGIN_T + h * C - 1],
        outline=(90, 220, 120),
        width=1,
    )
    d.rectangle(
        [MARGIN_L + c0 * C, MARGIN_T, MARGIN_L + (c1 + 1) * C - 1, MARGIN_T + h * C - 1],
        outline=(240, 164, 60),
        width=2,
    )
    for p in world["packages"]:
        x = MARGIN_L + (p["x"]) * C
        y = MARGIN_T + (p["y"]) * C
        if "relic" in p["tags"]:
            d.regular_polygon((x, y, C * 0.75), 5, fill=(255, 60, 200), outline=(255, 255, 255))
        else:
            n = int(p["itemId"][-1])
            rr = C * (0.22 + 0.06 * n)
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=ORE[n])
    for m in world["missions"]:
        x = MARGIN_L + m["x"] * C
        y = MARGIN_T + m["y"] * C
        d.rectangle([x - C * 0.45, y - C * 0.45, x + C * 0.45, y + C * 0.45], outline=(255, 70, 70), width=2)
    if world["id"] == "W01":
        bx, by = MARGIN_L + 20.5 * C, MARGIN_T + 9.5 * C
        d.ellipse([bx - C * 0.5, by - C * 0.5, bx + C * 0.5, by + C * 0.5], outline=(255, 70, 70), width=2)
        for sh in world["shelves"]:
            x0 = MARGIN_L + (sh["x"] - 0.5) * C
            y0 = MARGIN_T + (sh["y"] - 0.5) * C
            d.rectangle([x0, y0, x0 + C - 1, y0 + C - 1], outline=(255, 150, 0), width=3)
    else:
        for (x, y) in HAZ_W02["cold"]:
            cx, cy = MARGIN_L + x * C, MARGIN_T + y * C
            d.ellipse([cx - C * 1.65, cy - C * 1.65, cx + C * 1.65, cy + C * 1.65], outline=(150, 240, 255), width=2)
        for (x, y) in HAZ_W02["vent"]:
            cx, cy = MARGIN_L + x * C, MARGIN_T + y * C
            d.regular_polygon((cx, cy, C * 0.9), 3, outline=(255, 140, 40), fill=None)
    # depth ruler every 100 m
    for r in range(0, h + 1, 10):
        y = MARGIN_T + r * C
        d.line([MARGIN_L - 6, y, MARGIN_L + w * C, y], fill=(70, 80, 90), width=1)
        d.text((4, y - 6), f"{r * 10} m", fill=(200, 200, 200), font=FONT)
    d.text((MARGIN_L, 6), f"{world['id']} seed {world['seed']} ({w}x{h})", fill=(240, 240, 240), font=FONT_B)
    if legend:
        lx = MARGIN_L + w * C + 14
        items = [
            ("soil / ice", base, "rect"),
            ("hard rock", rock, "rect"),
            ("air (cave)", (8, 10, 14), "rect"),
            ("ore O1 common", ORE[1], "dot"),
            ("ore O2", ORE[2], "dot"),
            ("ore O3", ORE[3], "dot"),
            ("ore O4 rare", ORE[4], "dot"),
            ("relic", (255, 60, 200), "star"),
            ("mission object", (255, 70, 70), "box"),
            ("protected corridor", (240, 164, 60), "box"),
            ("cells a corridor shaft sees", (90, 220, 120), "box"),
        ]
        if world["id"] == "W01":
            items.append(("brittle shelf (fixed)", (255, 150, 0), "box"))
        else:
            items += [("cold pocket (fixed)", (150, 240, 255), "box"), ("ice vent (fixed)", (255, 140, 40), "box")]
        for i, (label, col, kind) in enumerate(items):
            y = MARGIN_T + i * 20
            if kind == "rect":
                d.rectangle([lx, y, lx + 12, y + 12], fill=col, outline=(160, 160, 160))
            elif kind == "dot":
                d.ellipse([lx + 1, y + 1, lx + 11, y + 11], fill=col)
            elif kind == "star":
                d.regular_polygon((lx + 6, y + 6, 7), 5, fill=col)
            else:
                d.rectangle([lx, y, lx + 12, y + 12], outline=col, width=2)
            d.text((lx + 20, y), label, fill=(225, 225, 225), font=FONT)
    return img


def heat(world_id, freq, w, h):
    W = MARGIN_L + w * C + 10
    H = MARGIN_T + h * C + 10
    img = Image.new("RGB", (W, H), (20, 24, 30))
    d = ImageDraw.Draw(img)
    for k, n in enumerate(freq):
        c, r = k % w, k // w
        v = n / 200
        col = (int(255 * min(1, v * 2.2)), int(200 * min(1, v * 1.4)), int(60 + 120 * v))
        if n == 0:
            col = (40, 44, 52)
        d.rectangle([MARGIN_L + c * C, MARGIN_T + r * C, MARGIN_L + c * C + C - 1, MARGIN_T + r * C + C - 1], fill=col)
    for r in range(0, h + 1, 10):
        y = MARGIN_T + r * C
        d.line([MARGIN_L - 6, y, MARGIN_L + w * C, y], fill=(90, 90, 90), width=1)
        d.text((4, y - 6), f"{r * 10} m", fill=(200, 200, 200), font=FONT)
    d.text(
        (MARGIN_L, 6),
        f"{world_id}: share of 200 seeds in which each cell is open air (bright = always; grey = never)",
        fill=(240, 240, 240),
        font=FONT_B,
    )
    return img


for world in data["worlds"]:
    render(world).save(os.path.join(BASE, "maps", f"map-{world['id']}-seed{world['seed']}.png"))
heat("W01", data["freq"]["W01"], 40, 60).save(os.path.join(BASE, "maps", "heat-air-W01-200seeds.png"))
heat("W02", data["freq"]["W02"], 48, 100).save(os.path.join(BASE, "maps", "heat-air-W02-200seeds.png"))
print("ok", os.listdir(os.path.join(BASE, "maps")))
