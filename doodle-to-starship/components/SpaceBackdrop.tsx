"use client";

import { useEffect, useRef } from "react";

// Deep space behind the studio: a photographic star field on pure black with a dusty Milky Way,
// a couple of faint nebula wisps and star clusters. It drifts a few pixels a minute like a camera
// on a slow mount; stars glimmer, bright ones sparkle, and now and then a meteor or satellite goes by.
// Everything static is painted once into offscreen layers, so a frame only composites them.

type RGB = readonly [number, number, number];
type Star = { x: number; y: number; p: number; color: RGB; layer: number; twinkle: boolean; glint: boolean };
type Sprite = { canvas: HTMLCanvasElement; c: number };
type Twinkle = { sprite: Sprite; x: number; y: number; layer: number; f: number[]; ph: number[]; depth: number };
type Glint = { sprite: Sprite; x: number; y: number; layer: number; period: number; phase: number };
type Scene = {
  w: number;
  h: number;
  d: number;
  layers: { canvas: HTMLCanvasElement; margin: number }[];
  twinkles: Twinkle[];
  glints: Glint[];
  dot: Sprite;
};
type Pass = { start: number; dur: number; x: number; y: number; angle: number; len: number; peak: number; gap: number };
type Meteor = { start: number; dur: number; x: number; y: number; angle: number; speed: number; peak: number; width: number };

const SEED = 0x2c5eed;
const TAU = Math.PI * 2;
const CELL = 256; // CSS px; stars are generated per cell so a resize never reshuffles them
const PAD = 72; // CSS px of field generated past the edges, for halos that reach in
const DEPTH = [0.25, 0.55, 1]; // parallax per layer: far (with the Milky Way), mid, near
const DRIFT = 32; // CSS px the nearest layer wanders from rest, over tens of minutes
const MAX_DPR = 2;
const GRID = 4; // CSS px between samples of the diffuse light (Milky Way, nebulae)

// Brightness: cumulative counts grow ~10^(0.42 m), so most stars sit near the faint limit.
const M_FAINT = 7;
const M_BRIGHT = 0.6;
const SLOPE = 0.42;
const P_FAINT = 0.15; // peak exposure of the faintest star
const FLOOR = 0.004; // exposure too dim to show
const HALO = 0.012;
const SPIKE = 0.03;
const GLOW = 0.09; // peak Milky Way brightness, as a fraction of white

// Low-saturation stellar colours, hot to cool, weighted by how common each looks.
const TINTS: { color: RGB; weight: number }[] = [
  { color: [0.78, 0.86, 1], weight: 0.08 }, // B
  { color: [0.91, 0.94, 1], weight: 0.2 }, // A
  { color: [1, 1, 1], weight: 0.29 }, // F
  { color: [1, 0.96, 0.89], weight: 0.2 }, // G
  { color: [1, 0.89, 0.77], weight: 0.15 }, // K
  { color: [1, 0.82, 0.67], weight: 0.08 }, // M
];
const DUST_LIGHT: RGB = [1, 0.93, 0.84];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(a: number, b: number, c: number) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1) ^ SEED;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, 0) / 4294967296;
  const b = hash(ix + 1, iy, 0) / 4294967296;
  const c = hash(ix, iy + 1, 0) / 4294967296;
  const d = hash(ix + 1, iy + 1, 0) / 4294967296;
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, octaves: number) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x, y);
    norm += amp;
    // Rotate as well as scale each octave so the lattice never lines up.
    const nx = 1.6 * x + 1.2 * y + 17.3;
    y = -1.2 * x + 1.6 * y + 9.1;
    x = nx;
    amp *= 0.5;
  }
  return sum / norm;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function tint(r: number): RGB {
  for (const t of TINTS) {
    if (r < t.weight) return t.color;
    r -= t.weight;
  }
  return TINTS[2].color;
}

