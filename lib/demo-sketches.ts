// Ready-made napkin doodles for the "try a demo sketch" buttons, tests and the live
// demo backup plan. Each part is laid out with simple geometry and then passed through
// a seeded "hand" filter, so the strokes wobble like pencil lines but come out identical
// on every load.

import { NAPKIN_ASPECT, type DestinationId, type Point, type Stroke } from "./design";

export interface DemoSketch {
  id: string;
  title: string;
  destination: DestinationId;
  strokes: Stroke[];
}

// Shapes are drawn in square units: y runs 0..1 down the napkin and x runs 0..W, so a
// circle stays round. toNapkin() maps them to the normalized 0..1 stroke coordinates.
const W = NAPKIN_ASPECT;
const CX = W / 2;
const TAU = Math.PI * 2;

/** Spacing of the dense geometric path before the hand filter resamples it. */
const FINE = 0.002;
/** Typical gap between pen samples in the middle of a stroke. */
const PEN_STEP = 0.0065;

/** mulberry32: tiny seeded PRNG. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Reflects a point across the rocket's centerline. */
const mirror = (p: Point): Point => [2 * CX - p[0], p[1]];

// Geometric paths -----------------------------------------------------------

function poly(...pts: Point[]): Point[] {
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const n = Math.max(1, Math.ceil(dist(pts[i - 1], pts[i]) / FINE));
    for (let k = 1; k <= n; k++) out.push(lerp(pts[i - 1], pts[i], k / n));
  }
  return out;
}

