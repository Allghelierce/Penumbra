import { describe, expect, it } from "vitest";

import { DEMO_SKETCHES } from "../demo-sketches";
import type { Stroke } from "../design";
import { analyze } from "../physics";
import { enginesForBase, enginesForBells } from "./engines";
import { readFromGeometry } from "./geometry";

const demo = (id: string) => DEMO_SKETCHES.find((d) => d.id === id)!;

function summarize(strokes: Stroke[]) {
  const { design, parts } = readFromGeometry(strokes, "leo");
  return {
    stages: design.stages.length,
    engines: design.stages[0].engines[0].count,
    fins: design.features.includes("fins"),
    finParts: parts.filter((p) => p.kind === "fin").length,
    design,
    parts,
  };
}

describe("readFromGeometry", () => {
  // Engine counts come from the bells read at scale: hopper 1 huge bell, orbiter 3, mars ship 5.
  it("reads the napkin hopper as one finned stage whose single wide bell is a cluster", () => {
    const r = summarize(demo("napkin-hopper").strokes);
    expect(r).toMatchObject({ stages: 1, fins: true, finParts: 2 });
    expect(r.engines).toBeGreaterThanOrEqual(1);
    expect(r.engines).toBeLessThanOrEqual(15);
  });

  it("gives every demo a realistic liftoff TWR (1.2–2.0) and upper stages at least 0.5", () => {
    for (const d of DEMO_SKETCHES) {
      const a = analyze(readFromGeometry(d.strokes, d.destination).design);
      expect(a.liftoffTwr, d.id).toBeGreaterThan(1.2);
      expect(a.liftoffTwr, d.id).toBeLessThanOrEqual(2.0);
      for (const stage of a.stages.slice(1)) expect(stage.twrAtIgnition, d.id).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("reads the two-stage orbiter's boundary line, three bells and fins", () => {
    const r = summarize(demo("two-stage-orbiter").strokes);
    expect(r).toMatchObject({ stages: 2, fins: true });
    expect(r.engines).toBeGreaterThanOrEqual(15);
    expect(r.engines).toBeLessThanOrEqual(40);
    expect(r.design.stages[1].engines[0].engine).toBe("raptor-vacuum");
    expect(r.parts.find((p) => p.kind === "engine")!.box[2]).toBeGreaterThan(0.05);
  });

  it("reads the mars ship as two stages with five bells, a heat shield and legs, and no fins", () => {
    const r = summarize(demo("mars-ship").strokes);
    expect(r).toMatchObject({ stages: 2, fins: false });
    expect(r.engines).toBeGreaterThanOrEqual(15);
    expect(r.design.features).toEqual(["heat-shield", "landing-legs"]);
    expect(r.parts.filter((p) => p.kind === "landing-legs")).toHaveLength(2);
    expect(r.parts.find((p) => p.kind === "heat-shield")?.stageIndex).toBe(1);
  });

  it("finds no heat shield or legs on the hopper and orbiter", () => {
    for (const id of ["napkin-hopper", "two-stage-orbiter"]) {
      expect(summarize(demo(id).strokes).design.features).toEqual(["fins"]);
    }
  });

  it("measures the body, not the fins, and shrinks wide doodles uniformly to a 12 m body", () => {
    // Hopper body: 0.22 square units wide and about 0.62 tall (nose tip to bell), so ~2.8:1.
    const { design } = summarize(demo("napkin-hopper").strokes);
    expect(design.diameterM).toBe(12);
    expect(design.heightM / design.diameterM).toBeGreaterThan(2.5);
    expect(design.heightM / design.diameterM).toBeLessThan(3.2);
  });

  it("computes tank volume as π r² h × 0.8 and keeps boxes on the napkin", () => {
    const { design, parts } = summarize(demo("two-stage-orbiter").strokes);
    const r = design.diameterM / 2;
    const tankHeightM = design.heightM * 0.6;
    const total = design.stages.reduce((sum, s) => sum + s.tankVolumeM3, 0);
    expect(total).toBeGreaterThan(Math.PI * r * r * tankHeightM * 0.8 * 0.9);
    expect(total).toBeLessThan(Math.PI * r * r * tankHeightM * 0.8 * 1.1);
    for (const { box } of parts) {
      expect(box.every((v) => v >= 0 && v <= 1)).toBe(true);
      expect(box[0] + box[2]).toBeLessThanOrEqual(1);
      expect(box[1] + box[3]).toBeLessThanOrEqual(1);
    }
  });

  it("survives an empty or malformed napkin", () => {
    const blank = readFromGeometry([], "mars-surface");
    expect(blank.design.stages).toHaveLength(1);
    expect(blank.design.destination).toBe("mars-surface");
    const junk = readFromGeometry([{ points: [[NaN, 2] as never] }, null as never], "leo");
    expect(junk.design.stages[0].tankVolumeM3).toBeGreaterThan(0);
  });
});

describe("engine sizing", () => {
  it("reads a Raptor-sized bell as one engine and a 3x wider bell as nine", () => {
    expect(enginesForBells([1.3])).toBe(1);
    expect(enginesForBells([3.9])).toBe(9);
    expect(enginesForBells([0.2, 0.2])).toBe(2);
  });

  it("fits about 33 engines under a 9 m base", () => {
    expect(enginesForBase(9)).toBe(33);
  });
});