function magnitude(r: number) {
  const lo = 10 ** (SLOPE * M_BRIGHT);
  const hi = 10 ** (SLOPE * M_FAINT);
  return Math.log10(lo + r * (hi - lo)) / SLOPE;
}

function cellStars(cx: number, cy: number): Star[] {
  const rand = mulberry32(hash(cx, cy, 1));
  const n = 30 + Math.floor(rand() * 11);
  const stars: Star[] = [];
  for (let i = 0; i < n; i++) {
    const x = (cx + rand()) * CELL;
    const y = (cy + rand()) * CELL;
    const m = magnitude(rand());
    const p = P_FAINT * 10 ** (0.4 * (M_FAINT - m));
    const depth = m + (rand() - 0.5) * 2.2;
    const layer = depth < 4 ? 2 : depth < 5.8 ? 1 : 0;
    const color = tint(rand());
    const roll = rand();
    stars.push({ x, y, p, color, layer, twinkle: p > 0.32 && roll < 0.38, glint: false });
  }
  return stars;
}

// --- Point spread: a gaussian core that saturates to white, a soft halo, and optional spikes. ---

const sigma = (d: number) => Math.max(0.55, 0.42 * d);
const haloLen = (p: number, d: number) => (1.6 + 0.7 * Math.log10(p)) * d;
const spikeLen = (p: number, d: number) => Math.sqrt(p) * 1.2 * d;

function reach(p: number, spike: boolean, d: number) {
  let r = sigma(d) * Math.sqrt(2 * Math.log(Math.max(p / FLOOR, 1)));
  const halo = p > 3 ? HALO * p : 0;
  if (halo > FLOOR) r = Math.max(r, haloLen(p, d) * Math.log(halo / FLOOR));
  if (spike) r = Math.max(r, spikeLen(p, d) * Math.log((SPIKE * p) / FLOOR));
  return Math.min(Math.ceil(r) + 1, 180);
}

// Adds one star of peak exposure p, centred at device px (x, y), into an opaque RGBA buffer.
function splat(px: Uint8ClampedArray, W: number, H: number, x: number, y: number, p: number, color: RGB, d: number, spike = false, core = true) {
  const r = reach(p, spike, d);
  const x0 = Math.max(0, Math.floor(x - r));
  const x1 = Math.min(W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r));
  const y1 = Math.min(H - 1, Math.ceil(y + r));
  if (x0 > x1 || y0 > y1) return;
  const inv = 1 / (2 * sigma(d) ** 2);
  const halo = p > 3 ? HALO * p : 0;
  const hl = haloLen(p, d);
  const sa = spike ? SPIKE * p : 0;
  const sl = spikeLen(p, d);
  const sw = 1 / (2 * (0.38 * d) ** 2);
  for (let j = y0; j <= y1; j++) {
    const dy = j + 0.5 - y;
    for (let i = x0; i <= x1; i++) {
      const dx = i + 0.5 - x;
      const r2 = dx * dx + dy * dy;
      let e = core ? p * Math.exp(-r2 * inv) : 0;
      if (halo && core) e += halo * Math.exp(-Math.sqrt(r2) / hl);
      if (sa) e += sa * (Math.exp(-Math.abs(dx) / sl - dy * dy * sw) + Math.exp(-Math.abs(dy) / sl - dx * dx * sw));
      if (e < FLOOR) continue;
      const k = (j * W + i) * 4;
      px[k] += 255 * (1 - Math.exp(-e * color[0]));
      px[k + 1] += 255 * (1 - Math.exp(-e * color[1]));
      px[k + 2] += 255 * (1 - Math.exp(-e * color[2]));
    }
  }
}

function blank(W: number, H: number) {
  const img = new ImageData(W, H);
  new Uint32Array(img.data.buffer).fill(0xff000000);
  return img;
}

function toCanvas(img: ImageData) {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d", { alpha: false })?.putImageData(img, 0, 0);
  return canvas;
}

