// The red pen: deterministic rules that mark up a sketch like a teacher grading
// homework. It marks only what teaches: up to three corrections, each a few words, or a
// check mark when nothing needs fixing. Every number in a note comes from re-running the
// physics on an edited design, so the corrections are computed, never guessed.

import { applyAction, seaLevelEngine, vacuumOnly } from "./actions";
import {
  type Analysis,
  type Design,
  type DesignAction,
  type DestinationId,
  type EngineId,
  type Part,
  type PartKind,
  type Point,
  type RedPenMark,
  type Review,
  type SketchReading,
} from "./design";
import { analyze, ENGINES, enginesThatFit } from "./physics";
import { maxPayloadKg, MIN_LIFTOFF_TWR } from "./trade";

type Box = [x: number, y: number, w: number, h: number];
type SetEngines = Extract<DesignAction, { type: "set-engines" }>;
type SetPayload = Extract<DesignAction, { type: "set-payload" }>;

const MAX_MARKS = 3;
/**
 * Below this liftoff thrust-to-weight the red pen calls it marginal: the Saturn V's margin, the
 * same floor the payload ratings use, so a real rocket is never told it needs another engine.
 */
export const SAFE_TWR = MIN_LIFTOFF_TWR;
/** "+N engines" aims for this liftoff thrust-to-weight. */
const TARGET_TWR = 1.3;
/** Past this many extra engines the advice is to rethink the booster, not to add engines. */
const MAX_SENSIBLE_EXTRA_ENGINES = 200;
const FINS_NOTE = "useless in vacuum";
const PASS_NOTE = "Good to fly";
/** Stretch the tanks at most +150% before suggesting a new stage instead. */
const MAX_STRETCH = 2.5;
const MAX_EXTRA_ENGINES = 500;

/** Keeps arrow ends and outlines off the very edge of the napkin. */
const EDGE = 0.02;
/** About how wide one handwritten note character is, as a fraction of the napkin's width (measured in QA). */
const NOTE_CHAR_WIDTH = 0.017;
const MIN_ARROW = 0.06;
/** Stand-in for the rocket when the reading found no parts at all. */
const DEFAULT_ROCKET: Box = [0.38, 0.08, 0.24, 0.84];

/** Fins are dead weight here: no air at the end of the trip. Mars is left out because fins and flaps steer through its atmosphere. */
const VACUUM_DESTINATIONS = new Set<DestinationId>([
  "gto",
  "moon-orbit",
  "moon-surface",
  "mars-transfer",
  "europa",
]);
const LANDING_DESTINATIONS = new Set<DestinationId>(["moon-surface", "mars-surface"]);

export const DESTINATION_NAMES: Record<DestinationId, string> = {
  leo: "low Earth orbit",
  gto: "GTO",
  "moon-orbit": "lunar orbit",
  "moon-surface": "the Moon",
  "mars-transfer": "a Mars transfer",
  "mars-surface": "Mars",
  europa: "Europa",
};

/**
 * How the review may advise. `drawable: false` is for a drawing the user can't add parts to,
 * like a real rocket's template in Modify: hardware the trip needs (landing legs, a heat shield)
 * becomes a line in the summary instead of a mark asking them to draw it.
 */
export interface ReviewOptions {
  drawable?: boolean;
}

export function buildReview(reading: SketchReading, drawn: Analysis, { drawable = true }: ReviewOptions = {}): Review {
  const { parts } = reading;
  const sketch = new Sketch(parts);
  const side = sketch.openSide();
  const marks: RedPenMark[] = [];

  // More engines than fit side by side on their base can't be built, so that comes first, and
  // everything else is judged on the rocket cut back to the engines that fit.
  const over = overfitEngines(reading.design);
  for (const o of over) marks.push(fitMark(o, sketch, side));
  const design = withinFit(reading.design, over);
  const analysis = design === reading.design ? drawn : analyze(design);

  // When the rocket could make the trip carrying less, that's the first fix.
  const lighter = lighterPayload(design);
  if (lighter) marks.push({ ...arrowTo(sketch.capsuleSide(), side, -0.04, `max ${massText(lighter.payloadMassKg)}`), fix: lighter });

  const stuck = analysis.liftoffTwr < 1;
  const marginal = !stuck && analysis.liftoffTwr < SAFE_TWR;
  // A vacuum engine on the pad gives no thrust: the fix is its sea-level version, not more of it.
  const vacuum = stuck || marginal ? vacuumOnPad(design) : null;
  const extraEngines = (stuck || marginal) && !vacuum ? enginesForTwr(design, TARGET_TWR) : null;
  // Engines only help if they fit on the booster's base.
  const noRoom = extraEngines !== null && overfitEngines(withExtraEngines(design, extraEngines)).some((o) => o.stageIndex === 0);
  const sensibleEngines = extraEngines !== null && extraEngines <= MAX_SENSIBLE_EXTRA_ENGINES && !noRoom;
  if (vacuum) {
    const use = `use ${ENGINES[vacuum.swap].name}`;
    marks.push({ ...arrowTo(sketch.enginesSide(), side, 0, `vacuum-only: ${use}`, use), fix: vacuum.fix });
  } else if (stuck || marginal) {
    // Notes beside the rocket, not inside a circle on top of the drawing.
    const twr = `TWR ${formatTwr(analysis.liftoffTwr)}`;
    if (sensibleEngines) {
      const more = `+${extraEngines} engine${extraEngines === 1 ? "" : "s"}`;
      const fix = engineFix(design, extraEngines);
      marks.push({ ...arrowTo(sketch.enginesSide(), side, 0, `${twr}: ${more}`, more), ...(fix && { fix }) });
    } else {
      marks.push(arrowTo(sketch.enginesSide(), side, 0, `${twr}: too heavy`, "too heavy"));
    }
  }

  // A stuck or marginal rocket's fuel is judged as if the engine fix were made.
  const engineFixed = vacuum ? applyAction(design, vacuum.fix) : sensibleEngines ? withExtraEngines(design, extraEngines) : null;
  const flyable = !(stuck || marginal) ? design : engineFixed && analyze(engineFixed).liftoffTwr >= 1 ? engineFixed : null;
  const flyableAnalysis = flyable === design ? analysis : flyable && analyze(flyable);
  const short = flyableAnalysis !== null && flyableAnalysis.marginMps < 0;
  const fix = short ? planShortfallFix(flyable!, flyableAnalysis, sketch) : null;
  if (fix) marks.push(shortfallMark(fix, sketch));

  const needs = hardwareNeeds(design, parts);
  if (drawable) {
    if (needs.legs) marks.push(arrowTo(sketch.bottomCenter(), side, 0.06, "needs legs"));
    if (needs.shield) marks.push(arrowTo(sketch.capsuleSide(), side, -0.06, "heat shield!"));
    // Dead weight, not a no-go, so it comes after them.
    if (needs.fins) marks.push(arrowTo(sketch.finSide(side), side, -0.04, FINS_NOTE));
  }

  const issues = spreadNotes(marks.slice(0, MAX_MARKS));
  const summary = summarize(design, analysis, {
    lighter,
    vacuum,
    extraEngines,
    sensibleEngines,
    noRoom,
    fix,
    flyableAnalysis,
    needsLegs: needs.legs,
    needsShield: needs.shield,
    drawable,
  });
  return {
    marks: issues.length > 0 ? issues : [passMark(sketch, analysis)],
    summary: [...over.map(fitSentence), summary].join(" "),
  };
}

