import { describe, expect, it } from "vitest";

import { applyAction } from "./actions";
import type { Design } from "./design";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** Frozen, so any mutation inside applyAction throws. */
function falconLike(): Design {
  return deepFreeze({
    name: "Napkin Falcon",
    stages: [
      {
        label: "Booster",
        engines: [{ engine: "merlin-1d", count: 9 }],
        propellant: "kerolox",
        tankVolumeM3: 400,
        dryMassKg: 25_000,
      },
      {
        label: "Stage 2",
        engines: [{ engine: "merlin-vacuum", count: 1 }],
        propellant: "kerolox",
        tankVolumeM3: 105,
      },
    ],
    payloadMassKg: 5_000,
    destination: "leo",
    features: ["fins"],
    heightM: 70,
    diameterM: 3.7,
  });
}

describe("scale-tanks", () => {
  it("multiplies tank volume, and dry mass when it's set", () => {
    const next = applyAction(falconLike(), { type: "scale-tanks", stageIndex: 0, factor: 1.5 });
    expect(next.stages[0].tankVolumeM3).toBe(600);
    expect(next.stages[0].dryMassKg).toBe(37_500);
    expect(next.stages[1]).toEqual(falconLike().stages[1]);
  });

  it("leaves an unset dry mass for the physics engine to estimate", () => {
    const next = applyAction(falconLike(), { type: "scale-tanks", stageIndex: 1, factor: 2 });
    expect(next.stages[1].tankVolumeM3).toBe(210);
    expect(next.stages[1]).not.toHaveProperty("dryMassKg");
  });

  it("ignores a missing stage or a factor that isn't positive", () => {
    const design = falconLike();
    expect(applyAction(design, { type: "scale-tanks", stageIndex: 5, factor: 2 })).toBe(design);
    expect(applyAction(design, { type: "scale-tanks", stageIndex: 0, factor: 0 })).toBe(design);
    expect(applyAction(design, { type: "scale-tanks", stageIndex: 0, factor: Number.NaN })).toBe(design);
  });
});

describe("add-stage", () => {
  it("puts a 2.5x booster with 2.5x the engines under the rocket", () => {
    const design = falconLike();
    const next = applyAction(design, { type: "add-stage" });
    expect(next.stages).toHaveLength(3);
    expect(next.stages[0]).toEqual({
      label: "Lower booster",
      engines: [{ engine: "merlin-1d", count: 23 }],
      propellant: "kerolox",
      tankVolumeM3: 1000,
    });
    expect(next.stages.slice(1)).toEqual(design.stages);
  });

  it("gives a new booster at least 3 engines", () => {
    const single: Design = {
      ...falconLike(),
      stages: [{ label: "Ship", engines: [{ engine: "raptor-3", count: 1 }], propellant: "methalox", tankVolumeM3: 100 }],
    };
    const next = applyAction(single, { type: "add-stage" });
    expect(next.stages[0].label).toBe("Booster");
    expect(next.stages[0].engines).toEqual([{ engine: "raptor-3", count: 3 }]);
    expect(next.stages[0].propellant).toBe("methalox");
  });
});

describe("remove-stage", () => {
  it("drops the stage", () => {
    const next = applyAction(falconLike(), { type: "remove-stage", stageIndex: 0 });
    expect(next.stages.map((s) => s.label)).toEqual(["Stage 2"]);
  });

  it("never removes the last stage", () => {
    const one = applyAction(falconLike(), { type: "remove-stage", stageIndex: 0 });
    expect(applyAction(one, { type: "remove-stage", stageIndex: 0 })).toBe(one);
  });
});

describe("set-engines", () => {
  it("replaces the stage's engines", () => {
    const next = applyAction(falconLike(), { type: "set-engines", stageIndex: 0, engine: "raptor-3", count: 33 });
    expect(next.stages[0].engines).toEqual([{ engine: "raptor-3", count: 33 }]);
    expect(next.stages[0].tankVolumeM3).toBe(400);
  });

  it("rounds to a whole number of engines, at least one", () => {
    const design = falconLike();
    expect(applyAction(design, { type: "set-engines", stageIndex: 1, engine: "rl10c", count: 2.6 }).stages[1].engines[0].count).toBe(3);
    expect(applyAction(design, { type: "set-engines", stageIndex: 1, engine: "rl10c", count: 0 }).stages[1].engines[0].count).toBe(1);
  });
});

describe("payload, destination, launch and review", () => {
  it("sets the payload and destination", () => {
    const design = falconLike();
    expect(applyAction(design, { type: "set-payload", payloadMassKg: 12_000 }).payloadMassKg).toBe(12_000);
    expect(applyAction(design, { type: "set-destination", destination: "mars-surface" }).destination).toBe("mars-surface");
  });

  it("returns the design unchanged for launch and review", () => {
    const design = falconLike();
    expect(applyAction(design, { type: "launch" })).toBe(design);
    expect(applyAction(design, { type: "review" })).toBe(design);
  });
});
