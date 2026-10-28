import { describe, expect, it } from "vitest";

import type { HistoricMission, RedPenMark } from "./design";
import { DEMO_SKETCHES } from "./demo-sketches";
import {
  comebackFor,
  COMEBACK,
  comebackSource,
  defectStrokes,
  fixNote,
  fixStrokes,
  historicReading,
  historicReview,
  historicStrokes,
  historicTrace,
} from "./history";
import { ALL_MISSIONS } from "./mission-catalog";
import { readFromGeometry } from "./sketch/geometry";
import { HISTORIC_MISSIONS } from "./missions";
import { drawTemplate, TEMPLATES } from "./templates";

/** A local stand-in until lib/missions.ts lands; the shape is HistoricMission's. */
const crs7: HistoricMission = {
  id: "crs7",
  sketchId: "two-stage-orbiter",
  rocket: "falcon9",
  lesson: "The numbers had margin to spare; one strut was enough to lose the rocket.",
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
            : m.kind === "tick"
              ? [m.at]
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

  it("draws only the failure: the failed part's outline, its name and ①", () => {
    expect(review.marks.map((m) => m.kind)).toEqual(["outline", "callout", "arrow"]);
    const [outline, label, arrow] = review.marks;
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

  it("draws nothing for a flight that worked", () => {
    const ok = historicReview(success, historicReading(success));
    expect(ok.marks).toEqual([]);
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

describe("fix and try again", () => {
  it.each(HISTORIC_MISSIONS.filter((m) => COMEBACK[m.id]).map((m) => [m.id, m] as const))(
    "%s: has a comeback flight, a short fix note and detail strokes in the failed part",
    (_, m) => {
      const comeback = comebackFor(m);
      expect(comeback?.id).toBe(COMEBACK[m.id]);
      expect(comeback?.outcome).toBe("success");
      expect(fixNote(m)).toMatch(/^FIX: /);
      expect(fixNote(m).split(" ").length).toBeLessThanOrEqual(5);

      const reading = historicReading(m);
      const strokes = fixStrokes(m, reading);
      expect(strokes.length).toBeGreaterThanOrEqual(2);
      for (const stroke of strokes) {
        expect(stroke.detail).toBe(true);
        expect(stroke.points.length).toBeGreaterThan(1);
        for (const [x, y] of stroke.points) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(1);
        }
      }
      expect(fixStrokes(m, reading)).toEqual(strokes);
    },
  );
});

describe("the flaw drawn into the sketch", () => {
  it.each(HISTORIC_MISSIONS.map((m) => [m.id, m] as const))(
    "%s: graphite strokes inside the failed part that don't change what the reader sees",
    (_, m) => {
      const reading = historicReading(m);
      const flaw = defectStrokes(m, reading);
      if (m.outcome !== "lost" || !m.failure) {
        expect(flaw).toEqual([]);
        return;
      }
      expect(flaw.length).toBeGreaterThanOrEqual(2);
      for (const stroke of flaw) {
        expect(stroke.detail).toBeUndefined();
        for (const [x, y] of stroke.points) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(1);
        }
      }
      // On a stand-in sketch the reader must still see the same parts; a template's parts are exact.
      if (m.sketchId) {
        const sketch = DEMO_SKETCHES.find((d) => d.id === m.sketchId)!;
        const withFlaw = readFromGeometry([...sketch.strokes, ...flaw], m.destination);
        const shape = (r: typeof reading) => r.parts.map((p) => `${p.kind}@${p.stageIndex ?? "-"}`).sort();
        expect(shape(withFlaw)).toEqual(shape(reading));
        expect(withFlaw.design.stages.length).toBe(reading.design.stages.length);
      }
      expect(defectStrokes(m, reading)).toEqual(flaw);
    },
  );

  it("draws nothing for a flight that worked", () => {
    const ok = HISTORIC_MISSIONS.find((m) => m.outcome === "success");
    if (ok) expect(defectStrokes(ok, historicReading(ok))).toEqual([]);
  });
});

describe("review fixes", () => {
  it("fits each featured fix note beside its fix on the 300-unit napkin", () => {
    for (const lost of HISTORIC_MISSIONS.filter((m) => COMEBACK[m.id])) {
      const xs = fixStrokes(lost, historicReading(lost)).flatMap((s) => s.points.map((p) => p[0]));
      const maxX = Math.max(...xs);
      // FixOverlay writes the note from the fix's right edge when there's room there.
      if (maxX < 0.72) expect(maxX * 300 + 8 + fixNote(lost).length * 4.6, lost.id).toBeLessThanOrEqual(300);
    }
  });

  it("finds the loss each comeback came back from", () => {
    for (const [lostId, comebackId] of Object.entries(COMEBACK)) {
      const comeback = ALL_MISSIONS.find((m) => m.id === comebackId)!;
      expect(comebackSource(comeback)?.id).toBe(lostId);
    }
    expect(comebackSource(HISTORIC_MISSIONS[0])).toBeNull();
  });
});

describe("flights on their rocket's template drawing", () => {
  /** The flight with its stand-in sketch dropped, the way the catalog lists it under its rocket. */
  const onRocket = (id: string): HistoricMission => ({ ...HISTORIC_MISSIONS.find((m) => m.id === id)!, sketchId: undefined });
  const inside = ([x, y]: [number, number], [bx, by, bw, bh]: [number, number, number, number], slack: number) =>
    x >= bx - slack && x <= bx + bw + slack && y >= by - slack && y <= by + bh + slack;

  it.each([
    ["crs7", "falcon9"],
    ["ift1", "starship"],
  ] as const)("%s replays on the %s template and the red pen marks its exact failed part", (id, rocket) => {
    const m = onRocket(id);
    expect(m.rocket).toBe(rocket);
    const template = TEMPLATES.find((t) => t.id === rocket)!;
    const reading = historicReading(m);
    const drawing = drawTemplate(template, reading.design);
    expect(reading.design.name).toBe(m.vehicle);
    expect(reading.design.destination).toBe(m.destination);
    expect(reading.design.stages).toEqual(template.design.stages);
    expect(reading.parts).toEqual(drawing.parts);
    expect(historicStrokes(m)).toEqual(drawing.strokes);

    const failure = m.failure!;
    const part = reading.parts.find((p) => p.kind === failure.part && p.stageIndex === failure.stageIndex)!;
    expect(part).toBeDefined();

    const review = historicReview(m, reading);
    expect(review.marks.map((mk) => mk.kind)).toEqual(["outline", "callout", "arrow"]);
    const [outline, label] = review.marks;
    if (outline.kind === "outline") outline.box.forEach((v, i) => expect(v).toBeCloseTo(part.box[i], 9));
    expect(label.note).toBe(failure.label);
    review.marks.forEach(onNapkin);

    // The flaw is drawn in (or right around) the failed part; the fix there and on the parts it
    // changed (IFT-1's comeback also added a hot-staging ring at the interstage). All on the napkin.
    const vehicle = reading.parts.reduce(
      ([x0, y0, x1, y1], p) => [Math.min(x0, p.box[0]), Math.min(y0, p.box[1]), Math.max(x1, p.box[0] + p.box[2]), Math.max(y1, p.box[1] + p.box[3])],
      [1, 1, 0, 0],
    );
    const vehicleBox: [number, number, number, number] = [vehicle[0], vehicle[1], vehicle[2] - vehicle[0], vehicle[3] - vehicle[1]];
    for (const [strokes, share] of [
      [defectStrokes(m, reading), 0.8],
      [fixStrokes(m, reading), 0.3],
    ] as const) {
      expect(strokes.length).toBeGreaterThanOrEqual(2);
      const points = strokes.flatMap((st) => st.points);
      for (const pt of points) {
        expect(pt[0]).toBeGreaterThanOrEqual(0);
        expect(pt[0]).toBeLessThanOrEqual(1);
        expect(pt[1]).toBeGreaterThanOrEqual(0);
        expect(pt[1]).toBeLessThanOrEqual(1);
        expect(inside(pt, vehicleBox, 0.06)).toBe(true);
      }
      const near = points.filter((pt) => inside(pt, part.box, 0.06)).length;
      expect(near / points.length).toBeGreaterThan(share);
    }
  });

  it("keeps the stand-in sketch for a flight that has one", () => {
    const f1 = HISTORIC_MISSIONS.find((m) => m.id === "falcon1-f1")!;
    expect(f1.sketchId).toBeDefined();
    expect(historicStrokes(f1)).toEqual(DEMO_SKETCHES.find((d) => d.id === f1.sketchId)!.strokes);
  });

  it("puts every flight in the catalog on a drawing with its failed part", () => {
    for (const m of ALL_MISSIONS) {
      for (const variant of [m, { ...m, sketchId: undefined }]) {
        const reading = historicReading(variant);
        expect(historicStrokes(variant).length, variant.id).toBeGreaterThan(0);
        if (variant.failure) {
          const failure = variant.failure;
          expect(reading.parts.some((p) => p.kind === failure.part), `${variant.id} ${failure.part}`).toBe(true);
        }
      }
    }
  });
});
