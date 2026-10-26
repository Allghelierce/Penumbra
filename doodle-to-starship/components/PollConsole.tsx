"use client";

// The GO/NO-GO poll as a launch commit ring: one arc per controller that sweeps in green (GO)
// or red (NO-GO) as it reports, the one on the loop pulsing with a live voice meter, the
// verdict and the GO button in the middle, and the line being spoken typed out once below.

import { useEffect, useRef, useState } from "react";
import type { DesignAction, Poll } from "@/lib/design";
import { voiceActivity } from "@/lib/voice/activity";

export interface PollConsoleProps {
  poll: Poll;
  /** How many calls have been read out; segments past this stay dark. poll.calls.length lights them all. */
  revealed: number;
  onGo: () => void;
  onScrub: () => void;
  onFix: (fix: DesignAction) => void;
}

/** What the voice loop is doing right now (role null when it's quiet). */
interface LoopActivity {
  role: string | null;
  text: string;
  index?: number;
}

/** Caption typing speed, close to speaking pace. */
const TYPE_CPS = 17;
const BARS = 12;
/** Ring geometry in SVG units. */
const SIZE = 240;
const C = SIZE / 2;
const R = 92;
const GAP = 6;

const CSS = `
@keyframes pc-spin { to { transform: rotate(360deg); } }
.pc-spin { animation: pc-spin 60s linear infinite; transform-origin: ${C}px ${C}px; }
.pc-scan { animation: pc-spin 3.2s linear infinite; transform-origin: ${C}px ${C}px; }
@keyframes pc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.pc-pulse { animation: pc-pulse 0.9s ease-in-out infinite; }
@keyframes pc-sweep { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
.pc-sweep { stroke-dasharray: 100; animation: pc-sweep 0.55s cubic-bezier(.3,.7,.2,1) both; }
@keyframes pc-type { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes pc-in { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: none; } }
.pc-in { animation: pc-in 0.35s ease-out both; }
`;

/** The number that decided a call, from its spoken line: "−0.9 km/s", "TWR 1.21", "562 t". */
export function keyFigure(line: string): string | null {
  const m = /(\d+(?:\.\d+)?)\s*(kilometers per second|km\/s|meters per second|m\/s|percent|%|tonnes|tons|t\b|g\b)/i.exec(line);
  if (m) {
    const unit = m[2].toLowerCase();
    const u =
      unit.startsWith("kilo") || unit === "km/s"
        ? "km/s"
        : unit.startsWith("meter") || unit === "m/s"
          ? "m/s"
          : unit.startsWith("per") || unit === "%"
            ? "%"
            : unit === "g"
              ? "g"
              : "t";
    const neg = /\b(short|below|under|over|too heavy|exceeds|missing)\b/i.test(line);
    const pos = /\b(spare|margin|above|extra)\b/i.test(line);
    return `${neg ? "−" : pos ? "+" : ""}${m[1]} ${u}`;
  }
  const twr = /thrust[- ]to[- ]weight[^\d]{0,20}(\d+(?:\.\d+)?)/i.exec(line);
  return twr ? `TWR ${twr[1]}` : null;
}

/** Point on the ring: 0° is straight up, clockwise. */
function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

