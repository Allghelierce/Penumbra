// Real flights from history, replayed through the studio: the flight's rocket (its template
// drawing, or a stand-in sketch for a vehicle with no rocket of its own here) is on the napkin,
// the red pen marks the part that actually failed, and the launch follows the real timeline.
// Pure functions over a HistoricMission; no API calls.

import { DEMO_SKETCHES } from "./demo-sketches";
import type {
  Design,
  FlightEvent,
  FlightPoint,
  FlightTrace,
  HistoricMission,
  Part,
  Point,
  Review,
  RocketTemplate,
  SketchReading,
  Stroke,
} from "./design";
import { NAPKIN_ASPECT } from "./design";
import { ALL_MISSIONS } from "./mission-catalog";
import { historicMarks } from "./redpen";
import { readFromGeometry } from "./sketch/geometry";
import { drawTemplate, TEMPLATES } from "./templates";

const TRACE_POINTS = 300;
/** Speed at which a climb has turned fully horizontal, for the downrange estimate. */
const ORBITAL_SPEED_MPS = 7_800;

/** A flight with no stand-in sketch replays on its rocket as built, named for the flight's vehicle. */
function onTemplate(m: HistoricMission): { template: RocketTemplate; design: Design } | null {
  if (m.sketchId) return null;
  const template = TEMPLATES.find((t) => t.id === m.rocket);
  return template ? { template, design: { ...template.design, name: m.vehicle, destination: m.destination } } : null;
}

const standIn = (m: HistoricMission) => DEMO_SKETCHES.find((s) => s.id === m.sketchId) ?? DEMO_SKETCHES[0];

/** The drawing a flight replays on: its rocket's template drawing, or its stand-in sketch. */
export function historicStrokes(m: HistoricMission): Stroke[] {
  const t = onTemplate(m);
  return t ? drawTemplate(t.template, t.design).strokes : standIn(m).strokes;
}

/**
 * The flight's drawing, read locally and named for the real vehicle: the template's exact parts
 * (the same ones the Modify flow marks), or the stand-in sketch read by geometry.
 */
export function historicReading(m: HistoricMission): SketchReading {
  const t = onTemplate(m);
  if (t) return { design: t.design, parts: drawTemplate(t.template, t.design).parts, confidence: 1, problem: null };
  const reading = readFromGeometry(standIn(m).strokes, m.destination);
  return { ...reading, design: { ...reading.design, name: m.vehicle, destination: m.destination } };
}

/** The real failure on the napkin: a heavy outline on the part, its name, and ① what happened. */
export function historicReview(m: HistoricMission, reading: SketchReading): Review {
  const summary = m.failure
    ? `${m.vehicle}, ${m.mission}: ${m.failure.label}. ${m.failure.detail}`
    : `${m.vehicle}, ${m.mission}: flew as planned.`;
  return { marks: historicMarks(reading, m.failure), summary };
}

/** The real timeline, interpolated to about 300 points, with its recorded events and quotes. */
export function historicTrace(m: HistoricMission): FlightTrace {
  const timeline = [...m.timeline].sort((a, b) => a.tS - b.tS);
  const outcome = m.outcome === "lost" ? "suborbital" : "orbit";
  if (timeline.length === 0) return { points: [], events: [], outcome, maxAltitudeKm: 0 };

  const events: FlightEvent[] = timeline.flatMap((e) =>
    e.kind ? [{ tS: e.tS, kind: e.kind, label: e.quote ? `${e.quote.speaker}: "${e.quote.text}"` : (e.event ?? e.kind) }] : [],
  );
  // Each stage separation moves the trace on to the next stage.
  const separations = events.filter((e) => e.kind === "stage-sep").map((e) => e.tS);
  const stageAt = (tS: number) => separations.filter((s) => s <= tS).length;

  const t0 = timeline[0].tS;
  const t1 = timeline[timeline.length - 1].tS;
  const count = t1 > t0 ? TRACE_POINTS : 1;
  const points: FlightPoint[] = [];
  let downrangeKm = 0;
  for (let i = 0; i < count; i++) {
    const tS = count === 1 ? t0 : t0 + ((t1 - t0) * i) / (count - 1);
    const { altitudeKm, speedMps } = sampleAt(timeline, tS);
    const prev = points.at(-1);
    if (prev) {
      const horizontal = (v: number) => v * Math.min(1, v / ORBITAL_SPEED_MPS);
      downrangeKm += (((horizontal(prev.speedMps) + horizontal(speedMps)) / 2) * (tS - prev.tS)) / 1000;
    }
    points.push({ tS, altitudeKm, downrangeKm, speedMps, stageIndex: stageAt(tS) });
  }

  return {
    points,
    events,
    outcome,
    maxAltitudeKm: Math.max(0, ...timeline.map((e) => e.altitudeKm)),
  };
}

