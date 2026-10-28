# Demo script: Penumbra

> Start from a rocket that flew. Change one thing, and see what it costs.

Penumbra is a rocket-design learning tool. Pitch it as a way to build intuition: every number on screen is the real rocket's, next to what your change does to it, and the physics behind those numbers lands within 3% of the published payloads for Falcon 9 and Saturn V. Grok reads sketches and runs the spoken GO/NO-GO poll. Code does every number, and every picture is either a sketch or drawn by code.

There are two one-minute runs: modifying Falcon 9, then the CRS-7 case study. A checklist, a backup plan and the questions people ask follow. **BOLD CAPS** is a button as it appears on screen. Text in quotes is what you say. Lines starting with 🎙 are said to Mission Control: hold Space (or the mic button), talk, release. You can also type them into the command box.

## The 60-second run: land the booster

Open `/?rocket=falcon9`. It skips the picker and opens the real Falcon 9 in **MODIFY**.

| Time | Do | Say |
|---|---|---|
| 0:00–0:10 | Falcon 9 on screen. Point at **REAL VS YOURS**. | "This is the real Falcon 9, built from its published masses and engines. Penumbra says it can carry 23.2 tonnes to orbit; SpaceX publishes 22.8." |
| 0:10–0:22 | On the first stage, switch **♻ RECOVER** on. | "Now land the booster, the way SpaceX does. It has to save propellant for the landing burns and carry legs and grid fins, and that costs 5.7 tonnes of payload." |
| 0:22–0:28 | Click **Most it can carry: 17.5 t** under the payload. | "So a reusable Falcon 9 carries 17.5 tonnes. SpaceX's own figure is 17.4." |
| 0:28–0:40 | Drag the top edge of the first stage up, slowly, and watch the chart under the table. | "Why not bigger tanks? Payload climbs, then falls: a heavier rocket fights gravity for longer, and past about 1.25 times it can't leave the pad safely. The real Falcon 9 sits right next to the best point." |
| 0:40–0:48 | **CHECK IT →**. | "The red pen only marks what fails, and a check mark means it's good to fly." |
| 0:48–0:58 | Fly it. | "It flies at a pace you can follow. When a long burn fast-forwards, the readout says so. And the booster comes back." |
| 0:58–1:00 | **RECAP**. | "The recap says what the change did. That's Penumbra: start from a rocket that flew, and learn what every choice costs." |

To go further, switch the destination to **MARS**: the flight leaves Earth, coasts past the Moon and ends on course for Mars. Or open Saturn V or Starship from the picker and do the same with their stages.

## The 60-second case study: CRS-7

Open the picker at `/`, and under **REAL MISSIONS** pick **CRS-7**. The run is one straight line: **Diagnose → Build → Fly → Debrief**. Every fact below comes from the mission record in `lib/missions.ts`.

| Time | Do | Say |
|---|---|---|
| 0:00–0:06 | Pick **CRS-7**. | "This rocket really flew and really failed: SpaceX CRS-7, Dragon to the space station, June 2015." |
| 0:06–0:16 | The sketch draws itself with the flaw in it. **Diagnose** circles it. | "Not the engines: a steel strut holding a helium bottle inside the second-stage oxygen tank. It broke at about a fifth of the load it was certified for." |
| 0:16–0:22 | **Build**: the clean profile, on the real Falcon 9's numbers. | "Build turns the napkin into a clean profile with the real rocket's numbers." |
| 0:22–0:40 | **Fly**. The real statements play, and the screen shakes at the breakup. Use **2×** if you're behind. | Stay quiet until T+139 s, then: "That's where the real one was lost, and those were the real words." |
| 0:40–0:54 | **Debrief**, then **Fix it & fly again**. | "SpaceX replaced the struts with a stronger design and tested every one. The comeback, Orbcomm OG2 in December 2015, made orbit and landed the first Falcon 9 booster." |
| 0:54–1:00 | Point at **Full report**, then **Draw your own**. | "The full report has the cause chain, the timeline and the lessons. For a new design, draw your own." |

