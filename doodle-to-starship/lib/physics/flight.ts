// Deterministic flight trace driven by analyze(). Engines cut when the target speed is
// reached; nothing in the trace flies faster than that. A rocket bound past low Earth orbit
// waits in a parking orbit, makes its departure burn, then coasts on Earth's gravity alone, so
// the trace climbs exactly as far as that speed really carries it.

import type { Analysis, Design, DestinationId, FlightEvent, FlightEventKind, FlightPoint, FlightTrace, Verdict } from "../design";
import { ascentLossesMps, ROTATION_MPS } from "./analyze";
import { km } from "./format";

const G0 = 9.80665;
const ORBITAL_SPEED_MPS = 7800;
const ORBIT_ALTITUDE_KM = 200;
const POINT_COUNT = 300;
const MAX_Q_S = 60;

/** Earth's gravitational parameter (m³/s²) and mean radius. */
const MU_EARTH = 3.986004418e14;
const EARTH_RADIUS_M = 6_371_000;
/** Mean distance from Earth to the Moon, centre to centre. */
const MOON_DISTANCE_M = 384_400_000;
/** A probe headed for another planet is followed out to here, where Earth's pull has little hold left (its Hill sphere is 1.5 million km). */
const ESCAPE_ALTITUDE_KM = 1_000_000;
/** Time in the parking orbit before the departure burn: about a third of an orbit. */
const PARKING_COAST_S = 1_800;
/** Points for a departing flight: the climb to the parking orbit, the wait, the burn and the coast. */
const DEPARTING_POINTS = { ascent: 180, parking: 8, burn: 32, coast: 80 };
/** Coast integration step, as a share of the local orbital timescale r / v. */
const COAST_STEP = 0.01;

/** The Sun's gravitational parameter and the astronomical unit, for Hohmann coast times. */
const MU_SUN = 1.32712440018e20;
const AU_M = 1.495978707e11;

interface Departure {
  /** Speed the departure burn adds to orbital speed. */
  mps: number;
  burn: string;
  /** The Moon is followed all the way there; a planet until the probe has left Earth behind. */
  planet?: { name: string; au: number };
}

/**
 * Departure burns from the parking orbit; GTO stays at 7.8 km/s. Mars and Jupiter take the
 * delta-v map's injection burns, which leave Earth at the Hohmann excess speeds (3.0 and
 * 8.8 km/s). The Moon takes an Apollo-style TLI just under escape speed: apogee falls far past the
 * Moon (515,000 km), so the coast reaches the Moon's distance in 3 days, as Apollo's did. (The
 * map's 3.26 km/s is a hair past escape speed and gets there in under 2 days; a minimum-energy
 * Hohmann transfer takes 5.)
 */
const DEPARTURES: Partial<Record<DestinationId, Departure>> = {
  "moon-orbit": { mps: 3_145, burn: "Trans-lunar injection" },
  "moon-surface": { mps: 3_145, burn: "Trans-lunar injection" },
  "mars-transfer": { mps: 3_610, burn: "Trans-Mars injection", planet: { name: "Mars", au: 1.5237 } },
  "mars-surface": { mps: 3_610, burn: "Trans-Mars injection", planet: { name: "Mars", au: 1.5237 } },
  europa: { mps: 6_300, burn: "Trans-Jupiter injection", planet: { name: "Jupiter", au: 5.2044 } },
};

const EVENT_ORDER: Record<FlightEventKind, number> = {
  liftoff: 0,
  "max-q": 1,
  "engine-cutoff": 2,
  "stage-sep": 3,
  "fuel-exhausted": 4,
  orbit: 5,
  arrival: 6,
  escape: 7,
  apogee: 8,
  impact: 9,
  "pad-failure": 10,
  breakup: 11,
};

type Cutoff = { tS: number; reached: boolean; stageIndex: number };

