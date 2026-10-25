import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { REAL_VEHICLES } from "@/lib/analogs";
import type { PropellantId } from "@/lib/design";
import {
  DESTINATIONS,
  ENGINES,
  G0,
  ORBITAL_SPEED_MPS,
  PROPELLANT_DENSITY_KG_M3,
  STRUCTURAL_FACTOR,
  TANK_FILL,
} from "@/lib/physics/data";
import { VOICE_TOOLS } from "@/lib/voice/tools";
import { IMAGE_MODEL, TEXT_MODEL, VIDEO_MODEL, VISION_MODEL } from "@/lib/xai";

// "How it works" for judges. Every table reads the same modules the app runs on, so the
// page can't drift from the code.

export const metadata: Metadata = {
  title: "How it works · Penumbra",
  description: "How Penumbra turns a napkin sketch into a flight verdict: Grok reads and renders, code does the physics.",
};

const PROPELLANT_NAMES: Record<PropellantId, string> = {
  methalox: "Methalox (LOX + methane)",
  kerolox: "Kerolox (LOX + RP-1)",
  hydrolox: "Hydrolox (LOX + hydrogen)",
  solid: "Solid (APCP)",
  hypergolic: "Hypergolic (N₂O₄ + UDMH)",
};

const num = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const kN = (n: number) => (n > 0 ? num(n / 1000) : "—");
const sec = (n: number) => (n > 0 ? num(n) : "—");
const kms = (mps: number) => num(mps / 1000, 2);

