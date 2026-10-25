// A simple, deterministic flight profile for the launch animation. It isn't a trajectory
// integrator: speed follows the rocket equation stage by stage, minus gravity and drag
// losses, and altitude follows a gravity-turn curve that reaches orbit height at orbital speed.

import type { Analysis, Design, FlightEvent, FlightPoint, FlightTrace } from "../design";
import { DESTINATIONS, G0, ORBITAL_SPEED_MPS } from "./data";

const ORBIT_ALTITUDE_KM = 200;
const MAX_Q_S = 60;
const BURN_POINTS = 240;
const COAST_POINTS = 60;
const ORBIT_COAST_S = 600;
/** Gravity and drag losses on the way to orbit, built into LEO's delta-v. */
const LOSS_MPS = DESTINATIONS.leo.deltaVFromSurfaceMps - ORBITAL_SPEED_MPS;
/** Share of the losses the bottom stage takes; it fights gravity and air the longest. */
const BOTTOM_LOSS_SHARE = 0.7;

export function simulateFlight(design: Design, analysis: Analysis): FlightTrace {
  if (analysis.verdict === "stuck-on-pad") return padFailure(analysis);

  const points: FlightPoint[] = [];
  const events: FlightEvent[] = [
    { tS: 0, kind: "liftoff", label: `Liftoff at thrust-to-weight ${analysis.liftoffTwr.toFixed(2)}` },
  ];
  const burning = analysis.stages.map((s, i) => ({ ...s, index: i })).filter((s) => s.burnTimeS > 0);
  const totalBurnS = burning.reduce((sum, s) => sum + s.burnTimeS, 0);
  const upperBurnS = totalBurnS - (burning[0]?.index === 0 ? burning[0].burnTimeS : 0);

  let t = 0;
  let speed = 0;
  let downrangeKm = 0;
  let orbitAt: number | null = null;

  for (const [n, stage] of burning.entries()) {
    // Mass at ignition: this stage and everything above it.
    const m0 = analysis.stages.slice(stage.index).reduce((sum, s) => sum + s.wetMassKg, 0) + design.payloadMassKg;
    const massFlow = stage.propellantMassKg / stage.burnTimeS;
    const loss =
      burning.length === 1
        ? LOSS_MPS
        : stage.index === 0
          ? LOSS_MPS * BOTTOM_LOSS_SHARE
          : (LOSS_MPS * (burning[0].index === 0 ? 1 - BOTTOM_LOSS_SHARE : 1) * stage.burnTimeS) / upperBurnS;
    const startSpeed = speed;
    const steps = Math.max(10, Math.round((BURN_POINTS * stage.burnTimeS) / totalBurnS));

    for (let k = n === 0 ? 0 : 1; k <= steps; k++) {
      const dt = (stage.burnTimeS * k) / steps;
      const gained = stage.ispS * G0 * Math.log(m0 / (m0 - massFlow * dt));
      const next = Math.max(0, startSpeed + gained - (loss * dt) / stage.burnTimeS);
      const tNow = t + dt;
      if (orbitAt === null && speed < ORBITAL_SPEED_MPS && next >= ORBITAL_SPEED_MPS) orbitAt = tNow;
      downrangeKm += (((speed + next) / 2) * horizontalShare(next) * (stage.burnTimeS / steps)) / 1000;
      speed = next;
      points.push({ tS: tNow, altitudeKm: climbAltitude(speed), downrangeKm, speedMps: speed, stageIndex: stage.index });
    }

    t += stage.burnTimeS;
    const nextStage = burning[n + 1];
    if (nextStage) {
      events.push({ tS: t, kind: "stage-sep", label: `${stage.label} separates; ${nextStage.label} ignites` });
    } else {
      events.push({ tS: t, kind: "engine-cutoff", label: `${stage.label} engine cutoff at ${(speed / 1000).toFixed(1)} km/s` });
    }
  }
  if (totalBurnS > MAX_Q_S && (burning[0]?.burnTimeS ?? 0) > MAX_Q_S) {
    events.push({ tS: MAX_Q_S, kind: "max-q", label: "Max-Q: peak aerodynamic pressure" });
  }

  const lastStage = points.at(-1)?.stageIndex ?? 0;
  if (analysis.verdict === "suborbital") {
    events.push({ tS: t, kind: "fuel-exhausted", label: `Out of propellant at ${(speed / 1000).toFixed(1)} km/s, short of orbital speed` });
    coastBallistic(points, events, t, speed, downrangeKm, lastStage);
  } else {
    const at = orbitAt ?? t;
    events.push({ tS: at, kind: "orbit", label: `Orbit: ${(ORBITAL_SPEED_MPS / 1000).toFixed(1)} km/s at ${ORBIT_ALTITUDE_KM} km` });
    for (let k = 1; k <= COAST_POINTS; k++) {
      const dt = (ORBIT_COAST_S * k) / COAST_POINTS;
      points.push({
        tS: t + dt,
        altitudeKm: ORBIT_ALTITUDE_KM,
        downrangeKm: downrangeKm + (speed * dt) / 1000,
        speedMps: speed,
        stageIndex: lastStage,
      });
    }
    if (analysis.verdict === "destination") {
      events.push({ tS: t + ORBIT_COAST_S, kind: "arrival", label: `Arrives: ${DESTINATIONS[design.destination].name}` });
    }
  }

  events.sort((a, b) => a.tS - b.tS);
  return {
    points,
    events,
    outcome: analysis.verdict,
    maxAltitudeKm: Math.max(0, ...points.map((p) => p.altitudeKm)),
  };
}

