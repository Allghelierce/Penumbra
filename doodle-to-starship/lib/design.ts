// Shared contract between the sketch reader (Grok vision), the physics engine,
// the red-pen overlay and the launch animation. Every module imports from here;
// change a type only when all of its consumers are updated in the same commit.

export type PropellantId = "methalox" | "kerolox" | "hydrolox" | "solid" | "hypergolic";

export type EngineId =
  | "raptor-3"
  | "raptor-vacuum"
  | "merlin-1d"
  | "merlin-vacuum"
  | "rs-25"
  | "rl10c"
  | "f-1"
  | "j-2"
  | "be-4"
  | "rd-180"
  | "rutherford"
  | "generic-solid";

/** Ordered from easiest to hardest to reach. */
export type DestinationId =
  | "leo"
  | "gto"
  | "moon-orbit"
  | "moon-surface"
  | "mars-transfer"
  | "mars-surface"
  | "europa";

export interface EngineSpec {
  id: EngineId;
  name: string;
  /** Vehicle it flies on, e.g. "Falcon 9 first stage". */
  vehicle: string;
  propellant: PropellantId;
  thrustSeaLevelN: number;
  thrustVacuumN: number;
  ispSeaLevelS: number;
  ispVacuumS: number;
  massKg: number;
  /** Where the figures come from (URL). */
  source: string;
}

export interface DestinationSpec {
  id: DestinationId;
  name: string;
  /** Delta-v needed from Earth's surface, including gravity and drag losses. */
  deltaVFromSurfaceMps: number;
  source: string;
}

export interface EngineCluster {
  engine: EngineId;
  count: number;
}

export interface Stage {
  /** e.g. "Booster", "Ship", "Stage 2". */
  label: string;
  engines: EngineCluster[];
  propellant: PropellantId;
  /** Usable propellant volume of all this stage's tanks combined, in m³. */
  tankVolumeM3: number;
  /** Everything that isn't propellant. Omit to let the physics engine estimate it. */
  dryMassKg?: number;
}

export interface Design {
  name: string;
  /** Index 0 fires first (the bottom stage). */
  stages: Stage[];
  payloadMassKg: number;
  destination: DestinationId;
  /** Features spotted in the sketch: "fins", "heat-shield", "landing-legs", "solar-panels", "crew-window", ... */
  features: string[];
  heightM: number;
  diameterM: number;
}

export type Verdict = "stuck-on-pad" | "suborbital" | "orbit" | "destination";

export interface StageAnalysis {
  label: string;
  wetMassKg: number;
  dryMassKg: number;
  propellantMassKg: number;
  /** Effective Isp used for this stage. */
  ispS: number;
  /** Total thrust: sea level for stage 0, vacuum for the rest. */
  thrustN: number;
  deltaVMps: number;
  burnTimeS: number;
  twrAtIgnition: number;
}

export interface Analysis {
  liftoffMassKg: number;
  liftoffTwr: number;
  stages: StageAnalysis[];
  totalDeltaVMps: number;
  /** For design.destination. */
  requiredDeltaVMps: number;
  /** total - required; negative means it falls short. */
  marginMps: number;
  verdict: Verdict;
  /** Furthest destination this design could reach, or null if it can't make orbit. */
  furthestReachable: DestinationId | null;
  /** Plain-English one-liners with numbers, e.g. "Liftoff thrust-to-weight is 0.8, so it never leaves the pad." */
  findings: string[];
}

export type FlightEventKind =
  | "liftoff"
  | "max-q"
  | "stage-sep"
  | "engine-cutoff"
  | "orbit"
  | "fuel-exhausted"
  | "apogee"
  | "impact"
  | "arrival"
  | "pad-failure"
  /** The vehicle broke up in flight (historic replays). */
  | "breakup";

export interface FlightPoint {
  tS: number;
  altitudeKm: number;
  downrangeKm: number;
  speedMps: number;
  stageIndex: number;
}

export interface FlightEvent {
  tS: number;
  kind: FlightEventKind;
  label: string;
}

export interface FlightTrace {
  points: FlightPoint[];
  events: FlightEvent[];
  /** Always equals the verdict from analyze() for the same design. */
  outcome: Verdict;
  maxAltitudeKm: number;
}

/** Sketch coordinates are normalized 0..1 relative to the canvas (x right, y down). */
export type Point = [x: number, y: number];

/** Napkin canvas shape (width / height). Everything that draws strokes uses this aspect. */
export const NAPKIN_ASPECT = 3 / 4;

/** One pencil stroke on the napkin. */
export interface Stroke {
  points: Point[];
  /** Added by "Add detail" (welds, bell outlines...). Drawn like any stroke, but never read as structure. */
  detail?: boolean;
}

