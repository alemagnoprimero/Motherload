/**
 * T2 field shader (WebGL1, GLSL ES 1.00): one full-screen quad draws the
 * terrain from the field texture: the rock edge, lip, lip shade, ceiling
 * edge, undercut and occlusion; the rock as courses of slabs (strata) or of
 * angular blocks; hard rock as square cracked blocks; rust seams along the
 * joints above cave ceilings; cave air and the recessed dug back wall.
 *
 * Per-pixel budget (audit §7: about 12 taps and 9 Worley seeds):
 *   texture taps  10: the field at the pixel (1, bilinear); the four cells
 *                     around the pixel (4, each snapped to a texel centre so
 *                     it reads the A byte unfiltered); and, within about 1.2
 *                     tiles of an edge only, the field ±1 texel in x and y
 *                     (4, bilinear) and the cell 0.3 tile into the rock
 *                     along the edge normal (1).
 *   Worley seeds   0: the rock is courses with jointed slabs (the swatch
 *                     cards' recipe, scripts/swatch-cards.py), found with
 *                     three course tops and three joints per pixel, about
 *                     twenty hashes, not a nine-seed search done twice.
 *   noise          near edges only: gradient noise (1.1 and 4.3 per tile) and
 *                     an angular zig-zag (2 per tile) for the edge
 *                     displacement; one value noise for the cave air and
 *                     the rust gate.
 * Sky pixels above the field return before any tap. A pixel deep in rock
 * (no air within about 1.2 tiles) skips the edge work and a pixel deep in
 * settled cave air skips the rock.
 *
 * Geometry. Natural edges are the F = 0.5 iso-line of the blurred cell grid
 * plus the displacement (a zig-zag, so walls and ceilings are angular and
 * do not run along the grid), held within 0.28 tile of the cells' own
 * boundary. Sharp edges (hard rock, plate, bedrock, dug air, the surface)
 * and floors are the exact distance to the four cells around the pixel:
 * a floor under known air is flat on the collision line with a 0.01-tile
 * jag, its outer corners rounded by 0.08 tile, and no rock is drawn above
 * that line in the air cell over it.
 *
 * Requires fragment highp: the field coordinate reaches 776 texels and
 * mediump (fp16) would quantise it to half a texel; without highp the game
 * keeps RetainedTerrain (tier.ts).
 *
 * Motion (§9.3): each of the four cell taps carries its cell's transition
 * slot, and u_slots holds each slot's progress (transitions.ts), so the
 * reveal cross-fade and the dig easing cost no tap and no upload per frame.
 * A revealed cell's known weight rises with its slot; a cell in a
 * transition shows the solid look it had (the unknown rock, or the known
 * rock it was dug from) mixed out by the slot's progress.
 */
export const FIELD_TAPS = 10;
export const FIELD_WORLEY_SEEDS = 0;

/**
 * The edge and material constants, in tiles: the swatch cards' values
 * (scripts/swatch-cards.py), which a unit test holds the two against.
 */
export const FIELD_SHAPE = {
  gap: 0.024,
  bevel: 0.075,
  bevelBottom: 0.045,
  lip: 0.09,
  lipShade: 0.065,
  ceilingEdge: 0.05,
  undercut: 0.03,
  occlusion: 0.35,
} as const;

/**
 * Courses per material kind: pitch (tiles), height jitter (of the pitch),
 * joint pitch (tiles), joint slant (tiles per tile, about the course's
 * mid-height) and joint jitter (of the joint pitch). Strata are 0.70 to
 * 1.06 tiles tall in slabs 2.0 to 3.2 long; blocks 0.78 to 1.0 by 1.0 to
 * 1.6; rubble 0.62 to 0.84 by 0.75 to 1.2.
 */
export const FIELD_COURSES = {
  strata: { pitch: 0.88, jitter: 0.1, joint: 2.6, slant: 0.3, spread: 0.115 },
  blocks: {
    pitch: 0.89,
    jitter: 0.062,
    joint: 1.3,
    slant: 0.55,
    spread: 0.115,
  },
  rubble: {
    pitch: 0.73,
    jitter: 0.075,
    joint: 0.975,
    slant: 0.55,
    spread: 0.115,
  },
} as const;

export const FIELD_VERTEX = `
attribute vec2 a_position;
uniform vec2 u_resolution;
void main() {
  vec2 clip = a_position / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const course = (c: {
  pitch: number;
  jitter: number;
  joint: number;
  slant: number;
}) => `vec4(${c.pitch}, ${c.jitter}, ${c.joint}, ${c.slant})`;

export const FIELD_FRAGMENT = `
precision highp float;

