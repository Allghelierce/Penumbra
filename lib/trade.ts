// Trade-offs on a real rocket: how much it can carry, and how that changes as one thing about
// it changes (a stage's tanks, or its engine count). Every number is a rerun of analyze().

import { applyAction, structureScale } from "./actions";
import type { Design, DestinationId, EngineCluster, Stage, TradeCurve, TradePoint } from "./design";
import { analyze, ENGINES, enginesThatFit } from "./physics";

export type TradeSweep = { kind: "tank-stretch" | "engine-count"; stageIndex: number; clusterIndex?: number };

/** Where an engine sweep stops because no more of the engine fit on the stage's base. */
export interface FitLimit {
  x: number;
  engine: string;
  diameterM: number;
}

/** A trade curve, plus the base-fit limit when that is what ends an engine sweep. */
export type SweptCurve = TradeCurve & { limit?: FitLimit };

const STRETCH_FROM = 0.6;
const STRETCH_TO = 1.8;
const STRETCH_STEP = 0.05;
/** An engine sweep never runs past this many, however small the engine. */
const MAX_SWEEP_ENGINES = 60;

/**
 * Real launchers keep a margin at liftoff for steering and an engine out; the Saturn V left
 * the pad at about 1.15. Payload ratings stop here rather than at a barely-hovering 1.0.
 */
export const MIN_LIFTOFF_TWR = 1.15;

/**
 * The heaviest payload that still reaches the destination while lifting off at a safe
 * thrust-to-weight (0 if it can't make it even empty).
 */
