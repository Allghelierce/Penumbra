import { describe, expect, it } from "vitest";

import { applyAction } from "./actions";
import { NAPKIN_ASPECT, type Design, type Part, type RedPenMark, type SketchReading } from "./design";
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
    // The note is written outward from the tail; it needs room on the napkin.
    const width = mark.note.length * 0.018;
    const outward = Math.sign(mark.from[0] - mark.to[0]);
    if (outward > 0) expect(mark.from[0] + width).toBeLessThanOrEqual(1);
    if (outward < 0) expect(mark.from[0] - width).toBeGreaterThanOrEqual(0);
  } else {
    expect(mark.points.length).toBeGreaterThan(1);
    mark.points.forEach(inside);
  }
}

describe("a rocket that works", () => {
  it("gets one circle around the whole rocket saying it flies", () => {
    const { analysis, review: r } = review(falconLike());
    expect(analysis.liftoffTwr).toBeGreaterThanOrEqual(1);
    expect(analysis.marginMps).toBeGreaterThanOrEqual(0);

    expect(r.marks).toHaveLength(1);
    expect(r.marks[0]).toMatchObject({ kind: "circle", note: "flies!" });
    expect(r.summary).toMatch(/^\d+\.\d of \d+\.\d km\/s: it reaches low Earth orbit with \d+\.\d km\/s to spare\.$/);
  });
});

describe("a rocket stuck on the pad", () => {
  const stuck = falconLike({
    stages: [
      { label: "Booster", engines: [{ engine: "merlin-1d", count: 1 }], propellant: "kerolox", tankVolumeM3: 400 },
      falconLike().stages[1],
    ],
  });

  it("circles the engines with the exact number of engines it needs for TWR 1.3", () => {
    const { analysis, review: r } = review(stuck);
    expect(analysis.liftoffTwr).toBeLessThan(1);

    const mark = r.marks[0];
    expect(mark.kind).toBe("circle");
    const match = mark.note.match(/^TWR (\d\.\d+): needs (\d+) more engines?$/);
    expect(match).not.toBeNull();
    const extra = Number(match![2]);

    const twrWith = (count: number) =>
      analyze(applyAction(stuck, { type: "set-engines", stageIndex: 0, engine: "merlin-1d", count })).liftoffTwr;
    expect(twrWith(1 + extra)).toBeGreaterThanOrEqual(1.3);
    expect(twrWith(extra)).toBeLessThan(1.3);

    // Drawn on the engines, not somewhere else on the rocket.
    if (mark.kind === "circle") {
      expect(mark.center[0]).toBeCloseTo(ENGINE_BOX[0] + ENGINE_BOX[2] / 2, 1);
      expect(mark.center[1]).toBeGreaterThan(0.7);
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
    expect(r.summary).toMatch(new RegExp(`^\\d+\\.\\d of \\d+\\.\\d km/s: stretch the tanks ${percent}%`));

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
  it("circles the fins when the destination is past low Earth orbit", () => {
    const { review: r } = review(falconLike({ features: ["fins"], destination: "gto" }));
    const mark = r.marks.find((m) => m.note === "fins do nothing in vacuum");
    expect(mark?.kind).toBe("circle");
    if (mark?.kind === "circle") {
      expect(mark.center[0]).toBeCloseTo(FIN_BOX[0] + FIN_BOX[2] / 2, 2);
      expect(mark.center[1]).toBeCloseTo(FIN_BOX[1] + FIN_BOX[3] / 2, 2);
    }
  });

  it("leaves fins alone for low Earth orbit and for Mars, which has air", () => {
    for (const destination of ["leo", "mars-surface"] as const) {
      const { review: r } = review(falconLike({ features: ["fins"], destination }));
      expect(notes(r.marks)).not.toContain("fins do nothing in vacuum");
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

  it.each(cases)("%s: has 1 to 4 marks, all on the napkin", (_, design, parts) => {
    const { review: r } = review(design, parts);
    expect(r.marks.length).toBeGreaterThanOrEqual(1);
    expect(r.marks.length).toBeLessThanOrEqual(4);
    r.marks.forEach(expectOnNapkin);
    r.marks.forEach((m) => expect(m.note.length).toBeGreaterThan(0));
    expect(r.summary).toMatch(/\.$/);
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
    const advisory = ["flies!", "fins do nothing in vacuum", "needs legs", "heat shield!"];
    for (const d of [falconLike(), everythingWrong, falconLike({ destination: "mars-surface", features: ["fins"] })]) {
      for (const m of review(d).review.marks) {
        if (advisory.includes(m.note)) expect(m.fix).toBeUndefined();
      }
    }
  });

  it("brings the legs arrow in from the other side of a new-stage outline", () => {
    const { review: r } = review(falconLike({ stages: [falconLike().stages[0]], destination: "moon-surface" }));
    const ghost = r.marks.find((m) => m.kind === "ghost-line");
    const legs = r.marks.find((m) => m.note === "needs legs");
    expect(ghost && legs).toBeTruthy();
    if (ghost?.kind === "ghost-line" && legs?.kind === "arrow") {
      const ghostSide = Math.sign(ghost.points.at(-1)![0] - ghost.points[0][0]);
      expect(Math.sign(legs.from[0] - legs.to[0])).toBe(-ghostSide);
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
