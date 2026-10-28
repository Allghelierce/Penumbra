import { describe, expect, it } from "vitest";

import type { Point, RedPenMark } from "./design";
import { defectStrokes, historicReading, historicReview, historicTrace } from "./history";
import { ALL_MISSIONS } from "./mission-catalog";
import { CLASSIC_MISSIONS } from "./missions-classic";
import { templateById } from "./templates";

const onNapkin = ([x, y]: Point) => x >= 0 && x <= 1 && y >= 0 && y <= 1;

function markPoints(m: RedPenMark): Point[] {
  if (m.kind === "arrow" || m.kind === "dimension") return [m.from, m.to];
  if (m.kind === "callout") return [m.anchor, m.label];
  if (m.kind === "ghost-line") return m.points;
  if (m.kind === "circle") return [m.center];
  if (m.kind === "tick") return [m.at];
  return [
    [m.box[0], m.box[1]],
    [m.box[0] + m.box[2], m.box[1] + m.box[3]],
  ];
}

describe("CLASSIC_MISSIONS", () => {
  it("gives Saturn V and Electron at least two sourced flights each, in the catalog and on their own drawings", () => {
    for (const rocket of ["saturn-v", "electron"] as const) {
      expect(CLASSIC_MISSIONS.filter((m) => m.rocket === rocket).length, rocket).toBeGreaterThanOrEqual(2);
    }
    expect(new Set(ALL_MISSIONS.map((m) => m.id)).size).toBe(ALL_MISSIONS.length);
    for (const m of CLASSIC_MISSIONS) {
      expect(ALL_MISSIONS).toContain(m);
      expect(m.sketchId, m.id).toBeUndefined();
      expect(m.sources.length, m.id).toBeGreaterThan(0);
      const urls = [...m.sources.map((s) => s.url), ...m.timeline.flatMap((e) => (e.quote ? [e.quote.source] : []))];
      for (const url of urls) expect(url, m.id).toMatch(/^https:\/\//);
      // The lesson is one plain sentence.
      expect(m.lesson, m.id).toMatch(/^[A-Z].*\.$/);
      expect(m.lesson.slice(0, -1), m.id).not.toMatch(/[.!?] /);
    }
  });

  it.each(CLASSIC_MISSIONS.map((m) => [m.id, m] as const))(
    "%s: a timeline that ends where the flight did, and the failed part marked on the rocket's drawing",
    (_, m) => {
      expect(m.timeline[0]).toMatchObject({ tS: 0, kind: "liftoff" });
      for (let i = 1; i < m.timeline.length; i++) expect(m.timeline[i].tS).toBeGreaterThan(m.timeline[i - 1].tS);
      // No more separations than the rocket has stages to drop.
      const separations = m.timeline.filter((e) => e.kind === "stage-sep").length;
      expect(separations).toBeLessThan(templateById(m.rocket).design.stages.length);
      expect(m.timeline.at(-1)!.kind).toBe(m.outcome === "lost" ? "engine-cutoff" : "orbit");
      expect(historicTrace(m).outcome).toBe(m.outcome === "lost" ? "suborbital" : "orbit");

      const reading = historicReading(m);
      const review = historicReview(m, reading);
      for (const mark of review.marks) for (const p of markPoints(mark)) expect(onNapkin(p), `${m.id} ${mark.kind}`).toBe(true);
      if (!m.failure) {
        expect(review.marks).toEqual([]);
        return;
      }
      const failure = m.failure;
      expect(reading.parts.some((p) => p.kind === failure.part && p.stageIndex === failure.stageIndex)).toBe(true);
      expect(failure.label.split(/\s+/).length).toBeLessThanOrEqual(4);
      expect(review.marks.find((mk) => mk.kind === "callout")?.note).toBe(failure.label);
      for (const stroke of defectStrokes(m, reading)) for (const p of stroke.points) expect(onNapkin(p)).toBe(true);
    },
  );
});
