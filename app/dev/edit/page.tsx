"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EditHandles, { type Stretch } from "@/components/EditHandles";
import { applyAction } from "@/lib/actions";
import { NAPKIN_ASPECT, type TemplateId } from "@/lib/design";
import { drawStrokes } from "@/lib/napkin";
import { analyze } from "@/lib/physics";
import { TEMPLATES, drawTemplate, templateById } from "@/lib/templates";

// EditHandles over each real rocket: drag the stage tops, nudge with the arrow keys, change engines, add and remove stages.
export default function EditDevPage() {
  const [id, setId] = useState<TemplateId>("falcon9");
  const template = templateById(id);
  const [design, setDesign] = useState(template.design);
  const [log, setLog] = useState<string[]>([]);
  const [stretch, setStretch] = useState<Stretch | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const drawing = useMemo(() => drawTemplate(template, design), [template, design]);
  const analysis = useMemo(() => analyze(design), [design]);

  useEffect(() => {
    const el = canvas.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const paint = () => {
      const { width, height } = box.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawStrokes(ctx, drawing.strokes, width, height, "rgba(255,255,255,0.85)");
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(box);
    return () => observer.disconnect();
  }, [drawing]);

  return (
    <main className="flex min-h-screen gap-8 bg-black p-6 font-ui text-white">
      <div className="napkin relative h-[86vh] shrink-0" style={{ aspectRatio: NAPKIN_ASPECT }}>
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        <EditHandles
          drawing={drawing}
          design={design}
          onPreview={setStretch}
          onAction={(action) => {
            setLog((l) => [JSON.stringify(action), ...l].slice(0, 12));
            setDesign((d) => applyAction(d, action));
          }}
        />
      </div>
      <aside className="flex min-w-0 flex-1 flex-col gap-4 text-[12px]">
        <div className="flex gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setId(t.id);
                setDesign(t.design);
                setLog([]);
              }}
              className={`border px-3 py-1.5 uppercase tracking-[0.18em] ${t.id === id ? "border-white" : "border-white/25 text-haze"}`}
            >
              {t.name}
            </button>
          ))}
        </div>
        <p className="font-mono text-haze">preview: {stretch ? `stage ${stretch.stageIndex} ×${stretch.factor.toFixed(2)}` : "none"}</p>
        <p className="font-mono">
          Δv {Math.round(analysis.totalDeltaVMps)} m/s · TWR {analysis.liftoffTwr.toFixed(2)} · {analysis.verdict}
        </p>
        <ul className="font-mono text-white/80">
          {design.stages.map((s, i) => (
            <li key={i}>
              {s.label}: {Math.round(s.tankVolumeM3)} m³, {s.engines.map((c) => `${c.count}× ${c.engine}`).join(" + ")}
              {s.recover ? " · recover" : ""}
            </li>
          ))}
        </ul>
        <ol data-testid="log" className="font-mono text-[11px] text-haze">
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </aside>
    </main>
  );
}
