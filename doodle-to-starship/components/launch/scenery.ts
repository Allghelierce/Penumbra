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
    // A deeper tone toward the top of each layer, fading into it, so the bands read as painted
    // without a second hard edge that could pass for a boundary.
    if (b.to !== Infinity && b.from < 700) {
      const tone = Math.min((yBottom - yTop) * 0.35, H * 0.8);
      const shade = ctx.createLinearGradient(0, yTop, 0, yTop + tone);
      shade.addColorStop(0, rgba(mix(b.color, [0, 0, 20], 0.16), 1));
      shade.addColorStop(1, rgba(b.color, 0));
      ctx.fillStyle = shade;
      ctx.fillRect(0, Math.floor(yTop), W, Math.ceil(tone));
    }
    // A crisp lighter rim along the band's lower edge, where it meets the layer below.
    if (b.from > 0 && yBottom < H) {
      ctx.fillStyle = rgba(b.rim, 0.55);
      ctx.fillRect(0, Math.round(yBottom) - 2, W, 2);
    }
  }
  drawSun(ctx, W, H, alt);
  drawBirds(ctx, W, H, alt);
  drawHelicopter(ctx, W, H, alt);
  drawStorm(ctx, W, H, alt, centerY);
  drawCirrus(ctx, W, H, alt, centerY);
  drawNacreous(ctx, W, H, alt, centerY);
  drawScienceBalloon(ctx, W, H, alt, centerY);
  drawBlueJet(ctx, W, H, alt, centerY);
  drawSprite(ctx, W, H, alt, centerY);
  drawNoctilucent(ctx, W, H, alt, centerY);
  drawElve(ctx, W, H, alt, centerY);
  drawStarlinkTrain(ctx, W, H, alt, centerY);
  drawLandmarks(ctx, W, H, alt, centerY);
  ctx.globalAlpha = 1;
}

type LandmarkIcon =
  | "tower"
  | "mountain"
  | "airliner"
  | "vulture"
  | "delta"
  | "glider"
  | "blackbird"
  | "fighter"
  | "parachute"
  | "balloon"
  | "volcano"
  | "sprite"
  | "ripple"
  | "meteor"
  | "rocketplane"
  | "aurora"
  | "decay"
  | "sputnik"
  | "capsule"
  | "telescope"
  | "train";

/**
 * Famous things at their real heights, down the left edge, so the climb has a sense of scale.
 * (The weather balloon at 30 km and the ISS at 408 km already carry their own labels.)
 */
const LANDMARKS: { km: number; label: string; icon: LandmarkIcon }[] = [
  { km: 0.83, label: "Burj Khalifa", icon: "tower" },
  { km: 4, label: "Skydivers jump", icon: "parachute" },
  { km: 8.8, label: "Everest", icon: "mountain" },
  { km: 10, label: "Airliners cruise", icon: "airliner" },
  // Struck by an airliner over Côte d'Ivoire in 1973: the highest bird on record.
  { km: 11.3, label: "Rüppell's vulture", icon: "vulture" },
  { km: 18, label: "Concorde", icon: "delta" },
  { km: 21, label: "U-2 spy plane", icon: "glider" },
  // The record for sustained level flight, 1976.
  { km: 25.9, label: "SR-71 Blackbird", icon: "blackbird" },
  // The jet altitude record, a zoom climb in 1977.
  { km: 37.7, label: "MiG-25 zoom climb", icon: "fighter" },
  { km: 41, label: "Record skydive", icon: "parachute" },
  // JAXA's BU60-1, the highest an uncrewed balloon has flown, 2002.
  { km: 53, label: "Highest balloon", icon: "balloon" },
  // The 2022 eruption's plume, the highest ever measured.
  { km: 57, label: "Hunga Tonga eruption", icon: "volcano" },
  { km: 70, label: "Red sprites", icon: "sprite" },
  { km: 82, label: "Highest clouds", icon: "ripple" },
  { km: 85, label: "Meteors burn up", icon: "meteor" },
  // Flight 91 in 1963, the highest an airplane has flown.
  { km: 108, label: "X-15 rocket plane", icon: "rocketplane" },
  { km: 110, label: "Northern lights", icon: "aurora" },
  // Thin air still drags hard enough here to pull a satellite down within days.
  { km: 160, label: "Orbits last only days", icon: "decay" },
  // Perigee of the first satellite, 1957.
  { km: 215, label: "Sputnik 1", icon: "sputnik" },
  // Apogee of the first crewed orbit, 1961.
  { km: 327, label: "Gagarin's Vostok 1", icon: "capsule" },
  { km: 540, label: "Hubble", icon: "telescope" },
  { km: 550, label: "Starlink", icon: "train" },
];

let landmarkFont: string | null = null;

/** The same display face the layer labels use. */
function displayFont() {
  if (landmarkFont === null) {
    landmarkFont =
      (typeof document !== "undefined" &&
        getComputedStyle(document.documentElement).getPropertyValue("--font-barlow-condensed").trim()) ||
      "sans-serif";
  }
  return landmarkFont;
}

function drawLandmarks(ctx: CanvasRenderingContext2D, W: number, H: number, alt: number, centerY: number) {
  const base = ctx.globalAlpha;
  ctx.save();
  ctx.font = `600 11px ${displayFont()}`;
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "1.4px";
  ctx.textBaseline = "middle";
  for (const m of LANDMARKS) {
    let y = featureY(alt, m.km, centerY, H);
    if (y < -20 || y > H + 20) continue;
    // Step down past a layer-boundary pill at nearly the same height.
    for (const b of BOUNDARIES) {
      const by = layerY(alt, b.km, centerY, (H * 2.6) / b.km);
      if (Math.abs(by - y) < 26) y = by + 26;
    }
    // Fade near the top and bottom, where the header and the readouts sit.
    const edge = clamp01(Math.min((y - H * 0.08) / (H * 0.08), (H * 0.84 - y) / (H * 0.08)));
    if (edge <= 0) continue;
    const label = `${m.label.toUpperCase()} · ${m.km < 1 ? m.km.toFixed(1) : m.km.toLocaleString("en-US")} KM`;
    const x = 30;
    ctx.globalAlpha = base * 0.85 * edge;
    drawLandmarkIcon(ctx, m.icon, x + 7, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x + 22, y + 1);
    // A dotted guide toward the rocket marks the height.
    const tw = ctx.measureText(label).width;
    ctx.globalAlpha = base * 0.3 * edge;
    ctx.fillStyle = "#ffffff";
    for (let gx = x + 30 + tw; gx < W * 0.4; gx += 7) ctx.fillRect(gx, y, 2, 1);
  }
  ctx.restore();
  ctx.globalAlpha = base;
}

