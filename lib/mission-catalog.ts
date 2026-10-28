import type { HistoricMission } from "./design";
import { HISTORIC_MISSIONS } from "./missions";
import { CLASSIC_MISSIONS } from "./missions-classic";
import { MORE_MISSIONS } from "./missions-more";
import { SUCCESS_MISSIONS } from "./missions-success";

/** Every replayable flight, grouped by the real rocket it's listed under and in date order within each. */
export const ALL_MISSIONS: HistoricMission[] = [...HISTORIC_MISSIONS, ...SUCCESS_MISSIONS, ...MORE_MISSIONS, ...CLASSIC_MISSIONS].sort(
  (a, b) => a.rocket.localeCompare(b.rocket) || a.date.localeCompare(b.date),
);