Other comebacks to show if there's time: Falcon 1 Flight 1 → Flight 4, and Starship IFT-1 → IFT-5.

## Draw your own

**+ DRAW YOUR OWN** on the picker opens a blank napkin. Draw a rocket, or load a sample, then check it. Grok vision reads the stages, engine bells and tanks (a geometry reader does it without a key), and the drawing goes through the same physics and the same red pen. Hand the mouse to whoever is watching: "Draw a rocket, any rocket."

## Numbers worth knowing

| Rocket | Published payload to LEO | Model | Ratio |
|---|---|---|---|
| Falcon 9 Block 5, expended | 22.8 t | 23.2 t | 102% |
| Falcon 9 Block 5, booster recovered | 17.4 t | 17.5 t | 101% |
| Saturn V (including the S-IVB) | 140 t | 135.9 t | 97% |
| Electron | 300 kg | 354 kg | 118% |
| Starship Block 2, both stages recovered | 35 t | 151 t | 432% |

- Landing Falcon 9's booster costs 5.7 t in the model. The published figures differ by 5.4 t, so say "close to", not "matches".
- Reaching low Earth orbit takes 8.8 to 9.6 km/s for these four rockets: 7.8 km/s of orbital speed, less 0.4 km/s from Earth's spin, plus each design's own gravity and drag losses.
- The **How it works** page (`/about`) computes this table live from the same code.

## Before you demo

- [ ] Demo from a production build: `npm run build && npm start`. In dev mode a code change can reload the studio mid-run.
- [ ] Optional: `XAI_API_KEY` in `.env.local` turns on Grok vision and Grok Voice. Without it the app falls back by itself, and both runs above work the same.
- [ ] Chrome is full screen, and the napkin, the right-hand panel and the chart all fit. Zoom out with ⌘− if not.
- [ ] Sound is on. Click anywhere once so launch audio can play. For the voice poll, grant microphone permission.
- [ ] Tab 1 has `/?rocket=falcon9`. Tab 2 has the picker at `/`.
- [ ] Both runs rehearsed once, end to end.
- [ ] The backup video is on the desktop.

## If something breaks

| What breaks | What you'll see | What to do |
|---|---|---|
| No xAI key, or xAI is down | The geometry reader and the browser's voice take over | Keep the same script. Modify, the trade chart and the red pen never call an API. |
| A drag goes wrong | Numbers you didn't mean | **UNDO** (or Cmd+Z), or **RESET TO THE REAL ONE**. |
| Running long | — | Use **2×** or **4×** at the top right of the launch, or **Skip ›** (Esc). Never skip the recap. |
| The mic doesn't hear you | No transcript | Use the poll's buttons, or type into the command box. |
| The browser hangs | — | Switch to the other tab, or reload `/?rocket=falcon9`. |
| Everything is down | — | Play the backup video and narrate the same script. |

## Questions you may get

- **"Is the AI making up the numbers?"** No. Grok reads sketches and talks. Every number comes from deterministic TypeScript that unit tests check against published payloads.
- **"Why is Starship so far off?"** SpaceX's published 35 t, with both stages recovered, folds in early-block shortfalls and conservative margins the model doesn't know about. With the published masses the physics allows 151 t. Penumbra shows that gap instead of tuning it away.
- **"Why does Electron run high?"** Its rated 300 kg rides on the Curie kick stage, whose mass isn't published, and its stage masses are community estimates.
- **"Why is there a best tank size?"** More propellant means more delta-v, but a heavier rocket lifts off slower and loses more to gravity. Past a point it can't leave the pad with a safe thrust-to-weight of 1.15.
- **"Why does the Mars flight stop past the Moon?"** The launch shows the departure from Earth. The cruise takes months, so the flight ends on course rather than pretending to arrive.
