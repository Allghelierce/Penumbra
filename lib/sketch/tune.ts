import type { Design } from "../design";
import { analyze } from "../physics";
import { MAX_ENGINES } from "./engines";

// Bells read at scale can over-power small rockets (a hopper at TWR 4). Real launchers lift off
// at 1.2–1.6 and upper stages light at 0.5+, so trim counts toward that using the real physics.

const MAX_LIFTOFF_TWR = 2.0;
const TARGET_LIFTOFF_TWR = 1.5;
const MIN_UPPER_TWR = 0.5;
const ITERATIONS = 6;

export interface TuneOptions {
  /** Per stage: the fewest engines allowed, e.g. one per drawn bell. */
  minEngines?: number[];
  /** Per stage: true when the count was written on the sketch, so it is left alone. */
  locked?: boolean[];
}

export function tuneEngines(design: Design, opts: TuneOptions = {}): Design {
  // Decide once: only a booster that starts above 2.0 gets trimmed, then it converges on 1.5.
  const trimBooster = analyze(design).liftoffTwr > MAX_LIFTOFF_TWR;
  let current = design;
  for (let pass = 0; pass < ITERATIONS; pass++) {
    const { liftoffTwr, stages } = analyze(current);
    const next = current.stages.map((stage, i) => {
      if (opts.locked?.[i]) return stage;
      const twr = i === 0 ? liftoffTwr : stages[i]?.twrAtIgnition;
      if (!Number.isFinite(twr) || twr <= 0) return stage;
      // Upper stages get the fewest engines that still light at 0.5.
      if (i === 0 && !trimBooster) return stage;
      const factor = (i === 0 ? TARGET_LIFTOFF_TWR : MIN_UPPER_TWR) / twr;
      const min = Math.max(1, opts.minEngines?.[i] ?? 1);
      const engines = stage.engines.map((cluster) => {
        const exact = cluster.count * factor;
        const count = i === 0 ? Math.round(exact) : Math.ceil(exact - 1e-9);
        return { ...cluster, count: Math.min(MAX_ENGINES, Math.max(min, count)) };
      });
      return engines.every((c, k) => c.count === stage.engines[k].count) ? stage : { ...stage, engines };
    });
    if (next.every((stage, i) => stage === current.stages[i])) break;
    current = { ...current, stages: next };
  }
  return current;
}