/** Small flat pictograms, about 14 px, centered on (x, y). */
function drawLandmarkIcon(ctx: CanvasRenderingContext2D, icon: LandmarkIcon, x: number, y: number) {
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  switch (icon) {
    case "tower":
      ctx.moveTo(x - 4, y + 7);
      ctx.lineTo(x - 1.5, y - 2);
      ctx.lineTo(x - 0.5, y - 8);
      ctx.lineTo(x + 0.5, y - 8);
      ctx.lineTo(x + 1.5, y - 2);
      ctx.lineTo(x + 4, y + 7);
      ctx.closePath();
      ctx.fill();
      return;
    case "mountain":
      ctx.moveTo(x - 7, y + 6);
      ctx.lineTo(x - 1, y - 6);
      ctx.lineTo(x + 7, y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgb(90,130,190)";
      ctx.beginPath();
      ctx.moveTo(x - 4.2, y + 0.4);
      ctx.lineTo(x - 2.2, y + 2);
      ctx.lineTo(x - 0.5, y + 0.4);
      ctx.lineTo(x + 1.6, y + 2.2);
      ctx.lineTo(x + 3.6, y + 1);
      ctx.lineTo(x + 7, y + 6);
      ctx.lineTo(x - 7, y + 6);
      ctx.closePath();
      ctx.fill();
      return;
    case "airliner":
      ctx.moveTo(x - 7, y);
      ctx.lineTo(x + 7, y);
      ctx.moveTo(x + 1, y);
      ctx.lineTo(x - 3, y - 5);
      ctx.moveTo(x + 1, y);
      ctx.lineTo(x - 3, y + 5);
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x - 7.5, y - 3);
      ctx.stroke();
      return;
    case "delta":
      ctx.moveTo(x + 7, y);
      ctx.lineTo(x - 6, y - 5);
      ctx.lineTo(x - 4, y);
      ctx.lineTo(x - 6, y + 5);
      ctx.closePath();
      ctx.fill();
      return;
    case "glider":
      // The U-2 from above: wings far longer than the body.
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 7, y);
      ctx.moveTo(x + 1, y - 8);
      ctx.lineTo(x + 1, y + 8);
      ctx.moveTo(x - 5.5, y - 2.5);
      ctx.lineTo(x - 5.5, y + 2.5);
      ctx.stroke();
      return;
    case "vulture":
      // Soaring, with the fingered wingtips of a big raptor.
      ctx.moveTo(x - 8, y - 1);
      ctx.quadraticCurveTo(x - 4, y - 4, x, y + 1);
      ctx.quadraticCurveTo(x + 4, y - 4, x + 8, y - 1);
      for (const sx of [-1, 1]) {
        ctx.moveTo(x + sx * 8, y - 1);
        ctx.lineTo(x + sx * 9.6, y - 2.6);
        ctx.moveTo(x + sx * 8, y - 1);
        ctx.lineTo(x + sx * 9.8, y - 0.4);
      }
      ctx.stroke();
      return;
    case "blackbird":
      // SR-71 from above: a long chined nose, a delta and two engine nacelles.
      ctx.moveTo(x + 9, y);
      ctx.lineTo(x - 2, y - 1.4);
      ctx.lineTo(x - 8, y - 0.8);
      ctx.lineTo(x - 8, y + 0.8);
      ctx.lineTo(x - 2, y + 1.4);
      ctx.closePath();
      ctx.moveTo(x + 1, y);
      ctx.lineTo(x - 6, y - 6);
      ctx.lineTo(x - 6, y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x - 7.5, y - 4.6, 6, 1.6);
      ctx.fillRect(x - 7.5, y + 3, 6, 1.6);
      return;
    case "fighter":
      // MiG-25 from above: swept wings and twin tails.
      ctx.moveTo(x + 9.5, y);
      ctx.lineTo(x + 6, y - 1.3);
      ctx.lineTo(x + 1, y - 1.3);
      ctx.lineTo(x - 3, y - 6.5);
      ctx.lineTo(x - 5.5, y - 6.5);
      ctx.lineTo(x - 4.5, y - 1.3);
      ctx.lineTo(x - 6, y - 1.3);
      ctx.lineTo(x - 8.5, y - 4);
      ctx.lineTo(x - 9.5, y - 4);
      ctx.lineTo(x - 8.5, y);
      ctx.lineTo(x - 9.5, y + 4);
      ctx.lineTo(x - 8.5, y + 4);
      ctx.lineTo(x - 6, y + 1.3);
      ctx.lineTo(x - 4.5, y + 1.3);
      ctx.lineTo(x - 5.5, y + 6.5);
      ctx.lineTo(x - 3, y + 6.5);
      ctx.lineTo(x + 1, y + 1.3);
      ctx.lineTo(x + 6, y + 1.3);
      ctx.closePath();
      ctx.fill();
      return;
    case "balloon":
      // A stratospheric balloon: a tall envelope on a long line to a small gondola.
      ctx.ellipse(x, y - 3, 4, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 2);
      ctx.lineTo(x, y + 6);
      ctx.stroke();
      ctx.fillRect(x - 1.5, y + 6, 3, 2.5);
      return;
    case "volcano":
      ctx.moveTo(x - 7, y + 6);
      ctx.lineTo(x - 2, y);
      ctx.lineTo(x + 2, y);
      ctx.lineTo(x + 7, y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgb(200,204,214)";
      ctx.beginPath();
      ctx.arc(x, y - 3, 2.4, 0, Math.PI * 2);
      ctx.arc(x + 2.2, y - 6.5, 2.8, 0, Math.PI * 2);
      ctx.arc(x - 1.5, y - 8.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "sprite":
      ctx.fillStyle = "rgb(255,96,120)";
      ctx.strokeStyle = "rgb(255,96,120)";
      ctx.ellipse(x, y - 2, 5.5, 3.5, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (const dx of [-3.5, -1.2, 1.2, 3.5]) {
        ctx.moveTo(x + dx, y - 1.5);
        ctx.lineTo(x + dx * 0.8, y + 6);
      }
      ctx.stroke();
      return;
    case "ripple":
      ctx.strokeStyle = "rgb(160,230,255)";
      ctx.lineWidth = 1.2;
      for (const dy of [-3, 1, 5]) {
        ctx.moveTo(x - 7, y + dy);
        ctx.quadraticCurveTo(x - 3.5, y + dy - 2.5, x, y + dy);
        ctx.quadraticCurveTo(x + 3.5, y + dy + 2.5, x + 7, y + dy);
      }
      ctx.stroke();
      return;
    case "meteor":
      ctx.strokeStyle = "rgb(255,214,160)";
      ctx.fillStyle = "rgb(255,236,200)";
      ctx.moveTo(x - 8, y - 6);
      ctx.lineTo(x + 3, y + 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 4, y + 4, 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "rocketplane":
      // X-15: a black dart with stubby wings and its rocket lit.
      ctx.moveTo(x + 9, y);
      ctx.lineTo(x + 5, y - 1.5);
      ctx.lineTo(x - 7, y - 1.5);
      ctx.lineTo(x - 7, y + 1.5);
      ctx.lineTo(x + 5, y + 1.5);
      ctx.closePath();
      ctx.moveTo(x, y - 1.5);
      ctx.lineTo(x - 3, y - 5);
      ctx.lineTo(x - 5, y - 5);
      ctx.lineTo(x - 4, y - 1.5);
      ctx.moveTo(x, y + 1.5);
      ctx.lineTo(x - 3, y + 5);
      ctx.lineTo(x - 5, y + 5);
      ctx.lineTo(x - 4, y + 1.5);
      ctx.fill();
      ctx.fillStyle = "rgb(255,170,90)";
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 1.1);
      ctx.lineTo(x - 11, y);
      ctx.lineTo(x - 7, y + 1.1);
      ctx.closePath();
      ctx.fill();
      return;
    case "decay":
      // An orbit spiralling in.
      ctx.lineWidth = 1.2;
      for (let i = 0; i <= 30; i++) {
        const th = -Math.PI / 2 + i * 0.27;
        const rr = 7.5 - i * 0.16;
        ctx.lineTo(x + Math.cos(th) * rr, y + Math.sin(th) * rr);
      }
      ctx.stroke();
      ctx.fillStyle = "rgb(90,150,230)";
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "sputnik":
      // A polished ball trailing four whip antennas.
      ctx.lineWidth = 1;
      for (const [ax, ay] of [
        [-8, -5],
        [-9, -1.5],
        [-8.5, 2.5],
        [-6.5, 6],
      ]) {
        ctx.moveTo(x + 1, y);
        ctx.lineTo(x + ax, y + ay);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 2.5, y - 0.5, 3.2, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "capsule":
      // Vostok: the ball Gagarin rode in, on its cone-shaped equipment module.
      ctx.moveTo(x - 0.5, y - 2.6);
      ctx.lineTo(x - 7.5, y - 4.2);
      ctx.lineTo(x - 7.5, y + 4.2);
      ctx.lineTo(x - 0.5, y + 2.6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 2.5, y, 3.8, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "parachute":
      ctx.arc(x, y - 1, 6, Math.PI, 0);
      ctx.moveTo(x - 6, y - 1);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x + 6, y - 1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y + 6, 1.4, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "aurora":
      ctx.strokeStyle = "rgb(120,255,170)";
      for (const dx of [-4, 0, 4]) {
        ctx.moveTo(x + dx, y + 6);
        ctx.quadraticCurveTo(x + dx + 2, y, x + dx, y - 6);
      }
      ctx.stroke();
      return;
    case "telescope":
      ctx.fillRect(x - 2, y - 5, 4, 10);
      ctx.fillRect(x - 8, y - 2, 5, 4);
      ctx.fillRect(x + 3, y - 2, 5, 4);
      return;
    case "train":
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 7 + i * 4, y + 3 - i * 2, 2, 2);
      return;
  }
}

/** Screen y of something that sits at `km`, with the same mapping the layer boundaries use. */
const featureY = (alt: number, km: number, centerY: number, H: number) => centerY + (alt - km) * ((H * 2.6) / km);

/** A small flock near the pad at liftoff, sinking out of view as the rocket climbs. */
function drawBirds(ctx: CanvasRenderingContext2D, W: number, H: number, alt: number) {
  const k = clamp01(1 - alt / 3);
  if (k <= 0) return;
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * 0.7 * k;
  ctx.strokeStyle = "rgb(24,52,86)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const flock: [number, number, number][] = [
    [0.27, 0.34, 1],
    [0.3, 0.32, 0.8],
    [0.25, 0.37, 0.7],
    [0.33, 0.36, 0.9],
  ];
  for (const [fx, fy, s] of flock) {
    const x = fx * W;
    const y = fy * H + alt * H * 0.12;
    const r = 6 * s;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r * 0.35);
    ctx.quadraticCurveTo(x - r * 0.45, y - r * 0.7, x, y);
    ctx.quadraticCurveTo(x + r * 0.45, y - r * 0.7, x + r, y - r * 0.35);
    ctx.stroke();
  }
  ctx.globalAlpha = base;
}

/** Wall-clock seconds, for flicker that shouldn't depend on how fast the flight plays. */
const wallSeconds = () => (typeof performance === "undefined" ? 0 : performance.now() / 1000);

/** The storm's cauliflower tower in units of its size: [x, y, r], base at y = 1.1, anvil at y = -0.3. */
const STORM_PUFFS: [number, number, number][] = [
  [-0.5, 0.9, 0.26],
  [-0.1, 0.86, 0.33],
  [0.36, 0.9, 0.28],
  [-0.44, 0.5, 0.3],
  [0.02, 0.42, 0.37],
  [0.42, 0.52, 0.29],
  [-0.36, 0.08, 0.3],
  [0.08, -0.02, 0.36],
  [0.46, 0.1, 0.27],
];

/** Pouches hanging under the anvil's downwind side (mammatus). */
const MAMMATUS: [number, number][] = [
  [0.66, -0.31],
  [0.84, -0.335],
  [1.0, -0.36],
  [1.16, -0.39],
  [1.32, -0.42],
  [1.48, -0.455],
];

function anvilPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(-1.3, -0.47);
  ctx.quadraticCurveTo(-1.2, -0.63, -0.9, -0.64);
  ctx.lineTo(1.95, -0.67);
  ctx.lineTo(2.45, -0.6);
  ctx.quadraticCurveTo(1.9, -0.52, 1.5, -0.46);
  ctx.quadraticCurveTo(0.9, -0.33, 0.42, -0.28);
  ctx.lineTo(-0.42, -0.28);
  ctx.quadraticCurveTo(-0.95, -0.32, -1.3, -0.47);
  ctx.closePath();
}

