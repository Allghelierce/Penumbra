import { describe, expect, it } from "vitest";

import { applyAction } from "./actions";
import { NAPKIN_ASPECT, type Design, type Part, type RedPenMark, type SketchReading } from "./design";
import { analyze } from "./physics";
import { buildReview } from "./redpen";
import { TEMPLATES } from "./templates";
import { maxPayloadKg, MIN_LIFTOFF_TWR } from "./trade";

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

const FIN_BOX: Part["box"] = [0.34, 0.66, 0.32, 0.14];
const ENGINE_BOX: Part["box"] = [0.43, 0.78, 0.14, 0.06];

/** A tidy napkin drawing of a two-stage rocket, booster tank biggest. */
function partsFor(design: Design): Part[] {
  const parts: Part[] = [
    { kind: "nose", label: "nose", box: [0.42, 0.06, 0.16, 0.08], stageIndex: 1 },
    { kind: "payload", label: "payload", box: [0.42, 0.14, 0.16, 0.08], stageIndex: 1 },
    { kind: "tank", label: "upper tank", box: [0.42, 0.22, 0.16, 0.16], stageIndex: 1 },
    { kind: "tank", label: "booster tank", box: [0.42, 0.4, 0.16, 0.38], stageIndex: 0 },
    { kind: "engine", label: "engines", box: ENGINE_BOX, stageIndex: 0 },
  ];
  if (design.features.includes("fins")) parts.push({ kind: "fin", label: "fins", box: FIN_BOX, stageIndex: 0 });
  return parts;
}

function review(design: Design, parts = partsFor(design)) {
  const reading: SketchReading = { design, parts };
  const analysis = analyze(design);
  return { analysis, review: buildReview(reading, analysis) };
}

function notes(marks: RedPenMark[]) {
  return marks.map((m) => m.note);
}

/** Heaviest payload that still leaves the design `marginMps` short or better. */
function withMargin(design: Design, marginMps: number): Design {
  let lo = 0;
  let hi = 500_000;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (analyze({ ...design, payloadMassKg: mid }).marginMps > marginMps) lo = mid;
    else hi = mid;
  }
  return { ...design, payloadMassKg: hi };
}

/** The overlay draws circles with ry = 0.85 rx; every mark has to land on the napkin. */
function expectOnNapkin(mark: RedPenMark) {
  const inside = ([x, y]: [number, number]) => {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(1);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(1);
  };
  if (mark.kind === "circle") {
    const [cx, cy] = mark.center;
    const ry = mark.radius * 0.85 * NAPKIN_ASPECT;
    expect(mark.radius).toBeGreaterThan(0);
    inside([cx - mark.radius, cy - ry]);
    inside([cx + mark.radius, cy + ry]);
  } else if (mark.kind === "arrow") {
    inside(mark.from);
    inside(mark.to);
    // The overlay writes the note away from the arrowhead: start-anchored when the tail points
    // right, end-anchored when it points left, centered when the arrow is mostly vertical.
    const width = mark.note.length * 0.017;
    const dx = mark.from[0] - mark.to[0];
    const awayX = dx / Math.hypot(dx, mark.from[1] - mark.to[1]);
    if (awayX > 0.25) expect(mark.from[0] + width).toBeLessThanOrEqual(1);
    else if (awayX < -0.25) expect(mark.from[0] - width).toBeGreaterThanOrEqual(0);
    else {
      inside([mark.from[0] - width / 2, mark.from[1]]);
      inside([mark.from[0] + width / 2, mark.from[1]]);
    }
  } else if (mark.kind === "ghost-line") {
    expect(mark.points.length).toBeGreaterThan(1);
    mark.points.forEach(inside);
  } else if (mark.kind === "tick") {
    // The overlay draws the check about 0.03 left of `at` and writes the note rightward from 0.053.
    inside([mark.at[0] - 0.03, mark.at[1]]);
    expect(mark.at[0] + 0.053 + mark.note.length * 0.017).toBeLessThanOrEqual(1);
  }
}

