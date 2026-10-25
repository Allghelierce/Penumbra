import {
  NAPKIN_ASPECT,
  type Analysis,
  type Design,
  type FlightEvent,
  type FlightPoint,
  type FlightTrace,
  type Part,
  type Point,
  type SketchReading,
  type Stroke,
  type Verdict,
} from "@/lib/design";

// Hand-made launch fixtures so the scene can be tuned before @/lib/physics lands.

export interface LaunchFixture {
  id: string;
  title: string;
  note: string;
  strokes: Stroke[];
  reading: SketchReading;
  analysis: Analysis;
  trace: FlightTrace;
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = seeded(7);
const jit = () => (rand() - 0.5) * 0.0035;

/** A wobbly pencil polyline through the given points (normalized napkin coords). */
function pen(points: Point[]): Stroke {
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const n = Math.max(2, Math.ceil(Math.hypot((x1 - x0) * NAPKIN_ASPECT, y1 - y0) / 0.008));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n + jit(), y0 + ((y1 - y0) * k) / n + jit()]);
  }
  out.push(points[points.length - 1]);
  return { points: out };
}

function curve(f: (s: number) => Point, n = 40): Stroke {
  return { points: Array.from({ length: n + 1 }, (_, i): Point => {
    const [x, y] = f(i / n);
    return [x + jit(), y + jit()];
  }) };
}

const L = 0.393;
const R = 0.607;

/** Two-stage rocket: nose, one-piece side walls across the stage line, fins, three bells. */
export const ROCKET_STROKES: Stroke[] = [
  curve((s) => [L + (R - L) * s, 0.3 - 0.2 * Math.sin(Math.PI * s)]),
  pen([[L, 0.3], [L, 0.8]]),
  pen([[R, 0.3], [R, 0.8]]),
  pen([[L, 0.52], [R, 0.52]]),
  pen([[L, 0.8], [R, 0.8]]),
  curve((s) => [0.5 + (0.03 / NAPKIN_ASPECT) * Math.cos(s * Math.PI * 2.1), 0.37 + 0.03 * Math.sin(s * Math.PI * 2.1)]),
  pen([[L, 0.66], [0.325, 0.78], [0.325, 0.85], [L, 0.8]]),
  pen([[R, 0.66], [0.675, 0.78], [0.675, 0.85], [R, 0.8]]),
  ...[0.45, 0.5, 0.55].map((c) => pen([[c - 0.014, 0.8], [c - 0.022, 0.845], [c + 0.022, 0.845], [c + 0.014, 0.8]])),
  pen([[0.43, 0.6], [0.57, 0.6]]),
];

export const ROCKET_PARTS: Part[] = [
  { kind: "nose", label: "nose cone", box: [L, 0.1, R - L, 0.2], stageIndex: 1 },
  { kind: "window", label: "crew window", box: [0.46, 0.34, 0.08, 0.06], stageIndex: 1 },
  { kind: "tank", label: "ship tank", box: [L, 0.3, R - L, 0.22], stageIndex: 1 },
  { kind: "tank", label: "booster tank", box: [L, 0.52, R - L, 0.28], stageIndex: 0 },
  { kind: "fin", label: "fins", box: [0.325, 0.66, 0.35, 0.19], stageIndex: 0 },
  { kind: "engine", label: "engines", box: [0.428, 0.8, 0.144, 0.045], stageIndex: 0 },
];

const DESIGN: Design = {
  name: "Napkin Falcon",
  stages: [
    { label: "Booster", engines: [{ engine: "merlin-1d", count: 9 }], propellant: "kerolox", tankVolumeM3: 450 },
    { label: "Ship", engines: [{ engine: "merlin-vacuum", count: 1 }], propellant: "kerolox", tankVolumeM3: 120 },
  ],
  payloadMassKg: 8000,
  destination: "leo",
  features: ["fins", "crew-window"],
  heightM: 62,
  diameterM: 3.7,
};

