import { NAPKIN_ASPECT, type Analysis, type FlightEvent, type FlightTrace, type SketchReading, type Stroke } from "@/lib/design";
import { buildDoodle, unionBox, type Nozzle, type Vec } from "./geometry";
import {
  buildPlan,
  headingAt,
  sampleAt,
  T_CAM_FROM,
  T_FRAMED,
  T_IGNITE,
  T_LIFTOFF,
  T_NIGHT,
  type CaptionCue,
  type Finale,
} from "./plan";
import {
  clamp01,
  drawGround,
  drawHorizonGlow,
  drawLimb,
  drawSky,
  drawStars,
  drawTargetBody,
  glowSprite,
  makePad,
  makeStars,
  mix,
  readPalette,
  rgba,
  seeded,
  targetBodyFor,
  type RGB,
} from "./scenery";

export interface NapkinRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LaunchInput {
  strokes: Stroke[];
  /** Where the napkin sat on screen (viewport px), so the doodle starts exactly there. */
  napkinRect?: NapkinRect | null;
  reading: SketchReading;
  analysis: Analysis;
  trace: FlightTrace;
}

export interface LaunchHooks {
  onCaption: (c: CaptionCue & { id: number }) => void;
  onFinale: (f: Finale) => void;
  onEnd: () => void;
  onEvent: (e: FlightEvent) => void;
}

export interface LaunchHandle {
  stop: () => void;
  /** Jump straight to the end card. */
  skip: () => void;
}

/** The ground sits this many rocket heights below the pad deck. */
const GROUND = 0.05;
const CHALK_GLOW: RGB = [190, 215, 255];

type SpriteId = "hot" | "fire" | "smoke" | "lit" | "spark" | "puff";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r0: number;
  r1: number;
  a0: number;
  sprite: SpriteId;
  drag: number;
  /** World particles only: gravity, in rocket heights / s². */
  g: number;
  add: boolean;
}

/** A chunk of the doodle flying apart after an explosion. Points are y-down offsets from (x, y). */
interface Fragment {
  pts: Vec[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  age: number;
  life: number;
}

interface Pose {
  x: number;
  y: number;
  rot: number;
}

const ease = (x: number) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeOutBack = (x: number) => {
  const k = clamp01(x) - 1;
  return 1 + 2.4 * k * k * k + 1.4 * k * k;
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** Local (y down) point → world (y up) under a pose. */
function toWorld(p: Pose, v: Vec): Vec {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return [p.x + v[0] * c - v[1] * s, p.y - (v[0] * s + v[1] * c)];
}

/** Same curve-through-midpoints smoothing as the napkin's pencil (lib/napkin.ts). */
function pencilPath(lines: Vec[][]): Path2D {
  const path = new Path2D();
  for (const l of lines) {
    if (l.length === 0) continue;
    path.moveTo(l[0][0], l[0][1]);
    if (l.length === 1) {
      path.lineTo(l[0][0] + 1e-4, l[0][1]);
      continue;
    }
    for (let i = 1; i < l.length - 1; i++) {
      const [x0, y0] = l[i];
      const [x1, y1] = l[i + 1];
      path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    const end = l[l.length - 1];
    path.lineTo(end[0], end[1]);
  }
  return path;
}

function polyPath(lines: Vec[][]): Path2D {
  const path = new Path2D();
  for (const l of lines) {
    l.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
  }
  return path;
}

export function startLaunch(
  canvas: HTMLCanvasElement,
  hud: HTMLElement | null,
  input: LaunchInput,
  hooks: LaunchHooks,
): LaunchHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    hooks.onEnd();
    return { stop: () => {}, skip: () => {} };
  }

  const design = input.reading.design;
  const doodle = buildDoodle(input.strokes, input.reading.parts ?? [], design.stages?.length ?? 1);
  const pieces = doodle.pieces;
  const plan = buildPlan(input.trace, input.analysis, design, pieces.length);
  const pal = readPalette();
  const Hn = doodle.height;
  const Wn = doodle.width;
  const nuPerKm = (Hn / Math.min(400, Math.max(5, design.heightM || 50))) * 1000;
  const orbitish = plan.outcome === "orbit" || plan.outcome === "destination";
  const body = plan.outcome === "destination" ? targetBodyFor(design.destination) : null;

  const piecePaths = pieces.map((p) => pencilPath(p.lines));
  const padPath = polyPath(makePad(doodle, GROUND * Hn, seeded(11)));
  const stars = makeStars(seeded(5));
  const wobbleRand = seeded(23);
  const horizon = Array.from({ length: 48 }, () => (wobbleRand() - 0.5) * 3);
  const sprites: Record<SpriteId, HTMLCanvasElement> = {
    hot: glowSprite(pal.flameHot),
    fire: glowSprite(pal.flame),
    smoke: glowSprite([118, 124, 134]),
    lit: glowSprite([170, 120, 92]),
    spark: glowSprite([255, 244, 220]),
    puff: glowSprite([222, 230, 240]),
  };
  // Camera focus and zoom once the lower stages are gone: the middle of what's still attached.
  const remaining = pieces.map((_, i) => {
    const b = unionBox(pieces, i);
    return { c: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] as Vec, h: Math.max(b.maxY - b.minY, 0.01), top: b.minY };
  });
  const tipPivot: Vec = [doodle.box.maxX * 0.8, doodle.box.maxY];

