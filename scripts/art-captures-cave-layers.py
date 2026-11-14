"""T4/T5 actual fixture evidence, using the established audit measurements.

python scripts/art-captures-cave-layers.py RAW --item T4 --out docs/qa/.../captures

The shared browser driver records before/after manifests and runtime-layers.json.
Only completed, settled pairs are measured. Raw screenshots stay outside the
repository; output contains review sheets and measured numbers, never raw copies.
Use --allow-partial to review finished pairs while a resumable run is incomplete;
the missing canonical fixtures remain explicit in captures.json and README.md.
"""

import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = (
    "a04-dive-60m@2", "a04p-dive-60m-phone@3",
    "a05-dive-150m@2", "a05p-dive-150m-phone@3",
    "b-330m-plate-band-C@2", "b-330mp-plate-band-C-phone@3",
    "c-site-W01-SITE-4-wreck@2", "p-portrait-cavern-site4@3",
)
LABELS = {
    "T4": ("Before: back walls off", "After: back walls on"),
    "T5": ("Before: dressing off", "After: dressing on"),
}
CONVENTIONS = {
    "T4": "The same build and checkpoint with back walls off/on; dressing stays off in both phases.",
    "T5": "The same build and checkpoint with dressing off/on; back walls stay on in both phases.",
}
T4_BRIGHTNESS_TARGETS = {
    "cave_air_luma": "28–42 luma (0–255)",
    "cave_air_sd": "≥4 luma standard deviation",
    "cooler_than_rock": "caveAirB < knownSolidB (mean Lab b*, blue–yellow axis)",
    "unknown_minus_cave_air": "≥10 luma",
    "solid_minus_cave_air": "≥18 luma; all known solid, per the existing audit measure",
}


def region_b_stats(rgb, state, view, dpr, rig, keep, original, metrics):
    """Read mean Lab b* through the existing region masks without copying their logic.

    region_stats applies its linear luma function before selecting pixels.
    Three equal channels make that scalar equal to b*, including negative
    values. No clipping, RGB encoding or image conversion is applied to this
    floating-point proxy. The region means retain stat()'s one-decimal rounding.
    """
    blue_yellow = metrics.lab(rgb)[2]
    proxy = np.broadcast_to(blue_yellow[..., None], rgb.shape)
    measured = metrics.region_stats(proxy, state, view, dpr, rig, keep)
    counts = {}
    for key in ("cave_air", "known_solid"):
        expected, actual = original[key], measured[key]
        require((expected is None) == (actual is None),
                f"Lab b* {key}: usable-region status differs from the original luma mask")
        if actual is not None:
            require(actual["n"] == expected["n"],
                    f"Lab b* {key}: pixel count differs from the original luma mask")
        counts[key] = None if actual is None else actual["n"]
    return {
        "caveAirB": None if measured["cave_air"] is None else measured["cave_air"]["luma"],
        "knownSolidB": None if measured["known_solid"] is None else measured["known_solid"]["luma"],
        "region_pixels": counts, "maskPixelCountsMatch": True,
    }


def capture_region_b(capture, original, metrics):
    rgb = metrics.load_rgb(capture["hudFree"])
    state = json.loads(Path(capture["state"]).read_text())
    dpr, view = capture["deviceScaleFactor"], capture["view"]
    # The same unrounded scoring window and keep construction as measure().
    window, _ = metrics.scoring_window(view, metrics.panels()[capture["panel"]])
    keep = np.zeros(rgb.shape[:2], bool)
    x0, y0, x1, y1 = (int(round(value * dpr)) for value in window)
    keep[y0:y1, x0:x1] = True
    return region_b_stats(rgb, state, view, dpr, capture["rig"], keep, original, metrics)


