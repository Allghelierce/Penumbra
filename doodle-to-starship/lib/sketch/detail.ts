import { NAPKIN_ASPECT } from "../design";
import type { Part, Point, SketchReading, Stroke } from "../design";

// "Add detail": engineering touches drawn into the user's own sketch, in the same pencil hand,
// fitted to each part the reader recognized. Deterministic (seeded by the parts), ordered big
// structure first so it reads well when replayed stroke by stroke.

const MAX_STROKES = 60;
const WOBBLE = 0.0012;
const STEP = 0.006;

type Box = Part["box"];

export function detailStrokes(reading: SketchReading): Stroke[] {
  if ((reading.confidence ?? 1) < 0.5 || reading.parts.length === 0) return [];
  const rand = seeded(hashParts(reading.parts));
  const pen = (points: Point[]): Stroke => ({ points: hand(points, rand) });
  const of = (kind: Part["kind"]) => reading.parts.filter((p) => p.kind === kind);

  const tanks = of("tank").sort((a, b) => a.box[1] - b.box[1]);
  const body = tanks[0]?.box ?? of("payload")[0]?.box ?? reading.parts[0].box;
  const axis = body[0] + body[2] / 2;
  const out: Stroke[] = [];

  // 1. Tanks: weld lines and a common-bulkhead dome; interstage bands between stages.
  for (const { box: [x, y, w, h] } of tanks) {
    const welds = Math.min(4, Math.max(2, Math.round(h / 0.08)));
    for (let i = 1; i <= welds; i++) {
      const wy = y + (h * i) / (welds + 1);
      out.push(pen(line([x + 0.08 * w, wy], [x + 0.92 * w, wy])));
    }
    const domeY = y + 0.55 * h;
    const rise = Math.min(0.18 * w * NAPKIN_ASPECT, 0.25 * h);
    out.push(pen(curve(16, (t) => [x + w * (0.1 + 0.8 * t), domeY - rise * Math.sin(Math.PI * t)])));
  }
  for (let i = 1; i < tanks.length; i++) {
    const [x, y, w] = tanks[i].box;
    out.push(pen(line([x - 0.02 * w, y - 0.008], [x + 1.02 * w, y - 0.008])));
    out.push(pen(line([x - 0.02 * w, y + 0.008], [x + 1.02 * w, y + 0.008])));
  }

  // 2. Nose: a tip ring and a payload-fairing seam down the middle.
  for (const { box: [x, y, w, h] } of of("nose")) {
    const cx = x + w / 2;
    out.push(pen(line([cx - 0.12 * w, y + 0.18 * h], [cx + 0.12 * w, y + 0.18 * h])));
    out.push(pen(line([cx, y + 0.22 * h], [cx, y + h])));
  }

  // 3. Engines: proper bells (throat, flared skirt, exit lip) across the engine box.
  for (const { box: [x, y, w, h] } of of("engine")) {
    const across = Math.min(5, Math.max(1, Math.round((w * NAPKIN_ASPECT) / Math.max(h * 0.9, 1e-3))));
    const bw = w / across;
    for (let i = 0; i < across; i++) {
      const cx = x + bw * (i + 0.5);
      const half = 0.46 * bw;
      const throat = 0.14 * bw;
      const flare = (side: 1 | -1) => curve(14, (t) => [cx + side * (throat + (half - throat) * t ** 1.7), y + h * t]);
      out.push(pen(line([cx - throat, y], [cx + throat, y])));
      out.push(pen(flare(-1)));
      out.push(pen(flare(1)));
      out.push(pen(curve(12, (t) => [cx - half + 2 * half * t, y + h + 0.012 * h * Math.sin(Math.PI * t)])));
    }
  }

  // 4. Fins: a leading-edge line just inside the outer edge.
  for (const { box: [x, y, w, h] } of of("fin")) {
    const outward = x + w / 2 < axis ? -1 : 1;
    const inner = outward < 0 ? x + w : x;
    const outer = outward < 0 ? x : x + w;
    out.push(pen(line([inner - outward * 0.1 * w, y + 0.08 * h], [outer - outward * 0.18 * w, y + 0.85 * h])));
  }

  // 5. Landing legs: a second strut and a foot pad.
  for (const { box: [x, y, w, h] } of of("landing-legs")) {
    const outward = x + w / 2 < axis ? -1 : 1;
    const inner = outward < 0 ? x + w : x;
    const outer = outward < 0 ? x : x + w;
    out.push(pen(line([inner, y + 0.45 * h], [outer, y + h])));
    out.push(pen(line([outer - 0.35 * w, y + h + 0.004], [outer + 0.35 * w, y + h + 0.004])));
  }

  // 6. Heat shield: rows of hex-tile zigzags on the windward side.
  for (const { box: [x, y, w, h] } of of("heat-shield")) {
    const rows = Math.min(8, Math.max(2, Math.round(h / 0.025)));
    for (let r = 0; r < rows; r++) {
      const ry = y + (h * (r + 0.5)) / rows;
      const teeth = 4;
      out.push(pen(curve(teeth * 2, (t) => [x + w * t, ry + (Math.round(t * teeth * 2) % 2 ? 0.006 : -0.006)])));
    }
  }

  // 7. A window and RCS thruster ticks near the nose.
  const windowBox = of("window")[0]?.box ?? of("payload")[0]?.box;
  if (windowBox) {
    const [x, y, w, h] = windowBox;
    const r = Math.min(0.18 * w, 0.3 * h * NAPKIN_ASPECT);
    out.push(pen(curve(20, (t) => [x + w / 2 + r * Math.cos(2 * Math.PI * t), y + h / 2 + (r / NAPKIN_ASPECT) * Math.sin(2 * Math.PI * t)])));
  }
  // On the payload section just under the nose, where the body's edge is where the box says it is.
  const ring = of("payload")[0]?.box ?? of("nose")[0]?.box;
  if (ring) {
    const ty = ring[1] + 0.45 * ring[3];
    for (const side of [-1, 1] as const) {
      const edge = side < 0 ? body[0] : body[0] + body[2];
      out.push(pen(line([edge, ty - 0.006], [edge + side * 0.018, ty - 0.006])));
      out.push(pen(line([edge, ty + 0.006], [edge + side * 0.018, ty + 0.006])));
    }
  }

  return out.slice(0, MAX_STROKES);
}

function line(a: Point, b: Point): Point[] {
  return [a, b];
}

function curve(segments: number, at: (t: number) => Point): Point[] {
  return Array.from({ length: segments + 1 }, (_, i) => at(i / segments));
}

/** Resample a path and add a small pencil wobble, clamped to the napkin. */
function hand(path: Point[], rand: () => number): Point[] {
  const out: Point[] = [];
  const phase = rand() * Math.PI * 2;
  let travelled = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const length = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(length / STEP));
    const nx = length > 0 ? -(by - ay) / length : 0;
    const ny = length > 0 ? (bx - ax) / length : 0;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const off = WOBBLE * Math.sin(phase + (travelled + t * length) * 90) + (rand() - 0.5) * 0.0005;
      out.push([clamp01(ax + (bx - ax) * t + nx * off), clamp01(ay + (by - ay) * t + ny * off)]);
    }
    travelled += length;
  }
  const last = path[path.length - 1];
  out.push([clamp01(last[0]), clamp01(last[1])]);
  return out;
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashParts(parts: Part[]): number {
  let h = 2166136261;
  for (const p of parts) for (const v of [p.kind.length, ...p.box]) h = Math.imul(h ^ Math.round(v * 10_000), 16777619);
  return h >>> 0;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export type { Box };
