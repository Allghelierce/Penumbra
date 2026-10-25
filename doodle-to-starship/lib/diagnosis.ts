// The design review an engineer would give at a concept review: each issue says what's wrong,
// why, with the design's own numbers in the physics, and what the fix buys. Every fix and
// every number is re-run through analyze(), and each issue links to its red-pen mark.

import { applyAction } from "./actions";
import type { Analysis, Design, DesignAction, RedPenMark, SketchReading } from "./design";
import { analyze, DESTINATIONS, ENGINES, km, kmShort, kmSpare } from "./physics";
import { buildReview, DESTINATION_NAMES, SAFE_TWR } from "./redpen";

export interface Issue {
  /** 1-based, in display order; the UI numbers the matching red-pen mark with it. */
  n: number;
  severity: "no-go" | "warning" | "ok";
  title: string;
  /** The physics, with this design's numbers plugged in. */
  why: string;
  /** What the fix buys, e.g. "+1.4 km/s → makes orbit". */
  effect: string;
  fix?: DesignAction;
  /** Index into buildReview(reading, analysis).marks for the mark this issue explains. */
  markIndex?: number;
}

export interface Sensitivity {
  /** e.g. "Payload". */
  label: string;
  /** e.g. "+1 t → −14 m/s". */
  value: string;
}

const G0 = 9.80665;
/** Upper stages that start slower than this spend a long time fighting gravity. */
const SLOW_UPPER_STAGE_TWR = 0.5;
const SEVERITY_ORDER = { "no-go": 0, warning: 1, ok: 2 } as const;

type Draft = Omit<Issue, "n">;

export function diagnose(design: Design, analysis: Analysis, reading?: SketchReading): Issue[] {
  const marks = buildReview(reading ?? { design, parts: [] }, analysis).marks;
  const markFor = (test: (m: RedPenMark) => boolean) => {
    const i = marks.findIndex(test);
    return i >= 0 ? i : undefined;
  };

  const drafts: Draft[] = [];
  const liftoff = liftoffIssue(design, analysis, marks, markFor);
  drafts.push(liftoff.issue);
  drafts.push(deltaVIssue(design, liftoff.flyable, marks, markFor));
  drafts.push(...slowUpperStages(analysis));
  drafts.push(...hardwareIssues(design, marks, markFor));

  return drafts
    .map((d, i) => ({ d, i }))
    .sort((a, b) => SEVERITY_ORDER[a.d.severity] - SEVERITY_ORDER[b.d.severity] || a.i - b.i)
    .map(({ d }, i) => ({ n: i + 1, ...d }));
}

type MarkFinder = (test: (m: RedPenMark) => boolean) => number | undefined;

// ---------------------------------------------------------------------------
// Liftoff

function liftoffIssue(
  design: Design,
  a: Analysis,
  marks: RedPenMark[],
  markFor: MarkFinder,
): { issue: Draft; flyable: Design } {
  const twr = a.liftoffTwr.toFixed(2);
  const thrust = a.stages[0]?.thrustN ?? 0;
  const engines = design.stages[0]?.engines ?? [];
  const engineText = engines.map((c) => `${c.count} × ${ENGINES[c.engine].name}`).join(" + ") || "no engines";
  const why =
    `${engineText} make ${tonnesForce(thrust)} of thrust against ${tonnes(a.liftoffMassKg)} on the pad, ` +
    `so thrust-to-weight is ${twr}` +
    (a.liftoffTwr < 1
      ? `. Below 1.0, weight beats thrust and it never leaves the pad.`
      : a.liftoffTwr < SAFE_TWR
        ? `: it accelerates at only ${((a.liftoffTwr - 1) * G0).toFixed(1)} m/s² off the pad, so gravity eats the climb. Launchers start at 1.2–1.5.`
        : `, a healthy ${((a.liftoffTwr - 1) * G0).toFixed(1)} m/s² of net acceleration off the pad.`);

  if (a.liftoffTwr >= SAFE_TWR) {
    return { issue: { severity: "ok", title: "Lifts off", why, effect: `TWR ${twr}` }, flyable: design };
  }

  const markIndex = markFor((m) => m.fix?.type === "set-engines" || /engine|too heavy/.test(m.note));
  const fix = markIndex !== undefined ? marks[markIndex].fix : undefined;
  const title = a.liftoffTwr < 1 ? "Can't lift off" : "Marginal liftoff";
  const severity = a.liftoffTwr < 1 ? "no-go" : "warning";
  if (fix?.type === "set-engines") {
    const fixed = applyAction(design, fix);
    const after = analyze(fixed);
    const added = fix.count - (engines[0]?.count ?? 0);
    return {
      issue: {
        severity,
        title,
        why,
        effect: `+${added} ${ENGINES[fix.engine].name} engine${added === 1 ? "" : "s"} → TWR ${twr} → ${after.liftoffTwr.toFixed(2)}`,
        fix,
        markIndex,
      },
      flyable: fixed,
    };
  }
  return {
    issue: { severity, title, why, effect: "Needs a lighter design or bigger engines; 200+ more engines would be absurd", markIndex },
    flyable: design,
  };
}

