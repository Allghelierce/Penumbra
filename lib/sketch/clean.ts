import type { CleanShape, Part, PropellantId, SketchReading } from "../design";
import { NAPKIN_ASPECT } from "../design";

// The cleaned-up drawing: a crisp, symmetric side profile built from the parts the reader found,
// painted like the real vehicles of each propellant family. SVG paths in the overlay's 300 × 400
// viewBox, kept close to where the user drew each part so the morph from pencil lines up.

const W = 300;
const H = 400;

interface Livery {
  fill: string;
  stroke: string;
  /** Darker bands across the tanks (stainless panels, solid segments, foam ribs). */
  band: string;
  interstage: string;
}

/** A nod to the real vehicles: stainless Starship, white Falcon, orange-foam SLS tank, white solids. */
const LIVERY: Record<PropellantId, Livery> = {
  methalox: { fill: "#c9ced3", stroke: "#7d848b", band: "#aab1b8", interstage: "#8f959c" },
  kerolox: { fill: "#f4f5f6", stroke: "#8e949a", band: "#e1e4e7", interstage: "#1c1c1e" },
  hydrolox: { fill: "#d9822b", stroke: "#8f531a", band: "#c47322", interstage: "#e8e4da" },
  solid: { fill: "#f2f2f2", stroke: "#8e949a", band: "#b8bcc0", interstage: "#5c6066" },
  hypergolic: { fill: "#d9d4c5", stroke: "#7f7a6c", band: "#c4bfaf", interstage: "#3d3a33" },
};
const ENGINE = { fill: "#3a3d42", stroke: "#1f2125" };
const SHIELD = { fill: "#121212", stroke: "#2e2e2e" };
const WINDOW = { fill: "#1b2a3a", stroke: "#6b7a88" };

