import { NAPKIN_ASPECT } from "./design";
import type { Design, EngineId, Part, Point, PropellantId, RocketTemplate, Stage, Stroke, TemplateDrawing, TemplateId } from "./design";
import { baseFor, enginesThatFit, NOZZLE_EXIT_DIAMETER_M } from "./physics";
import { PROPELLANT_DENSITY_KG_M3, TANK_FILL } from "./physics/data";
import { hand, seeded } from "./sketch/detail";

// Four real rockets to start from. Every mass, length and payload below was checked against the
// raw Wikipedia wikitext (infobox and spec tables) on 2026-10-27; each template lists its sources.
// Propellant masses become tank volumes with the physics' own density and fill, so analyze()
// sees exactly the published propellant load.

/** Tank volume that holds a published propellant mass, as the physics will read it back. */
function tankFor(propellantKg: number, propellant: PropellantId): number {
  return Math.round((propellantKg / (PROPELLANT_DENSITY_KG_M3[propellant] * TANK_FILL)) * 1000) / 1000;
}

const LB = 0.45359237;
const lb = (pounds: number) => Math.round(pounds * LB);
const wiki = (page: string) => `https://en.wikipedia.org/wiki/${page}`;

export const TEMPLATES: RocketTemplate[] = [
  {
    id: "falcon9",
    name: "Falcon 9 Block 5",
    blurb: "Medium-lift launcher, shown expendable (22.8\u00a0t). Switch Recover on to land the booster like most flights (17.4\u00a0t).",
    design: {
      name: "Falcon 9 Block 5",
      stages: [
        // Falcon 9 spec table: empty 25,600 kg, propellant 395,700 kg, 9 Merlin 1D, 41.2 m.
        {
          label: "First stage",
          engines: [{ engine: "merlin-1d", count: 9 }],
          propellant: "kerolox",
          tankVolumeM3: tankFor(395_700, "kerolox"),
          dryMassKg: 25_600,
        },
        // Falcon 9 spec table: empty 3,900 kg, propellant 92,670 kg, 1 Merlin Vacuum, 13.8 m.
        {
          label: "Second stage",
          engines: [{ engine: "merlin-vacuum", count: 1 }],
          propellant: "kerolox",
          tankVolumeM3: tankFor(92_670, "kerolox"),
          dryMassKg: 3_900,
        },
      ],
      payloadMassKg: 22_800,
      destination: "leo",
      features: ["grid-fins", "landing-legs"],
      heightM: 69.8,
      diameterM: 3.7,
    },
    // The baseline is the expendable vehicle: 22,800 kg to LEO from Cape Canaveral (Full Thrust infobox).
    realPayloadLeoKg: 22_800,
    // With the booster landing on a drone ship: the heaviest payload SpaceX has explicitly confirmed
    // (56 Starlink satellites, "more than 17.4 metric tons"; Falcon 9 payload table, "≥ 17,400 reusable").
    // The Full Thrust infobox quotes 18,500 kg from a press estimate; we use the confirmed figure.
    realPayloadLeoReusableKg: 17_400,
    sources: [
      { title: "Falcon 9: stage specifications (empty and propellant mass), height 69.8 m, fairing 13 m × 5.2 m", url: wiki("Falcon_9") },
      { title: "Falcon 9 Full Thrust: 22,800 kg to LEO expendable", url: wiki("Falcon_9_Full_Thrust") },
      { title: "Falcon 9 payload table: ≥ 17,400 kg to LEO with the booster recovered (heaviest confirmed)", url: wiki("Falcon_9") },
    ],
  },
  {
    id: "saturn-v",
    name: "Saturn V",
    blurb: "The Apollo Moon rocket, first flown in 1967: three stages and 24 astronauts sent to the Moon.",
    design: {
      name: "Saturn V",
      stages: [
        // S-IC: empty 303,000 lb, gross 4,881,000 lb, 5 F-1, 138 ft.
        {
          label: "S-IC",
          engines: [{ engine: "f-1", count: 5 }],
          propellant: "kerolox",
          tankVolumeM3: tankFor(lb(4_881_000) - lb(303_000), "kerolox"),
          dryMassKg: lb(303_000),
        },
        // S-II: empty 95,000 lb (with the S-II/S-IVB interstage), gross 1,037,000 lb, 5 J-2, 81 ft 7 in.
        {
          label: "S-II",
          engines: [{ engine: "j-2", count: 5 }],
          propellant: "hydrolox",
          tankVolumeM3: tankFor(lb(1_037_000) - lb(95_000), "hydrolox"),
          dryMassKg: lb(95_000),
        },
        // S-IVB: empty 33,600 lb (with the Instrument Unit), gross 265,600 lb, 1 J-2, 58 ft 7 in, 21 ft 8 in wide.
        {
          label: "S-IVB",
          engines: [{ engine: "j-2", count: 1 }],
          propellant: "hydrolox",
          tankVolumeM3: tankFor(lb(265_600) - lb(33_600), "hydrolox"),
          dryMassKg: lb(33_600),
          diameterM: 6.6,
        },
      ],
      // The published 140,000 kg "to LEO" INCLUDES the S-IVB stage and its translunar propellant
      // (infobox footnote). Above a burned-out S-IVB that is 140 t − 15.2 t ≈ 124.8 t; the physics
      // model tops out at 120.7 t (97% of that), so the baseline is trimmed to 118 t to reach orbit.
      payloadMassKg: 118_000,
      destination: "leo",
      features: ["fins"],
      heightM: 110.6,
      diameterM: 10.1,
    },
    realPayloadLeoKg: 140_000,
    sources: [
      { title: "Saturn V: stage empty and gross masses, lengths, 140,000 kg to LEO (incl. S-IVB and TLI propellant)", url: wiki("Saturn_V") },
    ],
  },
  {
    id: "electron",
    name: "Electron",
    blurb: "Rocket Lab's small-satellite launcher, first flown in 2017: 3D-printed engines with electric pumps.",
    design: {
      name: "Electron",
      stages: [
        // 9 Rutherford, 12.1 m. Stage masses are not published (blank in the infobox and the user
        // guide): ~950 kg dry and ~9,250 kg propellant are community-compiled estimates that add up
        // to the official 13.0 t lift-off mass with the second stage, fairing and payload.
        {
          label: "First stage",
          engines: [{ engine: "rutherford", count: 9 }],
          propellant: "kerolox",
          tankVolumeM3: tankFor(9_250, "kerolox"),
          dryMassKg: 950,
        },
        // 1 Rutherford Vacuum, 2.4 m. ~250 kg dry and ~2,050 kg propellant (estimates, as above).
        {
          label: "Second stage",
          engines: [{ engine: "rutherford-vacuum", count: 1 }],
          propellant: "kerolox",
          tankVolumeM3: tankFor(2_050, "kerolox"),
          dryMassKg: 250,
        },
      ],
      payloadMassKg: 300,
      destination: "leo",
      features: [],
      heightM: 18,
      diameterM: 1.2,
    },
    // Updated LEO capacity (originally 225 kg), per the Electron infobox. The rated payload rides on
    // the Curie kick stage, whose mass isn't published and isn't modelled here, so the physics comes
    // out above 300 kg (about 118%).
    realPayloadLeoKg: 300,
    sources: [
      { title: "Rocket Lab Electron: height 18 m, diameter 1.2 m, lift-off mass 13.0 t, stage lengths, 300 kg to LEO", url: wiki("Rocket_Lab_Electron") },
      { title: "Electron Payload User's Guide 7.0 (lift-off mass)", url: "https://www.rocketlabusa.com/assets/Uploads/Electron-Payload-User-Guide-7.0.pdf" },
      { title: "Stage dry and propellant masses: community-compiled estimates (not published by Rocket Lab)", url: "https://r.datuan.dev/r/rocketlab/wiki/vehicles" },
    ],
  },
  {
    id: "starship",
    name: "Starship Block 2",
    blurb: "Super Heavy plus Ship, the largest rocket ever flown: both stages built to land and fly again.",
    design: {
      name: "Starship Block 2",
      stages: [
        // Super Heavy: 71 m, empty 275,000 kg, propellant 3,400,000 kg, 33 Raptor 2.
        {
          label: "Super Heavy",
          engines: [{ engine: "raptor-2", count: 33 }],
          propellant: "methalox",
          tankVolumeM3: tankFor(3_400_000, "methalox"),
          dryMassKg: 275_000,
          // The published 35 t assumes both stages fly back.
          recover: true,
        },
        // Ship Block 2: 52.1 m, propellant 1,500 t, gross 1,585 t (so ~85 t dry), 3 Raptor + 3 Raptor Vacuum.
        {
          label: "Ship",
          engines: [
            { engine: "raptor-2", count: 3 },
            { engine: "raptor-vacuum", count: 3 },
          ],
          propellant: "methalox",
          tankVolumeM3: tankFor(1_500_000, "methalox"),
          dryMassKg: 85_000,
          recover: true,
        },
      ],
      payloadMassKg: 35_000,
      destination: "leo",
      features: ["grid-fins", "flaps", "heat-shield"],
      heightM: 123.1,
      diameterM: 9,
    },
    // Block 2 payload to LEO per the Starship infobox (Block 1: 15 t, Block 3: 100 t). It is already the
    // reusable figure (both stages recover), so there is no separate realPayloadLeoReusableKg.
    realPayloadLeoKg: 35_000,
    sources: [
      { title: "SpaceX Starship: Block 2 stack 123.1 m, 35 t to LEO", url: wiki("SpaceX_Starship") },
      { title: "SpaceX Super Heavy: 71 m, empty 275 t, propellant 3,400 t, 33 Raptor", url: wiki("SpaceX_Super_Heavy") },
      { title: "SpaceX Starship (spacecraft): Block 2 52.1 m, propellant 1,500 t, gross 1,585 t", url: wiki("SpaceX_Starship_(spacecraft)") },
      { title: "SpaceX Raptor: Raptor 2 and Raptor Vacuum figures", url: wiki("SpaceX_Raptor") },
    ],
  },
];