// ---------------------------------------------------------------------------
// Delta-v

function deltaVIssue(design: Design, flyable: Design, marks: RedPenMark[], markFor: MarkFinder): Draft {
  // Judged on the engine-fixed design when it can't lift off, as the red pen does.
  const a = analyze(flyable);
  const dest = DESTINATION_NAMES[design.destination];
  const goal = design.destination === "leo" ? "orbit" : dest;
  const total = stageSum(a);
  const prefix = flyable === design ? "" : "With the engine fix, ";
  const why = `${prefix}${rocketEquation(flyable, a)} You need ${km(a.requiredDeltaVMps)} km/s to reach ${goal}.`;

  if (a.marginMps >= 0) {
    return {
      severity: "ok",
      title: "Enough delta-v",
      why,
      effect: `${kmSpare(total, a.requiredDeltaVMps)} km/s to spare`,
      markIndex: markFor((m) => m.note === "flies!"),
    };
  }

  const markIndex = markFor(
    (m) => m.fix?.type === "scale-tanks" || m.fix?.type === "add-stage" || m.kind === "ghost-line" || m.note === "out of reach",
  );
  const mark = markIndex !== undefined ? marks[markIndex].fix : undefined;
  const short = kmShort(total, a.requiredDeltaVMps);
  const title = `${short} km/s short of ${goal}`;
  if (mark?.type === "scale-tanks" || mark?.type === "add-stage") {
    const after = analyze(applyAction(flyable, mark));
    const gain = kmSpare(stageSum(after), total);
    const what =
      mark.type === "scale-tanks"
        ? `Stretch the ${flyable.stages[mark.stageIndex]?.label ?? ""} tanks +${Math.round((mark.factor - 1) * 100)}%`
        : "Add a stage";
    const outcome =
      after.marginMps >= 0 && after.liftoffTwr >= 1
        ? `makes ${goal === "orbit" ? "orbit" : `it to ${goal}`}`
        : `still ${kmShort(stageSum(after), after.requiredDeltaVMps)} km/s short`;
    return { severity: "no-go", title, why, effect: `${what} → +${gain} km/s → ${outcome}`, fix: mark, markIndex };
  }
  const reach = a.furthestReachable ? `it can reach ${DESTINATIONS[a.furthestReachable].name} today` : "it can't make orbit yet";
  return { severity: "no-go", title, why, effect: `No single tank or stage change closes ${short} km/s; ${reach}`, markIndex };
}

/**
 * "Booster: mass ratio 2.9, it burns 3,560 t of 5,427 t, 340 s × 9.81 × ln 2.9 = 3.6 km/s.
 * Ship: ... Total 12.3 km/s."
 */
function rocketEquation(design: Design, a: Analysis): string {
  const parts = a.stages.map((s, i) => {
    const above = a.stages.slice(i + 1).reduce((sum, u) => sum + u.wetMassKg, 0) + design.payloadMassKg;
    const m0 = s.wetMassKg + above;
    const mf = m0 - s.propellantMassKg;
    const ratio = mf > 0 ? m0 / mf : 1;
    return (
      `${s.label}: mass ratio ${ratio.toFixed(1)}, it burns ${tonnes(s.propellantMassKg)} of ${tonnes(m0)}, ` +
      `${Math.round(s.ispS)} s × 9.81 × ln ${ratio.toFixed(1)} = ${km(s.deltaVMps)} km/s.`
    );
  });
  const total = a.stages.length > 1 ? ` Total ${km(stageSum(a))} km/s.` : "";
  return parts.join(" ") + total;
}

/** Delta-v the stages would give if it flew (analyze reports 0 for a rocket stuck on the pad). */
function stageSum(a: Analysis) {
  return a.stages.reduce((sum, s) => sum + s.deltaVMps, 0);
}

