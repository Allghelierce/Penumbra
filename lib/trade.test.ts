import { describe, expect, it } from "vitest";

import { applyAction } from "./actions";
import type { Design } from "./design";
import { analyze, ascentLossesMps, enginesThatFit } from "./physics";
import { TEMPLATES } from "./templates";
import {
  capacityText,
  explainCurve,
  maxPayloadKg,
  MIN_LIFTOFF_TWR,
  realStageFor,
  recoveryCostKg,
  shownKg,
  stretchFromReal,
  tradeCurve,
} from "./trade";

const template = (id: string) => TEMPLATES.find((t) => t.id === id)!;
const withRecovery = (d: Design, stages: number[]): Design => ({
  ...d,
  stages: d.stages.map((s, i) => ({ ...s, recover: stages.includes(i) })),
});
const within = (value: number, target: number, tolerance = 0.25) => {
  expect(value).toBeGreaterThanOrEqual(target * (1 - tolerance));
  expect(value).toBeLessThanOrEqual(target * (1 + tolerance));
};

describe("maxPayloadKg against the real rockets (±25% where the comparison is like for like)", () => {
  it("Falcon 9: 22.8 t expended, and 17.4 t with the booster landing on a drone ship", () => {
    const f9 = template("falcon9");
    within(maxPayloadKg(withRecovery(f9.design, []), "leo"), f9.realPayloadLeoKg);
    within(maxPayloadKg(withRecovery(f9.design, [0]), "leo"), f9.realPayloadLeoReusableKg ?? 17_400);
  });

  it("Saturn V: 140 t to LEO counts the S-IVB and its leftover propellant; 48.6 t to translunar injection", () => {
    const saturn = template("saturn-v");
    const sivbDry = saturn.design.stages.at(-1)!.dryMassKg!;
    within(maxPayloadKg(saturn.design, "leo") + sivbDry, saturn.realPayloadLeoKg);
    // Translunar injection: the most payload with 3,260 m/s left after reaching LEO.
    const tli = bisect((kg) => {
      const a = analyze({ ...saturn.design, destination: "leo", payloadMassKg: kg });
      return a.liftoffTwr >= MIN_LIFTOFF_TWR && a.marginMps >= 3_260;
    });
    within(tli, 48_600);
  });

  it("Electron: 300 kg", () => {
    const electron = template("electron");
    within(maxPayloadKg(electron.design, "leo"), electron.realPayloadLeoKg);
  });

  it("Starship: the published 35 t (both stages recovered) is far below what its published masses allow", () => {
    // SpaceX's figure folds in early-block shortfalls and conservative margins the model doesn't
    // know about; with the published masses and both landing reserves, the physics allows far more.
    const starship = template("starship");
    expect(starship.design.stages.every((s) => s.recover)).toBe(true);
    expect(maxPayloadKg(starship.design, "leo")).toBeGreaterThan(starship.realPayloadLeoKg);
  });

  it("carries less to harder destinations, and nothing it can't reach", () => {
    const f9 = template("falcon9").design;
    const leo = maxPayloadKg(f9, "leo");
    const gto = maxPayloadKg(f9, "gto");
    expect(gto).toBeGreaterThan(0);
    expect(gto).toBeLessThan(leo);
    expect(maxPayloadKg(template("electron").design, "europa")).toBe(0);
  });

  it("is what the rocket really lifts: at that payload it reaches LEO at a safe liftoff, and 2% more doesn't", () => {
    const f9 = template("falcon9").design;
    const kg = maxPayloadKg(f9, "leo");
    const at = analyze({ ...f9, destination: "leo", payloadMassKg: kg });
    expect(at.marginMps).toBeGreaterThanOrEqual(0);
    expect(at.liftoffTwr).toBeGreaterThanOrEqual(MIN_LIFTOFF_TWR);
    expect(analyze({ ...f9, destination: "leo", payloadMassKg: kg * 1.02 }).marginMps).toBeLessThan(0);
  });
});