function sprite(p: number, color: RGB, d: number, spike = false, core = true): Sprite {
  const r = reach(p, spike, d);
  const size = 2 * r + 2;
  const img = blank(size, size);
  splat(img.data, size, size, r + 1, r + 1, p, color, d, spike, core);
  return { canvas: toCanvas(img), c: r + 1 };
}

// --- Diffuse light: the Milky Way band with its dust rift, plus two nebula wisps. ---

type Wisp = { x: number; y: number; rx: number; ry: number; angle: number; color: RGB; peak: number; seed: number };
const WISPS: Wisp[] = [
  { x: 0.2, y: 0.22, rx: 0.2, ry: 0.09, angle: -0.5, color: [0.62, 0.48, 0.95], peak: 0.085, seed: 3 },
  { x: 0.84, y: 0.8, rx: 0.18, ry: 0.08, angle: 0.4, color: [0.36, 0.76, 0.78], peak: 0.075, seed: 9 },
];

// Returns RGB light (0–255) on a coarse grid over the far layer, and how crowded with faint stars each point is.
function diffuse(w: number, h: number, margin: number) {
  const gw = Math.ceil((w + 2 * margin) / GRID) + 2;
  const gh = Math.ceil((h + 2 * margin) / GRID) + 2;
  const rgb = new Float32Array(gw * gh * 3);
  const crowd = new Float32Array(gw * gh);
  const diag = Math.hypot(w, h);
  const len = Math.hypot(w, 0.62 * h);
  const ux = w / len;
  const uy = (-0.62 * h) / len; // the band rises to the right
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = i * GRID - margin;
      const y = j * GRID - margin;
      const nx = x / diag;
      const ny = y / diag;
      const rx = x - 0.5 * w;
      const ry = y - 0.54 * h;
      // The napkin sits in the middle third of the stage: keep the diffuse light faint behind it.
      const aside = 0.22 + 0.78 * smoothstep(0.11, 0.24, Math.abs(x / w - 0.5));
      const along = (rx * ux + ry * uy) / diag;
      const across = (ry * ux - rx * uy) / diag - 0.03 * Math.sin(along * 4.4 + 0.9);
      const core = Math.exp(-(across * across) / (2 * 0.075 ** 2));
      const wing = Math.exp(-(across * across) / (2 * 0.19 ** 2));
      const clouds = smoothstep(0.28, 0.72, fbm(nx * 6 + 3.1, ny * 6 - 1.7, 5));
      const swell = 0.6 + 0.4 * Math.sin(along * 4.8 + 2.3);
      const light = (0.7 * core + 0.3 * wing) * (0.3 + clouds) * swell;
      // A sinuous dark rift just off the spine, and patchy filaments around it.
      const meander = (fbm(nx * 2.6 + 11, ny * 2.6 + 5, 3) - 0.5) * 0.07;
      const rr = (across - 0.01 - meander) / 0.026;
      const rift = Math.exp(-0.5 * rr * rr) * smoothstep(0.3, 0.6, fbm(nx * 4.5 + 40, ny * 4.5 + 7, 4));
      const patches = smoothstep(0.56, 0.8, fbm(nx * 10 - 9, ny * 10 + 21, 4)) * wing;
      const dust = Math.min(0.92, 0.88 * rift + 0.55 * patches);
      const lum = light * (1 - dust) * aside * GLOW * 255;
      const warm = clamp01(0.2 + 0.5 * core * swell + 0.6 * dust);
      const k = j * gw + i;
      let r = lum * (0.9 + 0.1 * warm);
      let g = lum * (0.92 - 0.04 * warm);
      let b = lum * (0.93 - 0.14 * warm);
      crowd[k] = light * (1 - dust) * (1 - dust) * (0.4 + 0.6 * aside);
      for (const wp of WISPS) {
        const dx = (x - wp.x * w) / diag;
        const dy = (y - wp.y * h) / diag;
        const cs = Math.cos(wp.angle);
        const sn = Math.sin(wp.angle);
        const a = (dx * cs + dy * sn) / wp.rx;
        const c = (dy * cs - dx * sn) / wp.ry;
        const env = Math.exp(-0.5 * (a * a + c * c));
        if (env < 0.01) continue;
        // Ridged, domain-warped noise reads as wispy filaments.
        const wx = nx * 7 + wp.seed + 1.5 * fbm(nx * 3 + wp.seed, ny * 3, 3);
        const wy = ny * 7 - wp.seed + 1.5 * fbm(nx * 3, ny * 3 + wp.seed, 3);
        const ridge = 1 - Math.abs(2 * fbm(wx, wy, 4) - 1);
        const v = env * (0.2 + 0.8 * ridge ** 2.5) * aside * wp.peak * 255;
        r += v * wp.color[0];
        g += v * wp.color[1];
        b += v * wp.color[2];
      }
      rgb[k * 3] = r;
      rgb[k * 3 + 1] = g;
      rgb[k * 3 + 2] = b;
    }
  }
  return { gw, gh, rgb, crowd };
}

