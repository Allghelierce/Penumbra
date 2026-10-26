import type { HistoricMission } from "./design";

// The comeback flights that followed each failure in lib/missions.ts.
// Well-established facts only; approximate figures are marked "≈".
export const SUCCESS_MISSIONS: HistoricMission[] = [
  // https://en.wikipedia.org/wiki/Falcon_1#Flight_4
  {
    id: "falcon1-f4",
    sketchId: "napkin-hopper",
    vehicle: "Falcon 1",
    mission: "Flight 4 · RatSat",
    date: "2008-09-28",
    site: "Omelek Island, Kwajalein Atoll",
    destination: "leo",
    outcome: "success",
    failure: null,
    timeline: [
      { tS: 0, altitudeKm: 0, speedMps: 0, kind: "liftoff", event: "Liftoff" },
      { tS: 70, altitudeKm: 12, speedMps: 500, kind: "max-q", event: "Max-Q" },
      { tS: 160, altitudeKm: 80, speedMps: 2600, kind: "stage-sep", event: "Stage separation" },
      { tS: 560, altitudeKm: 330, speedMps: 7700, kind: "orbit", event: "Orbit: the first private liquid-fuel rocket to get there" },
    ],
    rootCause: "Three failures in, every fix held: stainless fittings, a reworked stage separation, and a longer pause before the second stage lit.",
    whatChanged: "This flight proved the fixes. It reached orbit carrying a mass simulator called RatSat.",
    returnToFlight: "Falcon 1's success led to NASA's cargo contract and to Falcon 9.",
    stats: [
      { label: "Attempt", value: "4th", meaning: "Three failures came first." },
      { label: "Result", value: "Orbit", meaning: "The first privately developed liquid-fuel rocket to reach Earth orbit." },
      { label: "After flight 1", value: "2.5 years", meaning: "From the fuel-fitting fire to orbit." },
    ],
    sources: [{ title: "Falcon 1 (Wikipedia)", url: "https://en.wikipedia.org/wiki/Falcon_1" }],
  },
  // https://en.wikipedia.org/wiki/Falcon_9_flight_20
  {
    id: "og2",
    sketchId: "two-stage-orbiter",
    vehicle: "Falcon 9",
    mission: "Orbcomm OG2 · Flight 20",
    date: "2015-12-21",
    site: "Cape Canaveral SLC-40",
    destination: "leo",
    outcome: "success",
    failure: null,
    timeline: [
      { tS: 0, altitudeKm: 0, speedMps: 0, kind: "liftoff", event: "Liftoff: return to flight after CRS-7" },
      { tS: 70, altitudeKm: 11, speedMps: 450, kind: "max-q", event: "Max-Q" },
      { tS: 145, altitudeKm: 70, speedMps: 1700, kind: "stage-sep", event: "Stage separation; the booster turns back" },
      { tS: 600, altitudeKm: 600, speedMps: 7400, event: "Booster lands at Landing Zone 1" },
      { tS: 620, altitudeKm: 620, speedMps: 7500, kind: "orbit", event: "Orbit: 11 Orbcomm satellites deployed" },
    ],
    rootCause: "The redesigned second-stage struts held, and the first stage flew back and landed upright.",
    whatChanged: "The first time an orbital-class booster landed after a launch, which made reuse real.",
    returnToFlight: "Booster landings became routine and Falcon 9 boosters now fly dozens of times.",
    stats: [
      { label: "After CRS-7", value: "6 months", meaning: "The strut fix and return to flight." },
      { label: "Satellites", value: "11", meaning: "All deployed to orbit." },
      { label: "Booster", value: "Landed", meaning: "The first orbital booster ever recovered intact after launch." },
    ],
    sources: [{ title: "Falcon 9 flight 20 (Wikipedia)", url: "https://en.wikipedia.org/wiki/Falcon_9_flight_20" }],
  },
  // https://en.wikipedia.org/wiki/Starship_flight_test_5
  {
    id: "ift5",
    sketchId: "mars-ship",
    vehicle: "Starship",
    mission: "Integrated Flight Test 5",
    date: "2024-10-13",
    site: "Starbase, Boca Chica, Texas",
    destination: "leo",
    outcome: "success",
    failure: null,
    timeline: [
      { tS: 0, altitudeKm: 0, speedMps: 0, kind: "liftoff", event: "Liftoff" },
      { tS: 62, altitudeKm: 11, speedMps: 420, kind: "max-q", event: "Max-Q" },
      { tS: 160, altitudeKm: 65, speedMps: 1500, kind: "stage-sep", event: "Hot staging" },
      { tS: 420, altitudeKm: 150, speedMps: 5200, event: "Booster caught by the launch tower's arms" },
      { tS: 520, altitudeKm: 190, speedMps: 7000, kind: "orbit", event: "Ship coasts through space toward the Indian Ocean" },
    ],
    rootCause: "Hot staging, electric engine steering and a water-cooled pad, all added after IFT-1, worked together.",
    whatChanged: "The first time a booster was caught by the tower that launched it.",
    returnToFlight: "The ship then reentered and splashed down on target in the Indian Ocean.",
    stats: [
      { label: "After IFT-1", value: "18 months", meaning: "From a tumbling stack to a tower catch." },
      { label: "Booster", value: "Caught", meaning: "Grabbed out of the air by the launch tower's arms." },
      { label: "Ship", value: "Splashdown", meaning: "Controlled reentry and a precise landing burn over the ocean." },
    ],
    sources: [{ title: "Starship flight test 5 (Wikipedia)", url: "https://en.wikipedia.org/wiki/Starship_flight_test_5" }],
  },
];