/** Gravity turn: climbs steeply at first and levels off at orbit height as speed reaches orbital. */
function climbAltitude(speedMps: number) {
  const f = Math.min(1, speedMps / ORBITAL_SPEED_MPS);
  return ORBIT_ALTITUDE_KM * (1 - (1 - f) ** 2);
}

/** How much of the velocity is horizontal: none at liftoff, all of it at orbital speed. */
function horizontalShare(speedMps: number) {
  return Math.min(1, speedMps / ORBITAL_SPEED_MPS);
}

/** After burnout short of orbit: a ballistic arc up to apogee and back down to impact. */
function coastBallistic(
  points: FlightPoint[],
  events: FlightEvent[],
  burnoutS: number,
  speed: number,
  downrangeKm: number,
  stageIndex: number,
) {
  const h0 = climbAltitude(speed) * 1000;
  const vx = speed * horizontalShare(speed);
  const vy = speed - vx;
  const apogeeS = vy / G0;
  const impactS = (vy + Math.sqrt(vy * vy + 2 * G0 * h0)) / G0;
  const apogeeKm = (h0 + (vy * vy) / (2 * G0)) / 1000;

  for (let k = 1; k <= COAST_POINTS; k++) {
    const dt = (impactS * k) / COAST_POINTS;
    const vyNow = vy - G0 * dt;
    points.push({
      tS: burnoutS + dt,
      altitudeKm: Math.max(0, (h0 + vy * dt - (G0 * dt * dt) / 2) / 1000),
      downrangeKm: downrangeKm + (vx * dt) / 1000,
      speedMps: Math.hypot(vx, vyNow),
      stageIndex,
    });
  }
  events.push({ tS: burnoutS + apogeeS, kind: "apogee", label: `Apogee at ${Math.round(apogeeKm)} km` });
  events.push({ tS: burnoutS + impactS, kind: "impact", label: `Falls back ${Math.round(downrangeKm + (vx * impactS) / 1000)} km downrange` });
}

function padFailure(analysis: Analysis): FlightTrace {
  const tonnes = Math.round(analysis.liftoffMassKg / 1000).toLocaleString("en-US");
  return {
    points: [0, 2, 4, 6].map((tS) => ({ tS, altitudeKm: 0, downrangeKm: 0, speedMps: 0, stageIndex: 0 })),
    events: [
      {
        tS: 0,
        kind: "pad-failure",
        label: `Engines light, but thrust-to-weight ${analysis.liftoffTwr.toFixed(2)} can't lift ${tonnes} t`,
      },
    ],
    outcome: "stuck-on-pad",
    maxAltitudeKm: 0,
  };
}
