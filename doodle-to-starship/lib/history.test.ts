import { describe, expect, it } from "vitest";

import type { HistoricMission, RedPenMark } from "./design";
import { historicReading, historicReview, historicTrace } from "./history";
import { HISTORIC_MISSIONS } from "./missions";

/** A local stand-in until lib/missions.ts lands; the shape is HistoricMission's. */
const crs7: HistoricMission = {
  id: "crs7",
  sketchId: "two-stage-orbiter",
  vehicle: "Falcon 9",
  mission: "CRS-7",
  date: "2015-06-28",
  site: "Cape Canaveral SLC-40",
  destination: "leo",
  outcome: "lost",
  failure: {
    part: "tank",
    stageIndex: 1,
    label: "Stage 2 helium strut",
    detail: "A strut holding a helium bottle in the second-stage LOX tank snapped",
  },
  timeline: [
    { tS: 0, altitudeKm: 0, speedMps: 0, kind: "liftoff", event: "Liftoff" },
    { tS: 70, altitudeKm: 11, speedMps: 400, kind: "max-q", event: "Max-Q" },
    { tS: 120, altitudeKm: 35, speedMps: 1_400 },
    {
      tS: 139,
      altitudeKm: 45,
      speedMps: 1_800,
      kind: "breakup",
      event: "Vehicle breakup",
      quote: { speaker: "Launch commentator", text: "We appear to have had a failure", source: "SpaceX webcast" },
    },
    { tS: 150, altitudeKm: 47, speedMps: 1_500 },
  ],
  rootCause: "A cast-steel strut failed below its rated load.",
  whatChanged: "Struts replaced and individually tested.",
  returnToFlight: "Orbcomm OG2, 21 Dec 2015: first landing of an orbital booster",
  stats: [{ label: "Breakup", value: "T+139 s", meaning: "Two minutes into a ten-minute ride" }],
  sources: [{ title: "SpaceX CRS-7 investigation update", url: "https://www.spacex.com/" }],
};

const success: HistoricMission = {
  ...crs7,
  id: "ok",
  outcome: "success",
  failure: null,
  timeline: [
    { tS: 0, altitudeKm: 0, speedMps: 0, kind: "liftoff", event: "Liftoff" },
    { tS: 160, altitudeKm: 70, speedMps: 2_300, kind: "stage-sep", event: "Stage separation" },
    { tS: 540, altitudeKm: 200, speedMps: 7_800, kind: "orbit", event: "Orbit" },
  ],
};

function onNapkin(m: RedPenMark) {
  const pts =
    m.kind === "arrow" || m.kind === "dimension"
      ? [m.from, m.to]
      : m.kind === "callout"
        ? [m.anchor, m.label]
        : m.kind === "ghost-line"
          ? m.points
          : m.kind === "circle"
            ? [m.center]
            : [
                [m.box[0], m.box[1]],
                [m.box[0] + m.box[2], m.box[1] + m.box[3]],
              ];
  for (const [x, y] of pts) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(1);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(1);
  }
}

describe("historicReading", () => {
  it("reads the stand-in sketch locally and names it for the real vehicle", () => {
    const reading = historicReading(crs7);
    expect(reading.design.name).toBe("Falcon 9");
    expect(reading.design.destination).toBe("leo");
    expect(reading.parts.length).toBeGreaterThan(0);
  });
});

describe("historicReview", () => {
  const reading = historicReading(crs7);
  const review = historicReview(crs7, reading);

  it("draws only the minimum: dimensions, then the failed part's outline, its name and ①", () => {
    expect(review.marks.map((m) => m.kind)).toEqual(["dimension", "dimension", "outline", "callout", "arrow"]);
    const [, , outline, label, arrow] = review.marks;
    expect(label.note).toBe("Stage 2 helium strut");
    // A few words on the napkin; the full story is in the summary.
    expect(arrow.note).toBe("A strut holding…");
    expect(arrow.note.split(" ").length).toBeLessThanOrEqual(5);
    // The outline wraps the stage-2 tank the reader found.
    const tank = reading.parts.find((p) => p.kind === "tank" && p.stageIndex === 1);
    if (tank && outline.kind === "outline") {
      expect(outline.box[1]).toBeLessThanOrEqual(tank.box[1] + 1e-9);
      expect(outline.box[1] + outline.box[3]).toBeGreaterThanOrEqual(tank.box[1] + tank.box[3] - 1e-9);
    }
  });

  it("has exactly one issue mark, and everything stays on the napkin", () => {
    const issues = review.marks.filter((m) => m.kind === "arrow" || m.kind === "circle" || m.kind === "ghost-line");
    expect(issues).toHaveLength(1);
    review.marks.forEach(onNapkin);
    expect(review.summary).toBe(
      "Falcon 9, CRS-7: Stage 2 helium strut. A strut holding a helium bottle in the second-stage LOX tank snapped",
    );
  });

  it("draws only the dimensions for a flight that worked", () => {
    const ok = historicReview(success, historicReading(success));
    expect(ok.marks.every((m) => m.kind === "dimension")).toBe(true);
    expect(ok.summary).toBe("Falcon 9, CRS-7: flew as planned.");
  });
});