uniform sampler2D u_field;
uniform vec4 u_tex;      // field width, height (texels); world width (tiles); texels per tile
uniform vec4 u_layout;   // pad texels; sky tiles above row 0; buffer height (device px); debug mode
uniform vec4 u_view;     // scroll x, y (CSS px); tile (CSS px); backing scale
uniform vec4 u_bands;    // first rows of bands B, C, D; world rows
uniform vec4 u_periods;  // lattice cells per world width: low noise, jag, rust gate, mottle
uniform vec4 u_course;   // lattice cells per world width: strata wave, strata ripple, block nodes, edge zig-zag
uniform vec4 u_kind;     // material per band A..D: 0 strata, 1 blocks, 2 rubble
uniform vec4 u_darkU;    // light-overlay darkness on unknown cells, bands A..D
uniform vec4 u_darkV;    // light-overlay darkness on visible cells, bands A..D
uniform vec3 u_unknown[4];   // the swatch roles, bands A..D
uniform vec3 u_lit[4];
uniform vec3 u_lip[4];
uniform vec3 u_crack[4];
uniform vec3 u_backWall[4];
uniform vec3 u_caveAir[4];
uniform vec3 u_rust[4];
uniform vec4 u_rustBand;   // how much rust each band's ceilings carry
uniform float u_highContrast;
uniform vec4 u_slots[4];   // progress of transition slots 0..15 (+2: a dig slot)
uniform vec4 u_ring;       // ring height (texels); rows above the ring; last virtual texel; unused

const vec3 FOG = vec3(5.0, 9.0, 13.0) / 255.0;
const float GAP = ${FIELD_SHAPE.gap / 2};
const float BEVEL = ${FIELD_SHAPE.bevel};
const float BEVEL_BOTTOM = ${FIELD_SHAPE.bevelBottom};
const float LIP = ${FIELD_SHAPE.lip};
const float LIP_SHADE = ${FIELD_SHAPE.lipShade};
const float CEIL_EDGE = ${FIELD_SHAPE.ceilingEdge};
const float UNDERCUT = ${FIELD_SHAPE.undercut};
// The visual edge stays this close to the cells' boundary (§9.2: 0.3 tile).
const float REACH = 0.28;
// Outer corners of floors: a 1-cell pillar keeps a flat top 0.84 tile wide.
const float CORNER = 0.08;

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
// Noise along x in [-1, 1], periodic over 'period' cells: smooth (strata
// waves) or piecewise linear (the angular tops of blocks).
float wave(float x, float period, float seed, float angular) {
  float i = floor(x);
  float f = x - i;
  float a = hash12(vec2(mod(i, period), seed));
  float b = hash12(vec2(mod(i + 1.0, period), seed));
  return mix(a, b, mix(f * f * (3.0 - 2.0 * f), f, angular)) * 2.0 - 1.0;
}

// A zig-zag in [-1, 1] along t, periodic over an even 'period': the lattice
// points alternate in sign with a magnitude of 0.5 to 1 and are joined by
// straight lines, so every stretch slopes by at least 1 per lattice cell and
// an edge displaced by it is angular and never runs along its axis.
float zigzag(float t, float period, float seed) {
  float i = floor(t);
  float a = (1.0 - 2.0 * mod(i, 2.0)) * (0.5 + 0.5 * hash12(vec2(mod(i, period), seed)));
  float b = (2.0 * mod(i, 2.0) - 1.0) * (0.5 + 0.5 * hash12(vec2(mod(i + 1.0, period), seed)));
  return mix(a, b, t - i);
}

// The top of course k at xn (x over the world width): its jittered row plus
// a wave (strata) or an angular polyline (blocks).
float courseTop(float k, float xn, vec4 par, float blocks) {
  float y = (k + par.y * (2.0 * hash12(vec2(k, 3.7)) - 1.0)) * par.x;
  if (blocks > 0.5) return y + 0.12 * wave(xn * u_course.z, u_course.z, k + 0.5, 1.0);
  return y + 0.07 * wave(xn * u_course.x, u_course.x, k + 0.5, 0.0)
           + 0.025 * wave(xn * u_course.y, u_course.y, k + 40.5, 0.0);
}

