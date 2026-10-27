# Penumbra

Sketch a rocket on a napkin. Penumbra reads the drawing, runs real physics on it, marks it up in red pen, polls Mission Control GO/NO-GO, and flies it.

Built for the SpaceX track of a 4-hour hackathon. The app lives in [`doodle-to-starship/`](doodle-to-starship/); its [README](doodle-to-starship/README.md) has the full tour.

## What it does

- **Reads your sketch.** Grok vision turns the drawing into stages, engines, tank volumes and features. Scribbles are caught and coached ("draw the outline first").
- **Real numbers, from code.** The rocket equation runs stage by stage on published engine data (Raptor, Merlin, RS-25, F-1 and more, each with a source link): thrust-to-weight, delta-v and how far it can go.
- **Red pen.** Fixes already checked against the physics ("stretch the tanks 21%", "add a stage"). Tap one to apply it.
- **Mission Control.** Propulsion, Structures, Trajectory, Landing and Flight call GO or NO-GO with the real number behind each call. Then it flies, with webcast callouts and Quindar tones.
- **Real flights.** It replays 12 historic missions, from Falcon 1 Flight 1 to Starship IFT-5, with the actual failure, the real quotes, and a "fix it & fly again" comeback: CRS-7 → OG2, Falcon 1 Flight 1 → Flight 4, IFT-1 → IFT-5.
- **Closest real rocket and prior art.** Your design is matched against 17 real launch vehicles, and NASA's Technical Reports Server is searched for where the idea has been tried.

## How Grok is used

| Grok | What it does |
|---|---|
| **Grok Imagine** | Turns your own sketch into a photoreal concept (isolated, so it drops onto the napkin), renders the flight's outcome, designs a mission patch, and can animate a replay video |
| **Grok Voice** | Narrates the GO/NO-GO poll, launch callouts and real flight quotes, each speaker in their own voice |
| **Grok vision** | Reads the napkin into a structured design through a strict JSON schema; code does all the math |

Every Grok call has a fallback: a geometry reader, rule-based red pen, browser voice, and cached renders. So the demo works offline and with no key.

## Run it

```bash
cd doodle-to-starship
npm install
echo "XAI_API_KEY=your-key" > .env.local   # optional
npm run dev                                # http://localhost:3000
```

`npm test` runs the unit tests and `npx tsc --noEmit` type-checks.
