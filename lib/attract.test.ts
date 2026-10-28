import { describe, expect, it } from "vitest";
import type { Stroke } from "./design";
import { DEMO_SKETCHES } from "./demo-sketches";
import { planReplay, replaySketch, sketchDurationMs, strokesAt, visibleCount } from "./attract";

const line = (x0: number, y0: number, x1: number, y1: number, n: number): Stroke => ({
  points: Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * i) / (n - 1)]),
});

const short = line(0, 0, 0.1, 0, 11);
const long = line(0, 0.5, 0.3, 0.5, 31);

describe("planReplay", () => {
  it("ends exactly at the requested duration", () => {
    const plan = planReplay([short, long], 5000);
    expect(plan.totalMs).toBe(5000);
    expect(plan.times[1][30]).toBeCloseTo(5000, 6);
    expect(plan.times[0][0]).toBe(0);
  });

  it("never draws a point before the one before it", () => {
    const times = planReplay([short, long, short], 4000).times.flat();
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
  });

  it("lifts the pen briefly between strokes", () => {
    const plan = planReplay([short, long], 5000);
    const pause = plan.times[1][0] - plan.times[0][10];
    expect(pause).toBeGreaterThan(50);
    expect(pause).toBeLessThanOrEqual(220);
  });

  it("moves at a steady pen speed: a 3x longer stroke takes 3x longer", () => {
    const plan = planReplay([short, long], 5000);
    const shortMs = plan.times[0][10] - plan.times[0][0];
    const longMs = plan.times[1][30] - plan.times[1][0];
    expect(longMs / shortMs).toBeCloseTo(3, 5);
  });

  it("skips empty strokes", () => {
    const plan = planReplay([{ points: [] }, short], 1000);
    expect(plan.times[0]).toEqual([]);
    expect(plan.times[1][10]).toBeCloseTo(1000, 6);
  });
});

describe("strokesAt", () => {
  it("grows from one point to the whole drawing", () => {
    const strokes = [short, long];
    const plan = planReplay(strokes, 5000);
    expect(strokesAt(strokes, plan, 0)).toEqual([{ points: [short.points[0]] }]);
    const mid = strokesAt(strokes, plan, 2500);
    expect(mid[0]).toBe(short);
    expect(mid[1].points.length).toBeGreaterThan(0);
    expect(mid[1].points.length).toBeLessThan(31);
    expect(strokesAt(strokes, plan, 5000)).toEqual(strokes);
    expect(visibleCount(plan, 99999)).toBe(42);
  });
});

describe("demo sketches", () => {
  it("each takes 4–6 s to draw", () => {
    for (const sketch of DEMO_SKETCHES) {
      const ms = sketchDurationMs(sketch.strokes);
      expect(ms, sketch.id).toBeGreaterThanOrEqual(4000);
      expect(ms, sketch.id).toBeLessThanOrEqual(6000);
    }
  });
});

describe("replaySketch", () => {
  it("hands over a growing drawing and finishes with all of it", async () => {
    const frames: number[] = [];
    let last: Stroke[] = [];
    await replaySketch([short, long], (s) => {
      frames.push(s.reduce((n, x) => n + x.points.length, 0));
      last = s;
    }, { durationMs: 120 });
    expect(last).toEqual([short, long]);
    for (let i = 1; i < frames.length; i++) expect(frames[i]).toBeGreaterThan(frames[i - 1]);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    let calls = 0;
    const done = replaySketch([short, long], () => {
      calls++;
      controller.abort();
    }, { durationMs: 5000, signal: controller.signal });
    await done;
    expect(calls).toBe(1);
  });
});
