import type {
  Analysis,
  Design,
  DestinationId,
  FlightEvent,
  FlightEventKind,
  FlightPoint,
  FlightTrace,
  Verdict,
} from "@/lib/design";
import { BOUNDARIES } from "./atmosphere";

// Playback timeline, in seconds of animation. The napkin fades to night, the camera
// settles on the pad, the engines light, and then the trace plays compressed.
export const T_NIGHT = 1.2;
export const T_CAM_FROM = 0.25;
export const T_FRAMED = 1.7;
export const T_IGNITE = 1.55;
export const T_LIFTOFF = 3.3;

/** Real seconds the flight itself gets, liftoff to the final event, before the outcome plays. */
const FLIGHT_PLAY = 10;
/** Minimum real seconds between two callouts. */
const CAPTION_GAP = 1.2;

export type Tone = "chalk" | "flame" | "red" | "go";

export interface Cue {
  at: number;
  event: FlightEvent;
  /** False for events the scene adds itself (they show a caption but are not sent to onEvent). */
  real: boolean;
}

export interface CaptionCue {
  at: number;
  text: string;
  sub?: string;
  tone: Tone;
}

/** The engines of `piece` burn from `from` to `to` (playback seconds). */
export interface Burn {
  from: number;
  to: number;
  piece: number;
}

/** The rocket passing a layer boundary, for the ladder and the mission log. */
export interface Crossing {
  at: number;
  /** Sim seconds after liftoff, for the log's T+ stamp. */
  simT: number;
  km: number;
  text: string;
  hero: boolean;
}

export interface Finale {
  at: number;
  text: string;
  ok: boolean;
}

export interface Plan {
  outcome: Verdict;
  points: FlightPoint[];
  /** Sim seconds the playback covers. */
  T: number;
  flightDur: number;
  /** Null when the rocket never leaves the pad. */
  liftoffAt: number | null;
  cues: Cue[];
  captions: CaptionCue[];
  crossings: Crossing[];
  burns: Burn[];
  /** seps[i] is when pieces[i] lets go. */
  seps: number[];
  /** Orbit: limb rises and engines cut. Failure: the explosion. */
  finaleAt: number;
  finale: Finale;
  tipAt: number | null;
  explodeAt: number | null;
  endAt: number;
  maxAltKm: number;
  maxSpeedMps: number;
  hasDownrange: boolean;
  /** Sim seconds at playback time t. */
  simAt: (t: number) => number;
}

export interface Sample {
  alt: number;
  down: number;
  speed: number;
  stage: number;
}

export const DEST_SHORT: Record<DestinationId, string> = {
  leo: "ORBIT",
  gto: "GTO",
  "moon-orbit": "MOON",
  "moon-surface": "MOON",
  "mars-transfer": "MARS",
  "mars-surface": "MARS",
  europa: "EUROPA",
};

export const DEST_NAME: Record<DestinationId, string> = {
  leo: "low Earth orbit",
  gto: "geostationary transfer",
  "moon-orbit": "lunar orbit",
  "moon-surface": "the Moon's surface",
  "mars-transfer": "the Mars transfer",
  "mars-surface": "the surface of Mars",
  europa: "Europa",
};

const OFF_KINDS = new Set<FlightEventKind>(["engine-cutoff", "fuel-exhausted", "orbit", "arrival", "impact"]);

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function fmtKm(km: number): string {
  return km >= 100 ? Math.round(km).toLocaleString("en-US") : km.toFixed(1);
}

