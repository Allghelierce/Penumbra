import { describe, expect, it } from "vitest";

import { DEMO_SKETCHES } from "../demo-sketches";
import type { Point, Stroke } from "../design";
import { detailStrokes } from "./detail";
import { readFromGeometry } from "./geometry";

describe("detailStrokes", () => {
  it("adds 15–60 in-bounds detail strokes to each demo sketch, the same every time", () => {
    for (const d of DEMO_SKETCHES) {
      const reading = readFromGeometry(d.strokes, d.destination);
      const strokes = detailStrokes(reading);
      expect(strokes.length, d.id).toBeGreaterThanOrEqual(15);
      expect(strokes.length, d.id).toBeLessThanOrEqual(60);
      for (const s of strokes) {
        expect(s.points.length).toBeGreaterThanOrEqual(2);
        for (const [x, y] of s.points) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(1);
        }
      }
      expect(detailStrokes(reading)).toEqual(strokes);
    }
  });

  it("marks every detail stroke, and kept detail doesn't change what the sketch reads as", () => {
    for (const d of DEMO_SKETCHES) {
      const before = readFromGeometry(d.strokes, d.destination);
      const detail = detailStrokes(before);
      expect(detail.every((s) => s.detail === true), d.id).toBe(true);
      const after = readFromGeometry([...d.strokes, ...detail], d.destination);
      expect(after.design, d.id).toEqual(before.design);
      expect(after.confidence, d.id).toBe(before.confidence);
    }
  });

  it("adds nothing to a low-confidence scribble", () => {
    let seed = 3;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const scribble: Stroke[] = [{ points: Array.from({ length: 200 }, (): Point => [0.3 + rand() * 0.4, 0.2 + rand() * 0.6]) }];
    const reading = readFromGeometry(scribble, "leo");
    expect(reading.confidence).toBeLessThan(0.5);
    expect(detailStrokes(reading)).toEqual([]);
  });
});
