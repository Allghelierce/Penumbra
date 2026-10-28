import { describe, expect, it } from "vitest";

import { applyAction } from "./actions";
import { NAPKIN_ASPECT, type Design, type EngineId, type TemplateId } from "./design";
import { analyze, ENGINES, PROPELLANT_DENSITY_KG_M3 } from "./physics";
import { TANK_FILL } from "./physics/data";
import { drawTemplate, TEMPLATES, templateById } from "./templates";

const lb = (pounds: number) => Math.round(pounds * 0.45359237);

/** Published propellant per stage (bottom first), and lift-off mass, from the sources in templates.ts. */
const PUBLISHED: Record<TemplateId, { propellantKg: number[]; liftoffKg: [number, number] }> = {
  falcon9: { propellantKg: [395_700, 92_670], liftoffKg: [549_000, 549_000] },
  "saturn-v": {
    propellantKg: [lb(4_881_000) - lb(303_000), lb(1_037_000) - lb(95_000), lb(265_600) - lb(33_600)],
    liftoffKg: [lb(6_221_823), lb(6_537_238)],
  },
  electron: { propellantKg: [9_250, 2_050], liftoffKg: [13_000, 13_000] },
  starship: { propellantKg: [3_400_000, 1_500_000], liftoffKg: [5_000_000, 5_000_000] },
};

const liftoffKg = (d: Design) =>
  d.payloadMassKg +
  d.stages.reduce((sum, s) => sum + (s.dryMassKg ?? 0) + s.tankVolumeM3 * PROPELLANT_DENSITY_KG_M3[s.propellant] * TANK_FILL, 0);

describe("TEMPLATES", () => {
  it("has the four rockets in order, each a LEO reference design with sources", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["falcon9", "saturn-v", "electron", "starship"]);
    for (const t of TEMPLATES) {
      expect(t.design.destination, t.id).toBe("leo");
      // Saturn V's published figure includes the S-IVB itself, so its baseline payload is lower.
      if (t.id === "saturn-v") expect(t.design.payloadMassKg).toBe(118_000);
      else expect(t.design.payloadMassKg, t.id).toBe(t.realPayloadLeoKg);
      expect(t.sources.length, t.id).toBeGreaterThan(0);
      for (const s of t.sources) expect(s.url, t.id).toMatch(/^https:\/\//);
      expect(templateById(t.id)).toBe(t);
    }
  });

  it("sets each baseline's recovery to match its published payload", () => {
    const recovers = (id: TemplateId) => templateById(id).design.stages.map((s) => s.recover === true);
    expect(recovers("falcon9")).toEqual([false, false]);
    expect(recovers("saturn-v")).toEqual([false, false, false]);
    expect(recovers("electron")).toEqual([false, false]);
    expect(recovers("starship")).toEqual([true, true]);
    const f9 = templateById("falcon9");
    expect(f9.realPayloadLeoReusableKg).toBe(17_400);
    expect(f9.realPayloadLeoReusableKg!).toBeLessThan(f9.realPayloadLeoKg);
    for (const id of ["saturn-v", "electron", "starship"] as const) expect(templateById(id).realPayloadLeoReusableKg).toBeUndefined();
  });

  it("holds exactly the published propellant in each stage, with real dry masses and known engines", () => {
    for (const t of TEMPLATES) {
      const published = PUBLISHED[t.id].propellantKg;
      expect(t.design.stages).toHaveLength(published.length);
      t.design.stages.forEach((s, i) => {
        const kg = s.tankVolumeM3 * PROPELLANT_DENSITY_KG_M3[s.propellant] * TANK_FILL;
        expect(Math.abs(kg - published[i]) / published[i], `${t.id} stage ${i}`).toBeLessThan(0.001);
        expect(s.dryMassKg, `${t.id} stage ${i}`).toBeGreaterThan(0);
        for (const c of s.engines) expect(ENGINES[c.engine], `${t.id} ${c.engine}`).toBeDefined();
      });
    }
  });

  it("reaches orbit on every default launch, and Falcon 9 does too with the booster recovered", () => {
    for (const t of TEMPLATES) expect(analyze(t.design).verdict, t.id).toBe("destination");
    const f9 = templateById("falcon9");
    const recovered: Design = {
      ...f9.design,
      payloadMassKg: f9.realPayloadLeoReusableKg!,
      stages: f9.design.stages.map((s, i) => (i === 0 ? { ...s, recover: true } : s)),
    };
    expect(analyze(recovered).verdict).toBe("destination");
  });

  it("weighs what the real vehicle weighs at lift-off (within 7%) and gets off the pad", () => {
    for (const t of TEMPLATES) {
      const [lo, hi] = PUBLISHED[t.id].liftoffKg;
      const mass = liftoffKg(t.design);
      expect(mass, t.id).toBeGreaterThan(lo * 0.93);
      expect(mass, t.id).toBeLessThan(hi * 1.07);
      expect(analyze(t.design).liftoffTwr, t.id).toBeGreaterThan(1);
    }
  });
});

