# Demo script: Doodle → Starship

The live demo takes two minutes, and there is a 30-second cut and a backup plan below it. **Bold** text is UI you click. Text in quotes is what you say out loud. Lines starting with 🎙 are spoken into the voice dock: hold the red button (or Space), talk, release.

## Before the judges arrive

- [ ] `npm run dev` is running. Chrome is full screen on the app, and the napkin, verdict panel and voice dock all fit on screen (zoom out with ⌘− if not).
- [ ] `XAI_API_KEY` is in `.env.local`, and `curl -s localhost:3000/api/voice-token` returns `"mode":"grok"`. Use the port `npm run dev` printed.
- [ ] Microphone permission is granted. Hold the red button once, say "what do you think?", and hear the engineer answer.
- [ ] One full rehearsal is done in the last 10 minutes, so Grok vision, Grok Imagine and NASA NTRS have all answered at least once.
- [ ] The napkin is clear and the **Orbit** destination chip is circled.
- [ ] A second tab is open on the app with **Mars Ship** loaded and checked, as a spare.
- [ ] A phone hotspot is ready.
- [ ] A screen recording of one good full run is saved on the desktop.
- [ ] A mouse is plugged in for the judge. Drawing on a trackpad is hard.

## The two-minute run

| Time | Do | Say | Judging criterion |
|---|---|---|---|
| 0:00–0:10 | Empty napkin on screen. Turn to the judge. | "Every spacecraft in history started as a sketch. We give your sketch 70 years of NASA and SpaceX experience in 60 seconds. Want to draw one?" | Decades of missions and literature |
| 0:10–0:30 | Hand over the mouse and leave the destination on **Orbit**. When they finish, click **check my napkin ✎**. | "Draw any rocket. Fins, engines, whatever you'd put on a napkin." While it reads: "Grok vision is reading your napkin into a real design: how many stages, which engines, how much propellant fits in those tanks." | Grok API (vision) |
| 0:30–0:45 | Point at the red pen as it draws, then at the verdict panel. | "Here comes the red pen. That's not an opinion. It ran the rocket equation on published engine data: Raptor, Merlin, RS-25 thrust and Isp. You have [X] of the [Y] km/s you need, so it says: [read the biggest red note, for example 'stretch +34%']." | Real datasets: engine specs and delta-v maps |
| 0:45–1:00 | 🎙 "Send it to Mars." Let the engineer answer. | "That's Grok Voice: a propulsion engineer who edits your design when you talk. It just retargeted us to Mars, and the red pen redrew for the new target." | **Grok Voice API (required)** |
| 1:00–1:15 | Click **LAUNCH**. | "Now your doodle flies. Those are your actual strokes, on real physics." When it stops: "It ran dry [X] km/s short of Mars, exactly where the math said it would." | Physics on real data |
| 1:15–1:35 | 🎙 "Add a stage." Wait for the red pen to redraw, then 🎙 "Light it up." | "So let's fix it the way SpaceX would: put a bigger booster under it." When it arrives: "That's Mars. Same napkin, two sentences later." | Grok Voice API, physics |
| 1:35–1:50 | Point at the polaroid in the verdict panel, then at the outcome image at the end of the flight. | "Grok Imagine turned the napkin into this concept render, and the outcome shot is drawn from how the flight actually went." | **Grok Imagine API (required)** |
| 1:50–2:00 | Point at the **NASA PRIOR ART** cards. | "And nothing in rocketry is really new. These are real NASA technical reports on what you just drew. [Read the top title and year.] Your napkin, 70 years of NASA and SpaceX. That's Doodle to Starship." | NASA literature no human can read all of |

**If the fix in 1:15–1:35 isn't enough,** don't improvise numbers. Try these in order:

1. 🎙 "What do you think?" Then say whatever the engineer suggests back to it.
2. 🎙 "Add another stage."
3. 🎙 "Give it fifty raptors and add a stage."

Then say "Light it up." A second failure still makes the point, because the red pen shows exactly how far short it is.

**Phrases the engineer always understands,** even in no-key mode (chain them with "and"):

