# Penumbra

Penumbra is a rocket-design learning tool. Pick a real rocket (Falcon 9, Saturn V, Electron or Starship), change it by dragging, and see every number next to the real one, including what you gained, what you gave up, and where the real design sits on the trade-off curve.

## The problem

Rocket-design intuition is hard to build. A real launch vehicle is tuned for one mission, and the trade-offs behind it are invisible from the outside. Why are Falcon 9's tanks that size? What does landing the booster cost in payload? Would a longer second stage help? The answers are spread across spec sheets, delta-v maps and the rocket equation, and the rocket equation alone gives answers that are too optimistic. It ignores gravity and drag losses, and it ignores the fact that bigger tanks weigh more.

## The solution

Start from a rocket that flew, and change one thing at a time:

- **Modify a real rocket.** Drag a tank edge to stretch or shrink a stage, tap an engine chip to change the engine count, add a booster stage, or switch ♻ Recover on for a stage. An added booster gets the fewest sea-level engines that lift the new stack, on a base widened to seat them. Set the destination (Orbit, GTO, Moon landing, Mars landing or Europa) and the payload in the side panel. Every figure is shown as the real rocket's value next to yours, and Cmd+Z undoes any change.
- **See the trade-off.** A payload curve sweeps tank size or engine count for any stage of your rocket, an added booster included, and marks the real rocket and the best point. When the real rocket isn't on the curve because something else changed too, its payload is drawn as a line to beat. A one-line caption says why the best point is where it is (usually thrust-to-weight). An engine sweep stops at as many engines as fit on the stage. Recovery shows its price directly: in the model, landing Falcon 9's booster costs about 5.6 t of payload to low Earth orbit.
- **Check it and fly it.** The red pen writes on the drawing by hand: up to three short corrections, or a check mark when the design is good to fly. Then the design flies, in real time off the pad and then in a time warp that the screen always states.
- **Learn from real flights.** Each rocket lists its own real flights, lost and successful, each with one line on what the numbers don't show.

## How it works

The physics is deterministic TypeScript (`lib/physics/`, `lib/trade.ts`). AI never sets a number.

- **Rocket equation, stage by stage,** on published engine thrust and specific impulse, with 95% of tank volume usable.
- **Gravity losses** integrated over each stage's burn with a gravity-turn approximation: the share of gravity a stage fights falls as the climb turns horizontal, with centrifugal relief near orbital speed. Low thrust-to-weight therefore costs more, and reaching LEO needs between 8.5 and 10.5 km/s depending on the design.
- **Drag losses** from frontal area over liftoff mass, capped at 400 m/s. An eastward launch gets 400 m/s free from Earth's rotation.
- **Structure that scales.** Stretched tanks add dry mass, so a longer stage isn't free.
- **Engines that fit.** Engine bells are packed onto each stage's own diameter at their published nozzle sizes, so a stage takes only as many as fit: 9 Merlin 1D on Falcon 9's 3.7 m, 33 Raptors on Super Heavy's 9 m.
- **Recovery.** A landing stage keeps 8% of its propellant in reserve and carries its recovery hardware.
- **Max payload** is found by bisection: the most a design can carry while still reaching the target with a liftoff thrust-to-weight of at least 1.15.

### Calibration against published payloads

| Rocket | Published payload to LEO | Model | Ratio |
|---|---|---|---|
| Falcon 9 Block 5, expended | 22.8 t | 23.1 t | 101% |
| Falcon 9 Block 5, booster recovered | 17.4 t | 17.5 t | 101% |
| Saturn V (including the S-IVB) | 140 t | 135 t | 96% |
| Electron | 300 kg | 354 kg | 118% |
| Starship Block 2, both stages recovered | 35 t | 151 t | 431% |

Model figures are rounded down, the way the app shows every capacity, so a payload it shows is one the rocket can carry. They are checked by `lib/trade.test.ts`. The same tests check that the best first-stage size on each trade curve lands within 1.0–1.3× of the real one for Falcon 9, Saturn V and Starship. The Electron and Starship rows are explained under Limitations.

## Features

