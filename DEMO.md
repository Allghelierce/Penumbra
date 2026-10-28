# Demo script: Penumbra

> Start from a rocket that flew. Change one thing, and see what it costs.

Penumbra is a rocket-design learning tool. Pitch it as a way to build intuition: every number on screen is the real rocket's, next to what your change does to it, and the physics behind those numbers lands within 4% of the published payloads for Falcon 9 and Saturn V. Grok reads sketches and runs the spoken GO/NO-GO poll. Code does every number, and every picture is either a sketch or drawn by code.

There are two one-minute runs: modifying Falcon 9, then the CRS-7 case study. A checklist, a backup plan and the questions people ask follow. **BOLD CAPS** is a button as it appears on screen. Text in quotes is what you say.

## The 60-second run: land the booster

Open `/?rocket=falcon9`. It skips the picker and opens the real Falcon 9 in **MODIFY**.

| Time | Do | Say |
|---|---|---|
| 0:00–0:08 | Falcon 9 on screen. Point at **REAL VS YOURS**. | "This is the real Falcon 9, built from its published masses and engines. Penumbra says it can carry 23.1 tonnes to orbit; SpaceX publishes 22.8." |
| 0:08–0:18 | On the first stage (the lower one), switch **♻ RECOVER** on. | "Now land the booster, the way SpaceX does. It has to save propellant for the landing burns and carry legs and grid fins, and that costs 5.6 tonnes of payload." |
| 0:18–0:23 | The payload button now reads **Too heavy. Most it can carry: 17.5 t**. Click it. | "So a reusable Falcon 9 carries 17.5 tonnes. SpaceX's own figure is 17.4." |
| 0:23–0:33 | Drag the first stage's top edge up slowly, until its handle reads ×1.25, and watch the chart. | "Why not bigger tanks? Payload climbs, then falls, because a heavier rocket fights gravity for longer. The best is a quarter bigger and only 3% better: the real Falcon 9 is close to its best." |
| 0:33–0:39 | **CHECK IT →**. | "The red pen writes only what's wrong. This one gets a tick: good to fly." |
| 0:39–0:55 | **FLY IT →**. When the readout at the top changes from **REAL TIME** to **TIME ×**, click **4×**. Just before orbit, the booster inset bottom left reads **LANDS AT T+8:14, AFTER ORBIT**. | "It lifts off in real time. When it speeds up, the readout says by how much. And the booster is still flying home when the second stage reaches orbit, so instead of faking a landing, it tells you when it touches down." |
| 0:55–1:00 | The end card: **IN ORBIT**. | "That's Penumbra: start from a rocket that flew, and learn what every choice costs." |

To go further, click **Back to Modify**, then **MODIFY AGAIN** and **RESET TO THE REAL ONE**. Switch the destination to **MARS LANDING**, click **Too heavy. Most it can carry: 1.0 t**, then **CHECK IT →** (a tick, with nothing to spare) and **FLY IT →**. The flight parks in orbit, burns for Mars, passes the Moon's distance about a day later and ends **ON COURSE FOR MARS**, never "arrived". It takes about 50 seconds at 1×. Or open Saturn V or Starship from the picker and do the same with their stages.

## The 60-second case study: CRS-7

Open the picker at `/`, and under **REAL FLIGHTS** pick **CRS-7 · Dragon to the ISS**. The run is one straight line: **Sketch → Diagnose → Build → Fly → Debrief**. Every fact below comes from the flight's record in `lib/missions.ts`.

| Time | Do | Say |
|---|---|---|
| 0:00–0:10 | Pick **CRS-7**. The napkin sketch draws itself, and **DIAGNOSE →** wakes up when it's done. | "This rocket really flew and really failed: SpaceX CRS-7, Dragon to the space station, June 2015." |
| 0:10–0:17 | **DIAGNOSE →**. The red pen marks the second-stage tank. | "Not the engines: a steel strut holding a helium bottle inside the second-stage oxygen tank. It broke at about a fifth of the load it was certified for." |
| 0:17–0:21 | **BUILD IT →**. | "Build inks the napkin clean, with the broken part still marked." |
| 0:21–0:46 | **FLY IT →**, then click **2×** as it clears the tower. | Stay quiet until it breaks up at T+2:19, then: "That's where the real one was lost, 139 seconds in." |
| 0:46–0:54 | The debrief opens on **LOST**. Point at **WHAT THE NUMBERS DON'T SHOW**, then **ON THE RECORD**. | "The numbers had margin to spare. One strut failing far below its rated load was enough. And that's what SpaceX said at the time." |
| 0:54–1:00 | Point at **Fix it & fly again →** and **Full report**. | "Fix it and fly again flies the comeback: Orbcomm OG2, which landed the first Falcon 9 booster. The full report has the whole story." |

