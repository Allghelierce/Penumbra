"use client";

import { useMemo, useState, type ReactNode } from "react";
import TradeChart from "@/components/TradeChart";
import { payloadText } from "@/components/TemplatePicker";
import { PLACE_NAMES } from "@/components/VerdictPanel";
import { applyAction } from "@/lib/actions";
import type { Analysis, Design, DesignAction, DestinationId, EngineCluster, RocketTemplate, Stage } from "@/lib/design";
import { analyze, DESTINATIONS, ENGINES } from "@/lib/physics";
import { km } from "@/lib/physics/format";
import { maxPayloadKg, MIN_LIFTOFF_TWR, realStageFor, recoveryCostKg, stretchFromReal, tradeCurve, type TradeSweep } from "@/lib/trade";

/** Index of the real stage your stage i was made from, or -1 for a stage you added. */
export function realIndex(yours: Design, real: Design, i: number): number {
  const stage = realStageFor(yours, real, i);
  return stage ? real.stages.indexOf(stage) : -1;
}

/** How far your stage i's tanks are stretched from the real stage's (1 = as built, and for a stage you added). */
export function stretchOf(yours: Design, real: Design, i: number): number {
  const base = realStageFor(yours, real, i);
  const mine = yours.stages[i];
  return base && mine ? mine.tankVolumeM3 / base.tankVolumeM3 : 1;
}

/**
 * A drag's stretch (a factor on the tanks as they are) applied the way the trade chart builds it: from the
 * real stage, so stretches never compound. A stage you added has no real one and stretches from where it is.
 */
export function applyStretch(yours: Design, real: Design, i: number, factor: number): Design {
  if (!realStageFor(yours, real, i)) return applyAction(yours, { type: "scale-tanks", stageIndex: i, factor });
  return stretchFromReal(yours, real, i, stretchOf(yours, real, i) * factor);
}

interface ModifyPanelProps {
  template: RocketTemplate;
  /** Your rocket, as last applied. */
  design: Design;
  /** Your rocket with a drag still in progress, for live numbers; null when nothing is moving. */
  preview: Design | null;
  onAction: (action: DesignAction) => void;
  /** Put the rocket back as it was built, keeping the destination and payload. */
  onReset: () => void;
  /** The real stage the trade chart sweeps: an index into template.design.stages. */
  chartStage: number;
  onChartStage: (realIndex: number) => void;
  /** Above everything else: the red pen's findings on Check, the flight log after a flight. */
  top?: ReactNode;
}

const DESTINATION_CHIPS: { id: DestinationId; label: string }[] = [
  { id: "leo", label: "Orbit" },
  { id: "gto", label: "GTO" },
  { id: "moon-surface", label: "Moon" },
  { id: "mars-surface", label: "Mars" },
  { id: "europa", label: "Europa" },
];

function safeAnalyze(design: Design): Analysis | null {
  try {
    return analyze(design);
  } catch {
    return null;
  }
}

/** What a published payload figure counts that the model's doesn't. */
const PUBLISHED_NOTE: Partial<Record<RocketTemplate["id"], string>> = {
  "saturn-v": ", counting the S-IVB stage itself",
};

/** "Falcon 9 Block 5" → "Falcon 9": the name people use in a sentence. */
const shortName = (name: string) => name.replace(/\s+Block\s+\d+$/i, "");

const engineText = (stage: Stage) => stage.engines.map((c) => `${c.count}× ${ENGINES[c.engine]?.name ?? c.engine}`).join(" + ");

