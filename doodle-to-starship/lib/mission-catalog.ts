import type { HistoricMission } from "./design";
import { HISTORIC_MISSIONS } from "./missions";
import { MORE_MISSIONS } from "./missions-more";
import { SUCCESS_MISSIONS } from "./missions-success";

/** Every replayable flight, grouped by vehicle family and in date order within each. */
export const ALL_MISSIONS: HistoricMission[] = [...HISTORIC_MISSIONS, ...SUCCESS_MISSIONS, ...MORE_MISSIONS].sort(
  (a, b) => a.sketchId.localeCompare(b.sketchId) || a.date.localeCompare(b.date),
);
