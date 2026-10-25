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

/** Dusk blue in the troposphere, darkening through the stratosphere, black by the Kármán line. */
function skyColors(altKm: number): [RGB, RGB] {
  const stops: [number, RGB, RGB][] = [
    [0, [24, 62, 116], [70, 118, 176]],
    [12, [18, 48, 96], [52, 98, 156]],
    [30, [12, 30, 64], [32, 66, 116]],
    [50, [8, 16, 36], [17, 36, 70]],
    [80, [6, 9, 19], [10, 18, 36]],
    [100, [0, 0, 0], [2, 3, 5]],
  ];
  for (let i = 1; i < stops.length; i++) {
    const [km, top, bottom] = stops[i];
    if (altKm <= km) {
      const [km0, top0, bottom0] = stops[i - 1];
      const k = (altKm - km0) / (km - km0);
      return [mix(top0, top, k), mix(bottom0, bottom, k)];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2]];
}

export function drawSky(ctx: CanvasRenderingContext2D, W: number, H: number, pal: Palette, altKm: number, alpha: number) {
  const [top, bottom] = skyColors(Math.max(0, altKm));
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgba(top, 1));
  g.addColorStop(1, rgba(bottom, 1));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
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

/** Thermosphere aurora: green-to-violet curtains shimmering low on the screen, k 0..1. */
export function drawAurora(ctx: CanvasRenderingContext2D, W: number, H: number, k: number, t: number, base: number) {
  if (k <= 0.01) return;
  const g = ctx.createLinearGradient(0, base - H * 0.3, 0, base);
  g.addColorStop(0, "rgba(150,90,220,0)");
  g.addColorStop(0.35, "rgba(150,90,220,0.55)");
  g.addColorStop(0.75, "rgba(76,195,138,0.9)");
  g.addColorStop(1, "rgba(76,195,138,0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  for (let band = 0; band < 2; band++) {
    for (let x = -8; x < W + 8; x += 4) {
      const ph = x * 0.005 + t * (0.3 + band * 0.18) + band * 2.1;
      const y = base - H * (0.01 + band * 0.03) + Math.sin(ph) * H * 0.012 + Math.sin(ph * 2.3 + 1) * H * 0.006;
      const h = H * (0.06 + 0.1 * (0.5 + 0.5 * Math.sin(ph * 1.7 + t * 0.8)));
      ctx.globalAlpha = Math.max(0, k * (0.09 + 0.07 * Math.sin(x * 0.04 + t * 2.6 + band)));
      ctx.fillRect(x, y - h, 4, h);
    }
  }
  ctx.restore();
}

// --- Detailed layer art: crisp shapes, no blur ---

export interface Deck {
  km: number;
  kind: "cumulus" | "alto" | "cirrus";
  /** Parallax: how fast the deck slides sideways. */
  depth: number;
  /** One tile of the deck's shape, `tile` px wide, drawn repeatedly across the screen. */
  shape: Path2D;
  rim: Path2D;
  tile: number;
  thick: number;
}

/** Three cloud decks: puffy cumulus low, patchy altocumulus mid, cirrus streaks near the tropopause. */
export function makeDecks(rand: () => number): Deck[] {
  const decks: Deck[] = [];
  const cumulus = (km: number, depth: number, thick: number) => {
    const tile = 1800;
    const shape = new Path2D();
    const rim = new Path2D();
    let x = 0;
    while (x < tile) {
      const w = 140 + rand() * 260;
      const bodyH = thick * (0.35 + rand() * 0.4);
      shape.rect(x, -bodyH * 0.25, w, bodyH * 0.6);
      // Billowing tops: many overlapping domes, tallest in the middle.
      const domes = 6 + Math.floor(rand() * 4);
      for (let k = 0; k < domes; k++) {
        const f = k / (domes - 1);
        const r = w * (0.07 + rand() * 0.07) * (0.7 + 0.6 * Math.sin(Math.PI * f));
        const cx = x + w * (0.06 + 0.88 * f) + (rand() - 0.5) * 12;
        const cy = -bodyH * (0.1 + 0.35 * Math.sin(Math.PI * f) * (0.6 + rand() * 0.4));
        shape.moveTo(cx + r, cy);
        shape.arc(cx, cy, r, 0, Math.PI * 2);
        rim.moveTo(cx + r * Math.cos(Math.PI * 1.15), cy + r * Math.sin(Math.PI * 1.15));
        rim.arc(cx, cy, r, Math.PI * 1.15, Math.PI * 1.85);
      }
      x += w + 60 + rand() * 260;
    }
    decks.push({ km, kind: "cumulus", depth, shape, rim, tile, thick });
  };
  const alto = (km: number, depth: number) => {
    const tile = 1500;
    const shape = new Path2D();
    const rim = new Path2D();
    for (let i = 0; i < 70; i++) {
      const cx = rand() * tile;
      const cy = (rand() - 0.5) * 50;
      const r = 8 + rand() * 18;
      shape.moveTo(cx + r * 1.6, cy);
      shape.ellipse(cx, cy, r * 1.6, r * 0.8, 0, 0, Math.PI * 2);
      rim.moveTo(cx - r * 1.4, cy - r * 0.3);
      rim.ellipse(cx, cy, r * 1.6, r * 0.8, 0, Math.PI * 1.1, Math.PI * 1.9);
    }
    decks.push({ km, kind: "alto", depth, shape, rim, tile, thick: 60 });
  };
  const cirrus = (km: number, depth: number) => {
    const tile = 2000;
    const shape = new Path2D();
    for (let i = 0; i < 26; i++) {
      const cx = rand() * tile;
      const cy = (rand() - 0.5) * 70;
      const rx = 90 + rand() * 260;
      const ry = 1.5 + rand() * 3.5;
      shape.moveTo(cx + rx, cy);
      shape.ellipse(cx, cy, rx, ry, (rand() - 0.5) * 0.08, 0, Math.PI * 2);
    }
    decks.push({ km, kind: "cirrus", depth, shape, rim: new Path2D(), tile, thick: 40 });
  };
  cumulus(1.6, 1, 220);
  cumulus(3.2, 0.8, 160);
  alto(6, 0.6);
  cirrus(10.5, 0.4);
  return decks;
}

/** Screen y of a cloud deck at `km` while the rocket (at `centerY`) is at `altKm`. */
export const deckY = (d: Deck, altKm: number, centerY: number, H: number) => centerY + (altKm - d.km) * H * 0.32;

/** Draws one deck: lit tops, slate undersides, crisp edges. */
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
  const shift = -(((downKm * 60 + t * 12) * d.depth) % d.tile);
  const top = d.kind === "cirrus" ? "rgba(255,236,222,0.55)" : "rgba(255,236,220,0.97)";
  const under = d.kind === "cirrus" ? "rgba(200,210,230,0.35)" : "rgba(104,120,148,0.97)";
  const g = ctx.createLinearGradient(0, y - d.thick * 0.6, 0, y + d.thick * 0.35);
  g.addColorStop(0, top);
  g.addColorStop(1, under);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let x = shift - d.tile; x < W + d.tile; x += d.tile) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (d.kind !== "cirrus") {
      // Crisp slate underside peeking out below the lit body.
      ctx.translate(0, Math.round(d.thick * 0.07));
      ctx.fillStyle = under;
      ctx.fill(d.shape);
      ctx.translate(0, -Math.round(d.thick * 0.07));
    }
    ctx.fillStyle = g;
    ctx.fill(d.shape);
    ctx.restore();
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