export type EngineOverfit = {
  stageIndex: number;
  clusterIndex: number;
  engine: EngineId;
  count: number;
  /** How many fit on the base (0 when not even one does). */
  fits: number;
  baseM: number;
  /** Back to as many as fit; none when not even one does. */
  fix?: SetEngines;
};

/**
 * Engine clusters with more engines than fit side by side on their stage's base: nozzle exits
 * plus a gap, packed as tightly as circles go, the same limit the trade sweeps stop at. A real
 * rocket's own clusters always fit. When a stage's clusters don't fit together, the one taking
 * the most room is cut back to what's left beside the others. A vacuum engine on the pad is left
 * to its own mark, whose fix swaps the engine.
 */
export function overfitEngines(design: Design): EngineOverfit[] {
  return design.stages.flatMap((stage, stageIndex) => {
    const baseM = stage.diameterM ?? design.diameterM;
    const counts = stage.engines.map((c) => c.count);
    const checked = stage.engines.map((c) => !(stageIndex === 0 && vacuumOnly(c.engine)));
    /** Share of the base a cluster takes, 0 when its nozzle size isn't known. */
    const share = (j: number) => {
      const alone = checked[j] ? enginesThatFit(stage.engines[j].engine, baseM) : null;
      return alone === null || counts[j] === 0 ? 0 : alone > 0 ? counts[j] / alone : Infinity;
    };
    const out: EngineOverfit[] = [];
    for (let guard = 0; guard < stage.engines.length; guard++) {
      const shares = stage.engines.map((_, j) => share(j));
      if (shares.reduce((a, b) => a + b, 0) <= 1 + 1e-9) break;
      const j = shares.indexOf(Math.max(...shares));
      const { engine, count } = stage.engines[j];
      const fits = enginesThatFit(engine, baseM, stage.engines.flatMap((c, k) => (k === j ? [] : [{ ...c, count: counts[k] }]))) ?? 0;
      const several = stage.engines.length > 1;
      // With other clusters beside it, none fitting means taking it off; alone, nothing will do.
      const fix: SetEngines | undefined =
        fits > 0 || several ? { type: "set-engines", stageIndex, engine, count: fits, ...(several && { clusterIndex: j }) } : undefined;
      out.push({ stageIndex, clusterIndex: j, engine, count, fits, baseM, ...(fix && { fix }) });
      counts[j] = fits;
      checked[j] = false;
    }
    return out;
  });
}

/** The design with each cluster that doesn't fit cut back to as many as do (the same object when all fit). */
export function withinFit(design: Design, over = overfitEngines(design)): Design {
  return over.reduce((d, o) => (o.fix ? applyAction(d, o.fix) : d), design);
}

/** Whether a mark is the "only N fit" correction. */
export function isFitMark(mark: RedPenMark) {
  return /^(only \d+ fits?|none fit)\b/.test(mark.note);
}

function fitMark(o: EngineOverfit, sketch: Sketch, side: 1 | -1): RedPenMark {
  const short = o.fits === 0 ? "none fit" : `only ${o.fits} fit${o.fits === 1 ? "s" : ""}`;
  return { ...arrowTo(sketch.stageEnginesSide(o.stageIndex), side, 0.04, `${short} (${metres(o.baseM)}m)`, short), ...(o.fix && { fix: o.fix }) };
}

function fitSentence(o: EngineOverfit): string {
  const n = o.fits === 0 ? "not even one does" : `${o.fits} ${o.fits === 1 ? "does" : "do"}`;
  return `${o.count} ${ENGINES[o.engine].name} engines don't fit on a ${metres(o.baseM)} m base; ${n}.`;
}

