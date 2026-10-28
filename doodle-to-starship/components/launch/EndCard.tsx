"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import MissionReport from "@/components/MissionReport";
import { MISSION_PHOTOS } from "@/lib/mission-photos";
import { comebackSource, historicTrace } from "@/lib/history";
import { MISSION_REPORTS } from "@/lib/mission-reports";
import {
  NAPKIN_ASPECT,
  type Analysis,
  type Design,
  type DesignAction,
  type DestinationId,
  type FlightTrace,
  type Improvement,
  type Recap,
  type HistoricMission,
  type Stroke,
  type Verdict,
} from "@/lib/design";
import { launchRecord } from "@/lib/presets";
import { fmtKm } from "./plan";

interface EndCardProps {
  outcome: Verdict;
  design: Design;
  analysis: Analysis;
  maxAltKm: number;
  maxSpeedMps: number;
  strokes: Stroke[];
  /** Caption on the sketch: "Napkin sketch", or the rocket's name for a real-rocket template. */
  sketchLabel: string;
  onDone: () => void;
  onReplay: () => void;
  /** What to try next; the studio computes it from the attempt history. */
  recap?: Recap | null;
  /** Applies an improvement's fix, re-checks and relaunches. */
  onImprove?: (fix: DesignAction) => void;
  /** Set when the vehicle broke up in flight. */
  lostAt?: { tS: number; altKm: number } | null;
  /** A real flight from history: the card becomes its debrief. */
  mission?: HistoricMission | null;
  /** Lost missions with a comeback: apply the real fix and fly again. */
  onFixRetry?: () => void;
  trace: FlightTrace;
}

/** Same names the studio's "Where it can go" list uses. */
const TARGET: Record<DestinationId, string> = {
  leo: "Low Earth orbit",
  gto: "Geo transfer orbit",
  "moon-orbit": "Lunar orbit",
  "moon-surface": "Moon surface",
  "mars-transfer": "Mars transfer",
  "mars-surface": "Mars surface",
  europa: "Europa",
};

const SHORT: Record<DestinationId, string> = {
  leo: "orbit",
  gto: "GTO",
  "moon-orbit": "the Moon",
  "moon-surface": "the Moon",
  "mars-transfer": "Mars",
  "mars-surface": "Mars",
  europa: "Europa",
};

const kms = (mps: number) => (Math.abs(mps) / 1000).toFixed(1);

function verdictCopy({ outcome, design, analysis, maxAltKm, lostAt }: EndCardProps): { go: boolean; headline: string; line: string } {
  if (lostAt) {
    const s = Math.max(0, Math.round(lostAt.tS));
    return {
      go: false,
      headline: "Vehicle lost in flight",
      line: `Broke up at T+${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}, ${fmtKm(lostAt.altKm)} km up.`,
    };
  }
  const dest = design.destination;
  const budget = `${kms(analysis.totalDeltaVMps)} of ${kms(analysis.requiredDeltaVMps)} km/s`;
  const margin = analysis.marginMps;
  const history = launchRecord(design.name);
  switch (outcome) {
    case "destination":
      return {
        go: true,
        headline: dest === "leo" ? "In orbit" : `Made it to ${SHORT[dest]}`,
        line: history ?? `${budget}, ${kms(margin)} km/s to spare.`,
      };
    case "orbit":
      return dest === "leo"
        ? { go: true, headline: "In orbit", line: history ?? `${budget}, ${kms(margin)} km/s to spare.` }
        : { go: false, headline: `Reaches orbit, not ${SHORT[dest]}`, line: history ?? `${budget}: ${kms(margin)} km/s short.` };
    case "suborbital":
      return {
        go: false,
        headline: "Falls back to Earth",
        line: history ?? `Apogee ${fmtKm(maxAltKm)} km, then a rapid unscheduled disassembly. ${budget}.`,
      };
    default:
      return {
        go: false,
        headline: "Never left the pad",
        line: history ?? `Liftoff thrust-to-weight is ${analysis.liftoffTwr.toFixed(2)}; it has to beat 1.`,
      };
  }
}

