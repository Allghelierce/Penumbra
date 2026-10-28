// Shared km/s formatting, so every number on screen agrees with the others next to it.

/** Speeds in tenths of a km/s, the precision everything is shown at. */
function tenths(mps: number) {
  return Math.round(mps / 100);
}

/** e.g. 12_170 → "12.2". */
export function km(mps: number) {
  return (tenths(mps) / 10).toFixed(1);
}

/** How far short `total` is, worked out from the rounded figures shown beside it, but never "0.0". */
export function kmShort(totalMps: number, requiredMps: number) {
  return (Math.max(1, tenths(requiredMps) - tenths(totalMps)) / 10).toFixed(1);
}

/** How much `total` has to spare, worked out from the rounded figures shown beside it. */
export function kmSpare(totalMps: number, requiredMps: number) {
  return (Math.max(0, tenths(totalMps) - tenths(requiredMps)) / 10).toFixed(1);
}