// A pixel of rock: gap is the distance to the nearest crack's centre line,
// tier the slab's tone (0 dark, 1 mid, 2 light), facet its facet's factor,
// light the top and side bevels' and shade the bottom bevel's ramp.
struct Rock {
  float gap;
  float tier;
  float facet;
  float light;
  float shade;
};

// Courses of slabs (kind 0), of angular blocks (1) or of rubble (2), periodic
// over the world width W. p is the world position in tiles.
Rock courses(vec2 p, float W, float kind, float px) {
  vec4 par = kind < 0.5 ? ${course(FIELD_COURSES.strata)}
           : kind < 1.5 ? ${course(FIELD_COURSES.blocks)}
                        : ${course(FIELD_COURSES.rubble)};
  float blocks = step(0.5, kind);
  float xn = p.x / W;
  // The course: the lattice row, or the one above or below when its top or
  // the next one's waves past the pixel.
  float k0 = floor(p.y / par.x);
  float b0 = courseTop(k0, xn, par, blocks);
  float b1 = courseTop(k0 + 1.0, xn, par, blocks);
  float up = step(p.y, b0);
  float down = (1.0 - up) * step(b1, p.y);
  float b2 = courseTop(k0 - 1.0 + 3.0 * (1.0 - up), xn, par, blocks);
  float k = k0 - up + down;
  float top = mix(mix(b0, b1, down), b2, up);
  float bottom = mix(mix(b1, b2, down), b0, up);
  // The slab: three joints around the pixel, each slanted and jittered; the
  // first is always to its left and the third to its right.
  float count = floor(W / par.z + 0.5);
  float pitch = W / count;
  float spread = ${FIELD_COURSES.strata.spread};
  float phase = hash12(vec2(k, 11.3));
  // Joints pivot at the course's mid-height, so a slant moves them least.
  float rise = p.y - (k + 0.5) * par.x;
  float u = p.x / pitch - phase;
  float j = floor(u) + floor(fract(u) + 0.5) - 1.0;
  vec3 at = vec3(0.0);
  vec3 along = vec3(0.0);
  vec3 norm = vec3(1.0);
  for (int i = 0; i < 3; i++) {
    float index = j + float(i);
    vec2 h = hash22(vec2(mod(index, count), k) + 0.37);
    float x = (index + phase + spread * (2.0 * h.x - 1.0)) * pitch;
    float slant = (2.0 * h.y - 1.0) * par.w;
    float e = p.x - x - slant * rise;
    float inv = inversesqrt(1.0 + slant * slant);
    if (i == 0) { at.x = x; along.x = e; norm.x = inv; }
    else if (i == 1) { at.y = x; along.y = e; norm.y = inv; }
    else { at.z = x; along.z = e; norm.z = inv; }
  }
  float second = step(0.0, along.y);
  float left = mod(j + second, count);
  float dLeft = mix(along.x * norm.x, along.y * norm.y, second);
  float dRight = mix(-along.y * norm.y, -along.z * norm.z, second);
  float centre = mix(at.x + at.y, at.y + at.z, second) * 0.5;
  vec2 id = vec2(left, k);
  vec3 h = vec3(hash12(id + 17.0), hash12(id + 31.0), hash12(id + 47.0));
  // Tone: blocks draw theirs; strata follow their course, one step off now
  // and then.
  float cycle = mod(k, 3.0);
  float strataTier = clamp((cycle < 0.5 ? 1.0 : cycle < 1.5 ? 2.0 : 0.0)
                           + step(0.84, h.x) - step(h.x, 0.16), 0.0, 2.0);
  float blockTier = step(0.28, h.x) + step(0.72, h.x);
  Rock rock;
  rock.tier = mix(strataTier, blockTier, blocks);
  // Three facet tones: two split by a sloped line through the slab's
  // centre, and a lighter top facet along its course's top (a quarter to a
  // third of its height; stronger on blocks).
  float split = (p.y - (k + 0.5) * par.x) - (h.y - 0.5) * mix(0.9, 2.0, blocks) * (p.x - centre);
  rock.facet = mix(mix(1.05, 1.03, blocks), mix(0.93, 0.95, blocks), smoothstep(-px, px, split));
  float dTop = p.y - top;
  float dBottom = bottom - p.y;
  float cap = mix(0.24, 0.36, h.z) * (bottom - top) - dTop;
  rock.facet = mix(rock.facet, mix(1.15, 1.22, blocks), smoothstep(-px, px, cap));
  // Cracks along the course's top and bottom and both joints, and the
  // top-lit bevel inside them: top +44 %, sides ±10 %, bottom −30 %.
  float dJoint = min(dLeft, dRight);
  rock.gap = min(min(dTop, dBottom), dJoint);
  float side = (dLeft < dRight ? 1.0 : -1.0) * clamp(1.0 - (dJoint - GAP) / BEVEL, 0.0, 1.0);
  rock.light = 1.0 + 0.44 * clamp(1.0 - (dTop - GAP) / BEVEL, 0.0, 1.0) + 0.10 * side;
  rock.shade = clamp(1.0 - (dBottom - GAP) / BEVEL_BOTTOM, 0.0, 1.0);
  return rock;
}