- **Modify a real rocket:** four real vehicles with sourced specs (`lib/templates.ts`), drag-to-edit stages, real-vs-yours numbers, and payload trade curves (`components/TradeChart.tsx`).
- **Real flights:** 18 of them, filed under their rocket on the picker and in Modify: 12 SpaceX flights from Falcon 1 to Starship's Integrated Flight Tests, Saturn V's Apollo 6, 11 and 13, and three Electron flights. Each runs Sketch → Diagnose → Build → Fly → Debrief. Diagnose marks what failed (or, on a success, what made it work), Build inks the sketch clean, a loss replays up to the moment the real flight was lost, and the debrief quotes what was said where it's on the record. For Falcon 1 Flight 1, CRS-7 and Starship IFT-1, **Fix it & fly again** flies the comeback. A full report gives the cause chain, timeline and lessons.
- **Red pen:** handwritten, one mark at a time. It marks only issues, up to three short corrections, each re-checked against the physics before it is drawn, or gives a check mark with the delta-v to spare. It flags more engines than fit on a stage, and a vacuum engine on the first stage, naming the engine to swap in. In Modify, an engine chip with too many engines turns red, with a handwritten "only 9 fit" under it, and the verdict leads with it. On a real flight it marks only the failed part.
- **Launch replays:** the vehicle flies the simulated trajectory from its real launch site, with staging, booster landings and tower catches, and mission-specific failures. A booster touches down about as long after separation as real ones do; if that's after the flight ends, its inset shows it still coming down, with the time it lands ("Lands at T+8:14, after orbit"). The flight runs in real time until it clears the tower, then eases into a time warp, and the readout by the speed buttons always says which (Real time, Time ×30). A flight to orbit takes 30–40 s at 1×, and 0.5× to 8× or Skip are always there.
- **Trips past low Earth orbit:** the flight parks in orbit, burns for the destination and coasts out with the clock running in days. A Moon landing stops at the Moon's distance, before the landing burn. A Mars or Europa trip coasts past the Moon and ends on course, never "arrived".
- **Draw your own:** sketch any vehicle on the napkin. A reader turns the drawing into stages, engines and tanks, and it goes through the same physics.
- **Grok integration (optional):** Grok vision reads sketches, Grok Voice runs a spoken GO/NO-GO poll, xAI text-to-speech voices the flight callouts, and Grok text can reword the red pen's notes but never their numbers. Every xAI call has a deterministic fallback, so the app works without a key. There is no image generation: every picture is either your sketch or drawn by code.

## Tech stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4
- Vitest: 290 tests across 22 files, covering the physics, the calibration, trade curves, the red pen, the real flights and the sketch readers
- xAI Grok APIs (vision, text, Voice, text-to-speech) behind a server-side wrapper with fallbacks (`lib/xai.ts`)
- NASA Technical Reports Server API for prior-art search

## Running it

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest
npx tsc --noEmit     # type check
```

The flow runs Pick → Modify → Check → Fly → Recap. To open a real rocket straight in Modify, use `/?rocket=falcon9` (or `saturn-v`, `electron`, `starship`). A real flight runs Pick → Sketch → Diagnose → Build → Fly → Debrief, and your own drawing runs Pick → Sketch → Check → Build → Fly → Debrief. Check uses the local red pen and needs no API.

An xAI key is optional: put `XAI_API_KEY=...` in `.env.local` to enable the Grok features. `proxy.ts` rate-limits the routes that spend xAI credits in production.

## Limitations

- **A simplified model.** It is a stage-by-stage point-mass model with approximate gravity and drag losses, not a trajectory optimizer. It does not model throttling, aerodynamic loads, heating or structural failure, so treat its numbers as good first estimates for comparing designs.
- **Starship's gap.** SpaceX's published 35 t (both stages recovered) folds in early-block shortfalls and conservative margins the model doesn't know about. With the published masses and landing reserves, the physics allows far more (151 t). The model shows that gap openly rather than tuning it away.
- **Electron runs high (118%).** Its rated 300 kg rides on the Curie kick stage, whose mass isn't published or modelled, and its stage masses are community-compiled estimates.
- **Trips past orbit stop at the departure.** The launch follows a Mars or Europa trip out to 1,000,000 km and a Moon trip to the Moon's distance. The months-long cruise, the capture and the landing aren't flown.
- **Moon and Mars landings carry less than published figures.** Published Moon and Mars payloads stop at the transfer orbit, while the model's Moon landing and Mars landing also land the payload. Starship is meant to refill its tanks in orbit before leaving Earth; the model flies it on one load.

## Project layout

```
lib/physics/        analyze() and simulateFlight(): losses, recovery, verdicts
lib/trade.ts        maxPayloadKg, tradeCurve, recoveryCostKg, explainCurve
lib/templates.ts    the four real rockets, with sources
lib/missions*.ts    the real flights, with their lessons and sources
lib/redpen.ts       red-pen rules
lib/design.ts       the shared types every module uses
components/         the studio, trade chart, edit handles and launch scene
app/about/          the How it works page, computed from the same modules
app/api/            Grok vision, red-pen review, voice, text-to-speech and NASA prior-art routes
```
