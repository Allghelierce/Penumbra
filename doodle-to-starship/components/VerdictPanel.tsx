"use client";

import type { Analysis, Design, DestinationId, Phase, PriorArtResult, Review, Verdict } from "@/lib/design";
import { DESTINATIONS } from "@/lib/physics";

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

function headline(verdict: Verdict, destination: DestinationId) {
  switch (verdict) {
    case "stuck-on-pad":
      return { text: "Never leaves the pad", color: "text-redpen" };
    case "suborbital":
      return { text: "Won't make orbit", color: "text-redpen" };
    case "orbit":
      return { text: `Orbit, yes. ${PLACE_NAMES[destination]}, no.`, color: "text-graphite" };
    case "destination":
      return { text: `It flies to ${PLACE_NAMES[destination]}!`, color: "text-go" };
  }
}

const km = (mps: number) => (mps / 1000).toFixed(1);

export default function VerdictPanel(props: VerdictPanelProps) {
  const { phase, design, analysis, review } = props;

  if (!design || !analysis) {
    return (
      <aside className="flex flex-col gap-6">
        <div className="index-card -rotate-1 rounded-sm px-5 py-4 pl-11">
          <p className="font-mono text-[10px] tracking-[0.2em] text-ink-muted">HOW IT WORKS</p>
          <ol className="mt-2 space-y-1 font-hand text-[22px] leading-7">
            <li>1. Sketch any spacecraft on the napkin.</li>
            <li>2. Pick where it&apos;s headed.</li>
            <li>3. Hit check. The red pen tells you if it flies.</li>
            <li>4. Argue with the engineer. Then launch it.</li>
          </ol>
        </div>
        {phase === "reading" && (
          <p className="font-hand text-2xl text-ink-muted">reading your napkin…</p>
        )}
      </aside>
    );
  }

  const { text, color } = headline(analysis.verdict, design.destination);
  const ladder = Object.values(DESTINATIONS).sort((a, b) => a.deltaVFromSurfaceMps - b.deltaVFromSurfaceMps);

  return (
    <aside className="flex flex-col gap-5">
      <div className="index-card -rotate-[0.6deg] rounded-sm px-5 py-4 pl-11">
        <p className="font-mono text-[10px] tracking-[0.2em] text-ink-muted">VERDICT</p>
        <p className={`font-hand text-[38px] font-bold leading-[1.05] ${color}`}>{text}</p>
        {review && <p className="mt-1 font-hand text-[21px] leading-6">{review.summary}</p>}
        <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px]">
          <Stat label="LIFTOFF" value={`${Math.round(analysis.liftoffMassKg / 1000).toLocaleString()} t`} />
          <Stat
            label="THRUST/WEIGHT"
            value={analysis.liftoffTwr.toFixed(2)}
            bad={analysis.liftoffTwr < 1}
          />
          <Stat label="DELTA-V" value={`${km(analysis.totalDeltaVMps)} km/s`} bad={analysis.marginMps < 0} />
        </div>
      </div>

      <div className="rounded-sm bg-white/60 px-4 py-3 shadow-[0_1px_2px_rgba(70,50,20,0.1)]">
        <p className="font-mono text-[10px] tracking-[0.2em] text-ink-muted">
          WHERE IT CAN GO · YOU HAVE {km(analysis.totalDeltaVMps)} KM/S
        </p>
        <ul className="mt-2 space-y-1.5">
          {ladder.map((d) => {
            const ok = analysis.totalDeltaVMps >= d.deltaVFromSurfaceMps;
            const target = d.id === design.destination;
            const fill = Math.min(1, analysis.totalDeltaVMps / d.deltaVFromSurfaceMps);
            return (
              <li key={d.id} className={`flex items-center gap-2 text-[13px] ${target ? "font-semibold" : ""}`}>
                <span className={`w-4 font-hand text-xl leading-none ${ok ? "text-go" : "text-redpen"}`}>
                  {ok ? "✓" : "✗"}
                </span>
                <span className="w-32 truncate">{d.name}</span>
                <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-napkin-edge">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full ${ok ? "bg-go" : "bg-redpen"}`}
                    style={{ width: `${fill * 100}%` }}
                  />
                </span>
                <span className="w-16 text-right font-mono text-[11px] text-ink-muted">
                  {km(d.deltaVFromSurfaceMps)} km/s
                </span>
                {target && <span className="font-hand text-lg leading-none text-redpen">← target</span>}
              </li>
            );
          })}
        </ul>
        <ul className="mt-3 space-y-1 border-t border-dashed border-napkin-edge pt-2 text-[13px] leading-snug">
          {analysis.findings.map((finding) => (
            <li key={finding}>• {finding}</li>
          ))}
        </ul>
      </div>

      <div className="flex items-start gap-4">
        <figure className="polaroid relative w-[52%] shrink-0 rotate-[1.8deg]">
          <span className="tape" />
          <div className="aspect-[4/3] w-full overflow-hidden bg-[#1b1e24]">
            {props.conceptUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.conceptUrl} alt={`Grok Imagine render of ${design.name}`} className="h-full w-full object-cover" />
            ) : props.conceptLoading ? (
              <div className="developing h-full w-full" />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-3 text-center font-hand text-lg leading-5 text-white/60">
                Grok Imagine render appears here
              </div>
            )}
          </div>
          <figcaption className="absolute bottom-1.5 left-0 right-0 truncate px-3 text-center font-hand text-xl">
            {design.name}
          </figcaption>
        </figure>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {props.priorArt.slice(0, 2).map((r, i) => (
            <a
              key={r.id}
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className={`sticky block px-3 py-2 ${i % 2 ? "rotate-[1.2deg]" : "-rotate-[1.5deg]"}`}
            >
              <p className="font-mono text-[9px] tracking-[0.18em] text-[#7a6a10]">
                NASA PRIOR ART{r.year ? ` · ${r.year}` : ""}
              </p>
              <p className="line-clamp-3 text-[12px] font-medium leading-snug">{r.title}</p>
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div>
      <p className="text-[9px] tracking-[0.15em] text-ink-muted">{label}</p>
      <p className={`text-[15px] font-semibold ${bad ? "text-redpen" : ""}`}>{value}</p>
    </div>
  );
}
