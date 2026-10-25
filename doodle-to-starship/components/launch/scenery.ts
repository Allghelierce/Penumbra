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

/** Flat illustrated color per layer, darkest at the top; space is pure black. */
const BANDS: { from: number; to: number; color: RGB; rim: RGB }[] = [
  { from: 0, to: 12, color: [63, 143, 210], rim: [150, 205, 245] },
  { from: 12, to: 50, color: [38, 98, 178], rim: [110, 170, 235] },
  { from: 50, to: 80, color: [36, 52, 128], rim: [95, 115, 210] },
  { from: 80, to: 700, color: [17, 12, 46], rim: [90, 70, 170] },
  { from: 700, to: Infinity, color: [0, 0, 0], rim: [60, 60, 80] },
];

/** Screen y of a layer boundary while the rocket (at centerY) is at altKm; matches drawBoundaries. */
const bandY = (altKm: number, km: number, centerY: number, H: number) => (km <= 0 ? Infinity : centerY + (altKm - km) * ((H * 2.6) / km));

/**
 * The sky as stacked flat bands, one per layer of the atmosphere, with crisp edges at the
 * boundaries the rocket climbs through, like levels in a game.
 */
export function drawSky(ctx: CanvasRenderingContext2D, W: number, H: number, _pal: Palette, altKm: number, alpha: number) {
  const centerY = H * 0.47;
  const alt = Math.max(0, altKm);
  ctx.globalAlpha = alpha;
  for (const b of BANDS) {
    const yBottom = Math.min(H, bandY(alt, b.from, centerY, H));
    const yTop = Math.max(0, b.to === Infinity ? 0 : bandY(alt, b.to, centerY, H));
    if (yBottom <= 0 || yTop >= H || yBottom <= yTop) continue;
    ctx.fillStyle = rgba(b.color, 1);
    ctx.fillRect(0, Math.floor(yTop), W, Math.ceil(yBottom - yTop) + 1);
    // A crisp lighter rim along the band's lower edge, where it meets the layer below.
    if (b.from > 0 && yBottom < H) {
      ctx.fillStyle = rgba(b.rim, 0.55);
      ctx.fillRect(0, Math.round(yBottom) - 2, W, 2);
    }
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

/** A bold labeled marker at each boundary, sweeping down past the rocket as it climbs. */
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
  ctx.font = `700 12px ${font}`;
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "1.6px";
  ctx.textBaseline = "middle";
  for (const b of BOUNDARIES) {
    const y = Math.round(layerY(altKm, b.km, centerY, (H * 2.6) / b.km));
    if (y < -30 || y > H + 30) continue;
    const near = 1 - clamp01(Math.abs(altKm - b.km) / Math.max(1, b.km * 0.05));
    const a = alpha * ((b.hero ? 0.75 : 0.5) + 0.25 * near);
    ctx.globalAlpha = a;
    ctx.fillStyle = rgba(chalk, 1);
    ctx.fillRect(0, y, W, b.hero ? 2 : 1);
    // Label pill on the left, like a level marker.
    const label = `${b.label.toUpperCase()}  ${b.km.toLocaleString("en-US")} KM`;
    const tw = Math.ceil(ctx.measureText(label).width);
    const px = 24;
    const ph = 22;
    ctx.globalAlpha = Math.min(1, a + 0.2);
    ctx.fillStyle = b.hero ? "#ffffff" : "#000000";
    ctx.fillRect(px, y - ph / 2, tw + 20, ph);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, y - ph / 2 + 0.5, tw + 19, ph - 1);
    ctx.fillStyle = b.hero ? "#000000" : "#ffffff";
    ctx.fillText(label, px + 10, y + 1);
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

/** Thermosphere aurora: flat, stylized curtains (green with a violet fringe) on the limb, k 0..1. */
export function drawAurora(ctx: CanvasRenderingContext2D, W: number, H: number, k: number, t: number, base: number) {
  if (k <= 0.01) return;
  const wave = (x: number, ph: number, amp: number) => Math.sin(x * 0.006 + ph) * amp + Math.sin(x * 0.017 + ph * 1.7) * amp * 0.35;
  const ribbon = (top: (x: number) => number, bottom: (x: number) => number) => {
    ctx.beginPath();
    ctx.moveTo(0, top(0));
    for (let x = 0; x <= W; x += 12) ctx.lineTo(x, top(x));
    for (let x = W; x >= 0; x -= 12) ctx.lineTo(x, bottom(x));
    ctx.closePath();
  };
  ctx.save();
  for (const [i, ph] of [0.4 * t, 0.3 * t + 2].entries()) {
    const lift = H * (0.02 + i * 0.035);
    const height = H * (0.06 - i * 0.015);
    const bottom = (x: number) => base - lift + wave(x, ph, H * 0.012);
    const top = (x: number) => bottom(x) - height - wave(x, ph * 1.3 + 1, H * 0.03);
    ribbon(top, bottom);
    ctx.globalAlpha = k * (0.32 - i * 0.1);
    ctx.fillStyle = "#4cd18e";
    ctx.fill();
    // Violet fringe along the top of the curtain.
    ribbon((x) => top(x) - H * 0.018, (x) => top(x) + H * 0.006);
    ctx.globalAlpha = k * (0.24 - i * 0.08);
    ctx.fillStyle = "#9b6bff";
    ctx.fill();
    // Vertical rays.
    ctx.globalAlpha = k * 0.12;
    ctx.fillStyle = "#c8ffe2";
    for (let x = ((t * 30 * (i + 1)) % 30) - 30; x < W; x += 30) {
      const y0 = top(x);
      ctx.fillRect(Math.round(x), Math.round(y0), 2, Math.round(bottom(x) - y0));
    }
  }
  ctx.restore();
}

// --- Detailed layer art: crisp shapes, no blur ---

export interface CloudShape {
  x: number;
  dy: number;
  w: number;
  h: number;
  /** Union of the cloud's puffs, baseline at y = 0. */
  body: Path2D;
  /** Smaller, up-and-left puffs: the sunlit tops. */
  light: Path2D;
}

export interface Deck {
  km: number;
  kind: "cumulus" | "cirrus";
  /** 1 = nearest: moves fastest, biggest, most contrast. */
  depth: number;
  tile: number;
  clouds: CloudShape[];
  /** Screen thickness, for knowing when the rocket is inside the deck. */
  thick: number;
}

function cumulusShape(rand: () => number, scale: number): Omit<CloudShape, "x" | "dy"> {
  const w = (170 + rand() * 260) * scale;
  const h = w * (0.32 + rand() * 0.18);
  const n = 5 + Math.floor(rand() * 4);
  const body = new Path2D();
  const light = new Path2D();
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1);
    const r = h * (0.32 + rand() * 0.22) * (0.55 + 0.45 * Math.sin(Math.PI * f));
    const cx = -w * 0.45 + f * w * 0.9 + (rand() - 0.5) * w * 0.05;
    const cy = -r * 0.55 - h * 0.28 * Math.sin(Math.PI * f) * (0.7 + rand() * 0.3);
    body.moveTo(cx + r, cy);
    body.arc(cx, cy, r, 0, Math.PI * 2);
    const lr = r * 0.6;
    light.moveTo(cx - r * 0.18 + lr, cy - r * 0.3);
    light.arc(cx - r * 0.18, cy - r * 0.3, lr, 0, Math.PI * 2);
  }
  return { w, h, body, light };
}

