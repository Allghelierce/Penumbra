import type { HistoricMission } from "./design";

// Conservative mission files: well-established facts only, approximate figures marked "≈".
// The research pass replaces this with source-checked dossiers and recorded dialog.
export const HISTORIC_MISSIONS: HistoricMission[] = [
  // https://en.wikipedia.org/wiki/Falcon_1#Flight_1
  {
    id: "falcon1-f1",
    sketchId: "napkin-hopper",
    vehicle: "Falcon 1",
    mission: "Flight 1 · FalconSAT-2",
    date: "2006-03-24",
    site: "Omelek Island, Kwajalein Atoll",
    destination: "leo",
    outcome: "lost",
    failure: {
      part: "engine",
      stageIndex: 0,
      label: "Corroded fuel fitting",
      detail: "A corroded fitting leaked fuel and started a fire on the engine.",
    },
    timeline: [
      { tS: 0, altitudeKm: 0, speedMps: 0, kind: "liftoff", event: "Liftoff" },
      { tS: 25, altitudeKm: 1.5, speedMps: 160, event: "Fire above the engine" },
      {
        tS: 26,
        altitudeKm: 1.6,
        speedMps: 150,
        kind: "engine-cutoff",
        event: "The rocket pitches over as the engine plume distorts",
        quote: {
          speaker: "Range Safety Officer",
          text: "This is the RCO, we have an active track with the radar.",
          source: "https://spacenews.com/?p=8075",
        },
      },
      {
        tS: 45,
        altitudeKm: 0,
        speedMps: 120,
        kind: "impact",
        event: "Impact in the ocean near the launch site",
        quote: {
          speaker: "SpaceX statement",
          text: "We had a successful liftoff and Falcon made it well clear of the launch pad.",
          source: "https://spacenews.com/?p=8075",
        },
      },
    ],
    rootCause:
      "An aluminum fitting on the engine's fuel line corroded in the salty island air, leaked kerosene, and the fire cut off the engine's pneumatic pressure.",
    whatChanged: "SpaceX switched to stainless steel fittings and tightened inspection of every line.",
    returnToFlight:
      "Flight 4, 28 Sep 2008: the first privately developed liquid-fuel rocket to reach Earth orbit.",
    stats: [
      { label: "Flight time", value: "≈ 1 min", meaning: "The engine died about half a minute after liftoff." },
      { label: "Cause", value: "1 fitting", meaning: "One small corroded nut ended the whole mission." },
      { label: "Attempts to orbit", value: "4", meaning: "Falcon 1 reached orbit on its fourth flight." },
      { label: "Years to orbit", value: "2.5", meaning: "From this failure to SpaceX's first orbit." },
    ],
    sources: [
      { title: "Falcon 1 (Wikipedia)", url: "https://en.wikipedia.org/wiki/Falcon_1" },
      { title: "SpaceX", url: "https://www.spacex.com/" },
    ],
  },
  // https://en.wikipedia.org/wiki/SpaceX_CRS-7
  {
    id: "crs7",
    sketchId: "two-stage-orbiter",
    vehicle: "Falcon 9",
    mission: "CRS-7 · Dragon to the ISS",
    date: "2015-06-28",
    site: "Cape Canaveral SLC-40",
    destination: "leo",
    outcome: "lost",
    failure: {
      part: "tank",
      stageIndex: 1,
      label: "Stage 2 helium strut",
      detail: "A steel strut snapped and the oxygen tank burst.",
    },
    timeline: [
      { tS: 0, altitudeKm: 0, speedMps: 0, kind: "liftoff", event: "Liftoff" },
      { tS: 70, altitudeKm: 11, speedMps: 450, kind: "max-q", event: "Max-Q" },
      {
        tS: 139,
        altitudeKm: 45,
        speedMps: 1100,
        kind: "breakup",
        event: "Second stage overpressure: vehicle breaks up",
        quote: {
          speaker: "Elon Musk",
          text: "Experienced a problem shortly before first stage shutdown.",
          source: "https://iol.co.za/news/2015-06-29-spacex-rocket-explodes-after-liftoff/",
        },
      },
    ],
    rootCause:
      "A steel strut holding a helium bottle inside the second-stage oxygen tank failed far below its rated load. The bottle broke free and helium overpressurized the tank.",
    whatChanged: "SpaceX replaced the struts with a stronger design and began testing every strut individually.",
    returnToFlight:
      "Orbcomm OG2, 21 Dec 2015: back to orbit, and the first Falcon 9 booster ever to land.",
    stats: [
      { label: "Failure time", value: "T+139 s", meaning: "Just over two minutes in, before the second stage had even fired." },
      { label: "Strut strength", value: "≈ 1/5 of rated", meaning: "The part broke at about a fifth of the load it was certified for." },
      { label: "Payload lost", value: "IDA-1", meaning: "Including the docking adapter the ISS needed for crewed Dragons." },
      { label: "Return to flight", value: "6 months", meaning: "And the next flight landed its booster for the first time." },
    ],
    sources: [
      { title: "SpaceX CRS-7 (Wikipedia)", url: "https://en.wikipedia.org/wiki/SpaceX_CRS-7" },
      { title: "SpaceX", url: "https://www.spacex.com/" },
    ],
  },
  // https://en.wikipedia.org/wiki/Starship_flight_test_1
  {
    id: "ift1",
    sketchId: "mars-ship",
    vehicle: "Starship",
    mission: "Integrated Flight Test 1",
    date: "2023-04-20",
    site: "Starbase, Boca Chica, Texas",
    destination: "leo",
    outcome: "lost",
    failure: {
      part: "engine",
      stageIndex: 0,
      label: "Booster engines out",
      detail: "Engines failed, the stack never separated and tumbled.",
    },
    timeline: [
      { tS: 0, altitudeKm: 0, speedMps: 0, kind: "liftoff", event: "Liftoff with several engines already out" },
      { tS: 62, altitudeKm: 11, speedMps: 400, kind: "max-q", event: "Max-Q" },
      { tS: 170, altitudeKm: 39, speedMps: 600, kind: "apogee", event: "Stage separation fails; the stack tumbles" },
      {
        tS: 239,
        altitudeKm: 30,
        speedMps: 500,
        kind: "breakup",
        event: "Flight termination system destroys the vehicle",
        quote: {
          speaker: "SpaceX",
          text: "Starship experienced a rapid unscheduled disassembly before stage separation.",
          source: "https://www.fox13news.com/news/spacex-starship-explodes-rapid-unscheduled-disassembly",
        },
      },
    ],
    rootCause:
      "Propellant leaks started fires in the booster's engine section, several Raptors failed, steering control was lost and the ship never separated.",
    whatChanged:
      "A water-cooled steel plate under the pad, hot staging, electric engine steering and a stronger flight termination system.",
    returnToFlight:
      "IFT-2, 18 Nov 2023: hot staging worked. IFT-5, 13 Oct 2024: the booster was caught by the launch tower.",
    stats: [
      { label: "Flight time", value: "≈ 4 min", meaning: "The termination system fired about four minutes in." },
      { label: "Peak altitude", value: "≈ 39 km", meaning: "Above most of the atmosphere, still far from space." },
      { label: "Stage separation", value: "Never", meaning: "The booster and ship stayed locked together." },
      { label: "To tower catch", value: "18 months", meaning: "From this flight to catching the booster on IFT-5." },
    ],
    sources: [
      { title: "Starship flight test 1 (Wikipedia)", url: "https://en.wikipedia.org/wiki/Starship_flight_test_1" },
      { title: "SpaceX", url: "https://www.spacex.com/" },
    ],
  },
];
