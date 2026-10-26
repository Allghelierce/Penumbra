"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CleanShape, SketchReading } from "@/lib/design";
import { cleanProfile } from "@/lib/sketch/clean";

type View = "sketch" | "clean" | "photo";

interface NapkinRenderProps {
  /** The Grok Imagine concept made from this sketch, or null (also while a new one is being made). */
  url: string | null;
  /** True while the render is being made. */
  loading: boolean;
  /** The strokes array: an empty one (Clear, a new sample) drops the clean profile and photo. */
  resetKey: unknown;
  /** The checked reading; its clean profile is drawn in once the scan is done. */
  reading?: SketchReading | null;
  /** Drawn over everything at full strength (the mission patch). */
  sticker?: ReactNode;
  /** The red-pen layer, on top of every view at full strength. */
  children?: ReactNode;
}

const VIEWS: View[] = ["sketch", "clean", "photo"];
/** How long the first clean profile holds after its sweep before the photo fades in over it. */
const HOLD_MS = 900;

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

const isPng = (src: string | null) => src !== null && (/\.png(\?|#|$)/i.test(src) || src.startsWith("data:image/png"));

function shapesOf(reading: SketchReading | null): CleanShape[] {
  if (!reading) return [];
  try {
    return cleanProfile(reading);
  } catch {
    return [];
  }
}

/**
 * After a check the napkin goes sketch → clean → photo: a laser sweeps down and the pencil gives way to a
 * crisp coloured profile behind the beam, then the Grok Imagine render fades in, floating on the dark
 * napkin with its black background dropped. The photo stays up across re-checks and launches; drawing on
 * the napkin, or the SKETCH / CLEAN / PHOTO toggle, goes back to the sketch. Hold S to peek.
 */
export default function NapkinRender({ url, loading, resetKey, reading = null, sticker, children }: NapkinRenderProps) {
  const cleared = Array.isArray(resetKey) && resetKey.length === 0;
  const [track, setTrack] = useState({
    url,
    reading,
    cleared,
    last: reading,
    photo: null as string | null,
    chosen: null as View | null,
    cleanFirst: true,
    swept: false,
  });
  const [held, setHeld] = useState<SketchReading | null>(null);
  const [peek, setPeek] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);

  // Keep the last reading and photo through re-checks (both go null while new ones are made); a fresh
  // reading goes back to the automatic view, and clearing the napkin drops everything.
  if (track.url !== url || track.reading !== reading || track.cleared !== cleared) {
    const fresh = reading !== null && reading !== track.reading;
    setTrack({
      url,
      reading,
      cleared,
      last: cleared ? null : (reading ?? track.last),
      photo: cleared ? null : track.photo,
      chosen: cleared || fresh ? null : track.chosen,
      cleanFirst: cleared ? true : fresh ? track.photo === null : track.cleanFirst,
      swept: cleared ? false : track.swept,
    });
    setPeek(false);
  }

  const shapes = useMemo(() => shapesOf(track.last), [track.last]);
  const hasClean = shapes.length > 0;
  const hasPhoto = track.photo !== null;
  const available: Record<View, boolean> = { sketch: true, clean: hasClean, photo: hasPhoto };
  // The very first profile gets its moment before the photo covers it; after that the photo stays.
  const waiting = hasClean && track.cleanFirst && held !== track.last;
  const auto: View = hasPhoto && !waiting ? "photo" : hasClean ? "clean" : "sketch";
  const view = track.chosen && available[track.chosen] ? track.chosen : auto;
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

  const fade = peek ? "duration-150" : "duration-[600ms]";
  return (
    <>
      <span ref={anchor} hidden />
      {url !== null && url !== track.photo && (
        // Loads the next render off-screen; it replaces the shown one only once it's ready.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" hidden onLoad={() => setTrack((t) => (t.url === url ? { ...t, photo: url } : t))} />
      )}
      {(hasClean || hasPhoto) && (
        <div
          className={`napkin-overlay render-wipe absolute inset-0 isolate select-none overflow-hidden rounded-[2px] bg-black/85 transition-opacity ${fade} ${
            shown === "sketch" ? "opacity-0" : "opacity-100"
          }`}
        >
          {hasClean && (
            <svg
              key={shapes.map((s) => s.d).join("|")}
              viewBox="0 0 300 400"
              role="img"
              aria-label="Clean profile of the sketch"
              className={`absolute inset-0 h-full w-full transition-opacity ${fade} ${shown === "clean" ? "opacity-100" : "opacity-0"}`}
            >
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
          )}
          {hasPhoto && (
            // Transparent PNG cutouts float as they are; screen drops a JPEG's black background instead.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={track.photo ?? undefined}
              alt="Grok Imagine render of the sketch"
              draggable={false}
              className={`napkin-render-img transition-opacity ${fade} ${isPng(track.photo) ? "" : "mix-blend-screen"} ${shown === "photo" ? "opacity-100" : "opacity-0"}`}
            />
          )}
          {!track.swept && (
            <div className="absolute inset-0 overflow-hidden">
              <div
                className="scanline render-beam"
                onAnimationEnd={() => {
                  const first = track.last;
                  setTrack((t) => ({ ...t, swept: true }));
                  window.setTimeout(() => setHeld(first), HOLD_MS);
                }}
              />
            </div>
          )}
        </div>
      )}
      {sticker}
      {/* The red pen sits on top of every view at full strength: the markup over the render is the point. */}
      <div className="absolute inset-0">{children}</div>
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
