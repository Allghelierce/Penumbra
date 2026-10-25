"use client";

import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import type { Analysis, FlightEvent, FlightEventKind, FlightTrace, SketchReading, Stroke } from "@/lib/design";
import { createLaunchAudio, isLaunchAudioMuted, setLaunchAudioMuted, unlockLaunchAudio } from "./launch/audio";
import EndCard from "./launch/EndCard";
import { flightStats, planFor, startLaunch, type LaunchHandle, type NapkinRect } from "./launch/engine";
import type { CaptionCue, Finale, Plan, Tone } from "./launch/plan";
import { useReplay, type ReplayState } from "./launch/useReplay";

// The narrator can share the launch's mission-control tones, and the LAUNCH button
// should call unlockLaunchAudio() in its click handler so sound can start (Safari).
export { playQuindar, unlockLaunchAudio } from "./launch/audio";

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
  /**
   * Optional: the napkin canvas's on-screen box (getBoundingClientRect()), so the doodle
   * starts exactly where it was drawn. Without it the scene starts from a centered 3:4 box.
   */
  napkinRect?: NapkinRect | null;
}

const TONE: Record<Tone, string> = {
  chalk: "text-starlight",
  flame: "text-flame-hot",
  red: "text-nogo",
  go: "text-go-signal",
};

/** Keeps light type readable over flames and stars. */
const LIFT = "[text-shadow:0_0_28px_rgba(5,7,13,0.95),0_1px_2px_rgba(5,7,13,0.9)]";

const KEYFRAMES = `
@keyframes ls-caption {
  0% { opacity: 0; transform: translate(-50%, 10px); }
  10% { opacity: 1; transform: translate(-50%, 0); }
  80% { opacity: 1; transform: translate(-50%, -2px); }
  100% { opacity: 0; transform: translate(-50%, -8px); }
}
.ls-caption { animation: ls-caption 2.6s ease-out forwards; }
@keyframes ls-write {
  from { clip-path: inset(-30% 100% -30% -5%); }
  to { clip-path: inset(-30% -5% -30% -5%); }
}
.ls-write { animation: ls-write 0.8s cubic-bezier(.3,.7,.2,1) both; }
@keyframes ls-rise {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.ls-rise { animation: ls-rise 0.6s cubic-bezier(.2,.8,.2,1) both; }
@keyframes ls-fade { from { opacity: 0; } to { opacity: 1; } }
.ls-fade { animation: ls-fade 0.6s ease-out both; }
@keyframes ls-pending { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.9; } }
.ls-pending { animation: ls-pending 1.8s ease-in-out infinite; }
`;

const MARK_LABEL: Partial<Record<FlightEventKind, string>> = {
  "max-q": "Max-Q",
  "stage-sep": "Stage sep",
  "fuel-exhausted": "Fuel out",
  apogee: "Apogee",
  impact: "Impact",
  orbit: "Orbit",
};

interface Mark {
  at: number;
  label: string;
  low: boolean;
}

/** Webcast-style milestones along the flight, 0..1 from liftoff to the finale. */
function milestones(plan: Plan): Mark[] {
  if (plan.liftoffAt === null) return [];
  const span = plan.finaleAt - plan.liftoffAt;
  const marks: Mark[] = [];
  let seps = 0;
  for (const c of plan.cues) {
    const k = c.event.kind;
    const label = k === "engine-cutoff" ? (seps > 0 ? "SECO" : "MECO") : MARK_LABEL[k];
    if (k === "stage-sep") seps++;
    const at = (c.at - plan.liftoffAt) / span;
    if (!label || at < 0 || at > 1.001) continue;
    // Two events at the same moment (cutoff + separation, cutoff + orbit): keep the later one.
    if (marks.length && at - marks[marks.length - 1].at < 0.015) marks.pop();
    const prev = marks[marks.length - 1];
    marks.push({ at: Math.min(1, at), label, low: prev ? at - prev.at < 0.1 && !prev.low : false });
  }
  return marks;
}

/**
 * Full-screen launch: the napkin doodle turns to chalk on a night sky and flies the
 * physics trace, failing exactly where the trace says. Reads its data once on mount;
 * remount it (change `key`) to fly a different trace.
 */
export default function LaunchScene(props: LaunchSceneProps) {
  const [run, setRun] = useState(0);
  const [muted, setMuted] = useState(isLaunchAudioMuted);
  // Lives out here so a paid video job survives "fly again".
  const replay = useReplay(props.renderUrl, props.trace.outcome ?? props.analysis.verdict);
  return (
    <LaunchRun
      key={run}
      {...props}
      video={replay.state}
      onVideo={replay.start}
      onReplay={() => setRun((r) => r + 1)}
      muted={muted}
      onMute={() => {
        unlockLaunchAudio();
        setLaunchAudioMuted(!muted);
        setMuted(!muted);
      }}
    />
  );
}

interface RunProps extends LaunchSceneProps {
  video: ReplayState;
  onVideo: () => void;
  onReplay: () => void;
  muted: boolean;
  onMute: () => void;
}

