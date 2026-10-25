import { describe, expect, it } from "vitest";

import { applyAction } from "./actions";
import type { Design } from "./design";
import { diagnose, sensitivities } from "./diagnosis";
import { analyze } from "./physics";
import { buildReview } from "./redpen";

function falconLike(overrides: Partial<Design> = {}): Design {
  return {
    name: "Napkin Falcon",
    stages: [
      { label: "Booster", engines: [{ engine: "merlin-1d", count: 9 }], propellant: "kerolox", tankVolumeM3: 400 },
      { label: "Stage 2", engines: [{ engine: "merlin-vacuum", count: 1 }], propellant: "kerolox", tankVolumeM3: 105 },
    ],
    payloadMassKg: 1_000,
    destination: "leo",
    features: [],
    heightM: 70,
    diameterM: 3.7,
    ...overrides,
  };
}

const stuck = falconLike({
  stages: [
    { label: "Booster", engines: [{ engine: "merlin-1d", count: 1 }], propellant: "kerolox", tankVolumeM3: 400 },
    falconLike().stages[1],
  ],
});
const hopper = falconLike({ stages: [{ ...falconLike().stages[0], label: "Hopper" }] });

function issues(design: Design) {
  return diagnose(design, analyze(design));
}

describe("diagnose", () => {
  it("passes a rocket that works, explaining both checks with its numbers", () => {
    const list = issues(falconLike());
    expect(list.every((i) => i.severity === "ok")).toBe(true);
    const liftoff = list.find((i) => i.title === "Lifts off")!;
    expect(liftoff.why).toMatch(/9 × Merlin 1D make [\d,]+ t-force of thrust against [\d,]+ t on the pad, so thrust-to-weight is \d\.\d\d/);
    const dv = list.find((i) => i.title === "Enough delta-v")!;
    expect(dv.why).toMatch(/Booster: mass ratio \d+\.\d, it burns [\d,]+ t of [\d,]+ t, \d+ s × 9\.81 × ln \d+\.\d = \d+\.\d km\/s\./);
    expect(dv.why).toMatch(/Total \d+\.\d km\/s\. You need 9\.4 km\/s to reach orbit\.$/);
    expect(dv.effect).toMatch(/^\d+\.\d km\/s to spare$/);
  });

  it("calls a rocket that can't lift off a no-go, with the exact engine fix and its effect", () => {
    const list = issues(stuck);
    const first = list[0];
    expect(first).toMatchObject({ n: 1, severity: "no-go", title: "Can't lift off" });
    expect(first.why).toMatch(/Below 1\.0, weight beats thrust/);
    expect(first.fix?.type).toBe("set-engines");
    expect(first.effect).toMatch(/^\+\d+ Merlin 1D engines? → TWR 0\.\d\d → 1\.\d\d$/);
    expect(analyze(applyAction(stuck, first.fix!)).liftoffTwr).toBeGreaterThanOrEqual(1.3);
  });

  it("explains a shortfall with the rocket equation, and its fix really closes it", () => {
    const list = issues(hopper);
    const dv = list.find((i) => /short of orbit/.test(i.title))!;
    expect(dv.severity).toBe("no-go");
    expect(dv.why).toMatch(/Hopper: mass ratio \d+\.\d, .* = \d+\.\d km\/s\. You need 9\.4 km\/s to reach orbit\.$/);
    expect(dv.effect).toMatch(/→ \+\d+\.\d km\/s → makes orbit$/);
    const after = analyze(applyAction(hopper, dv.fix!));
    expect(after.marginMps).toBeGreaterThanOrEqual(0);
    expect(after.liftoffTwr).toBeGreaterThanOrEqual(1);
  });

  it("links each issue to its red-pen mark", () => {
    const design = falconLike({ destination: "mars-surface", features: ["fins"] });
    const analysis = analyze(design);
    const marks = buildReview({ design, parts: [] }, analysis).marks;
    for (const issue of diagnose(design, analysis)) {
      if (issue.markIndex === undefined) continue;
      const mark = marks[issue.markIndex];
      expect(mark).toBeDefined();
      if (issue.title === "No landing legs") expect(mark.note).toBe("needs legs");
      if (issue.title === "No heat shield") expect(mark.note).toBe("heat shield!");
      if (issue.fix) expect(mark.fix).toEqual(issue.fix);
    }
    const titles = diagnose(design, analysis).map((i) => i.title);
    expect(titles).toEqual(expect.arrayContaining(["No landing legs", "No heat shield"]));
  });

  it("orders no-gos first, then warnings, then passes, numbered from 1", () => {
    const rank = { "no-go": 0, warning: 1, ok: 2 };
    for (const design of [stuck, hopper, falconLike(), falconLike({ destination: "moon-surface", features: ["fins"] })]) {
      const list = issues(design);
      list.forEach((issue, i) => {
        expect(issue.n).toBe(i + 1);
        if (i > 0) expect(rank[issue.severity]).toBeGreaterThanOrEqual(rank[list[i - 1].severity]);
        expect(issue.why).toMatch(/\d/);
      });
    }
  });
});

describe("sensitivities", () => {
  const list = sensitivities(falconLike());
  const value = (label: string) => list.find((s) => s.label === label)?.value ?? "";
  const mps = (text: string) => {
    const m = text.match(/([+−±])([\d,]+) m\/s/);
    return m ? (m[1] === "−" ? -1 : 1) * Number(m[2].replace(/,/g, "")) : NaN;
  };

  it("prices payload and dry mass in m/s, and upper-stage mass costs far more than booster mass", () => {
    expect(value("Payload")).toMatch(/^\+1 t → −[\d,]+ m\/s$/);
    const upper = mps(value("Stage 2 dry mass"));
    const booster = mps(value("Booster dry mass"));
    expect(upper).toBeLessThan(0);
    expect(Math.abs(upper)).toBeGreaterThan(Math.abs(booster) * 3);
  });

  it("matches a direct re-run of the physics", () => {
    const base = analyze(falconLike()).totalDeltaVMps;
    const heavier = analyze(falconLike({ payloadMassKg: 2_000 })).totalDeltaVMps;
    expect(mps(value("Payload"))).toBe(Math.round(heavier - base));
  });

  it("gives tank and engine trades", () => {
    expect(value("Booster tanks")).toMatch(/^\+10% → [+−±][\d,]+ m\/s$/);
    expect(value("Booster engines")).toMatch(/^\+1 Merlin 1D → TWR \+\d\.\d{3}, [+−±][\d,]+ m\/s$/);
  });
});