export function templateById(id: TemplateId): RocketTemplate {
  return TEMPLATES.find((t) => t.id === id)!;
}

// ---------------------------------------------------------------------------------------------
// Drawing. Proportions come from the real vehicles (metres); the whole stack is then scaled to
// fit the 3:4 napkin. These lengths are for the outline only; the physics never reads them.

interface StageLook {
  /** Tank section length at the template's real volume. */
  tankM: number;
  /** Band above this stage, up to the next stage (interstage, hot-staging ring, adapter). */
  interstageM: number;
  /** Bells a side view shows of the real stage's engines, when it is the bottom stage. */
  bells: number;
  gridFins?: boolean;
  fins?: boolean;
  legs?: boolean;
  flaps?: boolean;
  heatShield?: boolean;
}

interface Look {
  stages: StageLook[];
  nose: { kind: "fairing" | "apollo" | "ogive"; lengthM: number; diameterM: number };
}

const LOOKS: Record<TemplateId, Look> = {
  falcon9: {
    stages: [
      { tankM: 37.5, interstageM: 6.5, bells: 3, gridFins: true, legs: true },
      { tankM: 11, interstageM: 0, bells: 1 },
    ],
    nose: { kind: "fairing", lengthM: 13, diameterM: 5.2 },
  },
  "saturn-v": {
    stages: [
      { tankM: 36, interstageM: 5.5, bells: 4, fins: true },
      { tankM: 24.9, interstageM: 3, bells: 3 },
      { tankM: 17.9, interstageM: 0, bells: 1 },
    ],
    nose: { kind: "apollo", lengthM: 29.3, diameterM: 6.6 },
  },
  electron: {
    stages: [
      { tankM: 11.4, interstageM: 0.6, bells: 3 },
      { tankM: 2.2, interstageM: 0, bells: 1 },
    ],
    nose: { kind: "fairing", lengthM: 2.5, diameterM: 1.2 },
  },
  starship: {
    stages: [
      { tankM: 67, interstageM: 1.8, bells: 5, gridFins: true },
      { tankM: 38, interstageM: 0, bells: 3, flaps: true, heatShield: true },
    ],
    nose: { kind: "ogive", lengthM: 14, diameterM: 9 },
  },
};

