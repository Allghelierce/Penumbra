"use client";

import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import type {
  Analysis,
  DesignAction,
  FlightEvent,
  FlightEventKind,
  FlightTrace,
  HistoricMission,
  Recap,
  SketchReading,
  Stroke,
  TemplateId,
} from "@/lib/design";
import { BOUNDARIES, FAR_MARKS, LAYERS, ladderPos, ladderTop } from "./launch/atmosphere";
import { PenumbraLockup } from "@/components/PenumbraLogo";
import { templateById } from "@/lib/templates";
import { createLaunchAudio, isLaunchAudioMuted, setLaunchAudioMuted, unlockLaunchAudio } from "./launch/audio";
import EndCard from "./launch/EndCard";
import { flightStats, planFor, startLaunch, type LaunchHandle, type NapkinRect } from "./launch/engine";
import type { CaptionCue, Crossing, Finale, Plan, Tone } from "./launch/plan";

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
  /** Fired as each trace event plays. */
  onEvent?: (e: FlightEvent) => void;
  /** "Back to the napkin". */
  onDone: () => void;
  /**
   * Optional: the napkin canvas's on-screen box (getBoundingClientRect()), so the doodle
   * starts exactly where it was drawn. Without it the scene starts from a centered 3:4 box.
   */
  napkinRect?: NapkinRect | null;
  /** Optional: what to try next, shown on the end card. Read live, so it can arrive late. */
  recap?: Recap | null;
  /** Optional: apply an improvement's fix, re-check and relaunch (the studio remounts the scene). */
  onImprove?: (fix: DesignAction) => void;
  /** Optional: a real flight from history being replayed; the end card becomes its debrief. */
  mission?: HistoricMission | null;
  /**
   * Optional, for real-rocket templates: each stage's exact [top, bottom] on the napkin (bottom
   * stage first, as in TemplateDrawing.stageBands), so the vehicle separates exactly at its stages.
   */
  stageBands?: [number, number][] | null;
  /** Optional: which real rocket is flying (Starship's booster gets the tower catch). */
  templateId?: TemplateId | null;
  /** Optional, for lost missions with a comeback: apply the real fix and fly again (primary button). */
  onFixRetry?: () => void;
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
.ls-caption { animation: ls-caption 1.9s ease-out forwards; }
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
@keyframes ls-hint { 0%, 80% { opacity: 1; } 100% { opacity: 0; } }
.ls-hint { animation: ls-hint 9s ease-in both; }
@keyframes ls-transcript { 0% { opacity: 0; transform: translateY(6px); } 8% { opacity: 1; transform: none; } 88% { opacity: 1; } 100% { opacity: 0; } }
.ls-transcript { animation: ls-transcript 3.2s ease-out forwards; }
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
const HINT_KEY = "penumbra-skip-hint-seen";

