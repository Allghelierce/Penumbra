import { describe, expect, it } from "vitest";

import { DEMO_SKETCHES } from "../demo-sketches";
import type { Design, DestinationId, EngineId, PropellantId } from "../design";
import { readFromGeometry } from "../sketch/geometry";
import { analyze, DESTINATIONS, ENGINES, PROPELLANT_DENSITY_KG_M3, simulateFlight } from ".";

/** Tank volume that holds a published propellant load. */
function tankFor(propellantKg: number, propellant: PropellantId) {
  return propellantKg / (PROPELLANT_DENSITY_KG_M3[propellant] * 0.95);
}

function stage(label: string, engine: EngineId, count: number, propellant: PropellantId, propellantKg: number, dryMassKg?: number) {
  return { label, engines: [{ engine, count }], propellant, tankVolumeM3: tankFor(propellantKg, propellant), dryMassKg };
}

function design(stages: Design["stages"], payloadMassKg: number, destination: DestinationId): Design {
  return { name: "test", stages, payloadMassKg, destination, features: [], heightM: 50, diameterM: 4 };
}

// Falcon 9 Block 5: 395.7 t first stage and 107.5 t second stage propellant.
const falcon9 = design(
  [stage("Booster", "merlin-1d", 9, "kerolox", 395_700), stage("Stage 2", "merlin-vacuum", 1, "kerolox", 107_500)],
  15_000,
  "leo",
);

// Saturn V: S-IC, S-II and S-IVB loads and dry masses, with a 30 t payload.
const saturnV = design(
  [
    stage("S-IC", "f-1", 5, "kerolox", 2_077_000, 131_000),
    stage("S-II", "j-2", 5, "hydrolox", 443_000, 36_000),
    stage("S-IVB", "j-2", 1, "hydrolox", 109_500, 13_300),
  ],
  30_000,
  "moon-orbit",
);

const tinyHopper = design([stage("Hopper", "rutherford", 1, "kerolox", 900)], 50, "leo");

const overloaded = design([stage("Booster", "merlin-1d", 1, "kerolox", 395_700)], 15_000, "leo");

describe("analyze", () => {
  it("puts a Falcon 9 with 15 t in low Earth orbit", () => {
    const a = analyze(falcon9);
    expect(a.liftoffTwr).toBeGreaterThan(1.2);
    expect(a.liftoffTwr).toBeLessThan(1.6);
    expect(a.totalDeltaVMps).toBeGreaterThan(DESTINATIONS.leo.deltaVFromSurfaceMps);
    expect(a.verdict).toBe("destination");
    expect(a.stages).toHaveLength(2);
  });

  it("sends a Saturn V to lunar orbit", () => {
    const a = analyze(saturnV);
    expect(a.liftoffTwr).toBeGreaterThan(1.1);
    expect(a.verdict).toBe("destination");
    expect(a.marginMps).toBeGreaterThanOrEqual(0);
  });

  it("calls a tiny single-stage rocket suborbital", () => {
    const a = analyze(tinyHopper);
    expect(a.liftoffTwr).toBeGreaterThan(1);
    expect(a.verdict).toBe("suborbital");
    expect(a.furthestReachable).toBeNull();
  });

  it("keeps an overloaded rocket on the pad with no delta-v", () => {
    const a = analyze(overloaded);
    expect(a.liftoffTwr).toBeLessThan(1);
    expect(a.verdict).toBe("stuck-on-pad");
    expect(a.totalDeltaVMps).toBe(0);
    expect(a.findings.join(" ")).toContain("never leaves the pad");
  });

  it("stops short with a verdict of orbit when it reaches LEO but not the destination", () => {
    const a = analyze({ ...falcon9, payloadMassKg: 5_000, destination: "europa" });
    expect(a.verdict).toBe("orbit");
    expect(a.marginMps).toBeLessThan(0);
    expect(a.furthestReachable).not.toBeNull();
  });

  it("writes 2 to 5 findings with numbers in them", () => {
    for (const d of [falcon9, saturnV, tinyHopper, overloaded]) {
      const { findings } = analyze(d);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.length).toBeLessThanOrEqual(5);
      findings.forEach((f) => expect(f).toMatch(/\d/));
    }
  });

  it("can't lift off on vacuum-only engines", () => {
    const a = analyze(design([stage("Ship", "raptor-vacuum", 3, "methalox", 1_000_000)], 0, "leo"));
    expect(a.verdict).toBe("stuck-on-pad");
    expect(a.findings[0]).toContain("vacuum engine");
  });
});