/** How far each engine's nozzle hangs below its tank, in metres, roughly to scale. Drawing only. */
const BELL_LENGTH_M: Record<EngineId, number> = {
  "raptor-2": 2.6,
  "raptor-3": 2.6,
  "raptor-vacuum": 2.6,
  "merlin-1d": 2,
  "merlin-vacuum": 3,
  "rs-25": 4.3,
  rl10c: 2.2,
  "f-1": 5.8,
  "j-2": 3.4,
  "be-4": 4.5,
  "rd-180": 3.6,
  rutherford: 0.6,
  "rutherford-vacuum": 0.9,
  "generic-solid": 1.5,
};
/** Rutherford Vacuum's nozzle isn't published: drawn at this guess, and never flagged as not fitting. */
const UNPUBLISHED_EXIT_M: Partial<Record<EngineId, number>> = { "rutherford-vacuum": 0.7 };
/** A bell's exit diameter: the published nozzle the physics packs engines with. */
const exitM = (engine: EngineId) => NOZZLE_EXIT_DIAMETER_M[engine] ?? UNPUBLISHED_EXIT_M[engine] ?? 1;
/** Room a bell takes in the row: its exit plus a small gap. */
const bellSlotM = (engine: EngineId) => 1.05 * exitM(engine);

/** Napkin margins (normalized) left around the scaled-to-fit rocket. */
const MARGIN_Y = 0.05;
const MARGIN_X = 0.06;