/** Linear interpolation of altitude and speed between the timeline's entries. */
function sampleAt(timeline: HistoricMission["timeline"], tS: number) {
  let i = 0;
  while (i < timeline.length - 2 && timeline[i + 1].tS < tS) i++;
  const a = timeline[i];
  const b = timeline[Math.min(i + 1, timeline.length - 1)];
  const f = b.tS > a.tS ? Math.min(1, Math.max(0, (tS - a.tS) / (b.tS - a.tS))) : 0;
  return {
    altitudeKm: Math.max(0, a.altitudeKm + (b.altitudeKm - a.altitudeKm) * f),
    speedMps: Math.max(0, a.speedMps + (b.speedMps - a.speedMps) * f),
  };
}

// ---------------------------------------------------------------------------
// Fix and try again: what was changed after each loss, drawn onto the sketch, and the flight
// that came back.

/** The successful flight that followed each loss. */
export const COMEBACK: Record<string, string> = { "falcon1-f1": "falcon1-f4", crs7: "og2", ift1: "ift5", "electron-f1": "electron-f2" };

/** The comeback flight for a loss, looked up in the full mission catalog. */
export function comebackFor(m: HistoricMission): HistoricMission | null {
  const id = COMEBACK[m.id];
  return (id && ALL_MISSIONS.find((x) => x.id === id)) || null;
}

/** For a comeback flight, the loss it came back from (the inverse of COMEBACK). */
export function comebackSource(m: HistoricMission): HistoricMission | null {
  const lostId = Object.keys(COMEBACK).find((id) => COMEBACK[id] === m.id);
  return (lostId && ALL_MISSIONS.find((x) => x.id === lostId)) || null;
}

/** The red pen's label for the fix. */
export function fixNote(m: HistoricMission): string {
  const notes: Record<string, string> = {
    "falcon1-f1": "FIX: steel fittings",
    crs7: "FIX: stronger struts",
    // The pad had no flame deflector; this is the change that let Starship fly again.
    ift1: "FIX: flame deflector",
    // The rocket was fine: the fix was a contractor's ground receiver, set up with error correction.
    "electron-f1": "FIX: ground receiver",
  };
  return notes[m.id] ?? "FIX: redesign";
}

type Box = [number, number, number, number];

/** Napkin coordinates are normalized on both axes of a 3:4 napkin, so a round arc squashes its y by this. */
const NAPKIN_Y = NAPKIN_ASPECT;

