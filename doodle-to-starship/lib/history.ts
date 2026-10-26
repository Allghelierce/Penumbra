// Real flights from history, replayed through the studio: the demo sketch stands in for the
// vehicle, the red pen marks the part that actually failed, and the launch follows the real
// timeline. Pure functions over a HistoricMission; no API calls.

import { DEMO_SKETCHES } from "./demo-sketches";
import type { Analysis, FlightEvent, FlightPoint, FlightTrace, HistoricMission, Review, SketchReading } from "./design";
import { analyze } from "./physics";
import { historicMarks } from "./redpen";
import { readFromGeometry } from "./sketch/geometry";

const TRACE_POINTS = 300;
/** Speed at which a climb has turned fully horizontal, for the downrange estimate. */
const ORBITAL_SPEED_MPS = 7_800;

/** The mission's stand-in sketch, read locally, named for the real vehicle. */
export function historicReading(m: HistoricMission): SketchReading {
  const sketch = DEMO_SKETCHES.find((s) => s.id === m.sketchId) ?? DEMO_SKETCHES[0];
  const reading = readFromGeometry(sketch.strokes, m.destination);
  return { ...reading, design: { ...reading.design, name: m.vehicle, destination: m.destination } };
}

/** The engineer's markup, plus the real failure: a heavy outline on the part, its name, and ① what happened. */
export function historicReview(
  m: HistoricMission,
  reading: SketchReading,
  analysis: Analysis = analyze(reading.design),
): Review {
  const summary = m.failure
    ? `${m.vehicle}, ${m.mission}: ${m.failure.label}. ${m.failure.detail}`
    : `${m.vehicle}, ${m.mission}: flew as planned.`;
  return { marks: historicMarks(reading, analysis, m.failure), summary };
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
