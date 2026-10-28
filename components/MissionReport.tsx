"use client";

// The full mishap report for a real flight, laid out like an engineering document, with a copy-as-Markdown export.

import { useEffect, useState } from "react";
import type { FlightTrace, HistoricMission } from "@/lib/design";
import type { MissionReport as ReportData } from "@/lib/mission-reports";

const ORBITAL_SPEED_MPS = 7800;

/** One entry of MISSION_PHOTOS[mission.id] in lib/mission-photos.ts. */
export interface MissionPhoto {
  url: string;
  caption: string;
  credit: string;
  license: string;
  pageUrl: string;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** Mission elapsed time as T+mm:ss (T− before liftoff). */
function tPlus(s: number): string {
  const sign = s < 0 ? "T−" : "T+";
  const a = Math.round(Math.abs(s));
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

const num = (n: number, digits = 0) => n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

function flightData(mission: HistoricMission, trace: FlightTrace) {
  const last = mission.timeline[mission.timeline.length - 1];
  if (!last) return null;
  return {
    t: tPlus(last.tS),
    altitudeKm: last.altitudeKm,
    speedMps: last.speedMps,
    orbitalPct: (last.speedMps / ORBITAL_SPEED_MPS) * 100,
    maxAltitudeKm: trace.maxAltitudeKm,
  };
}

function toMarkdown(mission: HistoricMission, report: ReportData | undefined, trace: FlightTrace): string {
  const lost = mission.outcome === "lost";
  const data = flightData(mission, trace);
  const lines: string[] = [
    `# ${lost ? "Mishap report" : "Flight report"}: ${mission.vehicle}, ${mission.mission}`,
    "",
    `- **Date:** ${formatDate(mission.date)}`,
    `- **Site:** ${mission.site}`,
    `- **Outcome:** ${lost ? "LOST" : "SUCCESS"}`,
  ];
  if (report) {
    lines.push(`- **Objective:** ${report.objective}`, `- **Payload:** ${report.payload}`, `- **Investigation:** ${report.investigation}`);
  }
  if (data) {
    lines.push(
      "",
      `## ${lost ? "Flight data at failure" : "Flight data at end of timeline"}`,
      "",
      `| Time | Altitude | Speed | Orbital speed reached | Max altitude |`,
      `|---|---|---|---|---|`,
      `| ${data.t} | ${num(data.altitudeKm, 1)} km | ${num(data.speedMps)} m/s | ${num(data.orbitalPct)}% | ${num(data.maxAltitudeKm, 1)} km |`,
    );
  }
  if (mission.timeline.length > 0) {
    lines.push("", "## Timeline", "", "| T+ | Event | Altitude (km) | Speed (m/s) |", "|---|---|---|---|");
    for (const p of mission.timeline) lines.push(`| ${tPlus(p.tS)} | ${p.event ?? ""} | ${num(p.altitudeKm, 1)} | ${num(p.speedMps)} |`);
  }
  const quotes = mission.timeline.filter((p) => p.quote);
  if (quotes.length > 0) {
    lines.push("", "## On the record", "");
    for (const p of quotes) lines.push(`> "${p.quote!.text}"`, `> — ${p.quote!.speaker}, ${tPlus(p.tS)} ([source](${p.quote!.source}))`, "");
  }
  if (mission.failure) lines.push("", "## What failed", "", `**${mission.failure.label}.** ${mission.failure.detail}`);
  if (report?.causeChain.length) {
    lines.push("", "## Failure chain", "");
    report.causeChain.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
  }
  if (mission.rootCause) lines.push("", "## Root cause", "", mission.rootCause);
  lines.push("", "## Corrective action", "", mission.whatChanged, "", "## Return to flight", "", mission.returnToFlight);
  if (report?.lessons.length) {
    lines.push("", "## Design lessons", "");
    for (const l of report.lessons) lines.push(`- ${l}`);
  }
  if (mission.stats.length > 0) {
    lines.push("", "## Key numbers", "");
    for (const s of mission.stats) lines.push(`- **${s.label}: ${s.value}**. ${s.meaning}`);
  }
  if (mission.sources.length > 0) {
    lines.push("", "## Sources", "");
    for (const s of mission.sources) lines.push(`- [${s.title}](${s.url})`);
  }
  return lines.join("\n") + "\n";
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="module">
      <header className="module-head">
        <h2 className="font-space text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
          <span className="mr-2 text-haze">{String(n).padStart(2, "0")}</span>
          {title}
        </h2>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

const LABEL = "text-[10px] uppercase tracking-[0.18em] text-haze";

export default function MissionReport({
  mission,
  report,
  trace,
  photos,
  onClose,
}: {
  mission: HistoricMission;
  report: ReportData | undefined;
  trace: FlightTrace;
  /** MISSION_PHOTOS[mission.id]; nothing renders when it's missing or empty. */
  photos?: MissionPhoto[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const lost = mission.outcome === "lost";
  const data = flightData(mission, trace);
  const photo = photos?.[0];
  const quotes = mission.timeline.filter((p) => p.quote);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(toMarkdown(mission, report, trace));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  let n = 0;
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black font-ui text-white" role="dialog" aria-modal="true" aria-label={`Report: ${mission.vehicle}, ${mission.mission}`}>
      <div className="sticky top-0 z-10 border-b border-rule bg-black/95 backdrop-blur">
        <div className="mx-auto flex max-w-[980px] items-center justify-between gap-4 px-6 py-3">
          <span className="font-space text-[12px] font-semibold uppercase tracking-[0.22em] text-haze">{lost ? "Mishap report" : "Flight report"}</span>
          <div className="flex gap-2">
            <button type="button" onClick={copy} className="btn-outline h-9 px-4 text-[11px]">
              {copied ? "Copied" : "Copy as Markdown"}
            </button>
            <button type="button" onClick={onClose} className="btn-solid h-9 px-4 text-[11px]">
              Close
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto flex max-w-[980px] flex-col gap-4 px-6 py-8">
        {photo && (
          <figure className="module overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote archive photo, shown as-is */}
            <img src={photo.url} alt={photo.caption} className="block max-h-[380px] w-full object-cover" />
            <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-rule px-5 py-2.5">
              <span className="text-[13px] text-white/85">{photo.caption}</span>
              <a href={photo.pageUrl} target="_blank" rel="noreferrer" className="text-[11px] text-haze underline decoration-white/20 underline-offset-4 hover:text-white">
                {photo.credit} · {photo.license}
              </a>
            </figcaption>
          </figure>
        )}

        <header className="module px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-space text-[32px] font-semibold uppercase leading-tight tracking-[0.06em]">{mission.vehicle}</h1>
              <p className="mt-1 text-[16px] text-white/85">{mission.mission}</p>
            </div>
            <span className={`border px-2.5 py-1 font-space text-[12px] font-semibold uppercase tracking-[0.2em] ${lost ? "border-nogo text-nogo" : "border-go-signal text-go-signal"}`}>
              {lost ? "Lost" : "Success"}
            </span>
          </div>
          <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 text-[14px] sm:grid-cols-2">
            <div>
              <dt className={LABEL}>Date</dt>
              <dd className="mt-0.5">{formatDate(mission.date)}</dd>
            </div>
            <div>
              <dt className={LABEL}>Site</dt>
              <dd className="mt-0.5">{mission.site}</dd>
            </div>
            {report && (
              <>
                <div>
                  <dt className={LABEL}>Objective</dt>
                  <dd className="mt-0.5">{report.objective}</dd>
                </div>
                <div>
                  <dt className={LABEL}>Payload</dt>
                  <dd className="mt-0.5">{report.payload}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className={LABEL}>Investigation</dt>
                  <dd className="mt-0.5">{report.investigation}</dd>
                </div>
              </>
            )}
          </dl>
        </header>

        {data && (
          <Section n={++n} title={lost ? "Flight data at failure" : "Flight data at end of timeline"}>
            <dl className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-5">
              {[
                { label: "Time", value: data.t },
                { label: "Altitude", value: `${num(data.altitudeKm, 1)} km` },
                { label: "Speed", value: `${num(data.speedMps)} m/s` },
                { label: "Orbital speed reached", value: `${num(data.orbitalPct)}%` },
                { label: "Max altitude", value: `${num(data.maxAltitudeKm, 1)} km` },
              ].map((d) => (
                <div key={d.label} className="flex flex-col bg-black py-2 pr-3">
                  <dt className={`${LABEL} order-2 mt-1`}>{d.label}</dt>
                  <dd className="order-1 font-space text-[24px] font-semibold tabular-nums leading-none">{d.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[12px] text-haze">Orbital speed reached is speed divided by 7,800 m/s, roughly what low Earth orbit needs.</p>
          </Section>
        )}

        {mission.timeline.length > 0 && (
          <Section n={++n} title="Timeline">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-[13px] tabular-nums">
                <thead>
                  <tr className="border-b border-rule">
                    <th scope="col" className={`${LABEL} py-2 pr-4 font-normal`}>T+</th>
                    <th scope="col" className={`${LABEL} py-2 pr-4 font-normal`}>Event</th>
                    <th scope="col" className={`${LABEL} py-2 pr-4 text-right font-normal`}>Altitude km</th>
                    <th scope="col" className={`${LABEL} py-2 text-right font-normal`}>Speed m/s</th>
                  </tr>
                </thead>
                <tbody>
                  {mission.timeline.map((p, i) => (
                    <tr key={i} className="border-b border-rule/60 last:border-0">
                      <td className="py-2 pr-4 font-mono text-white/80">{tPlus(p.tS)}</td>
                      <td className="py-2 pr-4">{p.event ?? <span className="text-haze">·</span>}</td>
                      <td className="py-2 pr-4 text-right font-mono">{num(p.altitudeKm, 1)}</td>
                      <td className="py-2 text-right font-mono">{num(p.speedMps)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {quotes.length > 0 && (
          <Section n={++n} title="On the record">
            <ul className="flex flex-col gap-4">
              {quotes.map((p, i) => (
                <li key={i} className="border-l border-white/40 pl-4">
                  <blockquote className="text-[16px] leading-snug text-white">“{p.quote!.text}”</blockquote>
                  <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 text-[12px] text-haze">
                    <span className="font-space font-semibold uppercase tracking-[0.14em] text-white/80">{p.quote!.speaker}</span>
                    <span className="font-mono">{tPlus(p.tS)}</span>
                    <a href={p.quote!.source} target="_blank" rel="noreferrer" className="underline decoration-white/20 underline-offset-4 hover:text-white">
                      {hostOf(p.quote!.source)}
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(mission.failure || report?.causeChain.length) && (
          <Section n={++n} title="Failure chain">
            {mission.failure && (
              <p className="mb-4 text-[14px] leading-snug">
                <span className="font-semibold text-nogo">{mission.failure.label}.</span> <span className="text-white/85">{mission.failure.detail}</span>
              </p>
            )}
            {report && (
              <ol className="flex flex-col">
                {report.causeChain.map((c, i) => (
                  <li key={i} className="flex flex-col items-start">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-white/50 font-mono text-[11px]">{i + 1}</span>
                      <span className="text-[14px] leading-snug text-white/90">{c}</span>
                    </div>
                    {i < report.causeChain.length - 1 && (
                      <svg aria-hidden viewBox="0 0 10 20" className="ml-[7px] h-5 w-2.5 text-white/40">
                        <path d="M5 1 V18 M1.5 14 L5 18 L8.5 14" fill="none" stroke="currentColor" strokeWidth={1.2} />
                      </svg>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {mission.rootCause && (
              <p className="mt-4 border-t border-rule pt-3 text-[14px] leading-snug text-white/85">
                <span className={`${LABEL} mr-2`}>Root cause</span>
                {mission.rootCause}
              </p>
            )}
          </Section>
        )}

        <Section n={++n} title="Corrective action and return to flight">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className={LABEL}>Corrective action</p>
              <p className="mt-1 text-[14px] leading-snug text-white/90">{mission.whatChanged}</p>
            </div>
            <div>
              <p className={LABEL}>Return to flight</p>
              <p className="mt-1 text-[14px] leading-snug text-go-signal">{mission.returnToFlight}</p>
            </div>
          </div>
        </Section>

        {report && report.lessons.length > 0 && (
          <Section n={++n} title="Design lessons">
            <ul className="flex flex-col gap-2">
              {report.lessons.map((l, i) => (
                <li key={i} className="flex gap-3 text-[14px] leading-snug text-white/90">
                  <span aria-hidden className="mt-2 h-px w-3 shrink-0 bg-white/60" />
                  {l}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {mission.stats.length > 0 && (
          <Section n={++n} title="Key numbers">
            <dl className="grid gap-px bg-rule sm:grid-cols-2">
              {mission.stats.map((s) => (
                <div key={s.label} className="flex flex-col bg-black py-3 pr-4">
                  <dt className={`${LABEL} order-2 mt-1`}>{s.label}</dt>
                  <dd className="order-1 font-space text-[22px] font-semibold tabular-nums leading-none">{s.value}</dd>
                  <dd className="order-3 mt-1.5 text-[13px] leading-snug text-white/75">{s.meaning}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {mission.sources.length > 0 && (
          <Section n={++n} title="Sources">
            <ul className="flex flex-col gap-1.5">
              {mission.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-[13px] text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </main>
    </div>
  );
}