/** A few hand-drawn strokes, all marked detail, that draw the fix into the failed part's box. */
export function fixStrokes(m: HistoricMission, reading: SketchReading): Stroke[] {
  const failure = m.failure;
  if (!failure) return [];
  const box = partBox(reading.parts, (p) => p.kind === failure.part && (failure.stageIndex === undefined || p.stageIndex === failure.stageIndex)) ??
    partBox(reading.parts, (p) => p.kind === failure.part) ??
    partBox(reading.parts, () => true);
  if (!box) return [];
  const [x, y, w, h] = box;
  const wobble = jitter(m.id.length * 7 + 3);
  const line = (a: Point, b: Point, n = 8): Stroke => ({
    detail: true,
    points: Array.from({ length: n + 1 }, (_, i): Point => {
      const t = i / n;
      return clampPoint([a[0] + (b[0] - a[0]) * t + wobble() * 0.002, a[1] + (b[1] - a[1]) * t + wobble() * 0.002]);
    }),
  });
  const ring = (cx: number, cy: number, rx: number, ry: number): Stroke => ({
    detail: true,
    points: Array.from({ length: 29 }, (_, i): Point => {
      const a = (i / 28) * Math.PI * 2.08;
      return clampPoint([cx + Math.cos(a) * rx + wobble() * 0.002, cy + Math.sin(a) * ry + wobble() * 0.002]);
    }),
  });

  if (m.id === "falcon1-f1") {
    // A reinforced fitting ring near the top of the engine, with two hatch marks beside it.
    const cy = y + h * 0.3;
    return [
      ring(x + w / 2, cy, w * 0.32, h * 0.14),
      ring(x + w / 2, cy, w * 0.36, h * 0.17),
      line([x + w * 0.06, cy - h * 0.12], [x + w * 0.16, cy + h * 0.06], 4),
      line([x + w * 0.84, cy - h * 0.12], [x + w * 0.94, cy + h * 0.06], 4),
    ];
  }
  if (m.id === "crs7") {
    // An X-brace inside the stage-2 tank, plus a doubled strut across it.
    const [l, r, t, b] = [x + w * 0.15, x + w * 0.85, y + h * 0.15, y + h * 0.85];
    return [
      line([l, t], [r, b]),
      line([r, t], [l, b]),
      line([l, y + h * 0.48], [r, y + h * 0.48], 6),
      line([l, y + h * 0.53], [r, y + h * 0.53], 6),
    ];
  }
  if (m.id === "ift1") {
    // A thick flame-deflector plate under the booster, and a hot-staging ring at the interstage.
    const plateY = Math.min(0.985, y + h + 0.012);
    const [pl, pr] = [x - w * 0.2, x + w * 1.2];
    const booster = partBox(reading.parts, (p) => p.kind === "tank" && p.stageIndex === 0);
    const ringY = booster ? booster[1] : y - h * 4;
    const [rl, rr] = booster ? [booster[0], booster[0] + booster[2]] : [x, x + w];
    const strokes = [0, 0.006, 0.012].map((dy) => line([pl, Math.min(0.995, plateY + dy)], [pr, Math.min(0.995, plateY + dy)], 6));
    strokes.push(line([rl, ringY], [rr, ringY], 6));
    // Vent ticks along the hot-staging ring.
    for (let i = 1; i <= 4; i++) {
      const vx = rl + ((rr - rl) * i) / 5;
      strokes.push(line([vx, ringY - 0.008], [vx, ringY + 0.008], 2));
    }
    return strokes;
  }
  if (m.id === "electron-f1") {
    // Nothing on the rocket changed: a tracking dish on the ground beside it, its link restored,
    // with radio waves aimed up at the stage that was flying when the data was lost.
    const whole = partBox(reading.parts, () => true) ?? box;
    const [wx, wy, ww, wh] = whole;
    // Right of the rocket when there's room: the fix note runs out to the right of the fix, so a
    // dish on the left would put the note across the rocket.
    const right = wx + ww + 0.12 <= 0.97;
    const dx = right ? wx + ww + 0.07 : wx - 0.07;
    const groundY = Math.min(0.97, wy + wh);
    const dishY = groundY - 0.07;
    // Aim from the dish at the middle of the failed stage, in screen-true angles (y is squashed on the napkin).
    const aim = Math.atan2((y + h / 2 - dishY) / NAPKIN_Y, x + w / 2 - dx);
    const rot = (u: number, v: number): Point => [
      dx + (u * Math.cos(aim) - v * Math.sin(aim)),
      dishY + (u * Math.sin(aim) + v * Math.cos(aim)) * NAPKIN_Y,
    ];
    const curve = (pts: Point[]): Stroke => ({ detail: true, points: pts.map(([px, py]) => clampPoint([px + wobble() * 0.0012, py + wobble() * 0.0012])) });
    // The bowl: a parabola opening toward the rocket, with the feed on a strut at its focus.
    const bowl = curve(Array.from({ length: 11 }, (_, i): Point => {
      const v = -0.04 + (i / 10) * 0.08;
      return rot((v * v) / 0.05 - 0.016, v);
    }));
    const feed = curve([rot(-0.016, 0), rot(0.028, 0)]);
    const strokes = [bowl, feed, line([dx, dishY + 0.01], [dx, groundY], 4), line([dx - 0.022, groundY], [dx + 0.022, groundY], 3)];
    // Three waves widening toward the stage.
    for (const r of [0.045, 0.07, 0.095]) {
      strokes.push(curve(Array.from({ length: 9 }, (_, i): Point => {
        const a = -0.45 + (i / 8) * 0.9;
        return rot(0.028 + r * Math.cos(a), r * Math.sin(a));
      })));
    }
    return strokes;
  }
  // Anything else: a reinforcing cross-hatch in the failed part.
  return [line([x + w * 0.2, y + h * 0.2], [x + w * 0.8, y + h * 0.8]), line([x + w * 0.8, y + h * 0.2], [x + w * 0.2, y + h * 0.8])];
}

