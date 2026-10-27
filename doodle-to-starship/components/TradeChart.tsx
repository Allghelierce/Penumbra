"use client";

// Payload against one design change to a real rocket: where the real one sits, where the best
// point is, and where your change puts it. Hover (or arrow keys) reads any point; click picks it.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { TradeCurve, TradePoint } from "@/lib/design";
import { km } from "@/lib/physics/format";
import { explainCurve } from "@/lib/trade";

type MarkKey = "real" | "best" | "you";

const COLOR: Record<MarkKey, string> = { real: "#ffffff", best: "var(--go-signal)", you: "var(--redpen)" };
const NAME: Record<MarkKey, string> = { real: "REAL", best: "BEST", you: "YOU" };

const PAD_R = 16;
const PAD_B = 26;
const LANE_H = 18;
/** IBM Plex Mono advance at 11px plus the label tracking; it's monospace, so this is exact enough to lay labels out. */
const CHAR_W = 7;
/** Same at 10px, for tick labels. */
const TICK_W = 6.2;

/** Fritsch–Carlson tangents: a smooth curve through every point that never overshoots, so payload never dips below zero. */
export function monotoneTangents(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  if (n < 2) return xs.map(() => 0);
  const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]));
  const m = xs.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return m;
}

type Cmd = ["M" | "L", number, number] | ["C", number, number, number, number, number, number];

/**
 * The curve as drawn, in data units. Each run of points that reach the destination is a monotone spline; where
 * the payload hits zero (the stack can't lift off, or can't get there) it's a straight drop between the two
 * measured points, never smoothed into a slide. `at` reads the same shape anywhere along the sweep.
 */