/** e.g. 3.7, 9 or 0.92. */
export function metres(m: number): string {
  return Number.isInteger(m) ? String(m) : m.toFixed(m < 1 ? 2 : 1);
}

/**
 * Hardware the trip needs and the napkin doesn't show (legs and a heat shield to land), and
 * fins that are dead weight where it's going. The review only has room for three marks, so
 * the design review and the recap ask this directly.
 */
export function hardwareNeeds(design: Design, parts: Part[] = []): { legs: boolean; shield: boolean; fins: boolean } {
  return {
    legs: LANDING_DESTINATIONS.has(design.destination) && !hasFeature(design, parts, "landing-legs"),
    shield: design.destination === "mars-surface" && !hasFeature(design, parts, "heat-shield"),
    fins: VACUUM_DESTINATIONS.has(design.destination) && hasFeature(design, parts, "fins"),
  };
}

// ---------------------------------------------------------------------------
// What-if physics

/** Fewest extra bottom-stage engines that lift off at `target` TWR, or null if no count gets there. */
function enginesForTwr(design: Design, target: number): number | null {
  if (!design.stages[0] || design.stages[0].engines.length === 0) return null;
  const twrWith = (extra: number) => analyze(withExtraEngines(design, extra)).liftoffTwr;

  // Each engine adds more thrust than weight, so TWR rises with count: double, then bisect.
  let hi = 1;
  while (twrWith(hi) < target) {
    hi *= 2;
    if (hi > MAX_EXTRA_ENGINES) return null;
  }
  let lo = 0;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (twrWith(mid) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * The tap-to-fix edit for "needs N more engines". set-engines replaces every cluster, so it
 * only matches the computed count when the bottom stage has a single cluster.
 */
function engineFix(design: Design, extra: number): DesignAction | undefined {
  const engines = design.stages[0].engines;
  if (engines.length !== 1) return undefined;
  return { type: "set-engines", stageIndex: 0, engine: engines[0].engine, count: engines[0].count + extra };
}

/** The design with `extra` more engines in the bottom stage's biggest cluster; other clusters stay as drawn. */
function withExtraEngines(design: Design, extra: number): Design {
  const bottom = design.stages[0];
  const main = bottom.engines.reduce((best, c, i, all) => (c.count > all[best].count ? i : best), 0);
  const engines = bottom.engines.map((c, i) => (i === main ? { ...c, count: c.count + extra } : c));
  return { ...design, stages: [{ ...bottom, engines }, ...design.stages.slice(1)] };
}

/**
 * The payload to carry instead when the rocket could make the trip lighter: the most it can
 * carry (trade.ts's figure, which also keeps a safe liftoff), floored to what the note shows.
 */
function lighterPayload(design: Design): SetPayload | null {
  if (!(design.payloadMassKg > 0)) return null;
  const kg = floorToShown(maxPayloadKg(design));
  return kg > 0 && kg < design.payloadMassKg ? { type: "set-payload", payloadMassKg: kg } : null;
}

export type VacuumSwap = { engine: EngineId; swap: EngineId; fix: SetEngines };

/**
 * A vacuum-only engine on the bottom stage, which can't fire at sea level, and the edit that
 * puts its sea-level version there instead: as many as were drawn, or enough to lift off at
 * TWR 1.3 if that takes more.
 */
export function vacuumOnPad(design: Design): VacuumSwap | null {
  const stage = design.stages[0];
  const i = stage?.engines.findIndex((c) => vacuumOnly(c.engine)) ?? -1;
  if (!stage || i < 0) return null;
  const { engine, count } = stage.engines[i];
  const swap = seaLevelEngine(engine, stage);
  if (vacuumOnly(swap)) return null;
  // Never more of the swap than fit on the base.
  const room = enginesThatFit(swap, stage.diameterM ?? design.diameterM, stage.engines.filter((_, j) => j !== i));
  const most = room === null ? Infinity : Math.max(1, room);
  const edit = (n: number): SetEngines => ({
    type: "set-engines",
    stageIndex: 0,
    engine: swap,
    count: n,
    ...(stage.engines.length > 1 && { clusterIndex: i }),
  });
  const twrWith = (n: number) => analyze(applyAction(design, edit(n))).liftoffTwr;
  const start = Math.min(count, most);
  const cap = Math.min(count + MAX_SENSIBLE_EXTRA_ENGINES, most);
  if (twrWith(start) >= TARGET_TWR || twrWith(cap) < TARGET_TWR) return { engine, swap, fix: edit(start) };
  let lo = start;
  let hi = cap;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (twrWith(mid) >= TARGET_TWR) hi = mid;
    else lo = mid;
  }
  return { engine, swap, fix: edit(hi) };
}

/** The plain reason, for anywhere that explains a vacuum engine on the pad. */
export function vacuumReason(engine: EngineId): string {
  return `${ENGINES[engine].name} can't fire at sea level: its nozzle is built for vacuum`;
}

type ShortfallFix = {
  stageIndex: number;
  /** Smallest whole-percent tank stretch that closes the gap, if one up to +150% does. */
  stretchPercent: number | null;
  /** How the design does with a new bottom stage, if adding one gains delta-v at all. */
  withStage: Analysis | null;
};

function planShortfallFix(design: Design, analysis: Analysis, sketch: Sketch): ShortfallFix | null {
  if (design.stages.length === 0) return null;
  // A fix has to still leave the pad. If it leaves the liftoff marginal, the next review
  // flags that with its own "+N engines" fix, so the user gets there in two taps.
  const keepsLiftoff = (a: Analysis) => a.liftoffTwr >= 1;

  // The drawn biggest tank first, then any other stage that stretches less.
  const preferred = stageToStretch(design, sketch);
  let stageIndex = preferred;
  let stretchPercent: number | null = null;
  for (const index of [preferred, ...design.stages.map((_, i) => i).filter((i) => i !== preferred)]) {
    const percent = smallestStretch(design, index, keepsLiftoff);
    if (percent !== null && (stretchPercent === null || percent < stretchPercent)) {
      stretchPercent = percent;
      stageIndex = index;
    }
  }

  const staged = analyze(applyAction(design, { type: "add-stage" }));
  const withStage = staged.totalDeltaVMps > analysis.totalDeltaVMps && keepsLiftoff(staged) ? staged : null;

  return { stageIndex, stretchPercent, withStage };
}

/** Smallest whole-percent stretch of one stage, up to +150%, that closes the gap and keeps liftoff. */
function smallestStretch(design: Design, stageIndex: number, keepsLiftoff: (a: Analysis) => boolean): number | null {
  const stretched = (factor: number) => analyze(applyAction(design, { type: "scale-tanks", stageIndex, factor }));
  if (stretched(MAX_STRETCH).marginMps < 0) return null;
  // More propellant means more delta-v, so bisect for where the margin turns positive.
  let lo = 1;
  let hi = MAX_STRETCH;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (stretched(mid).marginMps >= 0) hi = mid;
    else lo = mid;
  }
  const percent = Math.ceil((hi - 1) * 100 - 1e-9);
  const check = stretched((100 + percent) / 100);
  return check.marginMps >= 0 && keepsLiftoff(check) ? percent : null;
}

