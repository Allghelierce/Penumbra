import type { DestinationId } from "@/lib/design";
import { BOUNDARIES } from "./atmosphere";
import type { Doodle, Vec } from "./geometry";

export type RGB = [number, number, number];

export interface Palette {
  table: RGB;
  napkin: RGB;
  napkinEdge: RGB;
  graphite: RGB;
  night: RGB;
  nightHigh: RGB;
  flame: RGB;
  flameHot: RGB;
  redpen: RGB;
  chalk: RGB;
}

/** Reads the napkin & red pen tokens from app/globals.css so the canvas matches the DOM. */
export function readPalette(): Palette {
  const css = typeof window === "undefined" ? null : getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) =>
    hexToRgb(css?.getPropertyValue(name) ?? "", hexToRgb(fallback, [255, 255, 255]));
  return {
    table: v("--table", "#f4efe4"),
    napkin: v("--napkin", "#fbf8f1"),
    napkinEdge: v("--napkin-edge", "#e3dccb"),
    graphite: v("--graphite", "#2d2d2d"),
    night: v("--night", "#05070d"),
    nightHigh: v("--night-high", "#0b1a33"),
    flame: v("--flame", "#ff5a1f"),
    flameHot: v("--flame-hot", "#ffb347"),
    redpen: v("--redpen", "#d62d20"),
    chalk: [244, 241, 234],
  };
}

