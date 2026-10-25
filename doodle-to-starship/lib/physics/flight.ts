// Deterministic ascent trace driven by analyze(). Engines cut when the target
// speed is reached; nothing in the trace flies faster than that.

import type { Analysis, Design, DestinationId, FlightEvent, FlightEventKind, FlightPoint, FlightTrace, Verdict } from "../design";
import { km } from "./format";

const G0 = 9.80665;
const LOSS_BUDGET_MPS = 1500;
const ORBITAL_SPEED_MPS = 7800;
const ORBIT_ALTITUDE_KM = 200;
const POINT_COUNT = 300;
const MAX_Q_S = 60;
const DEPARTURE_COAST_S = 180;

/** Departure burn added to orbital speed once the rocket is leaving LEO. GTO stays at 7.8 km/s. */
const DEPARTURE_MPS: Partial<Record<DestinationId, number>> = {
  "moon-orbit": 3_260,
  "moon-surface": 3_260,
  "mars-transfer": 3_610,
  "mars-surface": 3_610,
  europa: 6_300,
};

const EVENT_ORDER: Record<FlightEventKind, number> = {
  liftoff: 0,
  "max-q": 1,
  "engine-cutoff": 2,
  "stage-sep": 3,
  "fuel-exhausted": 4,
  orbit: 5,
  arrival: 6,
  apogee: 7,
  impact: 8,
  "pad-failure": 9,
};

export function simulateFlight(design: Design, analysis: Analysis): FlightTrace {
  if (analysis.verdict === "stuck-on-pad") return padFailure(analysis);

  const burnTimes = analysis.stages.map((stage) => Math.max(0, stage.burnTimeS));
  const totalBurnS = burnTimes.reduce((sum, burn) => sum + burn, 0);
  const losses = burnTimes.map((burn) => (totalBurnS > 0 ? (LOSS_BUDGET_MPS * burn) / totalBurnS : 0));
  const missionCap = targetSpeedMps(design.destination);
  const cutoff = findCutoff(analysis, burnTimes, losses, missionCap);
  const suborbital = analysis.verdict === "suborbital";
  const beyondLeo = (DEPARTURE_MPS[design.destination] ?? 0) > 0;

  // Insertion speed: the mission cap when the rocket gets there, otherwise burnout speed.
  const insertion = cutoff.reached ? missionCap : speedAt(analysis, burnTimes, losses, totalBurnS, missionCap);
  const poweredS = cutoff.reached ? cutoff.tS : totalBurnS;
  const burnoutAltKm = climbAltitudeKm(Math.min(insertion, ORBITAL_SPEED_MPS));
  const apogeeKm = suborbital ? suborbitalApogeeKm(insertion, burnoutAltKm) : ORBIT_ALTITUDE_KM;
  const coastS = suborbital
    ? hopCoastS(burnoutAltKm, apogeeKm)
    : beyondLeo
      ? DEPARTURE_COAST_S
      : 0;

  const { nPowered, nCoast } = splitPoints(poweredS, coastS);
  const points: FlightPoint[] = [];
  let downrangeM = 0;
  let prevT = 0;
  let prevHoriz = 0;

  for (let i = 0; i < nPowered; i++) {
    const tS = nPowered === 1 ? 0 : (poweredS * i) / (nPowered - 1);
    const atCap = cutoff.reached && i === nPowered - 1;
    const state = atCap
      ? { speedMps: missionCap, stageIndex: cutoff.stageIndex }
      : stateAt(analysis, burnTimes, losses, tS, missionCap);
    const horiz = horizontalMps(state.speedMps);
    if (i > 0) downrangeM += 0.5 * (prevHoriz + horiz) * (tS - prevT);
    points.push({
      tS,
      altitudeKm: atCap && !suborbital ? ORBIT_ALTITUDE_KM : climbAltitudeKm(state.speedMps),
      downrangeKm: downrangeM / 1000,
      speedMps: state.speedMps,
      stageIndex: state.stageIndex,
    });
    prevT = tS;
    prevHoriz = horiz;
  }

  if (nCoast > 0 && points.length > 0) {
    const burnout = points[points.length - 1];
    if (suborbital) {
      const h0 = burnout.altitudeKm * 1000;
      const hA = apogeeKm * 1000;
      const vy0 = Math.sqrt(Math.max(0, 2 * G0 * (hA - h0)));
      for (let k = 1; k <= nCoast; k++) {
        const dt = (coastS * k) / nCoast;
        const vy = vy0 - G0 * dt;
        const altitudeKm = k === nCoast ? 0 : Math.max(0, (h0 + vy0 * dt - 0.5 * G0 * dt * dt) / 1000);
        points.push({
          tS: burnout.tS + dt,
          altitudeKm,
          downrangeKm: burnout.downrangeKm,
          speedMps: Math.min(missionCap, Math.max(0, Math.abs(vy))),
          stageIndex: burnout.stageIndex,
        });
      }
    } else {
      const horiz = horizontalMps(missionCap);
      for (let k = 1; k <= nCoast; k++) {
        const dt = (coastS * k) / nCoast;
        downrangeM += horiz * (dt - (coastS * (k - 1)) / nCoast);
        points.push({
          tS: burnout.tS + dt,
          altitudeKm: ORBIT_ALTITUDE_KM,
          downrangeKm: downrangeM / 1000,
          speedMps: missionCap,
          stageIndex: burnout.stageIndex,
        });
      }
    }
  }

  const events = flightEvents(design, analysis, burnTimes, losses, cutoff, poweredS, coastS, apogeeKm, missionCap);
  let maxAltitudeKm = 0;
  for (const point of points) {
    if (point.altitudeKm > maxAltitudeKm) maxAltitudeKm = point.altitudeKm;
  }

  return { points, events, outcome: analysis.verdict, maxAltitudeKm };
}