describe("historicTrace", () => {
  it("interpolates the real timeline to about 300 points and ends in breakup for a loss", () => {
    const trace = historicTrace(crs7);
    expect(trace.points).toHaveLength(300);
    expect(trace.points[0].tS).toBe(0);
    expect(trace.points.at(-1)!.tS).toBe(150);
    expect(trace.outcome).toBe("suborbital");
    expect(trace.maxAltitudeKm).toBe(47);
    // Halfway between T+120 (35 km) and T+139 (45 km).
    const mid = trace.points.reduce((best, p) => (Math.abs(p.tS - 129.5) < Math.abs(best.tS - 129.5) ? p : best));
    expect(mid.altitudeKm).toBeGreaterThan(38);
    expect(mid.altitudeKm).toBeLessThan(42);
  });

  it("turns entries with a kind into events, quoting recorded dialog", () => {
    const { events } = historicTrace(crs7);
    expect(events.map((e) => e.kind)).toEqual(["liftoff", "max-q", "breakup"]);
    expect(events[2].label).toBe('Launch commentator: "We appear to have had a failure"');
    expect(events[0].label).toBe("Liftoff");
  });

  it("counts stages from separations and calls a success orbit", () => {
    const trace = historicTrace(success);
    expect(trace.outcome).toBe("orbit");
    expect(trace.points[0].stageIndex).toBe(0);
    expect(trace.points.at(-1)!.stageIndex).toBe(1);
    expect(trace.maxAltitudeKm).toBe(200);
    for (let i = 1; i < trace.points.length; i++) {
      expect(trace.points[i].downrangeKm).toBeGreaterThanOrEqual(trace.points[i - 1].downrangeKm);
    }
  });
});

describe("the real missions", () => {
  const lastEvent: Record<string, string> = { "falcon1-f1": "impact", crs7: "breakup", ift1: "breakup" };

  it.each(HISTORIC_MISSIONS.map((m) => [m.id, m] as const))("%s: marks the failed part, fits its labels, ends right", (id, m) => {
    const reading = historicReading(m);
    const review = historicReview(m, reading);
    const trace = historicTrace(m);

    if (m.failure) {
      const failure = m.failure;
      const exact = reading.parts.filter(
        (p) => p.kind === failure.part && (failure.stageIndex === undefined || p.stageIndex === failure.stageIndex),
      );
      expect(exact.length).toBeGreaterThan(0);
      const label = review.marks.find((mk) => mk.kind === "callout");
      expect(label?.note).toBe(failure.label.split(/\s+/).length <= 4 ? failure.label : label?.note);
      expect(label?.note.endsWith("…") && failure.label.split(/\s+/).length <= 4).toBe(false);
      if (label?.kind === "callout") {
        const width = label.note.length * 0.012;
        const [x0, x1] = label.label[0] < label.anchor[0] ? [label.label[0] - width, label.label[0]] : [label.label[0], label.label[0] + width];
        expect(x0).toBeGreaterThanOrEqual(0);
        expect(x1).toBeLessThanOrEqual(1);
      }
    }
    review.marks.forEach(onNapkin);
    if (lastEvent[id]) expect(trace.events.at(-1)?.kind).toBe(lastEvent[id]);
    expect(trace.outcome).toBe(m.outcome === "lost" ? "suborbital" : "orbit");
    expect(trace.points.length).toBeGreaterThan(1);
  });
});
