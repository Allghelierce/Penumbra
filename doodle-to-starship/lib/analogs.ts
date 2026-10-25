import type { Analysis, Design, DestinationId } from "./design";

// "Closest real rocket": a small dataset of real launch vehicles with published figures, and a
// similarity score that compares a napkin design to each. Every number shown comes from here or
// from the physics, never from a model.

export interface RealVehicle {
  id: string;
  name: string;
  firstFlight: number;
  /** Text, because active vehicles keep flying: "13", "hundreds since 2010". */
  flights: string;
  stages: number;
  /** PropellantId values where they apply, plus "alcohol-lox" for early rockets. */
  propellants: string[];
  heightM: number;
  /** Core diameter, not the width across strap-on boosters. */
  diameterM: number;
  /** null where no figure is published. */
  liftoffMassT: number | null;
  /** null for suborbital vehicles. */
  leoPayloadT: number | null;
  /** What fires at liftoff, for display. */
  firstStage: string;
  /** Liquid engines plus solid boosters burning at liftoff. */
  firstStageEngines: number;
  reusable: boolean;
  fact: string;
  source: string;
}

const wiki = (page: string) => `https://en.wikipedia.org/wiki/${page}`;

export const REAL_VEHICLES: RealVehicle[] = [
  {
    id: "saturn-v",
    name: "Saturn V",
    firstFlight: 1967,
    flights: "13",
    stages: 3,
    propellants: ["kerolox", "hydrolox"],
    heightM: 110.6,
    diameterM: 10.1,
    liftoffMassT: 2970,
    leoPayloadT: 140,
    firstStage: "5× F-1",
    firstStageEngines: 5,
    reusable: false,
    fact: "Flew 24 astronauts to the Moon between 1968 and 1972.",
    source: wiki("Saturn_V"),
  },
  {
    id: "n1",
    name: "N1",
    firstFlight: 1969,
    flights: "4, all failed",
    stages: 5,
    propellants: ["kerolox"],
    heightM: 105.3,
    diameterM: 17,
    liftoffMassT: 2750,
    leoPayloadT: 95,
    firstStage: "30× NK-15",
    firstStageEngines: 30,
    reusable: false,
    fact: "The Soviet Moon rocket: 30 first-stage engines, and all four launches failed.",
    source: wiki("N1_(rocket)"),
  },
  {
    id: "space-shuttle",
    name: "Space Shuttle",
    firstFlight: 1981,
    flights: "135",
    stages: 2,
    propellants: ["solid", "hydrolox"],
    heightM: 56.1,
    diameterM: 8.7,
    liftoffMassT: 2030,
    leoPayloadT: 27.5,
    firstStage: "3× RS-25 + 2 solid boosters",
    firstStageEngines: 5,
    reusable: true,
    fact: "Flew 135 missions from 1981 to 2011 and helped build the ISS.",
    source: wiki("Space_Shuttle"),
  },
  {
    id: "falcon-9",
    name: "Falcon 9 Block 5",
    firstFlight: 2018,
    flights: "hundreds (Falcon 9 since 2010)",
    stages: 2,
    propellants: ["kerolox"],
    heightM: 70,
    diameterM: 3.7,
    liftoffMassT: 549,
    leoPayloadT: 22.8,
    firstStage: "9× Merlin 1D",
    firstStageEngines: 9,
    reusable: true,
    fact: "Its first stages land and fly again, some more than 20 times.",
    source: wiki("Falcon_9"),
  },
  {
    id: "falcon-heavy",
    name: "Falcon Heavy",
    firstFlight: 2018,
    flights: "11 by the end of 2024",
    stages: 2,
    propellants: ["kerolox"],
    heightM: 70,
    diameterM: 3.7,
    liftoffMassT: 1420,
    leoPayloadT: 63.8,
    firstStage: "27× Merlin 1D on three cores",
    firstStageEngines: 27,
    reusable: true,
    fact: "Its first flight in 2018 sent a Tesla Roadster into orbit around the Sun.",
    source: wiki("Falcon_Heavy"),
  },
  {
    id: "starship",
    name: "Starship",
    firstFlight: 2023,
    flights: "test flights since 2023",
    stages: 2,
    propellants: ["methalox"],
    heightM: 123,
    diameterM: 9,
    liftoffMassT: 5000,
    leoPayloadT: 100,
    firstStage: "33× Raptor",
    firstStageEngines: 33,
    reusable: true,
    fact: "The largest rocket ever flown; its Super Heavy boosters get caught by the launch tower's arms.",
    source: wiki("SpaceX_Starship"),
  },
  {
    id: "starship-hops",
    name: "Starship SN8–SN15 hops",
    firstFlight: 2020,
    flights: "5 high-altitude hops, 2020–21",
    stages: 1,
    propellants: ["methalox"],
    heightM: 50,
    diameterM: 9,
    liftoffMassT: null,
    leoPayloadT: null,
    firstStage: "3× Raptor",
    firstStageEngines: 3,
    reusable: true,
    fact: "Single-stage test ships that climbed about 10 km and belly-flopped back; only SN15 landed in one piece.",
    source: wiki("SpaceX_Starship_flight_tests"),
  },
  {
    id: "sls-block-1",
    name: "SLS Block 1",
    firstFlight: 2022,
    flights: "Artemis I (2022) onward",
    stages: 2,
    propellants: ["hydrolox", "solid"],
    heightM: 98,
    diameterM: 8.4,
    liftoffMassT: 2610,
    leoPayloadT: 95,
    firstStage: "4× RS-25 + 2 solid boosters",
    firstStageEngines: 6,
    reusable: false,
    fact: "Sent the uncrewed Orion of Artemis I around the Moon in 2022, on Shuttle-era RS-25 engines.",
    source: wiki("Space_Launch_System"),
  },
  {
    id: "atlas-v",
    name: "Atlas V 551",
    firstFlight: 2002,
    flights: "about 100 since 2002",
    stages: 2,
    propellants: ["kerolox", "hydrolox", "solid"],
    heightM: 58.3,
    diameterM: 3.81,
    liftoffMassT: 590,
    leoPayloadT: 18.85,
    firstStage: "1× RD-180 + 5 solid boosters",
    firstStageEngines: 6,
    reusable: false,
    fact: "Launched New Horizons toward Pluto in 2006 on a Russian-built RD-180 engine.",
    source: wiki("Atlas_V"),
  },
  {
    id: "delta-iv-heavy",
    name: "Delta IV Heavy",
    firstFlight: 2004,
    flights: "16, retired 2024",
    stages: 2,
    propellants: ["hydrolox"],
    heightM: 72,
    diameterM: 5.1,
    liftoffMassT: 733,
    leoPayloadT: 28.8,
    firstStage: "3× RS-68A on three cores",
    firstStageEngines: 3,
    reusable: false,
    fact: "Famous for setting itself alight at ignition: excess hydrogen burned off in a fireball.",
    source: wiki("Delta_IV_Heavy"),
  },
  {
    id: "ariane-5",
    name: "Ariane 5",
    firstFlight: 1996,
    flights: "117, retired 2023",
    stages: 2,
    propellants: ["hydrolox", "solid"],
    heightM: 52,
    diameterM: 5.4,
    liftoffMassT: 780,
    leoPayloadT: 21,
    firstStage: "1× Vulcain 2 + 2 solid boosters",
    firstStageEngines: 3,
    reusable: false,
    fact: "Launched the James Webb Space Telescope on Christmas Day 2021.",
    source: wiki("Ariane_5"),
  },
  {
    id: "soyuz-2",
    name: "Soyuz-2",
    firstFlight: 2004,
    flights: "R-7 family: 1,900+ since 1957",
    stages: 3,
    propellants: ["kerolox"],
    heightM: 46.3,
    diameterM: 2.95,
    liftoffMassT: 312,
    leoPayloadT: 8.2,
    firstStage: "4 strap-on boosters + core, 20 nozzles",
    firstStageEngines: 5,
    reusable: false,
    fact: "Descends from the R-7 that launched Sputnik in 1957 and Gagarin in 1961.",
    source: wiki("Soyuz-2"),
  },
  {
    id: "electron",
    name: "Electron",
    firstFlight: 2017,
    flights: "50+ by the end of 2024",
    stages: 2,
    propellants: ["kerolox"],
    heightM: 18,
    diameterM: 1.2,
    liftoffMassT: 13,
    leoPayloadT: 0.3,
    firstStage: "9× Rutherford",
    firstStageEngines: 9,
    reusable: false,
    fact: "Its Rutherford engines are 3D-printed and fed by battery-powered pumps.",
    source: wiki("Rocket_Lab_Electron"),
  },
  {
    id: "new-glenn",
    name: "New Glenn",
    firstFlight: 2025,
    flights: "since 2025",
    stages: 2,
    propellants: ["methalox", "hydrolox"],
    heightM: 98,
    diameterM: 7,
    liftoffMassT: null,
    leoPayloadT: 45,
    firstStage: "7× BE-4",
    firstStageEngines: 7,
    reusable: true,
    fact: "Reached orbit on its very first flight in January 2025.",
    source: wiki("New_Glenn"),
  },
  {
    id: "long-march-5",
    name: "Long March 5",
    firstFlight: 2016,
    flights: "since 2016",
    stages: 2,
    propellants: ["hydrolox", "kerolox"],
    heightM: 57,
    diameterM: 5,
    liftoffMassT: 869,
    leoPayloadT: 25,
    firstStage: "2× YF-77 core + 4 boosters with 8× YF-100",
    firstStageEngines: 10,
    reusable: false,
    fact: "Launched China's Tianwen-1 Mars mission and the Chang'e 5 Moon sample return, both in 2020.",
    source: wiki("Long_March_5"),
  },
  {
    id: "titan-ii-glv",
    name: "Titan II GLV (Gemini)",
    firstFlight: 1964,
    flights: "12",
    stages: 2,
    propellants: ["hypergolic"],
    heightM: 31.4,
    diameterM: 3.05,
    liftoffMassT: 154,
    leoPayloadT: 3.6,
    firstStage: "1× LR87, twin chambers",
    firstStageEngines: 1,
    reusable: false,
    fact: "Flew all ten crewed Gemini missions in 1965–66.",
    source: wiki("Titan_II_GLV"),
  },
  {
    id: "mercury-redstone",
    name: "Mercury-Redstone",
    firstFlight: 1960,
    flights: "6",
    stages: 1,
    propellants: ["alcohol-lox"],
    heightM: 25.4,
    diameterM: 1.78,
    liftoffMassT: 30,
    leoPayloadT: null,
    firstStage: "1× Rocketdyne A-7",
    firstStageEngines: 1,
    reusable: false,
    fact: "Carried Alan Shepard on America's first human spaceflight in 1961: 15 minutes, straight up and down.",
    source: wiki("Mercury-Redstone_Launch_Vehicle"),
  },
];

