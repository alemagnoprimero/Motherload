"""A7's actual before/after fixtures beside the board, and audit §9.2 rows.

python scripts/art-captures-dressing.py RAW_CAPTURE_DIRECTORY

Raw browser screenshots stay outside the repository. The evidence folder contains
only review sheets and measurements that CI does not produce. The A7 pair
is the same immutable game build with explicit review poses off/on; normal
automatic placement is T5. Both phases use the settled-frame capture rule.
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import art_metrics as metrics  # noqa: E402

spec = importlib.util.spec_from_file_location("art_sheets", ROOT / "scripts/art-sheets.py")
sheets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sheets)


def font(size):
    return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", size)


def matched(capture):
    panel = metrics.panels()[capture["panel"]]
    box, scale = metrics.matched_window(capture["view"], panel)
    crop = metrics.crop_device(metrics.load_rgb(capture["hudFree"]), box,
                               capture["deviceScaleFactor"])
    im = Image.fromarray(crop.astype(np.uint8))
    # Preserve scale when a phone's viewport clips the requested window.
    # Padding is honest missing context, rather than stretching that crop.
    ratio = scale / capture["deviceScaleFactor"]
    im = im.resize((round(im.width * ratio), round(im.height * ratio)), Image.Resampling.LANCZOS)
    result = Image.new("RGB", tuple(panel["size"]), "#d4d7d9")
    result.paste(im, (0, 0))
    return result


def comparison(name, before, after, output):
    rgb, _, panel = metrics.panel_crop(after["panel"])
    images = [Image.fromarray(rgb.astype(np.uint8)), matched(before), matched(after)]
    width, height = panel["size"]
    gap, header = 18, 82
    canvas = Image.new("RGB", (width * 3 + gap * 4, height + header + 24), "#eef0f1")
    draw = ImageDraw.Draw(canvas)
    draw.text((gap, 9), name, fill="#14232b", font=font(18))
    draw.text((gap, 33), "Actual game fixture · HUD hidden · board tile scale 44.14 px · grey = clipped viewport",
              fill="#394b58", font=font(12))
    for index, (label, image) in enumerate(zip(
            ["Board crop", "Before: review poses off", "After: review poses on"], images)):
        x = gap + index * (width + gap)
        draw.text((x, 60), label, fill="#14232b", font=font(14))
        canvas.paste(image, (x, header))
    path = output / f"sheet-{name}.png"
    canvas.save(path, optimize=True)
    return path.name


def brief_measure(name, capture):
    full = sheets.measure(name, capture)
    frame, rock = full["frame"], full["regions"]["rock_near_light"]
    return {
        "edge_density": frame["edge_density"],
        "frame_L_mean": frame["L_mean"],
        "warm_pct": frame["warm_pct"],
        "rock_near_light_sd": None if rock is None else rock["sd"],
        "rock_near_light_pixels": None if rock is None else rock["n"],
        "scoring_window_css": full["window"],
    }


def rounded(value, digits=2):
    return "—" if value is None else f"{value:.{digits}f}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captures", type=Path)
    parser.add_argument("--out", type=Path, default=ROOT / "docs/qa/a7-cave-dressing/captures")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    before = json.loads((args.captures / "before/manifest.json").read_text())["captures"]
    after = json.loads((args.captures / "after/manifest.json").read_text())["captures"]
    staged = json.loads((args.captures / "review-poses.json").read_text())
    result = {
        "convention": staged["convention"],
        "settled_rule": "Two byte-identical screenshots one 50 ms scene step apart.",
        "metrics": "Existing art-sheets.py §9.2 scoring windows; board masks unchanged.",
        "captures": {},
        "staged_render": {},
    }
    lines = [
        "# A7 before/after game fixtures", "",
        staged["convention"], "",
        "Each screenshot passed two byte-identical captures one 50 ms scene step apart. "
        "All canonical frames keep the fixture's geometry, ore, rig and camera; paired before/after "
        "discovery is unchanged after normal settling. "
        "The 60/150/330 m frames are context checks: automatic placement arrives in T5.", "",
        "Sheets show HUD-free frames beside the board at the same tile scale. Measurements use "
        "the existing `art-sheets.py` scoring windows, which differ from the matched-scale display crop.", "",
        "| Fixture | Edge before → after (≥0.06) | L* before → after (board ±4) | Warm % before → after (cavern 2–5) | Rock sd before → after (≥15) | Changed HUD-free pixels |",
        "|---|---|---|---|---|---|",
    ]
    for name, capture in after.items():
        if name.startswith("a7-"):
            continue
        previous = before[name]
        assert capture["view"] == previous["view"], f"{name}: before/after camera differs"
        previous_state = json.loads(Path(previous["state"]).read_text())["state"]
        current_state = json.loads(Path(capture["state"]).read_text())["state"]
        for world_id, world in previous_state["worlds"].items():
            assert world["discovered"] == current_state["worlds"][world_id]["discovered"], \
                f"{name}: paired discovery differs in {world_id}"
        bm, am = brief_measure(name, previous), brief_measure(name, capture)
        concept = sheets.concept(capture["panel"])
        before_pixels = metrics.load_rgb(previous["hudFree"])
        after_pixels = metrics.load_rgb(capture["hudFree"])
        assert before_pixels.shape == after_pixels.shape
        changed = int(np.count_nonzero(np.any(before_pixels != after_pixels, axis=2)))
        sheet = comparison(name, previous, capture, args.out)
        gates = {
            "edge_density": am["edge_density"] >= 0.06,
            "frame_L_mean": abs(am["frame_L_mean"] - concept["L_mean"]) <= 4,
            "warm_pct": 2 <= am["warm_pct"] <= 5 if capture["panel"].startswith("cavern") else None,
            "rock_near_light_sd": None if am["rock_near_light_sd"] is None else am["rock_near_light_sd"] >= 15,
        }
        result["captures"][name] = {
            "before": bm, "after": am,
            "board": {"edge_density": concept["edge_density"], "frame_L_mean": concept["L_mean"],
                      "warm_pct": concept["warm_pct"]},
            "after_gates": gates, "changed_hudfree_pixels": changed, "sheet": sheet,
            "paired_discovery_equal": True,
            "viewport": capture["viewport"], "view": capture["view"],
            "backingScale": capture["backingScale"], "deviceScaleFactor": capture["deviceScaleFactor"],
            "sha256": {phase: hashlib.sha256(Path(source["hudFree"]).read_bytes()).hexdigest()
                       for phase, source in [("before", previous), ("after", capture)]},
        }
        lines.append(
            f"| [{name}]({sheet}) | {bm['edge_density']:.3f} → {am['edge_density']:.3f} | "
            f"{bm['frame_L_mean']:.1f} → {am['frame_L_mean']:.1f} ({concept['L_mean']:.1f}) | "
            f"{bm['warm_pct']:.2f} → {am['warm_pct']:.2f} | "
            f"{rounded(bm['rock_near_light_sd'])} → {rounded(am['rock_near_light_sd'])} | {changed} |")
        print(f"Measured {name}", flush=True)
    lines += ["", "## Staged-frame render measurements", "",
              "All poses pass the renderer's full-frame known-cell gate, including the 2 device px "
              "filter gutter; crystal footprints also exclude every known ore deposit's 3×3 neighbourhood. "
              "This validates these explicit poses; the separate scramble suite checks hidden-information invariance.", "",
              "Texture residency includes the field renderer's raw GL texture. Five parked frames "
              "are sampled after seven warm-up steps for canonical captures and five for fixed-camera details. "
              "Boot residency is measured separately by the verify harness.", "",
              "| Capture | Max draws / limit | Max uploads while parked | Resident MiB / active limit | Requested / drawn |",
              "|---|---|---|---|---|"]
    for name, record in staged["captures"].items():
        report = record["report"]
        if not name.startswith("after/"):
            continue
        gates = report["gates"]
        measured = {
            **gates, "residentTextureBytes": report["residentTextureBytes"],
            "requested": len(record["poses"]), "drawn": len(report["drawn"]),
            "highContrast": report["highContrast"], "poses": record["poses"],
            "warmSteps": report.get("warmSteps", 7),
            "parkedFrames": report["parkedFrames"],
        }
        result["staged_render"][name] = measured
        lines.append(f"| {name.removeprefix('after/')} | {gates['maxDraws']} / {gates['drawLimit']} | "
                     f"{gates['maxUploads']} | {report['residentTextureBytes'] / 1024 ** 2:.2f} / "
                     f"{gates['textureLimit'] / 1024 ** 2:.0f} | {len(record['poses'])} / {len(report['drawn'])} |")
    expected = {frame["name"] for frame in json.loads(
        (ROOT / "assets/campaign/generated/w01-dressing.json").read_text())["frames"]}
    coverage = {}
    for form in ["desktop", "phone"]:
        names = set()
        for name, record in staged["captures"].items():
            if not name.startswith("after/"):
                continue
            if name.removeprefix("after/") not in after:
                continue
            is_phone = "phone" in name or name.startswith("after/p-portrait")
            if is_phone != (form == "phone"):
                continue
            for key in ["drawn", "emissives"]:
                names.update(frame["frame"] for frame in record["report"][key])
        coverage[form] = {
            "expected": len(expected), "drawn": len(names & expected),
            "missing": sorted(expected - names), "frames": sorted(names & expected),
        }
    result["frame_coverage"] = coverage
    complete = all(not item["missing"] for item in coverage.values())
    result["frame_coverage_complete"] = complete
    lines += ["", "## Every generated frame in game", "",
              "All 52 frames were captured in both forms." if complete else
              "Pending: grouped detail captures are incomplete; only the actual completed coverage below is claimed.", "",
              "The normal grouped views contain three stalactites, two rubble frames, one boulder "
              "and a floor/wall crystal pair each. Three separate crystal pairs use actual high-contrast mode; "
              "the rust view includes all four drips and six particle frames. The existing additive pass "
              "draws each crystal's emissive sibling, including the zero-energy black HC sibling.", "",
              "Group and crystal details move only the rig to the existing floor at (14.65, 45.64); "
              "the phone detail camera uses `?tile=32` to include every staged prop. Their full source bounds "
              "must fit the viewport. Canonical fixtures retain their original camera, rig and native tile scale.", "",
              "Explicit A7 wall poses use the logical face and can leave a gap to T2's displaced boundary; "
              "T5 owns actual face contact.", "",
              f"Actual base + emissive frame coverage: desktop {coverage['desktop']['drawn']}/{len(expected)}, "
              f"phone {coverage['phone']['drawn']}/{len(expected)}. Missing names, if any, are in `captures.json`."]
    (args.out / "captures.json").write_text(json.dumps(result, indent=2) + "\n")
    (args.out / "README.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