def t4_brightness(regions, colour):
    """Diagnose T4 using existing region_stats outputs; never redraw a mask."""
    air = regions["cave_air"]
    values = {
        "cave_air_luma": None if air is None else air["luma"],
        "cave_air_sd": None if air is None else air["sd"],
        "caveAirB": colour["caveAirB"], "knownSolidB": colour["knownSolidB"],
        "unknown_minus_cave_air": regions["unknown_minus_cave_air"],
        "solid_minus_cave_air": regions["solid_minus_cave_air"],
    }
    gates = {
        "cave_air_luma": None if air is None else 28 <= air["luma"] <= 42,
        "cave_air_sd": None if air is None else air["sd"] >= 4,
        "cooler_than_rock": (None if colour["caveAirB"] is None or colour["knownSolidB"] is None
                             else colour["caveAirB"] < colour["knownSolidB"]),
        "unknown_minus_cave_air": (None if values["unknown_minus_cave_air"] is None
                                   else values["unknown_minus_cave_air"] >= 10),
        "solid_minus_cave_air": (None if values["solid_minus_cave_air"] is None
                                 else values["solid_minus_cave_air"] >= 18),
    }
    unavailable = {
        key: "Required region unavailable: existing region_stats needs more than 500 sampled pixels per region."
        for key, passed in gates.items() if passed is None
    }
    return {
        "values": values, "gates": gates, "unavailable": unavailable,
        "colour_mask_check": colour,
        "region_pixels": {key: None if regions[key] is None else regions[key]["n"]
                          for key in ("cave_air", "unknown", "known_solid")},
    }


