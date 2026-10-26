# Demo script: Penumbra

> Sketch a rocket. Penumbra finds the flown rocket it is closest to, flies that rocket's real numbers to the destination you picked, and ends on what happened when that rocket really flew: what worked, what broke, and why.

Pitch it as a lesson for people who design rockets: the napkin gets you in the door, and history does the teaching. Nothing on screen is invented. The vehicle, the masses and the record all come from a rocket that has flown.

The demo opens with the 60-second CRS-7 run. A two-minute run, a 30-second cut and a backup plan follow it. **BOLD CAPS** is a button as it appears on screen. Text in quotes is what you say to the judges. Lines starting with 🎙 are said to Mission Control: hold Space (or the mic button), talk, release. You can also type them into the command box. Numbers in brackets change as the records change: read them off the screen, and fill them in during the rehearsal.

## The 60-second run: CRS-7

Open on a real mission, close on your own design. The app runs one straight line: **Diagnose → Build → Fly → Debrief**. Numbers in brackets come from the mission card, so read them off the screen and don't round them.

| Time | Do | Say |
|---|---|---|
| 0:00–0:06 | Studio on screen. Pick **CRS-7**. | "This is Penumbra. We start with a rocket that really flew and really failed: SpaceX CRS-7, a Falcon 9 cargo flight in 2015." |
| 0:06–0:18 | The sketch draws itself. **Diagnose**: the red pen circles the strut in the second-stage LOX tank. | "Watch where the red pen goes. Not the engines: a steel strut holding a helium bottle inside the second-stage oxygen tank. It failed at a fraction of its rated load: [read the numbers on the card]." |
| 0:18–0:28 | **Build**: the clean profile, then the photo. | "Build turns the napkin into a clean profile with the real Falcon 9's numbers, and Grok Imagine renders it." |
| 0:28–0:44 | **Fly**. Let the real commentary play over the flight. | Stay quiet until the breakup, then: "T+139 seconds. That's where the real one was lost, and that was the real commentary." |
| 0:44–0:54 | **Debrief**: what SpaceX changed. | "What changed: the struts were redesigned [read the fix on the card]. The return to flight, Orbcomm OG2, also brought the first landing of an orbital booster." |
| 0:54–1:00 | Point at **Draw your own**. | "One real failure, learned in a minute. For a new design, draw your own: same physics, same red pen, your rocket." |

If there's time after the minute, click **Draw your own** and continue with the two-minute run below.

## How it works, in one breath

1. **The doodle picks a flown rocket.** The reader counts stages and engine bells, and Penumbra picks the closest of four rockets with a public record: Falcon 9 Block 5, Saturn V, Starship and Electron.
2. **The numbers are that rocket's.** Physics flies its published stages, engines, dry mass, propellant and payload. Only the destination is yours, so you can ask a real rocket to do something it never did.
3. **The last card is what happened when it flew.** Its real record, successes and failures, and for each failure what went wrong, why, and the rule a designer can take from it today.

## The samples

| Sample | What the reader sees | Rocket it picks | Destination |
|---|---|---|---|
| **TWO-STAGE ORBITER** | 2 stages, 3 bells read as 9 engines, fins | Falcon 9 Block 5 | Orbit |
| **MOON ROCKET** | 3 stages, 5 bells, fins, escape tower | Saturn V | Moon landing |
| **MARS SHIP** | 2 stages, 5 big bells read as about 30 engines, heat shield, legs | Starship | Mars landing |
| **NAPKIN HOPPER** | 1 stubby stage, 1 bell | The small one: Electron | Orbit |

Check the hopper in rehearsal. On stage and engine count alone, Electron and Falcon 9 look the same (two stages, nine engines on the first), so the hopper depends on the matcher's tie-break. If it picks Falcon 9, use it as a second Falcon 9 example and skip the Electron lines.

## Before the judges arrive

