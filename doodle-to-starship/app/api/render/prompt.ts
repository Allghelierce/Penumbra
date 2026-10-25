import type { Analysis, Design, DestinationId, EngineId, RenderRequest, Verdict } from "@/lib/design";

// Turns a design and its verdict into a photoreal Grok Imagine prompt.

const ENGINE_NAMES: Record<EngineId, string> = {
  "raptor-3": "Raptor 3",
  "raptor-vacuum": "Raptor Vacuum",
  "merlin-1d": "Merlin 1D",
  "merlin-vacuum": "Merlin Vacuum",
  "rs-25": "RS-25",
  rl10c: "RL10C",
  "f-1": "F-1",
  "j-2": "J-2",
  "be-4": "BE-4",
  "rd-180": "RD-180",
  rutherford: "Rutherford",
  "generic-solid": "solid rocket motor",
};

const ORBIT = "in orbit high above Earth's limb, thin blue atmosphere against black space, sunlight glinting off the hull";

const ARRIVAL: Record<DestinationId, string> = {
  leo: ORBIT,
  gto: ORBIT,
  "moon-orbit": "in orbit around the Moon, grey cratered lunar surface below, Earth rising on the horizon",
  "moon-surface": "landed upright on the Moon's grey cratered surface, Earth hanging in the black sky",
  "mars-transfer": "coasting through deep space toward a small red Mars, engines dark, stars all around",
  "mars-surface": "landed upright on the rusty red plains of Mars under a butterscotch sky, dust settling around it",
  europa: "landed upright on Europa's cracked ice plains, giant striped Jupiter filling the black sky",
};

const OUTCOME: Record<Exclude<Verdict, "destination">, string> = {
  orbit: ORBIT,
  suborbital:
    "breaking apart in a fireball high over the ocean, debris trails streaking down through the clouds, seen by a long-range tracking camera",
  "stuck-on-pad":
    "exploding on the launch pad, a huge fireball engulfing the pad and tower, smoke billowing, seen from a safe distance",
};

const CONCEPT = "standing on the launch pad at dusk, floodlit, vapor venting, shot like a real SpaceX press photo";

const STYLE = "Photorealistic, cinematic lighting, high detail, wide shot. No text, no logos, no watermarks.";

export function buildRenderPrompt(
  design: Partial<Design>,
  analysis: Partial<Analysis> | undefined,
  kind: RenderRequest["kind"],
): string {
  const stages = Array.isArray(design.stages) ? design.stages : [];
  const ordinal = ["first", "second", "third", "fourth"];

  const engines = stages
    .map((stage, i) => {
      const clusters = (Array.isArray(stage?.engines) ? stage.engines : [])
        .map((c) => `${c.count} ${ENGINE_NAMES[c.engine] ?? "rocket"} engine${c.count === 1 ? "" : "s"}`)
        .join(" and ");
      return clusters && `${clusters} on the ${ordinal[i] ?? "upper"} stage`;
    })
    .filter(Boolean)
    .join(", ");

  const features = (Array.isArray(design.features) ? design.features : []).map((f) => String(f).replace(/-/g, " "));
  const size =
    Number.isFinite(design.heightM) && Number.isFinite(design.diameterM)
      ? `, about ${Math.round(design.heightM!)} m tall and ${Math.round(design.diameterM!)} m in diameter`
      : "";

  const vehicle = [
    `A ${stages.length > 1 ? `${stages.length}-stage` : "single-stage"} rocket${size}`,
    engines && `with ${engines}`,
    features.length > 0 && `featuring ${features.join(", ")}`,
  ]
    .filter(Boolean)
    .join(", ");

  return `${vehicle}, ${scene(design, analysis, kind)}. ${STYLE}`;
}

function scene(design: Partial<Design>, analysis: Partial<Analysis> | undefined, kind: RenderRequest["kind"]): string {
  if (kind !== "outcome") return CONCEPT;
  const verdict = analysis?.verdict;
  if (verdict === "destination") return (design.destination && ARRIVAL[design.destination]) || ORBIT;
  return (verdict && OUTCOME[verdict]) || ORBIT;
}