// A regolith pebble (the accent of the strata bands): in nine tiles of twenty,
// an uneven hexagon 0.2 to 0.3 tile across, turned and skewed by the tile's
// hash, with a dark rim and three top-lit tones. Returns its cover, its
// rim's cover and its tone.
vec3 pebble(vec2 p, float W, float px) {
  vec2 cell = floor(p);
  vec2 f = p - cell;
  cell.x = mod(cell.x, W);
  vec2 h = hash22(cell + 91.0);
  if (hash12(cell + 57.0) > 0.45) return vec3(0.0, 0.0, 1.0);
  vec2 r = vec2(0.10 + 0.05 * h.x, 0.07 + 0.03 * h.y);
  vec2 e = f - 0.25 - 0.5 * hash22(cell + 23.0);
  float turn = (h.x - 0.5) * 1.0;
  vec2 d = vec2(e.x * cos(turn) + e.y * sin(turn), e.y * cos(turn) - e.x * sin(turn)) / r;
  d.x += (h.y - 0.5) * 0.5 * d.y;
  float hex = max(abs(d.y) * (d.y < 0.0 ? 1.0 : 0.85 + 0.3 * h.y),
                  abs(d.x) * 0.866 + abs(d.y) * (0.35 + 0.3 * h.x));
  float sd = (1.0 - hex) * r.y;
  return vec3(smoothstep(-px, px, sd), smoothstep(-px, px, sd + 2.0 * GAP),
              e.y < -0.3 * r.y ? 1.32 : e.y > 0.4 * r.y ? 0.74 : 1.0);
}

