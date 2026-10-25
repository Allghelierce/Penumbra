import type {
  Analysis,
  Design,
  DesignAction,
  DestinationId,
  FlightEvent,
  FlightTrace,
  Part,
  Poll,
  PollCall,
  Recap,
  Review,
} from "./design";
import { ENGINES } from "./physics";
import { km, kmShort, kmSpare } from "./physics/format";

// Grok Voice Mission Control: the GO/NO-GO poll before launch, webcast callouts during it, and
// the "fly again?" offer after. Every number is read from the design or the physics.

const TARGET: Record<DestinationId, string> = {
  leo: "orbit",
  gto: "GTO",
  "moon-orbit": "lunar orbit",
  "moon-surface": "the Moon",
  "mars-transfer": "the Mars transfer",
  "mars-surface": "Mars",
  europa: "Europa",
};
const SURFACE: DestinationId[] = ["moon-surface", "mars-surface", "europa"];
/** Height over diameter beyond which the stack is too slender to survive max-Q (Falcon 9 is about 19). */
const MAX_FINENESS = 22;

const tonnes = (kg: number) => `${Math.round(kg / 1000).toLocaleString("en-US")} tonnes`;
const COUNT_WORDS = ["No", "One", "Two", "Three", "Four"];

/** The flight controllers' GO/NO-GO poll. Pass the reading's parts so drawn legs and shields count. */
export function pollRoom(design: Design, analysis: Analysis, review: Review | null, parts: Part[] = []): Poll {
  const fixes = (review?.marks ?? []).map((m) => m.fix).filter((f): f is DesignAction => Boolean(f));
  const engineFix = fixes.find((f) => f.type === "set-engines");
  const fuelFix = fixes.find((f) => f.type === "scale-tanks" || f.type === "add-stage" || f.type === "set-payload");
  const target = TARGET[design.destination];
  const calls: PollCall[] = [];

  // Propulsion: can it leave the pad?
  const twr = analysis.liftoffTwr.toFixed(2);
  const booster = design.stages[0]?.engines[0];
  const engines = booster ? `${booster.count} ${ENGINES[booster.engine]?.name ?? "engines"}` : "no engines";
  calls.push(
    analysis.liftoffTwr >= 1
      ? { role: "Propulsion", go: true, line: `Propulsion, GO. Thrust to weight ${twr} on ${engines}.` }
      : {
          role: "Propulsion",
          go: false,
          line: `Propulsion, NO-GO. Thrust to weight ${twr}. She won't leave the pad.`,
          ...(engineFix && { fix: engineFix }),
        },
  );

  // Structures: mass and shape.
  const fineness = design.diameterM > 0 ? design.heightM / design.diameterM : 0;
  calls.push(
    fineness <= MAX_FINENESS
      ? {
          role: "Structures",
          go: true,
          line: `Structures, GO. ${tonnes(analysis.liftoffMassKg)} at liftoff, ${Math.round(fineness)} to 1 fineness.`,
        }
      : {
          role: "Structures",
          go: false,
          line: `Structures, NO-GO. ${Math.round(fineness)} to 1 fineness. She'll buckle at max-Q.`,
        },
  );

  // Trajectory: delta-v against the target.
  const need = km(analysis.requiredDeltaVMps);
  if (analysis.liftoffTwr < 1) {
    calls.push({
      role: "Trajectory",
      go: false,
      line: `Trajectory, NO-GO. No trajectory from the pad. We need ${need} kilometers per second for ${target}.`,
    });
  } else if (analysis.marginMps < 0) {
    calls.push({
      role: "Trajectory",
      go: false,
      line: `Trajectory, NO-GO. We're ${kmShort(analysis.totalDeltaVMps, analysis.requiredDeltaVMps)} kilometers per second short of ${target}.`,
      ...(fuelFix && { fix: fuelFix }),
    });
  } else {
    calls.push({
      role: "Trajectory",
      go: true,
      line: `Trajectory, GO. ${km(analysis.totalDeltaVMps)} kilometers per second against ${need} for ${target}.`,
    });
  }

  // Landing: only when we're putting it down somewhere.
  if (SURFACE.includes(design.destination)) {
    const has = (feature: string, kind: Part["kind"]) =>
      design.features.includes(feature) || parts.some((p) => p.kind === kind);
    const missing = [
      !has("landing-legs", "landing-legs") && "landing legs",
      design.destination === "mars-surface" && !has("heat-shield", "heat-shield") && "a heat shield",
    ].filter(Boolean);
    const reserve = `${kmSpare(analysis.totalDeltaVMps, analysis.requiredDeltaVMps)} kilometers per second in reserve`;
    calls.push(
      missing.length === 0
        ? { role: "Landing", go: true, line: `Landing, GO. Gear is on the drawing, ${reserve}.` }
        : { role: "Landing", go: false, line: `Landing, NO-GO. No ${missing.join(" and no ")} on the drawing.` },
    );
  }

  const noGos = calls.filter((c) => !c.go);
  const go = noGos.length === 0;
  const summary = go
    ? "Flight, we are GO for launch."
    : `Hold, hold, hold. ${COUNT_WORDS[noGos.length] ?? noGos.length} NO-GO${noGos.length === 1 ? "" : "s"}: ${noGos.map((c) => c.role).join(" and ")}.`;
  calls.push({ role: "Flight", go, line: summary });
  return { calls, go, summary };
}