export function simulateFlight(design: Design, analysis: Analysis): FlightTrace {
  if (analysis.verdict === "stuck-on-pad") return padFailure(analysis);

  const burnTimes = analysis.stages.map((stage) => Math.max(0, stage.burnTimeS));
  const totalBurnS = burnTimes.reduce((sum, burn) => sum + burn, 0);
  // The same gravity and drag losses analyze() charges, with Earth's spin credited against the
  // first stage, so the trace reaches orbital speed exactly when the verdict says it does.
  const losses = ascentLossesMps(design, analysis.stages).map((loss, i) => (i === 0 ? Math.max(0, loss - ROTATION_MPS) : loss));
  const suborbital = analysis.verdict === "suborbital";

  // Only a rocket that can finish the trip leaves its parking orbit; one that can't stays in orbit.
  const departure = analysis.verdict === "destination" ? DEPARTURES[design.destination] : undefined;
  if (departure) {
    const parked = findCutoff(analysis, burnTimes, losses, ORBITAL_SPEED_MPS);
    const departed = findCutoff(analysis, burnTimes, losses, ORBITAL_SPEED_MPS + departure.mps);
    if (parked.reached && departed.reached) return departingFlight(analysis, burnTimes, losses, departure, parked, departed);
  }

  const missionCap = ORBITAL_SPEED_MPS;
  const cutoff = findCutoff(analysis, burnTimes, losses, missionCap);

  // Insertion speed: the mission cap when the rocket gets there, otherwise burnout speed.
  const insertion = cutoff.reached ? missionCap : speedAt(analysis, burnTimes, losses, totalBurnS, missionCap);
  const poweredS = cutoff.reached ? cutoff.tS : totalBurnS;
  const burnoutAltKm = climbAltitudeKm(Math.min(insertion, ORBITAL_SPEED_MPS));
  const apogeeKm = suborbital ? suborbitalApogeeKm(insertion, burnoutAltKm) : ORBIT_ALTITUDE_KM;
  const coastS = suborbital ? hopCoastS(burnoutAltKm, apogeeKm) : 0;

  const { nPowered, nCoast } = splitPoints(poweredS, coastS);
  const points = climbPoints(analysis, burnTimes, losses, poweredS, nPowered, cutoff, missionCap, !suborbital);

  if (nCoast > 0 && points.length > 0) {
    const burnout = points[points.length - 1];
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
  }

  const events = flightEvents(analysis, burnTimes, losses, cutoff, poweredS, coastS, apogeeKm, missionCap);
  return { points, events, outcome: analysis.verdict, maxAltitudeKm: highest(points) };
}

/**
 * Up to the parking orbit, a wait there, the departure burn at 200 km, then the coast: Earth's
 * gravity alone (two-body, RK4), out to the Moon's distance, or to a million kilometres for a
 * planet. Points on the coast are spaced by altitude, since it lasts days.
 */
