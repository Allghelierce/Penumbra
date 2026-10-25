"use client";

import type { ReactNode } from "react";
import SpecimenDrawing from "@/components/SpecimenDrawing";
import TypeOut from "@/components/TypeOut";
import type { Analysis, Design, DestinationId, Phase, PriorArtResult, Review, Verdict } from "@/lib/design";
import { DESTINATIONS, ENGINES } from "@/lib/physics";
import { km, kmShort, kmSpare } from "@/lib/physics/format";
import { closestAnalogs, historyLine } from "@/lib/analogs";

interface VerdictPanelProps {
  phase: Phase;
  design: Design | null;
  analysis: Analysis | null;
  review: Review | null;
  conceptUrl: string | null;
  conceptLoading: boolean;
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
            <TypeOut key={heading} as="h2" text={heading} className="font-display text-[26px] font-semibold leading-tight text-starlight" />
            <p className="mt-1 max-w-[46ch] text-[14px] leading-snug text-haze">
              {phase === "reading"
                ? "Finding the stages, tanks and engines in your strokes."
                : "Draw a spacecraft on the napkin and press Check design. Every number comes from published engine data."}
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

  const go = analysis.verdict === "destination";
  const target = DESTINATIONS[design.destination];
  const ladder = Object.values(DESTINATIONS).sort((a, b) => a.deltaVFromSurfaceMps - b.deltaVFromSurfaceMps);
  const short = analysis.marginMps < 0;
  const title = capitalize(headline(analysis.verdict, design.destination));

  return (
    <aside className="flex flex-col gap-3 p-3">
      <Module
        title="Flight readiness"
        meta={
          <span className={`font-space text-[11px] tracking-[0.12em] ${go ? "text-go-signal" : "text-nogo"}`}>
            <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${go ? "bg-go-signal" : "bg-nogo"}`} />
            {go ? "GO" : "NO GO"}
          </span>
        }
      >
        <div className="flex gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-haze">Target: {target.name}</p>
            <TypeOut key={title} as="h2" text={title} cps={40} className="mt-1 block font-display text-[30px] font-semibold leading-[1.05] text-starlight" />
            {review?.summary && (
              <TypeOut key={review.summary} as="p" text={review.summary} delay={title.length * 25 + 200} cps={90} linger={0} className="mt-2 block text-[14px] leading-snug text-haze" />
            )}
          </div>
          {(props.conceptUrl || props.conceptLoading) && (
            <figure className="w-[112px] shrink-0">
              <div className="aspect-[4/3] w-full overflow-hidden bg-umbra ring-1 ring-rule">
                {props.conceptUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={props.conceptUrl} alt={`Grok Imagine render of ${design.name}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="developing h-full w-full" />
                )}
              </div>
              <figcaption className="mt-1 text-[11px] leading-tight text-haze">Grok Imagine render</figcaption>
            </figure>
          )}
        </div>
      </Module>

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
      </Module>

      <Module title="Vehicle">
        <div className="grid grid-cols-3 divide-x divide-rule">
          <Figure label="Liftoff mass" value={tonnes(analysis.liftoffMassKg)} />
          <Figure label="Thrust-to-weight" value={analysis.liftoffTwr.toFixed(2)} bad={analysis.liftoffTwr < 1} note={analysis.liftoffTwr < 1 ? "needs over 1" : undefined} />
          <Figure label="Payload" value={tonnes(design.payloadMassKg)} />
        </div>
      </Module>

      <ClosestRocket design={design} analysis={analysis} />

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
    </aside>
  );
}

/** A framed instrument: a header strip with its name, and the readout below. */
function Module({ title, meta, className = "", children }: { title: string; meta?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`module ${className}`}>
      <header className="module-head">
        <h3 className="font-space text-[10px] uppercase tracking-[0.16em] text-haze">{title}</h3>
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
            className="font-display text-[22px] font-semibold leading-tight text-starlight hover:underline"
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
  const scale = Math.max(analysis.totalDeltaVMps, analysis.requiredDeltaVMps) * 1.06;
  const pct = (mps: number) => `${(mps / scale) * 100}%`;
  const shades = ["bg-starlight/85", "bg-starlight/55", "bg-starlight/35", "bg-starlight/20"];
  const needed = analysis.requiredDeltaVMps / scale;
  return (
    <div className="mt-2">
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-3 flex h-4 overflow-hidden rounded-[2px] bg-rule/60">
          {analysis.stages.map((s, i) => (
            <div key={`${s.label}-${i}`} className={`h-full ${shades[i % shades.length]} border-r border-umbra/60`} style={{ width: pct(s.deltaVMps) }} />
          ))}
        </div>
        <div className="absolute top-0 h-10 border-l-2 border-dashed border-flame" style={{ left: `${needed * 100}%` }} aria-hidden />
        <p
          className="absolute -top-0.5 whitespace-nowrap text-[11px] text-flame"
          style={needed > 0.7 ? { right: `${(1 - needed) * 100}%`, marginRight: 6 } : { left: `${needed * 100}%`, marginLeft: 6 }}
        >
          needed {km(analysis.requiredDeltaVMps)}
        </p>
      </div>
      <div className="mt-1 flex text-[12px] text-haze">
        {analysis.stages.map((s, i) => (
          <span key={`${s.label}-${i}`} className="truncate pr-2" style={{ width: pct(s.deltaVMps) }}>
            {s.label} {km(s.deltaVMps)}
          </span>
        ))}
        <span className="ml-auto whitespace-nowrap text-starlight">{km(analysis.totalDeltaVMps)} km/s total</span>
      </div>
    </div>
  );
}

function Figure({ label, value, bad, note }: { label: string; value: string; bad?: boolean; note?: string }) {
  return (
    <div className="px-4 py-2.5">
      <p className="text-[12px] text-haze">{label}</p>
      <p className={`mt-0.5 font-space text-[17px] leading-tight ${bad ? "text-nogo" : "text-starlight"}`}>{value}</p>
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