/**
 * The flaw drawn into the sketch before any review, in the same graphite hand as the user's
 * lines (not detail strokes), small enough that the reader still sees the same parts:
 * falcon1-f1 a cracked, dripping fitting on the engine's fuel line; crs7 a helium bottle on one
 * cracked strut inside the stage-2 tank; ift1 crossed-out engine bells with smoke in the bay;
 * electron-f13 a power cable in the second stage whose overheated connector has come apart.
 * (electron-f1 gets none: the rocket was fine, and the fault was in a receiver on the ground.)
 */
export function defectStrokes(m: HistoricMission, reading: SketchReading): Stroke[] {
  const failure = m.failure;
  if (m.outcome !== "lost" || !failure) return [];
  const box =
    partBox(reading.parts, (p) => p.kind === failure.part && (failure.stageIndex === undefined || p.stageIndex === failure.stageIndex)) ??
    partBox(reading.parts, (p) => p.kind === failure.part);
  if (!box) return [];
  const [x, y, w, h] = box;
  const wobble = jitter(m.id.length * 13 + 5);
  const pen = (points: Point[]): Stroke => ({
    points: points.map(([px, py]) => clampPoint([px + wobble() * 0.0015, py + wobble() * 0.0015])),
  });
  const polyline = (pts: Point[], steps = 3): Stroke => {
    const out: Point[] = [];
    pts.forEach((pt, i) => {
      if (i === 0) return void out.push(pt);
      const prev = pts[i - 1];
      for (let k = 1; k <= steps; k++) out.push([prev[0] + ((pt[0] - prev[0]) * k) / steps, prev[1] + ((pt[1] - prev[1]) * k) / steps]);
    });
    return pen(out);
  };
  const oval = (cx: number, cy: number, rx: number, ry: number, n = 20): Stroke =>
    pen(Array.from({ length: n + 1 }, (_, i): Point => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry]));

  if (m.id === "falcon1-f1") {
    // A fitting (hex nut) on the fuel line into the engine, cracked, dripping down the engine.
    const r = Math.min(w, h) * 0.1;
    const [nx, ny] = [x + w * 0.74, y + h * 0.28];
    const hex = pen(Array.from({ length: 7 }, (_, i): Point => [nx + Math.cos((i / 6) * Math.PI * 2) * r, ny + Math.sin((i / 6) * Math.PI * 2) * r]));
    return [
      polyline([[nx - r * 0.2, y + h * 0.02], [nx, ny - r]]),
      hex,
      polyline([[nx - r * 0.7, ny - r * 0.5], [nx - r * 0.1, ny], [nx + r * 0.3, ny - r * 0.2], [nx + r * 0.8, ny + r * 0.4]], 1),
      polyline([[nx - r * 0.3, ny + r * 1.3], [nx - r * 0.3, ny + r * 2.2]], 2),
      polyline([[nx + r * 0.2, ny + r * 1.5], [nx + r * 0.2, ny + r * 2.6]], 2),
      polyline([[nx + r * 0.7, ny + r * 1.2], [nx + r * 0.7, ny + r * 1.9]], 2),
    ];
  }
  if (m.id === "crs7") {
    // A helium bottle inside the stage-2 tank, held by one thin strut with a zigzag crack.
    const [bx, by] = [x + w * 0.5, y + h * 0.36];
    const [rx, ry] = [w * 0.16, h * 0.13];
    const strutTop: Point = [bx, by + ry];
    const strutBottom: Point = [bx + w * 0.12, y + h * 0.86];
    const mid: Point = [(strutTop[0] + strutBottom[0]) / 2, (strutTop[1] + strutBottom[1]) / 2];
    const z = w * 0.06;
    return [
      oval(bx, by, rx, ry),
      polyline([strutTop, strutBottom], 4),
      polyline([[mid[0] - z, mid[1] - z * 0.6], [mid[0] - z * 0.3, mid[1] + z * 0.4], [mid[0] + z * 0.2, mid[1] - z * 0.4], [mid[0] + z, mid[1] + z * 0.6]], 1),
    ];
  }
  if (m.id === "ift1") {
    // Engine bells crossed out across the row, and smoke curling up in the engine bay.
    const xs = [0.22, 0.5, 0.78];
    const r = Math.min(w * 0.09, h * 0.3);
    const cy = y + h * 0.6;
    const strokes = xs.flatMap((fx): Stroke[] => {
      const cx = x + w * fx;
      return [
        polyline([[cx - r, cy - r], [cx + r, cy + r]], 2),
        polyline([[cx + r, cy - r], [cx - r, cy + r]], 2),
      ];
    });
    for (const fx of [0.36, 0.64]) {
      const sx = x + w * fx;
      strokes.push(
        pen(Array.from({ length: 9 }, (_, i): Point => [sx + Math.sin(i * 1.4) * w * 0.025, y + h * 0.2 - (i / 8) * h * 0.55])),
      );
    }
    return strokes;
  }
  if (m.id === "electron-f13") {
    // The power cable down the stage to the engine's electric pumps, pulled apart at a connector
    // that overheated: the two halves sit apart with a spark between them and heat rising off them.
    const cx = x + w * 0.62;
    const [breakTop, breakBottom] = [y + h * 0.44, y + h * 0.56];
    // Sized for a slim stage too: never thinner than a pen's width.
    const cw = Math.max(w * 0.09, 0.007);
    const block = (bx: number, top: number, bottom: number) =>
      polyline([[bx - cw, top], [bx + cw, top], [bx + cw, bottom], [bx - cw, bottom], [bx - cw, top]], 1);
    const strokes = [
      // Cable from the top of the stage down to the upper half of the connector.
      polyline([[cx, y + h * 0.08], [cx - w * 0.02, y + h * 0.25], [cx, breakTop - h * 0.04]], 3),
      block(cx, breakTop - h * 0.04, breakTop),
      // The lower half, pulled off to one side, and the cable on down to the pumps.
      block(cx + w * 0.05, breakBottom, breakBottom + h * 0.04),
      polyline([[cx + w * 0.05, breakBottom + h * 0.04], [cx + w * 0.03, y + h * 0.75], [cx + w * 0.05, y + h * 0.93]], 3),
      // A spark across the gap.
      polyline([[cx - w * 0.01, breakTop + h * 0.01], [cx + w * 0.04, breakTop + h * 0.04], [cx + w * 0.01, breakTop + h * 0.07], [cx + w * 0.06, breakBottom - h * 0.01]], 1),
    ];
    // Heat curling up off the connector.
    for (const fx of [-0.16, -0.24]) {
      const hx = cx + w * fx;
      strokes.push(pen(Array.from({ length: 7 }, (_, i): Point => [hx + Math.sin(i * 1.5) * w * 0.025, breakTop + h * 0.02 - (i / 6) * h * 0.2])));
    }
    return strokes;
  }
  return [];
}

function partBox(parts: Part[], test: (p: Part) => boolean): Box | null {
  const hits = parts.filter(test);
  if (hits.length === 0) return null;
  const x0 = Math.min(...hits.map((p) => p.box[0]));
  const y0 = Math.min(...hits.map((p) => p.box[1]));
  const x1 = Math.max(...hits.map((p) => p.box[0] + p.box[2]));
  const y1 = Math.max(...hits.map((p) => p.box[1] + p.box[3]));
  return [x0, y0, x1 - x0, y1 - y0];
}

function clampPoint([x, y]: Point): Point {
  return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
}

/** Deterministic pen wobble in -1..1, the same on every render. */
function jitter(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}
