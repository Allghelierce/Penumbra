// Deterministic ascent trace driven by analyze(). Speed follows each stage's delta-v
// minus a shared gravity and drag loss. It does not run a second rocket equation.

import type { Analysis, Design, FlightEvent, FlightPoint, FlightTrace, Verdict } from "../design";

const G0 = 9.80665;
const LOSS_BUDGET_MPS = 1500;
const ORBITAL_SPEED_MPS = 7800;
const ORBIT_ALTITUDE_KM = 200;
const POINT_COUNT = 300;
const MAX_Q_S = 60;
const BURNOUT_FLIGHT_PATH_RAD = (25 * Math.PI) / 180;

export function simulateFlight(design: Design, analysis: Analysis): FlightTrace {
  if (analysis.verdict === "stuck-on-pad") return padFailure(analysis);

  const burnTimes = analysis.stages.map((stage) => Math.max(0, stage.burnTimeS));
  const totalBurnS = burnTimes.reduce((sum, burn) => sum + burn, 0);
  const losses = burnTimes.map((burn) => (totalBurnS > 0 ? (LOSS_BUDGET_MPS * burn) / totalBurnS : 0));
  const poweredAt = (tS: number) => stateAt(analysis, burnTimes, losses, tS);

  const burnout = poweredAt(totalBurnS);
  const burnoutAltitudeKm = climbAltitudeKm(burnout.speedMps);
  const verticalMps = burnout.speedMps * Math.sin(BURNOUT_FLIGHT_PATH_RAD);
  const coastS =
    analysis.verdict === "suborbital" ? coastDurationS(burnoutAltitudeKm * 1000, verticalMps) : 0;
  const { nPowered, nCoast } = splitPoints(totalBurnS, coastS, analysis.verdict === "suborbital");

  const points: FlightPoint[] = [];
  let downrangeM = 0;
  let prevT = 0;
  let prevSpeed = 0;
  for (let i = 0; i < nPowered; i++) {
    const tS = nPowered === 1 ? 0 : (totalBurnS * i) / (nPowered - 1);
    const state = poweredAt(tS);
    if (i > 0) {
      const dt = tS - prevT;
      downrangeM += 0.5 * (horizontalMps(prevSpeed) + horizontalMps(state.speedMps)) * dt;
    }
    points.push({
      tS,
      altitudeKm: climbAltitudeKm(state.speedMps),
      downrangeKm: downrangeM / 1000,
      speedMps: state.speedMps,
      stageIndex: state.stageIndex,
    });
    prevT = tS;
    prevSpeed = state.speedMps;
  }

  if (nCoast > 0) {
    const burnoutPoint = points[points.length - 1];
    const vx = burnoutPoint.speedMps * Math.cos(BURNOUT_FLIGHT_PATH_RAD);
    const vy0 = burnoutPoint.speedMps * Math.sin(BURNOUT_FLIGHT_PATH_RAD);
    const h0 = burnoutPoint.altitudeKm * 1000;
    for (let k = 1; k <= nCoast; k++) {
      const dt = (coastS * k) / nCoast;
      const vy = vy0 - G0 * dt;
      const altitudeKm = k === nCoast ? 0 : Math.max(0, (h0 + vy0 * dt - 0.5 * G0 * dt * dt) / 1000);
      points.push({
        tS: burnoutPoint.tS + dt,
        altitudeKm,
        downrangeKm: burnoutPoint.downrangeKm + (vx * dt) / 1000,
        speedMps: Math.max(0, Math.hypot(vx, vy)),
        stageIndex: burnoutPoint.stageIndex,
      });
    }
  }

  const events = flightEvents(design, analysis, burnTimes, totalBurnS, coastS, verticalMps);
  let maxAltitudeKm = 0;
  for (const point of points) {
    if (point.altitudeKm > maxAltitudeKm) maxAltitudeKm = point.altitudeKm;
  }

  return { points, events, outcome: analysis.verdict, maxAltitudeKm };
}

