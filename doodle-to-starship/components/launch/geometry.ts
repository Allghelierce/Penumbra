import { NAPKIN_ASPECT, type Part, type PartKind, type Stroke } from "@/lib/design";

/**
 * Rocket-local space: units of napkin height, origin at the center of the
 * doodle's bounding box, x right, y down. One unit = the napkin's height.
 */
export type Vec = [number, number];

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Where a piece's flame attaches, in rocket-local units. */
export interface Nozzle {
  x: number;
  y: number;
  w: number;
}

export interface Piece {
  lines: Vec[][];
  box: Box;
  nozzle: Nozzle;
}

export interface Doodle {
  /** The local origin in napkin units (x scaled by NAPKIN_ASPECT). */
  origin: Vec;
  box: Box;
  width: number;
  height: number;
  /** Bottom stage first; pieces[i] drops away at the i-th stage separation. */
  pieces: Piece[];
  /** The napkin sheet in local units. */
  napkin: Box;
}

interface LocalPart {
  kind: PartKind;
  stageIndex?: number;
  box: Box;
}

/** Used when the napkin is blank, so the scene still has something to fly. */
const FALLBACK_STROKES: Stroke[] = [
  { points: [[0.5, 0.14], [0.43, 0.3], [0.43, 0.8], [0.57, 0.8], [0.57, 0.3], [0.5, 0.14]] },
  { points: [[0.43, 0.66], [0.36, 0.8], [0.36, 0.85], [0.43, 0.8]] },
  { points: [[0.57, 0.66], [0.64, 0.8], [0.64, 0.85], [0.57, 0.8]] },
];

export function buildDoodle(strokes: Stroke[], parts: Part[], stageCount: number): Doodle {
  let lines = toNapkinUnits(strokes);
  let b = boxOf(lines);
  if (!b || Math.max(b.maxX - b.minX, b.maxY - b.minY) < 0.02) {
    lines = toNapkinUnits(FALLBACK_STROKES);
    b = boxOf(lines) as Box;
  }
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const local = lines.map((l) => l.map(([x, y]): Vec => [x - cx, y - cy]));
  const box: Box = { minX: b.minX - cx, minY: b.minY - cy, maxX: b.maxX - cx, maxY: b.maxY - cy };

  const localParts: LocalPart[] = parts.filter(validPart).map((p) => ({
    kind: p.kind,
    stageIndex: p.stageIndex,
    box: {
      minX: p.box[0] * NAPKIN_ASPECT - cx,
      minY: p.box[1] - cy,
      maxX: (p.box[0] + p.box[2]) * NAPKIN_ASPECT - cx,
      maxY: p.box[1] + p.box[3] - cy,
    },
  }));

  const splits = stageSplits(localParts, stageCount, box);
  const edges = [Infinity, ...splits, -Infinity];
  const pieces: Piece[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const top = edges[i + 1];
    const bottom = edges[i];
    const band = local.flatMap((l) => clipToBand(l, top, bottom));
    const pb = boxOf(band);
    if (!pb) continue;
    pieces.push({ lines: band, box: pb, nozzle: nozzleFor(band, pb, localParts, pieces.length, top, bottom) });
  }

  return {
    origin: [cx, cy],
    box,
    width: Math.max(box.maxX - box.minX, 0.02),
    height: Math.max(box.maxY - box.minY, 0.02),
    pieces,
    napkin: { minX: -cx, minY: -cy, maxX: NAPKIN_ASPECT - cx, maxY: 1 - cy },
  };
}

/** Union box of pieces[from..]. */
export function unionBox(pieces: Piece[], from: number): Box {
  const rest = pieces.slice(from);
  return {
    minX: Math.min(...rest.map((p) => p.box.minX)),
    minY: Math.min(...rest.map((p) => p.box.minY)),
    maxX: Math.max(...rest.map((p) => p.box.maxX)),
    maxY: Math.max(...rest.map((p) => p.box.maxY)),
  };
}

function toNapkinUnits(strokes: Stroke[]): Vec[][] {
  return strokes
    .map((s) =>
      (s.points ?? [])
        .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .map(([x, y]): Vec => [x * NAPKIN_ASPECT, y]),
    )
    .filter((l) => l.length > 0);
}

