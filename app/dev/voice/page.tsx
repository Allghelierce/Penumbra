"use client";

// Dev harness for the voice reviewer: a fixture design, a toy analyzer so replies
// change after each edit, and a log of every onAction. Not the real physics.

import { useMemo, useState } from "react";
import VoiceDock from "@/components/VoiceDock";
import type { Analysis, Design, DesignAction, DestinationId, Phase, Review, Verdict } from "@/lib/design";

const FIXTURE: Design = {
  name: "Napkin One",
  stages: [
    { label: "Booster", engines: [{ engine: "raptor-3", count: 9 }], propellant: "methalox", tankVolumeM3: 900 },
    { label: "Ship", engines: [{ engine: "raptor-vacuum", count: 3 }], propellant: "methalox", tankVolumeM3: 450 },
  ],
  payloadMassKg: 40000,
  destination: "mars-transfer",
  features: ["fins", "landing-legs"],
  heightM: 70,
  diameterM: 9,
};

const REVIEW: Review = {
  marks: [],
  summary: "The booster's fine. The ship runs dry about a third of the way to Mars.",
};

// Fixture numbers for the toy analyzer only.
const REQUIRED: Record<DestinationId, number> = {
  leo: 9400,
  gto: 11800,
  "moon-orbit": 13000,
  "mars-transfer": 13500,
  "moon-surface": 15000,
  "mars-surface": 15500,
  europa: 18500,
};
const ORDER = Object.keys(REQUIRED) as DestinationId[];

function toyAnalyze(design: Design): Analysis {
  const g = 9.81;
  const stageMasses = design.stages.map((s, i) => {
    const prop = s.tankVolumeM3 * 830;
    const engines = s.engines.reduce((n, e) => n + e.count, 0);
    const dry = s.dryMassKg ?? prop * 0.06 + engines * 1600;
    return { s, i, prop, dry, engines };
  });
  let above = design.payloadMassKg;
  const stages = [...stageMasses].reverse().map(({ s, i, prop, dry, engines }) => {
    const isp = i === 0 ? 327 : 375;
    const thrust = engines * (i === 0 ? 2.6e6 : 2.9e6);
    const wet = dry + prop + above;
    const dv = isp * g * Math.log(wet / (dry + above));
    const result = {
      label: s.label,
      wetMassKg: dry + prop,
      dryMassKg: dry,
      propellantMassKg: prop,
      ispS: isp,
      thrustN: thrust,
      deltaVMps: dv,
      burnTimeS: (prop * isp * g) / Math.max(1, thrust),
      twrAtIgnition: thrust / (wet * g),
    };
    above = wet;
    return result;
  });
  stages.reverse();
  const total = stages.reduce((n, s) => n + s.deltaVMps, 0);
  const required = REQUIRED[design.destination];
  const margin = total - required;
  const twr = stages[0]?.twrAtIgnition ?? 0;
  const furthest = twr < 1 ? null : ([...ORDER].reverse().find((d) => REQUIRED[d] <= total) ?? null);
  const verdict: Verdict = twr < 1 ? "stuck-on-pad" : margin >= 0 ? "destination" : furthest ? "orbit" : "suborbital";
  const findings =
    verdict === "stuck-on-pad"
      ? [`Liftoff thrust-to-weight is ${twr.toFixed(2)}, so it never leaves the pad.`]
      : verdict === "destination"
        ? [`It has ${Math.round(margin)} m/s of margin left over at ${design.destination}.`]
        : [`It comes up ${Math.round(-margin)} m/s short of ${design.destination}.`];
  return {
    liftoffMassKg: above,
    liftoffTwr: twr,
    stages,
    totalDeltaVMps: total,
    requiredDeltaVMps: required,
    marginMps: margin,
    verdict,
    furthestReachable: furthest,
    findings,
  };
}