describe("a rocket that works", () => {
  it("gets one check mark at mid-height on the open side, noting what it has to spare", () => {
    const { analysis, review: r } = review(falconLike());
    expect(analysis.liftoffTwr).toBeGreaterThanOrEqual(1.2);
    expect(analysis.marginMps).toBeGreaterThanOrEqual(0);

    expect(r.marks).toHaveLength(1);
    const tick = r.marks[0];
    expect(tick.kind).toBe("tick");
    expect(tick.note).toMatch(/^(\d+\.\d km\/s spare|Good to fly)$/);
    expect(tick.fix).toBeUndefined();
    if (tick.kind === "tick") {
      // Right of the drawing (x 0.42 to 0.58), level with its middle (y 0.06 to 0.84).
      expect(tick.at[0] - 0.03).toBeGreaterThan(0.58);
      expect(tick.at[1]).toBeCloseTo(0.45, 2);
    }
    expectOnNapkin(tick);
    expect(r.summary).toMatch(/^\d+\.\d of \d+\.\d km\/s: it reaches low Earth orbit with \d+\.\d km\/s to spare\.$/);
  });

  it("checks off every real rocket as flown, the Saturn V's 1.18 liftoff included", () => {
    for (const t of TEMPLATES) {
      const { analysis, review: r } = review(t.design, []);
      expect(r.marks.map((m) => m.kind), t.id).toEqual(["tick"]);
      expect(analysis.liftoffTwr, t.id).toBeGreaterThanOrEqual(MIN_LIFTOFF_TWR);
    }
  });

  it("puts the check on the left, clear of the drawing, when the rocket sits on the right", () => {
    const right = partsFor(falconLike()).map((p): Part => ({ ...p, box: [p.box[0] + 0.3, p.box[1], p.box[2], p.box[3]] }));
    const [tick] = review(falconLike(), right).review.marks;
    expect(tick.kind).toBe("tick");
    if (tick.kind === "tick") expect(tick.at[0] + 0.053 + tick.note.length * 0.017).toBeLessThanOrEqual(0.72);
    expectOnNapkin(tick);
  });
});

describe("a rocket stuck on the pad", () => {
  const stuck = falconLike({
    stages: [
      { label: "Booster", engines: [{ engine: "merlin-1d", count: 1 }], propellant: "kerolox", tankVolumeM3: 400 },
      falconLike().stages[1],
    ],
  });

  it("points at the engines with the exact number of engines it needs for TWR 1.3", () => {
    const { analysis, review: r } = review(stuck);
    expect(analysis.liftoffTwr).toBeLessThan(1);

    const mark = r.marks[0];
    expect(mark.kind).toBe("arrow");
    // "TWR 0.21: +6 engines", or just "+6 engines" when the long form doesn't fit.
    const match = mark.note.match(/^(?:TWR \d\.\d{2,4}: )?\+(\d+) engines?$/);
    expect(match).not.toBeNull();
    const extra = Number(match![1]);

    const twrWith = (count: number) =>
      analyze(applyAction(stuck, { type: "set-engines", stageIndex: 0, engine: "merlin-1d", count })).liftoffTwr;
    expect(twrWith(1 + extra)).toBeGreaterThanOrEqual(1.3);
    expect(twrWith(extra)).toBeLessThan(1.3);

    // Points at the engines, not somewhere else on the rocket.
    if (mark.kind === "arrow") {
      expect(mark.to[1]).toBeCloseTo(ENGINE_BOX[1] + ENGINE_BOX[3] / 2, 2);
      expect(mark.to[0]).toBeCloseTo(ENGINE_BOX[0] + ENGINE_BOX[2], 2);
    }
    expect(r.summary).toContain("never leaves the pad");
    expect(r.summary).toContain(`add ${extra} engine`);

    // Tapping the note applies exactly that edit.
    expect(mark.fix).toEqual({ type: "set-engines", stageIndex: 0, engine: "merlin-1d", count: 1 + extra });
    expect(analyze(applyAction(stuck, mark.fix!)).liftoffTwr).toBeGreaterThanOrEqual(1.3);
  });
});

