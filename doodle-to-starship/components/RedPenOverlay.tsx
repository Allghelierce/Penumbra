"use client";

import type { CSSProperties } from "react";
import type { DesignAction, Part, Point, RedPenMark } from "@/lib/design";
import TypeOut from "@/components/TypeOut";
import { seededRandom } from "@/lib/napkin";

type OnFix = (fix: DesignAction) => void;

// SVG units for the 3:4 napkin; every mark comes in as normalized 0..1 coordinates.
const W = 300;
const H = 400;
/** Felt-tip width, in napkin units. */
const PEN = 1.35;
/** The longest a whole markup takes to write, in seconds; a longer one is written faster. */
const MAX_WRITE_S = 5;

interface RedPenOverlayProps {
  parts: Part[];
  marks: RedPenMark[];
  /** Changing this replays the pen animation (e.g. after a new review). */
  playKey: string;
  /** Show the scanner sweep while the drawing is read. */
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

/** When a mark's stroke is drawn and its note written, in seconds from the start. */
interface Timing {
  draw: number;
  drawFor: number;
  write: number;
  writeFor: number;
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
    case "tick":
      return mark.at;
  }
}

/** The engineer marks up in order: the part in question, its measurements, its label, then the issues, then a tick. */
const MARKUP_ORDER: Record<RedPenMark["kind"], number> = {
  outline: 0,
  dimension: 1,
  callout: 2,
  circle: 3,
  arrow: 3,
  "ghost-line": 3,
  tick: 4,
};

/** Rough pen travel for a mark, in napkin units: how long it takes to draw. */
function travel(mark: RedPenMark): number {
  const dist = (a: Point, b: Point) => Math.hypot((a[0] - b[0]) * W, (a[1] - b[1]) * H);
  switch (mark.kind) {
    case "arrow":
    case "dimension":
      return dist(mark.from, mark.to) + 16;
    case "circle":
      return 2 * Math.PI * mark.radius * W;
    case "outline":
      return 2 * (mark.box[2] * W + mark.box[3] * H) + 20;
    case "callout":
      return dist(mark.anchor, mark.label) + 10;
    case "ghost-line":
      return mark.points.reduce((n, p, i) => (i ? n + dist(mark.points[i - 1], p) : 0), 0);
    case "tick":
      return 36;
  }
}

