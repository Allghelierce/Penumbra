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
  | "pad-failure";

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

export type RedPenMark =
  | { kind: "arrow"; from: Point; to: Point; note: string }
  /** radius is a fraction of the napkin's WIDTH; the pen draws a slightly flattened loop. */
  | { kind: "circle"; center: Point; radius: number; note: string }
  /** A dashed outline of suggested geometry, e.g. a new stage under the rocket. */
  | { kind: "ghost-line"; points: Point[]; note: string };

/** What Grok vision reads out of a sketch. */
export interface SketchReading {
  design: Design;
  parts: Part[];
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

/** Which screen the app is on. */
export type Phase = "draw" | "reading" | "reviewed" | "launch";

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
  kind: "concept" | "outcome";
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
