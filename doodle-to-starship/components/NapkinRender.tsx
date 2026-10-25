"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CleanShape, SketchReading } from "@/lib/design";
import { cleanProfile } from "@/lib/sketch/clean";

type View = "sketch" | "clean" | "photo";

interface NapkinRenderProps {
  /** The Grok Imagine concept made from this sketch, or null. */
  url: string | null;
  /** True while the render is being made. */
  loading: boolean;
  /** Changes whenever the sketch does (pass the strokes array); hides the clean profile and photo until the next check. */
  resetKey: unknown;
  /** The checked reading; its clean profile is drawn in once the scan is done. */
  reading?: SketchReading | null;
  /** Drawn over everything at full strength (the mission patch). */
  sticker?: ReactNode;
  /** The red-pen layer: full strength over the sketch and clean profile, dimmed and click-through over the photo. */
  children?: ReactNode;
}

const VIEWS: View[] = ["sketch", "clean", "photo"];
/** How long the clean profile holds after its sweep before the photo fades in over it. */
const HOLD_MS = 900;

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

function shapesOf(reading: SketchReading | null | undefined): CleanShape[] {
  if (!reading) return [];
  try {
    return cleanProfile(reading);
  } catch {
    return [];
  }
}

/**
 * After a check the napkin goes sketch → clean → photo: a laser sweeps down and the pencil gives way to a
 * crisp coloured profile behind the beam, which draws itself on; when the Grok Imagine render is ready it
 * fades in over the profile. A SKETCH / CLEAN / PHOTO toggle, or holding the napkin or the S key, goes back.
 */
export default function NapkinRender({ url, loading, resetKey, reading = null, sticker, children }: NapkinRenderProps) {
  const [track, setTrack] = useState({ url, reading, resetKey, hidden: false, chosen: null as View | null });
  const [loaded, setLoaded] = useState<string | null>(null);
  const [swept, setSwept] = useState<unknown>(null);
  const [held, setHeld] = useState<unknown>(null);
  const [peek, setPeek] = useState(false);
  const shapes = useMemo(() => shapesOf(reading), [reading]);

  // A new check shows itself; new strokes hide the old one until the next check brings another.
  if (track.url !== url || track.reading !== reading || track.resetKey !== resetKey) {
    const fresh = (url !== null && track.url !== url) || (reading !== null && track.reading !== reading);
    setTrack({
      url,
      reading,
      resetKey,
      hidden: fresh ? false : track.hidden || track.resetKey !== resetKey,
      chosen: fresh ? null : track.chosen,
    });
    setPeek(false);
  }

  const present = !track.hidden;
  const hasClean = present && shapes.length > 0;
  const hasPhoto = present && url !== null && loaded === url;
  const available: Record<View, boolean> = { sketch: true, clean: hasClean, photo: hasPhoto };
  // The beam reveals the clean profile, or the photo straight away when there's no profile.
  const revealed = hasClean ? reading : hasPhoto ? url : null;
  const auto: View = hasPhoto && (!hasClean || held === reading) ? "photo" : hasClean ? "clean" : "sketch";
  const view = track.chosen && available[track.chosen] ? track.chosen : auto;
  const shown: View = peek ? "sketch" : view;
  const interactive = view !== "sketch";

  useEffect(() => {
    if (!hasClean && !hasPhoto) return;
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
  }, [hasClean, hasPhoto]);

  return (
    <>
      {present && (hasClean || url !== null) && (
        <div
          className={`napkin-overlay absolute inset-0 select-none overflow-hidden rounded-[2px] ${interactive ? "pointer-events-auto cursor-zoom-out" : ""}`}
          title={interactive ? "Hold to see the sketch" : undefined}
          onPointerDown={(e) => {
            if (!interactive || e.button > 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setPeek(true);
          }}
          onPointerUp={() => setPeek(false)}
          onPointerCancel={() => setPeek(false)}
          onLostPointerCapture={() => setPeek(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {hasClean && (
            <div
              key={shapes.map((s) => s.d).join("|")}
              className={`render-wipe absolute inset-0 bg-black/85 transition-opacity ${peek ? "duration-150" : "duration-300"} ${
                shown === "sketch" ? "opacity-0" : "opacity-100"
              }`}
            >
              <svg viewBox="0 0 300 400" className="absolute inset-0 h-full w-full" aria-label="Clean profile of the sketch" role="img">
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
          )}
          {url !== null && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt="Grok Imagine render of the sketch"
              draggable={false}
              onLoad={() => setLoaded(url)}
              className={`napkin-render-img transition-opacity ${peek ? "duration-150" : "duration-[600ms]"} ${
                !hasClean && hasPhoto ? "render-wipe" : ""
              } ${hasPhoto && shown === "photo" ? "opacity-100" : "opacity-0"}`}
            />
          )}
          {revealed !== null && swept !== revealed && (
            <div className="absolute inset-0 overflow-hidden">
              <div
                key={String(revealed === url ? url : "clean")}
                className="scanline render-beam"
                onAnimationEnd={() => {
                  setSwept(revealed);
                  window.setTimeout(() => setHeld(revealed), HOLD_MS);
                }}
              />
            </div>
          )}
        </div>
      )}
      {sticker}
      <div className={`absolute inset-0 transition-opacity duration-300 ${shown === "photo" ? "render-ink-faded opacity-30" : ""}`}>{children}</div>
      {(hasClean || hasPhoto) && (
        <div role="group" aria-label="Napkin view" className="napkin-overlay pointer-events-auto absolute left-[4%] top-[3%] flex bg-black px-1 font-ui shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
          {VIEWS.filter((v) => available[v]).map((v) => (
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
      {loading && (
        <>
          <div className="napkin-overlay render-pending" />
          <p className="napkin-overlay absolute inset-x-0 bottom-[3.5%] text-center font-mono text-[9px] uppercase tracking-[0.22em] text-white/60">
            Rendering with Grok Imagine…
          </p>
        </>
      )}
    </>
  );
}