function departingFlight(
  analysis: Analysis,
  burnTimes: number[],
  losses: number[],
  departure: Departure,
  parked: Cutoff,
  departed: Cutoff,
): FlightTrace {
  const n = DEPARTING_POINTS;
  const departV = ORBITAL_SPEED_MPS + departure.mps;
  const points = climbPoints(analysis, burnTimes, losses, parked.tS, n.ascent, parked, ORBITAL_SPEED_MPS, true);
  const atOrbit = points[points.length - 1];
  let downrangeM = atOrbit.downrangeKm * 1000;
  // Ground covered under a horizontal path at 200 km.
  const r0 = EARTH_RADIUS_M + ORBIT_ALTITUDE_KM * 1000;
  const ground = (speedMps: number) => (speedMps * EARTH_RADIUS_M) / r0;

  for (let k = 1; k <= n.parking; k++) {
    downrangeM += ground(ORBITAL_SPEED_MPS) * (PARKING_COAST_S / n.parking);
    points.push({
      tS: parked.tS + (PARKING_COAST_S * k) / n.parking,
      altitudeKm: ORBIT_ALTITUDE_KM,
      downrangeKm: downrangeM / 1000,
      speedMps: ORBITAL_SPEED_MPS,
      stageIndex: atOrbit.stageIndex,
    });
  }

  // The burn picks up the powered timeline where orbit insertion left it, a parking coast later.
  const burnS = departed.tS - parked.tS;
  let prevSpeed = ORBITAL_SPEED_MPS;
  for (let k = 1; k <= n.burn; k++) {
    const tS = parked.tS + (burnS * k) / n.burn;
    const state =
      k === n.burn ? { speedMps: departV, stageIndex: departed.stageIndex } : stateAt(analysis, burnTimes, losses, tS, departV);
    downrangeM += 0.5 * (ground(prevSpeed) + ground(state.speedMps)) * (burnS / n.burn);
    prevSpeed = state.speedMps;
    points.push({
      tS: tS + PARKING_COAST_S,
      altitudeKm: ORBIT_ALTITUDE_KM,
      downrangeKm: downrangeM / 1000,
      speedMps: state.speedMps,
      stageIndex: state.stageIndex,
    });
  }

  const burnEnd = points[points.length - 1];
  const endM = departure.planet ? EARTH_RADIUS_M + ESCAPE_ALTITUDE_KM * 1000 : MOON_DISTANCE_M;
  // Spaced evenly in log altitude, plus the Moon's distance exactly for a planet-bound probe.
  const steps = departure.planet ? n.coast - 1 : n.coast;
  const climb = (endM - EARTH_RADIUS_M) / (ORBIT_ALTITUDE_KM * 1000);
  const marks = Array.from({ length: steps }, (_, k) => EARTH_RADIUS_M + ORBIT_ALTITUDE_KM * 1000 * climb ** ((k + 1) / steps));
  if (departure.planet) marks.push(MOON_DISTANCE_M);
  marks.sort((a, b) => a - b);
  const coast = coastFrom(r0, departV, marks);
  for (const c of coast) {
    points.push({
      tS: burnEnd.tS + c.tS,
      altitudeKm: (c.rM - EARTH_RADIUS_M) / 1000,
      downrangeKm: burnEnd.downrangeKm + (EARTH_RADIUS_M * c.angle) / 1000,
      speedMps: c.speedMps,
      stageIndex: burnEnd.stageIndex,
    });
  }

  const events = climbEvents(analysis, burnTimes, losses, parked.tS, departed.tS, (tS) => (tS > parked.tS ? tS + PARKING_COAST_S : tS));
  events.push(
    { tS: parked.tS, kind: "engine-cutoff", label: `Engine cutoff at ${km(ORBITAL_SPEED_MPS)} km/s` },
    { tS: parked.tS, kind: "orbit", label: `Parking orbit: ${ORBIT_ALTITUDE_KM} km, ${km(ORBITAL_SPEED_MPS)} km/s` },
    { tS: burnEnd.tS, kind: "engine-cutoff", label: `${departure.burn}: ${km(departV)} km/s at ${ORBIT_ALTITUDE_KM} km` },
  );
  const last = coast[coast.length - 1];
  const arrived = last !== undefined && last.rM >= endM * (1 - 1e-9);
  if (last && departure.planet) {
    const moon = coast.find((c) => Math.abs(c.rM - MOON_DISTANCE_M) < 1);
    if (moon) {
      events.push({ tS: burnEnd.tS + moon.tS, kind: "escape", label: `Passes the Moon's distance, ${duration(moon.tS)} after the burn` });
    }
    if (arrived) {
      events.push({
        tS: burnEnd.tS + last.tS,
        kind: "escape",
        label: `Leaving Earth at ${km(last.speedMps)} km/s · ~${coastLength(hohmannS(departure.planet.au))} coast to ${departure.planet.name}`,
      });
    }
  } else if (last && arrived) {
    events.push({ tS: burnEnd.tS + last.tS, kind: "arrival", label: `Reaches the Moon's distance, ${duration(last.tS)} after the burn` });
  }
  events.sort(byTime);
  return { points, events, outcome: analysis.verdict, maxAltitudeKm: highest(points) };
}

type State = [x: number, y: number, vx: number, vy: number];

function gravity([x, y, vx, vy]: State): State {
  const r2 = x * x + y * y;
  const k = -MU_EARTH / (r2 * Math.sqrt(r2));
  return [vx, vy, k * x, k * y];
}

