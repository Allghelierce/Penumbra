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
import { BOUNDARIES, MOON_KM } from "./atmosphere";

// Playback timeline, in seconds of animation. The napkin fades to night, the camera
// settles on the pad, the engines light, and then the trace plays compressed.
export const T_NIGHT = 1.2;
export const T_CAM_FROM = 0.25;
export const T_FRAMED = 1.7;
export const T_IGNITE = 1.55;
export const T_LIFTOFF = 3.3;

/** Minimum real seconds between two callouts. */
const CAPTION_GAP = 1.2;
const G0 = 9.81;
/** The pad's tower stands a little taller than the vehicle; past this many vehicle heights it's clear. */
const TOWER_CLEAR = 1.1;
/** Flight seconds, after the tower is cleared, over which the launch's own pad climb hands over to the trace. */
const HANDOVER_S = 25;

/**
 * Real seconds the flight gets at 1×, liftoff to the outcome: 30–40 s for your own rocket, 45–60 s
 * for a real flight from history, and never longer than the flight itself took.
 */
function flightBudget(T: number, scenario?: string): number {
  const budget = scenario ? Math.min(60, Math.max(45, 40 + T / 30)) : Math.min(40, Math.max(30, 26 + T / 60));
  return Math.min(budget, T);
}

export type Tone = "chalk" | "flame" | "red" | "go";

export interface Cue {
  at: number;
  event: FlightEvent;
  /** False for events the scene adds itself (they show a caption but are not sent to onEvent). */
  real: boolean;
}

export interface CaptionCue {
  at: number;
  /** Set on transcript captions: real recorded dialog, e.g. "Launch Director". */
  speaker?: string;
  /** Transcript captions: seconds the quote needs to be spoken. */
  hold?: number;
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
  /** The line above the big word, when it isn't the usual "Mission success" or "Orbit achieved". */
  kicker?: string;
  /** A line under the big word, e.g. "Leaving Earth at 8.8 km/s · ~2.7-year coast to Jupiter". */
  sub?: string;
}

/** A trip past low Earth orbit, after the climb: playback seconds unless named sim. */
export interface Departure {
  /** Into the parking orbit, the departure burn lighting, and its cutoff. */
  parkAt: number;
  burnAt: number;
  cutAt: number;
  /** Sim seconds at the parking-orbit insertion, and the downrange km there. */
  parkSim: number;
  downAtPark: number;
  /** At the Moon's distance, or leaving Earth on the long coast to another planet. */
  end: "arrival" | "escape";
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
  /** Real dialog from event labels like `Launch Director: "…"`, shown as subtitles. */
  transcripts: CaptionCue[];
  crossings: Crossing[];
  burns: Burn[];
  /** seps[i] is when pieces[i] lets go. */
  seps: number[];
  /** Orbit: limb rises and engines cut. Failure: the explosion. */
  finaleAt: number;
  finale: Finale;
  tipAt: number | null;
  /** Set when the vehicle broke up in flight (historic replays): where and when it was lost. */
  lostAt: { tS: number; altKm: number } | null;
  explodeAt: number | null;
  endAt: number;
  maxAltKm: number;
  maxSpeedMps: number;
  hasDownrange: boolean;
  /** Sim seconds at playback time t. */
  simAt: (t: number) => number;
  /** Set for a trip past low Earth orbit: the parking orbit, the departure burn and the coast. */
  depart: Departure | null;
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

const OFF_KINDS = new Set<FlightEventKind>(["engine-cutoff", "fuel-exhausted", "orbit", "arrival", "impact", "breakup"]);

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function fmtKm(km: number): string {
  return km >= 100 ? Math.round(km).toLocaleString("en-US") : km.toFixed(1);
}

export function buildPlan(trace: FlightTrace, analysis: Analysis, design: Design, pieceCount: number, scenario?: string): Plan {
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
  return flightPlan(outcome, points, events, trace, analysis, design, pieceCount, scenario);
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
    transcripts: transcriptsFor(cues),
    crossings: [],
    burns: [{ from: T_IGNITE, to: explodeAt, piece: 0 }],
    seps: [],
    finaleAt: explodeAt,
    finale: finaleFor("stuck-on-pad", design, explodeAt + 0.15),
    tipAt,
    lostAt: null,
    explodeAt,
    endAt: explodeAt + 1.8,
    maxAltKm: 0,
    maxSpeedMps: 0,
    hasDownrange: false,
    simAt: () => 0,
    depart: null,
  };
}

