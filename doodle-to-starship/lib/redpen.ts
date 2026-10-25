// The red pen: deterministic rules that mark up a sketch like a teacher grading
// homework. Every number in a note comes from re-running the physics on an
// edited design, so the corrections are computed, never guessed.

import { applyAction } from "./actions";
import {
  NAPKIN_ASPECT,
  type Analysis,
  type Design,
  type DestinationId,
  type Part,
  type PartKind,
  type Point,
  type RedPenMark,
  type Review,
  type SketchReading,
} from "./design";
import { analyze } from "./physics";

type Box = [x: number, y: number, w: number, h: number];

const MAX_MARKS = 4;
/** "Needs N more engines" aims for this liftoff thrust-to-weight, not the bare minimum of 1. */
const TARGET_TWR = 1.3;
/** Stretch the tanks at most +150% before suggesting a new stage instead. */
const MAX_STRETCH = 2.5;
const MAX_EXTRA_ENGINES = 500;

/** The overlay draws a circle's vertical radius at about 0.85 of its horizontal one. */
const CIRCLE_SQUASH = 0.85;
/** Room for the pen loop's overshoot past its radius. */
const CIRCLE_OVERSHOOT = 1.1;
const CIRCLE_PAD = 0.03;
const MIN_RADIUS = 0.04;
/** Keeps arrow ends and outlines off the very edge of the napkin. */
const EDGE = 0.02;
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

const DESTINATION_NAMES: Record<DestinationId, string> = {
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
  const extraEngines = stuck ? enginesForTwr(design, TARGET_TWR) : null;
  if (stuck) {
    const note =
      extraEngines === null
        ? `TWR ${formatTwr(analysis.liftoffTwr)}: needs more thrust`
        : `TWR ${formatTwr(analysis.liftoffTwr)}: needs ${extraEngines} more engine${extraEngines === 1 ? "" : "s"}`;
    marks.push(circleAround(sketch.engines(), note));
  }

  // A stuck rocket's delta-v counts as 0, so judge its fuel as if the engine fix were made.
  const flyable = !stuck ? design : extraEngines === null ? null : withExtraEngines(design, extraEngines);
  const flyableAnalysis = flyable === design ? analysis : flyable && analyze(flyable);
  const short = flyableAnalysis !== null && flyableAnalysis.marginMps < 0;
  const fix = short ? planShortfallFix(flyable!, flyableAnalysis, sketch) : null;
  if (fix) marks.push(shortfallMark(fix, sketch));

  if (VACUUM_DESTINATIONS.has(design.destination) && hasFeature(design, parts, "fins")) {
    marks.push(circleAround(sketch.fins(), "fins do nothing in vacuum"));
  }

  const lands = LANDING_DESTINATIONS.has(design.destination);
  const needsLegs = lands && !hasFeature(design, parts, "landing-legs");
  const needsShield = design.destination === "mars-surface" && !hasFeature(design, parts, "heat-shield");
  if (needsLegs) marks.push(arrowTo(sketch.bottomCenter(), sketch.openSide(), 0.06, "needs legs"));
  if (needsShield) marks.push(arrowTo(sketch.capsuleSide(), sketch.openSide(), -0.06, "heat shield!"));

  const flies = !stuck && !short && !needsLegs && !needsShield;
  if (flies) marks.push(circleAround(sketch.whole(), "flies!"));

  return {
    marks: marks.slice(0, MAX_MARKS),
    summary: summarize(design, analysis, { extraEngines, fix, flyableAnalysis, needsLegs, needsShield }),
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
  const stageIndex = stageToStretch(design, sketch);
  const keepsLiftoff = (a: Analysis) => a.liftoffTwr >= 1;

  const stretched = (factor: number) =>
    analyze(applyAction(design, { type: "scale-tanks", stageIndex, factor }));

  let stretchPercent: number | null = null;
  if (stretched(MAX_STRETCH).marginMps >= 0) {
    // More propellant means more delta-v, so bisect for where the margin turns positive.
    let lo = 1;
    let hi = MAX_STRETCH;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (stretched(mid).marginMps >= 0) hi = mid;
      else lo = mid;
    }
    const percent = Math.ceil((hi - 1) * 100 - 1e-9);
    const check = stretched(1 + percent / 100);
    // Bigger tanks also mean a heavier liftoff, so make sure it still clears the pad.
    if (check.marginMps >= 0 && keepsLiftoff(check)) stretchPercent = percent;
  }

  const staged = analyze(applyAction(design, { type: "add-stage" }));
  const withStage = staged.totalDeltaVMps > analysis.totalDeltaVMps && keepsLiftoff(staged) ? staged : null;

  return { stageIndex, stretchPercent, withStage };
}

/** The stage holding the biggest tank drawn, or else the stage with the most tank volume. */
function stageToStretch(design: Design, sketch: Sketch): number {
  const drawn = sketch.biggestTankPart()?.stageIndex;
  if (drawn !== undefined && drawn >= 0 && drawn < design.stages.length) return drawn;
  return design.stages.reduce((best, s, i, all) => (s.tankVolumeM3 > all[best].tankVolumeM3 ? i : best), 0);
}