describe("drawTemplate", () => {
  const inBounds = (v: number) => v >= 0 && v <= 1;

  it("draws each real rocket inside the napkin, stage bands stacked bottom-up, one tank part per stage", () => {
    for (const t of TEMPLATES) {
      const drawing = drawTemplate(t, t.design);
      expect(drawing.strokes.length, t.id).toBeGreaterThan(8);
      for (const s of drawing.strokes) for (const [x, y] of s.points) expect(inBounds(x) && inBounds(y), t.id).toBe(true);
      for (const p of drawing.parts) {
        const [x, y, w, h] = p.box;
        expect(inBounds(x) && inBounds(y) && x + w <= 1.0001 && y + h <= 1.0001, `${t.id} ${p.label}`).toBe(true);
      }
      expect(drawing.stageBands).toHaveLength(t.design.stages.length);
      for (let i = 0; i + 1 < drawing.stageBands.length; i++) {
        expect(drawing.stageBands[i + 1][1], t.id).toBeLessThanOrEqual(drawing.stageBands[i][0] + 1e-9);
      }
      t.design.stages.forEach((_, i) => {
        expect(drawing.parts.some((p) => p.kind === "tank" && p.stageIndex === i), `${t.id} tank ${i}`).toBe(true);
      });
      expect(drawTemplate(t, t.design)).toEqual(drawing);
    }
  });

  it("scales widths and heights the same way, with the widest tank at design.diameterM", () => {
    for (const t of TEMPLATES) {
      const { parts } = drawTemplate(t, t.design);
      const tanks = parts.filter((p) => p.kind === "tank");
      // In napkin-height units a box's width is w × NAPKIN_ASPECT (the napkin is 3:4).
      const widest = Math.max(...tanks.map((p) => p.box[2] * NAPKIN_ASPECT));
      const metresPerUnit = t.design.diameterM / widest;
      // The nose-to-bells drawing spans the real height within a few percent at that same scale.
      const top = Math.min(...parts.map((p) => p.box[1]));
      const bottom = Math.max(...parts.map((p) => p.box[1] + p.box[3]));
      expect(((bottom - top) * metresPerUnit) / t.design.heightM, t.id).toBeGreaterThan(0.9);
      expect(((bottom - top) * metresPerUnit) / t.design.heightM, t.id).toBeLessThan(1.12);
    }
    // Saturn V's S-IVB (6.6 m) and S-IC (10.1 m) keep their real width ratio.
    const sat = drawTemplate(TEMPLATES[1], TEMPLATES[1].design).parts.filter((p) => p.kind === "tank");
    const width = (i: number) => sat.find((p) => p.stageIndex === i)!.box[2];
    expect(width(2) / width(0)).toBeCloseTo(6.6 / 10.1, 2);
  });

  it("lengthens a stretched stage relative to the others", () => {
    for (const t of TEMPLATES) {
      const len = (d: Design, i: number) => {
        const [top, bottom] = drawTemplate(t, d).stageBands[i];
        return bottom - top;
      };
      const stretched = applyAction(t.design, { type: "scale-tanks", stageIndex: 0, factor: 1.5 });
      const before = len(t.design, 0) / len(t.design, t.design.stages.length - 1);
      const after = len(stretched, 0) / len(stretched, stretched.stages.length - 1);
      expect(after / before, t.id).toBeCloseTo(1.5, 1);
    }
  });

  it("draws an added booster below and survives removed stages and big edits", () => {
    for (const t of TEMPLATES) {
      const added = applyAction(t.design, { type: "add-stage" });
      const drawing = drawTemplate(t, added);
      expect(drawing.stageBands).toHaveLength(t.design.stages.length + 1);
      expect(drawing.stageBands[0][0], t.id).toBeGreaterThanOrEqual(drawing.stageBands[1][1] - 1e-9);
      for (let i = 0; i < t.design.stages.length; i++) {
        const fewer = applyAction(t.design, { type: "remove-stage", stageIndex: i });
        expect(() => drawTemplate(t, fewer)).not.toThrow();
      }
      for (const factor of [0.5, 2, 4]) {
        const d = applyAction(t.design, { type: "scale-tanks", stageIndex: t.design.stages.length - 1, factor });
        for (const s of drawTemplate(t, d).strokes) for (const [x, y] of s.points) expect(inBounds(x) && inBounds(y)).toBe(true);
      }
    }
    expect(drawTemplate(TEMPLATES[0], { ...TEMPLATES[0].design, stages: [] })).toEqual({ strokes: [], parts: [], stageBands: [] });
  });

  it("draws the bottom stage's bells from its engines: the count sets the row, the engine their size", () => {
    const f9 = templateById("falcon9");
    const withEngines = (engine: EngineId, count: number) =>
      applyAction(f9.design, { type: "set-engines", stageIndex: 0, engine, count });
    // The engine row in metres, measured against the first stage's 3.7 m tank.
    const row = (d: Design) => {
      const { parts } = drawTemplate(f9, d);
      const metres = f9.design.diameterM / parts.find((p) => p.kind === "tank" && p.stageIndex === 0)!.box[2];
      const [, , w, h] = parts.find((p) => p.kind === "engine")!.box;
      return { widthM: w * metres, lengthM: (h * metres) / NAPKIN_ASPECT };
    };
    const real = row(f9.design);
    expect(row(withEngines("merlin-1d", 1)).widthM).toBeCloseTo(real.widthM / 3, 1);
    expect(row(withEngines("merlin-1d", 5)).widthM).toBeLessThan(real.widthM);
    expect(row(withEngines("merlin-1d", 13)).widthM).toBeGreaterThan(f9.design.diameterM);
    expect(row(withEngines("raptor-2", 9)).lengthM).toBeGreaterThan(real.lengthM);
    const vacuum = row(withEngines("merlin-vacuum", 8));
    expect(vacuum.widthM).toBeGreaterThan(2 * real.widthM);
    expect(vacuum.lengthM).toBeGreaterThan(real.lengthM);
    // Even absurd swaps stay on the napkin.
    for (const t of TEMPLATES) {
      for (const [engine, count] of [["f-1", 40], ["rutherford", 1]] as const) {
        const d = applyAction(t.design, { type: "set-engines", stageIndex: 0, engine, count });
        for (const s of drawTemplate(t, d).strokes) {
          for (const [x, y] of s.points) expect(inBounds(x) && inBounds(y), `${t.id} ${count}× ${engine}`).toBe(true);
        }
      }
    }
  });
});
