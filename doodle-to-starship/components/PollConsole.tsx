"use client";

// The GO/NO-GO poll as a flight-control loop: one tile per controller, the one on the loop
// lit with a live voice meter, its line typed out under the board, finished tiles snapping
// to GO or NO-GO with the number that decided it, and Flight's call as a full-width banner.
// Big GO / SCRUB buttons keep the launch independent of the microphone.

import { useEffect, useRef, useState } from "react";
import type { DesignAction, Poll, PollCall } from "@/lib/design";
import { voiceActivity } from "@/lib/voice/activity";

export interface PollConsoleProps {
  poll: Poll;
  /** How many calls have been read out; tiles past this stay dark. poll.calls.length lights them all. */
  revealed: number;
  onGo: () => void;
  onScrub: () => void;
  onFix: (fix: DesignAction) => void;
}

/** What the voice loop is doing right now (role null when it's quiet). */
interface LoopActivity {
  role: string | null;
  text: string;
  level: number;
  index?: number;
}

/** Caption typing speed, close to speaking pace. */
const TYPE_CPS = 17;
const BARS = 16;

const CSS = `
@keyframes pc-pulse { 0%, 100% { border-color: rgba(255,255,255,1); } 50% { border-color: rgba(255,255,255,0.45); } }
.pc-pulse { animation: pc-pulse 1.1s ease-in-out infinite; }
@keyframes pc-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
.pc-blink { animation: pc-blink 0.8s steps(2, jump-none) infinite; }
@keyframes pc-type { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes pc-snap { 0% { opacity: 0; transform: translateY(4px); } 100% { opacity: 1; transform: none; } }
.pc-snap { animation: pc-snap 0.25s ease-out both; }
@keyframes pc-banner { 0% { opacity: 0; transform: scaleX(0.96); } 60% { opacity: 1; } 100% { opacity: 1; transform: none; } }
.pc-banner { animation: pc-banner 0.45s cubic-bezier(.2,.8,.2,1) both; }
`;

/** The number that decided a call, from its spoken line: "−0.9 km/s", "1.21 TWR", "+12%". */
export function keyFigure(line: string): string | null {
  const m = /(\d+(?:\.\d+)?)\s*(kilometers per second|km\/s|meters per second|m\/s|percent|%|tonnes|tons|t\b|g\b)/i.exec(line);
  if (m) {
    const unit = m[2].toLowerCase();
    const u = unit.startsWith("kilo") || unit === "km/s" ? "km/s" : unit.startsWith("meter") || unit === "m/s" ? "m/s" : unit.startsWith("per") || unit === "%" ? "%" : unit === "g" ? "g" : "t";
    const neg = /\b(short|below|under|over|too heavy|exceeds|missing)\b/i.test(line);
    const pos = /\b(spare|margin|above|extra)\b/i.test(line);
    return `${neg ? "−" : pos ? "+" : ""}${m[1]} ${u}`;
  }
  const twr = /thrust[- ]to[- ]weight[^\d]{0,20}(\d+(?:\.\d+)?)/i.exec(line);
  return twr ? `TWR ${twr[1]}` : null;
}

