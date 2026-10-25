// Rocket-equation analysis of a design: mass, thrust-to-weight and delta-v per stage.

import type { Analysis, Design, DestinationId, Stage, StageAnalysis, Verdict } from "../design";
import { DESTINATIONS, ENGINES, G0, PROPELLANT_DENSITY_KG_M3, STRUCTURAL_FACTOR, TANK_FILL } from "./data";

export function analyze(design: Design): Analysis {
  // Stack from the top down: everything above a stage is that stage's payload.
  const stages: StageAnalysis[] = [];
  let above = design.payloadMassKg;
  for (let i = design.stages.length - 1; i >= 0; i--) {
    const stage = stageAnalysis(design.stages[i], i === 0, above);
    stages.unshift(stage);
    above += stage.wetMassKg;
  }

  const liftoffMassKg = above;
  const liftoffTwr = stages.length > 0 ? stages[0].thrustN / (liftoffMassKg * G0) : 0;
  const stuck = !(liftoffTwr >= 1);
  const totalDeltaVMps = stuck ? 0 : stages.reduce((sum, s) => sum + s.deltaVMps, 0);
  const requiredDeltaVMps = DESTINATIONS[design.destination].deltaVFromSurfaceMps;

  const verdict: Verdict = stuck
    ? "stuck-on-pad"
    : totalDeltaVMps < DESTINATIONS.leo.deltaVFromSurfaceMps
      ? "suborbital"
      : totalDeltaVMps < requiredDeltaVMps
        ? "orbit"
        : "destination";

  const analysis: Analysis = {
    liftoffMassKg,
    liftoffTwr,
    stages,
    totalDeltaVMps,
    requiredDeltaVMps,
    marginMps: totalDeltaVMps - requiredDeltaVMps,
    verdict,
    furthestReachable: furthestReachable(totalDeltaVMps),
    findings: [],
  };
  analysis.findings = findings(design, analysis);
  return analysis;
}

function stageAnalysis(stage: Stage, isBottom: boolean, payloadKg: number): StageAnalysis {
  const propellantMassKg = Math.max(0, stage.tankVolumeM3) * PROPELLANT_DENSITY_KG_M3[stage.propellant] * TANK_FILL;
  const engineMassKg = stage.engines.reduce((sum, c) => sum + ENGINES[c.engine].massKg * c.count, 0);
  const dryMassKg = stage.dryMassKg ?? propellantMassKg * STRUCTURAL_FACTOR[stage.propellant] + engineMassKg;

  // Bottom stage: sea-level thrust, and the mean of sea-level and vacuum Isp over the climb.
  let thrustN = 0;
  let ispWeighted = 0;
  let ispWeight = 0;
  for (const cluster of stage.engines) {
    const engine = ENGINES[cluster.engine];
    const count = Math.max(0, cluster.count);
    thrustN += (isBottom ? engine.thrustSeaLevelN : engine.thrustVacuumN) * count;
    const isp = isBottom ? (engine.ispSeaLevelS + engine.ispVacuumS) / 2 : engine.ispVacuumS;
    ispWeighted += isp * engine.thrustVacuumN * count;
    ispWeight += engine.thrustVacuumN * count;
  }
  const ispS = ispWeight > 0 ? ispWeighted / ispWeight : 0;

  const wetMassKg = dryMassKg + propellantMassKg;
  const m0 = payloadKg + wetMassKg;
  const mf = payloadKg + dryMassKg;
  const deltaVMps = ispS > 0 && mf > 0 ? ispS * G0 * Math.log(m0 / mf) : 0;
  const massFlowKgS = ispS > 0 ? thrustN / (ispS * G0) : 0;

  return {
    label: stage.label,
    wetMassKg,
    dryMassKg,
    propellantMassKg,
    ispS,
    thrustN,
    deltaVMps,
    burnTimeS: massFlowKgS > 0 ? propellantMassKg / massFlowKgS : 0,
    twrAtIgnition: m0 > 0 ? thrustN / (m0 * G0) : 0,
  };
}

/** The hardest destination (by delta-v) within reach, or null if it can't make orbit. */
function furthestReachable(deltaVMps: number): DestinationId | null {
  let best: DestinationId | null = null;
  for (const spec of Object.values(DESTINATIONS)) {
    if (spec.deltaVFromSurfaceMps > deltaVMps) continue;
    if (!best || spec.deltaVFromSurfaceMps > DESTINATIONS[best].deltaVFromSurfaceMps) best = spec.id;
  }
  return best;
}

function findings(design: Design, a: Analysis): string[] {
  const out: string[] = [];
  const km = (mps: number) => (mps / 1000).toFixed(1);
  const tonnes = (kg: number) => Math.round(kg / 1000).toLocaleString("en-US");
  const destination = DESTINATIONS[design.destination].name;
  const bottom = design.stages[0];

  const vacuumOnly = bottom?.engines.filter((c) => ENGINES[c.engine].thrustSeaLevelN === 0) ?? [];
  if (vacuumOnly.length > 0) {
    out.push(`${ENGINES[vacuumOnly[0].engine].name} is a vacuum engine and can't push at sea level; the bottom stage needs sea-level engines.`);
  }

  if (a.verdict === "stuck-on-pad") {
    out.push(`Liftoff thrust-to-weight is ${a.liftoffTwr.toFixed(2)}, so it never leaves the pad: ${tonnes(a.liftoffMassKg)} t needs more than ${tonnes((a.stages[0]?.thrustN ?? 0) / G0)} t of thrust.`);
    return out.slice(0, 5);
  }

  out.push(`Liftoff thrust-to-weight is ${a.liftoffTwr.toFixed(2)} with ${tonnes(a.liftoffMassKg)} t on the pad.`);
  out.push(`Total delta-v is ${km(a.totalDeltaVMps)} km/s against ${km(a.requiredDeltaVMps)} km/s needed for ${destination}.`);

  if (a.verdict === "destination") {
    out.push(`It reaches ${destination} with ${km(a.marginMps)} km/s to spare.`);
  } else if (a.verdict === "orbit") {
    const reach = a.furthestReachable ? DESTINATIONS[a.furthestReachable].name : "low Earth orbit";
    out.push(`It makes orbit but falls ${km(-a.marginMps)} km/s short of ${destination}; the furthest it gets is ${reach}.`);
  } else {
    out.push(`It's ${km(DESTINATIONS.leo.deltaVFromSurfaceMps - a.totalDeltaVMps)} km/s short of orbit, so it's a suborbital hop.`);
  }

  if (a.stages.length > 1) {
    out.push(a.stages.map((s) => `${s.label} ${km(s.deltaVMps)} km/s`).join(", ") + ".");
  }
  return out.slice(0, 5);
}
