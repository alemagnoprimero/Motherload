import json, sys
from PIL import Image, ImageChops, ImageStat
gen = "/home/user/Motherload/assets/campaign/generated/"
out = sys.argv[1]
atlas = Image.open(gen + "w02-atlas.png").convert("RGBA")
meta = json.load(open(gen + "w02-atlas.json"))["frames"]
def over_grey(im):
    bg = Image.new("RGBA", im.size, (128, 128, 128, 255))
    return Image.alpha_composite(bg, im).convert("RGB")
res = {}
for name in ["ice-0", "frozen-rock-0", "ore-o3", "rig-hull-2", "dock-stage-3", "w02-sky", "w02-ridge-far", "w02-ridge-near"]:
    chrome = Image.open(f"{out}/{name}.png").convert("RGBA")
    if name in meta:
        f = meta[name]["frame"]
        ink = atlas.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
    else:
        ink = Image.open(gen + name + ".png").convert("RGBA")
    a, b = over_grey(ink), over_grey(chrome)
    diff = ImageChops.difference(a, b)
    stat = ImageStat.Stat(diff)
    px = list(diff.get_flattened_data()) if hasattr(diff, "get_flattened_data") else list(diff.getdata())
    big = sum(1 for p in px if max(p) > 24) / len(px)
    res[name] = {"mean_abs_diff_rgb_over_grey": [round(v, 2) for v in stat.mean], "share_px_diff_gt24": round(big, 4)}
json.dump(res, open(f"{out}/../w02-chromium-vs-inkscape.json", "w"), indent=1)
for k, v in res.items(): print(k, v)