/** "the Booster", "the Super Heavy and the Ship". */
function theStages(labels: string[]): string {
  const named = labels.map((l) => `the ${l}`);
  return named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}` : (named[0] ?? "");
}

/** The cluster an engine-count sweep changes: the stage's biggest. */
const mainCluster = (engines: EngineCluster[]) => engines.reduce((best, c, i, all) => (c.count > all[best].count ? i : best), 0);

/** What you changed on the real rocket, one line per change. */
function changesOf(real: Design, yours: Design): string[] {
  const lines: string[] = [];
  const kept = new Set<number>();
  yours.stages.forEach((stage, i) => {
    const j = realIndex(yours, real, i);
    if (j < 0) {
      lines.push(`Added ${stage.label}: ${engineText(stage)}`);
      return;
    }
    kept.add(j);
    const was = real.stages[j];
    const stretch = stage.tankVolumeM3 / was.tankVolumeM3;
    if (Math.abs(stretch - 1) > 0.004) lines.push(`${stage.label} tanks ×${stretch.toFixed(2)}`);
    if (engineText(stage) !== engineText(was)) lines.push(`${stage.label}: ${engineText(stage)}, was ${engineText(was)}`);
    if (Boolean(stage.recover) !== Boolean(was.recover)) lines.push(stage.recover ? `${stage.label} lands to fly again` : `${stage.label} is thrown away`);
  });
  real.stages.forEach((stage, j) => {
    if (!kept.has(j)) lines.push(`Removed ${stage.label}`);
  });
  return lines;
}

/** The plain-language answer: what yours carries there, against what the real rocket does. */
function verdictLine(name: string, destination: DestinationId, yoursMax: number, realMax: number, empty: Analysis | null): { text: string; good: boolean } {
  const place = PLACE_NAMES[destination];
  const real = realMax > 0 ? `The real ${name} carries ${payloadText(realMax)} there.` : `The real ${name} can't get there either.`;
  if (yoursMax > 0 && realMax === 0) return { text: `Reaches ${place} with ${payloadText(yoursMax)}. The real ${name} can't.`, good: true };
  if (yoursMax > 0) {
    const diff = yoursMax - realMax;
    if (Math.abs(diff) < Math.max(10, realMax * 0.005)) return { text: `Carries ${payloadText(yoursMax)} to ${place}, the same as the real ${name}.`, good: true };
    return {
      text: `Carries ${payloadText(yoursMax)} to ${place}: ${payloadText(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than the real ${name}.`,
      good: diff > 0,
    };
  }
  if (!empty || empty.liftoffTwr < MIN_LIFTOFF_TWR) {
    const twr = empty ? empty.liftoffTwr.toFixed(2) : "0";
    return { text: `Too heavy to leave the pad safely, even empty: thrust is ${twr}× its weight, and real rockets lift off at ${MIN_LIFTOFF_TWR} or more. ${real}`, good: false };
  }
  return { text: `Can't reach ${place}, even empty: ${km(Math.max(0, -empty.marginMps))} km/s short. ${real}`, good: false };
}

const signed = (d: number, text: string) => `${d > 0 ? "+" : "−"}${text}`;

/**
 * Modify a real rocket: what you've changed, the mission you're flying it on, then the real rocket against
 * yours (payload to the destination, delta-v, thrust-to-weight, mass) with a one-line verdict and what
 * landing costs, and the trade-off chart for one stage.
 */