function shortfallMark(fix: ShortfallFix, sketch: Sketch): RedPenMark {
  if (fix.stretchPercent !== null) {
    return arrowTo(sketch.tankSide(), sketch.openSide(), -0.08, `stretch +${fix.stretchPercent}%`);
  }
  if (fix.withStage) {
    const note =
      fix.withStage.marginMps >= 0
        ? "add a stage"
        : `add a stage: still ${km(-fix.withStage.marginMps)} km/s short`;
    return { kind: "ghost-line", points: sketch.newStageOutline(), note };
  }
  return arrowTo(sketch.tankSide(), sketch.openSide(), -0.08, "not enough fuel");
}

// ---------------------------------------------------------------------------
// Summary

function summarize(
  design: Design,
  analysis: Analysis,
  found: {
    extraEngines: number | null;
    fix: ShortfallFix | null;
    /** The design's analysis, or the engine-fixed one if it was stuck. */
    flyableAnalysis: Analysis | null;
    needsLegs: boolean;
    needsShield: boolean;
  },
): string {
  const deltaV = `${km(analysis.totalDeltaVMps)} of ${km(analysis.requiredDeltaVMps)} km/s`;
  const destination = DESTINATION_NAMES[design.destination];
  const fuelFix = found.fix && found.flyableAnalysis ? shortfallAdvice(found.fix, found.flyableAnalysis) : null;

  if (analysis.liftoffTwr < 1) {
    const thrust =
      found.extraEngines === null
        ? "it needs far more thrust"
        : `add ${found.extraEngines} engine${found.extraEngines === 1 ? "" : "s"} to clear the pad`;
    return `Liftoff TWR is ${formatTwr(analysis.liftoffTwr)}, so it never leaves the pad: ${thrust}${fuelFix ? `, then ${fuelFix}` : ""}.`;
  }
  if (fuelFix) return `${deltaV}: ${fuelFix}.`;

  const missing = [found.needsLegs && "landing legs", found.needsShield && "a heat shield"].filter(Boolean);
  if (missing.length > 0) {
    return `${deltaV} gets it to ${destination}, but it needs ${missing.join(" and ")} to land.`;
  }
  return `${deltaV}: it reaches ${destination} with ${km(analysis.marginMps)} km/s to spare.`;
}

function shortfallAdvice(fix: ShortfallFix, analysis: Analysis): string {
  const options: string[] = [];
  if (fix.stretchPercent !== null) options.push(`stretch the tanks ${fix.stretchPercent}%`);
  if (fix.withStage && fix.withStage.marginMps >= 0) options.push("add a stage");
  if (options.length > 0) return options.join(" or ");

  if (fix.withStage) {
    return `even a new stage leaves it ${km(-fix.withStage.marginMps)} km/s short`;
  }
  return analysis.furthestReachable
    ? `it can reach ${DESTINATION_NAMES[analysis.furthestReachable]} at most`
    : `it's ${km(-analysis.marginMps)} km/s short and can't make orbit`;
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

  /** The middle of the biggest tank's outer side, on whichever side of the napkin has more room. */
  tankSide(): Point {
    const [x, y, w, h] = this.biggestTankPart()?.box ?? slice(this.whole(), 0.25, 0.75);
    return [this.openSide() > 0 ? x + w : x, y + h / 2];
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

  /** 1 when there's more napkin to the right of the rocket than to the left, else -1. */
  openSide(): 1 | -1 {
    const [x, , w] = this.whole();
    return x + w / 2 <= 0.5 ? 1 : -1;
  }

  private ofKind(kind: PartKind) {
    return this.parts.filter((p) => p.kind === kind);
  }
}

/** A loop around a box, shrunk and nudged as needed to stay on the napkin. */
function circleAround([x, y, w, h]: Box, note: string): RedPenMark {
  // Box heights are fractions of the napkin's height; the radius is a fraction of its width.
  const wanted = Math.max(w, h / NAPKIN_ASPECT) / 2 + CIRCLE_PAD;
  const xReach = CIRCLE_OVERSHOOT;
  const yReach = CIRCLE_OVERSHOOT * CIRCLE_SQUASH * NAPKIN_ASPECT;
  const radius = clamp(wanted, MIN_RADIUS, 0.5 / Math.max(xReach, yReach));
  const center: Point = [
    clamp(x + w / 2, radius * xReach, 1 - radius * xReach),
    clamp(y + h / 2, radius * yReach, 1 - radius * yReach),
  ];
  return { kind: "circle", center, radius, note };
}

/** An arrow coming in from `side` (1 = right, -1 = left), with its note at the tail. */
function arrowTo([tx, ty]: Point, side: 1 | -1, rise: number, note: string): RedPenMark {
  const to: Point = [clamp(tx, EDGE, 1 - EDGE), clamp(ty, EDGE, 1 - EDGE)];
  const from: Point = [clamp(to[0] + side * 0.2, EDGE, 1 - EDGE), clamp(to[1] + rise, EDGE, 1 - EDGE)];
  return { kind: "arrow", from, to, note };
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

function km(mps: number) {
  return (mps / 1000).toFixed(1);
}

/** One decimal, but never round a TWR just under 1 up to "1.0". */
function formatTwr(twr: number) {
  return twr < 1 && twr >= 0.95 ? (Math.floor(twr * 100) / 100).toFixed(2) : twr.toFixed(1);
}

function clamp(value: number, lo: number, hi: number) {
  return Math.min(Math.max(value, lo), hi);
}
