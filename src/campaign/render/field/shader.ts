/**
 * T2 field shader (WebGL1, GLSL ES 1.00): one full-screen quad draws the
 * rock edge as the F = 0.5 iso-line of the field texture, the lip, the bevel
 * shadow, the undercut, ambient occlusion, slate slabs (anisotropic Worley),
 * hard rock as square cracked blocks, and rust seams on band-C ceilings.
 *
 * Per-pixel budget (audit §7: about 12 taps and 9 Worley seeds):
 *   texture taps  10: the field at the pixel and ±1 texel in x and y (5,
 *                     bilinear); the four cells around the pixel (4) and the
 *                     cell 0.3 tile into the rock along the edge normal (1),
 *                     each snapped to a texel centre so it reads the A
 *                     channel unfiltered.
 *   Worley seeds   9: one 3 × 3 neighbourhood, visited twice (nearest seed,
 *                     then the exact distance to each bisector).
 *   noise          7 evaluations, 4 hashes each, no taps: gradient noise
 *                     for the edge displacement (1.1, 2.5, 4.3 and 8.6 per
 *                     tile), value noise for the slab warp (x and y) and the
 *                     mottle; plus one hash for speckles and two for cracks.
 * Sky pixels above the field return before any tap. Requires fragment
 * highp: the field coordinate reaches 776 texels and mediump (fp16) would
 * quantise it to half a texel; without highp the game keeps
 * RetainedTerrain (tier.ts).
 *
 * Motion (§9.3): each of the four cell taps carries its cell's transition
 * slot, and u_slots holds each slot's progress (transitions.ts), so the
 * reveal cross-fade and the dig easing cost no tap and no upload per frame.
 * A revealed cell's known weight rises with its slot; a cell in a
 * transition shows the solid look it had (the unknown rock, or the known
 * rock it was dug from) mixed out by the slot's progress.
 */
export const FIELD_TAPS = 10;
export const FIELD_WORLEY_SEEDS = 9;

export const FIELD_VERTEX = `
attribute vec2 a_position;
uniform vec2 u_resolution;
void main() {
  vec2 clip = a_position / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

export const FIELD_FRAGMENT = `
precision highp float;

uniform sampler2D u_field;
uniform vec4 u_tex;      // field width, height (texels); world width (tiles); texels per tile
uniform vec4 u_layout;   // pad texels; sky tiles above row 0; buffer height (device px); debug mode
uniform vec4 u_view;     // scroll x, y (CSS px); tile (CSS px); backing scale
uniform vec4 u_bands;    // first rows of bands B, C, D; world rows
uniform vec4 u_periods;  // lattice cells per world width: low noise, jag, warp, mottle
uniform vec4 u_darkU;    // light-overlay darkness on unknown cells, bands A..D
uniform vec4 u_darkV;    // light-overlay darkness on visible cells, bands A..D
uniform vec3 u_unknown;
uniform vec3 u_lit;
uniform vec3 u_lip;
uniform vec3 u_crack;
uniform vec3 u_interior;
uniform vec3 u_caveAir;
uniform vec3 u_rust;
uniform float u_highContrast;
uniform vec4 u_slots[4];   // progress of transition slots 0..15 (+2: a dig slot)
uniform vec4 u_ring;       // ring height (texels); rows above the ring; last virtual texel; unused

