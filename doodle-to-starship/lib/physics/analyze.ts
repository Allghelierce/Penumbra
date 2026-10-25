// Rocket-equation analysis: masses, thrust-to-weight and delta-v per stage.

import type { Analysis, Design, DestinationId, PropellantId, Stage, StageAnalysis, Verdict } from "../design";
import { DESTINATIONS, ENGINES, PROPELLANT_DENSITY_KG_M3 } from "./data";

const G0 = 9.80665;
const USABLE_FRACTION = 0.95;

/** Structure as a fraction of propellant mass, only when a stage omits dryMassKg. */
const STRUCTURAL_FACTOR: Record<PropellantId, number> = {
  methalox: 0.06,
  kerolox: 0.05,
  hydrolox: 0.1,
  solid: 0.12,
  hypergolic: 0.08,
};

/** Easiest to hardest. Furthest reach is the latest entry this delta-v still covers. */
const DESTINATION_ORDER: DestinationId[] = [
  "leo",
  "gto",
  "moon-orbit",
  "moon-surface",
  "mars-transfer",
  "mars-surface",
  "europa",
];

export function analyze(design: Design): Analysis {
  const built = design.stages.map((stage, index) => stageMasses(stage, index));
  const stages: StageAnalysis[] = built.map((stage, index) => {
    const payloadAbove =
      design.payloadMassKg + built.slice(index + 1).reduce((sum, upper) => sum + upper.wetMassKg, 0);
    return finishStage(stage, payloadAbove);
  });

  const liftoffMassKg = stages.reduce((sum, stage) => sum + stage.wetMassKg, 0) + design.payloadMassKg;
  const liftoffTwr =
    stages.length === 0 || liftoffMassKg <= 0 ? 0 : stages[0].thrustN / (liftoffMassKg * G0);
  const requiredDeltaVMps = DESTINATIONS[design.destination].deltaVFromSurfaceMps;
  const leoMps = DESTINATIONS.leo.deltaVFromSurfaceMps;
  const stuck = liftoffTwr < 1;
  const summedDeltaVMps = stages.reduce((sum, stage) => sum + stage.deltaVMps, 0);
  const totalDeltaVMps = stuck ? 0 : summedDeltaVMps;

  let verdict: Verdict;
  let furthestReachable: DestinationId | null = null;
  if (stuck) {
    verdict = "stuck-on-pad";
  } else if (totalDeltaVMps < leoMps) {
    verdict = "suborbital";
  } else if (totalDeltaVMps < requiredDeltaVMps) {
    verdict = "orbit";
    furthestReachable = furthestWithin(totalDeltaVMps);
  } else {
    verdict = "destination";
    furthestReachable = furthestWithin(totalDeltaVMps);
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
  analysis.findings = findings(design, analysis);
  return analysis;
}

interface StageMasses {
  label: string;
  wetMassKg: number;
  dryMassKg: number;
  propellantMassKg: number;
  ispS: number;
  thrustN: number;
}

function stageMasses(stage: Stage, stageIndex: number): StageMasses {
  const propellantMassKg = stage.tankVolumeM3 * PROPELLANT_DENSITY_KG_M3[stage.propellant] * USABLE_FRACTION;
  const engineMassKg = stage.engines.reduce((sum, cluster) => {
    return sum + cluster.count * ENGINES[cluster.engine].massKg;
  }, 0);
  const dryMassKg =
    typeof stage.dryMassKg === "number"
      ? stage.dryMassKg
      : propellantMassKg * STRUCTURAL_FACTOR[stage.propellant] + engineMassKg;
  const { thrustN, ispS } = thrustAndIsp(stage, stageIndex);
  return {
    label: stage.label,
    wetMassKg: dryMassKg + propellantMassKg,
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

function furthestWithin(totalDeltaVMps: number): DestinationId | null {
  let furthest: DestinationId | null = null;
  for (const id of DESTINATION_ORDER) {
    if (DESTINATIONS[id].deltaVFromSurfaceMps <= totalDeltaVMps) furthest = id;
  }
  return furthest;
}

function findings(design: Design, analysis: Analysis): string[] {
  const destination = DESTINATIONS[design.destination];
  const twr = formatTwr(analysis.liftoffTwr);
  const total = formatNumber(analysis.totalDeltaVMps);
  const required = formatNumber(analysis.requiredDeltaVMps);
  const margin = formatNumber(analysis.marginMps);
  const lines: string[] = [];

  if (analysis.verdict === "stuck-on-pad") {
    lines.push(`Liftoff thrust-to-weight is ${twr}, so it stays on the pad.`);
    lines.push(`Total delta-v is ${total} m/s because it never lifts off.`);
    lines.push(`${destination.name} needs ${required} m/s, so the margin is ${margin} m/s.`);
    return lines;
  }

  lines.push(`Liftoff thrust-to-weight is ${twr} at ${formatNumber(analysis.liftoffMassKg)} kg.`);
  lines.push(`Total delta-v is ${total} m/s against ${required} m/s for ${destination.name}.`);

  if (analysis.verdict === "destination") {
    lines.push(`The margin is ${margin} m/s, enough to reach ${destination.name}.`);
  } else if (analysis.verdict === "orbit") {
    const reach = analysis.furthestReachable ? DESTINATIONS[analysis.furthestReachable].name : "low Earth orbit";
    lines.push(`It makes orbit, but the margin is ${margin} m/s, short of ${destination.name}.`);
    lines.push(`The furthest it can reach is ${reach}.`);
  } else {
    const leo = formatNumber(DESTINATIONS.leo.deltaVFromSurfaceMps);
    lines.push(`That is short of low Earth orbit at ${leo} m/s, so the flight is suborbital.`);
    lines.push(`The margin versus ${destination.name} is ${margin} m/s.`);
  }

  return lines.slice(0, 5);
}

function formatTwr(twr: number): string {
  if (twr !== 0 && Math.abs(twr) < 0.01) return twr.toFixed(4);
  return twr.toFixed(2);
}

function formatNumber(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
