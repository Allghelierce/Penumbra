"use client";

import MissionReport from "@/components/MissionReport";
import { MISSION_REPORTS } from "@/lib/mission-reports";
import { HISTORIC_MISSIONS } from "@/lib/missions";

const mission = HISTORIC_MISSIONS.find((m) => m.id === "crs7") ?? HISTORIC_MISSIONS[0];
const trace = { points: [], events: [], outcome: "suborbital" as const, maxAltitudeKm: Math.max(...mission.timeline.map((p) => p.altitudeKm)) };

export default function ReportDev() {
  return <MissionReport mission={mission} report={MISSION_REPORTS[mission.id]} trace={trace} onClose={() => {}} />;
}
