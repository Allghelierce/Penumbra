// Stand-in for lib/trade.ts (hacktoberfest-7d), with the same signatures, until it lands.
// Then this file goes and its importers switch to "@/lib/trade".

import { applyAction } from "@/lib/actions";
import type { Design, DestinationId, Stage, TradeCurve, TradePoint } from "@/lib/design";
import { analyze, ENGINES } from "@/lib/physics";

export type TradeSweep = { kind: "tank-stretch" | "engine-count"; stageIndex: number; clusterIndex?: number };

function reaches(design: Design, destination: DestinationId, payloadMassKg: number): boolean {
  try {
    return analyze({ ...design, destination, payloadMassKg }).verdict === "destination";
  } catch {
    return false;
  }
}

/** The most payload the design can carry to the destination, in kg: 0 if it can't get there even empty. */
export function maxPayloadKg(design: Design, destination: DestinationId = design.destination): number {
  if (!reaches(design, destination, 0)) return 0;
  let lo = 0;
  let hi = 1_000;
  while (hi < 1e8 && reaches(design, destination, hi)) {
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 10) {
    const mid = (lo + hi) / 2;
    if (reaches(design, destination, mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The real stage that your stage i grew from: the one with its name, else the same place counted from the top; -1 for a stage you added. */
export function realStageIndex(yours: Design, real: Design, i: number): number {
  const label = yours.stages[i]?.label;
  const named = real.stages.filter((s) => s.label === label).length === 1 && yours.stages.filter((s) => s.label === label).length === 1;
  if (named) return real.stages.findIndex((s) => s.label === label);
  const j = real.stages.length - (yours.stages.length - i);
  return j >= 0 && j < real.stages.length ? j : -1;
}

const engineMassKg = (stage: Stage) => stage.engines.reduce((sum, c) => sum + ENGINES[c.engine].massKg * c.count, 0);

/**
 * Your design with stage i's tanks set to the real stage's × x: built from the real stage every time, so
 * the stretch penalty never compounds across drags, with your engines (their mass traded for the real ones').
 * A stage you added has no real one; x then stretches it from where it is.
 */
export function stretchFromReal(yours: Design, real: Design, stageIndex: number, x: number): Design {
  const mine = yours.stages[stageIndex];
  const j = realStageIndex(yours, real, stageIndex);
  if (!mine || j < 0) return applyAction(yours, { type: "scale-tanks", stageIndex, factor: x });
  const base = real.stages[j];
  const rebuilt: Stage = {
    ...base,
    label: mine.label,
    propellant: mine.propellant,
    engines: mine.engines,
    dryMassKg: base.dryMassKg === undefined ? undefined : base.dryMassKg - engineMassKg(base) + engineMassKg(mine),
  };
  const withBase = { ...yours, stages: yours.stages.map((s, k) => (k === stageIndex ? rebuilt : s)) };
  return applyAction(withBase, { type: "scale-tanks", stageIndex, factor: x });
}

/** How far your stage i's tanks are stretched from the real stage's (1 = as built); 1 for a stage you added. */
export function stretchOf(yours: Design, real: Design, stageIndex: number): number {
  const j = realStageIndex(yours, real, stageIndex);
  const mine = yours.stages[stageIndex];
  return mine && j >= 0 ? mine.tankVolumeM3 / real.stages[j].tankVolumeM3 : 1;
}

function pointAt(design: Design, x: number, destination: DestinationId): TradePoint {
  let totalDeltaVMps = 0;
  let liftoffTwr = 0;
  try {
    ({ totalDeltaVMps, liftoffTwr } = analyze({ ...design, destination }));
  } catch {
    // An unflyable point plots as zero.
  }
  return { x, payloadKg: maxPayloadKg(design, destination), totalDeltaVMps, liftoffTwr };
}

function withBest(label: string, unit: string, realX: number, points: TradePoint[]): TradeCurve {
  const best = points.reduce((b, p) => (p.payloadKg > b.payloadKg ? p : b), points[0]);
  return { label, unit, points, realX, bestX: best?.x ?? realX };
}

/** Payload to the destination as one thing about the design changes, with where the real rocket and the best point sit. */
export function tradeCurve(design: Design, sweep: TradeSweep, options: { destination?: DestinationId; real?: Design } = {}): TradeCurve {
  const destination = options.destination ?? design.destination;
  const real = options.real ?? design;
  const stage = design.stages[sweep.stageIndex];
  if (!stage) return { label: "", unit: "×", points: [], realX: 1, bestX: 1 };
  if (sweep.kind === "tank-stretch") {
    const xs = Array.from({ length: 31 }, (_, i) => Math.round((0.5 + i * 0.05) * 100) / 100);
    const points = xs.map((x) => pointAt(stretchFromReal(design, real, sweep.stageIndex, x), x, destination));
    return withBest(`${stage.label} tank stretch`, "×", 1, points);
  }
  const clusterIndex = sweep.clusterIndex ?? 0;
  const cluster = stage.engines[clusterIndex];
  if (!cluster) return { label: "", unit: "engines", points: [], realX: 1, bestX: 1 };
  const j = realStageIndex(design, real, sweep.stageIndex);
  const realCount = (j >= 0 ? real.stages[j].engines[clusterIndex]?.count : undefined) ?? cluster.count;
  const top = Math.max(realCount * 2, cluster.count + 3, 4);
  const points = Array.from({ length: top }, (_, i) =>
    pointAt(applyAction(design, { type: "set-engines", stageIndex: sweep.stageIndex, clusterIndex, engine: cluster.engine, count: i + 1 }), i + 1, destination),
  );
  return withBest(`${stage.label} engine count`, "engines", realCount, points);
}
