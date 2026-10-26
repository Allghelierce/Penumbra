"use client";

import { useState } from "react";
import {
  NAPKIN_ASPECT,
  type Analysis,
  type Design,
  type DesignAction,
  type DestinationId,
  type Improvement,
  type Recap,
  type Stroke,
  type Verdict,
} from "@/lib/design";
import { launchRecord } from "@/lib/presets";
import { fmtKm } from "./plan";
import type { ReplayState } from "./useReplay";

interface EndCardProps {
  outcome: Verdict;
  design: Design;
  analysis: Analysis;
  maxAltKm: number;
  maxSpeedMps: number;
  renderUrl: string | null;
  /** False once we know no render is coming: the frame shows the sketch instead. */
  renderPending: boolean;
  strokes: Stroke[];
  video: ReplayState;
  onVideo: () => void;
  onDone: () => void;
  onReplay: () => void;
  /** What to try next; the studio computes it from the attempt history. */
  recap?: Recap | null;
  /** Applies an improvement's fix, re-checks and relaunches. */
  onImprove?: (fix: DesignAction) => void;
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

function verdictCopy({ outcome, design, analysis, maxAltKm }: EndCardProps): { go: boolean; headline: string; line: string } {
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
  const { design, analysis, maxAltKm, maxSpeedMps, renderUrl, renderPending, strokes, video, onVideo, onDone, onReplay, recap, onImprove } =
    props;
  const { go, headline, line } = verdictCopy(props);
  const findings = (analysis.findings ?? []).slice(0, 3);
  const improvements = (recap?.improvements ?? []).slice(0, 3);
  const fixable = (i: Improvement): i is Improvement & { fix: DesignAction } => !!i.fix && !!onImprove;
  const lead = improvements.find(fixable);

  return (
    <div className="ls-fade absolute inset-0 flex items-start justify-center overflow-y-auto bg-umbra/70 px-4 py-8 backdrop-blur-[3px] sm:items-center">
      <div className="ls-rise w-full max-w-3xl overflow-hidden rounded-[3px] border border-rule bg-panel text-starlight shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        <div className="grid sm:grid-cols-[minmax(0,16rem)_1fr]">
          <RenderFrame url={renderUrl} pending={renderPending} strokes={strokes} name={design.name} video={video} />
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
          {renderUrl && <VideoButton video={video} onVideo={onVideo} />}
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

/** Starts the Grok Imagine mission replay (a paid job, so only on click) and shows its progress. */
function VideoButton({ video, onVideo }: { video: ReplayState; onVideo: () => void }) {
  const base = "rounded-[3px] border border-rule px-4 py-2 text-sm font-semibold";
  switch (video.phase) {
    case "idle":
      return (
        <button type="button" onClick={onVideo} className={`${base} text-starlight transition-colors hover:border-haze`}>
          ▶ Mission replay
        </button>
      );
    case "pending":
      return (
        <span className={`${base} ls-pending text-haze`} aria-live="polite">
          Developing replay{video.progress !== null ? ` ${Math.round(video.progress)}%` : "…"}
        </span>
      );
    case "failed":
      return (
        <button type="button" onClick={onVideo} className={`${base} text-nogo transition-colors hover:border-nogo`}>
          Replay failed · retry
        </button>
      );
    case "unavailable":
      return <span className="text-xs text-haze">Replay unavailable</span>;
    default:
      return null;
  }
}

/** The user's own doodle in chalk on night, for when there's no render to show. */
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

function RenderFrame({
  url,
  pending,
  strokes,
  name,
  video,
}: {
  url: string | null;
  pending: boolean;
  strokes: Stroke[];
  name: string;
  video: ReplayState;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const show = url !== null && failed !== url;
  const playing = video.phase === "done";
  const sketch = !playing && !show && (!pending || (url !== null && failed === url));
  return (
    <figure className="relative border-b border-rule sm:border-b-0 sm:border-r">
      <div className="relative aspect-[4/3] h-full w-full overflow-hidden bg-night sm:aspect-auto sm:min-h-[16rem]">
        {playing ? (
          <video
            key={video.url}
            src={video.url}
            autoPlay
            muted
            loop
            playsInline
            aria-label={`Grok Imagine mission replay of ${name}`}
            className="ls-fade absolute inset-0 h-full w-full object-cover"
          />
        ) : show ? (
          // Grok Imagine URLs are remote and short-lived; next/image would need them allow-listed.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={`Grok Imagine render of ${name}`}
            className="ls-fade absolute inset-0 h-full w-full object-cover"
            onError={() => setFailed(url)}
          />
        ) : sketch ? (
          <SketchView strokes={strokes} name={name} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.03)_0_10px,transparent_10px_20px)]">
            <span className="ls-pending text-xs font-semibold uppercase tracking-[0.18em] text-haze">Render pending</span>
          </div>
        )}
      </div>
      <figcaption className="absolute left-3 top-3 rounded-[3px] bg-umbra/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-haze">
        {playing ? "Grok Imagine replay" : sketch ? "Napkin sketch" : "Grok Imagine render"}
      </figcaption>
    </figure>
  );
}