/** A news helicopter hovering off the pad at liftoff, nose toward the rocket; it sinks out of view as the rocket climbs. */
function drawHelicopter(ctx: CanvasRenderingContext2D, W: number, H: number, alt: number) {
  const k = clamp01(1 - alt / 2.5);
  if (k <= 0) return;
  const base = ctx.globalAlpha;
  const now = wallSeconds();
  const x = W * 0.775;
  const y = H * 0.47 + alt * H * 0.22 + Math.sin(now * 1.3) * 2;
  ctx.save();
  ctx.globalAlpha = base * 0.8 * k;
  ctx.fillStyle = "rgb(24,52,86)";
  ctx.strokeStyle = "rgb(24,52,86)";
  ctx.lineCap = "round";
  // Cabin, tail boom and fin.
  ctx.beginPath();
  ctx.ellipse(x, y, 9, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + 5, y - 2.2, 17, 2.4);
  ctx.beginPath();
  ctx.moveTo(x + 20, y - 1.5);
  ctx.lineTo(x + 24, y - 8);
  ctx.lineTo(x + 25.5, y - 1);
  ctx.closePath();
  ctx.fill();
  // Canopy glass.
  ctx.fillStyle = "rgb(120,170,215)";
  ctx.beginPath();
  ctx.ellipse(x - 4.5, y - 1, 3.6, 2.8, 0, Math.PI * 0.95, Math.PI * 1.9);
  ctx.closePath();
  ctx.fill();
  // Skids.
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 9, y + 9);
  ctx.lineTo(x + 7, y + 9);
  ctx.moveTo(x - 4, y + 5);
  ctx.lineTo(x - 5, y + 9);
  ctx.moveTo(x + 3, y + 5);
  ctx.lineTo(x + 4, y + 9);
  ctx.stroke();
  // Rotor: the blade's apparent length swings as it turns.
  ctx.fillStyle = "rgb(24,52,86)";
  const blade = 4 + 18 * Math.abs(Math.cos(now * 21));
  ctx.fillRect(x - 0.75, y - 9, 1.5, 4);
  ctx.fillRect(x - blade, y - 9.5, blade * 2, 1.5);
  ctx.restore();
}

/**
 * A distant thunderstorm: a cauliflower cumulonimbus tower whose top spreads into a flat anvil
 * where it hits the tropopause, with an overshooting dome, mammatus under the anvil, a rain
 * shaft and forked lightning. Storms stop at the tropopause because the stratosphere above is
 * warmer and won't let the air keep rising; only the strongest updrafts poke a dome through.
 */
