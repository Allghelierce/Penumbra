// The reviewer's voice: a gruff but funny SpaceX propulsion engineer.
// Every number it says comes from the Analysis it's handed; nothing is invented.

import type { Analysis, Design, DesignAction, DestinationId, Review } from "../design";

export const DESTINATION_NAMES: Record<DestinationId, string> = {
  leo: "low Earth orbit",
  gto: "geostationary transfer orbit",
  "moon-orbit": "lunar orbit",
  "moon-surface": "the lunar surface",
  "mars-transfer": "Mars",
  "mars-surface": "the surface of Mars",
  europa: "Europa",
};

/** Destinations you can only reach by surviving atmospheric entry. */
const NEEDS_HEAT_SHIELD: DestinationId[] = ["mars-surface"];

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function pick<T>(items: T[], seed: number): T {
  return items[Math.abs(Math.round(seed)) % items.length];
}

/** The one fix to push for, given the current analysis. */
export function nudge(design: Design | null, analysis: Analysis): string {
  if (analysis.liftoffTwr < 1) {
    return pick(
      ["It needs more engines on the bottom, or less of everything else.", "Bolt on more engines. Gravity is winning."],
      analysis.liftoffMassKg,
    );
  }
  if (analysis.marginMps < 0) {
    if ((design?.stages.length ?? 1) < 2) return "Add another stage. Single stage to anywhere is a myth.";
    return pick(
      ["Stretch the tanks or add another stage.", "More tank. Or another stage. Pick one."],
      analysis.totalDeltaVMps,
    );
  }
  if (design && NEEDS_HEAT_SHIELD.includes(design.destination) && !design.features.includes("heat-shield")) {
    return "And draw a heat shield, or it lands as a meteor.";
  }
  return pick(["Light it.", "Go ahead, launch it.", "I hate to say it, but send it."], analysis.marginMps);
}

/** One or two spoken sentences on where the design stands. */
export function verdictLine(design: Design | null, analysis: Analysis): string {
  const where = DESTINATION_NAMES[design?.destination ?? "leo"];
  const finding = analysis.findings[0];
  let line: string;
  switch (analysis.verdict) {
    case "stuck-on-pad":
      line = finding ?? `Liftoff thrust-to-weight is ${analysis.liftoffTwr.toFixed(2)}. That's a monument, not a rocket.`;
      break;
    case "suborbital":
    case "orbit":
      line = finding ?? `It's ${fmt(-analysis.marginMps)} meters per second short of ${where}.`;
      break;
    case "destination":
      line = finding ?? `It makes ${where} with ${fmt(analysis.marginMps)} meters per second to spare.`;
      break;
  }
  return `${line} ${nudge(design, analysis)}`;
}

/** What changed between two analyses, in one sentence, or null if nothing worth saying. */
export function deltaLine(before: Analysis | null, after: Analysis): string | null {
  if (!before) return null;
  if (before.verdict !== after.verdict) {
    if (after.verdict === "destination") return `Now it makes it, with ${fmt(after.marginMps)} meters per second of margin.`;
    if (after.verdict === "stuck-on-pad") return `Now it can't even lift itself. Thrust-to-weight is ${after.liftoffTwr.toFixed(2)}.`;
  }
  const change = after.marginMps - before.marginMps;
  if (Math.abs(change) < 1) return null;
  return `Margin went from ${fmt(before.marginMps)} to ${fmt(after.marginMps)} meters per second.`;
}

/** The quick acknowledgement said right after an edit is applied. */
export function ackLine(action: DesignAction, design: Design | null): string {
  switch (action.type) {
    case "set-destination": {
      const name = DESTINATION_NAMES[action.destination];
      const capitalized = name[0].toUpperCase() + name.slice(1);
      return pick([`${capitalized}. Bold.`, `${capitalized}, huh. Okay.`], action.destination.length);
    }
    case "scale-tanks": {
      const pct = Math.round(Math.abs(action.factor - 1) * 100);
      return action.factor >= 1 ? `Stretching the tanks ${pct} percent.` : `Shrinking the tanks ${pct} percent.`;
    }
    case "add-stage":
      return "Another stage. Now we're talking.";
    case "remove-stage":
      return `Cutting ${design?.stages[action.stageIndex]?.label ?? "that stage"}.`;
    case "set-engines":
      return `${action.count} ${action.count === 1 ? "engine" : "engines"}, got it.`;
    case "set-payload":
      return `Payload's ${fmt(action.payloadMassKg / 1000)} tons.`;
    case "launch":
      return pick(["Copy. Lighting the candle.", "Clear the pad.", "Okay, your funeral. Launching."], Date.now() / 1000);
    case "review":
      return "Let me look.";
  }
}