def brightness_cell(measured, key):
    passed = measured["gates"][key]
    if key == "cooler_than_rock":
        values = measured["values"]
        return ("unavailable" if passed is None else
                f"{values['caveAirB']:.1f} / {values['knownSolidB']:.1f} {'✓' if passed else '✗'}")
    value = measured["values"][key]
    return "unavailable" if value is None else f"{value:.1f} {'✓' if passed else '✗'}"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load_tools(repo):
    sys.path.insert(0, str(repo / "scripts"))
    import art_metrics
    spec = importlib.util.spec_from_file_location("art_sheets", repo / "scripts/art-sheets.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return art_metrics, module


def font(size):
    return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", size)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def data_sha256(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def load_manifest(folder):
    path = folder / "manifest.json"
    if not path.is_file():
        return {}
    captures = json.loads(path.read_text())["captures"]
    # A resumed raw directory may have moved. Prefer the recorded path, then
    # its phase-local basename; never substitute another phase's capture.
    for name, capture in captures.items():
        for key in ("file", "hudFree", "state", "fieldAir", "baselineState"):
            if not capture.get(key):
                continue
            source = Path(capture[key])
            if not source.is_absolute():
                source = folder / source
            if not source.is_file():
                nested = folder / "frames" / name / Path(capture[key]).name
                source = nested if nested.is_file() else folder / Path(capture[key]).name
            capture[key] = str(source.resolve())
    return captures


def expected_options(item, phase):
    return {"backWalls": item == "T5" or phase == "after",
            "dressing": item == "T5" and phase == "after"}


def verify_capture_hashes(label, capture, record):
    """Authenticate every raw input this builder reads, including moved runs."""
    hashes = record.get("fileSha256", {})
    original = record.get("capture", {})
    for key in ("file", "hudFree", "state", "fieldAir", "baselineState"):
        if key in ("fieldAir", "baselineState") and not capture.get(key):
            continue
        path = capture[key]
        expected = hashes.get(path) or hashes.get(original.get(key))
        require(isinstance(expected, str) and len(expected) == 64,
                f"{label}: missing recorded {key} hash")
        require(sha256(path) == expected, f"{label}: {key} bytes differ from the completed capture")


def validate_record(name, phase, item, capture, record):
    label = f"{phase}/{name}"
    require(record.get("completed") is True, f"{label}: capture is not recorded complete")
    settled = record.get("settled", {})
    require(settled.get("identical") is True and settled.get("stepMs") == 50,
            f"{label}: missing two-identical-50-ms-frames proof")
    require(isinstance(record.get("checkpointSha256"), str) and len(record["checkpointSha256"]) == 64,
            f"{label}: missing checkpoint hash")
    require(isinstance(record.get("postImportBaselineSha256"), str)
            and len(record["postImportBaselineSha256"]) == 64,
            f"{label}: missing settled post-import baseline hash")
    report = record["report"]
    snapshot = report["caveSnapshot"]
    require(snapshot["enabled"] == expected_options(item, phase),
            f"{label}: incorrect cave-layer switches")
    phone = capture["viewport"]["width"] < 600
    expected_viewport = {"width": 393, "height": 851} if phone else {"width": 1440, "height": 900}
    require(capture["viewport"] == expected_viewport,
            f"{label}: canonical viewport differs from the required form")
    require(capture["deviceScaleFactor"] == (3 if phone else 2)
            and capture["backingScale"] == 2, f"{label}: canonical density/backing differs")
    draw_limit, texture_limit = (10, 40 * 1024 ** 2) if phone else (12, 64 * 1024 ** 2)
    frames = report["parkedFrames"]
    require(len(frames) == 5, f"{label}: expected five parked frames")
    draws = [frame["draws"] for frame in frames]
    uploads = [frame["uploads"] + frame["subUploads"] for frame in frames]
    require(all(isinstance(value, (int, float)) and math.isfinite(value) and value > 0
                for value in draws), f"{label}: empty/invalid draw sample")
    require(max(draws) <= draw_limit, f"{label}: draw-call budget exceeded")
    require(all(value == 0 for value in uploads), f"{label}: parked texture upload")
    resident = report["residentTextureBytes"]
    require(math.isfinite(resident) and 0 < resident <= texture_limit,
            f"{label}: active texture budget exceeded")
    require(all(value == 0 for value in report["frameMisses"].values()),
            f"{label}: missing atlas frame")
    gates = report["gates"]
    require(gates["maxDraws"] == max(draws) and gates["drawLimit"] == draw_limit
            and gates["maxUploads"] == max(uploads) and gates["textureLimit"] == texture_limit,
            f"{label}: stored budget summary differs from the parked samples")
    walls, props = snapshot["backWalls"], snapshot["dressing"]
    require(snapshot["enabled"]["backWalls"] or not walls, f"{label}: disabled back walls still draw")
    require(snapshot["enabled"]["dressing"] or not props, f"{label}: disabled dressing still draws")
    alphas = [entry["alpha"] for entry in walls + props]
    require(all(math.isfinite(alpha) and 0 < alpha <= 1 for alpha in alphas),
            f"{label}: invalid visible-layer alpha")
    site4 = capture.get("scene", "").startswith("SITE-4")
    if site4 and snapshot["enabled"]["backWalls"]:
        require(bool(walls), f"{label}: SITE-4 has no actual back-wall fragments")
    stats = snapshot.get("dressingStats", {})
    require(item != "T5" or "dressingStats" in snapshot,
            f"{label}: T5 snapshot lacks exposed-ceiling counts")
    exposed, decorated = stats.get("exposedCeilings", 0), stats.get("decoratedCeilings", 0)
    require(isinstance(exposed, int) and isinstance(decorated, int)
            and 0 <= decorated <= exposed, f"{label}: invalid planned ceiling counts")
    coverage = decorated / exposed if exposed else None
    actual_decorated, actual_coverage = None, None
    validation = report["validation"]
    if "dressingStats" in snapshot:
        view = report["view"]
        require(all(math.isfinite(view[key]) for key in
                    ("width", "height", "tile", "scrollX", "scrollY")) and view["tile"] > 0,
                f"{label}: invalid actual render viewport")
        left, right = view["scrollX"] / view["tile"], (view["scrollX"] + view["width"]) / view["tile"]
        top, bottom = view["scrollY"] / view["tile"], (view["scrollY"] + view["height"]) / view["tile"]
        ceiling_anchors = {(p["cellX"], p["cellY"]) for p in props
                           if p["face"] == "ceiling" and math.floor(p["x"]) + 1 > left
                           and math.floor(p["x"]) < right and top <= p["cellY"] < bottom}
        actual_decorated = len(ceiling_anchors)
        actual_coverage = actual_decorated / exposed if exposed else None
        require(validation["actualDecoratedCeilings"] == actual_decorated
                and validation["actualCeilingCoverage"] == actual_coverage,
                f"{label}: stored actual ceiling coverage differs from rendered anchors")
    if item == "T5" and phase == "after":
        if site4:
            require(bool(props), f"{label}: SITE-4 has no actual dressing")
        if capture.get("scene") == "SITE-4":
            require(coverage is None or coverage >= 0.8,
                    f"{label}: planned ceiling coverage is below 80%")
            require(not exposed or actual_coverage is not None and actual_coverage >= 0.8,
                    f"{label}: actual rendered ceiling coverage is below 80%")
    require(validation.get("geometryUnchanged") is True, f"{label}: geometry changed")
    require(validation.get("discoveryUnchanged") is True, f"{label}: discovery changed")
    require(validation.get("comparisonBaseline") == "post-import settled state before layer switches",
            f"{label}: discovery validation does not identify its settled baseline")
    require(validation["backWallFragments"] == len(walls)
            and validation["dressingProps"] == len(props),
            f"{label}: validation counts differ from the actual snapshot")
    return {
        "gates": gates, "residentTextureBytes": resident,
        "parkedFrames": frames, "frameMisses": report["frameMisses"],
        "backWallFragments": len(walls), "dressingProps": len(props),
        "exposedCeilings": exposed, "decoratedCeilings": decorated,
        "ceilingCoverage": coverage,
        "ceilingCoverageSource": "snapshot.dressingStats: planned eligible boundaries",
        "actualDecoratedCeilings": actual_decorated, "actualCeilingCoverage": actual_coverage,
        "actualCeilingCoverageSource": "distinct rendered ceiling anchors inside the actual viewport",
        "visibleAlphaMin": min(alphas) if alphas else None,
        "visibleAlphaMax": max(alphas) if alphas else None,
        "validation": validation, "caveSnapshot": snapshot,
        "checkpointSha256": record["checkpointSha256"],
        "postImportBaselineSha256": record["postImportBaselineSha256"], "settled": settled,
    }


def state_parity(before, after):
    states = [json.loads(Path(capture["state"]).read_text()) for capture in (before, after)]
    states = [state.get("state", state) for state in states]
    geometry, discovery, deposits = [], [], []
    for state in states:
        worlds = state["worlds"]
        geometry.append({key: {field: world.get(field) for field in
                              ("id", "width", "rows", "seed", "generatorVersion", "tiles")}
                         for key, world in worlds.items()})
        discovery.append({key: world["discovered"] for key, world in worlds.items()})
        deposits.append({key: world.get("packages", []) for key, world in worlds.items()})
    return {
        "geometryUnchanged": geometry[0] == geometry[1],
        "discoveryUnchanged": discovery[0] == discovery[1],
        "depositsUnchanged": deposits[0] == deposits[1],
        "rigUnchanged": states[0]["vehicle"] == states[1]["vehicle"],
        "geometrySha256": [data_sha256(value) for value in geometry],
        "discoverySha256": [data_sha256(value) for value in discovery],
    }


def baseline_parity(capture):
    """Authenticate separately, then compare arrays without rehashing JS floats."""
    if not capture.get("baselineState"):
        return {"available": False}
    states = [json.loads(Path(capture[key]).read_text()) for key in ("baselineState", "state")]
    baseline, final = [state.get("state", state) for state in states]
    before, after = baseline["worlds"], final["worlds"]
    same_worlds = before.keys() == after.keys()
    geometry_same = same_worlds and all(
        before[key].get(field) == after[key].get(field)
        for key in before for field in ("id", "width", "rows", "seed", "generatorVersion", "tiles"))
    discovery_same = same_worlds and all(before[key]["discovered"] == after[key]["discovered"]
                                        for key in before)
    return {"available": True, "geometryUnchanged": geometry_same,
            "discoveryUnchanged": discovery_same,
            "postImportDiscoveredCells": sum(value == 1 for value in before["W01"]["discovered"]),
            "finalDiscoveredCells": sum(value == 1 for value in after["W01"]["discovered"])}


def matched(capture, metrics):
    panel = metrics.panels()[capture["panel"]]
    box, scale = metrics.matched_window(capture["view"], panel)
    crop = metrics.crop_device(metrics.load_rgb(capture["hudFree"]), box,
                               capture["deviceScaleFactor"])
    image = Image.fromarray(crop.astype(np.uint8))
    ratio = scale / capture["deviceScaleFactor"]
    image = image.resize((round(image.width * ratio), round(image.height * ratio)), Image.Resampling.LANCZOS)
    result = Image.new("RGB", tuple(panel["size"]), "#d4d7d9")
    result.paste(image, (0, 0))
    return result


def comparison(name, before, after, output, item, metrics):
    rgb, _, panel = metrics.panel_crop(after["panel"])
    images = [Image.fromarray(rgb.astype(np.uint8)), matched(before, metrics), matched(after, metrics)]
    width, height = panel["size"]
    gap, header = 18, 82
    canvas = Image.new("RGB", (width * 3 + gap * 4, height + header + 24), "#eef0f1")
    draw = ImageDraw.Draw(canvas)
    draw.text((gap, 9), f"{item} · {name}", fill="#14232b", font=font(18))
    draw.text((gap, 33), "Actual game fixture · HUD hidden · board tile scale 44.14 px · grey = clipped viewport",
              fill="#394b58", font=font(12))
    for index, (label, image) in enumerate(zip(("Board crop", *LABELS[item]), images)):
        x = gap + index * (width + gap)
        draw.text((x, 60), label, fill="#14232b", font=font(14))
        canvas.paste(image, (x, header))
    path = output / f"sheet-{name}.png"
    canvas.save(path, optimize=True)
    return path.name


def brief_measure(name, capture, sheets, metrics):
    full = sheets.measure(name, capture)
    frame, rock = full["frame"], full["regions"]["rock_near_light"]
    return {
        "edge_density": frame["edge_density"], "frame_L_mean": frame["L_mean"],
        "warm_pct": frame["warm_pct"],
        "rock_near_light_sd": None if rock is None else rock["sd"],
        "rock_near_light_pixels": None if rock is None else rock["n"],
        "scoring_window_css": full["window"],
        "regions": full["regions"],
        "t4_brightness": t4_brightness(full["regions"], capture_region_b(capture, full["regions"], metrics)),
    }


def rounded(value, digits=2):
    return "—" if value is None else f"{value:.{digits}f}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captures", type=Path)
    parser.add_argument("--item", choices=("T4", "T5"), required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--repo", type=Path, default=ROOT,
                        help="repository containing existing measurement helpers (default: script's repo)")
    parser.add_argument("--allow-partial", action="store_true")
    args = parser.parse_args()
    metrics, sheets = load_tools(args.repo.resolve())
    before, after = [load_manifest(args.captures / phase) for phase in ("before", "after")]
    staged = json.loads((args.captures / "runtime-layers.json").read_text())
    require(staged["item"] == args.item, "runtime capture item differs from --item")
    records = staged["captures"]
    names = [name for name in CANONICAL if name in before and name in after
             and all(records.get(f"{phase}/{name}", {}).get("completed") is True
                     for phase in ("before", "after"))]
    missing = [name for name in CANONICAL if name not in names]
    require(not missing or args.allow_partial, f"Missing completed canonical pairs: {', '.join(missing)}")
    require(bool(names), "No completed before/after pair is available")
    # Validate every completed pair before writing any review sheet. A hard
    # failure must not leave an apparently successful partial evidence set.
    runtime, parity = {}, {}
    for name in names:
        previous, capture = before[name], after[name]
        for key in ("view", "viewport", "deviceScaleFactor", "backingScale", "rig", "panel"):
            require(previous[key] == capture[key], f"{name}: before/after {key} differs")
        for phase, source in (("before", previous), ("after", capture)):
            key = f"{phase}/{name}"
            verify_capture_hashes(key, source, records[key])
            runtime[key] = validate_record(name, phase, args.item, source, records[key])
            baseline = baseline_parity(source)
            runtime[key]["independentBaselineComparison"] = baseline
            if baseline["available"]:
                require(baseline["geometryUnchanged"] and baseline["discoveryUnchanged"],
                        f"{key}: final geometry/discovery differs from the settled baseline")
                require(baseline["postImportDiscoveredCells"]
                        == runtime[key]["validation"]["postImportDiscoveredCells"],
                        f"{key}: stored post-import discovery count differs from baseline state")
        require(runtime[f"before/{name}"]["checkpointSha256"]
                == runtime[f"after/{name}"]["checkpointSha256"], f"{name}: checkpoint hashes differ")
        require(runtime[f"before/{name}"]["postImportBaselineSha256"]
                == runtime[f"after/{name}"]["postImportBaselineSha256"],
                f"{name}: settled post-import baseline hashes differ")
        parity[name] = state_parity(previous, capture)
        require(all(parity[name][key] for key in
                    ("geometryUnchanged", "discoveryUnchanged", "depositsUnchanged", "rigUnchanged")),
                f"{name}: exported geometry, discovery, deposits or rig differs")
    args.out.mkdir(parents=True, exist_ok=True)
    result = {
        "item": args.item, "convention": CONVENTIONS[args.item],
        "driverConvention": staged.get("convention"),
        "settled_rule": "Completed captures each passed two byte-identical screenshots one 50 ms scene step apart.",
        "metrics": "Existing art-sheets.py §9.2 scoring windows; board masks unchanged.",
        "canonicalPairsExpected": len(CANONICAL), "canonicalPairsMeasured": len(names),
        "missingCanonicalPairs": missing, "captures": {}, "runtime_render": runtime,
        "visualTargetsNotMet": {},
        "t4BrightnessTargets": T4_BRIGHTNESS_TARGETS,
        "t4BrightnessMethod": (
            "Existing art-sheets.measure regions, unchanged: sampled known-air interiors are the cave-air proxy, "
            "including dug air and any rendered content in those pixels. These are lit fixture measurements, "
            "not isolated strip/source measurements. Known-solid minus cave-air uses all known solid, "
            "as the existing prototype/audit row does. Each region requires more than 500 pixels. "
            "For colour, per-pixel Lab b* is repeated into three scalar channels and passed through the "
            "unchanged region_stats masks with the same scoring keep window; pixel counts must match the "
            "original luma regions. caveAirB < knownSolidB measures cooler on the blue–yellow axis, "
            "using the existing one-decimal region-mean precision."
        ),
    }
    lines = [f"# {args.item} before/after game fixtures", "", CONVENTIONS[args.item], "",
             f"Completed canonical pairs: {len(names)}/{len(CANONICAL)}. "
             + ("Missing: " + ", ".join(missing) + "." if missing else "All eight are measured."), "",
             "Each completed screenshot passed two byte-identical captures one 50 ms scene step apart. "
             "Original checkpoint hashes, settled post-import baseline hashes, camera, exported geology, "
             "discovery, deposits and rig agree across each pair. The driver changes render switches only.", "",
             "Transit checkpoints initially have no discovered cells; the normal restore/render path "
             "discovers nearby cells before the baseline is exported. Discovery is checked against that "
             "settled baseline, not against the initially empty array. Terrain tiles must still match the "
             "original checkpoint. Raw baseline states, when recorded, are authenticated and compared "
             "independently with final tiles and discovery. Initial and post-import discovery counts and "
             "baseline availability are retained in `captures.json`.", "",
             "Sheets show HUD-free frames beside the board at the same tile scale. Measurements reuse "
             "`art-sheets.py` scoring windows, which differ from the matched-scale display crop. "
             "Ordinary visual target failures remain explicit in `captures.json`.", "",
             "| Fixture | Edge before → after (≥0.06) | L* before → after (board ±4) | Warm % before → after (cavern 2–5) | Rock sd before → after (≥15) | Changed HUD-free pixels |",
             "|---|---|---|---|---|---|"]
    for name in names:
        previous, capture = before[name], after[name]
        bm, am = [brief_measure(name, source, sheets, metrics) for source in (previous, capture)]
        concept = sheets.concept(capture["panel"])
        bp, ap = [metrics.load_rgb(source["hudFree"]) for source in (previous, capture)]
        require(bp.shape == ap.shape, f"{name}: before/after image dimensions differ")
        changed = int(np.count_nonzero(np.any(bp != ap, axis=2)))
        sheet = comparison(name, previous, capture, args.out, args.item, metrics)
        gates = {
            "edge_density": am["edge_density"] >= 0.06,
            "frame_L_mean": abs(am["frame_L_mean"] - concept["L_mean"]) <= 4,
            "warm_pct": 2 <= am["warm_pct"] <= 5 if capture["panel"].startswith("cavern") else None,
            "rock_near_light_sd": None if am["rock_near_light_sd"] is None else am["rock_near_light_sd"] >= 15,
        }
        gates.update({f"t4_{key}": passed for key, passed in am["t4_brightness"]["gates"].items()})
        result["captures"][name] = {
            "before": bm, "after": am,
            "board": {"edge_density": concept["edge_density"], "frame_L_mean": concept["L_mean"],
                      "warm_pct": concept["warm_pct"]},
            "after_gates": gates, "changed_hudfree_pixels": changed, "sheet": sheet,
            "viewport": capture["viewport"], "view": capture["view"],
            "backingScale": capture["backingScale"], "deviceScaleFactor": capture["deviceScaleFactor"],
            "parity": parity[name],
            "sha256": {phase: sha256(source["hudFree"])
                       for phase, source in (("before", previous), ("after", capture))},
        }
        result["visualTargetsNotMet"][name] = [key for key, passed in gates.items() if passed is False]
        lines.append(f"| [{name}]({sheet}) | {bm['edge_density']:.3f} → {am['edge_density']:.3f} | "
                     f"{bm['frame_L_mean']:.1f} → {am['frame_L_mean']:.1f} ({concept['L_mean']:.1f}) | "
                     f"{bm['warm_pct']:.2f} → {am['warm_pct']:.2f} | "
                     f"{rounded(bm['rock_near_light_sd'])} → {rounded(am['rock_near_light_sd'])} | {changed} |")
        print(f"Measured {name}", flush=True)
    lines += ["", "## T4 brightness targets — before → after", "",
              "These are the unchanged §9.2 known-air and rock-region measurements on the lit game frame, "
              "not the unlit asset luma or an isolated back-wall mask. Known air includes dug air and any "
              "rendered content inside the sampled cell interiors. Transit fixtures may contain no back-wall "
              "fragments; their values remain baseline diagnostics. The fragment counts below identify where "
              "the new layer actually contributes.", "",
              "✓/✗ compares each phase with the stated visual target; failures are reported and never abort "
              "this builder. `unavailable` means an existing required region has at most 500 usable pixels. "
              "Cooler-than-rock compares mean Lab b* in those same cave-air and known-solid masks: "
              "lower b* is bluer on the blue–yellow axis. The table gives air / rock b*; "
              "it is a masked-region colour comparison, not a full colour-temperature estimate.", "",
              "Per-pixel b* is supplied as three equal floating-point channels to the unchanged "
              "`region_stats` function, using the same state, view, rig and scoring-window keep mask. "
              "Its linear luma then equals b*, and both colour-region pixel counts must match the "
              "original luma-region counts. Means retain the helper's one-decimal rounding; original "
              "brightness measurements are untouched.", "",
              "The ≥18 row uses all known solid minus cave air, matching the existing audit/prototype measure; "
              "it does not substitute the smaller near-lamp subset. Per-region counts and unavailability "
              "reasons are recorded in `captures.json`.", "",
              "| Fixture | Back-wall fragments before → after | Cave-air luma 28–42 | Cave-air sd ≥4 | Unknown − air ≥10 | All known solid − air ≥18 | Mean b*: air / rock (air < rock) |",
              "|---|---|---|---|---|---|---|"]
    for name in names:
        pair = result["captures"][name]
        previous, current = [pair[phase]["t4_brightness"] for phase in ("before", "after")]
        values = [f"{brightness_cell(previous, key)} → {brightness_cell(current, key)}"
                  for key in ("cave_air_luma", "cave_air_sd", "unknown_minus_cave_air", "solid_minus_cave_air", "cooler_than_rock")]
        fragments = [runtime[f"{phase}/{name}"]["backWallFragments"] for phase in ("before", "after")]
        lines.append(f"| {name} | {fragments[0]} → {fragments[1]} | "
                     + " | ".join(values) + " |")
    failed_visuals = {name: failed for name, failed in result["visualTargetsNotMet"].items() if failed}
    lines += ["", "After-capture visual targets not met:", ""]
    lines += ([f"- {name}: {', '.join(failed)}." for name, failed in failed_visuals.items()]
              or ["None of the measured visual targets failed. Rows without a usable region remain unscored."])
    lines += ["", "## Runtime and snapshot checks", "",
              "The driver samples five parked frames after warming caches. Draw calls, resident bytes, "
              "zero uploads and zero missing atlas frames are required for both phases. Boot residency "
              "and hidden-information scramble invariance remain separate verify checks.", "",
              "Back-wall snapshots record their source crop, world bounds and reveal alpha. The driver "
              "checks current known air and crop-to-world mapping; independent pristine-natural classification "
              "belongs to the runtime/unit suite. Dressing snapshots retain full source bounds, known-cell "
              "checks and crystal-deposit exclusions. Settled alpha bounds do not test the timed reveal transition.", "",
              "Planned ceiling coverage uses the planner's eligible boundary counts; it may still be "
              "reported with dressing disabled. Actual coverage independently counts distinct rendered "
              "ceiling anchors inside the viewport against the same exposed-ceiling denominator. "
              "Both must reach 80% at SITE-4 in T5 after captures wherever ceilings are exposed. Transit coverage is reported without that threshold.", "",
              "| Phase / fixture | Max draws / limit | Parked uploads | Resident MiB / limit | Back-wall fragments | Dressing props | Planned / actual ceiling coverage |",
              "|---|---|---|---|---|---|---|"]
    for phase in ("before", "after"):
        for name in names:
            r = runtime[f"{phase}/{name}"]
            g = r["gates"]
            coverage = "—" if r["ceilingCoverage"] is None else f"{r['decoratedCeilings']}/{r['exposedCeilings']} ({r['ceilingCoverage']:.1%})"
            actual = "—" if r["actualCeilingCoverage"] is None else f"{r['actualDecoratedCeilings']}/{r['exposedCeilings']} ({r['actualCeilingCoverage']:.1%})"
            lines.append(f"| {phase}/{name} | {g['maxDraws']} / {g['drawLimit']} | {g['maxUploads']} | "
                         f"{r['residentTextureBytes'] / 1024 ** 2:.2f} / {g['textureLimit'] / 1024 ** 2:.0f} | "
                         f"{r['backWallFragments']} | {r['dressingProps']} | {coverage} / {actual} |")
    lines += ["", "| Phase / fixture | Known air cells checked | Dressing known cells checked | Maximum crop-to-world error | Visible alpha min–max |",
              "|---|---|---|---|---|"]
    for phase in ("before", "after"):
        for name in names:
            r = runtime[f"{phase}/{name}"]
            validation = r["validation"]
            lines.append(f"| {phase}/{name} | {validation.get('knownAirCellsChecked', '—')} | "
                         f"{validation.get('dressingKnownCellsChecked', '—')} | "
                         f"{rounded(validation.get('cropMaxError'), 8)} | "
                         f"{rounded(r['visibleAlphaMin'], 3)}–{rounded(r['visibleAlphaMax'], 3)} |")
    limitations = sorted({line for record in runtime.values()
                          for line in record["validation"].get("limitations", [])})
    if limitations:
        lines += ["", "Snapshot validation limits:", ""] + [f"- {line}" for line in limitations]
    (args.out / "captures.json").write_text(json.dumps(result, indent=2) + "\n")
    (args.out / "README.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