function drawStorm(ctx: CanvasRenderingContext2D, W: number, H: number, alt: number, centerY: number) {
  const y = featureY(alt, 10, centerY, H);
  if (y < -H * 0.35 || y > H + H * 0.3) return;
  const base = ctx.globalAlpha;
  // Left of the rocket, clear of the altitude ladder on the right.
  const x = W * 0.25;
  const s = H * 0.12;
  const lit = "rgb(240,246,252)";
  const body = "rgb(214,226,240)";
  const shade = "rgb(158,177,202)";
  const dark = "rgb(96,112,140)";
  // A double flash every second or so: the bolt brightens and the tower lights up from inside.
  const ph = wallSeconds() % 1.1;
  const flash = ph < 0.07 || (ph > 0.15 && ph < 0.2);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Rain shaft under the base, slanting with the wind.
  ctx.globalAlpha = base * 0.14;
  ctx.fillStyle = "rgb(120,142,172)";
  ctx.beginPath();
  ctx.moveTo(-0.5, 1.1);
  ctx.lineTo(0.44, 1.1);
  ctx.lineTo(0.28, 1.95);
  ctx.lineTo(-0.68, 1.95);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = base * 0.35;
  ctx.strokeStyle = "rgb(140,160,190)";
  ctx.lineWidth = 1.1 / s;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const rx = -0.46 + i * 0.1;
    const len = 0.5 + ((i * 37) % 5) * 0.08;
    ctx.moveTo(rx, 1.14);
    ctx.lineTo(rx - len * 0.18, 1.14 + len);
  }
  ctx.stroke();

  // Tower: shade puffs nudged down-right, then the body, then sunlit tops up-left; clipped flat at the base.
  ctx.globalAlpha = base * 0.95;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-1, -0.6, 2, 1.7);
  ctx.clip();
  const puffs = (dx: number, dy: number, k: number) => {
    ctx.beginPath();
    for (const [px, py, r] of STORM_PUFFS) {
      ctx.moveTo(px + dx + r * k, py + dy);
      ctx.arc(px + dx, py + dy, r * k, 0, Math.PI * 2);
    }
  };
  ctx.fillStyle = shade;
  puffs(0.05, 0.06, 1);
  ctx.fill();
  ctx.fillStyle = body;
  puffs(0, 0, 1);
  ctx.fill();
  ctx.fillStyle = lit;
  puffs(-0.08, -0.09, 0.62);
  ctx.fill();
  if (flash) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = base * 0.3;
    ctx.fillStyle = "rgb(255,246,210)";
    puffs(0, 0, 1);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  // The dark, rain-heavy base: the bottom of the puffs in shadow, cut flat.
  ctx.beginPath();
  ctx.rect(-1, 0.97, 2, 0.13);
  ctx.clip();
  ctx.fillStyle = dark;
  puffs(0, 0, 1);
  ctx.fill();
  ctx.restore();

  // Anvil: the shade copy nudged down leaves a shadowed underside, then a sunlit top edge.
  ctx.save();
  ctx.translate(0, 0.05);
  ctx.fillStyle = shade;
  anvilPath(ctx);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = body;
  anvilPath(ctx);
  ctx.fill();
  ctx.fillStyle = lit;
  ctx.beginPath();
  ctx.moveTo(-1.05, -0.62);
  ctx.lineTo(1.95, -0.67);
  ctx.lineTo(2.35, -0.615);
  ctx.lineTo(1.9, -0.6);
  ctx.lineTo(-0.95, -0.575);
  ctx.closePath();
  ctx.fill();
  // Overshooting top: a dome punched up through the anvil by the strongest updraft.
  ctx.beginPath();
  ctx.arc(0.05, -0.64, 0.2, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0.05, -0.64, 0.2, -Math.PI * 0.35, 0);
  ctx.lineTo(0.05, -0.64);
  ctx.closePath();
  ctx.fill();
  // Fibrous streamers blown off the anvil's downwind edge.
  ctx.fillStyle = body;
  for (const [sy, len, a] of [
    [-0.655, 0.75, 0.7],
    [-0.6, 0.55, 0.5],
    [-0.55, 0.35, 0.35],
  ] as const) {
    ctx.globalAlpha = base * a;
    ctx.beginPath();
    ctx.moveTo(2.0, sy - 0.018);
    ctx.lineTo(2.0 + len, sy - 0.03);
    ctx.lineTo(2.0, sy + 0.018);
    ctx.closePath();
    ctx.fill();
  }
  // Mammatus pouches.
  ctx.globalAlpha = base * 0.95;
  ctx.fillStyle = shade;
  ctx.beginPath();
  for (const [mx, my] of MAMMATUS) {
    ctx.moveTo(mx + 0.085, my);
    ctx.arc(mx, my, 0.085, 0, Math.PI);
  }
  ctx.fill();

  // Forked lightning from the base, brighter in a flash.
  ctx.globalAlpha = base * (flash ? 1 : 0.75);
  ctx.strokeStyle = flash ? "rgb(255,252,220)" : "rgb(255,236,120)";
  ctx.lineWidth = (flash ? 2.6 : 2) / s;
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.moveTo(0.05, 1.11);
  ctx.lineTo(-0.08, 1.35);
  ctx.lineTo(0.04, 1.37);
  ctx.lineTo(-0.1, 1.62);
  ctx.lineTo(0, 1.64);
  ctx.lineTo(-0.13, 1.92);
  ctx.moveTo(0.04, 1.37);
  ctx.lineTo(0.17, 1.5);
  ctx.lineTo(0.13, 1.52);
  ctx.lineTo(0.25, 1.68);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = base;
}

/** A lens with a fuller top, for nacreous clouds. */
function lensPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, a: number, b: number) {
  ctx.beginPath();
  ctx.moveTo(cx - a, cy);
  ctx.quadraticCurveTo(cx, cy - b * 2, cx + a, cy);
  ctx.quadraticCurveTo(cx, cy + b * 1.2, cx - a, cy);
  ctx.closePath();
}

/** Nacreous lenses: [x, dy] as fractions of the screen, half-width of W, half-height of H. */
const NACREOUS: [number, number, number, number][] = [
  [0.21, 0, 0.12, 0.017],
  [0.37, 0.03, 0.075, 0.012],
  [0.1, 0.045, 0.06, 0.009],
  [0.47, -0.022, 0.05, 0.008],
];

/** Pastel bands from the rim in, like the inside of a shell. */
const PEARL: RGB[] = [
  [255, 176, 214],
  [255, 222, 168],
  [168, 242, 206],
  [150, 214, 246],
  [214, 190, 255],
  [252, 248, 255],
];

/**
 * Nacreous ("mother-of-pearl") clouds, the polar stratospheric clouds around 22 km: thin
 * lenses of ice crystals so small and even that they split sunlight into pastel bands.
 */
function drawNacreous(ctx: CanvasRenderingContext2D, W: number, H: number, alt: number, centerY: number) {
  const y = featureY(alt, 22, centerY, H);
  if (y < -60 || y > H + 60) return;
  const base = ctx.globalAlpha;
  for (const [fx, fdy, fa, fb] of NACREOUS) {
    const cx = W * fx;
    const cy = y + fdy * H;
    PEARL.forEach((c, i) => {
      const k = 1 - i * 0.15;
      ctx.globalAlpha = base * (i === 0 ? 0.42 : 0.5);
      ctx.fillStyle = rgba(c, 1);
      lensPath(ctx, cx, cy - (1 - k) * H * fb * 0.4, W * fa * k, H * fb * k);
      ctx.fill();
    });
  }
  ctx.globalAlpha = base;
}

/**
 * A super-pressure science balloon floating at about 33 km: a lobed pumpkin of thin film as
 * wide as a stadium, its parachute and instrument gondola hanging far below on the flight line.
 */
function drawScienceBalloon(ctx: CanvasRenderingContext2D, W: number, H: number, alt: number, centerY: number) {
  const y = featureY(alt, 33, centerY, H);
  if (y < -H * 0.3 || y > H + H * 0.1) return;
  const base = ctx.globalAlpha;
  const x = W * 0.3;
  const rx = H * 0.056;
  const ry = H * 0.04;
  ctx.save();
  ctx.lineCap = "round";
  // The flight line, with the packed parachute partway down and the gondola at the end.
  const bottom = y + ry + H * 0.15;
  ctx.globalAlpha = base * 0.85;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + ry);
  ctx.lineTo(x, bottom);
  ctx.stroke();
  ctx.fillStyle = "#ff8a3d";
  ctx.beginPath();
  ctx.ellipse(x, y + ry + H * 0.05, 3, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e6e6e6";
  ctx.fillRect(x - 5, bottom, 10, 8);
  ctx.fillStyle = "#1c2a3c";
  ctx.strokeStyle = "#ffffff";
  for (const sx of [-17, 7]) {
    ctx.fillRect(x + sx, bottom + 2, 10, 4);
    ctx.strokeRect(x + sx + 0.5, bottom + 2.5, 9, 3);
  }
  // The envelope: lit film, a shaded side, and the seams between its lobes.
  ctx.globalAlpha = base * 0.92;
  ctx.fillStyle = "rgb(238,242,250)";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgb(200,210,228)";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, -Math.PI / 2, Math.PI / 2);
  ctx.ellipse(x, y, rx * 0.45, ry, 0, Math.PI / 2, -Math.PI / 2, true);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(140,156,186,0.9)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const k = Math.sin((i * Math.PI) / 8);
    ctx.beginPath();
    ctx.ellipse(x, y, rx * k, ry, 0, -Math.PI / 2, Math.PI / 2);
    ctx.moveTo(x, y + ry);
    ctx.ellipse(x, y, rx * k, ry, 0, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x, y - ry);
  ctx.lineTo(x, y + ry);
  ctx.stroke();
  // The end fittings at top and bottom.
  ctx.fillStyle = "rgb(140,156,186)";
  ctx.fillRect(x - 3, y - ry - 1.5, 6, 3);
  ctx.fillRect(x - 2.5, y + ry - 1.5, 5, 3.5);
  // Its label, in the weather balloon's style.
  ctx.globalAlpha = base;
  ctx.font = `700 10px ${displayFont()}`;
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "1.4px";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("SCIENCE BALLOON · 33 KM", x + rx + 10, y);
  ctx.restore();
}

