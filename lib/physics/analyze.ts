// Rocket-equation analysis: masses, thrust-to-weight and delta-v per stage.

import type { Analysis, Design, DestinationId, PropellantId, Stage, StageAnalysis, Verdict } from "../design";
import { DESTINATIONS, ENGINES, PROPELLANT_DENSITY_KG_M3 } from "./data";
import { km, kmShort, kmSpare } from "./format";

const G0 = 9.80665;
const USABLE_FRACTION = 0.95;

/** Circular orbital speed at 200 km. */
const ORBITAL_SPEED_MPS = 7_800;
/** Earth's rotation gives an eastward launch from about 28.5° N this much for free. */
export const ROTATION_MPS = 400;
/**
 * How fast the climb turns horizontal: the share of gravity a stage fights is
 * (1 − speed / orbital speed)^GRAVITY_TURN, from straight up at liftoff to nothing in orbit.
 */
const GRAVITY_TURN = 2;
/**
 * The share of g a stage fights at a given fraction of orbital speed: sin(flight-path angle),
 * which falls as the climb turns horizontal, times the centrifugal relief (1 − u²) that makes
 * orbital speed weightless.
 */
function gravityShare(u: number): number {
  const v = Math.min(1, Math.max(0, u));
  return Math.pow(1 - v, GRAVITY_TURN) * (1 - v * v);
}

/** Drag loss per unit of frontal area over lift-off mass (m/s per m²/kg). Small, by design. */
const DRAG_COEFFICIENT = 3e6;
const MAX_DRAG_MPS = 400;
/** Steps per stage when integrating the climb. */
const STEPS = 48;

/** Structure as a fraction of propellant mass, only when a stage omits dryMassKg. */
const STRUCTURAL_FACTOR: Record<PropellantId, number> = {
  methalox: 0.06,
  kerolox: 0.05,
  hydrolox: 0.1,
  solid: 0.12,
  hypergolic: 0.08,
};

export function analyze(design: Design): Analysis {
  const built = design.stages.map((stage, index) => stageMasses(stage, index, design.stages.length));
  const stages: StageAnalysis[] = built.map((stage, index) => {
    const payloadAbove =
      design.payloadMassKg + built.slice(index + 1).reduce((sum, upper) => sum + upper.wetMassKg, 0);
    return finishStage(stage, payloadAbove);
  });

  const liftoffMassKg = stages.reduce((sum, stage) => sum + stage.wetMassKg, 0) + design.payloadMassKg;
  const liftoffTwr =
    stages.length === 0 || liftoffMassKg <= 0 ? 0 : stages[0].thrustN / (liftoffMassKg * G0);
  const stuck = liftoffTwr < 1;
  const summedDeltaVMps = stages.reduce((sum, stage) => sum + stage.deltaVMps, 0);
  const totalDeltaVMps = stuck ? 0 : summedDeltaVMps;

  // Reaching orbit takes orbital speed, less Earth's spin, plus what this design loses to
  // gravity and drag on the way up. Destinations past LEO add their legs from the delta-v map.
  const lossMps = stuck ? 0 : ascentLossesMps(design, stages).reduce((sum, loss) => sum + loss, 0);
  const leoMps = stuck ? DESTINATIONS.leo.deltaVFromSurfaceMps : ORBITAL_SPEED_MPS - ROTATION_MPS + lossMps;
  const requiredDeltaVMps = leoMps + legMps(design.destination);

  let verdict: Verdict;
  let furthestReachable: DestinationId | null = null;
  if (stuck) {
    verdict = "stuck-on-pad";
  } else if (totalDeltaVMps < leoMps) {
    verdict = "suborbital";
  } else if (totalDeltaVMps < requiredDeltaVMps) {
    verdict = "orbit";
    furthestReachable = furthestWithin(totalDeltaVMps - leoMps);
  } else {
    verdict = "destination";
    furthestReachable = furthestWithin(totalDeltaVMps - leoMps);
  }

  const analysis: Analysis = {
    liftoffMassKg,
    liftoffTwr,
    stages,
    totalDeltaVMps,
    requiredDeltaVMps,
    marginMps: totalDeltaVMps - requiredDeltaVMps,
    verdict,
    furthestReachable,
    findings: [],
  };
  analysis.findings = findings(design, analysis, lossMps);
  return analysis;
}

/** Delta-v past low Earth orbit to the destination, from the standard delta-v map. */
function legMps(destination: DestinationId): number {
  return DESTINATIONS[destination].deltaVFromSurfaceMps - DESTINATIONS.leo.deltaVFromSurfaceMps;
}

