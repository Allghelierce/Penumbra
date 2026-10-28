import { NAPKIN_ASPECT } from "../design";
import { scoreSketch } from "./confidence";
import { enginesForBase, enginesForBells, upperStageEngines } from "./engines";
import { tuneEngines } from "./tune";
import type {
  DestinationId,
  EngineCluster,
  Part,
  Point,
  SketchReading,
  Stage,
  Stroke,
} from "../design";

// No-key fallback: estimate a Design straight from the stroke geometry.

/** The full napkin height in metres; the width follows from NAPKIN_ASPECT. */
export const NAPKIN_HEIGHT_M = 120;
export const NAPKIN_WIDTH_M = NAPKIN_HEIGHT_M * NAPKIN_ASPECT;
/** Wide doodles shrink uniformly so the body is at most this wide (Super Heavy is 9 m). */
export const MAX_BODY_DIAMETER_M = 12;

// Height bands, as fractions of the drawing's own height from its top.
const NOSE_END = 0.15;
const PAYLOAD_END = 0.25;
const TANKS_END = 0.85;
const FIN_ZONE_START = 0.65;

const TANK_FILL = 0.8;
const PAYLOAD_DENSITY_KG_M3 = 50;
const ROW_SAMPLES = 48;
const MAX_STAGES = 3;

