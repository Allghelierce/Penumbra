"use client";

import { useMemo } from "react";
import type { HistoricMission } from "@/lib/design";
import { historicStrokes } from "@/lib/history";
import { ChalkDrawing } from "@/components/TemplatePicker";

interface MissionPickerProps {
  missions: HistoricMission[];
  onPick: (mission: HistoricMission) => void;
  onDrawOwn: () => void;
}

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The napkin a real flight replays on: its rocket's drawing as built, or its stand-in sketch. */
function FlightDrawing({ mission }: { mission: HistoricMission }) {
  const strokes = useMemo(() => historicStrokes(mission), [mission]);
  return <ChalkDrawing strokes={strokes} />;
}

function Outcome({ m }: { m: HistoricMission }) {
  return (
    <span
      className={`block min-w-16 shrink-0 border px-1.5 py-px text-center text-[9px] font-semibold uppercase tracking-[0.16em] ${
        m.outcome === "lost" ? "border-nogo text-nogo" : "border-go-signal text-go-signal"
      }`}
    >
      {m.outcome === "lost" ? "Lost" : "Success"}
    </span>
  );
}

/**
 * Real flights as rows: Lost or Success, which flight and when, and what it shows that the numbers don't.
 * Framed rows stand alone on the page; unframed ones sit inside a module.
 */
export function FlightRows({ flights, onPick, framed = true }: { flights: HistoricMission[]; onPick: (m: HistoricMission) => void; framed?: boolean }) {
  return (
    <ul className={framed ? "space-y-2" : "divide-y divide-rule"}>
      {flights.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onPick(m)}
            className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors ${
              framed ? "border border-rule bg-black/70 hover:border-white/60" : "hover:bg-white/[0.04]"
            }`}
          >
            <span className="mt-0.5">
              <Outcome m={m} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] font-semibold text-white">
                  {m.vehicle} · {m.mission}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-haze">{m.date.slice(0, 4)}</span>
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-white/75">{m.lesson}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The first step: real flights to diagnose, each drawn on its napkin with its lesson, plus a blank napkin. */
export default function MissionPicker({ missions, onPick, onDrawOwn }: MissionPickerProps) {
  return (
    <section aria-label="Pick a mission" className="w-full font-ui text-white">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {missions.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m)}
            className="group flex flex-col border border-white/15 bg-black/35 text-left backdrop-blur-[1px] transition-colors hover:border-white focus-visible:border-white"
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden">
              <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.02]">
                <FlightDrawing mission={m} />
              </div>
              {m.outcome === "lost" && (
                <span className="absolute left-3 top-3 bg-redpen px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">Lost</span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 border-t border-white/15 p-4">
              <p className="text-[18px] font-semibold uppercase leading-tight tracking-[0.08em]">{m.vehicle}</p>
              <p className="text-[12px] text-white/70">{m.mission}</p>
              <p className="font-mono text-[11px] text-haze">{formatDate(m.date)}</p>
              <p className="mt-2 text-[12px] leading-snug text-white/85">{m.lesson}</p>
            </div>
          </button>
        ))}
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