export type PartKind =
  | "tank"
  | "engine"
  | "fin"
  | "nose"
  | "payload"
  | "heat-shield"
  | "landing-legs"
  | "solar-panel"
  | "window"
  | "other";

export interface Part {
  kind: PartKind;
  label: string;
  /** x, y, width, height. */
  box: [number, number, number, number];
  stageIndex?: number;
}

/** `fix`, when present, is the edit the note suggests; tapping the note applies it. */
export type RedPenMark =
  | { kind: "arrow"; from: Point; to: Point; note: string; fix?: DesignAction }
  /** radius is a fraction of the napkin's WIDTH; the pen draws a slightly flattened loop. */
  | { kind: "circle"; center: Point; radius: number; note: string; fix?: DesignAction }
  /** A dashed outline of suggested geometry, e.g. a new stage under the rocket. */
  | { kind: "ghost-line"; points: Point[]; note: string; fix?: DesignAction }
  /** Engineer's markup: a hand-drawn outline traced around a part's box (x, y, w, h), identifying it. */
  | { kind: "outline"; box: [number, number, number, number]; note: string; fix?: DesignAction }
  /** A measured dimension line with end ticks, e.g. the vehicle's height "96 m". */
  | { kind: "dimension"; from: Point; to: Point; note: string; fix?: DesignAction }
  /** A leader line from a point on a part out to a spec label, e.g. "33× Raptor 3 · 7,590 tf". */
  | { kind: "callout"; anchor: Point; label: Point; note: string; fix?: DesignAction };

/** One filled shape of the cleaned-up, colored side profile, in the napkin's SVG units (viewBox 0 0 300 400). */
export interface CleanShape {
  part: PartKind | "body" | "interstage";
  /** SVG path data. */
  d: string;
  fill: string;
  stroke?: string;
}

/** What Grok vision reads out of a sketch. */
export interface SketchReading {
  design: Design;
  parts: Part[];
  /** 0..1: how confidently this reads as a launch vehicle. Below 0.5 the studio coaches instead of analysing. */
  confidence?: number;
  /** When it doesn't read as a vehicle, why, in one sentence ("It's a scribble: I can't find a body with two walls"). */
  problem?: string | null;
}

/** The red-pen markup drawn back onto the sketch. */
export interface Review {
  marks: RedPenMark[];
  summary: string;
}

/** Changes the voice reviewer or the UI can make to the current design. */
export type DesignAction =
  | { type: "set-destination"; destination: DestinationId }
  | { type: "scale-tanks"; stageIndex: number; factor: number }
  | { type: "add-stage" }
  | { type: "remove-stage"; stageIndex: number }
  | { type: "set-engines"; stageIndex: number; engine: EngineId; count: number }
  | { type: "set-payload"; payloadMassKg: number }
  | { type: "launch" }
  | { type: "review" };

/** Which screen the app is on. "poll" is the spoken GO/NO-GO poll between pressing Launch and liftoff. */
export type Phase = "draw" | "reading" | "reviewed" | "poll" | "launch";

/** One controller's answer in the pre-launch GO/NO-GO poll. */
export interface PollCall {
  role: "Propulsion" | "Structures" | "Trajectory" | "Landing" | "Flight";
  go: boolean;
  /** Spoken line with the real number, e.g. "Trajectory, NO-GO. We're 0.9 kilometers per second short of orbit." */
  line: string;
  /** For a NO-GO with a concrete remedy, the edit that clears it. */
  fix?: DesignAction;
}

/** The whole poll. `go` is true only if every controller is GO. */
export interface Poll {
  calls: PollCall[];
  go: boolean;
  /** Flight director's closing line, e.g. "Flight, we are GO for launch." or "Hold, hold, hold. Two NO-GOs." */
  summary: string;
}

/** One flight in the user's iteration history (attempt 1 is the first launch). */
export interface Attempt {
  n: number;
  design: Design;
  analysis: Analysis;
  maxAltitudeKm: number;
}

export interface Improvement {
  /** e.g. "Stretch the tanks 12% to make orbit". */
  text: string;
  /** The edit that applies it, when there is one. */
  fix?: DesignAction;
}

/** What to try next, shown after every flight so the user keeps iterating. */
export interface Recap {
  /** e.g. "Attempt 3: orbit, 1.3 km/s better than last time". */
  headline: string;
  /** Change since the previous attempt, e.g. "+1.3 km/s since attempt 2 (tanks +12%)"; null on attempt 1. */
  delta: string | null;
  /** 1–3 suggestions, most impactful first. After a success these "level up" (more payload, a farther target). */
  improvements: Improvement[];
}