function arc(r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
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
        const next = onPoll ? { role: a.role, text: a.text, index: a.index } : null;
        setActivity((prev) =>
          prev?.role === next?.role && prev?.text === next?.text && prev?.index === next?.index ? prev : next,
        );
      }),
    [],
  );
  const shown = Math.min(n, revealed);
  const done = shown >= n;

  const speakingIndex = activity?.role ? (activity.index ?? shown - 1) : shown - 1;
  const current = poll.calls[Math.max(0, Math.min(speakingIndex, n - 1))];
  const captionText = activity?.role ? activity.text : shown > 0 ? (current?.line ?? "") : "Flight, conduct the poll.";
  const captionRole = shown > 0 ? current?.role : "Flight";
  const typeSecs = Math.max(0.6, captionText.length / TYPE_CPS);

  // A segment is "on the loop" while its line is still being typed (or the voice says so).
  const [typing, setTyping] = useState<number | null>(null);
  useEffect(() => {
    if (shown <= 0) return;
    const h0 = window.setTimeout(() => setTyping(shown - 1), 0);
    const h1 = window.setTimeout(() => setTyping(null), typeSecs * 1000);
    return () => {
      window.clearTimeout(h0);
      window.clearTimeout(h1);
    };
  }, [shown, typeSecs]);
  const talking = activity?.role ? speakingIndex : (typing ?? -1);

  // Radial level bars on the talking segment: the voice level, or a speech-like envelope without one.
  const barsRef = useRef<SVGGElement | null>(null);
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
      history.push(Math.max(0.08, Math.min(1, live)));
      const lines = barsRef.current?.children;
      if (!lines) return;
      for (let i = 0; i < lines.length; i++) {
        const el = lines[i] as SVGLineElement;
        const deg = Number(el.dataset.deg);
        const [x2, y2] = polar(R + 11 + history[i] * 15, deg);
        el.setAttribute("x2", x2.toFixed(2));
        el.setAttribute("y2", y2.toFixed(2));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [talking]);

  const span = 360 / Math.max(1, n);
  const segs = poll.calls.map((c, i) => {
    const a0 = i * span + GAP / 2;
    const a1 = (i + 1) * span - GAP / 2;
    const state = i === talking ? "talking" : i < shown ? (c.go ? "go" : "nogo") : "standby";
    const figure = c.role === "Flight" ? (poll.go ? "GO" : "HOLD") : keyFigure(c.line);
    return { c, i, a0, a1, mid: (a0 + a1) / 2, state, figure };
  });
  const reported = segs.filter((s) => s.state === "go" || s.state === "nogo").length;

  return (
    // A fixed overlay with no in-flow height, so the napkin and photo keep their full size behind it.
    // It stops above the voice dock so push-to-talk stays clickable during the poll.
    <div className="h-0 w-full">
      <section
        aria-label="GO/NO-GO poll"
        className="fixed inset-x-0 top-0 bottom-[76px] z-40 flex items-center justify-center bg-black/[.72] px-4 text-white lg:pr-[460px]"
      >
      <div className="w-full max-w-[760px] border border-rule bg-black px-6 py-5">
      <style>{CSS}</style>
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-space text-[12px] font-semibold uppercase tracking-[0.2em] text-haze">Launch commit</h2>
        <button type="button" onClick={onScrub} className="btn-outline h-9 px-5 text-[11px]">
          Scrub
        </button>
      </div>

      <div
        className="relative mx-auto mt-3 w-full max-w-[600px]"
        style={{ height: SIZE, transform: "scale(1.3)", transformOrigin: "top center", marginBottom: SIZE * 0.3 }}
      >
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          className="absolute left-1/2 top-0 -translate-x-1/2 overflow-visible"
          aria-hidden="true"
        >
          {/* Slow outer scale. */}
          <g className="pc-spin" stroke="#ffffff">
            {Array.from({ length: 72 }, (_, k) => {
              const long = k % 6 === 0;
              const [x0, y0] = polar(118, k * 5);
              const [x1, y1] = polar(long ? 109 : 113, k * 5);
              return <line key={k} x1={x0} y1={y0} x2={x1} y2={y1} strokeWidth={1} opacity={long ? 0.55 : 0.22} />;
            })}
          </g>
          <circle cx={C} cy={C} r={R - 13} fill="none" stroke="#2a2a2a" strokeWidth={1} />
          <circle cx={C} cy={C} r={R + 9} fill="none" stroke="#2a2a2a" strokeWidth={1} />
          {/* Scan sweep while the poll runs. */}
          {!done && (
            <g className="pc-scan">
              <line x1={C} y1={C - (R - 13)} x2={C} y2={C - (R + 9)} stroke="#ffffff" strokeWidth={1.5} opacity={0.6} />
            </g>
          )}
          {segs.map((s) => (
            <g key={s.c.role}>
              <path d={arc(R, s.a0, s.a1)} fill="none" stroke="#2a2a2a" strokeWidth={12} />
              {s.state === "talking" && (
                <path d={arc(R, s.a0, s.a1)} fill="none" stroke="#ffffff" strokeWidth={12} className="pc-pulse" />
              )}
              {(s.state === "go" || s.state === "nogo") && (
                <path
                  key={s.state}
                  d={arc(R, s.a0, s.a1)}
                  pathLength={100}
                  fill="none"
                  stroke={s.state === "go" ? "var(--go-signal)" : "var(--nogo)"}
                  strokeWidth={12}
                  className="pc-sweep"
                />
              )}
            </g>
          ))}
          {talking >= 0 && segs[talking] && (
            <g ref={barsRef} stroke="#ffffff" strokeWidth={2}>
              {Array.from({ length: BARS }, (_, k) => {
                const s = segs[talking];
                const deg = s.a0 + ((k + 0.5) / BARS) * (s.a1 - s.a0);
                const [x1, y1] = polar(R + 9, deg);
                return <line key={k} data-deg={deg} x1={x1} y1={y1} x2={x1} y2={y1} />;
              })}
            </g>
          )}
        </svg>

        {/* Segment labels around the ring. */}
        {segs.map((s) => {
          const [x, y] = polar(R + 46, s.mid);
          const right = x >= C;
          const tone =
            s.state === "go" ? "text-go-signal" : s.state === "nogo" ? "text-nogo" : s.state === "talking" ? "text-white" : "text-haze";
          return (
            <div
              key={s.c.role}
              className={`absolute w-[150px] ${right ? "text-left" : "text-right"}`}
              style={{ left: `calc(50% + ${x - C + (right ? 0 : -150)}px)`, top: y - 18 }}
            >
              <div className="font-space text-[10px] font-semibold uppercase tracking-[0.2em] text-haze">
                {s.state === "talking" && <span className="pc-pulse text-nogo">● </span>}
                {s.c.role}
              </div>
              <div className={`font-display text-[17px] font-semibold uppercase leading-tight tracking-[0.06em] ${tone}`}>
                {s.state === "standby"
                  ? "Standby"
                  : s.state === "talking"
                    ? "On loop"
                    : (s.figure ?? (s.state === "go" ? "GO" : "NO-GO"))}
              </div>
            </div>
          );
        })}

        {/* Center: the state, then the verdict and the GO button. */}
        <div className="absolute left-1/2 top-1/2 flex w-[150px] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
          {!done ? (
            <>
              <div className="font-display text-[22px] font-semibold uppercase tracking-[0.14em]">Polling</div>
              <div className="font-space text-[11px] uppercase tracking-[0.2em] text-haze">
                {reported} / {n}
              </div>
            </>
          ) : (
            <div key={poll.go ? "go" : "hold"} className="pc-in flex flex-col items-center gap-2">
              <div
                className={`font-display text-[20px] font-semibold uppercase leading-[1.05] tracking-[0.1em] ${poll.go ? "text-go-signal" : "text-nogo"}`}
              >
                {poll.go ? "GO for launch" : "Hold"}
              </div>
              {/* Only shown once every controller has reported, so a NO-GO can't fly before it's heard. */}
              <button
                type="button"
                onClick={onGo}
                className={`h-9 px-5 text-[11px] ${poll.go ? "btn-solid" : "btn-outline border-nogo text-nogo"}`}
              >
                {poll.go ? "GO" : "GO anyway"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* The line on the loop, typed out once, in step with the voice. */}
      <p
        className="mt-2 flex min-h-[1.75rem] items-baseline justify-center gap-3 text-center text-[15px] leading-snug sm:text-[16px]"
        aria-live="polite"
      >
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
      </div>
      </section>
    </div>
  );
}