describe("physics realism", () => {
  it("needs a realistic 8.5 to 10.5 km/s for LEO, more of it lost the lower the thrust-to-weight", () => {
    for (const t of TEMPLATES) {
      const a = analyze({ ...t.design, destination: "leo", payloadMassKg: maxPayloadKg(t.design, "leo") });
      expect(a.requiredDeltaVMps, t.id).toBeGreaterThan(8_500);
      expect(a.requiredDeltaVMps, t.id).toBeLessThan(10_500);
    }
    const f9 = template("falcon9").design;
    const loss = (engines: number) => {
      const d = applyAction(f9, { type: "set-engines", stageIndex: 0, engine: "merlin-1d", count: engines });
      return ascentLossesMps(d, analyze(d).stages).reduce((a, b) => a + b, 0);
    };
    expect(loss(8)).toBeGreaterThan(loss(9));
    expect(loss(9)).toBeGreaterThan(loss(12));
  });

  it("adds the destination legs on top of the design's own LEO requirement", () => {
    const f9 = template("falcon9").design;
    const leo = analyze({ ...f9, destination: "leo" }).requiredDeltaVMps;
    expect(analyze({ ...f9, destination: "gto" }).requiredDeltaVMps - leo).toBeCloseTo(2_440, 6);
    expect(analyze({ ...f9, destination: "moon-orbit" }).requiredDeltaVMps - leo).toBeCloseTo(3_940, 6);
  });

  it("keeps a recovered stage's landing reserve unburned, and charges its recovery hardware", () => {
    const f9 = template("falcon9").design;
    const thrown = analyze(withRecovery(f9, [])).stages[0];
    const landed = analyze(withRecovery(f9, [0])).stages[0];
    expect(landed.propellantMassKg).toBeCloseTo(thrown.propellantMassKg * 0.92, 3);
    expect(landed.dryMassKg).toBeGreaterThan(thrown.dryMassKg);
    expect(landed.deltaVMps).toBeLessThan(thrown.deltaVMps);
    expect(recoveryCostKg(withRecovery(f9, [0]), "leo")).toBeGreaterThan(4_000);
  });
});

