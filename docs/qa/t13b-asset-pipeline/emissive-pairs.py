"""Audit T13b: the beacon lamp's -emissive evidence, from emissive-runtime.mjs.

    python3 docs/qa/t13b-asset-pipeline/emissive-pairs.py BEFORE AFTER OUT

BEFORE is emissive-runtime.mjs's output on the tree before the ADD pass (the
beacon as one frame), AFTER its output on this tree (both the lit frame and
?debug=no-emissive). Writes OUT/emissive-table.md, OUT/emissive.json and one
sheet per renderer and form: before | bases alone | lit (ADD), and the masked
scene's bases alone | lit with the unknown cell outlined.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

before_dir, after_dir, out = (Path(arg) for arg in sys.argv[1:4])
out.mkdir(parents=True, exist_ok=True)
before = json.loads((before_dir / "results.json").read_text())["samples"]
after = json.loads((after_dir / "results.json").read_text())["samples"]


def pixels(path):
    return np.asarray(Image.open(path).convert("RGB")).astype(int)


def name(kind, renderer, form, contrast, state):
    return f"{kind}-{renderer}-{form}{'-hc' if contrast else ''}-{state}"


def sample(samples, renderer, form, contrast, emissive, kind):
    for s in samples:
        if (
            s["renderer"] == renderer
            and s["form"] == form
            and s["highContrast"] == contrast
            and s["emissive"] == emissive
            and s["kind"] == kind
        ):
            return s
    return None


rows, record = [], []
for renderer in ("webgl", "canvas"):
    for form in ("desktop", "phone"):
        for contrast in (False, True):
            lit = pixels(after_dir / (name("lit", renderer, form, contrast, "lit") + ".png"))
            base = pixels(after_dir / (name("lit", renderer, form, contrast, "base") + ".png"))
            added = np.abs(lit - base).max(axis=2)
            lamp = added > 0
            # The lamp and its antialiased rim: the base's glass changed from
            # the lit fill to off glass, so rim pixels the sibling's coverage
            # rounds to 0 still differ from before. 3 device px around it.
            near = (
                np.asarray(Image.fromarray((lamp * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7)))
                > 0
            )
            row = {
                "renderer": renderer,
                "form": form,
                "highContrast": contrast,
                "draws": {
                    "lit scene, bases alone": sample(after, renderer, form, contrast, False, "lit")["drawCalls"],
                    "lit scene, with ADD": sample(after, renderer, form, contrast, True, "lit")["drawCalls"],
                    "masked scene, bases alone": sample(after, renderer, form, contrast, False, "masked")["drawCalls"],
                    "masked scene, with ADD": sample(after, renderer, form, contrast, True, "masked")["drawCalls"],
                },
                "bytes": sample(after, renderer, form, contrast, True, "lit")["bytes"],
                "lampPixels": int(lamp.sum()),
                "lampAddedMax": int(added.max()),
                "lampAddedMean": round(float((lit - base)[lamp].mean()), 1) if lamp.any() else 0,
            }
            # The masked scene: the unknown cell above the beacon, with and
            # without the ADD pass, must be identical.
            cell_lit = pixels(after_dir / (name("masked", renderer, form, contrast, "lit") + "-cell.png"))
            cell_base = pixels(after_dir / (name("masked", renderer, form, contrast, "base") + "-cell.png"))
            row["unknownCellChanged"] = int((np.abs(cell_lit - cell_base).max(axis=2) > 0).sum())
            masked_lit = pixels(after_dir / (name("masked", renderer, form, contrast, "lit") + ".png"))
            masked_base = pixels(after_dir / (name("masked", renderer, form, contrast, "base") + ".png"))
            row["maskedLampPixels"] = int((np.abs(masked_lit - masked_base).max(axis=2) > 0).sum())
            old_sample = sample(before, renderer, form, contrast, True, "lit")
            if old_sample:
                old = pixels(before_dir / (name("lit", renderer, form, contrast, "lit") + ".png"))
                delta = np.abs(lit - old).max(axis=2)
                row["beforeDraws"] = old_sample["drawCalls"]
                row["beforeBytes"] = old_sample["bytes"]
                # Outside the lamp the frame is the old one; in the lamp, the
                # old fill against off glass + ADD above the darkness.
                row["outsideLampChanged"] = int((delta[~near] > 0).sum())
                row["rimChanged"] = int((delta[near & ~lamp] > 0).sum())
                row["lampVsBeforeMax"] = int(delta[lamp].max()) if lamp.any() else 0
                row["lampVsBeforeMean"] = round(float((lit - old)[lamp].mean()), 1) if lamp.any() else 0
                row["lampBaseVsBeforeMean"] = round(float((base - old)[lamp].mean()), 1) if lamp.any() else 0
            record.append(row)
            if contrast:
                continue
            # Sheet: before | bases alone | lit; then the masked pair.
            images = [
                Image.open(path)
                for path in (
                    before_dir / (name("lit", renderer, form, False, "lit") + ".png"),
                    after_dir / (name("lit", renderer, form, False, "base") + ".png"),
                    after_dir / (name("lit", renderer, form, False, "lit") + ".png"),
                    after_dir / (name("masked", renderer, form, False, "base") + ".png"),
                    after_dir / (name("masked", renderer, form, False, "lit") + ".png"),
                )
            ]
            w, h = images[0].size
            gap = 8
            sheet = Image.new("RGB", (w * 5 + gap * 5, h), (255, 255, 255))
            for index, image in enumerate(images):
                sheet.paste(image.convert("RGB"), (index * (w + gap) + (gap if index >= 3 else 0), 0))
            s = sample(after, renderer, form, False, True, "masked")
            scale = w / s["crop"]["clip"]["width"]
            cell, clip = s["crop"]["cell"], s["crop"]["clip"]
            draw = ImageDraw.Draw(sheet)
            for index in (3, 4):
                x0 = index * (w + gap) + gap + (cell["x"] - clip["x"]) * scale
                y0 = (cell["y"] - clip["y"]) * scale
                draw.rectangle(
                    [x0, y0, x0 + cell["width"] * scale, y0 + cell["height"] * scale],
                    outline=(230, 60, 60),
                    width=max(1, round(scale)),
                )
            sheet.save(out / f"beacon-{renderer}-{form}.png", optimize=True)

lines = [
    "| renderer | form | HC | draws: lit scene, bases alone → ADD | draws: masked scene, bases alone → ADD | before (one frame) | lamp px added (max / mean) | vs before: lamp mean / rim px / elsewhere px | unknown cell changed |",
    "|---|---|---|---|---|---|---|---|---|",
]
for row in record:
    d = row["draws"]
    show = lambda value: "—" if value is None else str(value)
    lines.append(
        f"| {row['renderer']} | {row['form']} | {'on' if row['highContrast'] else 'off'} "
        f"| {show(d['lit scene, bases alone'])} → {show(d['lit scene, with ADD'])} "
        f"| {show(d['masked scene, bases alone'])} → {show(d['masked scene, with ADD'])} "
        f"| {show(row.get('beforeDraws'))} "
        f"| {row['lampPixels']} ({row['lampAddedMax']} / {row['lampAddedMean']}) "
        f"| {show(row.get('lampVsBeforeMean'))} / {show(row.get('rimChanged'))} / {show(row.get('outsideLampChanged'))} "
        f"| {row['unknownCellChanged']} px |"
    )
(out / "emissive-table.md").write_text("\n".join(lines) + "\n")
(out / "emissive.json").write_text(json.dumps(record, indent=2) + "\n")
print("\n".join(lines))
