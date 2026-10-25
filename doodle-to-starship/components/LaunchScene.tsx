"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Analysis, FlightEvent, FlightTrace, SketchReading, Stroke } from "@/lib/design";
import EndCard from "./launch/EndCard";
import { flightStats, startLaunch, type LaunchHandle } from "./launch/engine";
import type { CaptionCue, Finale, Tone } from "./launch/plan";
import { useReplay, type ReplayState } from "./launch/useReplay";

export interface LaunchSceneProps {
  /** The user's drawing, normalized 0..1, aspect NAPKIN_ASPECT (3:4). */
  strokes: Stroke[];
  /** Design + parts (parts may carry stageIndex and boxes). */
  reading: SketchReading;
  analysis: Analysis;
  /** From simulateFlight() in @/lib/physics. */
  trace: FlightTrace;
  /** Grok Imagine outcome image; may arrive late or never. */
  renderUrl: string | null;
  /** Fired as each trace event plays. */
  onEvent?: (e: FlightEvent) => void;
  /** "Back to the napkin". */
  onDone: () => void;
}

const TONE: Record<Tone, string> = {
  chalk: "text-[#f6f3ea] [text-shadow:0_0_18px_rgba(190,215,255,0.55)]",
  flame: "text-flame-hot [text-shadow:0_0_22px_rgba(255,90,31,0.75)]",
  red: "text-redpen [text-shadow:0_0_22px_rgba(214,45,32,0.7),0_0_2px_rgba(255,255,255,0.4)]",
  go: "text-[#f6f3ea] [text-shadow:0_0_24px_rgba(46,125,50,0.9)]",
};

const KEYFRAMES = `
@keyframes ls-caption {
  0% { opacity: 0; transform: translate(-50%, 14px) rotate(-4deg) scale(0.9); }
  10% { opacity: 1; transform: translate(-50%, 0) rotate(-2.5deg) scale(1); }
  78% { opacity: 1; transform: translate(-50%, -4px) rotate(-2.5deg) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -14px) rotate(-2deg) scale(1.03); }
}
.ls-caption { animation: ls-caption 2.6s ease-out forwards; }
@keyframes ls-write {
  from { clip-path: inset(-30% 100% -30% -5%); }
  to { clip-path: inset(-30% -5% -30% -5%); }
}
.ls-write { animation: ls-write 0.9s cubic-bezier(.3,.7,.2,1) both; }
@keyframes ls-rise {
  from { opacity: 0; transform: translateY(28px) rotate(-1.5deg); }
  to { opacity: 1; transform: translateY(0) rotate(-0.6deg); }
}
.ls-rise { animation: ls-rise 0.7s cubic-bezier(.2,.8,.2,1) both; }
@keyframes ls-fade { from { opacity: 0; } to { opacity: 1; } }
.ls-fade { animation: ls-fade 0.6s ease-out both; }
@keyframes ls-pending { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.9; } }
.ls-pending { animation: ls-pending 1.8s ease-in-out infinite; }
`;

/**
 * Full-screen launch: the napkin doodle turns to chalk on a night sky and flies the
 * physics trace, failing exactly where the trace says. Reads its data once on mount;
 * remount it (change `key`) to fly a different trace.
 */
export default function LaunchScene(props: LaunchSceneProps) {
  const [run, setRun] = useState(0);
  // Lives out here so a paid video job survives "fly again".
  const replay = useReplay(props.renderUrl, props.trace.outcome ?? props.analysis.verdict);
  return (
    <LaunchRun
      key={run}
      {...props}
      video={replay.state}
      onVideo={replay.start}
      onReplay={() => setRun((r) => r + 1)}
    />
  );
}

function LaunchRun(props: LaunchSceneProps & { video: ReplayState; onVideo: () => void; onReplay: () => void }) {
  const [input] = useState(() => ({
    strokes: props.strokes,
    reading: props.reading,
    analysis: props.analysis,
    trace: props.trace,
  }));
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const handle = useRef<LaunchHandle | null>(null);
  const [caption, setCaption] = useState<(CaptionCue & { id: number }) | null>(null);
  const [finale, setFinale] = useState<Finale | null>(null);
  const [ended, setEnded] = useState(false);
  const stats = useMemo(() => flightStats(input.trace), [input]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const h = startLaunch(canvas, hudRef.current, input, {
      onCaption: setCaption,
      onFinale: setFinale,
      onEnd: () => setEnded(true),
      onEvent: (e) => latest.current.onEvent?.(e),
    });
    handle.current = h;
    return () => {
      h.stop();
      handle.current = null;
    };
  }, [input]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handle.current?.skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const outcome = input.trace.outcome ?? input.analysis.verdict;

  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden bg-table" role="dialog" aria-modal="true" aria-label="Launch">
      <style>{KEYFRAMES}</style>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute left-4 top-4 sm:left-6 sm:top-5">
        <div
          ref={hudRef}
          aria-live="off"
          className="font-mono text-[11px] tracking-wide text-white/85 opacity-0 transition-opacity duration-500 sm:text-sm"
        />
        <div className="ls-fade mt-1 font-mono text-[11px] uppercase tracking-widest text-white/40 [animation-delay:1.4s]">
          {input.reading.design.name}
        </div>
      </div>

      {caption && !ended && (
        <div key={caption.id} className="ls-caption pointer-events-none absolute left-1/2 top-[14%] max-w-[90vw] text-center">
          <div className={`font-hand text-6xl leading-none sm:text-8xl ${TONE[caption.tone]}`}>{caption.text}</div>
          {caption.sub && (
            <div className="mx-auto mt-3 max-w-xl font-mono text-[11px] leading-relaxed text-white/60 sm:text-xs">{caption.sub}</div>
          )}
        </div>
      )}

      {finale && !ended && (
        <div className="pointer-events-none absolute inset-x-0 top-[9%] flex justify-center px-4">
          <div
            className={`ls-write whitespace-nowrap font-hand text-[min(22vw,26vh,12rem)] leading-none ${TONE[finale.ok ? "chalk" : "red"]}`}
          >
            {finale.text}
            {finale.ok && <span className="ml-[0.2em] text-[color-mix(in_srgb,var(--go)_55%,white)]">✓</span>}
          </div>
        </div>
      )}

      {!ended && (
        <button
          type="button"
          onClick={() => handle.current?.skip()}
          className="absolute bottom-5 right-4 font-mono text-xs uppercase tracking-widest text-white/45 transition-colors hover:text-white sm:bottom-auto sm:right-6 sm:top-5"
        >
          skip ›
        </button>
      )}

      {ended && (
        <EndCard
          outcome={outcome}
          design={input.reading.design}
          analysis={input.analysis}
          maxAltKm={stats.maxAltKm}
          maxSpeedMps={stats.maxSpeedMps}
          renderUrl={props.renderUrl}
          video={props.video}
          onVideo={props.onVideo}
          onDone={props.onDone}
          onReplay={props.onReplay}
        />
      )}
    </div>
  );
}
