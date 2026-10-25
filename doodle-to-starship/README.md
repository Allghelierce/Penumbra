# Penumbra

> An engineer sketches a vehicle idea (a napkin or whiteboard sketch) and instantly gets delta-v and thrust-to-weight, red-pen fixes computed from the physics, and NASA papers showing where it's been tried.

Penumbra is the first ten minutes of a concept review. You draw the vehicle and it reads the drawing: stages, engines, tank volumes, payload. You get the numbers a propulsion lead would ask for first, each traced back to published engine data. A red pen marks up the sketch with fixes that have already been checked against the physics ("stretch +34%", "add a stage", "fins do nothing in vacuum"). Next to the verdict you see the closest real launch vehicle and the NASA reports where the idea has been tried before.

Then you iterate the way a control room does. Mission Control polls GO/NO-GO with real numbers ("Trajectory, NO-GO. We're 0.8 kilometers per second short of orbit."), you fix the design by voice, and the drawing flies a simulated flight. After every flight a recap says what changed and what to try next, and one click applies the fix and flies again.

## The loop

```
 sketch ──▶ check ──▶ red pen ──▶ GO/NO-GO poll ──▶ fly ──▶ recap ──▶ fly again
   ▲          │          │  tap a note    │ NO-GO: fix by voice      │ "Apply & fly again"
   │          │          └─────────────▶ physics ◀───────────────────┘
   │          ├── closest real rocket (17 vehicles, with a line of history)
   │          └── NASA prior art (live Technical Reports Server search)
   └── redraw any time; the sketch is the source of truth
```

1. **Sketch.** Draw on the napkin (3:4), or load one of the samples: Napkin Hopper, Two-Stage Orbiter, Mars Ship. Strokes are stored as normalized points, so the same drawing can be read, marked up and flown at any size.
2. **Check.** Grok vision reads the drawing and the raw strokes through a strict JSON schema. It reports what it sees (stages, engine bells and their widths, tank sizes, fins, legs, heat shield) and code turns that into a `Design`. Without an API key, a geometry reader measures the same things from the strokes.
3. **Numbers.** `analyze()` runs the rocket equation stage by stage on published engine data. It returns liftoff thrust-to-weight, delta-v per stage, the delta-v the target needs, a verdict and the furthest destination the vehicle can reach. The same design always gets the same answer.
4. **Red pen.** Each note on the sketch is a fix that the rules have already tried against the physics: more engines, stretched tanks, an extra stage. Tap a note to apply it, and the physics and the red pen run again.
5. **Context.** The design is scored against 17 real launch vehicles on stage count, propellant, liftoff mass, shape and first-stage engine count. The closest one appears with a line of its history. In parallel, NASA's Technical Reports Server is searched for reports on the same idea.
6. **GO/NO-GO.** Pressing Launch opens a Mission Control poll. Propulsion, Structures, Trajectory, Landing and Flight each call GO or NO-GO with the real number behind it. A NO-GO comes with the edit that clears it. Fix the design by voice, poll again, and say "GO".
7. **Fly.** `simulateFlight()` produces the trajectory and its events (max-Q, staging, cutoff, orbit, impact). Your own strokes fly it on a night sky in about 12 seconds, with a procedurally generated launch sound and webcast callouts with Quindar beeps. The flight fails exactly where the physics says it fails.
8. **Recap.** After every flight the end card shows how this attempt compares with the last one and offers up to three next steps. Each step is re-checked with `analyze()` first, and after a success the suggestions level up (more payload, a farther target). **Apply & fly again** runs the next attempt, or say "yes" when Mission Control offers. A flight log keeps every attempt.
9. **Render.** Grok Imagine turns your actual sketch into a concept photo and an outcome shot, makes a mission patch, and can animate a short mission replay on request.

## Real data, not vibes

Grok reads sketches, renders images and talks. Every number comes from code and the published data behind it.