export function curveModel(xs: number[], ys: number[]) {
  const n = xs.length;
  const m = new Array<number>(n).fill(0);
  for (let i = 0; i < n; ) {
    let j = i;
    if (ys[i] > 0) {
      while (j + 1 < n && ys[j + 1] > 0) j++;
      monotoneTangents(xs.slice(i, j + 1), ys.slice(i, j + 1)).forEach((v, k) => (m[i + k] = v));
    }
    i = j + 1;
  }
  const smooth = (i: number) => ys[i] > 0 && ys[i + 1] > 0;
  const at = (x: number): number => {
    if (n === 0) return 0;
    if (n === 1 || x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    if (!smooth(i)) return ys[i] + (ys[i + 1] - ys[i]) * t;
    const t2 = t * t;
    const t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    return Math.max(0, y);
  };
  const cmds: Cmd[] = n ? [["M", xs[0], ys[0]]] : [];
  for (let i = 0; i < n - 1; i++) {
    const h = xs[i + 1] - xs[i];
    cmds.push(
      smooth(i)
        ? ["C", xs[i] + h / 3, ys[i] + (m[i] * h) / 3, xs[i + 1] - h / 3, ys[i + 1] - (m[i + 1] * h) / 3, xs[i + 1], ys[i + 1]]
        : ["L", xs[i + 1], ys[i + 1]],
    );
  }
  return { at, cmds };
}

function niceStep(span: number, count: number) {
  const raw = span / Math.max(1, count);
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

function ticks(lo: number, hi: number, step: number) {
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

const trim = (v: number) => String(Number(v.toFixed(2)));
const fmtX = (x: number, unit: string) => (unit === "×" ? `${trim(x)}×` : `${trim(x)} ${unit}`);

/** Tonnes for big rockets, kilograms when the whole curve is under 2 t (Electron). Rounded like explainCurve's caption, so they agree. */
export function payloadText(kg: number, tonnes: boolean) {
  const v = Math.max(0, kg);
  if (!tonnes) return `${Math.round(v).toLocaleString("en-US")} kg`;
  if (v <= 0) return "0 t";
  return v >= 10_000 ? `${Math.round(v / 1000).toLocaleString("en-US")} t` : `${(v / 1000).toFixed(1)} t`;
}

const pct = (a: number, b: number) => Math.round((a / b - 1) * 100);
const signedPct = (p: number) => `${p > 0 ? "+" : "−"}${Math.abs(p)}%`;

/** One sentence on the user's change against the real rocket; empty while it's unchanged. */
function yoursLine(curve: TradeCurve, currentX: number, at: (x: number) => number, tonnes: boolean) {
  if (Math.abs(currentX - curve.realX) < 1e-6) return "";
  const fx = fmtX(currentX, curve.unit);
  const real = at(curve.realX);
  const you = at(currentX);
  if (you <= 0) return `Yours, at ${fx}, can't get there at all.`;
  if (real <= 0) return `Yours, at ${fx}, carries ${payloadText(you, tonnes)}.`;
  const p = pct(you, real);
  return `Yours, at ${fx}, carries ${payloadText(you, tonnes)}: ${p === 0 ? "about the same as" : `${Math.abs(p)}% ${p > 0 ? "more" : "less"} than`} the real rocket.`;
}

type Placed = { left: number; right: number; lane: number; flip: boolean };

/**
 * Places the marker labels in lanes above the plot. Tries every lane and side for each label (there are at
 * most three) and keeps the layout with the fewest lanes where no labels overlap and no leader line runs
 * through another label.
 */
export function layoutLabels(items: { px: number; w: number }[], width: number): { placed: Placed[]; lanes: number } {
  const n = items.length;
  let best: Placed[] | null = null;
  let bestScore = Infinity;
  const fits = (a: Placed, ax: number, b: Placed, bx: number) => {
    if (a.lane === b.lane) return a.right + 8 <= b.left || b.right + 8 <= a.left;
    if (Math.abs(ax - bx) < 2) return true;
    const [upX, low] = a.lane > b.lane ? [ax, b] : [bx, a];
    return upX < low.left - 3 || upX > low.right + 3;
  };
  const choose = (i: number, acc: Placed[]) => {
    if (i === n) {
      const score = Math.max(...acc.map((p) => p.lane)) * 100 + acc.reduce((s, p) => s + p.lane * 10 + (p.flip ? 1 : 0), 0);
      if (score < bestScore) [best, bestScore] = [acc, score];
      return;
    }
    const { px, w } = items[i];
    for (const flip of [false, true]) {
      const left = flip ? px + 5 - w : px - 5;
      if (left < 0 || left + w > width) continue;
      for (let lane = 0; lane < n; lane++) {
        const cand = { left, right: left + w, lane, flip };
        if (acc.every((o, j) => fits(cand, px, o, items[j].px))) choose(i + 1, [...acc, cand]);
      }
    }
  };
  choose(0, []);
  const placed: Placed[] =
    best ??
    items.map(({ px, w }, lane) => {
      const flip = px > width / 2;
      const left = flip ? px + 5 - w : px - 5;
      return { left, right: left + w, lane, flip };
    });
  return { placed, lanes: Math.max(1, ...placed.map((p) => p.lane + 1)) };
}

const diamond = (x: number, y: number, r: number) => `M${x},${y - r}L${x + r},${y}L${x},${y + r}L${x - r},${y}Z`;

/** REAL is a hollow ring, BEST a diamond, YOU a dot: shape carries identity as well as color. `s` scales it down for the label keys. */
function Shape({ kind, x, y, s = 1 }: { kind: MarkKey; x: number; y: number; s?: number }) {
  if (kind === "real") return <circle cx={x} cy={y} r={6 * s} fill="#000" stroke={COLOR.real} strokeWidth={2 * s} />;
  if (kind === "best") return <path d={diamond(x, y, 5.5 * s)} fill={COLOR.best} />;
  return <circle cx={x} cy={y} r={4.5 * s} fill={COLOR.you} />;
}

interface Props {
  curve: TradeCurve;
  /** x of the user's modified rocket. */
  currentX: number;
  /** Called with the swept value of the point the user clicked. */
  onPick?: (x: number) => void;
  /** Plain-language reading shown under the chart: explainCurve plus a line on your change when left out, none when null. */
  caption?: string | null;
  /** Passed to explainCurve for the default caption, which then adds what landing the boosters costs. */
  context?: Parameters<typeof explainCurve>[1];
  /** Height of the plot itself, without the label lanes, axis and caption (about 56px more). */
  plotHeight?: number;
}

export default function TradeChart({ curve, currentX, onPick, caption, context, plotHeight = 190 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(560);
  const [cursor, setCursor] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => {
    const pts: TradePoint[] = curve.points
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.payloadKg))
      .sort((a, b) => a.x - b.x)
      .filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => Math.max(0, p.payloadKg));
    const { at, cmds } = curveModel(xs, ys);
    const nearest = (x: number) => xs.reduce((b, v, i) => (Math.abs(v - x) < Math.abs(xs[b] - x) ? i : b), 0);

    const maxKg = Math.max(0, ...ys);
    const allZero = maxKg <= 0;
    const tonnes = maxKg >= 2000;
    const div = tonnes ? 1000 : 1;
    const yStep = allZero ? 1 : niceStep(maxKg / div, plotHeight < 140 ? 2 : 4);
    const yTop = allZero ? 1 : Math.ceil(maxKg / div / yStep - 1e-9) * yStep;
    const yTicks = allZero ? [0] : ticks(0, yTop, yStep);
    const yLabels = yTicks.map((v, i) => {
      const n = tonnes ? trim(v) : v.toLocaleString("en-US");
      return i === yTicks.length - 1 ? `${n} ${tonnes ? "t" : "kg"}` : n;
    });
    const padL = Math.ceil(Math.max(...yLabels.map((s) => s.length)) * TICK_W) + 14;

    let lo = xs[0] ?? 0;
    let hi = xs[xs.length - 1] ?? 1;
    if (hi - lo < 1e-9) [lo, hi] = [lo - 0.5, hi + 0.5];
    const plotW = Math.max(40, width - padL - PAD_R);
    const sx = (x: number) => padL + ((Math.min(hi, Math.max(lo, x)) - lo) / (hi - lo)) * plotW;
    const integers = curve.unit !== "×" && xs.every(Number.isInteger);
    const xStep = Math.max(integers ? 1 : 0, niceStep(hi - lo, Math.max(2, Math.floor(plotW / 80))));
    const xTicks = ticks(lo, hi, integers ? Math.round(xStep) : xStep);

    const realKg = at(curve.realX);
    const marks = (["real", "best", "you"] as const)
      .filter((k) => !(k === "best" && allZero))
      .map((key) => {
        const x = key === "real" ? curve.realX : key === "best" ? curve.bestX : currentX;
        const kg = at(x);
        let value = allZero ? "" : kg > 0 ? payloadText(kg, tonnes) : "can't reach";
        if (key === "you" && kg > 0 && realKg > 0 && Math.abs(currentX - curve.realX) > 1e-6) {
          const p = pct(kg, realKg);
          if (p !== 0) value += ` ${signedPct(p)}`;
        }
        return { key, x, kg, value, px: sx(x) };
      });
    const { placed, lanes } = layoutLabels(
      marks.map((mk) => ({ px: mk.px, w: 14 + (NAME[mk.key].length + (mk.value ? mk.value.length + 1 : 0)) * CHAR_W })),
      width,
    );

    // Two lanes reserved even when one would do, so the chart keeps its height while YOU is dragged around.
    const top = 30 + (Math.max(2, lanes) - 1) * LANE_H;
    const bottom = top + plotHeight;
    const sy = (kg: number) => bottom - (kg / div / yTop) * plotHeight;
    const f = (v: number) => v.toFixed(1);
    const line = cmds
      .map(([c, ...v]) => {
        const pairs: string[] = [];
        for (let k = 0; k < v.length; k += 2) pairs.push(`${f(sx(v[k]))},${f(sy(v[k + 1]))}`);
        return c + pairs.join(" ");
      })
      .join("");
    const area = pts.length > 1 ? `${line}L${f(sx(xs[xs.length - 1]))},${bottom}L${f(sx(xs[0]))},${bottom}Z` : "";
    const maxDv = Math.max(0, ...pts.map((p) => p.totalDeltaVMps));

    return { pts, at, nearest, allZero, tonnes, yTicks, yLabels, padL, plotW, lo, hi, sx, sy, xTicks, marks, placed, top, bottom, line, area, maxDv, height: bottom + PAD_B };
  }, [curve, currentX, width, plotHeight]);

  const n = g.pts.length;
  const hp = cursor != null && cursor < n ? g.pts[cursor] : null;
  const fx = (x: number) => fmtX(x, curve.unit);
  const text =
    caption === undefined ? [explainCurve(curve, context), yoursLine(curve, currentX, g.at, g.tonnes)].filter(Boolean).join(" ") : caption;

  const pointToIndex = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return null;
    return g.nearest(g.lo + ((clientX - r.left - g.padL) / g.plotW) * (g.hi - g.lo));
  };
  const onMove = (e: PointerEvent<SVGRectElement>) => setCursor(pointToIndex(e.clientX));
  const onClick = (e: PointerEvent<SVGRectElement>) => {
    const i = pointToIndex(e.clientX);
    if (onPick && i != null) onPick(g.pts[i].x);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!n) return;
    const cur = cursor != null && cursor < n ? cursor : g.nearest(currentX);
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (step) setCursor(Math.min(n - 1, Math.max(0, cur + step)));
    else if (e.key === "Home") setCursor(0);
    else if (e.key === "End") setCursor(n - 1);
    else if ((e.key === "Enter" || e.key === " ") && onPick) onPick(g.pts[cur].x);
    else return;
    e.preventDefault();
  };

  const hx = hp ? g.sx(hp.x) : 0;
  const tipRight = hx > width - 220;
  const readout = hp
    ? `${fx(hp.x)}: ${hp.payloadKg > 0 ? payloadText(hp.payloadKg, g.tonnes) : "can't reach"}, Δv ${km(hp.totalDeltaVMps)} km/s, liftoff TWR ${hp.liftoffTwr.toFixed(2)}`
    : "";

  return (
    <section className="module">
      <header className="module-head">
        <h3 className="truncate font-space text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">Payload vs {curve.label}</h3>
        {onPick && !g.allZero && width >= 480 && <span className="shrink-0 text-[11px] text-haze">Click the curve to try a point</span>}
      </header>

      <div ref={wrapRef} className="relative">
        <svg
          ref={svgRef}
          width={width}
          height={g.height}
          className="block touch-none font-mono outline-none focus-visible:outline-1 focus-visible:outline-white/40"
          tabIndex={n ? 0 : -1}
          aria-label={`Payload against ${curve.label}. ${text ?? ""} Arrow keys read each point${onPick ? "; Enter picks it" : ""}.`}
          onKeyDown={onKey}
          onFocus={() => setCursor((c) => c ?? g.nearest(currentX))}
          onBlur={() => setCursor(null)}
        >
          {g.yTicks.map((v, i) => (
            <g key={v}>
              <line x1={g.padL} x2={g.padL + g.plotW} y1={g.sy(v * (g.tonnes ? 1000 : 1))} y2={g.sy(v * (g.tonnes ? 1000 : 1))} stroke={v === 0 ? "#3a3a3a" : "#1c1c1c"} />
              <text x={g.padL - 8} y={g.sy(v * (g.tonnes ? 1000 : 1)) + 3.5} textAnchor="end" fontSize={10} fill="var(--haze)" className="tabular-nums">
                {g.yLabels[i]}
              </text>
            </g>
          ))}
          {g.xTicks.map((v, i) => (
            <text
              key={v}
              x={g.sx(v)}
              y={g.bottom + 16}
              textAnchor={g.xTicks.length > 1 && i === g.xTicks.length - 1 && g.sx(v) > width - 20 ? "end" : "middle"}
              fontSize={10}
              fill="var(--haze)"
              className="tabular-nums"
            >
              {curve.unit === "×" ? `${trim(v)}×` : trim(v)}
            </text>
          ))}

          {g.area && !g.allZero && <path d={g.area} fill="#fff" fillOpacity={0.06} />}
          <path d={g.line} fill="none" stroke={g.allZero ? "#555" : "#d9d9d9"} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* Engine counts are whole numbers: a dot on each one says the line only joins them up. */}
          {curve.unit !== "×" &&
            !g.allZero &&
            g.pts.map((p) => <circle key={p.x} cx={g.sx(p.x)} cy={g.sy(Math.max(0, p.payloadKg))} r={2} fill="#d9d9d9" />)}

          {g.marks.map((mk, i) => (
            <line key={mk.key} x1={mk.px} x2={mk.px} y1={g.top - 16 - g.placed[i].lane * LANE_H} y2={g.sy(mk.kg)} stroke={COLOR[mk.key]} strokeOpacity={0.55} />
          ))}

          {g.allZero && (
            <g textAnchor="middle" className="font-space" stroke="#000" strokeWidth={6} strokeLinejoin="round" paintOrder="stroke">
              <text x={g.padL + g.plotW / 2} y={g.top + plotHeight / 2 - 6} fontSize={15} fill="#fff" fontWeight={600}>
                Can&apos;t reach this destination {curve.unit === "×" ? "at any stretch" : `with any number of ${curve.unit}`}
              </text>
              <text x={g.padL + g.plotW / 2} y={g.top + plotHeight / 2 + 16} fontSize={13} fill="var(--haze)">
                Most Δv anywhere on this sweep: {km(g.maxDv)} km/s
              </text>
            </g>
          )}
          {hp && <line x1={hx} x2={hx} y1={g.top} y2={g.bottom} stroke="#fff" strokeOpacity={0.35} />}

          {g.marks.map((mk) =>
            mk.key === "best" ? (
              <path key={mk.key} d={diamond(mk.px, g.sy(mk.kg), 8.5)} fill="#000" />
            ) : (
              <circle key={mk.key} cx={mk.px} cy={g.sy(mk.kg)} r={mk.key === "real" ? 9 : 6.5} fill="#000" />
            ),
          )}
          {g.marks.map((mk) => (
            <Shape key={mk.key} kind={mk.key} x={mk.px} y={g.sy(mk.kg)} />
          ))}
          {hp && <circle cx={hx} cy={g.sy(Math.max(0, hp.payloadKg))} r={4} fill="#fff" stroke="#000" strokeWidth={2} />}

          {g.marks.map((mk, i) => {
            const { lane, flip } = g.placed[i];
            const y = g.top - 12 - lane * LANE_H;
            return (
              <g key={mk.key}>
                <Shape kind={mk.key} x={mk.px} y={y - 4} s={0.62} />
                <text x={flip ? mk.px - 9 : mk.px + 9} y={y} textAnchor={flip ? "end" : "start"} fontSize={11} letterSpacing="0.04em">
                  <tspan fill="#fff" fontWeight={600}>
                    {NAME[mk.key]}
                  </tspan>
                  {mk.value && <tspan fill="rgba(255,255,255,0.72)"> {mk.value}</tspan>}
                </text>
              </g>
            );
          })}

          {n > 0 && (
            <rect
              x={g.padL - 8}
              y={g.top - 4}
              width={g.plotW + 16}
              height={plotHeight + 12}
              fill="transparent"
              style={{ cursor: onPick ? "pointer" : "crosshair" }}
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setCursor(null)}
              onClick={onClick}
            />
          )}
        </svg>

        {hp && (
          <div
            className="pointer-events-none absolute z-10 w-[200px] border border-rule bg-black/95 px-3 py-2"
            style={{ top: g.top + 4, ...(tipRight ? { right: width - hx + 12 } : { left: hx + 12 }) }}
          >
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {[
                [hp.payloadKg > 0 ? "Payload" : "Can't reach", hp.payloadKg > 0 ? payloadText(hp.payloadKg, g.tonnes) : "0"],
                [curve.unit === "×" ? "Stretch" : curve.unit, curve.unit === "×" ? fx(hp.x) : trim(hp.x)],
                ["Δv", `${km(hp.totalDeltaVMps)} km/s`],
                ["Liftoff TWR", hp.liftoffTwr.toFixed(2)],
              ].map(([label, value], i) => (
                <div key={label} className="flex flex-col-reverse">
                  <dt className="text-[10px] uppercase tracking-[0.12em] text-haze">{label}</dt>
                  <dd className={`font-mono text-white ${i === 0 ? "text-[14px] font-semibold" : "text-[12px]"}`}>{value}</dd>
                </div>
              ))}
            </dl>
            {onPick && plotHeight >= 140 && <p className="mt-1.5 border-t border-rule pt-1.5 text-[11px] text-white/70">Click to try this</p>}
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {readout}
        </p>
      </div>

      {text && <p className="px-4 pt-1 pb-3 text-[14px] leading-snug text-white/85">{text}</p>}

      {n > 0 && (
        <details className="border-t border-rule px-4 py-2">
          <summary className="cursor-pointer text-[11px] uppercase tracking-[0.18em] text-haze">Data table</summary>
          <div className="mt-2 max-h-56 overflow-y-auto">
            <table className="w-full font-mono text-[12px] tabular-nums">
              <thead className="text-left text-[10px] uppercase tracking-[0.14em] text-haze">
                <tr>
                  <th className="py-1 font-normal">{curve.label}</th>
                  <th className="py-1 text-right font-normal">Payload</th>
                  <th className="py-1 text-right font-normal">Δv km/s</th>
                  <th className="py-1 text-right font-normal">TWR</th>
                  <th className="py-1 font-normal" />
                </tr>
              </thead>
              <tbody>
                {g.pts.map((p, i) => {
                  const tags = [
                    i === g.nearest(curve.realX) && "real",
                    !g.allZero && i === g.nearest(curve.bestX) && "best",
                    i === g.nearest(currentX) && "you",
                  ].filter(Boolean);
                  return (
                    <tr key={p.x} className={`border-t border-rule ${tags.length ? "text-white" : "text-white/70"}`}>
                      <td className="py-1">{fx(p.x)}</td>
                      <td className="py-1 text-right">{payloadText(p.payloadKg, g.tonnes)}</td>
                      <td className="py-1 text-right">{km(p.totalDeltaVMps)}</td>
                      <td className="py-1 text-right">{p.liftoffTwr.toFixed(2)}</td>
                      <td className="py-1 pl-3 text-[10px] uppercase tracking-[0.14em] text-haze">{tags.join(" · ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