export default function About() {
  const engines = Object.values(ENGINES);
  const destinations = Object.values(DESTINATIONS);
  const vehicles = [...REAL_VEHICLES].sort((a, b) => a.firstFlight - b.firstFlight);
  const losses = DESTINATIONS.leo.deltaVFromSurfaceMps - ORBITAL_SPEED_MPS;

  return (
    <div className="min-h-dvh bg-umbra text-starlight">
      <header className="sticky top-0 z-10 border-b border-rule bg-umbra/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-8 py-3">
          <Link href="/" className="font-display text-[20px] font-semibold tracking-[0.04em]">
            Penumbra
          </Link>
          <Link href="/" className="text-[14px] text-haze transition-colors hover:text-starlight">
            ← Back to the studio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-8">
        <section className="py-16">
          <p className="text-[15px] text-haze">How it works</p>
          <h1 className="mt-3 max-w-[900px] font-display text-[52px] font-semibold leading-[1.05]">
            Every spacecraft in history started as a sketch. We give your sketch 70 years of NASA and SpaceX
            experience in 60 seconds.
          </h1>
          <p className="mt-6 max-w-[720px] text-[17px] leading-relaxed text-haze">
            Draw a spacecraft on the napkin. Grok reads it and renders it; deterministic code built on published
            engine data decides whether it flies. The red pen shows the fix, a Grok Voice engineer applies it when you
            ask, and your own doodle flies the result.
          </p>
        </section>

        <Section title="The pipeline" lede="Grok does the seeing, talking and rendering. Code does every number.">
          <Pipeline />
        </Section>

        <Section
          title="Numbers come from code, not the AI"
          lede="Grok reports what it sees (stages, bells, tank sizes). The physics below turns that into thrust, delta-v and a verdict. The same design always gets the same answer."
        >
          <div className="grid grid-cols-[1fr_1fr] gap-10">
            <div>
              <p className="font-display text-[30px] font-medium">
                Δv = I<sub className="text-[18px]">sp</sub> · g<sub className="text-[18px]">0</sub> · ln(m
                <sub className="text-[18px]">0</sub> / m<sub className="text-[18px]">f</sub>)
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-haze">
                Tsiolkovsky&apos;s rocket equation, run stage by stage from the bottom up, with g₀ = {G0} m/s².
              </p>
            </div>
            <ul className="space-y-2 text-[15px] leading-relaxed">
              <Item>
                Propellant = tank volume × {num(TANK_FILL * 100)}% usable × bulk density of the propellant mix.
              </Item>
              <Item>Dry mass, when not drawn, is a structural fraction of the propellant (table below).</Item>
              <Item>Liftoff uses sea-level thrust and Isp; upper stages use vacuum figures.</Item>
              <Item>Thrust-to-weight under 1 at liftoff means it never leaves the pad.</Item>
              <Item>
                Targets are delta-v from Earth&apos;s surface. Low Earth orbit is {kms(ORBITAL_SPEED_MPS)} km/s of
                orbital speed plus {kms(losses)} km/s of gravity and drag losses.
              </Item>
            </ul>
          </div>

          <h3 className="mt-12 font-display text-[22px] font-medium">Engines</h3>
          <Table
            head={["Engine", "Flies on", "Propellant", "Thrust SL (kN)", "Thrust vac (kN)", "Isp SL (s)", "Isp vac (s)", "Mass (kg)"]}
            numeric={[3, 4, 5, 6, 7]}
            rows={engines.map((e) => [
              <Source key="n" href={e.source}>
                {e.name}
              </Source>,
              e.vehicle,
              e.propellant,
              kN(e.thrustSeaLevelN),
              kN(e.thrustVacuumN),
              sec(e.ispSeaLevelS),
              sec(e.ispVacuumS),
              num(e.massKg),
            ])}
          />

          <div className="mt-12 grid grid-cols-[1fr_1fr] gap-10">
            <div>
              <h3 className="font-display text-[22px] font-medium">Destinations</h3>
              <Table
                head={["Target", "Δv from surface (km/s)"]}
                numeric={[1]}
                rows={destinations.map((d) => [
                  <Source key="n" href={d.source}>
                    {d.name}
                  </Source>,
                  kms(d.deltaVFromSurfaceMps),
                ])}
              />
            </div>
            <div>
              <h3 className="font-display text-[22px] font-medium">Propellants</h3>
              <Table
                head={["Mix", "Bulk density (kg/m³)", "Dry mass / propellant"]}
                numeric={[1, 2]}
                rows={(Object.keys(PROPELLANT_DENSITY_KG_M3) as PropellantId[]).map((p) => [
                  PROPELLANT_NAMES[p],
                  num(PROPELLANT_DENSITY_KG_M3[p]),
                  `${num(STRUCTURAL_FACTOR[p] * 100)}%`,
                ])}
              />
            </div>
          </div>
        </Section>

        <Section
          title="Decades of missions"
          lede={`After every check, your design is scored against ${vehicles.length} real launch vehicles on stage count, propellant, liftoff mass, shape and first-stage engine count. The closest one appears next to your verdict.`}
        >
          <Table
            head={["Vehicle", "First flight", "Flights", "Stages", "Height (m)", "Core ⌀ (m)", "Liftoff (t)", "To LEO (t)", "First stage"]}
            numeric={[1, 3, 4, 5, 6, 7]}
            rows={vehicles.map((v) => [
              <div key="n">
                <Source href={v.source}>{v.name}</Source>
                <p className="mt-0.5 max-w-[360px] text-[13px] leading-snug text-haze">{v.fact}</p>
              </div>,
              String(v.firstFlight),
              v.flights,
              String(v.stages),
              num(v.heightM, 1),
              num(v.diameterM, 1),
              v.liftoffMassT === null ? "—" : num(v.liftoffMassT),
              v.leoPayloadT === null ? "—" : num(v.leoPayloadT, v.leoPayloadT < 10 ? 1 : 0),
              `${v.firstStage}${v.reusable ? ", reusable" : ""}`,
            ])}
          />
        </Section>

        <Section
          title="The literature"
          lede="NASA's technical reports cover decades of tested ideas. No engineer can read them all, so Penumbra searches them for you."
        >
          <ul className="max-w-[820px] space-y-3 text-[15px] leading-relaxed">
            <Item>
              Each design becomes a query from its destination, its first-stage propellant and its most telling
              feature. A methalox Mars ship with a heat shield searches for &ldquo;Mars entry descent landing liquid
              methane heat shield&rdquo;; a one-stage doodle bound for orbit searches for &ldquo;reusable launch vehicle
              liquid methane single stage to orbit&rdquo;.
            </Item>
            <Item>
              The{" "}
              <Source href="https://ntrs.nasa.gov">NASA Technical Reports Server</Source> matches every word of a
              query, so long queries rarely hit. Penumbra runs relaxed versions in parallel (the full query, the query
              with adjacent word pairs dropped, and short prefixes) and keeps the most specific matches.
            </Item>
            <Item>
              Reports from 2000 on come first. Bare abstracts, posters, slides, videos and whole conference volumes are
              skipped. A query word in the title scores 2 and in the abstract 1; ties go to the more specific query, then the newer report.
            </Item>
            <Item>The top three appear beside the verdict with their year and a link to the full report.</Item>
          </ul>
        </Section>

        <Section title="How Penumbra uses Grok" lede="Four xAI APIs, each where it is strongest. None of them sets a number.">
          <Table
            head={["API", "Model", "What it does"]}
            rows={[
              [
                "Grok vision",
                <code key="m" className="whitespace-nowrap font-mono text-[13px]">{VISION_MODEL}</code>,
                "Reads the napkin image and raw strokes through a strict JSON schema: stages, engine bells and their widths, tank sizes, features like fins, legs and heat shields. Code turns that into engines and propellant.",
              ],
              [
                "Grok text",
                <code key="m" className="whitespace-nowrap font-mono text-[13px]">{TEXT_MODEL}</code>,
                "Rewrites the red pen's notes in a sharper voice. Any rewrite that changes a number is rejected.",
              ],
              [
                "Grok Imagine, image",
                <code key="m" className="whitespace-nowrap font-mono text-[13px]">{IMAGE_MODEL}</code>,
                "Edits your actual sketch into a concept photo and, after launch, an outcome shot. Generates a mission patch for the design.",
              ],
              [
                "Grok Imagine, video",
                <code key="m" className="whitespace-nowrap font-mono text-[13px]">{VIDEO_MODEL}</code>,
                "Animates the outcome shot into a short mission replay, only when you ask for one.",
              ],
              [
                "Grok Voice",
                "Realtime",
                "A propulsion engineer you talk to over a realtime WebSocket. The server mints a short-lived token, so the API key never reaches the browser. Every design edit is a tool call that re-runs the physics.",
              ],
            ]}
          />
          <h3 className="mt-10 font-display text-[22px] font-medium">The engineer&apos;s tools</h3>
          <p className="mt-2 text-[15px] text-haze">
            Each spoken change becomes one of these calls. The app applies it, re-runs the physics and redraws the red
            pen.
          </p>
          <ul className="mt-4 grid grid-cols-3 gap-x-6 gap-y-2 text-[14px]">
            {VOICE_TOOLS.map((tool) => (
              <li key={tool.name} className="font-mono">
                {tool.name}
                <span className="text-haze">({Object.keys(tool.parameters.properties).join(", ")})</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Built with" lede="">
          <ul className="max-w-[820px] space-y-2 text-[15px] leading-relaxed">
            <Item>Next.js 16 (App Router, Turbopack, Proxy), React 19, TypeScript, Tailwind CSS 4 and Vitest.</Item>
            <Item>xAI Grok APIs: vision, text, Imagine image and video, and Voice realtime.</Item>
            <Item>NASA Technical Reports Server API for prior art.</Item>
            <Item>Published engine, vehicle and delta-v figures, each linked to its source above.</Item>
            <Item>Cursor, used during the build.</Item>
          </ul>
        </Section>

        <footer className="flex items-center justify-between border-t border-rule py-8 text-[14px] text-haze">
          <span>Penumbra</span>
          <Link href="/" className="transition-colors hover:text-starlight">
            ← Back to the studio
          </Link>
        </footer>
      </main>
    </div>
  );
}

function Section({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule py-14">
      <h2 className="font-display text-[34px] font-semibold leading-tight">{title}</h2>
      {lede && <p className="mt-2 max-w-[760px] text-[16px] leading-relaxed text-haze">{lede}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Item({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-5 before:absolute before:left-0 before:top-[0.7em] before:h-px before:w-2.5 before:bg-haze">
      {children}
    </li>
  );
}

function Source({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-4 hover:decoration-starlight">
      {children}
    </a>
  );
}

function Table({ head, rows, numeric = [] }: { head: string[]; rows: ReactNode[][]; numeric?: number[] }) {
  const align = (i: number) => (numeric.includes(i) ? "text-right" : "text-left");
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`border-b border-rule py-2 pr-5 font-medium text-haze last:pr-0 ${align(i)}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="align-top">
              {row.map((cell, i) => (
                <td key={i} className={`border-b border-rule/60 py-2.5 pr-5 last:pr-0 ${align(i)}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NODES: { title: string; lines: [string, string]; grok: boolean }[] = [
  { title: "Napkin sketch", lines: ["your strokes", "on a 3:4 canvas"], grok: false },
  { title: "Grok vision", lines: ["stages, bells,", "tank sizes"], grok: true },
  { title: "Physics", lines: ["rocket equation,", "real engine data"], grok: false },
  { title: "Red pen", lines: ["tested fixes drawn", "on your sketch"], grok: false },
  { title: "Grok Voice", lines: ["engineer edits", "by tool call"], grok: true },
  { title: "Launch sim", lines: ["your doodle flies", "the flight trace"], grok: false },
  { title: "Grok Imagine", lines: ["photo, patch,", "replay video"], grok: true },
];

/** The pipeline as a technical drawing: Grok steps in flame, code steps in starlight. */
function Pipeline() {
  const w = 132;
  const h = 78;
  const gap = (1116 - NODES.length * w) / (NODES.length - 1);
  const top = 64;
  const x = (i: number) => i * (w + gap);
  const mid = (i: number) => x(i) + w / 2;
  return (
    <svg viewBox="0 0 1116 220" className="w-full" role="img" aria-label="Pipeline: napkin sketch, Grok vision, physics, red pen, Grok Voice, launch sim, Grok Imagine">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="fill-haze" />
        </marker>
      </defs>
      <path
        d={`M${mid(4)} ${top} C${mid(4)} ${top - 46} ${mid(2)} ${top - 46} ${mid(2)} ${top}`}
        fill="none"
        className="stroke-haze"
        strokeWidth="1"
        strokeDasharray="4 4"
        markerEnd="url(#arrow)"
      />
      <text x={(mid(2) + mid(4)) / 2} y={top - 38} textAnchor="middle" className="fill-haze text-[13px]">
        every edit re-runs the physics
      </text>
      {NODES.map((node, i) => (
        <g key={node.title}>
          <rect
            x={x(i) + 0.5}
            y={top + 0.5}
            width={w - 1}
            height={h - 1}
            rx="3"
            fill="var(--panel)"
            stroke={node.grok ? "var(--flame)" : "var(--haze)"}
            strokeWidth="1"
          />
          <text x={x(i) + 14} y={top + 27} className="fill-starlight text-[16px] font-semibold">
            {node.title}
          </text>
          {node.lines.map((line, l) => (
            <text key={line} x={x(i) + 14} y={top + 49 + l * 16} className="fill-haze text-[13px]">
              {line}
            </text>
          ))}
          {i < NODES.length - 1 && (
            <line
              x1={x(i) + w + 3}
              y1={top + h / 2}
              x2={x(i + 1) - 3}
              y2={top + h / 2}
              className="stroke-haze"
              strokeWidth="1"
              markerEnd="url(#arrow)"
            />
          )}
        </g>
      ))}
      <g transform={`translate(0 ${top + h + 40})`} className="text-[13px]">
        <rect x="0" y="-9" width="12" height="12" rx="2" fill="none" stroke="var(--flame)" />
        <text x="20" y="1" className="fill-haze">
          Grok API
        </text>
        <rect x="100" y="-9" width="12" height="12" rx="2" fill="none" stroke="var(--haze)" />
        <text x="120" y="1" className="fill-haze">
          Deterministic code
        </text>
      </g>
    </svg>
  );
}
