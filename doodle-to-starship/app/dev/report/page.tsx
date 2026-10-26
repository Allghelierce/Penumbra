"use client";

import MissionReport from "@/components/MissionReport";
import { MISSION_REPORTS } from "@/lib/mission-reports";
import { HISTORIC_MISSIONS } from "@/lib/missions";

const mission = HISTORIC_MISSIONS.find((m) => m.id === "crs7") ?? HISTORIC_MISSIONS[0];
const trace = { points: [], events: [], outcome: "suborbital" as const, maxAltitudeKm: Math.max(...mission.timeline.map((p) => p.altitudeKm)) };

export default function ReportDev() {
  return <MissionReport mission={mission} report={MISSION_REPORTS[mission.id]} trace={trace} photos={[{ url: "/renders/1583b49b26b3c2f4f449.jpg", caption: "Stand-in photo for layout", credit: "Dev fixture", license: "n/a", pageUrl: "https://example.com" }]} onClose={() => {}} />;
}