function hintSeen(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export default function LaunchScene(props: LaunchSceneProps) {
  const [run, setRun] = useState(0);
  // The first launch in this browser says out loud that Esc skips.
  const [hint] = useState(() => typeof window !== "undefined" && !hintSeen());
  useEffect(() => {
    try {
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      // Private mode: the hint just shows again next time.
    }
  }, []);
  const [muted, setMuted] = useState(isLaunchAudioMuted);
  const [speed, setSpeed] = useState(1);
  // The narrator can flip the shared mute too; keep this toggle's label in step.
  useEffect(() => {
    const onMuteEvent = (e: Event) => setMuted(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener("penumbra:mute", onMuteEvent);
    return () => window.removeEventListener("penumbra:mute", onMuteEvent);
  }, []);
  return (
    <LaunchRun
      key={run}
      {...props}
      onReplay={() => setRun((r) => r + 1)}
      muted={muted}
      speed={speed}
      onSpeed={setSpeed}
      hint={hint && run === 0}
      onMute={() => {
        unlockLaunchAudio();
        setLaunchAudioMuted(!muted);
        setMuted(!muted);
      }}
    />
  );
}

interface RunProps extends LaunchSceneProps {
  onReplay: () => void;
  muted: boolean;
  onMute: () => void;
  speed: number;
  onSpeed: (x: number) => void;
  hint: boolean;
}

function LaunchRun(props: RunProps) {
  const [input] = useState(() => ({
    templateId: props.templateId,
    stageBands: props.stageBands,
    mission: props.mission,
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
  const warpRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const ladderRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const [log, setLog] = useState<Crossing[]>([]);
  const handle = useRef<LaunchHandle | null>(null);
  const [caption, setCaption] = useState<(CaptionCue & { id: number }) | null>(null);
  const [transcript, setTranscript] = useState<(CaptionCue & { id: number }) | null>(null);
  const [finale, setFinale] = useState<Finale | null>(null);
  const [ended, setEnded] = useState(false);
  const stats = useMemo(() => flightStats(input.trace), [input]);
  const plan = useMemo(() => planFor(input), [input]);
  const marks = useMemo(() => milestones(plan), [plan]);

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
      warp: warpRef.current,
      fill: fillRef.current,
      marks: [...(timelineRef.current?.querySelectorAll<HTMLElement>("[data-at]") ?? [])],
      ladder: {
        box: ladderRef.current,
        marker: markerRef.current,
        readout: readoutRef.current,
        marks: [...(ladderRef.current?.querySelectorAll<HTMLElement>("[data-km]") ?? [])],
      },
    };
    const h = startLaunch(canvas, hud, input, {
      onCaption: (c) => (c.speaker ? setTranscript(c) : setCaption(c)),
      onCrossing: (c) => setLog((l) => [...l.slice(-3), c]),
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
    handle.current?.setSpeed(props.speed);
  }, [props.speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handle.current?.skip();
      // 1–5: 0.5×, 1×, 2×, 4×, 8×.
      const x = { "1": 0.5, "2": 1, "3": 2, "4": 4, "5": 8 }[e.key];
      if (x !== undefined) latest.current.onSpeed(x);
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

      {/* Phones give the top edge to the controls. */}
      <div className="ls-fade pointer-events-none absolute left-4 top-4 hidden items-center gap-3 [animation-delay:1.3s] sm:left-6 sm:top-5 sm:flex">
        <PenumbraLockup size={13} />
        <span className="h-3 w-px bg-white/25" />
        <span className="max-w-[40vw] truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-haze">
          {input.reading.design.name}
        </span>
      </div>

      {!ended && log.length > 0 && (
        <ol className="pointer-events-none absolute left-4 top-12 space-y-1 sm:left-6 sm:top-14" aria-label="Mission log">
          {log.map((c, i) => (
            <li
              key={`${c.km}-${c.at}`}
              className={`ls-fade flex gap-3 text-xs ${LIFT} ${i === log.length - 1 ? "text-starlight" : "text-haze/70"}`}
            >
              <span className="font-display font-semibold tracking-wide">{clockText(c.simT)}</span>
              <span>{c.text}</span>
            </li>
          ))}
        </ol>
      )}

      <AltitudeLadder
        top={ladderTop(input.reading.design.destination)}
        boxRef={ladderRef}
        markerRef={markerRef}
        readoutRef={readoutRef}
      />

      {/* Overlay chrome waits for the sky to cover the studio, so it never overlaps the studio's header. */}
      {!ended && (
        <div className="ls-fade absolute right-4 top-4 flex items-center gap-3 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.18em] text-haze [animation-delay:1.3s] sm:right-6 sm:top-5 sm:gap-5">
          {/* 1× is the playback speed, not real time: this says how fast the real flight is going by. */}
          <span
            ref={warpRef}
            className="tabular-nums data-[mode=real]:text-go-signal data-[mode=warp]:text-flame-hot max-sm:absolute max-sm:right-0 max-sm:top-full max-sm:mt-2"
            title="How much faster than the real flight you are watching"
          />
          <div className="flex items-center gap-1" role="group" aria-label="Playback speed">
            {[0.5, 1, 2, 4, 8].map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => props.onSpeed(x)}
                aria-pressed={props.speed === x}
                className={`rounded-[3px] px-1.5 py-0.5 ${props.speed === x ? "bg-starlight text-umbra" : control}`}
              >
                {x}×
              </button>
            ))}
          </div>
          <button type="button" onClick={props.onMute} aria-pressed={props.muted} className={control}>
            {props.muted ? "Sound off" : "Sound on"}
          </button>
          {props.hint && (
            <span className="ls-hint hidden rounded-[3px] border border-white/20 px-2 py-0.5 normal-case tracking-normal text-starlight/80 sm:inline">
              Esc to skip
            </span>
          )}
          <button type="button" onClick={() => handle.current?.skip()} className={control}>
            Skip ›
          </button>
        </div>
      )}

      <div
        ref={hudRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent opacity-0 transition-opacity duration-700"
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

      {/* Real recorded dialog, as subtitles: the speaker small, the words big. */}
      {transcript && !ended && (
        <div
          key={transcript.id}
          className="ls-transcript pointer-events-none absolute inset-x-0 bottom-[132px] flex justify-center px-6"
          style={{ animationDuration: `${Math.max(3.2, (transcript.hold ?? 3) + 0.4)}s` }}
        >
          <div className="max-w-3xl text-center">
            <div className={`text-[11px] font-semibold uppercase tracking-[0.22em] text-haze ${LIFT}`}>{transcript.speaker}</div>
            <div className={`mt-1 text-xl font-medium leading-snug text-starlight sm:text-2xl ${LIFT}`}>
              “{transcript.text}”
            </div>
          </div>
        </div>
      )}

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
          strokes={input.strokes}
          sketchLabel={input.templateId ? `Your ${templateById(input.templateId).name}` : "Napkin sketch"}
          onDone={props.onDone}
          onReplay={props.onReplay}
          recap={props.recap}
          onImprove={props.onImprove}
          lostAt={plan.lostAt}
          mission={input.mission}
          onFixRetry={props.onFixRetry}
          trace={input.trace}
        />
      )}
    </div>
  );
}

function clockText(sim: number): string {
  const secs = Math.max(0, Math.floor(sim));
  const two = (n: number) => String(n).padStart(2, "0");
  return `T+ ${two(Math.floor(secs / 3600))}:${two(Math.floor(secs / 60) % 60)}:${two(secs % 60)}`;
}

const kmLabel = (km: number) => km.toLocaleString("en-US");

/**
 * The layers of the atmosphere as a vertical scale on the right: linear to 120 km, then
 * log-compressed so orbit (and the Moon, if that's the target) fit. The engine moves the
 * marker and lights each boundary as the rocket passes it.
 */
function AltitudeLadder({
  top,
  boxRef,
  markerRef,
  readoutRef,
}: {
  top: number;
  boxRef: Ref<HTMLDivElement>;
  markerRef: Ref<HTMLDivElement>;
  readoutRef: Ref<HTMLSpanElement>;
}) {
  const marks = [
    ...BOUNDARIES.filter((b) => b.km <= top).map((b) => ({ km: b.km, label: b.label, hero: !!b.hero })),
    ...FAR_MARKS.filter((m) => m.km <= top).map((m) => ({ ...m, hero: false })),
  ];
  return (
    <div className="ls-fade pointer-events-none absolute bottom-32 right-8 top-20 hidden w-44 [animation-delay:1.6s] lg:block">
      <div ref={boxRef} className="relative h-full">
        <div className="absolute inset-y-0 left-0 w-px bg-white/15" />
        {LAYERS.map((l) => {
          const a = ladderPos(l.from, top);
          const b = ladderPos(Math.min(l.to, top), top);
          return (
            <div key={l.name} className="absolute -left-px w-[3px]" style={{ bottom: `${a * 100}%`, height: `${(b - a) * 100}%` }}>
              <div className="h-full w-full opacity-60" style={{ background: l.color }} />
              <div
                className="absolute left-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.2em] text-white/25"
                style={{ display: b - a > 0.07 ? undefined : "none" }}
              >
                {l.name}
              </div>
            </div>
          );
        })}
        {marks.map((m) => (
          <div
            key={m.label}
            data-km={m.km}
            className="group absolute left-0 flex translate-y-1/2 items-center gap-2"
            style={{ bottom: `${ladderPos(m.km, top) * 100}%` }}
          >
            <span className={`h-px transition-colors ${m.hero ? "w-5 bg-white/60" : "w-2.5 bg-white/35"} group-data-[lit=1]:bg-starlight`} />
            <span
              className={`whitespace-nowrap text-[11px] transition-colors group-data-[lit=1]:text-starlight ${m.hero ? "text-starlight/80" : "text-haze"} ${LIFT}`}
            >
              <span className="font-display font-semibold">{kmLabel(m.km)} km</span> {m.label}
            </span>
          </div>
        ))}
        <div ref={markerRef} className="absolute bottom-0 left-0 will-change-transform">
          <div className="absolute right-1.5 top-0 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap">
            <span ref={readoutRef} className={`font-display text-sm font-semibold text-starlight ${LIFT}`} />
            <span className="h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-starlight" />
          </div>
        </div>
      </div>
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