export function buildPlan(trace: FlightTrace, analysis: Analysis, design: Design, pieceCount: number): Plan {
  const outcome: Verdict = trace.outcome ?? analysis.verdict;
  let points = (trace.points ?? [])
    .filter((p) => Number.isFinite(p.tS) && Number.isFinite(p.altitudeKm))
    .map((p) => ({
      tS: p.tS,
      altitudeKm: Math.max(0, p.altitudeKm),
      downrangeKm: Number.isFinite(p.downrangeKm) ? p.downrangeKm : 0,
      speedMps: Number.isFinite(p.speedMps) ? p.speedMps : 0,
      stageIndex: Number.isFinite(p.stageIndex) ? p.stageIndex : 0,
    }))
    .sort((a, b) => a.tS - b.tS);
  if (points.length === 0) points = [{ tS: 0, altitudeKm: 0, downrangeKm: 0, speedMps: 0, stageIndex: 0 }];
  const events = (trace.events ?? []).filter((e) => Number.isFinite(e.tS)).sort((a, b) => a.tS - b.tS);

  if (outcome === "stuck-on-pad") return padPlan(points, events, analysis, design);
  return flightPlan(outcome, points, events, trace, design, pieceCount);
}

function padPlan(points: FlightPoint[], events: FlightEvent[], analysis: Analysis, design: Design): Plan {
  const tipAt = T_IGNITE + 2.9;
  const explodeAt = tipAt + 1;
  const cues: Cue[] = [];
  let j = 0;
  for (const e of events) {
    cues.push({ at: e.kind === "impact" ? explodeAt : T_IGNITE + 1.1 + 0.8 * j++, event: e, real: true });
  }
  if (!cues.some((c) => c.event.kind === "pad-failure")) {
    const twr = analysis.liftoffTwr;
    cues.push({
      at: T_IGNITE + 1.1,
      event: { tS: 0, kind: "pad-failure", label: `Liftoff thrust-to-weight is ${twr.toFixed(2)}; it has to beat 1.` },
      real: false,
    });
  }
  cues.sort((a, b) => a.at - b.at);
  return {
    outcome: "stuck-on-pad",
    points,
    T: 1,
    flightDur: 0,
    liftoffAt: null,
    cues,
    captions: captionsFor(cues, 0, true),
    crossings: [],
    burns: [{ from: T_IGNITE, to: explodeAt, piece: 0 }],
    seps: [],
    finaleAt: explodeAt,
    finale: finaleFor("stuck-on-pad", design, explodeAt + 0.15),
    tipAt,
    explodeAt,
    endAt: explodeAt + 1.8,
    maxAltKm: 0,
    maxSpeedMps: 0,
    hasDownrange: false,
    simAt: () => 0,
  };
}

