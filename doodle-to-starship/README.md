# Penumbra

> Every spacecraft in history started as a sketch. We give your sketch 70 years of NASA and SpaceX experience in 60 seconds.

Sketch a spacecraft on a napkin. Grok vision reads the doodle into a real design: stages, engines, tank volumes, payload and destination. A deterministic physics engine built on published engine specs works out delta-v, thrust-to-weight and a verdict. A red pen then marks up your sketch the way a teacher grades homework: "stretch +34%", "add a stage", "fins do nothing in vacuum".

You can talk the design over with a Grok Voice propulsion engineer, who edits it on command. Hit **LAUNCH** and your own doodle flies a simulated flight across a night sky. It fails exactly where the physics says it fails. Grok Imagine renders the concept and the outcome, and NASA's Technical Reports Server shows who tried something similar before.

## How it works

```
 napkin strokes + PNG
        │
        ▼
 /api/read ─────────── Grok vision → SketchReading { design, parts }
        │               (no key: geometry reader estimates it from the strokes)
        ▼
 analyze(design) ───── delta-v per stage, liftoff TWR, verdict, findings
        │               (pure TypeScript on real engine and delta-v data)
        ▼
 red pen ───────────── rules re-run the physics on edited designs to find each fix;
        │               /api/review lets Grok rewrite the wording, never the numbers
        ▼
 voice engineer ────── Grok Voice turns "send it to Mars" into DesignActions;
        │               every edit re-runs analyze() and redraws the red pen
        ▼
 LAUNCH ────────────── simulateFlight() → your strokes fly the trace on a night sky
        │
        ├── /api/render ───── Grok Imagine: concept polaroid + outcome shot
        └── /api/prior-art ── NASA Technical Reports Server search
```

1. **Draw.** The napkin is a 3:4 canvas. Every stroke is stored as normalized `[x, y]` points, so the same doodle can be read, marked up and flown at any size.
2. **Read.** Grok vision gets the napkin image and the raw strokes, and answers with a strict JSON schema. The result is sanitized into a `SketchReading`: a `Design` the physics can trust, plus labeled boxes for each part it found (tanks, engines, fins, heat shield, legs).
3. **Judge.** `analyze()` runs the rocket equation stage by stage. Liftoff uses sea-level thrust, and the upper stages use vacuum figures. It compares the total with the delta-v the destination needs and returns a verdict (`stuck-on-pad`, `suborbital`, `orbit` or `destination`), the furthest place the design could reach, and plain-English findings with numbers.
4. **Mark up.** The red pen is deterministic. To say "stretch +34%" it actually tries stretched tanks, an extra stage or more engines against the physics, and draws the fix that works as arrows, circles and ghost lines on your sketch.
5. **Talk.** The Grok Voice engineer has one tool per design edit: set destination, scale tanks, add or remove a stage, swap engines, set payload, review, launch. It only quotes numbers from the current analysis.
6. **Launch.** `simulateFlight()` produces a time series (altitude, downrange, speed, stage) and events (max-Q, stage separation, engine cutoff, fuel exhausted, orbit, impact). Its outcome always matches the verdict, so the doodle on screen fails at the same point the math does.

## Real data, not vibes

Grok reads sketches and writes words. Every number comes from the physics engine and the published data behind it.

