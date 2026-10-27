# Penumbra

Penumbra is a rocket-design learning tool. Pick a real rocket (Falcon 9, Saturn V, Electron or Starship), change it by dragging, and see every number next to the real one, including what you gained, what you gave up, and where the real design sits on the trade-off curve.

## The problem

Rocket-design intuition is hard to build. A real launch vehicle is tuned for one mission, and the trade-offs behind it are invisible from the outside. Why are Falcon 9's tanks that size? What does landing the booster cost in payload? Would a longer second stage help? The answers are spread across spec sheets, delta-v maps and the rocket equation, and the rocket equation alone gives answers that are too optimistic. It ignores gravity and drag losses, and it ignores the fact that bigger tanks weigh more.

## The solution

Start from a rocket that flew, and change one thing at a time:

- **Modify a real rocket.** Drag a stage to stretch or shrink its tanks, add or remove a stage, change the engine count, or switch booster recovery on and off. Every figure is shown as the real rocket's value next to yours.
- **See the trade-off.** A payload curve sweeps tank size or engine count from the real design, and marks both the real rocket and the best point. A one-line caption says why the best point is where it is (usually thrust-to-weight). Recovery shows its price directly: in the model, landing Falcon 9's booster costs 5.7 t of payload to low Earth orbit.
- **Check it and fly it.** The red pen marks what fails and what fixes it. Then the design flies: the launch scene splits the vehicle at its real stage bands and shows a recovered booster's landing or tower catch.

## How it works

The physics is deterministic TypeScript (`lib/physics/`, `lib/trade.ts`). AI never sets a number.

- **Rocket equation, stage by stage,** on published engine thrust and specific impulse, with 95% of tank volume usable.
- **Gravity losses** integrated over each stage's burn with a gravity-turn approximation: the share of gravity a stage fights falls as the climb turns horizontal, with centrifugal relief near orbital speed. Low thrust-to-weight therefore costs more, and reaching LEO needs between 8.5 and 10.5 km/s depending on the design.
- **Drag losses** from frontal area over liftoff mass, capped at 400 m/s. An eastward launch gets 400 m/s free from Earth's rotation.
- **Structure that scales.** Stretched tanks add dry mass, so a longer stage isn't free.
- **Recovery.** A landing stage keeps 8% of its propellant in reserve and carries its recovery hardware.
- **Max payload** is found by bisection: the most a design can carry while still reaching the target with a liftoff thrust-to-weight of at least 1.15.

### Calibration against published payloads

| Rocket | Published payload to LEO | Model | Ratio |
|---|---|---|---|
| Falcon 9 Block 5, expended | 22.8 t | 23.2 t | 102% |
| Falcon 9 Block 5, booster recovered | 17.4 t | 17.5 t | 101% |
| Saturn V (including the S-IVB) | 140 t | 135.9 t | 97% |
| Electron | 300 kg | 354 kg | 118% |
| Starship Block 2, both stages recovered | 35 t | 151 t | 432% |

These figures are checked by `lib/trade.test.ts`. The same tests check that the best first-stage size on each trade curve lands within 1.0–1.3× of the real one for Falcon 9, Saturn V and Starship. The Electron and Starship rows are explained under Limitations.

## Features

- **Modify a real rocket:** four real vehicles with sourced specs (`lib/templates.ts`), drag-to-edit stages, real-vs-yours numbers, and payload trade curves (`components/TradeChart.tsx`).
- **Real-mission case studies:** 12 real SpaceX flights, from Falcon 1 to Starship's Integrated Flight Tests. Each runs Diagnose → Build → Fly → Debrief: the real flaw is drawn into the sketch, the real statements play during the replay, and **Fix it & fly again** flies the comeback flight. A full report gives the cause chain, timeline and lessons.
- **Red pen:** notes drawn on the design, each fix re-checked against the physics before it is drawn.
- **Launch replays:** the vehicle flies the simulated trajectory, with staging, recovery and mission-specific failures.
- **Draw your own:** sketch any vehicle on the napkin. A reader turns the drawing into stages, engines and tanks, and it goes through the same physics.
- **Grok integration (optional):** Grok vision reads sketches, Grok Imagine renders the design, and Grok Voice runs a spoken GO/NO-GO poll. Every xAI call has a deterministic fallback, so the app works without a key.

## Tech stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4
- Vitest: 201 tests across 20 files, covering the physics, the calibration, trade curves, the red pen and the sketch readers
- xAI Grok APIs (vision, Imagine, Voice) behind a server-side wrapper with fallbacks (`lib/xai.ts`)
- NASA Technical Reports Server API for prior-art search

## Running it

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest
npx tsc --noEmit     # type check
```

An xAI key is optional: put `XAI_API_KEY=...` in `.env.local` to enable the Grok features. `proxy.ts` rate-limits the routes that spend xAI credits in production.

## Limitations

- **A simplified model.** It is a stage-by-stage point-mass model with approximate gravity and drag losses, not a trajectory optimizer. It does not model throttling, aerodynamic loads, heating or structural failure, so treat its numbers as good first estimates for comparing designs.
- **Starship's gap.** SpaceX's published 35 t (both stages recovered) folds in early-block shortfalls and conservative margins the model doesn't know about. With the published masses and landing reserves, the physics allows far more (151 t). The model shows that gap openly rather than tuning it away.
- **Electron runs high (118%).** Its rated 300 kg rides on the Curie kick stage, whose mass isn't published or modelled, and its stage masses are community-compiled estimates.

## Project layout

```
lib/physics/        analyze() and simulateFlight(): losses, recovery, verdicts
lib/trade.ts        maxPayloadKg, tradeCurve, recoveryCostKg, explainCurve
lib/templates.ts    the four real rockets, with sources
lib/missions*.ts    the real-mission case studies
lib/redpen.ts       red-pen rules
lib/design.ts       the shared types every module uses
components/         the studio, trade chart, edit handles and launch scene
app/api/            Grok vision, review, render and NASA prior-art routes
```