/**
 * Gravity and drag losses per stage on the way to orbit, by integrating the climb: each stage's
 * thrust against the share of gravity it still fights at its speed. A low thrust-to-weight
 * means a long burn at low speed, so more delta-v goes to fighting gravity. Drag, small, comes
 * out of the first stage.
 */
export function ascentLossesMps(design: Design, stages: StageAnalysis[]): number[] {
  const liftoffMassKg = stages.reduce((sum, stage) => sum + stage.wetMassKg, 0) + design.payloadMassKg;
  const losses: number[] = [];
  let speed = ROTATION_MPS;
  stages.forEach((stage, index) => {
    const above = design.payloadMassKg + stages.slice(index + 1).reduce((sum, upper) => sum + upper.wetMassKg, 0);
    if (stage.thrustN <= 0 || stage.ispS <= 0 || stage.propellantMassKg <= 0 || stage.burnTimeS <= 0) {
      losses.push(0);
      return;
    }
    const exhaust = stage.ispS * G0;
    const flow = stage.propellantMassKg / stage.burnTimeS;
    const dt = stage.burnTimeS / STEPS;
    let mass = stage.wetMassKg + above;
    let lost = 0;
    for (let k = 0; k < STEPS; k++) {
      const thrustAccel = (exhaust * flow) / (mass - (flow * dt) / 2);
      const gravity = G0 * gravityShare(speed / ORBITAL_SPEED_MPS);
      speed = Math.max(0, speed + (thrustAccel - gravity) * dt);
      lost += gravity * dt;
      mass -= flow * dt;
    }
    if (index === 0) {
      const area = Math.PI * (design.diameterM / 2) ** 2;
      const drag = liftoffMassKg > 0 ? Math.min(MAX_DRAG_MPS, (DRAG_COEFFICIENT * area) / liftoffMassKg) : 0;
      lost += drag;
      speed = Math.max(0, speed - drag);
    }
    losses.push(lost);
  });
  return losses;
}

interface StageMasses {
  label: string;
  wetMassKg: number;
  dryMassKg: number;
  propellantMassKg: number;
  ispS: number;
  thrustN: number;
}

/**
 * A stage that flies back keeps part of its propellant for the boostback, entry and landing
 * burns, so it never burns it on the way up, and carries recovery hardware: legs and grid fins
 * on a booster, a heat shield and flaps on an orbital stage.
 */
type RecoveryRole = "booster" | "orbital";
/**
 * Booster: 8% of its load, about 32 t on a Falcon 9, which lands it on a drone ship at the
 * published 17.5 t (calibrated). Orbital stage: 3%, about 45 t on a Starship Ship for the
 * deorbit and landing burns (physically estimated; see lib/trade.test.ts for the Starship gap).
 */
const RECOVERY_RESERVE: Record<RecoveryRole, number> = { booster: 0.08, orbital: 0.03 };
/** Legs and grid fins on a booster; heat shield and flaps on an orbital stage, as a share of dry mass. */
const RECOVERY_HARDWARE: Record<RecoveryRole, number> = { booster: 0.06, orbital: 0.1 };

function stageMasses(stage: Stage, stageIndex: number, stageCount: number): StageMasses {
  const loadedKg = stage.tankVolumeM3 * PROPELLANT_DENSITY_KG_M3[stage.propellant] * USABLE_FRACTION;
  // The top stage is the one that reaches orbit; everything under it is a booster.
  const role: RecoveryRole = stageIndex === stageCount - 1 ? "orbital" : "booster";
  const reserveKg = stage.recover ? loadedKg * RECOVERY_RESERVE[role] : 0;
  const propellantMassKg = loadedKg - reserveKg;
  const engineMassKg = stage.engines.reduce((sum, cluster) => {
    return sum + cluster.count * ENGINES[cluster.engine].massKg;
  }, 0);
  const statedDryKg =
    typeof stage.dryMassKg === "number" ? stage.dryMassKg : loadedKg * STRUCTURAL_FACTOR[stage.propellant] + engineMassKg;
  const dryMassKg = statedDryKg * (stage.recover ? 1 + RECOVERY_HARDWARE[role] : 1);
  const { thrustN, ispS } = thrustAndIsp(stage, stageIndex);
  return {
    label: stage.label,
    // The landing reserve rides up as dead weight: in the wet mass, never burned.
    wetMassKg: dryMassKg + loadedKg,
    dryMassKg,
    propellantMassKg,
    ispS,
    thrustN,
  };
}