/** The stage holding the biggest tank drawn, or else the stage with the most tank volume. */
function stageToStretch(design: Design, sketch: Sketch): number {
  const drawn = sketch.biggestTankPart()?.stageIndex;
  if (drawn !== undefined && drawn >= 0 && drawn < design.stages.length) return drawn;
  return design.stages.reduce((best, s, i, all) => (s.tankVolumeM3 > all[best].tankVolumeM3 ? i : best), 0);
}

function shortfallMark(fix: ShortfallFix, sketch: Sketch): RedPenMark {
  if (fix.stretchPercent !== null) {
    return {
      ...arrowTo(sketch.tankSide(fix.stageIndex), sketch.openSide(), -0.08, `stretch +${fix.stretchPercent}%`),
      fix: { type: "scale-tanks", stageIndex: fix.stageIndex, factor: (100 + fix.stretchPercent) / 100 },
    };
  }
  if (fix.withStage) {
    // Kept short so it fits beside the outline; the summary carries the numbers.
    const note = fix.withStage.marginMps >= 0 ? "add a stage" : "a stage isn't enough";
    return { kind: "ghost-line", points: sketch.newStageOutline(), note, fix: { type: "add-stage" } };
  }
  // Nothing single closes the gap; the summary says so and names what it can reach.
  return arrowTo(sketch.tankSide(), sketch.openSide(), -0.08, "out of reach");
}

// ---------------------------------------------------------------------------
// Summary

function summarize(
  design: Design,
  analysis: Analysis,
  found: {
    /** The payload to carry instead, when the rocket could make it lighter. */
    lighter: SetPayload | null;
    vacuum: VacuumSwap | null;
    extraEngines: number | null;
    /** False when the engine count is absurd, more than fit on the base, or no count works. */
    sensibleEngines: boolean;
    /** The engines it would need don't fit on the booster's base. */
    noRoom: boolean;
    fix: ShortfallFix | null;
    /** The design's analysis, or the engine-fixed one if it was stuck. */
    flyableAnalysis: Analysis | null;
    needsLegs: boolean;
    needsShield: boolean;
    /** False when the user can't draw the missing hardware on: then it's only mentioned. */
    drawable: boolean;
  },
): string {
  const deltaV = `${km(analysis.totalDeltaVMps)} of ${km(analysis.requiredDeltaVMps)} km/s`;
  const destination = DESTINATION_NAMES[design.destination];
  const fuelFix =
    found.fix && found.flyableAnalysis ? shortfallAdvice(found.fix, found.flyableAnalysis, design.destination) : null;
  const carryLess = found.lighter ? `carry at most ${massText(found.lighter.payloadMassKg)}` : null;

  const twr = formatTwr(analysis.liftoffTwr);
  if (analysis.liftoffTwr < SAFE_TWR) {
    const stuck = analysis.liftoffTwr < 1;
    const then = fuelFix ? `, then ${fuelFix}` : "";
    if (found.vacuum) {
      const { engine, swap, fix } = found.vacuum;
      const swapIn = `swap in ${fix.count} ${ENGINES[swap].name} engine${fix.count === 1 ? "" : "s"}`;
      const options = [carryLess, swapIn].filter(Boolean).join(", or ");
      return `${vacuumReason(engine)}, so ${stuck ? "it never leaves the pad" : `liftoff TWR is only ${twr}`}. ${options[0].toUpperCase()}${options.slice(1)}${then}.`;
    }
    const n = found.extraEngines;
    const base = design.stages[0]?.diameterM ?? design.diameterM;
    const thrust = found.noRoom
      ? `the engines it needs don't fit on its ${metres(base)} m base, so lighten it or widen the booster`
      : !found.sensibleEngines
        ? `it needs ${MAX_SENSIBLE_EXTRA_ENGINES}+ more engines, so rethink the booster`
        : `add ${n} engine${n === 1 ? "" : "s"} ${stuck ? "to clear the pad" : "for a safe liftoff"}`;
    const start = stuck ? `Liftoff TWR is ${twr}, so it never leaves the pad` : `Liftoff TWR is ${twr}, too marginal to launch safely`;
    return `${start}: ${[carryLess, thrust].filter(Boolean).join(", or ")}${then}.`;
  }
  if (carryLess) return `${deltaV}: ${carryLess}${fuelFix ? `, or ${fuelFix}` : ""}.`;
  if (fuelFix) return `${deltaV}: ${fuelFix}.`;

  const missing = [found.needsLegs && "landing legs", found.needsShield && "a heat shield"].filter(Boolean);
  const reaches = `${deltaV}: it reaches ${destination} with ${kmSpare(analysis.totalDeltaVMps, analysis.requiredDeltaVMps)} km/s to spare.`;
  if (missing.length > 0) {
    if (!found.drawable) return `${reaches} Landing there also takes ${missing.join(" and ")}, which this check doesn't model.`;
    return `${deltaV} gets it to ${destination}, but it needs ${missing.join(" and ")} to land.`;
  }
  return reaches;
}

