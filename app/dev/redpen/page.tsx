"use client";

import { useState } from "react";
import RedPenOverlay from "@/components/RedPenOverlay";
import type { RedPenMark } from "@/lib/design";

// Dev-only: the red pen on its own, every mark kind, with a replay button.

const SETS: Record<string, { marks: RedPenMark[]; numbers: (number | null)[] }> = {
  pass: {
    marks: [{ kind: "tick", at: [0.66, 0.5], note: "Good to fly" }],
    numbers: [null],
  },
  issues: {
    marks: [
      { kind: "arrow", from: [0.78, 0.84], to: [0.56, 0.9], note: "TWR 1.18: +1 engine" },
      { kind: "circle", center: [0.5, 0.3], radius: 0.09, note: "Slow upper stage" },
    ],
    numbers: [1, 2],
  },
  history: {
    marks: [
      { kind: "outline", box: [0.44, 0.22, 0.12, 0.3], note: "" },
      { kind: "callout", anchor: [0.44, 0.36], label: [0.22, 0.36], note: "Second stage" },
      { kind: "arrow", from: [0.8, 0.3], to: [0.57, 0.36], note: "Strut snapped" },
    ],
    numbers: [null, null, 1],
  },
  all: {
    marks: [
      { kind: "outline", box: [0.44, 0.22, 0.12, 0.3], note: "" },
      { kind: "dimension", from: [0.3, 0.1], to: [0.3, 0.95], note: "70 m" },
      { kind: "callout", anchor: [0.56, 0.6], label: [0.8, 0.6], note: "9× Merlin" },
      { kind: "circle", center: [0.5, 0.3], radius: 0.09, note: "Too heavy" },
      { kind: "arrow", from: [0.78, 0.84], to: [0.56, 0.9], note: "TWR 1.18: +1 engine" },
      { kind: "ghost-line", points: [[0.42, 0.95], [0.42, 1.0], [0.58, 1.0], [0.58, 0.95]], note: "Add a stage" },
      { kind: "tick", at: [0.7, 0.5], note: "0.4 km/s spare" },
    ],
    numbers: [null, null, null, 1, 2, 3, null],
  },
};

export default function RedPenDev() {
  const [set, setSet] = useState("issues");
  const [play, setPlay] = useState(0);
  const { marks, numbers } = SETS[set];
  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <div className="mb-4 flex gap-2 font-mono text-xs">
        {Object.keys(SETS).map((k) => (
          <button
            key={k}
            onClick={() => {
              setSet(k);
              setPlay((p) => p + 1);
            }}
            className={`rounded px-2 py-1 ${k === set ? "bg-white text-black" : "border border-white/30"}`}
          >
            {k}
          </button>
        ))}
        <button onClick={() => setPlay((p) => p + 1)} className="rounded border border-white/30 px-2 py-1">
          replay
        </button>
      </div>
      <div className="napkin relative aspect-[3/4] w-[480px]">
        {/* A stand-in rocket in chalk. */}
        <svg viewBox="0 0 300 400" className="absolute inset-0 h-full w-full" aria-hidden>
          <path
            d="M150 40 C162 60 168 80 168 100 L168 360 L132 360 L132 100 C132 80 138 60 150 40 Z M132 210 L168 210 M140 360 L136 380 M150 360 L150 382 M160 360 L164 380"
            fill="none"
            stroke="#f3efe6"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <RedPenOverlay parts={[]} marks={marks} numbers={numbers} playKey={`${set}-${play}`} />
      </div>
    </main>
  );
}
