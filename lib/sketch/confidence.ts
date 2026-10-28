import { NAPKIN_ASPECT } from "../design";
import type { Point, Stroke } from "../design";

// How much does this drawing look like a launch vehicle? Cheap stroke statistics: a tall shape, two
// long vertical walls, mirror symmetry, calm (not frantic) ink, a sane number of strokes and joined-up
// lines. Scribbles, circles and single lines score low and get a red-pen sentence saying why.

export interface SketchScore {
  /** 0..1. Below 0.5 the studio coaches instead of analysing. */
  confidence: number;
  problem: string | null;
}

const PASS = 0.5;
/** A wall is a near-vertical run at least this share of the drawing's height. */
const WALL_SHARE = 0.4;
/** Mirror and joint tolerance, in napkin-height units. */
const NEAR = 0.035;

const WEIGHTS = { tall: 0.25, walls: 0.25, symmetry: 0.15, calm: 0.2, count: 0.1, joined: 0.05 };

/** Scores raw strokes (normalized 0..1 coordinates). */
export function scoreSketch(strokes: Stroke[]): SketchScore {
  // Work in isotropic units (x scaled by the napkin's aspect) so angles and lengths are honest.
  const paths = strokes
    .filter((s) => s?.detail !== true)
    .map((s) => (Array.isArray(s?.points) ? s.points : []).filter(valid).map(([x, y]): Point => [x * NAPKIN_ASPECT, y]))
    .filter((p) => p.length > 0);
  const all = paths.flat();
  if (all.length < 4) return { confidence: 0, problem: "The napkin's blank. Draw a rocket: a tall body, a nose and engines." };

  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1e-3);
  const h = Math.max(maxY - minY, 1e-3);

  // Walls: the longest near-vertical runs. A rocket has two, side by side, overlapping in height.
  const runs = paths.flatMap(verticalRuns).filter((r) => r.length >= WALL_SHARE * h);
  const walls = runs.some((a, i) =>
    runs.some(
      (b, j) =>
        j > i &&
        Math.abs(a.x - b.x) >= Math.max(0.04, 0.15 * w) &&
        Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) >= 0.5 * Math.min(a.y1 - a.y0, b.y1 - b.y0),
    ),
  );
  const wallPair = walls ? runs : [];
  const bodyWidth = wallPair.length >= 2 ? Math.max(...wallPair.map((r) => r.x)) - Math.min(...wallPair.map((r) => r.x)) : w;
  const tall = clamp01((h / Math.max(bodyWidth, 1e-3) - 1.2) / 0.8);

  // Symmetry: share of points whose mirror image across the centre line lands near other ink.
  const axis = (minX + maxX) / 2;
  const sample = all.filter((_, i) => i % Math.max(1, Math.floor(all.length / 400)) === 0);
  const symmetry = sample.filter(([x, y]) => near(all, [2 * axis - x, y], NEAR)).length / sample.length;

  // Calm ink: total length against the bounding-box perimeter, and sharp reversals per unit of ink.
  const ink = paths.reduce((sum, p) => sum + lengthOf(p), 0);
  const inkRatio = ink / (2 * (w + h));
  const reversals = paths.reduce((sum, p) => sum + reversalsIn(p), 0) / Math.max(ink, 1e-3);
  const calm = Math.min(clamp01(1 - (inkRatio - 3) / 4), clamp01(1 - (reversals - 6) / 14));

  const n = paths.length;
  const count = n === 1 ? 0.4 : n === 2 ? 0.7 : n >= 60 ? 0.3 : 1;

  // Joined-up: stroke ends that meet other ink (or close their own loop), like an outline.
  const ends = paths.flatMap((p, i) => [p[0], p[p.length - 1]].map((pt) => ({ pt, i })));
  const joined =
    ends.filter(({ pt, i }) => paths.some((other, j) => (j !== i ? near(other, pt, NEAR) : isLoop(other)))).length /
    ends.length;

  let confidence =
    WEIGHTS.tall * tall +
    WEIGHTS.walls * (walls ? 1 : 0) +
    WEIGHTS.symmetry * symmetry +
    WEIGHTS.calm * calm +
    WEIGHTS.count * count +
    WEIGHTS.joined * joined;
  // No body with two walls, or frantic ink, means no rocket, however good the rest looks.
  if (!walls) confidence *= 0.5;
  if (calm < 0.3) confidence *= 0.5;
  confidence = Math.round(clamp01(confidence) * 100) / 100;

  let problem: string | null = null;
  if (confidence < PASS) {
    if (calm < 0.4) problem = "That's a scribble, not a rocket. Draw the outline first, then the details.";
    else if (!walls) problem = "That's a scribble: I can't find a body with two walls. Draw the outline first.";
    else if (tall < 0.3) problem = "Rockets stand tall, and this is wider than it is high. Draw the body upright.";
    else problem = "I can't make a rocket out of this. Draw a tall body, a nose and engines.";
  }
  return { confidence, problem };
}

function valid(p: unknown): p is Point {
  return Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

/** Near-vertical runs (measured over a short window so pencil wobble doesn't break them). */
function verticalRuns(points: Point[]): { x: number; y0: number; y1: number; length: number }[] {
  const out: { x: number; y0: number; y1: number; length: number }[] = [];
  const step = 3;
  let start = -1;
  const close = (end: number) => {
    if (start < 0) return;
    const seg = points.slice(start, end + 1);
    const ysSeg = seg.map((p) => p[1]);
    const height = Math.max(...ysSeg) - Math.min(...ysSeg);
    // A wall is steady pencil travel: several points, and not much longer than it is tall.
    if (seg.length < 6 || lengthOf(seg) > 1.5 * height) {
      start = -1;
      return;
    }
    out.push({
      x: seg.reduce((s, p) => s + p[0], 0) / seg.length,
      y0: Math.min(...ysSeg),
      y1: Math.max(...ysSeg),
      length: Math.max(...ysSeg) - Math.min(...ysSeg),
    });
    start = -1;
  };
  for (let i = 0; i + step < points.length; i++) {
    const dx = Math.abs(points[i + step][0] - points[i][0]);
    const dy = Math.abs(points[i + step][1] - points[i][1]);
    const vertical = dy > 0 && dx < 0.4 * dy;
    if (vertical && start < 0) start = i;
    if (!vertical) close(i + step - 1);
  }
  close(points.length - 1);
  return out;
}

function lengthOf(points: Point[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return sum;
}

/** Turns sharper than 120°, over a short window. */
function reversalsIn(points: Point[]): number {
  const step = 2;
  let count = 0;
  for (let i = step; i + step < points.length; i += step) {
    const a = [points[i][0] - points[i - step][0], points[i][1] - points[i - step][1]];
    const b = [points[i + step][0] - points[i][0], points[i + step][1] - points[i][1]];
    const la = Math.hypot(a[0], a[1]);
    const lb = Math.hypot(b[0], b[1]);
    if (la < 1e-4 || lb < 1e-4) continue;
    if ((a[0] * b[0] + a[1] * b[1]) / (la * lb) < -0.5) count++;
  }
  return count;
}

function near(points: Point[], [x, y]: Point, tolerance: number): boolean {
  return points.some((p) => Math.abs(p[0] - x) < tolerance && Math.abs(p[1] - y) < tolerance);
}

/** A stroke whose two ends meet, with real length in between: a closed outline. */
function isLoop(points: Point[]): boolean {
  const [a, b] = [points[0], points[points.length - 1]];
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.5 * NEAR && lengthOf(points) > 0.15;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
