import { describe, expect, it } from "vitest";

import { DEMO_SKETCHES } from "../demo-sketches";
import type { Point, Stroke } from "../design";
import { scoreSketch } from "./confidence";

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = seeded(7);
const scribble: Stroke[] = [{ points: Array.from({ length: 300 }, (): Point => [0.3 + rand() * 0.4, 0.2 + rand() * 0.6]) }];
const tallZigzag: Stroke[] = [
  { points: Array.from({ length: 80 }, (_, i): Point => [i % 2 ? 0.62 : 0.38, 0.15 + i * 0.009]) },
];
const circle: Stroke[] = [
  { points: Array.from({ length: 65 }, (_, i): Point => [0.5 + 0.2 * Math.cos((i / 64) * 2 * Math.PI), 0.5 + 0.15 * Math.sin((i / 64) * 2 * Math.PI)]) },
];
const line: Stroke[] = [{ points: Array.from({ length: 60 }, (_, i): Point => [0.5, 0.15 + i * 0.012]) }];
const manyDots: Stroke[] = Array.from({ length: 80 }, (_, i): Stroke => ({ points: [[0.3 + (i % 9) * 0.05, 0.2 + Math.floor(i / 9) * 0.06]] }));

describe("scoreSketch", () => {
  it("is confident about all three demo sketches", () => {
    for (const d of DEMO_SKETCHES) {
      const s = scoreSketch(d.strokes);
      expect(s.confidence, d.id).toBeGreaterThanOrEqual(0.8);
      expect(s.problem, d.id).toBeNull();
    }
  });

  it.each([
    ["random scribble", scribble],
    ["tall zigzag", tallZigzag],
    ["circle", circle],
    ["single line", line],
    ["a field of dots", manyDots],
    ["blank napkin", []],
  ])("doubts a %s and says why", (_name, strokes) => {
    const s = scoreSketch(strokes as Stroke[]);
    expect(s.confidence).toBeLessThan(0.5);
    expect(s.problem).toMatch(/\.$/);
  });
});