function rk4(s: State, dt: number): State {
  const step = (a: State, d: State, h: number): State => [a[0] + d[0] * h, a[1] + d[1] * h, a[2] + d[2] * h, a[3] + d[3] * h];
  const k1 = gravity(s);
  const k2 = gravity(step(s, k1, dt / 2));
  const k3 = gravity(step(s, k2, dt / 2));
  const k4 = gravity(step(s, k3, dt));
  return [0, 1, 2, 3].map((i) => s[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as State;
}

/**
 * Coast from a horizontal start at radius r0 and speed v0, sampled at the moment the distance
 * from Earth's centre first reaches each of `marksM` (ascending). The step is 1% of the local
 * orbital timescale, so it is seconds near Earth and hours far out. Stops at apogee if the orbit
 * turns back before the next mark.
 */
function coastFrom(r0: number, v0: number, marksM: number[]): { tS: number; rM: number; speedMps: number; angle: number }[] {
  const sample = (s: State, tS: number) => {
    const angle = Math.atan2(s[1], s[0]);
    return { tS, rM: Math.hypot(s[0], s[1]), speedMps: Math.hypot(s[2], s[3]), angle: angle < 0 ? angle + 2 * Math.PI : angle };
  };
  const out: ReturnType<typeof sample>[] = [];
  let s: State = [r0, 0, 0, v0];
  let t = 0;
  let next = 0;
  for (let guard = 0; next < marksM.length && guard < 100_000; guard++) {
    const dt = Math.max(1, (COAST_STEP * Math.hypot(s[0], s[1])) / Math.hypot(s[2], s[3]));
    const after = rk4(s, dt);
    while (next < marksM.length && Math.hypot(after[0], after[1]) >= marksM[next]) {
      // Bisect within the step for the moment it gets there.
      let lo = 0;
      let hi = dt;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const m = rk4(s, mid);
        if (Math.hypot(m[0], m[1]) < marksM[next]) lo = mid;
        else hi = mid;
      }
      out.push(sample(rk4(s, hi), t + hi));
      next++;
    }
    if (next < marksM.length && after[0] * after[2] + after[1] * after[3] < 0) {
      out.push(sample(after, t + dt));
      break;
    }
    s = after;
    t += dt;
  }
  return out;
}

/** Hohmann transfer time from Earth's orbit to a planet's: half the transfer ellipse's period. */
function hohmannS(au: number): number {
  const a = (AU_M * (1 + au)) / 2;
  return Math.PI * Math.sqrt(a ** 3 / MU_SUN);
}

/** e.g. "8.5-month" or "2.7-year". */
function coastLength(s: number): string {
  const days = s / 86_400;
  return days < 365 ? `${(days / 30.44).toFixed(1)}-month` : `${(days / 365.25).toFixed(1)}-year`;
}

/** e.g. "28 hours" or "3.0 days". */
function duration(s: number): string {
  const hours = s / 3_600;
  return hours < 48 ? `${Math.round(hours)} hours` : `${(hours / 24).toFixed(1)} days`;
}

function highest(points: FlightPoint[]): number {
  let max = 0;
  for (const point of points) if (point.altitudeKm > max) max = point.altitudeKm;
  return max;
}

const byTime = (a: FlightEvent, b: FlightEvent) => a.tS - b.tS || EVENT_ORDER[a.kind] - EVENT_ORDER[b.kind];

function findCutoff(analysis: Analysis, burnTimes: number[], losses: number[], cap: number): Cutoff {
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

/** The powered climb from liftoff to `poweredS`: n points, 200 km and the cap at a reached cutoff. */
function climbPoints(
  analysis: Analysis,
  burnTimes: number[],
  losses: number[],
  poweredS: number,
  n: number,
  cutoff: Cutoff,
  cap: number,
  toOrbit: boolean,
): FlightPoint[] {
  const points: FlightPoint[] = [];
  let downrangeM = 0;
  let prevT = 0;
  let prevHoriz = 0;
  for (let i = 0; i < n; i++) {
    const tS = n === 1 ? 0 : (poweredS * i) / (n - 1);
    const atCap = cutoff.reached && i === n - 1;
    const state = atCap ? { speedMps: cap, stageIndex: cutoff.stageIndex } : stateAt(analysis, burnTimes, losses, tS, cap);
    const horiz = horizontalMps(state.speedMps);
    if (i > 0) downrangeM += 0.5 * (prevHoriz + horiz) * (tS - prevT);
    points.push({
      tS,
      altitudeKm: atCap && toOrbit ? ORBIT_ALTITUDE_KM : climbAltitudeKm(state.speedMps),
      downrangeKm: downrangeM / 1000,
      speedMps: state.speedMps,
      stageIndex: state.stageIndex,
    });
    prevT = tS;
    prevHoriz = horiz;
  }
  return points;
}

function speedAt(analysis: Analysis, burnTimes: number[], losses: number[], tS: number, cap: number): number {
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

/**
 * Liftoff, Max-Q, and each stage that burns out before the final cutoff at `poweredS` (powered
 * time), placed on the flight clock by `clock`.
 */
function climbEvents(
  analysis: Analysis,
  burnTimes: number[],
  losses: number[],
  ascentS: number,
  poweredS: number,
  clock: (poweredS: number) => number,
): FlightEvent[] {
  const events: FlightEvent[] = [{ tS: 0, kind: "liftoff", label: `Liftoff, TWR ${analysis.liftoffTwr.toFixed(1)}` }];
  const firstBurn = burnTimes[0] ?? 0;
  let maxQT = ascentS >= MAX_Q_S ? MAX_Q_S : firstBurn / 2;
  if (!(maxQT > 0) || maxQT > ascentS) maxQT = ascentS / 2;
  events.push({ tS: maxQT, kind: "max-q", label: `Max-Q at T+${Math.round(maxQT)} s` });

  let cursor = 0;
  for (let i = 0; i < analysis.stages.length; i++) {
    const end = cursor + burnTimes[i];
    if (!(end < poweredS - 1e-6)) break;
    const speed = speedAt(analysis, burnTimes, losses, end, Infinity);
    events.push(
      { tS: clock(end), kind: "engine-cutoff", label: `${analysis.stages[i].label} cutoff at ${km(speed)} km/s` },
      { tS: clock(end), kind: "stage-sep", label: `${analysis.stages[i].label} separates at ${Math.round(climbAltitudeKm(speed))} km` },
    );
    cursor = end;
  }
  return events;
}

function flightEvents(
  analysis: Analysis,
  burnTimes: number[],
  losses: number[],
  cutoff: Cutoff,
  poweredS: number,
  coastS: number,
  apogeeKm: number,
  cap: number,
): FlightEvent[] {
  const events = climbEvents(analysis, burnTimes, losses, poweredS, poweredS, (tS) => tS);
  const suborbital = analysis.verdict === "suborbital";
  const cutSpeed = cutoff.reached ? cap : speedAt(analysis, burnTimes, losses, poweredS, cap);
  const cutAlt = cutoff.reached ? ORBIT_ALTITUDE_KM : Math.round(climbAltitudeKm(cutSpeed));
  events.push({ tS: poweredS, kind: "engine-cutoff", label: `Engine cutoff at ${km(cutSpeed)} km/s` });

  if (suborbital) {
    events.push({ tS: poweredS, kind: "fuel-exhausted", label: `Fuel exhausted at ${km(cutSpeed)} km/s` });
    const h0 = climbAltitudeKm(cutSpeed) * 1000;
    const vy0 = Math.sqrt(Math.max(0, 2 * G0 * (apogeeKm * 1000 - h0)));
    events.push({ tS: poweredS + (vy0 > 0 ? vy0 / G0 : 0), kind: "apogee", label: `Apogee ${Math.round(apogeeKm)} km` });
    events.push({ tS: poweredS + coastS, kind: "impact", label: `Impact at T+${Math.round(poweredS + coastS)} s` });
  } else {
    events.push({ tS: poweredS, kind: "orbit", label: `Orbit: ${cutAlt} km, ${km(cutSpeed)} km/s` });
  }

  events.sort(byTime);
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