function flightPlan(
  outcome: Verdict,
  points: FlightPoint[],
  events: FlightEvent[],
  trace: FlightTrace,
  design: Design,
  pieceCount: number,
): Plan {
  const synthetic: FlightEvent[] = [];
  let maxAltKm = Math.max(trace.maxAltitudeKm || 0, ...points.map((p) => p.altitudeKm));

  let T: number;
  if (outcome === "suborbital") {
    points = withFallTail(points);
    const impact = events.find((e) => e.kind === "impact");
    T = impact && impact.tS > 0 ? impact.tS : points[points.length - 1].tS;
    if (!impact) synthetic.push({ tS: T, kind: "impact", label: "Impact" });
    if (!events.some((e) => e.kind === "apogee") && maxAltKm > 0.5) {
      const top = points.reduce((a, b) => (b.altitudeKm > a.altitudeKm ? b : a));
      synthetic.push({ tS: top.tS, kind: "apogee", label: `Apogee ${fmtKm(top.altitudeKm)} km` });
    }
    if (!events.some((e) => e.kind === "fuel-exhausted" || e.kind === "engine-cutoff")) {
      const apo = events.find((e) => e.kind === "apogee")?.tS ?? synthetic.find((e) => e.kind === "apogee")?.tS ?? T;
      const climbing = points.filter((p) => p.tS <= apo);
      const fastest = climbing.reduce((a, b) => (b.speedMps > a.speedMps ? b : a), climbing[0] ?? points[0]);
      synthetic.push({ tS: fastest.tS, kind: "fuel-exhausted", label: "Fuel exhausted" });
    }
  } else {
    const done =
      events.find((e) => e.kind === "orbit") ??
      events.find((e) => e.kind === "arrival") ??
      [...events].reverse().find((e) => e.kind === "engine-cutoff");
    T = done && done.tS > 0 ? done.tS : points[points.length - 1].tS;
  }
  if (!(T > 0)) T = Math.max(1, points[points.length - 1].tS);
  maxAltKm = Math.max(maxAltKm, ...points.filter((p) => p.tS <= T).map((p) => p.altitudeKm));

  // Separations the trace implies through stageIndex but never announces.
  if (!events.some((e) => e.kind === "stage-sep")) {
    for (let i = 1; i < points.length; i++) {
      if (points[i].stageIndex > points[i - 1].stageIndex && points[i].tS <= T) {
        synthetic.push({ tS: points[i].tS, kind: "stage-sep", label: "Stage separation" });
      }
    }
  }

  // Time warp: the dramatic beats get real seconds, the long burns and coasts between them
  // fast-forward. Built from the event timestamps, so it follows whatever the trace says.
  const karmanSims = crossingsFor(points, T, (sim) => sim)
    .filter((c) => c.hero)
    .map((c) => c.simT);
  const warp = warpFor(T, [...events, ...synthetic], karmanSims, outcome);
  const flightDur = warp.duration;
  const liftoffAt = T_LIFTOFF;
  const finaleAt = liftoffAt + flightDur;
  const simAt = (t: number) => (t <= liftoffAt ? 0 : warp.sim(Math.min(t - liftoffAt, flightDur)));
  const playOf = (sim: number) => liftoffAt + warp.play(sim);

  const cues: Cue[] = [];
  let late = 0;
  const schedule = (e: FlightEvent, real: boolean) => {
    const at = e.tS > T + 1e-6 ? finaleAt + 0.6 + 0.5 * late++ : playOf(e.tS);
    cues.push({ at, event: e, real });
  };
  events.forEach((e) => schedule(e, true));
  synthetic.forEach((e) => schedule(e, false));
  cues.sort((a, b) => a.at - b.at);

  // Who is burning when: the bottom stage from ignition until a cutoff or separation,
  // then the next stage lights shortly after it is free.
  const burns: Burn[] = [];
  const seps: number[] = [];
  let piece = 0;
  let on: number | null = T_IGNITE;
  for (const c of cues) {
    const k = c.event.kind;
    if (k === "stage-sep") {
      if (on !== null) burns.push({ from: on, to: c.at, piece });
      if (piece < pieceCount - 1) {
        seps.push(c.at);
        piece++;
      }
      on = c.at + 0.6;
    } else if (OFF_KINDS.has(k) && on !== null) {
      const cut = k === "orbit" || k === "arrival" ? Math.max(c.at, finaleAt) + 0.45 : c.at;
      burns.push({ from: on, to: cut, piece });
      on = null;
    }
  }
  if (on !== null) burns.push({ from: on, to: finaleAt + 0.45, piece });

  const crossings = crossingsFor(points, T, playOf);
  const sepsSeen = { n: 0 };
  const failed = outcome === "suborbital";
  const finale = finaleFor(outcome, design, failed ? finaleAt + 0.15 : finaleAt + 0.35);
  const maxDown = Math.max(...points.map((p) => Math.abs(p.downrangeKm)));

  return {
    outcome,
    points,
    T,
    flightDur,
    liftoffAt,
    cues,
    // In orbit the finale has the stage; later events still reach onEvent but get no caption.
    captions: withKarman(
      captionsFor(cues, maxAltKm, false, sepsSeen, outcome === "suborbital" ? Infinity : finaleAt - 0.2),
      crossings,
    ),
    crossings,
    burns,
    seps,
    finaleAt,
    finale,
    tipAt: null,
    explodeAt: failed ? finaleAt : null,
    // The end card follows the outcome closely: no long linger.
    endAt: finaleAt + 1.8,
    maxAltKm,
    maxSpeedMps: Math.max(0, ...points.filter((p) => p.tS <= T).map((p) => p.speedMps)),
    hasDownrange: maxDown > Math.max(0.5, maxAltKm * 0.02),
    simAt,
  };
}

