// The recap after every flight: how this attempt went, what changed since the last one,
// and what to try next. Every suggestion with a fix is re-checked with analyze() first, so
// the recap never offers an edit the physics says won't work.

import { applyAction } from "./actions";
import type { Analysis, Attempt, Design, DesignAction, DestinationId, Improvement, Recap, RedPenMark } from "./design";
import { analyze, DESTINATIONS, ENGINES, km, kmShort, kmSpare } from "./physics";
import { buildReview, DESTINATION_NAMES, hardwareNeeds, massText, SAFE_TWR } from "./redpen";

const MAX_IMPROVEMENTS = 3;
/** Margin past which a design counts as over-built and could shed tank volume. */
const OVERBUILT_MPS = 2_000;
/** Don't bother suggesting a shrink smaller than this. */
const MIN_SHRINK_PERCENT = 5;
/** Past this, "shrink the tanks" really means "remove the stage", which isn't useful advice. */
const MAX_SHRINK_PERCENT = 50;
const MAX_STRETCH = 2.5;

export function recap(attempts: Attempt[]): Recap {
  const current = attempts.at(-1);
  if (!current) return { headline: "No flights yet", delta: null, improvements: [] };
  const previous = attempts.at(-2) ?? null;

  return {
    headline: headline(current, previous),
    delta: previous ? delta(current, previous) : null,
    improvements: improvements(current.design, current.analysis).slice(0, MAX_IMPROVEMENTS),
  };
}

// ---------------------------------------------------------------------------
// Headline and delta

function headline(current: Attempt, previous: Attempt | null): string {
  const a = current.analysis;
  const start = `Attempt ${current.n}: ${outcome(current.design, a)}`;
  if (a.verdict === "stuck-on-pad") return `${start}, thrust-to-weight ${a.liftoffTwr.toFixed(2)}`;
  if (previous && previous.analysis.verdict === "stuck-on-pad") return `${start}, off the pad this time`;
  if (previous) return `${start}, ${comparison(a.totalDeltaVMps, previous.analysis.totalDeltaVMps)}`;

  const leo = DESTINATIONS.leo.deltaVFromSurfaceMps;
  if (a.verdict === "suborbital") return `${start}, ${kmShort(a.totalDeltaVMps, leo)} km/s short of orbit`;
  if (a.verdict === "orbit") {
    return `${start}, ${kmShort(a.totalDeltaVMps, a.requiredDeltaVMps)} km/s short of ${DESTINATION_NAMES[current.design.destination]}`;
  }
  return `${start} with ${kmSpare(a.totalDeltaVMps, a.requiredDeltaVMps)} km/s to spare`;
}

function outcome(design: Design, a: Analysis): string {
  switch (a.verdict) {
    case "stuck-on-pad":
      return "stuck on the pad";
    case "suborbital":
      return "suborbital";
    case "orbit":
      return "orbit";
    case "destination":
      return design.destination === "leo" ? "orbit" : `reached ${DESTINATION_NAMES[design.destination]}`;
  }
}

/** "1.3 km/s better than last time", worked out from the rounded figures on screen. */
function comparison(now: number, before: number): string {
  if (km(now) === km(before)) return "same delta-v as last time";
  return now > before
    ? `${kmSpare(now, before)} km/s better than last time`
    : `${kmSpare(before, now)} km/s worse than last time`;
}

/** e.g. "+1.3 km/s since attempt 2 (tanks +12%, 1 stage added)". */
function delta(current: Attempt, previous: Attempt): string {
  const now = current.analysis.totalDeltaVMps;
  const before = previous.analysis.totalDeltaVMps;
  const sign = km(now) === km(before) ? "±" : now > before ? "+" : "−";
  const amount = sign === "±" ? "0.0" : now > before ? kmSpare(now, before) : kmSpare(before, now);
  const changes = designChanges(previous.design, current.design);
  return `${sign}${amount} km/s since attempt ${previous.n} (${changes.length > 0 ? changes.join(", ") : "no design changes"})`;
}