function flightPlan(
  outcome: Verdict,
  points: FlightPoint[],
  events: FlightEvent[],
  trace: FlightTrace,
  analysis: Analysis,
  design: Design,
  pieceCount: number,
  scenario?: string,
): Plan {
  const synthetic: FlightEvent[] = [];
  let maxAltKm = Math.max(trace.maxAltitudeKm || 0, ...points.map((p) => p.altitudeKm));

  let T: number;
  // A breakup ends the flight right there, mid-air, whatever else the trace says.
  const breakup = events.find((e) => e.kind === "breakup" && e.tS > 0);
  // Bound past low Earth orbit, the flight runs on through the parking orbit, the departure burn
  // and the coast, to the Moon's distance or to where Earth lets go.
  const trip = breakup ? null : departureOf(outcome, events);
  if (breakup) {
    T = breakup.tS;
  } else if (outcome === "suborbital") {
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
      trip?.end ??
      events.find((e) => e.kind === "orbit") ??
      events.find((e) => e.kind === "arrival") ??
      [...events].reverse().find((e) => e.kind === "engine-cutoff");
    T = done && done.tS > 0 ? done.tS : points[points.length - 1].tS;
  }
  if (!(T > 0)) T = Math.max(1, points[points.length - 1].tS);
  maxAltKm = Math.max(maxAltKm, ...points.filter((p) => p.tS <= T).map((p) => p.altitudeKm));

  // Off the pad at the real pace: a heavy rocket crawls past its tower.
  const accel = G0 * (Math.max(1.05, analysis.liftoffTwr || 1.3) - 1);
  const clearS = Math.sqrt((2 * TOWER_CLEAR * (design.heightM > 0 ? design.heightM : 50)) / accel);
  points = withPadClimb(points, accel, clearS, T);

  // Separations the trace implies through stageIndex but never announces.
  if (!events.some((e) => e.kind === "stage-sep")) {
    for (let i = 1; i < points.length; i++) {
      if (points[i].stageIndex > points[i - 1].stageIndex && points[i].tS <= T) {
        synthetic.push({ tS: points[i].tS, kind: "stage-sep", label: "Stage separation" });
      }
    }
  }

  // The departure burn starts where the speed climbs again after the parking orbit.
  let burnSim = 0;
  if (trip) {
    const parked = sampleAt(points, trip.park.tS).speed;
    const i = points.findIndex((p) => p.tS > trip.park.tS && p.speedMps > parked + 1);
    burnSim = i > 0 ? Math.min(trip.away.tS, Math.max(trip.park.tS, points[i - 1].tS)) : trip.away.tS;
  }

  // Time warp: the dramatic beats get real seconds, the long burns and coasts between them
  // fast-forward. Built from the event timestamps, so it follows whatever the trace says.
  const karmanSims = crossingsFor(points, T, (sim) => sim)
    .filter((c) => c.hero)
    .map((c) => c.simT);
  const warp = warpFor(
    trip ? trip.park.tS : T,
    [...events, ...synthetic],
    karmanSims,
    breakup ? "breakup" : outcome,
    scenario,
    events,
    clearS,
    trip ? departureBeats(points, trip.park.tS, burnSim, trip.away.tS, T, trip.end.kind === "escape") : [],
  );
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
      const final = (k === "orbit" || k === "arrival") && c.event !== trip?.park;
      burns.push({ from: on, to: final ? Math.max(c.at, finaleAt) + 0.45 : c.at, piece });
      on = null;
    }
  }
  if (on !== null) burns.push({ from: on, to: finaleAt + 0.45, piece });
  // The upper stage lights again for the departure burn.
  if (trip) burns.push({ from: playOf(burnSim), to: playOf(trip.away.tS), piece });

  const crossings = crossingsFor(points, T, playOf);
  const sepsSeen = { n: 0 };
  const failed = outcome === "suborbital" || !!breakup;
  // Past LEO the finale says where it's headed and how long the coast takes, never "arrived".
  const finale: Finale = breakup
    ? { at: finaleAt + 0.15, text: "RUD", ok: false }
    : trip
      ? {
          at: finaleAt + 0.35,
          text: DEST_SHORT[design.destination] ?? "AWAY",
          ok: true,
          kicker: trip.end.kind === "escape" ? "On course for" : undefined,
          sub: trip.end.label,
        }
      : finaleFor(outcome, design, failed ? finaleAt + 0.15 : finaleAt + 0.35);
  const maxDown = Math.max(...points.map((p) => Math.abs(p.downrangeKm)));
  const burnCaption: CaptionCue[] = trip
    ? [{ at: playOf(burnSim), text: trip.away.label.split(":")[0].trim(), sub: "Departure burn", tone: "flame" }]
    : [];

  return {
    outcome,
    points,
    T,
    flightDur,
    liftoffAt,
    cues,
    // In orbit the finale has the stage; later events still reach onEvent but get no caption.
    captions: withKarman(
      captionsFor(cues, maxAltKm, false, sepsSeen, outcome === "suborbital" ? Infinity : finaleAt - 0.2, trip),
      crossings,
      burnCaption,
    ),
    transcripts: transcriptsFor(cues),
    crossings,
    burns,
    seps,
    finaleAt,
    finale,
    tipAt: null,
    lostAt: breakup ? { tS: breakup.tS, altKm: sampleAt(points, breakup.tS).alt } : null,
    explodeAt: failed ? finaleAt : null,
    // The end card follows the outcome closely: no long linger.
    // Debris needs a moment to tumble away after a breakup; a last quote gets to finish.
    endAt: Math.max(
      finaleAt + (breakup ? (scenario === "crs7" ? 4.6 : 2.6) : trip ? 3.4 : 1.8),
      ...transcriptsFor(cues).map((tr) => tr.at + (tr.hold ?? 3) + 0.3),
    ),
    maxAltKm,
    maxSpeedMps: Math.max(0, ...points.filter((p) => p.tS <= T).map((p) => p.speedMps)),
    hasDownrange: maxDown > Math.max(0.5, maxAltKm * 0.02),
    simAt,
    depart: trip
      ? {
          parkAt: playOf(trip.park.tS),
          burnAt: playOf(burnSim),
          cutAt: playOf(trip.away.tS),
          parkSim: trip.park.tS,
          downAtPark: sampleAt(points, trip.park.tS).down,
          end: trip.end.kind === "escape" ? "escape" : "arrival",
        }
      : null,
  };
}