/** Cloud decks at different depths: big puffy cumulus near, smaller ones farther up, cirrus near the tropopause. */
export function makeDecks(rand: () => number): Deck[] {
  const deck = (km: number, depth: number, count: number): Deck => {
    const tile = 2600;
    const clouds: CloudShape[] = [];
    for (let i = 0; i < count; i++) {
      const shape = cumulusShape(rand, 0.45 + depth * 0.65);
      clouds.push({ ...shape, x: ((i + rand() * 0.6) / count) * tile, dy: (rand() - 0.5) * 70 * depth });
    }
    return { km, kind: "cumulus", depth, tile, clouds, thick: 160 * depth };
  };
  const cirrus = (km: number): Deck => {
    const tile = 2400;
    const clouds: CloudShape[] = [];
    for (let i = 0; i < 18; i++) {
      const body = new Path2D();
      const rx = 80 + rand() * 240;
      const ry = 2 + rand() * 3.5;
      body.ellipse(0, 0, rx, ry, (rand() - 0.5) * 0.06, 0, Math.PI * 2);
      clouds.push({ x: rand() * tile, dy: (rand() - 0.5) * 90, w: rx * 2, h: ry * 2, body, light: new Path2D() });
    }
    return { km, kind: "cirrus", depth: 0.35, tile, clouds, thick: 40 };
  };
  return [cirrus(9.5), deck(5.5, 0.45, 6), deck(2.8, 0.72, 5), deck(1.4, 1, 4)];
}

