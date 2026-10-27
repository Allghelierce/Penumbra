"use client";

import { useState } from "react";
import TradeChart from "@/components/TradeChart";
import type { TradeCurve, TradePoint } from "@/lib/design";

// Fixture curves shaped like the real thing, until lib/trade.ts's tradeCurve() lands.

function withBest(label: string, unit: string, realX: number, points: TradePoint[]): TradeCurve {
  const best = points.reduce((b, p) => (p.payloadKg > b.payloadKg ? p : b), points[0]);
  return { label, unit, points, realX, bestX: best.x };
}

// Falcon 9 stage 1 stretch: more propellant helps until thrust can't lift it, then the payload falls off a cliff.
const stretch = withBest(
  "Stage 1 tank stretch",
  "×",
  1,
  Array.from({ length: 41 }, (_, i) => {
    const x = 0.6 + i * 0.025;
    const liftoffTwr = 1.45 / x ** 0.8;
    const payloadKg = liftoffTwr < 1.05 ? 0 : Math.max(0, 22800 + 18000 * (x - 1) - 60000 * (x - 1) ** 2);
    return { x: Number(x.toFixed(3)), payloadKg, totalDeltaVMps: 9400 + 1900 * Math.log(x), liftoffTwr };
  }),
);

// Electron engine count, in kilograms: too few engines can't lift off at all.
const engines = withBest(
  "Stage 1 engine count",
  "engines",
  9,
  Array.from({ length: 9 }, (_, i) => {
    const x = 5 + i;
    const liftoffTwr = (1.25 * x) / 9;
    const payloadKg = liftoffTwr < 1.05 ? 0 : Math.max(0, 300 + 22 * (x - 9) - 9 * (x - 9) ** 2);
    return { x, payloadKg, totalDeltaVMps: 9300 - 60 * (x - 9), liftoffTwr };
  }),
);

// Nothing reaches the destination anywhere on the sweep.
const dead = withBest(
  "Stage 2 tank stretch",
  "×",
  1,
  Array.from({ length: 21 }, (_, i) => {
    const x = 0.5 + i * 0.05;
    return { x: Number(x.toFixed(2)), payloadKg: 0, totalDeltaVMps: 7400 + 900 * Math.log(x), liftoffTwr: 1.3 };
  }),
);

function Demo({ curve, start, compact }: { curve: TradeCurve; start: number; compact?: boolean }) {
  const [x, setX] = useState(start);
  const xs = curve.points.map((p) => p.x);
  return (
    <div className="space-y-2">
      {compact ? <TradeChart curve={curve} currentX={x} onPick={setX} caption={null} plotHeight={96} /> : <TradeChart curve={curve} currentX={x} onPick={setX} />}
      <label className="flex items-center gap-3 font-mono text-[11px] text-haze">
        YOU
        <input type="range" min={Math.min(...xs)} max={Math.max(...xs)} step={curve.unit === "×" ? 0.005 : 1} value={x} onChange={(e) => setX(Number(e.target.value))} className="flex-1" />
        <span className="w-14 text-right text-white">{x}</span>
      </label>
    </div>
  );
}

export default function TradeDevPage() {
  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2">
        <Demo curve={stretch} start={1.3} />
        <Demo curve={engines} start={9} />
        <Demo curve={stretch} start={1} />
        <Demo curve={dead} start={1.2} />
        <div className="max-w-[340px]">
          <Demo curve={stretch} start={1.18} />
        </div>
        <div className="w-[428px] space-y-6">
          <Demo curve={stretch} start={1.3} compact />
          <Demo curve={engines} start={11} compact />
        </div>
      </div>
    </main>
  );
}