// Similarity weights (sum to 1). Stage count and propellant say most about a rocket's "family".
const WEIGHTS = { stages: 0.3, propellant: 0.2, mass: 0.25, shape: 0.1, engines: 0.15 };
/** Score for a factor the vehicle has no published figure for. */
const UNKNOWN = 0.5;

const PROPELLANT_NAMES: Record<string, string> = {
  methalox: "methalox",
  kerolox: "kerosene",
  hydrolox: "hydrogen",
  solid: "solid",
  hypergolic: "hypergolic",
};

export interface Analog {
  name: string;
  /** 0..1, higher is closer. */
  similarity: number;
  /** How the design compares: "same 2-stage methalox layout, 0.9× its liftoff mass, 23 vs 33 first-stage engines". */
  why: string;
  /** One factual line about the real vehicle: "Flew 24 astronauts to the Moon between 1968 and 1972." */
  history: string;
  /** The full record, for first flight, payload, source link and so on. */
  vehicle: RealVehicle;
}

function profile(design: Design, analysis: Analysis) {
  return {
    stages: design.stages.length,
    propellants: [...new Set(design.stages.map((s) => s.propellant))],
    massT: analysis.liftoffMassKg / 1000,
    shape: design.diameterM > 0 ? design.heightM / design.diameterM : NaN,
    engines: (design.stages[0]?.engines ?? []).reduce((sum, c) => sum + c.count, 0),
  };
}