/** One mark at a time, like a hand: draw the stroke, write its note, move on to the next. */
function schedule(marks: RedPenMark[], hidden: boolean[] | undefined, start: number): Timing[] {
  const order = marks
    .map((m, i) => ({ i, rank: MARKUP_ORDER[m.kind] }))
    .filter(({ i }) => !hidden?.[i])
    .sort((a, b) => a.rank - b.rank || a.i - b.i);
  const out: Timing[] = marks.map(() => ({ draw: 0, drawFor: 0, write: 0, writeFor: 0 }));
  let t = 0;
  for (const { i } of order) {
    const m = marks[i];
    const drawFor = Math.min(0.9, Math.max(0.3, travel(m) / 260));
    const writeFor = m.note ? Math.min(1.3, Math.max(0.3, m.note.length * 0.045)) : 0;
    out[i] = { draw: t, drawFor, write: t + drawFor * 0.8, writeFor };
    t = out[i].write + writeFor + 0.18;
  }
  const k = t > MAX_WRITE_S ? MAX_WRITE_S / t : 1;
  return out.map((x) => ({
    draw: start + x.draw * k,
    drawFor: x.drawFor * k,
    write: start + x.write * k,
    writeFor: x.writeFor * k,
  }));
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
  const timings = schedule(marks, hidden, penStart);
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
            text="Reading the drawing…"
            cps={24}
            linger={60_000}
            className="absolute bottom-[3%] left-[6%] font-hand text-[17px] text-redpen/85"
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
          style={{ "--retire-delay": `${penStart}s` } as CSSProperties}
        >
          {marks.length === 0 &&
            layoutTags(parts).map((tag, i) => (
              <PartTag key={i} tag={tag} seed={i + 1} delay={i * 0.08} />
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
                  timing={timings[i]}
                  onFix={onFix}
                  heavy={mark.kind === "outline" && outlineCount === 1}
                  badged={Boolean(numbers?.[i])}
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
            const t = timings[i];
            return (
              <g
                key={i}
                className={`pen-note ${active ? "mark-pulse" : ""}`}
                style={{
                  animationDelay: `${t.write + t.writeFor}s`,
                  transformOrigin: `${bx}px ${by}px`,
                  cursor: onSelectMark ? "pointer" : undefined,
                  pointerEvents: "auto",
                }}
                onClick={() => onSelectMark?.(i)}
              >
                <path
                  d={handLoop(bx, by, 6.4, 5.8, 100 + i, 2)}
                  fill={active ? "rgba(255, 75, 62, 0.25)" : "rgba(4, 4, 10, 0.7)"}
                  stroke="var(--redpen)"
                  strokeWidth={active ? PEN * 1.2 : PEN * 0.85}
                  strokeLinecap="round"
                />
                <text
                  x={bx}
                  y={by + 3.8}
                  textAnchor="middle"
                  fontSize="11.5"
                  fontWeight="700"
                  fill="var(--redpen)"
                  className="font-hand"
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

const TAG_FONT = 10.5;
/** Rough width of a Caveat label at TAG_FONT. */
const tagWidth = (text: string) => text.length * 4.4 + 2;

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
    const name = group[0].label.trim();
    const text = `${name.charAt(0).toUpperCase()}${name.slice(1)}${group.length > 1 ? ` ×${group.length}` : ""}`;
    return { boxes, left, anchorBox, text };
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
          labelY - 7,
          width,
          10,
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

/** A part the reader recognised, in pencil: rough corner brackets and a handwritten name. */
function PartTag({ tag, seed, delay }: { tag: Tag; seed: number; delay: number }) {
  return (
    <g className="part-tag" style={{ animationDelay: `${delay}s` }}>
      {tag.boxes.map(([x, y, w, h], i) => {
        const c = Math.min(6, w / 4, h / 4);
        const corners: Point[][] = [
          [[x, y + c], [x, y], [x + c, y]],
          [[x + w - c, y], [x + w, y], [x + w, y + c]],
          [[x + w, y + h - c], [x + w, y + h], [x + w - c, y + h]],
          [[x + c, y + h], [x, y + h], [x, y + h - c]],
        ];
        return (
          <path
            key={i}
            d={corners.map((pts, k) => handPath(pts, seed * 17 + i * 4 + k, 0.2)).join(" ")}
            fill="none"
            stroke="var(--ink-muted)"
            strokeWidth="0.9"
            strokeLinecap="round"
            opacity="0.7"
          />
        );
      })}
      {tag.label && (
        <>
          <path
            d={handPath(
              [
                [tag.label.fromX, tag.label.y],
                [tag.label.anchor === "end" ? tag.label.x + 2 : tag.label.x - 2, tag.label.y],
              ],
              seed * 31,
              0.3,
            )}
            fill="none"
            stroke="var(--ink-muted)"
            strokeWidth="0.7"
            strokeLinecap="round"
          />
          <text
            x={tag.label.x}
            y={tag.label.y + 3.4}
            textAnchor={tag.label.anchor}
            fontSize={TAG_FONT}
            fontWeight="600"
            fill="var(--ink-muted)"
            className="font-hand"
          >
            {tag.label.text}
          </text>
        </>
      )}
    </g>
  );
}

const scale = ([x, y]: Point): Point => [x * W, y * H];

/**
 * A polyline the way a hand draws it: resampled every few units and nudged off the line by a
 * slow, seeded wobble, so the same mark always wobbles the same way.
 */
function handPath(points: Point[], seed: number, amp = 0.6): string {
  const rand = seededRandom(seed * 7919 + 13);
  const p1 = rand() * Math.PI * 2;
  const p2 = rand() * Math.PI * 2;
  const out: Point[] = [];
  let s = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len === 0) continue;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    const steps = Math.max(1, Math.ceil(len / 3));
    for (let k = out.length === 0 ? 0 : 1; k <= steps; k++) {
      const t = k / steps;
      const d = s + t * len;
      const off = amp * (0.65 * Math.sin(d / 21 + p1) + 0.35 * Math.sin(d / 7.5 + p2));
      out.push([x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off]);
    }
    s += len;
  }
  return out.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

/** Points along a quadratic curve, for flicks of the pen. */
function quad([x0, y0]: Point, [cx, cy]: Point, [x1, y1]: Point, n = 16): Point[] {
  return Array.from({ length: n + 1 }, (_, i): Point => {
    const t = i / n;
    const u = 1 - t;
    return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
  });
}

/**
 * A loop drawn around (cx, cy), counter-clockwise from the upper left, that overshoots where it
 * started and drifts outward a little so the overshoot doesn't retrace it. n = 2 is an oval; a
 * higher n hugs a box.
 */
function handLoop(cx: number, cy: number, rx: number, ry: number, seed: number, n = 2): string {
  const rand = seededRandom(seed * 104729 + 7);
  const start = (1.1 + rand() * 0.3) * Math.PI;
  const turns = 1.08 + rand() * 0.06;
  const phase = rand() * Math.PI * 2;
  const steps = 120;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const t = start - f * turns * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const ey = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    const k = 1 + f * 0.06 + 0.02 * Math.sin(f * 9 + phase);
    d += `${i ? " L" : "M"}${(cx + ex * rx * k).toFixed(1)} ${(cy + ey * ry * k).toFixed(1)}`;
  }
  return d;
}

function Mark({
  mark,
  seed,
  timing,
  onFix,
  heavy = false,
  badged = false,
}: {
  mark: RedPenMark;
  seed: number;
  timing: Timing;
  onFix?: OnFix;
  heavy?: boolean;
  /** An issue number sits on the mark's start: notes there make room for it. */
  badged?: boolean;
}) {
  const draw: CSSProperties = {
    animationDelay: `${timing.draw}s`,
    animationDuration: `${timing.drawFor}s`,
    animationTimingFunction: "cubic-bezier(0.45, 0.05, 0.35, 1)",
  };
  const fix = mark.fix && onFix ? () => onFix(mark.fix!) : undefined;
  const pen = {
    fill: "none",
    stroke: "var(--redpen)",
    strokeWidth: PEN,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const note = (x: number, y: number, anchor: "start" | "middle" | "end", size?: number) =>
    mark.note ? (
      <Note x={x} y={y} anchor={anchor} text={mark.note} timing={timing} onClick={fix} size={size} seed={seed} />
    ) : null;

  if (mark.kind === "arrow") {
    const [fx, fy] = scale(mark.from);
    const [tx, ty] = scale(mark.to);
    const len = Math.hypot(tx - fx, ty - fy) || 1;
    // Bow the shaft slightly, like a quick flick of the pen.
    const c: Point = [
      (fx + tx) / 2 + (-(ty - fy) / len) * len * 0.12,
      (fy + ty) / 2 + ((tx - fx) / len) * len * 0.12,
    ];
    const a = Math.atan2(ty - c[1], tx - c[0]);
    // The head is one V-shaped stroke, a little lopsided.
    const head: Point[] = [
      [tx - 7.5 * Math.cos(a + 0.42), ty - 7.5 * Math.sin(a + 0.42)],
      [tx, ty],
      [tx - 6.5 * Math.cos(a - 0.5), ty - 6.5 * Math.sin(a - 0.5)],
    ];
    const awayX = (fx - tx) / len;
    const anchor = awayX < -0.25 ? "end" : awayX > 0.25 ? "start" : "middle";
    // The note starts where the arrow does, beside its issue number rather than under it.
    const gap = badged ? 9 : 4;
    return (
      <g>
        <path
          className="pen-draw"
          style={draw}
          pathLength={1}
          d={`${handPath(quad([fx, fy], c, [tx, ty]), seed)} ${handPath(head, seed + 50, 0.25)}`}
          {...pen}
        />
        {note(
          fx + (anchor === "start" ? gap : anchor === "end" ? -gap : 0),
          fy - (anchor === "middle" && badged ? 11 : 5),
          anchor,
        )}
      </g>
    );
  }

  if (mark.kind === "circle") {
    const [cx, cy] = scale(mark.center);
    const rx = mark.radius * W;
    const ry = rx * 0.85;
    return (
      <g>
        <path className="pen-draw" style={draw} pathLength={1} d={handLoop(cx, cy, rx, ry, seed)} {...pen} />
        {note(Math.min(W - 30, Math.max(30, cx)), cy - ry - (badged ? 14 : 9), "middle")}
      </g>
    );
  }

  if (mark.kind === "outline") {
    // A loop around the part that hugs its box: wide enough that the box's corners sit inside it.
    const [bx, by, bw, bh] = mark.box;
    const n = 5;
    const grow = Math.pow(2, 1 / n);
    const cx = (bx + bw / 2) * W;
    const cy = (by + bh / 2) * H;
    const rx = (bw * W * grow) / 2 + 3;
    const ry = (bh * H * grow) / 2 + 3;
    return (
      <g>
        <path
          className="pen-draw"
          style={draw}
          pathLength={1}
          d={handLoop(cx, cy, rx, ry, seed, n)}
          {...pen}
          strokeWidth={heavy ? PEN * 1.25 : PEN}
        />
        {/* Name the part beside its loop (callouts take the other margin), not above it, where the part above would be. */}
        {note(cx + rx > W * 0.8 ? cx - rx - 5 : cx + rx + 5, Math.min(H - 4, cy - ry + 14), cx + rx > W * 0.8 ? "end" : "start", 11.5)}
      </g>
    );
  }

  if (mark.kind === "dimension") {
    const [fx, fy] = scale(mark.from);
    const [tx, ty] = scale(mark.to);
    const len = Math.hypot(tx - fx, ty - fy) || 1;
    const nx = -(ty - fy) / len;
    const ny = (tx - fx) / len;
    const tick = 4.5;
    const vertical = Math.abs(ty - fy) > Math.abs(tx - fx);
    const mx = (fx + tx) / 2;
    const my = (fy + ty) / 2;
    const d = [
      handPath([[fx + nx * tick, fy + ny * tick], [fx - nx * tick, fy - ny * tick]], seed + 1, 0.2),
      handPath([[fx, fy], [tx, ty]], seed, 0.5),
      handPath([[tx + nx * tick, ty + ny * tick], [tx - nx * tick, ty - ny * tick]], seed + 2, 0.2),
    ].join(" ");
    return (
      <g>
        <path className="pen-draw" style={draw} pathLength={1} d={d} {...pen} strokeWidth={PEN * 0.85} />
        {vertical ? (
          <g transform={`rotate(-90 ${mx - 6} ${my})`}>{note(mx - 6, my, "middle", 11.5)}</g>
        ) : (
          note(mx, my - 5, "middle", 11.5)
        )}
      </g>
    );
  }

  if (mark.kind === "callout") {
    const [ax, ay] = scale(mark.anchor);
    const [lx, ly] = scale(mark.label);
    const toLeft = lx < ax;
    // A dot on the part, then a leader that bends out into the margin.
    const leader = quad([ax, ay], [ax + (toLeft ? -10 : 10), ly], [lx, ly], 10);
    return (
      <g>
        <circle className="pen-note" style={{ animationDelay: `${timing.draw}s` }} cx={ax} cy={ay} r={1.7} fill="var(--redpen)" />
        <path className="pen-draw" style={draw} pathLength={1} d={handPath(leader, seed, 0.35)} {...pen} strokeWidth={PEN * 0.85} />
        {note(toLeft ? lx - 3 : lx + 3, ly + 3.6, toLeft ? "end" : "start", 11.5)}
      </g>
    );
  }

  if (mark.kind === "tick") {
    const [x, y] = scale(mark.at);
    // A teacher's tick: a short dip, then a long stroke that curls up and away.
    const stroke = [
      ...quad([x - 10, y - 1], [x - 7, y + 3.5], [x - 3, y + 9], 6),
      ...quad([x - 3, y + 9], [x + 2.5, y - 5], [x + 17, y - 18], 12).slice(1),
    ];
    return (
      <g>
        <path className="pen-draw" style={draw} pathLength={1} d={handPath(stroke, seed, 0.35)} {...pen} strokeWidth={PEN * 1.3} />
        {note(x + 20, y + 5, "start", 15)}
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
      <path
        className="pen-note"
        style={{ animationDelay: `${timing.draw}s` }}
        d={handPath(points, seed, 0.5)}
        {...pen}
        strokeDasharray="5 4"
        opacity="0.85"
      />
      {note(endsLeft ? lx - 4 : lx + 4, Math.min(H - 4, ly + 14), endsLeft ? "end" : "start")}
    </g>
  );
}

/** A handwritten note, tilted a degree or two, written on left to right once its stroke is down. */
function Note({
  x,
  y,
  anchor,
  text,
  timing,
  onClick,
  size = 13,
  seed,
}: {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  text: string;
  timing: Timing;
  onClick?: () => void;
  size?: number;
  seed: number;
}) {
  const tilt = (seededRandom(seed * 31 + 5)() - 0.55) * 5;
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      transform={`rotate(${tilt.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`}
      className={`pen-write font-hand ${onClick ? "pen-fix" : ""}`}
      style={{ animationDelay: `${timing.write}s`, animationDuration: `${timing.writeFor}s` }}
      fontSize={size}
      fontWeight={600}
      fill="var(--redpen)"
      onClick={onClick}
    >
      {onClick && <title>Tap to apply this fix</title>}
      {text}
      {onClick && " ↻"}
    </text>
  );
}