function analysis(verdict: Verdict, totalDv: number, requiredDv: number, twr: number, findings: string[]): Analysis {
  return {
    liftoffMassKg: 540_000,
    liftoffTwr: twr,
    stages: [
      { label: "Booster", wetMassKg: 430_000, dryMassKg: 25_000, propellantMassKg: 405_000, ispS: 282, thrustN: 7_600_000 * (twr / 1.43), deltaVMps: totalDv * 0.45, burnTimeS: 155, twrAtIgnition: twr },
      { label: "Ship", wetMassKg: 110_000, dryMassKg: 6_000, propellantMassKg: 104_000, ispS: 348, thrustN: 981_000, deltaVMps: totalDv * 0.55, burnTimeS: 360, twrAtIgnition: 0.9 },
    ],
    totalDeltaVMps: totalDv,
    requiredDeltaVMps: requiredDv,
    marginMps: totalDv - requiredDv,
    verdict,
    furthestReachable: verdict === "suborbital" || verdict === "stuck-on-pad" ? null : "leo",
    findings,
  };
}

/** Smooth gravity-turn ascent sampled every 2 s. */
function ascent(T: number, apoKm: number, downKm: number, vMax: number, sepAt: number): FlightPoint[] {
  const pts: FlightPoint[] = [];
  for (let t = 0; t <= T; t += 2) {
    const f = t / T;
    pts.push({
      tS: t,
      altitudeKm: apoKm * f * f * (3 - 2 * f),
      downrangeKm: downKm * f * f * f,
      speedMps: 400 * f + (vMax - 400) * Math.pow(f, 1.3),
      stageIndex: t < sepAt ? 0 : 1,
    });
  }
  return pts;
}

const ORBIT_EVENTS: FlightEvent[] = [
  { tS: 0, kind: "liftoff", label: "Liftoff" },
  { tS: 62, kind: "max-q", label: "Max-Q at 8 km, 31 kPa" },
  { tS: 155, kind: "engine-cutoff", label: "Booster cutoff at 1.7 km/s" },
  { tS: 158, kind: "stage-sep", label: "Stage separation" },
  { tS: 520, kind: "orbit", label: "Orbit insertion: 210 km at 7.8 km/s" },
];

function suborbitalTrace(): FlightTrace {
  const pts: FlightPoint[] = [];
  const events: FlightEvent[] = [
    { tS: 0, kind: "liftoff", label: "Liftoff" },
    { tS: 55, kind: "max-q", label: "Max-Q" },
    { tS: 88, kind: "engine-cutoff", label: "Booster cutoff" },
    { tS: 90, kind: "stage-sep", label: "Stage separation" },
    { tS: 150, kind: "fuel-exhausted", label: "Ship tanks dry at 1.5 km/s, 6.3 km/s short of orbit" },
  ];
  let h = 0;
  let v = 0;
  let apogee = false;
  for (let t = 0; ; t += 2) {
    pts.push({ tS: t, altitudeKm: Math.max(0, h) / 1000, downrangeKm: (60 * t) / 1000, speedMps: Math.hypot(v, 60), stageIndex: t < 90 ? 0 : 1 });
    if (h <= 0 && t > 10) break;
    const a = t < 150 ? 10 : -9.81;
    if (!apogee && v > 0 && v + a * 2 <= 0) {
      apogee = true;
      events.push({ tS: t + 2, kind: "apogee", label: `Apogee ${Math.round((h + v * 2) / 1000)} km` });
    }
    v += a * 2;
    h += v * 2;
  }
  const end = pts[pts.length - 1].tS;
  events.push({ tS: end, kind: "impact", label: `Impact ${Math.round((60 * end) / 1000)} km downrange` });
  return { points: pts, events, outcome: "suborbital", maxAltitudeKm: Math.max(...pts.map((p) => p.altitudeKm)) };
}

const reading = (design: Design, parts: Part[] = ROCKET_PARTS): SketchReading => ({ design, parts });