function LaunchRun(props: RunProps) {
  const [input] = useState(() => ({
    napkinRect: props.napkinRect,
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
  const clockRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const handle = useRef<LaunchHandle | null>(null);
  const [caption, setCaption] = useState<(CaptionCue & { id: number }) | null>(null);
  const [finale, setFinale] = useState<Finale | null>(null);
  const [ended, setEnded] = useState(false);
  const stats = useMemo(() => flightStats(input.trace), [input]);
  const marks = useMemo(() => milestones(planFor(input)), [input]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sound = createLaunchAudio();
    const hud = {
      root: hudRef.current,
      clock: clockRef.current,
      speed: speedRef.current,
      alt: altRef.current,
      stage: stageRef.current,
      fill: fillRef.current,
      marks: [...(timelineRef.current?.querySelectorAll<HTMLElement>("[data-at]") ?? [])],
    };
    const h = startLaunch(canvas, hud, input, {
      onCaption: setCaption,
      onFinale: setFinale,
      onEnd: () => setEnded(true),
      onEvent: (e) => latest.current.onEvent?.(e),
      sound,
    });
    handle.current = h;
    return () => {
      h.stop();
      sound.stop();
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
  const control = "transition-colors hover:text-starlight";

  return (
    <div
      className={`fixed inset-0 z-50 select-none overflow-hidden font-ui text-starlight ${input.napkinRect ? "" : "bg-table"}`}
      role="dialog"
      aria-modal="true"
      aria-label="Launch"
      onPointerDown={() => unlockLaunchAudio()}
    >
      <style>{KEYFRAMES}</style>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="ls-fade pointer-events-none absolute left-4 top-4 flex items-center gap-3 [animation-delay:1.2s] sm:left-6 sm:top-5">
        <span className="font-display text-sm font-semibold uppercase tracking-[0.22em]">Penumbra</span>
        <span className="h-3 w-px bg-white/25" />
        <span className="max-w-[40vw] truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-haze">
          {input.reading.design.name}
        </span>
      </div>

      {!ended && (
        <div className="absolute right-4 top-4 flex items-center gap-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-haze sm:right-6 sm:top-5">
          <button type="button" onClick={props.onMute} aria-pressed={props.muted} className={control}>
            {props.muted ? "Sound off" : "Sound on"}
          </button>
          <button type="button" onClick={() => handle.current?.skip()} className={control}>
            Skip ›
          </button>
        </div>
      )}

      <div
        ref={hudRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-night/80 to-transparent opacity-0 transition-opacity duration-700"
      >
        <div className="flex items-end gap-6 px-4 pb-4 pt-12 sm:gap-10 sm:px-6 sm:pb-5">
          <div className="flex gap-5 sm:gap-8">
            <Readout label="Speed" unit="m/s" valueRef={speedRef} />
            <Readout label="Altitude" unit="km" valueRef={altRef} />
          </div>
          {marks.length > 0 && (
            <div ref={timelineRef} className="relative mb-3 hidden h-10 flex-1 sm:block">
              <div className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
              <div ref={fillRef} className="absolute inset-x-0 top-1/2 h-px origin-left scale-x-0 bg-starlight" />
              {marks.map((m) => (
                <div key={`${m.label}-${m.at}`} data-at={m.at} className="group absolute top-1/2" style={{ left: `${m.at * 100}%` }}>
                  <div className="-ml-1 -mt-1 h-2 w-2 rounded-full border border-white/50 bg-night transition-colors duration-300 group-data-[passed=1]:border-starlight group-data-[passed=1]:bg-starlight" />
                  <div
                    className={`absolute left-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-haze transition-colors duration-300 group-data-[passed=1]:text-starlight ${m.low ? "top-2.5" : "bottom-2.5"}`}
                  >
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="ml-auto text-right">
            <div ref={clockRef} className={`font-display text-2xl font-semibold tracking-wide sm:text-3xl ${LIFT}`} />
            <div ref={stageRef} className="text-[11px] font-semibold uppercase tracking-[0.18em] text-haze" />
          </div>
        </div>
      </div>

      {caption && !ended && (
        <div key={caption.id} className="ls-caption pointer-events-none absolute left-1/2 top-[13%] w-max max-w-[92vw] text-center">
          <div
            className={`font-display text-4xl font-semibold uppercase leading-none tracking-[0.08em] sm:text-6xl ${TONE[caption.tone]} ${LIFT}`}
          >
            {caption.text}
          </div>
          {caption.sub && <div className={`mx-auto mt-3 max-w-xl text-sm text-haze ${LIFT}`}>{caption.sub}</div>}
        </div>
      )}

      {finale && !ended && (
        <div className="pointer-events-none absolute inset-x-0 top-[8%] flex flex-col items-center px-4 text-center">
          <span
            className={`ls-fade mb-4 rounded-[3px] px-2.5 py-1 font-display text-sm font-semibold uppercase tracking-[0.2em] ${finale.ok ? "bg-go-signal/15 text-go-signal" : "bg-nogo/15 text-nogo"}`}
          >
            {finale.ok ? (outcome === "destination" ? "Mission success" : "Orbit achieved") : "Vehicle lost"}
          </span>
          <div
            className={`ls-write whitespace-nowrap font-display text-[min(20vw,24vh,10rem)] font-semibold uppercase leading-none tracking-[0.04em] ${finale.ok ? "text-starlight" : "text-nogo"} ${LIFT}`}
          >
            {finale.text}
          </div>
          {!finale.ok && (
            <div className={`ls-fade mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-haze [animation-delay:0.5s] ${LIFT}`}>
              Rapid unscheduled disassembly
            </div>
          )}
        </div>
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

function Readout({ label, unit, valueRef }: { label: string; unit: string; valueRef: Ref<HTMLSpanElement> }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-haze">{label}</div>
      <div className={`font-display text-2xl font-semibold leading-tight sm:text-3xl ${LIFT}`}>
        <span ref={valueRef}>0</span>
        <span className="ml-1 text-sm font-medium text-haze">{unit}</span>
      </div>
    </div>
  );
}