export function hexToRgb(hex: string, fallback: RGB): RGB {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgba = (c: RGB, a: number) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

export const mix = (a: RGB, b: RGB, k: number): RGB => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** mulberry32, so the scenery wobbles the same way on every launch. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A soft round glow, drawn once and stamped for every particle. */
export function glowSprite(c: RGB, size = 64): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  if (g) {
    const r = size / 2;
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, rgba(c, 1));
    grd.addColorStop(0.35, rgba(c, 0.55));
    grd.addColorStop(1, rgba(c, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  return canvas;
}

/**
 * A dawn launch: deep blue overhead, a warm haze on the horizon. Climbing, the zenith goes black first
 * (most of the air is below 12 km), and the warm band thins until it's only the limb's glow.
 * Each stop is [km, zenith, upper sky, horizon, horizon glow].
 */
const SKY: [number, RGB, RGB, RGB, RGB][] = [
  [0, [18, 46, 96], [46, 92, 152], [146, 174, 208], [242, 190, 146]],
  [6, [14, 36, 80], [36, 76, 134], [118, 150, 192], [226, 166, 128]],
  [15, [8, 22, 54], [22, 50, 98], [74, 108, 156], [190, 128, 102]],
  [30, [3, 10, 26], [10, 26, 56], [36, 64, 108], [128, 86, 80]],
  [55, [1, 3, 9], [3, 9, 22], [14, 30, 58], [62, 46, 50]],
  [85, [0, 0, 2], [1, 2, 6], [6, 12, 26], [22, 18, 24]],
  [110, [0, 0, 0], [0, 0, 1], [2, 4, 9], [6, 6, 9]],
];

function skyAt(altKm: number): [RGB, RGB, RGB, RGB] {
  for (let i = 1; i < SKY.length; i++) {
    const hi = SKY[i];
    if (altKm <= hi[0]) {
      const lo = SKY[i - 1];
      const k = (altKm - lo[0]) / (hi[0] - lo[0]);
      return [mix(lo[1], hi[1], k), mix(lo[2], hi[2], k), mix(lo[3], hi[3], k), mix(lo[4], hi[4], k)];
    }
  }
  const last = SKY[SKY.length - 1];
  return [last[1], last[2], last[3], last[4]];
}

export function drawSky(ctx: CanvasRenderingContext2D, W: number, H: number, _pal: Palette, altKm: number, alpha: number) {
  const [zenith, upper, horizon, glow] = skyAt(Math.max(0, altKm));
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgba(zenith, 1));
  g.addColorStop(0.48, rgba(upper, 1));
  g.addColorStop(0.86, rgba(horizon, 1));
  g.addColorStop(1, rgba(glow, 1));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Low sun off to the right: a broad warm bloom that fades as the air thins.
  const sun = clamp01(1 - altKm / 40);
  if (sun > 0.01) {
    const r = Math.max(W, H) * 0.9;
    const bloom = ctx.createRadialGradient(W * 0.86, H * 1.02, 0, W * 0.86, H * 1.02, r);
    bloom.addColorStop(0, `rgba(255,200,150,${0.28 * sun})`);
    bloom.addColorStop(0.35, `rgba(255,170,130,${0.1 * sun})`);
    bloom.addColorStop(1, "rgba(255,170,130,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalAlpha = 1;
}

export interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  tw: number;
  layer: number;
}

const PARALLAX = [0.15, 0.4, 1];

export function makeStars(rand: () => number): Star[] {
  const stars: Star[] = [];
  const layers: [number, number, number][] = [
    [170, 0.55, 0.45],
    [80, 0.9, 0.7],
    [26, 1.5, 1],
  ];
  layers.forEach(([count, r, a], layer) => {
    for (let i = 0; i < count; i++) {
      stars.push({ x: rand(), y: rand(), r: r * (0.7 + rand() * 0.6), a: a * (0.6 + rand() * 0.4), tw: 0.5 + rand() * 2, layer });
    }
  });
  return stars;
}

const wrap = (v: number, m: number) => ((v % m) + m) % m;

export function drawStars(
  ctx: CanvasRenderingContext2D,
  stars: Star[],
  W: number,
  H: number,
  scrollX: number,
  scrollY: number,
  alpha: number,
  t: number,
) {
  if (alpha <= 0.01) return;
  ctx.fillStyle = "#ffffff";
  for (const s of stars) {
    const f = PARALLAX[s.layer];
    const x = wrap(s.x * W + scrollX * f, W);
    const y = wrap(s.y * H + scrollY * f, H);
    ctx.globalAlpha = alpha * s.a * (0.75 + 0.25 * Math.sin(t * s.tw * 3 + s.x * 50));
    if (s.layer < 2) {
      ctx.fillRect(x - s.r / 2, y - s.r / 2, s.r, s.r);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Air glow on the horizon (or the bottom of the screen once the ground is gone); warm at dusk. */
export function drawHorizonGlow(ctx: CanvasRenderingContext2D, W: number, H: number, y: number, intensity: number, warm = 0) {
  if (intensity <= 0.01) return;
  const top = y - H * 0.45;
  const near = mix([70, 120, 200], [255, 168, 110], warm);
  const g = ctx.createLinearGradient(0, y, 0, top);
  g.addColorStop(0, rgba(near, (0.32 + 0.18 * warm) * intensity));
  g.addColorStop(0.4, `rgba(40,80,150,${0.12 * intensity})`);
  g.addColorStop(1, "rgba(20,40,80,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, top, W, y - top);
}

export function drawGround(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  y: number,
  alpha: number,
  wobble: number[],
  chalk: RGB,
) {
  if (y >= H + 4 || alpha <= 0.01) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, y, W, H - y + 4);
  ctx.strokeStyle = rgba(chalk, 0.55);
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  wobble.forEach((dy, i) => {
    const x = (i / (wobble.length - 1)) * W;
    if (i === 0) ctx.moveTo(x, y + dy);
    else ctx.lineTo(x, y + dy);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Chalk launch pad and tower in world units (rocket-height scale, y up, rocket base at 0).
 * `ground` is how far below the deck the ground line sits.
 */
export function makePad(d: Doodle, ground: number, rand: () => number): Vec[][] {
  const h = d.height;
  const wob = (pts: Vec[]): Vec[] => {
    const out: Vec[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (0.05 * h)));
      for (let k = 0; k < n; k++) {
        const s = k / n;
        out.push([x0 + (x1 - x0) * s + (rand() - 0.5) * 0.006 * h, y0 + (y1 - y0) * s + (rand() - 0.5) * 0.006 * h]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  };
  const lines: Vec[][] = [];
  const deck = Math.max(d.width * 0.8, h * 0.24);
  const g = -ground;
  lines.push(wob([[-deck, 0], [deck, 0]]));
  lines.push(wob([[-deck, 0], [-deck * 0.92, g]]));
  lines.push(wob([[deck, 0], [deck * 0.92, g]]));
  // Flame trench walls under the rocket.
  const trench = Math.max(d.width * 0.3, 0.04 * h);
  lines.push(wob([[-trench, 0], [-trench, g]]));
  lines.push(wob([[trench, 0], [trench, g]]));

  // Lattice tower on the left with a swing arm reaching the rocket.
  const x1 = d.box.minX - 0.1 * h;
  const x2 = x1 - 0.075 * h;
  const top = 1.05 * h;
  lines.push(wob([[x1, 0], [x1, top]]));
  lines.push(wob([[x2, 0], [x2, top]]));
  const zig: Vec[] = [];
  for (let y = 0, i = 0; y <= top; y += 0.075 * h, i++) zig.push([i % 2 ? x1 : x2, y]);
  lines.push(wob(zig));
  lines.push(wob([[x2, top], [x1, top]]));
  lines.push(wob([[x1, 0.82 * h], [d.box.minX - 0.01 * h, 0.82 * h]]));
  lines.push(wob([[x1, 0.78 * h], [d.box.minX - 0.01 * h, 0.8 * h]]));
  lines.push(wob([[(x1 + x2) / 2, top], [(x1 + x2) / 2, top + 0.1 * h]]));
  return lines;
}

export type TargetBody = "moon" | "mars" | "europa";

export function targetBodyFor(dest: DestinationId): TargetBody | null {
  if (dest === "moon-orbit" || dest === "moon-surface") return "moon";
  if (dest === "mars-transfer" || dest === "mars-surface") return "mars";
  if (dest === "europa") return "europa";
  return null;
}

/** The destination drawn in chalk in the upper right, grow 0..1 (may overshoot). */
export function drawTargetBody(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  kind: TargetBody,
  grow: number,
  pal: Palette,
) {
  if (grow <= 0) return;
  const x = W * 0.8;
  const y = H * 0.22;
  const r = Math.min(W, H) * 0.075 * grow;
  const fill: RGB = kind === "moon" ? [205, 201, 186] : kind === "mars" ? [181, 72, 31] : [216, 205, 176];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = rgba(fill, 1);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = rgba(fill, 0.92);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  if (kind === "moon") {
    ctx.strokeStyle = "rgba(70,70,70,0.45)";
    for (const [dx, dy, s] of [
      [-0.3, -0.25, 0.22],
      [0.35, 0.1, 0.16],
      [-0.05, 0.4, 0.12],
    ]) {
      ctx.beginPath();
      ctx.arc(x + dx * r, y + dy * r, s * r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (kind === "mars") {
    ctx.fillStyle = "rgba(250,245,235,0.9)";
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.82, r * 0.35, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = rgba(pal.redpen, 0.6);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.8, y - r * 0.4 + i * r * 0.35);
      ctx.quadraticCurveTo(x, y - r * 0.1 + i * r * 0.3, x + r * 0.8, y - r * 0.5 + i * r * 0.4);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = rgba(pal.chalk, 0.9);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2.08);
  ctx.stroke();
}

// --- Layers of the atmosphere ---
// Boundaries and clouds aren't drawn at true scale (at true scale a layer line would cross
// the screen in a single frame); each scrolls past at a pace you can read.

/** Screen y of something at `km` while the rocket (at `centerY`) is at `altKm`. */
const layerY = (altKm: number, km: number, centerY: number, pxPerKm: number) => centerY + (altKm - km) * pxPerKm;

/** A dashed line with its name at each boundary, sweeping down past the rocket as it climbs. */
export function drawBoundaries(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  altKm: number,
  centerY: number,
  font: string,
  chalk: RGB,
  alpha: number,
) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.font = `600 12px ${font}`;
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "1.5px";
  ctx.textBaseline = "bottom";
  for (const b of BOUNDARIES) {
    const y = layerY(altKm, b.km, centerY, (H * 2.6) / b.km);
    if (y < -30 || y > H + 30) continue;
    const near = 1 - clamp01(Math.abs(altKm - b.km) / Math.max(1, b.km * 0.05));
    const a = alpha * ((b.hero ? 0.6 : 0.32) + 0.4 * near);
    if (b.hero) {
      ctx.setLineDash([]);
      ctx.globalAlpha = a * 0.25;
      ctx.strokeStyle = "rgba(140,190,255,1)";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.setLineDash(b.hero ? [10, 6] : [5, 7]);
    ctx.globalAlpha = a;
    ctx.strokeStyle = rgba(chalk, 1);
    ctx.lineWidth = b.hero ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.globalAlpha = Math.min(1, a + 0.25);
    ctx.fillStyle = rgba(chalk, 1);
    ctx.fillText(`${b.label.toUpperCase()}  ·  ${b.km.toLocaleString("en-US")} KM`, 24, y - 6);
  }
  ctx.restore();
}

/** Ozone (15–35 km): a faint teal haze while the rocket is inside it. */
export function drawOzone(ctx: CanvasRenderingContext2D, W: number, H: number, altKm: number, centerY: number) {
  const s = (H * 2.6) / 25;
  const yTop = layerY(altKm, 35, centerY, s);
  const yBot = layerY(altKm, 15, centerY, s);
  if (yBot < 0 || yTop > H) return;
  const g = ctx.createLinearGradient(0, yTop, 0, yBot);
  g.addColorStop(0, "rgba(110,215,225,0)");
  g.addColorStop(0.5, "rgba(110,215,225,0.09)");
  g.addColorStop(1, "rgba(110,215,225,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, Math.max(0, yTop), W, Math.min(H, yBot) - Math.max(0, yTop));
}

/** One vertical slice of aurora light: violet fringe on top, green glow below, sharp lower edge. */
let auroraStrip: HTMLCanvasElement | null = null;
function auroraSlice(): HTMLCanvasElement | null {
  if (auroraStrip || typeof document === "undefined") return auroraStrip;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "rgba(170,90,230,0)");
  grd.addColorStop(0.35, "rgba(170,90,230,0.35)");
  grd.addColorStop(0.7, "rgba(90,235,160,0.8)");
  grd.addColorStop(0.93, "rgba(150,255,200,1)");
  grd.addColorStop(1, "rgba(150,255,200,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 1, 256);
  auroraStrip = canvas;
  return canvas;
}

/** Thermosphere aurora: curtains of fine rays rippling along the limb, k 0..1. */
export function drawAurora(ctx: CanvasRenderingContext2D, W: number, H: number, k: number, t: number, base: number) {
  const slice = auroraSlice();
  if (k <= 0.01 || !slice) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let band = 0; band < 2; band++) {
    for (let x = -2; x < W + 2; x += 2) {
      const ph = x * 0.0042 + t * (0.22 + band * 0.12) + band * 2.1;
      // The curtain's fold: its lower edge ripples, and its brightness gathers into rays.
      const edge = base - H * (0.012 + band * 0.035) + Math.sin(ph) * H * 0.014 + Math.sin(ph * 2.7 + 1) * H * 0.006;
      const h = H * (0.08 + 0.12 * (0.5 + 0.5 * Math.sin(ph * 1.3 + t * 0.5)));
      const rays = 0.55 + 0.45 * Math.sin(x * 0.11 + t * 1.7 + band * 3) * Math.sin(x * 0.037 - t * 0.9);
      ctx.globalAlpha = Math.max(0, k * (band ? 0.16 : 0.22) * rays);
      ctx.drawImage(slice, x, edge - h, 2, h);
    }
  }
  ctx.restore();
}

// --- Cloud layers: soft, lit banks rendered once into textures and slid past with parallax ---

export interface Deck {
  km: number;
  kind: "cumulus" | "alto" | "cirrus";
  /** Parallax: how fast the deck slides sideways. */
  depth: number;
  /** Vertical size of the bank in px; the engine uses it to tell when the rocket is inside. */
  thick: number;
  /** One tile of the deck, `tile` px wide, drawn repeatedly across the screen. */
  texture: HTMLCanvasElement | null;
  tile: number;
  /** Where the deck's base sits inside the texture (px from its top). */
  base: number;
}

const LIT: RGB = [255, 244, 232];
const MID: RGB = [222, 226, 236];
const SHADE: RGB = [112, 128, 160];

/** One cloud puff: lit from the upper right (the low sun), shading to blue-grey underneath. */
function puff(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, shade: number, alpha: number) {
  const lit = mix(LIT, MID, shade);
  const dark = mix(MID, SHADE, 0.35 + shade * 0.65);
  const grd = g.createRadialGradient(cx + r * 0.28, cy - r * 0.38, r * 0.06, cx, cy, r);
  grd.addColorStop(0, rgba(lit, alpha));
  grd.addColorStop(0.45, rgba(mix(lit, dark, 0.45), alpha * 0.85));
  grd.addColorStop(0.78, rgba(dark, alpha * 0.28));
  grd.addColorStop(1, rgba(dark, 0));
  g.fillStyle = grd;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
}

/** A copy of `src` with a light blur, so overlapping puffs melt into one body (browsers without canvas filters get it sharp). */
function softened(src: HTMLCanvasElement | null, px: number): HTMLCanvasElement | null {
  if (!src) return src;
  const made = canvasOf(src.width, src.height);
  if (!made) return src;
  const [canvas, g] = made;
  g.filter = `blur(${px}px)`;
  g.drawImage(src, 0, 0);
  g.filter = "none";
  // Feather both ends so neighbouring tiles meet without a hard vertical seam.
  const feather = 70;
  g.globalCompositeOperation = "destination-out";
  for (const [x0, x1] of [[0, feather], [src.width, src.width - feather]]) {
    const fade = g.createLinearGradient(x0, 0, x1, 0);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fade;
    g.fillRect(Math.min(x0, x1), 0, feather, src.height);
  }
  g.globalCompositeOperation = "source-over";
  return canvas;
}

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  return g ? [canvas, g] : null;
}

/** Cumulus: billowing heaps with flat, shaded bases, the tallest tops in each heap's middle. */
function cumulusTexture(rand: () => number, tile: number, thick: number): [HTMLCanvasElement | null, number] {
  const h = Math.round(thick * 1.9);
  const base = Math.round(h * 0.78);
  const made = canvasOf(tile, h);
  if (!made) return [null, base];
  const [canvas, g] = made;
  let x = 40 + rand() * 120;
  while (x < tile - 60) {
    const w = 160 + rand() * 300;
    const tall = thick * (0.45 + rand() * 0.6);
    const n = Math.round(26 + w / 9);
    // Back to front, bottom rows first, so lit tops sit over shaded bellies.
    const puffs: [number, number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      const f = rand();
      const dome = Math.sin(Math.PI * f) ** 0.8;
      const px = x + w * f;
      const up = rand() * dome;
      const py = base - tall * up * 0.9 - 6;
      const r = (14 + rand() * 26) * (0.65 + 0.7 * dome) * (thick / 200);
      puffs.push([px, py, r, up]);
    }
    puffs.sort((p, q) => q[1] - p[1]);
    for (const [px, py, r, up] of puffs) puff(g, px, py, r, 1 - up, 0.95);
    x += w * (0.75 + rand() * 0.6) + rand() * 220;
  }
  // Flatten and shade the bases: fade out anything that sags below the condensation level.
  g.globalCompositeOperation = "destination-out";
  const cut = g.createLinearGradient(0, base - 4, 0, base + 18);
  cut.addColorStop(0, "rgba(0,0,0,0)");
  cut.addColorStop(1, "rgba(0,0,0,1)");
  g.fillStyle = cut;
  g.fillRect(0, base - 4, tile, h - base + 4);
  g.globalCompositeOperation = "source-atop";
  const belly = g.createLinearGradient(0, base - thick * 0.45, 0, base);
  belly.addColorStop(0, "rgba(70,86,120,0)");
  belly.addColorStop(1, "rgba(70,86,120,0.5)");
  g.fillStyle = belly;
  g.fillRect(0, 0, tile, h);
  g.globalCompositeOperation = "source-over";
  return [canvas, base];
}

/** Altocumulus: a thin, dappled sheet, with patches of densely packed cloudlets and gaps between. */
function altoTexture(rand: () => number, tile: number, thick: number): [HTMLCanvasElement | null, number] {
  const h = Math.round(thick * 2.2);
  const base = Math.round(h * 0.62);
  const made = canvasOf(tile, h);
  if (!made) return [null, base];
  const [canvas, g] = made;
  let x = rand() * 60;
  while (x < tile) {
    const w = 120 + rand() * 260;
    const n = Math.round(w * 0.9);
    for (let i = 0; i < n; i++) {
      const f = rand();
      const px = x + f * w;
      // Patches are lens-shaped: thickest in the middle, feathered at the ends.
      const lens = Math.sin(Math.PI * f);
      const py = base - rand() * thick * 0.5 * lens - (rand() - 0.5) * 4;
      puff(g, px, py, (3 + rand() * 7) * (0.6 + 0.6 * lens), 0.3 + rand() * 0.35, 0.32);
    }
    x += w + 40 + rand() * 200;
  }
  return [canvas, base];
}

/** Cirrus: long, wind-combed streaks of ice near the tropopause. */
function cirrusTexture(rand: () => number, tile: number, thick: number): [HTMLCanvasElement | null, number] {
  const h = Math.round(thick * 2.4);
  const base = Math.round(h * 0.55);
  const made = canvasOf(tile, h);
  if (!made) return [null, base];
  const [canvas, g] = made;
  g.lineCap = "round";
  for (let i = 0; i < 34; i++) {
    const x0 = rand() * tile;
    const y0 = base + (rand() - 0.5) * thick;
    const len = 160 + rand() * 420;
    const bend = (rand() - 0.5) * 30;
    const hooks = 6 + Math.floor(rand() * 10);
    for (let k = 0; k < hooks; k++) {
      const off = (k - hooks / 2) * (1.6 + rand());
      g.strokeStyle = `rgba(255,246,236,${0.05 + rand() * 0.09})`;
      g.lineWidth = 1 + rand() * 2.4;
      g.beginPath();
      g.moveTo(x0, y0 + off);
      g.quadraticCurveTo(x0 + len * 0.5, y0 + off + bend, x0 + len, y0 + off - bend * 0.4 + (rand() - 0.5) * 8);
      g.stroke();
    }
  }
  return [canvas, base];
}

/** Four decks: cumulus at 1.6 and 3.2 km, altocumulus at 6 km, cirrus at 10.5 km. */
export function makeDecks(rand: () => number): Deck[] {
  const deck = (km: number, kind: Deck["kind"], depth: number, thick: number, tile: number): Deck => {
    const [texture, base] =
      kind === "cumulus" ? cumulusTexture(rand, tile, thick) : kind === "alto" ? altoTexture(rand, tile, thick) : cirrusTexture(rand, tile, thick);
    return { km, kind, depth, thick, texture: softened(texture, kind === "cirrus" ? 1.5 : 1.1), tile, base };
  };
  return [deck(1.6, "cumulus", 1, 220, 2000), deck(3.2, "cumulus", 0.8, 150, 1800), deck(6, "alto", 0.6, 70, 1600), deck(10.5, "cirrus", 0.4, 50, 2200)];
}

/**
 * Above the weather: the cloud tops far below, foreshortened into a band just over the horizon.
 * It fades in once the rocket clears the decks and thins out as the view widens toward space.
 */
export function drawCloudSea(ctx: CanvasRenderingContext2D, W: number, H: number, decks: Deck[], altKm: number, downKm: number, horizonY: number, alpha: number) {
  const k = alpha * clamp01((altKm - 5) / 6) * clamp01((60 - altKm) / 30);
  const tex = decks[0]?.texture;
  if (!tex || k <= 0.01) return;
  const bandH = H * (0.13 - 0.06 * clamp01((altKm - 10) / 40));
  const top = horizonY - bandH;
  ctx.save();
  // Five overlapping rows, foreshortened: far rows thin and pale at the horizon, near rows larger.
  for (let row = 0; row < 5; row++) {
    const near = row / 4;
    const rh = bandH * (0.22 + near * 0.3);
    const y = top + bandH * (0.02 + near * 0.62) - rh * 0.25;
    const rw = tex.width * (0.28 + near * 0.35);
    const rs = -((downKm * (8 + near * 22)) % rw) - row * 271;
    ctx.globalAlpha = k * (0.55 + near * 0.35);
    for (let x = (rs % rw) - rw; x < W + rw; x += rw) ctx.drawImage(tex, Math.round(x), Math.round(y), Math.round(rw), Math.round(rh));
  }
  // Haze over the distant clouds, thickest at the horizon.
  const haze = ctx.createLinearGradient(0, top, 0, horizonY);
  haze.addColorStop(0, "rgba(150,175,210,0)");
  haze.addColorStop(0.6, `rgba(160,182,214,${0.18 * k})`);
  haze.addColorStop(1, `rgba(180,198,224,${0.5 * k})`);
  ctx.globalAlpha = 1;
  ctx.fillStyle = haze;
  ctx.fillRect(0, top, W, horizonY - top);
  ctx.restore();
}

/** Screen y of a cloud deck at `km` while the rocket (at `centerY`) is at `altKm`. */
export const deckY = (d: Deck, altKm: number, centerY: number, H: number) => centerY + (altKm - d.km) * H * 0.32;

/** Draws one deck: its texture tiled across the screen, sliding with parallax as the rocket goes downrange. */
export function drawDeck(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  d: Deck,
  altKm: number,
  downKm: number,
  centerY: number,
  t: number,
  alpha: number,
) {
  const y = deckY(d, altKm, centerY, H);
  if (!d.texture || alpha <= 0.01 || y < -d.thick * 2 || y > H + d.thick * 2) return;
  const shift = -(((downKm * 60 + t * 12) * d.depth) % d.tile);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let x = shift - d.tile; x < W + d.tile; x += d.tile) {
    ctx.drawImage(d.texture, Math.round(x), Math.round(y - d.base));
  }
  ctx.restore();
}

export interface CityLight {
  /** Angle from the top of the globe, radians. */
  a: number;
  /** Depth below the limb, as a fraction of the screen height. */
  d: number;
  b: number;
}

export function makeCityLights(rand: () => number): CityLight[] {
  return Array.from({ length: 260 }, () => ({ a: (rand() - 0.5) * 1.6, d: 0.004 + Math.pow(rand(), 1.8) * 0.2, b: 0.3 + rand() * 0.7 }));
}

/**
 * The night-side Earth seen edge-on: a curved limb that rises and bends more as the rocket
 * climbs, with the thin layered glow of the atmosphere along it, noctilucent clouds above
 * the mesopause and city lights below. `lift` (0..1) raises it further for the orbit finale.
 */
/** Screen y of the top of Earth's limb at this altitude (lift raises it for the orbit finale). */
export function earthTopY(H: number, altKm: number, lift: number): number {
  const k = clamp01((altKm - 1) / 180);
  return H * (1.03 - 0.17 * Math.pow(k, 0.6) - 0.1 * lift);
}

export function drawEarth(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  altKm: number,
  spin: number,
  lift: number,
  lights: CityLight[],
  t: number,
) {
  const k = clamp01((altKm - 1) / 180);
  if (k <= 0 && lift <= 0) return;
  const R = W * (14 - 12.4 * Math.pow(Math.max(k, lift * 0.9), 0.55));
  const top = earthTopY(H, altKm, lift);
  const cx = W / 2;
  const cy = top + R;
  const span = Math.min(Math.PI / 2, Math.asin(Math.min(1, (W * 0.75) / R)) + 0.05);
  const a0 = -Math.PI / 2 - span;
  const a1 = -Math.PI / 2 + span;

  // Surface.
  const g = ctx.createLinearGradient(0, top, 0, top + H * 0.25);
  g.addColorStop(0, "#0e1621");
  g.addColorStop(1, "#040506");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, a0, a1);
  ctx.lineTo(W + 10, H + 10);
  ctx.lineTo(-10, H + 10);
  ctx.closePath();
  ctx.fill();

  // City lights, turning slowly with the planet.
  ctx.fillStyle = "rgb(255,205,140)";
  for (const l of lights) {
    const a = l.a + spin;
    const r = R - l.d * H;
    const x = cx + r * Math.sin(a);
    const y = cy - r * Math.cos(a);
    if (x < 0 || x > W || y > H) continue;
    ctx.globalAlpha = l.b * 0.7 * (0.5 + 0.5 * k);
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  ctx.globalAlpha = 1;

  // The atmosphere edge-on: thin, layered bands hugging the limb (twilight orange
  // at the bottom, then blue, fading out), each a crisp arc.
  const bands: [number, number, string][] = [
    [0, 1.5, "rgba(255,150,90,0.75)"],
    [2, 2, "rgba(150,205,255,0.95)"],
    [4.5, 2, "rgba(110,175,255,0.7)"],
    [7, 2, "rgba(80,140,240,0.45)"],
    [10, 3, "rgba(60,110,220,0.25)"],
    [14, 4, "rgba(50,90,200,0.12)"],
  ];
  ctx.lineCap = "butt";
  for (const [off, w, color] of bands) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(cx, cy, R + off + w / 2, a0, a1);
    ctx.stroke();
  }

  // Noctilucent clouds: electric-blue wisps riding just above the band (seen from the mesosphere up).
  const nlc = clamp01((altKm - 50) / 30) * (1 - lift * 0.5);
  if (nlc > 0) {
    ctx.strokeStyle = "rgba(170,230,255,1)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const mid = -Math.PI / 2 + (i - 4) * 0.035 * (W / R) * 6 + Math.sin(i * 7.3) * 0.02 + spin * 0.6;
      const len = (0.02 + 0.015 * Math.sin(i * 3.1 + 1)) * (W / R) * 6;
      ctx.globalAlpha = nlc * (0.25 + 0.2 * Math.sin(t * 0.7 + i));
      ctx.beginPath();
      ctx.arc(cx, cy, R + 18 + (i % 3) * 3, mid - len, mid + len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/** A small crisp ISS silhouette crossing the sky, with its label. */
export function drawISS(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number, font: string) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y));
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#1c2a3c";
  ctx.lineWidth = 1;
  // Truss.
  ctx.fillRect(-26 * s, -0.75 * s, 52 * s, 1.5 * s);
  // Solar arrays: four pairs.
  for (const ax of [-23, -15, 15, 23]) {
    for (const sy of [-1, 1]) {
      ctx.fillRect((ax - 3) * s, sy > 0 ? 2 * s : -11 * s, 6 * s, 9 * s);
      ctx.strokeRect((ax - 3) * s, sy > 0 ? 2 * s : -11 * s, 6 * s, 9 * s);
    }
  }
  // Pressurised modules down the middle.
  ctx.fillStyle = "#d9d9d9";
  ctx.fillRect(-1.5 * s, -6 * s, 3 * s, 12 * s);
  ctx.fillRect(-6 * s, -1.5 * s, 12 * s, 3 * s);
  ctx.font = `600 10px ${font}`;
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "1.5px";
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = alpha * 0.8;
  ctx.textAlign = "center";
  ctx.fillText("ISS · 408 KM", 0, -16 * s);
  ctx.restore();
}
