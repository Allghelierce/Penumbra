"use client";

import { useState } from "react";

const PURPOSES = [
  "Choose a real rocket",
  "The engineer's napkin",
  "Red pen finds what failed",
  "See it real",
  "Relive the flight",
  "What SpaceX learned",
];

interface StepBarProps {
  steps: string[];
  /** Index of the step the user is on. */
  current: number;
  /** One line per step saying what it's for; defaults to the mission flow's. */
  purposes?: string[];
}

/** Thin numbered progress bar for the mission flow: done steps get a tick, the current one is lit. */
export default function StepBar({ steps, current, purposes = PURPOSES }: StepBarProps) {
  const [hover, setHover] = useState<number | null>(null);
  const focus = hover ?? current;
  return (
    <nav aria-label="Steps" className="w-full border-b border-white/15 bg-black font-ui">
      <ol className="flex items-stretch">
        {steps.map((step, i) => {
          const state = i < current ? "done" : i === current ? "current" : "next";
          return (
            <li key={step} className="relative flex-1" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={purposes[i]}>
              <div
                aria-current={state === "current" ? "step" : undefined}
                className={`flex items-center gap-2 whitespace-nowrap px-3 py-2 text-[11px] uppercase tracking-[0.18em] transition-colors ${
                  state === "current" ? "font-semibold text-white" : state === "done" ? "text-white/45" : "text-white/25"
                }`}
              >
                <span className="font-mono text-[10px] tracking-normal">{state === "done" ? "✓" : String(i + 1).padStart(2, "0")}</span>
                {step}
              </div>
              <span
                className={`absolute inset-x-0 -bottom-px h-[2px] transition-colors ${
                  state === "current" ? "bg-white" : state === "done" ? "bg-white/30" : "bg-transparent"
                }`}
              />
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="h-6 px-3 pt-1 text-[11px] tracking-[0.04em] text-haze">
        {purposes[focus] ?? ""}
      </p>
    </nav>
  );
}