  let raf = 0;
  let last = performance.now();
  let t = 0;
  let W = 0;
  let H = 0;
  let pitch = 0;
  let exploded = false;
  let explodedAt = 0;
  let blast: Vec = [0, 0];
  const local: Particle[] = [];
  const world: Particle[] = [];
  const frags: Fragment[] = [];
  let emitLocal = 0;
  let emitSmoke = 0;
  let cueIdx = 0;
  let capIdx = 0;
  let capId = 0;
  let finaleShown = false;
  let ended = false;
  let hudShown = "";

  const attached = (i: number) => plan.seps[i] === undefined || t < plan.seps[i];

  const throttle = (i: number) => {
    if (exploded) return 0;
    let v = 0;
    for (const b of plan.burns) {
      if (b.piece !== i) continue;
      v = Math.max(v, Math.min(ease((t - b.from) / 0.3), 1 - ease((t - b.to) / 0.35)));
    }
    if (plan.liftoffAt !== null && t < plan.liftoffAt) v *= 0.55 + 0.45 * ease((t - (plan.liftoffAt - 0.7)) / 0.7);
    return v;
  };

  /** Offset of a dropped stage relative to where it used to be attached. */
  const pieceDrift = (i: number) => {
    const at = plan.seps[i];
    if (at === undefined || t < at) return null;
    const d = t - at;
    const dir = i % 2 ? 1 : -1;
    return {
      dx: dir * 0.04 * Hn * d,
      dy: 0.06 * Hn * d + 0.32 * Hn * d * d,
      rot: dir * (0.35 * d + 0.18 * d * d),
      alpha: 1 - clamp01((d - 1.6) / 1.4),
    };
  };

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || window.innerWidth;
    const ch = canvas.clientHeight || window.innerHeight;
    if (cw !== W || ch !== H || canvas.width !== Math.round(cw * dpr)) {
      W = cw;
      H = ch;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  function explode(pose: Pose, focus: Vec, top: number) {
    exploded = true;
    explodedAt = t;
    blast = plan.outcome === "suborbital" ? toWorld(pose, [focus[0], top]) : toWorld(pose, focus);

    // The doodle itself comes apart: every attached stroke breaks into chunks that fly.
    const lines = pieces.flatMap((p, i) => (attached(i) ? p.lines : []));
    const total = lines.reduce((n, l) => n + l.length, 0);
    const chunk = Math.max(4, Math.ceil(total / 110));
    for (const l of lines) {
      for (let s = 0; s < l.length - 1; s += chunk - 1) {
        const seg = l.slice(s, s + chunk).map((v) => toWorld(pose, v));
        if (seg.length < 2) continue;
        const cx = seg.reduce((a, q) => a + q[0], 0) / seg.length;
        const cy = seg.reduce((a, q) => a + q[1], 0) / seg.length;
        const dx = cx - blast[0];
        const dy = cy - blast[1];
        const len = Math.hypot(dx, dy) || 1e-6;
        const sp = rnd(0.5, 1.9) * Hn;
        frags.push({
          pts: seg.map((q): Vec => [q[0] - cx, -(q[1] - cy)]),
          x: cx,
          y: cy,
          vx: (dx / len) * sp + rnd(-0.2, 0.2) * Hn,
          vy: (dy / len) * sp + rnd(0.4, 1.2) * Hn,
          rot: 0,
          vr: rnd(-6, 6),
          age: 0,
          life: rnd(2.4, 3.6),
        });
      }
    }
    const [bx, by] = blast;
    for (let i = 0; i < 70; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(0.2, 1.3) * Hn;
      world.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8 + 0.2 * Hn, age: 0, life: rnd(0.5, 1.4), r0: 0.06 * Hn, r1: rnd(0.25, 0.55) * Hn, a0: 0.9, sprite: i % 3 ? "fire" : "hot", drag: 2, g: 0, add: true });
    }
    for (let i = 0; i < 36; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(0.1, 0.5) * Hn;
      world.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.15 * Hn, age: 0, life: rnd(2, 4), r0: 0.1 * Hn, r1: rnd(0.5, 0.85) * Hn, a0: 0.45, sprite: "smoke", drag: 1, g: 0, add: false });
    }
    for (let i = 0; i < 80; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(0.8, 2.8) * Hn;
      world.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.5 * Hn, age: 0, life: rnd(0.6, 1.6), r0: 0.016 * Hn, r1: 0.008 * Hn, a0: 1, sprite: "spark", drag: 0.6, g: 1.4 * Hn, add: true });
    }
  }

  function stepParticles(list: Particle[], dt: number) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k - p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function drawParticles(list: Particle[], map: (p: Particle) => [number, number, number]) {
    for (const additive of [false, true]) {
      ctx!.globalCompositeOperation = additive ? "lighter" : "source-over";
      for (const p of list) {
        if (p.add !== additive) continue;
        const k = p.age / p.life;
        const [x, y, scale] = map(p);
        const r = (p.r0 + (p.r1 - p.r0) * (1 - (1 - k) * (1 - k))) * scale;
        ctx!.globalAlpha = p.a0 * (1 - k) * Math.min(1, p.age * 10);
        ctx!.drawImage(sprites[p.sprite], x - r, y - r, r * 2, r * 2);
      }
    }
    ctx!.globalCompositeOperation = "source-over";
    ctx!.globalAlpha = 1;
  }

  function teardrop(x: number, y: number, hw: number, L: number) {
    ctx!.beginPath();
    ctx!.moveTo(x - hw, y);
    ctx!.bezierCurveTo(x - hw * 1.3, y + L * 0.25, x - hw * 0.45, y + L * 0.7, x, y + L);
    ctx!.bezierCurveTo(x + hw * 0.45, y + L * 0.7, x + hw * 1.3, y + L * 0.25, x + hw, y);
    ctx!.closePath();
  }

  /** Flame in rocket-local units, pointing down the rocket's axis. */
  function drawFlame(n: Nozzle, thr: number, plume: number, alpha: number, Z: number, seed: number) {
    const c = ctx!;
    const flick = 1 + 0.09 * Math.sin(t * 41 + seed) + 0.06 * Math.sin(t * 67 + 1.7 * seed) + rnd(-0.03, 0.03);
    const L = Hn * (0.3 + 0.3 * plume) * thr * flick;
    const hw = (n.w / 2) * (1 + 0.7 * plume) * (0.85 + 0.15 * thr);
    c.save();
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = 0.55 * thr * alpha;
    c.drawImage(sprites.fire, n.x - hw * 3, n.y - hw * 1.2, hw * 6, L * 1.15 + hw * 2);
    const g = c.createLinearGradient(0, n.y, 0, n.y + L);
    g.addColorStop(0, rgba(pal.flameHot, 0.95));
    g.addColorStop(0.4, rgba(pal.flame, 0.8));
    g.addColorStop(1, rgba(pal.flame, 0));
    c.globalAlpha = alpha;
    c.fillStyle = g;
    teardrop(n.x, n.y, hw, L);
    c.fill();
    const core = c.createLinearGradient(0, n.y, 0, n.y + L * 0.5);
    core.addColorStop(0, "rgba(255,255,240,0.95)");
    core.addColorStop(1, rgba(pal.flameHot, 0));
    c.fillStyle = core;
    teardrop(n.x, n.y, hw * 0.55, L * 0.5);
    c.fill();
    // A pencil outline that redraws itself a dozen times a second, like a flipbook.
    const r = seeded(Math.floor(t * 12) * 31 + seed);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 0.75 * alpha * thr;
    c.strokeStyle = rgba(pal.flameHot, 1);
    c.lineWidth = 1.6 / Z;
    c.lineJoin = "round";
    teardrop(n.x + (r() - 0.5) * hw * 0.3, n.y, hw * (1.05 + r() * 0.15), L * (0.85 + r() * 0.12));
    c.stroke();
    c.restore();
  }

  /** Plasma on the leading nose, streaming back along the body (rocket-local units). */
  function drawReentry(k: number, nose: Vec, Z: number) {
    const c = ctx!;
    const r = Wn * (0.8 + 0.2 * Math.sin(t * 31)) * k;
    c.save();
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = 0.85 * k;
    c.drawImage(sprites.hot, nose[0] - r, nose[1] - r, r * 2, r * 2);
    c.globalAlpha = 0.45 * k;
    c.drawImage(sprites.fire, nose[0] - r * 1.5, nose[1] - r * 0.5, r * 3, Hn * 0.9 * k + r);
    const rand = seeded(Math.floor(t * 14));
    c.strokeStyle = rgba(pal.flameHot, 1);
    c.lineWidth = 1.5 / Z;
    c.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      const x = nose[0] + (rand() - 0.5) * Wn * 0.9;
      c.globalAlpha = 0.7 * k * rand();
      c.beginPath();
      c.moveTo(x, nose[1] + rand() * Hn * 0.08);
      c.lineTo(x + (x - nose[0]) * 0.4, nose[1] + Hn * (0.4 + rand() * 0.6));
      c.stroke();
    }
    c.restore();
  }

  function strokeDoodle(path: Path2D, alpha: number, chalk: number, Z: number) {
    const c = ctx!;
    const lw = Math.max(2 / Z, 0.0055 * NAPKIN_ASPECT);
    c.lineCap = "round";
    c.lineJoin = "round";
    if (chalk > 0.01) {
      c.strokeStyle = rgba(CHALK_GLOW, 1);
      c.globalAlpha = alpha * chalk * 0.12;
      c.lineWidth = lw * 4.5;
      c.stroke(path);
      c.globalAlpha = alpha * chalk * 0.25;
      c.lineWidth = lw * 2.4;
      c.stroke(path);
    }
    c.globalAlpha = alpha;
    c.strokeStyle = rgba(mix(pal.graphite, pal.chalk, chalk), 1);
    c.lineWidth = lw;
    c.stroke(path);
    c.globalAlpha = 1;
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    t += dt;
    resize();
    const c = ctx!;

    // --- Where the flight is ---
    const flying = plan.liftoffAt !== null && t >= plan.liftoffAt;
    const sim = plan.simAt(t);
    const s = sampleAt(plan.points, sim);
    const altKm = flying ? s.alt : 0;

    let target = pitch;
    if (flying && t > (plan.liftoffAt ?? 0) + 0.4) {
      const h = headingAt(plan, sim);
      if (h !== null) target = h;
    }
    if (orbitish && t >= plan.finaleAt) target = Math.PI / 2;
    pitch += angleDiff(target, pitch) * (1 - Math.exp(-dt * 2.5));

    let pose: Pose = { x: 0, y: Hn / 2, rot: 0 };
    if (flying) pose = { x: s.down * nuPerKm, y: s.alt * nuPerKm + Hn / 2, rot: pitch };
    if (plan.tipAt !== null && t >= plan.tipAt) {
      const th = 1.5 * Math.pow(clamp01((t - plan.tipAt) / 1.15), 2);
      const [px, py] = tipPivot;
      pose = { x: px - px * Math.cos(th) + py * Math.sin(th), y: px * Math.sin(th) + py * Math.cos(th), rot: th };
    }

    // Camera focus slides onto whatever is still attached after each separation.
    let focus: Vec = [0, 0];
    let boost = 1;
    let top = doodle.box.minY;
    plan.seps.forEach((at, i) => {
      const next = remaining[i + 1];
      if (!next || t <= at) return;
      const k = ease((t - at) / 1.4);
      focus = [lerp(focus[0], next.c[0], k), lerp(focus[1], next.c[1], k)];
      boost = lerp(boost, Math.min(1.6, Math.max(1, Math.sqrt(Hn / next.h))), k);
      top = next.top;
    });

    if (!exploded && plan.explodeAt !== null && t >= plan.explodeAt) explode(pose, focus, top);

    // Falling back fast through the air: the nose glows.
    const falling = flying && plan.outcome === "suborbital" && sampleAt(plan.points, sim - 2).alt > s.alt;
    const reentry = falling ? clamp01((100 - altKm) / 50) * clamp01((s.speed - 600) / 1200) : 0;

    // --- Camera ---
    const fit = Math.min(H * 0.86, (W * 0.86) / NAPKIN_ASPECT);
    const rect = input.napkinRect && input.napkinRect.height > 0 ? input.napkinRect : null;
    const boxH = rect ? rect.height : fit;
    const nx = rect
      ? rect.left + (doodle.origin[0] / NAPKIN_ASPECT) * rect.width
      : (W - boxH * NAPKIN_ASPECT) / 2 + doodle.origin[0] * boxH;
    const ny = (rect ? rect.top : (H - boxH) / 2) + doodle.origin[1] * boxH;
    const e = ease((t - T_CAM_FROM) / (T_FRAMED - T_CAM_FROM));
    const Zl = Math.min(1.8 * fit, Math.max(0.12 * fit, Math.min((0.36 * H) / Hn, (0.42 * W) / Wn)));
    const Z = lerp(boxH, Zl, e) * boost;
    const rsx = lerp(nx, W / 2, e);
    const rsy = lerp(ny, H * 0.8 - (Hn / 2) * Zl, e);
    let camX = -(rsx - W / 2) / Z;
    let camY = Hn / 2 - (H / 2 - rsy) / Z;
    if (plan.liftoffAt !== null) {
      const fw = toWorld(pose, focus);
      camX += fw[0];
      // Keep the rocket just above center; in orbit drop it lower to leave room for the verdict.
      const followY = 0.47 + (orbitish ? 0.15 * ease((t - plan.finaleAt) / 1.5) : 0);
      camY = Math.max(camY, fw[1] - ((0.5 - followY) * H) / Z);
    }
    const quake = exploded ? 14 * Math.exp(-3 * (t - explodedAt)) : 0;
    const qx = rnd(-quake, quake);
    const qy = rnd(-quake, quake);
    const SX = (wx: number) => W / 2 + (wx - camX) * Z + qx;
    const SY = (wy: number) => H / 2 - (wy - camY) * Z + qy;

    // --- Particles ---
    const plume = clamp01(altKm / 60);
    let thrMax = 0;
    pieces.forEach((p, i) => {
      const thr = throttle(i);
      if (!attached(i) || thr < 0.05) return;
      thrMax = Math.max(thrMax, thr);
      emitLocal += 70 * thr * dt;
      while (emitLocal >= 1) {
        emitLocal -= 1;
        local.push({
          x: p.nozzle.x + rnd(-0.3, 0.3) * p.nozzle.w,
          y: p.nozzle.y + rnd(0, 0.08) * Hn,
          vx: rnd(-0.12, 0.12) * Hn * (1 + plume * 2),
          vy: rnd(0.9, 1.8) * Hn,
          age: 0,
          life: rnd(0.25, 0.6),
          r0: p.nozzle.w * 0.35,
          r1: p.nozzle.w * (0.9 + plume * 1.6),
          a0: 0.5,
          sprite: Math.random() < 0.5 ? "hot" : "fire",
          drag: 0.5,
          g: 0,
          add: true,
        });
      }
    });
    const baseAlt = flying ? s.alt * nuPerKm : 0;
    if (thrMax > 0.05 && baseAlt < Hn * 0.9) {
      emitSmoke += (plan.liftoffAt === null ? 95 : 70) * thrMax * (1 - baseAlt / (Hn * 0.9)) * dt;
      while (emitSmoke >= 1) {
        emitSmoke -= 1;
        const dir = Math.random() < 0.5 ? -1 : 1;
        world.push({
          x: rnd(-0.2, 0.2) * Wn,
          y: -GROUND * Hn * 0.5,
          vx: dir * rnd(0.25, 1.1) * Hn,
          vy: rnd(0.03, 0.25) * Hn,
          age: 0,
          life: rnd(2.5, 5),
          r0: 0.05 * Hn,
          r1: rnd(0.3, 0.55) * Hn,
          a0: 0.28,
          sprite: Math.random() < 0.45 ? "lit" : "smoke",
          drag: 0.8,
          g: 0,
          add: false,
        });
      }
    }
    plan.seps.forEach((at, i) => {
      if (t - dt < at && t >= at && pieces[i]) {
        const y = pieces[i].box.minY;
        for (let k = 0; k < 26; k++) {
          local.push({ x: rnd(pieces[i].box.minX, pieces[i].box.maxX), y, vx: rnd(-0.5, 0.5) * Hn, vy: rnd(-0.05, 0.2) * Hn, age: 0, life: rnd(0.6, 1.2), r0: 0.03 * Hn, r1: 0.12 * Hn, a0: 0.5, sprite: "puff", drag: 1.5, g: 0, add: false });
        }
      }
    });
    if (local.length > 400) local.splice(0, local.length - 400);
    if (world.length > 1400) world.splice(0, world.length - 1400);
    stepParticles(local, dt);
    stepParticles(world, dt);
    const groundLevel = -GROUND * Hn;
    for (let i = frags.length - 1; i >= 0; i--) {
      const f = frags[i];
      f.age += dt;
      if (f.age >= f.life) {
        frags.splice(i, 1);
        continue;
      }
      f.vy -= 1.4 * Hn * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
      if (f.y < groundLevel) {
        f.y = groundLevel;
        f.vy = Math.abs(f.vy) * 0.3;
        f.vx *= 0.6;
        f.vr *= 0.6;
      }
    }

    // --- Draw ---
    const night = ease((t - 0.15) / (T_NIGHT - 0.15));
    const chalk = ease((t - 0.25) / (T_NIGHT - 0.05));
    const padK = easeOut((t - 0.6) / 0.9);

    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    if (night < 1) {
      c.fillStyle = rgba(pal.table, 1);
      c.fillRect(0, 0, W, H);
      const n = doodle.napkin;
      c.save();
      c.translate(SX(0), SY(Hn / 2));
      c.scale(Z, Z);
      c.fillStyle = rgba(pal.napkin, 1);
      c.fillRect(n.minX, n.minY, n.maxX - n.minX, n.maxY - n.minY);
      c.strokeStyle = rgba(pal.napkinEdge, 1);
      c.lineWidth = 2 / Z;
      c.strokeRect(n.minX, n.minY, n.maxX - n.minX, n.maxY - n.minY);
      c.restore();
    }
    drawSky(c, W, H, pal, altKm, night);
    const finaleK = orbitish ? Math.max(0, t - plan.finaleAt) : 0;
    drawStars(
      c,
      stars,
      W,
      H,
      -(flying ? s.down : 0) * 5 - finaleK * 70,
      altKm * 26,
      night * (0.35 + 0.65 * clamp01(altKm / 40)),
      t,
    );
    const groundY = SY(groundLevel);
    drawHorizonGlow(c, W, H, Math.min(groundY, H * 1.02), padK * (1 - clamp01(altKm / 150)));
    if (orbitish) drawLimb(c, W, H, easeOut((t - plan.finaleAt + 0.3) / 2.6), pal.chalk);
    if (body) drawTargetBody(c, W, H, body, easeOutBack((t - plan.finaleAt - 1.3) / 1.2), pal);
    drawGround(c, W, H, groundY, padK, horizon, pal.chalk);
    if (padK > 0.01 && groundY > -H && groundY < H * 3) {
      c.save();
      c.translate(SX(0), SY(0));
      c.scale(Z, -Z);
      c.globalAlpha = 0.7 * padK;
      c.strokeStyle = rgba(pal.chalk, 1);
      c.lineWidth = 1.7 / Z;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.stroke(padPath);
      c.restore();
    }

    if (!exploded) {
      let shake = 0;
      if (t >= T_IGNITE) {
        if (plan.liftoffAt === null) shake = 1.5 + 6 * clamp01((t - T_IGNITE) / ((plan.tipAt ?? 5) - T_IGNITE));
        else if (t < plan.liftoffAt + 1.5) shake = 1.6;
        for (const cue of plan.cues) if (cue.event.kind === "max-q" && Math.abs(t - cue.at) < 0.8) shake = Math.max(shake, 2.5);
      }
      c.save();
      c.translate(SX(pose.x) + rnd(-shake, shake), SY(pose.y) + rnd(-shake, shake));
      c.rotate(pose.rot);
      c.scale(Z, Z);
      const withPiece = (i: number, draw: (alpha: number) => void) => {
        const d = pieceDrift(i);
        if (!d) return draw(1);
        if (d.alpha <= 0) return;
        const b = pieces[i].box;
        const pcx = (b.minX + b.maxX) / 2;
        const pcy = (b.minY + b.maxY) / 2;
        c.save();
        c.translate(pcx + d.dx, pcy + d.dy);
        c.rotate(d.rot);
        c.translate(-pcx, -pcy);
        draw(d.alpha);
        c.restore();
      };
      pieces.forEach((p, i) => {
        const thr = throttle(i);
        if (thr > 0.01) withPiece(i, (a) => drawFlame(p.nozzle, thr, plume, a, Z, i + 1));
      });
      drawParticles(local, (p) => [p.x, p.y, 1]);
      pieces.forEach((_, i) => withPiece(i, (a) => strokeDoodle(piecePaths[i], a, chalk, Z)));
      if (reentry > 0.02) drawReentry(reentry, [focus[0], top], Z);
      c.restore();
    }

    drawParticles(world, (p) => [SX(p.x), SY(p.y), Z]);
    if (frags.length) {
      c.lineCap = "round";
      c.lineJoin = "round";
      for (const f of frags) {
        const k = f.age / f.life;
        c.save();
        c.translate(SX(f.x), SY(f.y));
        c.rotate(f.rot);
        c.scale(Z, Z);
        c.beginPath();
        f.pts.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)));
        const lw = Math.max(2 / Z, 0.0055 * NAPKIN_ASPECT);
        c.globalAlpha = (1 - k) * 0.3;
        c.strokeStyle = rgba(pal.flameHot, 1);
        c.lineWidth = lw * 3;
        c.stroke();
        c.globalAlpha = 1 - k * k;
        c.strokeStyle = rgba(mix(pal.flameHot, pal.chalk, clamp01(f.age / 0.8)), 1);
        c.lineWidth = lw;
        c.stroke();
        c.restore();
      }
      c.globalAlpha = 1;
    }
    if (exploded && t - explodedAt < 0.8) {
      const k = 1 - (t - explodedAt) / 0.8;
      const bx = SX(blast[0]);
      const by = SY(blast[1]);
      const R = Math.max(W, H) * 0.7;
      const g = c.createRadialGradient(bx, by, 0, bx, by, R);
      g.addColorStop(0, `rgba(255,240,200,${0.85 * k})`);
      g.addColorStop(0.25, rgba(pal.flame, 0.35 * k));
      g.addColorStop(1, rgba(pal.flame, 0));
      c.globalCompositeOperation = "lighter";
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = "source-over";
    }

    // --- HUD ---
    if (hud) {
      let text = "";
      if (t >= T_NIGHT) {
        const lo = plan.liftoffAt ?? T_LIFTOFF;
        const clock = plan.liftoffAt === null ? Math.min(t, plan.explodeAt ?? t) - lo : t < lo ? t - lo : sim;
        const neg = clock < 0;
        const secs = neg ? Math.ceil(-clock) : Math.floor(clock);
        const mm = String(Math.floor(secs / 60)).padStart(2, "0");
        const ss = String(secs % 60).padStart(2, "0");
        const speed = flying ? s.speed : 0;
        text = `T${neg ? "-" : "+"}${mm}:${ss} · ALT ${altKm.toFixed(1)} km · ${Math.round(speed).toLocaleString("en-US")} m/s · STAGE ${(flying ? s.stage : 0) + 1}`;
      }
      if (text !== hudShown) {
        hudShown = text;
        hud.textContent = text;
        hud.style.opacity = text ? "1" : "0";
      }
    }

    // --- Cues ---
    while (cueIdx < plan.cues.length && plan.cues[cueIdx].at <= t) {
      const cue = plan.cues[cueIdx++];
      if (!cue.real) continue;
      try {
        hooks.onEvent(cue.event);
      } catch (err) {
        console.error(err);
      }
    }
    while (capIdx < plan.captions.length && plan.captions[capIdx].at <= t) {
      hooks.onCaption({ ...plan.captions[capIdx++], id: ++capId });
    }
    if (!finaleShown && t >= plan.finale.at) {
      finaleShown = true;
      hooks.onFinale(plan.finale);
    }
    if (!ended && t >= plan.endAt) {
      ended = true;
      hooks.onEnd();
    }
  }

  raf = requestAnimationFrame(frame);

  return {
    stop: () => cancelAnimationFrame(raf),
    skip: () => {
      if (ended) return;
      cueIdx = plan.cues.length;
      capIdx = plan.captions.length;
      finaleShown = true;
      t = Math.max(t, plan.endAt);
    },
  };
}

/** Peak numbers for the end card, straight from the trace. */
export function flightStats(trace: FlightTrace): { maxAltKm: number; maxSpeedMps: number } {
  const pts = trace.points ?? [];
  return {
    maxAltKm: Math.max(trace.maxAltitudeKm || 0, ...pts.map((p) => p.altitudeKm || 0)),
    maxSpeedMps: Math.max(0, ...pts.map((p) => p.speedMps || 0)),
  };
}