describe("a rocket short of its destination", () => {
  it("asks for the smallest tank stretch that closes the gap", () => {
    // Plenty of thrust, so a stretched booster still clears the pad.
    const strong = falconLike({
      stages: [
        { label: "Booster", engines: [{ engine: "merlin-1d", count: 15 }], propellant: "kerolox", tankVolumeM3: 400 },
        falconLike().stages[1],
      ],
    });
    const design = withMargin(strong, -300);
    const { analysis, review: r } = review(design);
    expect(analysis.marginMps).toBeLessThan(0);

    const mark = r.marks.find((m) => m.note.startsWith("stretch"));
    expect(mark?.kind).toBe("arrow");
    const percent = Number(mark!.note.match(/^stretch \+(\d+)%$/)![1]);
    expect(percent).toBeGreaterThan(0);
    expect(percent).toBeLessThanOrEqual(150);

    const stretched = (p: number) =>
      analyze(applyAction(design, { type: "scale-tanks", stageIndex: 0, factor: 1 + p / 100 }));
    expect(stretched(percent).marginMps).toBeGreaterThanOrEqual(0);
    expect(stretched(percent - 1).marginMps).toBeLessThan(0);

    // Points at the booster tank, the biggest one drawn.
    if (mark?.kind === "arrow") {
      expect(mark.to[1]).toBeGreaterThan(0.4);
      expect(mark.to[1]).toBeLessThan(0.78);
    }
    // Its payload is what's over, so carrying less comes first and the stretch is the other way.
    expect(r.marks[0].fix?.type).toBe("set-payload");
    expect(r.summary).toMatch(new RegExp(`^\\d+\\.\\d of \\d+\\.\\d km/s: carry at most [\\d.]+ t, or stretch the tanks ${percent}%`));

    expect(mark!.fix).toEqual({ type: "scale-tanks", stageIndex: 0, factor: 1 + percent / 100 });
    expect(analyze(applyAction(design, mark!.fix!)).marginMps).toBeGreaterThanOrEqual(0);
  });

  it("outlines a new stage when +150% tanks still fall short, and only if the stage helps", () => {
    const singleStage = falconLike({ stages: [falconLike().stages[0]], destination: "mars-surface" });
    const { analysis, review: r } = review(singleStage, [
      { kind: "tank", label: "tank", box: [0.42, 0.3, 0.16, 0.48], stageIndex: 0 },
      { kind: "engine", label: "engines", box: ENGINE_BOX, stageIndex: 0 },
    ]);
    const maxStretch = analyze(applyAction(singleStage, { type: "scale-tanks", stageIndex: 0, factor: 2.5 }));
    expect(maxStretch.marginMps).toBeLessThan(0);

    const staged = analyze(applyAction(singleStage, { type: "add-stage" }));
    expect(staged.totalDeltaVMps).toBeGreaterThan(analysis.totalDeltaVMps);

    const ghost = r.marks.find((m) => m.kind === "ghost-line");
    expect(ghost?.note).toMatch(/^(add a stage|a stage isn't enough)$/);
    expect(ghost?.fix).toEqual({ type: "add-stage" });
    // Hangs below the rocket's bottom edge.
    if (ghost?.kind === "ghost-line") {
      expect(Math.max(...ghost.points.map((p) => p[1]))).toBeGreaterThan(0.84);
    }
  });
});

describe("fins", () => {
  it("points at the fins when the destination is past low Earth orbit", () => {
    const { review: r } = review(falconLike({ features: ["fins"], destination: "gto" }));
    const mark = r.marks.find((m) => m.note === "useless in vacuum");
    expect(mark?.kind).toBe("arrow");
    if (mark?.kind === "arrow") {
      expect([FIN_BOX[0], FIN_BOX[0] + FIN_BOX[2]]).toContainEqual(expect.closeTo(mark.to[0], 5));
      expect(mark.to[1]).toBeCloseTo(FIN_BOX[1] + FIN_BOX[3] / 2, 2);
    }
  });

  it("leaves fins alone for low Earth orbit and for Mars, which has air", () => {
    for (const destination of ["leo", "mars-surface"] as const) {
      const { review: r } = review(falconLike({ features: ["fins"], destination }));
      expect(notes(r.marks)).not.toContain("useless in vacuum");
    }
  });
});

describe("landing", () => {
  it("asks for legs and a heat shield on a Mars landing", () => {
    const { review: r } = review(falconLike({ destination: "mars-surface" }));
    expect(notes(r.marks)).toEqual(expect.arrayContaining(["needs legs", "heat shield!"]));
  });

  it("asks only for legs on the Moon", () => {
    const { review: r } = review(falconLike({ destination: "moon-surface" }));
    expect(notes(r.marks)).toContain("needs legs");
    expect(notes(r.marks)).not.toContain("heat shield!");
  });

  it("is satisfied once the sketch has them", () => {
    const { review: r } = review(falconLike({ destination: "mars-surface", features: ["landing-legs", "heat-shield"] }));
    expect(notes(r.marks)).not.toContain("needs legs");
    expect(notes(r.marks)).not.toContain("heat shield!");
  });
});

describe("every review", () => {
  const everythingWrong = falconLike({
    stages: [{ label: "Booster", engines: [{ engine: "merlin-1d", count: 1 }], propellant: "kerolox", tankVolumeM3: 400 }],
    destination: "moon-surface",
    features: ["fins"],
  });
  const shifted = (dx: number, dy: number) =>
    partsFor(everythingWrong).map((p): Part => ({ ...p, box: [p.box[0] + dx, p.box[1] + dy, p.box[2], p.box[3]] }));
  const filling = partsFor(everythingWrong).map((p): Part => ({
    ...p,
    box: [p.box[0] * 0.2, p.box[1], p.box[2] * 5, p.box[3] * 1.2],
  }));

  const cases: [string, Design, Part[] | undefined][] = [
    ["works", falconLike(), undefined],
    ["everything wrong", everythingWrong, undefined],
    ["no parts read", everythingWrong, []],
    ["drawn at the right edge", everythingWrong, shifted(0.5, 0)],
    ["drawn off the bottom", everythingWrong, shifted(0, 0.2)],
    ["drawn huge", everythingWrong, filling],
    ["mars, no legs", falconLike({ destination: "mars-surface", features: ["fins"] }), shifted(-0.4, 0)],
  ];

  it.each(cases)("%s: has 1 to 3 marks of a few words, all on the napkin", (_, design, parts) => {
    const { review: r } = review(design, parts);
    expect(r.marks.length).toBeGreaterThanOrEqual(1);
    expect(r.marks.length).toBeLessThanOrEqual(3);
    r.marks.forEach(expectOnNapkin);
    r.marks.forEach((m) => expect(m.kind).not.toBe("circle"));
    r.marks.forEach((m) => expect(m.note.length).toBeGreaterThan(0));
    r.marks.forEach((m) => expect(m.note.split(" ").length, m.note).toBeLessThanOrEqual(4));
    expect(r.summary).toMatch(/\.$/);
  });

  it.each(cases)("%s: marks only what teaches: corrections, or a lone check mark", (_, design, parts) => {
    const kinds = review(design, parts).review.marks.map((m) => m.kind);
    // No part outlines, spec callouts, part labels or dimensions.
    for (const kind of kinds) expect(["arrow", "ghost-line", "tick"]).toContain(kind);
    if (kinds.includes("tick")) expect(kinds).toEqual(["tick"]);
  });

  it("brings arrows in from the open side of the napkin, never across the rocket", () => {
    const mars = falconLike({ destination: "mars-surface" });
    for (const [parts, side] of [[partsFor(mars), 1], [shifted(0.3, 0), -1]] as const) {
      const { marks } = review(mars, [...parts]).review;
      // The legs arrow switches sides to stay clear of a new-stage outline (tested below).
      const hasGhost = marks.some((m) => m.kind === "ghost-line");
      const arrows = marks.filter((m) => m.kind === "arrow" && !(hasGhost && m.note === "needs legs"));
      expect(arrows.length).toBeGreaterThan(0);
      for (const a of arrows) if (a.kind === "arrow") expect(Math.sign(a.from[0] - a.to[0])).toBe(side);
    }
  });

  it("only offers tap-to-fix on marks with a concrete edit", () => {
    const advisory = ["useless in vacuum", "needs legs", "heat shield!"];
    for (const d of [falconLike(), everythingWrong, falconLike({ destination: "mars-surface", features: ["fins"] })]) {
      for (const m of review(d).review.marks) {
        if (advisory.includes(m.note) || m.kind === "tick") expect(m.fix).toBeUndefined();
      }
    }
  });

  it("keeps the no-gos when there are more than three things to mark", () => {
    // Stuck on the pad, short of the Moon, no legs, and fins: the fins (dead weight, not a no-go) give way.
    const notes = review(everythingWrong).review.marks.map((m) => m.note);
    expect(notes).toHaveLength(3);
    expect(notes).toContain("needs legs");
    expect(notes).not.toContain("useless in vacuum");
  });

  it("stacks issue notes on each side at least a line apart, even when they crowd the engines", () => {
    const crowdedBottom = partsFor(everythingWrong).map((p): Part => ({ ...p, box: [p.box[0], p.box[1] + 0.12, p.box[2], p.box[3]] }));
    for (const [design, parts] of [
      [everythingWrong, crowdedBottom],
      [falconLike({ stages: [falconLike().stages[0]], destination: "moon-surface" }), partsFor(everythingWrong)],
      [falconLike({ destination: "mars-surface" }), undefined],
    ] as const) {
      const marks = review(design, parts ? [...parts] : undefined).review.marks;
      for (const side of [-1, 1]) {
        const rows = marks.flatMap((m) =>
          m.kind === "arrow" && Math.sign(m.from[0] - m.to[0]) === side
            ? [m.from[1]]
            : m.kind === "ghost-line" && Math.sign(m.points.at(-1)![0] - m.points[0][0]) === side
              ? [m.points.at(-1)![1] + 0.025]
              : [],
        );
        rows.sort((a, b) => a - b);
        for (let i = 1; i < rows.length; i++) expect(rows[i] - rows[i - 1]).toBeGreaterThanOrEqual(0.055 - 1e-9);
      }
    }
  });

  it("never reports a shortfall of 0.0 km/s", () => {
    for (const [, d, parts] of cases) {
      expect(review(d, parts).review.summary).not.toMatch(/0\.0 km\/s short/);
    }
  });

  it("is deterministic", () => {
    expect(review(everythingWrong).review).toEqual(review(everythingWrong).review);
  });
});

describe("a payload heavier than the rocket can carry", () => {
  const heavy = falconLike({ payloadMassKg: 30_000 });

  it("asks for the lighter payload first: the most it can carry, pointed at the payload", () => {
    const { analysis, review: r } = review(heavy);
    expect(analysis.marginMps).toBeLessThan(0);
    const max = maxPayloadKg(heavy);
    expect(max).toBeGreaterThan(0);

    const [first] = r.marks;
    expect(first.kind).toBe("arrow");
    expect(first.note).toMatch(/^max \d+\.\d t$/);
    const fix = first.fix;
    if (fix?.type !== "set-payload") throw new Error("expected set-payload");
    // Floored to what the note shows, so it never asks for more than the rocket carries.
    expect(first.note).toBe(`max ${(fix.payloadMassKg / 1000).toFixed(1)} t`);
    expect(fix.payloadMassKg).toBeLessThanOrEqual(max);
    expect(fix.payloadMassKg).toBeGreaterThan(max - 100);
    const after = analyze(applyAction(heavy, fix));
    expect(after.marginMps).toBeGreaterThanOrEqual(0);
    expect(after.liftoffTwr).toBeGreaterThanOrEqual(MIN_LIFTOFF_TWR);
    if (first.kind === "arrow") expect(first.to[1]).toBeCloseTo(0.18, 2);
    expect(r.summary).toMatch(/^\d+\.\d of \d+\.\d km\/s: carry at most \d+\.\d t/);
  });

  it("isn't offered when no payload would do, or the payload already fits", () => {
    const hopeless = falconLike({ stages: [falconLike().stages[0]], destination: "mars-surface" });
    for (const d of [falconLike(), hopeless, falconLike({ payloadMassKg: 0, destination: "europa" })]) {
      expect(review(d).review.marks.some((m) => m.fix?.type === "set-payload")).toBe(false);
    }
  });
});

describe("a vacuum engine on the bottom stage", () => {
  const vacuumBooster = falconLike({
    stages: [{ ...falconLike().stages[0], engines: [{ engine: "merlin-vacuum", count: 9 }] }, falconLike().stages[1]],
  });

  it("says plainly it can't fire at sea level, and swaps in the sea-level engine", () => {
    const { analysis, review: r } = review(vacuumBooster);
    expect(analysis.liftoffTwr).toBe(0);
    const [mark] = r.marks;
    expect(mark.note).toMatch(/^(vacuum-only: )?use Merlin 1D$/);
    expect(mark.fix).toEqual({ type: "set-engines", stageIndex: 0, engine: "merlin-1d", count: 9 });
    if (mark.kind === "arrow") expect(mark.to[1]).toBeCloseTo(ENGINE_BOX[1] + ENGINE_BOX[3] / 2, 2);
    expect(analyze(applyAction(vacuumBooster, mark.fix!)).liftoffTwr).toBeGreaterThanOrEqual(1.3);
    expect(r.summary).toBe(
      "Merlin Vacuum can't fire at sea level: its nozzle is built for vacuum, so it never leaves the pad. Swap in 9 Merlin 1D engines.",
    );
  });

  it("adds engines to the swap when the drawn count can't lift it", () => {
    const one = falconLike({ stages: [{ ...falconLike().stages[0], engines: [{ engine: "merlin-vacuum", count: 1 }] }, falconLike().stages[1]] });
    const fix = review(one).review.marks[0].fix;
    if (fix?.type !== "set-engines") throw new Error("expected set-engines");
    expect(fix.engine).toBe("merlin-1d");
    const twrWith = (count: number) => analyze(applyAction(one, { ...fix, count })).liftoffTwr;
    expect(twrWith(fix.count)).toBeGreaterThanOrEqual(1.3);
    expect(twrWith(fix.count - 1)).toBeLessThan(1.3);
  });
});
