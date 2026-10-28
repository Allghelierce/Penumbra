// A napkin is 120 m tall, so a bell drawn a few millimetres wide is several metres across at
// scale. Read each drawn bell as a cluster of real engines that would fill the same area.

/** Exit diameter of a Raptor-class sea-level bell, in metres. Drawn bells are measured against it. */
export const REFERENCE_BELL_M = 1.3;
/** How much of a round base a ring of bells covers: Super Heavy fits 33 Raptors on 9 m. */
const BASE_PACKING = 0.69;
/** Per stage. Super Heavy has 33. */
export const MAX_ENGINES = 40;

const clampCount = (n: number) => Math.min(MAX_ENGINES, Math.max(1, Math.round(n)));

/** Real engines represented by bells drawn at these widths (metres at napkin scale). */
export function enginesForBells(bellWidthsM: number[]): number {
  return clampCount(
    bellWidthsM.reduce((sum, w) => sum + Math.max(1, Math.round((Math.max(w, 0) / REFERENCE_BELL_M) ** 2)), 0),
  );
}

/** Engines that fit under a base this wide, for a stage drawn without bells. */
export function enginesForBase(diameterM: number): number {
  return clampCount(BASE_PACKING * (Math.max(diameterM, 0) / REFERENCE_BELL_M) ** 2);
}

/** Upper stages are rarely drawn with bells: give them a few vacuum engines, scaled from the booster. */
export function upperStageEngines(boosterEngines: number): number {
  return Math.min(6, Math.max(1, Math.round(boosterEngines / 3)));
}