export function cleanProfile(reading: SketchReading): CleanShape[] {
  if ((reading.confidence ?? 1) < 0.5 || reading.parts.length === 0) return [];
  const of = (kind: Part["kind"]) => reading.parts.filter((p) => p.kind === kind);
  const px = (p: Part["box"]) => ({ x: p[0] * W, y: p[1] * H, w: p[2] * W, h: p[3] * H });

  const tanks = of("tank").map((p) => ({ ...px(p.box), stage: p.stageIndex ?? 0 })).sort((a, b) => a.y - b.y);
  if (tanks.length === 0) return [];
  const cx = tanks.reduce((s, t) => s + t.x + t.w / 2, 0) / tanks.length;
  const livery = (stage: number) => LIVERY[reading.design.stages[stage]?.propellant ?? "methalox"] ?? LIVERY.methalox;
  const top = tanks[0];
  const topLivery = livery(top.stage);
  const bottom = tanks[tanks.length - 1];
  // The drawn body runs down to the engines; the reader's tank band stops short of that.
  const engineTop = Math.min(...of("engine").map((p) => p.box[1] * H));
  if (Number.isFinite(engineTop) && engineTop > bottom.y + bottom.h) bottom.h = engineTop - bottom.y;
  const shapes: CleanShape[] = [];

  // Behind the body: fins and legs, mirrored about the centreline.
  const finReach = Math.max(0, ...of("fin").map((p) => Math.max(Math.abs(px(p.box).x - cx), Math.abs(px(p.box).x + px(p.box).w - cx))));
  const fins = of("fin").map((p) => px(p.box));
  if (fins.length > 0) {
    const y0 = Math.min(...fins.map((f) => f.y));
    const y1 = Math.max(...fins.map((f) => f.y + f.h));
    const half = bottom.w / 2;
    for (const side of [-1, 1]) {
      const root = cx + side * half;
      const tip = cx + side * finReach;
      shapes.push({
        part: "fin",
        d: path([[root, y0], [tip, y0 + 0.5 * (y1 - y0)], [tip, y1], [root, y1]]),
        fill: livery(bottom.stage).fill,
        stroke: livery(bottom.stage).stroke,
      });
    }
  }
  const legs = of("landing-legs").map((p) => px(p.box));
  if (legs.length > 0) {
    const y0 = Math.min(...legs.map((l) => l.y));
    const y1 = Math.max(...legs.map((l) => l.y + l.h));
    const reach = Math.max(...legs.map((l) => Math.max(Math.abs(l.x - cx), Math.abs(l.x + l.w - cx))));
    const stage = of("landing-legs")[0].stageIndex ?? 0;
    const wall = (tanks.find((t) => t.stage === stage) ?? bottom).w / 2;
    for (const side of [-1, 1]) {
      const a = cx + side * wall;
      const b = cx + side * reach;
      shapes.push({ part: "landing-legs", d: path([[a, y0], [a + side * 3, y0], [b + side * 1.5, y1], [b - side * 1.5, y1]]), ...ENGINE });
      shapes.push({ part: "landing-legs", d: path([[b - 7, y1], [b + 7, y1], [b + 7, y1 + 2.5], [b - 7, y1 + 2.5]]), ...ENGINE });
    }
  }

  // Engines: proper bells hanging from the bottom of the body.
  for (const p of of("engine")) {
    const e = px(p.box);
    const across = Math.min(5, Math.max(1, Math.round((p.box[2] * NAPKIN_ASPECT) / Math.max(p.box[3] * 0.9, 1e-3))));
    const span = Math.min(e.w, bottom.w * 0.95);
    const left = cx - span / 2;
    const bw = span / across;
    const y0 = Math.max(e.y, bottom.y + bottom.h);
    const y1 = Math.max(y0 + 6, e.y + e.h);
    for (let i = 0; i < across; i++) {
      const c = left + bw * (i + 0.5);
      const half = 0.47 * bw;
      const throat = 0.16 * bw;
      shapes.push({
        part: "engine",
        d:
          `M${fx(c - throat)} ${fy(y0)} C${fx(c - throat)} ${fy(y0 + 0.45 * (y1 - y0))} ${fx(c - half)} ${fy(y1 - 0.25 * (y1 - y0))} ${fx(c - half)} ${fy(y1)} ` +
          `L${fx(c + half)} ${fy(y1)} C${fx(c + half)} ${fy(y1 - 0.25 * (y1 - y0))} ${fx(c + throat)} ${fy(y0 + 0.45 * (y1 - y0))} ${fx(c + throat)} ${fy(y0)} Z`,
        ...ENGINE,
      });
    }
  }

  // The body: one straight-walled section per stage, banded, with interstages between stages.
  for (const t of tanks) {
    const l = livery(t.stage);
    const half = t.w / 2;
    shapes.push({ part: "tank", d: rect(cx - half, t.y, 2 * half, t.h), fill: l.fill, stroke: l.stroke });
    const bands = Math.max(3, Math.min(5, Math.round(t.h / 40)));
    for (let i = 1; i <= bands; i++) {
      const by = t.y + (t.h * i) / (bands + 1);
      shapes.push({ part: "body", d: rect(cx - half, by - 1.2, 2 * half, 2.4), fill: l.band });
    }
  }
  for (let i = 1; i < tanks.length; i++) {
    const t = tanks[i];
    shapes.push({ part: "interstage", d: rect(cx - t.w / 2 - 0.5, t.y - 4, t.w + 1, 8), fill: livery(t.stage).interstage });
  }
  // Thrust section at the base.
  shapes.push({ part: "body", d: rect(cx - bottom.w / 2, bottom.y + bottom.h - 5, bottom.w, 5), fill: livery(bottom.stage).interstage });

  // Payload section and an ogive nose on the top stage.
  const half = top.w / 2;
  const payload = of("payload")[0] ? px(of("payload")[0].box) : null;
  const bodyTop = payload ? Math.min(payload.y, top.y) : top.y;
  if (payload) shapes.push({ part: "payload", d: rect(cx - half, bodyTop, 2 * half, top.y - bodyTop), fill: topLivery.fill, stroke: topLivery.stroke });
  const noseBox = of("nose")[0] ? px(of("nose")[0].box) : null;
  const tipY = Math.max(0, noseBox ? noseBox.y : bodyTop - 1.6 * half);
  const length = bodyTop - tipY;
  shapes.push({
    part: "nose",
    d:
      `M${fx(cx - half)} ${fy(bodyTop)} C${fx(cx - half)} ${fy(bodyTop - 0.55 * length)} ${fx(cx - 0.32 * half)} ${fy(tipY + 0.05 * length)} ${fx(cx)} ${fy(tipY)} ` +
      `C${fx(cx + 0.32 * half)} ${fy(tipY + 0.05 * length)} ${fx(cx + half)} ${fy(bodyTop - 0.55 * length)} ${fx(cx + half)} ${fy(bodyTop)} Z`,
    fill: topLivery.fill,
    stroke: topLivery.stroke,
  });

  // Heat shield: a black hex-tiled panel on the side it was drawn.
  for (const p of of("heat-shield")) {
    const s = px(p.box);
    const tank = tanks.find((t) => t.stage === (p.stageIndex ?? top.stage)) ?? top;
    const left = s.x + s.w / 2 < cx;
    const x0 = left ? cx - tank.w / 2 : cx;
    shapes.push({ part: "heat-shield", d: rect(x0, s.y, tank.w / 2, s.h), ...SHIELD });
    shapes.push({ part: "heat-shield", d: hexes(x0, s.y, tank.w / 2, s.h), fill: "none", stroke: SHIELD.stroke });
  }

  // A window on the crew or payload section.
  const win = of("window")[0] ? px(of("window")[0].box) : payload;
  if (win) {
    const r = Math.max(3, Math.min(0.18 * (2 * half), 0.3 * win.h));
    const wy = win.y + win.h / 2;
    shapes.push({ part: "window", d: `M${fx(cx - r)} ${fy(wy)} a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0 a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0 Z`, ...WINDOW });
  }
  return shapes;
}

/** A small hexagon lattice clipped to the rectangle, as one path. */
function hexes(x: number, y: number, w: number, h: number): string {
  const r = 3.2;
  const dx = r * Math.sqrt(3);
  const parts: string[] = [];
  for (let row = 0, cy = y + r; cy < y + h - r * 0.5; row++, cy += 1.5 * r) {
    for (let cx = x + dx / 2 + (row % 2 ? dx / 2 : 0); cx < x + w - dx / 2; cx += dx) {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
      });
      parts.push(path(pts));
    }
  }
  return parts.join(" ") || rect(x, y, w, h);
}

function rect(x: number, y: number, w: number, h: number): string {
  return path([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
}

function path(points: [number, number][]): string {
  return `M${points.map(([x, y]) => `${fx(x)} ${fy(y)}`).join(" L")} Z`;
}

/** One decimal. fx/fy also clamp into the viewBox; n is for relative lengths. */
const n = (v: number) => (Math.round(v * 10) / 10).toString();
const fx = (v: number) => n(Math.min(Math.max(v, 0), W));
const fy = (v: number) => n(Math.min(Math.max(v, 0), H));