export const FIXTURES: LaunchFixture[] = [
  {
    id: "orbit",
    title: "Orbit",
    note: "2 stages · LEO · stage boxes",
    strokes: ROCKET_STROKES,
    reading: reading(DESIGN),
    analysis: analysis("destination", 9600, 9400, 1.43, ["9.6 km/s of delta-v against 9.4 km/s needed for low Earth orbit."]),
    trace: { points: ascent(520, 210, 1600, 7800, 158), events: ORBIT_EVENTS, outcome: "orbit", maxAltitudeKm: 210 },
  },
  {
    id: "moon",
    title: "Moon",
    note: "destination · moon-orbit",
    strokes: ROCKET_STROKES,
    reading: reading({ ...DESIGN, name: "Napkin Lunar", destination: "moon-orbit" }),
    analysis: analysis("destination", 13_400, 12_900, 1.5, ["13.4 km/s of delta-v; lunar orbit needs 12.9 km/s."]),
    trace: {
      points: ascent(520, 210, 1600, 7800, 158),
      events: [...ORBIT_EVENTS, { tS: 3 * 86_400, kind: "arrival", label: "Lunar orbit insertion after 3 days" }],
      outcome: "destination",
      maxAltitudeKm: 210,
    },
  },
  {
    id: "suborbital",
    title: "Suborbital",
    note: "fuel runs out · apogee · RUD",
    strokes: ROCKET_STROKES,
    reading: reading(DESIGN),
    analysis: analysis("suborbital", 3100, 9400, 1.3, [
      "Only 3.1 km/s of delta-v; low Earth orbit needs 9.4 km/s.",
      "The ship's tanks are a quarter of what it needs.",
    ]),
    trace: suborbitalTrace(),
  },
  {
    id: "pad",
    title: "Stuck on pad",
    note: "TWR 0.82 · tips over",
    strokes: ROCKET_STROKES,
    reading: reading({ ...DESIGN, stages: [{ ...DESIGN.stages[0], engines: [{ engine: "merlin-1d", count: 5 }] }, DESIGN.stages[1]] }),
    analysis: analysis("stuck-on-pad", 7900, 9400, 0.82, ["Liftoff thrust-to-weight is 0.82, so it never leaves the pad."]),
    trace: {
      points: [
        { tS: 0, altitudeKm: 0, downrangeKm: 0, speedMps: 0, stageIndex: 0 },
        { tS: 5, altitudeKm: 0, downrangeKm: 0, speedMps: 0, stageIndex: 0 },
      ],
      events: [{ tS: 0, kind: "pad-failure", label: "Liftoff thrust-to-weight is 0.82, so it never leaves the pad." }],
      outcome: "stuck-on-pad",
      maxAltitudeKm: 0,
    },
  },
  {
    id: "orbit-noparts",
    title: "Orbit, no parts",
    note: "split falls back to 55%",
    strokes: ROCKET_STROKES,
    reading: reading(DESIGN, []),
    analysis: analysis("destination", 9600, 9400, 1.43, []),
    trace: { points: ascent(520, 210, 1600, 7800, 158), events: ORBIT_EVENTS, outcome: "orbit", maxAltitudeKm: 210 },
  },
];

/** Stand-in for the Grok Imagine outcome image. */
export const FIXTURE_RENDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070d"/><stop offset="1" stop-color="#0b1a33"/></linearGradient><radialGradient id="f" cx=".5" cy=".75" r=".5"><stop offset="0" stop-color="#ffb347"/><stop offset=".4" stop-color="#ff5a1f" stop-opacity=".7"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient></defs><rect width="400" height="400" fill="url(#s)"/><circle cx="200" cy="900" r="620" fill="#0f2c4d" stroke="#6eaaff" stroke-width="4"/><rect width="400" height="400" fill="url(#f)" opacity=".5"/><path d="M200 70 L225 130 L225 250 L175 250 L175 130 Z" fill="#f4f1ea"/><path d="M188 250 L200 330 L212 250 Z" fill="#ffb347"/><text x="200" y="380" font-family="monospace" font-size="16" fill="#ffffff99" text-anchor="middle">fixture render</text></svg>`,
  );
