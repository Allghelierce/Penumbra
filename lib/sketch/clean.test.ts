import { describe, expect, it } from "vitest";

import { DEMO_SKETCHES } from "../demo-sketches";
import type { CleanShape, Point, Stroke } from "../design";
import { cleanProfile } from "./clean";
import { detailStrokes } from "./detail";
import { readFromGeometry } from "./geometry";

/** Absolute coordinates in a path (M/L/C pairs); relative arc lengths are skipped. */
function coords(shape: CleanShape): [number, number][] {
  const absolute = shape.d.replace(/a[^MLCZ]*/g, " ");
  const nums = (absolute.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

describe("cleanProfile", () => {
  it("draws 10–40 shapes for each demo, all inside the 300 × 400 viewBox", () => {
    for (const d of DEMO_SKETCHES) {
      const shapes = cleanProfile(readFromGeometry(d.strokes, d.destination));
      expect(shapes.length, d.id).toBeGreaterThanOrEqual(10);
      expect(shapes.length, d.id).toBeLessThanOrEqual(40);
      for (const s of shapes) {
        for (const [x, y] of coords(s)) {
          expect(x, `${d.id} ${s.part}`).toBeGreaterThanOrEqual(0);
          expect(x, `${d.id} ${s.part}`).toBeLessThanOrEqual(300);
          expect(y, `${d.id} ${s.part}`).toBeGreaterThanOrEqual(0);
          expect(y, `${d.id} ${s.part}`).toBeLessThanOrEqual(400);
        }
      }
    }
  });

  it("paints methalox stainless, ignores kept detail, and draws nothing for a scribble", () => {
    const d = DEMO_SKETCHES.find((s) => s.id === "two-stage-orbiter")!;
    const reading = readFromGeometry(d.strokes, d.destination);
    const shapes = cleanProfile(reading);
    expect(shapes.find((s) => s.part === "tank")?.fill).toBe("#c9ced3");
    expect(shapes.some((s) => s.part === "engine")).toBe(true);
    const withDetail = readFromGeometry([...d.strokes, ...detailStrokes(reading)], d.destination);
    expect(cleanProfile(withDetail)).toEqual(shapes);

    let seed = 5;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const scribble: Stroke[] = [{ points: Array.from({ length: 200 }, (): Point => [0.3 + rand() * 0.4, 0.2 + rand() * 0.6]) }];
    expect(cleanProfile(readFromGeometry(scribble, "leo"))).toEqual([]);
  });
});
