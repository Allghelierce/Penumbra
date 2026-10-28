import type { HistoricMission } from "./design";

// Real flights of the two rockets with no SpaceX history here, replayed on their template drawings.
// Well-established facts only, from Wikipedia, NASA's flight reports and the Apollo Flight Journal;
// approximate figures are marked "≈". Timeline altitudes and speeds are the published ones where a
// source gives them, and otherwise approximate: the Saturn V's from Apollo 11's published ascent,
// Electron's from a typical ascent.

const AFJ_11 = "https://apollojournals.org/afj/ap11fj/01launch.html";
const AFJ_13 = "https://apollojournals.org/afj/ap13fj/01launch_ascent.html";
const ELECTRON_LAUNCHES = { title: "List of Electron launches (Wikipedia)", url: "https://en.wikipedia.org/wiki/List_of_Electron_launches" };
const ELECTRON = { title: "Rocket Lab Electron (Wikipedia)", url: "https://en.wikipedia.org/wiki/Rocket_Lab_Electron" };

export const CLASSIC_MISSIONS: HistoricMission[] = [
  // https://en.wikipedia.org/wiki/Apollo_6
  {
    id: "apollo6",
    vehicle: "Saturn V",
    rocket: "saturn-v",
    mission: "Apollo 6 · uncrewed test flight",
    date: "1968-04-04",
    site: "Kennedy LC-39A",
    destination: "leo",
    outcome: "success",
    failure: {
      part: "tank",
      stageIndex: 1,
      label: "Two J-2s shut down",
      detail: "An igniter fuel line failed on engine 2, and a wiring error shut down healthy engine 3 with it.",
    },
    timeline: [
      { tS: 0, altitudeKm: 0, speedMps: 0, kind: "liftoff", event: "Liftoff from Pad 39A, with no crew aboard" },
      { tS: 110, altitudeKm: 30, speedMps: 1500, kind: "milestone", event: "Pogo: the first stage starts bouncing lengthwise" },
      { tS: 149, altitudeKm: 60, speedMps: 2765, kind: "stage-sep", event: "First stage separates" },
      { tS: 319, altitudeKm: 155, speedMps: 3950, kind: "milestone", event: "Second-stage engine 2 suddenly loses thrust" },
      { tS: 413, altitudeKm: 172, speedMps: 5000, kind: "milestone", event: "Engine 2 shuts down, and a wiring error shuts down engine 3 too" },
      { tS: 577, altitudeKm: 198, speedMps: 6729, kind: "stage-sep", event: "Second stage separates after burning 58 s longer on three engines" },
      { tS: 757, altitudeKm: 190, speedMps: 7842, kind: "orbit", event: "Orbit, but 173 × 360 km instead of 185 km circular" },
    ],
    lesson: "Vibration is in no payload figure: pogo shook the stack past its design limit, and an igniter line that had held in ground tests broke in vacuum.",
    rootCause:
      "Two vibrations. From T+110 to T+140 s the first stage's engine thrust and its structure fed each other's shaking (pogo), up to ±0.6 g against a 0.25 g design limit. On the second stage, an igniter fuel line on engine 2 failed: in ground tests, liquid air condensing on the cold line had damped its vibration, and in vacuum nothing did. A wiring error shut down healthy engine 3 with it, and a similar igniter-line failure likely kept the third stage from restarting in orbit.",
    whatChanged:
      "Helium was loaded into cavities in the propellant valves as a shock absorber against pogo, and the igniter lines' bellows were replaced with rigid bends.",
    returnToFlight: "Apollo 8, 21 Dec 1968: the next Saturn V carried a crew, around the Moon.",
    stats: [
      { label: "Pogo", value: "±0.6 g", meaning: "Shaking from T+110 to T+140 s, against a 0.25 g design limit." },
      { label: "Second stage", value: "3 of 5 engines", meaning: "Two J-2s out at T+413 s; the other three burned 58 s longer." },
      { label: "Orbit", value: "173 × 360 km", meaning: "Instead of 185 km circular; the third stage burned 29 s longer to get there." },
      { label: "Third-stage restart", value: "Failed", meaning: "Likely the same igniter-line failure; the planned high-orbit burn never happened." },
    ],
    sources: [
      { title: "Apollo 6 (Wikipedia)", url: "https://en.wikipedia.org/wiki/Apollo_6" },
      {
        title: "NASA MSFC, Saturn V Launch Vehicle Flight Evaluation Report AS-502, Apollo 6 Mission (MPR-SAT-FE-68-3)",
        url: "https://ibiblio.org/apollo/Documents/lvfea-AS502-Apollo6.pdf",
      },
    ],
  },
  // https://en.wikipedia.org/wiki/Apollo_11
  {
    id: "apollo11",
    vehicle: "Saturn V",
    rocket: "saturn-v",
    mission: "Apollo 11 · first Moon landing",
    date: "1969-07-16",
    site: "Kennedy LC-39A",
    destination: "moon-surface",
    outcome: "success",
    failure: null,
    timeline: [
      {
        tS: 0,
        altitudeKm: 0,
        speedMps: 0,
        kind: "liftoff",
        event: "Liftoff from Pad 39A",
        quote: { speaker: "Jack King, launch commentator", text: "Lift-off! We have a lift-off, 32 minutes past the hour. Lift-off on Apollo 11.", source: AFJ_11 },
      },
      {
        tS: 164,
        altitudeKm: 67,
        speedMps: 2760,
        kind: "stage-sep",
        event: "First stage separates",
        quote: { speaker: "Neil Armstrong", text: "Staging.", source: AFJ_11 },
      },
      { tS: 180, altitudeKm: 80, speedMps: 2835 },
      { tS: 306, altitudeKm: 152, speedMps: 3801 },
      { tS: 429, altitudeKm: 176, speedMps: 5291 },
      { tS: 462, altitudeKm: 178, speedMps: 5700, kind: "milestone", event: "Second-stage center engine off early, on purpose, against pogo" },
      {
        tS: 555,
        altitudeKm: 186,
        speedMps: 6950,
        kind: "stage-sep",
        event: "Second stage separates; the third stage lights",
        quote: { speaker: "Neil Armstrong", text: "Staging, and ignition.", source: AFJ_11 },
      },
      { tS: 600, altitudeKm: 187, speedMps: 7049 },
      { tS: 668, altitudeKm: 190, speedMps: 7697 },
      { tS: 705, altitudeKm: 190, speedMps: 7793 },
      {
        tS: 726,
        altitudeKm: 190,
        speedMps: 7793,
        kind: "orbit",
        event: "Parking orbit",
        quote: { speaker: "Bruce McCandless, CapCom", text: "Apollo 11, this is Houston. You are confirmed Go for orbit.", source: AFJ_11 },
      },
    ],
    lesson: "It went to plan thanks to fixes no payload figure shows: helium shock absorbers against pogo, and the second stage's center engine shut off early on purpose.",
    rootCause:
      "The launch went to plan. The Saturn V carried the fixes from Apollo 6, and from Apollo 10 on, the second stage's center engine shut down about 1½ minutes before the other four, because pogo tended to appear late in that stage's burn.",
    whatChanged:
      "Parking orbit 12 minutes after liftoff; after 1½ orbits the third stage relit for about 5 min 47 s and sent the crew toward the Moon.",
    returnToFlight: "Armstrong and Aldrin landed on the Moon on 20 July 1969, and all three astronauts came home on 24 July.",
    stats: [
      { label: "To orbit", value: "11 min 45 s", meaning: "A parking orbit of 185.9 × 183.2 km." },
      { label: "Center engine off", value: "T+7:42", meaning: "About 1½ min before the other four, on purpose, against pogo." },
      { label: "Moon burn", value: "≈ 5 min 47 s", meaning: "The third stage relit after 1½ orbits, which Apollo 6's could not." },
    ],
    sources: [
      { title: "Apollo 11 (Wikipedia)", url: "https://en.wikipedia.org/wiki/Apollo_11" },
      { title: "Apollo 11 Flight Journal: launch and reaching Earth orbit", url: AFJ_11 },
    ],
  },
  // https://en.wikipedia.org/wiki/Apollo_13
  {
    id: "apollo13",
    vehicle: "Saturn V",
    rocket: "saturn-v",
    mission: "Apollo 13 · planned third Moon landing",
    date: "1970-04-11",
    site: "Kennedy LC-39A",
    destination: "moon-surface",
    outcome: "success",
    failure: {
      part: "tank",
      stageIndex: 1,
      label: "Center engine out early",
      detail: "Pogo shook the second stage's center engine at ±33.7 g until it tripped a switch that shut it down, two minutes early.",
    },
    timeline: [
      {
        tS: 0,
        altitudeKm: 0,
        speedMps: 0,
        kind: "liftoff",
        event: "Liftoff from Pad 39A",
        quote: { speaker: "Jim Lovell", text: "The clock is running.", source: AFJ_13 },
      },
      { tS: 166, altitudeKm: 68, speedMps: 2760, kind: "stage-sep", event: "First stage separates at 68 km" },
      { tS: 306, altitudeKm: 152, speedMps: 3800 },
      { tS: 332, altitudeKm: 157, speedMps: 4100, kind: "milestone", event: "Pogo: the second stage's shaking center engine shuts down" },
      {
        tS: 340,
        altitudeKm: 158,
        speedMps: 4200,
        kind: "milestone",
        event: "Two minutes early",
        quote: { speaker: "Jack Swigert, on board", text: "No. That's 7:42. That's 2 minutes early.", source: AFJ_13 },
      },
      { tS: 592, altitudeKm: 186, speedMps: 6950, kind: "stage-sep", event: "Second stage separates after its other four engines burned longer" },
      { tS: 759, altitudeKm: 190, speedMps: 7790, kind: "orbit", event: "Orbit, very close to the planned 190 km circle" },
    ],
    lesson: "The payload figures assume every engine runs to plan; pogo shut the second stage's center engine two minutes early, and the others burned longer to make orbit anyway.",
    rootCause:
      "Pogo on the second stage, amplified by cavitation in the turbopump: the center engine shook on its mounting beams at ±33.7 g until it tripped a switch that shut it down. Slightly low pressure in the stage's oxygen tank set it off. The other four engines and the third stage burned longer to make up for it.",
    whatChanged:
      "From Apollo 14, the second stage carried a helium gas accumulator in the center engine's oxygen line and a backup cutoff for that engine.",
    returnToFlight:
      "The launch reached orbit; two days later an oxygen tank exploded in the service module, and the crew came home safely on 17 April 1970.",
    stats: [
      { label: "Center engine", value: "2 min early", meaning: "Shut down at T+5:32 instead of T+7:42." },
      { label: "Shaking", value: "±33.7 g", meaning: "The center engine on its mounting beams, before the switch tripped." },
      { label: "Orbit", value: "≈ 190 km", meaning: "Very close to plan, after the other engines burned longer." },
    ],
    sources: [
      { title: "Apollo 13 (Wikipedia)", url: "https://en.wikipedia.org/wiki/Apollo_13" },
      { title: "Apollo 13 Flight Journal: launch and reaching Earth orbit", url: AFJ_13 },
      { title: "Apollo 14 (Wikipedia): the pogo fixes", url: "https://en.wikipedia.org/wiki/Apollo_14" },
    ],
  },
  // https://en.wikipedia.org/wiki/List_of_Electron_launches
  {
    id: "electron-f1",
    vehicle: "Electron",
    rocket: "electron",
    mission: "Flight 1 · It's a Test",
    date: "2017-05-25",
    site: "Mahia Peninsula, New Zealand (LC-1A)",
    destination: "leo",
    outcome: "lost",
    failure: {
      part: "tank",
      stageIndex: 1,
      label: "Ground telemetry scrambled",
      detail: "A contractor's ground receiver ran without error correction, so range safety lost the rocket's data and ended a healthy flight.",
    },
    timeline: [
      { tS: 0, altitudeKm: 0, speedMps: 0, kind: "liftoff", event: "Liftoff: Electron's first flight" },
      { tS: 155, altitudeKm: 75, speedMps: 2000, kind: "stage-sep", event: "First stage separates" },
      { tS: 240, altitudeKm: 224, speedMps: 3000, kind: "engine-cutoff", event: "Range safety ends the flight at 224 km" },
    ],
    lesson: "The rocket was flying fine: a ground receiver set up without error correction scrambled its tracking data, so range safety had to end the flight.",
    rootCause:
      "A contractor had not enabled forward error correction on its ground telemetry equipment. The data was corrupted, the range safety officer lost the feed, and the flight was ended, though Electron was on its planned trajectory.",
    whatChanged: "The ground equipment was set up properly; Rocket Lab said the rocket itself needed no major changes.",
    returnToFlight: "Still Testing, 21 Jan 2018: Electron reached orbit and deployed three CubeSats.",
    stats: [
      { label: "Altitude", value: "≈ 224 km", meaning: "It reached space before the flight was ended." },
      { label: "Flight time", value: "≈ 4 min", meaning: "Range safety ended it during the second-stage burn." },
      { label: "Rocket faults", value: "0", meaning: "The fault was on the ground, in a contractor's equipment." },
    ],
    sources: [
      ELECTRON_LAUNCHES,
      ELECTRON,
      { title: "New Atlas: Electron rocket failure caused by ground error", url: "https://newatlas.com/electron-rocket-launch-failure-cause/50820" },
    ],
  },
  // https://en.wikipedia.org/wiki/List_of_Electron_launches
  {
    id: "electron-f2",
    vehicle: "Electron",
    rocket: "electron",
    mission: "Flight 2 · Still Testing",
    date: "2018-01-21",
    site: "Mahia Peninsula, New Zealand (LC-1A)",
    destination: "leo",
    outcome: "success",
    failure: null,
    timeline: [
      { tS: 0, altitudeKm: 0, speedMps: 0, kind: "liftoff", event: "Liftoff" },
      { tS: 155, altitudeKm: 75, speedMps: 2000, kind: "stage-sep", event: "First stage separates" },
      { tS: 511, altitudeKm: 400, speedMps: 7670, kind: "orbit", event: "Orbit: three CubeSats deployed" },
    ],
    lesson: "With the ground equipment fixed and no major changes to the rocket, it reached orbit: Electron's numbers were never the problem.",
    rootCause: "Flight 1's fault was on the ground. With that fixed, the same design reached orbit on its second try.",
    whatChanged: "Electron's first orbit, with Planet's Dove Pioneer, two Spire Lemur-2 CubeSats and the Humanity Star aboard.",
    returnToFlight: "Electron went on to fly commercial missions; this flight already carried customers' satellites.",
    stats: [
      { label: "Time to orbit", value: "8 min 31 s", meaning: "Orbit and satellite deployment, on Electron's second flight." },
      { label: "CubeSats", value: "3", meaning: "A Dove Pioneer for Planet and two Lemur-2s for Spire." },
      { label: "Payload", value: "≈ 13 kg", meaning: "A tiny load for a rocket built to carry hundreds of kilograms: this was still a test." },
    ],
    sources: [
      ELECTRON_LAUNCHES,
      ELECTRON,
      {
        title: "Via Satellite: Electron rocket successfully launches for Planet and Spire",
        url: "https://www.satellitetoday.com/launch/2018/01/22/electron-rocket-successfully-launches-planet-spire/",
      },
    ],
  },
  // https://en.wikipedia.org/wiki/List_of_Electron_launches
  {
    id: "electron-f13",
    vehicle: "Electron",
    rocket: "electron",
    mission: "Flight 13 · Pics Or It Didn't Happen",
    date: "2020-07-04",
    site: "Mahia Peninsula, New Zealand (LC-1A)",
    destination: "leo",
    outcome: "lost",
    failure: {
      part: "tank",
      stageIndex: 1,
      label: "Faulty electrical connection",
      detail: "A connection that passed preflight tests heated up and came apart, cutting power to the second stage's electric pumps.",
    },
    timeline: [
      { tS: 0, altitudeKm: 0, speedMps: 0, kind: "liftoff", event: "Liftoff with seven satellites" },
      { tS: 155, altitudeKm: 75, speedMps: 2000, kind: "stage-sep", event: "First stage separates" },
      { tS: 360, altitudeKm: 250, speedMps: 4500, kind: "engine-cutoff", event: "The second-stage engine loses power and stops" },
    ],
    lesson: "One bad connection that passed every preflight test cut power to the engine's electric pumps and lost seven satellites: no performance figure shows workmanship.",
    rootCause:
      "An intermittent electrical connection on the second stage, not caught in preflight testing, built up resistance and heat until the potting compound around it softened and it came apart, cutting power to the Rutherford engine's electric turbopumps.",
    whatChanged: "No change to the rocket's design; Rocket Lab changed its work instructions and quality sign-offs.",
    returnToFlight: "I Can't Believe It's Not Optical, 31 Aug 2020: Electron's return to flight.",
    stats: [
      { label: "Satellites lost", value: "7", meaning: "Canon's CE-SAT-IB, five Planet SuperDoves and In-Space Missions' Faraday 1." },
      { label: "Failure", value: "≈ T+6 min", meaning: "During the second-stage burn; the webcast cut off around six minutes in." },
      { label: "Back flying", value: "≈ 8 weeks", meaning: "Electron flew again on 31 Aug 2020." },
    ],
    sources: [
      ELECTRON_LAUNCHES,
      {
        title: "TechCrunch: Rocket Lab launch fails during rocket's second-stage burn",
        url: "https://techcrunch.com/2020/07/04/rocket-lab-launch-fails-during-rockets-second-stage-burn-causing-a-loss-of-vehicle-and-payloads/",
      },
    ],
  },
];