/**
 * A clean hand-drawn outline of the template, reshaped by `design`: each stage's tank grows with
 * its volume relative to the real one, added boosters stack below, and the whole vehicle is
 * scaled to fit the napkin. Returns exact part boxes and each stage's tank band for drag handles.
 */
export function drawTemplate(t: RocketTemplate, design: Design): TemplateDrawing {
  const look = LOOKS[t.id];
  if (!look || design.stages.length === 0) return { strokes: [], parts: [], stageBands: [] };
  const looks = matchStages(t, design).map(({ index, stage }) => {
    const base = look.stages[index ?? 0];
    const real = t.design.stages[index ?? 0];
    const stretch = real.tankVolumeM3 > 0 ? stage.tankVolumeM3 / real.tankVolumeM3 : 1;
    // Widths come from the design: the stage's own diameter, else the vehicle's.
    const diameterM = stage.diameterM ?? design.diameterM;
    return { ...base, tankM: base.tankM * Math.max(0.15, stretch), diameterM, templateIndex: index };
  });

  // Vertical layout in metres from the nose tip down.
  const top = looks.length - 1;
  const noseM = look.nose.lengthM;
  let cursor = noseM;
  const sections = looks.map(() => ({ tankTop: 0, tankBottom: 0, bandTop: 0, bandBottom: 0 }));
  for (let i = top; i >= 0; i--) {
    if (i < top) {
      sections[i].bandTop = cursor;
      cursor += looks[i].interstageM;
      sections[i].bandBottom = cursor;
    }
    sections[i].tankTop = cursor;
    cursor += looks[i].tankM;
    sections[i].tankBottom = cursor;
  }
  const bottomLook = looks[0];

  // Engine bells under the bottom stage, from its engines; the row hangs past the stage exactly
  // when they don't fit on it.
  const bottomReal = t.design.stages[bottomLook.templateIndex ?? 0];
  const { row, widthM: rowM } = bellLayout(design.stages[0], bottomLook, bottomReal, bottomLook.diameterM);
  const naturalRowM = row.reduce((sum, e) => sum + bellSlotM(e), 0);
  const bellsM = Math.max(0, ...row.map((e) => BELL_LENGTH_M[e]));
  const totalM = cursor + bellsM;

  // Widest point: fins, legs, flaps, the fairing or the engines.
  const reach = Math.max(
    ...looks.map((l) => l.diameterM / 2 + (l.fins ? 0.55 * l.diameterM : l.gridFins ? 0.22 * l.diameterM : l.flaps ? 0.3 * l.diameterM : 0)),
    bottomLook.legs ? bottomLook.diameterM : 0,
    look.nose.diameterM / 2,
    rowM / 2,
  );
  const scale = Math.min((1 - 2 * MARGIN_Y) / totalM, ((0.5 - MARGIN_X) * NAPKIN_ASPECT) / reach);
  const y0 = (1 - totalM * scale) / 2;
  const X = (offsetM: number): number => 0.5 + (offsetM * scale) / NAPKIN_ASPECT;
  const Y = (m: number): number => y0 + m * scale;
  const box = (x0: number, yTop: number, x1: number, yBottom: number): Part["box"] => {
    const x = Math.max(0, Math.min(X(x0), X(x1)));
    const y = Math.max(0, Y(yTop));
    return [round4(x), round4(y), round4(Math.min(1 - x, Math.abs(X(x1) - X(x0)))), round4(Math.min(1 - y, Y(yBottom) - Y(yTop)))];
  };

  const rand = seeded(hashId(t.id) ^ looks.length);
  const strokes: Stroke[] = [];
  const pen = (points: [number, number][]) => strokes.push({ points: hand(points.map(([m, y]): Point => [X(m), Y(y)]), rand) });
  const parts: Part[] = [];

  // Stages: straight-walled tank sections, then the band above each (interstage or adapter).
  looks.forEach((l, i) => {
    const r = l.diameterM / 2;
    const s = sections[i];
    pen([[-r, s.tankTop], [-r, s.tankBottom], [r, s.tankBottom], [r, s.tankTop], [-r, s.tankTop]]);
    parts.push({ kind: "tank", label: `${design.stages[i].label} tanks`, box: box(-r, s.tankTop, r, s.tankBottom), stageIndex: i });
    if (i < top) {
      const rUp = looks[i + 1].diameterM / 2;
      pen([[-rUp, s.bandTop], [-r, s.bandBottom]]);
      pen([[rUp, s.bandTop], [r, s.bandBottom]]);
      pen([[-Math.min(r, rUp), (s.bandTop + s.bandBottom) / 2], [Math.min(r, rUp), (s.bandTop + s.bandBottom) / 2]]);
      parts.push({ kind: "other", label: "Interstage", box: box(-Math.max(r, rUp), s.bandTop, Math.max(r, rUp), s.bandBottom), stageIndex: i });
    }

    // Features that belong to this stage.
    if (l.gridFins) {
      const y = s.tankTop + Math.min(3, 0.06 * l.tankM);
      const w = 0.22 * l.diameterM;
      const h = 0.06 * l.diameterM + 0.6;
      for (const side of [-1, 1]) {
        pen([[side * r, y], [side * (r + w), y], [side * (r + w), y + h], [side * r, y + h]]);
        pen([[side * (r + w / 2), y], [side * (r + w / 2), y + h]]);
      }
      parts.push({ kind: "fin", label: "Grid fins", box: box(-r - w, y, r + w, y + h), stageIndex: i });
    }
    if (l.flaps) {
      const fwdY = s.tankTop - 0.55 * noseM;
      const aftY = s.tankBottom - 0.22 * l.tankM;
      for (const [y, len, out] of [
        [fwdY, 0.18 * noseM + 2, 0.22 * l.diameterM],
        [aftY, 0.2 * l.tankM, 0.3 * l.diameterM],
      ] as const) {
        for (const side of [-1, 1]) pen([[side * r, y], [side * (r + out), y + 0.2 * len], [side * (r + out), y + len], [side * r, y + len]]);
        parts.push({ kind: "fin", label: y === fwdY ? "Forward flaps" : "Aft flaps", box: box(-r - out, y, r + out, y + len), stageIndex: i });
      }
    }
    if (l.heatShield) {
      const yTop = s.tankTop - 0.5 * noseM;
      pen([[-0.05 * r, yTop], [-0.05 * r, s.tankBottom]]);
      for (let k = 1; k < 6; k++) {
        const hy = yTop + ((s.tankBottom - yTop) * k) / 6;
        pen([[-0.9 * r, hy], [-0.15 * r, hy - 0.04 * l.diameterM]]);
      }
      parts.push({ kind: "heat-shield", label: "Heat shield", box: box(-r, yTop, 0, s.tankBottom), stageIndex: i });
    }
  });

  // Bottom stage: fins, legs and engine bells.
  const b = sections[0];
  const rb = bottomLook.diameterM / 2;
  if (bottomLook.fins) {
    const finTop = b.tankBottom - 0.22 * bottomLook.tankM;
    const out = 0.55 * bottomLook.diameterM;
    for (const side of [-1, 1]) pen([[side * rb, finTop], [side * (rb + out), b.tankBottom + 0.5 * bellsM], [side * (rb + out), b.tankBottom + bellsM], [side * rb, b.tankBottom]]);
    parts.push({ kind: "fin", label: "Fins", box: box(-rb - out, finTop, rb + out, b.tankBottom + bellsM), stageIndex: 0 });
  }
  if (bottomLook.legs) {
    const legTop = b.tankBottom - 0.28 * bottomLook.tankM;
    for (const side of [-1, 1]) {
      pen([[side * rb, legTop], [side * (rb + 0.35), legTop + 0.6], [side * (rb + 0.35), b.tankBottom + 0.6 * bellsM], [side * rb, b.tankBottom]]);
    }
    parts.push({ kind: "landing-legs", label: "Landing legs", box: box(-rb - 0.35, legTop, rb + 0.35, b.tankBottom + 0.6 * bellsM), stageIndex: 0 });
  }
  if (rowM / 2 > rb) {
    // A row wider than the stage flares the skirt out to it.
    const skirtM = Math.min(0.4 * bottomLook.tankM, 1.2 * (rowM / 2 - rb));
    for (const side of [-1, 1]) pen([[side * rb, b.tankBottom - skirtM], [(side * rowM) / 2, b.tankBottom], [side * rb, b.tankBottom]]);
  }
  let left = -rowM / 2;
  for (const engine of row) {
    // Each bell's share of the row: bells narrow only when the row is squeezed onto the base.
    const slotM = (rowM * bellSlotM(engine)) / naturalRowM;
    const c = left + slotM / 2;
    left += slotM;
    const half = Math.min(exitM(engine), slotM / 1.05) / 2;
    const throat = half * 0.35;
    const y = b.tankBottom;
    const yEnd = y + BELL_LENGTH_M[engine];
    const flare = (side: 1 | -1): [number, number][] =>
      Array.from({ length: 9 }, (_, n) => {
        const u = n / 8;
        return [c + side * (throat + (half - throat) * u ** 1.6), y + (yEnd - y) * u];
      });
    pen(flare(-1));
    pen(flare(1));
    pen([[c - half, yEnd], [c + half, yEnd]]);
  }
  if (row.length > 0) {
    const label = engineCount(design.stages[0]) === 1 ? "Engine" : "Engines";
    parts.push({ kind: "engine", label, box: box(-rowM / 2, b.tankBottom, rowM / 2, totalM), stageIndex: 0 });
  }

  // Nose: fairing, Apollo stack or Starship ogive, on top of the top stage.
  drawNose(look.nose, looks[top].diameterM / 2, sections[top].tankTop, pen, parts, box, top);

  const stageBands = sections.map((s): [number, number] => [round4(Y(s.tankTop)), round4(Y(s.tankBottom))]);
  return { strokes, parts, stageBands };
}