function applyToy(design: Design, action: DesignAction): Design {
  const stages = design.stages.map((s) => ({ ...s, engines: s.engines.map((e) => ({ ...e })) }));
  switch (action.type) {
    case "set-destination":
      return { ...design, destination: action.destination };
    case "scale-tanks":
      if (stages[action.stageIndex]) stages[action.stageIndex].tankVolumeM3 *= action.factor;
      return { ...design, stages };
    case "add-stage":
      return { ...design, stages: [{ label: "Booster", engines: [{ engine: "raptor-3", count: 33 }], propellant: "methalox", tankVolumeM3: 3400 }, ...stages] };
    case "remove-stage":
      return stages.length > 1 ? { ...design, stages: stages.filter((_, i) => i !== action.stageIndex) } : design;
    case "set-engines":
      if (stages[action.stageIndex]) stages[action.stageIndex].engines = [{ engine: action.engine, count: action.count }];
      return { ...design, stages };
    case "set-payload":
      return { ...design, payloadMassKg: action.payloadMassKg };
    default:
      return design;
  }
}

export default function VoiceDevPage() {
  const [design, setDesign] = useState<Design | null>(FIXTURE);
  const [phase, setPhase] = useState<Phase>("reviewed");
  const [narration, setNarration] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const analysis = useMemo(() => (design ? toyAnalyze(design) : null), [design]);

  const onAction = (action: DesignAction) => {
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${JSON.stringify(action)}`, ...l].slice(0, 30));
    if (action.type === "launch") {
      setPhase("launch");
      setNarration("T-minus ten. Engines chilling. Somebody check the napkin is fireproof.");
      return;
    }
    if (action.type === "review") return;
    setDesign((d) => (d ? applyToy(d, action) : d));
  };

  // The dock only speaks narration when it changes, so nudge repeats with a zero-width space.
  const say = (text: string) => setNarration((n) => (n === text ? `${text}​` : text));

  return (
    <div className="flex min-h-screen flex-col bg-table">
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 p-6 font-sans text-sm text-graphite">
        <h1 className="font-hand text-4xl">Voice reviewer dev page</h1>
        <p className="text-ink-muted">
          Toy analyzer, not the real physics. Hold the red button or Space and say “stretch the tanks 30 percent”, “add a booster”, “send it to
          Europa”, “give it 6 vacuum raptors on the ship”, “launch it”.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <label className="font-mono text-xs">
            phase{" "}
            <select value={phase} onChange={(e) => setPhase(e.target.value as Phase)} className="border border-napkin-edge bg-napkin px-1">
              {(["draw", "reading", "reviewed", "launch"] as Phase[]).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <button className="rounded border border-napkin-edge bg-napkin px-2 py-1" onClick={() => say("Liftoff! We have liftoff.")}>
            narrate liftoff
          </button>
          <button className="rounded border border-napkin-edge bg-napkin px-2 py-1" onClick={() => say(REVIEW.summary)}>
            narrate review
          </button>
          <button className="rounded border border-napkin-edge bg-napkin px-2 py-1" onClick={() => setDesign(FIXTURE)}>
            reset design
          </button>
          <button className="rounded border border-napkin-edge bg-napkin px-2 py-1" onClick={() => setDesign(null)}>
            clear design
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded border border-napkin-edge bg-napkin p-3">
            <h2 className="mb-1 font-mono text-xs uppercase text-ink-muted">design + toy analysis</h2>
            {design && analysis ? (
              <pre className="font-mono text-xs whitespace-pre-wrap">
                {`${design.destination}  payload ${design.payloadMassKg} kg
${design.stages.map((s, i) => `stage ${i} ${s.label}: ${s.engines.map((e) => `${e.count}x ${e.engine}`).join(", ")}, ${Math.round(s.tankVolumeM3)} m3`).join("\n")}

verdict ${analysis.verdict}
dv ${Math.round(analysis.totalDeltaVMps)} / ${analysis.requiredDeltaVMps} m/s  margin ${Math.round(analysis.marginMps)}
twr ${analysis.liftoffTwr.toFixed(2)}
${analysis.findings.join("\n")}`}
              </pre>
            ) : (
              <p className="text-ink-muted">no design</p>
            )}
          </section>
          <section className="rounded border border-napkin-edge bg-napkin p-3">
            <h2 className="mb-1 font-mono text-xs uppercase text-ink-muted">onAction log</h2>
            <pre className="max-h-64 overflow-auto font-mono text-xs whitespace-pre-wrap">{log.join("\n") || "nothing yet"}</pre>
          </section>
        </div>
      </main>

      <div className="sticky bottom-0 mx-auto w-full max-w-4xl px-6">
        <VoiceDock phase={phase} design={design} analysis={analysis} review={REVIEW} narration={narration} onAction={onAction} />
      </div>
    </div>
  );
}
