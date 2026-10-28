"use client";

// A small preview of the flight the launch will show: the simulated trajectory drawn through
// the layers of the atmosphere, with a marker that keeps flying it and the flight's events.

import { useMemo } from "react";
import type { FlightEventKind, FlightTrace } from "@/lib/design";

const W = 420;
const H = 170;
/** The left gutter holds the layer names, so the flight path never crosses them. */
const GUTTER = 78;
const PAD = { left: GUTTER, right: 10, top: 12, bottom: 18 };

/** Linear up to 120 km, where the layers are; compressed above, so orbit still fits. */
function scaleAltitude(km: number, top: number): number {
  const knee = 120;
  const share = 0.62;
  if (km <= knee) return (Math.max(0, km) / knee) * share;
  return share + (1 - share) * (Math.log10(km / knee) / Math.log10(top / knee));
}

const LAYERS: { name: string; from: number; to: number }[] = [
  { name: "Troposphere", from: 0, to: 12 },
  { name: "Stratosphere", from: 12, to: 50 },
  { name: "Mesosphere", from: 50, to: 80 },
  { name: "Thermosphere", from: 80, to: 700 },
];

const EVENT_LABEL: Partial<Record<FlightEventKind, string>> = {
  "max-q": "Max-Q",
  "stage-sep": "Stage sep",
  "engine-cutoff": "Cutoff",
  orbit: "Orbit",
  apogee: "Apogee",
  impact: "Impact",
  arrival: "Arrival",
  escape: "Escape",
  "fuel-exhausted": "Burnout",
};

export default function TrajectoryPreview({ trace }: { trace: FlightTrace }) {
  const plot = useMemo(() => {
    // Past LEO the coast runs for days and out to a million km: preview the climb to the parking orbit.
    const parked = trace.events.find((e) => e.kind === "orbit");
    const leaves = trace.events.some((e) => e.kind === "arrival" || e.kind === "escape");
    const until = parked && leaves ? parked.tS : Infinity;
    const shown = trace.points.filter((p) => p.tS <= until + 1e-6);
    const maxAlt = Math.max(1, ...shown.map((p) => p.altitudeKm));
    const top = Math.max(400, maxAlt * 1.25);
    const maxRange = Math.max(50, ...shown.map((p) => p.downrangeKm)) * 1.04;
    const x = (km: number) => PAD.left + (km / maxRange) * (W - PAD.left - PAD.right);
    const y = (km: number) => H - PAD.bottom - scaleAltitude(km, top) * (H - PAD.top - PAD.bottom);
    const step = Math.max(1, Math.floor(shown.length / 160));
    const pts = shown.filter((_, i) => i % step === 0 || i === shown.length - 1);
    const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.downrangeKm).toFixed(1)} ${y(p.altitudeKm).toFixed(1)}`).join(" ");
    const at = (tS: number) => shown.reduce((best, p) => (Math.abs(p.tS - tS) < Math.abs(best.tS - tS) ? p : best), shown[0]);
    // Label events left to right, skipping any that would land on top of the previous label.
    const events: { label: string; x: number; y: number; anchor: "start" | "end"; dy: number }[] = [];
    for (const e of trace.events) {
      if (e.tS > until) continue;
      const label = EVENT_LABEL[e.kind];
      if (!label) continue;
      const p = at(e.tS);
      const ex = x(p.downrangeKm);
      const ey = y(p.altitudeKm);
      const prev = events[events.length - 1];
      if (prev && Math.hypot(ex - prev.x, ey - prev.y) < 26) continue;
      const nearRight = ex > W - 70;
      events.push({ label, x: ex, y: ey, anchor: nearRight ? "end" : "start", dy: 3 });
    }
    return { path, events, x, y, top, maxAlt };
  }, [trace]);

  const karman = plot.y(100);
  const flies = trace.points.length > 2 && plot.maxAlt > 0.5;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Predicted flight, peaking at ${Math.round(plot.maxAlt)} km`}>
      {/* atmosphere layers */}
      {LAYERS.map((layer, i) => {
        const y0 = plot.y(layer.from);
        const y1 = plot.y(Math.min(layer.to, plot.top));
        const tall = y0 - y1 >= 11;
        return (
          <g key={layer.name}>
            <rect x={PAD.left} y={y1} width={W - PAD.left - PAD.right} height={Math.max(0, y0 - y1)} fill="#fff" opacity={0.015 + (i % 2) * 0.02} />
            {/* Name each band in the gutter beside it; bands too thin to hold a label stay unnamed. */}
            {tall && (
              <text x={4} y={(y0 + Math.max(y1, karman + 4)) / 2 + 3} fontSize="8" letterSpacing="1" fill="var(--haze)" fontFamily="var(--font-barlow)">
                {layer.name.toUpperCase()}
              </text>
            )}
          </g>
        );
      })}
      {/* the Kármán line: where space begins */}
      <line x1={PAD.left} x2={W - PAD.right} y1={karman} y2={karman} stroke="#fff" strokeOpacity="0.55" strokeDasharray="4 3" />
      <text x={4} y={karman + 3} fontSize="8" letterSpacing="1" fill="#fff" fontFamily="var(--font-barlow)">
        KÁRMÁN 100 KM
      </text>
      <text x={4} y={PAD.top + 6} fontSize="8" letterSpacing="1" fill="var(--haze)" fontFamily="var(--font-barlow)">
        SPACE
      </text>
      {/* ground */}
      <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#fff" strokeOpacity="0.35" />

      {flies ? (
        <>
          <path d={plot.path} fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" className="trajectory-draw" pathLength={1} />
          {plot.events.map((e, i) => (
            <g key={i}>
              <circle cx={e.x} cy={e.y} r="2.4" fill="#000" stroke="#fff" strokeWidth="1.2" />
              <text
                x={e.anchor === "end" ? e.x - 7 : e.x + 7}
                y={e.y + e.dy}
                textAnchor={e.anchor}
                fontSize="8"
                letterSpacing="0.8"
                fill="#fff"
                fontFamily="var(--font-barlow)"
              >
                {e.label.toUpperCase()}
              </text>
            </g>
          ))}
          <circle r="3.2" fill="var(--flame)" className="trajectory-marker">
            <animateMotion dur="6s" repeatCount="indefinite" path={plot.path} keyPoints="0;1" keyTimes="0;1" calcMode="linear" />
          </circle>
        </>
      ) : (
        <text x={W / 2} y={H - PAD.bottom - 10} textAnchor="middle" fontSize="11" letterSpacing="1.5" fill="var(--nogo)" fontFamily="var(--font-barlow)">
          NEVER LEAVES THE PAD
        </text>
      )}
    </svg>
  );
}