// Rock in a base colour: its tone and facet, the bevels, cracks in 'dark',
// and the pebble (cover, rim, tone) over them at 1.25 of the base, the
// swatch cards' accent.
vec3 rockColour(vec3 base, vec3 dark, vec3 tones, Rock rock, vec3 stone, float px) {
  float tone = rock.tier < 0.5 ? tones.x : rock.tier < 1.5 ? tones.y : tones.z;
  vec3 col = base * tone * rock.facet * rock.light;
  col = max(col * (1.0 - 0.30 * rock.shade), dark * step(0.001, rock.shade));
  col = mix(dark, col, smoothstep(GAP - px, GAP + px, rock.gap));
  return mix(mix(col, dark, stone.y), base * 1.25 * stone.z, stone.x);
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

// The exact signed distance (positive in rock, at most 0.5) from q, the
// pixel's position from the corner the four cells share, to the solid cells
// among them (solid: upper left, upper right, lower left, lower right), and
// the normal from air into rock. A lone solid cell's corner is rounded.
vec3 cellDistance(vec2 q, vec4 solid, float own) {
  float count = dot(solid, vec4(1.0));
  if (count > 0.5 && count < 1.5) {
    vec2 s = vec2(solid.y + solid.w - solid.x - solid.z, solid.z + solid.w - solid.x - solid.y);
    vec2 u = CORNER - s * q;
    vec2 o = max(u, 0.0);
    float outside = length(o);
    float d = CORNER - (outside + min(max(u.x, u.y), 0.0));
    vec2 n = outside > 1e-4 ? s * o / outside
           : (s.x * q.x < s.y * q.y ? vec2(s.x, 0.0) : vec2(0.0, s.y));
    return vec3(clamp(d, -0.5, 0.5), n);
  }
  // The nearest cell of the other kind: each of the four is a quadrant.
  float best = 1e3;
  vec2 to = vec2(0.0);
  vec2 v;
  v = -max(q, 0.0);
  if (abs(solid.x - own) > 0.5 && dot(v, v) < best) { best = dot(v, v); to = v; }
  v = vec2(max(-q.x, 0.0), -max(q.y, 0.0));
  if (abs(solid.y - own) > 0.5 && dot(v, v) < best) { best = dot(v, v); to = v; }
  v = vec2(-max(q.x, 0.0), max(-q.y, 0.0));
  if (abs(solid.z - own) > 0.5 && dot(v, v) < best) { best = dot(v, v); to = v; }
  v = max(-q, 0.0);
  if (abs(solid.w - own) > 0.5 && dot(v, v) < best) { best = dot(v, v); to = v; }
  if (best > 1e2) return vec3(own > 0.5 ? 0.5 : -0.5, 0.0, 1.0);
  float len = sqrt(best);
  vec2 n = len > 1e-4 ? to / len : vec2(0.0, 1.0);
  return own > 0.5 ? vec3(min(len, 0.5), -n) : vec3(-min(len, 0.5), n);
}

// A swatch role at the pixel: the four bands' values by the band weights.
vec3 role(vec3 a, vec3 b, vec3 c, vec3 d, vec4 bw) {
  return a * bw.x + b * bw.y + c * bw.z + d * bw.w;
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
  float px = 1.0 / (u_view.z * dpr);
  float hc = u_highContrast;

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

  // Taps 2-5: the four cells around the pixel (dual grid), unfiltered: the
  // pixel's own cell and a smooth known weight, so the known region does not
  // end in square steps.
  vec2 base = floor(w - 0.5);
  vec2 fr = w - 0.5 - base;
  vec2 q = fr - 0.5;
  vec4 bytes = vec4(cellAt(base, W, K, inv),
                    cellAt(base + vec2(1.0, 0.0), W, K, inv),
                    cellAt(base + vec2(0.0, 1.0), W, K, inv),
                    cellAt(base + vec2(1.0, 1.0), W, K, inv));
  vec2 st = step(0.5, fr);
  // Each cell's transition: a reveal slot raises the cell's known weight
  // from 0 to 1; a dig slot leaves it known.
  vec4 slots = floor(bytes / 16.0);
  vec4 cells = bytes - slots * 16.0;
  vec4 codes = mod(cells, 8.0);
  vec4 progress = slotProgress(slots);
  vec4 digging = step(1.5, progress);
  progress -= 2.0 * digging;
  vec4 knownCell = step(codes, vec4(4.5)) * mix(progress, vec4(1.0), digging);
  vec4 pick = vec4((1.0 - st.x) * (1.0 - st.y), st.x * (1.0 - st.y),
                   (1.0 - st.x) * st.y, st.x * st.y);
  float code = dot(codes, pick);
  // How much of its look before the change the pixel's own cell still shows.
  float before = 1.0 - dot(progress, pick);
  float knownOwn = dot(knownCell, pick);
  float kw = mix(mix(knownCell.x, knownCell.y, fr.x), mix(knownCell.z, knownCell.w, fr.x), fr.y);
  kw = smoothstep(0.2, 0.8, kw);
  vec4 solid = step(vec4(0.5), codes);
  // A floor the tracks can stand on, in the pixel's column: known air above
  // known rock.
  float codeAbove = mix(codes.x, codes.y, st.x);
  float codeBelow = mix(codes.z, codes.w, st.x);
  float floorCell = (codeAbove < 0.5 && codeBelow > 0.5 && codeBelow < 4.5) ? 1.0 : 0.0;
  float hardOwn = step(1.5, code) * step(code, 4.5);
  // Dug versus natural back wall, blended over the four cells' air so the
  // two meet without a square step. The sky above row 0 counts as dug: the
  // surface line is sharp.
  vec4 airCell = 1.0 - solid;
  vec4 dugCell = airCell * (1.0 - step(vec4(7.5), cells));
  vec4 weights = vec4((1.0 - fr.x) * (1.0 - fr.y), fr.x * (1.0 - fr.y),
                      (1.0 - fr.x) * fr.y, fr.x * fr.y);
  float airW = dot(weights, airCell);
  float dug = airW > 1e-3 ? smoothstep(0.2, 0.8, dot(weights, dugCell) / airW) : S;

  // The edge: its normal (from air into rock; world y grows downward), the
  // signed distance ds (positive in rock) and whether the rock side is
  // known. Deep in rock or air there is none: ds stays far from 0.
  vec2 n = vec2(0.0, 1.0);
  float ds = deepRock ? 1.0 : -1.0;
  float knownEdge = 0.0;
  if (!deepRock && !deepAir) {
    // Taps 6-9: the field's central differences (bilinear).
    float fxp = texture2D(u_field, (t + vec2(1.0, 0.0)) * inv).r;
    float fxm = texture2D(u_field, (t - vec2(1.0, 0.0)) * inv).r;
    float fyp = texture2D(u_field, vec2(t.x, ringY(vy + 1.0)) * inv).r;
    float fym = texture2D(u_field, vec2(t.x, ringY(vy - 1.0)) * inv).r;
    vec2 grad = vec2(fxp - fxm, fyp - fym) * 0.5 * K;
    float gLen = length(grad);
    if (gLen > 1e-3) n = grad / gLen;
    float d = (c0.r - 0.5) / max(gLen, 0.6);
    // Tap 10: the cell 0.3 tile into the rock along the normal. Lip and
    // undercut only where the rock side is known (never at fog edges).
    float codeIn = mod(cellAt(floor(w + n * 0.3), W, K, inv), 8.0);
    knownEdge = (codeIn > 0.5 && codeIn < 4.5) ? 1.0 : 0.0;
    // Sharp edges are the cells' own: hard rock, plate and bedrock (the
    // pixel's own cell or the one behind the edge), dug air, and the
    // surface line. Soil beside a hard block keeps its natural edge.
    float sharp = max(max(hardOwn, step(1.5, codeIn) * step(codeIn, 4.5)), dug);
    // The natural edge: displaced by a slow gradient noise (1.1 per tile),
    // an angular zig-zag along the edge (2 per tile: along y on walls,
    // along x on ceilings; each stretch leans 19° to 34°, so the blocks of
    // a wall step in and out) and a little roughness (4.3 per tile), and
    // held within REACH of the cells' own boundary.
    float lo = gnoise(vec2(wx * u_periods.x / W, w.y * 1.1), u_periods.x);
    float hi = gnoise(vec2(wx * u_periods.y / W, w.y * 4.3), u_periods.y);
    // Walls facing left and right, and ceilings and floors, each have
    // their own zig-zag, so the two sides of a cave do not move together.
    float zig = n.x * n.x * zigzag(w.y * 2.0, 4096.0, 1.5 + 7.0 * step(0.0, n.x))
              + n.y * n.y * zigzag(wx * u_course.w / W, u_course.w, 2.5 + 7.0 * step(0.0, n.y));
    float disp = lo * 0.08 + zig * 0.17 + hi * 0.03;
    vec3 exact = cellDistance(q, solid, dot(solid, pick));
    ds = clamp(d + disp, exact.x - REACH, exact.x + REACH);
    // Floors, around the collision line: the rock below it is flat for a
    // third of a tile down (a 0.01-tile jag) while its sides keep their
    // displacement; the air cell over it holds no rock for a tenth of a
    // tile up, so a wall's foot never stands on the floor, and none at all
    // where the edge faces up, so the floor's own displacement never lifts
    // a sliver off it.
    float below = floorCell * (1.0 - smoothstep(0.26, 0.42, q.y)) * step(0.0, q.y);
    float over = floorCell * step(q.y, 0.0)
               * max(1.0 - smoothstep(0.06, 0.14, -q.y), smoothstep(0.3, 0.7, n.y));
    float level = exact.x + hi * 0.01 * step(0.0, q.y) + disp * exact.y * exact.y;
    float onFloor = mix(mix(ds, level, below), min(ds, exact.x), over);
    ds = mix(onFloor, exact.x, sharp);
    n = normalize(mix(n, exact.yz, max(sharp, max(below, over))) + vec2(0.0, 1e-5));
  }

  if (u_layout.w > 0.5) {
    // Debug: the visual air mask (white), for the boundary measures.
    float air = (ds < 0.0 && w.y >= 0.0) ? 1.0 : 0.0;
    gl_FragColor = vec4(vec3(air), 1.0);
    return;
  }

  // Bands: colours and darkness blend over two rows; the material's kind
  // switches on the row.
  float bB = smoothstep(u_bands.x - 1.0, u_bands.x + 1.0, w.y);
  float bC = smoothstep(u_bands.y - 1.0, u_bands.y + 1.0, w.y);
  float bD = smoothstep(u_bands.z - 1.0, u_bands.z + 1.0, w.y);
  vec4 bw = vec4(1.0 - bB, bB - bC, bC - bD, bD);
  float darkU = dot(bw, u_darkU);
  float darkV = dot(bw, u_darkV);
  float kind = mix(mix(mix(u_kind.x, u_kind.y, step(u_bands.x, w.y)), u_kind.z, step(u_bands.y, w.y)),
                   u_kind.w, step(u_bands.z, w.y));
  vec3 cUnknown = role(u_unknown[0], u_unknown[1], u_unknown[2], u_unknown[3], bw);
  vec3 cLit = role(u_lit[0], u_lit[1], u_lit[2], u_lit[3], bw);
  vec3 cCrack = role(u_crack[0], u_crack[1], u_crack[2], u_crack[3], bw);
  vec3 cRust = role(u_rust[0], u_rust[1], u_rust[2], u_rust[3], bw);
  float rustBand = dot(bw, u_rustBand);

  // The rock's courses, shared by the rock and the recessed dug back wall.
  // Deep in settled air no rock shows, and natural cave air needs none.
  bool showsRock = !deepAir || before > 0.0;
  Rock rock;
  rock.gap = 1.0;
  rock.tier = 1.0;
  rock.facet = 1.0;
  rock.light = 1.0;
  rock.shade = 0.0;
  vec3 stone = vec3(0.0, 0.0, 1.0);
  if (showsRock || dug > 0.0) rock = courses(vec2(wx, w.y), W, kind, px);
  if (showsRock && kind < 0.5) stone = pebble(vec2(wx, w.y), W, px);
  vec3 tonesUnknown = kind < 0.5 ? vec3(0.86, 1.0, 1.24) : vec3(0.88, 1.0, 1.12);

  // The unknown look inside a known cell (a fog edge, or a reveal in
  // progress) sits under that cell's lighter overlay.
  vec3 unknownRock = vec3(0.0);
  vec3 col = vec3(0.0);
  if (showsRock) {
    unknownRock = compensate(rockColour(cUnknown, cCrack, tonesUnknown, rock, stone, px),
                             mix(darkU, darkV, step(code, 4.5)));
    col = unknownRock;
  }
  if (showsRock && kw > 0.001) {
    vec3 known;
    if (code > 1.5 && code < 4.5) {
      // Hard rock, bedrock, plate: square blocks on the grid at L* −8, a
      // 0.03-tile chamfer and two cracks each.
      vec2 f = fract(w);
      float fill = code > 2.5 ? (code > 3.5 ? 0.86 : 0.7) : 0.79;
      vec2 cell = floor(w);
      cell.x = mod(cell.x, W);
      // Each block has one of three tones and two facets split by a
      // diagonal through it, as the slabs have.
      vec2 hb = hash22(cell + 5.0);
      float blockTone = hb.x < 0.3 ? 0.9 : hb.x < 0.7 ? 1.0 : 1.1;
      float diagonal = (f.y - 0.5) - (hb.y - 0.5) * 1.6 * (f.x - 0.5);
      known = cLit * fill * blockTone * mix(1.05, 0.94, smoothstep(-px, px, diagonal));
      if (code > 3.5) known = mix(known, u_rust[2], 0.25);
      float top = min(f.y, f.x);
      float bottom = min(1.0 - f.y, 1.0 - f.x);
      float chamfer = 1.0 - smoothstep(0.03 - px, 0.03 + px, min(top, bottom));
      known *= 1.0 + chamfer * (top < bottom ? 0.4 : -0.45);
      for (int c = 0; c < 2; c++) {
        vec2 h = hash22(cell + float(c) * 11.0);
        vec2 at = 0.25 + 0.5 * h;
        float ang = h.x * 6.2832 + float(c) * 1.3;
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 r = f - at;
        float across = abs(dot(r, vec2(-dir.y, dir.x)));
        float crack = (1.0 - smoothstep(0.012 - px, 0.012 + px, across)) *
                      (1.0 - smoothstep(0.22, 0.3, abs(dot(r, dir))));
        known = mix(known, cCrack, crack * (1.0 - chamfer));
      }
      if (code > 3.5) known *= 0.92 + 0.08 * step(0.5, fract(f.y * 4.0));
    } else {
      known = rockColour(cLit, cUnknown, vec3(0.86, 1.0, 1.18), rock, stone, px);
      // Rust seams (the A1 rider): along the joints of the rock within half
      // a tile above a natural cave ceiling, where the gate lets them.
      // G is 0.5 on an edge and about 0.88 half a tile into the rock.
      float gate = step(-0.25, vnoise(vec2(wx * u_periods.z / W, 3.5), u_periods.z));
      float above = rustBand * gate * knownEdge * (1.0 - S)
                  * smoothstep(0.35, 0.8, -n.y) * (1.0 - smoothstep(0.84, 0.9, c0.g));
      float seam = 1.0 - smoothstep(0.022 - px, 0.022 + px, rock.gap);
      float core = 1.0 - smoothstep(0.007 - px, 0.007 + px, rock.gap);
      known = mix(known, mix(cRust, cRust * 1.3, core), above * seam);
    }
    // Blocks are known by definition; slabs fade in over the known edge.
    col = mix(unknownRock, compensate(known, darkV), code > 1.5 && code < 4.5 ? knownOwn : kw);
  }
  // The solid look before a change, without the edge treatment.
  vec3 rockBefore = col;

  // Rock side of a known edge. Floors and walls: the lip, then a darker
  // step inside it. Ceilings: a dark edge, rusted where the seams reach it.
  float ceiling = smoothstep(0.35, 0.8, -n.y);
  float lipW = LIP * (1.0 + 0.6 * hc);
  float inLip = 1.0 - smoothstep(lipW - px, lipW + px, ds);
  float inShade = (1.0 - inLip) * (1.0 - smoothstep(lipW + LIP_SHADE - px, lipW + LIP_SHADE + px, ds));
  float inCeil = 1.0 - smoothstep(CEIL_EDGE - px, CEIL_EDGE + px, ds);
  vec3 cLip = mix(role(u_lip[0], u_lip[1], u_lip[2], u_lip[3], bw), vec3(0.953, 0.965, 0.875), hc);
  vec3 edged = col * (1.0 - 0.2 * inShade * (1.0 - ceiling));
  edged = mix(edged, compensate(cLip, darkV), inLip * (1.0 - ceiling));
  float rim = rustBand * (1.0 - S) * (1.0 - smoothstep(0.028 - px, 0.028 + px, ds))
            * step(-0.25, vnoise(vec2(wx * u_periods.z / W, 3.5), u_periods.z));
  vec3 ceilEdge = mix(col * 0.7, compensate(cRust * 1.15, darkV), rim);
  edged = mix(edged, ceilEdge, inCeil * ceiling);
  col = mix(col, edged, knownEdge);

  // Air: natural cave air or the recessed dug back wall (the unknown
  // rock's courses at 45 % of their contrast), then occlusion and undercut.
  vec3 air = role(u_caveAir[0], u_caveAir[1], u_caveAir[2], u_caveAir[3], bw);
  if (!deepRock) {
    air *= 1.0 + 0.04 * vnoise(vec2(wx * u_periods.w / W, w.y * 2.2), u_periods.w);
    if (dug > 0.0) {
      float tone = rock.tier < 0.5 ? tonesUnknown.x : rock.tier < 1.5 ? tonesUnknown.y : tonesUnknown.z;
      vec3 recessed = role(u_backWall[0], u_backWall[1], u_backWall[2], u_backWall[3], bw)
                    * (1.0 + (tone * rock.facet - 1.0) * 0.45);
      recessed *= mix(0.82, 1.0, smoothstep(GAP - px, GAP + px, rock.gap));
      air = mix(air, recessed, dug);
    }
    // Occlusion: 32 % at the edge, gone by about 0.37 tile from a straight
    // one (G 0.19) and deeper in corners.
    float near = clamp((c0.g - 0.19) / 0.31, 0.0, 1.0);
    air *= 1.0 - 0.32 * near * near;
    // Undercut: a 0.03-tile line against a known edge, 15 luma down (5 on
    // floors, where the lip already draws the line).
    float undercutW = UNDERCUT * (1.0 + hc);
    float under = smoothstep(-undercutW - px, -undercutW + px, ds) * knownEdge;
    air -= under * mix(15.0, 5.0, smoothstep(0.45, 0.85, n.y)) * (1.0 + hc) / 255.0;
    air = compensate(max(air, 0.0), darkV);
  }

  float cover = smoothstep(-px * 0.75, px * 0.75, ds);
  col = mix(air, col, cover);
  // Reveal cross-fade and dig easing: the cell's own transition mixes the
  // solid look it had back in. Below the surface only: sky never changes.
  col = mix(col, rockBefore, before * step(0.0, w.y));
  // Above the surface, air is sky: transparent, so the sky layers show.
  float alpha = w.y < 0.0 ? cover : 1.0;
  gl_FragColor = vec4(col * alpha, alpha);
}
`;