function shortfallAdvice(fix: ShortfallFix, analysis: Analysis, destination: DestinationId): string {
  const options: string[] = [];
  if (fix.stretchPercent !== null) options.push(`stretch the tanks ${fix.stretchPercent}%`);
  if (fix.withStage && fix.withStage.marginMps >= 0) options.push("add a stage");
  if (options.length > 0) return options.join(" or ");

  if (fix.withStage) {
    return `even a new stage leaves it ${kmShort(fix.withStage.totalDeltaVMps, fix.withStage.requiredDeltaVMps)} km/s short`;
  }
  const reach = analysis.furthestReachable
    ? `it can reach ${DESTINATION_NAMES[analysis.furthestReachable]} at most`
    : `it's ${kmShort(analysis.totalDeltaVMps, analysis.requiredDeltaVMps)} km/s short of orbit`;
  return `no single fix reaches ${DESTINATION_NAMES[destination]}; ${reach}`;
}

// ---------------------------------------------------------------------------
// Where the pen draws

/** Finds parts on the napkin, falling back to a slice of the whole rocket when a part wasn't drawn. */
class Sketch {
  constructor(private parts: Part[]) {}

  whole(): Box {
    return union(this.parts.map((p) => p.box)) ?? DEFAULT_ROCKET;
  }

  /** The bottom stage's engines, or the lowest engines drawn. */
  engines(): Box {
    const engines = this.ofKind("engine");
    const bottomStage = engines.filter((p) => p.stageIndex === 0);
    if (bottomStage.length > 0) return union(bottomStage.map((p) => p.box))!;
    if (engines.length > 0) {
      const lowest = Math.max(...engines.map((p) => p.box[1] + p.box[3]));
      return union(engines.filter((p) => p.box[1] + p.box[3] >= lowest - 0.05).map((p) => p.box))!;
    }
    return slice(this.whole(), 0.85, 1);
  }

  fins(): Box {
    return union(this.ofKind("fin").map((p) => p.box)) ?? slice(this.whole(), 0.7, 1);
  }

  biggestTankPart(): Part | undefined {
    const area = (p: Part) => p.box[2] * p.box[3];
    return this.ofKind("tank").reduce<Part | undefined>(
      (best, p) => (!best || area(p) > area(best) ? p : best),
      undefined,
    );
  }

  /** The middle of a tank's outer side: that stage's biggest tank if given, else the biggest drawn. */
  tankSide(stageIndex?: number): Point {
    const area = (p: Part) => p.box[2] * p.box[3];
    const ofStage = this.ofKind("tank")
      .filter((p) => p.stageIndex === stageIndex)
      .reduce<Part | undefined>((best, p) => (!best || area(p) > area(best) ? p : best), undefined);
    const [x, y, w, h] = (ofStage ?? this.biggestTankPart())?.box ?? slice(this.whole(), 0.25, 0.75);
    return [this.openSide() > 0 ? x + w : x, y + h / 2];
  }

  /** The middle of the engines' outer side. */
  enginesSide(): Point {
    const [x, y, w, h] = this.engines();
    return [this.openSide() > 0 ? x + w : x, y + h / 2];
  }

  /** A stage's engines: the ones drawn for it, else (for an upper stage) the bottom of its tank. */
  stageEnginesSide(stageIndex: number): Point {
    const own = this.ofKind("engine").filter((p) => p.stageIndex === stageIndex);
    const tank = this.ofKind("tank").filter((p) => p.stageIndex === stageIndex);
    const at = (box: Box | null, k: number): Point | null => (box ? [this.openSide() > 0 ? box[0] + box[2] : box[0], box[1] + box[3] * k] : null);
    return at(union(own.map((p) => p.box)), 0.5) ?? (stageIndex > 0 ? at(union(tank.map((p) => p.box)), 0.9) : null) ?? this.enginesSide();
  }

  /** The middle of the fins' outer edge on `side`. */
  finSide(side: 1 | -1): Point {
    const [x, y, w, h] = this.fins();
    return [side > 0 ? x + w : x, y + h / 2];
  }

  bottomCenter(): Point {
    const [x, y, w, h] = this.whole();
    return [x + w / 2, y + h];
  }

  /** The side of the payload or nose: whatever comes home through the atmosphere. */
  capsuleSide(): Point {
    const top = this.ofKind("payload").length > 0 ? this.ofKind("payload") : this.ofKind("nose");
    const [x, y, w, h] = union(top.map((p) => p.box)) ?? slice(this.whole(), 0, 0.15);
    return [this.openSide() > 0 ? x + w : x, y + h / 2];
  }

