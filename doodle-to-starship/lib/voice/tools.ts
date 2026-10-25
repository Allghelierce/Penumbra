// Grok Voice tool definitions, one per DesignAction, and the mapping back.

import type { Design, DesignAction, DestinationId, EngineId } from "../design";

// Records keep these lists exhaustive: adding an id to lib/design.ts fails to compile here.
const DESTINATIONS: Record<DestinationId, true> = {
  leo: true, gto: true, "moon-orbit": true, "moon-surface": true,
  "mars-transfer": true, "mars-surface": true, europa: true,
};
const ENGINES: Record<EngineId, true> = {
  "raptor-3": true, "raptor-vacuum": true, "merlin-1d": true, "merlin-vacuum": true,
  "rs-25": true, rl10c: true, "f-1": true, "j-2": true, "be-4": true, "rd-180": true,
  rutherford: true, "generic-solid": true,
};
export const DESTINATION_IDS = Object.keys(DESTINATIONS) as DestinationId[];
export const ENGINE_IDS = Object.keys(ENGINES) as EngineId[];

export interface VoiceTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

const stageIndex = {
  type: "integer",
  minimum: 0,
  description: "Which stage, 0 = bottom stage (fires first). Defaults to 0.",
};

export const VOICE_TOOLS: VoiceTool[] = [
  {
    name: "set_destination",
    description: "Change where the spacecraft is headed. 'Send it to Mars' means mars-transfer; landing on Mars means mars-surface.",
    parameters: {
      type: "object",
      properties: { destination: { type: "string", enum: DESTINATION_IDS } },
      required: ["destination"],
    },
  },
  {
    name: "scale_tanks",
    description: "Stretch or shrink one stage's propellant tanks. factor 1.3 means 30 percent bigger, 0.8 means 20 percent smaller.",
    parameters: {
      type: "object",
      properties: { stage_index: stageIndex, factor: { type: "number", minimum: 0.1, maximum: 10 } },
      required: ["factor"],
    },
  },
  {
    name: "add_stage",
    description: "Add another stage to the stack.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "remove_stage",
    description: "Remove a stage. Defaults to the top stage.",
    parameters: { type: "object", properties: { stage_index: stageIndex }, required: [] },
  },
  {
    name: "set_engines",
    description: "Set the engine type and how many of them a stage has.",
    parameters: {
      type: "object",
      properties: {
        stage_index: stageIndex,
        engine: { type: "string", enum: ENGINE_IDS },
        count: { type: "integer", minimum: 1, maximum: 60 },
      },
      required: ["engine", "count"],
    },
  },
  {
    name: "set_payload",
    description: "Set the payload mass in metric tons.",
    parameters: {
      type: "object",
      properties: { payload_tons: { type: "number", minimum: 0 } },
      required: ["payload_tons"],
    },
  },
  {
    name: "launch",
    description: "Launch the current design and watch the flight.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "review",
    description: "Re-run the red-pen review of the sketch.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

function int(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function clampStage(value: unknown, design: Design | null, fallback: number): number {
  const last = Math.max(0, (design?.stages.length ?? 1) - 1);
  return Math.min(last, Math.max(0, int(value, fallback)));
}

/** Turn a tool call into a DesignAction, or an error message to send back to the model. */
export function toolCallToAction(
  name: string,
  args: Record<string, unknown>,
  design: Design | null,
): { action: DesignAction } | { error: string } {
  const last = Math.max(0, (design?.stages.length ?? 1) - 1);
  switch (name) {
    case "set_destination": {
      const destination = args.destination as DestinationId;
      if (!DESTINATION_IDS.includes(destination)) return { error: `Unknown destination ${String(args.destination)}.` };
      return { action: { type: "set-destination", destination } };
    }
    case "scale_tanks": {
      const factor = Number(args.factor);
      if (!Number.isFinite(factor) || factor <= 0) return { error: "factor must be a positive number." };
      return {
        action: { type: "scale-tanks", stageIndex: clampStage(args.stage_index, design, 0), factor: Math.min(10, Math.max(0.1, factor)) },
      };
    }
    case "add_stage":
      return { action: { type: "add-stage" } };
    case "remove_stage":
      if ((design?.stages.length ?? 0) <= 1) return { error: "It only has one stage; can't remove it." };
      return { action: { type: "remove-stage", stageIndex: clampStage(args.stage_index, design, last) } };
    case "set_engines": {
      const engine = args.engine as EngineId;
      if (!ENGINE_IDS.includes(engine)) return { error: `Unknown engine ${String(args.engine)}.` };
      return {
        action: {
          type: "set-engines",
          stageIndex: clampStage(args.stage_index, design, 0),
          engine,
          count: Math.min(60, Math.max(1, int(args.count, 1))),
        },
      };
    }
    case "set_payload": {
      const tons = Number(args.payload_tons);
      if (!Number.isFinite(tons) || tons < 0) return { error: "payload_tons must be zero or more." };
      return { action: { type: "set-payload", payloadMassKg: Math.round(tons * 1000) } };
    }
    case "launch":
      return { action: { type: "launch" } };
    case "review":
      return { action: { type: "review" } };
    default:
      return { error: `Unknown tool ${name}.` };
  }
}