const engineCount = (stage: Stage) => stage.engines.reduce((sum, c) => sum + Math.max(0, c.count), 0);

/**
 * The bells a side view shows of `stage`'s engines on a base `baseM` across, left to right with the
 * widest outside, and how wide the row is drawn. The count grows with the square root of the engine
 * count, from what the drawing shows for the real stage (`look.bells` for `real`'s engines). Engines
 * that fit (lib/physics packing, the rule the trade captions and red pen use) sit on the base;
 * engines that don't spread over the narrowest base that would seat them, at least half a bell
 * past each side, so the row hangs past the stage exactly when they don't fit.
 */
function bellLayout(stage: Stage, look: StageLook, real: Stage, baseM: number): { row: EngineId[]; widthM: number } {
  const clusters = stage.engines.filter((c) => c.count > 0);
  const n = clusters.reduce((sum, c) => sum + c.count, 0);
  if (n === 0) return { row: [], widthM: 0 };
  const others = (i: number) => clusters.filter((_, j) => j !== i);
  const fits = clusters.every((c, i) => c.count <= (enginesThatFit(c.engine, baseM, others(i)) ?? Infinity));
  const neededM = fits ? 0 : Math.max(...clusters.map((c, i) => baseFor(c.engine, c.count, others(i)) ?? 0));
  const spreadM = Math.max(neededM, baseM + Math.max(...clusters.map((c) => exitM(c.engine))));
  const meanSlotM = clusters.reduce((sum, c) => sum + c.count * bellSlotM(c.engine), 0) / n;
  const scaled = Math.round(look.bells * Math.sqrt(n / Math.max(1, engineCount(real))));
  // A row hanging past the base stays crowded: as many bells as its width holds.
  const k = Math.min(n, Math.max(Math.min(n, 2), scaled, fits ? 0 : Math.round(spreadM / meanSlotM)));
  // Each cluster gets its share of the row, at least one bell.
  const bells = clusters
    .flatMap((c) => Array.from({ length: Math.max(1, Math.round((k * c.count) / n)) }, () => c.engine))
    .sort((a, b) => exitM(b) - exitM(a));
  // Alternate the widest to the left and right ends, working inwards.
  const row: EngineId[] = [];
  bells.forEach((e, i) => (row[i % 2 === 0 ? i / 2 : bells.length - 1 - (i - 1) / 2] = e));
  const naturalM = row.reduce((sum, e) => sum + bellSlotM(e), 0);
  return { row, widthM: fits ? Math.min(naturalM, 0.95 * baseM) : Math.max(naturalM, spreadM) };
}