/** 1 when equal, falling off with the log of the ratio; `scale` is how many e-folds halve-ish it. */
function logCloseness(a: number, b: number | null, scale: number): number {
  if (b === null || !(a > 0) || !(b > 0)) return UNKNOWN;
  return Math.exp(-Math.abs(Math.log(a / b)) / scale);
}

function score(p: ReturnType<typeof profile>, v: RealVehicle): number {
  const stageGap = Math.abs(p.stages - v.stages);
  const stages = stageGap === 0 ? 1 : stageGap === 1 ? 0.4 : stageGap === 2 ? 0.1 : 0;
  const shared = p.propellants.filter((x) => v.propellants.includes(x)).length;
  const propellant = shared / new Set([...p.propellants, ...v.propellants]).size;
  const total =
    WEIGHTS.stages * stages +
    WEIGHTS.propellant * propellant +
    WEIGHTS.mass * logCloseness(p.massT, v.liftoffMassT, 1.5) +
    WEIGHTS.shape * logCloseness(p.shape, v.heightM / v.diameterM, 0.7) +
    WEIGHTS.engines * logCloseness(p.engines, v.firstStageEngines, 1.5);
  return Math.min(1, Math.max(0, total));
}

function explain(p: ReturnType<typeof profile>, v: RealVehicle): string {
  const sharedProps = p.propellants.filter((x) => v.propellants.includes(x));
  const propWord = sharedProps.length > 0 ? ` ${sharedProps.map((x) => PROPELLANT_NAMES[x] ?? x).join("/")}` : "";
  const layout =
    p.stages === v.stages
      ? `same ${p.stages === 1 ? "single" : p.stages}-stage${propWord} layout`
      : `${v.stages} stage${v.stages === 1 ? "" : "s"} to your ${p.stages}${sharedProps.length > 0 ? `, both${propWord}` : ""}`;
  const parts = [layout];
  if (v.liftoffMassT !== null && p.massT > 0) parts.push(`${ratio(p.massT / v.liftoffMassT)}× its liftoff mass`);
  parts.push(`${p.engines} vs ${v.firstStageEngines} first-stage engines`);
  return parts.join(", ");
}