function targetSpeedMps(destination: DestinationId): number {
  return ORBITAL_SPEED_MPS + (DEPARTURE_MPS[destination] ?? 0);
}

function findCutoff(
  analysis: Analysis,
  burnTimes: number[],
  losses: number[],
  cap: number,
): { tS: number; reached: boolean; stageIndex: number } {
  let speed = 0;
  let cursor = 0;
  const stages = analysis.stages;
  for (let i = 0; i < stages.length; i++) {
    const burn = burnTimes[i];
    const net = stages[i].deltaVMps - losses[i];
    const endSpeed = Math.max(0, speed + net);
    if (cap > speed && endSpeed >= cap && burn > 0 && net > 0) {
      return { tS: cursor + ((cap - speed) / net) * burn, reached: true, stageIndex: i };
    }
    speed = endSpeed;
    cursor += burn;
  }
  return { tS: cursor, reached: false, stageIndex: Math.max(0, stages.length - 1) };
}

function speedAt(
  analysis: Analysis,
  burnTimes: number[],
  losses: number[],
  tS: number,
  cap: number,
): number {
  return stateAt(analysis, burnTimes, losses, tS, cap).speedMps;
}

function stateAt(
  analysis: Analysis,
  burnTimes: number[],
  losses: number[],
  tS: number,
  cap: number,
): { speedMps: number; stageIndex: number } {
  const stages = analysis.stages;
  if (stages.length === 0) return { speedMps: 0, stageIndex: 0 };

  let speed = 0;
  let cursor = 0;
  for (let i = 0; i < stages.length; i++) {
    const burn = burnTimes[i];
    const net = stages[i].deltaVMps - losses[i];
    const end = cursor + burn;
    const last = i === stages.length - 1;
    if (burn === 0) {
      if (tS >= cursor) speed = Math.max(0, speed + net);
      if (last) return { speedMps: clampSpeed(speed, cap), stageIndex: i };
      continue;
    }
    if (tS < end || last) {
      const frac = Math.min(1, Math.max(0, (tS - cursor) / burn));
      return { speedMps: clampSpeed(speed + frac * net, cap), stageIndex: i };
    }
    speed = Math.max(0, speed + net);
    cursor = end;
  }
  return { speedMps: clampSpeed(speed, cap), stageIndex: stages.length - 1 };
}

function clampSpeed(speed: number, cap: number): number {
  return Math.min(cap, Math.max(0, speed));
}

