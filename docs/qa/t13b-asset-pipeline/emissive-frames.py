"""Audit T13b: the beacon split, frame by frame, on the zone pages.

    python3 docs/qa/t13b-asset-pipeline/emissive-frames.py [REVISION]

Composites mission-beacon + mission-beacon-emissive the way the game's ADD
pass does where nothing darkens it (the sibling's premultiplied RGB added to
the base, clamped at 255) and compares the result with the single
mission-beacon frame of REVISION (default 3929c6e, the tree before the
split), at @2x, @3x and @4x. Prints max / mean channel difference and how
many pixels differ, overall and outside the lamp glass.
"""

import io
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

revision = sys.argv[1] if len(sys.argv) > 1 else "3929c6e"
root = Path(__file__).resolve().parents[3]
generated = "assets/campaign/generated"


def old(path):
    return subprocess.run(
        ["git", "-C", str(root), "show", f"{revision}:{path}"],
        check=True,
        capture_output=True,
    ).stdout


def frame(png_bytes, atlas, name):
    """The frame's full source rect as RGBA floats, transparent padding kept."""
    entry = atlas["frames"][name]
    page = np.asarray(Image.open(io.BytesIO(png_bytes)).convert("RGBA")).astype(float)
    out = np.zeros((entry["sourceSize"]["h"], entry["sourceSize"]["w"], 4))
    f, s = entry["frame"], entry["spriteSourceSize"]
    out[s["y"] : s["y"] + f["h"], s["x"] : s["x"] + f["w"]] = page[f["y"] : f["y"] + f["h"], f["x"] : f["x"] + f["w"]]
    return out


manifest = json.loads((root / generated / "w01-zones.json").read_text())
old_manifest = json.loads(old(f"{generated}/w01-zones.json"))
print("| density | page | differing px (of opaque) | max | mean over the frame | outside the lamp |")
print("|---|---|---|---|---|---|")
for density in (2, 3, 4):
    page = next(p for p in manifest["pages"] if p["density"] == density and "mission-beacon" in p["frames"])
    previous = next(p for p in old_manifest["pages"] if p["density"] == density and "mission-beacon" in p["frames"])
    png = (root / generated / page["image"]).read_bytes()
    atlas = json.loads((root / generated / page["data"]).read_text())
    base = frame(png, atlas, "mission-beacon")
    glow = frame(png, atlas, "mission-beacon-emissive")
    before = frame(old(f"{generated}/{previous['image']}"), json.loads(old(f"{generated}/{previous['data']}")), "mission-beacon")
    lit = base.copy()
    lit[..., :3] = np.minimum(255, base[..., :3] + glow[..., :3] * glow[..., 3:4] / 255)
    # Compare premultiplied colour, so fully transparent texels count as equal.
    a = lit[..., :3] * lit[..., 3:4] / 255
    b = before[..., :3] * before[..., 3:4] / 255
    delta = np.abs(np.concatenate([a - b, (lit[..., 3:4] - before[..., 3:4])], axis=2)).max(axis=2)
    # The lamp: the glass circle (48, 15) r 8 of the 96-unit frame, outline included.
    h, w = delta.shape
    yy, xx = np.mgrid[0:h, 0:w]
    unit = w / 96
    lamp = np.hypot((xx + 0.5) / unit - 48, (yy + 0.5) / unit - 15) <= 9.5 + 1 / unit
    opaque = int((before[..., 3] > 0).sum())
    print(
        f"| @{density}x | {page['key']} | {int((delta > 0.5).sum())} ({opaque}) | {delta.max():.0f} "
        f"| {delta.mean():.3f} | {int((delta[~lamp] > 0.5).sum())} px |"
    )
