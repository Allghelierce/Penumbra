# Demo script: Penumbra

> An engineer sketches a vehicle idea (a napkin or whiteboard sketch) and instantly gets delta-v and thrust-to-weight, red-pen fixes computed from the physics, and NASA papers showing where it's been tried.

Pitch it as the first ten minutes of a concept review, for people who build rockets. It is a working tool, not a toy.

The live demo takes two minutes, and there is a 30-second cut and a backup plan below it. **BOLD CAPS** is a button as it appears on screen. Text in quotes is what you say to the judges. Lines starting with 🎙 are said to Mission Control: hold Space (or the mic button), talk, release. You can also type them into the command box. The numbers in brackets are what **NAPKIN HOPPER** shows. If a judge draws their own vehicle, read the numbers off the screen instead.

## Before the judges arrive

- [ ] `XAI_API_KEY` is in `.env.local`, and `curl -s localhost:3000/api/xai-status` shows `"keyPresent":true`. Use the port the server printed.
- [ ] The render cache is warm: in dev, open `/dev/xai` and press the warm demo cache button. If you demo from `next start`, warm the cache *before* `next build`, because the production server only serves `public/` files that existed at build time.
- [ ] Chrome is full screen on the studio, and the napkin, the right-hand column and the voice dock all fit on screen (zoom out with ⌘− if not).
- [ ] Microphone permission is granted. Click anywhere once so launch audio is allowed to play, then hold Space and check that you're heard.
- [ ] One full rehearsal of the run below is done in the last 10 minutes.
- [ ] The napkin is clear and the target is **ORBIT**. While you wait, leave the studio idle: attract mode draws, checks and flies the samples by itself, and any click stops it.
- [ ] A second tab is open with **NAPKIN HOPPER** loaded and checked, as a spare.
- [ ] The backup video is on the desktop, and a phone hotspot is ready.

## The two-minute run

| Time | Do | Say | Judging criterion |
|---|---|---|---|
| 0:00–0:08 | Studio on screen. | "An engineer sketches a vehicle idea and instantly gets delta-v and thrust-to-weight, red-pen fixes computed from the physics, and NASA papers showing where it's been tried. It's the first ten minutes of a concept review." | Built on decades of public data |
| 0:08–0:20 | Hand the judge the mouse ("Sketch a vehicle, any vehicle."), or click **NAPKIN HOPPER**. Then click **CHECK DESIGN**. | "Grok vision reads the drawing: stages, engine bells, tank sizes. From here on, code does every number." | Grok API (vision) |
| 0:20–0:30 | Point at the numbers, then the red pen. | "[8.6] of the [9.4] km/s it needs for orbit, thrust-to-weight [1.4], from published Raptor thrust and Isp. The red pen's fix, [add a stage], was already checked against the physics before it was drawn." | Real engine data and delta-v maps |
| 0:30–0:42 | Click **LAUNCH**. Mission Control polls while the tiles light up. | Let it play: *"…Trajectory, NO-GO. We're [0.8] kilometers per second short of orbit. Hold, hold, hold."* Then: "Nothing flies until every console is GO, and each call carries its number." | **Grok Voice API (required)** |
| 0:42–0:52 | 🎙 "Fix it." The fix is applied, the red pen re-marks the sketch and the poll runs again, all GO. 🎙 "GO." | "Fix it the way you would in the room: by voice. The physics re-runs on every edit." | Grok Voice API |
| 0:52–1:06 | The flight plays, about 12 s, with Quindar beeps and callouts. | "That's the drawing itself, flying the trajectory the physics computed." When it reaches orbit: "Orbit." | Physics on real data |
| 1:06–1:14 | The end card shows the recap, and Mission Control offers *"[You could carry 182 t more to low Earth orbit.] Fly again?"* 🎙 "Yes." | "Every flight ends with a recap and next steps the physics has already verified. One word and it flies again." | Iterating on real numbers |
| 1:14–1:36 | The poll runs (press Esc to skip the readout), 🎙 "GO.", second flight. | When it arrives: "Orbit again, with [182] more tonnes on board. Same napkin, second flight." | Grok Voice API, physics |
| 1:36–1:50 | **Back to the napkin.** Point at the closest real rocket, then the NASA prior art. | "Closest real vehicle: [Starship's SN8 to SN15 hops], with its history. And these are NASA technical reports on this exact idea. [Read the top title and year.]" | Decades of missions, literature no human can read all of |
| 1:50–2:00 | Point at the concept render. | "Grok Imagine rendered the concept from the sketch. That's Penumbra: a napkin to a reviewed concept in two minutes." | **Grok Imagine API (required)** |

Each voice step has a button that does the same thing: **APPLY FIX** for "Fix it", **GO FOR LAUNCH** (or **GO ANYWAY** after a NO-GO) for "GO", and the end card's **APPLY & FLY AGAIN →** for "Yes". **SCRUB** (or 🎙 "Scrub") goes back to the review. Nothing ever blocks the launch.

