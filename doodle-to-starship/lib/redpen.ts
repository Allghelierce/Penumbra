// The red pen: deterministic rules that mark up a sketch like a teacher grading
// homework. Every number in a note comes from re-running the physics on an
// edited design, so the corrections are computed, never guessed.

import { applyAction } from "./actions";
import {
  type Analysis,
  type Design,
  type DesignAction,
  type DestinationId,
  type Part,
  type PartKind,
  type Point,
  type RedPenMark,
  type Review,
  type SketchReading,
} from "./design";
import { analyze, ENGINES } from "./physics";

type Box = [x: number, y: number, w: number, h: number];

const MAX_MARKS = 4;
/** Real launchers lift off at about 1.2 or more; below that the red pen calls it marginal. */
export const SAFE_TWR = 1.2;
/** "+N engines" aims for this liftoff thrust-to-weight. */
const TARGET_TWR = 1.3;
/** Past this many extra engines the advice is to rethink the booster, not to add engines. */
const MAX_SENSIBLE_EXTRA_ENGINES = 200;
const FINS_NOTE = "useless in vacuum";
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

export function buildReview(reading: SketchReading, analysis: Analysis): Review {
  const { design, parts } = reading;
  const sketch = new Sketch(parts);
  const marks: RedPenMark[] = [];

  const stuck = analysis.liftoffTwr < 1;
  const marginal = !stuck && analysis.liftoffTwr < SAFE_TWR;
  const extraEngines = stuck || marginal ? enginesForTwr(design, TARGET_TWR) : null;
  const sensibleEngines = extraEngines !== null && extraEngines <= MAX_SENSIBLE_EXTRA_ENGINES;
  if (stuck || marginal) {
    // Notes beside the rocket, not inside a circle on top of the drawing.
    const twr = `TWR ${formatTwr(analysis.liftoffTwr)}`;
    if (sensibleEngines) {
      const more = `+${extraEngines} engine${extraEngines === 1 ? "" : "s"}`;
      const fix = engineFix(design, extraEngines);
      marks.push({ ...arrowTo(sketch.enginesSide(), sketch.openSide(), 0, `${twr}: ${more}`, more), ...(fix && { fix }) });
    } else {
      marks.push(arrowTo(sketch.enginesSide(), sketch.openSide(), 0, `${twr}: too heavy`, "too heavy"));
    }
  }

  // A stuck or marginal rocket's fuel is judged as if the engine fix were made.
  const flyable = !(stuck || marginal) ? design : sensibleEngines ? withExtraEngines(design, extraEngines) : null;
  const flyableAnalysis = flyable === design ? analysis : flyable && analyze(flyable);
  const short = flyableAnalysis !== null && flyableAnalysis.marginMps < 0;
  const fix = short ? planShortfallFix(flyable!, flyableAnalysis, sketch) : null;
  if (fix) marks.push(shortfallMark(fix, sketch));

  if (VACUUM_DESTINATIONS.has(design.destination) && hasFeature(design, parts, "fins")) {
    // The other side holds the spec callouts, so fins take the open side like the other notes.
    const side = sketch.openSide();
    marks.push(arrowTo(sketch.finSide(side), side, -0.04, FINS_NOTE));
  }

  const lands = LANDING_DESTINATIONS.has(design.destination);
  const needsLegs = lands && !hasFeature(design, parts, "landing-legs");
  const needsShield = design.destination === "mars-surface" && !hasFeature(design, parts, "heat-shield");
  // A new-stage outline already sits under the rocket on the open side, so legs come in from the other.
  const legsSide = marks.some((m) => m.kind === "ghost-line") ? -sketch.openSide() : sketch.openSide();
  if (needsLegs) marks.push(arrowTo(sketch.bottomCenter(), legsSide as 1 | -1, 0.06, "needs legs"));
  if (needsShield) marks.push(arrowTo(sketch.capsuleSide(), sketch.openSide(), -0.06, "heat shield!"));

  const flies = !stuck && !marginal && !short && !needsLegs && !needsShield;
  // A tick beside the upper body; the markup already outlines the whole vehicle part by part.
  if (flies) marks.push(arrowTo(sketch.upperSide(), sketch.openSide(), 0, "flies!"));

  return {
    // The engineer's markup (outlines, specs, dimensions) first, then the numbered issue marks.
    marks: [...engineerMarkup(design, analysis, parts, sketch, marks.slice(0, MAX_MARKS)), ...marks.slice(0, MAX_MARKS)],
    summary: summarize(design, analysis, { extraEngines, sensibleEngines, fix, flyableAnalysis, needsLegs, needsShield }),
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

/** The design with `extra` more engines in the bottom stage's biggest cluster; other clusters stay as drawn. */
/**
 * The tap-to-fix edit for "needs N more engines". set-engines replaces every cluster, so it
 * only matches the computed count when the bottom stage has a single cluster.
 */
function engineFix(design: Design, extra: number): DesignAction | undefined {
  const engines = design.stages[0].engines;
  if (engines.length !== 1) return undefined;
  return { type: "set-engines", stageIndex: 0, engine: engines[0].engine, count: engines[0].count + extra };
}

function withExtraEngines(design: Design, extra: number): Design {
  const bottom = design.stages[0];
  const main = bottom.engines.reduce((best, c, i, all) => (c.count > all[best].count ? i : best), 0);
  const engines = bottom.engines.map((c, i) => (i === main ? { ...c, count: c.count + extra } : c));
  return { ...design, stages: [{ ...bottom, engines }, ...design.stages.slice(1)] };
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
    extraEngines: number | null;
    /** False when the engine count is absurd (or no count works). */
    sensibleEngines: boolean;
    fix: ShortfallFix | null;
    /** The design's analysis, or the engine-fixed one if it was stuck. */
    flyableAnalysis: Analysis | null;
    needsLegs: boolean;
    needsShield: boolean;
  },
): string {
  const deltaV = `${km(analysis.totalDeltaVMps)} of ${km(analysis.requiredDeltaVMps)} km/s`;
  const destination = DESTINATION_NAMES[design.destination];
  const fuelFix =
    found.fix && found.flyableAnalysis ? shortfallAdvice(found.fix, found.flyableAnalysis, design.destination) : null;

  const twr = formatTwr(analysis.liftoffTwr);
  if (analysis.liftoffTwr < SAFE_TWR) {
    const n = found.extraEngines;
    const thrust = !found.sensibleEngines
      ? `it needs ${MAX_SENSIBLE_EXTRA_ENGINES}+ more engines, so rethink the booster`
      : `add ${n} engine${n === 1 ? "" : "s"} ${analysis.liftoffTwr < 1 ? "to clear the pad" : "for a safe liftoff"}`;
    const start =
      analysis.liftoffTwr < 1
        ? `Liftoff TWR is ${twr}, so it never leaves the pad`
        : `Liftoff TWR is ${twr}, too marginal to launch safely`;
    return `${start}: ${thrust}${fuelFix ? `, then ${fuelFix}` : ""}.`;
  }
  if (fuelFix) return `${deltaV}: ${fuelFix}.`;

  const missing = [found.needsLegs && "landing legs", found.needsShield && "a heat shield"].filter(Boolean);
  if (missing.length > 0) {
    return `${deltaV} gets it to ${destination}, but it needs ${missing.join(" and ")} to land.`;
  }
  return `${deltaV}: it reaches ${destination} with ${kmSpare(analysis.totalDeltaVMps, analysis.requiredDeltaVMps)} km/s to spare.`;
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

  /** A point on the open side of the upper body, below the mission-patch corner. */
  upperSide(): Point {
    const [x, y, w, h] = this.whole();
    return [this.openSide() > 0 ? x + w : x, Math.max(y + h * 0.3, 0.2)];
  }

  /** The middle of the engines' outer side. */
  enginesSide(): Point {
    const [x, y, w, h] = this.engines();
    return [this.openSide() > 0 ? x + w : x, y + h / 2];
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


/** One decimal, but never round a TWR just under 1 up to "1.0". */
/**
 * Two decimals, like the rest of the screen (four below 0.01), but never rounded up across
 * a threshold: 0.996 reads "0.99", not "1.00", and 1.199 reads "1.19", not "1.20".
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

// ---------------------------------------------------------------------------
// The engineer's markup: what each part is, its real numbers, and the vehicle's size

const ISSUE_KINDS = new Set<RedPenMark["kind"]>(["arrow", "circle", "ghost-line"]);

/** Issue marks (the numbered corrections) as opposed to the identifying markup drawn before them. */
export function isIssueMark(mark: RedPenMark) {
  return ISSUE_KINDS.has(mark.kind);
}

/** Callouts are set in small mono type; about this much napkin width per character. */
const CALLOUT_CHAR_WIDTH = 0.012;
/** Vertical room one callout label needs, as a fraction of the napkin's height. */
const CALLOUT_LINE = 0.05;
const MAX_CALLOUTS = 6;

/** What's in the tanks, for the outline notes ("Booster LOX/CH4"). */
const TANK_NAMES: Record<Design["stages"][number]["propellant"], string> = {
  methalox: "LOX/CH4",
  kerolox: "LOX/RP-1",
  hydrolox: "LOX/LH2",
  solid: "solid motor",
  hypergolic: "N2O4/UDMH",
};
const PART_NAMES: Partial<Record<PartKind, string>> = {
  nose: "Nose / fairing",
  payload: "Payload bay",
  engine: "Engines",
  fin: "Fins",
  "landing-legs": "Legs",
  "heat-shield": "Heat shield",
  "solar-panel": "Solar panels",
  window: "Window",
};
const SHORT_ENGINE: Partial<Record<string, string>> = {
  "raptor-vacuum": "RVac",
  "merlin-vacuum": "MVac",
  "generic-solid": "SRM",
};

function engineerMarkup(
  design: Design,
  analysis: Analysis,
  parts: Part[],
  sketch: Sketch,
  issues: RedPenMark[],
): RedPenMark[] {
  if (parts.length === 0) return [];
  const kept = outlines(design, parts);
  return [
    ...kept.map(({ box }): RedPenMark => ({ kind: "outline", box: clampBox(box), note: "" })),
    ...dimensions(design, sketch),
    ...callouts(design, analysis, parts, sketch),
    ...partLabels(kept, sketch, issues),
  ];
}

/** The mission-patch sticker sits in the napkin's top-right corner; no label goes there. */
const PATCH = { x: 0.78, y: 0.18 };

function inPatch(x0: number, x1: number, y: number) {
  return y < PATCH.y && x1 > PATCH.x && x0 < 1;
}

/**
 * Part names in the open margin with a short leader to each outline, never inside a box.
 * A name that would sit on another label, an issue note or the mission patch is dropped.
 */
function partLabels(kept: { box: Box; note: string }[], sketch: Sketch, issues: RedPenMark[]): RedPenMark[] {
  const side = sketch.openSide();
  const whole = sketch.whole();
  const labelX = clamp(side > 0 ? whole[0] + whole[2] + 0.05 : whole[0] - 0.05, EDGE, 1 - EDGE);
  // Rows already taken on this side: issue notes are written at their arrow tails.
  const taken = issues.flatMap((m) =>
    m.kind === "arrow" && Math.sign(m.from[0] - m.to[0]) === side ? [m.from[1]] : m.kind === "ghost-line" ? [m.points.at(-1)![1]] : [],
  );
  const out: RedPenMark[] = [];
  for (const { box, note } of [...kept].sort((a, b) => a.box[1] - b.box[1])) {
    const width = note.length * CALLOUT_CHAR_WIDTH;
    const [x0, x1] = side > 0 ? [labelX, labelX + width] : [labelX - width, labelX];
    if (x0 < 0 || x1 > 1) continue;
    let y = clamp(box[1] + box[3] / 2, EDGE, 1 - EDGE);
    if (inPatch(x0, x1, y)) y = PATCH.y + 0.01;
    if (taken.some((t) => Math.abs(t - y) < CALLOUT_LINE)) continue;
    taken.push(y);
    const anchor: Point = [clamp(side > 0 ? box[0] + box[2] : box[0], EDGE, 1 - EDGE), clamp(box[1] + box[3] / 2, EDGE, 1 - EDGE)];
    out.push({ kind: "callout", anchor, label: [labelX, y], note });
  }
  return out;
}

/** One outline per part kind and stage (duplicates merged), identifying it. */
/**
 * One outline per part kind and stage (duplicates merged, nose and payload bay as one). Big
 * parts first; a part whose box is mostly inside one already kept is skipped, so stacked
 * outlines don't pile up.
 */
function outlines(design: Design, parts: Part[]): { box: Box; note: string }[] {
  const groups = new Map<string, { box: Box; note: string }>();
  for (const part of parts) {
    const stage = part.stageIndex !== undefined ? design.stages[part.stageIndex] : undefined;
    const tankStage = stage ?? design.stages[0];
    const top = part.kind === "nose" || part.kind === "payload";
    const note = top
      ? "Nose / payload"
      : part.kind === "tank"
        ? `${tankStage?.label ?? "Tanks"} ${TANK_NAMES[tankStage?.propellant ?? "kerolox"]}`.slice(0, 22)
        : (PART_NAMES[part.kind] ?? (/interstage/i.test(part.label) ? "Interstage" : part.label.slice(0, 16)));
    const key = top ? "top" : `${part.kind}|${part.stageIndex ?? ""}|${note}`;
    const prev = groups.get(key);
    groups.set(key, { box: prev ? union([prev.box, part.box])! : part.box, note });
  }
  const area = (b: Box) => b[2] * b[3];
  const kept: { box: Box; note: string }[] = [];
  for (const g of [...groups.values()].sort((a, b) => area(b.box) - area(a.box))) {
    if (kept.some((k) => overlap(k.box, g.box) > MAX_OUTLINE_OVERLAP * area(g.box))) continue;
    kept.push(g);
  }
  return kept;
}

/** Outlines overlapping a kept one by more than this share of their own area are skipped. */
const MAX_OUTLINE_OVERLAP = 0.4;

function overlap(a: Box, b: Box) {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Total height beside the rocket, and the body's diameter near the base. */
function dimensions(design: Design, sketch: Sketch): RedPenMark[] {
  const [x, y, , h] = sketch.whole();
  const out: RedPenMark[] = [];
  // The height runs about 0.06 left of the body, where the overlay writes its note rotated.
  const lineX = clamp(x - 0.06, EDGE, 1 - EDGE);
  if (design.heightM > 0) {
    out.push({ kind: "dimension", from: [lineX, clamp(y, EDGE, 1 - EDGE)], to: [lineX, clamp(y + h, EDGE, 1 - EDGE)], note: `${metres(design.heightM)} m` });
  }
  const body = sketch.biggestTankPart()?.box;
  if (body && design.diameterM > 0) {
    const atY = clamp(body[1] + body[3] * 0.9, EDGE, 1 - EDGE);
    out.push({ kind: "dimension", from: [clamp(body[0], EDGE, 1 - EDGE), atY], to: [clamp(body[0] + body[2], EDGE, 1 - EDGE), atY], note: `${metres(design.diameterM)} m` });
  }
  return out;
}

/** Spec labels in the margin opposite the issue notes, with leaders to their parts. */
function callouts(design: Design, analysis: Analysis, parts: Part[], sketch: Sketch): RedPenMark[] {
  const side = -sketch.openSide() as 1 | -1;
  const whole = sketch.whole();
  const edgeX = side < 0 ? whole[0] : whole[0] + whole[2];
  const tonnes = (kg: number) => `${Math.round(kg / 1000).toLocaleString("en-US")} t`;
  const anchorOf = (box: Box): Point => [side < 0 ? box[0] : box[0] + box[2], box[1] + box[3] / 2];
  const wanted: { anchor: Point; notes: string[] }[] = [];

  // Payload at the top, then each stage from the top down, then the engines at the bottom.
  const payloadBox = union(parts.filter((p) => p.kind === "payload").map((p) => p.box)) ?? union(parts.filter((p) => p.kind === "nose").map((p) => p.box));
  if (payloadBox && design.payloadMassKg > 0) wanted.push({ anchor: anchorOf(payloadBox), notes: [`Payload ${tonnes(design.payloadMassKg)}`] });

  for (let i = design.stages.length - 1; i >= 0; i--) {
    const stage = design.stages[i];
    const a = analysis.stages[i];
    if (!a) continue;
    const box =
      union(parts.filter((p) => p.kind === "tank" && p.stageIndex === i).map((p) => p.box)) ??
      (design.stages.length === 1 ? (sketch.biggestTankPart()?.box ?? null) : null);
    if (!box) continue;
    wanted.push({
      anchor: anchorOf(box),
      notes: [`${stage.label} · ${tonnes(a.propellantMassKg)} prop · Δv ${km(a.deltaVMps)}`, `${stage.label} · ${tonnes(a.propellantMassKg)} prop`, `${tonnes(a.propellantMassKg)} prop`],
    });
  }

  const bottom = design.stages[0];
  const thrust = analysis.stages[0]?.thrustN ?? 0;
  if (bottom?.engines.length) {
    const cluster = bottom.engines.map((c) => `${c.count}× ${SHORT_ENGINE[c.engine] ?? ENGINES[c.engine].name}`).join(" + ");
    wanted.push({
      anchor: anchorOf(sketch.engines()),
      notes: [`${cluster} · ${Math.round(thrust / 9.80665 / 1000).toLocaleString("en-US")} tf`, cluster],
    });
  }

  // Stack the labels down the margin in anchor order, at least one line apart.
  wanted.sort((a, b) => a.anchor[1] - b.anchor[1]);
  // Past the height dimension when they share the left margin.
  const labelX = clamp(edgeX + side * (side < 0 ? 0.1 : 0.06), EDGE, 1 - EDGE);
  const room = side < 0 ? labelX - EDGE : 1 - EDGE - labelX;
  const out: RedPenMark[] = [];
  let lastY = -Infinity;
  for (const { anchor, notes } of wanted.slice(0, MAX_CALLOUTS)) {
    const note = notes.find((n) => n.length * CALLOUT_CHAR_WIDTH <= room);
    if (!note) continue;
    let y = Math.max(anchor[1], lastY + CALLOUT_LINE);
    const width = note.length * CALLOUT_CHAR_WIDTH;
    if (inPatch(side > 0 ? labelX : labelX - width, side > 0 ? labelX + width : labelX, y)) y = Math.max(y, PATCH.y + 0.01);
    if (y > 1 - EDGE) break;
    lastY = y;
    out.push({ kind: "callout", anchor: [clamp(anchor[0], EDGE, 1 - EDGE), clamp(anchor[1], EDGE, 1 - EDGE)], label: [labelX, y], note });
  }
  return out;
}

function clampBox([x, y, w, h]: Box): Box {
  const x0 = clamp(x, 0, 1);
  const y0 = clamp(y, 0, 1);
  return [x0, y0, clamp(x + w, 0, 1) - x0, clamp(y + h, 0, 1) - y0];
}

function metres(m: number) {
  return m >= 10 ? String(Math.round(m)) : m.toFixed(1);
}
