"use client";

import type { DesignAction, Part, Point, RedPenMark } from "@/lib/design";
import { penLoop } from "@/lib/napkin";

type OnFix = (fix: DesignAction) => void;

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
  /** Called when a note that carries a fix is tapped. */
  onFix?: OnFix;
}

export default function RedPenOverlay({ parts, marks, playKey, scanning, onFix }: RedPenOverlayProps) {
  const penStart = 0.4 + parts.length * 0.08;
  return (
    <>
      {scanning && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="scanline" />
        </div>
      )}
      <svg
        key={playKey}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden
      >
        {/* Part tags explain the read; once the red pen starts they step back (hover the napkin to see them). */}
        <g
          className={marks.length > 0 && !scanning ? "part-tags retire" : "part-tags"}
          style={{ "--retire-delay": `${penStart}s` } as React.CSSProperties}
        >
          {layoutTags(parts).map((tag, i) => (
            <PartTag key={i} tag={tag} delay={i * 0.08} />
          ))}
        </g>
        <g>
          {marks.map((mark, i) => (
            <Mark key={i} mark={mark} seed={i + 1} delay={penStart + i * 0.9} onFix={onFix} />
          ))}
        </g>
      </svg>
    </>
  );
}

interface Tag {
  /** Every box of this kind gets corner brackets. */
  boxes: [number, number, number, number][];
  /** Where the label goes, or null when it would collide with another label. */
  label: { text: string; x: number; y: number; anchor: "start" | "end"; fromX: number } | null;
}

const TAG_FONT = 6.2;
/** Rough width of uppercase Barlow at TAG_FONT with the tag's letter spacing. */
const tagWidth = (text: string) => text.length * 4.3 + 2;

/**
 * One label per kind of part ("Landing leg ×2"), put on the outside of the drawing
 * (left of centre goes left), and dropped if its text would overlap a label already placed.
 */
function layoutTags(parts: Part[]): Tag[] {
  const groups = new Map<string, Part[]>();
  for (const part of parts) {
    const key = part.label.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), part]);
  }
  const placed: [number, number, number, number][] = [];
  const overlaps = (b: [number, number, number, number]) =>
    b[0] < 2 || b[0] + b[2] > W - 2 || placed.some((p) => b[0] < p[0] + p[2] && p[0] < b[0] + b[2] && b[1] < p[1] + p[3] && p[1] < b[1] + b[3]);

  const tags = [...groups.values()].map((group) => {
    const boxes = group.map((p) => [p.box[0] * W, p.box[1] * H, p.box[2] * W, p.box[3] * H] as [number, number, number, number]);
    // Label the box furthest out on its side, so the leader doesn't cross the drawing.
    const centre = (b: [number, number, number, number]) => b[0] + b[2] / 2;
    const left = boxes.reduce((n, b) => n + (centre(b) < W / 2 ? 1 : 0), 0) > boxes.length / 2;
    const anchorBox = boxes.reduce((best, b) => (left ? (b[0] < best[0] ? b : best) : b[0] + b[2] > best[0] + best[2] ? b : best));
    const text = group.length > 1 ? `${group[0].label} ×${group.length}` : group[0].label;
    return { boxes, left, anchorBox, text: text.toUpperCase() };
  });

  // Place labels top to bottom so the upper ones win ties.
  return tags
    .sort((a, b) => a.anchorBox[1] - b.anchorBox[1])
    .map(({ boxes, left, anchorBox: [x, y, w, h], text }) => {
      const width = tagWidth(text);
      const labelY = y + h / 2;
      for (const side of left ? (["left", "right"] as const) : (["right", "left"] as const)) {
        const lx = side === "left" ? x - 7 : x + w + 7;
        const box: [number, number, number, number] = [side === "left" ? lx - width : lx, labelY - 5, width, 8];
        if (overlaps(box)) continue;
        placed.push(box);
        return { boxes, label: { text, x: lx, y: labelY, anchor: side === "left" ? "end" : "start", fromX: side === "left" ? x - 1 : x + w + 1 } };
      }
      return { boxes, label: null };
    }) as Tag[];
}

function PartTag({ tag, delay }: { tag: Tag; delay: number }) {
  return (
    <g className="part-tag" style={{ animationDelay: `${delay}s` }}>
      {tag.boxes.map(([x, y, w, h], i) => {
        const c = Math.min(6, w / 4, h / 4);
        const corners =
          `M${x} ${y + c} L${x} ${y} L${x + c} ${y}` +
          ` M${x + w - c} ${y} L${x + w} ${y} L${x + w} ${y + c}` +
          ` M${x + w} ${y + h - c} L${x + w} ${y + h} L${x + w - c} ${y + h}` +
          ` M${x + c} ${y + h} L${x} ${y + h} L${x} ${y + h - c}`;
        return <path key={i} d={corners} fill="none" stroke="var(--ink-muted)" strokeWidth="0.9" opacity="0.7" />;
      })}
      {tag.label && (
        <>
          <line
            x1={tag.label.fromX}
            y1={tag.label.y}
            x2={tag.label.anchor === "end" ? tag.label.x + 2 : tag.label.x - 2}
            y2={tag.label.y}
            stroke="var(--ink-muted)"
            strokeWidth="0.6"
          />
          <text
            x={tag.label.x}
            y={tag.label.y + 2.2}
            textAnchor={tag.label.anchor}
            fontFamily="var(--font-barlow)"
            fontWeight="500"
            fontSize={TAG_FONT}
            letterSpacing="0.5"
            fill="var(--ink-muted)"
          >
            {tag.label.text}
          </text>
        </>
      )}
    </g>
  );
}

const scale = ([x, y]: Point): Point => [x * W, y * H];

function Mark({ mark, seed, delay, onFix }: { mark: RedPenMark; seed: number; delay: number; onFix?: OnFix }) {
  const draw = { animationDelay: `${delay}s` };
  const write = { animationDelay: `${delay + 0.55}s` };
  const fix = mark.fix && onFix ? () => onFix(mark.fix!) : undefined;

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
          onClick={fix}
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
          onClick={fix}
        />
      </g>
    );
  }

  const points = mark.points.map(scale);
  if (points.length === 0) return null;
  const [lx, ly] = points[points.length - 1];
  // Write the note away from the outline: past its last point, on the side it ended on.
  const endsLeft = lx < points[0][0];
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
        x={endsLeft ? lx - 4 : lx + 4}
        y={Math.min(H - 4, ly + 14)}
        anchor={endsLeft ? "end" : "start"}
        text={mark.note}
        style={write}
        onClick={fix}
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
  onClick,
}: {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  text: string;
  style: React.CSSProperties;
  onClick?: () => void;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className={`pen-note font-hand ${onClick ? "pen-fix" : ""}`}
      style={style}
      fontSize="15"
      fontWeight="700"
      fill="var(--redpen)"
      onClick={onClick}
    >
      {onClick && <title>Tap to apply this fix</title>}
      {text}
      {onClick && " ↻"}
    </text>
  );
}
