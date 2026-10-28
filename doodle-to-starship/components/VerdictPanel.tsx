"use client";

import type { ReactNode } from "react";
import CountUp from "@/components/CountUp";
import DesignReview, { CantRead, type ReviewIssue, type Trade } from "@/components/DesignReview";
import SpecimenDrawing from "@/components/SpecimenDrawing";
import TypeOut from "@/components/TypeOut";
import type { Analysis, Attempt, Design, DestinationId, FlightTrace, Phase, PriorArtResult, Recap, Review, Verdict } from "@/lib/design";
import TrajectoryPreview from "@/components/TrajectoryPreview";
import { DESTINATIONS, ENGINES } from "@/lib/physics";
import { km, kmShort, kmSpare } from "@/lib/physics/format";
import { closestAnalogs, historyLine } from "@/lib/analogs";

interface VerdictPanelProps {
  /** What's wrong with the design and how to fix it, numbered like the red-pen marks. */
  issues: ReviewIssue[];
  trades: Trade[];
  selectedIssue: number | null;
  onSelectIssue: (index: number | null) => void;
  /** Set when the sketch couldn't be read as a vehicle; then no physics is shown. */
  unreadable: { problem: string | null } | null;
  samples: { id: string; title: string }[];
  onSample: (id: string) => void;
  /** Every launch of this sketch so far, oldest first. */
  attempts: Attempt[];
  /** What to try next after the latest flight. */
  recap: Recap | null;
  /** The simulated flight for the current design, previewed before launch. */
  trace: FlightTrace | null;
  /** Start the launch (the same as the Launch button). */
  onLaunch: () => void;
  canLaunch: boolean;
  phase: Phase;
  design: Design | null;
  analysis: Analysis | null;
  review: Review | null;
  priorArt: PriorArtResult[];
}

