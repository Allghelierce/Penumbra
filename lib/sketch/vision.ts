import type { DestinationId, EngineId, Part, SketchReading, Stage } from "../design";
import { enginesForBase, enginesForBells, MAX_ENGINES, REFERENCE_BELL_M, upperStageEngines } from "./engines";
import { clamp, NAPKIN_HEIGHT_M, NAPKIN_WIDTH_M, napkinScale, toBox } from "./geometry";
import { tuneEngines } from "./tune";
import { ENGINE_IDS, isEngineId, isPartKind, isPropellantId, PART_KINDS, PROPELLANT_IDS } from "./ids";

// The Grok vision side of /api/read: the strict JSON schema, the prompt, and the
// sanitizer that turns whatever comes back into a SketchReading the physics can trust.

const MAX_STAGES = 4;
const MAX_PARTS = 30;
const MAX_FEATURES = 12;

/** What the model returns. Boxes are flattened to x/y/width/height so the schema stays simple. */
export interface GrokReading {
  isLaunchVehicle: boolean;
  confidence: number;
  problem: string | null;
  name: string;
  stages: Array<{
    label: string;
    engine: string;
    bellsDrawn: number;
    bellWidthM: number;
    writtenEngineCount: number | null;
    propellant: string;
    tankVolumeM3: number;
  }>;
  payloadMassKg: number;
  features: string[];
  heightM: number;
  diameterM: number;
  parts: Array<{
    kind: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    stageIndex: number | null;
  }>;
}

const object = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

export const READING_SCHEMA = object({
  isLaunchVehicle: {
    type: "boolean",
    description: "False if this is a scribble, a doodle of something else, or too vague to read as a rocket or spacecraft.",
  },
  confidence: { type: "number", description: "0..1: how clearly this reads as a launch vehicle." },
  problem: {
    type: ["string", "null"],
    description: "If it isn't clearly a vehicle: one short, friendly sentence saying what to draw instead. Otherwise null.",
  },
  name: { type: "string", description: "A short, fun name for the vehicle, or the name written on the sketch." },
  stages: {
    type: "array",
    description: "Bottom stage first: index 0 fires first.",
    items: object({
      label: { type: "string", description: 'e.g. "Booster", "Ship", "Stage 2".' },
      engine: { type: "string", enum: [...ENGINE_IDS] },
      bellsDrawn: { type: "integer", description: "Engine bells drawn under this stage; 0 if none are visible." },
      bellWidthM: { type: "number", description: "Width of a typical drawn bell at napkin scale, m; 0 if none." },
      writtenEngineCount: {
        type: ["integer", "null"],
        description: 'An engine count written on the sketch for this stage ("33 engines"), else null.',
      },
      propellant: { type: "string", enum: [...PROPELLANT_IDS] },
      tankVolumeM3: { type: "number", description: "Usable propellant volume of this stage's tanks, m³." },
    }),
  },
  payloadMassKg: { type: "number" },
  features: {
    type: "array",
    items: { type: "string" },
    description: 'Lowercase kebab-case, e.g. "fins", "grid-fins", "heat-shield", "landing-legs", "solar-panels", "crew-window".',
  },
  heightM: { type: "number" },
  diameterM: { type: "number" },
  parts: {
    type: "array",
    items: object({
      kind: { type: "string", enum: [...PART_KINDS] },
      label: { type: "string" },
      x: { type: "number", description: "Left edge, 0..1 of napkin width." },
      y: { type: "number", description: "Top edge, 0..1 of napkin height." },
      width: { type: "number" },
      height: { type: "number" },
      stageIndex: { type: ["integer", "null"], description: "Which stage this part belongs to, or null." },
    }),
  },
});

export const READ_SYSTEM =
  "You read hand-drawn rocket sketches for a rocket design tool. Report what is drawn, faithfully. " +
  "Read handwritten labels (engine names, counts, 'crew', 'heat shield') and trust them over shapes. " +
  "Never invent parts that are not drawn.";

export function buildReadPrompt(hint: SketchReading): string {
  const d = hint.design;
  const hintStages = d.stages.map((s, i) => `stage ${i} "${s.label}" ~${s.tankVolumeM3} m³`).join("; ");
  return [
    "This is a pencil sketch on a napkin, meant to be a rocket. Read it into the JSON schema.",
    "First judge honestly whether it actually depicts a launch vehicle. A scribble, a random shape or something else is not one: say so with isLaunchVehicle false, a low confidence and a one-sentence problem.",
    `Scale: the napkin is ${NAPKIN_WIDTH_M} m wide and ${NAPKIN_HEIGHT_M} m tall. Coordinates are normalized 0..1 with x to the right and y down.`,
    "Stages: list them bottom first. A horizontal line across the body or a change in width marks a stage boundary.",
    "Thin repeated lines inside tanks are weld seams, and small struts or ticks are detail: neither is a stage separation, a leg or an engine.",
    "Engines: for each stage, count the bells drawn under it and measure a typical bell's width in metres at the scale above. Do not convert bells into engine counts yourself; only fill writtenEngineCount when a number is written. Use the engine named on the sketch if any; otherwise raptor-3 for the first stage and raptor-vacuum for upper stages, with methalox.",
    "tankVolumeM3: π × (diameter/2)² × that stage's tank section height × 0.8, using the scale above.",
    "payloadMassKg: use a written figure if any; otherwise estimate from the payload section's size.",
    "Parts: one bounding box per visible part (nose, payload, each stage's tanks, engines, each fin, legs, windows, panels).",
    `A rough geometric pre-read found: height ${d.heightM} m, diameter ${d.diameterM} m, ${d.stages.length} stage(s): ${hintStages}. Use it as a starting point but trust the drawing.`,
  ].join("\n");
}

