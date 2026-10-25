"use client";

import { useEffect, useState, type ReactNode } from "react";

type View = "sketch" | "render";

interface NapkinRenderProps {
  /** The Grok Imagine concept made from this sketch, or null. */
  url: string | null;
  /** True while the render is being made. */
  loading: boolean;
  /** Changes whenever the sketch does (pass the strokes array); hides the render until the next one arrives. */
  resetKey: unknown;
  /** Drawn over the render at full strength (the mission patch). */
  sticker?: ReactNode;
  /** The red-pen layer: as today over the sketch, faded and click-through over the render. */
  children?: ReactNode;
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Turns the napkin into its Grok Imagine render: a laser sweeps down and the pencil gives way to the
 * render behind the beam. A SKETCH / RENDER toggle, or holding the napkin or the S key, shows the sketch again.
 */
export default function NapkinRender({ url, loading, resetKey, sticker, children }: NapkinRenderProps) {
  const [track, setTrack] = useState({ url, resetKey, hidden: false, view: "render" as View });
  const [loaded, setLoaded] = useState<string | null>(null);
  const [swept, setSwept] = useState<string | null>(null);
  const [peek, setPeek] = useState(false);

  // A new render shows itself; new strokes hide the old one until the next check brings another.
  if (track.url !== url || track.resetKey !== resetKey) {
    const fresh = url !== null && track.url !== url;
    setTrack({
      url,
      resetKey,
      hidden: fresh ? false : track.hidden || track.resetKey !== resetKey,
      view: fresh ? "render" : track.view,
    });
    setPeek(false);
  }

  const present = url !== null && !track.hidden;
  const ready = present && loaded === url;
  const onRender = ready && track.view === "render";
  const showing = present && track.view === "render" && !peek;

  useEffect(() => {
    if (!ready) return;
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
  }, [ready]);

  return (
    <>
      {present && (
        <div
          key={url}
          className={`napkin-overlay absolute inset-0 select-none overflow-hidden rounded-[2px] transition-opacity ${peek ? "duration-150" : "duration-300"} ${
            onRender ? "pointer-events-auto cursor-zoom-out" : ""
          } ${showing ? "opacity-100" : "opacity-0"}`}
          title={onRender ? "Hold to see the sketch" : undefined}
          onPointerDown={(e) => {
            if (!onRender || e.button > 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setPeek(true);
          }}
          onPointerUp={() => setPeek(false)}
          onPointerCancel={() => setPeek(false)}
          onLostPointerCapture={() => setPeek(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Grok Imagine render of the sketch"
            draggable={false}
            onLoad={() => setLoaded(url)}
            className={`napkin-render-img ${loaded === url ? "render-wipe" : "opacity-0"}`}
          />
          {ready && swept !== url && (
            <div className="absolute inset-0 overflow-hidden">
              <div className="scanline render-beam" onAnimationEnd={() => setSwept(url)} />
            </div>
          )}
        </div>
      )}
      {sticker}
      {/* The red pen stays at full strength over the render: the review is the point of the napkin. */}
      <div className="absolute inset-0">{children}</div>
      {ready && (
        <div role="group" aria-label="Napkin view" className="napkin-overlay pointer-events-auto absolute left-[4%] top-[3%] flex bg-black px-1 font-ui shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
          {(["sketch", "render"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={track.view === v}
              onClick={() => setTrack((t) => ({ ...t, view: v }))}
              className={`relative px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors after:absolute after:inset-x-2 after:bottom-1 after:h-px after:bg-white after:transition-transform ${
                track.view === v ? "text-white after:scale-x-100" : "text-haze after:scale-x-0 hover:text-white"
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
          <p className="napkin-overlay absolute inset-x-0 bottom-[3.5%] text-center font-mono text-[9px] uppercase tracking-[0.22em] text-graphite/60">
            Rendering with Grok Imagine…
          </p>
        </>
      )}
    </>
  );
}