// Paints the diffuse light at device resolution, dithered so the faint gradients never band.
function paintDiffuse(img: ImageData, d: number, gw: number, rgb: Float32Array) {
  const { width: W, height: H, data: px } = img;
  const step = 1 / (d * GRID);
  for (let j = 0; j < H; j++) {
    const gy = (j + 0.5) * step;
    const j0 = gy | 0;
    const ty = gy - j0;
    const row0 = j0 * gw;
    const row1 = row0 + gw;
    for (let i = 0; i < W; i++) {
      const gx = (i + 0.5) * step;
      const i0 = gx | 0;
      const tx = gx - i0;
      const a = (row0 + i0) * 3;
      const c = (row1 + i0) * 3;
      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx * ty;
      const r = rgb[a] * w00 + rgb[a + 3] * w10 + rgb[c] * w01 + rgb[c + 3] * w11;
      const g = rgb[a + 1] * w00 + rgb[a + 4] * w10 + rgb[c + 1] * w01 + rgb[c + 4] * w11;
      const b = rgb[a + 2] * w00 + rgb[a + 5] * w10 + rgb[c + 2] * w01 + rgb[c + 5] * w11;
      if (r < 0.3 && g < 0.3 && b < 0.3) continue;
      let hs = Math.imul(i, 0x9e3779b1) ^ Math.imul(j + 0x632be5, 0x85ebca77);
      hs = Math.imul(hs ^ (hs >>> 15), 0x2c1b3c6d);
      hs ^= hs >>> 12;
      const n = ((hs & 0xffff) + ((hs >>> 16) & 0xffff)) / 65536 - 1; // triangular dither, -1..1
      const k = (j * W + i) * 4;
      px[k] = r + n;
      px[k + 1] = g + n;
      px[k + 2] = b + n;
    }
  }
}

function sample(gw: number, field: Float32Array, lx: number, ly: number) {
  const gx = lx / GRID;
  const gy = ly / GRID;
  const i0 = gx | 0;
  const j0 = gy | 0;
  const tx = gx - i0;
  const ty = gy - j0;
  const k = j0 * gw + i0;
  return (field[k] * (1 - tx) + field[k + 1] * tx) * (1 - ty) + (field[k + gw] * (1 - tx) + field[k + gw + 1] * tx) * ty;
}

// --- Building the scene for one size. ---