function designChanges(before: Design, after: Design): string[] {
  const changes: string[] = [];

  const stageChange = after.stages.length - before.stages.length;
  if (stageChange !== 0) {
    const n = Math.abs(stageChange);
    changes.push(`${n} stage${n === 1 ? "" : "s"} ${stageChange > 0 ? "added" : "removed"}`);
  } else {
    const volume = (d: Design) => d.stages.reduce((sum, s) => sum + s.tankVolumeM3, 0);
    const percent = Math.round((volume(after) / volume(before) - 1) * 100);
    if (percent !== 0 && Number.isFinite(percent)) changes.push(`tanks ${percent > 0 ? "+" : ""}${percent}%`);
  }

  const engines = (d: Design) => d.stages.reduce((sum, s) => sum + s.engines.reduce((n, c) => n + c.count, 0), 0);
  if (engines(after) !== engines(before)) changes.push(`engines ${engines(before)} → ${engines(after)}`);

  if (Math.round(after.payloadMassKg) !== Math.round(before.payloadMassKg)) {
    changes.push(`payload ${tonnes(before.payloadMassKg)} → ${tonnes(after.payloadMassKg)}`);
  }
  if (after.destination !== before.destination) {
    changes.push(`target ${DESTINATION_NAMES[before.destination]} → ${DESTINATION_NAMES[after.destination]}`);
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Improvements

function improvements(design: Design, analysis: Analysis): Improvement[] {
  const out: Improvement[] = [];
  const marks = buildReview({ design, parts: [] }, analysis).marks;
  // A marginal liftoff isn't a success yet, whatever the delta-v says.
  const reached = analysis.verdict === "destination" && analysis.liftoffTwr >= SAFE_TWR;

  if (!reached) out.push(...fixesFromRedPen(design, marks));
  out.push(...landingNeeds(design));
  if (reached) out.push(...levelUps(design, analysis));
  if (!reached) {
    const aimLower = aimForReachable(design, analysis);
    if (aimLower) out.push(aimLower);
  }
  return out;
}

/** "Works": a safe liftoff, and enough delta-v for the destination. */
function works(a: Analysis) {
  return a.liftoffTwr >= SAFE_TWR && a.marginMps >= 0;
}

/** The red pen's computed fixes, phrased as what each one buys, and each re-checked. */
function fixesFromRedPen(design: Design, marks: RedPenMark[]): Improvement[] {
  const target = goal(design);
  const out: Improvement[] = [];
  let base = design;
  // Fuel fixes only need to leave the pad; a marginal liftoff gets its own engine fix next time.
  const closes = (a: Analysis) => a.liftoffTwr >= 1 && a.marginMps >= 0;

  // When the rocket could make the trip carrying less, that comes first.
  const payload = marks.find((m) => m.fix?.type === "set-payload")?.fix;
  if (payload?.type === "set-payload" && closes(analyze(applyAction(design, payload)))) {
    out.push({ text: `Carry ${massText(payload.payloadMassKg)} instead of ${massText(design.payloadMassKg)} to ${target}`, fix: payload });
  }

  const engines = marks.find((m) => m.fix?.type === "set-engines")?.fix;
  if (engines?.type === "set-engines") {
    const fixed = applyAction(design, engines);
    if (analyze(fixed).liftoffTwr >= SAFE_TWR) {
      const extra = engines.count - design.stages[0].engines[0].count;
      const why = analyze(design).liftoffTwr < 1 ? "to get off the pad" : "for a safe liftoff";
      out.push({
        text: `Add ${extra} more ${ENGINES[engines.engine].name} engine${extra === 1 ? "" : "s"} ${why}`,
        fix: engines,
      });
      base = fixed;
    }
  }
  const then = base !== design;

  const thenEngines = (a: Analysis) => (a.liftoffTwr < SAFE_TWR ? ", then more engines" : "");
  for (const mark of marks) {
    const fix = mark.fix;
    if (fix?.type === "scale-tanks") {
      const after = analyze(applyAction(base, fix));
      if (closes(after)) {
        const percent = Math.round((fix.factor - 1) * 100);
        out.push({
          text: `${then ? "Then stretch" : "Stretch"} the ${tankName(design, fix.stageIndex)} ${percent}% to ${target}${thenEngines(after)}`,
          fix,
        });
      }
    } else if (fix?.type === "add-stage") {
      const before = analyze(base);
      const after = analyze(applyAction(base, fix));
      if (closes(after)) {
        out.push({ text: `${then ? "Then add" : "Add"} a stage to ${target}${thenEngines(after)}`, fix });
      } else if (after.liftoffTwr >= 1 && after.totalDeltaVMps > before.totalDeltaVMps) {
        out.push({
          text: `${then ? "Then add" : "Add"} a stage for ${kmSpare(after.totalDeltaVMps, before.totalDeltaVMps)} km/s more (still ${kmShort(after.totalDeltaVMps, after.requiredDeltaVMps)} km/s short)`,
          fix,
        });
      }
    }
  }
  return out;
}

/** Legs and a heat shield aren't design edits the app can make; they're drawn on the napkin. */
function landingNeeds(design: Design): Improvement[] {
  const needs = hardwareNeeds(design);
  const out: Improvement[] = [];
  const place = DESTINATION_NAMES[design.destination];
  if (needs.legs) out.push({ text: `Draw landing legs to touch down on ${place}` });
  if (needs.shield) out.push({ text: `Draw a heat shield to survive entry at ${place}` });
  return out;
}

/** After a failure: the farthest target this design already reaches, if it isn't the current one. */
function aimForReachable(design: Design, analysis: Analysis): Improvement | null {
  const reachable = analysis.furthestReachable;
  if (!reachable || reachable === design.destination) return null;
  const fix: DesignAction = { type: "set-destination", destination: reachable };
  if (!works(analyze(applyAction(design, fix)))) return null;
  return { text: `Aim for ${DESTINATION_NAMES[reachable]} instead: this design already makes it`, fix };
}

/** After a success: carry more, go farther, or shed what isn't needed. */
function levelUps(design: Design, analysis: Analysis): Improvement[] {
  const out: Improvement[] = [];
  const payload = morePayload(design);
  if (payload) out.push(payload);
  const farther = goFarther(design, analysis);
  if (farther) out.push(farther);
  if (analysis.marginMps > OVERBUILT_MPS) {
    const shrink = shrinkTanks(design);
    if (shrink) out.push(shrink);
  }
  return out;
}

function morePayload(design: Design): Improvement | null {
  const worksWith = (kg: number) => works(analyze({ ...design, payloadMassKg: kg }));
  const start = design.payloadMassKg;
  let extra = 1_000;
  while (worksWith(start + extra)) {
    extra *= 2;
    if (extra > 1e8) return null;
  }
  let lo = 0;
  let hi = extra;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (worksWith(start + mid)) lo = mid;
    else hi = mid;
  }
  const shown = floorForDisplay(lo);
  if (shown < 100) return null;
  const fix: DesignAction = { type: "set-payload", payloadMassKg: start + shown };
  if (!works(analyze(applyAction(design, fix)))) return null;
  return { text: `You could carry ${tonnes(shown)} more to ${DESTINATION_NAMES[design.destination]}`, fix };
}

/** The next harder destination, and the cheapest edit that reaches it. */
function goFarther(design: Design, analysis: Analysis): Improvement | null {
  const required = DESTINATIONS[design.destination].deltaVFromSurfaceMps;
  const harder = (Object.keys(DESTINATIONS) as DestinationId[])
    .filter((id) => DESTINATIONS[id].deltaVFromSurfaceMps > required)
    .sort((a, b) => DESTINATIONS[a].deltaVFromSurfaceMps - DESTINATIONS[b].deltaVFromSurfaceMps);
  const next = harder[0];
  if (!next) return null;
  const name = DESTINATION_NAMES[next];
  const there = (d: Design): Design => ({ ...d, destination: next });

  // Already enough delta-v for it (or farther): just aim higher.
  const farthest = analysis.furthestReachable;
  if (farthest && DESTINATIONS[farthest].deltaVFromSurfaceMps > required) {
    const fix: DesignAction = { type: "set-destination", destination: farthest };
    if (works(analyze(applyAction(design, fix)))) {
      return { text: `It already has the delta-v for ${DESTINATION_NAMES[farthest]}: aim for it`, fix };
    }
  }

  // Otherwise the smallest tank stretch on any stage, or failing that, a new stage.
  let best: { percent: number; stageIndex: number } | null = null;
  for (let stageIndex = 0; stageIndex < design.stages.length; stageIndex++) {
    const percent = smallestStretch(there(design), stageIndex);
    if (percent !== null && (!best || percent < best.percent)) best = { percent, stageIndex };
  }
  if (best) {
    const { percent, stageIndex } = best;
    const fix: DesignAction = { type: "scale-tanks", stageIndex, factor: (100 + percent) / 100 };
    if (works(analyze(there(applyAction(design, fix))))) {
      return { text: `Stretch the ${tankName(design, stageIndex)} ${percent}% and you'd reach ${name}`, fix };
    }
  }
  const staged: DesignAction = { type: "add-stage" };
  if (works(analyze(there(applyAction(design, staged))))) {
    return { text: `Add a stage and you'd reach ${name}`, fix: staged };
  }
  return null;
}

/** Smallest whole-percent stretch of one stage that makes `design` work, up to +150%. */
function smallestStretch(design: Design, stageIndex: number): number | null {
  const at = (factor: number) => analyze(applyAction(design, { type: "scale-tanks", stageIndex, factor }));
  if (at(MAX_STRETCH).marginMps < 0) return null;
  let lo = 1;
  let hi = MAX_STRETCH;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid).marginMps >= 0) hi = mid;
    else lo = mid;
  }
  const percent = Math.ceil((hi - 1) * 100 - 1e-9);
  return works(at((100 + percent) / 100)) ? percent : null;
}

