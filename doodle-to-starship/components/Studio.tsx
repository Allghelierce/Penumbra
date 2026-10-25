"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AttractMode from "@/components/AttractMode";
import Link from "next/link";
import LaunchScene, { unlockLaunchAudio } from "@/components/LaunchScene";
import NapkinCanvas from "@/components/NapkinCanvas";
import NapkinRender from "@/components/NapkinRender";
import MissionClock from "@/components/MissionClock";
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
  FlightTrace,
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
import { recap } from "@/lib/recap";
import { calloutFor, offerFor, pollRoom } from "@/lib/mission-control";
import { analyze, DESTINATIONS, simulateFlight } from "@/lib/physics";
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

const km1 = (mps: number) => (Math.round(mps / 100) / 10).toFixed(1);
const signed = (n: number, unit: string, digits = 0) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)} ${unit}`;

/**
 * The design review, built from the red-pen marks and the analysis: one issue per mark, numbered the
 * same as the mark on the napkin, with the physics behind it and the fix the red pen offers.
 */
function reviewIssues(design: Design, analysis: Analysis, review: Review | null): ReviewIssue[] {
  if (!review) return [];
  const target = DESTINATIONS[design.destination].name;
  const effect =
    analysis.liftoffTwr < 1
      ? `Never leaves the pad: thrust/weight ${analysis.liftoffTwr.toFixed(2)} at liftoff.`
      : analysis.marginMps < 0
        ? `${km1(-analysis.marginMps)} km/s short of ${target} (${km1(analysis.totalDeltaVMps)} of ${km1(analysis.requiredDeltaVMps)} km/s).`
        : `Reaches ${target} with ${km1(analysis.marginMps)} km/s to spare.`;
  const failing = analysis.verdict !== "destination";
  return review.marks.map((mark, i) => ({
    id: `mark-${i}`,
    severity: failing ? (mark.fix || i === 0 ? "critical" : "major") : "minor",
    title: mark.note.charAt(0).toUpperCase() + mark.note.slice(1).replace(/[.!]+$/, ""),
    why: analysis.findings[Math.min(i, analysis.findings.length - 1)] ?? "",
    effect,
    fix: mark.fix,
    markIndex: i,
  }));
}

/** What small changes buy: the physics re-run on +1 t payload, +10% first-stage tanks and one more engine. */
function tradeNumbers(design: Design, analysis: Analysis): Trade[] {
  const out: Trade[] = [];
  const delta = (next: Design) => {
    try {
      return analyze(next);
    } catch {
      return null;
    }
  };
  const payload = delta(applyAction(design, { type: "set-payload", payloadMassKg: design.payloadMassKg + 1000 }));
  if (payload) out.push({ label: "+1 t payload", text: signed(payload.totalDeltaVMps - analysis.totalDeltaVMps, "m/s") });
  const tanks = delta(applyAction(design, { type: "scale-tanks", stageIndex: 0, factor: 1.1 }));
  if (tanks) out.push({ label: "+10% first-stage tanks", text: `${signed(tanks.totalDeltaVMps - analysis.totalDeltaVMps, "m/s")}, T/W ${signed(tanks.liftoffTwr - analysis.liftoffTwr, "", 2).trim()}` });
  const cluster = design.stages[0]?.engines[0];
  if (cluster) {
    const engines = delta(applyAction(design, { type: "set-engines", stageIndex: 0, engine: cluster.engine, count: cluster.count + 1 }));
    if (engines) out.push({ label: "+1 first-stage engine", text: `T/W ${signed(engines.liftoffTwr - analysis.liftoffTwr, "", 2).trim()}, ${signed(engines.totalDeltaVMps - analysis.totalDeltaVMps, "m/s")}` });
  }
  return out;
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
  const [seenReview, setSeenReview] = useState(-1);
  // A scribble that doesn't read as a vehicle gets coaching, not physics.
  const unreadable = useMemo(
    () => (reading && (reading.confidence ?? 1) < 0.5 ? { problem: reading.problem ?? "These strokes don't form a vehicle outline." } : null),
    [reading],
  );
  const issues = useMemo(() => (design && analysis && !unreadable ? reviewIssues(design, analysis, review) : []), [design, analysis, review, unreadable]);
  const trades = useMemo(() => (design && analysis && !unreadable ? tradeNumbers(design, analysis) : []), [design, analysis, unreadable]);
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
  const latest = useRef({ reading, design, strokes, destination, review });
  useEffect(() => {
    latest.current = { reading, design, strokes, destination, review };
  }, [reading, design, strokes, destination, review]);
  // Mission control: the GO/NO-GO poll before launch, and the spoken offer after a flight.
  const [poll, setPoll] = useState<Poll | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [offer, setOffer] = useState<{ line: string; fix?: DesignAction } | null>(null);
  // The sample on the napkin, if one is loaded untouched, so its design keeps the sample's name.
  const sampleTitle = useRef<string | null>(null);
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
      if (id === runs.current.concept) setConcept({ url, loading: false });
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
      const nextDesign: Design = { ...read.design, destination: target, name: sampleTitle.current ?? read.design.name };
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
      const same = rendered.current?.strokes === strokes && rendered.current.destination === target;
      if (!same) {
        rendered.current = { strokes, destination: target };
        void fetchConcept(nextDesign, nextAnalysis, image);
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
    const trace = simulateFlight(current, currentAnalysis);
    setFlight({ trace, renderUrl: null, renderState: "loading", napkinRect });
    setAttempts((prev) => [...prev, { n: prev.length + 1, design: current, analysis: currentAnalysis, maxAltitudeKm: trace.maxAltitudeKm }]);
    setPhase("launch");
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

  // handleAction is memoized; it reaches the latest openPoll (defined below) through this ref.
  const openPollRef = useRef<() => void>(() => {});
  // The Cmd+Z listener is registered once; it reaches the latest undo (defined below) through this ref.
  const undoRef = useRef<() => void>(() => {});

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
    sampleTitle.current = null;
    setStrokes(next);
    if (latest.current.reading) setStale(true);
  }

  // Aborts an in-progress demo-sketch replay when something else takes over the napkin.
  const replay = useRef<AbortController | null>(null);
  // True while a sample is still drawing itself; checking then would read half a sketch.
  const [replaying, setReplaying] = useState(false);

  function clearAll() {
    replay.current?.abort();
    // Anything still in flight belongs to the old sketch.
    for (const key of Object.keys(runs.current) as (keyof typeof runs.current)[]) runs.current[key]++;
    checking.current = false;
    rendered.current = null;
    sampleTitle.current = null;
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
    sampleTitle.current = sketch.title;
    setDestination(sketch.destination);
    const controller = new AbortController();
    replay.current = controller;
    setReplaying(true);
    void replaySketch(sketch.strokes, setStrokes, { signal: controller.signal }).finally(() => {
      if (replay.current === controller) setReplaying(false);
    });
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
    setStrokes(sketch.strokes);
    sampleTitle.current = sketch.title;
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
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const reviewed = phase === "reviewed" && reading && design;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-black text-white">
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-rule bg-black px-6 min-[1400px]:gap-8">
        <h1 aria-label="Penumbra">
          <PenumbraLockup />
        </h1>
        <div className="flex items-center gap-3">
          <span id="target-label" className="text-[11px] uppercase tracking-[0.2em] text-haze">
            Target
          </span>
          <div role="radiogroup" aria-labelledby="target-label" className="flex gap-1">
            {DESTINATION_CHIPS.map((chip) => {
              const selected = destination === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => (design ? handleAction({ type: "set-destination", destination: chip.id }) : setDestination(chip.id))}
                  className={`relative px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] transition-colors after:absolute after:inset-x-2.5 after:-bottom-px after:h-[2px] after:bg-white after:transition-transform ${
                    selected ? "text-white after:scale-x-100" : "text-haze after:scale-x-0 hover:text-white"
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="mr-6 hidden min-[1400px]:inline">
            <MissionClock />
          </span>
          <Link href="/about" className="mr-4 whitespace-nowrap text-[11px] uppercase tracking-[0.2em] text-haze underline-offset-4 transition-colors hover:text-white hover:underline">
            How it works
          </Link>
          <span className="mr-1 hidden text-[11px] uppercase tracking-[0.2em] text-haze min-[1400px]:inline">Samples</span>
          {DEMO_SKETCHES.map((sketch) => (
            <button
              key={sketch.id}
              type="button"
              onClick={() => loadDemo(sketch.id)}
              className="whitespace-nowrap px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              {sketch.title}
            </button>
          ))}
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_460px]">
        <section className="space-stage flex min-h-0 min-w-0 flex-col items-center gap-4 px-8 pb-4 pt-6">
          <SpaceBackdrop />
          <div ref={napkinArea} className="flex min-h-0 w-full flex-1 justify-center">
            <NapkinCanvas strokes={strokes} onChange={changeStrokes} disabled={phase === "reading"}>
              <NapkinRender
                url={concept.url}
                loading={concept.loading}
                resetKey={strokes}
                sticker={
                  patchUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={patchUrl}
                      alt="Grok Imagine mission patch"
                      className="sticker-in absolute right-[5%] top-[3%] aspect-square w-[24%] rounded-full object-cover shadow-[0_6px_14px_-4px_rgba(0,0,0,0.45)]"
                    />
                  )
                }
              >
                <div className={`absolute inset-0 transition-opacity duration-300 ${stale ? "opacity-30" : ""}`}>
                  <RedPenOverlay
                    parts={reviewed ? reading.parts : []}
                    marks={reviewed ? (review?.marks ?? []) : []}
                    playKey={String(reviewKey)}
                    scanning={phase === "reading"}
                    onFix={(fix) => {
                      setSeenReview(reviewKey);
                      handleAction(fix);
                    }}
                    numbers={markNumbers}
                    selectedMark={selectedMark}
                    onSelectMark={(markIndex) => selectIssue(issues.findIndex((issue) => issue.markIndex === markIndex))}
                    problem={reviewed && unreadable ? unreadable.problem : null}
                  />
                </div>
              </NapkinRender>
            </NapkinCanvas>
          </div>

          {phase === "poll" && poll ? (
            <PollConsole poll={poll} revealed={revealed} onGo={goForLaunch} onScrub={scrub} onFix={fixAndRepoll} />
          ) : (
          <div className="flex w-full items-center justify-center">
            <div className="flex shrink-0 items-center gap-2">
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
              <button
                type="button"
                onClick={check}
                disabled={strokes.length === 0 || phase === "reading" || replaying}
                className="btn-outline h-11 px-6 text-[12px]"
              >
                {phase === "reading" ? "Reading…" : reading && !stale ? "Check again" : "Check design"}
              </button>
              <button
                type="button"
                onClick={openPoll}
                disabled={!reviewed || !analysis || Boolean(unreadable)}
                className={`${issues.length > 0 && seenReview !== reviewKey ? "btn-outline" : "btn-solid"} h-11 px-8 text-[12px]`}
              >
                Launch
              </button>
            </div>
          </div>
          )}
          <p className={`h-5 text-[13px] ${error ? "text-nogo" : "text-haze"}`} aria-live="polite">
            {error ?? (reviewed && review?.marks.some((m) => m.fix) ? "Tap a red note on the sketch to apply its fix." : "")}
          </p>
        </section>

        <section className="min-h-0 overflow-y-auto border-l border-rule bg-black">
          <VerdictPanel
            issues={issues}
            trades={trades}
            selectedIssue={selectedIssue}
            onSelectIssue={selectIssue}
            unreadable={unreadable}
            samples={DEMO_SKETCHES.map((d) => ({ id: d.id, title: d.title }))}
            onSample={loadDemo}
            trace={predicted}
            onLaunch={openPoll}
            canLaunch={Boolean(reviewed && analysis)}
            attempts={attempts}
            recap={flightRecap}
            onFix={handleAction}
            phase={phase}
            design={design}
            analysis={analysis}
            review={review}
            conceptUrl={concept.url}
            conceptLoading={concept.loading}
            priorArt={priorArt}
          />
        </section>
      </main>

      <AttractMode
        enabled={attract}
        phase={phase}
        onStrokes={(next) => (next.length === 0 ? clearAll() : setStrokes(next))}
        onDestination={setDestination}
        onCheck={() => setCheckRequest((n) => n + 1)}
        onLaunch={startLaunch}
      />

      <VoiceDock
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
          strokes={strokes}
          reading={{ ...reading, design }}
          analysis={analysis}
          trace={flight.trace}
          renderUrl={flight.renderUrl}
          renderState={flight.renderState}
          napkinRect={flight.napkinRect}
          onEvent={(event) => setNarration(calloutFor(event, design, flight.trace))}
          onDone={() => {
            setFlight(null);
            setPhase("reviewed");
            if (flightRecap) setOffer(offerFor(flightRecap));
          }}
          recap={flightRecap}
          onImprove={improveAndFly}
        />
      )}
    </div>
  );
}
