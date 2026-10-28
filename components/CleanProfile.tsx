"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CleanShape, SketchReading } from "@/lib/design";
import { cleanProfile } from "@/lib/sketch/clean";

type View = "sketch" | "clean";

interface CleanProfileProps {
  /** The checked reading; its clean profile is inked over the sketch. */
  reading?: SketchReading | null;
  /** The strokes array: an empty one (Clear, a new sample) drops the clean profile. */
  resetKey: unknown;
  /** The red-pen layer, on top of both views at full strength. */
  children?: ReactNode;
}

const VIEWS: View[] = ["sketch", "clean"];

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

function shapesOf(reading: SketchReading | null): CleanShape[] {
  if (!reading) return [];
  try {
    return cleanProfile(reading);
  } catch {
    return [];
  }
}

/**
 * From Build on, the pencil sketch is inked over: a crisp coloured profile draws itself on the napkin,
 * part by part. It stays up across re-checks and launches; drawing on the napkin, or the SKETCH / CLEAN
 * toggle, goes back to the sketch. Hold S to peek.
 */
export default function CleanProfile({ reading = null, resetKey, children }: CleanProfileProps) {
  const cleared = Array.isArray(resetKey) && resetKey.length === 0;
  const [track, setTrack] = useState({ reading, cleared, last: reading, chosen: null as View | null });
  const [peek, setPeek] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);

  // Keep the last reading through re-checks (it goes null while a new one is made); a fresh reading
  // goes back to the clean view, and clearing the napkin drops it.
  if (track.reading !== reading || track.cleared !== cleared) {
    const fresh = reading !== null && reading !== track.reading;
    setTrack({
      reading,
      cleared,
      last: cleared ? null : (reading ?? track.last),
      chosen: cleared || fresh ? null : track.chosen,
    });
    setPeek(false);
  }

  const shapes = useMemo(() => shapesOf(track.last), [track.last]);
  const hasClean = shapes.length > 0;
  const view: View = hasClean && track.chosen !== "sketch" ? "clean" : "sketch";
  const shown: View = peek ? "sketch" : view;

  // Drawing on the napkin switches to the sketch.
  useEffect(() => {
    const napkin = anchor.current?.closest(".napkin");
    if (!napkin) return;
    const down = (e: Event) => {
      if (e.target instanceof HTMLCanvasElement && e.target.parentElement === napkin) setTrack((t) => ({ ...t, chosen: "sketch" }));
    };
    napkin.addEventListener("pointerdown", down, true);
    return () => napkin.removeEventListener("pointerdown", down, true);
  }, []);

  useEffect(() => {
    if (!hasClean) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "KeyS" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) setPeek(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyS") setPeek(false);
    };
    const release = () => setPeek(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
    };
  }, [hasClean]);

  const fade = peek ? "duration-150" : "duration-[600ms]";
  return (
    <>
      <span ref={anchor} hidden />
      {hasClean && (
        // Fades in once over the pencil; the toggle and the peek fade the inner layer.
        <div className="napkin-overlay absolute inset-0" style={{ opacity: 0, animation: "fade-in 0.4s ease-out forwards" }}>
          <div
            className={`absolute inset-0 select-none overflow-hidden rounded-[2px] bg-black/85 transition-opacity ${fade} ${
              shown === "clean" ? "opacity-100" : "opacity-0"
            }`}
          >
            <svg key={shapes.map((s) => s.d).join("|")} viewBox="0 0 300 400" role="img" aria-label="Clean profile of the sketch" className="absolute inset-0 h-full w-full">
              {shapes.map((s, i) => {
                const delay = 0.15 + (i * 0.85) / Math.max(1, shapes.length);
                return (
                  <g key={i}>
                    <path d={s.d} fill={s.fill} stroke="none" style={{ opacity: 0, animation: `fade-in 0.45s ease-out ${delay + 0.3}s forwards` }} />
                    <path
                      d={s.d}
                      fill="none"
                      stroke={s.stroke ?? "rgba(255,255,255,0.85)"}
                      strokeWidth={1.1}
                      strokeLinejoin="round"
                      pathLength={1}
                      className="pen-draw"
                      style={{ animationDelay: `${delay}s` }}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}
      {/* The red pen sits on top of both views at full strength. */}
      <div className="absolute inset-0">{children}</div>
      {hasClean && (
        <div role="group" aria-label="Napkin view" className="napkin-overlay pointer-events-auto absolute left-[4%] top-[3%] flex bg-black px-1 font-ui shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setTrack((t) => ({ ...t, chosen: v }))}
              className={`relative px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors after:absolute after:inset-x-2 after:bottom-1 after:h-px after:bg-white after:transition-transform ${
                view === v ? "text-white after:scale-x-100" : "text-haze after:scale-x-0 hover:text-white"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