interface Beat {
  from: number;
  to: number;
  /** Real seconds this stretch of sim time plays in. */
  play: number;
}

/**
 * Maps playback seconds (from liftoff) to sim seconds and back. Beats around each event
 * play slowly; the gaps between them share what's left of FLIGHT_PLAY and fast-forward.
 * A monotone cubic through the knots keeps the speed changes smooth.
 */
function warpFor(T: number, events: FlightEvent[], karmanSims: number[], outcome: Verdict) {
  const beat = (s: number, before: number, after: number, play: number): Beat => ({
    from: Math.max(0, s - before),
    to: Math.min(T, s + after),
    play,
  });
  const lift = Math.min(T * 0.05, 10);
  const beats: Beat[] = [
    { from: 0, to: lift, play: 1.5 },
    { from: lift, to: Math.max(lift, Math.min(T * 0.12, 32)), play: 1.2 },
  ];
  for (const e of events) {
    if (e.tS <= 0 || e.tS > T) continue;
    if (e.kind === "max-q") beats.push(beat(e.tS, 6, 6, 0.9));
    else if (e.kind === "stage-sep") beats.push(beat(e.tS, 3, 6, 1.5));
    else if (e.kind === "engine-cutoff") beats.push(beat(e.tS, 3, 3, 0.6));
    else if (e.kind === "fuel-exhausted") beats.push(beat(e.tS, 3, 4, 0.9));
    else if (e.kind === "apogee") beats.push(beat(e.tS, 10, 10, 1));
  }
  for (const k of karmanSims) beats.push(beat(k, 4, 4, 0.8));
  // The approach to the outcome: the fall and reentry before impact, or the last push to orbit.
  beats.push(outcome === "suborbital" ? beat(T, 30, 0, 1.5) : beat(T, 12, 0, 0.6));

  beats.sort((a, b) => a.from - b.from);
  const merged: Beat[] = [];
  for (const b of beats) {
    if (b.to <= b.from) continue;
    const last = merged[merged.length - 1];
    if (last && b.from < last.to) {
      last.to = Math.max(last.to, b.to);
      last.play = Math.min(3, last.play + 0.6 * b.play);
    } else {
      merged.push({ ...b });
    }
  }
  const beatPlay = merged.reduce((n, b) => n + b.play, 0);
  const squeeze = Math.min(1, (FLIGHT_PLAY * 0.8) / Math.max(beatPlay, 1e-6));
  merged.forEach((b) => (b.play *= squeeze));

  // Lay out beats and the gaps between them over [0, T].
  const segs: { from: number; to: number; play: number | null }[] = [];
  let cursor = 0;
  for (const b of merged) {
    if (b.from > cursor) segs.push({ from: cursor, to: b.from, play: null });
    segs.push(b);
    cursor = b.to;
  }
  if (cursor < T) segs.push({ from: cursor, to: T, play: null });
  const gaps = segs.filter((g) => g.play === null);
  const left = Math.max(0.5, FLIGHT_PLAY - merged.reduce((n, b) => n + b.play, 0));
  const weight = gaps.reduce((n, g) => n + Math.pow(g.to - g.from, 0.6), 0) || 1;
  gaps.forEach((g) => (g.play = Math.max(0.12, (left * Math.pow(g.to - g.from, 0.6)) / weight)));

  const xs = [0];
  const ys = [0];
  for (const g of segs) {
    xs.push(xs[xs.length - 1] + (g.play ?? 0.12));
    ys.push(g.to);
  }
  const map = monotoneCubic(xs, ys);
  const duration = xs[xs.length - 1];
  return {
    duration,
    sim: map,
    /** Inverse of sim(): the playback second (from liftoff) at which sim time `s` plays. */
    play(s: number): number {
      if (s <= 0) return 0;
      if (s >= T) return duration;
      let lo = 0;
      let hi = duration;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (map(mid) < s) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    },
  };
}

