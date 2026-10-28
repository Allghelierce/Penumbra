import { describe, expect, it } from "vitest";

import type { Design, DestinationId, FlightPoint, FlightTrace, PropellantId, Stage } from "../design";
import { analyze, DESTINATIONS, PROPELLANT_DENSITY_KG_M3, simulateFlight } from ".";

/** Tank volume whose usable propellant (95% of density) is `usableKg`. */
function tankVolumeM3(usableKg: number, propellant: PropellantId): number {
  return usableKg / (PROPELLANT_DENSITY_KG_M3[propellant] * 0.95);
}

function stage(
  label: string,
  engine: Stage["engines"][number]["engine"],
  count: number,
  propellant: PropellantId,
  usableKg: number,
  dryMassKg: number,
): Stage {
  return {
    label,
    engines: [{ engine, count }],
    propellant,
    tankVolumeM3: tankVolumeM3(usableKg, propellant),
    dryMassKg,
  };
}

function design(stages: Stage[], payloadMassKg: number, destination: DestinationId, name: string): Design {
  return { name, stages, payloadMassKg, destination, features: [], heightM: 70, diameterM: 10 };
}

// Falcon 9. Wikipedia "Falcon 9": first-stage empty mass 22,200 kg, second-stage empty
// mass 4,000 kg. Usable propellant 395,700 kg and 107,500 kg (published Falcon 9 loads).
const falcon9 = design(
  [
    stage("Booster", "merlin-1d", 9, "kerolox", 395_700, 22_200),
    stage("Stage 2", "merlin-vacuum", 1, "kerolox", 107_500, 4_000),
  ],
  15_000,
  "leo",
  "Falcon 9",
);

// Saturn V. S-IC propellant 2,077,000 kg (4,578,000 lb) and dry mass 131,000 kg.
// S-II 443,000 kg propellant and 36,000 kg dry. S-IVB 109,500 kg propellant and
// 13,300 kg dry. 45 t is an Apollo CSM + LM translunar load: enough for TLI, not
// lunar orbit. 30 t is light enough for the S-IVB to finish lunar orbit insertion.
const saturnStages = [
  stage("S-IC", "f-1", 5, "kerolox", 2_077_000, 131_000),
  stage("S-II", "j-2", 5, "hydrolox", 443_000, 36_000),
  stage("S-IVB", "j-2", 1, "hydrolox", 109_500, 13_300),
];
const saturnApollo = design(saturnStages, 45_000, "moon-orbit", "Saturn V");
const saturnMoon = design(saturnStages, 30_000, "moon-orbit", "Saturn V");

const tiny = design([stage("Hopper", "rutherford", 1, "kerolox", 400, 200)], 20, "leo", "Hopper");

const overloaded = design(
  [stage("Booster", "merlin-1d", 1, "kerolox", 20_000, 5_000)],
  10_000_000,
  "leo",
  "Overloaded",
);

// A 1 t probe on Falcon 9 has the speed for trans-Mars injection.
const falcon9Mars: Design = { ...falcon9, payloadMassKg: 1_000, destination: "mars-transfer", name: "Falcon 9 to Mars" };

// A Saturn V with a Centaur on top (RL10C, 20,800 kg of propellant, 2,250 kg dry) sends 1 t to Europa.
const saturnEuropa = design(
  [...saturnStages, stage("Centaur", "rl10c", 1, "hydrolox", 20_800, 2_250)],
  1_000,
  "europa",
  "Saturn V + Centaur",
);

const designs = [falcon9, saturnApollo, saturnMoon, tiny, overloaded, falcon9Mars, saturnEuropa];

/** Speed the trace is not allowed to fly past: 7.8 km/s, plus the departure burn beyond LEO. */
function traceSpeedCap(destination: DestinationId): number {
  if (destination === "moon-orbit" || destination === "moon-surface") return 7_800 + 3_145;
  if (destination === "mars-transfer" || destination === "mars-surface") return 7_800 + 3_610;
  if (destination === "europa") return 7_800 + 6_300;
  return 7_800;
}

