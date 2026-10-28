import { describe, expect, it } from "vitest";

import { applyAction } from "./actions";
import type { Design } from "./design";
import { diagnose, sensitivities } from "./diagnosis";
import { analyze } from "./physics";
import { buildReview } from "./redpen";
import { drawTemplate, templateById, TEMPLATES } from "./templates";
import { maxPayloadKg } from "./trade";

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
    expect(dv.why).toMatch(/Total \d+\.\d km\/s\. You need \d+\.\d km\/s to reach orbit, \d+\.\d of it lost to gravity and drag at thrust-to-weight \d\.\d\d\.$/);
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
    expect(dv.why).toMatch(/Hopper: mass ratio \d+\.\d, .* = \d+\.\d km\/s\. You need \d+\.\d km\/s to reach orbit, \d+\.\d of it lost to gravity and drag/);
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

  it("puts a lighter payload first when the rocket could make the trip carrying less", () => {
    const heavy = falconLike({ payloadMassKg: 30_000 });
    const analysis = analyze(heavy);
    const marks = buildReview({ design: heavy, parts: [] }, analysis).marks;
    const [first] = diagnose(heavy, analysis);
    expect(first).toMatchObject({ n: 1, severity: "no-go", title: "Payload too heavy" });
    expect(first.why).toMatch(/^With 30\.0 t aboard it's \d+\.\d km\/s short of orbit\./);
    expect(first.effect).toMatch(/^Carry \d+\.\d t, not 30\.0 t → makes orbit$/);
    expect(first.fix).toEqual(marks[first.markIndex!].fix);
    if (first.fix?.type !== "set-payload") throw new Error("expected set-payload");
    expect(first.fix.payloadMassKg).toBeLessThanOrEqual(maxPayloadKg(heavy));
    expect(analyze(applyAction(heavy, first.fix)).marginMps).toBeGreaterThanOrEqual(0);
  });

  it("says plainly that a vacuum engine can't fire at sea level, and swaps in the sea-level one", () => {
    const vacuum = falconLike({
      stages: [{ ...falconLike().stages[0], engines: [{ engine: "merlin-vacuum", count: 9 }] }, falconLike().stages[1]],
    });
    const [first] = issues(vacuum);
    expect(first).toMatchObject({ severity: "no-go", title: "Vacuum engine on the pad" });
    expect(first.why).toMatch(/^Merlin Vacuum can't fire at sea level: its nozzle is built for vacuum/);
    expect(first.why).not.toMatch(/even empty|too heavy/i);
    expect(first.effect).toMatch(/^Swap to 9 × Merlin 1D → TWR 0\.00 → 1\.\d\d$/);
    expect(first.fix).toEqual({ type: "set-engines", stageIndex: 0, engine: "merlin-1d", count: 9 });
  });

  it("still lists legs and dead-weight fins when the napkin had no room for their marks", () => {
    const crowded = falconLike({
      stages: [{ label: "Booster", engines: [{ engine: "merlin-1d", count: 1 }], propellant: "kerolox", tankVolumeM3: 400 }],
      destination: "moon-surface",
      features: ["fins"],
    });
    const list = issues(crowded);
    expect(list.map((i) => i.title)).toEqual(expect.arrayContaining(["No landing legs", "Fins are dead weight"]));
    expect(list.find((i) => i.title === "Fins are dead weight")?.markIndex).toBeUndefined();
  });

  it("flags a slow upper stage with what its long burn costs, and what one more engine buys", () => {
    // Wide enough for a second Merlin Vacuum's 3.3 m nozzle.
    const slow = falconLike({
      stages: [falconLike().stages[0], { ...falconLike().stages[1], tankVolumeM3: 200, diameterM: 7.2 }],
    });
    const analysis = analyze(slow);
    expect(analysis.stages[1].twrAtIgnition).toBeLessThan(0.5);
    const issue = issues(slow).find((i) => i.title === "Slow Stage 2")!;
    expect(issue.severity).toBe("warning");
    expect(issue.why).toMatch(
      /^Low thrust-to-weight: the Stage 2 lights at 0\.\d\d and fights gravity through its whole \d+-min burn\. That costs \d+\.\d km\/s, already counted in the \d+\.\d km\/s it needs\.$/,
    );
    expect(issue.effect).toMatch(/^\+1 Merlin Vacuum: a \d+-min burn, \d+\.\d km\/s lost instead of \d+\.\d, \+[\d,]+ m\/s of margin$/);
    expect(issue.fix).toEqual({ type: "set-engines", stageIndex: 1, engine: "merlin-vacuum", count: 2, clusterIndex: 0 });
    const gain = Number(issue.effect.match(/\+([\d,]+) m\/s of margin$/)![1].replace(/,/g, ""));
    expect(analyze(applyAction(slow, issue.fix!)).marginMps - analysis.marginMps).toBeCloseTo(gain, -1);
  });

  it("doesn't ask for another upper-stage engine that wouldn't fit", () => {
    // Falcon 9's second stage has room for its one Merlin Vacuum and no more.
    const slow = falconLike({ stages: [falconLike().stages[0], { ...falconLike().stages[1], tankVolumeM3: 200 }] });
    expect(analyze(slow).stages[1].twrAtIgnition).toBeLessThan(0.5);
    expect(issues(slow).map((i) => i.title)).not.toContain("Slow Stage 2");
  });

  it("calls more engines than fit a no-go, with the physics, and judges the rest on the engines that fit", () => {
    const f9 = templateById("falcon9").design;
    const eighteen = applyAction(f9, { type: "set-engines", stageIndex: 0, engine: "merlin-1d", count: 18 });
    const analysis = analyze(eighteen);
    const marks = buildReview({ design: eighteen, parts: [] }, analysis).marks;
    const list = diagnose(eighteen, analysis);
    const [first] = list;
    expect(first).toMatchObject({ n: 1, severity: "no-go", title: "18 Merlin 1D engines don't fit" });
    expect(first.why).toMatch(
      /^Each Merlin 1D nozzle is 0\.92 m across, and the nozzles need room between them\. Packed as tightly as circles go, 9 fit on the First stage's 3\.7 m base; 18 need one about 4\.\d m across\.$/,
    );
    expect(first.effect).toMatch(/^9 × Merlin 1D → fits, TWR \d\.\d\d → 1\.\d\d, [+−±][\d,]+ m\/s of margin$/);
    expect(first.fix).toEqual({ type: "set-engines", stageIndex: 0, engine: "merlin-1d", count: 9 });
    expect(marks[first.markIndex!].fix).toEqual(first.fix);
    // The liftoff check is about the nine that fit, not the eighteen drawn.
    expect(list.find((i) => i.title === "Lifts off")?.why).toMatch(/^With only the engines that fit, 9 × Merlin 1D make /);
  });

  it("finds nothing that doesn't fit on the real rockets", () => {
    for (const id of ["falcon9", "saturn-v", "electron", "starship"] as const) {
      const d = templateById(id).design;
      expect(issues(d).some((i) => /don't fit/.test(i.title)), id).toBe(false);
    }
  });

  it("leaves a slow upper stage alone when another engine wouldn't pay for itself, like the Saturn V's S-IVB", () => {
    const saturn = templateById("saturn-v").design;
    const a = analyze(saturn);
    expect(a.stages[2].twrAtIgnition).toBeLessThan(0.5);
    expect(issues(saturn).map((i) => i.title)).not.toContain("Slow S-IVB");
  });

  it("never claims a flat loss budget", () => {
    for (const d of [falconLike(), stuck, hopper, falconLike({ stages: [falconLike().stages[0], { ...falconLike().stages[1], tankVolumeM3: 250 }] })]) {
      for (const i of issues(d)) expect(`${i.why} ${i.effect}`).not.toMatch(/budget/i);
    }
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

describe("hardware on a real rocket's template", () => {
  const f9 = TEMPLATES.find((t) => t.id === "falcon9")!;
  const toMars: Design = { ...f9.design, destination: "mars-surface", payloadMassKg: 500 };
  const reading = { design: toMars, parts: drawTemplate(f9, toMars).parts, confidence: 1, problem: null };

  it("raises no issue the user can't act on: no 'draw a heat shield' when the drawing can't change", () => {
    const sketch = diagnose(toMars, analyze(toMars), reading);
    expect(sketch.map((i) => i.title)).toContain("No heat shield");
    const template = diagnose(toMars, analyze(toMars), reading, { drawable: false });
    expect(template.map((i) => i.title)).not.toContain("No heat shield");
    for (const issue of template) expect(`${issue.effect} ${issue.why}`).not.toMatch(/\bdraw\b/i);
  });
});