describe("tradeCurve", () => {
  const stretchBest = (id: string, stageIndex: number) =>
    tradeCurve(template(id).design, { kind: "tank-stretch", stageIndex }, { destination: "leo" });

  it("puts the real rocket at 1×, on the max payload, with a real interior peak", () => {
    for (const t of TEMPLATES) {
      t.design.stages.forEach((_, stageIndex) => {
        const curve = stretchBest(t.id, stageIndex);
        expect(curve.realX).toBe(1);
        const real = curve.points.find((p) => p.x === 1)!;
        expect(real.payloadKg).toBe(maxPayloadKg(t.design, "leo"));
        const best = curve.points.find((p) => p.x === curve.bestX)!;
        expect(best.payloadKg).toBeGreaterThanOrEqual(real.payloadKg);
        // A peak, not a slope running off the end of the sweep.
        expect(curve.points.at(-1)!.payloadKg, `${t.id} stage ${stageIndex}`).toBeLessThan(best.payloadKg);
      });
    }
  });

  it("peaks near the real first stage: within 1.0–1.3× for Falcon 9, Saturn V and Starship", () => {
    for (const id of ["falcon9", "saturn-v", "starship"]) {
      const { bestX } = stretchBest(id, 0);
      expect(bestX, id).toBeGreaterThanOrEqual(1);
      expect(bestX, id).toBeLessThanOrEqual(1.3);
    }
    // Electron lifts off at thrust-to-weight 1.8, so a longer first stage keeps paying until the
    // safe-liftoff floor: its peak sits further out.
    expect(stretchBest("electron", 0).bestX).toBeLessThanOrEqual(1.6);
  });

  it("peaks at or below the real upper stage", () => {
    for (const t of TEMPLATES) expect(stretchBest(t.id, t.design.stages.length - 1).bestX, t.id).toBeLessThanOrEqual(1.1);
  });

  it("sweeps engine counts from one up to as many as fit on the base, with nothing at too few to lift off", () => {
    const f9 = template("falcon9").design;
    const curve = tradeCurve(f9, { kind: "engine-count", stageIndex: 0 }, { destination: "leo" });
    expect(curve.realX).toBe(9);
    expect(curve.unit).toBe("engines");
    expect(curve.points[0].x).toBe(1);
    expect(curve.points[0].payloadKg).toBe(0);
    expect(curve.points.find((p) => p.x === 9)!.payloadKg).toBe(maxPayloadKg(f9, "leo"));
    // Nine Merlins fill Falcon 9's 3.7 m base, so the sweep stops there.
    expect(curve.points.at(-1)!.x).toBe(9);
    expect(curve.limit).toEqual({ x: 9, engine: "Merlin 1D", diameterM: 3.7 });
    // Super Heavy's 33 Raptors fill its 9 m base.
    expect(tradeCurve(template("starship").design, { kind: "engine-count", stageIndex: 0 }, { destination: "leo" }).points.at(-1)!.x).toBe(33);
  });

  it("measures an upper stage's room on its own diameter: the S-IVB's 6.6 m, not the Saturn V's 10.1 m", () => {
    const saturn = template("saturn-v").design;
    expect(saturn.stages[2].diameterM).toBe(6.6);
    const curve = tradeCurve(saturn, { kind: "engine-count", stageIndex: 2 }, { destination: "leo" });
    const fits = enginesThatFit("j-2", 6.6)!;
    expect(fits).toBeLessThan(enginesThatFit("j-2", 10.1)!);
    expect(curve.limit).toEqual({ x: fits, engine: "J-2", diameterM: 6.6 });
    expect(curve.points.at(-1)!.x).toBe(fits);
  });

  it("measures your stretch against the real tanks, so the penalty never compounds", () => {
    const real = template("falcon9").design;
    // Two drags of 1.25× each, built from the real stage, equal one 1.5625× stretch.
    const once = stretchFromReal(real, real, 0, 1.5625);
    const twice = stretchFromReal(stretchFromReal(real, real, 0, 1.25), real, 0, 1.5625);
    expect(twice).toEqual(once);
    expect(once).toEqual(applyAction(real, { type: "scale-tanks", stageIndex: 0, factor: 1.5625 }));
    // A booster added underneath doesn't confuse which real stage the second stage came from.
    const stacked = applyAction(real, { type: "add-stage" });
    expect(realStageFor(stacked, real, 2)).toBe(real.stages[1]);
    expect(realStageFor(stacked, real, 1)).toBe(real.stages[0]);
  });
});

describe("enginesThatFit", () => {
  it("fits every real rocket's engines on its base, and not one more on Falcon 9 or Super Heavy", () => {
    for (const t of TEMPLATES) {
      t.design.stages.forEach((stage, i) => {
        stage.engines.forEach((cluster, c) => {
          const fit = enginesThatFit(cluster.engine, t.design.diameterM, stage.engines.filter((_, k) => k !== c));
          if (fit === null) return;
          expect(fit, `${t.id} stage ${i} ${cluster.engine}`).toBeGreaterThanOrEqual(cluster.count);
        });
      });
    }
    expect(enginesThatFit("merlin-1d", 3.7)).toBe(9);
    expect(enginesThatFit("raptor-2", 9)).toBe(33);
    // Saturn V's five F-1s hang past its 10.1 m base under engine fairings, so they fit as flown,
    // though packing alone seats four; a narrower base gets no such allowance.
    expect(enginesThatFit("f-1", 10.1)).toBe(5);
    expect(enginesThatFit("f-1", 10)).toBe(4);
    // The Ship's three vacuum Raptors take room the sea-level ones can't use.
    expect(enginesThatFit("raptor-2", 9, [{ engine: "raptor-vacuum", count: 3 }])).toBeLessThan(33);
    expect(enginesThatFit("rutherford-vacuum", 1.2)).toBeNull();
  });
});