- [ ] `XAI_API_KEY` is in `.env.local`, and `curl -s localhost:3000/api/xai-status` shows `"keyPresent":true`. Use the port the server printed.
- [ ] The render cache is warm: in dev, open `/dev/xai` and press the warm demo cache button. If you demo from `next start`, warm the cache *before* `next build`, because the production server only serves `public/` files that existed at build time.
- [ ] Chrome is full screen on the studio, and the napkin, the right-hand column and the voice dock all fit on screen (zoom out with ⌘− if not).
- [ ] Microphone permission is granted. Click anywhere once so launch audio is allowed to play, then hold Space and check that you're heard.
- [ ] Every sample checked once: each one names the rocket in the table above, and every bracket below is filled in from the screen.
- [ ] One full rehearsal of the run below is done in the last 10 minutes.
- [ ] The napkin is clear and the target is **ORBIT**. While you wait, leave the studio idle: attract mode draws, checks and flies the samples by itself, and any click stops it.
- [ ] A second tab is open with **TWO-STAGE ORBITER** loaded and checked, as a spare.
- [ ] The backup video is on the desktop, and a phone hotspot is ready.

## The two-minute run

| Time | Do | Say | Judging criterion |
|---|---|---|---|
| 0:00–0:08 | Studio on screen. | "Sketch a rocket, and Penumbra tells you which real rocket you just drew, flies its real numbers, and shows you what happened when it flew." | Built on decades of public data |
| 0:08–0:20 | Hand the judge the mouse ("Draw a rocket, any rocket."), or click **TWO-STAGE ORBITER**. Then click **CHECK DESIGN**. | "Grok vision counts the stages and the engine bells. Two stages, nine engines at this scale: that's a Falcon 9." | Grok API (vision) |
| 0:20–0:32 | Point at the rocket's name, then the numbers. | "From here on these aren't my numbers. Nine Merlin engines, Falcon 9's published dry mass and propellant, [22.8] tonnes of payload. [x] km/s against the [9.4] orbit needs." | Real vehicle data and delta-v maps |
| 0:32–0:44 | Click **LAUNCH**. Mission Control polls while the tiles light up. 🎙 "GO." | "Nothing flies until every console is GO, and each call carries its number." | **Grok Voice API (required)** |
| 0:44–0:56 | The flight plays, about 12 s, with Quindar beeps and callouts. | "Your drawing, flying a Falcon 9's trajectory." When it reaches orbit: "Orbit." | Physics on real data |
| 0:56–1:24 | The end card shows Falcon 9's record. Point at one failure. | "This is what a real Falcon 9 did: [hundreds] of flights, [a handful] lost. In 2015 one broke up because a steel strut holding a helium bottle snapped well below its rated load. The lesson you can use tomorrow: rockets are usually lost to the smallest part, so test every bracket and line, not just the engines." | Decades of missions |
| 1:24–1:44 | 🎙 "Send it to Mars." Same Falcon 9, new destination, and the poll runs again. | Let Trajectory call it: *"…NO-GO. We're [x] kilometers per second short."* Then: "A real Falcon 9 can't throw its full payload to Mars, and now you know by how much. That gap is why Starship exists." | Grok Voice API, physics |
| 1:44–2:00 | **Back to the napkin.** Point at the concept render. | "Grok Imagine rendered the concept from the sketch. That's Penumbra: draw a rocket, fly a real one, and learn from what really happened." | **Grok Imagine API (required)** |

Each voice step has a button that does the same thing: **GO FOR LAUNCH** (or **GO ANYWAY** after a NO-GO) for "GO". **SCRUB** (or 🎙 "Scrub") goes back to the review. Nothing ever blocks the launch.

If there is time left, click **MARS SHIP**: it picks Starship, and its card is the most honest one in the app, a test program that learned in public.

**Phrases that always work,** even with no key. Chain them with "and":

- In the poll: "go" / "we are go", "scrub" / "hold"
- After a flight: "yes" flies again, "no" stands by
- Destinations: "send it to Mars", "land it on Mars", "send it to the Moon"
- "What do you think?"

## What each card teaches

This is the history behind each end card, so you can answer "why did it fail?" in plain words. The card has the current record. Use it for counts, and use these notes for the story. The lessons are the part to say out loud. Each one is a rule you could apply to a design today.