/**
 * Blue jets: narrow cones of blue light that shoot up out of thunderstorm tops into the
 * stratosphere, to about 40–50 km. Drawn as nested flat cones over the storm's column.
 */
function drawBlueJet(ctx: CanvasRenderingContext2D, W: number, H: number, alt: number, centerY: number) {
  const y = featureY(alt, 40, centerY, H);
  if (y < -H * 0.35 || y > H + H * 0.35) return;
  const base = ctx.globalAlpha;
  const x = W * 0.25;
  const s = H * 0.13;
  const yb = y + s * 1.1;
  const cones: [number, number, number, RGB][] = [
    [0.42, 1.25, 0.2, [70, 120, 255]],
    [0.26, 1.05, 0.32, [96, 156, 255]],
    [0.11, 0.8, 0.5, [190, 220, 255]],
  ];
  for (const [w, h, a, c] of cones) {
    const yt = yb - s * h * 1.95;
    // Bright where it leaves the storm top, fading out as it fans up.
    const grad = ctx.createLinearGradient(0, yb, 0, yt);
    grad.addColorStop(0, rgba(c, a));
    grad.addColorStop(0.6, rgba(c, a * 0.55));
    grad.addColorStop(1, rgba(c, 0));
    ctx.globalAlpha = base;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.035, yb);
    ctx.lineTo(x - s * w, yb - s * h * 1.6);
    ctx.quadraticCurveTo(x, yt, x + s * w, yb - s * h * 1.6);
    ctx.lineTo(x + s * 0.035, yb);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = base;
}

/**
 * Sprites: red jellyfish of light that flash above big thunderstorms around 70 km, with a
 * diffuse halo over a scalloped crown and carrot-shaped tendrils that fade to blue.
 */
function drawSprite(ctx: CanvasRenderingContext2D, W: number, H: number, alt: number, centerY: number) {
  const y = featureY(alt, 70, centerY, H);
  if (y < -H * 0.25 || y > H + H * 0.25) return;
  const base = ctx.globalAlpha;
  // Straight above the thunderstorm.
  const x = W * 0.25;
  const s = H * 0.075;
  // The halo: a flat disc of glow just above the crown.
  ctx.globalAlpha = base * 0.16;
  ctx.fillStyle = "rgb(255,110,120)";
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.5, s * 1.55, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tendrils first, so the crown sits over their tops; red at the top, blue at the tips.
  const grad = ctx.createLinearGradient(0, y, 0, y + s * 1.9);
  grad.addColorStop(0, "rgba(255,72,104,0.75)");
  grad.addColorStop(0.55, "rgba(206,72,196,0.5)");
  grad.addColorStop(1, "rgba(110,110,255,0)");
  ctx.globalAlpha = base;
  ctx.fillStyle = grad;
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  for (let i = -4; i <= 4; i++) {
    const tx = x + i * s * 0.2;
    const bx = x + i * s * 0.15 + Math.sin(i * 1.7) * s * 0.08;
    const len = s * (1.35 + 0.4 * Math.cos(i * 1.3));
    const w = s * (0.07 - Math.abs(i) * 0.006);
    ctx.beginPath();
    ctx.moveTo(tx - w, y + s * 0.1);
    ctx.lineTo(tx + w, y + s * 0.1);
    ctx.lineTo(bx, y + len);
    ctx.closePath();
    ctx.fill();
    // Every other tendril forks near its tip.
    if (i % 2 === 0) {
      const fy = y + len * 0.72;
      const fx = tx + (bx - tx) * 0.72;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + s * 0.12 * (i < 0 ? -1 : 1), fy + len * 0.22);
      ctx.stroke();
    }
  }
  // The crown: a bell with a scalloped hem.
  ctx.globalAlpha = base * 0.62;
  ctx.fillStyle = "rgb(255,64,92)";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.95, y + s * 0.12);
  ctx.quadraticCurveTo(x - s * 0.9, y - s * 0.38, x, y - s * 0.4);
  ctx.quadraticCurveTo(x + s * 0.9, y - s * 0.38, x + s * 0.95, y + s * 0.12);
  for (let i = 1; i <= 6; i++) {
    const hx = x + s * 0.95 - i * ((s * 1.9) / 6);
    ctx.quadraticCurveTo(hx + (s * 1.9) / 12, y + s * 0.32, hx, y + s * 0.12);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = base;
}

/**
 * Elves: rings of red light that race outward around 90 km when a big lightning stroke's
 * pulse hits the ionosphere. They last a millisecond; here one ring expands every couple of seconds.
 */
function drawElve(ctx: CanvasRenderingContext2D, W: number, H: number, alt: number, centerY: number) {
  const y = featureY(alt, 90, centerY, H);
  if (y < -40 || y > H + 40) return;
  const base = ctx.globalAlpha;
  const x = W * 0.25;
  const k = (wallSeconds() * 0.5) % 1;
  ctx.lineWidth = 2;
  for (const [lag, a] of [
    [0, 0.5],
    [0.12, 0.25],
  ] as const) {
    const kk = k - lag;
    if (kk <= 0) continue;
    ctx.globalAlpha = base * a * (1 - kk);
    ctx.strokeStyle = "rgb(255,120,84)";
    ctx.beginPath();
    ctx.ellipse(x, y, W * (0.03 + 0.17 * kk), H * (0.005 + 0.02 * kk), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = base;
}

/** Bands of noctilucent cloud: [dy px, start, end (fractions of W), wave phase, alpha]. */
const NLC_BANDS: [number, number, number, number, number][] = [
  [-13, 0.5, 0.74, 0.4, 0.35],
  [-6, 0.44, 0.8, 1.9, 0.55],
  [0, 0.41, 0.83, 3.1, 0.8],
  [6, 0.46, 0.79, 4.4, 0.55],
  [12, 0.53, 0.72, 5.6, 0.3],
];

/**
 * Noctilucent clouds near 82 km, the highest on Earth: thin electric-blue bands that taper at
 * both ends, with short billows rippling across the brightest one.
 */
function drawNoctilucent(ctx: CanvasRenderingContext2D, W: number, H: number, alt: number, centerY: number) {
  const y = featureY(alt, 82, centerY, H);
  if (y < -40 || y > H + 40) return;
  const base = ctx.globalAlpha;
  ctx.strokeStyle = "rgb(160,230,255)";
  ctx.lineCap = "round";
  for (const [dy, x0, x1, ph, a] of NLC_BANDS) {
    const n = 36;
    let px = W * x0;
    let py = y + dy + Math.sin(ph) * 2.5;
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      const x = W * (x0 + (x1 - x0) * f);
      const wy = y + dy + Math.sin(ph + f * 9) * 2.5 + Math.sin(ph * 2 + f * 23) * 0.8;
      // Taper: thin and faint at the ends, full in the middle.
      const env = Math.sin(f * Math.PI);
      ctx.globalAlpha = base * a * env;
      ctx.lineWidth = 0.6 + 1.2 * env;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, wy);
      ctx.stroke();
      px = x;
      py = wy;
    }
  }
  // Billows: short crests crossing the brightest band, like ripples on sand.
  ctx.lineWidth = 1;
  for (let i = 0; i < 11; i++) {
    const f = 0.18 + (i / 10) * 0.64;
    const x = W * (0.41 + 0.42 * f);
    ctx.globalAlpha = base * 0.45 * Math.sin(f * Math.PI);
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 7);
    ctx.quadraticCurveTo(x + 2, y, x - 2, y + 8);
    ctx.stroke();
  }
  ctx.globalAlpha = base;
}