interface Trip {
  /** Insertion into the parking orbit. */
  park: FlightEvent;
  /** Cutoff of the departure burn. */
  away: FlightEvent;
  /** At the Moon's distance ("arrival"), or leaving Earth ("escape"). */
  end: FlightEvent;
}

/** A trip past low Earth orbit, if the trace flies one. */
function departureOf(outcome: Verdict, events: FlightEvent[]): Trip | null {
  if (outcome !== "destination") return null;
  const park = events.find((e) => e.kind === "orbit");
  const away = park && events.find((e) => e.kind === "engine-cutoff" && e.tS > park.tS);
  const end = away && [...events].reverse().find((e) => (e.kind === "arrival" || e.kind === "escape") && e.tS > away.tS);
  return park && away && end ? { park, away, end } : null;
}

/**
 * Playback after the parking-orbit insertion: a short wait, the departure burn, then a coast that
 * lasts days, played in even steps of altitude on a log scale (so the climb reads steadily on the
 * ladder), a little slower as it passes the Moon's distance on the way out.
 */
function departureBeats(points: FlightPoint[], park: number, burn: number, cut: number, T: number, escape: boolean): Beat[] {
  const beats: Beat[] = [];
  if (burn > park) beats.push({ from: park, to: burn, play: 2.2 });
  if (cut > burn) beats.push({ from: burn, to: cut, play: 3.2 });
  const coast: Beat[] = [];
  let from = cut;
  let alt = Math.max(1, sampleAt(points, cut).alt);
  for (const p of points) {
    if (p.tS <= cut || p.tS > T) continue;
    const a = Math.max(alt, p.altitudeKm);
    // Past the Moon there's time to read that it was passed before Earth lets go.
    const moon = escape ? 1.2 * Math.exp(-((Math.log10(a / MOON_KM) / 0.15) ** 2)) + (a > MOON_KM ? 0.8 : 0) : 0;
    coast.push({ from, to: p.tS, play: Math.log(a / alt) * (1 + moon) + 1e-4 });
    from = p.tS;
    alt = a;
  }
  if (from < T) coast.push({ from, to: T, play: 1e-4 });
  const total = coast.reduce((n, b) => n + b.play, 0) || 1;
  const coastPlay = escape ? 12 : 10;
  for (const b of coast) beats.push({ ...b, play: (b.play * coastPlay) / total });
  return beats;
}

