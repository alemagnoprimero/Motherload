"""Render the scratchpad content-layout prototype (out/variant-dump.json)."""
import json, os
from PIL import ImageDraw
import importlib.util
BASE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("rm", os.path.join(BASE, "render_maps.py"))
# reuse drawing helpers without re-running the module body: copy minimal logic
from PIL import Image, ImageFont
FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
FONT_B = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 12)
C, ML, MT = 12, 64, 26
ORE = {1: (150, 150, 150), 2: (196, 120, 60), 3: (120, 230, 230), 4: (255, 205, 40)}
SP = {"survey-camp": (120, 200, 255), "salvage-pod": (255, 120, 80), "plate-arch": (200, 160, 255), "crystal-geode": (255, 230, 120), "collapsed-shaft": (140, 255, 160)}
data = json.load(open(os.path.join(BASE, "out", "variant-dump.json")))
for wd in data["worlds"]:
    w, h = wd["width"], wd["rows"]
    img = Image.new("RGB", (ML + w * C + 240, MT + h * C + 10), (20, 24, 30))
    d = ImageDraw.Draw(img)
    for k, t in enumerate(wd["tiles"]):
        c, r = k % w, k // w
        col = (8, 10, 14) if t == 0 else (52, 56, 62) if t == 2 else (150, 95, 60) if t == 4 else (98, 104, 110)
        d.rectangle([ML + c * C, MT + r * C, ML + c * C + C - 1, MT + r * C + C - 1], fill=col)
    for sp in wd["setPieces"]:
        for k in sp["cells"]:
            c, r = k % w, k // w
            d.rectangle([ML + c * C + 1, MT + r * C + 1, ML + c * C + C - 2, MT + r * C + C - 2], outline=SP[sp["kind"]], width=1)
    d.rectangle([ML + 20 * C, MT, ML + 21 * C - 1, MT + h * C - 1], outline=(240, 164, 60), width=2)
    for p in wd["packages"]:
        x, y = ML + p["x"] * C, MT + p["y"] * C
        if "relic" in p["tags"]:
            d.regular_polygon((x, y, C * 0.75), 5, fill=(255, 60, 200), outline=(255, 255, 255))
        else:
            n = int(p["itemId"][-1]); rr = C * (0.22 + 0.06 * n)
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=ORE[n])
    for m in wd["missions"]:
        x, y = ML + m["x"] * C, MT + m["y"] * C
        d.rectangle([x - C * .45, y - C * .45, x + C * .45, y + C * .45], outline=(255, 70, 70), width=2)
    for s in wd["shelves"]:
        x0, y0 = ML + (s["x"] - .5) * C, MT + (s["y"] - .5) * C
        d.rectangle([x0, y0, x0 + C - 1, y0 + C - 1], outline=(255, 150, 0), width=3)
    for r, label in [(0, "A Regolith"), (11, "B Broken plates"), (30, "C Iron shelf"), (48, "D Core rubble")]:
        y = MT + r * C
        d.line([ML - 6, y, ML + w * C, y], fill=(230, 200, 120), width=1)
        d.text((ML + w * C + 14, y + 2), label, fill=(230, 200, 120), font=FONT_B)
    for r in range(0, h + 1, 10):
        d.text((4, MT + r * C - 6), f"{r*10} m", fill=(200, 200, 200), font=FONT)
    d.text((ML, 6), f"PROTOTYPE W01 content layout, seed {wd['seed']} (scratchpad only)", fill=(240, 240, 240), font=FONT_B)
    ly = MT + 60 * C - 150
    for i, (k, col) in enumerate(list(SP.items()) + [("fused plate (row 30-31)", (150, 95, 60)), ("one-column route", (240, 164, 60)), ("shelf (per seed)", (255, 150, 0))]):
        d.rectangle([ML + w * C + 14, ly + i * 18, ML + w * C + 26, ly + i * 18 + 12], outline=col, width=2)
        d.text((ML + w * C + 32, ly + i * 18), k, fill=(225, 225, 225), font=FONT)
    img.save(os.path.join(BASE, "maps", f"proto-W01-seed{wd['seed']}.png"))
print("ok")