/** Used when the napkin is blank so the pipeline still returns a sensible single-stage rocket. */
const DEFAULT_OUTLINE: Stroke = {
  points: [
    [0.42, 0.1],
    [0.58, 0.1],
    [0.58, 0.9],
    [0.42, 0.9],
    [0.42, 0.1],
  ],
};

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function readFromGeometry(strokes: Stroke[], destination: DestinationId): SketchReading {
  let clean = cleanStrokes(strokes);
  if (clean.length === 0) clean = [DEFAULT_OUTLINE];

  const all = boundsOf(clean.flatMap((s) => s.points));
  const top = all.minY;
  const drawingH = Math.max(all.maxY - all.minY, 0.02);
  const rel = (y: number) => (y - top) / drawingH;
  const atRel = (f: number) => top + f * drawingH;

  // Body: median row width across the tank band, so fins and engine bells don't inflate it.
  const body =
    medianRow(clean, atRel(PAYLOAD_END), atRel(TANKS_END)) ??
    medianRow(clean, top, all.maxY) ?? {
      width: all.maxX - all.minX,
      center: (all.minX + all.maxX) / 2,
    };
  const bodyW = Math.max(body.width, 0.01);
  const bodyLeft = body.center - bodyW / 2;
  const bodyRight = body.center + bodyW / 2;
  const tolerance = Math.max(0.15 * bodyW, 0.01);
  // One uniform scale for every length: 120 m per napkin height, unless that makes the body too wide.
  const napkinHeightM = NAPKIN_HEIGHT_M * napkinScale(bodyW * NAPKIN_WIDTH_M);
  const napkinWidthM = napkinHeightM * NAPKIN_ASPECT;

  // Stage boundaries: near-horizontal strokes across the body inside the tank band.
  const boundaries: number[] = [];
  for (const stroke of clean) {
    if (stroke.points.length < 2) continue;
    const b = boundsOf(stroke.points);
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const cy = rel((b.minY + b.maxY) / 2);
    const nearHorizontal = w >= 0.6 * bodyW && h <= Math.max(0.25 * w, 0.01);
    const crossesBody = b.minX <= bodyLeft + 0.25 * bodyW && b.maxX >= bodyRight - 0.25 * bodyW;
    if (nearHorizontal && crossesBody && cy > PAYLOAD_END + 0.03 && cy < TANKS_END - 0.03) {
      boundaries.push((b.minY + b.maxY) / 2);
    }
  }
  boundaries.sort((a, b) => a - b);
  const cuts = boundaries
    .filter((y, i) => i === 0 || y - boundaries[i - 1] > 0.06 * drawingH)
    .slice(0, MAX_STAGES - 1);

  // Engines: small separate strokes in the bottom band that stay within the body, each read at scale.
  const engineStrokes = clean.filter((stroke) => {
    const b = boundsOf(stroke.points);
    return (
      rel((b.minY + b.maxY) / 2) > TANKS_END &&
      b.maxX - b.minX <= 0.6 * bodyW &&
      b.maxY - b.minY <= 0.25 * drawingH &&
      b.minX >= bodyLeft - tolerance &&
      b.maxX <= bodyRight + tolerance
    );
  });
  const bodyDiameterM = bodyW * napkinWidthM;
  const engineCount =
    engineStrokes.length > 0
      ? enginesForBells(engineStrokes.map((s) => widthOf(s) * napkinWidthM))
      : enginesForBase(bodyDiameterM);

  // Landing legs: a pair of strokes, one per side, that leave a wall and angle down and outward.
  const legsBySide = { left: [] as Stroke[], right: [] as Stroke[] };
  for (const stroke of clean) {
    const side = legSide(stroke, bodyLeft, bodyRight, tolerance);
    if (side) legsBySide[side].push(stroke);
  }
  const legs = legsBySide.left.length > 0 && legsBySide.right.length > 0 ? [...legsBySide.left, ...legsBySide.right] : [];

  // Heat shield: 4+ short diagonal hatch strokes inside the body along one wall.
  const hatchesBySide = { left: [] as Stroke[], right: [] as Stroke[] };
  for (const stroke of clean) {
    const b = boundsOf(stroke.points);
    const wM = (b.maxX - b.minX) * napkinWidthM;
    const hM = (b.maxY - b.minY) * napkinHeightM;
    const short = Math.max(wM, hM) < 0.35 * bodyDiameterM;
    const diagonal = wM > 0 && hM > 0 && hM / wM > 0.3 && hM / wM < 3;
    const inside =
      b.minX >= bodyLeft - tolerance / 2 && b.maxX <= bodyRight + tolerance / 2 && rel((b.minY + b.maxY) / 2) < TANKS_END;
    if (!short || !diagonal || !inside) continue;
    if (b.minX - bodyLeft < 0.25 * bodyW) hatchesBySide.left.push(stroke);
    else if (bodyRight - b.maxX < 0.25 * bodyW) hatchesBySide.right.push(stroke);
  }
  const hatches = [hatchesBySide.left, hatchesBySide.right].find((h) => h.length >= 4) ?? [];

  // Fins: anything else in the bottom 35% that sticks out past the body, grouped per side.
  const leftFin: Point[] = [];
  const rightFin: Point[] = [];
  for (const stroke of clean) {
    if (legs.includes(stroke)) continue;
    const zone = stroke.points.filter((p) => rel(p[1]) >= FIN_ZONE_START);
    const outLeft = zone.filter((p) => p[0] < bodyLeft);
    const outRight = zone.filter((p) => p[0] > bodyRight);
    if (outLeft.some((p) => p[0] < bodyLeft - tolerance)) leftFin.push(...outLeft);
    if (outRight.some((p) => p[0] > bodyRight + tolerance)) rightFin.push(...outRight);
  }
  const hasFins = leftFin.length > 0 || rightFin.length > 0;

  // Stages, bottom first. Tank segments run top to bottom, so reverse them.
  const edges = [atRel(PAYLOAD_END), ...cuts, atRel(TANKS_END)];
  const segments = edges
    .slice(0, -1)
    .map((y0, i) => ({ y0, y1: edges[i + 1] }))
    .reverse();
  const labels = stageLabels(segments.length);
  const radiusM = bodyDiameterM / 2;
  const area = Math.PI * radiusM * radiusM;

  const stages: Stage[] = segments.map((seg, i) => {
    const engines: EngineCluster[] =
      i === 0
        ? [{ engine: "raptor-3", count: engineCount }]
        : [{ engine: "raptor-vacuum", count: upperStageEngines(engineCount) }];
    const tankHeightM = (seg.y1 - seg.y0) * napkinHeightM;
    return {
      label: labels[i],
      engines,
      propellant: "methalox",
      tankVolumeM3: Math.max(1, Math.round(area * tankHeightM * TANK_FILL)),
    };
  });
  const topStage = stages.length - 1;
  /** Stage whose tank section contains y; above the tanks is the top stage, below is the booster. */
  const stageAt = (y: number) => {
    const i = segments.findIndex((seg) => y >= seg.y0 && y <= seg.y1);
    return i >= 0 ? i : y < atRel(PAYLOAD_END) ? topStage : 0;
  };

  const payloadHeightM = (PAYLOAD_END - NOSE_END) * drawingH * napkinHeightM;
  const payloadMassKg = Math.max(100, Math.round((area * payloadHeightM * PAYLOAD_DENSITY_KG_M3) / 100) * 100);

  const design = tuneEngines(
    {
      name: "Napkin Special",
      stages,
      payloadMassKg,
      destination,
      features: [
        ...(hasFins ? ["fins"] : []),
        ...(hatches.length > 0 ? ["heat-shield"] : []),
        ...(legs.length > 0 ? ["landing-legs"] : []),
      ],
      heightM: round1(drawingH * napkinHeightM),
      diameterM: round1(bodyDiameterM),
    },
    { minEngines: [Math.max(1, engineStrokes.length)] },
  );

  const bodyBox = (y0: number, y1: number): Part["box"] => toBox(bodyLeft, y0, bodyRight, y1);
  const parts: Part[] = [
    { kind: "nose", label: "Nose", box: bodyBox(top, atRel(NOSE_END)), stageIndex: topStage },
    {
      kind: "payload",
      label: "Payload bay",
      box: bodyBox(atRel(NOSE_END), atRel(PAYLOAD_END)),
      stageIndex: topStage,
    },
    ...segments.map(
      (seg, i): Part => ({
        kind: "tank",
        label: `${labels[i]} tanks`,
        box: bodyBox(seg.y0, seg.y1),
        stageIndex: i,
      }),
    ),
    {
      kind: "engine",
      label: `${design.stages[0].engines[0].count} × Raptor 3`,
      box:
        engineStrokes.length > 0
          ? boxOf(boundsOf(engineStrokes.flatMap((s) => s.points)))
          : bodyBox(atRel(TANKS_END), all.maxY),
      stageIndex: 0,
    },
  ];
  for (const fin of [leftFin, rightFin]) {
    if (fin.length > 0) parts.push({ kind: "fin", label: "Fin", box: boxOf(boundsOf(fin)), stageIndex: 0 });
  }
  if (hatches.length > 0) {
    const b = boundsOf(hatches.flatMap((s) => s.points));
    parts.push({ kind: "heat-shield", label: "Heat shield", box: boxOf(b), stageIndex: stageAt((b.minY + b.maxY) / 2) });
  }
  for (const leg of legs) {
    const b = boundsOf(leg.points);
    parts.push({ kind: "landing-legs", label: "Landing leg", box: boxOf(b), stageIndex: stageAt(b.minY) });
  }

  // Scored on what was actually drawn (not the stand-in outline for a blank napkin).
  return { design, parts, ...scoreSketch(strokes) };
}