  /** A U-shaped outline of a new stage hanging under the rocket, open at the top where it joins. */
  newStageOutline(): Point[] {
    const [x, y, w, h] = this.whole();
    const body = this.biggestTankPart()?.box[2] ?? w * 0.6;
    const cx = x + w / 2;
    const left = clamp(cx - body / 2, EDGE, 1 - EDGE);
    const right = clamp(cx + body / 2, EDGE, 1 - EDGE);
    const top = clamp(y + h + 0.01, EDGE, 0.9);
    const bottom = clamp(top + Math.max(0.08, h * 0.35), top + 0.04, 1 - EDGE);
    // The note is written at the last point, so end on the side with more room.
    return this.openSide() > 0
      ? [[left, top], [left, bottom], [right, bottom], [right, top]]
      : [[right, top], [right, bottom], [left, bottom], [left, top]];
  }

  /**
   * Which side notes go on: 1 (right) unless the rocket sits well right of center. The overlay
   * writes ghost-line notes rightward unless they start past 60% of the width, so prefer the right.
   */
  openSide(): 1 | -1 {
    const [x, , w] = this.whole();
    return x + w / 2 <= 0.6 ? 1 : -1;
  }

  private ofKind(kind: PartKind) {
    return this.parts.filter((p) => p.kind === kind);
  }
}

/**
 * An arrow coming in from `side` (1 = right, -1 = left), with its note written outward from
 * the tail. If the note has no room there, it tries the short form of the note, then the other
 * direction, so the text always lands on the napkin.
 */
function arrowTo([tx, ty]: Point, side: 1 | -1, rise: number, note: string, shortNote?: string): RedPenMark {
  const to: Point = [clamp(tx, EDGE, 1 - EDGE), clamp(ty, EDGE, 1 - EDGE)];
  const tries: [string, 1 | -1][] = [[note, side]];
  if (shortNote) tries.push([shortNote, side]);
  tries.push([note, -side as 1 | -1]);
  if (shortNote) tries.push([shortNote, -side as 1 | -1]);

  for (const [text, dir] of tries) {
    const room = EDGE + text.length * NOTE_CHAR_WIDTH;
    const fits = dir > 0 ? to[0] + MIN_ARROW <= 1 - room : to[0] - MIN_ARROW >= room;
    if (!fits) continue;
    const fromX = dir > 0 ? Math.min(to[0] + 0.2, 1 - room) : Math.max(to[0] - 0.2, room);
    let fromY = clamp(to[1] + rise, EDGE, 1 - EDGE);
    const [x0, x1] = dir > 0 ? [fromX, fromX + text.length * NOTE_CHAR_WIDTH] : [fromX - text.length * NOTE_CHAR_WIDTH, fromX];
    if (inPatch(x0, x1, fromY)) fromY = PATCH.y + 0.02;
    return { kind: "arrow", from: [fromX, fromY], to, note: text };
  }
  const fromX = clamp(to[0] + side * MIN_ARROW, EDGE, 1 - EDGE);
  return { kind: "arrow", from: [fromX, clamp(to[1] + rise, EDGE, 1 - EDGE)], to, note: shortNote ?? note };
}

function union(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x0 = Math.min(...boxes.map((b) => b[0]));
  const y0 = Math.min(...boxes.map((b) => b[1]));
  const x1 = Math.max(...boxes.map((b) => b[0] + b[2]));
  const y1 = Math.max(...boxes.map((b) => b[1] + b[3]));
  return [x0, y0, x1 - x0, y1 - y0];
}

/** The horizontal band of a box between two fractions of its height. */
function slice([x, y, w, h]: Box, from: number, to: number): Box {
  return [x, y + h * from, w, h * (to - from)];
}

// ---------------------------------------------------------------------------
// Small helpers

const FEATURE_ALIASES: Record<string, string[]> = {
  fins: ["fin", "fins", "grid-fins"],
  "landing-legs": ["landing-legs", "landing-leg", "legs", "leg"],
  "heat-shield": ["heat-shield", "heatshield", "heat-tiles", "tiles"],
};

/** Whether the reader listed a feature or drew the matching part. */
function hasFeature(design: Design, parts: Part[], feature: "fins" | "landing-legs" | "heat-shield") {
  const names = FEATURE_ALIASES[feature];
  const listed = design.features.some((f) => names.includes(f.toLowerCase().trim().replace(/[\s_]+/g, "-")));
  const partKind: PartKind = feature === "fins" ? "fin" : feature;
  return listed || parts.some((p) => p.kind === partKind);
}

/**
 * Two decimals, like the rest of the screen (four below 0.01), but never rounded up across
 * a threshold: 0.996 reads "0.99", not "1.00", and 1.149 reads "1.14", not "1.15".
 */
function formatTwr(twr: number) {
  if (twr !== 0 && twr < 0.01) return twr.toFixed(4);
  const shown = twr.toFixed(2);
  const crosses = (twr < 1 && shown === "1.00") || (twr < SAFE_TWR && shown === SAFE_TWR.toFixed(2));
  return crosses ? (Math.floor(twr * 100) / 100).toFixed(2) : shown;
}

function clamp(value: number, lo: number, hi: number) {
  return Math.min(Math.max(value, lo), hi);
}

// km/s formatting, worked out from the rounded figures shown beside each number so they agree.
function tenths(mps: number) {
  return Math.round(mps / 100);
}

function km(mps: number) {
  return (tenths(mps) / 10).toFixed(1);
}

/** How far short `total` is, never "0.0". */
function kmShort(totalMps: number, requiredMps: number) {
  return (Math.max(1, tenths(requiredMps) - tenths(totalMps)) / 10).toFixed(1);
}