Other comebacks to show if there's time: Falcon 1 Flight 1 → Flight 4, and Starship IFT-1 → IFT-5. Saturn V and Electron have their own flights too. Apollo 13 is a good one: pogo shut the second stage's center engine two minutes early, and the other engines burned longer to make orbit anyway.

## Draw your own

**+ DRAW YOUR OWN** on the picker opens a blank napkin. Draw a rocket, and a line under the napkin says what it sees as you go ("I see: a 2-stage rocket, 9 engines, fins"). Click **CHECK DESIGN →**: the drawing is read (by Grok vision with a key, a geometry reader without one), and the red pen reviews it with the same physics. To start from a sample, open `/?demo=two-stage-orbiter` (or `napkin-hopper`, `moon-rocket`, `mars-ship`). Hand the mouse to whoever is watching: "Draw a rocket, any rocket."

## Numbers worth knowing

| Rocket | Published payload to LEO | Model | Ratio |
|---|---|---|---|
| Falcon 9 Block 5, expended | 22.8 t | 23.1 t | 101% |
| Falcon 9 Block 5, booster recovered | 17.4 t | 17.5 t | 101% |
| Saturn V (including the S-IVB) | 140 t | 135 t | 96% |
| Electron | 300 kg | 354 kg | 118% |
| Starship Block 2, both stages recovered | 35 t | 151 t | 431% |

- Model figures are rounded down, as the app shows every capacity.
- Landing Falcon 9's booster costs 5.6 t in the model (23.1 t less 17.5 t). The published figures differ by 5.4 t, so say "close to", not "matches".
- Reaching low Earth orbit takes 8.8 to 9.6 km/s for these four rockets: 7.8 km/s of orbital speed, less 0.4 km/s from Earth's spin, plus each design's own gravity and drag losses.
- The **How it works** page (`/about`) computes this table live from the same code.

## Before you demo

- [ ] Demo from a production build: `npm run build && npm start`. In dev mode a code change can reload the studio mid-run.
- [ ] Optional: `XAI_API_KEY` in `.env.local` turns on Grok vision, Grok Voice and the xAI voice for callouts. Without it the app falls back by itself, and both runs above work the same.
- [ ] Chrome is full screen, and the napkin, the right-hand panel and the chart all fit. Zoom out with ⌘− if not.
- [ ] Sound is on. Click anywhere once so launch audio can play.
- [ ] Tab 1 has `/?rocket=falcon9`. Tab 2 has the picker at `/`.
- [ ] Both runs rehearsed once, end to end.
- [ ] The backup video is on the desktop.

## If something breaks

| What breaks | What you'll see | What to do |
|---|---|---|
| No xAI key, or xAI is down | The geometry reader and the browser's voice take over | Keep the same script. Modify, the trade chart, the red pen and the real flights never need an API. |
| A drag goes wrong | Numbers you didn't mean | **UNDO** (or Cmd+Z), or **RESET TO THE REAL ONE**. |
| Running long | — | Use **2×**, **4×** or **8×** at the top right of the launch, or **Skip ›** (Esc). Never skip the end card. |
| The browser hangs | — | Switch to the other tab, or reload `/?rocket=falcon9`. |
| Everything is down | — | Play the backup video and narrate the same script. |

## Questions you may get

- **"Is the AI making up the numbers?"** No. Grok reads sketches and talks. Every number comes from deterministic TypeScript that unit tests check against published payloads.
- **"Why is Starship so far off?"** SpaceX's published 35 t, with both stages recovered, folds in early-block shortfalls and conservative margins the model doesn't know about. With the published masses the physics allows 151 t. Penumbra shows that gap instead of tuning it away.
- **"Why does Electron run high?"** Its rated 300 kg rides on the Curie kick stage, whose mass isn't published, and its stage masses are community estimates.
- **"Why is there a best tank size?"** More propellant means more delta-v, but a heavier rocket lifts off slower and loses more to gravity, so past a point each extra tonne buys less than it costs. Further out, it can't leave the pad with a safe thrust-to-weight of 1.15.
- **"Why is the launch so slow?"** At 1× it lifts off in real time, then speeds up, and the readout always says by how much. A flight to orbit takes 30 to 40 seconds at 1×, and 2× to 8× are one click away.
- **"Why does the Mars flight stop past the Moon?"** The launch follows the departure out to a million kilometres. The cruise takes about eight and a half months, so the flight ends on course for Mars rather than pretending to arrive.
- **"Why can Falcon 9 take only 1 t to Mars?"** The target is a Mars landing. Published Mars figures stop at the transfer orbit, while Penumbra also lands the payload, and the panel says so under the numbers.
- **"Where do the real flights come from?"** Each one lists its sources on screen: Wikipedia, NASA flight reports, the Apollo Flight Journal and news coverage from the time. Approximate figures are marked ≈.
