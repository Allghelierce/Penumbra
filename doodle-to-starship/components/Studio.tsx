"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AttractMode from "@/components/AttractMode";
import LaunchScene, { unlockLaunchAudio } from "@/components/LaunchScene";
import NapkinCanvas from "@/components/NapkinCanvas";
import NapkinAssist from "@/components/NapkinAssist";
import NapkinRender from "@/components/NapkinRender";
import { PenumbraLockup } from "@/components/PenumbraLogo";
import PollConsole from "@/components/PollConsole";
import RedPenOverlay from "@/components/RedPenOverlay";
import SpaceBackdrop from "@/components/SpaceBackdrop";
import VerdictPanel from "@/components/VerdictPanel";
import VoiceDock from "@/components/VoiceDock";
import type { NapkinRect } from "@/components/launch/engine";
import { applyAction } from "@/lib/actions";
import { replaySketch } from "@/lib/attract";
import { DEMO_SKETCHES } from "@/lib/demo-sketches";
import type {
  Analysis,
  Attempt,
  Design,
  DesignAction,
  DestinationId,
  FlightEventKind,
  FlightTrace,
  HistoricMission,
  Recap,
  Phase,
  Poll,
  PriorArtResult,
  ReadRequest,
  ReadResponse,
  RenderRequest,
  RenderResponse,
  Review,
  ReviewRequest,
  ReviewResponse,
  SketchReading,
  Stroke,
} from "@/lib/design";
import { strokesToPng } from "@/lib/napkin";
import { buildReview } from "@/lib/redpen";
import { readFromGeometry } from "@/lib/sketch/geometry";
import { cutoutBlack } from "@/lib/cutout";
import { DEMO_CONCEPTS } from "@/lib/demo-assets";
import { COMEBACK, defectStrokes, fixNote, fixStrokes, historicReading, historicReview, historicTrace } from "@/lib/history";
import { prefetchNarration } from "@/lib/voice/tts";
import { ALL_MISSIONS } from "@/lib/mission-catalog";
import MissionFile from "@/components/MissionFile";
import MissionPicker from "@/components/MissionPicker";
import StepBar from "@/components/StepBar";
import { recap } from "@/lib/recap";
import { calloutFor, offerFor, pollRoom } from "@/lib/mission-control";
import { analyze, DESTINATIONS, simulateFlight } from "@/lib/physics";
import { flyAsRealRocket } from "@/lib/presets";
import { diagnose, sensitivities } from "@/lib/diagnosis";
import type { ReviewIssue, Trade } from "@/components/DesignReview";

const DESTINATION_CHIPS: { id: DestinationId; label: string }[] = [
  { id: "leo", label: "Orbit" },
  { id: "gto", label: "GEO" },
  { id: "moon-surface", label: "Moon" },
  { id: "mars-surface", label: "Mars" },
  { id: "europa", label: "Europa" },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // Any failure, a 429 from the rate limiter included, throws; callers fall back locally.
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return (await res.json()) as T;
}

function safeAnalyze(design: Design | null): Analysis | null {
  if (!design) return null;
  try {
    return analyze(design);
  } catch {
    return null;
  }
}

/**
 * The demo sketch these strokes are, untouched: the very same stroke objects, all of them. A sample
 * button, ?demo= and attract mode all hand over the demo's own strokes; drawing or undo breaks the match.
 */
function untouchedDemo(strokes: Stroke[]) {
  const drawn = strokes.filter((s) => s.points.length > 0);
  if (drawn.length === 0) return null;
  return (
    DEMO_SKETCHES.find((d) => {
      const own = d.strokes.filter((s) => s.points.length > 0);
      return own.length === drawn.length && own.every((s, i) => s === drawn[i]);
    }) ?? null
  );
}

/** The three flights the demo walks through, shown as big cards; every other flight is listed below them. */
const FEATURED = ["falcon1-f1", "crs7", "ift1"];
const FEATURED_MISSIONS = FEATURED.map((id) => ALL_MISSIONS.find((m) => m.id === id)).filter((m): m is HistoricMission => Boolean(m));
const MORE_FLIGHTS = ALL_MISSIONS.filter((m) => !FEATURED.includes(m.id));
/** Each family flies the same napkin sketch, so the sketch names the family. */
const FAMILIES = [
  { sketchId: "napkin-hopper", label: "Falcon 1" },
  { sketchId: "two-stage-orbiter", label: "Falcon 9 & Falcon Heavy" },
  { sketchId: "mars-ship", label: "Starship" },
];

/** NapkinRender drops its render when its reset key is an empty array: used below the Build step. */
const NO_STROKES: Stroke[] = [];

/** Flight events after which only the end card is left: the step bar moves on to Debrief. */
const LAST_EVENTS: FlightEventKind[] = ["impact", "orbit", "arrival", "breakup", "pad-failure"];

/** The flow, one step at a time, one primary button per step. */
const STEPS = ["Pick", "Sketch", "Diagnose", "Build", "Fly", "Debrief"];

/** What a read of the drawing found, in a few words: "2 stages, 9 engines, landing legs". */
function describeRead(d: Design): string {
  const engines = d.stages.reduce((n, s) => n + s.engines.reduce((k, e) => k + e.count, 0), 0);
  const bits = [`${d.stages.length} ${d.stages.length === 1 ? "stage" : "stages"}`, `${engines} ${engines === 1 ? "engine" : "engines"}`];
  for (const f of d.features.slice(0, 3)) bits.push(f.replace(/-/g, " "));
  return bits.join(", ");
}

/** The end card for a real flight: what went wrong, what changed, how it came back. */
function missionRecap(m: HistoricMission): Recap {
  return {
    headline: `${m.vehicle} ${m.mission}: ${m.outcome === "lost" ? "what went wrong" : "how it flew"}`,
    delta: m.rootCause,
    improvements: [{ text: `Fix: ${m.whatChanged}` }, { text: `Return to flight: ${m.returnToFlight}` }],
  };
}