- "send it to Mars" (Mars transfer) and "land it on Mars" (Mars surface)
- "add a stage" and "remove the top stage"
- "stretch the tanks forty percent" and "double the second stage tanks"
- "give it thirty three raptors" and "add three more engines"
- "carry fifty tons"
- "what do you think?"
- "light it up" and "launch"

## The 30-second version

| Time | Do | Say |
|---|---|---|
| 0:00–0:05 | Empty napkin, destination **Orbit**. | "Every spacecraft in history started as a sketch. We give yours 70 years of NASA and SpaceX experience in 60 seconds." |
| 0:05–0:12 | Click **Napkin Hopper**, then **check my napkin ✎**. | "Grok vision reads the doodle, real engine physics judges it, and the red pen marks what's wrong." |
| 0:12–0:18 | Click **LAUNCH**. | "It falls short, exactly where the math says." |
| 0:18–0:25 | 🎙 "Add a stage, then light it up." | "The red pen said add a stage. Grok Voice does it… and it makes orbit." |
| 0:25–0:30 | Point at the polaroid, then the NASA cards. | "Grok Imagine renders it, NASA's archive shows who tried it first. Doodle to Starship." |

## How the demo covers the judging criteria

| Criterion | Where judges see it |
|---|---|
| Build on space's public data, decades of missions and literature | The red-pen numbers (0:30) and the launch failing where the physics says (1:00) come from published engine specs and delta-v maps. NASA prior art (1:50) comes from the Technical Reports Server. The README lists the sources. |
| **Required:** Grok Imagine or Grok Voice API | Both are used. Grok Voice edits the design by conversation (0:45, 1:15) and Grok Imagine renders the concept and outcome (1:35). Grok vision reads the sketch too (0:10). |
| Bonus: Grok Bot for planning and collaboration | Not a demo beat. If a judge asks, describe what the team actually did. |
| Use of Cursor in the build | Not a demo beat. If a judge asks, describe what the team actually did. |

## Backup plan

| What breaks | What you'll see | What to do |
|---|---|---|
| Venue Wi-Fi | Spinners, or no polaroid | Switch to the phone hotspot. The app runs on localhost, so only the Grok and NASA calls need internet. |
| xAI API slow or down, or no key | The app falls back by itself: the geometry reader replaces Grok vision, the red pen runs on rules only, the voice dock switches to browser voice, and there is no polaroid | Keep going with the same script. At 1:35 say: "With Wi-Fi, Grok Imagine renders your napkin right here." |
| The voice dock doesn't hear you (noisy room, or offline: Chrome's speech recognition needs internet) | No transcript appears under the mic | Click the box that says "or type: add a booster and send it to Mars" and type the same lines. Enter runs them through the same command parser. |
| The judge's drawing reads badly (zero engines, odd verdict) | Strange numbers in the verdict panel | Say "Let's use one I drew earlier," click **Two-Stage Orbiter**, then **check my napkin ✎**, and continue from 0:30. |
| NASA prior art is empty | No cards under the polaroid | Skip reading a title and close with the pitch line. |
| The browser hangs | — | Switch to the spare tab (Mars Ship is already checked) and continue from 1:00. Or press ⌘R, click **Mars Ship**, then **check my napkin ✎**. |
| Everything is down | — | Play the screen recording and narrate the same script over it. |

### Offline run with the demo sketches

Use this path when there's no internet and no key. Type the 🎙 lines into the command box.

These outcomes were checked against the physics engine and the geometry reader.

1. Click **Napkin Hopper**, then **check my napkin ✎**. It reads as one stage, one big engine bell and fins, with 8.5 of the 9.4 km/s needed for orbit. The red pen writes "add a stage".
2. Click **LAUNCH**. It climbs to about 230 km, runs dry and falls back.
3. Type "add a stage", then click **LAUNCH**. It reaches orbit with 12.4 km/s.
4. Click **Mars Ship**. The **Mars** chip lights up. Click **check my napkin ✎**. The reader finds two stages, the heat shield and the landing legs. It has 12.2 of the 15.1 km/s needed to land on Mars, and the red pen writes "add a stage".
5. Click **LAUNCH**. It makes orbit and stops there.
6. Type "add a stage", then click **LAUNCH**. It lands on Mars with 15.4 km/s.