describe("analyze", () => {
  it("puts a Falcon 9 with 15 t into low Earth orbit", () => {
    const analysis = analyze(falcon9);
    expect(analysis.liftoffTwr).toBeGreaterThan(1);
    expect(analysis.totalDeltaVMps).toBeGreaterThanOrEqual(DESTINATIONS.leo.deltaVFromSurfaceMps);
    expect(analysis.verdict).toBe("destination");
  });

  it("sends an Apollo-class Saturn V only as far as translunar injection", () => {
    const analysis = analyze(saturnApollo);
    const tli = DESTINATIONS.leo.deltaVFromSurfaceMps + 3_260;
    expect(analysis.verdict).toBe("orbit");
    expect(analysis.totalDeltaVMps).toBeGreaterThanOrEqual(tli);
    expect(analysis.totalDeltaVMps).toBeLessThan(DESTINATIONS["moon-orbit"].deltaVFromSurfaceMps);
  });

  it("puts a Saturn V with 30 t into lunar orbit", () => {
    const analysis = analyze(saturnMoon);
    expect(analysis.verdict).toBe("destination");
    expect(analysis.totalDeltaVMps).toBeGreaterThanOrEqual(DESTINATIONS["moon-orbit"].deltaVFromSurfaceMps);
  });

  it("calls a tiny single-stage rocket suborbital", () => {
    const analysis = analyze(tiny);
    expect(analysis.verdict).toBe("suborbital");
    expect(analysis.furthestReachable).toBeNull();
    expect(analysis.totalDeltaVMps).toBeLessThan(DESTINATIONS.leo.deltaVFromSurfaceMps);
    expect(analysis.liftoffTwr).toBeGreaterThanOrEqual(1);
  });

  it("keeps an overloaded rocket on the pad", () => {
    const analysis = analyze(overloaded);
    expect(analysis.liftoffTwr).toBeLessThan(1);
    expect(analysis.totalDeltaVMps).toBe(0);
    expect(analysis.furthestReachable).toBeNull();
    expect(analysis.verdict).toBe("stuck-on-pad");
  });
});

describe("simulateFlight", () => {
  it("matches the verdict, repeats, and stays inside the trace rules", () => {
    for (const rocket of designs) {
      const analysis = analyze(rocket);
      const trace = simulateFlight(rocket, analysis);
      expect(trace.outcome).toBe(analysis.verdict);
      expect(simulateFlight(rocket, analysis)).toEqual(trace);
      expect(analysis.findings.length).toBeGreaterThanOrEqual(2);
      expect(analysis.findings.length).toBeLessThanOrEqual(5);

      if (analysis.verdict === "stuck-on-pad") {
        expect(trace.events.filter((event) => event.kind === "pad-failure")).toHaveLength(1);
        expect(trace.points).toHaveLength(1);
        continue;
      }

      expect(trace.points.length).toBeGreaterThanOrEqual(290);
      expect(trace.points.length).toBeLessThanOrEqual(310);
      for (let i = 1; i < trace.points.length; i++) {
        expect(trace.points[i].tS).toBeGreaterThanOrEqual(trace.points[i - 1].tS);
      }
      const cap = traceSpeedCap(rocket.destination);
      for (const point of trace.points) {
        expect(point.speedMps).toBeGreaterThanOrEqual(0);
        expect(point.speedMps).toBeLessThanOrEqual(cap + 1e-6);
      }
      for (const event of trace.events) {
        expect(event.label).toMatch(/\d/);
      }

      const kinds = trace.events.map((event) => event.kind);
      if (analysis.verdict === "suborbital") {
        expect(kinds).toContain("apogee");
        expect(kinds).toContain("impact");
        expect(kinds).not.toContain("orbit");
        expect(trace.points[trace.points.length - 1].altitudeKm).toBe(0);
        expect(trace.maxAltitudeKm).toBeGreaterThanOrEqual(200);
        expect(trace.maxAltitudeKm).toBeLessThanOrEqual(250);
        expect(trace.events.find((event) => event.kind === "apogee")?.label).toMatch(/Apogee \d+ km/);
      } else {
        const orbit = trace.events.find((event) => event.kind === "orbit");
        const cutoff = trace.events.find((event) => event.kind === "engine-cutoff" && event.tS === orbit?.tS);
        expect(orbit).toBeTruthy();
        expect(cutoff).toBeTruthy();
        expect(kinds).not.toContain("impact");
        expect(kinds).not.toContain("fuel-exhausted");
        expect(kinds).not.toContain("apogee");
        if (rocket.destination === "leo" || rocket.destination === "gto") {
          expect(orbit?.label).toMatch(/Orbit: 200 km, 7\.8 km\/s/);
        }
      }
    }
  });
});

