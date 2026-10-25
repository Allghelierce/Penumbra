# Demo script: Penumbra

> An engineer sketches a vehicle idea (a napkin or whiteboard sketch) and instantly gets delta-v and thrust-to-weight, red-pen fixes computed from the physics, and NASA papers showing where it's been tried.

Pitch it as the first ten minutes of a concept review, for people who build rockets. It is a working tool, not a toy.

The live demo takes two minutes, and there is a 30-second cut and a backup plan below it. **Bold** text is UI you click. Text in quotes is what you say out loud. Lines starting with 🎙 are spoken into the voice dock: hold the button (or Space), talk, release. The numbers in brackets are what **Napkin Hopper** shows. If a judge draws their own vehicle, read the numbers off the screen instead.

## Before the judges arrive

- [ ] `XAI_API_KEY` is in `.env.local`, and `curl -s localhost:3000/api/xai-status` shows `"keyPresent":true`. Use the port the server printed.
- [ ] The render cache is warm: in dev, open `/dev/xai` and press the warm demo cache button. If you demo from `next start`, warm the cache *before* `next build`, because the production server only serves `public/` files that existed at build time.
- [ ] Chrome is full screen on the studio, and the napkin, the right-hand column and the voice dock all fit on screen (zoom out with ⌘− if not).
- [ ] Microphone permission is granted. Click anywhere once so the launch sound is allowed to play, then hold the voice button and check that you're heard.
- [ ] One full rehearsal of the run below is done in the last 10 minutes.
- [ ] The napkin is clear and the target is **Orbit**. While you wait, leave the studio idle: attract mode draws, checks and flies the samples by itself, and any click stops it.
- [ ] A second tab is open with **Napkin Hopper** loaded and checked, as a spare.
- [ ] The backup video is on the desktop, and a phone hotspot is ready.

## The two-minute run

| Time | Do | Say | Judging criterion |
|---|---|---|---|
| 0:00–0:08 | Studio on screen. | "An engineer sketches a vehicle idea and instantly gets delta-v and thrust-to-weight, red-pen fixes computed from the physics, and NASA papers showing where it's been tried. It's the first ten minutes of a concept review." | Built on decades of public data |
| 0:08–0:22 | Hand the judge the mouse ("Sketch a vehicle, any vehicle."), or click **Napkin Hopper**. Then click **Check design**. | "Grok vision reads the drawing: stages, engine bells, tank sizes. From here on, code does every number." | Grok API (vision) |
| 0:22–0:32 | Point at the numbers, then the red pen. | "[8.6] of the [9.4] km/s it needs for orbit, thrust-to-weight [1.4], from published Raptor thrust and Isp. The red pen's fix, [add a stage], was already checked against the physics before it was drawn." | Real engine data and delta-v maps |
| 0:32–0:45 | Click **Launch**. Mission Control polls. | Let the poll play, then: "Nothing flies until every console is GO. Trajectory is NO-GO, [0.8] km/s short, and it says exactly why." | **Grok Voice API (required)** |
| 0:45–0:58 | 🎙 "Add a stage." Watch the red pen re-mark, then click **Launch** again. When the poll comes back all GO, 🎙 "GO" (or click the GO button). | "Fix it the way you would in the room: by voice. The physics and the red pen re-run on every edit." | Grok Voice API |
| 0:58–1:12 | The flight plays, about 12 s. | "That's the drawing itself, flying the trajectory the physics computed, with webcast callouts." When it reaches orbit: "Orbit." | Physics on real data |
| 1:12–1:22 | Point at the recap on the end card. | "Every flight ends with a recap: what changed since the last attempt, and next steps the physics has already verified. It has [3.1] km/s to spare, so it says aim for GTO." | Iterating on real numbers |
| 1:22–1:36 | Click the **[It already has the delta-v for GTO: aim for it] · Apply & fly again →** button (or say "yes" when Mission Control offers to fly again). | "One click, and it flies again." When it arrives: "Geo transfer orbit. Same napkin, second flight." | Grok Voice API, physics |
| 1:36–1:50 | **Back to the napkin.** Point at the closest real rocket, then the NASA prior art. | "Closest real vehicle: [Starship's SN8 to SN15 hops], with its history. And these are NASA technical reports on this exact idea. [Read the top title and year.]" | Decades of missions, literature no human can read all of |
| 1:50–2:00 | Point at the concept render. | "Grok Imagine rendered the concept from the sketch. That's Penumbra: a napkin to a reviewed concept in two minutes." | **Grok Imagine API (required)** |