function build(w: number, h: number, d: number): Scene {
  const margins = DEPTH.map((f) => Math.ceil(DRIFT * f) + 2);
  const reachOut = margins[2] + PAD;
  const stars: Star[] = [];
  for (let cy = Math.floor(-reachOut / CELL); cy <= Math.floor((h + reachOut) / CELL); cy++) {
    for (let cx = Math.floor(-reachOut / CELL); cx <= Math.floor((w + reachOut) / CELL); cx++) stars.push(...cellStars(cx, cy));
  }

  // The brightest few on screen sparkle with cross-shaped glints.
  const onScreen = stars.filter((s) => s.x >= 0 && s.x <= w && s.y >= 0 && s.y <= h).sort((a, b) => b.p - a.p);
  for (const s of onScreen.slice(0, 5)) if (s.p > 6) Object.assign(s, { glint: true, twinkle: false, layer: 2 });

  // Clusters sit at fixed spots in the frame: a loose blue-white open cluster and a fuzzy globular.
  const rand = mulberry32(hash(11, 13, 17));
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(TAU * rand());
  const open = { x: 0.8 * w, y: 0.26 * h };
  for (let i = 0; i < 18; i++) {
    const p = 0.5 + 6 * rand() ** 3;
    stars.push({ x: open.x + gauss() * 22, y: open.y + gauss() * 16, p, color: TINTS[rand() < 0.7 ? 0 : 1].color, layer: 1, twinkle: rand() < 0.5, glint: false });
  }
  const globular = { x: 0.11 * w, y: 0.66 * h };

  const layers = DEPTH.map((_, k) => {
    const m = margins[k];
    const img = blank(Math.ceil((w + 2 * m) * d), Math.ceil((h + 2 * m) * d));
    const { width: W, height: H, data: px } = img;
    if (k === 0) {
      const field = diffuse(w, h, m);
      paintDiffuse(img, d, field.gw, field.rgb);
      // Grain of unresolved stars along the band, thinned out where the dust is.
      const area = (w + 2 * m) * (h + 2 * m);
      for (let i = 0, n = Math.round(area * 0.009); i < n; i++) {
        const lx = rand() * (w + 2 * m);
        const ly = rand() * (h + 2 * m);
        const keep = rand();
        const p = 0.03 + 0.34 * rand() ** 3;
        if (keep > Math.min(1, sample(field.gw, field.crowd, lx, ly) * 1.1)) continue;
        splat(px, W, H, lx * d, ly * d, p, DUST_LIGHT, d);
      }
      for (let i = 0; i < 260; i++) {
        const r = Math.abs(gauss()) * 7 * (rand() < 0.2 ? 2.2 : 1);
        const a = TAU * rand();
        splat(px, W, H, (globular.x + m + Math.cos(a) * r) * d, (globular.y + m + Math.sin(a) * r) * d, 0.04 + 0.12 * rand() ** 2, DUST_LIGHT, d);
      }
    }
    for (const s of stars) {
      if (s.layer !== k || s.twinkle) continue;
      splat(px, W, H, (s.x + m) * d, (s.y + m) * d, s.p, s.color, d);
    }
    return { canvas: toCanvas(img), margin: m };
  });

  const twinkles: Twinkle[] = [];
  const glints: Glint[] = [];
  for (const s of stars) {
    const r = mulberry32(hash(s.x * 16, s.y * 16, 3));
    if (s.twinkle) {
      twinkles.push({
        sprite: sprite(s.p, s.color, d),
        x: s.x,
        y: s.y,
        layer: s.layer,
        f: [0.08 + 0.3 * r(), 0.2 + 0.5 * r(), 0.5 + 0.9 * r()],
        ph: [TAU * r(), TAU * r(), TAU * r()],
        depth: 0.35 + 0.4 * r(),
      });
    }
    if (s.glint) glints.push({ sprite: sprite(Math.max(1.5 * s.p, 24), s.color, d, true, false), x: s.x, y: s.y, layer: s.layer, period: 5 + 5 * r(), phase: r() });
  }

  return { w, h, d, layers, twinkles, glints, dot: sprite(0.8, [1, 0.98, 0.94], d) };
}

// --- Things that come and go: satellites every 20–40 s, meteors every 6–15 s. ---

