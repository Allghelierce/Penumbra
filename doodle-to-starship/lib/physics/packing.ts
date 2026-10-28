// How many engines fit side by side on a stage's base: nozzle exits plus a gap, packed into the
// stage's diameter as tightly as equal circles can be.

import type { EngineCluster, EngineId } from "../design";
import { NOZZLE_EXIT_DIAMETER_M } from "./data";

/**
 * Gap around each nozzle, as a share of its exit diameter. Falcon 9's nine Merlins on 3.7 m allow
 * up to 11% and rule out a tenth above 5.5%; Super Heavy's 33 Raptors on 9 m allow up to 6.7% and
 * rule out a 34th above 4.7%. 6% fits both.
 */
export const NOZZLE_GAP = 0.06;

/**
 * Container radius over circle radius for the densest known packing of n equal circles in a
 * circle, n = 1 to 40. https://www.packomania.com/cci/cci.html
 */
const PACKING_RATIO = [
  1, 2, 2.1547, 2.4142, 2.7013, 3, 3, 3.3048, 3.6131, 3.813, 3.9238, 4.0296, 4.2361, 4.3284, 4.5214, 4.6154, 4.792, 4.8637,
  4.8637, 5.1223, 5.2523, 5.4397, 5.5452, 5.6517, 5.7528, 5.8282, 5.9064, 6.0149, 6.1386, 6.1977, 6.2915, 6.4295, 6.4867,
  6.611, 6.6972, 6.7468, 6.7588, 6.9619, 7.0579, 7.1238,
];

/** The most equal circles that fit in a circle `ratio` times their diameter. */
function circlesThatFit(ratio: number): number {
  const n = PACKING_RATIO.findIndex((r) => r > ratio + 1e-9);
  if (n >= 0) return n;
  // Past the table, by area at the table's last density (a slight undercount for big bases).
  const last = PACKING_RATIO.length;
  return Math.floor(last * (ratio / PACKING_RATIO[last - 1]) ** 2);
}

/**
 * The most of `engine` that fit on a base `diameterM` across, beside the stage's other clusters
 * (which take room in proportion to their nozzle area). Null when its nozzle isn't published.
 */
export function enginesThatFit(engine: EngineId, diameterM: number, others: EngineCluster[] = []): number | null {
  const nozzle = NOZZLE_EXIT_DIAMETER_M[engine];
  if (!nozzle || !(diameterM > 0)) return null;
  const taken = others.reduce((sum, c) => {
    const d = NOZZLE_EXIT_DIAMETER_M[c.engine];
    return sum + (d ? c.count * (d / nozzle) ** 2 : 0);
  }, 0);
  return Math.max(0, Math.floor(circlesThatFit(diameterM / (nozzle * (1 + NOZZLE_GAP))) - taken + 1e-9));
}
