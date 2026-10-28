"use client";

import { useState } from "react";
import TradeChart from "@/components/TradeChart";
import type { DestinationId, TradeCurve } from "@/lib/design";
import { TEMPLATES } from "@/lib/templates";
import { stretchFromReal, tradeCurve, type TradeSweep } from "@/lib/trade";

// Real trade curves from lib/trade.ts on the real-rocket templates, plus one that can't get anywhere.

const CASES: { title: string; template: string; sweep: TradeSweep; destination?: DestinationId; start?: number }[] = [
  { title: "Falcon 9 · stage 1 stretch", template: "falcon9", sweep: { kind: "tank-stretch", stageIndex: 0 }, start: 1.45 },
  { title: "Falcon 9 · stage 2 stretch", template: "falcon9", sweep: { kind: "tank-stretch", stageIndex: 1 } },
  { title: "Falcon 9 · stage 1 engines", template: "falcon9", sweep: { kind: "engine-count", stageIndex: 0 }, start: 7 },
  { title: "Saturn V · stage 1 stretch", template: "saturn-v", sweep: { kind: "tank-stretch", stageIndex: 0 }, start: 1.2 },
  { title: "Starship · booster stretch", template: "starship", sweep: { kind: "tank-stretch", stageIndex: 0 } },
  { title: "Falcon 9 · stage 2 engines", template: "falcon9", sweep: { kind: "engine-count", stageIndex: 1 } },
  { title: "Starship · booster engines", template: "starship", sweep: { kind: "engine-count", stageIndex: 0 }, start: 30 },
  { title: "Electron · stage 1 engines", template: "electron", sweep: { kind: "engine-count", stageIndex: 0 }, start: 7 },
  { title: "Electron · stage 1 stretch to Mars", template: "electron", sweep: { kind: "tank-stretch", stageIndex: 0 }, destination: "mars-transfer", start: 1.3 },
];

function curveFor(c: (typeof CASES)[number]): TradeCurve {
  const t = TEMPLATES.find((x) => x.id === c.template)!;
  return tradeCurve(t.design, c.sweep, { destination: c.destination, real: t.design });
}

// After a change elsewhere (Electron's stage 1 at ×1.55), the stage 2 sweep's as-built point isn't the real rocket.
function modifiedCurve(): TradeCurve {
  const t = TEMPLATES.find((x) => x.id === "electron")!;
  const yours = stretchFromReal(t.design, t.design, 0, 1.55);
  return tradeCurve(yours, { kind: "tank-stretch", stageIndex: 1 }, { real: t.design });
}

function Demo({ title, curve, start, compact }: { title: string; curve: TradeCurve; start?: number; compact?: boolean }) {
  const [x, setX] = useState(start ?? curve.realX);
  const xs = curve.points.map((p) => p.x);
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-haze">{title}</p>
      {compact ? <TradeChart curve={curve} currentX={x} onPick={setX} caption={null} plotHeight={96} /> : <TradeChart curve={curve} currentX={x} onPick={setX} />}
      <label className="flex items-center gap-3 font-mono text-[11px] text-haze">
        YOU
        <input type="range" min={Math.min(...xs)} max={Math.max(...xs)} step={curve.unit === "×" ? 0.05 : 1} value={x} onChange={(e) => setX(Number(e.target.value))} className="flex-1" />
        <span className="w-14 text-right text-white">{x}</span>
      </label>
    </div>
  );
}

export default function TradeDevPage() {
  const curves = CASES.map((c) => ({ ...c, curve: curveFor(c) }));
  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2">
        <Demo title="Electron · stage 2 stretch, after stage 1 ×1.55" curve={modifiedCurve()} start={1} />
        {curves.map((c) => (
          <Demo key={c.title} title={c.title} curve={c.curve} start={c.start} />
        ))}
        <div className="w-[428px] space-y-6">
          <Demo title="Compact · Falcon 9 stage 1" curve={curves[0].curve} start={1.45} compact />
          <Demo title="Compact · Electron engines" curve={curves[7].curve} start={7} compact />
        </div>
      </div>
    </main>
  );
}