describe("simulateFlight past low Earth orbit", () => {
  const MU = 3.986004418e14;
  const EARTH_RADIUS_M = 6_371_000;
  const MOON_ALTITUDE_KM = 384_400 - 6_371;
  /** The departure burn's cutoff (the last cutoff) and the coast after it. */
  const departure = (trace: FlightTrace) => {
    const burn = trace.events.filter((e) => e.kind === "engine-cutoff").at(-1)!;
    return { burn, coast: trace.points.filter((p) => p.tS > burn.tS) };
  };
  /** Orbital energy per kilogram, which a coast on gravity alone keeps. */
  const energy = (p: FlightPoint) => p.speedMps ** 2 / 2 - MU / (EARTH_RADIUS_M + p.altitudeKm * 1000);

  it("parks in orbit, burns for the Moon, and coasts 3 days out to the Moon's distance", () => {
    const trace = simulateFlight(saturnMoon, analyze(saturnMoon));
    const orbit = trace.events.find((e) => e.kind === "orbit")!;
    expect(orbit.label).toBe("Parking orbit: 200 km, 7.8 km/s");
    const { burn, coast } = departure(trace);
    expect(burn.label).toBe("Trans-lunar injection: 10.9 km/s at 200 km");
    expect(burn.tS - orbit.tS).toBeGreaterThan(1_800);

    const arrival = trace.events.at(-1)!;
    expect(arrival.kind).toBe("arrival");
    expect(arrival.label).toBe("Reaches the Moon's distance, 3.0 days after the burn");
    const days = (arrival.tS - burn.tS) / 86_400;
    expect(days).toBeGreaterThan(2.7);
    expect(days).toBeLessThan(3.3);
    expect(trace.maxAltitudeKm).toBeCloseTo(MOON_ALTITUDE_KM, 0);
    expect(trace.points.at(-1)!.tS).toBe(arrival.tS);

    // Climbing and slowing all the way, on one orbit.
    expect(coast.length).toBeGreaterThan(50);
    for (let i = 1; i < coast.length; i++) {
      expect(coast[i].altitudeKm).toBeGreaterThan(coast[i - 1].altitudeKm);
      expect(coast[i].speedMps).toBeLessThan(coast[i - 1].speedMps);
      expect(energy(coast[i]) / energy(coast[0])).toBeCloseTo(1, 5);
    }
  });

  it("sends Mars and Europa probes past the Moon's distance and out to a million km, without claiming arrival", () => {
    for (const [rocket, trip] of [
      [falcon9Mars, "~8.5-month coast to Mars"],
      [saturnEuropa, "~2.7-year coast to Jupiter"],
    ] as const) {
      const analysis = analyze(rocket);
      expect(analysis.verdict, rocket.name).toBe("destination");
      const trace = simulateFlight(rocket, analysis);
      expect(trace.maxAltitudeKm).toBeGreaterThan(384_400);
      expect(trace.maxAltitudeKm).toBeCloseTo(1_000_000, 0);
      expect(trace.events.map((e) => e.kind)).not.toContain("arrival");
      for (const e of trace.events) expect(e.label).not.toMatch(/arriv/i);

      const passes = trace.events.find((e) => /^Passes the Moon's distance, \d+ hours after the burn$/.test(e.label));
      expect(passes?.kind, rocket.name).toBe("escape");
      expect(trace.points.find((p) => p.tS === passes!.tS)!.altitudeKm).toBeCloseTo(MOON_ALTITUDE_KM, 0);

      const last = trace.events.at(-1)!;
      expect(last.kind).toBe("escape");
      expect(last.label.startsWith("Leaving Earth at ")).toBe(true);
      expect(last.label.endsWith(` km/s · ${trip}`)).toBe(true);
      const { coast } = departure(trace);
      for (const p of coast) expect(energy(p) / energy(coast[0])).toBeCloseTo(1, 5);
    }
    // Past escape speed, a probe for Jupiter leaves at the Hohmann excess speed, 8.8 km/s.
    expect(simulateFlight(saturnEuropa, analyze(saturnEuropa)).events.at(-1)!.label).toMatch(/^Leaving Earth at 8\.8 km\/s/);
  });

  it("keeps a rocket that can't finish the trip in its parking orbit", () => {
    const analysis = analyze(saturnApollo);
    expect(analysis.verdict).toBe("orbit");
    const trace = simulateFlight(saturnApollo, analysis);
    expect(trace.maxAltitudeKm).toBe(200);
    expect(trace.events.at(-1)!.kind).toBe("orbit");
    expect(trace.events.some((e) => /injection/.test(e.label))).toBe(false);
  });
});