describe("explainCurve", () => {
  it("says where the best point is and why, in a sentence or two", () => {
    const curve = tradeCurve(template("falcon9").design, { kind: "tank-stretch", stageIndex: 0 }, { destination: "leo" });
    const text = explainCurve(curve);
    expect(text).toMatch(/^The most payload is at 1\.\d\d×: \d+(\.\d)? t, \d+% more than the real \d+(\.\d)? t\./);
    expect(text).toMatch(/thrust-to-weight/);
  });

  it("says when no more engines fit on the base", () => {
    const curve = tradeCurve(template("falcon9").design, { kind: "engine-count", stageIndex: 0 }, { destination: "leo" });
    expect(explainCurve(curve)).toBe(
      "The real rocket already carries the most: 23.1 t at 9 engines. Fewer carry less, and 9 Merlin 1D engines are all that fit on its 3.7 m base.",
    );
  });

  it("shows masses under 100 t to a tenth, so close ones read apart", () => {
    const f9 = withRecovery(template("falcon9").design, [0]);
    const text = explainCurve(tradeCurve(f9, { kind: "tank-stretch", stageIndex: 0 }, { destination: "leo" }));
    expect(text).toMatch(/^The most payload is at 1\.\d\d×: 18\.0 t, 3% more than the real 17\.5 t\./);
  });

  it("says when the real rocket is already at the peak", () => {
    const curve = tradeCurve(template("saturn-v").design, { kind: "tank-stretch", stageIndex: 0 }, { destination: "leo" });
    expect(explainCurve(curve)).toMatch(/^The real rocket already sits at the peak/);
  });

  it("adds what landing the recovered stages costs", () => {
    const starship = template("starship").design;
    const curve = tradeCurve(starship, { kind: "tank-stretch", stageIndex: 0 }, { destination: "leo" });
    expect(explainCurve(curve, { design: starship })).toMatch(/Landing the Super Heavy and the Ship costs about \d+ t of payload\.$/);
  });
});

function bisect(ok: (kg: number) => boolean): number {
  let lo = 0;
  let hi = 1_000;
  while (ok(hi)) {
    lo = hi;
    hi *= 2;
  }
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

describe("capacityText", () => {
  it("rounds down: a tenth of a tonne under 100 t, whole tonnes above, kilograms under a tonne", () => {
    expect(capacityText(23_170)).toBe("23.1 t");
    expect(capacityText(17_500)).toBe("17.5 t");
    expect(capacityText(17_499)).toBe("17.4 t");
    expect(capacityText(99_999)).toBe("99.9 t");
    expect(capacityText(100_000)).toBe("100 t");
    expect(capacityText(120_700)).toBe("120 t");
    expect(capacityText(1_234_567)).toBe("1,234 t");
    expect(capacityText(999.9)).toBe("999 kg");
    expect(capacityText(354.9)).toBe("354 kg");
    expect(capacityText(-5)).toBe("0 kg");
  });

  it("gives the shown figure as a number too, for setting a payload to it or comparing two", () => {
    expect(shownKg(23_190)).toBe(23_100);
    expect(shownKg(22_960)).toBe(22_900);
    expect(shownKg(23_190) - shownKg(22_960)).toBe(200);
    expect(shownKg(135_918)).toBe(135_000);
    expect(shownKg(354.9)).toBe(354);
    expect(shownKg(-1)).toBe(0);
    for (const kg of [0, 999, 1_000, 17_518, 99_999, 100_000, 151_292]) {
      const text = capacityText(kg);
      expect(parseFloat(text.replace(/,/g, "")) * (text.endsWith(" t") ? 1000 : 1)).toBeCloseTo(shownKg(kg), 6);
    }
  });

  it("shows only capacities the rocket can carry: each real rocket's max, as shown, still makes it", () => {
    const shown = (text: string) => parseFloat(text.replace(/,/g, "")) * (text.endsWith(" t") ? 1000 : 1);
    for (const t of TEMPLATES) {
      for (const design of [t.design, withRecovery(t.design, [])]) {
        const max = maxPayloadKg(design, "leo");
        const kg = shown(capacityText(max));
        expect(kg, t.id).toBeLessThanOrEqual(max);
        const a = analyze({ ...design, destination: "leo", payloadMassKg: kg });
        expect(a.marginMps, t.id).toBeGreaterThanOrEqual(0);
        expect(a.liftoffTwr, t.id).toBeGreaterThanOrEqual(MIN_LIFTOFF_TWR);
      }
    }
  });
});
