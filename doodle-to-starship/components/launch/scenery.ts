import type { DestinationId } from "@/lib/design";
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

export function drawSky(ctx: CanvasRenderingContext2D, W: number, H: number, pal: Palette, altKm: number, alpha: number) {
  const top = mix(pal.nightHigh, pal.night, clamp01(altKm / 60));
  const bottom = mix([22, 48, 90], pal.night, clamp01(altKm / 90));
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

/** Blue air glow sitting on the horizon (or the bottom of the screen once the ground is gone). */
export function drawHorizonGlow(ctx: CanvasRenderingContext2D, W: number, H: number, y: number, intensity: number) {
  if (intensity <= 0.01) return;
  const top = y - H * 0.45;
  const g = ctx.createLinearGradient(0, y, 0, top);
  g.addColorStop(0, `rgba(70,120,200,${0.32 * intensity})`);
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
  ctx.fillStyle = "#080b12";
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

/** Earth's limb rising from the bottom of the screen, rise 0..1. */
export function drawLimb(ctx: CanvasRenderingContext2D, W: number, H: number, rise: number, chalk: RGB) {
  if (rise <= 0) return;
  const R = Math.max(W, H) * 1.6;
  const cx = W / 2;
  const cy = H + R - rise * H * 0.24;
  const top = cy - R;
  const g = ctx.createLinearGradient(0, top, 0, top + H * 0.3);
  g.addColorStop(0, "#1d4f80");
  g.addColorStop(0.18, "#0f2c4d");
  g.addColorStop(1, "#060c18");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [lw, a] of [
    [44, 0.05],
    [20, 0.1],
    [7, 0.3],
  ] as const) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = `rgba(110,170,255,${a})`;
    ctx.beginPath();
    ctx.arc(cx, cy, R + lw * 0.25, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = rgba(chalk, 0.85);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI, Math.PI * 2);
  ctx.stroke();
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
