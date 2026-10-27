// Pure edits to a Design, used by the voice reviewer, the UI and the red pen's
// what-if checks. Every function returns a new Design and never mutates its input.

import type { Design, DesignAction, EngineCluster, Stage } from "./design";
import { analyze, ENGINES } from "./physics";

/** A new bottom stage holds this many times the current bottom stage's propellant. */
const ADDED_STAGE_SCALE = 2.5;
const ADDED_STAGE_MIN_ENGINES = 3;
/** The new booster gets enough engines for the whole stack to lift off at this thrust-to-weight... */
const ADDED_STAGE_TWR = 1.3;
/** ...but no more than this many (Super Heavy flies 33), unless the old 2.5× rule already gave more. */
const ADDED_STAGE_MAX_ENGINES = 40;

/** Share of a stage's structure that doesn't grow with its tanks: thrust structure, avionics, interstage. */
const FIXED_STRUCTURE = 0.15;
/** Past this stretch, longer tanks need disproportionately heavier walls and stiffening... */
const STRETCH_PENALTY_FROM = 1.4;
/** ...growing with the square of the extra stretch. */
const STRETCH_PENALTY = 1.5;

export function applyAction(design: Design, action: DesignAction): Design {
  switch (action.type) {
    case "scale-tanks":
      if (!(action.factor > 0) || !Number.isFinite(action.factor)) return design;
      return updateStage(design, action.stageIndex, (stage) => scaleTanks(stage, action.factor));

    case "add-stage":
      if (design.stages.length === 0) return design;
      return withNewBottomStage(design);

    case "remove-stage":
      if (design.stages.length <= 1 || !hasStage(design, action.stageIndex)) return design;
      return { ...design, stages: design.stages.filter((_, i) => i !== action.stageIndex) };

    case "set-engines":
      return updateStage(design, action.stageIndex, (stage) => setEngines(stage, action));

    case "set-payload":
      if (!(action.payloadMassKg >= 0)) return design;
      return { ...design, payloadMassKg: action.payloadMassKg };

    case "set-recover":
      if (!design.stages[action.stageIndex]) return design;
      return {
        ...design,
        stages: design.stages.map((stage, i) => (i === action.stageIndex ? { ...stage, recover: action.recover } : stage)),
      };

    case "set-destination":
      return { ...design, destination: action.destination };

    case "launch":
    case "review":
      return design;
  }
}

function hasStage(design: Design, index: number) {
  return Number.isInteger(index) && index >= 0 && index < design.stages.length;
}

function updateStage(design: Design, index: number, update: (stage: Stage) => Stage): Design {
  if (!hasStage(design, index)) return design;
  return { ...design, stages: design.stages.map((stage, i) => (i === index ? update(stage) : stage)) };
}

/**
 * Stretches (or shrinks) a stage's tanks. A stated dry mass grows with them, but only its
 * structure does (the engines stay the same), and past 1.4× the walls get disproportionately
 * heavier. Without a stated dry mass the physics estimates structure from the propellant.
 * Apply stretches to the as-built design, not on top of each other, so the penalty is right.
 */
function scaleTanks(stage: Stage, factor: number): Stage {
  if (stage.dryMassKg === undefined) return { ...stage, tankVolumeM3: stage.tankVolumeM3 * factor };
  const engines = engineMassKg(stage.engines);
  const structure = Math.max(0, stage.dryMassKg - engines);
  return { ...stage, tankVolumeM3: stage.tankVolumeM3 * factor, dryMassKg: engines + structure * structureScale(factor) };
}

/** How a stage's structural mass scales when its tanks are stretched by `factor`. */
export function structureScale(factor: number): number {
  const proportional = FIXED_STRUCTURE + (1 - FIXED_STRUCTURE) * factor;
  const over = Math.max(0, factor - STRETCH_PENALTY_FROM);
  return proportional * (1 + STRETCH_PENALTY * over * over);
}

/**
 * Replaces a stage's engines: all of them, or with `clusterIndex` just that cluster (count 0
 * removes it, but never the stage's last). A stated dry mass trades the old engines' mass for
 * the new ones'.
 */
function setEngines(stage: Stage, action: Extract<DesignAction, { type: "set-engines" }>): Stage {
  const count = Math.max(0, Math.round(action.count));
  let engines: EngineCluster[];
  if (action.clusterIndex === undefined) {
    engines = [{ engine: action.engine, count: Math.max(1, count) }];
  } else {
    const i = action.clusterIndex;
    if (!Number.isInteger(i) || i < 0 || i >= stage.engines.length) return stage;
    const last = stage.engines.length === 1;
    engines =
      count === 0 && !last
        ? stage.engines.filter((_, j) => j !== i)
        : stage.engines.map((c, j) => (j === i ? { engine: action.engine, count: Math.max(1, count) } : c));
  }
  if (stage.dryMassKg === undefined) return { ...stage, engines };
  const dryMassKg = Math.max(1, stage.dryMassKg - engineMassKg(stage.engines) + engineMassKg(engines));
  return { ...stage, engines, dryMassKg };
}

function engineMassKg(engines: EngineCluster[]): number {
  return engines.reduce((sum, c) => sum + ENGINES[c.engine].massKg * c.count, 0);
}

/**
 * A booster under the current bottom stage: bigger tanks and the same engines, with the
 * fewest engines (at least 3, at most 40) that lift the whole new stack at TWR 1.3.
 */
function withNewBottomStage(design: Design): Design {
  const bottom = design.stages[0];
  const main = bottom.engines.reduce((best, c, i, all) => (c.count > all[best].count ? i : best), 0);
  const withCount = (count: number): Design => {
    const booster: Stage = {
      label: design.stages.some((s) => s.label === "Booster") ? "Lower booster" : "Booster",
      engines: bottom.engines.map((cluster, i) => ({
        engine: cluster.engine,
        count: i === main ? count : Math.max(1, Math.ceil(ADDED_STAGE_SCALE * cluster.count)),
      })),
      propellant: bottom.propellant,
      tankVolumeM3: bottom.tankVolumeM3 * ADDED_STAGE_SCALE,
    };
    return { ...design, stages: [booster, ...design.stages] };
  };

  const cap = Math.max(ADDED_STAGE_MAX_ENGINES, Math.ceil(ADDED_STAGE_SCALE * bottom.engines[main].count));
  // More engines always raise liftoff TWR (each adds more thrust than weight), so bisect.
  if (analyze(withCount(cap)).liftoffTwr < ADDED_STAGE_TWR) return withCount(cap);
  let lo = ADDED_STAGE_MIN_ENGINES - 1;
  let hi = cap;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (analyze(withCount(mid)).liftoffTwr >= ADDED_STAGE_TWR) hi = mid;
    else lo = mid;
  }
  return withCount(hi);
}