### Falcon 9 Block 5: fly a lot, and respect the small parts

- **What went right.** Nine engines on the first stage give engine-out margin. In 2012 an earlier Falcon 9 lost one engine on the way up and still put Dragon on its way to the station. Boosters land and fly again, so SpaceX gets to inspect flown hardware and flies often enough to see problems early.
- **What went wrong.** *CRS-7, 2015:* a strut holding a helium bottle inside the second-stage oxygen tank broke, the bottle came loose and the stage burst. *Amos-6, 2016:* the rocket exploded on the pad during fueling, before a static fire. Super-cold oxygen got trapped in the wrap of a helium bottle and ignited. *Starlink 9-3, 2024:* a cracked sensor line leaked oxygen on the second stage, the engine's relight went hard, and the satellites were left too low.
- **Lesson.** All three losses came from small parts: a strut, a bottle wrap, a sensor line. Test the brackets, lines and clamps as hard as the engines. Engine count buys margin, and flying often finds faults sooner.

### Saturn V: test it all together, and watch for shaking

- **What went right.** Thirteen launches from 1967 to 1973, and every one reached space. The first flight flew all three stages live at once ("all-up" testing), which saved years. Engine-out margin saved two missions.
- **What went wrong.** *Apollo 6, 1968 (uncrewed):* the stack bounced lengthwise. Engine thrust and the structure fed each other, a vibration called pogo. On the second stage one engine's igniter line broke and it shut down. A second engine then shut down too, because its wiring was crossed with the first. The third stage failed to restart. *Apollo 13, 1970:* pogo on the second stage shook the center engine until it shut down early. The other engines burned longer and the launch still worked. (The famous oxygen tank explosion was in the spacecraft, later.)
- **Lesson.** Engines and structure are one system: model the vibrations together and add damping. Check wiring from both ends. Size the stages so losing an engine still gets you there.

### Starship: break it on purpose, and fix the plumbing

- **What went right.** A full-size stack that keeps flying while the design is still changing. Hot staging worked on its second flight. Later flights brought ship and booster down softly in the sea, and the tower caught the booster. Each flight went further than the one before.
- **What went wrong.** *Flight 1, 2023:* engines went out, the stages never separated, and the launch dug a crater under the pad. *Flight 2:* the stages separated, then both were lost. A clogged oxygen filter starved the booster's engines, and venting oxygen fed a fire on the ship. *Flights 7 to 9, 2025:* new ships were lost to leaks and fires in the engine section. One cause was vibration that cracked propellant hardware. A ship also exploded on the test stand when a pressure bottle failed. The card has flights after that.
- **Lesson.** Most losses were plumbing: leaks, filters, vibration on lines. Shake-test the feed system, give leaked propellant nowhere to burn, and treat the launch pad as part of the rocket. Flying early only pays if every loss ends in a specific fix.

### Electron: on a small rocket, the wiring is the rocket

- **What went right.** Electric-pump engines and a carbon-composite body make a small launcher that flies often for small satellites. After each failure it was flying again within months.
- **What went wrong.** *First flight, 2017:* the rocket was healthy, but ground telemetry equipment lost its signal because of a configuration error, and range safety ended the flight. *2020:* one bad electrical connection on the second stage heated up and cut power. *2021:* a fault in the second-stage igniter system corrupted signals, and the engine computer shut the engine down. *2023:* an electrical arc in the second stage's high-voltage battery system cut power.
- **Lesson.** Small-rocket failures were electrical and software, not big engines. Test connectors hot, shaking and in vacuum. Remember that high voltage arcs easily at low air pressure. Test the ground system as hard as the rocket.

## The 30-second version