interface Beat {
  from: number;
  to: number;
  /** Real seconds this stretch of sim time plays in. */
  play: number;
}

/**
 * Maps playback seconds (from liftoff) to sim seconds and back. Liftoff plays in real time until
 * the tower is cleared, then eases into the warp: beats around each event play slowly, and the
 * gaps between them share what's left of the flight's budget and fast-forward. A monotone cubic
 * through the knots keeps the speed changes smooth.
 */
function warpFor(
  T: number,
  events: FlightEvent[],
  karmanSims: number[],
  outcome: Verdict | "breakup",
  scenario: string | undefined,
  /** The trace's own events: quotes run to the next of these, not to a synthetic marker. */
  quoteEvents: FlightEvent[],
  /** Sim seconds from liftoff until the vehicle has cleared its tower. */
  clearS: number,
  /** Stretches after T with their own fixed play (a trip past LEO), laid out after the climb. */
  tail: Beat[] = [],
) {
  const end = tail.length ? tail[tail.length - 1].to : T;
  // A trip past LEO gives a few of the climb's seconds to its coast.
  const budget = Math.max(Math.min(T, 24), flightBudget(T, scenario) - (tail.length ? 4 : 0));
  // Real time until a second past the tower (the ease into the warp starts as it clears), or
  // throughout for a flight short enough to fit its budget.
  const realS = budget >= T ? T : Math.min(T, Math.max(7, Math.min(14, clearS + 1)));
  const rampTo = Math.min(T, 3 * realS);
  const fixed: Beat[] = [{ from: 0, to: realS, play: realS }];
  if (rampTo > realS) fixed.push({ from: realS, to: rampTo, play: (rampTo - realS) / 3.5 });
  const rest = Math.max(0, budget - fixed.reduce((n, b) => n + b.play, 0));
  // Event beats grow with the time there is to give them.
  const pace = Math.min(4, Math.max(1, rest / 9));
  const beat = (s: number, before: number, after: number, play: number): Beat => {
    const from = Math.max(0, s - before);
    const to = Math.min(T, s + after);
    const cut = Math.max(from, rampTo);
    return { from: cut, to, play: to > cut ? (play * pace * (to - cut)) / (to - from) : 0 };
  };
  const beats: Beat[] = [];
  for (const e of events) {
    if (e.tS <= 0 || e.tS > T) continue;
    if (e.kind === "max-q") beats.push(beat(e.tS, 6, 6, 0.9));
    else if (e.kind === "stage-sep") beats.push(beat(e.tS, 3, 6, 1.5));
    else if (e.kind === "engine-cutoff") beats.push(beat(e.tS, 3, 3, 0.6));
    else if (e.kind === "fuel-exhausted") beats.push(beat(e.tS, 3, 4, 0.9));
    else if (e.kind === "apogee") beats.push(beat(e.tS, 10, 10, 1));
  }
  for (const k of karmanSims) beats.push(beat(k, 4, 4, 0.8));
  // Historic replays: real time for the moments that made each flight what it was.
  if (scenario === "ift1") beats.push(beat(170, 0, 69, 3.2));
  else if (scenario === "crs7") beats.push(beat(139, 14, 0, 1.2));
  else if (scenario === "falcon1-f1") beats.push(beat(25, 3, 11, 2));

  // The approach to the outcome: the fall and reentry before impact, or the last push to orbit.
  // Pushed before the quote carve-out, so a quote inside it splits it like any other beat.
  beats.push(
    outcome === "suborbital" ? beat(T, 30, 0, 1.5) : outcome === "breakup" ? beat(T, 15, 0, 1.1) : beat(T, 12, 0, 0.6),
  );

  // Real dialog gets the time it takes to say it: the next event waits until the quote is done.
  // Where the real-time opening already gives it that long, nothing needs to change.
  const sorted = quoteEvents.filter((e) => e.tS >= 0 && e.tS <= T).sort((a, b) => a.tS - b.tS);
  const quotes: Beat[] = [];
  const overlap = (a: number, b: number, c: number, d: number) => Math.max(0, Math.min(b, d) - Math.max(a, c));
  sorted.forEach((e, k) => {
    const hold = quoteHold(e.label);
    const next = sorted.slice(k + 1).find((o) => o.tS > e.tS)?.tS ?? T;
    if (!hold || next <= e.tS || overlap(e.tS, next, 0, realS) >= hold) return;
    // About what the span would get anyway, and never less than the time to say it.
    const usual =
      overlap(e.tS, next, 0, realS) +
      overlap(e.tS, next, realS, rampTo) / 3.5 +
      (overlap(e.tS, next, rampTo, T) * rest) / Math.max(1e-6, T - rampTo);
    quotes.push({ from: e.tS, to: next, play: Math.max(hold, usual) });
  });
  // Everything else gives way where a quote is playing.
  const carve = (list: Beat[]) =>
    list.flatMap((b) => {
      let parts = [b];
      for (const q of quotes) {
        parts = parts.flatMap((p) => {
          if (p.to <= q.from || p.from >= q.to) return [p];
          const span = p.to - p.from;
          const out: Beat[] = [];
          if (p.from < q.from) out.push({ from: p.from, to: q.from, play: (p.play * (q.from - p.from)) / span });
          if (p.to > q.to) out.push({ from: q.to, to: p.to, play: (p.play * (p.to - q.to)) / span });
          return out;
        });
      }
      return parts;
    });
  const free = carve(beats).sort((a, b) => a.from - b.from);
  const merged: Beat[] = [];
  for (const b of free) {
    if (b.to <= b.from) continue;
    const last = merged[merged.length - 1];
    if (last && b.from < last.to) {
      last.to = Math.max(last.to, b.to);
      last.play = Math.min(3 * pace, last.play + 0.6 * b.play);
    } else {
      merged.push({ ...b });
    }
  }
  const beatPlay = merged.reduce((n, b) => n + b.play, 0);
  const squeeze = Math.min(1, (rest * 0.8) / Math.max(beatPlay, 1e-6));
  // Never slower than the real flight, outside a quote.
  merged.forEach((b) => (b.play = Math.min(b.play * squeeze, b.to - b.from)));
  // Quotes are never squeezed; a dialog-heavy replay simply runs longer.
  merged.push(...carve(fixed), ...quotes);
  merged.sort((a, b) => a.from - b.from);

  // Lay out beats and the gaps between them over [0, T].
  const segs: { from: number; to: number; play: number | null }[] = [];
  let cursor = 0;
  for (const b of merged) {
    // Never step back in sim time: trim anything that overlaps what's already laid out.
    const from = Math.max(b.from, cursor);
    if (b.to <= from) continue;
    if (from > cursor) segs.push({ from: cursor, to: from, play: null });
    segs.push(from === b.from ? b : { ...b, from, play: (b.play * (b.to - from)) / (b.to - b.from) });
    cursor = b.to;
  }
  if (cursor < T) segs.push({ from: cursor, to: T, play: null });
  const gaps = segs.filter((g) => g.play === null);
  const left = Math.max(0.5, budget - merged.reduce((n, b) => n + b.play, 0));
  const weight = gaps.reduce((n, g) => n + Math.pow(g.to - g.from, 0.6), 0) || 1;
  gaps.forEach((g) => (g.play = Math.min(g.to - g.from, Math.max(0.12, (left * Math.pow(g.to - g.from, 0.6)) / weight))));

  // Each stretch plays at its own pace (sim seconds per real second); one too short to blend
  // hands its time on to the next.
  const stretches: { span: number; play: number }[] = [];
  let span = 0;
  let play = 0;
  for (const g of [...segs.map((s) => ({ from: s.from, to: s.to, play: s.play ?? 0.12 })), ...tail]) {
    span += g.to - g.from;
    play += g.play;
    if (play >= 0.03) {
      stretches.push({ span, play });
      span = 0;
      play = 0;
    }
  }
  if (stretches.length === 0) stretches.push({ span: end, play: Math.max(play, 1) });
  else stretches[stretches.length - 1].span += span;
  // Around each boundary the pace blends from one to the next along a smoothstep, centred on it,
  // which leaves every stretch its own sim time; everything else is flat. So liftoff is exactly
  // 1:1 until just before the ramp, and the pace never jumps.
  const pieces: { x0: number; x1: number; s0: number; ra: number; rb: number }[] = [];
  let x = 0;
  let s = 0;
  const push = (x1: number, ra: number, rb: number) => {
    if (x1 <= x) return;
    pieces.push({ x0: x, x1, s0: s, ra, rb });
    s += ((x1 - x) * (ra + rb)) / 2;
    x = x1;
  };
  stretches.forEach((g, k) => {
    const pace = g.span / g.play;
    const knot = x + g.play - (k > 0 ? Math.min(0.4, 0.45 * stretches[k - 1].play, 0.45 * g.play) : 0);
    const next = stretches[k + 1];
    if (!next) return push(knot, pace, pace);
    const w = Math.min(0.4, 0.45 * g.play, 0.45 * next.play);
    push(knot - w, pace, pace);
    push(knot + w, pace, next.span / next.play);
  });
  const duration = x;
  const at = (p: (typeof pieces)[number], u: number) =>
    p.s0 + (p.x1 - p.x0) * (p.ra * u + (p.rb - p.ra) * (u * u * u - (u * u * u * u) / 2));
  const find = (key: (p: (typeof pieces)[number]) => number, v: number) => {
    let lo = 0;
    let hi = pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (key(pieces[mid]) <= v) lo = mid;
      else hi = mid - 1;
    }
    return pieces[lo];
  };
  return {
    duration,
    sim(t: number): number {
      if (t <= 0) return 0;
      if (t >= duration) return end;
      const p = find((q) => q.x0, t);
      return at(p, (t - p.x0) / (p.x1 - p.x0));
    },
    /** Inverse of sim(): the playback second (from liftoff) at which sim time `s` plays. */
    play(v: number): number {
      if (v <= 0) return 0;
      if (v >= end) return duration;
      const p = find((q) => q.s0, v);
      if (p.ra === p.rb) return Math.min(p.x1, p.x0 + (v - p.s0) / p.ra);
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 48; i++) {
        const mid = (lo + hi) / 2;
        if (at(p, mid) < v) lo = mid;
        else hi = mid;
      }
      return p.x0 + ((lo + hi) / 2) * (p.x1 - p.x0);
    },
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
function withKarman(captions: CaptionCue[], crossings: Crossing[], extra: CaptionCue[] = []): CaptionCue[] {
  const karman = crossings.find((c) => c.hero && c.text.startsWith("Crossed"));
  if (!karman && !extra.length) return captions;
  const all = [...captions, ...extra];
  if (karman) all.push({ at: karman.at, text: "Kármán line", sub: "Space begins · 100 km", tone: "chalk" });
  all.sort((a, b) => a.at - b.at);
  let lastAt = -Infinity;
  for (const c of all) {
    c.at = Math.max(c.at, lastAt + CAPTION_GAP);
    lastAt = c.at;
  }
  return all;
}

