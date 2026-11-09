"""Shading tiers per material zone (style guide §6.1, "Shading model": hero
props and generator art are checked structurally, at least 3 shading tiers
per material zone; audit §9.2 "hero props structural"). Two readings:

A. Structural, from an SVG source: every filled shape's fill, assigned to a
   material zone, and the zone's tiers are its distinct L* levels after
   merging fills within MERGE_L (the style guide holds targets within
   ±3 L*). A generator names zones with data-zone="..." on a group; without
   it, the LCh rule below assigns them. The outline inks are left out.
B. Pixels, from a rendered RGBA image: opaque, non-outline pixels in flat
   regions (every 3×3 neighbour within FLAT_DE), so anti-aliasing and
   gradients do not count; the zone's tiers are the clusters of its 1-L*
   histogram, split at gaps over MERGE_L, that hold at least MIN_SHARE of
   its flat pixels (a 1-px highlight does not make a tier). Zones come from
   masks the caller passes (best: each zone rendered alone), else the LCh
   rule.

LCh rule (the fallback): chromatic fills go to the nearest anchor hue; neutrals
(C* < 12) split by L* (>= 62 silver, else dark).

Lab is art_metrics.lab(), so values read as the §9 measures read them.

Usage: python3 scripts/art_tiers.py FILE.svg|FILE.png ...
"""
import os
import re
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import art_metrics as m  # noqa: E402

OUTLINES = {'#14232b', '#111e26', '#101820', '#0e151d'}
MERGE_L, FLAT_DE, MIN_SHARE = 3.0, 2.0, 0.03
ANCHORS = {'hull': '#f6e791', 'copper': '#d69d6e', 'glass': '#19404b'}


def hex_rgb(colour):
    colour = colour.lstrip('#')
    if len(colour) == 3:
        colour = ''.join(c * 2 for c in colour)
    return np.array([int(colour[i:i + 2], 16) for i in (0, 2, 4)], float)


def lch(rgb):
    L, a, b = m.lab(np.asarray(rgb, float))
    return np.asarray(L), np.hypot(a, b), (np.degrees(np.arctan2(b, a)) % 360)


ANCHOR_H = {k: float(lch(hex_rgb(v))[2]) for k, v in ANCHORS.items()}


def zone_of(L, C, H):
    if C < 12:
        return 'silver' if L >= 62 else 'dark'
    return min(ANCHOR_H, key=lambda k: min(abs(H - ANCHOR_H[k]), 360 - abs(H - ANCHOR_H[k])))


def tiers_from_levels(levels, weights=None, min_share=0.0):
    """[(mean L*, share)] of the L* clusters split at gaps over MERGE_L."""
    if len(levels) == 0:
        return []
    order = np.argsort(levels)
    levels = np.asarray(levels, float)[order]
    weights = np.ones_like(levels) if weights is None else np.asarray(weights, float)[order]
    groups, cur, cw = [], [levels[0]], [weights[0]]
    for v, w in zip(levels[1:], weights[1:]):
        if v - cur[-1] <= MERGE_L:
            cur.append(v)
            cw.append(w)
        else:
            groups.append((cur, cw))
            cur, cw = [v], [w]
    groups.append((cur, cw))
    total = weights.sum()
    return [(round(float(np.average(g, weights=w)), 1), round(float(sum(w) / total), 3))
            for g, w in groups if sum(w) / total >= min_share]


# ---------------------------------------------------------------- structural
def _zone_chunks(text):
    """(zone or None, text) pieces: the inside of each data-zone group, and
    the rest. Zone groups are not nested."""
    pieces, at = [], 0
    for match in re.finditer(r'<g[^>]*data-zone="([^"]+)"[^>]*>', text):
        if match.start() < at:
            continue
        depth, index = 1, match.end()
        for tag in re.finditer(r'<(/?)g\b', text[match.end():]):
            depth += -1 if tag.group(1) else 1
            if depth == 0:
                index = match.end() + tag.start()
                break
        pieces.append((None, text[at:match.start()]))
        pieces.append((match.group(1), text[match.end():index]))
        at = index
    pieces.append((None, text[at:]))
    return pieces


def svg_tiers(source):
    """{zone: {fills, tiers}} from an SVG file path or SVG text."""
    text = open(source).read() if not source.lstrip().startswith('<') else source
    zones, chunks = {}, _zone_chunks(text)
    named = any(zone for zone, _ in chunks)
    for zone, chunk in chunks:
        for fill in re.findall(r'fill="(#[0-9a-fA-F]{3,6})"', chunk):
            if fill.lower() in OUTLINES:
                continue
            L, C, H = (float(v) for v in lch(hex_rgb(fill)))
            # With named zones, fills outside them (marks, harnesses) are
            # kept apart instead of joining a material zone by hue.
            name = zone or ('unzoned' if named else zone_of(L, C, H))
            zones.setdefault(name, set()).add((round(L, 1), fill.lower()))
    return {z: {'fills': sorted(f for _, f in v), 'tiers': tiers_from_levels([L for L, _ in v])}
            for z, v in zones.items()}


# ---------------------------------------------------------------- pixels
def lab_image(rgb):
    L, A, B = m.lab(rgb.reshape(-1, 3).astype(float))
    return np.stack([L, A, B], -1).reshape(rgb.shape)


def flat_mask(lab, tolerance=FLAT_DE):
    flat = np.ones(lab.shape[:2], bool)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            shifted = np.roll(np.roll(lab, dy, 0), dx, 1)
            flat &= np.sqrt(((lab - shifted) ** 2).sum(-1)) <= tolerance
    flat[[0, -1], :] = False
    flat[:, [0, -1]] = False
    return flat


def pixel_tiers(image, zones=None, min_share=MIN_SHARE, alpha_min=250, keep_outline=False):
    """{zone: {px, tiers}} for an RGBA image (path, PIL image or array).
    `zones` maps a zone name to a boolean mask; without it, the LCh rule
    assigns each flat pixel. `keep_outline` keeps dark neutral pixels (for
    zones that are dark by design, such as a socket's recess)."""
    if isinstance(image, str):
        image = Image.open(image)
    px = np.asarray(image.convert('RGBA') if hasattr(image, 'convert') else image).astype(np.int32)
    rgb, alpha = px[..., :3], px[..., 3]
    lab = lab_image(rgb)
    C = np.hypot(lab[..., 1], lab[..., 2])
    H = np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) % 360
    keep = (alpha >= alpha_min) & flat_mask(lab)
    if not keep_outline:
        keep &= ~((lab[..., 0] < 20) & (C < 12))
    out = {}
    if zones is None:
        found = {}
        for y, x in zip(*np.nonzero(keep)):
            found.setdefault(zone_of(lab[y, x, 0], C[y, x], H[y, x]), []).append(lab[y, x, 0])
        items = found.items()
    else:
        items = ((name, lab[..., 0][keep & mask]) for name, mask in zones.items())
    for name, levels in items:
        levels = np.round(np.asarray(levels, float), 0)
        out[name] = {'px': int(len(levels)), 'tiers': tiers_from_levels(levels, min_share=min_share)}
    return out


if __name__ == '__main__':
    for path in sys.argv[1:]:
        result = svg_tiers(path) if path.endswith('.svg') else pixel_tiers(path)
        print(os.path.basename(path))
        for zone, record in sorted(result.items()):
            extra = f' fills={record["fills"]}' if 'fills' in record else f' px={record["px"]}'
            print(f'  {zone:8s} tiers={len(record["tiers"])} {record["tiers"]}{extra}')