function flightEvents(
  design: Design,
  analysis: Analysis,
  burnTimes: number[],
  losses: number[],
  cutoff: { tS: number; reached: boolean; stageIndex: number },
  poweredS: number,
  coastS: number,
  apogeeKm: number,
  cap: number,
): FlightEvent[] {
  const events: FlightEvent[] = [
    { tS: 0, kind: "liftoff", label: `Liftoff, TWR ${analysis.liftoffTwr.toFixed(1)}` },
  ];
  const firstBurn = burnTimes[0] ?? 0;
  let maxQT = poweredS >= MAX_Q_S ? MAX_Q_S : firstBurn / 2;
  if (!(maxQT > 0) || maxQT > poweredS) maxQT = poweredS / 2;
  events.push({ tS: maxQT, kind: "max-q", label: `Max-Q at T+${Math.round(maxQT)} s` });

  const suborbital = analysis.verdict === "suborbital";
  let cursor = 0;
  for (let i = 0; i < analysis.stages.length; i++) {
    const end = cursor + burnTimes[i];
    const completes = end < poweredS - 1e-6;
    if (!completes) break;
    const speed = speedAt(analysis, burnTimes, losses, end, cap);
    const alt = Math.round(climbAltitudeKm(speed));
    events.push({
      tS: end,
      kind: "engine-cutoff",
      label: `${analysis.stages[i].label} cutoff at ${km(speed)} km/s`,
    });
    events.push({
      tS: end,
      kind: "stage-sep",
      label: `${analysis.stages[i].label} separates at ${alt} km`,
    });
    cursor = end;
  }

  const cutSpeed = cutoff.reached ? cap : speedAt(analysis, burnTimes, losses, poweredS, cap);
  const cutAlt = cutoff.reached ? ORBIT_ALTITUDE_KM : Math.round(climbAltitudeKm(cutSpeed));
  events.push({
    tS: poweredS,
    kind: "engine-cutoff",
    label: `Engine cutoff at ${km(cutSpeed)} km/s`,
  });

  if (suborbital) {
    events.push({ tS: poweredS, kind: "fuel-exhausted", label: `Fuel exhausted at ${km(cutSpeed)} km/s` });
    const h0 = climbAltitudeKm(cutSpeed) * 1000;
    const vy0 = Math.sqrt(Math.max(0, 2 * G0 * (apogeeKm * 1000 - h0)));
    events.push({
      tS: poweredS + (vy0 > 0 ? vy0 / G0 : 0),
      kind: "apogee",
      label: `Apogee ${Math.round(apogeeKm)} km`,
    });
    events.push({ tS: poweredS + coastS, kind: "impact", label: `Impact at T+${Math.round(poweredS + coastS)} s` });
  } else {
    events.push({
      tS: poweredS,
      kind: "orbit",
      label: `Orbit: ${cutAlt} km, ${km(cutSpeed)} km/s`,
    });
  }

  events.sort((a, b) => a.tS - b.tS || EVENT_ORDER[a.kind] - EVENT_ORDER[b.kind]);
  return events;
}

function splitPoints(poweredS: number, coastS: number): { nPowered: number; nCoast: number } {
  if (coastS <= 0) return { nPowered: POINT_COUNT, nCoast: 0 };
  if (poweredS <= 0) return { nPowered: 1, nCoast: POINT_COUNT - 1 };
  let nCoast = Math.round((POINT_COUNT * coastS) / (poweredS + coastS));
  nCoast = Math.min(POINT_COUNT - 2, Math.max(2, nCoast));
  return { nPowered: POINT_COUNT - nCoast, nCoast };
}

/** Powered altitude: 200 km at orbital speed, and it stays there once the rocket is faster. */
function climbAltitudeKm(speedMps: number): number {
  const fraction = Math.min(1, Math.max(0, speedMps) / ORBITAL_SPEED_MPS);
  return ORBIT_ALTITUDE_KM * fraction ** 1.15;
}

function horizontalMps(speedMps: number): number {
  const fraction = Math.min(1, Math.max(0, speedMps) / ORBITAL_SPEED_MPS);
  return Math.max(0, speedMps) * fraction;
}

/**
 * Lofted suborbital hop. Anything with a real push tops out in the sounding-rocket
 * band instead of coasting on an orbital-class arc it never had the speed for.
 */
function suborbitalApogeeKm(burnoutSpeedMps: number, burnoutAltKm: number): number {
  const span = Math.min(1, Math.max(0, burnoutSpeedMps / 1_800));
  const lofted = 80 + 150 * span;
  return Math.min(250, Math.max(burnoutAltKm + 10, lofted));
}

/** Time from burnout until a vertical hop returns to the ground. */
function hopCoastS(burnoutAltKm: number, apogeeKm: number): number {
  const h0 = Math.max(0, burnoutAltKm * 1000);
  const hA = Math.max(h0, apogeeKm * 1000);
  const vy0 = Math.sqrt(Math.max(0, 2 * G0 * (hA - h0)));
  const disc = vy0 * vy0 + 2 * G0 * h0;
  return (vy0 + Math.sqrt(disc)) / G0;
}

function padFailure(analysis: Analysis): FlightTrace {
  const outcome: Verdict = "stuck-on-pad";
  return {
    points: [{ tS: 0, altitudeKm: 0, downrangeKm: 0, speedMps: 0, stageIndex: 0 }],
    events: [
      {
        tS: 0,
        kind: "pad-failure",
        label: `Liftoff thrust-to-weight is ${analysis.liftoffTwr.toFixed(2)}, so it stays on the pad.`,
      },
    ],
    outcome,
    maxAltitudeKm: 0,
  };
}