// onFix stays in the props contract, but the board no longer offers a fix button (users scrub or GO anyway).
export default function PollConsole({ poll, revealed, onGo, onScrub }: PollConsoleProps) {
  const n = poll.calls.length;
  // The voice loop: which poll line is playing and how loud. Level goes straight to the meter
  // (60×/s); only a change of speaker or line re-renders. VoiceDock drives `revealed`, also when muted.
  const [activity, setActivity] = useState<LoopActivity | null>(null);
  const levelRef = useRef(0);
  const heardVoice = useRef(false);
  useEffect(
    () =>
      voiceActivity.subscribe((a) => {
        const onPoll = a.role !== null && a.index !== undefined;
        levelRef.current = onPoll ? a.level : 0;
        if (onPoll) heardVoice.current = true;
        const next = onPoll ? { role: a.role, text: a.text, level: a.level, index: a.index } : null;
        setActivity((prev) =>
          prev?.role === next?.role && prev?.text === next?.text && prev?.index === next?.index ? prev : next,
        );
      }),
    [],
  );
  const shown = Math.min(n, revealed);

  const done = shown >= n;
  const speakingIndex = activity?.role ? (activity.index ?? shown - 1) : shown - 1;
  const current: PollCall | undefined = poll.calls[Math.max(0, Math.min(speakingIndex, n - 1))];
  const captionText = activity?.role ? activity.text : shown > 0 ? (current?.line ?? "") : "Flight, conduct the poll.";
  const captionRole = shown > 0 ? current?.role : "Flight";
  const typeSecs = Math.max(0.6, captionText.length / TYPE_CPS);

  // A tile is "on the loop" while its line is still being typed (or the voice says so).
  const [talkingUntil, setTalkingUntil] = useState<{ index: number; until: number } | null>(null);
  useEffect(() => {
    if (shown <= 0) return;
    const index = shown - 1;
    const until = performance.now() + typeSecs * 1000;
    const h0 = window.setTimeout(() => setTalkingUntil({ index, until }), 0);
    const h1 = window.setTimeout(() => setTalkingUntil(null), typeSecs * 1000);
    return () => {
      window.clearTimeout(h0);
      window.clearTimeout(h1);
    };
  }, [shown, typeSecs]);
  const talking = activity?.role ? speakingIndex : talkingUntil ? talkingUntil.index : -1;

  // Live meter: the voice level when there is one, otherwise a speech-like envelope while typing.
  const meterRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (talking < 0) return;
    const history = new Array<number>(BARS).fill(0);
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 45) return;
      last = now;
      const live = heardVoice.current
        ? levelRef.current
        : 0.25 + 0.45 * Math.abs(Math.sin(now / 90)) * (0.6 + 0.4 * Math.sin(now / 37)) + Math.random() * 0.15;
      history.shift();
      history.push(Math.max(0.06, Math.min(1, live)));
      const bars = meterRef.current?.children;
      if (!bars) return;
      for (let i = 0; i < bars.length; i++) (bars[i] as HTMLElement).style.transform = `scaleY(${history[i]})`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [talking]);

  const controllers = poll.calls.map((c, i) => ({ c, i })).filter(({ c }) => c.role !== "Flight");
  const flightIndex = poll.calls.findIndex((c) => c.role === "Flight");
  const flightTalking = talking >= 0 && talking === flightIndex;
  const banner = done || flightTalking;

  return (
    <section aria-label="GO/NO-GO poll" className="w-full border border-rule bg-black px-4 py-3 text-white">
      <style>{CSS}</style>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="font-space text-[12px] font-semibold uppercase tracking-[0.2em] text-haze">GO / NO-GO poll</h2>
        <span className="font-space text-[11px] uppercase tracking-[0.18em] text-haze">
          {done ? "Poll complete" : `${Math.max(0, Math.min(shown, controllers.length))} / ${controllers.length} reporting`}
        </span>
      </div>

      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${controllers.length + 1}, minmax(0, 1fr))` }}>
        {controllers.map(({ c, i }, k) => (
          <Tile
            key={c.role}
            label={c.role}
            loop={k + 1}
            state={i === talking ? "talking" : i < shown ? (c.go ? "go" : "nogo") : "standby"}
            figure={keyFigure(c.line)}
            meterRef={i === talking ? meterRef : undefined}
          />
        ))}
        <Tile
          label="Flight"
          loop={controllers.length + 1}
          state={flightTalking ? "talking" : done ? (poll.go ? "go" : "hold") : "standby"}
          figure={null}
          meterRef={flightTalking ? meterRef : undefined}
        />
      </ol>

      {/* The line on the loop, typed out in step with the voice so it reads in a loud room. */}
      <p className="mt-3 flex min-h-[1.75rem] items-baseline gap-3 text-[15px] leading-snug sm:text-[17px]" aria-live="polite">
        {captionRole && (
          <span className="shrink-0 font-space text-[11px] font-semibold uppercase tracking-[0.2em] text-haze">{captionRole}</span>
        )}
        <span
          key={captionText}
          className="min-w-0 text-white"
          style={{ animation: `pc-type ${typeSecs}s steps(${Math.max(1, captionText.length)}, end) both` }}
        >
          {captionText}
        </span>
      </p>

      {banner && (
        <div
          className={`pc-banner mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border px-4 py-3 ${poll.go ? "border-go-signal" : "border-nogo"}`}
        >
          <span className="font-space text-[11px] font-semibold uppercase tracking-[0.22em] text-haze">Flight</span>
          <span
            className={`font-display text-[28px] font-semibold uppercase leading-none tracking-[0.12em] sm:text-[34px] ${poll.go ? "text-go-signal" : "text-nogo"}`}
          >
            {poll.go ? "GO for launch" : "Hold · hold · hold"}
          </span>
          <span className="min-w-0 text-[13px] text-haze">{poll.summary}</span>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={onScrub} className="btn-outline h-11 px-6 text-[12px]">
          Scrub
        </button>
        {/* Disabled until every controller has reported, so a NO-GO can't fly before it's heard (Esc skips). */}
        <button
          type="button"
          onClick={onGo}
          disabled={!done}
          className={`h-11 px-8 text-[12px] ${poll.go || !done ? "btn-solid" : "btn-outline border-nogo text-nogo"}`}
        >
          {!done ? "Polling…" : poll.go ? "GO for launch" : "GO anyway"}
        </button>
      </div>
    </section>
  );
}

type TileState = "standby" | "talking" | "go" | "nogo" | "hold";

function Tile({
  label,
  loop,
  state,
  figure,
  meterRef,
}: {
  label: string;
  loop: number;
  state: TileState;
  figure: string | null;
  meterRef?: React.Ref<HTMLDivElement>;
}) {
  const frame =
    state === "talking"
      ? "pc-pulse border-white"
      : state === "go"
        ? "border-go-signal"
        : state === "nogo" || state === "hold"
          ? "border-nogo"
          : "border-rule opacity-50";
  return (
    <li className={`flex min-h-[78px] flex-col justify-between border px-3 py-2 transition-[border-color,opacity] duration-200 ${frame}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-space text-[11px] font-semibold uppercase tracking-[0.18em] text-white">{label}</span>
        {state === "talking" ? (
          <span className="flex shrink-0 items-center gap-1 font-space text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
            <span className="pc-blink text-nogo">●</span> Talking
          </span>
        ) : (
          <span className="shrink-0 font-space text-[10px] uppercase tracking-[0.16em] text-haze">Loop {loop}</span>
        )}
      </div>
      {state === "talking" ? (
        <div ref={meterRef} className="flex h-[26px] items-center gap-[3px]" aria-hidden="true">
          {Array.from({ length: BARS }, (_, i) => (
            <span key={i} className="h-full w-[3px] origin-center scale-y-[0.06] bg-white" />
          ))}
        </div>
      ) : state === "standby" ? (
        <div className="font-display text-[18px] font-semibold uppercase leading-tight tracking-[0.1em] text-haze">Standby</div>
      ) : (
        <div className="pc-snap flex items-baseline justify-between gap-2">
          <span
            className={`font-display text-[22px] font-semibold uppercase leading-tight tracking-[0.06em] ${state === "go" ? "text-go-signal" : "text-nogo"}`}
          >
            {state === "go" ? "GO" : state === "hold" ? "HOLD" : "NO-GO"}
          </span>
          {figure && <span className="truncate font-display text-[14px] font-semibold tracking-wide text-white">{figure}</span>}
        </div>
      )}
    </li>
  );
}