function kmSpare(totalMps: number, requiredMps: number) {
  return (Math.max(0, tenths(totalMps) - tenths(requiredMps)) / 10).toFixed(1);
}

/** Payload as it's usually quoted: tonnes with one decimal from a tonne up (whole tonnes from 100 t), kilograms below. */
export function massText(kg: number) {
  if (kg < 1_000) return `${Math.round(kg).toLocaleString("en-US")} kg`;
  const t = kg / 1_000;
  return `${t >= 100 ? Math.round(t).toLocaleString("en-US") : t.toFixed(1)} t`;
}

/** Rounds down to what massText shows, so a suggested payload is never more than the rocket can carry. */
function floorToShown(kg: number) {
  if (kg >= 100_000) return Math.floor(kg / 1_000) * 1_000;
  if (kg >= 1_000) return Math.floor(kg / 100) * 100;
  return Math.floor(kg);
}

// ---------------------------------------------------------------------------
// Issue marks and the check mark

const ISSUE_KINDS = new Set<RedPenMark["kind"]>(["arrow", "circle", "ghost-line"]);

/** Issue marks (the numbered corrections), as opposed to the check mark or a historic flight's labels. */
export function isIssueMark(mark: RedPenMark) {
  return ISSUE_KINDS.has(mark.kind);
}

/** The overlay draws the check about this far left of `at`... */
const TICK_LEFT = 0.03;
/** ...and starts its note this far right of it, always writing rightward. */
const TICK_NOTE = 0.053;
/** Clearance between the drawing and the check (or the end of its note). */
const TICK_GAP = 0.02;

/**
 * A teacher's check mark beside a rocket with nothing to fix, at mid-height on the open side
 * (the other side if the note doesn't fit there), noting the delta-v to spare.
 */
function passMark(sketch: Sketch, analysis: Analysis): RedPenMark {
  const spare = kmSpare(analysis.totalDeltaVMps, analysis.requiredDeltaVMps);
  const notes = spare === "0.0" ? [PASS_NOTE] : [`${spare} km/s spare`, PASS_NOTE];
  const [x, y, w, h] = sketch.whole();
  const side = sketch.openSide();
  let at: Point = [clamp(side > 0 ? x + w + TICK_GAP + TICK_LEFT : x - TICK_GAP, EDGE + TICK_LEFT, 1 - EDGE), y + h / 2];
  let note = PASS_NOTE;
  search: for (const text of notes) {
    const width = TICK_NOTE + text.length * NOTE_CHAR_WIDTH;
    for (const s of [side, -side]) {
      // On the left the note runs toward the rocket, so the check sits a whole note's width out.
      const atX = s > 0 ? x + w + TICK_GAP + TICK_LEFT : x - TICK_GAP - width;
      if (atX - TICK_LEFT < EDGE || atX + width > 1 - EDGE) continue;
      at = [atX, y + h / 2];
      note = text;
      break search;
    }
  }
  const atY = clamp(at[1], EDGE + 0.04, 1 - EDGE);
  return { kind: "tick", at: [at[0], inPatch(at[0], at[0] + TICK_NOTE + note.length * NOTE_CHAR_WIDTH, atY) ? PATCH.y + 0.04 : atY], note };
}

/** What failed on a replayed historic flight (HistoricMission["failure"]). */
export type HistoricFailure = { part: PartKind; stageIndex?: number; label: string; detail: string };

/** Callout labels are set in small mono type; about this much napkin width per character. */
const CALLOUT_CHAR_WIDTH = 0.012;
/** Vertical room one callout label needs, as a fraction of the napkin's height. */
const CALLOUT_LINE = 0.05;

/**
 * The markup for a replayed historic flight, only the failure: an outline on the part that
 * failed, a callout naming it, and ① (an arrow) saying what happened, each a few words.
 * A flight that worked gets no marks.
 */
export function historicMarks(reading: SketchReading, failure: HistoricFailure | null): RedPenMark[] {
  if (!failure) return [];
  const { parts } = reading;
  const sketch = new Sketch(parts);

  const ofKind = parts.filter((p) => p.kind === failure.part);
  const exact = ofKind.filter((p) => failure.stageIndex === undefined || p.stageIndex === failure.stageIndex);
  const box =
    union(exact.map((p) => p.box)) ?? union(ofKind.map((p) => p.box)) ?? failureFallback(failure.part, sketch);
  const side = sketch.openSide();
  const whole = sketch.whole();
  const mid = clamp(box[1] + box[3] / 2, EDGE, 1 - EDGE);
  const edge: Point = [clamp(side > 0 ? box[0] + box[2] : box[0], EDGE, 1 - EDGE), mid];

  const detail = fewWords(failure.detail, 5);
  const arrow = arrowTo(edge, side, -0.07, detail, fewWords(failure.detail, 3));
  const label = failureLabel(parts, box, side, whole, fewWords(failure.label, 4), arrow);

  return [{ kind: "outline", box: clampBox(box), note: "" }, label, arrow];
}

/**
 * The failure's name, placed where the whole text fits: beside the failed part (open side,
 * then the other), then just below it, then just above, each clear of the drawing at that row,
 * of ①'s note and of the mission patch. Only if nothing fits is the text cut short.
 */
