// Pure edits to a Design, used by the voice reviewer, the UI and the red pen's
// what-if checks. Every function returns a new Design and never mutates its input.

import type { Design, DesignAction, Stage } from "./design";
import { analyze } from "./physics";

/** A new bottom stage holds this many times the current bottom stage's propellant. */
const ADDED_STAGE_SCALE = 2.5;
const ADDED_STAGE_MIN_ENGINES = 3;
/** The new booster gets enough engines for the whole stack to lift off at this thrust-to-weight... */
const ADDED_STAGE_TWR = 1.3;
/** ...but no more than this many (Super Heavy flies 33), unless the old 2.5× rule already gave more. */
const ADDED_STAGE_MAX_ENGINES = 40;

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
      return updateStage(design, action.stageIndex, (stage) => ({
        ...stage,
        engines: [{ engine: action.engine, count: Math.max(1, Math.round(action.count)) }],
      }));

    case "set-payload":
      if (!(action.payloadMassKg >= 0)) return design;
      return { ...design, payloadMassKg: action.payloadMassKg };

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

function scaleTanks(stage: Stage, factor: number): Stage {
  return {
    ...stage,
    tankVolumeM3: stage.tankVolumeM3 * factor,
    ...(stage.dryMassKg !== undefined && { dryMassKg: stage.dryMassKg * factor }),
  };
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
