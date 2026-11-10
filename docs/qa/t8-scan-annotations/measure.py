"""T8 evidence: the overlay edge share and the text budget per case.

Reads OUTDIR/cases.json from measure.mjs and writes OUTDIR/results.json and
a Markdown table on stdout. The overlay edge share is art_metrics'
overlay_edge_share (docs/art-audit/04-overlays.md §6.1): strong edges with
annotations against the same frame without them, the HUD row, menu button,
objective card and toolbar masked.

Usage: python3 docs/qa/t8-scan-annotations/measure.py OUTDIR
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))
import art_metrics as m  # noqa: E402

out = Path(sys.argv[1])
cases = json.loads((out / "cases.json").read_text())
rows = []
for case in cases:
    full = m.load_rgb(case["file"])
    free = m.load_rgb(case["hudFree"])
    width, height = case["view"]
    share = m.overlay_edge_share(full, free, (width, height), case["hud"])
    rows.append({
        "name": case["name"],
        "form": case["form"],
        "coach": case["coach"],
        "scene": case["scene"],
        "scan": case["scan"],
        "text": case["text"],
        "near_rig": case["nearRig"],
        "overlaps": case["textOverlaps"] + case["annotationOverlaps"],
        "overlay_share": share["overlay_share"],
        "edges_full": share["edges_full"],
        "edges_hudfree": share["edges_hudfree"],
    })
(out / "results.json").write_text(json.dumps(rows, indent=2) + "\n")

print("| Form | Coach | Scene | Scan | Text items | Near the rig | Overlaps | Overlay edge share |")
print("|---|---|---|---|---|---|---|---|")
for row in rows:
    share = "—" if row["overlay_share"] is None else f"{100 * row['overlay_share']:.0f} %"
    print(
        f"| {row['form']} | {row['coach']} | {row['scene']} | {'on' if row['scan'] else 'off'} "
        f"| {len(row['text'])}: {' · '.join(row['text']) or '—'} | {len(row['near_rig'])} "
        f"| {len(row['overlaps'])} | {share} |"
    )
