"use client";

import SpecimenDrawing from "@/components/SpecimenDrawing";
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
    return (
      <aside className="flex h-full flex-col px-6 py-5">
        <h2 className="font-display text-[26px] font-semibold leading-tight text-starlight">
          {phase === "reading" ? "Reading your sketch" : "What Penumbra reads from a sketch"}
        </h2>
        <p className="mt-1 max-w-[46ch] text-[14px] leading-snug text-haze">
          {phase === "reading"
            ? "Grok vision is finding the stages, tanks and engines."
            : "Draw a spacecraft on the napkin and press Check design. Every number comes from published engine data."}
        </p>
        <div className={`mt-4 min-h-0 flex-1 transition-opacity ${phase === "reading" ? "opacity-40" : ""}`}>
          <div className="mx-auto h-full max-h-full" style={{ aspectRatio: "440 / 640" }}>
            <SpecimenDrawing />
          </div>
        </div>
      </aside>
    );
  }

  const go = analysis.verdict === "destination";
  const target = DESTINATIONS[design.destination];
  const ladder = Object.values(DESTINATIONS).sort((a, b) => a.deltaVFromSurfaceMps - b.deltaVFromSurfaceMps);
  const short = analysis.marginMps < 0;

  return (
    <aside className="flex flex-col divide-y divide-rule">
      {/* Verdict */}
      <section className="flex gap-4 px-6 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span
              className={`rounded-sm px-2 py-0.5 font-display text-[15px] font-bold tracking-wide ${
                go ? "bg-go-signal/15 text-go-signal" : "bg-nogo/15 text-nogo"
              }`}
            >
              {go ? "GO" : "NO GO"}
            </span>
            <span className="text-[14px] text-haze">Target: {target.name}</span>
          </div>
          <h2 className="mt-2 font-display text-[32px] font-semibold leading-[1.05] text-starlight">
            {capitalize(headline(analysis.verdict, design.destination))}
          </h2>
          {review?.summary && <p className="mt-2 text-[14px] leading-snug text-haze">{review.summary}</p>}
        </div>
        {(props.conceptUrl || props.conceptLoading) && (
          <figure className="w-[120px] shrink-0">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-sm bg-panel ring-1 ring-rule">
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
      </section>

      {/* Delta-v budget */}
      <section className="px-6 py-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-[18px] font-semibold text-starlight">Delta-v budget</h3>
          <p className={`text-[14px] font-medium ${short ? "text-nogo" : "text-go-signal"}`}>
            {short
              ? `${kmShort(analysis.totalDeltaVMps, analysis.requiredDeltaVMps)} km/s short`
              : `${kmSpare(analysis.totalDeltaVMps, analysis.requiredDeltaVMps)} km/s to spare`}
          </p>
        </div>
        <BudgetBar analysis={analysis} />
      </section>

      {/* Key figures */}
      <section className="grid grid-cols-3 divide-x divide-rule">
        <Figure label="Liftoff mass" value={tonnes(analysis.liftoffMassKg)} />
        <Figure label="Thrust-to-weight" value={analysis.liftoffTwr.toFixed(2)} bad={analysis.liftoffTwr < 1} note={analysis.liftoffTwr < 1 ? "needs over 1" : undefined} />
        <Figure label="Payload" value={tonnes(design.payloadMassKg)} />
      </section>

      <ClosestRocket design={design} analysis={analysis} />

      {/* Reach */}
      <section className="px-6 py-4">
        <h3 className="font-display text-[18px] font-semibold text-starlight">Where it can go</h3>
        <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
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
      </section>

      {/* Stages */}
      <section className="px-6 py-4">
        <h3 className="font-display text-[18px] font-semibold text-starlight">Stages</h3>
        <table className="mt-2 w-full text-left text-[13px]">
          <thead className="text-haze">
            <tr>
              <th className="pb-1 font-normal">Stage</th>
              <th className="pb-1 font-normal">Engines</th>
              <th className="pb-1 text-right font-normal">Delta-v</th>
              <th className="pb-1 text-right font-normal">T/W</th>
            </tr>
          </thead>
          <tbody>
            {analysis.stages.map((s, i) => (
              <tr key={`${s.label}-${i}`} className="border-t border-rule">
                <td className="py-1.5 pr-2 text-starlight">{s.label}</td>
                <td className="max-w-[150px] truncate py-1.5 pr-2 text-haze">{engineList(design, i)}</td>
                <td className="py-1.5 text-right text-starlight">{km(s.deltaVMps)} km/s</td>
                <td className={`py-1.5 text-right ${s.twrAtIgnition < 1 && i === 0 ? "text-nogo" : "text-starlight"}`}>
                  {s.twrAtIgnition.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {props.priorArt.length > 0 && (
        <section className="px-6 py-4">
          <h3 className="font-display text-[18px] font-semibold text-starlight">NASA prior art</h3>
          <ul className="mt-2 space-y-2">
            {props.priorArt.slice(0, 3).map((r) => (
              <li key={r.id}>
                <a href={r.url} target="_blank" rel="noreferrer" className="group block text-[13px] leading-snug">
                  <span className="line-clamp-2 text-starlight group-hover:underline">{r.title}</span>
                  <span className="text-[12px] text-haze">NASA Technical Reports Server{r.year ? `, ${r.year}` : ""}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

/** The real vehicle this design most resembles, and the history it echoes. */
function ClosestRocket({ design, analysis }: { design: Design; analysis: Analysis }) {
  const [best, ...others] = closestAnalogs(design, analysis, 3);
  if (!best) return null;
  return (
    <section className="px-6 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[18px] font-semibold text-starlight">Closest real rocket</h3>
        <span className="text-[13px] text-haze">{Math.round(best.similarity * 100)}% match</span>
      </div>
      <p className="mt-1 flex items-baseline gap-2">
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
    </section>
  );
}

/** Stage contributions stacked against what the target needs. */
function BudgetBar({ analysis }: { analysis: Analysis }) {
  const scale = Math.max(analysis.totalDeltaVMps, analysis.requiredDeltaVMps) * 1.06;
  const pct = (mps: number) => `${(mps / scale) * 100}%`;
  const shades = ["bg-starlight/85", "bg-starlight/55", "bg-starlight/35", "bg-starlight/20"];
  const needed = analysis.requiredDeltaVMps / scale;
  return (
    <div className="mt-3">
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
    <div className="px-6 py-3">
      <p className="text-[12px] text-haze">{label}</p>
      <p className={`font-display text-[24px] font-semibold leading-tight ${bad ? "text-nogo" : "text-starlight"}`}>{value}</p>
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
