"use client";

import { useState } from "react";
import type { Analysis, Design, Verdict } from "@/lib/design";
import { DEST_NAME, DEST_SHORT, fmtKm } from "./plan";

interface EndCardProps {
  outcome: Verdict;
  design: Design;
  analysis: Analysis;
  maxAltKm: number;
  maxSpeedMps: number;
  renderUrl: string | null;
  onDone: () => void;
  onReplay: () => void;
}

const kms = (mps: number) => (Math.abs(mps) / 1000).toFixed(1);

function verdictCopy({ outcome, design, analysis, maxAltKm }: EndCardProps): { headline: string; ok: boolean; line: string } {
  const dest = DEST_NAME[design.destination] ?? design.destination;
  const margin = analysis.marginMps;
  const spare = margin >= 0 ? `${kms(margin)} km/s to spare` : `${kms(margin)} km/s short`;
  switch (outcome) {
    case "destination":
      return { headline: DEST_SHORT[design.destination] ?? "ORBIT", ok: true, line: `Made it to ${dest} with ${spare}.` };
    case "orbit":
      return {
        headline: "ORBIT",
        ok: true,
        line:
          design.destination === "leo"
            ? `In orbit with ${spare}.`
            : `Orbit, yes. ${dest[0].toUpperCase()}${dest.slice(1)} needs ${kms(margin)} km/s more.`,
      };
    case "suborbital":
      return {
        headline: "RUD",
        ok: false,
        line: `Up to ${fmtKm(maxAltKm)} km, then all the way back down. ${kms(margin)} km/s short.`,
      };
    default:
      return {
        headline: "Never left the pad",
        ok: false,
        line: `Liftoff thrust-to-weight is ${analysis.liftoffTwr.toFixed(2)}; it has to beat 1.`,
      };
  }
}

export default function EndCard(props: EndCardProps) {
  const { design, analysis, maxAltKm, maxSpeedMps, renderUrl, onDone, onReplay } = props;
  const { headline, ok, line } = verdictCopy(props);
  const findings = (analysis.findings ?? []).slice(0, 2);

  return (
    <div className="ls-fade absolute inset-0 flex items-start justify-center overflow-y-auto bg-night/60 px-4 py-8 sm:items-center">
      <div className="ls-rise relative w-full max-w-3xl rounded-[3px] border border-napkin-edge bg-napkin p-5 text-graphite shadow-[0_30px_80px_rgba(0,0,0,0.6)] sm:p-8">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,15rem)_1fr] sm:gap-8">
          <Polaroid url={renderUrl} name={design.name} />
          <div className="flex min-w-0 flex-col">
            <h2 className={`font-hand text-6xl leading-[0.9] sm:text-7xl ${ok ? "text-graphite" : "text-redpen"}`}>
              {headline}
              {ok && <span className="ml-3 text-go">✓</span>}
            </h2>
            <p className="mt-2 font-hand text-2xl leading-snug text-graphite/90">{line}</p>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 font-mono text-[11px] uppercase tracking-wider text-ink-muted">
              <Stat label="Max altitude" value={`${fmtKm(maxAltKm)} km`} />
              <Stat label="Max speed" value={`${Math.round(maxSpeedMps).toLocaleString("en-US")} m/s`} />
              <Stat label="Delta-v" value={`${kms(analysis.totalDeltaVMps)} / ${kms(analysis.requiredDeltaVMps)} km/s`} />
              <Stat label="Liftoff TWR" value={analysis.liftoffTwr.toFixed(2)} />
            </dl>
            {findings.length > 0 && (
              <ul className="mt-5 space-y-1 font-hand text-xl leading-snug text-graphite/85">
                {findings.map((f) => (
                  <li key={f}>→ {f}</li>
                ))}
              </ul>
            )}
            <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-6">
              <button
                type="button"
                autoFocus
                onClick={onDone}
                className="rounded-full border-2 border-redpen px-5 py-1 font-hand text-3xl text-redpen transition-colors hover:bg-redpen hover:text-napkin focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-redpen"
              >
                Back to the napkin
              </button>
              <button
                type="button"
                onClick={onReplay}
                className="font-mono text-xs uppercase tracking-widest text-ink-muted underline-offset-4 hover:text-graphite hover:underline"
              >
                fly again ↻
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="mt-0.5 text-base normal-case tracking-normal text-graphite">{value}</dd>
    </div>
  );
}

function Polaroid({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const show = url !== null && failed !== url;
  return (
    <figure className="mx-auto w-full max-w-[15rem] -rotate-3 self-start bg-white p-3 pb-2 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className="relative aspect-square w-full overflow-hidden bg-night">
        {show ? (
          // Grok Imagine URLs are remote and short-lived; next/image would need them allow-listed.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={`Grok Imagine render of ${name}`}
            className="ls-fade h-full w-full object-cover"
            onError={() => setFailed(url)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.04)_0_10px,transparent_10px_20px)]">
            <span className="ls-pending font-hand text-2xl text-white/80">render pending…</span>
          </div>
        )}
      </div>
      <figcaption className="mt-2 truncate text-center font-hand text-xl text-graphite">{name}</figcaption>
    </figure>
  );
}