/**
 * The trace takes its altitude from its speed, which leaves the pad far too fast (a Falcon 9 would
 * be 370 m up at T+1.6 s). Until the tower is cleared the launch flies a plain vertical climb at the
 * liftoff thrust-to-weight instead, then hands over to the trace.
 */
function withPadClimb(points: FlightPoint[], accel: number, clearS: number, T: number): FlightPoint[] {
  const end = Math.min(T, clearS + HANDOVER_S);
  if (!(end > 0) || !(accel > 0)) return points;
  const out: FlightPoint[] = [];
  for (let tS = 0; tS < end; tS += 0.25) {
    const tr = sampleAt(points, tS);
    const k = end > clearS ? clamp01((tS - clearS) / (end - clearS)) : 0;
    const w = k * k * (3 - 2 * k);
    out.push({
      tS,
      altitudeKm: ((1 - w) * 0.5 * accel * tS * tS) / 1000 + w * tr.alt,
      downrangeKm: w * tr.down,
      speedMps: (1 - w) * accel * tS + w * tr.speed,
      stageIndex: tr.stage,
    });
  }
  return [...out, ...points.filter((p) => p.tS >= end)];
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

/** `Launch Director: "We have lost the vehicle."` → speaker and quote. */
const DIALOG = /^\s*([^:"\u201c\u201d]{2,48}):\s*["\u201c]([\s\S]+?)["\u201d]\s*$/;

/** Seconds a quoted label needs to be spoken (Quindar tones included), or null if it's no quote. */
export function quoteHold(label: string | undefined): number | null {
  const m = label ? DIALOG.exec(label) : null;
  if (!m) return null;
  const words = m[2].trim().split(/\s+/).length;
  return Math.max(2.5, 0.38 * words + 0.6);
}

/** Real dialog as subtitles, each held about 3 s before the next may replace it. */
function transcriptsFor(cues: Cue[]): CaptionCue[] {
  const out: CaptionCue[] = [];
  let free = -Infinity;
  for (const c of cues) {
    const m = c.event.label ? DIALOG.exec(c.event.label) : null;
    if (!m) continue;
    const at = Math.max(c.at, free);
    const hold = quoteHold(c.event.label) ?? 3;
    out.push({ at, text: m[2].trim(), speaker: m[1].trim(), tone: "chalk", hold });
    free = at + hold;
  }
  return out;
}

function captionsFor(
  cues: Cue[],
  maxAltKm: number,
  onPad: boolean,
  sepsSeen = { n: 0 },
  until = Infinity,
  trip: Trip | null = null,
): CaptionCue[] {
  const out: CaptionCue[] = [];
  let lastAt = -Infinity;
  for (const c of cues) {
    const special = trip ? tripCaption(c.event, trip) : null;
    if (special) {
      if (c.at >= until) continue;
      const at = Math.max(c.at, lastAt + CAPTION_GAP);
      lastAt = at;
      out.push({ at, ...special });
      continue;
    }
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
    // Dialog goes to the transcript track, not under the callout.
    const sub = label && !DIALOG.test(label) && normalize(label) !== normalize(base.text) ? label : undefined;
    const at = Math.max(c.at, lastAt + CAPTION_GAP);
    lastAt = at;
    out.push({ at, text: base.text, sub, tone: base.tone });
  }
  return out;
}

/**
 * Captions on a trip past LEO: "Parking orbit · 200 km, 7.8 km/s", "Engines off · 10.9 km/s at
 * 200 km" after the departure burn, and a milestone's own words ("Passes the Moon's distance ·
 * 28 hours after the burn"). Null for everything else.
 */
function tripCaption(e: FlightEvent, trip: Trip): { text: string; sub?: string; tone: Tone } | null {
  const after = (label: string, mark: string) => label.slice(label.indexOf(mark) + 1).trim() || undefined;
  if (e === trip.park) return { text: "Parking orbit", sub: after(e.label, ":"), tone: "chalk" };
  if (e === trip.away) return { text: "Engines off", sub: after(e.label, ":"), tone: "chalk" };
  if (e.kind === "milestone") {
    const cut = e.label.indexOf(",");
    return cut > 0
      ? { text: e.label.slice(0, cut).trim(), sub: e.label.slice(cut + 1).trim(), tone: "chalk" }
      : { text: e.label, tone: "chalk" };
  }
  return null;
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
