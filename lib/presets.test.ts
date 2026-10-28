import { describe, expect, it } from "vitest";

import type { Design, PropellantId } from "./design";
import { flyAsRealRocket, launchRecord } from "./presets";

function sketch(stages: number, engines: number, heightM: number, propellant: PropellantId = "kerolox"): Design {
  return {
    name: "doodle",
    destination: "gto",
    payloadMassKg: 1,
    heightM,
    diameterM: 3,
    features: [],
    stages: Array.from({ length: stages }, (_, i) => ({
      label: `Stage ${i + 1}`,
      engines: [{ engine: i === 0 ? "merlin-1d" : "merlin-vacuum", count: i === 0 ? engines : 1 }],
      propellant,
      tankVolumeM3: 10,
    })),
  };
}

describe("flyAsRealRocket", () => {
  it("copies Saturn V hardware onto a three-stage doodle and keeps the destination", () => {
    const flown = flyAsRealRocket(sketch(3, 5, 110));
    expect(flown.name).toBe("Saturn V");
    expect(flown.destination).toBe("gto");
    expect(flown.payloadMassKg).toBe(43_500);
    expect(flown.stages[0].engines[0]).toEqual({ engine: "f-1", count: 5 });
    expect(flown.stages[0].dryMassKg).toBe(137_000);
  });

  it("picks Starship for a tall two-stage stack with many engines", () => {
    const flown = flyAsRealRocket(sketch(2, 33, 120, "methalox"));
    expect(flown.name).toBe("Starship");
    expect(flown.stages[0].engines[0].count).toBe(33);
  });

  it("picks Falcon 9 for a two-stage rocket the size of Falcon 9", () => {
    expect(flyAsRealRocket(sketch(2, 9, 70)).name).toBe("Falcon 9 Block 5");
  });

  it("picks Electron for a small rocket", () => {
    expect(flyAsRealRocket(sketch(1, 9, 18)).name).toBe("Electron");
  });

  it("has a real launch record for every preset", () => {
    for (const name of ["Falcon 9 Block 5", "Saturn V", "Starship", "Electron"]) {
      expect(launchRecord(name)).toMatch(/\d/);
    }
  });
});
