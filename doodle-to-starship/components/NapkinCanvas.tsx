"use client";

import { useCallback, useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { NAPKIN_ASPECT, type Point, type Stroke } from "@/lib/design";
import { drawStrokes } from "@/lib/napkin";

interface NapkinCanvasProps {
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
  disabled?: boolean;
  /** Layers drawn over the sketch in the same 3:4 box (part labels, red pen). */
  children?: ReactNode;
  /** What to show on an empty drawing area; defaults to a short prompt. */
  hint?: ReactNode;
}

/** Strokes are chalk on the night sky. */
const CHALK = "#f4f1ea";

/** Ignore pointer jitter smaller than this (normalized units). */
const MIN_STEP = 0.0025;

const clamp = (v: number) => Math.min(1, Math.max(0, v));

export default function NapkinCanvas({ strokes, onChange, disabled, children, hint }: NapkinCanvasProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<Point[] | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const { width, height } = box.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const pxWidth = Math.round(width * dpr);
    const pxHeight = Math.round(height * dpr);
    if (canvas.width !== pxWidth || canvas.height !== pxHeight) {
      canvas.width = pxWidth;
      canvas.height = pxHeight;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawStrokes(ctx, strokes, width, height, CHALK);
  }, [strokes]);

  useEffect(() => {
    redraw();
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(redraw);
    observer.observe(box);
    return () => observer.disconnect();
  }, [redraw]);

  function toPoint(e: PointerEvent): Point {
    const rect = boxRef.current!.getBoundingClientRect();
    return [clamp((e.clientX - rect.left) / rect.width), clamp((e.clientY - rect.top) / rect.height)];
  }

  function handleDown(e: PointerEvent<HTMLCanvasElement>) {
    if (disabled || e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Pen down: everything layered over the drawing steps aside until the stroke ends.
    boxRef.current?.setAttribute("data-drawing", "true");
    live.current = [toPoint(e)];
  }

  function handleMove(e: PointerEvent<HTMLCanvasElement>) {
    const points = live.current;
    if (!points) return;
    const p = toPoint(e);
    const prev = points[points.length - 1];
    if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) < MIN_STEP) return;
    points.push(p);
    // Draw only the new segment; the whole sketch is redrawn when the stroke is committed.
    const ctx = canvasRef.current?.getContext("2d");
    const rect = boxRef.current?.getBoundingClientRect();
    if (ctx && rect) drawStrokes(ctx, [{ points: [prev, p] }], rect.width, rect.height, CHALK);
  }

  function handleUp() {
    boxRef.current?.removeAttribute("data-drawing");
    const points = live.current;
    live.current = null;
    if (points && points.length > 0) onChange([...strokes, { points }]);
  }

  return (
    <div
      ref={boxRef}
      className="napkin relative h-full max-w-full touch-none select-none"
      style={{ aspectRatio: NAPKIN_ASPECT }}
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full ${disabled ? "cursor-default" : "cursor-crosshair"}`}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
      />
      {strokes.length === 0 && <div className="napkin-overlay">{hint ?? <EmptyHint />}</div>}
      <div className="napkin-overlay pointer-events-none absolute inset-0">{children}</div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-ink-muted">
      <p className="font-display text-[26px] font-semibold text-white/80">Draw your spacecraft here</p>
      <p className="text-[14px]">A rocket, a lander, a Mars ship. Rough is fine.</p>
    </div>
  );
}