function slowUpperStages(a: Analysis): Draft[] {
  return a.stages.slice(1).flatMap((s): Draft[] => {
    if (s.twrAtIgnition >= SLOW_UPPER_STAGE_TWR || s.thrustN <= 0) return [];
    return [
      {
        severity: "warning",
        title: `Slow ${s.label}`,
        why:
          `The ${s.label} lights at thrust-to-weight ${s.twrAtIgnition.toFixed(2)} and burns for ${Math.round(s.burnTimeS / 60)} min. ` +
          `Gravity pulls on it the whole time, so real losses run higher than this estimate's flat budget.`,
        effect: "More or bigger upper-stage engines shorten the burn",
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Hardware the napkin should show

function hardwareIssues(design: Design, all: RedPenMark[], markFor: MarkFinder): Draft[] {
  const out: Draft[] = [];
  const dest = DESTINATION_NAMES[design.destination];
  const has = (note: string) => all.some((m) => m.note === note);
  if (has("needs legs")) {
    out.push({
      severity: "no-go",
      title: "No landing legs",
      why: `Landing on ${dest} ends in a powered touchdown at about 2 m/s. Without legs the engine bells take the impact and the stage tips over.`,
      effect: "Draw landing legs on the napkin",
      markIndex: markFor((m) => m.note === "needs legs"),
    });
  }
  if (has("heat shield!")) {
    out.push({
      severity: "no-go",
      title: "No heat shield",
      why: "It hits Mars's atmosphere at about 6 km/s. Friction heats the leading surface past 1,000 °C, and bare structure burns through.",
      effect: "Draw a heat shield on the napkin",
      markIndex: markFor((m) => m.note === "heat shield!"),
    });
  }
  const finsMark = markFor((m) => /vacuum/.test(m.note));
  if (finsMark !== undefined) {
    out.push({
      severity: "warning",
      title: "Fins are dead weight",
      why: `Fins steer by pushing on air, and above about 100 km there's none. All the way to ${dest} they're just mass the engines have to carry.`,
      effect: "Leave them off for this mission",
      markIndex: finsMark,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sensitivities

/** The trade numbers: how much delta-v (or TWR) one unit of change buys or costs, by finite difference. */
export function sensitivities(design: Design): Sensitivity[] {
  const base = analyze(design);
  const dv0 = stageSum(base);
  const dDv = (d: Design) => stageSum(analyze(d)) - dv0;
  const out: Sensitivity[] = [];
  if (design.stages.length === 0) return out;

  out.push({ label: "Payload", value: `+1 t → ${signedMps(dDv({ ...design, payloadMassKg: design.payloadMassKg + 1000 }))}` });

  // Dry mass hurts most at the top of the stack, where every stage below carries it.
  const top = design.stages.length - 1;
  for (const i of top > 0 ? [top, 0] : [0]) {
    const dry = base.stages[i]?.dryMassKg ?? 0;
    const heavier = design.stages.map((s, j) => (j === i ? { ...s, dryMassKg: dry + 1000 } : s));
    out.push({ label: `${design.stages[i].label} dry mass`, value: `+1 t → ${signedMps(dDv({ ...design, stages: heavier }))}` });
  }

  design.stages.forEach((s, i) => {
    const bigger = applyAction(design, { type: "scale-tanks", stageIndex: i, factor: 1.1 });
    out.push({ label: `${s.label} tanks`, value: `+10% → ${signedMps(dDv(bigger))}` });
  });

  const bottom = design.stages[0];
  if (bottom.engines.length > 0) {
    const main = bottom.engines[0];
    const more = applyAction(design, { type: "set-engines", stageIndex: 0, engine: main.engine, count: main.count + 1 });
    const dTwr = analyze(more).liftoffTwr - base.liftoffTwr;
    out.push({
      label: `${bottom.label} engines`,
      value: `+1 ${ENGINES[main.engine].name} → TWR ${dTwr >= 0 ? "+" : "−"}${Math.abs(dTwr).toFixed(3)}, ${signedMps(dDv(more))}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Formatting

function tonnes(kg: number) {
  return `${Math.round(kg / 1000).toLocaleString("en-US")} t`;
}

function tonnesForce(newtons: number) {
  return `${Math.round(newtons / G0 / 1000).toLocaleString("en-US")} t-force`;
}

function signedMps(mps: number) {
  const r = Math.round(mps);
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r).toLocaleString("en-US")} m/s`;
}