/** Fritsch–Carlson monotone cubic through (xs, ys): never runs backwards, no overshoot. */
function monotoneCubic(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  if (n < 2) return () => ys[0] ?? 0;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1e-9));
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) {
      const tau = 3 / Math.sqrt(h);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * m[i + 1]
    );
  };
}

/** Every time the trace passes a layer boundary, either way, within the played part. */
function crossingsFor(points: FlightPoint[], T: number, playOf: (sim: number) => number): Crossing[] {
  const out: Crossing[] = [];
  for (let i = 1; i < points.length && points[i - 1].tS < T; i++) {
    const a = points[i - 1];
    const b = points[i];
    for (const bd of BOUNDARIES) {
      const up = a.altitudeKm < bd.km && b.altitudeKm >= bd.km;
      const down = a.altitudeKm >= bd.km && b.altitudeKm < bd.km;
      if (!up && !down) continue;
      const k = (bd.km - a.altitudeKm) / (b.altitudeKm - a.altitudeKm || 1);
      const simT = Math.min(T, a.tS + (b.tS - a.tS) * k);
      out.push({ at: playOf(simT), simT, km: bd.km, text: up ? bd.up : bd.down, hero: !!bd.hero });
    }
  }
  return out.sort((x, y) => x.at - y.at);
}

/** "Space begins" gets its own callout on the way up, slotted between the others. */
function withKarman(captions: CaptionCue[], crossings: Crossing[]): CaptionCue[] {
  const karman = crossings.find((c) => c.hero && c.text.startsWith("Crossed"));
  if (!karman) return captions;
  const all = [...captions, { at: karman.at, text: "Kármán line", sub: "Space begins · 100 km", tone: "chalk" as Tone }];
  all.sort((a, b) => a.at - b.at);
  let lastAt = -Infinity;
  for (const c of all) {
    c.at = Math.max(c.at, lastAt + CAPTION_GAP);
    lastAt = c.at;
  }
  return all;
}

/** If a suborbital trace stops in mid-air, finish the fall ballistically so it can hit the ground. */
function withFallTail(points: FlightPoint[]): FlightPoint[] {
  const last = points[points.length - 1];
  if (last.altitudeKm < 0.3) return points;
  const prev = points.length > 1 ? points[points.length - 2] : last;
  const dt = last.tS - prev.tS || 1;
  const g = 9.81;
  const vz = ((last.altitudeKm - prev.altitudeKm) * 1000) / dt;
  const vx = ((last.downrangeKm - prev.downrangeKm) * 1000) / dt;
  const h = last.altitudeKm * 1000;
  const fall = (vz + Math.sqrt(vz * vz + 2 * g * h)) / g;
  const tail: FlightPoint[] = [];
  const n = 16;
  for (let i = 1; i <= n; i++) {
    const s = (fall * i) / n;
    const alt = Math.max(0, h + vz * s - 0.5 * g * s * s);
    const v = vz - g * s;
    tail.push({
      tS: last.tS + s,
      altitudeKm: i === n ? 0 : alt / 1000,
      downrangeKm: last.downrangeKm + (vx * s) / 1000,
      speedMps: Math.hypot(vx, v),
      stageIndex: last.stageIndex,
    });
  }
  return [...points, ...tail];
}

function finaleFor(outcome: Verdict, design: Design, at: number): Finale {
  switch (outcome) {
    case "orbit":
      return { at, text: "ORBIT", ok: true };
    case "destination":
      return { at, text: DEST_SHORT[design.destination] ?? "ORBIT", ok: true };
    default:
      return { at, text: "RUD", ok: false };
  }
}

