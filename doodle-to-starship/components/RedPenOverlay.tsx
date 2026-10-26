"use client";

import type { DesignAction, Part, Point, RedPenMark } from "@/lib/design";
import TypeOut from "@/components/TypeOut";
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
  /** Design-review issue number for each mark (1-based), or null when a mark has no issue. */
  numbers?: (number | null)[];
  /** Mark index of the selected issue: it pulses and the others step back. */
  selectedMark?: number | null;
  /** Tapping a mark's number selects its issue in the review. */
  onSelectMark?: (markIndex: number) => void;
  /** The sketch couldn't be read as a vehicle: the red pen writes a big "?" and this sentence. */
  problem?: string | null;
  /** Marks not to draw (e.g. the ones for issues that are fine), by index. */
  hidden?: boolean[];
}

/** Where a mark's issue number sits: the start of an arrow, dimension or leader; the top-left of a circle or outline. */
function badgeAt(mark: RedPenMark): Point {
  switch (mark.kind) {
    case "arrow":
    case "dimension":
      return mark.from;
    case "circle":
      return [
        mark.center[0] - mark.radius * 0.72,
        mark.center[1] - mark.radius * 0.62,
      ];
    case "outline":
      return [mark.box[0], mark.box[1]];
    case "callout":
      return mark.anchor;
    case "ghost-line":
      return mark.points[0] ?? [0.5, 0.5];
  }
}

/** The engineer marks up in order: outlines around the parts, then dimensions, then spec callouts, then the issues. */
const MARKUP_ORDER: Record<RedPenMark["kind"], number> = {
  outline: 0,
  dimension: 1,
  callout: 2,
  circle: 3,
  arrow: 3,
  "ghost-line": 3,
};

