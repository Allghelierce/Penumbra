import type { DestinationId } from "@/lib/design";

// The layers of the atmosphere and the marks above it, shared by the sky, the altitude
// ladder and the crossing log. Altitudes in km above the pad.

export interface Layer {
  name: string;
  from: number;
  to: number;
  /** Ladder segment color. */
  color: string;
}

export const LAYERS: Layer[] = [
  { name: "Troposphere", from: 0, to: 12, color: "#5d93c9" },
  { name: "Stratosphere", from: 12, to: 50, color: "#3c6fa6" },
  { name: "Mesosphere", from: 50, to: 80, color: "#5b5fa8" },
  { name: "Thermosphere", from: 80, to: 700, color: "#4cc38a" },
  { name: "Exosphere", from: 700, to: Infinity, color: "#8a97a8" },
];

export interface Boundary {
  km: number;
  label: string;
  /** Log lines for crossing it going up and coming back down. */
  up: string;
  down: string;
  /** The Kármán line: space begins. */
  hero?: boolean;
}

export const BOUNDARIES: Boundary[] = [
  { km: 12, label: "Tropopause", up: "Left the troposphere", down: "Back in the troposphere" },
  { km: 25, label: "Ozone layer", up: "Through the ozone layer", down: "Back through the ozone layer" },
  { km: 50, label: "Stratopause", up: "Into the mesosphere", down: "Back in the stratosphere" },
  { km: 80, label: "Mesopause", up: "Into the thermosphere", down: "Back in the mesosphere" },
  { km: 100, label: "Kármán line", up: "Crossed the Kármán line", down: "Fell back below the Kármán line", hero: true },
  { km: 408, label: "ISS", up: "Passed the ISS's altitude", down: "Back below the ISS's altitude" },
  { km: 700, label: "Exobase", up: "Into the exosphere", down: "Back below the exosphere" },
];

/** Marks far above, shown at the top of the ladder when the mission is headed there. */
export const FAR_MARKS: { km: number; label: string }[] = [
  { km: 35_786, label: "GEO" },
  { km: 384_400, label: "Moon" },
];

/** Top of the ladder: room for the destination, log-compressed above 120 km. */
export function ladderTop(dest: DestinationId): number {
  if (dest === "leo") return 2_000;
  if (dest === "gto") return 40_000;
  return 400_000;
}

const LINEAR_KM = 120;
const LINEAR_SHARE = 0.62;

/** Position on the ladder, 0 (pad) to 1 (top): linear to 120 km, then logarithmic. */
export function ladderPos(km: number, top: number): number {
  if (km <= 0) return 0;
  if (km <= LINEAR_KM) return (km / LINEAR_KM) * LINEAR_SHARE;
  const k = Math.log10(km / LINEAR_KM) / Math.log10(top / LINEAR_KM);
  return Math.min(1, LINEAR_SHARE + (1 - LINEAR_SHARE) * k);
}

export function layerAt(km: number): Layer {
  return LAYERS.find((l) => km < l.to) ?? LAYERS[LAYERS.length - 1];
}