| Time | Do | Say |
|---|---|---|
| 0:00–0:06 | Studio on screen, target **ORBIT**. | "Sketch a rocket, fly the real rocket it's closest to, and learn what happened when that rocket flew." |
| 0:06–0:12 | Click **TWO-STAGE ORBITER**, then **CHECK DESIGN**. | "Two stages, nine engines: Falcon 9. These are its published numbers, not mine." |
| 0:12–0:20 | Click **LAUNCH**. Press Esc to skip the readout. 🎙 "GO." | "All GO… orbit." |
| 0:20–0:30 | The end card. | "And here is what really happened: [hundreds] of flights, [a handful] lost, mostly to small parts like a single strut. Test the small parts. Penumbra." |

## How the demo covers the judging criteria

| Criterion | Where judges see it |
|---|---|
| Build on space's public data, decades of missions and literature | The sketch is matched to a flown rocket (0:08). Every number is that rocket's published figure (0:20). The end card is its real flight record, 1967 to today, with the cause of each failure (0:56). The in-app **HOW IT WORKS** page shows every table with its sources. |
| **Required:** Grok Imagine or Grok Voice API | Both are used. Grok Voice runs Mission Control: the poll, GO and the destination change (0:32 to 1:44). Grok Imagine renders the concept (1:44). Grok vision reads the sketch too (0:08). |
| Bonus: Grok Bot for planning and collaboration | Not a demo beat. If a judge asks, describe what the team actually did. |
| Use of Cursor in the build | Not a demo beat. If a judge asks, describe what the team actually did. |

## Backup plan

| What breaks | What you'll see | What to do |
|---|---|---|
| Venue Wi-Fi | Spinners, or no renders | Switch to the phone hotspot. Cached renders still appear. Only Grok and NASA need the internet. |
| xAI API slow or down, or no key | The app falls back by itself: geometry reader, rules-only red pen, browser voice with a different pitch per controller, cached renders or none | Keep the same script. The geometry reader counts stages and bells too, so the samples pick the same rockets. If there's no render at 1:44, close on the end card instead. |
| The mic doesn't hear you (noisy room, Firefox, or offline: Chrome's speech recognition needs internet) | No transcript appears | Use the buttons, or type the words into the command box. Pick **MARS** as the target instead of saying "send it to Mars". |
| No sound | Silent poll | The tiles still light on a timer. Read the NO-GO line off the Trajectory tile yourself. |
| The judge's drawing picks a surprising rocket | A rocket you didn't expect | Use it: "It counted [n] stages and [n] bells, so it's closest to [rocket]." Then read that rocket's card. Every card has a lesson. |
| The judge's drawing reads badly | Strange numbers | Say "Let's use one I drew earlier," click **TWO-STAGE ORBITER**, then **CHECK DESIGN**, and continue from 0:20. |
| Running long | — | Press Esc to skip a poll readout, and **skip ›** in the corner of a flight. Cut the Mars beat. Never cut the end card. |
| The browser hangs | — | Switch to the spare tab and continue from 0:32. |
| Everything is down | — | Play the backup video and narrate the same script over it. |

### Offline run with the samples

Use this path when there's no internet and no key. Type the 🎙 lines into the command box, or use the buttons. Fill in the brackets during rehearsal.

1. Click **TWO-STAGE ORBITER**, then **CHECK DESIGN**. It reads as two stages with three bells (nine engines at scale) and picks Falcon 9 Block 5. **LAUNCH**, "go": it reaches orbit with [x] km/s. The card shows Falcon 9's record. Talk through CRS-7 and the small-parts lesson.
2. Type "send it to Mars". Same Falcon 9 and payload, now on the way to Mars, and Trajectory calls NO-GO, [x] km/s short. Real rockets have real limits.
3. Click **MOON ROCKET**. The **MOON** target lights up. **CHECK DESIGN**: three stages, five bells, Saturn V. **LAUNCH**, "go". The card shows thirteen launches. Talk through Apollo 6, pogo and the crossed wire.
4. Click **MARS SHIP**. The **MARS** target lights up. **CHECK DESIGN**: two stages, about thirty engines, heat shield and legs, Starship. Fly it and read the card: a test program, with the cause of each loss.
5. Click **NAPKIN HOPPER**, then **CHECK DESIGN**: one small stage. If it picks Electron, its card shows a small rocket's failures, all electrical or software.