/** Over-built: the most tank volume one stage can shed and still make it. */
function shrinkTanks(design: Design): Improvement | null {
  let best: { percent: number; stageIndex: number } | null = null;
  for (let stageIndex = 0; stageIndex < design.stages.length; stageIndex++) {
    const at = (factor: number) => analyze(applyAction(design, { type: "scale-tanks", stageIndex, factor }));
    let lo = 1 - MAX_SHRINK_PERCENT / 100;
    let hi = 1;
    if (works(at(lo))) hi = lo;
    else {
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (works(at(mid))) hi = mid;
        else lo = mid;
      }
    }
    const percent = Math.floor((1 - hi) * 100 + 1e-9);
    if (percent >= MIN_SHRINK_PERCENT && works(at((100 - percent) / 100)) && (!best || percent > best.percent)) {
      best = { percent, stageIndex };
    }
  }
  if (!best) return null;
  const { percent, stageIndex } = best;
  const fix: DesignAction = { type: "scale-tanks", stageIndex, factor: (100 - percent) / 100 };
  return { text: `Shrink the ${tankName(design, stageIndex)} ${percent}%; it still makes it`, fix };
}

// ---------------------------------------------------------------------------
// Wording

/** What reaching the current destination is called: "make orbit" or "reach Mars". */
function goal(design: Design) {
  return design.destination === "leo" ? "make orbit" : `reach ${DESTINATION_NAMES[design.destination]}`;
}

/** "tanks" for a single stage, "Booster tanks" when there are several. */
function tankName(design: Design, stageIndex: number) {
  return design.stages.length > 1 ? `${design.stages[stageIndex].label} tanks` : "tanks";
}

/** Rounds down to what's shown, so a suggested payload is never more than the rocket can carry. */
function floorForDisplay(kg: number) {
  if (kg >= 10_000) return Math.floor(kg / 1000) * 1000;
  if (kg >= 100) return Math.floor(kg / 100) * 100;
  return Math.floor(kg);
}

function tonnes(kg: number) {
  if (kg >= 10_000) return `${Math.round(kg / 1000).toLocaleString("en-US")} t`;
  if (kg >= 100) return `${(Math.round(kg / 100) / 10).toFixed(1)} t`;
  return `${Math.round(kg)} kg`;
}
