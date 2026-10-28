import { describe, expect, it } from "vitest";

import { closestAnalogs, historyLine, REAL_VEHICLES } from "./analogs";
import { DEMO_SKETCHES } from "./demo-sketches";
import type { Analysis, Design, DestinationId, Verdict } from "./design";
import { analyze } from "./physics";
import { readFromGeometry } from "./sketch/geometry";

function demo(id: string) {
  const d = DEMO_SKETCHES.find((s) => s.id === id)!;
  const { design } = readFromGeometry(d.strokes, d.destination);
  return { design, analysis: analyze(design) };
}

describe("closestAnalogs", () => {
  it("matches the two-stage orbiter to Falcon 9 or Starship", () => {
    const { design, analysis } = demo("two-stage-orbiter");
    expect(["falcon-9", "starship"]).toContain(closestAnalogs(design, analysis)[0].vehicle.id);
  });

  it("matches the single-stage hopper to a single-stage or small vehicle", () => {
    const { design, analysis } = demo("napkin-hopper");
    const top = closestAnalogs(design, analysis)[0].vehicle;
    expect(top.stages === 1 || (top.liftoffMassT ?? Infinity) < 50).toBe(true);
  });

  it("returns n results, closest first, with similarity in 0..1 and readable text", () => {
    for (const d of DEMO_SKETCHES) {
      const { design, analysis } = demo(d.id);
      const all = closestAnalogs(design, analysis, REAL_VEHICLES.length);
      expect(all).toHaveLength(REAL_VEHICLES.length);
      expect(closestAnalogs(design, analysis)).toHaveLength(3);
      for (let i = 0; i < all.length; i++) {
        expect(all[i].similarity).toBeGreaterThanOrEqual(0);
        expect(all[i].similarity).toBeLessThanOrEqual(1);
        if (i > 0) expect(all[i].similarity).toBeLessThanOrEqual(all[i - 1].similarity);
        expect(all[i].name).toBe(all[i].vehicle.name);
        expect(all[i].why).not.toMatch(/NaN|undefined|Infinity/);
        expect(all[i].history.length).toBeGreaterThan(10);
      }
    }
  });

  it("keeps the dataset sane", () => {
    for (const v of REAL_VEHICLES) {
      expect(v.source).toMatch(/^https:\/\//);
      expect(v.heightM / v.diameterM).toBeGreaterThan(1);
      expect(v.stages).toBeGreaterThanOrEqual(1);
    }
    expect(new Set(REAL_VEHICLES.map((v) => v.id)).size).toBe(REAL_VEHICLES.length);
  });
});

describe("historyLine", () => {
  it("writes one clean sentence for every verdict and destination", () => {
    const { design, analysis } = demo("mars-ship");
    const verdicts: Verdict[] = ["stuck-on-pad", "suborbital", "orbit", "destination"];
    const destinations: DestinationId[] = ["leo", "gto", "moon-orbit", "moon-surface", "mars-transfer", "mars-surface", "europa"];
    for (const verdict of verdicts) {
      for (const destination of destinations) {
        const line = historyLine({ ...design, destination } as Design, { ...analysis, verdict } as Analysis);
        expect(line, `${verdict}/${destination}`).toMatch(/^[A-Z].*\.$/);
        expect(line).not.toMatch(/NaN|undefined/);
      }
    }
  });

  it("ties the demo verdicts to history", () => {
    expect(historyLine(demo("napkin-hopper").design, demo("napkin-hopper").analysis)).toMatch(/Shepard/);
    expect(historyLine(demo("mars-ship").design, demo("mars-ship").analysis)).toMatch(/refill Starship/);
  });
});