/** Each mark's start time: stable-sorted by kind, staggered so the whole sheet is marked up in about 3 s. */
function markDelays(marks: RedPenMark[], start: number): number[] {
  const order = marks
    .map((m, i) => ({ i, rank: MARKUP_ORDER[m.kind] }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i);
  const step = Math.min(0.28, 1.3 / Math.max(1, marks.length));
  const delays = new Array<number>(marks.length);
  order.forEach(({ i }, k) => (delays[i] = start + k * step));
  return delays;
}

export default function RedPenOverlay({
  parts,
  marks,
  playKey,
  scanning,
  onFix,
  numbers,
  selectedMark = null,
  onSelectMark,
  problem,
  hidden,
}: RedPenOverlayProps) {
  const penStart = 0.3;
  const delays = markDelays(marks, penStart);
  // A real mission's markup has a single outline, the part that failed: that one is drawn heavier.
  const outlineCount = marks.filter((m) => m.kind === "outline").length;
  return (
    <>
      {scanning && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="scan-tint" />
          <div className="scanline" />
          <TypeOut
            as="p"
            text="GROK VISION / READING STROKES"
            cps={32}
            linger={60_000}
            className="absolute bottom-[3.5%] left-[6%] font-mono text-[10px] tracking-[0.14em] text-redpen/80"
          />
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
          className={
            marks.length > 0 && !scanning ? "part-tags retire" : "part-tags"
          }
          style={{ "--retire-delay": `${penStart}s` } as React.CSSProperties}
        >
          {marks.length === 0 &&
            layoutTags(parts).map((tag, i) => (
              <PartTag key={i} tag={tag} delay={i * 0.08} />
            ))}
        </g>
        <g>
          {marks.map((mark, i) =>
            hidden?.[i] ? null : (
              <g
                key={i}
                className="transition-opacity duration-200"
                opacity={selectedMark !== null && selectedMark !== i ? 0.3 : 1}
              >
                <Mark
                  mark={mark}
                  seed={i + 1}
                  delay={delays[i]}
                  onFix={onFix}
                  heavy={mark.kind === "outline" && outlineCount === 1}
                />
              </g>
            ),
          )}
        </g>
        {/* Issue numbers: the same numbers as the design review, so each note can be found in the list. */}
        <g>
          {marks.map((mark, i) => {
            const n = numbers?.[i];
            if (!n || hidden?.[i]) return null;
            const [bx, by] = scale(badgeAt(mark));
            const active = selectedMark === i;
            return (
              <g
                key={i}
                className={`pen-note ${active ? "mark-pulse" : ""}`}
                style={{
                  animationDelay: `${delays[i] + 0.3}s`,
                  transformOrigin: `${bx}px ${by}px`,
                  cursor: onSelectMark ? "pointer" : undefined,
                  pointerEvents: "auto",
                }}
                onClick={() => onSelectMark?.(i)}
              >
                <circle
                  cx={bx}
                  cy={by}
                  r={5.6}
                  fill={active ? "var(--redpen)" : "#fffdf8"}
                  stroke="var(--redpen)"
                  strokeWidth={1.1}
                />
                <text
                  x={bx}
                  y={by + 2.6}
                  textAnchor="middle"
                  fontSize="7.5"
                  fontWeight="700"
                  fill={active ? "#fff" : "var(--redpen)"}
                  fontFamily="var(--font-barlow)"
                >
                  {n}
                </text>
              </g>
            );
          })}
        </g>
        {problem !== undefined && problem !== null && (
          <g className="pen-note" style={{ animationDelay: "0.2s" }}>
            <text
              x={W / 2}
              y={H * 0.5}
              textAnchor="middle"
              fontSize="150"
              fill="var(--redpen)"
              fontFamily="var(--font-caveat)"
              fontWeight="700"
            >
              ?
            </text>
            <foreignObject
              x={W * 0.1}
              y={H * 0.56}
              width={W * 0.8}
              height={H * 0.3}
            >
              <p
                style={{
                  fontFamily: "var(--font-caveat)",
                  fontSize: 19,
                  lineHeight: 1.15,
                  color: "var(--redpen)",
                  textAlign: "center",
                  margin: 0,
                }}
              >
                {problem}
              </p>
            </foreignObject>
          </g>
        )}
      </svg>
    </>
  );
}

interface Tag {
  /** Every box of this kind gets corner brackets. */
  boxes: [number, number, number, number][];
  /** Where the label goes, or null when it would collide with another label. */
  label: {
    text: string;
    x: number;
    y: number;
    anchor: "start" | "end";
    fromX: number;
  } | null;
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
    b[0] < 2 ||
    b[0] + b[2] > W - 2 ||
    placed.some(
      (p) =>
        b[0] < p[0] + p[2] &&
        p[0] < b[0] + b[2] &&
        b[1] < p[1] + p[3] &&
        p[1] < b[1] + b[3],
    );

  const tags = [...groups.values()].map((group) => {
    const boxes = group.map(
      (p) =>
        [p.box[0] * W, p.box[1] * H, p.box[2] * W, p.box[3] * H] as [
          number,
          number,
          number,
          number,
        ],
    );
    // Label the box furthest out on its side, so the leader doesn't cross the drawing.
    const centre = (b: [number, number, number, number]) => b[0] + b[2] / 2;
    const left =
      boxes.reduce((n, b) => n + (centre(b) < W / 2 ? 1 : 0), 0) >
      boxes.length / 2;
    const anchorBox = boxes.reduce((best, b) =>
      left
        ? b[0] < best[0]
          ? b
          : best
        : b[0] + b[2] > best[0] + best[2]
          ? b
          : best,
    );
    const text =
      group.length > 1 ? `${group[0].label} ×${group.length}` : group[0].label;
    return { boxes, left, anchorBox, text: text.toUpperCase() };
  });

  // Place labels top to bottom so the upper ones win ties.
  return tags
    .sort((a, b) => a.anchorBox[1] - b.anchorBox[1])
    .map(({ boxes, left, anchorBox: [x, y, w, h], text }) => {
      const width = tagWidth(text);
      const labelY = y + h / 2;
      for (const side of left
        ? (["left", "right"] as const)
        : (["right", "left"] as const)) {
        const lx = side === "left" ? x - 7 : x + w + 7;
        const box: [number, number, number, number] = [
          side === "left" ? lx - width : lx,
          labelY - 5,
          width,
          8,
        ];
        if (overlaps(box)) continue;
        placed.push(box);
        return {
          boxes,
          label: {
            text,
            x: lx,
            y: labelY,
            anchor: side === "left" ? "end" : "start",
            fromX: side === "left" ? x - 1 : x + w + 1,
          },
        };
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
        return (
          <path
            key={i}
            d={corners}
            fill="none"
            stroke="var(--ink-muted)"
            strokeWidth="0.9"
            opacity="0.7"
          />
        );
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

/** A small seeded random source so each hand-drawn outline wobbles the same way every render. */
function wobble(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Mark({
  mark,
  seed,
  delay,
  onFix,
  heavy = false,
}: {
  mark: RedPenMark;
  seed: number;
  delay: number;
  onFix?: OnFix;
  heavy?: boolean;
}) {
  const draw = { animationDelay: `${delay}s`, animationDuration: "0.45s" };
  const write = { animationDelay: `${delay + 0.3}s` };
  const fix = mark.fix && onFix ? () => onFix(mark.fix!) : undefined;

  if (mark.kind === "arrow") {
    const [fx, fy] = scale(mark.from);
    const [tx, ty] = scale(mark.to);
    const len = Math.hypot(tx - fx, ty - fy) || 1;
    // Bow the shaft slightly, like a quick flick of the pen.
    const cx = (fx + tx) / 2 + (-(ty - fy) / len) * len * 0.12;
    const cy = (fy + ty) / 2 + ((tx - fx) / len) * len * 0.12;
    const angle = Math.atan2(ty - cy, tx - cx);
    const head = (a: number) =>
      `M${tx} ${ty} L${tx - 9 * Math.cos(angle + a)} ${ty - 9 * Math.sin(angle + a)}`;
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
          strokeWidth="1.1"
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
          strokeWidth="1.1"
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

  if (mark.kind === "outline") {
    // A pen traced around the part: rounded corners, a little wobble, and an overshoot where it closes.
    const rand = wobble(seed);
    const j = (k: number) => (rand() - 0.5) * k * (heavy ? 0.5 : 0.15);
    const pad = 4;
    const x0 = mark.box[0] * W - pad;
    const y0 = mark.box[1] * H - pad;
    const x1 = (mark.box[0] + mark.box[2]) * W + pad;
    const y1 = (mark.box[1] + mark.box[3]) * H + pad;
    const r = Math.min(8, (x1 - x0) / 4, (y1 - y0) / 4);
    const d =
      `M${x0 + r + j(2)} ${y0 + j(2)} L${x1 - r + j(2)} ${y0 + j(2)} Q${x1 + j(1)} ${y0 + j(1)} ${x1 + j(1.5)} ${y0 + r + j(2)} ` +
      `L${x1 + j(2)} ${y1 - r + j(2)} Q${x1 + j(1)} ${y1 + j(1)} ${x1 - r + j(2)} ${y1 + j(1.5)} L${x0 + r + j(2)} ${y1 + j(2)} ` +
      `Q${x0 + j(1)} ${y1 + j(1)} ${x0 + j(1.5)} ${y1 - r + j(2)} L${x0 + j(2)} ${y0 + r + j(2)} Q${x0 + j(1)} ${y0 + j(1)} ${heavy ? `${x0 + r + 9} ${y0 - 1.8}` : `${x0 + r} ${y0}`}`;
    return (
      <g>
        <path
          className="pen-draw"
          style={draw}
          pathLength={1}
          d={d}
          fill="none"
          stroke="var(--redpen)"
          strokeWidth={heavy ? 1.4 : 1.1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Label the part beside its box (callouts take the other margin), not above it, where the box above would be. */}
        {mark.note && (
          <Note
            x={x1 > W * 0.8 ? x0 - 5 : x1 + 5}
            y={Math.min(H - 4, y0 + 12)}
            anchor={x1 > W * 0.8 ? "end" : "start"}
            text={mark.note}
            style={write}
            onClick={fix}
            size={9.5}
            label
          />
        )}
      </g>
    );
  }

  if (mark.kind === "dimension") {
    const [fx, fy] = scale(mark.from);
    const [tx, ty] = scale(mark.to);
    const len = Math.hypot(tx - fx, ty - fy) || 1;
    const nx = -(ty - fy) / len;
    const ny = (tx - fx) / len;
    const tick = 5;
    const vertical = Math.abs(ty - fy) > Math.abs(tx - fx);
    const mx = (fx + tx) / 2;
    const my = (fy + ty) / 2;
    return (
      <g>
        <path
          className="pen-draw"
          style={draw}
          pathLength={1}
          d={`M${fx + nx * tick} ${fy + ny * tick} L${fx - nx * tick} ${fy - ny * tick} M${fx} ${fy} L${tx} ${ty} M${tx + nx * tick} ${ty + ny * tick} L${tx - nx * tick} ${ty - ny * tick}`}
          fill="none"
          stroke="var(--redpen)"
          strokeWidth="1"
          strokeLinecap="round"
        />
        {vertical ? (
          <g transform={`rotate(-90 ${mx - 6} ${my})`}>
            <Note
              x={mx - 6}
              y={my}
              anchor="middle"
              text={mark.note}
              style={write}
              onClick={fix}
              size={9.5}
              label
            />
          </g>
        ) : (
          <Note
            x={mx}
            y={my - 5}
            anchor="middle"
            text={mark.note}
            style={write}
            onClick={fix}
            size={9.5}
            label
          />
        )}
      </g>
    );
  }

  if (mark.kind === "callout") {
    const [ax, ay] = scale(mark.anchor);
    const [lx, ly] = scale(mark.label);
    const toLeft = lx < ax;
    return (
      <g>
        <circle
          className="pen-note"
          style={draw}
          cx={ax}
          cy={ay}
          r={1.6}
          fill="var(--redpen)"
        />
        <path
          className="pen-draw"
          style={draw}
          pathLength={1}
          d={`M${ax} ${ay} L${ax + (toLeft ? -8 : 8)} ${ly} L${lx} ${ly}`}
          fill="none"
          stroke="var(--redpen)"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <Note
          x={toLeft ? lx - 3 : lx + 3}
          y={ly + 3.2}
          anchor={toLeft ? "end" : "start"}
          text={mark.note}
          style={write}
          onClick={fix}
          size={9.5}
          label
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
        strokeWidth="1.1"
        strokeDasharray="5 4"
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
  size = 12,
  label = false,
}: {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  text: string;
  style: React.CSSProperties;
  onClick?: () => void;
  size?: number;
  /** A neat engineering label (condensed caps) rather than a handwritten note. */
  label?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className={`pen-note ${label ? "" : "font-hand"} ${onClick ? "pen-fix" : ""}`}
      style={label ? { ...style, fontFamily: "var(--font-barlow-condensed)", letterSpacing: "0.6px" } : { ...style, letterSpacing: "0.2px" }}
      fontSize={size}
      fontWeight={label ? 600 : 700}
      fill="var(--redpen)"
      onClick={onClick}
    >
      {onClick && <title>Tap to apply this fix</title>}
      {label ? text.toUpperCase() : text}
      {onClick && " ↻"}
    </text>
  );
}