export default function ModifyPanel({ template, design, preview, onAction, onReset, chartStage, onChartStage, top }: ModifyPanelProps) {
  const [sweep, setSweep] = useState<TradeSweep["kind"]>("tank-stretch");
  const shown = preview ?? design;
  const { destination, payloadMassKg } = shown;
  const name = shortName(template.name);
  const real = useMemo(() => ({ ...template.design, destination, payloadMassKg }), [template, destination, payloadMassKg]);
  const realA = useMemo(() => safeAnalyze(real), [real]);
  const yoursA = useMemo(() => safeAnalyze(shown), [shown]);
  const realMax = useMemo(() => maxPayloadKg(template.design, destination), [template, destination]);
  const yoursMax = useMemo(() => maxPayloadKg(shown, destination), [shown, destination]);
  const modelLeo = useMemo(() => maxPayloadKg(template.design, "leo"), [template]);
  const empty = useMemo(() => safeAnalyze({ ...shown, payloadMassKg: 0 }), [shown]);
  const landing = useMemo(() => {
    const labels = shown.stages.filter((s) => s.recover).map((s) => s.label);
    return labels.length > 0 ? { labels, costKg: recoveryCostKg(shown, destination) } : null;
  }, [shown, destination]);
  const changes = useMemo(() => changesOf(template.design, design), [template, design]);
  const verdict = verdictLine(name, destination, yoursMax, realMax, empty);

  // The chart sweeps one real stage; find it in your rocket (stages you add have no real one to compare).
  const stageTabs = useMemo(
    () =>
      template.design.stages
        .map((stage, j) => ({ j, label: stage.label, i: design.stages.findIndex((_, i) => realIndex(design, template.design, i) === j) }))
        .filter((tab) => tab.i >= 0),
    [template, design],
  );
  const tab = stageTabs.find((t) => t.j === chartStage) ?? stageTabs[0];
  const chart = useMemo(() => {
    if (!tab) return null;
    const stage = design.stages[tab.i];
    const clusterIndex = mainCluster(stage.engines);
    const curve = tradeCurve(design, { kind: sweep, stageIndex: tab.i, clusterIndex }, { real: template.design, destination: design.destination });
    return { curve, clusterIndex };
  }, [design, tab, sweep, template]);

  function pick(x: number) {
    if (!tab || !chart) return;
    if (sweep === "tank-stretch") {
      const factor = x / stretchOf(design, template.design, tab.i);
      if (Math.abs(factor - 1) > 1e-6) onAction({ type: "scale-tanks", stageIndex: tab.i, factor });
      return;
    }
    const cluster = design.stages[tab.i].engines[chart.clusterIndex];
    if (cluster && cluster.count !== x) onAction({ type: "set-engines", stageIndex: tab.i, clusterIndex: chart.clusterIndex, engine: cluster.engine, count: x });
  }
  const currentX = !tab || !chart ? 1 : sweep === "tank-stretch" ? stretchOf(shown, template.design, tab.i) : (shown.stages[tab.i]?.engines[chart.clusterIndex]?.count ?? 1);

  const rows: { label: string; sub?: string; real: string; yours: string; delta: string | null; tone: string }[] = [];
  const payloadDelta = yoursMax - realMax;
  rows.push({
    label: `Payload to ${PLACE_NAMES[destination]}`,
    sub: "the most it can carry",
    real: payloadText(realMax),
    yours: payloadText(yoursMax),
    delta: Math.abs(payloadDelta) < 10 ? null : signed(payloadDelta, payloadText(Math.abs(payloadDelta))),
    tone: payloadDelta > 0 ? "text-go-signal" : "text-nogo",
  });
  if (realA && yoursA) {
    const dv = yoursA.totalDeltaVMps - realA.totalDeltaVMps;
    rows.push({
      label: "Delta-v",
      sub: `carrying ${payloadText(payloadMassKg)}, needs ${km(yoursA.requiredDeltaVMps)}`,
      real: `${km(realA.totalDeltaVMps)} km/s`,
      yours: `${km(yoursA.totalDeltaVMps)} km/s`,
      delta: km(Math.abs(dv)) === "0.0" ? null : signed(dv, km(Math.abs(dv))),
      tone: dv > 0 ? "text-go-signal" : "text-nogo",
    });
    const twr = yoursA.liftoffTwr - realA.liftoffTwr;
    rows.push({
      label: "Liftoff thrust / weight",
      sub: `${MIN_LIFTOFF_TWR} or more to leave the pad safely`,
      real: realA.liftoffTwr.toFixed(2),
      yours: yoursA.liftoffTwr.toFixed(2),
      delta: Math.abs(twr) < 0.005 ? null : signed(twr, Math.abs(twr).toFixed(2)),
      tone: yoursA.liftoffTwr < MIN_LIFTOFF_TWR ? "text-nogo" : "text-haze",
    });
    const mass = yoursA.liftoffMassKg - realA.liftoffMassKg;
    rows.push({
      label: "Liftoff mass",
      real: payloadText(realA.liftoffMassKg),
      yours: payloadText(yoursA.liftoffMassKg),
      delta: Math.abs(mass) < 10 ? null : signed(mass, payloadText(Math.abs(mass))),
      tone: "text-haze",
    });
  }

  // The published figure, with what it assumes about landing.
  const realLanding = template.design.stages.filter((s) => s.recover).map((s) => s.label);
  const published =
    template.realPayloadLeoReusableKg !== undefined
      ? `${payloadText(template.realPayloadLeoKg)} to low Earth orbit thrown away, ${payloadText(template.realPayloadLeoReusableKg)} with the booster landing`
      : `${payloadText(template.realPayloadLeoKg)} to low Earth orbit${realLanding.length > 0 ? `, with ${theStages(realLanding)} landing` : ""}${PUBLISHED_NOTE[template.id] ?? ""}`;

  return (
    <aside className="flex flex-col gap-3 p-3">
      {top}

      <Module
        title="Your rocket"
        meta={
          changes.length > 0 ? (
            <button type="button" onClick={onReset} className="text-[11px] uppercase tracking-[0.16em] text-haze transition-colors hover:text-white">
              Reset to the real one
            </button>
          ) : (
            <span className="text-[12px] text-haze">As built</span>
          )
        }
      >
        <div className="px-4 py-3">
          <p className="font-space text-[22px] font-semibold uppercase leading-tight tracking-[0.06em] text-white">{template.name}</p>
          {changes.length === 0 ? (
            <p className="mt-1 text-[13px] leading-snug text-haze">
              Drag the top edge of a tank to stretch it, change engines with the chips, land a stage, or add a booster. Every number below updates as you go.
            </p>
          ) : (
            <ul className="mt-2 space-y-0.5 text-[13px] leading-snug text-white/90">
              {changes.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-redpen" aria-hidden>
                    ▸
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Module>

      <Module title="Mission">
        <div className="space-y-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-[10px] uppercase tracking-[0.18em] text-haze">Fly it to</span>
            <div role="radiogroup" aria-label="Destination" className="flex flex-wrap gap-1">
              {DESTINATION_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  role="radio"
                  aria-checked={destination === chip.id}
                  title={DESTINATIONS[chip.id].name}
                  onClick={() => onAction({ type: "set-destination", destination: chip.id })}
                  className={`h-8 border px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                    destination === chip.id ? "border-white bg-white text-black" : "border-rule text-white/80 hover:border-white/60 hover:text-white"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <PayloadField
            key={`${design.payloadMassKg}`}
            payloadKg={design.payloadMassKg}
            maxKg={yoursMax}
            small={template.realPayloadLeoKg < 1_000}
            onSet={(kg) => onAction({ type: "set-payload", payloadMassKg: kg })}
          />
        </div>
      </Module>

      <Module title="Real vs yours" meta={<span className="text-[12px] text-haze">{DESTINATIONS[destination].name}</span>}>
        <p className={`border-l-2 px-4 py-3 text-[16px] font-medium leading-snug text-white ${verdict.good ? "border-go-signal" : "border-nogo"}`} aria-live="polite">
          {verdict.text}
        </p>
        <table className="w-full border-t border-rule text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.18em] text-haze">
              <th className="px-4 pb-1 pt-2.5 text-left font-normal">
                <span className="sr-only">Figure</span>
              </th>
              <th className="px-2 pb-1 pt-2.5 text-right font-normal">Real</th>
              <th className="px-2 pb-1 pt-2.5 text-right font-normal text-white">Yours</th>
              <th className="pb-1 pl-2 pr-4 pt-2.5 text-right font-normal">
                <span className="sr-only">Change</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="px-4 py-2 text-left font-normal">
                  <span className="block text-white/90">{row.label}</span>
                  {row.sub && <span className="block text-[11px] text-haze">{row.sub}</span>}
                </th>
                <td className="whitespace-nowrap px-2 py-2 text-right font-space tabular-nums text-white/70">{row.real}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-space text-[15px] font-medium tabular-nums text-white">{row.yours}</td>
                <td className={`whitespace-nowrap py-2 pl-2 pr-4 text-right font-space text-[12px] tabular-nums ${row.delta ? row.tone : "text-haze/60"}`}>
                  {row.delta ?? "·"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-rule px-4 py-2.5 text-[13px] leading-snug">
          {landing ? (
            <span className="text-white/90">
              <span aria-hidden className="mr-1.5 text-go-signal">
                ♻
              </span>
              Landing {theStages(landing.labels)} costs {payloadText(landing.costKg)} of payload to {PLACE_NAMES[destination]}, against throwing {landing.labels.length > 1 ? "them" : "it"} away.
            </span>
          ) : (
            <span className="text-haze">
              <span aria-hidden className="mr-1.5">
                ♻
              </span>
              Every stage is thrown away. Turn on Recover on a stage to see what landing it costs.
            </span>
          )}
        </p>
        <p className="border-t border-rule px-4 py-2 text-[12px] leading-snug text-haze">
          {template.sources[0] ? (
            <a href={template.sources[0].url} target="_blank" rel="noreferrer" className="underline decoration-white/30 underline-offset-2 hover:text-white">
              Published
            </a>
          ) : (
            "Published"
          )}
          : {published}. This model gives the real {name} {payloadText(modelLeo)}.
        </p>
      </Module>

      {chart && tab && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <div role="tablist" aria-label="Stage to sweep" className="flex gap-1">
              {stageTabs.map((t) => (
                <button
                  key={t.j}
                  type="button"
                  role="tab"
                  aria-selected={t.j === tab.j}
                  onClick={() => onChartStage(t.j)}
                  className={`h-7 border px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                    t.j === tab.j ? "border-white text-white" : "border-rule text-haze hover:border-white/60 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="What to sweep" className="ml-auto flex">
              {(["tank-stretch", "engine-count"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={sweep === kind}
                  onClick={() => setSweep(kind)}
                  className={`h-7 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${sweep === kind ? "text-white underline underline-offset-4" : "text-haze hover:text-white"}`}
                >
                  {kind === "tank-stretch" ? "Tanks" : "Engines"}
                </button>
              ))}
            </div>
          </div>
          {/* Its own caption reads the curve and your point on it; what landing costs is already said above. */}
          <TradeChart curve={chart.curve} currentX={currentX} onPick={pick} plotHeight={96} />
        </div>
      )}
    </aside>
  );
}

/** The payload to fly, typed in tonnes (kilograms for a small rocket), with the most this rocket can carry beside it. */
function PayloadField({ payloadKg, maxKg, small, onSet }: { payloadKg: number; maxKg: number; small: boolean; onSet: (kg: number) => void }) {
  const unit = small ? 1 : 1_000;
  const shown = small ? String(Math.round(payloadKg)) : String(Math.round(payloadKg / 100) / 10);
  const [draft, setDraft] = useState(shown);
  const commit = () => {
    const value = Number(draft.replace(/,/g, ""));
    if (Number.isFinite(value) && value >= 0 && value * unit !== payloadKg) onSet(value * unit);
    else setDraft(shown);
  };
  const tooHeavy = payloadKg > maxKg;
  // Rounded down, so "the most it can carry" always still reaches.
  const most = small ? Math.floor(maxKg / 10) * 10 : Math.floor(maxKg / 100) * 100;
  return (
    <div className="flex items-center gap-3">
      <label htmlFor="payload-mass" className="w-20 shrink-0 text-[10px] uppercase tracking-[0.18em] text-haze">
        Payload
      </label>
      <div className="flex h-8 items-center border border-rule focus-within:border-white">
        <input
          id="payload-mass"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setDraft(shown);
          }}
          className="h-full w-20 bg-transparent px-2 text-right font-space text-[14px] tabular-nums text-white outline-none"
        />
        <span className="pr-2 text-[12px] text-haze">{small ? "kg" : "t"}</span>
      </div>
      {most > 0 ? (
        <button
          type="button"
          onClick={() => onSet(most)}
          disabled={most === payloadKg}
          className={`text-left text-[12px] leading-snug transition-colors disabled:cursor-default ${tooHeavy ? "text-nogo hover:text-white" : "text-haze hover:text-white disabled:hover:text-haze"}`}
        >
          {tooHeavy ? "Too heavy. " : ""}Most it can carry: {payloadText(most)}
        </button>
      ) : (
        <span className="text-[12px] text-nogo">Can&apos;t get there with any payload</span>
      )}
    </div>
  );
}

/** A framed instrument: a header strip with its name, and the readout below. */
function Module({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="module">
      <header className="module-head">
        <h3 className="font-space text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">{title}</h3>
        {meta}
      </header>
      {children}
    </section>
  );
}