/** Stage 0 is sea level. Upper stages are vacuum. Isp is thrust-weighted across clusters. */
function thrustAndIsp(stage: Stage, stageIndex: number): { thrustN: number; ispS: number } {
  let thrustN = 0;
  let weightedIsp = 0;
  for (const cluster of stage.engines) {
    const engine = ENGINES[cluster.engine];
    const seaLevel = stageIndex === 0;
    const thrustEach = seaLevel ? engine.thrustSeaLevelN : engine.thrustVacuumN;
    const ispEach = seaLevel ? (engine.ispSeaLevelS + engine.ispVacuumS) / 2 : engine.ispVacuumS;
    const clusterThrust = cluster.count * thrustEach;
    thrustN += clusterThrust;
    weightedIsp += clusterThrust * ispEach;
  }
  return { thrustN, ispS: thrustN > 0 ? weightedIsp / thrustN : 0 };
}

function finishStage(stage: StageMasses, payloadAbove: number): StageAnalysis {
  const m0 = stage.wetMassKg + payloadAbove;
  const mf = m0 - stage.propellantMassKg;
  const deltaVMps = stage.ispS > 0 && m0 > mf && mf > 0 ? stage.ispS * G0 * Math.log(m0 / mf) : 0;
  const burnTimeS = stage.thrustN > 0 ? (stage.propellantMassKg * stage.ispS * G0) / stage.thrustN : 0;
  const twrAtIgnition = m0 > 0 ? stage.thrustN / (m0 * G0) : 0;
  return {
    label: stage.label,
    wetMassKg: stage.wetMassKg,
    dryMassKg: stage.dryMassKg,
    propellantMassKg: stage.propellantMassKg,
    ispS: stage.ispS,
    thrustN: stage.thrustN,
    deltaVMps,
    burnTimeS,
    twrAtIgnition,
  };
}

/** Hardest destination whose leg past LEO still fits in the delta-v left over after reaching orbit. */
function furthestWithin(pastLeoMps: number): DestinationId | null {
  let best: DestinationId | null = null;
  let bestLeg = -Infinity;
  for (const id of Object.keys(DESTINATIONS) as DestinationId[]) {
    const leg = legMps(id);
    if (leg <= pastLeoMps && leg > bestLeg) {
      best = id;
      bestLeg = leg;
    }
  }
  return best;
}

function findings(design: Design, analysis: Analysis, lossMps: number): string[] {
  const destination = DESTINATIONS[design.destination];
  const twr = formatTwr(analysis.liftoffTwr);
  const total = km(analysis.totalDeltaVMps);
  const required = km(analysis.requiredDeltaVMps);
  const massT = tonnes(analysis.liftoffMassKg);
  const lines: string[] = [];

  if (analysis.verdict === "stuck-on-pad") {
    lines.push(`Liftoff thrust-to-weight is ${twr}, so it stays on the pad.`);
    lines.push(`Total delta-v is ${total} km/s because it never lifts off.`);
    lines.push(
      `${destination.name} needs ${required} km/s, so it is ${kmShort(analysis.totalDeltaVMps, analysis.requiredDeltaVMps)} km/s short.`,
    );
    return lines;
  }

  lines.push(`Liftoff thrust-to-weight is ${twr} at ${massT} t.`);
  lines.push(`Total delta-v is ${total} km/s against ${required} km/s for ${destination.name}.`);
  lines.push(`Gravity and drag take ${km(lossMps)} km/s of that on the way up; a stronger liftoff loses less.`);

  if (analysis.verdict === "destination") {
    lines.push(
      `It reaches ${destination.name} with ${kmSpare(analysis.totalDeltaVMps, analysis.requiredDeltaVMps)} km/s to spare.`,
    );
  } else if (analysis.verdict === "orbit") {
    const reach = analysis.furthestReachable ? DESTINATIONS[analysis.furthestReachable].name : "low Earth orbit";
    lines.push(
      `It makes orbit, but it is ${kmShort(analysis.totalDeltaVMps, analysis.requiredDeltaVMps)} km/s short of ${destination.name}.`,
    );
    lines.push(`The furthest it can reach is ${reach}.`);
  } else {
    const leo = analysis.requiredDeltaVMps - legMps(design.destination);
    lines.push(
      `That is ${kmShort(analysis.totalDeltaVMps, leo)} km/s short of low Earth orbit, so the flight is suborbital.`,
    );
    lines.push(
      `The margin versus ${destination.name} is ${kmShort(analysis.totalDeltaVMps, analysis.requiredDeltaVMps)} km/s short.`,
    );
  }

  return lines.slice(0, 5);
}

/** One decimal, but never round a thrust-to-weight just under 1 up to "1.0". */
function formatTwr(twr: number): string {
  return twr < 1 && twr >= 0.95 ? (Math.floor(twr * 100) / 100).toFixed(2) : twr.toFixed(1);
}

function tonnes(kg: number): string {
  const t = kg / 1000;
  return t >= 10 ? String(Math.round(t)) : t.toFixed(1);
}
