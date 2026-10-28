// Replays a napkin drawing stroke by stroke at hand speed, for attract mode and for
// animating the demo-sketch buttons. The timing is pure (planReplay / strokesAt) so it can
// be tested without a browser; replaySketch drives it with requestAnimationFrame.

import type { Stroke } from "./design";

export interface ReplayPlan {
  /** times[s][p]: ms after the start at which point p of stroke s is drawn. */
  times: number[][];
  totalMs: number;
}

export interface ReplayOptions {
  /** Total time for the whole drawing, pauses included. */
  durationMs?: number;
  /** Stop early; the promise resolves without drawing the rest. */
  signal?: AbortSignal;
}

/** Share of the total time spent with the pen lifted between strokes. */
const PAUSE_SHARE = 0.2;
/** Longest pause between two strokes, however few strokes there are. */
const MAX_PAUSE_MS = 220;
/** Even a dot takes a moment to draw. */
const MIN_STROKE_LENGTH = 0.01;

function strokeLength(stroke: Stroke): number {
  let length = 0;
  for (let i = 1; i < stroke.points.length; i++) {
    const [ax, ay] = stroke.points[i - 1];
    const [bx, by] = stroke.points[i];
    length += Math.hypot(bx - ax, by - ay);
  }
  return length;
}

/** Total pen travel of a drawing, in napkin units. */
export function drawingLength(strokes: Stroke[]): number {
  return strokes.reduce((sum, s) => sum + strokeLength(s), 0);
}

/** A natural duration for a sketch: longer drawings take longer, within 4–6 s. */
export function sketchDurationMs(strokes: Stroke[]): number {
  return Math.round(Math.min(6000, Math.max(4000, 2500 + drawingLength(strokes) * 800)));
}

/** A hand speeds up after touching down and slows before lifting. Monotonic in s. */
function handEase(s: number): number {
  const smooth = s * s * (3 - 2 * s);
  return 0.6 * s + 0.4 * smooth;
}

/**
 * When each point gets drawn. Time per stroke is proportional to its length (constant pen speed),
 * with short pauses between strokes; the last point lands exactly at durationMs.
 */
export function planReplay(strokes: Stroke[], durationMs: number): ReplayPlan {
  const drawn = strokes.filter((s) => s.points.length > 0);
  if (drawn.length === 0) return { times: strokes.map(() => []), totalMs: 0 };

  const gaps = drawn.length - 1;
  const pauseMs = gaps > 0 ? Math.min(MAX_PAUSE_MS, (durationMs * PAUSE_SHARE) / gaps) : 0;
  const drawMs = durationMs - pauseMs * gaps;
  const lengths = strokes.map((s) => Math.max(MIN_STROKE_LENGTH, strokeLength(s)));
  const totalLength = strokes.reduce((sum, s, i) => sum + (s.points.length > 0 ? lengths[i] : 0), 0);

  let clock = 0;
  let seen = 0;
  const times = strokes.map((stroke, i) => {
    if (stroke.points.length === 0) return [];
    if (seen++ > 0) clock += pauseMs;
    const strokeMs = (lengths[i] / totalLength) * drawMs;
    const real = strokeLength(stroke);
    let travelled = 0;
    const pointTimes = stroke.points.map((point, p) => {
      if (p > 0) {
        const [ax, ay] = stroke.points[p - 1];
        travelled += Math.hypot(point[0] - ax, point[1] - ay);
      }
      const s = real > 0 ? travelled / real : stroke.points.length > 1 ? p / (stroke.points.length - 1) : 1;
      return clock + handEase(s) * strokeMs;
    });
    clock += strokeMs;
    return pointTimes;
  });
  return { times, totalMs: durationMs };
}

/** How many points of the whole drawing are visible at time t. */
export function visibleCount(plan: ReplayPlan, tMs: number): number {
  let count = 0;
  for (const strokeTimes of plan.times) {
    for (const time of strokeTimes) {
      if (time > tMs) return count;
      count++;
    }
  }
  return count;
}

/** The partial drawing after the first `count` points (in drawing order). */
export function strokesUpTo(strokes: Stroke[], count: number): Stroke[] {
  const out: Stroke[] = [];
  let left = count;
  for (const stroke of strokes) {
    if (left <= 0) break;
    if (stroke.points.length === 0) continue;
    if (stroke.points.length <= left) {
      out.push(stroke);
      left -= stroke.points.length;
    } else {
      out.push({ points: stroke.points.slice(0, left) });
      left = 0;
    }
  }
  return out;
}

/** The partial drawing visible at time t. */
export function strokesAt(strokes: Stroke[], plan: ReplayPlan, tMs: number): Stroke[] {
  return strokesUpTo(strokes, visibleCount(plan, tMs));
}

const nextFrame = (cb: (now: number) => void): void => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(cb);
  else setTimeout(() => cb(performance.now()), 16);
};

/**
 * Draw `strokes` progressively, calling onStrokes with the growing drawing (only when it changes).
 * Resolves after the full drawing has been handed over, or early (without finishing) if aborted.
 */
export function replaySketch(
  strokes: Stroke[],
  onStrokes: (strokes: Stroke[]) => void,
  { durationMs = sketchDurationMs(strokes), signal }: ReplayOptions = {},
): Promise<void> {
  const plan = planReplay(strokes, durationMs);
  const total = plan.times.reduce((n, t) => n + t.length, 0);
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    let start: number | null = null;
    let shown = -1;
    const frame = (now: number) => {
      if (signal?.aborted) return resolve();
      start ??= now;
      const count = visibleCount(plan, now - start);
      if (count !== shown) {
        shown = count;
        onStrokes(strokesUpTo(strokes, count));
      }
      if (count >= total) return resolve();
      nextFrame(frame);
    };
    nextFrame(frame);
  });
}