/** A Starlink "train": a freshly deployed string of satellites around 550 km. */
function drawStarlinkTrain(ctx: CanvasRenderingContext2D, W: number, H: number, alt: number, centerY: number) {
  const y = featureY(alt, 550, centerY, H);
  if (y < -H * 0.2 || y > H + H * 0.2) return;
  const base = ctx.globalAlpha;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 16; i++) {
    const f = i / 15;
    ctx.globalAlpha = base * (0.9 - f * 0.5);
    ctx.fillRect(W * (0.12 + f * 0.36), y - f * H * 0.12, 2, 2);
  }
  ctx.globalAlpha = base;
}

/**
 * A flat cartoon sun with two halo rings, low in the sky at liftoff; it sinks out of view as
 * the rocket climbs. It fades as added light, so it dims into a glow instead of a grey disc.
 */
function drawSun(ctx: CanvasRenderingContext2D, W: number, H: number, alt: number) {
  const k = clamp01(1 - alt / 8);
  if (k <= 0) return;
  const base = ctx.globalAlpha;
  const x = W * 0.14;
  const y = H * 0.2 + alt * H * 0.05;
  const r = H * 0.034 * (0.75 + 0.25 * k);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [ring, a] of [
    [2.8, 0.06],
    [1.9, 0.1],
    [1, 0.85],
  ] as const) {
    ctx.globalAlpha = base * a * k;
    ctx.fillStyle = "rgb(255,236,170)";
    ctx.beginPath();
    ctx.arc(x, y, r * ring, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // The solid disc only while it's bright, so its warm color holds at liftoff.
  ctx.globalAlpha = base * Math.pow(k, 4);
  ctx.fillStyle = "rgb(255,240,190)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = base;
}

/** Thin flat cirrus streaks at fixed heights in the stratosphere, scrolling past as the rocket climbs. */
const CIRRUS: { km: number; x: number; len: number; w: number }[] = (() => {
  const rand = seeded(1307);
  // Kept left of the altitude ladder on the right edge.
  return Array.from({ length: 9 }, () => ({ km: 14 + rand() * 24, x: rand() * 0.6, len: 0.07 + rand() * 0.14, w: 1.5 + rand() * 2 }));
})();

function drawCirrus(ctx: CanvasRenderingContext2D, W: number, H: number, alt: number, centerY: number) {
  const base = ctx.globalAlpha;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgb(150,200,245)";
  for (const c of CIRRUS) {
    const y = centerY + (alt - c.km) * ((H * 2.6) / c.km);
    if (y < -10 || y > H + 10) continue;
    ctx.globalAlpha = base * 0.32;
    ctx.lineWidth = c.w;
    ctx.beginPath();
    ctx.moveTo(c.x * W, y);
    ctx.lineTo((c.x + c.len) * W, y - c.len * H * 0.04);
    ctx.stroke();
  }
  ctx.globalAlpha = base;
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
  drawMilkyWay(ctx, W, H, alpha);
  drawConstellations(ctx, W, H, alpha, t);
  for (const s of stars) {
    const f = PARALLAX[s.layer];
    const x = wrap(s.x * W + scrollX * f, W);
    const y = wrap(s.y * H + scrollY * f, H);
    // A few run warm or blue, the way real stars differ in temperature.
    const tint = (s.x * 9973) % 1;
    ctx.fillStyle = tint < 0.09 ? "rgb(255,214,170)" : tint > 0.92 ? "rgb(196,214,255)" : "#ffffff";
    ctx.globalAlpha = alpha * s.a * (0.75 + 0.25 * Math.sin(t * s.tw * 3 + s.x * 50));
    if (s.layer < 2) {
      ctx.fillRect(x - s.r / 2, y - s.r / 2, s.r, s.r);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
      // The brightest stars get a thin four-point twinkle.
      if (s.r > 1.25) {
        ctx.globalAlpha *= 0.45;
        ctx.fillRect(x - s.r * 3.2, y - 0.35, s.r * 6.4, 0.7);
        ctx.fillRect(x - 0.35, y - s.r * 3.2, 0.7, s.r * 6.4);
      }
    }
  }
  ctx.globalAlpha = 1;
}

interface Constellation {
  /** Center as fractions of the screen, and the size of one unit as a fraction of W. */
  at: [number, number];
  size: number;
  /** [x, y, radius px, color]. */
  stars: [number, number, number, RGB][];
  lines: [number, number][];
}

const WHITE: RGB = [255, 255, 255];

/** Orion and the Big Dipper in their real shapes, fixed far behind everything like the Milky Way. */
const CONSTELLATIONS: Constellation[] = [
  {
    // Orion: Betelgeuse glows orange at the shoulder, Rigel blue-white at the knee.
    at: [0.71, 0.5],
    size: 0.11,
    stars: [
      [-0.32, -0.5, 1.9, [255, 170, 110]],
      [0.28, -0.45, 1.4, WHITE],
      [0.02, -0.66, 0.9, WHITE],
      [-0.12, 0.02, 1.3, WHITE],
      [0, -0.02, 1.35, WHITE],
      [0.12, -0.06, 1.25, WHITE],
      [-0.24, 0.52, 1.3, WHITE],
      [0.3, 0.46, 1.9, [196, 214, 255]],
      [0.02, 0.2, 0.8, WHITE],
      [0.035, 0.3, 0.7, WHITE],
    ],
    lines: [
      [0, 2],
      [2, 1],
      [0, 3],
      [1, 5],
      [3, 4],
      [4, 5],
      [3, 6],
      [5, 7],
    ],
  },
  {
    // The Big Dipper: four stars in the bowl, three in the handle.
    at: [0.27, 0.22],
    size: 0.12,
    stars: [
      [0.36, -0.1, 1.4, WHITE],
      [0.38, 0.12, 1.3, WHITE],
      [0.14, 0.16, 1.2, WHITE],
      [0.1, -0.04, 1, WHITE],
      [-0.1, -0.08, 1.35, WHITE],
      [-0.27, -0.12, 1.3, WHITE],
      [-0.46, -0.02, 1.3, WHITE],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [3, 4],
      [4, 5],
      [5, 6],
    ],
  },
];

/** The Pleiades: a tight knot of blue-white stars in a faint haze, offsets in px. */
const PLEIADES: [number, number, number][] = [
  [0, 0, 1.1],
  [6, -3, 1],
  [11, 1, 0.9],
  [4, 5, 1],
  [-5, 3, 0.8],
  [9, -8, 0.8],
  [-2, -6, 0.7],
];

function drawConstellations(ctx: CanvasRenderingContext2D, W: number, H: number, alpha: number, t: number) {
  ctx.save();
  ctx.lineWidth = 1;
  for (const c of CONSTELLATIONS) {
    const u = W * c.size;
    const cx = W * c.at[0];
    const cy = H * c.at[1];
    // Faint stick-figure lines, the way a star chart joins them.
    ctx.globalAlpha = alpha * 0.1;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    for (const [i, j] of c.lines) {
      ctx.moveTo(cx + c.stars[i][0] * u, cy + c.stars[i][1] * u);
      ctx.lineTo(cx + c.stars[j][0] * u, cy + c.stars[j][1] * u);
    }
    ctx.stroke();
    c.stars.forEach(([sx, sy, r, color], i) => {
      ctx.globalAlpha = alpha * (0.8 + 0.2 * Math.sin(t * 2.3 + i * 1.7));
      ctx.fillStyle = rgba(color, 1);
      ctx.beginPath();
      ctx.arc(cx + sx * u, cy + sy * u, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  const px = W * 0.79;
  const py = H * 0.36;
  ctx.globalAlpha = alpha * 0.06;
  ctx.fillStyle = "rgb(170,200,255)";
  ctx.beginPath();
  ctx.ellipse(px + 3, py - 1, 16, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgb(214,228,255)";
  for (const [dx, dy, r] of PLEIADES) {
    ctx.globalAlpha = alpha * 0.85;
    ctx.beginPath();
    ctx.arc(px + dx, py + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Dust lanes and a dense scatter of faint stars along the galaxy's plane, fixed far behind everything. */
const MILKY_WAY: [number, number][] = (() => {
  const rand = seeded(4242);
  return Array.from({ length: 260 }, () => {
    // Roughly normal across the band, uniform along it.
    const across = (rand() + rand() + rand() - 1.5) * 0.05;
    return [(rand() - 0.5) * 1.5, across] as [number, number];
  });
})();

function drawMilkyWay(ctx: CanvasRenderingContext2D, W: number, H: number, alpha: number) {
  ctx.save();
  ctx.translate(W * 0.5, H * 0.42);
  ctx.rotate(-0.38);
  for (const [w, h, a] of [
    [1.1, 0.2, 0.035],
    [0.85, 0.11, 0.05],
    [0.55, 0.05, 0.06],
  ] as const) {
    ctx.globalAlpha = alpha * a;
    ctx.fillStyle = "rgb(190,195,255)";
    ctx.beginPath();
    ctx.ellipse(0, 0, (W * w) / 2, (H * h) / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = alpha * 0.35;
  for (const [u, v] of MILKY_WAY) ctx.fillRect(u * W, v * H, 1, 1);
  ctx.restore();
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
  drawSkyline(ctx, W, H, y, alpha);
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, y, W, H - y + 4);
  // The crawlerway in chalk, running from the pad toward the viewer.
  ctx.strokeStyle = rgba(chalk, 0.16);
  ctx.lineWidth = 1.2;
  for (const [from, to] of [
    [0.47, 0.3],
    [0.53, 0.7],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(W * from, y + 3);
    ctx.lineTo(W * to, H + 4);
    ctx.stroke();
  }
  // Scrub along the ground line.
  ctx.strokeStyle = rgba(chalk, 0.3);
  ctx.lineWidth = 1;
  for (const [x, h] of SCRUB) {
    const gx = x * W;
    if (Math.abs(gx - W / 2) < W * 0.12) continue;
    ctx.beginPath();
    ctx.moveTo(gx, y + 1);
    ctx.lineTo(gx + 2, y - h);
    ctx.lineTo(gx + 4, y + 1);
    ctx.stroke();
  }
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

const SCRUB: [number, number][] = (() => {
  const rand = seeded(77);
  return Array.from({ length: 34 }, () => [rand(), 3 + rand() * 5] as [number, number]);
})();

/** Two hazy ridges behind the pad, normalized heights along the width. */
const RIDGES: number[][] = (() => {
  const rand = seeded(2026);
  return [0.06, 0.035].map((amp) => {
    let h = amp * 0.6;
    return Array.from({ length: 25 }, () => {
      h = Math.min(amp, Math.max(amp * 0.25, h + (rand() - 0.5) * amp * 0.7));
      return h;
    });
  });
})();

/** Sun glints on the strip of sea at the far right: [x, height above the horizon, width] as fractions/px. */
const OCEAN_GLINTS: [number, number, number][] = (() => {
  const rand = seeded(909);
  return Array.from({ length: 9 }, () => [0.89 + rand() * 0.1, 0.002 + rand() * 0.008, 3 + rand() * 7] as [number, number, number]);
})();

/** Palms along the horizon: [x as a fraction of W, size]. */
const PALMS: [number, number][] = [
  [0.035, 1],
  [0.235, 0.75],
  [0.262, 1.05],
  [0.288, 0.85],
  [0.925, 0.95],
  [0.952, 0.7],
];

/** A palm silhouette: a leaning trunk and drooping fronds, `h` px tall, standing at (x, y). */
function drawPalm(ctx: CanvasRenderingContext2D, x: number, y: number, h: number) {
  const tx = x + h * 0.16;
  const ty = y - h;
  ctx.lineWidth = Math.max(1.5, h * 0.07);
  ctx.beginPath();
  ctx.moveTo(x, y + 1);
  ctx.quadraticCurveTo(x + h * 0.04, y - h * 0.55, tx, ty);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, h * 0.055);
  ctx.beginPath();
  for (const [dx, dy] of [
    [-0.5, 0.3],
    [-0.36, -0.06],
    [0.04, -0.22],
    [0.4, -0.04],
    [0.52, 0.32],
  ]) {
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + dx * h * 0.55, ty + dy * h * 0.5 - h * 0.18, tx + dx * h, ty + dy * h);
  }
  ctx.stroke();
}

/**
 * Flat, hazy ridges and the spaceport on the horizon: the assembly building and its low bay,
 * lightning masts with the catenary wire slung between them, a tracking radar, propellant
 * storage spheres, the water tower, palms, and a strip of sea past the altitude ladder.
 */
function drawSkyline(ctx: CanvasRenderingContext2D, W: number, H: number, y: number, alpha: number) {
  const colors = ["rgb(46,104,160)", "rgb(22,52,82)"];
  RIDGES.forEach((ridge, i) => {
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.moveTo(0, y + 1);
    ridge.forEach((h, j) => ctx.lineTo((j / (ridge.length - 1)) * W, y - h * H));
    ctx.lineTo(W, y + 1);
    ctx.closePath();
    ctx.fill();
  });

  // The sea at the far right, flat to the horizon, catching the sun.
  ctx.fillStyle = "rgb(38,96,152)";
  ctx.fillRect(W * 0.885, y - H * 0.012, W * 0.115, H * 0.012 + 1);
  ctx.fillStyle = "rgba(214,236,255,0.7)";
  for (const [gx, gy, gw] of OCEAN_GLINTS) ctx.fillRect(Math.round(W * gx), Math.round(y - H * gy), Math.round(gw), 1);

  const ink = "rgb(12,26,42)";
  const trim = "rgb(30,58,88)";
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineCap = "round";
  // Vehicle assembly building with its tall door, and the low bay beside it.
  const vx = W * 0.08;
  const vh = H * 0.075;
  ctx.fillRect(vx, y - vh, W * 0.045, vh + 1);
  ctx.fillRect(vx + W * 0.045, y - vh * 0.4, W * 0.028, vh * 0.4 + 1);
  ctx.fillStyle = trim;
  ctx.fillRect(vx + W * 0.017, y - vh * 0.82, W * 0.011, vh * 0.82);
  // Window rows along the low bay.
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 5; c++) ctx.fillRect(Math.round(vx + W * 0.049 + c * W * 0.0045), Math.round(y - vh * (0.32 - r * 0.13)), 2, 2);
  }
  // Seams across the door's stacked panels.
  ctx.fillStyle = ink;
  for (let i = 1; i < 6; i++) ctx.fillRect(vx + W * 0.017, Math.round(y - vh * 0.82 * (i / 6)), W * 0.011, 1);
  // Lightning masts with red warning lights. A catenary wire sags between their tops and is
  // anchored to the ground beyond the far mast, so lightning hits the wire, not the rocket.
  const mh = H * 0.11;
  const [m1, m2] = [W * 0.6, W * 0.67];
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(m1 + 1, y - mh);
  ctx.quadraticCurveTo((m1 + m2) / 2, y - mh * 0.6, m2 + 1, y - mh);
  ctx.quadraticCurveTo(m2 + W * 0.02, y - mh * 0.35, m2 + W * 0.034, y);
  ctx.stroke();
  for (const mx of [m1, m2]) {
    ctx.fillStyle = ink;
    ctx.fillRect(mx, y - mh, 2, mh + 1);
    ctx.fillStyle = "rgb(255,70,60)";
    ctx.fillRect(mx - 1, y - mh - 2, 4, 3);
  }
  // A tracking radar: a dish on a short tower, tipped toward the sky.
  ctx.fillStyle = ink;
  const rx = W * 0.36;
  ctx.fillRect(rx - 1, y - H * 0.03, 3, H * 0.03 + 1);
  ctx.beginPath();
  ctx.ellipse(rx + 1, y - H * 0.036, H * 0.015, H * 0.006, -0.6, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(rx + 1, y - H * 0.036);
  ctx.lineTo(rx - H * 0.006, y - H * 0.05);
  ctx.stroke();
  // Water tower, left of the altitude ladder.
  const tx = W * 0.74;
  ctx.fillRect(tx - 6, y - H * 0.045, 2, H * 0.045 + 1);
  ctx.fillRect(tx + 4, y - H * 0.045, 2, H * 0.045 + 1);
  ctx.beginPath();
  ctx.arc(tx, y - H * 0.055, H * 0.016, 0, Math.PI * 2);
  ctx.fill();
  // Propellant storage spheres on short legs, also clear of the ladder.
  for (const sx of [0.786, 0.81]) {
    const cx = W * sx;
    const r = H * 0.012;
    ctx.fillRect(cx - r * 0.75, y - r * 1.1, 1.5, r * 1.1 + 1);
    ctx.fillRect(cx + r * 0.75 - 1.5, y - r * 1.1, 1.5, r * 1.1 + 1);
    ctx.beginPath();
    ctx.arc(cx, y - r * 1.9, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [px, k] of PALMS) drawPalm(ctx, W * px, y, H * 0.042 * k);
  ctx.globalAlpha = alpha;
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
    // Fade out under the header and the crossing log in the top-left corner.
    const clear = clamp01((y - H * 0.12) / (H * 0.07));
    if (clear <= 0) continue;
    const a = alpha * ((b.hero ? 0.75 : 0.5) + 0.25 * near) * clear;
    ctx.globalAlpha = a;
    ctx.fillStyle = rgba(chalk, 1);
    ctx.fillRect(0, y, W, b.hero ? 2 : 1);
    // Label pill on the left, like a level marker.
    const label = `${b.label.toUpperCase()}  ${b.km.toLocaleString("en-US")} KM`;
    const tw = Math.ceil(ctx.measureText(label).width);
    const px = 24;
    const ph = 22;
    ctx.globalAlpha = Math.min(1, a + 0.2 * clear);
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
  // The neck where it was filled and tied off.
  ctx.fillStyle = "#c9d3e2";
  ctx.beginPath();
  ctx.moveTo(-3, 24);
  ctx.lineTo(3, 24);
  ctx.lineTo(1.2, 30);
  ctx.lineTo(-1.2, 30);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0.5, 30);
  ctx.lineTo(0.5, 62);
  ctx.stroke();
  // The parachute that brings the instruments down after the balloon bursts.
  ctx.fillStyle = "#ff8a3d";
  ctx.beginPath();
  ctx.arc(0.5, 42, 6, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-5.5, 42);
  ctx.lineTo(0.5, 48);
  ctx.lineTo(6.5, 42);
  ctx.stroke();
  // The radiosonde, with its antenna hanging below.
  ctx.fillStyle = "#ff4b3e";
  ctx.fillRect(-6, 62, 12, 9);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-4, 64, 8, 2);
  ctx.beginPath();
  ctx.moveTo(0.5, 71);
  ctx.lineTo(0.5, 80);
  ctx.stroke();
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

/** Cities as clusters of lights, brightest at the core, strung together by highways, plus scattered towns. */
/** Night-side storm cells: [angle from the top of the globe, depth below the limb (of H), flash phase]. */
const NIGHT_STORMS: [number, number, number][] = [
  [-0.12, 0.035, 0],
  [0.05, 0.055, 0.9],
  [0.2, 0.04, 1.7],
  [-0.3, 0.06, 0.45],
  [0.36, 0.07, 2.2],
];

export function makeCityLights(rand: () => number): CityLight[] {
  const lights: CityLight[] = [];
  const cities = Array.from({ length: 20 }, () => ({ a: (rand() - 0.5) * 1.6, d: 0.008 + Math.pow(rand(), 1.6) * 0.18, size: 0.35 + rand() }));
  for (const c of cities) {
    const n = Math.round(5 + c.size * 9);
    for (let i = 0; i < n; i++) {
      const r = Math.pow(rand(), 1.6) * 0.011 * c.size;
      const th = rand() * Math.PI * 2;
      lights.push({ a: c.a + Math.cos(th) * r, d: Math.max(0.003, c.d + Math.sin(th) * r * 0.4), b: 1 - (r / (0.011 * c.size)) * 0.6 });
    }
  }
  // Highways: dotted lines of light between neighbouring cities.
  const byAngle = [...cities].sort((p, q) => p.a - q.a);
  for (let i = 1; i < byAngle.length; i++) {
    const [p, q] = [byAngle[i - 1], byAngle[i]];
    if (Math.abs(q.d - p.d) > 0.06 || rand() < 0.35) continue;
    for (let f = 0.1; f < 0.9; f += 0.08) lights.push({ a: p.a + (q.a - p.a) * f, d: p.d + (q.d - p.d) * f, b: 0.25 + rand() * 0.2 });
  }
  for (let i = 0; i < 60; i++) lights.push({ a: (rand() - 0.5) * 1.6, d: 0.004 + Math.pow(rand(), 1.8) * 0.2, b: 0.2 + rand() * 0.45 });
  return lights;
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

  // Moonlit cloud swirls on the night side, turning with the planet.
  ctx.strokeStyle = "rgb(150,170,200)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    const mid = -Math.PI / 2 + (i - 3) * 0.06 * (W / R) * 4 + spin * 0.9 + Math.sin(i * 5.1) * 0.03;
    const len = (0.015 + 0.012 * Math.abs(Math.sin(i * 2.3))) * (W / R) * 4;
    ctx.globalAlpha = 0.06 + 0.03 * (i % 2);
    ctx.beginPath();
    ctx.arc(cx, cy, R - H * (0.03 + 0.025 * (i % 3)), mid - len, mid + len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Thunderstorms on the night side, flickering inside the clouds as seen from orbit.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgb(190,215,255)";
  for (const [a0, d, ph] of NIGHT_STORMS) {
    const f = (t * 0.8 + ph) % 2.6;
    if (f > 0.16) continue;
    const a = a0 + spin * 0.9;
    const r = R - d * H;
    const x = cx + r * Math.sin(a);
    const y = cy - r * Math.cos(a);
    if (x < 0 || x > W || y > H) continue;
    // Two quick pulses, the second fainter.
    ctx.globalAlpha = (f < 0.06 ? 0.55 : f > 0.09 ? 0.3 : 0.08) * (0.4 + 0.6 * k);
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 3.5, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

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

  // Airglow: the faint green layer near 100 km that astronauts see along the night limb.
  const glow = clamp01((altKm - 90) / 60) + lift * 0.5;
  if (glow > 0) {
    ctx.strokeStyle = "rgba(120,255,170,1)";
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = Math.min(1, glow) * 0.22;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 12, a0, a1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Orbital sunrise at the finale: the sun breaks over the limb as a bright glint.
  if (lift > 0.05) {
    // On the limb about a third of the way in from the right edge of the screen.
    const a = -Math.PI / 2 + Math.asin(Math.min(1, (W * 0.32) / R));
    const sx = cx + R * Math.cos(a);
    const sy = cy + R * Math.sin(a);
    const size = W * 0.16 * Math.min(1, lift);
    const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, size);
    sun.addColorStop(0, "rgba(255,250,235,0.95)");
    sun.addColorStop(0.15, "rgba(255,210,150,0.55)");
    sun.addColorStop(1, "rgba(255,140,60,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(sx - size, sy - size, size * 2, size * 2);
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