describe("data", () => {
  it("has positive, sourced figures for every engine and destination", () => {
    for (const e of Object.values(ENGINES)) {
      expect(e.thrustVacuumN).toBeGreaterThan(0);
      expect(e.ispVacuumS).toBeGreaterThan(0);
      expect(e.massKg).toBeGreaterThan(0);
      expect(e.thrustSeaLevelN).toBeLessThanOrEqual(e.thrustVacuumN);
      expect(e.source).toMatch(/^https:\/\//);
    }
    for (const d of Object.values(DESTINATIONS)) {
      expect(d.deltaVFromSurfaceMps).toBeGreaterThanOrEqual(DESTINATIONS.leo.deltaVFromSurfaceMps);
      expect(d.source).toMatch(/^https:\/\//);
    }
  });
});

describe("simulateFlight", () => {
  const cases: [string, Design][] = [
    ["Falcon 9", falcon9],
    ["Saturn V", saturnV],
    ["tiny hopper", tinyHopper],
    ["overloaded", overloaded],
    ["short of Europa", { ...falcon9, payloadMassKg: 5_000, destination: "europa" }],
  ];

  it.each(cases)("%s: the outcome matches the verdict", (_, d) => {
    const a = analyze(d);
    const trace = simulateFlight(d, a);
    expect(trace.outcome).toBe(a.verdict);
    expect(Number.isFinite(trace.maxAltitudeKm)).toBe(true);
    for (let i = 1; i < trace.points.length; i++) {
      expect(trace.points[i].tS).toBeGreaterThanOrEqual(trace.points[i - 1].tS);
    }
    for (let i = 1; i < trace.events.length; i++) {
      expect(trace.events[i].tS).toBeGreaterThanOrEqual(trace.events[i - 1].tS);
    }
    trace.events.forEach((e) => expect(e.label.length).toBeGreaterThan(0));
    expect(simulateFlight(d, a)).toEqual(trace);
  });

  it("flies a Falcon 9 through max-q, staging and cutoff into orbit at about 200 km", () => {
    const trace = simulateFlight(falcon9, analyze(falcon9));
    expect(trace.points.length).toBeGreaterThan(250);
    expect(trace.points.length).toBeLessThan(350);
    expect(trace.events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(["liftoff", "max-q", "stage-sep", "engine-cutoff", "orbit"]),
    );
    expect(trace.events.find((e) => e.kind === "max-q")?.tS).toBe(60);
    expect(trace.maxAltitudeKm).toBeCloseTo(200, 0);
  });

  it("cuts the engines at orbital speed for LEO, leaving the rest as margin", () => {
    const trace = simulateFlight(falcon9, analyze(falcon9));
    const maxSpeed = Math.max(...trace.points.map((p) => p.speedMps));
    expect(maxSpeed).toBeLessThanOrEqual(7_800 + 1);
    const orbit = trace.events.find((e) => e.kind === "orbit")!;
    const cutoff = trace.events.find((e) => e.kind === "engine-cutoff")!;
    expect(cutoff.tS).toBeCloseTo(orbit.tS, 6);
    expect(trace.points.find((p) => p.tS >= orbit.tS)?.speedMps).toBeCloseTo(7_800, 0);

    // Lots of margin: cutoff comes well before the propellant runs out.
    const light = { ...falcon9, payloadMassKg: 1_000 };
    const lightTrace = simulateFlight(light, analyze(light));
    expect(Math.max(...lightTrace.points.map((p) => p.speedMps))).toBeLessThanOrEqual(7_800 + 1);
  });

  it("adds only the departure burn on top of orbital speed past LEO", () => {
    const trace = simulateFlight(saturnV, analyze(saturnV));
    const maxSpeed = Math.max(...trace.points.map((p) => p.speedMps));
    expect(maxSpeed).toBeGreaterThan(7_800);
    expect(maxSpeed).toBeLessThanOrEqual(7_800 + 3_260 + 1);
    expect(trace.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["orbit", "engine-cutoff", "arrival"]));
  });

  it("sends a suborbital hop up to apogee and back down", () => {
    const trace = simulateFlight(tinyHopper, analyze(tinyHopper));
    const kinds = trace.events.map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(["fuel-exhausted", "apogee", "impact"]));
    expect(kinds).not.toContain("orbit");
    expect(trace.points.at(-1)?.altitudeKm).toBeCloseTo(0, 3);
    expect(trace.maxAltitudeKm).toBeGreaterThan(0);
  });

  it("emits a single pad failure for a rocket that can't lift off", () => {
    const trace = simulateFlight(overloaded, analyze(overloaded));
    expect(trace.events).toHaveLength(1);
    expect(trace.events[0].kind).toBe("pad-failure");
    expect(trace.maxAltitudeKm).toBe(0);
  });
});

describe("demo sketches", () => {
  const verdictOf = (id: string) => {
    const demo = DEMO_SKETCHES.find((d) => d.id === id)!;
    const reading = readFromGeometry(demo.strokes, demo.destination);
    return analyze(reading.design);
  };

  it("hopper is suborbital", () => {
    expect(verdictOf("napkin-hopper").verdict).toBe("suborbital");
  });

  it("orbiter makes low Earth orbit", () => {
    expect(verdictOf("two-stage-orbiter").verdict).toBe("destination");
  });

  it("mars ship falls short of the Mars surface", () => {
    const a = verdictOf("mars-ship");
    expect(a.liftoffTwr).toBeGreaterThanOrEqual(1);
    expect(a.marginMps).toBeLessThan(0);
  });
});
