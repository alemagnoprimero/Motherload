#!/usr/bin/env python3
"""Swatch cards for the W01 bands: art item A1 (docs/ART_QUALITY_AUDIT.md §5.3, §6.1).

Reads the board samples in docs/art-audit/data/palette.json and writes, to
docs/art-direction/swatches/:

    w01-band-a.png to w01-band-d.png   one card per band
    w01-swatches.json                  the same values, for code and generators

Each card shows the band's roles (unknown, lit, lip, crack, back wall, cave
air, accent; bands C and D add rust) with hex, L*, luma, chroma and hue; a
sample of 4 x 4 tiles at @2x (96 px per tile); the value ladder; and the card's
values against the frame gates of §9.2 and T4.

Where the values come from:
- Band A is the board's slate ladder, sampled from the 60 m shaft panel.
- Band C keeps that ladder (D6: a slate base at every depth) and takes its back
  wall, cave air and rust from the cavern panel. Its accent is the violet
  crystal of D8, defined below in LCh at the board's accent value, L* 67.
- Bands B and D are derived from A and C by turning the CIELAB hue at constant
  L* and chroma, by at most 15 degrees (§6.1). Band D keeps C's violet: D8 gives
  the crystal seams the crystals' hue.

Card values are on-screen targets, as the board shows them, within 3 L* (§6.1).
They are not shader inputs: code sets its bases, pages and darkness so that
game frames land on them.

Run from the repository root:

    python3 scripts/swatch-cards.py           write the cards and the JSON
    python3 scripts/swatch-cards.py --check   rebuild in memory, compare bytes

The files are byte-identical wherever this runs. The PNG encoder (row filters
and a fixed-Huffman DEFLATE) and the pixel font are in this file, so neither
the zlib build, nor Pillow, nor the installed fonts change a byte, and the
sample is drawn with exact arithmetic only (no trigonometry or powers per
pixel). Needs Python 3.9 or later and NumPy.
"""

import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
PALETTE = ROOT / "docs" / "art-audit" / "data" / "palette.json"
OUT = ROOT / "docs" / "art-direction" / "swatches"

# ---------------------------------------------------------------- the bands

BANDS = {  # W01 names and rows, src/campaign/world-content.ts
    "A": ("REGOLITH", 0, 10),
    "B": ("BROKEN PLATES", 11, 29),
    "C": ("IRON SHELF", 30, 47),
    "D": ("CORE RUBBLE", 48, 59),
}
ROLES = ("unknown", "lit", "lip", "crack", "back wall", "cave air", "accent", "rust")

# Bands sampled from the board: role -> palette.json key. Band C takes the
# slate ladder from the shaft panel (D6) and the rest from the cavern panel.
SAMPLED = {
    "A": {
        "unknown": "shaft_unknown_rock",
        "lit": "shaft_lit_wall",
        "lip": "shaft_rim_lip",
        "crack": "shaft_unknown_crack",
        "back wall": "shaft_interior",
        "cave air": "cave_backwall",
        "accent": "ground_rock",
    },
    "C": {
        "unknown": "shaft_unknown_rock",
        "lit": "shaft_lit_wall",
        "lip": "shaft_rim_lip",
        "crack": "shaft_unknown_crack",
        "back wall": "cave_backwall_silhouette",
        "cave air": "cave_backwall",
        "rust": "rust_drip",
    },
}
ACCENT = {  # what the accent is in each band (D6, D8)
    "A": "REGOLITH PEBBLE",
    "B": "REGOLITH PEBBLE",
    "C": "VIOLET CRYSTAL",
    "D": "CRYSTAL SEAM",
}

# D8: violet decoration crystals at the board's accent value (its amber
# crystal is L* 67.3). LCh: L*, chroma, hue in degrees.
VIOLET_LCH = (67.0, 60.0, 310.0)

# §6.1: bands B and D turn the hue by at most 15 degrees, holding L*. B leans
# toward teal and D toward violet, the ways the game's bands lean today
# (world-content.ts: B soil #527b8e, D soil #685f86). D6 names 30 to 40
# degrees as the fallback if the slice shows the bands cannot be told apart;
# that needs the director's decision first.
DERIVED = {"B": ("A", -15.0), "D": ("C", 15.0)}
MAX_TURN = 15.0

# ---------------------------------------------------------------- colour

# Lab as scripts/art_metrics.py computes it: sRGB, D65.
M = ((0.4124, 0.3576, 0.1805), (0.2126, 0.7152, 0.0722), (0.0193, 0.1192, 0.9505))
WHITE = (0.9505, 1.0, 1.089)