/** Search terms for NASA's Technical Reports Server, from what the sketch contains. */
function priorArtQuery(design: Design): string {
  const destination: Record<DestinationId, string> = {
    leo: "reusable launch vehicle",
    gto: "geosynchronous transfer upper stage",
    "moon-orbit": "lunar orbit insertion",
    "moon-surface": "lunar lander",
    "mars-transfer": "Mars transfer vehicle",
    "mars-surface": "Mars entry descent landing",
    europa: "Europa mission",
  };
  const propellant: Record<string, string> = {
    methalox: "liquid methane",
    hydrolox: "liquid hydrogen",
    kerolox: "kerosene",
    solid: "solid rocket motor",
    hypergolic: "hypergolic",
  };
  const terms = [destination[design.destination], propellant[design.stages[0]?.propellant ?? ""]];
  if (design.features.includes("heat-shield")) terms.push("heat shield");
  else if (design.features.includes("landing-legs")) terms.push("landing legs");
  else if (design.stages.length === 1) terms.push("single stage to orbit");
  return terms.filter(Boolean).join(" ");
}

export default function Studio() {
  const [phase, setPhase] = useState<Phase>("draw");
  // Each launch gets a fresh LaunchScene, so a new flight never inherits the last one's trace.
  const [flightId, setFlightId] = useState(0);
  // Pick → Sketch → Diagnose → Build → Fly → Debrief.
  const [step, setStep] = useState(0);
  // The real flight being diagnosed, or null when drawing your own.
  const [mission, setMission] = useState<HistoricMission | null>(null);
  // "Fix and try again": the engineer's fix drawn in blue over the lost vehicle, before the comeback flight.
  const [fix, setFix] = useState<{ strokes: Stroke[]; note: string } | null>(null);
  // What one read of the drawing found ("Grok vision identified: …").
  const [identified, setIdentified] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [destination, setDestination] = useState<DestinationId>("leo");
  const [reading, setReading] = useState<SketchReading | null>(null);
  const [design, setDesign] = useState<Design | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewKey, setReviewKey] = useState(0);
  const [stale, setStale] = useState(false);
  const [concept, setConcept] = useState<{ url: string | null; loading: boolean }>({ url: null, loading: false });
  const [priorArt, setPriorArt] = useState<PriorArtResult[]>([]);
  const [patchUrl, setPatchUrl] = useState<string | null>(null);
  const [flight, setFlight] = useState<{
    trace: FlightTrace;
    renderUrl: string | null;
    renderState: "loading" | "done" | "none";
    napkinRect: NapkinRect | null;
  } | null>(null);
  const [narration, setNarration] = useState<string | null>(null);
  // Every launch of this sketch, oldest first: the visible record of iterating on it.
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const flightRecap = useMemo(() => (attempts.length > 0 ? recap(attempts) : null), [attempts]);
  const [error, setError] = useState<string | null>(null);

  const analysis = useMemo(() => safeAnalyze(design), [design]);
  // The design review: which issue is selected (its mark pulses on the napkin), and whether this
  // review has been looked at; Launch stays secondary until it has.
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
  const [, setSeenReview] = useState(-1);
  // A scribble that doesn't read as a vehicle gets coaching, not physics.
  const unreadable = useMemo(
    () => (reading && (reading.confidence ?? 1) < 0.5 ? { problem: reading.problem ?? "These strokes don't form a vehicle outline." } : null),
    [reading],
  );
  const issues = useMemo<ReviewIssue[]>(() => {
    if (!design || !analysis || unreadable || !review || mission) return [];
    try {
      return diagnose(design, analysis, reading ?? undefined).map((issue) => ({ ...issue, id: `issue-${issue.n}` }));
    } catch {
      return [];
    }
  }, [design, analysis, reading, review, unreadable, mission]);
  const trades = useMemo<Trade[]>(() => {
    if (!design || !analysis || unreadable) return [];
    try {
      return sensitivities(design).map((t) => ({ label: t.label, text: t.value }));
    } catch {
      return [];
    }
  }, [design, analysis, unreadable]);
  const markNumbers = (review?.marks ?? []).map((_, i) => {
    const n = issues.findIndex((issue) => issue.markIndex === i);
    return n >= 0 ? n + 1 : null;
  });
  const selectedMark = selectedIssue !== null ? (issues[selectedIssue]?.markIndex ?? null) : null;
  function selectIssue(index: number | null) {
    setSelectedIssue(index);
    if (index !== null) setSeenReview(reviewKey);
  }
  // The flight the launch will show, previewed in the report before anyone presses Launch.
  const predicted = useMemo(() => {
    if (!design || !analysis) return null;
    try {
      return simulateFlight(design, analysis);
    } catch {
      return null;
    }
  }, [design, analysis]);

  // Latest values for callbacks that outlive a render (voice tool calls, async responses).
  const latest = useRef({ reading, design, strokes, destination, review, mission });
  useEffect(() => {
    latest.current = { reading, design, strokes, destination, review, mission };
  }, [reading, design, strokes, destination, review, mission]);
  // Mission control: the GO/NO-GO poll before launch, and the spoken offer after a flight.
  const [poll, setPoll] = useState<Poll | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [offer, setOffer] = useState<{ line: string; fix?: DesignAction } | null>(null);
  // One counter per async stream: a response only lands if no newer request (or Clear) superseded it.
  const runs = useRef({ check: 0, review: 0, concept: 0, patch: 0, priorArt: 0, launch: 0 });
  const checking = useRef(false);
  // The sketch the current concept and patch renders came from, so re-checking it doesn't pay for new ones.
  const rendered = useRef<{ strokes: Stroke[]; destination: DestinationId } | null>(null);
  // Wraps the napkin so the launch can lift off from exactly where the doodle sits on screen.
  const napkinArea = useRef<HTMLDivElement>(null);

  const requestReview = useCallback(async (nextReading: SketchReading, nextAnalysis: Analysis) => {
    const id = ++runs.current.review;
    let next: Review;
    try {
      const body: ReviewRequest = { reading: nextReading, analysis: nextAnalysis };
      ({ review: next } = await postJson<ReviewResponse>("/api/review", body));
    } catch {
      // The rules-based red pen runs locally, so a failed or rate-limited request still gets a review.
      try {
        next = buildReview(nextReading, nextAnalysis);
      } catch {
        if (id === runs.current.review) setError("The red-pen review didn't load. Press Check again.");
        return;
      }
    }
    if (id !== runs.current.review) return;
    setReview(next);
    setReviewKey((k) => k + 1);
    setNarration(next.summary);
  }, []);

  const fetchConcept = useCallback(async (nextDesign: Design, nextAnalysis: Analysis, sketch: string) => {
    const id = ++runs.current.concept;
    setConcept({ url: null, loading: true });
    try {
      const body: RenderRequest = { design: nextDesign, analysis: nextAnalysis, kind: "concept", sketch };
      const { url } = await postJson<RenderResponse>("/api/render", body);
      if (id === runs.current.concept) {
        setConcept({ url, loading: false });
        // Cut the vehicle out now, so the launch can fly the render without a pop.
        if (url) void cutoutBlack(url);
      }
    } catch {
      if (id === runs.current.concept) setConcept({ url: null, loading: false });
    }
  }, []);

  const fetchPatch = useCallback(async (nextDesign: Design, nextAnalysis: Analysis) => {
    const id = ++runs.current.patch;
    try {
      const body: RenderRequest = { design: nextDesign, analysis: nextAnalysis, kind: "patch" };
      const { url } = await postJson<RenderResponse>("/api/render", body);
      if (id === runs.current.patch) setPatchUrl(url);
    } catch {
      if (id === runs.current.patch) setPatchUrl(null);
    }
  }, []);

  const fetchPriorArt = useCallback(async (nextDesign: Design) => {
    const id = ++runs.current.priorArt;
    try {
      const res = await fetch(`/api/prior-art?q=${encodeURIComponent(priorArtQuery(nextDesign))}&limit=3`);
      const { results } = (await res.json()) as { results?: PriorArtResult[] };
      if (id === runs.current.priorArt) setPriorArt(results ?? []);
    } catch {
      if (id === runs.current.priorArt) setPriorArt([]);
    }
  }, []);

  async function check() {
    // A ref, not `phase`: a click, ?check=1 and attract mode can all ask within one render.
    if (strokes.length === 0 || checking.current || replaying) return;
    checking.current = true;
    const id = ++runs.current.check;
    setPhase("reading");
    setError(null);
    setReview(null);
    try {
      const started = Date.now();
      const image = strokesToPng(strokes);
      let read: SketchReading;
      try {
        const body: ReadRequest = { image, strokes, destination: latest.current.destination };
        ({ reading: read } = await postJson<ReadResponse>("/api/read", body));
      } catch {
        // Read the outline locally when the route fails or is rate-limited, so the demo never dead-ends.
        read = readFromGeometry(strokes, latest.current.destination);
      }
      // Let the scanner sweep at least once so the read feels deliberate.
      await wait(Math.max(0, 1300 - (Date.now() - started)));
      if (id !== runs.current.check) return;
      // The target may have changed while reading; the latest pick wins.
      const target = latest.current.destination;
      const nextDesign: Design = flyAsRealRocket({ ...read.design, destination: target });
      const nextReading: SketchReading = { ...read, design: nextDesign };
      const nextAnalysis = safeAnalyze(nextDesign);
      latest.current = { ...latest.current, reading: nextReading, design: nextDesign };
      setReading(nextReading);
      setDesign(nextDesign);
      setStale(false);
      setPhase("reviewed");
      if (!nextAnalysis) {
        setError("The physics engine couldn't size this design. Redraw the tanks and engines more clearly, then check again.");
        return;
      }
      // An untouched demo sketch has its concept pinned: free, instant and offline, no /api/render call.
      const demo = untouchedDemo(strokes);
      const pinned = demo ? DEMO_CONCEPTS[demo.id] : undefined;
      if (pinned) {
        runs.current.concept++; // anything still in flight is for another sketch
        setConcept({ url: pinned, loading: false });
        void cutoutBlack(pinned);
      }
      const same = rendered.current?.strokes === strokes && rendered.current.destination === target;
      if (!same) {
        rendered.current = { strokes, destination: target };
        if (!pinned) void fetchConcept(nextDesign, nextAnalysis, image);
        void fetchPatch(nextDesign, nextAnalysis);
      }
      void fetchPriorArt(nextDesign);
      await requestReview(nextReading, nextAnalysis);
    } catch {
      if (id === runs.current.check) {
        setError("The sketch couldn't be read. Press Check design to try again.");
        setPhase("draw");
      }
    } finally {
      if (id === runs.current.check) checking.current = false;
    }
  }

  const startLaunch = useCallback(() => {
    if (checking.current) return;
    // Inside the click or key press that launched, so Safari lets the launch audio play.
    unlockLaunchAudio();
    const { design: current, reading: read, strokes: drawn } = latest.current;
    const currentAnalysis = safeAnalyze(current);
    if (!current || !read || !currentAnalysis) return;
    const box = napkinArea.current?.querySelector(".napkin")?.getBoundingClientRect();
    const napkinRect = box ? { left: box.left, top: box.top, width: box.width, height: box.height } : null;
    const flown = latest.current.mission;
    const trace = flown ? historicTrace(flown) : simulateFlight(current, currentAnalysis);
    prefetchNarration(trace.events.map((e) => calloutFor(e, current, trace)));
    setFlight({ trace, renderUrl: null, renderState: flown ? "none" : "loading", napkinRect });
    setFlightId((n) => n + 1);
    setStep(4);
    setAttempts((prev) => [...prev, { n: prev.length + 1, design: current, analysis: currentAnalysis, maxAltitudeKm: trace.maxAltitudeKm }]);
    setPhase("launch");
    if (flown) return; // a real flight already has its photo; no outcome render to pay for
    const body: RenderRequest = {
      design: current,
      analysis: currentAnalysis,
      kind: "outcome",
      sketch: strokesToPng(drawn),
    };
    const id = ++runs.current.launch;
    postJson<RenderResponse>("/api/render", body)
      .then(({ url }) => {
        if (id === runs.current.launch) setFlight((f) => (f ? { ...f, renderUrl: url, renderState: url ? "done" : "none" } : f));
      })
      .catch(() => {
        if (id === runs.current.launch) setFlight((f) => (f ? { ...f, renderState: "none" } : f));
      });
  }, []);

  // The pending "Fix it & fly again" comeback launch; anything that moves the flow on cancels it.
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // handleAction is memoized; it reaches the latest openPoll (defined below) through this ref.
  const openPollRef = useRef<() => void>(() => {});
  // The Cmd+Z listener is registered once; it reaches the latest undo (defined below) through this ref.
  const undoRef = useRef<() => void>(() => {});
  // Esc on the Sketch step goes back to Pick; the listener reaches the latest goBack through this ref.
  const escRef = useRef<() => void>(() => {});

  /** Voice commands and destination chips both edit the design, then the red pen re-checks it. */
  const handleAction = useCallback(
    (action: DesignAction) => {
      if (action.type === "launch") {
        openPollRef.current();
        return;
      }
      setOffer(null);
      const { design: current, reading: read } = latest.current;
      if (action.type === "set-destination") setDestination(action.destination);
      if (!current || !read) return;
      const nextDesign = action.type === "review" ? current : applyAction(current, action);
      const nextReading = { ...read, design: nextDesign };
      const nextAnalysis = safeAnalyze(nextDesign);
      latest.current = { ...latest.current, reading: nextReading, design: nextDesign };
      setDesign(nextDesign);
      setReading(nextReading);
      if (nextAnalysis) void requestReview(nextReading, nextAnalysis);
    },
    [requestReview],
  );

  /** Launch goes through mission control: every controller reports GO or NO-GO first. */
  function openPoll() {
    if (checking.current) return; // the read in flight would replace the design under the poll
    const read0 = latest.current.reading;
    if (read0 && (read0.confidence ?? 1) < 0.5) return; // nothing to fly: the sketch isn't a vehicle yet
    const { design: current, reading: read, review: latestReview } = latest.current;
    const currentAnalysis = safeAnalyze(current);
    if (!current || !read || !currentAnalysis) return;
    unlockLaunchAudio(); // inside the click, for Safari
    setOffer(null);
    setPoll(pollRoom(current, currentAnalysis, latestReview, read.parts));
    setRevealed(0);
    setPhase("poll");
  }
  useEffect(() => {
    openPollRef.current = openPoll;
  });

  function goForLaunch() {
    setPoll(null);
    startLaunch();
  }
  function scrub() {
    setPoll(null);
    setPhase("reviewed");
  }
  function fixAndRepoll(fix: DesignAction) {
    handleAction(fix);
    // handleAction has already moved latest.current to the fixed design.
    openPoll();
  }
  function pollReply(reply: "go" | "scrub" | "fix") {
    if (reply === "go") goForLaunch();
    else if (reply === "scrub") scrub();
    else {
      const fix = poll?.calls.find((c) => !c.go && c.fix)?.fix;
      if (fix) fixAndRepoll(fix);
    }
  }

  /** From the end card or the spoken offer: apply the fix, let the red pen re-mark the napkin, then poll again. */
  const relaunch = useRef<ReturnType<typeof setTimeout> | null>(null);
  function improveAndFly(fix?: DesignAction) {
    unlockLaunchAudio(); // still inside the click, for Safari
    setFlight(null);
    setPhase("reviewed");
    if (fix) handleAction(fix);
    setOffer(null);
    if (relaunch.current) clearTimeout(relaunch.current);
    relaunch.current = setTimeout(() => openPollRef.current(), 1200);
  }

  function changeStrokes(next: Stroke[]) {
    setStrokes(next);
    if (latest.current.reading) setStale(true);
    if (mission) setMission(null);
    if (step > 1) setStep(1);
  }

  // Aborts an in-progress demo-sketch replay when something else takes over the napkin.
  const replay = useRef<AbortController | null>(null);
  // True while a sample is still drawing itself; checking then would read half a sketch.
  const [replaying, setReplaying] = useState(false);

  function clearAll() {
    replay.current?.abort();
    if (retryTimer.current) clearTimeout(retryTimer.current);
    // Anything still in flight belongs to the old sketch.
    for (const key of Object.keys(runs.current) as (keyof typeof runs.current)[]) runs.current[key]++;
    checking.current = false;
    rendered.current = null;
    setAttempts([]);
    setPoll(null);
    setOffer(null);
    setStrokes([]);
    setReading(null);
    setDesign(null);
    setReview(null);
    setStale(false);
    setConcept({ url: null, loading: false });
    setPriorArt([]);
    setPatchUrl(null);
    setError(null);
    setIdentified(null);
    setFix(null);
    setPhase("draw");
  }

  /** Undo the last stroke; like any edit, it marks an existing review as out of date. */
  function undo() {
    const drawn = latest.current.strokes;
    if (drawn.length > 0) changeStrokes(drawn.slice(0, -1));
  }
  useEffect(() => {
    undoRef.current = undo;
  });

  function loadDemo(id: string) {
    const sketch = DEMO_SKETCHES.find((s) => s.id === id);
    if (!sketch) return;
    clearAll();
    setDestination(sketch.destination);
    const controller = new AbortController();
    replay.current = controller;
    setReplaying(true);
    void replaySketch(sketch.strokes, setStrokes, { signal: controller.signal }).finally(() => {
      if (replay.current === controller) setReplaying(false);
    });
  }

  // ---- The flow.
  function pickMission(m: HistoricMission) {
    const sketch = DEMO_SKETCHES.find((d) => d.id === m.sketchId);
    if (!sketch) return;
    clearAll();
    setMission(m);
    setDestination(m.destination);
    setStep(1);
    // A lost flight's flaw (a leaking fitting, a cracked strut, broken bells) draws in last, so it's on the
    // napkin before Diagnose circles it. The part boxes come from the local historic reading; no API.
    const flaw = defectStrokes(m, historicReading(m));
    const controller = new AbortController();
    replay.current = controller;
    setReplaying(true);
    void replaySketch([...sketch.strokes, ...flaw], setStrokes, { signal: controller.signal }).finally(() => {
      if (replay.current === controller) setReplaying(false);
    });
  }

  function drawOwn() {
    clearAll();
    setMission(null);
    setStep(1);
  }

  function anotherMission() {
    clearAll();
    setMission(null);
    setStep(0);
  }

  /** Diagnose a real flight: one read of the drawing, then the red pen marks what actually failed. */
  async function diagnoseMission() {
    const m = mission;
    if (!m || replaying) return;
    const id = ++runs.current.check;
    setStep(2);
    setError(null);
    setPhase("reading");
    const started = Date.now();
    let found: string | null = null;
    try {
      const body: ReadRequest = { image: strokesToPng(strokes), strokes, destination: m.destination };
      const res = await postJson<ReadResponse>("/api/read", body);
      found = `${res.source === "grok" ? "Grok vision" : "The geometry reader"} identified: ${describeRead(res.reading.design)}.`;
    } catch {
      found = null;
    }
    // Let the laser sweep at least once.
    await wait(Math.max(0, 1500 - (Date.now() - started)));
    if (id !== runs.current.check) return;
    const read = historicReading(m);
    const marks = historicReview(m, read);
    latest.current = { ...latest.current, reading: read, design: read.design };
    setReading(read);
    setDesign(read.design);
    setReview(marks);
    setReviewKey((k) => k + 1);
    setStale(false);
    setIdentified(found);
    setPhase("reviewed");
    setNarration(marks.summary);
  }

  /** After a lost flight: draw the fix on the same vehicle, then fly the mission where that fix flew. */
  function fixAndRetry() {
    const lostFlight = latest.current.mission;
    const read = latest.current.reading;
    const comeback = lostFlight ? ALL_MISSIONS.find((x) => x.id === COMEBACK[lostFlight.id]) : undefined;
    if (!lostFlight || !read || !comeback) return;
    unlockLaunchAudio(); // still inside the click, for Safari
    setFlight(null);
    setPhase("reviewed");
    setStep(3);
    setFix({ strokes: fixStrokes(lostFlight, read), note: fixNote(lostFlight) });
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      const comebackRead = historicReading(comeback);
      latest.current = { ...latest.current, mission: comeback, reading: comebackRead, design: comebackRead.design };
      setMission(comeback);
      setReading(comebackRead);
      setDesign(comebackRead.design);
      startLaunch();
    }, 2600);
  }

  /** One step back. Sketch → Pick resets the napkin (clearAll aborts any replay); Diagnose → Sketch drops the markup. */
  function goBack() {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setFix(null);
    if (step <= 1) {
      anotherMission();
      return;
    }
    if (step === 2) {
      runs.current.check++; // a diagnosis still in flight lands nowhere
      checking.current = false;
      setReview(null);
      setReading(null);
      setDesign(null);
      setIdentified(null);
      setPhase("draw");
      setStep(1);
      return;
    }
    setStep(step >= 4 ? 3 : step - 1);
  }
  useEffect(() => {
    escRef.current = () => {
      if (step === 1) goBack();
    };
  });

  /** Jump back to a finished step from the step bar: the same moves as Back, as many as it takes. */
  function jumpTo(target: number) {
    if (target >= step || phase === "launch") return; // never mid-flight
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (target === 0) {
      anotherMission();
      return;
    }
    if (target === 4) {
      startLaunch(); // "Fly" from the debrief means fly it again
      return;
    }
    if (target === 1) {
      setFix(null);
      runs.current.check++;
      checking.current = false;
      setReview(null);
      setReading(null);
      setDesign(null);
      setIdentified(null);
      setPhase("draw");
      setStep(1);
      return;
    }
    setFix(null);
    setStep(target);
  }

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  /** Diagnose your own drawing: the full read and red-pen review. */
  async function diagnoseOwn() {
    setStep(2);
    await check();
    if (!latest.current.reading) setStep(1);
  }

  /** Build: the clean profile draws on, then the rendered vehicle. */
  function build() {
    setStep(3);
    if (mission) {
      const url = DEMO_CONCEPTS[mission.sketchId] ?? null;
      runs.current.concept++;
      setConcept({ url, loading: false });
      if (url) void cutoutBlack(url);
    }
  }

  // A bump of this counter asks for a check of whatever is on the napkin in that render.
  const [checkRequest, setCheckRequest] = useState(0);
  const autoLaunch = useRef(false);
  const [attract, setAttract] = useState(false);

  // URL switches for rehearsals and screenshots: ?demo=<id> loads a demo sketch, &check=1 reads
  // it, &launch=1 then launches it. ?attract=1 is booth mode: after 45 s idle the napkin draws,
  // checks and launches itself.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from the URL after hydration */
    setAttract(params.get("attract") === "1");
    const sketch = DEMO_SKETCHES.find((s) => s.id === params.get("demo"));
    if (!sketch) return;
    setStep(1);
    setStrokes(sketch.strokes);
    setDestination(sketch.destination);
    if (params.get("check") === "1") setCheckRequest((n) => n + 1);
    /* eslint-enable react-hooks/set-state-in-effect */
    autoLaunch.current = params.get("launch") === "1";
  }, []);

  useEffect(() => {
    if (checkRequest === 0) return;
    void check().then(() => {
      if (autoLaunch.current) setTimeout(startLaunch, 2500);
    });
    // One check per request, using the strokes from the render that carried it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkRequest]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        undoRef.current();
      } else if (e.key === "Escape") {
        escRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const reviewed = phase === "reviewed" && reading && design;
  // A real flight shows its full red-pen markup in Diagnose; from Build on, only the failed part stays lit.
  const highlightOnly = Boolean(mission) && step >= 3;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-black text-white">
      <header className="relative z-30 flex h-14 shrink-0 items-center gap-6 bg-black px-6">
        <button type="button" onClick={anotherMission} aria-label="Penumbra: back to the missions">
          <PenumbraLockup />
        </button>
        {step > 0 && (
          <span className="border-l border-rule pl-5 font-space text-[12px] font-semibold uppercase tracking-[0.2em] text-haze">
            {mission ? "Real missions" : "Your design"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!mission && step > 0 && step < 4 && (
            <Dropdown label={`Target: ${DESTINATION_CHIPS.find((c) => c.id === destination)?.label ?? DESTINATIONS[destination].name}`}>
              {(close) =>
                DESTINATION_CHIPS.map((chip) => (
                  <MenuItem
                    key={chip.id}
                    active={destination === chip.id}
                    onClick={() => {
                      if (design) handleAction({ type: "set-destination", destination: chip.id });
                      else setDestination(chip.id);
                      close();
                    }}
                  >
                    {DESTINATIONS[chip.id].name}
                  </MenuItem>
                ))
              }
            </Dropdown>
          )}
        </div>
      </header>
      <StepBar
        steps={STEPS}
        current={step}
        onStep={jumpTo}
        purposes={[
          "Choose a real rocket",
          mission ? "The engineer's napkin" : "Draw your spacecraft",
          !mission ? "Red pen reviews your design" : mission.outcome === "lost" ? "Red pen finds what failed" : "See what made it work",
          "See it real",
          mission ? "Relive the flight" : "Fly your design",
          mission ? (mission.outcome === "lost" ? "What SpaceX learned" : "How it came together") : "How it flew",
        ]}
      />

      {step === 0 ? (
        // The stage clips (space-stage hides overflow); the list scrolls in its own layer above the backdrop.
        <main className="space-stage relative min-h-0 flex-1">
          <SpaceBackdrop />
          <div className="absolute inset-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1200px] px-10 py-10">
            <h2 className="font-space text-[26px] font-semibold uppercase tracking-[0.1em] text-white">Pick a real flight to diagnose</h2>
            <p className="mb-6 mt-1 text-[15px] text-haze">Each rocket is drawn on a napkin. Find what broke, watch it get built, then fly what actually happened.</p>
            <MissionPicker missions={FEATURED_MISSIONS} onPick={pickMission} onDrawOwn={drawOwn} />
            {MORE_FLIGHTS.length > 0 && (
              <div className="mt-10 pb-6">
                <h3 className="font-space text-[13px] font-semibold uppercase tracking-[0.22em] text-white/75">More real flights</h3>
                <div className="mt-4 grid grid-cols-3 gap-6">
                  {FAMILIES.map((family) => {
                    const flights = MORE_FLIGHTS.filter((m) => m.sketchId === family.sketchId);
                    if (flights.length === 0) return null;
                    return (
                      <div key={family.sketchId}>
                        <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-haze">{family.label}</p>
                        <ul className="space-y-2">
                          {flights.map((m) => (
                            <li key={m.id}>
                              <button
                                type="button"
                                onClick={() => pickMission(m)}
                                className="flex w-full items-center gap-3 border border-rule bg-black/70 px-3 py-2.5 text-left transition-colors hover:border-white/60"
                              >
                                <span
                                  className={`shrink-0 border px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.16em] ${
                                    m.outcome === "lost" ? "border-nogo text-nogo" : "border-go-signal text-go-signal"
                                  }`}
                                >
                                  {m.outcome === "lost" ? "Lost" : "Success"}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-semibold text-white">
                                    {m.vehicle} · {m.mission}
                                  </span>
                                  <span className="block truncate text-[12px] text-haze">
                                    {m.date.slice(0, 4)} · {m.failure?.label ?? m.stats[0]?.meaning ?? ""}
                                  </span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          </div>
        </main>
      ) : (
        <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_460px]">
          <section className="space-stage flex min-h-0 min-w-0 flex-col items-center gap-4 px-8 pb-4 pt-6">
            <SpaceBackdrop />
            <div ref={napkinArea} className="flex min-h-0 w-full flex-1 justify-center">
              <NapkinCanvas
                strokes={strokes}
                onChange={changeStrokes}
                disabled={phase === "reading" || Boolean(mission)}
                hint={
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                    <p className="font-space text-[20px] font-semibold uppercase tracking-[0.14em] text-white/85">Draw your spacecraft here</p>
                    <p className="text-[14px] text-haze">Chalk on the night sky. A rocket, a lander, a Mars ship. Rough is fine.</p>
                  </div>
                }
              >
                <NapkinRender
                  reading={step >= 3 && reviewed && !unreadable ? reading : null}
                  url={step >= 3 ? concept.url : null}
                  loading={step >= 3 && concept.loading}
                  resetKey={step >= 3 ? strokes : NO_STROKES}
                  sticker={
                    !mission && patchUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={patchUrl}
                        alt="Grok Imagine mission patch"
                        className="sticker-in absolute right-[5%] top-[3%] aspect-square w-[24%] rounded-full object-cover shadow-[0_6px_14px_-4px_rgba(0,0,0,0.45)]"
                      />
                    ) : null
                  }
                >
                  {/* From Build on, a real flight keeps only the failed part's outline: a red highlight over the photo. */}
                  <div className={`absolute inset-0 transition-opacity duration-300 ${stale ? "opacity-30" : ""} ${highlightOnly ? "failed-highlight" : ""}`}>
                    <RedPenOverlay
                      parts={reviewed && !highlightOnly ? reading.parts : []}
                      marks={reviewed ? (highlightOnly ? (review?.marks ?? []).filter((m) => m.kind === "outline") : (review?.marks ?? [])) : []}
                      playKey={String(reviewKey)}
                      scanning={phase === "reading"}
                      numbers={highlightOnly ? [] : markNumbers}
                      hidden={(review?.marks ?? []).map((_, i) => issues.some((issue) => issue.markIndex === i && issue.severity === "ok"))}
                      selectedMark={selectedMark}
                      onSelectMark={(markIndex) => selectIssue(issues.findIndex((issue) => issue.markIndex === markIndex))}
                      problem={reviewed && unreadable ? unreadable.problem : null}
                    />
                  </div>
                </NapkinRender>
                {!mission && <NapkinAssist strokes={strokes} destination={destination} onKeep={changeStrokes} active={phase === "draw"} />}
                {fix && <FixOverlay strokes={fix.strokes} note={fix.note} />}
              </NapkinCanvas>
            </div>

            {phase === "poll" && poll ? (
              <PollConsole poll={poll} revealed={revealed} onGo={goForLaunch} onScrub={scrub} onFix={fixAndRepoll} />
            ) : (
              <div className="flex w-full items-center justify-center gap-2">
                {!mission && step <= 3 && (
                  <>
                    <button
                      type="button"
                      onClick={undo}
                      disabled={strokes.length === 0}
                      className="h-11 px-2 text-[11px] uppercase tracking-[0.18em] text-haze transition-colors hover:text-white disabled:opacity-40"
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      onClick={clearAll}
                      disabled={strokes.length === 0}
                      className="h-11 px-2 text-[11px] uppercase tracking-[0.18em] text-haze transition-colors hover:text-white disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </>
                )}
                {step >= 1 && step !== 4 && (
                  <button
                    type="button"
                    onClick={goBack}
                    className="h-11 px-3 text-[11px] uppercase tracking-[0.18em] text-haze transition-colors hover:text-white"
                  >
                    ← Back
                  </button>
                )}
                {step === 1 && (
                  <button
                    type="button"
                    onClick={mission ? diagnoseMission : diagnoseOwn}
                    disabled={replaying || strokes.length === 0 || phase === "reading"}
                    className="btn-solid h-11 px-8 text-[12px]"
                  >
                    Diagnose →
                  </button>
                )}
                {step === 2 && (
                  <button
                    type="button"
                    onClick={build}
                    disabled={phase !== "reviewed" || !reading || Boolean(unreadable)}
                    className="btn-solid h-11 px-8 text-[12px]"
                  >
                    {phase === "reading" ? "Diagnosing…" : "Build it →"}
                  </button>
                )}
                {step === 3 && (
                  <button type="button" onClick={startLaunch} disabled={!reviewed || !analysis || fix !== null} className="btn-solid h-11 px-8 text-[12px]">
                    Fly it →
                  </button>
                )}
                {step >= 4 && (
                  <button type="button" onClick={anotherMission} className="btn-solid h-11 px-8 text-[12px]">
                    Try another mission
                  </button>
                )}
              </div>
            )}
            <p className={`h-5 text-[13px] ${error ? "text-nogo" : "text-haze"}`} aria-live="polite">
              {error ?? (!mission && reviewed && issues.some((issue) => issue.severity !== "ok") ? "Redraw to fix the numbered issues, then diagnose again." : "")}
            </p>
          </section>

          {/* Bottom padding keeps the last row clear of the narrator's mute toggle (fixed bottom-right). */}
          <section className="min-h-0 overflow-y-auto border-l border-rule bg-black pb-14">
            {mission ? (
              step >= 4 ? (
                <MissionFile mission={mission} onLaunch={startLaunch} canLaunch={Boolean(reviewed && analysis)} />
              ) : (
                <MissionBrief mission={mission} step={step} identified={identified} />
              )
            ) : (
              <VerdictPanel
                issues={issues}
                trades={trades}
                selectedIssue={selectedIssue}
                onSelectIssue={selectIssue}
                unreadable={unreadable}
                samples={DEMO_SKETCHES.map((d) => ({ id: d.id, title: d.title }))}
                onSample={loadDemo}
                trace={predicted}
                onLaunch={startLaunch}
                canLaunch={Boolean(reviewed && analysis)}
                attempts={attempts}
                recap={flightRecap}
                phase={phase}
                design={design}
                analysis={analysis}
                review={review}
                conceptUrl={concept.url}
                conceptLoading={concept.loading}
                priorArt={priorArt}
              />
            )}
          </section>
        </main>
      )}

      <AttractMode
        enabled={attract}
        phase={phase}
        onStrokes={(next) => {
          if (next.length === 0) clearAll();
          else {
            setStrokes(next);
            setStep((s) => (s === 0 ? 1 : s));
          }
        }}
        onDestination={setDestination}
        onCheck={() => setCheckRequest((n) => n + 1)}
        onLaunch={startLaunch}
      />

      {/* The narrator speaks callouts and replay dialog; it has only a small mute toggle, no bar. */}
      <VoiceDock
        variant="narrator"
        phase={phase}
        design={design}
        analysis={analysis}
        review={review}
        narration={narration}
        onAction={handleAction}
        poll={phase === "poll" ? poll : null}
        onPollReveal={setRevealed}
        onPollReply={pollReply}
        offer={offer}
        onImprove={improveAndFly}
      />

      {phase === "launch" && flight && reading && design && analysis && (
        <LaunchScene
          key={flightId}
          strokes={strokes}
          reading={{ ...reading, design }}
          analysis={analysis}
          trace={flight.trace}
          renderUrl={flight.renderUrl}
          renderState={flight.renderState}
          vehicleImageUrl={concept.url}
          napkinRect={flight.napkinRect}
          onEvent={(event) => {
            setNarration(calloutFor(event, design, flight.trace));
            if (LAST_EVENTS.includes(event.kind)) setStep(5);
          }}
          onDone={() => {
            setFlight(null);
            setPhase("reviewed");
            // A real flight's end card is its debrief, and its one button is "Try another mission".
            if (mission) {
              anotherMission();
              return;
            }
            setStep(5);
            if (flightRecap) setOffer(offerFor(flightRecap));
          }}
          mission={mission ?? undefined}
          onFixRetry={mission && mission.outcome === "lost" && COMEBACK[mission.id] && ALL_MISSIONS.some((x) => x.id === COMEBACK[mission.id]) ? fixAndRetry : undefined}
          recap={mission ? missionRecap(mission) : flightRecap}
          onImprove={mission ? undefined : improveAndFly}
        />
      )}
    </div>
  );
}

/** The fix, drawn on the napkin in blue technical pen, with the red pen's note beside it. */
function FixOverlay({ strokes, note }: { strokes: Stroke[]; note: string }) {
  const pts = strokes.flatMap((s) => s.points);
  if (pts.length === 0) return null;
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const right = maxX < 0.72;
  return (
    <svg viewBox="0 0 300 400" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      {strokes.map((st, i) => (
        <polyline
          key={i}
          className="pen-draw"
          style={{ animationDelay: `${0.2 + i * 0.12}s`, animationDuration: "0.5s" }}
          pathLength={1}
          points={st.points.map(([x, y]) => `${x * 300},${y * 400}`).join(" ")}
          fill="none"
          stroke="#5aaeff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <text
        className="pen-note font-hand"
        style={{ animationDelay: `${0.4 + strokes.length * 0.12}s` }}
        x={right ? maxX * 300 + 8 : minX * 300 - 8}
        y={Math.max(14, minY * 400 + 10)}
        textAnchor={right ? "start" : "end"}
        fontSize="13"
        fontWeight="700"
        fill="var(--redpen)"
      >
        {note}
      </text>
    </svg>
  );
}

/** The side panel while a real flight is diagnosed: what it is, then only what failed and the numbers that matter. */
function MissionBrief({ mission, step, identified }: { mission: HistoricMission; step: number; identified: string | null }) {
  return (
    <aside className="flex flex-col gap-3 p-3">
      <section className="module">
        <header className="module-head">
          <h3 className="font-space text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
            {step === 1 ? "The flight" : mission.outcome === "lost" ? "What failed" : "What went right"}
          </h3>
          {mission.outcome === "lost" ? (
            <span className="font-space text-[12px] font-semibold tracking-[0.2em] text-nogo">LOST</span>
          ) : (
            <span className="font-space text-[12px] font-semibold tracking-[0.2em] text-go-signal">SUCCESS</span>
          )}
        </header>
        <div className="px-4 py-3">
          <p className="font-space text-[22px] font-semibold uppercase leading-tight tracking-[0.06em] text-white">{mission.vehicle}</p>
          <p className="mt-0.5 text-[14px] text-white/85">{mission.mission}</p>
          <p className="mt-0.5 text-[13px] text-haze">
            {new Date(`${mission.date}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })} · {mission.site}
          </p>
          {step === 1 && (
            <p className="mt-3 text-[14px] leading-snug text-haze">
              Here is the vehicle, drawn on a napkin. Press Diagnose to find {mission.outcome === "lost" ? "what broke" : "what made it work"}.
            </p>
          )}
          {step >= 2 && mission.outcome === "lost" && mission.failure && (
            <div className="mt-4 border-t border-rule pt-3">
              <p className="text-[18px] font-semibold leading-snug text-nogo">{mission.failure.label}</p>
              <p className="mt-1.5 text-[14px] leading-snug text-white/85">{mission.failure.detail}</p>
            </div>
          )}
          {step >= 2 && mission.outcome === "success" && (
            <div className="mt-4 border-t border-rule pt-3">
              <p className="text-[16px] font-semibold leading-snug text-go-signal">{mission.rootCause}</p>
              {mission.failure && (
                <p className="mt-2 text-[14px] leading-snug text-white/85">
                  <span className="text-flame">Anomaly: {mission.failure.label}.</span> {mission.failure.detail}
                </p>
              )}
            </div>
          )}
          {step >= 2 && identified && <p className="mt-3 text-[12px] leading-snug text-haze">{identified}</p>}
        </div>
      </section>
      {step >= 2 && mission.stats.length > 0 && (
        <section className="module">
          <header className="module-head">
            <h3 className="font-space text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">The numbers</h3>
          </header>
          <ul className="divide-y divide-rule">
            {mission.stats.slice(0, 4).map((s) => (
              <li key={s.label} className="px-4 py-3">
                <p className="font-space text-[26px] font-medium leading-none tabular-nums text-white">{s.value}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-haze">{s.label}</p>
                <p className="mt-1 text-[13px] leading-snug text-white/80">{s.meaning}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {step === 3 && <p className="px-1 text-[12px] leading-snug text-haze">Grok Imagine built this vehicle from the napkin sketch.</p>}
    </aside>
  );
}

/** A header dropdown: a button that opens a small black menu; closes on pick, outside click or Escape. */
function Dropdown({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 border border-rule px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:border-white/60"
      >
        {label}
        <svg viewBox="0 0 10 6" className={`h-1.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open && <div className="absolute right-0 top-full z-40 mt-2 w-60 border border-rule bg-black py-1 shadow-[0_12px_30px_rgba(0,0,0,0.6)]">{children(() => setOpen(false))}</div>}
    </div>
  );
}

function MenuItem({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/[0.06] ${active ? "text-white" : "text-white/80"}`}
    >
      {children}
      {active && <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />}
    </button>
  );
}