/** Which wall a stroke leaves when it runs from that wall down and outward past it, like a leg. */
function legSide(stroke: Stroke, bodyLeft: number, bodyRight: number, tolerance: number): "left" | "right" | null {
  const { points } = stroke;
  if (points.length < 2) return null;
  const a = points[0];
  const b = points[points.length - 1];
  for (const [start, end] of [
    [a, b],
    [b, a],
  ]) {
    const dropM = (end[1] - start[1]) * NAPKIN_HEIGHT_M;
    const spreadM = Math.abs(end[0] - start[0]) * NAPKIN_WIDTH_M;
    if (dropM <= 0 || dropM < 0.5 * spreadM) continue;
    if (Math.abs(start[0] - bodyLeft) <= tolerance && end[0] < bodyLeft - tolerance) return "left";
    if (Math.abs(start[0] - bodyRight) <= tolerance && end[0] > bodyRight + tolerance) return "right";
  }
  return null;
}

function stageLabels(count: number): string[] {
  if (count === 1) return ["Rocket"];
  if (count === 2) return ["Booster", "Ship"];
  return Array.from({ length: count }, (_, i) => `Stage ${i + 1}`);
}

/** Drops malformed points and clamps the rest to the napkin. */
function cleanStrokes(strokes: unknown): Stroke[] {
  if (!Array.isArray(strokes)) return [];
  const out: Stroke[] = [];
  for (const stroke of strokes) {
    // "Add detail" strokes are decoration (welds, bells, struts), never structure.
    if ((stroke as Stroke | null)?.detail === true) continue;
    const raw: unknown = (stroke as Stroke | null)?.points;
    if (!Array.isArray(raw)) continue;
    const points = raw
      .filter(
        (p): p is Point =>
          Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]),
      )
      .map((p): Point => [clamp(p[0], 0, 1), clamp(p[1], 0, 1)]);
    if (points.length > 0) out.push({ points });
  }
  return out;
}

/** Median width and centre of the strokes across evenly spaced rows between y0 and y1. */
function medianRow(strokes: Stroke[], y0: number, y1: number): { width: number; center: number } | null {
  const widths: number[] = [];
  const centers: number[] = [];
  for (let i = 0; i < ROW_SAMPLES; i++) {
    const y = y0 + ((i + 0.5) / ROW_SAMPLES) * (y1 - y0);
    const xs = rowCrossings(strokes, y);
    if (xs.length < 2) continue;
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    if (max - min <= 0) continue;
    widths.push(max - min);
    centers.push((min + max) / 2);
  }
  if (widths.length === 0) return null;
  return { width: median(widths), center: median(centers) };
}

/** x positions where any stroke segment crosses the horizontal line at y. */
function rowCrossings(strokes: Stroke[], y: number): number[] {
  const xs: number[] = [];
  for (const { points } of strokes) {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[i + 1];
      if ((ay - y) * (by - y) > 0) continue;
      if (ay === by) xs.push(ax, bx);
      else xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
  }
  return xs;
}

function boundsOf(points: Point[]): Bounds {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function widthOf(stroke: Stroke): number {
  const b = boundsOf(stroke.points);
  return b.maxX - b.minX;
}

function boxOf(b: Bounds): Part["box"] {
  return toBox(b.minX, b.minY, b.maxX, b.maxY);
}

/** Normalized [x, y, width, height] clamped to the napkin. */
export function toBox(x0: number, y0: number, x1: number, y1: number): Part["box"] {
  const x = clamp(Math.min(x0, x1), 0, 1);
  const y = clamp(Math.min(y0, y1), 0, 1);
  const w = clamp(Math.abs(x1 - x0), 0, 1 - x);
  const h = clamp(Math.abs(y1 - y0), 0, 1 - y);
  return [round4(x), round4(y), round4(w), round4(h)];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Factor (≤ 1) that shrinks a design uniformly so a body this wide comes out at most MAX_BODY_DIAMETER_M. */
export function napkinScale(bodyDiameterM: number): number {
  return bodyDiameterM > MAX_BODY_DIAMETER_M ? MAX_BODY_DIAMETER_M / bodyDiameterM : 1;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
