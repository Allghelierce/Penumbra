"use client";

import { useEffect, useRef, useState } from "react";
import type { DestinationId, Part, SketchReading, Stroke } from "@/lib/design";
import { replaySketch } from "@/lib/attract";
import { drawStrokes } from "@/lib/napkin";
import { detailStrokes } from "@/lib/sketch/detail";
import { readFromGeometry } from "@/lib/sketch/geometry";

interface NapkinAssistProps {
  strokes: Stroke[];
  destination: DestinationId;
  /** Applies strokes to the napkin (the kept detail merged in). */
  onKeep: (strokes: Stroke[]) => void;
  /** Off once the sketch is checked: the red pen takes over the napkin then. */
  active?: boolean;
}

/** Below this the sketch doesn't read as a vehicle yet. */
const PASS = 0.5;
/** Time after the last stroke before the sketch is read again. */
const SETTLE_MS = 400;
const DETAIL_INK = "rgba(125, 178, 255, 0.9)";
/** How long the detail takes to draw itself in. */
const DETAIL_MS = 2200;

type Tag = { key: string; text: string; x: number; y: number; left: boolean };

function engineCount(reading: SketchReading) {
  return reading.design.stages[0]?.engines.reduce((n, c) => n + c.count, 0) ?? 0;
}

// One tag per thing recognised, beside the parts it covers.
function tagsFor(reading: SketchReading): Tag[] {
  const { parts, design } = reading;
  const tags: Tag[] = [];
  const add = (key: string, text: string, group: Part[]) => {
    if (group.length === 0) return;
    const x0 = Math.min(...group.map((p) => p.box[0]));
    const x1 = Math.max(...group.map((p) => p.box[0] + p.box[2]));
    const y = (Math.min(...group.map((p) => p.box[1])) + Math.max(...group.map((p) => p.box[1] + p.box[3]))) / 2;
    const left = x1 > 0.74;
    tags.push({ key, text, x: left ? x0 - 0.015 : x1 + 0.015, y, left });
  };
  const of = (kind: Part["kind"]) => parts.filter((p) => p.kind === kind);
  add("nose", "Nose", of("nose"));
  add("payload", "Payload", of("payload"));
  const tanks = of("tank");
  if (design.stages.length > 1) {
    design.stages.forEach((_, i) => add(`stage-${i}`, `Stage ${i + 1}`, tanks.filter((p) => (p.stageIndex ?? 0) === i)));
  } else add("tank", "Tank", tanks);
  const engines = engineCount(reading);
  add("engine", engines > 1 ? `${engines}× engine` : "Engine", of("engine"));
  add("fin", "Fins", of("fin"));
  add("legs", "Legs", of("landing-legs"));
  add("heat-shield", "Heat shield", of("heat-shield"));
  add("window", "Window", of("window"));
  add("solar", "Solar", of("solar-panel"));
  // Nudge tags apart where two parts sit at the same height on the same side.
  const placed: Tag[] = [];
  for (const tag of [...tags].sort((a, b) => a.y - b.y)) {
    const above = placed.filter((t) => t.left === tag.left).at(-1);
    placed.push(above && tag.y - above.y < 0.035 ? { ...tag, y: above.y + 0.035 } : tag);
  }
  return placed;
}

function caption(reading: SketchReading) {
  const stages = reading.design.stages.length;
  const engines = engineCount(reading);
  const kinds = new Set(reading.parts.map((p) => p.kind));
  const bits = [stages > 1 ? `a ${stages}-stage rocket` : "a single-stage rocket"];
  if (engines > 0) bits.push(`${engines} engine${engines > 1 ? "s" : ""}`);
  if (kinds.has("fin")) bits.push("fins");
  if (kinds.has("landing-legs")) bits.push("landing legs");
  if (kinds.has("heat-shield")) bits.push("a heat shield");
  if (kinds.has("window")) bits.push("a window");
  if (kinds.has("solar-panel")) bits.push("solar panels");
  return `${bits.join(", ")}.`;
}

