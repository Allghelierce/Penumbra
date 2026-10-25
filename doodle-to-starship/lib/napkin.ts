import { NAPKIN_ASPECT, type Stroke } from "./design";

/** Draws strokes as soft pencil lines onto a context that is `width` × `height` pixels. */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  color = "#2d2d2d",
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, width * 0.0055);
  for (const { points } of strokes) {
    if (points.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(points[0][0] * width, points[0][1] * height);
    if (points.length === 1) {
      ctx.lineTo(points[0][0] * width + 0.1, points[0][1] * height);
    }
    // Curve through midpoints so fast strokes don't look polygonal.
    for (let i = 1; i < points.length - 1; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      ctx.quadraticCurveTo(x0 * width, y0 * height, ((x0 + x1) / 2) * width, ((y0 + y1) / 2) * height);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last[0] * width, last[1] * height);
    ctx.stroke();
  }
  ctx.restore();
}

/** The napkin as a PNG data URL for Grok vision: dark strokes on plain white. */
export function strokesToPng(strokes: Stroke[], width = 768): string {
  const height = Math.round(width / NAPKIN_ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  drawStrokes(ctx, strokes, width, height, "#111111");
  return canvas.toDataURL("image/png");
}

/** Small deterministic PRNG so hand-drawn wobble looks the same on every render. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** SVG path for a pen loop around (cx, cy) that overshoots its start, like a real hand-drawn circle. */
export function penLoop(cx: number, cy: number, rx: number, ry: number, seed: number): string {
  const rand = seededRandom(seed);
  const start = rand() * Math.PI * 2;
  const steps = 56;
  const turns = 1.12;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = start + (i / steps) * turns * Math.PI * 2;
    // Drift outward a little so the overshoot doesn't retrace the first pass.
    const k = 1 + (rand() - 0.5) * 0.05 + (i / steps) * 0.07;
    const x = cx + Math.cos(t) * rx * k;
    const y = cy + Math.sin(t) * ry * k;
    d += `${i === 0 ? "M" : " L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}