/** Screen y of a deck at `km` while the rocket (at `centerY`) is at `altKm`: nearer decks scroll faster. */
export const deckY = (d: Deck, altKm: number, centerY: number, H: number) => centerY + (altKm - d.km) * H * (0.2 + 0.25 * d.depth);

/** Flat three-tone cartoon clouds: sunlit tops, white body, a shaded flat underside. */
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
  if (alpha <= 0.01 || y < -d.thick * 2 || y > H + d.thick * 2) return;
  const shift = -(((downKm * 60 + t * 10) * d.depth) % d.tile);
  // Far decks pick up the sky's blue (aerial perspective).
  const far = 1 - d.depth;
  const body = rgba(mix([248, 251, 255], [120, 175, 225], far * 0.45), 1);
  const lit = rgba(mix([255, 255, 255], [190, 220, 245], far * 0.4), 1);
  const shade = rgba(mix([176, 198, 226], [80, 130, 190], far * 0.5), 1);
  ctx.save();
  ctx.globalAlpha = alpha * (d.kind === "cirrus" ? 0.6 : 1);
  for (let x0 = shift - d.tile; x0 < W + d.tile; x0 += d.tile) {
    for (const c of d.clouds) {
      const cx = Math.round(x0 + c.x);
      if (cx < -c.w || cx > W + c.w) continue;
      const cy = Math.round(y + c.dy);
      ctx.save();
      ctx.translate(cx, cy);
      if (d.kind === "cirrus") {
        ctx.fillStyle = "#ffffff";
        ctx.fill(c.body);
        ctx.restore();
        continue;
      }
      // Shade: the same puffs nudged down, so each puff gets a crescent of shadow underneath.
      ctx.translate(0, Math.round(c.h * 0.12));
      ctx.fillStyle = shade;
      ctx.fill(c.body);
      ctx.translate(0, -Math.round(c.h * 0.12));
      ctx.fillStyle = body;
      ctx.fill(c.body);
      ctx.fillStyle = lit;
      ctx.fill(c.light);
      ctx.restore();
    }
  }
  ctx.restore();
}

/** An airliner cruising near 10 km with its contrail. */
export function drawPlane(ctx: CanvasRenderingContext2D, W: number, y: number, t: number, alpha: number) {
  if (alpha <= 0.01) return;
  const x = W + 120 - ((t * 70) % (W + 400));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y));
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillRect(18, -1, Math.min(320, W), 2);
  ctx.fillRect(18, 3, Math.min(260, W), 1);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-2, 0);
  ctx.lineTo(6, 9);
  ctx.lineTo(10, 9);
  ctx.lineTo(6, 0);
  ctx.moveTo(-2, 0);
  ctx.lineTo(6, -8);
  ctx.lineTo(9, -8);
  ctx.lineTo(6, 0);
  ctx.moveTo(14, -1);
  ctx.lineTo(19, -8);
  ctx.lineTo(21, -8);
  ctx.lineTo(19, 0);
  ctx.fill();
  ctx.restore();
}

/** A weather balloon drifting at about 30 km. */
export function drawBalloon(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, font: string) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y));
  ctx.fillStyle = "#f4f6fa";
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c9d3e2";
  ctx.beginPath();
  ctx.ellipse(6, 4, 14, 20, 0, -0.4, Math.PI * 0.9);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-9, -14, 5, 9);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0.5, 26);
  ctx.lineTo(0.5, 62);
  ctx.stroke();
  ctx.fillStyle = "#ff4b3e";
  ctx.fillRect(-6, 62, 12, 9);
  ctx.font = `700 10px ${font}`;
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "1.4px";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText("WEATHER BALLOON · 30 KM", 30, 4);
  ctx.restore();
}

/** A small satellite with a blinking beacon. */
export function drawSatellite(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, alpha: number) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(-0.3);
  ctx.fillStyle = "#1c2a3c";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  for (const sx of [-17, 7]) {
    ctx.fillRect(sx, -3, 10, 6);
    ctx.strokeRect(sx + 0.5, -2.5, 9, 5);
  }
  ctx.fillStyle = "#e6e6e6";
  ctx.fillRect(-5, -4, 10, 8);
  if (Math.floor(t * 2) % 2 === 0) {
    ctx.fillStyle = "#ff4b3e";
    ctx.fillRect(-1, -7, 2, 2);
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
  ctx.fillStyle = "#0b1d36";
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
    [-10, 10, "rgba(28,74,128,1)"],
    [0, 2, "rgba(170,225,255,1)"],
    [2, 3, "rgba(90,165,255,0.55)"],
    [5, 5, "rgba(70,130,240,0.22)"],
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