- **Engines:** published thrust (sea level and vacuum), specific impulse (sea level and vacuum) and mass for Raptor 3, Raptor Vacuum, Merlin 1D, Merlin Vacuum, RS-25, RL10C, F-1, J-2, BE-4, RD-180, Rutherford and a generic solid motor. Every `EngineSpec` carries a `source` URL.
- **Destinations:** delta-v from Earth's surface to LEO, GTO, lunar orbit, the lunar surface, Mars transfer, the Mars surface and Europa, gravity and drag losses included. The figures come from published delta-v maps, and every `DestinationSpec` carries a `source` URL.
- **Prior art:** [NASA's Technical Reports Server](https://ntrs.nasa.gov) is searched with terms built from the design. A one-stage methalox doodle bound for orbit searches "reusable launch vehicle liquid methane single stage to orbit", and a Mars ship with a heat shield searches "Mars entry descent landing liquid methane heat shield". The top reports appear next to the verdict with their year and a link.

The engine and destination tables live in `lib/physics/`.

## How Grok is used

| Grok API | Where | What it does |
|---|---|---|
| Grok vision | `app/api/read`, `lib/sketch/vision.ts` | Reads the napkin PNG and strokes into a `Design` and part boxes, using a strict JSON schema |
| Grok (text) | `app/api/review` | Rewrites the red-pen notes in a sharper voice. Checks reject any rewrite that changes a number |
| **Grok Imagine** | `app/api/render` | Renders a concept "polaroid" of your design, plus an outcome shot after launch |
| **Grok Voice** | `components/VoiceDock.tsx`, `lib/voice/`, `app/api/voice-token` | Realtime voice conversation with a propulsion-engineer persona whose tool calls edit the design |

The server mints a short-lived voice token, so the xAI key never reaches the browser. Model names are set in `lib/xai.ts`.

### Works without a key

Every xAI call resolves to `null` on any failure (no key, timeout, HTTP error, bad JSON), and each route falls back:

| Feature | With `XAI_API_KEY` | Without it, or if the API fails |
|---|---|---|
| Reading the sketch | Grok vision | Geometry reader (`lib/sketch/geometry.ts`): body width, stage-boundary lines, engine bells and fins measured from the strokes |
| Red pen | Rules plus Grok wording | Rules only |
| Voice | Grok Voice realtime | Browser speech recognition and synthesis, a command parser (`lib/voice/intent.ts`) and a typed-command box |
| Images | Grok Imagine | No image |
| Prior art | NASA NTRS (no key needed) | Empty panel when offline |

Three built-in napkin doodles (**Napkin Hopper**, **Two-Stage Orbiter**, **Mars Ship**) sit under "or try" in the header, ready for testing and demos.

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

## Architecture

```
doodle-to-starship/
├── app/
│   ├── page.tsx                 renders the studio
│   ├── layout.tsx, globals.css  fonts and the napkin & red-pen palette
│   ├── api/read/                POST: sketch → SketchReading (Grok vision or geometry)
│   ├── api/review/              POST: reading + analysis → red-pen Review
│   ├── api/render/              POST: design → Grok Imagine concept or outcome image
│   ├── api/voice-token/         Grok Voice session token, or "use browser voice"
│   ├── api/prior-art/           GET: NASA Technical Reports Server search
│   └── dev/                     dev-only pages for the launch scene and voice dock
├── components/
│   ├── Studio.tsx               studio: napkin, destination chips, check, launch
│   ├── NapkinCanvas.tsx         pencil drawing surface (3:4)
│   ├── RedPenOverlay.tsx        animated red-pen marks and part labels
│   ├── VerdictPanel.tsx         verdict, numbers, Imagine polaroid, NASA prior art
│   ├── VoiceDock.tsx            hold-to-talk engineer, transcript, typed commands
│   ├── LaunchScene.tsx          your strokes flying the simulated trace
│   └── launch/                  flight plan, rocket geometry, scenery, end card
└── lib/
    ├── design.ts                shared contract: types, HTTP shapes, NAPKIN_ASPECT
    ├── physics/                 analyze(), simulateFlight(), ENGINES, DESTINATIONS
    ├── sketch/                  vision prompt and schema, geometry fallback reader
    ├── redpen.ts                deterministic red-pen rules
    ├── actions.ts               pure Design edits (one per DesignAction)
    ├── voice/                   Grok Voice session, tools, persona, fallback parser
    ├── xai.ts                   xAI REST helpers that fall back instead of throwing
    ├── napkin.ts                draws strokes as soft pencil lines
    └── demo-sketches.ts         the three built-in napkin doodles
```

`lib/design.ts` is the one contract every module shares. The reader produces a `Design`, the physics turns it into an `Analysis` and a `FlightTrace`, and the red pen, voice engineer and launch scene only consume those types. Because of that, each piece can be built and tested on its own.