/** Clamp and validate the model's answer. Returns null if it is unusable. */
export function sanitizeReading(raw: unknown, destination: DestinationId): SketchReading | null {
  if (!isRecord(raw)) return null;

  // Same uniform shrink as the geometry reader, so wide doodles don't become 27 m rockets.
  const rawDiameterM = clamp(num(raw.diameterM, 5), 0.3, 30);
  const scale = napkinScale(rawDiameterM);
  const diameterM = round1(rawDiameterM * scale);
  const stages: Stage[] = [];
  const minEngines: number[] = [];
  const locked: boolean[] = [];
  for (const s of (Array.isArray(raw.stages) ? raw.stages : []).filter(isRecord).slice(0, MAX_STAGES)) {
    const i = stages.length;
    const engine: EngineId = isEngineId(s.engine) ? s.engine : i === 0 ? "raptor-3" : "raptor-vacuum";
    minEngines.push(Math.max(1, Math.round(clamp(num(s.bellsDrawn, 1), 1, MAX_ENGINES))));
    locked.push(num(s.writtenEngineCount, 0) >= 1);
    stages.push({
      label: str(s.label, 24) || `Stage ${i + 1}`,
      engines: [{ engine, count: engineCount(s, i, diameterM, scale, stages[0]?.engines[0].count ?? 1) }],
      propellant: isPropellantId(s.propellant) ? s.propellant : "methalox",
      tankVolumeM3: Math.round(clamp(num(s.tankVolumeM3, 100) * scale ** 3, 1, 10_000)),
    });
  }
  if (stages.length === 0) return null;

  const parts = (Array.isArray(raw.parts) ? raw.parts : [])
    .filter(isRecord)
    .slice(0, MAX_PARTS)
    .map((p): Part => {
      const x = clamp(num(p.x, 0), 0, 1);
      const y = clamp(num(p.y, 0), 0, 1);
      const part: Part = {
        kind: isPartKind(p.kind) ? p.kind : "other",
        label: str(p.label, 32) || "Part",
        box: toBox(x, y, x + Math.max(num(p.width, 0), 0), y + Math.max(num(p.height, 0), 0)),
      };
      const stageIndex = num(p.stageIndex, NaN);
      if (Number.isInteger(stageIndex) && stageIndex >= 0 && stageIndex < stages.length) {
        part.stageIndex = stageIndex;
      }
      return part;
    });

  const features = [
    ...new Set(
      (Array.isArray(raw.features) ? raw.features : [])
        .map((f) => str(f, 24).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))
        .filter(Boolean),
    ),
  ].slice(0, MAX_FEATURES);

  const vehicle = raw.isLaunchVehicle !== false;
  const confidence = clamp(num(raw.confidence, vehicle ? 0.8 : 0.2), 0, 1);
  const design = tuneEngines(
    {
      name: str(raw.name, 40) || "Napkin Special",
      stages,
      payloadMassKg: Math.round(clamp(num(raw.payloadMassKg, 10_000) * scale ** 3, 0, 500_000)),
      destination,
      features,
      heightM: round1(clamp(num(raw.heightM, 50) * scale, 1, 200)),
      diameterM,
    },
    { minEngines, locked },
  );
  return {
    design,
    parts,
    confidence: Math.round((vehicle ? confidence : Math.min(confidence, 0.3)) * 100) / 100,
    problem: str(raw.problem, 160) || null,
  };
}

/** A written count wins; otherwise drawn bells are read at scale (see ./engines). */
function engineCount(
  s: Record<string, unknown>,
  index: number,
  diameterM: number,
  scale: number,
  boosterEngines: number,
): number {
  const written = num(s.writtenEngineCount, NaN);
  if (written >= 1) return Math.round(clamp(written, 1, MAX_ENGINES));
  const bells = Math.round(clamp(num(s.bellsDrawn, 0), 0, MAX_ENGINES));
  if (bells > 0) return enginesForBells(Array(bells).fill(num(s.bellWidthM, REFERENCE_BELL_M) * scale));
  return index === 0 ? enginesForBase(diameterM) : upperStageEngines(boosterEngines);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

const round1 = (n: number) => Math.round(n * 10) / 10;