/** Altitude of the trace point nearest an event, in whole km. */
function altitudeAt(trace: FlightTrace | undefined, tS: number): number | null {
  if (!trace || trace.points.length === 0) return null;
  let best = trace.points[0];
  for (const p of trace.points) if (Math.abs(p.tS - tS) < Math.abs(best.tS - tS)) best = p;
  return Math.round(best.altitudeKm);
}

/** One short webcast-style line per flight event. Kept to a breath: events can come 1.2 s apart. */
export function calloutFor(event: FlightEvent, design: Design, trace?: FlightTrace): string {
  const alt = altitudeAt(trace, event.tS);
  switch (event.kind) {
    case "liftoff":
      return "Liftoff.";
    case "max-q":
      return "Max-Q.";
    case "stage-sep":
      return "Stage separation confirmed.";
    case "engine-cutoff":
      return "Engine cutoff.";
    case "orbit":
      return alt !== null ? `Orbit. ${alt} kilometers.` : "Orbit.";
    case "fuel-exhausted":
      return "Tanks dry.";
    case "apogee":
      return alt !== null ? `Apogee, ${alt} kilometers.` : "Apogee.";
    case "impact":
      return "Loss of signal.";
    case "arrival":
      return SURFACE.includes(design.destination)
        ? `Touchdown, ${TARGET[design.destination]}.`
        : `Arrival, ${TARGET[design.destination]}.`;
    case "pad-failure":
      return "Pad failure.";
  }
}

/** The spoken offer after a flight: the best improvement, then "Fly again?". */
export function offerFor(recap: Recap): { line: string; fix?: DesignAction } {
  const best = recap.improvements[0];
  if (!best) return { line: `${trimStop(recap.headline)}. Fly again?` };
  return { line: `${trimStop(best.text)}. Fly again?`, ...(best.fix && { fix: best.fix }) };
}

const trimStop = (text: string) => text.trim().replace(/[.!?]+$/, "");

export type Reply = "go" | "scrub" | "fix" | "yes" | "no";

/** Maps a spoken or typed reply to the poll or the offer. "No go" is a scrub, not a go. */
export function parseReply(text: string): Reply | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim()} `;
  if (/ (no[- ]?go|scrub|abort|hold|stop|cancel) /.test(t)) return "scrub";
  if (/ (fix|apply|change it|make the change|patch) /.test(t)) return "fix";
  if (/ (go|launch|send it|light it|liftoff) /.test(t)) return "go";
  if (/ (yes|yeah|yep|yup|sure|ok|okay|affirmative|do it|let's go|please|again) /.test(t)) return "yes";
  if (/ (no|nope|nah|negative|not now) /.test(t)) return "no";
  return null;
}