- **Engines:** published thrust (sea level and vacuum), specific impulse and mass for Raptor 3, Raptor Vacuum, Merlin 1D, Merlin Vacuum, RS-25, RL10C, F-1, J-2, BE-4, RD-180, Rutherford and a solid motor. Every `EngineSpec` carries a `source` URL.
- **Destinations:** delta-v from Earth's surface to low Earth orbit, GTO, lunar orbit, the lunar surface, Mars transfer, the Mars surface and Europa, gravity and drag losses included, from the standard delta-v map. Every `DestinationSpec` carries a `source` URL.
- **Propellants:** the bulk density of each oxidizer/fuel mix at its usual mixture ratio, plus a structural fraction for dry mass when the drawing doesn't give one.
- **Real vehicles:** 17 launch vehicles from Mercury-Redstone to Starship, with first flight, flight count, stages, size, liftoff mass, payload to LEO and first-stage engines, each with a source link (`lib/analogs.ts`).
- **Prior art:** [NASA's Technical Reports Server](https://ntrs.nasa.gov), searched live with terms built from the design. A one-stage methalox vehicle bound for orbit searches "reusable launch vehicle liquid methane single stage to orbit". NTRS matches every term, so relaxed variants run in parallel and the most specific matches win.

The in-app **How it works** page (`/about`) renders these tables straight from the modules, so it can't drift from the code.

## How Grok is used

| Grok API | Where | What it does |
|---|---|---|
| Grok vision | `app/api/read`, `lib/sketch/vision.ts` | Reads the napkin image and strokes into stages, bells, tank sizes and features, using a strict JSON schema. Code does the math |
| Grok (text) | `app/api/review` | Rewrites the red-pen notes in a sharper voice. Any rewrite that changes a number is rejected |
| **Grok Imagine** (image) | `app/api/render` | Edits your sketch into a concept photo and an outcome shot, and generates a mission patch |
| **Grok Imagine** (video) | `app/api/replay` | Animates the outcome shot into a mission replay, only when you ask |
| **Grok Voice** | `components/VoiceDock.tsx`, `lib/voice/` | Realtime voice for Mission Control and the propulsion engineer. Every design edit is a tool call that re-runs the physics |

The server mints a short-lived voice token, so the xAI key never reaches the browser. Model names are set in `lib/xai.ts`. Imagine results are cached in `public/renders`, so a warm cache survives bad venue Wi-Fi.

### Works without a key

Every xAI call resolves to `null` on any failure (no key, timeout, HTTP error, bad JSON), and each route falls back:

| Feature | With `XAI_API_KEY` | Without it, or if the API fails |
|---|---|---|
| Reading the sketch | Grok vision | Geometry reader: body width, stage lines, engine bells, fins, legs and heat-shield hatching measured from the strokes |
| Red pen | Rules plus Grok wording | Rules only |
| Voice | Grok Voice realtime | Browser speech recognition and synthesis, a command parser (`lib/voice/intent.ts`) and a typed-command box |
| Images | Grok Imagine, or the warm cache | Cached renders if present, otherwise none |
| Prior art | NASA NTRS (no key needed) | Empty panel when offline |

## Setup

Requires Node.js 20.9 or newer.

```bash
cd doodle-to-starship
npm install
echo "XAI_API_KEY=your-key-here" > .env.local   # optional; the app falls back without it
npm run dev
```

Open http://localhost:3000. Then:

```bash
npm test            # unit tests (vitest)
npx tsc --noEmit    # type check
```

### Deploying

`next build` and `next start` work as-is, and `XAI_API_KEY` is the only environment variable. In production, `proxy.ts` returns 404 for the `/dev` pages and rate-limits the routes that spend xAI credits, per IP: 30 reads, 60 reviews, 20 renders and 10 voice tokens per 10 minutes, and 3 replay videos per hour. Over the limit, it returns `429 {"error":"rate-limited"}`. The counts live in memory per server instance.

## Architecture

```
doodle-to-starship/
├── proxy.ts                     production guard rails: hide /dev, rate-limit paid routes
├── app/
│   ├── page.tsx                 renders the studio
│   ├── about/                   "How it works" for judges, built from the live data
│   ├── api/read/                POST: sketch → SketchReading (Grok vision or geometry)
│   ├── api/review/              POST: reading + analysis → red-pen Review
│   ├── api/render/              POST: design → Grok Imagine concept, outcome or patch
│   ├── api/replay/              POST/GET: start and poll a Grok Imagine replay video
│   ├── api/voice-token/         Grok Voice session token, or "use browser voice"
│   ├── api/prior-art/           GET: NASA Technical Reports Server search
│   └── dev/                     dev-only pages for launch, voice and xAI checks
├── components/
│   ├── Studio.tsx               the console: napkin, target, check, launch, flight log
│   ├── NapkinCanvas.tsx         pencil drawing surface (3:4)
│   ├── RedPenOverlay.tsx        red-pen marks; tap a note to apply its fix
│   ├── VerdictPanel.tsx         numbers, closest real rocket, renders, NASA prior art
│   ├── VoiceDock.tsx            hold-to-talk voice, transcript, typed commands
│   ├── AttractMode.tsx          idle demo: draws, checks and flies the samples by itself
│   ├── LaunchScene.tsx          your strokes flying the simulated trajectory
│   └── launch/                  flight plan, atmosphere, sound, scenery, end card and recap
└── lib/
    ├── design.ts                shared contract: types, HTTP shapes, NAPKIN_ASPECT
    ├── physics/                 analyze(), simulateFlight(), ENGINES, DESTINATIONS
    ├── sketch/                  vision prompt and schema, geometry fallback, engine sizing
    ├── redpen.ts                deterministic red-pen rules
    ├── actions.ts               pure Design edits (one per DesignAction)
    ├── recap.ts                 the after-flight recap and next steps
    ├── analogs.ts               17 real launch vehicles and the closest-match score
    ├── voice/                   Grok Voice session, tools, persona, fallback parser
    ├── xai.ts                   xAI REST helpers that fall back instead of throwing
    ├── render-cache.ts          stores Imagine results under public/renders
    ├── rate-limit.ts            per-IP sliding-window limits used by proxy.ts
    └── demo-sketches.ts         the three sample sketches
```

`lib/design.ts` is the one contract every module shares. The reader produces a `Design`, the physics turns it into an `Analysis` and a `FlightTrace`, and the red pen, voice, recap and launch scene only consume those types. Because of that, each piece can be built and tested on its own.