function stateAt(
  analysis: Analysis,
  burnTimes: number[],
  losses: number[],
  tS: number,
): { speedMps: number; stageIndex: number } {
  const stages = analysis.stages;
  if (stages.length === 0) return { speedMps: 0, stageIndex: 0 };

  let speed = 0;
  let cursor = 0;
  for (let i = 0; i < stages.length; i++) {
    const burn = burnTimes[i];
    const delta = stages[i].deltaVMps - losses[i];
    const end = cursor + burn;
    const last = i === stages.length - 1;
    if (burn === 0) {
      if (tS >= cursor) speed = Math.max(0, speed + delta);
      if (last) return { speedMps: speed, stageIndex: i };
      continue;
    }
    if (tS < end || last) {
      const frac = Math.min(1, Math.max(0, (tS - cursor) / burn));
      return { speedMps: Math.max(0, speed + frac * delta), stageIndex: i };
    }
    speed = Math.max(0, speed + delta);
    cursor = end;
  }
  return { speedMps: speed, stageIndex: stages.length - 1 };
}

function flightEvents(
  design: Design,
  analysis: Analysis,
  burnTimes: number[],
  totalBurnS: number,
  coastS: number,
  verticalMps: number,
): FlightEvent[] {
  const events: FlightEvent[] = [{ tS: 0, kind: "liftoff", label: `${design.name} lifts off.` }];
  const firstBurn = burnTimes[0] ?? 0;
  const maxQT = totalBurnS >= MAX_Q_S ? MAX_Q_S : firstBurn / 2;
  events.push({ tS: maxQT, kind: "max-q", label: "Maximum dynamic pressure." });

  let cursor = 0;
  for (let i = 0; i < analysis.stages.length; i++) {
    cursor += burnTimes[i];
    const label = analysis.stages[i].label;
    const last = i === analysis.stages.length - 1;
    events.push({ tS: cursor, kind: "engine-cutoff", label: `${label} engine cutoff.` });
    if (!last) {
      events.push({ tS: cursor, kind: "stage-sep", label: `${label} separates.` });
    } else if (analysis.verdict === "suborbital") {
      events.push({ tS: cursor, kind: "fuel-exhausted", label: "Propellant exhausted." });
    } else {
      events.push({ tS: cursor, kind: "orbit", label: "Reached orbit." });
    }
  }

  if (analysis.verdict === "suborbital") {
    const apogeeS = cursor + (verticalMps > 0 ? verticalMps / G0 : 0);
    events.push({ tS: apogeeS, kind: "apogee", label: "Apogee." });
    events.push({ tS: cursor + coastS, kind: "impact", label: "Impact." });
  }

  events.sort((a, b) => a.tS - b.tS);
  return events;
}

function splitPoints(totalBurnS: number, coastS: number, suborbital: boolean): { nPowered: number; nCoast: number } {
  if (!suborbital || coastS <= 0) return { nPowered: POINT_COUNT, nCoast: 0 };
  if (totalBurnS <= 0) return { nPowered: 1, nCoast: POINT_COUNT - 1 };
  let nCoast = Math.round((POINT_COUNT * coastS) / (totalBurnS + coastS));
  nCoast = Math.min(POINT_COUNT - 2, Math.max(2, nCoast));
  return { nPowered: POINT_COUNT - nCoast, nCoast };
}

/** Powered altitude: 200 km at orbital speed, and it stays there if the rocket is faster. */
function climbAltitudeKm(speedMps: number): number {
  const fraction = Math.min(1, Math.max(0, speedMps) / ORBITAL_SPEED_MPS);
  return ORBIT_ALTITUDE_KM * fraction ** 1.15;
}

function horizontalMps(speedMps: number): number {
  const fraction = Math.min(1, Math.max(0, speedMps) / ORBITAL_SPEED_MPS);
  return Math.max(0, speedMps) * fraction;
}

/** Time from burnout until a 25° coast under constant gravity returns to the ground. */
function coastDurationS(altitudeM: number, verticalMps: number): number {
  const h0 = Math.max(0, altitudeM);
  if (h0 <= 0 && verticalMps <= 0) return 0;
  const disc = verticalMps * verticalMps + 2 * G0 * h0;
  return (verticalMps + Math.sqrt(disc)) / G0;
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