function satellites() {
  const rand = mulberry32(hash(5, 5, 5));
  const next = (start: number): Pass => ({
    start,
    dur: 13 + 4 * rand(),
    x: 0.15 + 0.7 * rand(),
    y: 0.15 + 0.7 * rand(),
    angle: TAU * rand(),
    len: 0.85 + 0.3 * rand(),
    peak: 0.65 + 0.35 * rand(),
    gap: 20 + 20 * rand(),
  });
  let pass = next(9);
  return (t: number) => {
    while (t > pass.start + pass.dur) pass = next(pass.start + pass.gap);
    return t >= pass.start ? pass : null;
  };
}

function meteors() {
  const rand = mulberry32(hash(7, 7, 7));
  const one = (start: number, x: number, y: number, angle: number, peak: number): Meteor => ({
    start,
    dur: 0.6 + 0.6 * rand(),
    x,
    y,
    angle,
    speed: 0.45 + 0.35 * rand(), // diagonals per second
    peak,
    width: 0.9 + 0.7 * rand(),
  });
  const shower = (start: number) => {
    // Mostly falling diagonally, either way; now and then from anywhere.
    const dip = 0.35 + 0.8 * rand();
    const right = rand() < 0.5;
    const angle = rand() < 0.85 ? (right ? dip : Math.PI - dip) : TAU * rand();
    const x = right ? 0.05 + 0.55 * rand() : 0.4 + 0.55 * rand();
    const first = one(start, x, 0.05 + 0.55 * rand(), angle, 0.75 + 0.25 * rand());
    const group = [first];
    if (rand() < 0.22) {
      const off = 0.03 + 0.04 * rand();
      group.push(one(start + 0.12 + 0.3 * rand(), first.x - Math.sin(angle) * off, first.y + Math.cos(angle) * off, angle + (rand() - 0.5) * 0.06, first.peak * 0.7));
    }
    return group;
  };
  let at = 3.5;
  let group = shower(at);
  return (t: number) => {
    while (t > Math.max(...group.map((m) => m.start + m.dur))) {
      at += 6 + 9 * rand();
      group = shower(at);
    }
    return group.filter((m) => t >= m.start && t <= m.start + m.dur);
  };
}

// --- Drawing a frame. ---