export const PLACE_NAMES: Record<DestinationId, string> = {
  leo: "orbit",
  gto: "geostationary transfer",
  "moon-orbit": "Moon orbit",
  "moon-surface": "the Moon",
  "mars-transfer": "Mars transfer",
  "mars-surface": "Mars",
  europa: "Europa",
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function headline(verdict: Verdict, destination: DestinationId): string {
  const place = PLACE_NAMES[destination];
  switch (verdict) {
    case "stuck-on-pad":
      return "Can't lift off the pad";
    case "suborbital":
      return "Falls short of orbit";
    case "orbit":
      return destination === "leo" ? "Reaches orbit" : `Reaches orbit, not ${place}`;
    case "destination":
      return `Reaches ${place}`;
  }
}

const tonnes = (kg: number) => `${Math.round(kg / 1000).toLocaleString("en-US")} t`;

function engineList(design: Design, index: number): string {
  const stage = design.stages[index];
  if (!stage || stage.engines.length === 0) return "None";
  return stage.engines.map((e) => `${e.count} × ${ENGINES[e.engine]?.name ?? e.engine}`).join(", ");
}

export default function VerdictPanel(props: VerdictPanelProps) {
  const { phase, design, analysis, review } = props;

  if (!design || !analysis) {
    const heading = phase === "reading" ? "Reading your sketch" : "What Penumbra reads from a sketch";
    return (
      <aside className="flex h-full flex-col p-3">
        <Module title="Reference drawing" meta={phase === "reading" ? "Grok vision" : "Two-stage launcher"} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col px-5 pb-3 pt-4">
            <TypeOut key={heading} as="h2" text={heading} className="font-space text-[20px] font-semibold uppercase leading-tight tracking-[0.08em] text-white" />
            <p className="mt-1 max-w-[46ch] text-[14px] leading-snug text-haze">
              {phase === "reading"
                ? "Finding the stages, tanks and engines in your strokes."
                : "Draw a spacecraft and press Check design. Every number comes from published engine data."}
            </p>
            <div className={`mt-3 min-h-0 flex-1 transition-opacity ${phase === "reading" ? "opacity-40" : ""}`}>
              <div className="mx-auto h-full max-h-full" style={{ aspectRatio: "440 / 640" }}>
                <SpecimenDrawing />
              </div>
            </div>
          </div>
        </Module>
      </aside>
    );
  }

  if (props.unreadable) {
    return (
      <aside className="flex flex-col gap-3 p-3">
        <Module title="Design review" meta={<span className="text-[12px] text-nogo">Sketch not readable</span>}>
          <CantRead problem={props.unreadable.problem} samples={props.samples} onSample={props.onSample} />
        </Module>
      </aside>
    );
  }

  const go = analysis.verdict === "destination";
  const problems = props.issues.filter((issue) => issue.severity !== "ok").length;
  const target = DESTINATIONS[design.destination];
  const ladder = Object.values(DESTINATIONS).sort((a, b) => a.deltaVFromSurfaceMps - b.deltaVFromSurfaceMps);
  const short = analysis.marginMps < 0;
  const title = capitalize(headline(analysis.verdict, design.destination));

  return (
    <aside className="flex flex-col gap-3 p-3">
      <Module
        title="Design review"
        meta={
          <span className={`text-[12px] ${problems ? "text-nogo" : "text-go-signal"}`}>
            {problems ? `${problems} ${problems === 1 ? "issue" : "issues"}` : "Clean"}
          </span>
        }
      >
        <DesignReview
          issues={props.issues}
          trades={props.trades}
          selected={props.selectedIssue}
          onSelect={props.onSelectIssue}
        />
      </Module>

      <Module
        title="Flight readiness"
        meta={
          <span className={`font-space text-[12px] font-semibold tracking-[0.2em] ${go ? "text-go-signal" : "text-nogo"}`}>
            <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${go ? "bg-go-signal" : "bg-nogo"}`} />
            {go ? "GO" : "NO GO"}
          </span>
        }
      >
        <div className="px-4 py-3">
          <p className="text-[13px] text-haze">Target: {target.name}</p>
          <TypeOut key={title} as="h2" text={title} cps={40} className="mt-1 block font-space text-[24px] font-semibold uppercase leading-[1.1] tracking-[0.06em] text-white" />
          {review?.summary && (
            <TypeOut key={review.summary} as="p" text={review.summary} delay={title.length * 25 + 200} cps={90} linger={0} className="mt-2 block text-[14px] leading-snug text-haze" />
          )}
        </div>
      </Module>

      {props.trace && (
        <Module
          title="Predicted flight"
          meta={
            <button type="button" onClick={props.onLaunch} disabled={!props.canLaunch} className="btn-outline h-6 px-2.5 text-[10px]">
              Watch it fly
            </button>
          }
        >
          <div className="px-3 pb-2 pt-2">
            <TrajectoryPreview trace={props.trace} />
          </div>
        </Module>
      )}

      {props.attempts.length > 0 && <FlightLog attempts={props.attempts} recap={props.recap} />}

      <Module
        title="Delta-v budget"
        meta={
          <span className={`text-[13px] font-medium ${short ? "text-nogo" : "text-go-signal"}`}>
            {short
              ? `${kmShort(analysis.totalDeltaVMps, analysis.requiredDeltaVMps)} km/s short`
              : `${kmSpare(analysis.totalDeltaVMps, analysis.requiredDeltaVMps)} km/s to spare`}
          </span>
        }
      >
        <div className="px-4 pb-3 pt-1">
          <BudgetBar analysis={analysis} />
        </div>
        <div className="grid grid-cols-3 divide-x divide-rule border-t border-rule">
          <Figure label="Liftoff mass" value={<CountUp value={analysis.liftoffMassKg} format={tonnes} />} />
          <Figure
            label="Thrust/weight"
            value={<CountUp value={analysis.liftoffTwr} format={(n) => n.toFixed(2)} />}
            bad={analysis.liftoffTwr < 1}
            note={analysis.liftoffTwr < 1 ? "needs over 1" : undefined}
          />
          <Figure label="Payload" value={<CountUp value={design.payloadMassKg} format={tonnes} />} />
        </div>
      </Module>

      <ClosestRocket design={design} analysis={analysis} />

      <details className="module group">
        <summary className="module-head cursor-pointer list-none select-none">
          <h3 className="font-space text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">More detail</h3>
          <span className="text-[12px] text-haze">
            <span className="group-open:hidden">Destinations, stages, prior art</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="flex flex-col gap-3 p-3">
      <Module title="Where it can go">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 px-4 py-3">
          {ladder.map((d) => {
            const ok = analysis.liftoffTwr >= 1 && analysis.totalDeltaVMps >= d.deltaVFromSurfaceMps;
            const isTarget = d.id === design.destination;
            return (
              <li key={d.id} className={`flex items-center gap-2 text-[13px] ${isTarget ? "text-starlight" : "text-haze"}`}>
                <Mark ok={ok} />
                <span className={`min-w-0 flex-1 truncate ${isTarget ? "font-semibold" : ""}`}>
                  {d.name}
                  {isTarget && <span className="ml-1.5 text-[11px] font-normal text-haze">target</span>}
                </span>
                <span className="text-haze">{km(d.deltaVFromSurfaceMps)}</span>
              </li>
            );
          })}
        </ul>
      </Module>

      <Module title="Stages" meta={<span className="text-[12px] text-haze">{analysis.stages.length} {analysis.stages.length === 1 ? "stage" : "stages"}</span>}>
        <table className="w-full text-left text-[13px]">
          <thead className="text-haze">
            <tr>
              <th className="px-4 pb-1 pt-2 font-normal">Stage</th>
              <th className="pb-1 pt-2 font-normal">Engines</th>
              <th className="pb-1 pt-2 text-right font-normal">Delta-v</th>
              <th className="px-4 pb-1 pt-2 text-right font-normal">T/W</th>
            </tr>
          </thead>
          <tbody>
            {analysis.stages.map((s, i) => (
              <tr key={`${s.label}-${i}`} className="border-t border-rule">
                <td className="px-4 py-1.5 pr-2 text-starlight">{s.label}</td>
                <td className="max-w-[150px] truncate py-1.5 pr-2 text-haze">{engineList(design, i)}</td>
                <td className="py-1.5 text-right text-starlight">{km(s.deltaVMps)} km/s</td>
                <td className={`px-4 py-1.5 text-right ${s.twrAtIgnition < 1 && i === 0 ? "text-nogo" : "text-starlight"}`}>
                  {s.twrAtIgnition.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Module>

      {props.priorArt.length > 0 && (
        <Module title="NASA prior art" meta={<span className="text-[12px] text-haze">Technical Reports Server</span>}>
          <ul className="space-y-2 px-4 py-3">
            {props.priorArt.slice(0, 3).map((r) => (
              <li key={r.id}>
                <a href={r.url} target="_blank" rel="noreferrer" className="group block text-[13px] leading-snug">
                  <span className="line-clamp-2 text-starlight group-hover:underline">{r.title}</span>
                  {r.year && <span className="text-[12px] text-haze">{r.year}</span>}
                </a>
              </li>
            ))}
          </ul>
        </Module>
      )}
        </div>
      </details>
    </aside>
  );
}

const OUTCOME: Record<Verdict, { text: string; tone: string }> = {
  destination: { text: "On course", tone: "text-go-signal" },
  orbit: { text: "Orbit", tone: "text-white" },
  suborbital: { text: "Suborbital", tone: "text-nogo" },
  "stuck-on-pad": { text: "On the pad", tone: "text-nogo" },
};

const altitude = (km: number) => (km < 1 ? "0 km" : `${Math.round(km).toLocaleString("en-US")} km`);

/** One row per launch, newest first, with how much better (or worse) each did than the one before. */
export function FlightLog({ attempts, recap }: { attempts: Attempt[]; recap: Recap | null }) {
  const rows = [...attempts].reverse();
  const next = recap?.improvements[0];
  return (
    <Module title="Flight log" meta={<span className="text-[12px] text-haze">{attempts.length} {attempts.length === 1 ? "flight" : "flights"}</span>}>
      <ol className="divide-y divide-rule">
        {rows.map((a, i) => {
          const prev = rows[i + 1];
          const gain = prev ? a.analysis.totalDeltaVMps - prev.analysis.totalDeltaVMps : null;
          const outcome = OUTCOME[a.analysis.verdict];
          return (
            <li key={a.n} className={`grid grid-cols-[2.5rem_5.5rem_1fr_auto] items-baseline gap-2 px-4 py-1.5 text-[13px] ${i === 0 ? "" : "opacity-70"}`}>
              <span className="font-space text-[12px] font-semibold tracking-[0.12em] text-haze">#{a.n}</span>
              <span className={`font-space text-[11px] font-semibold uppercase tracking-[0.14em] ${outcome.tone}`}>{outcome.text}</span>
              <span className="text-white">
                {km(a.analysis.totalDeltaVMps)} km/s
                <span className="ml-2 text-haze">max {altitude(a.maxAltitudeKm)}</span>
              </span>
              <span className={`text-[12px] ${gain === null ? "text-haze" : gain >= 0 ? "text-go-signal" : "text-nogo"}`}>
                {gain === null ? "first flight" : `${gain >= 0 ? "+" : "−"}${km(Math.abs(gain))} km/s`}
              </span>
            </li>
          );
        })}
      </ol>
      {next && (
        <div className="border-t border-rule px-4 py-2.5 text-[13px]">
          <span className="mr-2 text-[10px] uppercase tracking-[0.18em] text-haze">Next</span>
          <span className="text-white/85">{next.text}</span>
        </div>
      )}
    </Module>
  );
}

/** A framed instrument: a header strip with its name, and the readout below. */
function Module({ title, meta, className = "", children }: { title: string; meta?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`module ${className}`}>
      <header className="module-head">
        <h3 className="font-space text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">{title}</h3>
        {meta}
      </header>
      {children}
    </section>
  );
}

/** The real vehicle this design most resembles, and the history it echoes. */
function ClosestRocket({ design, analysis }: { design: Design; analysis: Analysis }) {
  const [best, ...others] = closestAnalogs(design, analysis, 3);
  if (!best) return null;
  return (
    <Module title="Closest real rocket" meta={<span className="text-[13px] text-haze">{Math.round(best.similarity * 100)}% match</span>}>
      <div className="px-4 py-3">
        <p className="flex items-baseline gap-2">
          <a
            href={best.vehicle.source}
            target="_blank"
            rel="noreferrer"
            className="font-space text-[20px] font-semibold uppercase tracking-[0.08em] leading-tight text-white hover:underline"
          >
            {best.name}
          </a>
          <span className="text-[12px] text-haze">first flew {best.vehicle.firstFlight}</span>
        </p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-starlight/85">{capitalize(best.why)}.</p>
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-haze">{historyLine(design, analysis)}</p>
        {others.length > 0 && (
          <p className="mt-1.5 text-[12px] text-haze">
            Also close:{" "}
            {others.map((a, i) => (
              <span key={a.name}>
                {i > 0 && ", "}
                <a href={a.vehicle.source} target="_blank" rel="noreferrer" className="text-starlight/80 hover:underline">
                  {a.name}
                </a>{" "}
                {Math.round(a.similarity * 100)}%
              </span>
            ))}
          </p>
        )}
      </div>
    </Module>
  );
}

/** Stage contributions stacked against what the target needs. */
function BudgetBar({ analysis }: { analysis: Analysis }) {
  // A rocket that can't lift itself has no usable delta-v; don't draw stage fills it will never burn.
  const grounded = analysis.liftoffTwr < 1;
  const stages = grounded ? [] : analysis.stages;
  const scale = Math.max(analysis.totalDeltaVMps, analysis.requiredDeltaVMps) * 1.06;
  const share = (mps: number) => mps / scale;
  const pct = (mps: number) => `${share(mps) * 100}%`;
  const shades = ["bg-white/90", "bg-white/55", "bg-white/35", "bg-white/20"];
  const needed = analysis.requiredDeltaVMps / scale;
  return (
    <div className="mt-2">
      <div className="relative h-10">
        <div className="bar-grow absolute inset-x-0 top-3 flex h-4 overflow-hidden bg-white/[0.06]">
          {stages.map((s, i) => (
            <div
              key={`${s.label}-${i}`}
              className={`h-full ${shades[i % shades.length]} border-r border-black transition-[width] duration-700 ease-out`}
              style={{ width: pct(s.deltaVMps) }}
            />
          ))}
        </div>
        <div className="absolute top-0 h-10 border-l-2 border-dashed border-flame transition-[left] duration-700 ease-out" style={{ left: `${needed * 100}%` }} aria-hidden />
        <p
          className="absolute -top-0.5 whitespace-nowrap text-[11px] text-flame"
          style={needed > 0.7 ? { right: `${(1 - needed) * 100}%`, marginRight: 6 } : { left: `${needed * 100}%`, marginLeft: 6 }}
        >
          needed {km(analysis.requiredDeltaVMps)}
        </p>
      </div>
      <div className="mt-1 flex text-[12px] text-haze">
        {grounded ? (
          <span className="text-nogo">Can&apos;t lift off: thrust/weight {analysis.liftoffTwr.toFixed(2)}, needs over 1</span>
        ) : (
          stages.map((s, i) => (
            // Narrow segments drop the stage name and keep the number.
            <span key={`${s.label}-${i}`} className="truncate pr-2" style={{ width: pct(s.deltaVMps) }} title={`${s.label} ${km(s.deltaVMps)} km/s`}>
              {share(s.deltaVMps) > 0.2 ? `${s.label} ` : ""}
              {km(s.deltaVMps)}
            </span>
          ))
        )}
        <span className="ml-auto whitespace-nowrap pl-2 text-white">
          <CountUp value={analysis.totalDeltaVMps} format={(n) => `${km(n)} km/s total`} />
        </span>
      </div>
    </div>
  );
}

function Figure({ label, value, bad, note }: { label: string; value: ReactNode; bad?: boolean; note?: string }) {
  return (
    <div className="px-4 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-haze">{label}</p>
      <p className={`mt-0.5 font-space text-[22px] font-medium leading-tight ${bad ? "text-nogo" : "text-white"}`}>{value}</p>
      {note && <p className="text-[11px] text-nogo">{note}</p>}
    </div>
  );
}

function Mark({ ok }: { ok: boolean }) {
  return ok ? (
    <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-go-signal" aria-label="reachable">
      <path d="M2 6.5 L5 9 L10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-nogo/80" aria-label="out of reach">
      <path d="M3 3 L9 9 M9 3 L3 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