function ratio(r: number): string {
  return r >= 10 ? String(Math.round(r)) : r >= 0.1 ? r.toFixed(1) : r.toPrecision(1);
}

/** The n real vehicles most like this design, closest first. */
export function closestAnalogs(design: Design, analysis: Analysis, n = 3): Analog[] {
  const p = profile(design, analysis);
  return REAL_VEHICLES.map(
    (vehicle): Analog => ({
      name: vehicle.name,
      similarity: round2(score(p, vehicle)),
      why: explain(p, vehicle),
      history: vehicle.fact,
      vehicle,
    }),
  )
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(0, n));
}

const MOON: DestinationId[] = ["moon-orbit", "moon-surface"];
const MARS: DestinationId[] = ["mars-transfer", "mars-surface"];

/** One sentence tying the verdict to spaceflight history. */
export function historyLine(design: Design, analysis: Analysis): string {
  const stages = design.stages.length;
  const short = `${(Math.abs(analysis.marginMps) / 1000).toFixed(1)} km/s`;
  const dest = design.destination;

  switch (analysis.verdict) {
    case "stuck-on-pad":
      return `Liftoff thrust-to-weight ${analysis.liftoffTwr.toFixed(2)} keeps it on the pad; Saturn V cleared the tower at about 1.2.`;
    case "suborbital":
      return "Like Alan Shepard's Mercury-Redstone in 1961, it goes up and comes back down; orbit took an Atlas the next year.";
    case "orbit":
      if (MOON.includes(dest)) return `Saturn V needed 3 stages to send Apollo to the Moon; you have ${stages}, and fall ${short} short.`;
      if (MARS.includes(dest)) return `SpaceX plans to refill Starship in orbit before Mars; without that, you're ${short} short.`;
      if (dest === "europa")
        return `Europa Clipper needed a Falcon Heavy plus gravity assists from Mars and Earth; you're ${short} short.`;
      return `It makes orbit but not ${dest.toUpperCase()}: Falcon 9 lifts only about a third as much to GTO as to low orbit.`;
    case "destination": {
      if (dest === "moon-orbit") return `Apollo 8 first orbited the Moon in 1968 on a 3-stage Saturn V; you did it with ${stages}.`;
      if (dest === "moon-surface") return `Apollo needed a 3-stage Saturn V to land on the Moon; you did it with ${stages}.`;
      if (MARS.includes(dest)) return "Only robots have reached Mars so far; on paper, your design gets there.";
      if (dest === "europa") return "Nothing has ever landed on Europa; Europa Clipper will only fly past it.";
      if (dest === "gto") return "Made GTO, where Syncom 3 became the first geostationary satellite in 1964.";
      return "Made orbit, as the R-7 first did when it launched Sputnik in 1957.";
    }
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
