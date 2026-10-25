"use client";

import type { Part, Point, RedPenMark } from "@/lib/design";
import { penLoop } from "@/lib/napkin";

// SVG units for the 3:4 napkin; every mark comes in as normalized 0..1 coordinates.
const W = 300;
const H = 400;

interface RedPenOverlayProps {
  parts: Part[];
  marks: RedPenMark[];
  /** Changing this replays the pen animation (e.g. after a new review). */
  playKey: string;
  /** Show the scanner sweep while Grok reads the sketch. */
  scanning?: boolean;
}

export default function RedPenOverlay({ parts, marks, playKey, scanning }: RedPenOverlayProps) {
  const penStart = 0.4 + parts.length * 0.08;
  return (
    <>
      {scanning && <div className="scanline" />}
      <svg
        key={playKey}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden
      >
        <g>
          {parts.map((part, i) => (
            <PartTag key={i} part={part} delay={i * 0.08} />
          ))}
        </g>
        <g>
          {marks.map((mark, i) => (
            <Mark key={i} mark={mark} seed={i + 1} delay={penStart + i * 0.9} />
          ))}
        </g>
      </svg>
    </>
  );
}

function PartTag({ part, delay }: { part: Part; delay: number }) {
  const [bx, by, bw, bh] = part.box;
  const x = bx * W;
  const y = by * H;
  const w = bw * W;
  const h = bh * H;
  const c = Math.min(6, w / 4, h / 4);
  const corners =
    `M${x} ${y + c} L${x} ${y} L${x + c} ${y}` +
    ` M${x + w - c} ${y} L${x + w} ${y} L${x + w} ${y + c}` +
    ` M${x + w} ${y + h - c} L${x + w} ${y + h} L${x + w - c} ${y + h}` +
    ` M${x + c} ${y + h} L${x} ${y + h} L${x} ${y + h - c}`;
  const onLeft = x + w > W * 0.74;
  const labelX = onLeft ? x - 7 : x + w + 7;
  const labelY = y + h / 2;
  return (
    <g className="part-tag" style={{ animationDelay: `${delay}s` }}>
      <path d={corners} fill="none" stroke="var(--ink-muted)" strokeWidth="0.9" opacity="0.7" />
      <line
        x1={onLeft ? x - 1 : x + w + 1}
        y1={labelY}
        x2={onLeft ? labelX + 2 : labelX - 2}
        y2={labelY}
        stroke="var(--ink-muted)"
        strokeWidth="0.6"
      />
      <text
        x={labelX}
        y={labelY + 2.2}
        textAnchor={onLeft ? "end" : "start"}
        className="font-mono"
        fontSize="6.2"
        letterSpacing="0.4"
        fill="var(--ink-muted)"
      >
        {part.label.toUpperCase()}
      </text>
    </g>
  );
}

const scale = ([x, y]: Point): Point => [x * W, y * H];

function Mark({ mark, seed, delay }: { mark: RedPenMark; seed: number; delay: number }) {
  const draw = { animationDelay: `${delay}s` };
  const write = { animationDelay: `${delay + 0.55}s` };

  if (mark.kind === "arrow") {
    const [fx, fy] = scale(mark.from);
    const [tx, ty] = scale(mark.to);
    const len = Math.hypot(tx - fx, ty - fy) || 1;
    // Bow the shaft slightly, like a quick flick of the pen.
    const cx = (fx + tx) / 2 + (-(ty - fy) / len) * len * 0.12;
    const cy = (fy + ty) / 2 + ((tx - fx) / len) * len * 0.12;
    const angle = Math.atan2(ty - cy, tx - cx);
    const head = (a: number) => `M${tx} ${ty} L${tx - 9 * Math.cos(angle + a)} ${ty - 9 * Math.sin(angle + a)}`;
    const awayX = (fx - tx) / len;
    return (
      <g>
        <path
          className="pen-draw"
          style={draw}
          pathLength={1}
          d={`M${fx} ${fy} Q${cx} ${cy} ${tx} ${ty} ${head(0.5)} ${head(-0.5)}`}
          fill="none"
          stroke="var(--redpen)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Note
          x={fx + awayX * 4}
          y={fy - 4}
          anchor={awayX < -0.25 ? "end" : awayX > 0.25 ? "start" : "middle"}
          text={mark.note}
          style={write}
        />
      </g>
    );
  }

  if (mark.kind === "circle") {
    const [cx, cy] = scale(mark.center);
    const rx = mark.radius * W;
    const ry = rx * 0.85;
    return (
      <g>
        <path
          className="pen-draw"
          style={draw}
          pathLength={1}
          d={penLoop(cx, cy, rx, ry, seed)}
          fill="none"
          stroke="var(--redpen)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <Note
          x={Math.min(W - 30, Math.max(30, cx))}
          y={cy - ry - 8}
          anchor="middle"
          text={mark.note}
          style={write}
        />
      </g>
    );
  }

  const points = mark.points.map(scale);
  if (points.length === 0) return null;
  const [lx, ly] = points[points.length - 1];
  return (
    <g>
      <polyline
        className="pen-note"
        style={draw}
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="var(--redpen)"
        strokeWidth="1.8"
        strokeDasharray="6 5"
        strokeLinecap="round"
        opacity="0.85"
      />
      <Note
        x={lx > W * 0.6 ? lx - 4 : lx + 4}
        y={Math.min(H - 4, ly + 14)}
        anchor={lx > W * 0.6 ? "end" : "start"}
        text={mark.note}
        style={write}
      />
    </g>
  );
}

function Note({
  x,
  y,
  anchor,
  text,
  style,
}: {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  text: string;
  style: React.CSSProperties;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className="pen-note font-hand"
      style={style}
      fontSize="15"
      fontWeight="700"
      fill="var(--redpen)"
    >
      {text}
    </text>
  );
}