**If a fix isn't enough,** don't improvise numbers. Read Mission Control's NO-GO line, or 🎙 "What do you think?", and do what it says. Each NO-GO and each red note carries the edit that clears it, and you can tap a red note to apply it.

**Phrases the voice dock always understands,** even with no key. Chain them with "and":

- "add a stage" and "remove the top stage"
- "stretch the tanks forty percent" and "double the second stage tanks"
- "give it thirty three raptors" and "add ten more engines"
- "send it to Mars" (Mars transfer) and "land it on Mars" (Mars surface)
- "carry fifty tons"
- "what do you think?"
- "launch"

## The 30-second version

| Time | Do | Say |
|---|---|---|
| 0:00–0:06 | Studio on screen, target **Orbit**. | "Sketch a vehicle, get delta-v, thrust-to-weight, physics-checked fixes and NASA prior art. The first ten minutes of a concept review." |
| 0:06–0:12 | Click **Napkin Hopper**, then **Check design**. | "[8.6] of [9.4] km/s. The red pen says add a stage." |
| 0:12–0:18 | Click **Launch**. When Trajectory calls NO-GO: 🎙 "Add a stage." | "Mission Control won't fly it. Fix by voice." |
| 0:18–0:26 | Click **Launch**, then 🎙 "GO". | "All GO… and it makes orbit." |
| 0:26–0:30 | **Back to the napkin.** Point at the closest real rocket and the NASA cards. | "Closest real vehicle, and NASA's reports on the idea. Penumbra." |

## How the demo covers the judging criteria

| Criterion | Where judges see it |
|---|---|
| Build on space's public data, decades of missions and literature | Every number (0:22) comes from published engine specs and delta-v maps. The closest real vehicle comes from 17 launch vehicles (1:36), and the prior art is live from NASA's Technical Reports Server (1:36). The in-app **How it works** page shows all the tables with sources. |
| **Required:** Grok Imagine or Grok Voice API | Both are used. Grok Voice runs the Mission Control poll and the fixes (0:32 to 1:36), and Grok Imagine renders the concept (1:50). Grok vision reads the sketch too (0:08). |
| Bonus: Grok Bot for planning and collaboration | Not a demo beat. If a judge asks, describe what the team actually did. |
| Use of Cursor in the build | Not a demo beat. If a judge asks, describe what the team actually did. |

## Backup plan

| What breaks | What you'll see | What to do |
|---|---|---|
| Venue Wi-Fi | Spinners, or no renders | Switch to the phone hotspot. Cached renders still appear. Only Grok and NASA need the internet. |
| xAI API slow or down, or no key | The app falls back by itself: geometry reader, rules-only red pen, browser voice, cached renders or none | Keep the same script. If there's no render at 1:50, close on the closest real rocket instead. |
| The voice dock doesn't hear you (noisy room, or offline: Chrome's speech recognition needs internet) | No transcript appears | Type the same words into the command box under the mic. For the poll, click the GO button. |
| The judge's drawing reads badly | Strange numbers | Say "Let's use one I drew earlier," click **Napkin Hopper**, then **Check design**, and continue from 0:22. |
| A flight takes too long | — | Click **skip ›** in the corner of the launch scene. |
| NASA prior art is empty | No cards | Skip reading a title. |
| The browser hangs | — | Switch to the spare tab and continue from 0:32. |
| Everything is down | — | Play the backup video and narrate the same script over it. |

### Offline run with the samples

Use this path when there's no internet and no key. Type the 🎙 lines into the command box. These outcomes were checked against the physics engine and the geometry reader.

1. Click **Napkin Hopper**, then **Check design**. It reads as one stage with fins, [8.6] of the [9.4] km/s needed for orbit, and the red pen writes "add a stage". The closest real vehicle is the Starship SN8–SN15 hops.
2. Click **Launch**. Trajectory calls NO-GO, [0.8] km/s short.
3. Type "add a stage". The red pen re-marks the sketch with "flies!".
4. Click **Launch**, then GO. It reaches orbit with [12.5] km/s, [3.1] to spare.
5. On the end card, click **[It already has the delta-v for GTO: aim for it] · Apply & fly again →**. It reaches GTO.
6. Click **Mars Ship**. The **Mars** target lights up. Click **Check design**: two stages, a heat shield and landing legs, [12.2] of the [15.1] km/s needed to land on Mars, and the red pen writes "add a stage". Type "add a stage", launch, GO: it lands on Mars with [15.4] km/s.