export function maxPayloadKg(design: Design, destination: DestinationId = design.destination): number {
  const reaches = (kg: number) => {
    const a = analyze({ ...design, destination, payloadMassKg: kg });
    return a.liftoffTwr >= MIN_LIFTOFF_TWR && a.marginMps >= 0;
  };
  if (!reaches(0)) return 0;
  // Double until it fails, then bisect to about a kilogram.
  let lo = 0;
  let hi = 1_000;
  while (reaches(hi)) {
    lo = hi;
    hi *= 2;
    if (hi > 1e9) return lo;
  }
  while (hi - lo > Math.max(1, lo * 1e-5)) {
    const mid = (lo + hi) / 2;
    if (reaches(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo);
}

/**
 * The real rocket's stage that `yours.stages[stageIndex]` was made from: matched by label, else
 * by position from the top (a booster added underneath shifts the indices from the bottom).
 */
export function realStageFor(yours: Design, real: Design, stageIndex: number): Stage | null {
  const mine = yours.stages[stageIndex];
  if (!mine) return null;
  const byLabel = real.stages.find((s) => s.label === mine.label);
  if (byLabel) return byLabel;
  const fromTop = yours.stages.length - 1 - stageIndex;
  return real.stages[real.stages.length - 1 - fromTop] ?? null;
}

/**
 * Your design with one stage's tanks set to `x` times the REAL stage's: real structure scaled
 * by structureScale(x), your engines (and their mass). Building every stretch from the real
 * stage keeps the stretch penalty right however many drags got you here.
 */
export function stretchFromReal(yours: Design, real: Design, stageIndex: number, x: number): Design {
  const mine = yours.stages[stageIndex];
  const base = realStageFor(yours, real, stageIndex);
  if (!mine || !base || !(x > 0)) return yours;
  const stretched: Stage = { ...mine, tankVolumeM3: base.tankVolumeM3 * x };
  if (base.dryMassKg !== undefined) {
    const structure = Math.max(0, base.dryMassKg - engineMassKg(base.engines));
    stretched.dryMassKg = structure * structureScale(x) + engineMassKg(mine.engines);
  } else {
    delete stretched.dryMassKg;
  }
  return { ...yours, stages: yours.stages.map((s, i) => (i === stageIndex ? stretched : s)) };
}

/**
 * Payload against one change: a stage's tank stretch (x = times the real tanks, so the real
 * rocket sits at 1) or an engine cluster's count (x = engines), which stops at as many as fit on
 * the stage's base. realX marks the real rocket, bestX the most payload.
 */
export function tradeCurve(
  design: Design,
  sweep: TradeSweep,
  options: { destination?: DestinationId; real?: Design } = {},
): SweptCurve {
  const destination = options.destination ?? design.destination;
  const real = options.real ?? design;
  const stage = design.stages[sweep.stageIndex];
  if (!stage) return { label: "", unit: "", points: [], realX: 0, bestX: 0 };

  let xs: number[];
  let build: (x: number) => Design;
  let realX: number;
  let label: string;
  let unit: string;
  let limit: FitLimit | undefined;
  if (sweep.kind === "tank-stretch") {
    const steps = Math.round((STRETCH_TO - STRETCH_FROM) / STRETCH_STEP);
    xs = Array.from({ length: steps + 1 }, (_, k) => round2(STRETCH_FROM + k * STRETCH_STEP));
    build = (x) => stretchFromReal(design, real, sweep.stageIndex, x);
    realX = 1;
    label = `${stage.label} tank stretch`;
    unit = "×";
  } else {
    const cluster = sweep.clusterIndex ?? mainCluster(stage.engines);
    const engine = stage.engines[cluster];
    if (!engine) return { label: "", unit: "", points: [], realX: 0, bestX: 0 };
    const realStage = realStageFor(design, real, sweep.stageIndex);
    const realCount = realStage?.engines.find((c) => c.engine === engine.engine)?.count;
    realX = realCount ?? engine.count;
    // Up to as many as fit on the stage's base beside its other engines, the same limit the red
    // pen holds a design to. Engines with no published nozzle size sweep to twice the real count.
    const baseM = stage.diameterM ?? design.diameterM;
    const fits = enginesThatFit(engine.engine, baseM, stage.engines.filter((_, i) => i !== cluster));
    const top = fits === null ? Math.max(realX * 2, engine.count + 3, 4) : Math.min(fits, MAX_SWEEP_ENGINES);
    if (fits !== null && top === fits) limit = { x: fits, engine: ENGINES[engine.engine].name, diameterM: baseM };
    xs = Array.from({ length: top }, (_, k) => k + 1);
    build = (x) =>
      applyAction(design, { type: "set-engines", stageIndex: sweep.stageIndex, clusterIndex: cluster, engine: engine.engine, count: x });
    label = `${stage.label} ${ENGINES[engine.engine].name} engines`;
    unit = "engines";
  }

  const points: TradePoint[] = xs.map((x) => {
    const built = build(x);
    const payloadKg = maxPayloadKg(built, destination);
    const at = analyze({ ...built, destination, payloadMassKg: payloadKg });
    return { x, payloadKg, totalDeltaVMps: at.totalDeltaVMps, liftoffTwr: at.liftoffTwr };
  });
  if (points.length === 0) return { label, unit, points, realX, bestX: realX, ...(limit && { limit }) };
  // The most payload; on a tie, the point nearest the real rocket.
  const best = points.reduce((b, p) =>
    p.payloadKg > b.payloadKg || (p.payloadKg === b.payloadKg && Math.abs(p.x - realX) < Math.abs(b.x - realX)) ? p : b,
  );
  return { label, unit, points, realX, bestX: best.x, ...(limit && { limit }) };
}

/** Payload given up by landing the stages that recover, compared with throwing them away. */
export function recoveryCostKg(design: Design, destination: DestinationId = design.destination): number {
  if (!design.stages.some((s) => s.recover)) return 0;
  const expended = { ...design, stages: design.stages.map((s) => ({ ...s, recover: false })) };
  return Math.max(0, maxPayloadKg(expended, destination) - maxPayloadKg(design, destination));
}

/**
 * One to three plain sentences for the chart caption: where the real rocket sits, why the best
 * point is where it is (including when no more engines fit), and (given the design) what landing
 * its recovered stages costs.
 */
export function explainCurve(curve: SweptCurve, context?: { design: Design; destination?: DestinationId }): string {
  const text = explainShape(curve);
  if (!context || !text) return text;
  const recovered = context.design.stages.filter((s) => s.recover).map((s) => s.label);
  const cost = recoveryCostKg(context.design, context.destination);
  if (recovered.length === 0 || cost <= 0) return text;
  const which = recovered.length === 1 ? `the ${recovered[0]}` : `the ${recovered.slice(0, -1).join(", ")} and the ${recovered.at(-1)}`;
  return `${text} Landing ${which} costs about ${capacityText(cost)} of payload.`;
}

function explainShape(curve: SweptCurve): string {
  const limit = curve.limit;
  const fit = limit ? fitClause(limit) : "";
  if (curve.points.length === 0) return limit ? `${capitalize(fit)}.` : "";
  const at = (x: number) => curve.points.reduce((b, p) => (Math.abs(p.x - x) < Math.abs(b.x - x) ? p : b));
  const real = at(curve.realX);
  const best = at(curve.bestX);
  const stretch = curve.unit === "×";
  const fmtX = (x: number) => (stretch ? `${x.toFixed(2)}×` : x === 1 ? "1 engine" : `${x} engines`);
  if (best.payloadKg <= 0) return "No setting along this line gets a payload there. Try a closer destination or another change.";
  if (limit && curve.points.length === 1) return `${capitalize(fit)}, so there's nothing to trade: it carries ${capacityText(real.payloadKg)}.`;
  // The best point is the last engine that fits, not a peak.
  const atLimit = limit !== undefined && curve.bestX === limit.x;
  const atEnd = curve.bestX === curve.points[curve.points.length - 1].x;

  const gain = real.payloadKg > 0 ? (best.payloadKg - real.payloadKg) / real.payloadKg : Infinity;
  if (Math.abs(curve.bestX - curve.realX) < (stretch ? 0.051 : 1) || gain < 0.02) {
    if (atLimit) return `The real rocket already carries the most: ${capacityText(real.payloadKg)} at ${fmtX(curve.realX)}. Fewer carry less, and ${fit}.`;
    return `The real rocket already sits at the peak: ${capacityText(real.payloadKg)} at ${fmtX(curve.realX)}. Change it either way and it carries less.`;
  }
  // The percentage comes from the figures as shown, so a caption's numbers agree with each other.
  const shownGain = (shownKg(best.payloadKg) - shownKg(real.payloadKg)) / shownKg(real.payloadKg);
  const more = Number.isFinite(gain) ? `${capacityText(best.payloadKg)}, ${Math.round(shownGain * 100)}% more than the real ${capacityText(real.payloadKg)}` : capacityText(best.payloadKg);
  const why = stretch
    ? curve.bestX > curve.realX
      ? `More propellant adds speed until the heavier rocket lifts off at thrust-to-weight ${best.liftoffTwr.toFixed(2)}; past that it can't leave the pad safely.`
      : `A smaller stage leaves more of the work to the stages that do it more efficiently; shrink it further and there isn't enough speed left.`
    : curve.bestX > curve.realX
      ? atLimit
        ? `More engines cut the time spent fighting gravity, and ${fit}.`
        : atEnd
          ? `More engines cut the time spent fighting gravity.`
          : `More engines cut the time spent fighting gravity; past that, each one is weight it barely needs.`
      : `Fewer engines save weight while it still lifts off at thrust-to-weight ${best.liftoffTwr.toFixed(2)}; any fewer and it's too sluggish.`;
  return `The most payload is at ${fmtX(curve.bestX)}: ${more}. ${why}`;
}

/** e.g. "9 Merlin 1D engines are all that fit on its 3.7 m base". */
function fitClause({ x, engine, diameterM }: FitLimit): string {
  const base = `its ${Number.isInteger(diameterM) ? diameterM : diameterM.toFixed(1)} m base`;
  if (x === 0) return `not one ${engine} fits on ${base}`;
  if (x === 1) return `only one ${engine} fits on ${base}`;
  return `${x} ${engine} engines are all that fit on ${base}`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function mainCluster(engines: EngineCluster[]): number {
  return engines.reduce((best, c, i, all) => (c.count > all[best].count ? i : best), 0);
}

function engineMassKg(engines: EngineCluster[]): number {
  return engines.reduce((sum, c) => sum + ENGINES[c.engine].massKg * c.count, 0);
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}

/**
 * The payload as it's shown, in kg: rounded down to whole tonnes from 100 t, to a tenth of a
 * tonne below that, to the kilogram under a tonne. Never up, so a capacity on screen is one the
 * rocket can carry: show 23.2 t for a 23.17 t maximum and typing 23.2 t would fail the check.
 */
export function shownKg(kg: number): number {
  const safe = Math.max(0, kg);
  if (safe >= 100_000) return Math.floor(safe / 1000) * 1000;
  if (safe >= 1_000) return Math.floor(safe / 100) * 100;
  return Math.floor(safe);
}

/** A payload capacity for people to read, e.g. "23.1 t", "120 t" or "354 kg", always rounded down (see shownKg). */
export function capacityText(kg: number): string {
  const shown = shownKg(kg);
  if (shown >= 100_000) return `${(shown / 1000).toLocaleString("en-US")} t`;
  if (shown >= 1_000) return `${(shown / 1000).toFixed(1)} t`;
  return `${shown} kg`;
}
