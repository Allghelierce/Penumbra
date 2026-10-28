"use client";

import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { NAPKIN_ASPECT, type Design, type DesignAction, type EngineCluster, type EngineId, type Part, type Stage, type TemplateDrawing } from "@/lib/design";
import { ENGINES } from "@/lib/physics";

/** A tank stretch that is being dragged or nudged but not applied yet. */
export interface Stretch {
  stageIndex: number;
  /** New tank length over the length when the drag began, snapped to 5%. */
  factor: number;
}

interface EditHandlesProps {
  /** The template drawn for `design` (drawTemplate). */
  drawing: TemplateDrawing;
  design: Design;
  onAction: (action: DesignAction) => void;
  /** The stretch in progress, live while a handle moves (null once it's let go), for previews such as the trade chart. */
  onPreview?: (stretch: Stretch | null) => void;
}

const MIN_FACTOR = 0.5;
const MAX_FACTOR = 2;
const MAX_ENGINES = 60;
/** Arrow-key nudges are applied this long after the last press, or at once on Enter or when focus leaves. */
const NUDGE_MS = 700;
/** Height of a chip row or button, in px: big enough for a fingertip. */
const ROW = 32;
/** An engine chip's − and + buttons plus borders, in px (the count and type menu take the rest). */
const CHIP_FIXED = 68;

type Box = { x0: number; x1: number; y0: number; y1: number };
type Band = { index: number; stage: Stage; top: number; bottom: number; x0: number; x1: number };

const snap = (factor: number) => Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, Math.round(factor * 20) / 20));

function extent(parts: Part[]): Box | null {
  if (parts.length === 0) return null;
  return {
    x0: Math.min(...parts.map((p) => p.box[0])),
    x1: Math.max(...parts.map((p) => p.box[0] + p.box[2])),
    y0: Math.min(...parts.map((p) => p.box[1])),
    y1: Math.max(...parts.map((p) => p.box[1] + p.box[3])),
  };
}

function bandsOf(drawing: TemplateDrawing, design: Design, rocket: Box): Band[] {
  const count = Math.min(drawing.stageBands.length, design.stages.length);
  return Array.from({ length: count }, (_, i) => {
    const [a, b] = drawing.stageBands[i];
    const own = drawing.parts.filter((p) => (p.stageIndex ?? 0) === i);
    const box = extent(own.filter((p) => p.kind === "tank")) ?? extent(own) ?? rocket;
    return { index: i, stage: design.stages[i], top: Math.min(a, b), bottom: Math.max(a, b), x0: box.x0, x1: box.x1 };
  });
}

/** Metres per napkin height unit, from the widest tank against the real diameter (stretching never changes it). */
function metresPerUnit(drawing: TemplateDrawing, design: Design, rocket: Box) {
  const widest = Math.max(0, ...drawing.parts.filter((p) => p.kind === "tank").map((p) => p.box[2]));
  if (widest > 0 && design.diameterM > 0) return design.diameterM / widest / NAPKIN_ASPECT;
  return rocket.y1 > rocket.y0 ? design.heightM / (rocket.y1 - rocket.y0) : 0;
}

/** Tops (px) for boxes of the given heights, as near their wanted centres as possible without overlapping, inside [0, limit]. */
function stack(items: { y: number; h: number }[], limit: number, gap = 4) {
  const order = items.map((_, i) => i).sort((a, b) => items[a].y - items[b].y);
  const tops = items.map((item) => item.y - item.h / 2);
  let floor = 0;
  for (const i of order) {
    tops[i] = Math.max(tops[i], floor);
    floor = tops[i] + items[i].h + gap;
  }
  let ceiling = limit;
  for (const i of [...order].reverse()) {
    tops[i] = Math.max(0, Math.min(tops[i], ceiling - items[i].h));
    ceiling = tops[i] - gap;
  }
  return tops;
}

/** A stretch handle's width in px: the stage's width plus a margin, never too small to grab. */
const handleWidth = (band: Band, napkinWidth: number) => Math.max((band.x1 - band.x0) * napkinWidth + 28, 76);

const vacuumOnly = (engine: EngineId) => ENGINES[engine].thrustSeaLevelN <= 0;

const shortName = (name: string) => name.replace(/ Vacuum$/, " Vac").replace("Solid rocket motor", "Solid motor");

const signedMetres = (m: number) => `${m < 0 ? "−" : "+"}${Math.abs(m).toFixed(1)} m`;

