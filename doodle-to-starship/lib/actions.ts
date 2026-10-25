// Pure edits to a Design, used by the voice reviewer, the UI and the red pen's
// what-if checks. Every function returns a new Design and never mutates its input.

import type { Design, DesignAction, Stage } from "./design";

/** A new bottom stage holds this many times the current bottom stage's propellant. */
const ADDED_STAGE_SCALE = 2.5;
const ADDED_STAGE_MIN_ENGINES = 3;

export function applyAction(design: Design, action: DesignAction): Design {
  switch (action.type) {
    case "scale-tanks":
      if (!(action.factor > 0) || !Number.isFinite(action.factor)) return design;
      return updateStage(design, action.stageIndex, (stage) => scaleTanks(stage, action.factor));

    case "add-stage":
      if (design.stages.length === 0) return design;
      return { ...design, stages: [newBottomStage(design), ...design.stages] };

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

/** A booster under the current bottom stage: bigger tanks, the same engines, more of them. */
function newBottomStage(design: Design): Stage {
  const bottom = design.stages[0];
  return {
    label: design.stages.some((s) => s.label === "Booster") ? "Lower booster" : "Booster",
    engines: bottom.engines.map((cluster) => ({
      engine: cluster.engine,
      count: Math.max(ADDED_STAGE_MIN_ENGINES, Math.ceil(ADDED_STAGE_SCALE * cluster.count)),
    })),
    propellant: bottom.propellant,
    tankVolumeM3: bottom.tankVolumeM3 * ADDED_STAGE_SCALE,
  };
}
