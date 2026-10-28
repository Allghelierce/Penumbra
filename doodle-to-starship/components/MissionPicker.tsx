"use client";

import type { HistoricMission } from "@/lib/design";
import { DEMO_SKETCHES } from "@/lib/demo-sketches";
import { ChalkDrawing } from "@/components/TemplatePicker";

interface MissionPickerProps {
  missions: HistoricMission[];
  onPick: (mission: HistoricMission) => void;
  onDrawOwn: () => void;
}

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The first step: real missions to diagnose, each drawn as its napkin sketch, plus a blank napkin. */
export default function MissionPicker({ missions, onPick, onDrawOwn }: MissionPickerProps) {
  return (
    <section aria-label="Pick a mission" className="w-full font-ui text-white">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {missions.map((m) => {
          const sketch = DEMO_SKETCHES.find((d) => d.id === m.sketchId);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onPick(m)}
              className="group flex flex-col border border-white/15 bg-black/35 text-left backdrop-blur-[1px] transition-colors hover:border-white focus-visible:border-white"
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden">
                {sketch && (
                  <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.02]">
                    <ChalkDrawing strokes={sketch.strokes} />
                  </div>
                )}
                {m.outcome === "lost" && (
                  <span className="absolute left-3 top-3 bg-redpen px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">Lost</span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 border-t border-white/15 p-4">
                <p className="text-[18px] font-semibold uppercase leading-tight tracking-[0.08em]">{m.vehicle}</p>
                <p className="text-[12px] text-white/70">{m.mission}</p>
                <p className="font-mono text-[11px] text-haze">{formatDate(m.date)}</p>
                {m.failure && (
                  <p className="mt-2 text-[12px] leading-snug text-white/85">
                    <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-nogo">What failed?</span>
                    {m.failure.label}
                  </p>
                )}
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onDrawOwn}
          className="flex min-h-64 flex-col items-center justify-center gap-3 border border-white/40 bg-black p-6 text-white/75 transition-colors hover:border-white hover:text-white focus-visible:border-white"
        >
          <span className="text-4xl font-light leading-none">+</span>
          <span className="text-[13px] font-semibold uppercase tracking-[0.18em]">Draw your own</span>
          <span className="text-[12px] text-haze">Start from a blank napkin</span>
        </button>
      </div>
    </section>
  );
}
