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
  "rutherford-vacuum": "Rutherford Vacuum",
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

const PATCH_BACKDROP: Record<DestinationId, string> = {
  leo: "the curve of Earth seen from orbit",
  gto: "the curve of Earth seen from orbit",
  "moon-orbit": "the grey cratered Moon",
  "moon-surface": "the grey cratered Moon",
  "mars-transfer": "the red planet Mars",
  "mars-surface": "the red planet Mars",
  europa: "icy cracked Europa with banded Jupiter behind it",
};

/** Text-to-image prompt for /images/generations. */
export function buildRenderPrompt(
  design: Partial<Design>,
  analysis: Partial<Analysis> | undefined,
  kind: RenderRequest["kind"],
): string {
  return `${describeVehicle(design)}, ${scene(design, analysis, kind)}. ${STYLE}`;
}

/** Prompt for /images/edits on the napkin PNG, so the photo keeps the user's own drawing. */
export function buildSketchEditPrompt(
  design: Partial<Design>,
  analysis: Partial<Analysis> | undefined,
  kind: RenderRequest["kind"],
): string {
  const vehicle = describeVehicle(design);
  const it = `It is ${vehicle[0].toLowerCase()}${vehicle.slice(1)}`;
  if (kind === "concept") {
    // The studio cuts this out (black → transparent) and cross-fades the doodle into it on the napkin,
    // so the rocket must sit exactly where the pencil lines are, alone on pure black.
    return [
      "Turn this pencil napkin sketch into a photorealistic photograph of the real spacecraft it depicts,",
      "isolated on a pure solid black background (#000000).",
      "No ground, no launch pad, no sky, no horizon, no smoke, no reflections: nothing but the vehicle,",
      "evenly lit like a studio product shot, with a rim light separating it from the black.",
      "Keep the vehicle exactly where it is drawn: same position, same scale, same silhouette and proportions, centered and filling the frame's height as the drawing does.",
      "Keep every stage, fin, flap, leg and engine bell that is drawn.",
      `${it}.`,
      "Portrait framing. No text, no logos, no pencil lines, no paper.",
    ].join(" ");
  }
  return [
    "Turn this pencil napkin sketch into a photorealistic photograph of the real spacecraft it depicts.",
    "Keep its exact silhouette, proportions, stage count, fins, flaps, legs and engine bells.",
    `${it}, ${scene(design, analysis, kind)}.`,
    "Cinematic lighting. No text, no logos, no pencil lines, no paper.",
  ].join(" ");
}

/** Square embroidered mission patch for /images/generations (never edited from the sketch). */
export function buildPatchPrompt(design: Partial<Design>): string {
  const stageCount = Math.min(4, Math.max(1, Array.isArray(design.stages) ? design.stages.length : 1));
  const name = (typeof design.name === "string" ? design.name : "").replace(/["\n]/g, "").trim().slice(0, 30) || "Napkin Special";
  const parts = (Array.isArray(design.features) ? design.features : [])
    .filter((f) => ["fins", "grid-fins", "flaps", "landing-legs", "heat-shield"].includes(f))
    .map((f) => (f === "heat-shield" ? "a heat shield" : String(f).replace(/-/g, " ")));
  const shape =
    (stageCount > 1 ? `${stageCount}-stage rocket` : "single-stage rocket") +
    (parts.length > 0 ? ` with ${parts.join(" and ")}` : "");
  const backdrop = (design.destination && PATCH_BACKDROP[design.destination]) || PATCH_BACKDROP.leo;
  return [
    "An embroidered circular space mission patch in the classic 1960s–2020s crewed-mission style, photographed flat.",
    `The mission name "${name.toUpperCase()}" is stitched in bold capital letters around the rim.`,
    `In the center, a stylized silhouette of a ${shape}, rising in front of ${backdrop}.`,
    `${stageCount} small embroidered star${stageCount === 1 ? "" : "s"} in the sky.`,
    "Thick raised embroidered border, visible thread texture, rich colors.",
    "Centered on a plain light background, square image. No other text, no agency logos.",
  ].join(" ");
}

function describeVehicle(design: Partial<Design>): string {
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

  return [
    `A ${stages.length > 1 ? `${stages.length}-stage` : "single-stage"} rocket${size}`,
    engines && `with ${engines}`,
    features.length > 0 && `featuring ${features.join(", ")}`,
  ]
    .filter(Boolean)
    .join(", ");
}

function scene(design: Partial<Design>, analysis: Partial<Analysis> | undefined, kind: RenderRequest["kind"]): string {
  if (kind !== "outcome") return CONCEPT;
  const verdict = analysis?.verdict;
  if (verdict === "destination") return (design.destination && ARRIVAL[design.destination]) || ORBIT;
  return (verdict && OUTCOME[verdict]) || ORBIT;
}