**If a fix isn't enough,** don't improvise numbers. Read Mission Control's NO-GO line, or 🎙 "What do you think?", and do what it says. Every NO-GO and every red note carries the edit that clears it.

**Phrases that always work,** even with no key. Chain them with "and":

- In the poll: "go" / "we are go", "fix it" / "apply the fix", "scrub" / "hold"
- After a flight: "yes" flies again, "no" stands by
- Design edits: "add a stage", "stretch the tanks forty percent", "give it thirty three raptors", "carry fifty tons", "send it to Mars", "land it on Mars"
- "What do you think?"

## The 30-second version

| Time | Do | Say |
|---|---|---|
| 0:00–0:06 | Studio on screen, target **ORBIT**. | "Sketch a vehicle, get delta-v, thrust-to-weight, physics-checked fixes and NASA prior art. The first ten minutes of a concept review." |
| 0:06–0:12 | Click **NAPKIN HOPPER**, then **CHECK DESIGN**. | "[8.6] of [9.4] km/s. The red pen says add a stage." |
| 0:12–0:18 | Click **LAUNCH**. Press Esc to skip the readout. Trajectory is NO-GO. 🎙 "Fix it." | "Mission Control won't fly it. Fix by voice." |
| 0:18–0:26 | 🎙 "GO." | "All GO… and it makes orbit." |
| 0:26–0:30 | **Back to the napkin.** Point at the closest real rocket and the NASA cards. | "Closest real vehicle, and NASA's reports on the idea. Penumbra." |

## How the demo covers the judging criteria

| Criterion | Where judges see it |
|---|---|
| Build on space's public data, decades of missions and literature | Every number (0:20) comes from published engine specs and delta-v maps. The closest real vehicle comes from 17 launch vehicles (1:36), and the prior art is live from NASA's Technical Reports Server (1:36). The in-app **HOW IT WORKS** page shows every table with its sources. |
| **Required:** Grok Imagine or Grok Voice API | Both are used. Grok Voice runs Mission Control: the poll, the fix, GO and fly again (0:30 to 1:36). Grok Imagine renders the concept (1:50). Grok vision reads the sketch too (0:08). |
| Bonus: Grok Bot for planning and collaboration | Not a demo beat. If a judge asks, describe what the team actually did. |
| Use of Cursor in the build | Not a demo beat. If a judge asks, describe what the team actually did. |

## Backup plan

| What breaks | What you'll see | What to do |
|---|---|---|
| Venue Wi-Fi | Spinners, or no renders | Switch to the phone hotspot. Cached renders still appear. Only Grok and NASA need the internet. |
| xAI API slow or down, or no key | The app falls back by itself: geometry reader, rules-only red pen, browser voice with a different pitch per controller, cached renders or none | Keep the same script. If there's no render at 1:50, close on the closest real rocket instead. |
| The mic doesn't hear you (noisy room, Firefox, or offline: Chrome's speech recognition needs internet) | No transcript appears | Use the buttons: **APPLY FIX**, **GO FOR LAUNCH**, **APPLY & FLY AGAIN →**. Or type the words into the command box. |
| No sound | Silent poll | The tiles still light on a timer. Read the NO-GO line off the Trajectory tile yourself. |
| The judge's drawing reads badly | Strange numbers | Say "Let's use one I drew earlier," click **NAPKIN HOPPER**, then **CHECK DESIGN**, and continue from 0:20. |
| Running long | — | Press Esc to skip a poll readout, and **skip ›** in the corner of a flight. |
| NASA prior art is empty | No cards | Skip reading a title. |
| The browser hangs | — | Switch to the spare tab and continue from 0:30. |
| Everything is down | — | Play the backup video and narrate the same script over it. |

### Offline run with the samples

Use this path when there's no internet and no key. Type the 🎙 lines into the command box, or use the buttons. These outcomes were checked against the physics engine, the geometry reader and the poll.

1. Click **NAPKIN HOPPER**, then **CHECK DESIGN**. It reads as one stage with fins, [8.6] of the [9.4] km/s needed for orbit, and the red pen writes "add a stage". The closest real vehicle is the Starship SN8–SN15 hops.
2. Click **LAUNCH**. Trajectory calls NO-GO: "We're 0.8 kilometers per second short of orbit."
3. Type "fix it" (or click **APPLY FIX**). A stage is added, and the poll runs again, all GO.
4. Type "go" (or click **GO FOR LAUNCH**). It reaches orbit with [12.5] km/s, [3.1] to spare.
5. On the end card, click **APPLY & FLY AGAIN →** (or type "yes"), then GO. It reaches orbit again with [182] t more payload.
6. Click **MARS SHIP**. The **MARS** target lights up. Click **CHECK DESIGN**: two stages, a heat shield and landing legs, [12.2] of the [15.1] km/s needed to land on Mars. **LAUNCH** gives "Trajectory, NO-GO. We're 2.9 kilometers per second short of Mars." Then "fix it", "go": it lands on Mars with [15.4] km/s.