export default function EndCard(props: EndCardProps) {
  if (props.mission) return <Debrief {...props} mission={props.mission} />;
  const { design, analysis, maxAltKm, maxSpeedMps, strokes, sketchLabel, onDone, onReplay, recap, onImprove } = props;
  const { go, headline, line } = verdictCopy(props);
  const findings = (analysis.findings ?? []).slice(0, 3);
  const improvements = (recap?.improvements ?? []).slice(0, 3);
  const fixable = (i: Improvement): i is Improvement & { fix: DesignAction } => !!i.fix && !!onImprove;
  const lead = improvements.find(fixable);

  return (
    <div className="ls-fade absolute inset-0 flex items-start justify-center overflow-y-auto bg-umbra/70 px-4 py-8 backdrop-blur-[3px] sm:items-center">
      <div className="ls-rise w-full max-w-3xl overflow-hidden rounded-[3px] border border-rule bg-panel text-starlight shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        <div className="grid sm:grid-cols-[minmax(0,16rem)_1fr]">
          <SketchFrame strokes={strokes} name={design.name} label={sketchLabel} />
          <div className="flex min-w-0 flex-col justify-center p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-[3px] px-2 py-0.5 font-display text-sm font-semibold uppercase tracking-[0.14em] ${go ? "bg-go-signal/15 text-go-signal" : "bg-nogo/15 text-nogo"}`}
              >
                {go ? "Go" : "No go"}
              </span>
              <span className="text-sm text-haze">Target: {TARGET[design.destination] ?? design.destination}</span>
            </div>
            <h2 className="mt-3 font-display text-[32px] font-semibold uppercase leading-tight tracking-[0.04em]">{headline}</h2>
            <p className="mt-1 text-sm text-haze">{line}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px border-t border-rule bg-rule sm:grid-cols-4">
          <Stat label="Max altitude" value={fmtKm(maxAltKm)} unit="km" />
          <Stat label="Max speed" value={Math.round(maxSpeedMps).toLocaleString("en-US")} unit="m/s" />
          <Stat label="Delta-v" value={`${kms(analysis.totalDeltaVMps)} / ${kms(analysis.requiredDeltaVMps)}`} unit="km/s" />
          <Stat label="Thrust-to-weight" value={analysis.liftoffTwr.toFixed(2)} />
        </dl>

        {recap ? (
          <section className="border-t border-rule px-5 py-4 sm:px-7" aria-label="Recap">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="font-display text-base font-semibold uppercase tracking-[0.08em]">{recap.headline}</h3>
              {recap.delta && <span className="text-sm text-haze">{recap.delta}</span>}
            </div>
            {improvements.length > 0 && (
              <ul className="mt-3 space-y-2">
                {improvements.map((imp) =>
                  fixable(imp) ? (
                    <li key={imp.text}>
                      <button
                        type="button"
                        autoFocus={imp === lead}
                        onClick={() => onImprove?.(imp.fix)}
                        className={`group flex w-full items-center justify-between gap-4 rounded-[3px] border px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                          imp === lead
                            ? "border-starlight bg-starlight text-umbra hover:opacity-90"
                            : "border-rule text-starlight hover:border-starlight"
                        }`}
                      >
                        <span>{imp.text}</span>
                        <span className="shrink-0 font-display text-xs uppercase tracking-[0.14em] opacity-80">
                          Apply &amp; fly again →
                        </span>
                      </button>
                    </li>
                  ) : (
                    <li key={imp.text} className="flex gap-2 text-sm text-haze">
                      <span className="text-rule">—</span>
                      <span>{imp.text}</span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>
        ) : findings.length > 0 && (
          <ul className="space-y-1 border-t border-rule px-5 py-4 text-sm leading-snug text-haze sm:px-7">
            {findings.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="text-rule">—</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-rule px-5 py-4 sm:px-7">
          <button
            type="button"
            autoFocus={!lead}
            onClick={onDone}
            className={
              lead
                ? "rounded-[3px] border border-rule px-4 py-2 text-sm font-semibold text-starlight transition-colors hover:border-starlight"
                : "rounded-[3px] border border-starlight bg-starlight px-4 py-2 text-sm font-semibold text-umbra transition-opacity hover:opacity-90"
            }
          >
            Back to the napkin
          </button>
          <button
            type="button"
            onClick={onReplay}
            className="rounded-[3px] border border-rule px-4 py-2 text-sm font-semibold text-starlight transition-colors hover:border-starlight"
          >
            Fly again
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-panel px-5 py-3 sm:px-7">
      <dt className="text-xs text-haze">{label}</dt>
      <dd className="mt-0.5 font-display text-2xl font-semibold">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-haze">{unit}</span>}
      </dd>
    </div>
  );
}

/** The user's own doodle in chalk on night. */
function SketchView({ strokes, name }: { strokes: Stroke[]; name: string }) {
  const lines = strokes.map((s) => s.points.map(([x, y]) => [x * NAPKIN_ASPECT, y] as const)).filter((l) => l.length > 0);
  const xs = lines.flat().map((p) => p[0]);
  const ys = lines.flat().map((p) => p[1]);
  if (xs.length === 0) return null;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = Math.max(maxX - minX, maxY - minY) * 0.12 + 0.01;
  // Same curve-through-midpoints smoothing as the napkin's pencil.
  const d = lines
    .map((l) => {
      let path = `M${l[0][0].toFixed(4)} ${l[0][1].toFixed(4)}`;
      for (let i = 1; i < l.length - 1; i++) {
        const mx = (l[i][0] + l[i + 1][0]) / 2;
        const my = (l[i][1] + l[i + 1][1]) / 2;
        path += ` Q${l[i][0].toFixed(4)} ${l[i][1].toFixed(4)} ${mx.toFixed(4)} ${my.toFixed(4)}`;
      }
      const end = l[l.length - 1];
      return `${path} L${end[0].toFixed(4)} ${end[1].toFixed(4)}`;
    })
    .join(" ");
  return (
    <svg
      role="img"
      aria-label={`${name}, as sketched`}
      viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      className="ls-fade absolute inset-0 h-full w-full p-4"
    >
      <path d={d} fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SketchFrame({ strokes, name, label }: { strokes: Stroke[]; name: string; label: string }) {
  return (
    <figure className="relative border-b border-rule sm:border-b-0 sm:border-r">
      <div className="relative aspect-[4/3] h-full w-full overflow-hidden sm:aspect-auto sm:min-h-[16rem]">
        <SketchView strokes={strokes} name={name} />
      </div>
      <figcaption className="absolute left-3 top-3 rounded-[3px] bg-umbra/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-haze">
        {label}
      </figcaption>
    </figure>
  );
}

/** Mission mode: what happened on the real flight, what changed, and how it came back. */
function Debrief({ mission, strokes, sketchLabel, design, onDone, onFixRetry, trace }: EndCardProps & { mission: HistoricMission }) {
  const lost = mission.outcome === "lost";
  const retry = lost && onFixRetry ? onFixRetry : null;
  // Real recorded dialog from the flight, in order.
  const quotes = mission.timeline.flatMap((e) => (e.quote ? [{ tS: e.tS, quote: e.quote }] : []));
  const missionClock = (tS: number) => {
    const sec = Math.max(0, Math.round(tS));
    return `T+${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  };
  const [showReport, setShowReport] = useState(false);
  const closeReport = useCallback(() => setShowReport(false), [setShowReport]);
  // A comeback's debrief offers the report on the flight it came back from.
  const reportMission = comebackSource(mission) ?? mission;
  const report = MISSION_REPORTS[reportMission.id];
  // Photos from the real flight (Wikimedia Commons), when there are any.
  const photos = (MISSION_PHOTOS[mission.id] ?? []).slice(0, 2);
  const section = "border-t border-rule px-5 py-3 sm:px-7";
  const label = "text-[11px] font-semibold uppercase tracking-[0.2em] text-haze";
  return (
    <div className="ls-fade absolute inset-0 flex items-start justify-center overflow-y-auto bg-umbra/75 px-4 py-8 backdrop-blur-[3px] sm:items-center">
      <div className="ls-rise w-full max-w-3xl overflow-hidden rounded-[3px] border border-rule bg-panel text-starlight shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        {photos.length > 0 && (
          <div className={`grid gap-px border-b border-rule bg-rule ${photos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {photos.map((ph) => (
              <a key={ph.url} href={ph.pageUrl} target="_blank" rel="noopener noreferrer" className="relative block bg-panel">
                {/* Wikimedia images are remote; next/image would need them allow-listed. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.url} alt={ph.caption} loading="lazy" className="h-40 w-full object-cover sm:h-48" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-6">
                  <div className="text-xs text-starlight">{ph.caption}</div>
                  <div className="text-[10px] text-haze">
                    {ph.credit} · {ph.license}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
        <div className="grid sm:grid-cols-[minmax(0,14rem)_1fr]">
          <SketchFrame strokes={strokes} name={design.name} label={sketchLabel} />
          <div className="flex min-w-0 flex-col justify-center p-5 sm:p-7">
            <div className="text-sm text-haze">
              {mission.vehicle} · {mission.mission} · {mission.date} · {mission.site}
            </div>
            <h2
              className={`mt-2 font-display text-[44px] font-semibold uppercase leading-none tracking-[0.06em] ${lost ? "text-nogo" : "text-go-signal"}`}
            >
              {lost ? "Lost" : "Success"}
            </h2>
          </div>
        </div>
        {(mission.failure || mission.rootCause) && (
          <section className={section}>
            <div className={label}>{lost ? "What failed" : "What went right"}</div>
            {mission.failure &&
              (lost ? (
                <div className="mt-1 font-display text-lg font-semibold uppercase tracking-[0.04em]">{mission.failure.label}</div>
              ) : (
                <div className="mt-1 text-xs text-haze">Anomaly: {mission.failure.label}</div>
              ))}
            <p className="mt-1 text-sm leading-snug text-starlight/85">{mission.rootCause}</p>
          </section>
        )}
        <section className={section}>
          <div className={label}>{lost ? "What SpaceX changed" : "What it proved"}</div>
          <p className="mt-1 text-sm leading-snug text-starlight/85">{mission.whatChanged}</p>
        </section>
        <section className={section}>
          <div className={label}>Return to flight</div>
          <p className="mt-1 flex gap-2 text-sm leading-snug text-starlight">
            <span className="text-go-signal">✓</span>
            <span>{mission.returnToFlight}</span>
          </p>
        </section>
        {quotes.length > 0 && (
          <section className={section}>
            <div className={label}>On the record</div>
            <ul className="mt-2 space-y-3">
              {quotes.map(({ tS, quote }) => (
                <li key={`${tS}-${quote.speaker}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-haze">
                    {quote.speaker} · {missionClock(tS)}
                  </div>
                  <blockquote className="mt-0.5 text-lg leading-snug text-starlight">“{quote.text}”</blockquote>
                  {/^https?:\/\//.test(quote.source) ? (
                    <a
                      href={quote.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-haze underline-offset-2 hover:text-starlight hover:underline"
                    >
                      Source
                    </a>
                  ) : (
                    <div className="text-[11px] text-haze">{quote.source}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {mission.stats.length > 0 && (
          <dl className="grid gap-px border-t border-rule bg-rule sm:grid-cols-3">
            {mission.stats.slice(0, 3).map((st) => (
              <div key={st.label} className="bg-panel px-5 py-3 sm:px-7">
                <dt className="text-xs text-haze">{st.label}</dt>
                <dd className="mt-0.5 font-display text-2xl font-semibold">{st.value}</dd>
                <dd className="text-xs leading-snug text-haze">{st.meaning}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-5 py-4 sm:px-7">
          <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[11px] text-haze">
            {mission.sources.slice(0, 4).map((src) => (
              <a key={src.url} href={src.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-starlight hover:underline">
                {src.title}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <button
                type="button"
                onClick={() => setShowReport(true)}
                className="rounded-[3px] border border-rule px-4 py-2 text-sm font-semibold text-starlight transition-colors hover:border-starlight"
              >
                Full report
              </button>
            )}
            <button
              type="button"
              autoFocus={!retry}
              onClick={onDone}
              className={
                retry
                  ? "rounded-[3px] border border-rule px-4 py-2 text-sm font-semibold text-starlight transition-colors hover:border-starlight"
                  : "rounded-[3px] border border-starlight bg-starlight px-4 py-2 text-sm font-semibold text-umbra transition-opacity hover:opacity-90"
              }
            >
              Try another mission
            </button>
            {retry && (
              <button
                type="button"
                autoFocus
                onClick={retry}
                className="rounded-[3px] border border-starlight bg-starlight px-4 py-2 text-sm font-semibold text-umbra transition-opacity hover:opacity-90"
              >
                Fix it &amp; fly again →
              </button>
            )}
          </div>
          {/* Portaled out of the card: its transform would otherwise trap and clip the fixed report. */}
          {showReport &&
            createPortal(
              <MissionReport
                mission={reportMission}
                report={report}
                trace={reportMission === mission ? trace : historicTrace(reportMission)}
                photos={MISSION_PHOTOS[reportMission.id]}
                onClose={closeReport}
              />,
              document.body,
            )}
        </div>
      </div>
    </div>
  );
}
