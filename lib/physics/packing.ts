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
 * Real clusters that hang past their base, which packing alone would rule out: Saturn V's five
 * F-1s overhang the S-IC's 10.1 m tanks, under engine fairings. With nothing else beside them, on a
 * base at least that wide, that many always fit.
 */
const FLOWN_OVERHANG: Partial<Record<EngineId, { count: number; diameterM: number }>> = {
  "f-1": { count: 5, diameterM: 10.1 },
};

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

/** How many of `engine` alone fill a base `diameterM` across, or null when its nozzle isn't published. */
function slots(engine: EngineId, diameterM: number): number | null {
  const nozzle = NOZZLE_EXIT_DIAMETER_M[engine];
  if (!nozzle || !(diameterM > 0)) return null;
  const packed = circlesThatFit(diameterM / (nozzle * (1 + NOZZLE_GAP)));
  const flown = FLOWN_OVERHANG[engine];
  return flown && diameterM >= flown.diameterM - 1e-9 ? Math.max(packed, flown.count) : packed;
}

/**
 * Share of the base that `others` take: each engine takes 1 / (how many of its kind alone fill
 * the base). Engines with no published nozzle take none.
 */
function taken(others: EngineCluster[], diameterM: number): number {
  return others.reduce((sum, c) => {
    if (c.count <= 0) return sum;
    const n = slots(c.engine, diameterM);
    return n === null ? sum : sum + (n > 0 ? c.count / n : Infinity);
  }, 0);
}

/**
 * The most of `engine` that fit on a base `diameterM` across, beside the stage's other clusters.
 * Null when its nozzle isn't published.
 */
export function enginesThatFit(engine: EngineId, diameterM: number, others: EngineCluster[] = []): number | null {
  const alone = slots(engine, diameterM);
  if (alone === null) return null;
  const left = 1 - taken(others, diameterM);
  return left > 0 ? Math.floor(alone * left + 1e-9) : 0;
}

/** The narrowest base, in m, that seats `count` of `engine` beside `others`; null when its nozzle isn't published. */
export function baseFor(engine: EngineId, count: number, others: EngineCluster[] = []): number | null {
  if (NOZZLE_EXIT_DIAMETER_M[engine] === undefined) return null;
  const seats = (d: number) => (enginesThatFit(engine, d, others) ?? 0) >= count;
  let lo = 0;
  let hi = 1;
  while (!seats(hi)) {
    if (hi > 1_000) return null;
    hi *= 2;
  }
  while (hi - lo > 0.005) {
    const mid = (lo + hi) / 2;
    if (seats(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