// HTTP contracts for the route handlers under app/api/.

/** POST /api/read */
export interface ReadRequest {
  /** PNG data URL of the napkin. */
  image: string;
  strokes: Stroke[];
  destination: DestinationId;
}
export interface ReadResponse {
  reading: SketchReading;
  source: "grok" | "geometry";
}

/** POST /api/review */
export interface ReviewRequest {
  reading: SketchReading;
  analysis: Analysis;
}
export interface ReviewResponse {
  review: Review;
  source: "grok" | "rules";
}

/** POST /api/render */
export interface RenderRequest {
  design: Design;
  analysis: Analysis;
  /** "patch" is an embroidered mission patch for the design, shown as a sticker on the napkin. */
  kind: "concept" | "outcome" | "patch";
  /** PNG data URL of the napkin. When present, Imagine edits the sketch into a photo so the render looks like the drawing. */
  sketch?: string;
}
export interface RenderResponse {
  url: string | null;
  source: "grok" | "none";
}

/** GET /api/prior-art?q=...&limit=5 returns { results: PriorArtResult[] } */
export interface PriorArtResult {
  id: string;
  title: string;
  year: number | null;
  abstract: string;
  url: string;
}

/** A real flight from history, replayed through the studio. */
export interface HistoricMission {
  /** e.g. "falcon1-f1". */
  id: string;
  /** DEMO_SKETCHES id whose drawing and pinned photo stand in for the vehicle. */
  sketchId: string;
  /** e.g. "Falcon 1". */
  vehicle: string;
  /** e.g. "Flight 1 · FalconSAT-2". */
  mission: string;
  /** ISO date, e.g. "2006-03-24". */
  date: string;
  site: string;
  destination: DestinationId;
  outcome: "lost" | "success";
  /** The part that failed (looked up in the reading's parts) and what the red pen writes there. */
  failure: { part: PartKind; stageIndex?: number; label: string; detail: string } | null;
  /** The real timeline in mission elapsed seconds; the launch replays it. */
  timeline: {
    tS: number;
    altitudeKm: number;
    speedMps: number;
    kind?: FlightEventKind;
    event?: string;
    /** Real recorded dialog only, with its source. */
    quote?: { speaker: string; text: string; source: string };
  }[];
  rootCause: string;
  whatChanged: string;
  /** e.g. "Flight 4, 28 Sep 2008: first privately developed liquid-fuel rocket to reach orbit". */
  returnToFlight: string;
  /** Numbers that matter, each with what it means in plain words. */
  stats: { label: string; value: string; meaning: string }[];
  sources: { title: string; url: string }[];
}

// ---- v2: start from a real rocket, then modify it ----

export type TemplateId = "falcon9" | "saturn-v" | "electron" | "starship";

/** A real launch vehicle the user starts from and then modifies. All figures are published ones, with sources. */
export interface RocketTemplate {
  id: TemplateId;
  /** e.g. "Falcon 9 Block 5". */
  name: string;
  /** One line on what it was built for, e.g. "Reusable medium-lift launcher, first flown 2018". */
  blurb: string;
  /** The real vehicle as a Design: real stage propellant volumes, dry masses and engines; payloadMassKg = its LEO reference payload. */
  design: Design;
  /** Published payload to low Earth orbit, in kg (the calibration target for the physics model). */
  realPayloadLeoKg: number;
  sources: { title: string; url: string }[];
}

/** How a template is drawn on the napkin for a given (possibly modified) design. */
export interface TemplateDrawing {
  /** Clean hand-drawn outline, normalized to the 3:4 napkin. */
  strokes: Stroke[];
  /** Exact part boxes (no sketch reading needed), with stageIndex. */
  parts: Part[];
  /** Vertical extent of each stage's tank section on the napkin, [top, bottom] normalized, index 0 = bottom stage. Drag handles sit on these edges. */
  stageBands: [number, number][];
}

/** One point on a trade-off curve: what happens to the rocket when one parameter changes. */
export interface TradePoint {
  /** The swept value, e.g. a tank stretch factor (1 = as built) or an engine count. */
  x: number;
  /** Maximum payload to the chosen destination at this x, in kg (0 if it can't make it). */
  payloadKg: number;
  totalDeltaVMps: number;
  liftoffTwr: number;
}

/** A full sweep, plus where the real rocket and the best point sit on it. */
export interface TradeCurve {
  /** e.g. "Stage 1 tank stretch". */
  label: string;
  /** e.g. "×" or "engines". */
  unit: string;
  points: TradePoint[];
  /** x of the real, unmodified rocket. */
  realX: number;
  /** x with the highest payload. */
  bestX: number;
}