function captionsFor(cues: Cue[], maxAltKm: number, onPad: boolean, sepsSeen = { n: 0 }, until = Infinity): CaptionCue[] {
  const out: CaptionCue[] = [];
  let lastAt = -Infinity;
  for (const c of cues) {
    const base = captionText(c.event.kind, maxAltKm, sepsSeen.n, onPad);
    if (c.event.kind === "stage-sep") sepsSeen.n++;
    if (!base || c.at >= until) continue;
    // "fuel exhausted" already says the engines stopped.
    const dryAtCutoff =
      c.event.kind === "engine-cutoff" &&
      cues.some((o) => o.event.kind === "fuel-exhausted" && Math.abs(o.event.tS - c.event.tS) < 2);
    // A cutoff right before separation is one moment; "Stage separation!" says it.
    const cutAtSep =
      c.event.kind === "engine-cutoff" &&
      cues.some((o) => o.event.kind === "stage-sep" && o.event.tS >= c.event.tS && o.event.tS - c.event.tS < 8);
    if (dryAtCutoff || cutAtSep) continue;
    const label = c.event.label?.trim();
    const sub = label && normalize(label) !== normalize(base.text) ? label : undefined;
    const at = Math.max(c.at, lastAt + CAPTION_GAP);
    lastAt = at;
    out.push({ at, text: base.text, sub, tone: base.tone });
  }
  return out;
}

function captionText(kind: FlightEventKind, maxAltKm: number, seps: number, onPad: boolean): { text: string; tone: Tone } | null {
  switch (kind) {
    case "liftoff":
      return onPad ? null : { text: "Liftoff!", tone: "flame" };
    case "max-q":
      return { text: "Max-Q", tone: "chalk" };
    case "stage-sep":
      return { text: "Stage separation!", tone: "chalk" };
    case "engine-cutoff":
      return { text: seps > 0 ? "SECO" : "MECO", tone: "chalk" };
    case "fuel-exhausted":
      return { text: "fuel exhausted", tone: "red" };
    case "apogee":
      return { text: `apogee ${fmtKm(maxAltKm)} km`, tone: "chalk" };
    case "pad-failure":
      return { text: "not enough thrust", tone: "red" };
    default:
      // orbit, arrival and impact are the finale's job.
      return null;
  }
}

const normalize = (s: string) => s.toLowerCase().replace(/\b(at|the|of)\b/g, "").replace(/[^a-z0-9]/g, "");

export function sampleAt(points: FlightPoint[], t: number): Sample {
  const n = points.length;
  const at = (p: FlightPoint): Sample => ({ alt: p.altitudeKm, down: p.downrangeKm, speed: p.speedMps, stage: p.stageIndex });
  if (t <= points[0].tS) return at(points[0]);
  if (t >= points[n - 1].tS) return at(points[n - 1]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].tS <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const k = (t - a.tS) / (b.tS - a.tS || 1);
  return {
    alt: a.altitudeKm + (b.altitudeKm - a.altitudeKm) * k,
    down: a.downrangeKm + (b.downrangeKm - a.downrangeKm) * k,
    speed: a.speedMps + (b.speedMps - a.speedMps) * k,
    stage: a.stageIndex,
  };
}

/** Direction of travel at sim time t: 0 is straight up, PI/2 is flying right, PI is straight down. */
export function headingAt(plan: Plan, sim: number): number | null {
  const d = Math.max(1, plan.T * 0.01);
  const a = sampleAt(plan.points, sim - d);
  const b = sampleAt(plan.points, sim + d);
  const dA = b.alt - a.alt;
  let dD = b.down - a.down;
  if (!plan.hasDownrange) {
    if (plan.outcome === "orbit" || plan.outcome === "destination") {
      // The trace is straight up; fake a gravity turn so it still looks like a launch.
      const k = clamp01((a.alt + b.alt) / 2 / Math.max(1, plan.maxAltKm));
      return (Math.PI / 2) * 0.8 * k * k * (3 - 2 * k);
    }
    // Lean a hair downrange so a ballistic fall flips over one consistent way.
    dD = Math.abs(dA) * 0.08;
  }
  if (Math.hypot(dA, dD) < 1e-9) return null;
  return Math.atan2(dD, dA);
}