/** Pairs each design stage with the template stage it came from: by label, then by position from the top. */
function matchStages(t: RocketTemplate, design: Design): { index: number | null; stage: Stage }[] {
  const used = new Set<number>();
  const byLabel = design.stages.map((stage) => {
    const i = t.design.stages.findIndex((s, k) => !used.has(k) && s.label === stage.label);
    if (i >= 0) used.add(i);
    return i >= 0 ? i : null;
  });
  // Unlabelled matches: align the rest from the top (added boosters land at the bottom, unmatched).
  const offset = t.design.stages.length - design.stages.length;
  return design.stages.map((stage, i) => {
    if (byLabel[i] !== null) return { index: byLabel[i], stage };
    const guess = i + offset;
    const index = guess >= 0 && guess < t.design.stages.length && !used.has(guess) ? guess : null;
    if (index !== null) used.add(index);
    return { index, stage };
  });
}

type Pen = (points: [number, number][]) => void;
type BoxFn = (x0: number, yTop: number, x1: number, yBottom: number) => Part["box"];

function drawNose(nose: Look["nose"], r: number, baseY: number, pen: Pen, parts: Part[], box: BoxFn, stageIndex: number) {
  const L = nose.lengthM;
  const ogive = (r0: number, yBase: number, length: number): [number, number][] =>
    Array.from({ length: 13 }, (_, n) => {
      const u = n / 12; // 0 at the base, 1 at the tip
      return [-r0 * Math.sqrt(1 - u ** 1.8), yBase - length * u] as [number, number];
    })
      .concat(
        Array.from({ length: 12 }, (_, n) => {
          const u = 1 - (n + 1) / 12;
          return [r0 * Math.sqrt(1 - u ** 1.8), yBase - length * u] as [number, number];
        }),
      );

  if (nose.kind === "apollo") {
    // SLA cone (S-IVB width → service module), service module, command module cone, escape tower.
    const rSm = 0.59 * r;
    const sla = 0.29 * L;
    const sm = 0.26 * L;
    const cm = 0.11 * L;
    const tower = L - sla - sm - cm;
    const ySla = baseY - sla;
    const ySm = ySla - sm;
    const yCm = ySm - cm;
    pen([[-r, baseY], [-rSm, ySla], [-rSm, ySm], [-0.15 * rSm, yCm], [0.15 * rSm, yCm], [rSm, ySm], [rSm, ySla], [r, baseY]]);
    pen([[-rSm, ySm], [rSm, ySm]]);
    pen([[-0.12 * rSm, yCm], [-0.06 * rSm, yCm - 0.75 * tower], [0.06 * rSm, yCm - 0.75 * tower], [0.12 * rSm, yCm]]);
    pen([[-0.1 * rSm, yCm - 0.75 * tower], [0, yCm - tower], [0.1 * rSm, yCm - 0.75 * tower]]);
    parts.push({ kind: "payload", label: "Apollo spacecraft", box: box(-r, ySm, r, baseY), stageIndex });
    parts.push({ kind: "nose", label: "Command module and escape tower", box: box(-rSm, yCm - tower, rSm, ySm), stageIndex });
    return;
  }
  if (nose.kind === "fairing" && nose.diameterM / 2 > r * 1.05) {
    // A fairing wider than the body: boat-tail, cylinder, then the ogive.
    const rf = nose.diameterM / 2;
    const tail = 0.12 * L;
    const cyl = 0.4 * L;
    const yTail = baseY - tail;
    const yCyl = yTail - cyl;
    pen([[-r, baseY], [-rf, yTail], [-rf, yCyl]]);
    pen([[r, baseY], [rf, yTail], [rf, yCyl]]);
    pen(ogive(rf, yCyl, L - tail - cyl));
    parts.push({ kind: "payload", label: "Payload fairing", box: box(-rf, yCyl, rf, baseY), stageIndex });
    parts.push({ kind: "nose", label: "Fairing nose", box: box(-rf, baseY - L, rf, yCyl), stageIndex });
    return;
  }
  // Same width as the body: an ogive straight off the top (Starship's nose, Electron's fairing).
  const cyl = nose.kind === "fairing" ? 0.3 * L : 0;
  if (cyl > 0) {
    pen([[-r, baseY], [-r, baseY - cyl]]);
    pen([[r, baseY], [r, baseY - cyl]]);
  }
  pen(ogive(r, baseY - cyl, L - cyl));
  if (cyl > 0) parts.push({ kind: "payload", label: "Payload fairing", box: box(-r, baseY - cyl, r, baseY), stageIndex });
  parts.push({ kind: "nose", label: "Nose", box: box(-r, baseY - L, r, baseY - cyl), stageIndex });
}

function hashId(id: string): number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