function validPart(p: Part): boolean {
  return Array.isArray(p.box) && p.box.length === 4 && p.box.every(Number.isFinite) && p.box[2] >= 0 && p.box[3] >= 0;
}

export function boxOf(lines: Vec[][]): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of lines) {
    for (const [x, y] of l) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/**
 * Local y of each stage boundary, bottom first. From the parts' stage boxes when
 * Grok tagged them, otherwise 55% of the way down the doodle.
 */
function stageSplits(parts: LocalPart[], stageCount: number, box: Box): number[] {
  if (stageCount < 2) return [];
  const h = box.maxY - box.minY;
  const found: number[] = [];
  for (let k = 1; k < stageCount; k++) {
    const lower = parts.filter((p) => p.stageIndex === k - 1);
    const upper = parts.filter((p) => p.stageIndex === k);
    if (lower.length === 0 || upper.length === 0) continue;
    const lowerTop = Math.min(...lower.map((p) => p.box.minY));
    const upperBottom = Math.max(...upper.map((p) => p.box.maxY));
    found.push((lowerTop + upperBottom) / 2);
  }
  if (found.length === 0) found.push(box.minY + 0.55 * h);

  const lo = box.minY + 0.08 * h;
  const hi = box.maxY - 0.08 * h;
  const out: number[] = [];
  for (const y of found.map((y) => Math.min(hi, Math.max(lo, y))).sort((a, b) => b - a)) {
    if (out.length === 0 || out[out.length - 1] - y > 0.06 * h) out.push(y);
  }
  return out;
}

/** The parts of a polyline with top <= y < bottom, cut exactly at the band edges. */
function clipToBand(line: Vec[], top: number, bottom: number): Vec[][] {
  if (line.length === 1) {
    const y = line[0][1];
    return y >= top && y < bottom ? [[line[0], line[0]]] : [];
  }
  const out: Vec[][] = [];
  let run: Vec[] | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dy = b[1] - a[1];
    let t0 = 0;
    let t1 = 1;
    if (dy === 0) {
      if (a[1] < top || a[1] >= bottom) {
        run = null;
        continue;
      }
    } else {
      let ta = (top - a[1]) / dy;
      let tb = (bottom - a[1]) / dy;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(0, ta);
      t1 = Math.min(1, tb);
    }
    if (t0 >= t1) {
      run = null;
      continue;
    }
    const p1: Vec = [a[0] + (b[0] - a[0]) * t1, a[1] + dy * t1];
    if (run && t0 === 0) {
      run.push(p1);
    } else {
      run = [[a[0] + (b[0] - a[0]) * t0, a[1] + dy * t0], p1];
      out.push(run);
    }
    if (t1 < 1) run = null;
  }
  return out;
}

function nozzleFor(band: Vec[][], pb: Box, parts: LocalPart[], index: number, top: number, bottom: number): Nozzle {
  const pw = pb.maxX - pb.minX;
  const ph = pb.maxY - pb.minY;
  const engines = parts.filter((p) => {
    if (p.kind !== "engine") return false;
    if (p.stageIndex !== undefined) return p.stageIndex === index;
    const c = (p.box.minY + p.box.maxY) / 2;
    return c >= top && c < bottom;
  });
  if (engines.length > 0) {
    const minX = Math.min(...engines.map((e) => e.box.minX));
    const maxX = Math.max(...engines.map((e) => e.box.maxX));
    const maxY = Math.max(...engines.map((e) => e.box.maxY));
    return {
      x: (minX + maxX) / 2,
      y: Math.min(pb.maxY, Math.max(pb.minY, maxY)),
      w: Math.min(Math.max(maxX - minX, 0.02), Math.max(0.02, pw)),
    };
  }
  // No engine boxes: aim at the middle of whatever is drawn along the piece's bottom edge.
  const cut = pb.maxY - Math.max(0.12 * ph, 0.01);
  let lo = Infinity;
  let hi = -Infinity;
  for (const l of band) {
    for (const [x, y] of l) {
      if (y < cut) continue;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
  }
  if (lo > hi) {
    lo = pb.minX;
    hi = pb.maxX;
  }
  return { x: (lo + hi) / 2, y: pb.maxY, w: Math.min(Math.max(0.45 * (hi - lo), 0.02), Math.max(0.02, 0.35 * pw)) };
}