function draw(ctx: CanvasRenderingContext2D, s: Scene, t: number, moving: boolean, pass: Pass | null, falling: Meteor[]) {
  const { d, w, h } = s;
  const camX = moving ? DRIFT * Math.sin((t / 1700) * TAU + 0.6) : 0;
  const camY = moving ? DRIFT * 0.55 * Math.sin((t / 2300) * TAU + 2.2) : 0;
  const offX = DEPTH.map((f) => -camX * f);
  const offY = DEPTH.map((f) => -camY * f);

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  s.layers.forEach((layer, k) => {
    if (k === 1) ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(layer.canvas, (offX[k] - layer.margin) * d, (offY[k] - layer.margin) * d);
  });

  for (const tw of s.twinkles) {
    const [f1, f2, f3] = tw.f;
    const [p1, p2, p3] = tw.ph;
    const wave = moving ? (Math.sin(TAU * f1 * t + p1) + 0.6 * Math.sin(TAU * f2 * t + p2) + 0.35 * Math.sin(TAU * f3 * t + p3)) / 1.95 : 0.4;
    ctx.globalAlpha = clamp01(1 - tw.depth * (0.5 - 0.5 * wave) * 1.6);
    ctx.drawImage(tw.sprite.canvas, (tw.x + offX[tw.layer]) * d - tw.sprite.c, (tw.y + offY[tw.layer]) * d - tw.sprite.c);
  }

  for (const g of s.glints) {
    // A slow swell to a sharp sparkle, then back to a faint cross.
    const u = moving ? (t / g.period + g.phase) % 1 : 0.5;
    const flare = Math.exp(-((u - 0.5) ** 2) / 0.012);
    const scale = 0.75 + 0.45 * flare;
    const size = g.sprite.canvas.width * scale;
    ctx.globalAlpha = 0.22 + 0.78 * flare;
    ctx.drawImage(g.sprite.canvas, (g.x + offX[g.layer]) * d - g.sprite.c * scale, (g.y + offY[g.layer]) * d - g.sprite.c * scale, size, size);
  }

  const diag = Math.hypot(w, h);
  if (pass) {
    const u = (t - pass.start) / pass.dur;
    const along = (u - 0.5) * pass.len * diag;
    // Fades in out of Earth's shadow and back into it.
    ctx.globalAlpha = pass.peak * smoothstep(0, 0.12, u) * (1 - smoothstep(0.84, 1, u));
    ctx.drawImage(s.dot.canvas, (pass.x * w + Math.cos(pass.angle) * along) * d - s.dot.c, (pass.y * h + Math.sin(pass.angle) * along) * d - s.dot.c);
  }

  for (const m of falling) {
    const age = t - m.start;
    const u = age / m.dur;
    const env = smoothstep(0, 0.18, u) * (1 - smoothstep(0.6, 1, u)) * m.peak;
    const cos = Math.cos(m.angle);
    const sin = Math.sin(m.angle);
    const v = m.speed * diag;
    const hx = (m.x * w + cos * v * age) * d;
    const hy = (m.y * h + sin * v * age) * d;
    const tail = Math.min(age, 0.3) * v * d;
    const tx = hx - cos * tail;
    const ty = hy - sin * tail;
    const grad = ctx.createLinearGradient(tx, ty, hx, hy);
    grad.addColorStop(0, "rgba(255,236,214,0)");
    grad.addColorStop(0.7, `rgba(255,244,232,${0.35 * env})`);
    grad.addColorStop(1, `rgba(255,255,255,${0.9 * env})`);
    ctx.fillStyle = grad;
    // A wide faint glow under a thin bright streak, both tapering to the tail.
    for (const [spread, alpha] of [[4, 0.18], [1, 1]]) {
      const half = m.width * d * 0.5 * spread * (0.6 + 0.4 * env);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx - sin * half, hy + cos * half);
      ctx.lineTo(hx + sin * half, hy - cos * half);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = env;
    ctx.drawImage(s.dot.canvas, hx - s.dot.c, hy - s.dot.c);
    ctx.drawImage(s.dot.canvas, hx - s.dot.c * 2, hy - s.dot.c * 2, s.dot.c * 4, s.dot.c * 4);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

export default function SpaceBackdrop({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: false });
    if (!host || !canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const passOf = satellites();
    const meteorsAt = meteors();
    const t0 = performance.now();
    let scene: Scene | null = null;
    let raf = 0;
    let last = -Infinity;
    let timer: number | undefined;

    const paint = (now: number) => {
      if (!scene) return;
      const t = (now - t0) / 1000;
      if (still.matches) draw(ctx, scene, 0, false, null, []);
      else draw(ctx, scene, t, true, passOf(t), meteorsAt(t));
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // 30 fps is plenty for the drift and glimmer; meteors and satellites get every frame.
      const t = (now - t0) / 1000;
      const busy = passOf(t) !== null || meteorsAt(t).length > 0;
      if (!busy && now - last < 1000 / 30 - 2) return;
      last = now;
      paint(now);
    };
    const run = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      paint(performance.now());
      if (!still.matches && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const d = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      if (!w || !h || (scene && scene.w === w && scene.h === h && scene.d === d)) return;
      scene = build(w, h, d);
      canvas.width = Math.round(w * d);
      canvas.height = Math.round(h * d);
      run();
    };
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      if (scene) timer = window.setTimeout(resize, 150);
      else resize();
    });
    observer.observe(host);
    document.addEventListener("visibilitychange", run);
    still.addEventListener("change", run);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", run);
      still.removeEventListener("change", run);
    };
  }, []);

  return (
    <div ref={hostRef} aria-hidden className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-black ${className ?? ""}`}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
