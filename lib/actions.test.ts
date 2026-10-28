import { describe, expect, it } from "vitest";

import { applyAction, seaLevelEngine, structureScale, vacuumOnly } from "./actions";
import type { Design } from "./design";
import { analyze } from "./physics";

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
  it("grows a stated dry mass with the tanks, but only its structure, not the engines", () => {
    const next = applyAction(falconLike(), { type: "scale-tanks", stageIndex: 0, factor: 1.5 });
    expect(next.stages[0].tankVolumeM3).toBe(600);
    const engines = 9 * 470;
    expect(next.stages[0].dryMassKg).toBeCloseTo(engines + (25_000 - engines) * structureScale(1.5), 6);
    expect(next.stages[1]).toEqual(falconLike().stages[1]);
  });

  it("makes structure grow with volume, with a fixed share and a growing penalty past 1.4x", () => {
    expect(structureScale(1)).toBeCloseTo(1, 12);
    // Shrinking keeps the fixed share (thrust structure, avionics).
    expect(structureScale(0.5)).toBeCloseTo(0.575, 12);
    // Up to 1.4x it's proportional; past it, each extra 10% costs more than the last.
    expect(structureScale(1.4)).toBeCloseTo(0.15 + 0.85 * 1.4, 12);
    const step = (f: number) => structureScale(f + 0.1) - structureScale(f);
    expect(step(1.6)).toBeGreaterThan(step(1.4));
    expect(step(1.9)).toBeGreaterThan(step(1.6));
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
  it("puts a 2.5x booster under the rocket with just enough engines for TWR 1.3", () => {
    const design = falconLike();
    const next = applyAction(design, { type: "add-stage" });
    expect(next.stages).toHaveLength(3);
    expect(next.stages[0]).toMatchObject({ label: "Lower booster", propellant: "kerolox", tankVolumeM3: 1000 });
    expect(next.stages.slice(1)).toEqual(design.stages);

    const count = next.stages[0].engines[0].count;
    expect(next.stages[0].engines[0].engine).toBe("merlin-1d");
    expect(analyze(next).liftoffTwr).toBeGreaterThanOrEqual(1.3);
    const oneFewer = { ...next, stages: [{ ...next.stages[0], engines: [{ engine: "merlin-1d" as const, count: count - 1 }] }, ...next.stages.slice(1)] };
    expect(analyze(oneFewer).liftoffTwr).toBeLessThan(1.3);
  });

  it("gives a new booster at least 3 engines and at most 40", () => {
    const single: Design = {
      ...falconLike(),
      stages: [{ label: "Ship", engines: [{ engine: "raptor-3", count: 1 }], propellant: "methalox", tankVolumeM3: 100 }],
    };
    const next = applyAction(single, { type: "add-stage" });
    expect(next.stages[0].label).toBe("Booster");
    expect(next.stages[0].engines[0].engine).toBe("raptor-3");
    expect(next.stages[0].engines[0].count).toBeGreaterThanOrEqual(3);
    expect(next.stages[0].propellant).toBe("methalox");

    const huge: Design = {
      ...falconLike(),
      stages: [{ label: "Ship", engines: [{ engine: "rutherford", count: 1 }], propellant: "kerolox", tankVolumeM3: 5_000 }],
    };
    expect(applyAction(huge, { type: "add-stage" }).stages[0].engines[0].count).toBe(40);
  });

  it("gives a booster under a vacuum-engined stage the sea-level version, so it lifts off", () => {
    const ship: Design = {
      ...falconLike(),
      stages: [{ label: "Ship", engines: [{ engine: "raptor-3", count: 3 }, { engine: "raptor-vacuum", count: 3 }], propellant: "methalox", tankVolumeM3: 1_800 }],
    };
    const next = applyAction(ship, { type: "add-stage" });
    expect(next.stages[0].engines.map((c) => c.engine)).toEqual(["raptor-3", "raptor-3"]);
    expect(analyze(next).liftoffTwr).toBeGreaterThanOrEqual(1.3);
  });
});

describe("seaLevelEngine", () => {
  it("swaps a vacuum-only engine for its sea-level family, or one already on the stage", () => {
    expect(vacuumOnly("merlin-vacuum")).toBe(true);
    expect(vacuumOnly("merlin-1d")).toBe(false);
    expect(seaLevelEngine("merlin-vacuum")).toBe("merlin-1d");
    expect(seaLevelEngine("rutherford-vacuum")).toBe("rutherford");
    expect(seaLevelEngine("raptor-vacuum")).toMatch(/^raptor-\d$/);
    const stage = falconLike().stages[0];
    expect(seaLevelEngine("raptor-vacuum", { ...stage, engines: [{ engine: "raptor-3", count: 33 }] })).toBe("raptor-3");
    // No sea-level RL10, so the hydrolox engine nearest in thrust.
    expect(vacuumOnly(seaLevelEngine("rl10c"))).toBe(false);
    expect(seaLevelEngine("merlin-1d")).toBe("merlin-1d");
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

describe("set-engines on one cluster", () => {
  // Starship's Ship: 3 sea-level Raptors and 3 vacuum Raptors.
  const ship: Design = {
    ...falconLike(),
    stages: [
      {
        label: "Ship",
        engines: [
          { engine: "raptor-2", count: 3 },
          { engine: "raptor-vacuum", count: 3 },
        ],
        propellant: "methalox",
        tankVolumeM3: 1_900,
        dryMassKg: 120_000,
      },
    ],
  };

  it("replaces only that cluster and trades the engines' mass", () => {
    const next = applyAction(ship, { type: "set-engines", stageIndex: 0, clusterIndex: 1, engine: "raptor-vacuum", count: 6 });
    expect(next.stages[0].engines).toEqual([
      { engine: "raptor-2", count: 3 },
      { engine: "raptor-vacuum", count: 6 },
    ]);
    expect(next.stages[0].dryMassKg).toBe(120_000 + 3 * 1_600);
  });

  it("removes a cluster at count 0, but never the stage's last one", () => {
    const fewer = applyAction(ship, { type: "set-engines", stageIndex: 0, clusterIndex: 0, engine: "raptor-2", count: 0 });
    expect(fewer.stages[0].engines).toEqual([{ engine: "raptor-vacuum", count: 3 }]);
    expect(fewer.stages[0].dryMassKg).toBe(120_000 - 3 * 1_630);
    const last = applyAction(fewer, { type: "set-engines", stageIndex: 0, clusterIndex: 0, engine: "raptor-vacuum", count: 0 });
    expect(last.stages[0].engines).toEqual([{ engine: "raptor-vacuum", count: 1 }]);
  });

  it("ignores a cluster that isn't there, and still replaces every cluster without an index", () => {
    expect(applyAction(ship, { type: "set-engines", stageIndex: 0, clusterIndex: 5, engine: "raptor-2", count: 4 })).toEqual(ship);
    const all = applyAction(ship, { type: "set-engines", stageIndex: 0, engine: "raptor-2", count: 6 });
    expect(all.stages[0].engines).toEqual([{ engine: "raptor-2", count: 6 }]);
  });
});

describe("set-recover", () => {
  it("marks one stage to fly back, and back again", () => {
    const landed = applyAction(falconLike(), { type: "set-recover", stageIndex: 0, recover: true });
    expect(landed.stages[0].recover).toBe(true);
    expect(landed.stages[1].recover).toBeUndefined();
    expect(applyAction(landed, { type: "set-recover", stageIndex: 0, recover: false }).stages[0].recover).toBe(false);
    expect(applyAction(landed, { type: "set-recover", stageIndex: 7, recover: true })).toBe(landed);
  });
});