def _inverse(m):
    a, b, c = m[0]
    d, e, f = m[1]
    g, h, i = m[2]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    return (
        ((e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det),
        ((f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det),
        ((d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det),
    )


M_INV = _inverse(M)


def _linear(v):
    c = v / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _f(t):
    return t ** (1.0 / 3.0) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116


def lab(rgb):
    lin = [_linear(v) for v in rgb]
    xyz = [(M[i][0] * lin[0] + M[i][1] * lin[1] + M[i][2] * lin[2]) / WHITE[i] for i in range(3)]
    fx, fy, fz = (_f(t) for t in xyz)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def _lab_to_linear(L, a, b):
    fy = (L + 16) / 116
    fx, fz = fy + a / 500, fy - b / 200

    def inv(t):
        t3 = t * t * t
        return t3 if t3 > 216 / 24389 else (116 * t - 16) * 27 / 24389

    xyz = (inv(fx) * WHITE[0], inv(fy) * WHITE[1], inv(fz) * WHITE[2])
    return [M_INV[i][0] * xyz[0] + M_INV[i][1] * xyz[1] + M_INV[i][2] * xyz[2] for i in range(3)]


def _encode(lin):
    lin = min(1.0, max(0.0, lin))
    v = 12.92 * lin if lin <= 0.0031308 else 1.055 * lin ** (1 / 2.4) - 0.055
    return 255.0 * v


def nearest_rgb(L, a, b):
    """The 8-bit sRGB colour closest to a Lab target (ties broken by value)."""
    base = [int(math.floor(_encode(v) + 0.5)) for v in _lab_to_linear(L, a, b)]
    best = None
    for dr in (-1, 0, 1):
        for dg in (-1, 0, 1):
            for db in (-1, 0, 1):
                c = (base[0] + dr, base[1] + dg, base[2] + db)
                if min(c) < 0 or max(c) > 255:
                    continue
                L2, a2, b2 = lab(c)
                key = (round((L2 - L) ** 2 + (a2 - a) ** 2 + (b2 - b) ** 2, 9), c)
                if best is None or key < best:
                    best = key
    return best[1]


def lch_rgb(L, C, h):
    r = math.radians(h)
    return nearest_rgb(L, C * math.cos(r), C * math.sin(r))


def in_gamut(L, C, h):
    r = math.radians(h)
    return all(-1e-9 <= v <= 1 + 1e-9 for v in _lab_to_linear(L, C * math.cos(r), C * math.sin(r)))


def max_chroma(L, h):
    lo, hi = 0.0, 150.0
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if in_gamut(L, mid, h) else (lo, mid)
    return lo


def hue_turn(rgb, parent):
    """The hue angle from parent to rgb, in degrees, -180 to 180."""
    _, a1, b1 = lab(parent)
    _, a2, b2 = lab(rgb)
    return (math.degrees(math.atan2(b2, a2) - math.atan2(b1, a1)) + 540) % 360 - 180


def turn_hue(rgb, degrees):
    """Turn the CIELAB hue at constant L* and chroma. Of the 8-bit colours near
    the exact result, keep those whose own turn stays within the rule (same
    sign, at most MAX_TURN) and whose L* is within 0.3, and take the closest:
    at the slate's chroma (about 6) one 8-bit step moves the hue by several
    degrees, so plain rounding can overshoot 15."""
    L, a, b = lab(rgb)
    C = math.hypot(a, b)
    h = math.atan2(b, a) + math.radians(degrees)
    ta, tb = C * math.cos(h), C * math.sin(h)
    base = [int(math.floor(_encode(v) + 0.5)) for v in _lab_to_linear(L, ta, tb)]
    best = None
    for dr in range(-2, 3):
        for dg in range(-2, 3):
            for db in range(-2, 3):
                c = (base[0] + dr, base[1] + dg, base[2] + db)
                if min(c) < 0 or max(c) > 255:
                    continue
                L2, a2, b2 = lab(c)
                turn = hue_turn(c, rgb)
                if abs(L2 - L) > 0.3 or turn * degrees < 0 or abs(turn) > MAX_TURN:
                    continue
                key = (round((L2 - L) ** 2 + (a2 - ta) ** 2 + (b2 - tb) ** 2, 9), c)
                if best is None or key < best:
                    best = key
    if best is None:
        raise SystemExit(f"no 8-bit colour turns {rgb} by {degrees} degrees within the rule")
    return best[1]


def luma(rgb):
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def describe(rgb):
    L, a, b = lab(rgb)
    return {
        "hex": "#%02x%02x%02x" % tuple(rgb),
        "L": round(L, 1),
        "luma": round(luma(rgb), 1),
        "C": round(math.hypot(a, b), 1),
        "h": round(math.degrees(math.atan2(b, a)) % 360, 1),
    }


def delta_e(c1, c2):
    a, b = lab(c1), lab(c2)
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def crystal_tiers(lch):
    """Three top-lit tiers for the crystal (§6.1 shading model) and its ADD sparkle."""
    L, C, h = lch
    tiers = {}
    for name, Lt in (("light", L + 13.0), ("body", L), ("dark", L - 16.0)):
        tiers[name] = lch_rgb(Lt, min(C, 0.92 * max_chroma(Lt, h)), h)
    tiers["sparkle"] = lch_rgb(94.0, min(12.0, 0.9 * max_chroma(94.0, h)), h)
    return tiers


def build_bands(palette):
    bands = {}
    for bid in ("A", "C"):
        roles = {}
        for role, key in SAMPLED[bid].items():
            entry = palette[key]
            rgb = tuple(entry["rgb"])
            if "#%02x%02x%02x" % rgb != entry["hex"] or abs(lab(rgb)[0] - entry["L"]) > 0.06:
                raise SystemExit(f"palette.json: {key} does not match its own hex or L*")
            roles[role] = {"rgb": rgb, "source": key.upper()}
        if bid == "C":
            L, C, h = VIOLET_LCH
            roles["accent"] = {"rgb": lch_rgb(L, C, h), "source": "D8, LCH %g %g %g" % (L, C, h)}
        bands[bid] = roles
    for bid, (parent, turn) in DERIVED.items():
        if abs(turn) > MAX_TURN:
            raise SystemExit(f"band {bid}: a hue turn of {turn} degrees breaks the 15 degree rule (6.1)")
        roles = {}
        for role, entry in bands[parent].items():
            if bid == "D" and role == "accent":
                roles[role] = {"rgb": entry["rgb"], "source": "C VIOLET, D8"}
            else:
                roles[role] = {
                    "rgb": turn_hue(entry["rgb"], turn),
                    "source": "%s %s, HUE %+.0f" % (parent, role.upper(), turn),
                    "parent": entry["rgb"],
                }
        bands[bid] = roles
    return {bid: bands[bid] for bid in "ABCD"}


# ---------------------------------------------------------------- the sample

TILE = 96  # px per tile at @2x (§5.6: 48 px at @1x)
NT = 4  # tiles per side
SS = 4  # supersampling per axis
SIDE = TILE * NT  # 384

GAP = 0.024  # crack between slabs, tiles
BEVEL = 0.075  # top-lit bevel: top edge +44 % (§6.1)
BEVEL_BOTTOM = 0.045  # and the bottom edge -30 %, narrower so slabs stay flat
LIP = 0.09  # lip on the solid side of floors and walls (§6.1: 0.085 to 0.1)
LIP_SHADE = 0.065  # darker step just inside the lip
CEIL_EDGE = 0.05  # ceilings get a dark edge instead of a lip
UNDERCUT = 0.03  # air side, air -15 luma (§6.1)
AO = 0.35  # occlusion into the air (§6.1: 0.3 to 0.4 tile)
OUTLINE = 0.044  # prop outline, 4.4 % of a cell (§6.1)
OUTLINE_RGB = (0x14, 0x23, 0x2B)

SEEDS = {"A": 11, "B": 23, "C": 37, "D": 41}

# Classes per subsample, for the sample's statistics.
UNKNOWN, KNOWN, EDGE, DUG, NATURAL, PROP = range(6)


def h01(*values):
    """Integer hash to [0, 1)."""
    h = 0x811C9DC5
    for v in values:
        h = ((h ^ (v & 0xFFFFFFFF)) * 0x01000193) & 0xFFFFFFFF
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & 0xFFFFFFFF
    h ^= h >> 16
    return h / 4294967296.0


def lerp(a, b, t):
    return a + (b - a) * t


def vnoise(t, seed):
    """Smooth value noise in [-1, 1] along the array t."""
    i = np.floor(t)
    f = t - i
    s = f * f * (3.0 - 2.0 * f)
    lo, hi = int(i.min()), int(i.max()) + 1
    table = np.array([2.0 * h01(seed, k) - 1.0 for k in range(lo, hi + 1)])
    idx = (i - lo).astype(np.int64)
    a, b = table[idx], table[idx + 1]
    return a + (b - a) * s


def polyline(x, xs, ys):
    """Piecewise-linear y(x), exact arithmetic (no np.interp)."""
    xs, ys = np.asarray(xs, float), np.asarray(ys, float)
    j = np.clip(np.searchsorted(xs, x, side="right") - 1, 0, len(xs) - 2)
    x0, x1, y0, y1 = xs[j], xs[j + 1], ys[j], ys[j + 1]
    return y0 + (y1 - y0) * ((x - x0) / (x1 - x0))


def smooth01(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def segment_distance(X, Y, x0, y0, x1, y1):
    dx, dy = x1 - x0, y1 - y0
    t = np.clip(((X - x0) * dx + (Y - y0) * dy) / (dx * dx + dy * dy), 0.0, 1.0)
    ex, ey = X - (x0 + t * dx), Y - (y0 + t * dy)
    return np.sqrt(ex * ex + ey * ey)


def polyline_distance(X, Y, pts):
    d = None
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        s = segment_distance(X, Y, x0, y0, x1, y1)
        d = s if d is None else np.minimum(d, s)
    return d


def convex_sd(X, Y, poly):
    """Signed distance to a convex polygon (clockwise on screen), positive inside."""
    d = None
    n = len(poly)
    for k in range(n):
        (x0, y0), (x1, y1) = poly[k], poly[(k + 1) % n]
        ex, ey = x1 - x0, y1 - y0
        length = math.sqrt(ex * ex + ey * ey)
        nx, ny = -ey / length, ex / length  # inward for a clockwise polygon (y down)
        s = (X - x0) * nx + (Y - y0) * ny
        d = s if d is None else np.minimum(d, s)
    return d


def round_intersect(a, b, r):
    """Rounded intersection of two signed distances (negative inside)."""
    ua, ub = np.maximum(a + r, 0.0), np.maximum(b + r, 0.0)
    return np.minimum(-r, np.maximum(a, b)) + np.sqrt(ua * ua + ub * ub)


class Rock:
    """Courses of slabs (bands A, B) or of angular blocks (bands C, D), §6.1 shapes."""

    def __init__(self, seed, blocks, rubble=False):
        self.blocks = blocks
        if rubble:  # D: smaller angular blocks (core rubble)
            heights, lengths, slant = (0.62, 0.84), (0.75, 1.2), 0.6
        elif blocks:  # C: chunky angular blocks 1 to 2 tiles across, lighter top facet
            heights, lengths, slant = (0.78, 1.0), (1.0, 1.6), 0.55
        else:  # A: strata 0.7 to 1.2 tiles tall, slabs 2 to 4 tiles long, staggered
            heights, lengths, slant = (0.72, 1.12), (2.0, 3.4), 0.3
        self.tops, y, k = [], -1.0 + 0.6 * h01(seed, 1), 0
        while y < NT + 1.4:
            self.tops.append(y)
            y += lerp(*heights, h01(seed, 2, k))
            k += 1
        self.tops.append(y)
        self.nodes = []  # angular course boundaries (blocks)
        for k in range(len(self.tops)):
            xs, ys, x, j = [], [], -1.6, 0
            while x < NT + 1.8:
                xs.append(x)
                ys.append((h01(seed, 9, k, j) - 0.5) * 0.24)
                x += lerp(0.55, 0.95, h01(seed, 10, k, j))
                j += 1
            self.nodes.append((xs, ys))
        self.joints = []
        for k in range(len(self.tops) - 1):
            row, x, j = [], -2.4 + 1.6 * h01(seed, 3, k), 0
            while x < NT + 2.4:
                row.append((x, (h01(seed, 4, k, j) - 0.5) * 2 * slant))
                x += lerp(*lengths, h01(seed, 5, k, j))
                j += 1
            self.joints.append(row)
        self.seed = seed

    def boundary(self, k, X):
        if self.blocks:
            xs, ys = self.nodes[k]
            return self.tops[k] + polyline(X, xs, ys)
        s = self.seed + 97 * k
        return self.tops[k] + 0.07 * vnoise(X * 1.6, s) + 0.025 * vnoise(X * 4.3, s + 50)

    def shade(self, X, Y):
        """Per subsample: tone index (dark, mid, light), facet multiplier, crack
        mask, top and bottom bevel ramps, and the side bevel (+ faces left)."""
        bounds = [self.boundary(k, X) for k in range(len(self.tops))]
        course = np.zeros(X.shape, np.int64) - 1
        for b in bounds:
            course += Y >= b
        tone = np.ones(X.shape, np.int64)
        facets = np.ones(X.shape)
        gap_d = np.full(X.shape, 9.0)
        crack = np.zeros(X.shape, bool)
        top_ramp = np.zeros(X.shape)
        bottom_ramp = np.zeros(X.shape)
        side = np.zeros(X.shape)
        for k, row in enumerate(self.joints):
            m = course == k
            if not m.any():
                continue
            xk, yk = X[m], Y[m]
            top, bottom = bounds[k][m], bounds[k + 1][m]
            joint_x = [x0 + s * (yk - self.tops[k]) for x0, s in row]
            slab = np.zeros(xk.shape, np.int64) - 1
            for jx in joint_x:
                slab += xk >= jx
            t = np.ones(xk.shape, np.int64)
            facet = np.ones(xk.shape)
            d_joint = np.full(xk.shape, 9.0)
            sgn = np.zeros(xk.shape)
            for j, ((x0, s), jx) in enumerate(zip(row, joint_x)):
                dist = (xk - jx) / math.sqrt(1 + s * s)
                near = np.abs(dist) < d_joint
                d_joint = np.where(near, np.abs(dist), d_joint)
                sgn = np.where(near, np.sign(dist), sgn)
            for j in range(len(row) - 1):
                sm = slab == j
                if not sm.any():
                    continue
                r = h01(self.seed, 7, k, j)
                if self.blocks:
                    base = 0 if r < 0.28 else 1 if r < 0.72 else 2
                else:
                    course_tone = (1, 2, 0)[(k + int(3 * h01(self.seed, 12))) % 3]
                    base = min(2, max(0, course_tone + (-1 if r < 0.16 else 1 if r > 0.84 else 0)))
                x0, x1 = row[j][0], row[j + 1][0]
                cx = (x0 + x1) / 2
                cy = (self.tops[k] + self.tops[k + 1]) / 2
                slope = (h01(self.seed, 8, k, j) - 0.5) * (2.0 if self.blocks else 0.9)
                below = (yk[sm] - cy) - slope * (xk[sm] - cx) > 0
                f = np.where(below, 0.95, 1.03) if self.blocks else np.where(below, 0.97, 1.03)
                if self.blocks:  # lighter top facet, following the course top
                    depth = lerp(0.24, 0.36, h01(self.seed, 6, k, j))
                    in_top = (yk[sm] - top[sm]) < depth * (bottom[sm] - top[sm])
                    f = np.where(in_top, 1.22, f)
                t[sm] = base
                facet[sm] = f
            d_top, d_bottom = yk - top, bottom - yk
            g = GAP / 2
            crack[m] = (d_top < g) | (d_bottom < g) | (d_joint < g)
            gap_d[m] = np.minimum(np.minimum(d_top, d_bottom), d_joint)
            top_ramp[m] = np.where((d_top >= g) & (d_top < g + BEVEL), 1 - (d_top - g) / BEVEL, 0.0)
            bottom_ramp[m] = np.where(
                (d_bottom >= g) & (d_bottom < g + BEVEL_BOTTOM), 1 - (d_bottom - g) / BEVEL_BOTTOM, 0.0
            )
            side[m] = np.where((d_joint >= g) & (d_joint < g + BEVEL), sgn * (1 - (d_joint - g) / BEVEL), 0.0)
            tone[m] = t
            facets[m] = facet
        return tone, facets, crack, gap_d, top_ramp, bottom_ramp, side


def _geometry(seed):
    """Organic edges of the natural cave (§6.1: rounded, within 0.3 tile of the cells)."""
    return {
        "wall": lambda Y: 2.1 + 0.07 * vnoise(Y * 2.6, seed + 301),
        "ceiling": lambda X: 2.12 + 0.07 * vnoise(X * 2.4, seed + 302) + 0.025 * vnoise(X * 6.0, seed + 303),
        "mound": lambda X: 2.72 - 0.22 * smooth01(2.3, 3.9, X) + 0.06 * vnoise(X * 2.2, seed + 304),
    }


def _crystal_shards(base_x, base_y, specs):
    """Shard polygons (clockwise on screen) and their facet split lines."""
    shards = []
    for dx, angle, length, width in specs:
        ax, ay = math.sin(math.radians(angle)), -math.cos(math.radians(angle))
        nx, ny = -ay, ax  # to the shard's right
        bx, by = base_x + dx, base_y
        w = width / 2
        tip = (bx + ax * length, by + ay * length)
        shoulder = 0.72 * length
        poly = [
            (bx - nx * w * 0.8, by - ny * w * 0.8),
            (bx - nx * w + ax * shoulder, by - ny * w + ay * shoulder),
            tip,
            (bx + nx * w + ax * shoulder, by + ny * w + ay * shoulder),
            (bx + nx * w * 0.8, by + ny * w * 0.8),
        ]
        shards.append({"poly": poly, "tip": tip, "base": (bx, by), "n": (nx, ny), "w": w})
    return shards


def render_sample(bid, band, crystal):
    """The 4 x 4-tile sample at @2x, and the class of every output pixel."""
    seed = SEEDS[bid]
    blocks = bid in "CD"
    rock = Rock(seed, blocks, rubble=bid == "D")
    geo = _geometry(seed)
    rgb = {k: np.array(v["rgb"], float) for k, v in band.items()}
    unknown_tones = (0.86, 1.0, 1.24) if not blocks else (0.88, 1.0, 1.12)
    known_tones = (0.92, 1.0, 1.1)

    n = SIDE * SS
    out = np.zeros((SIDE, SIDE, 3), np.uint8)
    classes = np.zeros((SIDE, SIDE), np.uint8)
    pure = np.zeros((SIDE, SIDE), bool)
    strip = 64 * SS
    coords = (np.arange(n) + 0.5) / (TILE * SS)

    accent = rgb["accent"]
    rust = rgb.get("rust")
    if blocks:
        shards = _crystal_shards(
            3.45 if bid == "C" else 3.3,
            3.035,
            [(-0.15, -26, 0.40, 0.13), (0.14, 28, 0.34, 0.12), (0.0, 4, 0.62, 0.16)]
            if bid == "C"
            else [(-0.1, -20, 0.4, 0.13), (0.12, 24, 0.32, 0.12)],
        )
    pebbles = []
    if not blocks:
        cells = [(0, 0), (1, 0), (0, 1), (1, 1), (0, 2), (0, 3)]
        for i, (cx, cy) in enumerate(cells[:4]):
            px = cx + 0.25 + 0.5 * h01(seed, 40, i)
            py = cy + 0.25 + 0.5 * h01(seed, 41, i)
            rx, ry = 0.10 + 0.05 * h01(seed, 42, i), 0.07 + 0.03 * h01(seed, 43, i)
            poly = []
            for v in range(6):
                a = math.radians(60 * v + 30 * h01(seed, 44, i))
                k = 0.86 + 0.14 * h01(seed, 45, i, v)
                poly.append((px + rx * k * math.cos(a), py + ry * k * math.sin(a)))
            pebbles.append((px, py, ry, poly))
    fracture = [(0.08, 0.42), (0.72, 1.46), (1.12, 2.58), (1.62, 3.9)] if bid == "B" else None
    drip_x = 2.47

    for r0 in range(0, n, strip):
        Y1 = coords[r0 : r0 + strip]
        X, Y = np.meshgrid(coords, Y1)
        cx, cy = np.floor(X), np.floor(Y)
        unknown_cell = ((cx <= 1) & (cy <= 1)) | ((cx == 0) & (cy >= 2))
        dug_cell = (cx == 3) & (cy <= 1)

        # Air: a dug shaft (x >= 3, above row 2) opening into a natural cave.
        a_w = geo["wall"](Y) - X
        a_c = geo["ceiling"](X) - Y
        a_f = Y - 3.0
        cave = round_intersect(round_intersect(a_w, a_c, 0.28), a_f, 0.10)
        shaft = np.maximum(3.0 - X, Y - 3.0)
        sdf = np.minimum(cave, shaft)
        air = sdf < 0
        from_shaft = shaft <= cave
        face = np.where(
            from_shaft,
            np.where(3.0 - X >= Y - 3.0, 1, 2),
            np.where((a_w >= a_c) & (a_w >= a_f), 1, np.where(a_c >= a_f, 3, 2)),
        )  # 1 wall, 2 floor, 3 ceiling
        wall_or_floor = face != 3

        # Solid: material by cell state, cracks, bevels.
        idx, facet, crack, gap_d, top_ramp, bottom_ramp, side = rock.shade(X, Y)
        tone_u = np.array(unknown_tones)[idx] * facet
        tone_k = np.array(known_tones)[idx] * facet
        base = np.where(unknown_cell[..., None], rgb["unknown"], rgb["lit"])
        tone = np.where(unknown_cell, tone_u, tone_k)
        col = base * tone[..., None]
        col = col * (1 + 0.44 * top_ramp + 0.10 * side)[..., None]
        dark = np.where(unknown_cell[..., None], rgb["crack"], rgb["unknown"])
        col = np.maximum(col * (1 - 0.30 * bottom_ramp)[..., None], np.where(bottom_ramp[..., None] > 0, dark, 0))
        col = np.where(crack[..., None], dark, col)
        cls = np.where(unknown_cell, UNKNOWN, KNOWN).astype(np.uint8)

        if pebbles:  # band A and B accent: regolith pebbles in the strata
            for px, py, ry, poly in pebbles:
                sd_p = convex_sd(X, Y, poly)
                rim = sd_p > -GAP
                inside = sd_p >= 0
                ty = (Y - py) / ry
                ptone = np.where(ty < -0.3, 1.32, np.where(ty > 0.4, 0.74, 1.0))
                pcol = accent * ptone[..., None]
                col = np.where(rim[..., None], dark, col)
                col = np.where(inside[..., None], pcol, col)
        if fracture:  # band B: a long fracture across the courses (D6)
            fd = polyline_distance(X, Y, fracture)
            col = np.where((fd < 0.019)[..., None], dark * 0.82, col)
        if bid == "D":  # band D: crystal seams along the joints of the known rock (D8 hue)
            vein = (~unknown_cell) & (Y > 2.0) & (np.abs((X - 1.55) - (Y - 3.0) * 0.45) < 0.45)
            col = np.where((vein & (gap_d < 0.017))[..., None], accent, col)
            col = np.where((vein & (gap_d < 0.006))[..., None], np.array(crystal["light"], float), col)

        if rust is not None:  # bands C and D: rust seams on the joints above the cave ceiling
            gate = vnoise(X * 2.2, seed + 311) > -0.25
            above = (~air) & ~unknown_cell & (a_c >= 0) & (a_c < 0.5) & (X > geo["wall"](Y) - 0.2)
            seam_w = 0.022 if bid == "C" else 0.016
            col = np.where((above & gate & (gap_d < seam_w))[..., None], rust, col)
            col = np.where((above & gate & (gap_d < 0.007))[..., None], rust * 1.3, col)

        # Edges on the solid side: lip on floors and walls, dark edge on ceilings.
        lip = (~air) & wall_or_floor & (sdf < LIP)
        lip_shade = (~air) & wall_or_floor & (sdf >= LIP) & (sdf < LIP + LIP_SHADE)
        ceiling_edge = (~air) & (face == 3) & (sdf < CEIL_EDGE)
        col = np.where(lip_shade[..., None], col * 0.8, col)
        col = np.where(ceiling_edge[..., None], col * 0.7, col)
        col = np.where(lip[..., None], rgb["lip"], col)
        if rust is not None:  # rust along the ceiling edge, where the seams reach it
            gate = vnoise(X * 2.2, seed + 311) > -0.25
            rim = (~air) & (face == 3) & (sdf < 0.028) & gate
            col = np.where(rim[..., None], rust * 1.15, col)
        cls = np.where(lip | lip_shade | ceiling_edge, EDGE, cls)

        # Air: recessed strata in dug air, cave air and a back-wall mass in natural air.
        bw_tone = 1 + (tone_u - 1) * 0.45
        dug = rgb["back wall"] * bw_tone[..., None]
        dug = np.where(crack[..., None], dug * 0.82, dug)
        mound = geo["mound"](X)
        nat = np.where((Y > mound)[..., None], rgb["back wall"], rgb["cave air"])
        nat = np.where(((Y > mound) & (Y < mound + 0.03))[..., None], rgb["back wall"] * 1.12, nat)
        air_col = np.where(dug_cell[..., None], dug, nat)
        depth = -sdf
        ao = np.where(depth < AO, 0.32 * (1 - depth / AO) ** 2, 0.0)
        air_col = air_col * (1 - ao)[..., None]
        undercut = np.where(face == 2, 5.0, 15.0)
        air_col = np.where((depth < UNDERCUT)[..., None], air_col - undercut[..., None], air_col)
        col = np.where(air[..., None], air_col, col)
        cls = np.where(air, np.where(dug_cell, DUG, NATURAL), cls)

        if rust is not None:  # rust drips hanging from the ceiling seams
            for dx_, length in ((2.52, 0.44), (2.84, 0.3)) if bid == "C" else ((2.6, 0.26),):
                top = float(geo["ceiling"](np.array([dx_]))[0]) - 0.03
                t = (Y - top) / length
                half = 0.034 - 0.022 * np.clip(t, 0.0, 1.0)
                body = (t >= 0) & (t <= 1) & (np.abs(X - dx_) < half)
                bead = (X - dx_) ** 2 + (Y - top - length) ** 2 < 0.03 * 0.03
                drip = (body | bead) & air
                dcol = np.where((X < dx_ - 0.005)[..., None], rust * 1.35, rust)
                col = np.where(drip[..., None], dcol, col)
                cls = np.where(drip, PROP, cls)

        if blocks:  # crystals on the cave floor: outline, three tiers, ADD sparkle
            for s in sorted(shards, key=lambda s: math.dist(s["base"], s["tip"])):
                sd = convex_sd(X, Y, s["poly"])
                bx, by = s["base"]
                tx, ty = s["tip"]
                nx, ny = s["n"]
                across = (X - bx) * nx + (Y - by) * ny
                frac = across / (s["w"] + 1e-9)
                tier = np.where(frac < -0.25, 0, np.where(frac > 0.35, 2, 1))
                facets = np.stack(
                    [np.array(crystal["light"], float), np.array(crystal["body"], float), np.array(crystal["dark"], float)]
                )
                fill = facets[tier]
                ring = (sd > -OUTLINE / 2) & (sd < OUTLINE / 2)
                inside = sd >= OUTLINE / 2
                col = np.where(ring[..., None], np.array(OUTLINE_RGB, float), col)
                col = np.where(inside[..., None], fill, col)
                cls = np.where(ring | inside, PROP, cls)
            tallest = max(shards, key=lambda s: math.dist(s["base"], s["tip"]))
            tx, ty = tallest["tip"]
            dx, dy = np.abs(X - tx), np.abs(Y - ty)
            star = np.maximum(
                np.maximum(0.0, 1 - dx / 0.13 - dy / 0.016), np.maximum(0.0, 1 - dy / 0.13 - dx / 0.016)
            )
            core = np.maximum(0.0, 1 - (dx * dx + dy * dy) / (0.035 * 0.035))
            glow = np.maximum(star, core) * 0.85
            col = col + np.array(crystal["sparkle"], float) * glow[..., None]
            cls = np.where(glow > 0.05, PROP, cls)

        q = np.clip(np.floor(col + 0.5), 0, 255).astype(np.int64)
        rows = q.shape[0] // SS
        summed = q.reshape(rows, SS, SIDE, SS, 3).sum(axis=(1, 3))
        o0 = r0 // SS
        out[o0 : o0 + rows] = ((summed + (SS * SS) // 2) // (SS * SS)).astype(np.uint8)
        c4 = cls.reshape(rows, SS, SIDE, SS)
        first = c4[:, :1, :, :1]
        pure[o0 : o0 + rows] = (c4 == first).all(axis=(1, 3))
        classes[o0 : o0 + rows] = first[:, 0, :, 0]
    return out, classes, pure


def region_luma(img, mask):
    """Mean and sd of Rec. 709 luma over a mask, in exact integer arithmetic."""
    px = img[mask].astype(np.int64)
    if len(px) == 0:
        return None, None
    v = 2126 * px[:, 0] + 7152 * px[:, 1] + 722 * px[:, 2]
    n, s, s2 = len(v), int(v.sum()), int((v * v).sum())
    mean = s / n / 10000
    var = (s2 * n - s * s) / (n * n) / 1e8
    return mean, math.sqrt(max(0.0, var))


# ---------------------------------------------------------------- pixel font

FONT = {  # 5 x 7, rows top to bottom, leftmost pixel is bit 4
    "A": (14, 17, 17, 31, 17, 17, 17), "B": (30, 17, 17, 30, 17, 17, 30),
    "C": (14, 17, 16, 16, 16, 17, 14), "D": (30, 17, 17, 17, 17, 17, 30),
    "E": (31, 16, 16, 30, 16, 16, 31), "F": (31, 16, 16, 30, 16, 16, 16),
    "G": (14, 17, 16, 23, 17, 17, 15), "H": (17, 17, 17, 31, 17, 17, 17),
    "I": (14, 4, 4, 4, 4, 4, 14), "J": (7, 2, 2, 2, 2, 18, 12),
    "K": (17, 18, 20, 24, 20, 18, 17), "L": (16, 16, 16, 16, 16, 16, 31),
    "M": (17, 27, 21, 21, 17, 17, 17), "N": (17, 17, 25, 21, 19, 17, 17),
    "O": (14, 17, 17, 17, 17, 17, 14), "P": (30, 17, 17, 30, 16, 16, 16),
    "Q": (14, 17, 17, 17, 21, 18, 13), "R": (30, 17, 17, 30, 20, 18, 17),
    "S": (15, 16, 16, 14, 1, 1, 30), "T": (31, 4, 4, 4, 4, 4, 4),
    "U": (17, 17, 17, 17, 17, 17, 14), "V": (17, 17, 17, 17, 17, 10, 4),
    "W": (17, 17, 17, 21, 21, 21, 10), "X": (17, 17, 10, 4, 10, 17, 17),
    "Y": (17, 17, 17, 10, 4, 4, 4), "Z": (31, 1, 2, 4, 8, 16, 31),
    "0": (14, 17, 19, 21, 25, 17, 14), "1": (4, 12, 4, 4, 4, 4, 14),
    "2": (14, 17, 1, 2, 4, 8, 31), "3": (31, 2, 4, 2, 1, 17, 14),
    "4": (2, 6, 10, 18, 31, 2, 2), "5": (31, 16, 30, 1, 1, 17, 14),
    "6": (6, 8, 16, 30, 17, 17, 14), "7": (31, 1, 2, 4, 8, 8, 8),
    "8": (14, 17, 17, 14, 17, 17, 14), "9": (14, 17, 17, 15, 1, 2, 12),
    " ": (0, 0, 0, 0, 0, 0, 0), ".": (0, 0, 0, 0, 0, 12, 12),
    ",": (0, 0, 0, 0, 12, 4, 8), ":": (0, 12, 12, 0, 12, 12, 0),
    ";": (0, 12, 12, 0, 12, 4, 8), "-": (0, 0, 0, 14, 0, 0, 0),
    "+": (0, 4, 4, 31, 4, 4, 0), "(": (2, 4, 8, 8, 8, 4, 2),
    ")": (8, 4, 2, 2, 2, 4, 8), "/": (0, 1, 2, 4, 8, 16, 0),
    "%": (24, 25, 2, 4, 8, 19, 3), "#": (10, 10, 31, 10, 31, 10, 10),
    "*": (0, 4, 21, 14, 21, 4, 0), "_": (0, 0, 0, 0, 0, 0, 31),
    "=": (0, 0, 31, 0, 31, 0, 0), "'": (4, 4, 8, 0, 0, 0, 0),
    ">": (8, 4, 2, 1, 2, 4, 8), "<": (2, 4, 8, 16, 8, 4, 2),
    "≥": (16, 12, 3, 12, 16, 0, 31), "≤": (1, 6, 24, 6, 1, 0, 31),
    "°": (12, 18, 18, 12, 0, 0, 0), "@": (14, 17, 23, 21, 23, 16, 14),
}


def text_width(text, scale):
    return len(text) * 6 * scale - scale


def draw_text(img, x, y, text, scale, colour):
    for i, ch in enumerate(text):
        rows = FONT.get(ch)
        if rows is None:
            raise ValueError(f"no glyph for {ch!r}")
        gx = x + i * 6 * scale
        for r, bits in enumerate(rows):
            for c in range(5):
                if bits & (16 >> c):
                    y0, x0 = y + r * scale, gx + c * scale
                    img[y0 : y0 + scale, x0 : x0 + scale] = colour
    return text_width(text, scale)


def fill(img, x0, y0, x1, y1, colour):
    img[y0:y1, x0:x1] = colour


def frame(img, x0, y0, x1, y1, colour, width=1):
    fill(img, x0 - width, y0 - width, x1 + width, y0, colour)
    fill(img, x0 - width, y1, x1 + width, y1 + width, colour)
    fill(img, x0 - width, y0, x0, y1, colour)
    fill(img, x1, y0, x1 + width, y1, colour)


# ---------------------------------------------------------------- the card

PAGE = (20, 20, 20)
INK = (228, 228, 228)
DIM = (140, 140, 140)
RULE = (72, 72, 72)
W, H = 1320, 960
MARGIN = 44
SLOT, SLOT_GAP = 140, 16


def _wrap(text, width):
    """Split a provenance line in two at a space or underscore, at most width characters each."""
    if len(text) <= width:
        return [text]
    cut = max(text.rfind(" ", 0, width + 1), text.rfind("_", 0, width + 1))
    cut = cut if cut > 0 else width
    return [text[: cut + (1 if text[cut] == "_" else 0)].rstrip(), text[cut + 1 :].lstrip()[:width]]


def card(bid, band, sample, classes, pure):
    img = np.zeros((H, W, 3), np.uint8)
    img[:] = PAGE
    name, row0, row1 = BANDS[bid]
    draw_text(img, MARGIN, 40, f"BAND {bid}  {name}", 4, INK)
    right = f"W01  ROWS {row0} TO {row1}"
    draw_text(img, W - MARGIN - text_width(right, 2), 48, right, 2, DIM)
    if bid == "A":
        lines = ["BOARD SAMPLES FROM THE 60 M SHAFT PANEL (DOCS/ART-AUDIT/DATA/PALETTE.JSON): THE SLATE",
                 "LADDER EVERY BAND HOLDS (D6). PART OF THE A1 SIGN-OFF SET."]
    elif bid == "C":
        lines = ["THE SLATE LADDER OF BAND A (D6); BACK WALL, CAVE AIR AND RUST FROM THE CAVERN PANEL; THE",
                 "VIOLET CRYSTAL OF D8 AT THE BOARD'S ACCENT VALUE. PART OF THE A1 SIGN-OFF SET."]
    else:
        parent, turn = DERIVED[bid]
        lines = [f"DERIVED FROM BAND {parent}: CIELAB HUE TURNED {turn:+.0f}\u00b0 AT CONSTANT L* AND CHROMA (6.1, D6).",
                 "THE CRYSTAL SEAM KEEPS THE BAND C VIOLET (D8). FOR W1 (P1), NOT IN THE A1 SIGN-OFF SET."
                 if bid == "D" else "PART OF THE A1 SIGN-OFF SET."]
    for i, line in enumerate(lines):
        draw_text(img, MARGIN, 88 + 22 * i, line, 2, DIM)

    y = 146
    for i, role in enumerate(r for r in ROLES if r in band):
        x = MARGIN + i * (SLOT + SLOT_GAP)
        entry = band[role]
        info = describe(entry["rgb"])
        fill(img, x, y, x + SLOT, y + SLOT, entry["rgb"])
        frame(img, x, y, x + SLOT, y + SLOT, RULE)
        notes = [ACCENT[bid]] if role == "accent" else []
        notes += _wrap(entry["source"], 23)
        ty = y + SLOT + 12
        draw_text(img, x, ty, role.upper(), 2, INK)
        for j, note in enumerate(notes[:2]):
            draw_text(img, x, ty + 20 + 10 * j, note, 1, DIM)
        draw_text(img, x, ty + 44, info["hex"].upper(), 2, INK)
        draw_text(img, x, ty + 66, f"L* {info['L']:.1f}", 2, INK)
        draw_text(img, x, ty + 88, f"LUMA {info['luma']:.1f}", 2, DIM)
        draw_text(img, x, ty + 110, f"C {info['C']:.1f} H {info['h']:.0f}", 2, DIM)

    # The sample, with a tick at every tile boundary.
    top = 474
    draw_text(img, MARGIN, top - 26, "SAMPLE, 4 X 4 TILES AT @2X", 2, INK)
    sx, sy = MARGIN, top
    img[sy : sy + SIDE, sx : sx + SIDE] = sample
    frame(img, sx, sy, sx + SIDE, sy + SIDE, RULE)
    for t in range(NT + 1):
        p = min(t * TILE, SIDE - 1)
        fill(img, sx + p, sy + SIDE + 2, sx + p + 1, sy + SIDE + 9, DIM)
        fill(img, sx - 9, sy + p, sx - 2, sy + p + 1, DIM)
    caption = [
        "TOP LEFT UNKNOWN ROCK. RIGHT: THE LIT WALL AND LIP OF A DUG SHAFT",
        "(RECESSED BACK WALL), OPENING INTO A NATURAL CAVE (CAVE AIR, A",
        "BACK-WALL MASS, THE FLOOR LIP). VALUES AND SHAPES, NOT T2'S MATERIAL.",
    ]
    for i, line in enumerate(caption):
        draw_text(img, MARGIN, sy + SIDE + 16 + 12 * i, line, 1, DIM)

    # The value ladder.
    lx = MARGIN + SIDE + 56
    draw_text(img, lx, top - 26, "LADDER, L*", 2, INK)
    bar_x0, bar_x1 = lx + 14, lx + 24
    frame(img, bar_x0, sy, bar_x1, sy + SIDE, RULE)
    for v in (0, 25, 50, 75, 100):
        yy = min(sy + SIDE - round(v * SIDE / 100), sy + SIDE - 1)
        fill(img, bar_x0 - 5, yy, bar_x0, yy + 1, DIM)
        draw_text(img, bar_x0 - 7 - text_width(str(v), 1), yy - 3, str(v), 1, DIM)
    marks = sorted(((describe(band[r]["rgb"])["L"], r) for r in band), reverse=True)
    placed = []
    for L, role in marks:
        want = sy + SIDE - L * SIDE / 100 - 7
        if placed and want < placed[-1] + 18:
            want = placed[-1] + 18
        placed.append(want)
    shift = max(0.0, placed[-1] + 14 - (sy + SIDE))
    for (L, role), ly in zip(marks, placed):
        yy = min(int(math.floor(sy + SIDE - L * SIDE / 100 + 0.5)), sy + SIDE - 1)
        ly = int(math.floor(ly - shift + 0.5))
        fill(img, bar_x0, yy, bar_x1, yy + 1, INK)
        for xx in range(bar_x1 + 1, bar_x1 + 14):
            t = (xx - bar_x1) / 13
            img[int(math.floor(yy + (ly + 7 - yy) * t + 0.5)), xx] = DIM
        fill(img, bar_x1 + 14, ly + 1, bar_x1 + 40, ly + 13, band[role]["rgb"])
        frame(img, bar_x1 + 14, ly + 1, bar_x1 + 40, ly + 13, RULE)
        draw_text(img, bar_x1 + 48, ly, f"{role.upper()} {L:.1f}", 2, INK)

    # Card values against the frame gates.
    gx, vx, gate_x = 790, 1128, 1148
    draw_text(img, gx, top - 26, "CARD VALUES AGAINST THE GATES", 2, INK)
    v = {r: describe(band[r]["rgb"]) for r in band}
    u_mean, u_sd = region_luma(sample, pure & (classes == UNKNOWN))
    k_mean, _ = region_luma(sample, pure & (classes == KNOWN))
    n_mean, _ = region_luma(sample, pure & (classes == NATURAL))
    order = [v[r]["L"] for r in ("lip", "lit", "unknown", "crack", "back wall", "cave air")]
    holds = all(a > b for a, b in zip(order, order[1:]))
    rows = [
        ("UNKNOWN LUMA", f"{v['unknown']['luma']:.1f}", "45 TO 65"),
        ("LIT MINUS UNKNOWN", f"{v['lit']['luma'] - v['unknown']['luma']:+.1f}", "\u2265 +15"),
        ("UNKNOWN MINUS CAVE AIR", f"{v['unknown']['luma'] - v['cave air']['luma']:+.1f}", "\u2265 +10"),
        ("LIT MINUS CAVE AIR", f"{v['lit']['luma'] - v['cave air']['luma']:+.1f}", "\u2265 +18"),
        ("LIP MINUS LIT", f"{v['lip']['luma'] - v['lit']['luma']:+.1f}", "\u2265 +55"),
        ("BACK WALL LUMA", f"{v['back wall']['luma']:.1f}", "28 TO 42"),
        ("BRIGHTNESS ORDER", "HOLDS" if holds else "FAILS", "6.1"),
        None,
        ("SAMPLE UNKNOWN LUMA", f"{u_mean:.1f}", "45 TO 65"),
        ("SAMPLE UNKNOWN SD", f"{u_sd:.1f}", "\u2265 7"),
        ("SAMPLE LIT MINUS UNKN.", f"{k_mean - u_mean:+.1f}", "\u2265 +15"),
        ("SAMPLE UNKN. MINUS AIR", f"{u_mean - n_mean:+.1f}", "\u2265 +10"),
    ]
    if bid in DERIVED:
        parent, turn = DERIVED[bid]
        rock = [r for r in ("unknown", "lit", "lip", "crack", "back wall", "cave air")]
        turns = [abs(hue_turn(band[r]["rgb"], band[r]["parent"])) for r in rock]
        dl = max(abs(lab(band[r]["rgb"])[0] - lab(band[r]["parent"])[0]) for r in band if "parent" in band[r])
        des = [delta_e(band[r]["rgb"], band[r]["parent"]) for r in rock]
        dressing = "accent" if bid == "B" else "rust"
        rows += [
            None,
            (f"HUE TURN FROM {parent}", f"{turn:+.0f}\u00b0", "\u2264 15\u00b0"),
            ("AS ROUNDED", f"{min(turns):.1f} TO {max(turns):.1f}", ""),
            ("LARGEST L* CHANGE", f"{dl:.1f}", "HELD"),
            ("DELTA E, ROCK", f"{min(des):.1f} TO {max(des):.1f}", ""),
            (f"DELTA E, {dressing.upper()}", f"{delta_e(band[dressing]['rgb'], band[dressing]['parent']):.1f}", ""),
        ]
    yy = sy
    for row in rows:
        if row is None:
            yy += 10
            continue
        label, value, gate = row
        draw_text(img, gx, yy, label, 2, INK)
        draw_text(img, vx - text_width(value, 2), yy, value, 2, INK)
        if gate:
            draw_text(img, gate_x, yy, gate, 2, DIM)
        yy += 24
    notes = [
        "GATE: THE 9.2, F4 AND T4 LINES, READ ON GAME FRAMES; ORDER: LIP, LIT, UNKNOWN,",
        "CRACK, BACK WALL, CAVE AIR (6.1 HIERARCHY). THE CARD SHOWS THE VALUES LEAVE ROOM.",
    ]
    for i, line in enumerate(notes):
        draw_text(img, gx, yy + 6 + 12 * i, line, 1, DIM)

    foot = [
        "TARGETS WITHIN 3 L* (AUDIT 6.1). L* AND LUMA (REC 709 ON SRGB) AS IN SCRIPTS/ART_METRICS.PY.",
        "MADE BY SCRIPTS/SWATCH-CARDS.PY FROM DOCS/ART-AUDIT/DATA/PALETTE.JSON. NO BOARD PIXELS ARE COPIED.",
    ]
    for i, line in enumerate(foot):
        draw_text(img, MARGIN, H - 46 + 14 * i, line, 1, DIM)
    return img


# ---------------------------------------------------------------- PNG writer


def _reverse_bits(code, n):
    r = 0
    for _ in range(n):
        r = (r << 1) | (code & 1)
        code >>= 1
    return r


def _fixed_codes():
    lit = []
    for s in range(288):
        if s < 144:
            code, n = 0x30 + s, 8
        elif s < 256:
            code, n = 0x190 + s - 144, 9
        elif s < 280:
            code, n = s - 256, 7
        else:
            code, n = 0xC0 + s - 280, 8
        lit.append((_reverse_bits(code, n), n))
    lbase = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227]
    lextra = [0] * 8 + [1] * 4 + [2] * 4 + [3] * 4 + [4] * 4 + [5] * 4
    length = [None] * 259
    for i, (b, e) in enumerate(zip(lbase, lextra)):
        bits, n = lit[257 + i]
        for off in range(1 << e):
            if b + off <= 257:
                length[b + off] = (bits | (off << n), n + e)
    length[258] = lit[285]
    dbase = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
             1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
    dextra = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
    dist = [None] * 32769
    for code, (b, e) in enumerate(zip(dbase, dextra)):
        bits = _reverse_bits(code, 5)
        for off in range(1 << e):
            if b + off <= 32768:
                dist[b + off] = (bits | (off << 5), 5 + e)
    return lit, length, dist


_CODES = None


def deflate(data, stride):
    """DEFLATE with the fixed Huffman code and greedy LZ77 (RFC 1951), one block."""
    global _CODES
    if _CODES is None:
        _CODES = _fixed_codes()
    lit, length, dist = _CODES
    out = bytearray()
    acc, nacc = 3, 3  # BFINAL = 1, BTYPE = 01
    n, i = len(data), 0
    last = {}
    while i < n:
        best, best_d = 0, 0
        if i + 3 <= n:
            key = data[i : i + 3]
            limit = min(258, n - i)
            prev = last.get(key, -1)
            for d in (1, stride, i - prev if prev >= 0 else 0):
                if d < 1 or d > i or d > 32768:
                    continue
                j = i - d
                if data[j : j + 3] != key:
                    continue
                if data[i : i + limit] == data[j : j + limit]:
                    size = limit
                else:
                    lo, hi = 3, limit
                    while hi - lo > 1:
                        mid = (lo + hi) >> 1
                        if data[i : i + mid] == data[j : j + mid]:
                            lo = mid
                        else:
                            hi = mid
                    size = lo
                if size > best:
                    best, best_d = size, d
                    if size == limit:
                        break
            last[key] = i
        if best >= 3:
            bits, nb = length[best]
            acc |= bits << nacc
            nacc += nb
            bits, nb = dist[best_d]
            acc |= bits << nacc
            nacc += nb
            i += best
        else:
            bits, nb = lit[data[i]]
            acc |= bits << nacc
            nacc += nb
            i += 1
        if nacc >= 64:
            k = nacc >> 3
            out += (acc & ((1 << (8 * k)) - 1)).to_bytes(k, "little")
            acc >>= 8 * k
            nacc -= 8 * k
    bits, nb = lit[256]
    acc |= bits << nacc
    nacc += nb
    out += acc.to_bytes((nacc + 7) >> 3, "little")
    return bytes(out)


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = np.abs(p - a), np.abs(p - b), np.abs(p - c)
    return np.where((pa <= pb) & (pa <= pc), a, np.where(pb <= pc, b, c))


def png(img):
    h, w, _ = img.shape
    rows = img.reshape(h, w * 3).astype(np.int16)
    prev = np.zeros(w * 3, np.int16)
    raw = bytearray()
    zero = np.zeros(3, np.int16)
    for y in range(h):
        row = rows[y]
        left = np.concatenate((zero, row[:-3]))
        upleft = np.concatenate((zero, prev[:-3]))
        best = None
        for ft, pred in enumerate((0, left, prev, (left + prev) >> 1, _paeth(left, prev, upleft))):
            f = (row - pred) & 255
            score = int(np.minimum(f, 256 - f).sum())
            if best is None or score < best[0]:
                best = (score, ft, f)
        raw.append(best[1])
        raw += best[2].astype(np.uint8).tobytes()
        prev = row
    data = bytes(raw)
    stream = b"\x78\x01" + deflate(data, w * 3 + 1) + struct.pack(">I", zlib.adler32(data) & 0xFFFFFFFF)

    def chunk(tag, payload):
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"sRGB", b"\x00")
        + chunk(b"IDAT", stream)
        + chunk(b"IEND", b"")
    )


# ---------------------------------------------------------------- outputs


def build():
    palette = json.loads(PALETTE.read_text())
    bands = build_bands(palette)
    crystal = crystal_tiers(VIOLET_LCH)
    files, record = {}, {}
    for bid, band in bands.items():
        sample, classes, pure = render_sample(bid, band, crystal)
        files[f"w01-band-{bid.lower()}.png"] = png(card(bid, band, sample, classes, pure))
        name, row0, row1 = BANDS[bid]
        roles = {}
        for role in ROLES:
            if role in band:
                roles[role] = dict(describe(band[role]["rgb"]), source=band[role]["source"].lower())
        u = region_luma(sample, pure & (classes == UNKNOWN))
        record[bid] = {
            "name": name.title(),
            "rows": [row0, row1],
            "accent": ACCENT[bid].lower(),
            "derived_from": DERIVED[bid][0] if bid in DERIVED else None,
            "hue_turn_degrees": DERIVED[bid][1] if bid in DERIVED else 0.0,
            "roles": roles,
            "sample_unknown_luma": [round(u[0], 1), round(u[1], 1)],
        }
    doc = {
        "about": "W01 swatch cards, art item A1 (docs/ART_QUALITY_AUDIT.md 6.1). On-screen targets "
        "within 3 L*. Made by scripts/swatch-cards.py from docs/art-audit/data/palette.json.",
        "colour_space": "sRGB; L*, C and h are CIELAB (D65) as in scripts/art_metrics.py; luma is Rec. 709 on sRGB",
        "violet_crystal": {
            "lch": list(VIOLET_LCH),
            "tiers": {k: describe(v)["hex"] for k, v in crystal.items()},
            "decision": "D8",
        },
        "bands": record,
    }
    files["w01-swatches.json"] = (json.dumps(doc, indent=1, ensure_ascii=True) + "\n").encode()
    return files, bands


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true", help="rebuild in memory and compare with the files")
    parser.add_argument("--out", type=Path, default=OUT, help="output folder")
    args = parser.parse_args()
    files, bands = build()
    if args.check:
        bad = 0
        for name, data in files.items():
            path = args.out / name
            ok = path.exists() and path.read_bytes() == data
            bad += not ok
            print(f"{'identical' if ok else 'DIFFERS  '}  {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}")
        sys.exit(1 if bad else 0)
    args.out.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (args.out / name).write_bytes(data)
    for bid, band in bands.items():
        cells = "  ".join(f"{r} {describe(band[r]['rgb'])['hex']} {describe(band[r]['rgb'])['L']:.1f}" for r in ROLES if r in band)
        print(f"band {bid}: {cells}")
    print(f"wrote {len(files)} files to {args.out}")


if __name__ == "__main__":
    main()