/**
 * Drag-to-modify controls over a real rocket on the napkin: a handle on the top edge of each stage's
 * tanks stretches or shrinks them (5% steps, 0.5× to 2×; arrow keys nudge the focused handle), each engine
 * cluster gets a chip (count and type), each stage a recovery toggle and a remove button, and a button under the
 * rocket adds a booster.
 */
export default function EditHandles({ drawing, design, onAction, onPreview }: EditHandlesProps) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pending, setPending] = useState<Stretch | null>(null);
  // Mirrors `pending` for event handlers that run before the next render.
  const live = useRef<Stretch | null>(null);
  const drag = useRef<{ stageIndex: number; pointerId: number; startY: number; px: number; from: number; top: number; bottom: number } | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer.current);
    };
  }, []);

  const W = size.w || 450;
  const H = size.h || W / NAPKIN_ASPECT;
  const rocket = extent(drawing.parts) ?? { x0: 0.42, x1: 0.58, y0: 0.1, y1: 0.9 };
  const bands = bandsOf(drawing, design, rocket);
  const mpu = metresPerUnit(drawing, design, rocket);
  const shown = pending && pending.stageIndex < bands.length ? pending : null;

  function preview(next: Stretch | null) {
    if (live.current?.stageIndex === next?.stageIndex && live.current?.factor === next?.factor) return;
    live.current = next;
    setPending(next);
    onPreview?.(next);
  }

  function commit() {
    window.clearTimeout(timer.current);
    const done = live.current;
    preview(null);
    if (done && done.factor !== 1) onAction({ type: "scale-tanks", stageIndex: done.stageIndex, factor: done.factor });
  }

  function cancel() {
    window.clearTimeout(timer.current);
    drag.current = null;
    preview(null);
  }

  function startDrag(e: PointerEvent<HTMLDivElement>, band: Band) {
    if (e.button !== 0) return;
    const px = root.current?.getBoundingClientRect().height ?? 0;
    if (px === 0) return;
    e.preventDefault();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    window.clearTimeout(timer.current);
    if (live.current && live.current.stageIndex !== band.index) commit();
    // Carry on from an arrow-key nudge that hasn't been applied yet.
    const factor = live.current?.factor ?? 1;
    const from = band.bottom - (band.bottom - band.top) * factor;
    drag.current = { stageIndex: band.index, pointerId: e.pointerId, startY: e.clientY, px, from, top: band.top, bottom: band.bottom };
  }

  function moveDrag(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const top = d.from + (e.clientY - d.startY) / d.px;
    preview({ stageIndex: d.stageIndex, factor: snap((d.bottom - top) / (d.bottom - d.top)) });
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    commit();
  }

  function nudge(e: KeyboardEvent<HTMLDivElement>, band: Band) {
    if (e.key === "Escape") return cancel();
    if (e.key === "Enter") {
      e.preventDefault();
      return commit();
    }
    const steps = ({ ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 4, PageDown: -4 } as Record<string, number>)[e.key];
    if (!steps) return;
    e.preventDefault();
    const from = live.current?.stageIndex === band.index ? live.current.factor : 1;
    preview({ stageIndex: band.index, factor: snap(from + steps * (e.shiftKey ? 4 : 1) * 0.05) });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(commit, NUDGE_MS);
  }

  // Engine chips to the right of the rocket, stage names and remove buttons to its left, each beside its band.
  const chipTops = stack(
    bands.map((b) => ({ y: ((b.top + b.bottom) / 2) * H, h: (Math.max(1, b.stage.engines.length) + 1) * (ROW + 1) + 1 })),
    H,
  );
  // "+ Booster stage" goes under the rocket when there's room, otherwise at the foot of the stage-name column.
  const roomBelow = rocket.y1 * H + 10 + ROW <= H - 4;
  const labelTops = stack(
    [...bands.map((b) => ({ y: ((b.top + b.bottom) / 2) * H, h: ROW })), ...(roomBelow ? [] : [{ y: H - ROW / 2 - 6, h: ROW }])],
    H - 6,
  );
  // Handles on short stages squeeze their hit areas so neighbours don't overlap.
  const grip = bands.map((b) => {
    const gap = Math.min(...bands.filter((o) => o !== b).map((o) => Math.abs(o.top - b.top) * H));
    return Math.max(14, Math.min(28, gap));
  });
  // Both columns clear the rocket and the stretch handles, which are wider than a slim rocket.
  const centre = (b: Band) => ((b.x0 + b.x1) / 2) * W;
  const chipX = Math.max((rocket.x1 + 0.035) * W, ...bands.map((b) => centre(b) + handleWidth(b, W) / 2 + 8));
  const labelX = Math.min((rocket.x0 - 0.04) * W, ...bands.map((b) => centre(b) - handleWidth(b, W) / 2 - 8));
  // The type menu narrows to fit a small napkin, down to a point; past that the chip slides left.
  const menuWidth = Math.round(Math.min(156, Math.max(100, W - chipX - CHIP_FIXED - 6)));
  const chipLeft = Math.max(0, Math.min(chipX, W - CHIP_FIXED - menuWidth - 4));
  const labelRight = W - labelX;
  const canRemove = design.stages.length > 1;
  const control = "flex h-8 min-w-8 items-center justify-center px-2 transition-colors";

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 select-none font-ui text-white">
      {bands.map((band) => {
        const factor = shown?.stageIndex === band.index ? shown.factor : 1;
        const length = band.bottom - band.top;
        const top = band.bottom - length * factor;
        const metres = (factor - 1) * length * mpu;
        const name = band.stage.label;
        return (
          <Fragment key={band.index}>
            {factor !== 1 && (
              // The tank added (dashed white) or taken away (red) by the stretch in progress.
              <div
                className={`napkin-overlay absolute border border-dashed ${factor > 1 ? "border-white/70 bg-white/10" : "border-nogo/80 bg-nogo/15"}`}
                style={{
                  left: `${band.x0 * 100}%`,
                  width: `${(band.x1 - band.x0) * 100}%`,
                  top: `${Math.min(top, band.top) * 100}%`,
                  height: `${Math.abs(top - band.top) * 100}%`,
                }}
              />
            )}
            <div
              role="slider"
              tabIndex={0}
              aria-label={`Stretch the ${name} tanks`}
              aria-orientation="vertical"
              aria-valuemin={MIN_FACTOR}
              aria-valuemax={MAX_FACTOR}
              aria-valuenow={factor}
              aria-valuetext={`×${factor.toFixed(2)}, ${signedMetres(metres)}`}
              onPointerDown={(e) => startDrag(e, band)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={cancel}
              onLostPointerCapture={(e) => drag.current?.pointerId === e.pointerId && cancel()}
              onKeyDown={(e) => nudge(e, band)}
              onBlur={() => !drag.current && live.current?.stageIndex === band.index && commit()}
              className="napkin-overlay group pointer-events-auto absolute z-10 flex -translate-x-1/2 -translate-y-1/2 cursor-ns-resize touch-none items-center justify-center"
              style={{ left: `${((band.x0 + band.x1) / 2) * 100}%`, top: `${top * 100}%`, width: handleWidth(band, W), height: grip[band.index] }}
            >
              <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-white/60 transition-colors group-hover:bg-white group-focus-visible:bg-white" />
              <span className="relative flex h-3.5 w-8 flex-col justify-center gap-[2px] border border-white bg-black px-1.5">
                <span className="h-px bg-white/80" />
                <span className="h-px bg-white/80" />
              </span>
              <span
                className={`absolute bottom-full mb-1 whitespace-nowrap bg-black px-1.5 py-0.5 font-mono text-[11px] transition-opacity ${
                  factor !== 1 ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                }`}
              >
                ×{factor.toFixed(2)} <span className={factor < 1 ? "text-nogo" : "text-haze"}>{factor === 1 ? "drag ↕" : signedMetres(metres)}</span>
              </span>
            </div>
          </Fragment>
        );
      })}

      {bands.map((band, i) => {
        const { engines, label, propellant, recover = false } = band.stage;
        return (
          <div
            key={band.index}
            role="group"
            aria-label={`${label} engines and recovery`}
            className="napkin-overlay pointer-events-auto absolute divide-y divide-white/15 border border-white/25 bg-black shadow-[0_2px_10px_rgba(0,0,0,0.4)]"
            style={{ left: chipLeft, top: chipTops[i] }}
          >
            {engines.map((cluster, clusterIndex) => {
              const name = ENGINES[cluster.engine].name;
              const set = (next: EngineCluster) => onAction({ type: "set-engines", stageIndex: band.index, clusterIndex, engine: next.engine, count: next.count });
              const options = Object.values(ENGINES).filter((spec) => spec.propellant === propellant || spec.id === cluster.engine);
              return (
                <div key={clusterIndex} className="flex items-stretch">
                  <button
                    type="button"
                    aria-label={`One fewer ${name} on ${label}`}
                    disabled={cluster.count <= 1}
                    onClick={() => set({ ...cluster, count: cluster.count - 1 })}
                    className={`${control} text-[15px] text-white hover:bg-white/10 disabled:text-white/25 disabled:hover:bg-transparent`}
                  >
                    −
                  </button>
                  <label
                    className="relative flex h-8 min-w-0 cursor-pointer items-center gap-1.5 pl-1 pr-5 transition-colors hover:bg-white/10 has-[select:focus-visible]:outline-2 has-[select:focus-visible]:-outline-offset-2 has-[select:focus-visible]:outline-white"
                    style={{ width: menuWidth }}
                  >
                    <span className="shrink-0 font-mono text-[12px] tabular-nums">{cluster.count}×</span>
                    <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em]">{shortName(name)}</span>
                    <span aria-hidden className="pointer-events-none absolute right-1.5 text-[9px] text-haze">
                      ▾
                    </span>
                    {/* The native menu, invisible over the chip: keyboard and screen-reader friendly, and it fits a narrow chip. */}
                    <select
                      aria-label={`${label} engine type${engines.length > 1 ? ` ${clusterIndex + 1}` : ""}`}
                      value={cluster.engine}
                      onChange={(e) => set({ ...cluster, engine: e.target.value as EngineCluster["engine"] })}
                      className="absolute inset-0 cursor-pointer appearance-none opacity-0 [color-scheme:dark]"
                    >
                      {options.map((spec) => {
                        // The bottom stage lights at sea level, where a vacuum engine gives no thrust.
                        const padless = band.index === 0 && vacuumOnly(spec.id) && spec.id !== cluster.engine;
                        return (
                          <option key={spec.id} value={spec.id} disabled={padless}>
                            {padless ? `${spec.name} (upper stage only)` : spec.name}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <button
                    type="button"
                    aria-label={`One more ${name} on ${label}`}
                    disabled={cluster.count >= MAX_ENGINES}
                    onClick={() => set({ ...cluster, count: cluster.count + 1 })}
                    className={`${control} border-l border-white/15 text-[15px] text-white hover:bg-white/10 disabled:text-white/25 disabled:hover:bg-transparent`}
                  >
                    +
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              aria-pressed={recover}
              title={recover ? `${label} flies back and lands: it keeps a landing reserve and carries legs` : `${label} is thrown away after staging`}
              onClick={() => onAction({ type: "set-recover", stageIndex: band.index, recover: !recover })}
              className="flex h-8 w-full items-center justify-between gap-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors hover:bg-white/10"
            >
              <span className={recover ? "text-white" : "text-haze"}>♻ Recover</span>
              <span className={`font-mono text-[10px] tracking-[0.1em] ${recover ? "text-go-signal" : "text-white/35"}`}>{recover ? "On" : "Off"}</span>
            </button>
          </div>
        );
      })}

      {bands.map((band, i) => (
        <div
          key={band.index}
          className="napkin-overlay pointer-events-auto absolute flex h-8 items-center gap-1"
          style={{ right: labelRight, top: labelTops[i] }}
        >
          <span className="whitespace-nowrap bg-black/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/85">{band.stage.label}</span>
          {canRemove && (
            <button
              type="button"
              aria-label={`Remove ${band.stage.label}`}
              title={`Remove ${band.stage.label}`}
              onClick={() => onAction({ type: "remove-stage", stageIndex: band.index })}
              className={`${control} border border-white/25 bg-black text-[15px] text-white/80 hover:border-nogo hover:text-nogo`}
            >
              −
            </button>
          )}
        </div>
      ))}

      {bands.length > 0 && (
        <button
          type="button"
          onClick={() => onAction({ type: "add-stage" })}
          className={`napkin-overlay pointer-events-auto absolute flex h-8 items-center gap-1.5 whitespace-nowrap border border-white/40 bg-black px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:border-white ${
            roomBelow ? "-translate-x-1/2" : ""
          }`}
          style={roomBelow ? { left: `${((rocket.x0 + rocket.x1) / 2) * 100}%`, top: rocket.y1 * H + 10 } : { right: labelRight, top: labelTops[bands.length] }}
        >
          <span className="text-[14px] font-normal leading-none">+</span> Booster stage
        </button>
      )}
    </div>
  );
}
