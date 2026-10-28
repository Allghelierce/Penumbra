"use client";

import { useMemo } from "react";
import type { RocketTemplate, Stroke } from "@/lib/design";
import { drawTemplate } from "@/lib/templates";

interface TemplatePickerProps {
  templates: RocketTemplate[];
  onPick: (template: RocketTemplate) => void;
}

/** Payload as it's usually quoted: tonnes from a tonne up, kilograms below. */
export function payloadText(kg: number): string {
  if (kg < 1_000) return `${Math.round(kg).toLocaleString("en-US")} kg`;
  const t = kg / 1_000;
  return `${t >= 100 ? Math.round(t).toLocaleString("en-US") : t.toFixed(1)} t`;
}

/** A payload capacity rounded down to what payloadText shows, so the most it can carry always still flies. */
export function floorShown(kg: number): number {
  if (kg >= 100_000) return Math.floor(kg / 1_000) * 1_000;
  if (kg >= 1_000) return Math.floor(kg / 100) * 100;
  return Math.max(0, Math.floor(kg));
}

/** The real rocket as drawn on the napkin, at its true proportions. */
function Outline({ template }: { template: RocketTemplate }) {
  const strokes = useMemo(() => drawTemplate(template, template.design).strokes, [template]);
  return <ChalkDrawing strokes={strokes} />;
}

/** Napkin strokes in chalk, filling a 3:4 box: a card's picture of its rocket. */
export function ChalkDrawing({ strokes }: { strokes: Stroke[] }) {
  return (
    <svg viewBox="0 0 300 400" className="absolute inset-0 h-full w-full" aria-hidden>
      {strokes.map((s, i) => (
        <polyline
          key={i}
          points={s.points.map(([x, y]) => `${(x * 300).toFixed(1)},${(y * 400).toFixed(1)}`).join(" ")}
          fill="none"
          stroke="#f4f1ea"
          strokeWidth={s.detail ? 0.7 : 1.1}
          strokeOpacity={s.detail ? 0.6 : 0.92}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/** The main way in: four rockets that flew, drawn to scale, to modify. */
export default function TemplatePicker({ templates, onPick }: TemplatePickerProps) {
  return (
    <section aria-label="Pick a real rocket" className="w-full font-ui text-white">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            className="group flex flex-col border border-white/15 bg-black/35 text-left backdrop-blur-[1px] transition-colors hover:border-white focus-visible:border-white"
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden transition-transform duration-500 group-hover:scale-[1.02]">
              <Outline template={t} />
            </div>
            <div className="flex flex-1 flex-col gap-1 border-t border-white/15 p-4">
              <p className="text-[18px] font-semibold uppercase leading-tight tracking-[0.08em]">{t.name}</p>
              <p className="line-clamp-3 text-[12px] leading-snug text-white/70">{t.blurb}</p>
              <p className="mt-auto pt-2 font-mono text-[11px] text-haze">
                {Math.round(t.design.heightM)} m tall, {t.design.stages.length} stages, {payloadText(t.realPayloadLeoKg)} to orbit
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