function failureLabel(parts: Part[], box: Box, side: 1 | -1, whole: Box, text: string, arrow: RedPenMark): RedPenMark {
  const width = text.length * CALLOUT_CHAR_WIDTH;
  const arrowY = arrow.kind === "arrow" ? arrow.from[1] : -1;
  const mid = box[1] + box[3] / 2;
  // How wide the drawing is at height y, so the label starts past it.
  const extentAt = (y: number): [number, number] | null => {
    const row = parts.filter((p) => p.box[1] <= y && y <= p.box[1] + p.box[3]);
    return row.length ? [Math.min(...row.map((p) => p.box[0])), Math.max(...row.map((p) => p.box[0] + p.box[2]))] : null;
  };
  const tries: [number, 1 | -1][] = [
    [mid + 0.035, side],
    [mid + 0.035, -side as 1 | -1],
    [box[1] + box[3] + 0.045, side],
    [box[1] + box[3] + 0.045, -side as 1 | -1],
    [box[1] - 0.03, side],
    [box[1] - 0.03, -side as 1 | -1],
  ];
  for (const [rawY, s] of tries) {
    const y = clamp(rawY, EDGE, 1 - EDGE);
    if (Math.abs(y - arrowY) < CALLOUT_LINE) continue;
    const extent = extentAt(y) ?? [box[0], box[0] + box[2]];
    const x = s > 0 ? extent[1] + 0.03 : extent[0] - 0.03;
    const [x0, x1] = s > 0 ? [x, x + width] : [x - width, x];
    if (x0 < EDGE || x1 > 1 - EDGE || inPatch(x0, x1, y)) continue;
    const anchor: Point = [clamp(s > 0 ? box[0] + box[2] : box[0], EDGE, 1 - EDGE), clamp(mid, EDGE, 1 - EDGE)];
    return { kind: "callout", anchor, label: [x, y], note: text };
  }
  // Nothing fits whole: the open margin, cut to the room there.
  const labelX = clamp(side > 0 ? whole[0] + whole[2] + 0.05 : whole[0] - 0.05, EDGE, 1 - EDGE);
  const room = Math.floor((side > 0 ? 1 - EDGE - labelX : labelX - EDGE) / CALLOUT_CHAR_WIDTH);
  let labelY = clamp(mid + 0.035, EDGE, 1 - EDGE);
  if (Math.abs(labelY - arrowY) < CALLOUT_LINE) labelY = clamp(arrowY + CALLOUT_LINE, EDGE, 1 - EDGE);
  const anchor: Point = [clamp(side > 0 ? box[0] + box[2] : box[0], EDGE, 1 - EDGE), clamp(mid, EDGE, 1 - EDGE)];
  return { kind: "callout", anchor, label: [labelX, labelY], note: shorten(text, Math.max(8, room)) };
}

/** The first `n` words, without a dangling "a", "the" or "of", and "…" when cut. */
function fewWords(text: string, n: number) {
  const words = text.trim().split(/\s+/);
  if (words.length <= n) return text.trim();
  const kept = words.slice(0, n);
  while (kept.length > 1 && /^(a|an|the|of|in|on|to|and|at|for|with|by)$/i.test(kept[kept.length - 1])) kept.pop();
  return `${kept.join(" ").replace(/[\s,;:.]+$/, "")}…`;
}

/** Where a failed part sits when the reading didn't find it. */
function failureFallback(kind: PartKind, sketch: Sketch): Box {
  const whole = sketch.whole();
  if (kind === "engine") return sketch.engines();
  if (kind === "fin" || kind === "landing-legs") return sketch.fins();
  if (kind === "nose" || kind === "payload" || kind === "heat-shield") return slice(whole, 0, 0.2);
  if (kind === "tank") return sketch.biggestTankPart()?.box ?? slice(whole, 0.25, 0.75);
  return whole;
}

function shorten(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/** The mission-patch sticker sits in the napkin's top-right corner; no label goes there. */
const PATCH = { x: 0.68, y: 0.24 };

function inPatch(x0: number, x1: number, y: number) {
  return y < PATCH.y && x1 > PATCH.x && x0 < 1;
}

function clampBox([x, y, w, h]: Box): Box {
  const x0 = clamp(x, 0, 1);
  const y0 = clamp(y, 0, 1);
  return [x0, y0, clamp(x + w, 0, 1) - x0, clamp(y + h, 0, 1) - y0];
}

/** Vertical room one handwritten issue note needs, as a fraction of the napkin's height. */
const NOTE_LINE = 0.055;

/**
 * Stacks the issue notes on each side at least a line apart, moving arrow tails up from the
 * bottom (where engines, legs and a new stage crowd together). Ghost-line notes stay put and the
 * arrows make room around them; arrowheads never move.
 */
function spreadNotes(marks: RedPenMark[]): RedPenMark[] {
  const sideOf = (m: RedPenMark) =>
    m.kind === "arrow" ? Math.sign(m.from[0] - m.to[0]) : m.kind === "ghost-line" ? Math.sign(m.points.at(-1)![0] - m.points[0][0]) || 1 : 0;
  const out = [...marks];
  for (const side of [-1, 1]) {
    // The overlay writes a ghost-line note just below its last point.
    const placed = out.flatMap((m) => (m.kind === "ghost-line" && sideOf(m) === side ? [m.points.at(-1)![1] + 0.025] : []));
    const arrows = out
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.kind === "arrow" && sideOf(m) === side)
      .sort((a, b) => (b.m as { from: Point }).from[1] - (a.m as { from: Point }).from[1]);
    for (const { m, i } of arrows) {
      if (m.kind !== "arrow") continue;
      let y = m.from[1];
      for (let guard = 0; guard < 20; guard++) {
        const clash = placed.filter((p) => Math.abs(p - y) < NOTE_LINE);
        if (clash.length === 0) break;
        y = Math.min(...clash) - NOTE_LINE;
      }
      y = clamp(y, EDGE, 1 - EDGE);
      placed.push(y);
      out[i] = { ...m, from: [m.from[0], y] };
    }
  }
  return out;
}