function cubic(a: Point, c1: Point, c2: Point, b: Point): Point[] {
  const out: Point[] = [];
  for (let k = 0; k <= 60; k++) {
    const t = k / 60;
    const u = 1 - t;
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    out.push([
      w[0] * a[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * b[0],
      w[0] * a[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * b[1],
    ]);
  }
  return out;
}

function arc(c: Point, rx: number, ry: number, from: number, to: number): Point[] {
  const n = Math.max(8, Math.ceil((Math.abs(to - from) * Math.max(rx, ry)) / FINE));
  return Array.from({ length: n + 1 }, (_, k): Point => {
    const a = from + ((to - from) * k) / n;
    return [c[0] + rx * Math.cos(a), c[1] + ry * Math.sin(a)];
  });
}

/** Joins path pieces end to end, dropping each piece's first point (it repeats the last end). */
function chain(...pieces: Point[][]): Point[] {
  return pieces.flatMap((p, i) => (i === 0 ? p : p.slice(1)));
}

/** Nose cone from the left wall, over the tip, down to the right wall. bluntness 0 = pointy, 1 = round. */
function nose(halfWidth: number, yBase: number, yTip: number, bluntness: number): Point[] {
  const h = yBase - yTip;
  const left = cubic(
    [CX - halfWidth, yBase],
    [CX - halfWidth, yBase - h * 0.55],
    [CX - halfWidth * bluntness, yTip + h * 0.2 * (1 - bluntness)],
    [CX, yTip],
  );
  return chain(left, left.map(mirror).reverse());
}

/** Engine bell hanging below yTop: narrow throat, flared walls, curved exit lip. */
function bell(cx: number, yTop: number, throat: number, exit: number, h: number): Point[] {
  const yExit = yTop + h;
  const left = cubic(
    [cx - throat, yTop],
    [cx - throat, yTop + h * 0.45],
    [cx - exit * 0.85, yTop + h * 0.7],
    [cx - exit, yExit],
  );
  const right = left.map(([x, y]): Point => [2 * cx - x, y]).reverse();
  return chain(left, arc([cx, yExit], exit, exit * 0.22, Math.PI, 0), right);
}

/** A hand-drawn circle: starts anywhere, drifts in radius, and overlaps itself where it closes. */
function loop(c: Point, r: number, rand: () => number): Point[] {
  const start = rand() * TAU;
  const sweep = TAU + 0.25 + rand() * 0.35;
  const drift = (rand() - 0.5) * 0.16;
  const squash = 1 + (rand() - 0.5) * 0.12;
  const n = Math.ceil((sweep * r) / FINE);
  return Array.from({ length: n + 1 }, (_, k): Point => {
    const t = k / n;
    const a = start + sweep * t;
    const rr = r * (1 + drift * t);
    return [c[0] + rr * squash * Math.cos(a), c[1] + rr * Math.sin(a)];
  });
}

// The hand filter --------------------------------------------------------------

/**
 * Turns a clean geometric path into a pencil stroke: nudges and rescales the part a
 * little, overshoots the ends, adds a slow wobble, a slight bow and tremor, and
 * resamples it so points bunch up at the ends where a pen moves slowest.
 */
function hand(clean: Point[], rand: () => number): Point[] {
  const xs = clean.map((p) => p[0]);
  const ys = clean.map((p) => p[1]);
  const mid: Point = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const scale = 1 + (rand() - 0.5) * 0.03;
  const shift: Point = [(rand() - 0.5) * 0.003, (rand() - 0.5) * 0.003];
  const placed = clean.map(([x, y]): Point => [
    mid[0] + (x - mid[0]) * scale + shift[0],
    mid[1] + (y - mid[1]) * scale + shift[1],
  ]);

  const extend = (end: Point, inner: Point, by: number): Point => {
    const d = dist(inner, end) || 1;
    return [end[0] + ((end[0] - inner[0]) / d) * by, end[1] + ((end[1] - inner[1]) / d) * by];
  };
  const last = placed.length - 1;
  const path = [
    extend(placed[0], placed[Math.min(3, last)], rand() * 0.004),
    ...placed,
    extend(placed[last], placed[Math.max(last - 3, 0)], rand() * 0.006),
  ];

  const along = [0];
  for (let i = 1; i < path.length; i++) along.push(along[i - 1] + dist(path[i - 1], path[i]));
  const length = along[along.length - 1];
  const at = (d: number): Point => {
    const s = Math.min(Math.max(d, 0), length);
    let lo = 0;
    let hi = along.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (along[m] <= s) lo = m;
      else hi = m;
    }
    const span = along[hi] - along[lo] || 1;
    return lerp(path[lo], path[hi], (s - along[lo]) / span);
  };

  const a1 = 0.0009 + rand() * 0.0012;
  const w1 = 0.05 + rand() * 0.06;
  const p1 = rand() * TAU;
  const a2 = 0.0002 + rand() * 0.0003;
  const w2 = 0.012 + rand() * 0.01;
  const p2 = rand() * TAU;
  const bow = (rand() - 0.5) * 0.02 * Math.min(length, 0.3);
  const wobble = (d: number) =>
    a1 * Math.sin((TAU * d) / w1 + p1) +
    a2 * Math.sin((TAU * d) / w2 + p2) +
    bow * 4 * (d / length) * (1 - d / length);

  // Short strokes (hatching, feet) still get a dozen or so samples.
  const step = Math.min(PEN_STEP, length / 12);
  const out: Point[] = [];
  for (let d = 0; ; ) {
    const p = at(d);
    // Tangent over a window, so the wobble turns smoothly round corners.
    const ahead = at(d + 0.008);
    const behind = at(d - 0.008);
    const t = dist(behind, ahead) || 1;
    const normal: Point = [-(ahead[1] - behind[1]) / t, (ahead[0] - behind[0]) / t];
    const off = wobble(d) + (rand() - 0.5) * 0.0004;
    out.push([p[0] + normal[0] * off, p[1] + normal[1] * off]);
    if (d >= length) break;
    const pace = 0.4 + 0.9 * Math.sin((Math.PI * d) / length);
    d = Math.min(length, d + Math.max(0.0012, step * pace * (0.8 + rand() * 0.4)));
  }
  return out;
}

/** Tilts the whole doodle a little (nobody draws perfectly upright) and normalizes it to 0..1. */
function toNapkin(paths: Point[][], tiltDeg: number): Stroke[] {
  const a = (tiltDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const norm = (v: number) => Math.round(Math.min(Math.max(v, 0), 1) * 10000) / 10000;
  return paths.map((pts) => ({
    points: pts.map(([x, y]): Point => {
      const dx = x - CX;
      const dy = y - 0.5;
      return [norm((CX + dx * cos - dy * sin) / W), norm(0.5 + dx * sin + dy * cos)];
    }),
  }));
}

function sketch(seed: number, tiltDeg: number, draw: (rand: () => number) => Point[][]): Stroke[] {
  const rand = seeded(seed);
  return toNapkin(
    draw(rand).map((path) => hand(path, rand)),
    tiltDeg,
  );
}

// The sketches (strokes listed in the order a person would draw them) ----------

/** Stubby single stage: nose cone, porthole, big fins, one engine bell. Falls well short of orbit. */
const napkinHopper = sketch(7, -2, (rand) => {
  const half = 0.11;
  const l = CX - half;
  const r = CX + half;
  const top = 0.37;
  const bottom = 0.7;
  const fin: Point[] = [[l, 0.55], [l - 0.095, 0.69], [l - 0.1, 0.78], [l - 0.003, bottom]];
  return [
    nose(half, top, 0.17, 0.25),
    poly([l, top], [l, bottom], [r, bottom], [r, top]),
    loop([CX, 0.47], 0.032, rand),
    poly(...fin),
    poly(...fin.map(mirror)),
    bell(CX, bottom, 0.03, 0.06, 0.085),
  ];
});

/**
 * Falcon 9-like: a pencil-thin two-stager (about 7 m wide, 14:1) with the stage line a third
 * of the way down, small fins and three bells that read as nine engines at scale.
 */
const twoStageOrbiter = sketch(42, 1.2, () => {
  const half = 0.031;
  const l = CX - half;
  const r = CX + half;
  const top = 0.17;
  const bottom = 0.82;
  const fin: Point[] = [[l, 0.735], [l - 0.02, 0.8], [l - 0.021, 0.838], [l - 0.002, bottom]];
  return [
    nose(half, top, 0.075, 0.3),
    poly([l, top], [l, bottom], [r, bottom], [r, top]),
    poly([l - 0.006, 0.386], [r + 0.005, 0.384]),
    poly(...fin),
    poly(...fin.map(mirror)),
    ...[-1, 0, 1].map((k) => bell(CX + k * 0.018, bottom, 0.0035, 0.0098, 0.042)),
  ];
});

/**
 * Saturn V-like: escape tower and capsule on top, two stage lines (three stages), four
 * small fins at the base (two in side view) and five bells in a row, one engine each.
 */
const moonRocket = sketch(1969, 0.6, () => {
  const half = 0.027;
  const l = CX - half;
  const r = CX + half;
  const top = 0.36;
  const bottom = 0.72;
  const fin: Point[] = [[l, 0.665], [l - 0.013, 0.705], [l - 0.014, 0.745], [l - 0.001, bottom]];
  return [
    poly([CX, 0.2], [CX, 0.252]),
    nose(half, top, 0.25, 0.15),
    poly([l, top], [l, bottom], [r, bottom], [r, top]),
    poly([l - 0.005, 0.471], [r + 0.004, 0.469]),
    poly([l - 0.004, 0.571], [r + 0.005, 0.572]),
    poly(...fin),
    poly(...fin.map(mirror)),
    ...[-2, -1, 0, 1, 2].map((k) => bell(CX + k * 0.011, bottom, 0.0025, 0.0052, 0.038)),
  ];
});

/**
 * Starship-like stack: a ship with a crew window, forward and aft flaps, a hatched heat
 * shield down its left side and landing legs, on a booster with grid fins and five big bells
 * that read as about 30 engines at scale.
 */
const marsShip = sketch(2033, -0.8, (rand) => {
  const half = 0.05;
  const l = CX - half;
  const r = CX + half;
  const top = 0.16;
  const sep = 0.403;
  const bottom = 0.86;
  const forwardFlap: Point[] = [[l, 0.175], [l - 0.025, 0.19], [l - 0.026, 0.232], [l, 0.243]];
  const aftFlap: Point[] = [[l, 0.262], [l - 0.036, 0.275], [l - 0.038, 0.322], [l, 0.33]];
  const leg: Point[] = [[l, 0.345], [l - 0.028, 0.398]];
  const foot: Point[] = [[l - 0.04, 0.4], [l - 0.016, 0.399]];
  const heatShield = Array.from({ length: 8 }, (_, i) => {
    const y = 0.19 + i * 0.027;
    return poly([l + 0.004, y + 0.016], [l + 0.026, y]);
  });
  // Booster grid fins: a little box with a cross in it on each side.
  const gridFin = (side: (p: Point) => Point): Point[][] => {
    const box: Point[] = [[l, 0.448], [l - 0.026, 0.446], [l - 0.027, 0.472], [l, 0.474]];
    const bar: Point[] = [[l - 0.013, 0.447], [l - 0.0135, 0.473]];
    const rung: Point[] = [[l - 0.026, 0.459], [l, 0.461]];
    return [box, bar, rung].map((pts) => poly(...pts.map(side)));
  };
  return [
    nose(half, top, 0.045, 0.65),
    poly([l, top], [l, bottom], [r, bottom], [r, top]),
    poly([l - 0.008, sep], [r + 0.008, sep - 0.003]),
    loop([CX, 0.115], 0.012, rand),
    poly(...forwardFlap),
    poly(...forwardFlap.map(mirror)),
    poly(...aftFlap),
    poly(...aftFlap.map(mirror)),
    ...heatShield,
    poly(...leg),
    poly(...foot),
    poly(...leg.map(mirror)),
    poly(...foot.map(mirror)),
    ...gridFin((p) => p),
    ...gridFin(mirror),
    ...[-2, -1, 0, 1, 2].map((k) => bell(CX + k * 0.022, bottom, 0.005, 0.0135, 0.044)),
  ];
});

export const DEMO_SKETCHES: DemoSketch[] = [
  { id: "napkin-hopper", title: "Napkin Hopper", destination: "leo", strokes: napkinHopper },
  { id: "two-stage-orbiter", title: "Two-Stage Orbiter", destination: "leo", strokes: twoStageOrbiter },
  { id: "moon-rocket", title: "Moon Rocket", destination: "moon-surface", strokes: moonRocket },
  { id: "mars-ship", title: "Mars Ship", destination: "mars-surface", strokes: marsShip },
];