/** Make text friendlier for a speech synthesizer (captions keep the original). */
export function speakable(text: string): string {
  return text
    .replace(/\bkm\/s\b/g, " kilometers per second")
    .replace(/\bm\/s\b/g, " meters per second")
    .replace(/\bTWR\b/g, "thrust to weight")
    .replace(/\bkN\b/g, " kilonewtons")
    .replace(/\bkg\b/g, " kilograms")
    .replace(/(\d)\s?t\b/g, "$1 tons")
    .replace(/\bΔv\b|\bdelta-v\b/gi, "delta V")
    .replace(/\bLEO\b/g, "low Earth orbit")
    .replace(/\s{2,}/g, " ");
}

/** System instructions for Grok Voice, rebuilt whenever the design or analysis changes. */
export function buildInstructions(design: Design | null, analysis: Analysis | null, review: Review | null): string {
  const lines = [
    "You are a gruff but funny SpaceX propulsion engineer reviewing a spacecraft someone sketched on a napkin.",
    "Speak in short replies: one or two sentences. Dry humor, no pep talk, no lists, no markdown.",
    "Only quote numbers that appear in the CURRENT ANALYSIS below. Never estimate or invent a number. If you don't have it, say so.",
    "Always nudge toward the single most useful fix: more tank, another stage, more engines, or a heat shield.",
    "When the user asks for a change, call the matching tool instead of describing it. After the tool result comes back, say what changed using its numbers.",
    "Tools: set_destination, scale_tanks, add_stage, remove_stage, set_engines, set_payload, launch, review.",
    "If the user says 'send it' or 'launch it' with no destination, call launch.",
  ];
  if (!design || !analysis) {
    lines.push("", "There is no design yet. Tell them to draw something on the napkin first.");
    return lines.join("\n");
  }
  lines.push("", "CURRENT DESIGN:", describeDesign(design), "", "CURRENT ANALYSIS:", describeAnalysis(design, analysis));
  if (review?.summary) lines.push("", `RED-PEN REVIEW: ${review.summary}`);
  return lines.join("\n");
}

export function describeDesign(design: Design): string {
  const stages = design.stages
    .map((s, i) => {
      const engines = s.engines.map((e) => `${e.count}x ${e.engine}`).join(" + ") || "no engines";
      return `  stage ${i} "${s.label}": ${engines}, ${s.propellant}, tanks ${fmt(s.tankVolumeM3)} m3`;
    })
    .join("\n");
  return [
    `"${design.name}", ${design.heightM} m tall, ${design.diameterM} m wide, headed for ${DESTINATION_NAMES[design.destination]} (${design.destination}).`,
    `Payload ${fmt(design.payloadMassKg)} kg. Features: ${design.features.join(", ") || "none"}.`,
    stages || "  no stages",
  ].join("\n");
}

export function describeAnalysis(design: Design, analysis: Analysis): string {
  const stages = analysis.stages
    .map((s, i) => `  stage ${i} "${s.label}": delta-v ${fmt(s.deltaVMps)} m/s, TWR at ignition ${s.twrAtIgnition.toFixed(2)}, burn ${fmt(s.burnTimeS)} s`)
    .join("\n");
  return [
    `Verdict: ${analysis.verdict}. Liftoff mass ${fmt(analysis.liftoffMassKg)} kg, liftoff TWR ${analysis.liftoffTwr.toFixed(2)}.`,
    `Total delta-v ${fmt(analysis.totalDeltaVMps)} m/s; ${DESTINATION_NAMES[design.destination]} needs ${fmt(analysis.requiredDeltaVMps)} m/s; margin ${fmt(analysis.marginMps)} m/s.`,
    `Furthest reachable: ${analysis.furthestReachable ? DESTINATION_NAMES[analysis.furthestReachable] : "nowhere, it can't make orbit"}.`,
    stages,
    "Findings:",
    ...analysis.findings.map((f) => `  - ${f}`),
  ].join("\n");
}

/** Compact analysis summary sent back as a tool result so the model can quote the new numbers. */
export function toolResult(design: Design | null, analysis: Analysis | null): Record<string, unknown> {
  if (!design || !analysis) return { ok: true, note: "No analysis yet." };
  return {
    ok: true,
    destination: design.destination,
    verdict: analysis.verdict,
    totalDeltaVMps: Math.round(analysis.totalDeltaVMps),
    requiredDeltaVMps: Math.round(analysis.requiredDeltaVMps),
    marginMps: Math.round(analysis.marginMps),
    liftoffTwr: Math.round(analysis.liftoffTwr * 100) / 100,
    furthestReachable: analysis.furthestReachable,
    findings: analysis.findings,
  };
}