const vec3 FOG = vec3(5.0, 9.0, 13.0) / 255.0;
const float LIP = 0.085;
const float BEVEL = 0.07;
const float UNDERCUT = 0.03;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
// Value noise in [-1, 1], periodic over 'period' lattice cells in x.
float vnoise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, period);
  float x1 = mod(i.x + 1.0, period);
  float a = hash12(vec2(x0, i.y));
  float b = hash12(vec2(x1, i.y));
  float c = hash12(vec2(x0, i.y + 1.0));
  float d = hash12(vec2(x1, i.y + 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

// Gradient noise in about [-1, 1], periodic over 'period' cells in x. Unlike
// value noise its slope is not zero at the lattice rows, so displaced walls
// do not turn vertical at regular intervals.
float gnoise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float x0 = mod(i.x, period);
  float x1 = mod(i.x + 1.0, period);
  float a = dot(hash22(vec2(x0, i.y)) * 2.0 - 1.0, f);
  float b = dot(hash22(vec2(x1, i.y)) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hash22(vec2(x0, i.y + 1.0)) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(hash22(vec2(x1, i.y + 1.0)) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.6;
}

// Slate slabs: anisotropic Worley over 9 seeds, periodic over the world
// width. Returns (distance to the nearest joint in tiles, slab tone, joint
// normal y: negative when the neighbouring slab is above).
vec3 slabs(vec2 p, float W, float angular) {
  vec2 spacing = mix(vec2(2.5, 0.66), vec2(1.05, 0.86), angular);
  float xs = mix(0.27, 0.8, angular);
  float stagger = 1.0 - angular;
  float cellsX = floor(W / spacing.x + 0.5);
  spacing.x = W / cellsX;
  vec2 g = p / spacing;
  vec2 toMetric = vec2(spacing.x * xs, spacing.y);
  vec2 jitter = mix(vec2(0.55, 0.18), vec2(0.8, 0.7), angular);
  vec2 seeds[9];
  vec2 bestSeed = vec2(0.0);
  vec2 bestId = vec2(0.0);
  float best = 1e9;
  for (int j = -1; j <= 1; j++) {
    float cy = floor(g.y) + float(j);
    float shift = stagger * 0.5 * mod(cy, 2.0);
    for (int i = -1; i <= 1; i++) {
      float cx = floor(g.x - shift) + float(i);
      vec2 id = vec2(mod(cx, cellsX), cy);
      vec2 h = hash22(id) - 0.5;
      vec2 s = vec2(cx + shift + 0.5, cy + 0.5) + h * jitter;
      vec2 m = (s - g) * toMetric;
      seeds[(j + 1) * 3 + (i + 1)] = s;
      float d2 = dot(m, m);
      if (d2 < best) {
        best = d2;
        bestSeed = s;
        bestId = id;
      }
    }
  }
  vec2 a = bestSeed * toMetric;
  vec2 x = g * toMetric;
  float edge = 1e9;
  float normalY = 0.0;
  for (int k = 0; k < 9; k++) {
    vec2 b = seeds[k] * toMetric;
    vec2 ab = b - a;
    float len = length(ab);
    if (len < 1e-4) continue;
    vec2 nm = ab / len;
    // Metric distance to the bisector, converted to tiles.
    float e = dot((a + b) * 0.5 - x, nm);
    vec2 world = vec2(nm.x * xs, nm.y);
    float tiles = e / max(length(world), 1e-3);
    if (tiles < edge) {
      edge = tiles;
      normalY = nm.y;
    }
  }
  float course = mod(bestId.y, 2.0) * 2.0 - 1.0;
  float tone = (hash12(bestId + 17.0) - 0.5) * 0.2 + course * 0.1 * stagger;
  return vec3(edge, tone, normalY);
}

vec3 slabColour(vec3 base, vec3 crack, vec3 sl, float px) {
  vec3 col = base * (1.0 + sl.y);
  float bevel = 1.0 - smoothstep(0.0, 0.075, sl.x);
  col *= 1.0 + bevel * (sl.z < 0.0 ? 0.5 : -0.35) * abs(sl.z);
  float gap = 1.0 - smoothstep(0.02 - px, 0.02 + px, sl.x);
  return mix(col, crack, gap);
}

vec3 compensate(vec3 target, float darkness) {
  // The light overlay (lighting.ts) still draws rgba(5, 9, 13, darkness) on
  // top: pre-divide so the frame lands on the swatch value.
  return clamp((target - FOG * darkness) / (1.0 - darkness), 0.0, 1.0);
}

// Texture row of a virtual texel row (sky rows first): clamped to the
// virtual rows, then wrapped into the ring (a ring taller than the world
// leaves it as it is) and moved below the repeated row.
float ringY(float y) {
  return mod(clamp(y, 0.0, u_ring.z), u_ring.x) + u_ring.y;
}
// The A byte (code + 8 × natural + 16 × slot) of the cell at integer
// position c, read unfiltered with a tap snapped to a texel inside it.
float cellAt(vec2 c, float W, float K, vec2 inv) {
  vec2 texel = vec2((mod(c.x, W) + 0.5) * K + u_layout.x,
                    ringY((c.y + 0.5 + u_layout.y) * K));
  return floor(texture2D(u_field, (floor(texel) + 0.5) * inv).a * 255.0 + 0.5);
}
// Progress of the slots of four cells: in [0, 1], plus 2 for a dig slot.
vec4 slotProgress(vec4 slot) {
  vec4 v = vec4(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 r = slot - float(i) * 4.0;
    v += u_slots[i].x * (1.0 - step(0.5, abs(r)))
       + u_slots[i].y * (1.0 - step(0.5, abs(r - 1.0)))
       + u_slots[i].z * (1.0 - step(0.5, abs(r - 2.0)))
       + u_slots[i].w * (1.0 - step(0.5, abs(r - 3.0)));
  }
  return v;
}

void main() {
  float dpr = u_view.w;
  vec2 css = vec2(gl_FragCoord.x, u_layout.z - gl_FragCoord.y) / dpr;
  vec2 w = (css + u_view.xy) / u_view.z;
  float W = u_tex.z;
  float K = u_tex.w;
  if (w.y < -u_layout.y) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float wx = mod(w.x, W);
  vec2 inv = 1.0 / u_tex.xy;
  // Tap 1: the field at the pixel (bilinear).
  float vy = (w.y + u_layout.y) * K;
  vec2 t = vec2(wx * K + u_layout.x, ringY(vy));
  vec4 c0 = texture2D(u_field, t * inv);
  float S = c0.b;
  // G is the rock blurred at 0.42 tile: at 1 the pixel is deep in rock (no
  // air within about 1.2 tiles), at 0 deep in air. Both are most of a frame,
  // and each skips the work it cannot show.
  bool deepRock = c0.g > 0.998;
  bool deepAir = c0.g < 0.002;

  float px = 1.0 / (u_view.z * dpr);

  // Taps 6-9: the four cells around the pixel (dual grid), unfiltered: the
  // pixel's own cell and a smooth known weight, so the known region does not
  // end in square steps.
  vec2 base = floor(w - 0.5);
  vec2 fr = w - 0.5 - base;
  float p00 = cellAt(base, W, K, inv);
  float p10 = cellAt(base + vec2(1.0, 0.0), W, K, inv);
  float p01 = cellAt(base + vec2(0.0, 1.0), W, K, inv);
  float p11 = cellAt(base + vec2(1.0, 1.0), W, K, inv);
  vec2 st = step(0.5, fr);
  // Each cell's transition: a reveal slot raises the cell's known weight
  // from 0 to 1; a dig slot leaves it known.
  vec4 bytes = vec4(p00, p10, p01, p11);
  vec4 slots = floor(bytes / 16.0);
  vec4 cells = bytes - slots * 16.0;
  vec4 progress = slotProgress(slots);
  vec4 digging = step(1.5, progress);
  progress -= 2.0 * digging;
  vec4 knownCell = step(mod(cells, 8.0), vec4(4.5)) * mix(progress, vec4(1.0), digging);
  p00 = cells.x;
  p10 = cells.y;
  p01 = cells.z;
  p11 = cells.w;
  float own = mix(mix(p00, p10, st.x), mix(p01, p11, st.x), st.y);
  float code = mod(own, 8.0);
  // How much of its look before the change the pixel's own cell still shows.
  float before = 1.0 - mix(mix(progress.x, progress.y, st.x), mix(progress.z, progress.w, st.x), st.y);
  float knownOwn = mix(mix(knownCell.x, knownCell.y, st.x), mix(knownCell.z, knownCell.w, st.x), st.y);
  float kw = mix(mix(knownCell.x, knownCell.y, fr.x), mix(knownCell.z, knownCell.w, fr.x), fr.y);
  kw = smoothstep(0.2, 0.8, kw);
  // A floor the tracks can stand on: known air above known rock.
  float codeAbove = mod(mix(p00, p10, st.x), 8.0);
  float codeBelow = mod(mix(p01, p11, st.x), 8.0);
  float floorCell = (codeAbove < 0.5 && codeBelow > 0.5 && codeBelow < 4.5) ? 1.0 : 0.0;

  float grain = gnoise(vec2(wx * u_periods.y * 2.0 / W, w.y * 8.6), u_periods.y * 2.0);
  // The edge: its normal (from air into rock; world y grows downward), the
  // signed distance ds (positive in rock) and whether the rock side is
  // known. Deep in rock or air there is none: ds stays far from 0.
  vec2 n = vec2(0.0, 1.0);
  float ds = deepRock ? 1.0 : -1.0;
  float knownEdge = 0.0;
  float mottle = 0.0;
  if (!deepRock && !deepAir) {
    // Taps 2-5: the field's central differences (bilinear).
    float fxp = texture2D(u_field, (t + vec2(1.0, 0.0)) * inv).r;
    float fxm = texture2D(u_field, (t - vec2(1.0, 0.0)) * inv).r;
    float fyp = texture2D(u_field, vec2(t.x, ringY(vy + 1.0)) * inv).r;
    float fym = texture2D(u_field, vec2(t.x, ringY(vy - 1.0)) * inv).r;
    vec2 grad = vec2(fxp - fxm, fyp - fym) * 0.5 * K;
    float gLen = length(grad);
    if (gLen > 1e-3) n = grad / gLen;
    float d = (c0.r - 0.5) / max(gLen, 0.6);
    // Edge displacement on natural edges (gradient noise at 1.1, 2.5, 4.3
    // and 8.6 per tile); floors over known rock keep only a 0.01-tile jag.
    float calm = smoothstep(0.75, 0.95, n.y) * floorCell;
    float lo = gnoise(vec2(wx * u_periods.x / W, w.y * 1.1), u_periods.x);
    float mid = gnoise(vec2(wx * u_periods.w * 3.0 / W, w.y * 2.5), u_periods.w * 3.0);
    float hi = gnoise(vec2(wx * u_periods.y / W, w.y * 4.3), u_periods.y);
    float disp = (1.0 - S) * ((lo * 0.24 + mid * 0.09 + grain * 0.04) * (1.0 - calm) + hi * mix(0.09, 0.01, calm));
    ds = d + disp;
    // Floors sit on the collision line: the edge is the cell boundary plus
    // the jag, so 1-cell pillars keep a flat top.
    float dFloor = w.y - (base.y + 1.0) + hi * 0.01;
    float snap = floorCell * smoothstep(0.45, 0.8, n.y) * (1.0 - smoothstep(0.3, 0.45, abs(dFloor)));
    ds = mix(ds, dFloor, snap);
    // Tap 10: the cell 0.3 tile into the rock along the normal. Lip and
    // undercut only where the rock side is known (never at fog edges).
    float codeIn = mod(cellAt(floor(w + n * 0.3), W, K, inv), 8.0);
    knownEdge = (codeIn > 0.5 && codeIn < 4.5) ? 1.0 : 0.0;
  }
  // Mottle: the cave air's tone and the rust stripe under ceilings.
  if (!deepRock) mottle = vnoise(vec2(wx * u_periods.w / W, w.y * 2.2), u_periods.w);

  if (u_layout.w > 0.5) {
    // Debug: the visual air mask (white), for the boundary measures.
    float air = (ds < 0.0 && w.y >= 0.0) ? 1.0 : 0.0;
    gl_FragColor = vec4(vec3(air), 1.0);
    return;
  }

  // Bands: smooth two-row transitions.
  float bB = smoothstep(u_bands.x - 1.0, u_bands.x + 1.0, w.y);
  float bC = smoothstep(u_bands.y - 1.0, u_bands.y + 1.0, w.y);
  float bD = smoothstep(u_bands.z - 1.0, u_bands.z + 1.0, w.y);
  vec4 bw = vec4(1.0 - bB, bB - bC, bC - bD, bD);
  float darkU = dot(bw, u_darkU);
  float darkV = dot(bw, u_darkV);
  float rustBand = bw.z + 0.6 * bw.w;

  // Dug versus natural back wall, blended over the four cells' air so the
  // two meet without a square step.
  vec4 airCell = step(mod(cells, 8.0), vec4(0.5));
  vec4 dugCell = airCell * (1.0 - step(vec4(7.5), cells));
  vec4 weights = vec4((1.0 - fr.x) * (1.0 - fr.y), fr.x * (1.0 - fr.y),
                      (1.0 - fr.x) * fr.y, fr.x * fr.y);
  float airW = dot(weights, airCell);
  float dug = airW > 1e-3 ? smoothstep(0.2, 0.8, dot(weights, dugCell) / airW) : S;

  // Deep in settled air no rock shows: natural cave air needs no slabs.
  bool showsRock = !deepAir || before > 0.0;
  // Warped slate slabs, shared by rock and the recessed dug back wall.
  vec3 sl = vec3(1.0, 0.0, 0.0);
  float surfaceTone = 1.0;
  if (showsRock || dug > 0.0) {
    float warpP = u_periods.z;
    vec2 warp = vec2(vnoise(vec2(wx * warpP / W, w.y * 1.3), warpP),
                     vnoise(vec2(wx * warpP / W + 7.3, w.y * 1.3 + 3.1), warpP));
    sl = slabs(vec2(wx, w.y) + warp * 0.1, W, step(0.5, bC));
    // Grain and sparse speckles, fixed in world space.
    vec2 speckP = vec2(wx, w.y) * 11.0;
    vec2 speckCell = floor(speckP);
    float speck = hash12(vec2(mod(speckCell.x, W * 11.0), speckCell.y));
    float speckDot = 1.0 - smoothstep(0.18, 0.38, length(fract(speckP) - 0.5));
    surfaceTone = 1.0 + 0.1 * grain + speckDot * (speck > 0.91 ? 0.17 : speck < 0.08 ? -0.16 : 0.0);
  }

  // The unknown look inside a known cell (a fog edge, or a reveal in
  // progress) sits under that cell's lighter overlay.
  vec3 unknownRock = vec3(0.0);
  if (showsRock)
    unknownRock = compensate(slabColour(u_unknown, u_crack, sl, px) * surfaceTone,
                             mix(darkU, darkV, step(code, 4.5)));
  vec3 rock = unknownRock;
  if (showsRock && kw > 0.001) {
    vec3 col;
    if (code > 1.5 && code < 4.5) {
      // Hard rock, bedrock, plate: square blocks, 0.03-tile chamfer, cracks.
      vec2 f = fract(w);
      float fill = code > 2.5 ? (code > 3.5 ? 0.86 : 0.7) : 0.8;
      col = u_lit * fill;
      if (code > 3.5) col = mix(col, u_rust, 0.25);
      float top = min(f.y, f.x);
      float bottom = min(1.0 - f.y, 1.0 - f.x);
      float edgeD = min(top, bottom);
      float chamfer = 1.0 - smoothstep(0.03 - px, 0.03 + px, edgeD);
      col *= 1.0 + chamfer * (top < bottom ? 0.4 : -0.45);
      vec2 cell = floor(w);
      cell.x = mod(cell.x, W);
      for (int c = 0; c < 2; c++) {
        vec2 h = hash22(cell + float(c) * 11.0);
        vec2 q = 0.25 + 0.5 * h;
        float ang = h.x * 6.2832 + float(c) * 1.3;
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 r = f - q;
        float along = dot(r, dir);
        float across = abs(dot(r, vec2(-dir.y, dir.x)));
        float crack = (1.0 - smoothstep(0.012 - px, 0.012 + px, across)) *
                      (1.0 - smoothstep(0.22, 0.3, abs(along)));
        col = mix(col, u_crack, crack * (1.0 - chamfer));
      }
      if (code > 3.5) col *= 0.92 + 0.08 * step(0.5, fract(f.y * 4.0));
      col *= 1.0 + 0.04 * grain;
    } else {
      col = slabColour(u_lit, u_crack, sl, px) * surfaceTone;
    }
    // Rust seams on band-C ceilings: joints and a mottled stripe under the lip.
    float ceiling = smoothstep(0.35, 0.8, -n.y);
    float nearEdge = 1.0 - smoothstep(0.1, 0.35, ds);
    float joint = 1.0 - smoothstep(0.02, 0.06, sl.x);
    float stripe = smoothstep(0.0, 0.5, mottle + 0.15) * (1.0 - smoothstep(LIP + BEVEL, 0.22, ds));
    float rust = rustBand * ceiling * knownEdge * nearEdge * max(joint, stripe);
    col = mix(col, u_rust, clamp(rust, 0.0, 1.0) * 0.85);
    // Blocks are known by definition; slabs fade in over the known edge.
    float known = code > 1.5 && code < 4.5 ? knownOwn : kw;
    rock = mix(unknownRock, compensate(col, darkV), known);
  }
  // The solid look before a change, without the edge treatment.
  vec3 rockBefore = rock;

  // Lip, bevel shadow (rock side) and undercut (air side), from the distance.
  float hc = u_highContrast;
  float lipW = LIP * (1.0 + 0.6 * hc);
  float lipBand = 1.0 - smoothstep(lipW - px, lipW + px, ds);
  float ceilingN = smoothstep(0.35, 0.8, -n.y);
  float face = mix(0.84, 1.0, smoothstep(0.45, 0.85, n.y)) * (1.0 - ceilingN);
  vec3 lipCol = mix(u_lip, vec3(0.953, 0.965, 0.875), hc);
  vec3 lipFinal = compensate(mix(u_lit, lipCol, face), darkV);
  vec3 ceilFinal = compensate(u_crack * 0.7, darkV);
  rock = mix(rock, mix(lipFinal, ceilFinal, ceilingN), lipBand * knownEdge);
  float bevelBand = (1.0 - lipBand) * (1.0 - smoothstep(lipW + BEVEL - px, lipW + BEVEL + px, ds));
  rock *= 1.0 - 0.2 * bevelBand * knownEdge;

  // Air: natural cave air or the recessed dug back wall, then AO.
  vec3 caveAir = u_caveAir * (1.0 + 0.06 * mottle);
  vec3 recessed = mix(u_interior, slabColour(u_interior, u_interior * 0.8, sl, px), 0.5);
  vec3 air = mix(caveAir, recessed, dug);
  // Occlusion: soft, from the wide blur of the rock, gone by about 0.37
  // tile from a straight edge (G 0.19) and deeper in corners.
  air *= 1.0 - 0.6 * smoothstep(0.19, 0.5, c0.g) * (1.0 - S * 0.4);
  // Undercut: the 0.03-tile dark line in the air against a known edge.
  float undercutW = UNDERCUT * (1.0 + hc);
  float undercut = smoothstep(-undercutW - px, -undercutW + px, ds) * knownEdge;
  air = mix(air, u_crack * mix(0.45, 0.2, hc), undercut);
  air = compensate(air, darkV);

  float cover = smoothstep(-px * 0.75, px * 0.75, ds);
  vec3 col = mix(air, rock, cover);
  // Reveal cross-fade and dig easing: the cell's own transition mixes the
  // solid look it had back in. Below the surface only: sky never changes.
  col = mix(col, rockBefore, before * step(0.0, w.y));
  // Above the surface, air is sky: transparent, so the sky layers show.
  float alpha = w.y < 0.0 ? cover : 1.0;
  gl_FragColor = vec4(col * alpha, alpha);
}
`;
