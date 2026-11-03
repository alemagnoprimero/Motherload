'use strict';
/* Deep Frontier technique prototype.
 * Render-only. Reads the real W01 world (assets/fresh-w01.json) and the game's own
 * atlas (assets/w01-atlas-3x-0.*). Imports no game code: the few game rules it needs
 * (discovery ray test, camera framing, tile size) are re-implemented and cited.
 * Everything marked PROTOTYPE ART is a placeholder drawn here, not production art.
 */
(async function main() {
  const Q = new URLSearchParams(location.search);
  const SCENE = Q.get('scene') || 'shaft';
  const VW = +(Q.get('vw') || 1440), VH = +(Q.get('vh') || 900), DPR = +(Q.get('dpr') || 2);
  const CAM_MODE = Q.get('camera') || 'frame';   // 'game' = scene.ts rule, 'frame' = cave framing
  const DEBUG = Q.get('debug') || '';            // 'regions' | 'air' | 'albedo' | 'light'
  const PERF = +(Q.get('perf') || 0);
  const TAG = Q.get('tag') !== '0';
  const DW = Math.round(VW * DPR), DH = Math.round(VH * DPR);
  const T0 = performance.now();
  const timing = {};
  const mark = (k, t) => { timing[k] = +(performance.now() - t).toFixed(1); };

  // ------------------------------------------------------------------ parameters
  const P = {
    K: 16,                                       // terrain field samples per tile
    sigma: { nat: 0.30, dug: 0.085, sky: 0.12 }, // corner rounding (tiles, Gaussian sigma)
    lo: { nat: 0.24, dug: 0.0, sky: 0.04 },      // low-frequency wobble (field units, ~1.1/tile)
    hi: { nat: 0.08, dug: 0.18, sky: 0.10 },     // high-frequency jag (field units, ~4.3/tile)
    freqLo: 1.1, freqHi: 4.3,
    floorCalm: 0.7,          // wobble reduction on floor faces (rig contact stays near collision)
    lip: 0.085,              // bright lip width on the solid side (tiles)
    bevelShadow: 0.07,       // darker step just inside the lip (tiles)
    undercut: 0.03,          // dark line on the air side (tiles)
    aoSigma: 0.42, aoGain: 0.58,
    rockSigma: 0.2, rockNoise: 0.24, rockThr: 0.58,
    gap: 0.017, bevel: 0.075, // slab outline and slab bevel widths (tiles)
    lightScale: +(Q.get('ls') || 4), // light map = device resolution / 4 (ls=8 for the cheaper variant)
    rays: 720, pen: 0.30,    // visibility polygon rays, light penetration into wall faces (tiles)
  };
  // W01 bands from world-content.ts (rows and hue family kept; values re-keyed darker).
  const BANDS = [
    { id: 'A', to: 10, soil: '#6b747b', rock: '#566470', wall: '#26404b', lip: '#e2eaee', fog: 0.50, mem: 0.68, vis: 0.78,
      mat: { sx: 2.5, sy: 0.66, ax: 0.27, jit: 0.85, stagger: 1, alt: 0.10 } },
    { id: 'B', to: 29, soil: '#5e727f', rock: '#4e5e6b', wall: '#233c4c', lip: '#dbe7ee', fog: 0.46, mem: 0.64, vis: 0.74,
      mat: { sx: 2.5, sy: 0.60, ax: 0.30, jit: 0.85, stagger: 1, alt: 0.09 } },
    { id: 'C', to: 47, soil: '#6c655f', rock: '#545c67', wall: '#2b4650', lip: '#ece3d8', fog: 0.58, mem: 0.70, vis: 0.80,
      mat: { sx: 1.05, sy: 0.86, ax: 0.80, jit: 0.9, stagger: 0, alt: 0.0 } },
    { id: 'D', to: 59, soil: '#625e74', rock: '#4b556b', wall: '#263446', lip: '#e2def0', fog: 0.53, mem: 0.66, vis: 0.76,
      mat: { sx: 0.82, sy: 0.70, ax: 0.90, jit: 0.9, stagger: 0, alt: 0.0 } },
  ];
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  for (const b of BANDS) for (const k of ['soil', 'rock', 'wall', 'lip']) b[k + 'C'] = rgb(b[k]);
  const bandOf = (row) => (row <= 10 ? 0 : row <= 29 ? 1 : row <= 47 ? 2 : 3);

  // ------------------------------------------------------------------ utilities
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  function hash3(x, y, s) {
    let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((s | 0) + 0x3c6ef372, 0x85ebca6b)) | 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = hash3(xi, yi, s), b = hash3(xi + 1, yi, s), c = hash3(xi, yi + 1, s), d = hash3(xi + 1, yi + 1, s);
    return 2 * (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy) - 1;
  }
  const fbm = (x, y, s) => 0.62 * vnoise(x, y, s) + 0.28 * vnoise(x * 2.17 + 5.3, y * 2.17 + 1.7, s + 11) + 0.10 * vnoise(x * 4.7 + 2.1, y * 4.7 + 8.9, s + 23);

  // ------------------------------------------------------------------ data
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const [save, atlasJson, atlas, wreckImg, beaconImg] = await Promise.all([
    fetch('assets/fresh-w01.json').then((r) => r.json()),
    fetch('assets/w01-atlas-3x-0.json').then((r) => r.json()),
    loadImg('assets/w01-atlas-3x-0.png'),
    loadImg('assets/proto-wreck.svg'),
    loadImg('assets/proto-beacon.svg'),
  ]);
  const world = save.state.worlds.W01;
  const W = world.width, R = world.rows;
  const wrapX = (x) => ((x % W) + W) % W;

  // Port of model.ts tile()/isKnown()/refreshVisibility() (model.ts:552-626).
  class Sim {
    constructor(w) {
      this.tiles = Uint8Array.from(w.tiles); this.pristine = Uint8Array.from(w.tiles);
      this.disc = Uint8Array.from(w.discovered); this.dug = new Uint8Array(W * R);
      this.packages = w.packages.map((p) => ({ ...p })); this.visible = new Set();
    }
    idx(x, y) { return Math.floor(y) * W + wrapX(Math.floor(x)); }
    tile(x, y) { if (y < 0) return 0; if (y >= R) return 3; return this.tiles[this.idx(x, y)]; }
    clear(x, y) {
      const i = this.idx(x, y);
      if (this.tiles[i]) { this.tiles[i] = 0; this.dug[i] = 1; }
      for (const p of this.packages) if (p.status === 'deposit' && this.idx(p.x, p.y) === i) p.status = 'collected';
    }
    revealDisk(cx, cy, r) { // capture-v2.mjs reveal()
      for (let y = Math.max(0, Math.floor(cy) - r); y <= Math.min(R - 1, Math.floor(cy) + r); y++)
        for (let dx = -r; dx <= r; dx++)
          if (dx * dx + (y - Math.floor(cy)) ** 2 <= r * r) this.disc[y * W + wrapX(Math.floor(cx) + dx)] = 1;
    }
    refresh(x, y) {
      this.visible.clear();
      const face = (tx, ty, fx, fy) => {
        const dx = tx + fx - x, dy = ty + fy - y, steps = Math.ceil(Math.hypot(dx, dy) * 16);
        let pX = Math.floor(x), pY = Math.floor(y);
        for (let s = 1; s < steps; s++) {
          const px = x + (dx * s) / steps, py = y + (dy * s) / steps, c = Math.floor(px), r = Math.floor(py);
          if (c !== pX && r !== pY && (this.tile(c, pY) || this.tile(pX, r))) return false;
          if (c === tx && r === ty) return true;
          if (this.tile(px, py)) return false;
          pX = c; pY = r;
        }
        return true;
      };
      for (let row = Math.max(0, Math.floor(y - 4.5)); row <= Math.min(R - 1, Math.ceil(y + 4.5)); row++)
        for (let col = Math.floor(x - 4.5); col <= x + 4.5; col++) {
          if (Math.hypot(col + 0.5 - x, row + 0.5 - y) > 4.5) continue;
          if ([[0.5, 0.5], [0.5, 0.002], [0.5, 0.998], [0.002, 0.5], [0.998, 0.5]].some(([a, b]) => face(col, row, a, b))) {
            const i = row * W + wrapX(col); this.visible.add(i); this.disc[i] = 1;
          }
        }
    }
    known(x, y) { return y < 0 || (y < R && this.disc[this.idx(x, y)] === 1); }
  }

  // ------------------------------------------------------------------ scene setup (real data)
  const sim = new Sim(world);
  const site4 = world.sites.find((s) => s.id === 'W01-SITE-4');
  let rig;
  if (SCENE === 'surface') {
    rig = { x: 20.5, y: -0.36, facing: 1, drill: 'idle' };
    sim.refresh(rig.x, rig.y);
  } else if (SCENE === 'shaft') {
    // Native dive: column 20 cut row by row from spawn, discovery refreshed as the rig descends.
    for (let row = 0; row <= 5; row++) {
      sim.clear(20.5, row);
      for (let v = row - 0.36; v <= row + 0.64 + 1e-6; v += 0.25) sim.refresh(20.5, v);
    }
    rig = { x: 20.5, y: 5.64, facing: 1, drill: 'down' };
    sim.refresh(rig.x, rig.y);
  } else {
    // Same fixture as capture-v2.mjs teleport(fx, site.x - 2, site.y + 1, { r: 6 }).
    const x = site4.x - 2, y = site4.y + 1;
    for (let yy = 0; yy < Math.floor(y); yy++) { sim.clear(x, yy); sim.revealDisk(x, yy, 1); }
    for (let dx = -1; dx <= 1; dx++) sim.clear(x + dx, Math.floor(y) - 1);
    sim.revealDisk(x, y - 1, 6);
    let row = Math.floor(y); while (row < R && !sim.tile(x, row)) row++;
    rig = { x, y: row - 0.36, facing: 1, drill: 'idle' };
    for (let v = Math.floor(y) - 0.36; v <= rig.y + 1e-6; v += 0.25) sim.refresh(x, v);
    sim.refresh(rig.x, rig.y);
  }

  // Hidden-information test: randomise every undiscovered tile and move hidden deposits.
  // A correct renderer produces the same pixels, because unknown cells are drawn position-only.
  if (Q.get('scramble')) {
    for (let i = 0; i < W * R; i++) if (!sim.disc[i]) { const h = hash3(i, 5, 999); sim.tiles[i] = sim.pristine[i] = h < 0.45 ? 0 : h < 0.7 ? 2 : 1; }
    for (const p of sim.packages) if (p.status === 'deposit' && !sim.disc[sim.idx(p.x, p.y)]) { p.x = (hash3(p.x * 7 | 0, p.y * 7 | 0, 1) * W) | 0; p.y = (hash3(p.x | 0, p.y * 3 | 0, 2) * R) | 0; if (sim.disc[sim.idx(p.x, p.y)]) p.status = 'gone'; }
  }
  // ------------------------------------------------------------------ camera (scene.ts:787-805, 1057-1072; layout.ts:3-7)
  const baseTile = VH <= 420 || VW < 600 ? 44 : Math.max(48, VW / 22);
  const depthM = Math.round((rig.y + 0.36) * 10);
  const zoom = rig.y < 0.2 ? 0.88 : depthM > 120 ? 1.05 : 1;
  const tile = +(Q.get('tilecss') || 0) || baseTile * zoom;  // tilecss: optional framing override
  const safe = VW < 760 ? (VH <= 420 ? { top: 92, bottom: 48 } : { top: 142, bottom: 70 }) : { top: 72, bottom: 48 };
  const usable = VH - safe.top - safe.bottom;
  const dockX = 5.5;
  const delta = (a, b) => { let d = (b - a) % W; if (d > W / 2) d -= W; if (d < -W / 2) d += W; return d; };
  let camX = rig.x * tile - VW / 2;
  if (rig.y < 0.2 && VW >= 900) { const home = delta(rig.x, dockX); if (Math.abs(home) < (VW / tile) * 0.85) camX += home * tile * 0.4; }
  let camY = rig.y < 0.2 ? -VH * 0.78 : rig.y * tile - (safe.top + usable * 0.43);
  let framing = 'game';
  if (CAM_MODE === 'frame' && rig.y >= 0.2) {
    // Prototype camera rule: inside a large known natural cave, frame the room instead of the rig.
    const seen = new Set(), q = [[Math.floor(rig.x), Math.floor(rig.y)]];
    let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
    while (q.length) {
      const [x, y] = q.pop(), k = y * W + wrapX(x);
      if (seen.has(k) || y < 0 || y >= R) continue;
      if (sim.tile(x, y) !== 0 || sim.pristine[k] !== 0 || !sim.known(x, y)) continue;
      seen.add(k); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    if (maxY - minY + 1 >= 5) {
      const midY = (minY + maxY + 1) / 2, midX = (minX + maxX + 1) / 2;
      let ty = midY * tile - (safe.top + usable * 0.5);
      const ry = rig.y * tile - ty;
      if (ry > VH - safe.bottom - tile * 1.2) ty += ry - (VH - safe.bottom - tile * 1.2);
      if (ry < safe.top + tile * 1.2) ty -= safe.top + tile * 1.2 - ry;
      camY = ty;
      camX = lerp(camX, midX * tile - VW / 2, 0.35);
      framing = `cave rows ${minY}-${maxY}, cols ${minX}-${maxX}`;
    }
  }
  const TD = tile * DPR;                                   // device px per tile
  const X = (wx) => (wx * tile - camX) * DPR, Y = (wy) => (wy * tile - camY) * DPR, S = (t) => t * TD;

  // ------------------------------------------------------------------ cell region
  const gx0 = Math.floor(camX / tile) - 3, gx1 = Math.ceil((camX + VW) / tile) + 3;
  const gy0 = Math.floor(camY / tile) - 3, gy1 = Math.ceil((camY + VH) / tile) + 3;
  const NCX = gx1 - gx0, NCY = gy1 - gy0;
  const cellSol = new Uint8Array(NCX * NCY), cellKnown = new Uint8Array(NCX * NCY), cellNat = new Uint8Array(NCX * NCY),
    cellDug = new Uint8Array(NCX * NCY), cellSky = new Uint8Array(NCX * NCY), cellRock = new Uint8Array(NCX * NCY),
    cellFloor = new Uint8Array(NCX * NCY), cellLip = new Uint8Array(NCX * NCY), cellVis = new Uint8Array(NCX * NCY),
    cellPkg = new Uint8Array(NCX * NCY);
  const pkgCells = new Map();
  for (const p of sim.packages) if (p.status === 'deposit') {
    const k = sim.idx(p.x, p.y); if (!pkgCells.has(k)) pkgCells.set(k, []); pkgCells.get(k).push(p);
  }
  for (let cj = 0; cj < NCY; cj++) for (let ci = 0; ci < NCX; ci++) {
    const x = gx0 + ci, y = gy0 + cj, c = cj * NCX + ci;
    if (y < 0) { cellSky[c] = 1; cellKnown[c] = 1; continue; }
    if (y >= R) { cellSol[c] = 1; cellKnown[c] = 1; cellLip[c] = 1; continue; }
    const k = y * W + wrapX(x), known = sim.disc[k] === 1, t = sim.tiles[k];
    cellKnown[c] = known ? 1 : 0;
    cellSol[c] = !known || t !== 0 ? 1 : 0;           // unknown is drawn solid: nothing hidden leaks
    cellNat[c] = known && t === 0 && sim.pristine[k] === 0 ? 1 : 0;
    cellDug[c] = known && t === 0 && sim.pristine[k] !== 0 ? 1 : 0;
    cellRock[c] = known && t === 2 ? 1 : 0;
    cellLip[c] = (known && t !== 0) || (y === 0 && (t !== 0 || !known)) ? 1 : 0;
    cellVis[c] = sim.visible.has(k) ? 1 : 0;
    cellPkg[c] = known && pkgCells.has(k) ? 1 : 0;
  }
  for (let cj = 1; cj < NCY; cj++) for (let ci = 0; ci < NCX; ci++) {
    const c = cj * NCX + ci, up = c - NCX;
    if (cellSol[c] && (cellNat[up] || cellDug[up] || cellSky[up])) cellFloor[c] = 1;
  }

  // ------------------------------------------------------------------ fields
  let t = performance.now();
  const K = P.K, NX = NCX * K, NY = NCY * K;
  const box = (cells) => { const o = new Float32Array(NX * NY); for (let j = 0; j < NY; j++) { const cj = (j / K) | 0; for (let i = 0; i < NX; i++) o[j * NX + i] = cells[cj * NCX + ((i / K) | 0)]; } return o; };
  function blur(src, sig) {
    const r = Math.max(1, Math.ceil(sig * 3)), ker = new Float32Array(2 * r + 1); let s = 0;
    for (let i = -r; i <= r; i++) { ker[i + r] = Math.exp(-(i * i) / (2 * sig * sig)); s += ker[i + r]; }
    for (let i = 0; i < ker.length; i++) ker[i] /= s;
    const tmp = new Float32Array(NX * NY), out = new Float32Array(NX * NY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { let a = 0; for (let k = -r; k <= r; k++) a += src[j * NX + clamp(i + k, 0, NX - 1)] * ker[k + r]; tmp[j * NX + i] = a; }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { let a = 0; for (let k = -r; k <= r; k++) a += tmp[clamp(j + k, 0, NY - 1) * NX + i] * ker[k + r]; out[j * NX + i] = a; }
    return out;
  }
  const S0 = box(cellSol);
  const Fn = blur(S0, P.sigma.nat * K), Fd = blur(S0, P.sigma.dug * K), Fs = blur(S0, P.sigma.sky * K);
  const wn = blur(box(cellNat), 0.7 * K), wd = blur(box(cellDug), 0.7 * K), ws = blur(box(cellSky), 0.7 * K);
  const fl = blur(box(cellFloor), 0.3 * K), AO = blur(S0, P.aoSigma * K), RB = blur(box(cellRock), P.rockSigma * K);
  const KSf = blur(box(cellLip), 0.12 * K), FARf = blur(S0, 1.1 * K);
  const NF = 13, FD = new Float32Array(NX * NY * NF);
  const F_ = 0, GX_ = 1, GY_ = 2, A_ = 3, R_ = 4, RX_ = 5, RY_ = 6, KS_ = 7, NAT_ = 8, WX_ = 9, WY_ = 10, CR_ = 11, FAR_ = 12;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const s = j * NX + i, o = s * NF, wx = gx0 + (i + 0.5) / K, wy = gy0 + (j + 0.5) / K;
    let a = wn[s], b = wd[s], c = ws[s], tot = a + b + c;
    if (tot < 1e-4) { a = 0; b = 1; c = 0; tot = 1; }
    a /= tot; b /= tot; c /= tot;
    const lo = (a * P.lo.nat + b * P.lo.dug + c * P.lo.sky) * (1 - P.floorCalm * fl[s]);
    const hi = a * P.hi.nat + b * P.hi.dug + c * P.hi.sky;
    FD[o + F_] = a * Fn[s] + b * Fd[s] + c * Fs[s] + lo * fbm(wx * P.freqLo, wy * P.freqLo, 101) + hi * vnoise(wx * P.freqHi, wy * P.freqHi, 202);
    FD[o + A_] = AO[s];
    FD[o + R_] = RB[s] * (0.8 + 0.4 * vnoise(wx * 3.3, wy * 3.3, 309)) + P.rockNoise * fbm(wx * 2.9, wy * 2.9, 303);
    FD[o + KS_] = KSf[s];
    FD[o + NAT_] = a; FD[o + FAR_] = FARf[s];
    FD[o + WX_] = 0.10 * fbm(wx * 1.3, wy * 1.3, 404) + 0.022 * vnoise(wx * 6.5, wy * 6.5, 405);
    FD[o + WY_] = 0.06 * fbm(wx * 1.3 + 9.1, wy * 1.3, 406) + 0.02 * vnoise(wx * 6.5 + 3, wy * 6.5, 407);
    FD[o + CR_] = vnoise(wx * 1.5, wy * 2.4, 505) + (fbm(wx * 0.6, wy * 0.6, 506) < 0.32 ? 9 : 0); // >1 = no crack here
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const o = (j * NX + i) * NF, ox = NF, oy = NX * NF;
    const iL = i > 0 ? -ox : 0, iR = i < NX - 1 ? ox : 0, jU = j > 0 ? -oy : 0, jD = j < NY - 1 ? oy : 0;
    const sx = K / ((iR - iL) / ox || 1), sy = K / ((jD - jU) / oy || 1);
    FD[o + GX_] = (FD[o + iR + F_] - FD[o + iL + F_]) * sx; FD[o + GY_] = (FD[o + jD + F_] - FD[o + jU + F_]) * sy;
    FD[o + RX_] = (FD[o + iR + R_] - FD[o + iL + R_]) * sx; FD[o + RY_] = (FD[o + jD + R_] - FD[o + jU + R_]) * sy;
  }
  function sample(f, wx, wy) {
    const u = clamp((wx - gx0) * K - 0.5, 0, NX - 1.001), v = clamp((wy - gy0) * K - 0.5, 0, NY - 1.001);
    const i = u | 0, j = v | 0, fu = u - i, fv = v - j, o = (j * NX + i) * NF;
    return (FD[o + f] * (1 - fu) + FD[o + NF + f] * fu) * (1 - fv) + (FD[o + NX * NF + f] * (1 - fu) + FD[o + NX * NF + NF + f] * fu) * fv;
  }
  const inField = (wx, wy) => wx > gx0 + 0.1 && wx < gx1 - 0.1 && wy > gy0 + 0.1 && wy < gy1 - 0.1;
  const solidAt = (wx, wy) => !inField(wx, wy) || sample(F_, wx, wy) > 0.5;
  mark('fields', t);

  // ------------------------------------------------------------------ slab material (anisotropic Worley, world space)
  function makeSeeds(m, seed) {
    const nx = Math.max(1, Math.round(W / m.sx)), sx = W / nx, sy = m.sy;
    const ry0 = Math.floor((gy0 - 2) / sy) - 2, ny = Math.ceil((gy1 + 2) / sy) + 2 - ry0;
    const SX = new Float32Array(nx * ny), SY = new Float32Array(nx * ny), ST = new Float32Array(nx * ny);
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
      const k = r * nx + c, gy = r + ry0;
      SX[k] = sx * (0.5 + (hash3(c, gy, seed) - 0.5) * m.jit);
      SY[k] = sy * (0.5 + (hash3(c, gy, seed + 1) - 0.5) * m.jit * 0.8);
      ST[k] = 1 + (hash3(c, gy, seed + 2) - 0.5) * 0.24 + (m.alt ? (gy & 1 ? m.alt : -m.alt) : 0);
    }
    return { nx, sx, sy, ax: m.ax, stagger: m.stagger, ry0, ny, SX, SY, ST };
  }
  const SEEDS = BANDS.map((b, i) => makeSeeds(b.mat, 1000 + i * 17));
  const ROCKS = makeSeeds({ sx: 0.4, sy: 0.4, ax: 1, jit: 0.9, stagger: 0, alt: 0 }, 2000);
  const BACKS = makeSeeds({ sx: 1.6, sy: 2.2, ax: 1, jit: 0.9, stagger: 0, alt: 0 }, 3000);
  const SL = new Float64Array(4); // tone, edge distance (tiles), edge normal x, y
  function slab(s, x, y) {
    const gy = Math.floor(y / s.sy);
    let d1 = 1e9, d2 = 1e9, ax1 = 0, ay1 = 0, ax2 = 0, ay2 = 0, t1 = 1;
    for (let ry = gy - 1; ry <= gy + 1; ry++) {
      const r = ry - s.ry0; if (r < 0 || r >= s.ny) continue;
      const off = s.stagger && ry & 1 ? 0.5 * s.sx : 0, gx = Math.floor((x - off) / s.sx);
      for (let rx = gx - 1; rx <= gx + 1; rx++) {
        const k = r * s.nx + (((rx % s.nx) + s.nx) % s.nx);
        const qx = (rx * s.sx + off + s.SX[k] - x) * s.ax, qy = ry * s.sy + s.SY[k] - y, d = qx * qx + qy * qy;
        if (d < d1) { d2 = d1; ax2 = ax1; ay2 = ay1; d1 = d; ax1 = qx; ay1 = qy; t1 = s.ST[k]; }
        else if (d < d2) { d2 = d; ax2 = qx; ay2 = qy; }
      }
    }
    let nx = ax2 - ax1, ny = ay2 - ay1; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const dq = ((ax1 + ax2) * 0.5) * nx + ((ay1 + ay2) * 0.5) * ny;
    const rx = s.ax * nx, ry = ny, rl = Math.hypot(rx, ry) || 1;
    SL[0] = t1; SL[1] = dq / rl; SL[2] = rx / rl; SL[3] = ry / rl;
  }

  // ------------------------------------------------------------------ albedo canvas
  const albedo = document.createElement('canvas'); albedo.width = DW; albedo.height = DH;
  const actx = albedo.getContext('2d');
  t = performance.now();
  const img = actx.createImageData(DW, DH), px = img.data;
  const regions = DEBUG ? new Uint8Array(DW * DH) : null;
  const visAir = new Uint8Array(DW * DH);  // visual air mask (for the collision-disagreement metric)
  const LS0 = P.lightScale, LW0 = Math.ceil(DW / LS0), rimQ = new Float32Array(LW0 * Math.ceil(DH / LS0));
  const lipPx = P.lip * TD, ucPx = P.undercut * TD, bsPx = P.bevelShadow * TD;
  let o00 = 0, o10 = 0, o01 = 0, o11 = 0, w00 = 0, w10 = 0, w01 = 0, w11 = 0;
  const B = (f) => FD[o00 + f] * w00 + FD[o10 + f] * w10 + FD[o01 + f] * w01 + FD[o11 + f] * w11;
  for (let py = 0; py < DH; py++) {
    const wy = ((py + 0.5) / DPR + camY) / tile;
    const v = clamp((wy - gy0) * K - 0.5, 0, NY - 1.001), j = v | 0, fv = v - j;
    for (let pxi = 0; pxi < DW; pxi++) {
      const wx = ((pxi + 0.5) / DPR + camX) / tile;
      const u = clamp((wx - gx0) * K - 0.5, 0, NX - 1.001), i = u | 0, fu = u - i;
      o00 = (j * NX + i) * NF; o10 = o00 + NF; o01 = o00 + NX * NF; o11 = o01 + NF;
      w00 = (1 - fu) * (1 - fv); w10 = fu * (1 - fv); w01 = (1 - fu) * fv; w11 = fu * fv;
      const F = B(F_), gxv = B(GX_), gyv = B(GY_), g = Math.hypot(gxv, gyv) || 1e-6;
      const dP = ((F - 0.5) / g) * TD;                 // signed distance to the visual wall, device px (+ solid)
      const nOx = -gxv / g, up = gyv / g;              // outward normal x; up = 1 on floors
      const solidA = clamp(0.5 + dP / 1.25, 0, 1);
      const wxw = wx + B(WX_), wyw = wy + B(WY_);
      const bi = wy < 0 ? 0 : bandOf(Math.floor(wy + B(WY_) * 5));
      const band = BANDS[bi];
      const hp = hash3(pxi, py, 77);
      let r = 0, gg = 0, bb = 0;
      let tone = 1, edge = 1, enx = 0, eny = 0, matDone = false;
      // ---- solid
      if (solidA > 0) {
        slab(SEEDS[bi], wxw, wyw); tone = SL[0]; edge = SL[1]; enx = SL[2]; eny = SL[3]; matDone = true;
        let sh = tone * (1 + 0.06 * vnoise(wx * 0.35, wy * 0.6, 88));
        if (edge < P.gap) sh *= 0.40 + 0.6 * (edge / P.gap) * (edge / P.gap);
        else if (edge < P.bevel) { const k = 1 - (edge - P.gap) / (P.bevel - P.gap); sh *= 1 + k * (eny < 0 ? 0.44 * -eny : 0.30 * -eny) + k * 0.10 * -enx; }
        const cr = B(CR_);
        if (cr < 1) { const a = Math.abs(cr); if (a < 0.016) sh *= 0.64; else if (cr > 0 && a < 0.034) sh *= 1.08; }
        sh *= 1 + (hp - 0.5) * 0.08;
        if (hp < 0.004) sh *= 1.32; else if (hp > 0.996) sh *= 0.7;
        const C = band.soilC; r = C[0] * sh; gg = C[1] * sh; bb = C[2] * sh;
        // hard-rock inclusion (known rock cells only)
        const Rv = B(R_);
        if (Rv > P.rockThr - 0.25) {
          const rgx = B(RX_), rgy = B(RY_), rg = Math.hypot(rgx, rgy) || 1e-6, dR = (Rv - P.rockThr) / rg;
          const m = clamp(0.5 + (dR * TD) / 1.2, 0, 1);
          if (m > 0) {
            slab(ROCKS, wxw * 1.1, wyw * 1.1);
            let rs = 0.92 + (SL[0] - 1) * 1.1;
            if (SL[1] < 0.012) rs *= 0.62; else if (SL[1] < 0.05) rs *= 1 + 0.25 * -SL[3] * (1 - SL[1] / 0.05);
            const upR = rgy / rg;
            if (dR < 0.02) rs *= 0.38;
            else if (dR < 0.085) { const k = 1 - (dR - 0.02) / 0.065; rs *= 1 + k * (upR > 0 ? 0.55 * upR : 0.4 * upR) + k * 0.15 * Math.abs(rgx / rg); }
            const RC = band.rockC;
            r = lerp(r, RC[0] * rs, m); gg = lerp(gg, RC[1] * rs, m); bb = lerp(bb, RC[2] * rs, m);
          }
        }
        // bevelled lip, lit from above; ceilings get a dark edge instead
        if (dP >= -1 && dP < lipPx + bsPx) {
          const ks = clamp(B(KS_) * 1.6 - 0.3, 0, 1);
          const face = clamp(0.62 + 0.38 * Math.max(0, up) + 0.22 * Math.abs(nOx) - 0.9 * Math.max(0, -up), -0.35, 1);
          if (dP < lipPx) {
            const k = (1 - smooth(lipPx * 0.6, lipPx * 0.95, dP)) * ks;
            if (face > 0) { const L = band.lipC, a = k * face; r = lerp(r, L[0], a); gg = lerp(gg, L[1], a); bb = lerp(bb, L[2], a); const qi = ((py / LS0) | 0) * LW0 + ((pxi / LS0) | 0); if (a > rimQ[qi]) rimQ[qi] = a; }
            else { const a = 1 + k * face * 1.2; r *= a; gg *= a; bb *= a; }
          } else {
            const k = (1 - smooth(lipPx, lipPx + bsPx, dP)) * ks * Math.max(0, face) * 0.22;
            r *= 1 - k; gg *= 1 - k; bb *= 1 - k;
          }
          if (bi >= 2 && up < 0.3 && dP < lipPx * 2.6) {
            const rn = vnoise(wx * 2.2, wy * 3.0, 707), k = smooth(-0.1, 0.35, rn) * (1 - smooth(lipPx * 1.4, lipPx * 2.6, dP)) * ks * (0.35 + 0.65 * smooth(0.25, 0.6, -up)) * (bi === 2 ? 0.85 : 0.5);
            r = lerp(r, 184 * (0.8 + 0.4 * hp), k); gg = lerp(gg, 92 * (0.8 + 0.4 * hp), k); bb = lerp(bb, 40, k);
          }
        }
      }
      // ---- air
      let ar = 0, ag = 0, ab = 0, aa = 1;
      if (solidA < 1) {
        if (wy < 0.02 && cellSky[(clamp(Math.floor(wy) - gy0, 0, NCY - 1)) * NCX + clamp(Math.floor(wx) - gx0, 0, NCX - 1)]) {
          aa = 0; // sky shows through (drawn behind)
        } else {
          const nat = smooth(0.3, 0.7, B(NAT_));
          if (nat < 1) { // dug: recessed, darkened continuation of the same strata
            if (!matDone) { slab(SEEDS[bi], wxw, wyw); tone = SL[0]; edge = SL[1]; }
            let sh = 0.5 + (tone - 1) * 0.15; if (edge < P.gap * 1.3) sh *= 0.82;
            sh *= 1 + (hp - 0.5) * 0.05;
            const C = band.soilC; ar = C[0] * sh * 0.92; ag = C[1] * sh * 0.97; ab = C[2] * sh * 1.05;
          }
          if (nat > 0) { // natural: cool back wall with distant rock masses
            // layered distant-rock silhouettes that hug the cave walls (no outlines)
            const far = B(FAR_);
            const m1 = smooth(0, 0.035, far * 1.25 + 0.30 * fbm(wx * 0.8, wy * 0.32, 611) - 0.34);
            const m2 = smooth(0, 0.03, far * 1.25 + 0.24 * fbm(wx * 1.3, wy * 0.55, 622) - 0.53);
            const rim1 = smooth(0, 0.035, far * 1.25 + 0.30 * fbm(wx * 0.8, (wy + 0.06) * 0.32, 611) - 0.34) - m1;
            let sh = (1.04 + 0.14 * (0.5 - far) + 0.05 * vnoise(wx * 0.5, wy * 0.5, 99)) * (1 - 0.30 * m1) * (1 - 0.30 * m2) + 0.16 * Math.max(0, rim1);
            sh *= 1 + (hp - 0.5) * 0.04;
            const C = band.wallC;
            ar = lerp(ar, C[0] * sh, nat); ag = lerp(ag, C[1] * sh, nat); ab = lerp(ab, C[2] * sh, nat);
          }
          const ao = smooth(0.10, 0.62, B(A_)) * P.aoGain;
          ar *= 1 - ao; ag *= 1 - ao; ab *= 1 - ao * 0.9;
          if (dP < 0 && -dP < ucPx) {
            const k = (1 - -dP / ucPx) * 0.6 * (1 - 0.7 * Math.max(0, up)) * clamp(B(KS_) * 1.6 - 0.3, 0, 1);
            ar *= 1 - k; ag *= 1 - k; ab *= 1 - k;
          }
        }
      }
      const q = (py * DW + pxi) * 4;
      if (aa === 0) { // composite over transparent sky
        px[q] = r; px[q + 1] = gg; px[q + 2] = bb; px[q + 3] = 255 * solidA;
      } else {
        px[q] = lerp(ar, r, solidA); px[q + 1] = lerp(ag, gg, solidA); px[q + 2] = lerp(ab, bb, solidA); px[q + 3] = 255;
      }
      if (solidA < 0.5) visAir[py * DW + pxi] = 1;
      if (regions) {
        const ci = clamp(Math.floor(wx) - gx0, 0, NCX - 1), cj = clamp(Math.floor(wy) - gy0, 0, NCY - 1), c = cj * NCX + ci;
        regions[py * DW + pxi] = wy < 0 && solidA < 0.5 ? 3 : solidA < 0.5 ? 2 : cellKnown[c] ? 1 : 0;
      }
    }
  }
  actx.putImageData(img, 0, 0);
  mark('terrain-pixel-pass', t);

  // ------------------------------------------------------------------ sky (surface only)
  t = performance.now();
  const surfY = Y(0);
  if (surfY > 0) {
    const sky = document.createElement('canvas'); sky.width = DW; sky.height = DH;
    const sc = sky.getContext('2d'), skyH = Math.min(DH, surfY);
    const gr = sc.createLinearGradient(0, 0, 0, skyH);
    gr.addColorStop(0, '#132530'); gr.addColorStop(0.45, '#1f3644'); gr.addColorStop(0.8, '#2e4655'); gr.addColorStop(1, '#3a5262');
    sc.fillStyle = gr; sc.fillRect(0, 0, DW, skyH + 4);
    for (let i = 0; i < Math.round(DW * skyH * 0.000016); i++) { // stars
      const sx = hash3(i, 1, 9) * DW, sy = Math.pow(hash3(i, 2, 9), 1.4) * skyH * 0.8, a = 0.25 + 0.7 * hash3(i, 3, 9) * (1 - sy / skyH);
      const rr = (0.5 + hash3(i, 4, 9) * 0.9) * DPR;
      sc.fillStyle = `rgba(${hash3(i, 5, 9) < 0.3 ? '190,215,255' : '235,240,245'},${a.toFixed(2)})`;
      sc.beginPath(); sc.arc(sx, sy, rr, 0, Math.PI * 2); sc.fill();
    }
    // PROTOTYPE ART: planet, placed by the game's own rule (scene.ts:1144-1149).
    const skyCss = skyH / DPR, bodySize = Math.min(tile * 4.4, VW * 0.38, skyCss * 0.7), margin = bodySize / 2 + 10;
    const span = Math.max(1, VW - margin * 2), bx = (margin + (((span * 0.72 - camX * 0.035) % span) + span) % span) * DPR, by = skyCss * 0.42 * DPR, br = bodySize / 2 * DPR;
    sc.save();
    const halo = sc.createRadialGradient(bx, by, br * 0.9, bx, by, br * 1.5);
    halo.addColorStop(0, 'rgba(240,170,90,0.16)'); halo.addColorStop(1, 'rgba(240,170,90,0)');
    sc.fillStyle = halo; sc.beginPath(); sc.arc(bx, by, br * 1.5, 0, Math.PI * 2); sc.fill();
    sc.beginPath(); sc.arc(bx, by, br, 0, Math.PI * 2); sc.clip();
    const disc = sc.createRadialGradient(bx + br * 0.35, by - br * 0.35, br * 0.1, bx, by, br * 1.05);
    disc.addColorStop(0, '#41596b'); disc.addColorStop(0.6, '#2d4253'); disc.addColorStop(1, '#1a2733');
    sc.fillStyle = disc; sc.fillRect(bx - br, by - br, br * 2, br * 2);
    sc.strokeStyle = 'rgba(120,150,165,0.35)'; sc.lineWidth = br * 0.07;
    for (const k of [-0.05, 0.22]) { sc.beginPath(); sc.ellipse(bx, by + br * k, br * 1.1, br * 0.22, -0.12, 0.05 * Math.PI, 0.95 * Math.PI); sc.stroke(); }
    sc.globalCompositeOperation = 'source-over';
    const cres = sc.createLinearGradient(bx + br * 0.2, by - br * 0.6, bx + br, by + br * 0.2);
    cres.addColorStop(0, '#f6c27a'); cres.addColorStop(0.5, '#e29444'); cres.addColorStop(1, '#a85f24');
    sc.fillStyle = cres; sc.beginPath(); sc.arc(bx, by, br, 0, Math.PI * 2); sc.arc(bx - br * 0.10, by + br * 0.075, br * 0.985, 0, Math.PI * 2, true); sc.fill('evenodd');
    sc.restore();
    // PROTOTYPE ART: three faceted ridge layers with atmospheric perspective (parallax 0.2/0.35/0.6).
    const ridge = (par, hmax, spacing, base, lit, dark, seed, haze) => {
      const off = camX * DPR * par, spc = spacing * TD;
      const k0 = Math.floor((off - spc * 2) / spc), k1 = Math.ceil((off + DW + spc * 2) / spc);
      const pts = [];
      for (let k = k0; k <= k1; k++) {
        const x = k * spc + (hash3(k, seed, 1) - 0.5) * spc * 0.5 - off;
        pts.push([x, surfY - hmax * (0.45 + 0.55 * hash3(k, seed, 2))]);
        pts.push([x + spc * (0.42 + 0.16 * hash3(k, seed, 3)), surfY - hmax * (0.12 + 0.28 * hash3(k, seed, 4))]);
      }
      sc.fillStyle = base; sc.beginPath(); sc.moveTo(pts[0][0], surfY + 40);
      for (const p of pts) sc.lineTo(p[0], p[1]);
      sc.lineTo(pts[pts.length - 1][0], surfY + 40); sc.closePath(); sc.fill();
      for (let n = 0; n + 2 < pts.length; n += 2) {
        const [vx, vy] = pts[n + 1], [px2, py2] = pts[n], foot = px2 + (vx - px2) * 0.25;
        sc.fillStyle = lit; sc.beginPath(); sc.moveTo(px2, py2); sc.lineTo(n ? pts[n - 1][0] : px2 - 200, n ? pts[n - 1][1] : surfY); sc.lineTo(foot - (vx - px2) * 0.6, surfY + 40); sc.lineTo(foot, surfY + 40); sc.closePath(); sc.fill();
        sc.fillStyle = dark; sc.beginPath(); sc.moveTo(px2, py2); sc.lineTo(vx, vy); sc.lineTo(vx + (vx - px2) * 0.1, surfY + 40); sc.lineTo(foot + (vx - px2) * 0.3, surfY + 40); sc.closePath(); sc.fill();
      }
      if (haze) {
        const hz = sc.createLinearGradient(0, surfY - hmax, 0, surfY);
        hz.addColorStop(0, 'rgba(60,84,99,0)'); hz.addColorStop(1, haze);
        sc.fillStyle = hz; sc.fillRect(0, surfY - hmax, DW, hmax + 40);
      }
    };
    ridge(0.2, DH * 0.30, 3.4, '#364d5c', '#41596a', '#2f4452', 11, 'rgba(62,86,101,0.55)');
    ridge(0.35, DH * 0.19, 2.5, '#2a3e4c', '#33495a', '#243645', 23, 'rgba(50,72,86,0.4)');
    ridge(0.6, DH * 0.10, 1.7, '#203240', '#283b4a', '#1b2b37', 37, null);
    actx.globalCompositeOperation = 'destination-over'; actx.drawImage(sky, 0, 0); actx.globalCompositeOperation = 'source-over';
  }
  mark('sky', t);

  // ------------------------------------------------------------------ atlas helpers
  function drawFrame(ctx, name, cx, cy, w, h, originY = 0.5, flip = false) {
    const f = atlasJson.frames[name]; if (!f) return;
    const sx = w / f.sourceSize.w, sy = h / f.sourceSize.h;
    ctx.save(); ctx.translate(cx, cy - h * originY + h * 0.5); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(atlas, f.frame.x, f.frame.y, f.frame.w, f.frame.h, -w / 2 + f.spriteSourceSize.x * sx, -h / 2 + f.spriteSourceSize.y * sy, f.frame.w * sx, f.frame.h * sy);
    ctx.restore();
  }
  const shadeHex = (c, k) => `rgb(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0})`;

  // ------------------------------------------------------------------ props: placement on the visual floor
  function visualFloor(x, y0, maxDown = 4) { // first solid sample below an air point
    let y = y0; if (solidAt(x, y)) return null;
    for (; y < y0 + maxDown; y += 1 / 48) if (solidAt(x, y)) return y;
    return null;
  }
  const props = [], emitters = [], lights = [];
  const exclusion = [];
  exclusion.push([rig.x - 0.8, rig.y - 0.7, rig.x + 0.8, rig.y + 0.5]);
  if (SCENE === 'cavern') {
    const hw = 4.6, hh = hw * 176 / 480, hx0 = site4.x - 0.55;
    const fl2 = [0.15, 0.35, 0.55, 0.75, 0.9].map((f) => visualFloor(hx0 + hw * f, site4.y)).filter((v) => v != null).sort((a, b) => a - b);
    const floorY = fl2[Math.floor(fl2.length / 2)] ?? site4.y + 2;
    props.push({ kind: 'wreck', x: hx0, y: floorY + 0.06 - hh * (150 / 176), w: hw, h: hh });
    exclusion.push([hx0, floorY - hh, hx0 + hw, floorY + 0.2]);
    let bxPos = null;
    const okAt = (x) => { const f = visualFloor(x, site4.y - 1, 5); if (f == null || !sim.known(x, f + 0.2) || !sim.known(x, f - 1)) return null; for (let k = 0.2; k < 2.1; k += 0.2) if (solidAt(x, f - k) || solidAt(x - 0.35, f - k) || solidAt(x + 0.35, f - k)) return null; return f; };
    for (let x = hx0 + hw + 0.5; x < hx0 + hw + 2.6 && bxPos == null; x += 0.25) { const f = okAt(x); if (f != null) bxPos = [x, f]; }
    for (let x = rig.x - 1.6; x > rig.x - 4.5 && bxPos == null; x -= 0.25) { const f = okAt(x); if (f != null) bxPos = [x, f]; }
    if (bxPos) {
      const bw = 0.95, bh = bw * 232 / 112;
      props.push({ kind: 'beacon', x: bxPos[0] - bw / 2, y: bxPos[1] + 0.03 - bh * (222 / 232), w: bw, h: bh });
      exclusion.push([bxPos[0] - 0.6, bxPos[1] - bh, bxPos[0] + 0.6, bxPos[1] + 0.2]);
      const dy = bxPos[1] + 0.03 - bh * (222 / 232) + bh * (34 / 232);
      emitters.push({ x: bxPos[0], y: dy, r: 1.0, I: 0.42, col: [70, 220, 255] }, { x: bxPos[0], y: dy, r: 0.32, I: 0.9, col: [150, 245, 255] });
      emitters.push({ x: bxPos[0], y: bxPos[1] - 0.05, r: 0.9, I: 0.22, col: [255, 170, 80] });
      lights.push({ x: bxPos[0], y: dy, range: 2.1, I: 0.42, col: [0.45, 0.85, 1.0], occl: true });
      lights.push({ x: bxPos[0], y: bxPos[1] - 0.45, range: 1.5, I: 0.32, col: [1.0, 0.72, 0.42], occl: true });
      props.beacon = { x: bxPos[0], y: dy };
    }
  }
  const lampPosts = [], crates = [], rocks = [];
  if (SCENE === 'surface') {
    for (const x of [dockX - 2.7, dockX + 3.1, 24.7]) {
      lampPosts.push(x);
      emitters.push({ x: x + 0.02, y: -1.56, r: 1.15, I: 0.42, col: [255, 178, 92] }, { x: x + 0.02, y: -1.56, r: 0.2, I: 0.95, col: [255, 230, 170] });
      emitters.push({ x, y: -0.02, r: 1.3, I: 0.14, col: [255, 160, 80], flat: 0.25 });
      lights.push({ x: x + 0.02, y: -1.5, range: 2.8, I: 0.5, col: [1.0, 0.72, 0.42], occl: true });
    }
    crates.push([dockX + 4.0, 0.72, 0.56], [dockX + 4.78, 0.62, 0.5], [dockX + 4.35, 0.5, 0.42, 0.56]);
    for (let i = 0; i < 16; i++) {
      const x = 1.5 + hash3(i, 7, 41) * 27; if (Math.abs(x - dockX) < 2.3 || Math.abs(x - rig.x) < 1 || lampPosts.some((l) => Math.abs(l - x) < 0.5) || (x > dockX + 3.6 && x < dockX + 6.8)) continue;
      rocks.push([x, 0.12 + hash3(i, 8, 41) * 0.3, hash3(i, 9, 41)]);
    }
    emitters.push({ x: dockX + 6.15, y: -0.32, r: 0.45, I: 0.3, col: [90, 230, 200] });
  }
  // rig lamp (headlamp cone + soft pool); lamp sits at the cabin front
  const lamp = { x: rig.x + 0.40 * rig.facing, y: rig.y - 0.13 };
  const coneAng = (rig.facing > 0 ? 0 : Math.PI) + rig.facing * (14 * Math.PI) / 180;
  lights.push({ x: lamp.x, y: lamp.y, range: 4.3, I: 1.15, col: [1.0, 0.80, 0.55], occl: true, cone: { a: coneAng, outer: (24 * Math.PI) / 180, inner: (9 * Math.PI) / 180 }, haze: 0.34, rig: true });
  lights.push({ x: rig.x, y: rig.y - 0.12, range: 2.3, I: 0.6, col: [1.0, 0.80, 0.55], occl: true, haze: 0.15 });
  emitters.push({ x: lamp.x, y: lamp.y, r: 0.26, I: 0.85, col: [255, 225, 165] });

  // ------------------------------------------------------------------ decorations (PROTOTYPE ART), known natural boundaries only
  t = performance.now();
  const deco = { stal: [], drip: [], peb: [], boul: [], crys: [] };
  const knownSolidCell = (ci, cj) => ci >= 0 && cj >= 0 && ci < NCX && cj < NCY && cellSol[cj * NCX + ci] && cellKnown[cj * NCX + ci];
  const nearPkg = (ci, cj) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const x = ci + a, y = cj + b; if (x >= 0 && y >= 0 && x < NCX && y < NCY && cellPkg[y * NCX + x]) return true; } return false; };
  const blocked = (x, y) => exclusion.some(([a, b, c, d]) => x > a && x < c && y > b && y < d);
  const march = (x, y, dx, dy) => { for (let s = 0; s < 1.4; s += 1 / 64) if (solidAt(x + dx * s, y + dy * s)) return [x + dx * s, y + dy * s]; return null; };
  for (let cj = 1; cj < NCY - 1; cj++) for (let ci = 1; ci < NCX - 1; ci++) {
    const c = cj * NCX + ci; if (!cellNat[c]) continue;
    const wxC = gx0 + ci + 0.5, wyC = gy0 + cj + 0.5, bi = bandOf(gy0 + cj), gxC = gx0 + ci, gyC = gy0 + cj;
    if (cellPkg[c]) continue;
    if (knownSolidCell(ci, cj - 1) && !cellPkg[c - NCX]) {
      const n = hash3(gxC, gyC, 11) < 0.2 ? 2 : hash3(gxC, gyC, 12) < 0.6 ? 1 : 0;
      for (let k = 0; k < n; k++) {
        const x = wxC + (hash3(gxC, gyC, 13 + k) - 0.5) * 0.7, p = march(x, wyC, 0, -1);
        if (p && !blocked(p[0], p[1] + 0.3)) deco.stal.push({ x: p[0], y: p[1], L: 0.22 + 0.55 * hash3(gxC, gyC, 15 + k), w: 0.10 + 0.16 * hash3(gxC, gyC, 17 + k), bi, h: hash3(gxC, gyC, 19 + k) });
      }
      if (bi >= 2 && hash3(gxC, gyC, 21) < 0.72) {
        const x = wxC + (hash3(gxC, gyC, 22) - 0.5) * 0.8, p = march(x, wyC, 0, -1);
        if (p) deco.drip.push({ x: p[0], y: p[1], L: 0.18 + 0.55 * hash3(gxC, gyC, 23), h: hash3(gxC, gyC, 24), wall: 0 });
      }
    }
    if (knownSolidCell(ci, cj + 1) && !cellPkg[c + NCX]) {
      const n = Math.floor(hash3(gxC, gyC, 31) * 3.2);
      for (let k = 0; k < n; k++) {
        const x = wxC + (hash3(gxC, gyC, 32 + k) - 0.5) * 0.85, p = march(x, wyC, 0, 1);
        if (p && !blocked(p[0], p[1] - 0.1)) deco.peb.push({ x: p[0], y: p[1], r: 0.05 + 0.10 * hash3(gxC, gyC, 35 + k), bi, h: hash3(gxC, gyC, 38 + k) });
      }
      if (hash3(gxC, gyC, 41) < 0.35) { const x = wxC + (hash3(gxC, gyC, 42) - 0.5) * 0.5, p = march(x, wyC, 0, 1); if (p && !blocked(p[0], p[1] - 0.2)) deco.boul.push({ x: p[0], y: p[1], r: 0.22 + 0.2 * hash3(gxC, gyC, 43), bi, h: hash3(gxC, gyC, 44) }); }
      if (bi >= 2 && !nearPkg(ci, cj) && hash3(gxC, gyC, 51) < 0.45) { const x = wxC + (hash3(gxC, gyC, 52) - 0.5) * 0.6, p = march(x, wyC, 0, 1); if (p && !blocked(p[0], p[1] - 0.2)) deco.crys.push({ x: p[0], y: p[1], a: -Math.PI / 2, h: hash3(gxC, gyC, 53) }); }
    }
    for (const [dx, sd] of [[-1, 61], [1, 71]]) if (knownSolidCell(ci + dx, cj) && !cellPkg[c + dx]) {
      if (bi >= 2 && hash3(gxC, gyC, sd) < 0.3) { const y = wyC + (hash3(gxC, gyC, sd + 1) - 0.5) * 0.6, p = march(wxC, y, dx, 0); if (p) deco.drip.push({ x: p[0] - dx * 0.04, y: p[1] - 0.25, L: 0.3 + 0.5 * hash3(gxC, gyC, sd + 2), h: hash3(gxC, gyC, sd + 3), wall: dx }); }
      if (bi >= 2 && !nearPkg(ci, cj) && hash3(gxC, gyC, sd + 5) < 0.3) { const y = wyC + 0.2, p = march(wxC, y, dx, 0); if (p && !blocked(p[0], p[1])) deco.crys.push({ x: p[0], y: p[1], a: dx < 0 ? 0 : Math.PI, h: hash3(gxC, gyC, sd + 6) }); }
    }
  }
  deco.crys = deco.crys.slice(0, 10); deco.boul = deco.boul.slice(0, 10);
  const ctx = actx;
  const poly = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); };
  function drawStal(s) {
    const B = BANDS[s.bi], x = X(s.x), y = Y(s.y - 0.08), L = S(s.L + 0.08), w = S(s.w), lean = S((s.h - 0.5) * 0.08);
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, shadeHex(B.soilC, 1.25)); g.addColorStop(0.45, shadeHex(B.soilC, 0.9)); g.addColorStop(1, shadeHex(B.soilC, 0.5));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w / 2, y);
    ctx.quadraticCurveTo(x - w * 0.3, y + L * 0.55, x + lean, y + L); ctx.quadraticCurveTo(x + w * 0.25, y + L * 0.5, x + w / 2, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(10,12,14,0.55)'; ctx.lineWidth = 1.2 * DPR; ctx.stroke();
    if (s.bi >= 2 && s.h > 0.45) { // rust tip
      const g2 = ctx.createLinearGradient(0, y + L * 0.45, 0, y + L);
      g2.addColorStop(0, 'rgba(196,96,36,0)'); g2.addColorStop(1, 'rgba(214,112,44,0.9)');
      ctx.fillStyle = g2; ctx.fill();
    }
  }
  function drawDrip(d) {
    const x = X(d.x), y0 = Y(d.y - (d.wall ? 0 : 0.2)), L = S(d.L + (d.wall ? 0 : 0.2)), w = S(0.045 + 0.04 * d.h);
    const g = ctx.createLinearGradient(0, y0, 0, y0 + L);
    g.addColorStop(0, 'rgba(150,70,28,0.85)'); g.addColorStop(0.35, 'rgba(206,104,40,0.95)'); g.addColorStop(1, 'rgba(232,140,62,0.9)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w / 2, y0);
    ctx.bezierCurveTo(x - w * 0.5, y0 + L * 0.6, x - w * 0.2, y0 + L * 0.9, x, y0 + L); ctx.bezierCurveTo(x + w * 0.2, y0 + L * 0.9, x + w * 0.45, y0 + L * 0.6, x + w / 2, y0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y0 + L, w * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120,58,24,0.35)'; ctx.beginPath(); ctx.ellipse(x, y0 + S(0.03), w * 1.8, S(0.05), 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawPebble(p) {
    const B = BANDS[p.bi], x = X(p.x), r = S(p.r), y = Y(p.y) - r * 0.45, c = p.h < 0.5 ? B.soilC : B.rockC;
    ctx.fillStyle = 'rgba(6,8,10,0.45)'; ctx.beginPath(); ctx.ellipse(x, Y(p.y) + r * 0.1, r * 1.2, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(0, y - r * 0.6, 0, y + r * 0.6);
    g.addColorStop(0, shadeHex(c, 1.45)); g.addColorStop(0.4, shadeHex(c, 1.0)); g.addColorStop(1, shadeHex(c, 0.55));
    ctx.fillStyle = g; const pts = []; for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, rr = r * (0.8 + 0.35 * hash3(k, Math.floor(p.h * 1e4), 3)); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.62]); }
    poly(pts); ctx.fill(); ctx.strokeStyle = 'rgba(10,12,14,0.6)'; ctx.lineWidth = 1 * DPR; ctx.stroke();
  }
  function drawBoulder(b) {
    const B = BANDS[b.bi], x = X(b.x), r = S(b.r), base = Y(b.y) + r * 0.12, c = B.rockC, seed = Math.floor(b.h * 1e5);
    const pts = [];
    for (let k = 0; k < 9; k++) { const a = Math.PI + (k / 8) * Math.PI, rr = r * (0.78 + 0.35 * hash3(k, seed, 5)); pts.push([x + Math.cos(a) * rr * 1.25, base + Math.sin(a) * rr * 0.85]); }
    ctx.fillStyle = 'rgba(5,7,9,0.5)'; ctx.beginPath(); ctx.ellipse(x, base, r * 1.45, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(x - r, base - r, x + r * 0.6, base);
    g.addColorStop(0, shadeHex(c, 1.5)); g.addColorStop(0.5, shadeHex(c, 1.0)); g.addColorStop(1, shadeHex(c, 0.55));
    ctx.fillStyle = g; poly(pts); ctx.fill();
    ctx.strokeStyle = 'rgba(8,10,12,0.75)'; ctx.lineWidth = 1.6 * DPR; ctx.stroke();
    ctx.strokeStyle = shadeHex(B.lipC, 0.85); ctx.lineWidth = 1.3 * DPR; ctx.beginPath(); ctx.moveTo(pts[1][0], pts[1][1]); for (let k = 2; k < 6; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.stroke();
    ctx.strokeStyle = 'rgba(10,12,14,0.5)'; ctx.lineWidth = 1 * DPR; ctx.beginPath(); ctx.moveTo(pts[4][0], pts[4][1]); ctx.lineTo(x + r * 0.2, base - r * 0.1); ctx.lineTo(pts[7][0], pts[7][1]); ctx.stroke();
  }
  function drawCrystal(c) {
    const x = X(c.x), y = Y(c.y) + (c.a === -Math.PI / 2 ? S(0.04) : 0), seed = Math.floor(c.h * 1e5), n = 3 + Math.floor(c.h * 3);
    for (let k = 0; k < n; k++) {
      const a = c.a + (hash3(k, seed, 1) - 0.5) * 1.3, L = S(0.16 + 0.26 * hash3(k, seed, 2)), w = S(0.05 + 0.05 * hash3(k, seed, 3));
      const ox = x + (hash3(k, seed, 4) - 0.5) * S(0.22), dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
      const pts = [[ox + nx * w * 0.5, y + ny * w * 0.5], [ox + nx * w * 0.55 + dx * L * 0.75, y + ny * w * 0.55 + dy * L * 0.75], [ox + dx * L, y + dy * L], [ox - nx * w * 0.55 + dx * L * 0.75, y - ny * w * 0.55 + dy * L * 0.75], [ox - nx * w * 0.5, y - ny * w * 0.5]];
      const g = ctx.createLinearGradient(ox, y, ox + dx * L, y + dy * L);
      g.addColorStop(0, '#6a3410'); g.addColorStop(0.45, '#d4862a'); g.addColorStop(1, '#ffd88a');
      ctx.fillStyle = g; poly(pts); ctx.fill(); ctx.strokeStyle = 'rgba(40,18,6,0.8)'; ctx.lineWidth = 1 * DPR; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,236,190,0.7)'; ctx.lineWidth = 0.8 * DPR; ctx.beginPath(); ctx.moveTo(ox + dx * L * 0.15, y + dy * L * 0.15); ctx.lineTo(ox + dx * L * 0.9, y + dy * L * 0.9); ctx.stroke();
    }
    emitters.push({ x: c.x + Math.cos(c.a) * 0.18, y: c.y + Math.sin(c.a) * 0.18, r: 0.6, I: 0.26, col: [255, 165, 70] });
    lights.push({ x: c.x + Math.cos(c.a) * 0.2, y: c.y + Math.sin(c.a) * 0.2, range: 1.0, I: 0.22, col: [1.0, 0.68, 0.35], occl: false });
  }
  deco.stal.forEach(drawStal); deco.drip.forEach(drawDrip);
  mark('decorations-back', t);

  // ------------------------------------------------------------------ embedded ores (game sprites, badge replaced by a small tier mark)
  t = performance.now();
  for (const [k, list] of pkgCells) {
    const cy = Math.floor(k / W), cxw = k % W;
    let cx = cxw; while (cx < gx0) cx += W; while (cx >= gx1) cx -= W;
    if (cx < gx0 || cy < gy0 || cy >= gy1 || !sim.disc[k]) continue;
    const item = list[0], m = /O(\d)/.exec(item.itemId || ''), n = m ? +m[1] : 0;
    const x = X(cx + 0.5), y = Y(cy + 0.5);
    const sock = ctx.createRadialGradient(x, y + S(0.06), S(0.08), x, y + S(0.04), S(0.5));
    sock.addColorStop(0, 'rgba(6,8,10,0.5)'); sock.addColorStop(0.65, 'rgba(6,8,10,0.22)'); sock.addColorStop(1, 'rgba(6,8,10,0)');
    ctx.fillStyle = sock; ctx.beginPath(); ctx.ellipse(x, y + S(0.05), S(0.5), S(0.42), 0, 0, Math.PI * 2); ctx.fill();
    if (n) {
      const f = atlasJson.frames[`ore-o${n}`], size = S(0.84), sc = size / f.sourceSize.w;
      ctx.save(); ctx.beginPath(); ctx.rect(x - size / 2, y - size / 2, size, size * (126 / 144)); ctx.clip();
      ctx.beginPath(); ctx.rect(x - size, y - size, size * 2, size * 2); ctx.arc(x - size / 2 + 114 * sc, y - size / 2 + 114 * sc, 24 * sc, 0, Math.PI * 2); ctx.clip('evenodd');
      drawFrame(ctx, `ore-o${n}`, x, y, size, size);
      ctx.restore();
      const bx = x + S(0.24), by = y + S(0.22);
      ctx.fillStyle = 'rgba(12,16,20,0.9)'; ctx.beginPath(); ctx.arc(bx, by, S(0.085), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e9e3d2'; for (let b = 0; b < n; b++) ctx.fillRect(bx + (b - (n - 1) / 2) * S(0.032) - S(0.008), by - S(0.04), S(0.016), S(0.08));
      if (n >= 3) emitters.push({ x: cx + 0.62, y: cy + 0.3, r: 0.32, I: n === 4 ? 0.35 : 0.22, col: n === 4 ? [255, 200, 100] : [200, 230, 255] });
    } else drawFrame(ctx, 'relic', x, y, S(0.8), S(0.8));
  }
  mark('ores', t);

  // ------------------------------------------------------------------ surface kit (PROTOTYPE ART) + lander (game sprite stand-in)
  t = performance.now();
  if (SCENE === 'surface') {
    const g0 = Y(0);
    for (const [x, r, h] of rocks) { // loose rocks on the regolith
      const cx = X(x), rr = S(r), pts = [];
      for (let k = 0; k <= 6; k++) { const a = Math.PI + (k / 6) * Math.PI; pts.push([cx + Math.cos(a) * rr * (0.8 + 0.4 * hash3(k, x * 100 | 0, 2)), g0 + S(0.03) + Math.sin(a) * rr * (0.5 + 0.3 * h)]); }
      ctx.fillStyle = 'rgba(5,8,10,0.45)'; ctx.beginPath(); ctx.ellipse(cx, g0 + S(0.03), rr * 1.3, S(0.035), 0, 0, Math.PI * 2); ctx.fill();
      const gr = ctx.createLinearGradient(0, g0 - rr * 0.7, 0, g0); gr.addColorStop(0, '#7f8a91'); gr.addColorStop(1, '#3b444b');
      ctx.fillStyle = gr; poly(pts); ctx.fill(); ctx.strokeStyle = 'rgba(10,14,16,0.7)'; ctx.lineWidth = 1.2 * DPR; ctx.stroke();
    }
    const cable = (x0, y0, x1, y1, sag) => {
      for (const [w, c] of [[S(0.05), '#26180f'], [S(0.028), '#c8692a'], [S(0.008), 'rgba(255,200,140,0.6)']]) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.quadraticCurveTo(X((x0 + x1) / 2), Y(Math.max(y0, y1) + sag), X(x1), Y(y1)); ctx.stroke();
      }
    };
    // lander: existing stage-1 sprite as a stand-in for a physical stage-0 lander (stage-0 is a dashed wireframe)
    drawFrame(ctx, 'dock-stage-1', X(dockX), g0 + DPR, S(4), S(3), 1);
    cable(dockX + 1.55, -0.55, dockX + 6.0, -0.12, 0.42);
    cable(dockX - 1.5, -0.6, lampPosts[0] + 0.05, -1.3, 0.55);
    cable(dockX + 1.6, -0.75, lampPosts[1] - 0.04, -1.32, 0.35);
    for (const [cx, w, h, yOff] of crates) { // crates
      const x0 = X(cx - w / 2), y0 = Y(-(yOff || 0) - h), ww = S(w), hh = S(h);
      const gr = ctx.createLinearGradient(x0, y0, x0 + ww, y0 + hh); gr.addColorStop(0, '#77705f'); gr.addColorStop(1, '#3b3a35');
      ctx.fillStyle = gr; ctx.fillRect(x0, y0, ww, hh); ctx.strokeStyle = '#14181a'; ctx.lineWidth = 1.6 * DPR; ctx.strokeRect(x0, y0, ww, hh);
      ctx.strokeStyle = 'rgba(20,22,22,0.65)'; ctx.lineWidth = 1 * DPR; for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x0, y0 + (hh * k) / 3); ctx.lineTo(x0 + ww, y0 + (hh * k) / 3); ctx.stroke(); }
      ctx.fillStyle = '#d0782a'; ctx.fillRect(x0 + ww * 0.08, y0 + hh * 0.12, ww * 0.28, hh * 0.14);
      ctx.fillStyle = 'rgba(230,225,205,0.55)'; ctx.fillRect(x0, y0, ww, S(0.02));
    }
    { // power box with lit screen
      const x0 = X(dockX + 5.85), y0 = Y(-0.5), ww = S(0.6), hh = S(0.5);
      ctx.fillStyle = '#4a5259'; ctx.fillRect(x0, y0, ww, hh); ctx.strokeStyle = '#121619'; ctx.lineWidth = 1.6 * DPR; ctx.strokeRect(x0, y0, ww, hh);
      ctx.fillStyle = '#0f2a2a'; ctx.fillRect(x0 + ww * 0.18, y0 + hh * 0.2, ww * 0.42, hh * 0.3);
      ctx.fillStyle = '#c8692a'; ctx.fillRect(x0 + ww * 0.7, y0 + hh * 0.2, ww * 0.14, hh * 0.6);
      props.screen = [x0 + ww * 0.18, y0 + hh * 0.2, ww * 0.42, hh * 0.3];
    }
    for (const x of lampPosts) { // tripod lamp posts
      const cx = X(x);
      ctx.strokeStyle = '#1a2024'; ctx.lineCap = 'round';
      ctx.lineWidth = S(0.05); for (const dx of [-0.3, 0.3, 0.06]) { ctx.beginPath(); ctx.moveTo(X(x + dx), g0); ctx.lineTo(cx, Y(-0.55)); ctx.stroke(); }
      ctx.strokeStyle = '#8a8f8f'; ctx.lineWidth = S(0.022); for (const dx of [-0.3, 0.3]) { ctx.beginPath(); ctx.moveTo(X(x + dx), g0); ctx.lineTo(cx, Y(-0.55)); ctx.stroke(); }
      ctx.strokeStyle = '#1a2024'; ctx.lineWidth = S(0.06); ctx.beginPath(); ctx.moveTo(cx, Y(-0.5)); ctx.lineTo(cx, Y(-1.44)); ctx.stroke();
      ctx.strokeStyle = '#7d8486'; ctx.lineWidth = S(0.022); ctx.beginPath(); ctx.moveTo(cx - S(0.012), Y(-0.5)); ctx.lineTo(cx - S(0.012), Y(-1.44)); ctx.stroke();
      ctx.fillStyle = '#d17a2c'; ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 1.4 * DPR;
      ctx.beginPath(); ctx.roundRect(cx - S(0.11), Y(-1.72), S(0.22), S(0.3), S(0.04)); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a2a1c'; ctx.fillRect(cx - S(0.13), Y(-1.46), S(0.26), S(0.05));
    }
  }
  if (SCENE === 'cavern') {
    for (const p of props) {
      if (p.kind === 'wreck') {
        const sh = ctx.createRadialGradient(X(p.x + p.w / 2), Y(p.y + p.h * 0.86), S(0.3), X(p.x + p.w / 2), Y(p.y + p.h * 0.86), S(p.w * 0.6));
        sh.addColorStop(0, 'rgba(4,6,8,0.6)'); sh.addColorStop(1, 'rgba(4,6,8,0)'); ctx.fillStyle = sh;
        ctx.beginPath(); ctx.ellipse(X(p.x + p.w / 2), Y(p.y + p.h * 0.86), S(p.w * 0.6), S(0.35), 0, 0, Math.PI * 2); ctx.fill();
        ctx.drawImage(wreckImg, X(p.x), Y(p.y), S(p.w), S(p.h));
      } else if (p.kind === 'beacon') ctx.drawImage(beaconImg, X(p.x), Y(p.y), S(p.w), S(p.h));
    }
  }
  deco.boul.forEach(drawBoulder); deco.peb.forEach(drawPebble); deco.crys.forEach(drawCrystal);
  // ------------------------------------------------------------------ rig (game sprites, rig.ts composition)
  {
    const size = S(64 / 48), cx = X(rig.x), cy = Y(rig.y - 0.015), flip = rig.facing < 0;
    ctx.fillStyle = 'rgba(5,9,12,0.5)'; ctx.beginPath(); ctx.ellipse(cx, Y(rig.y + 0.36), S(0.48), S(0.07), 0, 0, Math.PI * 2); ctx.fill();
    for (const f of ['rig-body-0', 'rig-engine-0', 'rig-energy-0', 'rig-bay-0', 'rig-cabin', 'rig-hull-0']) drawFrame(ctx, f, cx, cy, size, size, 0.5, flip);
    drawFrame(ctx, rig.drill === 'down' ? 'rig-drill-down-0' : 'rig-drill-idle', cx, cy, size, size, 0.5, rig.drill === 'down' ? false : flip);
  }
  mark('props-and-rig', t);

  // ------------------------------------------------------------------ light: base levels per cell (ambient by depth, fog for unknown)
  const LS = P.lightScale, LW = Math.ceil(DW / LS), LH = Math.ceil(DH / LS);
  const cellL = new Float32Array(NCX * NCY * 3);
  for (let cj = 0; cj < NCY; cj++) for (let ci = 0; ci < NCX; ci++) {
    const c = cj * NCX + ci, row = gy0 + cj;
    let src = c; if (cellSky[c]) { src = c; } // sky cells take the level of the ground below (no bleed)
    const rr = cellSky[c] ? Math.max(0, row) : row;
    const B = BANDS[bandOf(clamp(rr, 0, R - 1))], dim = 1 - 0.0025 * clamp(rr, 0, R);
    let l0, l1, l2;
    if (cellSky[c]) { l0 = l1 = l2 = B.vis; }
    else if (!cellKnown[c]) { const f = (row <= 1 ? lerp(B.vis, B.fog, row === 0 ? 0.45 : 0.75) : B.fog) * dim; l0 = f * 0.94; l1 = f * 0.98; l2 = f * 1.06; }
    else if (cellVis[c]) { l0 = l1 = l2 = B.vis * dim; }
    else { const m = B.mem * dim; l0 = m * 0.96; l1 = m * 0.98; l2 = m; }
    cellL[c * 3] = l0; cellL[c * 3 + 1] = l1; cellL[c * 3 + 2] = l2;
  }
  for (let cj = NCY - 2; cj >= 0; cj--) for (let ci = 0; ci < NCX; ci++) { // sky inherits from below for interpolation
    const c = cj * NCX + ci; if (cellSky[c]) for (let k = 0; k < 3; k++) cellL[c * 3 + k] = cellL[(c + NCX) * 3 + k];
  }
  function castRays(L) {
    const n = P.rays, hit = new Float32Array(n), step = 1 / 32;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a); let s = 0;
      if (L.cone) { let da = Math.abs(((a - L.cone.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (da > L.cone.outer + 0.05) { hit[k] = 0; continue; } }
      for (; s < L.range; s += step) if (solidAt(L.x + dx * s, L.y + dy * s)) break;
      hit[k] = s;
    }
    return hit;
  }
  const lmCanvas = document.createElement('canvas'); lmCanvas.width = LW; lmCanvas.height = LH;
  const adCanvas = document.createElement('canvas'); adCanvas.width = LW; adCanvas.height = LH;
  const lmctx = lmCanvas.getContext('2d'), adctx = adCanvas.getContext('2d');
  const lmImg = lmctx.createImageData(LW, LH), adImg = adctx.createImageData(LW, LH);
  const LMf = new Float32Array(LW * LH * 3), ADf = new Float32Array(LW * LH * 3), airL = new Float32Array(LW * LH), skyL = new Uint8Array(LW * LH);
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) { // static per scene: base level + air mask
    const wx = ((i + 0.5) * LS / DPR + camX) / tile, wy = ((j + 0.5) * LS / DPR + camY) / tile, p = j * LW + i;
    const F = sample(F_, wx, wy); airL[p] = clamp((0.5 - F) * 3 + 0.5, 0, 1); skyL[p] = wy < 0 && F < 0.5 ? 1 : 0;
    const u = clamp(wx - gx0 - 0.5, 0, NCX - 1.001), v = clamp(wy - gy0 - 0.5, 0, NCY - 1.001);
    const ci = u | 0, cj = v | 0, fu = smooth(0.2, 0.8, u - ci), fv = smooth(0.2, 0.8, v - cj), c = cj * NCX + ci;
    for (let k = 0; k < 3; k++) LMf[p * 3 + k] = (cellL[c * 3 + k] * (1 - fu) + cellL[(c + 1) * 3 + k] * fu) * (1 - fv) + (cellL[(c + NCX) * 3 + k] * (1 - fu) + cellL[(c + NCX + 1) * 3 + k] * fu) * fv;
  }
  const baseLM = LMf.slice();
  let motes = [];
  function computeLight(phase) {
    LMf.set(baseLM); ADf.fill(0);
    for (const L of lights) {
      const Lc = L.cone ? { ...L.cone, a: L.cone.a + Math.sin(phase) * 0.035 } : null;
      const hit = L.occl ? castRays({ ...L, cone: Lc }) : null;
      const cx = X(L.x) / LS, cy = Y(L.y) / LS, rp = (L.range * TD) / LS;
      const i0 = Math.max(0, Math.floor(cx - rp)), i1 = Math.min(LW - 1, Math.ceil(cx + rp)), j0 = Math.max(0, Math.floor(cy - rp)), j1 = Math.min(LH - 1, Math.ceil(cy + rp));
      const cosO = Lc ? Math.cos(Lc.outer) : 0, cosI = Lc ? Math.cos(Lc.inner) : 0, dX = Lc ? Math.cos(Lc.a) : 0, dY = Lc ? Math.sin(Lc.a) : 0;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const ex = (i + 0.5 - cx) / (TD / LS), ey = (j + 0.5 - cy) / (TD / LS), r = Math.hypot(ex, ey);
        if (r >= L.range) continue;
        const q = r / L.range; let att = (1 - q * q); att *= att;
        let ang = 1;
        if (Lc) { const cs = r > 1e-4 ? (ex * dX + ey * dY) / r : 1; ang = smooth(cosO, cosI, cs); if (ang <= 0) continue; att = att * 0.85 + 0.15 * Math.max(0, 1 - r / 0.6); }
        let vis = 1;
        if (hit) { let a = Math.atan2(ey, ex); if (a < 0) a += Math.PI * 2; const fk = (a / (Math.PI * 2)) * P.rays, k0 = Math.floor(fk) % P.rays, k1 = (k0 + 1) % P.rays, w = fk - Math.floor(fk); const h = hit[k0] * (1 - w) + hit[k1] * w; vis = 1 - smooth(h, h + P.pen, r); if (vis <= 0) continue; }
        const p = j * LW + i, e = L.I * att * ang * vis;
        if (skyL[p]) continue;
        LMf[p * 3] += e * L.col[0]; LMf[p * 3 + 1] += e * L.col[1]; LMf[p * 3 + 2] += e * L.col[2];
        if (L.haze) { const hz = L.haze * att * ang * vis * airL[p] * (L.cone ? 1 : 0.6); ADf[p * 3] += hz * 255; ADf[p * 3 + 1] += hz * 182; ADf[p * 3 + 2] += hz * 105; }
      }
    }
    for (const e of emitters) {
      const cx = X(e.x) / LS, cy = Y(e.y) / LS, rp = (e.r * TD) / LS, flat = e.flat || 1;
      const i0 = Math.max(0, Math.floor(cx - rp)), i1 = Math.min(LW - 1, Math.ceil(cx + rp)), j0 = Math.max(0, Math.floor(cy - rp * flat)), j1 = Math.min(LH - 1, Math.ceil(cy + rp * flat));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const r = Math.hypot((i + 0.5 - cx) / rp, (j + 0.5 - cy) / (rp * flat)); if (r >= 1) continue;
        const k = e.I * (1 - r) * (1 - r), p = j * LW + i;
        ADf[p * 3] += k * e.col[0]; ADf[p * 3 + 1] += k * e.col[1]; ADf[p * 3 + 2] += k * e.col[2];
      }
    }
    for (let p = 0; p < LW * LH; p++) if (rimQ[p] > 0) {
      const add = Math.max(0, LMf[p * 3] - baseLM[p * 3]) * rimQ[p] * 150;
      ADf[p * 3] += add; ADf[p * 3 + 1] += add * 0.86; ADf[p * 3 + 2] += add * 0.66;
    }
    const lm = lmImg.data, ad = adImg.data;
    for (let p = 0; p < LW * LH; p++) {
      const q = p * 4;
      // light is stored at half scale; the composite doubles the frame, so 0..2x albedo is representable
      if (skyL[p]) { lm[q] = lm[q + 1] = lm[q + 2] = 128; }
      else { lm[q] = Math.min(255, LMf[p * 3] * 127.5); lm[q + 1] = Math.min(255, LMf[p * 3 + 1] * 127.5); lm[q + 2] = Math.min(255, LMf[p * 3 + 2] * 127.5); }
      lm[q + 3] = 255;
      ad[q] = Math.min(255, ADf[p * 3]); ad[q + 1] = Math.min(255, ADf[p * 3 + 1]); ad[q + 2] = Math.min(255, ADf[p * 3 + 2]); ad[q + 3] = 255;
    }
    lmctx.putImageData(lmImg, 0, 0); adctx.putImageData(adImg, 0, 0);
  }
  // dust motes inside the headlamp cone (air only)
  {
    const L = lights.find((l) => l.rig);
    for (let k = 0; k < 46; k++) {
      const a = L.cone.a + (hash3(k, 1, 61) - 0.5) * 2 * L.cone.outer * 0.9, r = 0.3 + Math.sqrt(hash3(k, 2, 61)) * 2.6;
      const x = L.x + Math.cos(a) * r, y = L.y + Math.sin(a) * r;
      if (!solidAt(x, y)) motes.push([x, y, (0.6 + hash3(k, 3, 61)) * DPR, (1 - r / 3) * (1 - Math.abs(a - L.cone.a) / L.cone.outer)]);
    }
  }

  // ------------------------------------------------------------------ composite
  const view = document.getElementById('view');
  view.width = DW; view.height = DH; view.style.width = VW + 'px'; view.style.height = VH + 'px';
  const vctx = view.getContext('2d');
  vctx.imageSmoothingEnabled = true; vctx.imageSmoothingQuality = 'high';
  function composite(phase) {
    vctx.globalCompositeOperation = 'source-over'; vctx.drawImage(albedo, 0, 0);
    vctx.globalCompositeOperation = 'multiply'; vctx.drawImage(lmCanvas, 0, 0, DW, DH);
    vctx.globalCompositeOperation = 'lighter'; vctx.drawImage(view, 0, 0);   // x2: light range 0..2
    vctx.drawImage(adCanvas, 0, 0, DW, DH);
    for (const [x, y, r, a] of motes) { vctx.fillStyle = `rgba(255,214,160,${(0.35 * a).toFixed(3)})`; vctx.beginPath(); vctx.arc(X(x), Y(y), r, 0, Math.PI * 2); vctx.fill(); }
    vctx.globalCompositeOperation = 'source-over';
    // emissive cores drawn after the light map so they are never darkened
    vctx.fillStyle = '#fff3d2'; vctx.beginPath(); vctx.ellipse(X(lamp.x), Y(lamp.y), S(0.04), S(0.055), 0, 0, Math.PI * 2); vctx.fill();
    for (const x of lampPosts) { vctx.fillStyle = '#ffe9b8'; vctx.beginPath(); vctx.roundRect(X(x) - S(0.075), Y(-1.66), S(0.15), S(0.16), S(0.03)); vctx.fill(); }
    if (props.screen) { const [a, b, c, d] = props.screen; vctx.fillStyle = '#6fe8cf'; vctx.fillRect(a, b, c, d); }
    if (props.beacon) {
      const { x, y } = props.beacon, s = S(0.17 + 0.01 * Math.sin(phase * 3));
      vctx.fillStyle = '#5fe6ff'; vctx.beginPath(); vctx.moveTo(X(x), Y(y) - s); vctx.lineTo(X(x) + s, Y(y)); vctx.lineTo(X(x), Y(y) + s); vctx.lineTo(X(x) - s, Y(y)); vctx.closePath(); vctx.fill();
      vctx.fillStyle = '#e9fdff'; const s2 = s * 0.42; vctx.beginPath(); vctx.moveTo(X(x), Y(y) - s2); vctx.lineTo(X(x) + s2, Y(y)); vctx.lineTo(X(x), Y(y) + s2); vctx.lineTo(X(x) - s2, Y(y)); vctx.closePath(); vctx.fill();
    }
    if (rig.y > 0.2) { // mild underground vignette
      const vg = vctx.createRadialGradient(DW / 2, DH / 2, Math.min(DW, DH) * 0.45, DW / 2, DH / 2, Math.hypot(DW, DH) * 0.6);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.2)'); vctx.fillStyle = vg; vctx.fillRect(0, 0, DW, DH);
    }
  }
  t = performance.now(); computeLight(0); mark('light-first', t);
  t = performance.now(); composite(0); mark('composite-first', t);
  timing.bakeTotal = +(performance.now() - T0).toFixed(1);

  // ------------------------------------------------------------------ frame-time probe: light map + additive + composite per frame
  const perf = {};
  if (PERF) {
    const lightT = [], compT = [], totT = [];
    for (let f = 0; f < PERF; f++) {
      const a = performance.now(); computeLight(f * 0.21); const b = performance.now(); composite(f * 0.21);
      vctx.getImageData(0, 0, 1, 1); const c = performance.now();
      lightT.push(b - a); compT.push(c - b); totT.push(c - a);
    }
    const st = (v) => { const s = [...v].sort((x, y) => x - y); return { p50: +s[Math.floor(s.length * 0.5)].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), mean: +(v.reduce((x, y) => x + y, 0) / v.length).toFixed(1) }; };
    Object.assign(perf, { frames: PERF, light: st(lightT), composite: st(compT), total: st(totT) });
  }
  // ------------------------------------------------------------------ debug views
  if (DEBUG === 'regions' || DEBUG === 'air') {
    const d = vctx.createImageData(DW, DH);
    for (let p = 0; p < DW * DH; p++) {
      const v = DEBUG === 'air' ? (visAir[p] ? 255 : 0) : [0, 85, 170, 255][regions ? regions[p] : 0];
      d.data[p * 4] = d.data[p * 4 + 1] = d.data[p * 4 + 2] = v; d.data[p * 4 + 3] = 255;
    }
    vctx.putImageData(d, 0, 0);
  } else if (DEBUG === 'albedo') { vctx.globalCompositeOperation = 'copy'; vctx.drawImage(albedo, 0, 0); vctx.globalCompositeOperation = 'source-over'; }
  else if (DEBUG === 'light') { vctx.globalCompositeOperation = 'copy'; vctx.drawImage(lmCanvas, 0, 0, DW, DH); vctx.globalCompositeOperation = 'lighter'; vctx.drawImage(view, 0, 0); vctx.globalCompositeOperation = 'source-over'; }
  else if (TAG) {
    vctx.font = `${11 * DPR}px sans-serif`; vctx.fillStyle = 'rgba(220,230,235,0.55)'; vctx.textAlign = 'right';
    vctx.fillText('technique prototype · placeholder props', DW - 8 * DPR, DH - 8 * DPR);
  }
  // collision air for the disagreement metric: known air cells in device space
  const collAir = new Uint8Array(DW * DH);
  for (let py = 0; py < DH; py++) { const wy = ((py + 0.5) / DPR + camY) / tile; for (let pxi = 0; pxi < DW; pxi++) { const wx = ((pxi + 0.5) / DPR + camX) / tile; const ci = Math.floor(wx) - gx0, cj = Math.floor(wy) - gy0; collAir[py * DW + pxi] = ci >= 0 && cj >= 0 && ci < NCX && cj < NCY && !cellSol[cj * NCX + ci] ? 1 : 0; } }
  let diff = 0, airAny = 0; for (let p = 0; p < DW * DH; p++) { if (visAir[p] || collAir[p]) airAny++; if (visAir[p] !== collAir[p]) diff++; }
  window.__proto = {
    ready: true, scene: SCENE, VW, VH, DPR, tile: +tile.toFixed(2), zoom, framing, camX: +camX.toFixed(1), camY: +camY.toFixed(1), rig, timing, perf,
    disagreement: { pixels: diff, share_of_frame: +(diff / (DW * DH)).toFixed(4), share_of_air: +(diff / Math.max(1, airAny)).toFixed(4) },
    counts: { stalactites: deco.stal.length, drips: deco.drip.length, pebbles: deco.peb.length, boulders: deco.boul.length, crystals: deco.crys.length, emitters: emitters.length, lights: lights.length, ores: [...pkgCells.keys()].filter((k) => sim.disc[k]).length },
    props: props.map((p) => ({ kind: p.kind, x: +p.x.toFixed(2), y: +p.y.toFixed(2), w: p.w, h: +p.h.toFixed(2) })),
    params: P,
  };
})().catch((e) => { window.__proto = { ready: true, error: String(e && e.stack || e) }; console.error(e); });