/**
 * Reads the sketch as it's drawn and points out what it sees, then offers to draw detail into it
 * in a blue technical pen that the user can keep or undo. Pure geometry, no API calls.
 */
export default function NapkinAssist({ strokes, destination, onKeep, active = true }: NapkinAssistProps) {
  const [seen, setSeen] = useState<{ strokes: Stroke[]; reading: SketchReading | null } | null>(null);
  const [detail, setDetail] = useState<{ base: Stroke[]; all: Stroke[]; shown: Stroke[]; done: boolean } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const replay = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!active || strokes.length === 0) return;
    const timer = window.setTimeout(() => {
      let reading: SketchReading | null = null;
      try {
        reading = readFromGeometry(strokes, destination);
      } catch {
        reading = null;
      }
      setSeen({ strokes, reading });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [strokes, destination, active]);

  // Drawing again, clearing or loading a sample drops a detail that wasn't kept.
  useEffect(() => () => replay.current?.abort(), [strokes]);
  const pending = detail && detail.base === strokes ? detail : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = canvas?.parentElement;
    if (!canvas || !box) return;
    const paint = () => {
      const { width, height } = box.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (pending) drawStrokes(ctx, pending.shown, width, height, DETAIL_INK);
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(box);
    return () => observer.disconnect();
  }, [pending]);

  if (!active || strokes.length === 0) return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;

  const reading = seen?.reading ?? null;
  const confident = reading !== null && (reading.confidence ?? 1) >= PASS;

  function addDetail() {
    if (!reading) return;
    const all = detailStrokes(reading);
    if (all.length === 0) return;
    replay.current?.abort();
    const controller = new AbortController();
    replay.current = controller;
    const base = strokes;
    setDetail({ base, all, shown: [], done: false });
    void replaySketch(all, (shown) => setDetail((d) => (d && d.base === base ? { ...d, shown } : d)), { durationMs: DETAIL_MS, signal: controller.signal }).then(() => {
      if (!controller.signal.aborted) setDetail((d) => (d && d.base === base ? { ...d, shown: all, done: true } : d));
    });
  }

  const button = "px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors";
  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {confident &&
        tagsFor(reading).map((tag) => (
          <div
            key={`${tag.key}:${tag.text}`}
            className={`napkin-overlay absolute flex -translate-y-1/2 items-center gap-1 transition-[left,top] duration-300 ${tag.left ? "-translate-x-full flex-row-reverse" : ""}`}
            style={{ left: `${tag.x * 100}%`, top: `${tag.y * 100}%`, opacity: 0, animation: "fade-in 0.45s ease-out forwards" }}
          >
            <span className="h-px w-3 bg-redpen" />
            <span className="whitespace-nowrap bg-black/70 px-1 py-px font-mono text-[9px] uppercase tracking-[0.14em] text-white/90">{tag.text}</span>
          </div>
        ))}
      {seen && (
        <p className="napkin-overlay absolute inset-x-[6%] bottom-[2.5%] truncate text-center font-mono text-[11px] text-white/80">
          {confident ? (
            <>
              <span className="text-redpen">I see:</span> {caption(reading)}
            </>
          ) : (
            <span className="text-haze">Keep going: I can&apos;t see a vehicle yet.</span>
          )}
        </p>
      )}
      <div className="napkin-overlay pointer-events-auto absolute left-[4%] top-[3%] flex bg-black font-ui">
        {pending?.done ? (
          <>
            <button type="button" onClick={() => onKeep([...strokes, ...pending.all])} className={`${button} text-white hover:text-white/70`}>
              Keep
            </button>
            <button type="button" onClick={() => setDetail(null)} className={`${button} text-haze hover:text-white`}>
              Undo
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={addDetail}
            disabled={!confident || pending !== null}
            className={`${button} border border-white/30 text-white hover:border-white disabled:border-white/10 disabled:text-white/35`}
          >
            {pending ? "Drawing detail…" : "✦ Add detail"}
          </button>
        )}
      </div>
    </>
  );
}
