"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AttractMode from "@/components/AttractMode";
import LaunchScene from "@/components/LaunchScene";
import NapkinCanvas from "@/components/NapkinCanvas";
import RedPenOverlay from "@/components/RedPenOverlay";
import VerdictPanel from "@/components/VerdictPanel";
import VoiceDock from "@/components/VoiceDock";
import type { NapkinRect } from "@/components/launch/engine";
import { applyAction } from "@/lib/actions";
import { replaySketch } from "@/lib/attract";
import { DEMO_SKETCHES } from "@/lib/demo-sketches";
import type {
  Analysis,
  Design,
  DesignAction,
  DestinationId,
  FlightTrace,
  Phase,
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
import { penLoop, strokesToPng } from "@/lib/napkin";
import { analyze, simulateFlight } from "@/lib/physics";

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
  const [flight, setFlight] = useState<{ trace: FlightTrace; renderUrl: string | null; napkinRect: NapkinRect | null } | null>(null);
  const [narration, setNarration] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analysis = useMemo(() => safeAnalyze(design), [design]);

  // Latest values for callbacks that outlive a render (voice tool calls, async responses).
  const latest = useRef({ reading, design, strokes });
  useEffect(() => {
    latest.current = { reading, design, strokes };
  }, [reading, design, strokes]);
  const conceptRequest = useRef(0);
  // Wraps the napkin so the launch can lift off from exactly where the doodle sits on screen.
  const napkinArea = useRef<HTMLDivElement>(null);

  const requestReview = useCallback(async (nextReading: SketchReading, nextAnalysis: Analysis) => {
    try {
      const body: ReviewRequest = { reading: nextReading, analysis: nextAnalysis };
      const { review: next } = await postJson<ReviewResponse>("/api/review", body);
      setReview(next);
      setReviewKey((k) => k + 1);
      setNarration(next.summary);
    } catch {
      setError("The red pen ran out of ink. Try checking again.");
    }
  }, []);

  const fetchConcept = useCallback(async (nextDesign: Design, nextAnalysis: Analysis, sketch: string) => {
    const id = ++conceptRequest.current;
    setConcept({ url: null, loading: true });
    try {
      const body: RenderRequest = { design: nextDesign, analysis: nextAnalysis, kind: "concept", sketch };
      const { url } = await postJson<RenderResponse>("/api/render", body);
      if (id === conceptRequest.current) setConcept({ url, loading: false });
    } catch {
      if (id === conceptRequest.current) setConcept({ url: null, loading: false });
    }
  }, []);

  const fetchPatch = useCallback(async (nextDesign: Design, nextAnalysis: Analysis) => {
    try {
      const body: RenderRequest = { design: nextDesign, analysis: nextAnalysis, kind: "patch" };
      const { url } = await postJson<RenderResponse>("/api/render", body);
      setPatchUrl(url);
    } catch {
      setPatchUrl(null);
    }
  }, []);

  const fetchPriorArt = useCallback(async (nextDesign: Design) => {
    try {
      const res = await fetch(`/api/prior-art?q=${encodeURIComponent(priorArtQuery(nextDesign))}&limit=3`);
      const { results } = (await res.json()) as { results?: PriorArtResult[] };
      setPriorArt(results ?? []);
    } catch {
      setPriorArt([]);
    }
  }, []);

  async function check() {
    if (strokes.length === 0 || phase === "reading") return;
    setPhase("reading");
    setError(null);
    setReview(null);
    try {
      const started = Date.now();
      const image = strokesToPng(strokes);
      const body: ReadRequest = { image, strokes, destination };
      const { reading: read } = await postJson<ReadResponse>("/api/read", body);
      // Let the scanner sweep at least once so the read feels deliberate.
      await wait(Math.max(0, 1300 - (Date.now() - started)));
      const nextDesign: Design = { ...read.design, destination };
      const nextReading: SketchReading = { ...read, design: nextDesign };
      const nextAnalysis = safeAnalyze(nextDesign);
      setReading(nextReading);
      setDesign(nextDesign);
      setStale(false);
      setPhase("reviewed");
      if (!nextAnalysis) {
        setError("That one broke the physics engine. Try a clearer sketch?");
        return;
      }
      void fetchConcept(nextDesign, nextAnalysis, image);
      void fetchPatch(nextDesign, nextAnalysis);
      void fetchPriorArt(nextDesign);
      await requestReview(nextReading, nextAnalysis);
    } catch {
      setError("Couldn't read the napkin. Try again?");
      setPhase("draw");
    }
  }

  const startLaunch = useCallback(() => {
    const { design: current, reading: read, strokes: drawn } = latest.current;
    const currentAnalysis = safeAnalyze(current);
    if (!current || !read || !currentAnalysis) return;
    const box = napkinArea.current?.querySelector(".napkin")?.getBoundingClientRect();
    const napkinRect = box ? { left: box.left, top: box.top, width: box.width, height: box.height } : null;
    setFlight({ trace: simulateFlight(current, currentAnalysis), renderUrl: null, napkinRect });
    setPhase("launch");
    const body: RenderRequest = {
      design: current,
      analysis: currentAnalysis,
      kind: "outcome",
      sketch: strokesToPng(drawn),
    };
    postJson<RenderResponse>("/api/render", body)
      .then(({ url }) => setFlight((f) => (f ? { ...f, renderUrl: url } : f)))
      .catch(() => {});
  }, []);

  /** Voice commands and destination chips both edit the design, then the red pen re-checks it. */
  const handleAction = useCallback(
    (action: DesignAction) => {
      if (action.type === "launch") {
        startLaunch();
        return;
      }
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
    [requestReview, startLaunch],
  );

  function changeStrokes(next: Stroke[]) {
    setStrokes(next);
    if (reading) setStale(true);
  }

  // Aborts an in-progress demo-sketch replay when something else takes over the napkin.
  const replay = useRef<AbortController | null>(null);

  function clearAll() {
    replay.current?.abort();
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

  function loadDemo(id: string) {
    const sketch = DEMO_SKETCHES.find((s) => s.id === id);
    if (!sketch) return;
    clearAll();
    setDestination(sketch.destination);
    const controller = new AbortController();
    replay.current = controller;
    void replaySketch(sketch.strokes, setStrokes, { signal: controller.signal });
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
    setDestination(sketch.destination);
    if (params.get("check") === "1") setCheckRequest((n) => n + 1);
    /* eslint-enable react-hooks/set-state-in-effect */
    autoLaunch.current = params.get("launch") === "1";
  }, []);

  useEffect(() => {
    if (checkRequest === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- running a check that was explicitly requested
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
        setStrokes((s) => s.slice(0, -1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const reviewed = phase === "reviewed" && reading && design;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-8 gap-y-2 px-8 pt-5">
        <h1 className="font-hand text-[36px] font-bold leading-none">
          <span className="text-redpen">Pen</span>umbra
        </h1>
        <nav className="flex items-center gap-1" aria-label="Destination">
          <span className="mr-2 font-hand text-xl text-ink-muted">headed to</span>
          {DESTINATION_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => (design ? handleAction({ type: "set-destination", destination: chip.id }) : setDestination(chip.id))}
              className="relative px-3 py-1 font-hand text-[26px] leading-none"
              aria-pressed={destination === chip.id}
            >
              {chip.label}
              {destination === chip.id && (
                <svg viewBox="0 0 100 50" className="pointer-events-none absolute -inset-x-1 -inset-y-1 h-[calc(100%+8px)] w-[calc(100%+8px)] overflow-visible" aria-hidden>
                  <path d={penLoop(50, 25, 46, 21, chip.id.length)} fill="none" stroke="var(--redpen)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" className="pen-draw" pathLength={1} />
                </svg>
              )}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 font-hand text-xl text-ink-muted">or try</span>
          {DEMO_SKETCHES.map((sketch) => (
            <button
              key={sketch.id}
              type="button"
              onClick={() => loadDemo(sketch.id)}
              className="rounded-full border border-napkin-edge px-3 py-1 font-mono text-[11px] tracking-wider text-ink-muted transition hover:border-graphite hover:text-graphite"
            >
              {sketch.title}
            </button>
          ))}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 gap-10 px-8 py-5">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col items-center gap-4">
          <div ref={napkinArea} className="flex min-h-0 w-full flex-1 justify-center">
            <NapkinCanvas strokes={strokes} onChange={changeStrokes} disabled={phase === "reading"}>
              {patchUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={patchUrl}
                  alt="Grok Imagine mission patch"
                  className="sticker-in absolute right-[5%] top-[3%] aspect-square w-[24%] rounded-full object-cover shadow-[0_6px_14px_-4px_rgba(0,0,0,0.45)]"
                />
              )}
              <div className={`absolute inset-0 transition-opacity duration-300 ${stale ? "opacity-30" : ""}`}>
                <RedPenOverlay
                  parts={reviewed ? reading.parts : []}
                  marks={reviewed ? (review?.marks ?? []) : []}
                  playKey={String(reviewKey)}
                  scanning={phase === "reading"}
                  onFix={handleAction}
                />
              </div>
            </NapkinCanvas>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setStrokes((s) => s.slice(0, -1))}
              disabled={strokes.length === 0}
              className="font-mono text-[11px] tracking-[0.2em] text-ink-muted hover:text-graphite disabled:opacity-40"
            >
              UNDO
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={strokes.length === 0}
              className="font-mono text-[11px] tracking-[0.2em] text-ink-muted hover:text-graphite disabled:opacity-40"
            >
              CLEAR
            </button>
            <button
              type="button"
              onClick={check}
              disabled={strokes.length === 0 || phase === "reading"}
              className="rounded-full bg-graphite px-6 py-2 font-hand text-[26px] leading-none text-napkin shadow-[0_8px_18px_-10px_rgba(0,0,0,0.6)] transition hover:-translate-y-0.5 disabled:opacity-40"
            >
              {phase === "reading" ? "reading…" : reading && !stale ? "re-check ✎" : "check my napkin ✎"}
            </button>
            <button
              type="button"
              onClick={startLaunch}
              disabled={!reviewed || !analysis}
              className="rounded-full bg-gradient-to-b from-flame-hot to-flame px-8 py-3 font-mono text-[13px] font-semibold tracking-[0.3em] text-white shadow-[0_10px_24px_-10px_rgba(255,90,31,0.9)] transition hover:-translate-y-0.5 disabled:opacity-30 disabled:shadow-none"
            >
              LAUNCH
            </button>
          </div>
          {error && <p className="font-hand text-xl text-redpen">{error}</p>}
          {!error && reviewed && review?.marks.some((m) => m.fix) && (
            <p className="font-hand text-xl text-ink-muted">tip: tap a red note to apply the fix ↻</p>
          )}
        </section>

        <section className="w-[420px] shrink-0 overflow-y-auto pb-6 pr-1">
          <VerdictPanel
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
      />

      {phase === "launch" && flight && reading && design && analysis && (
        <LaunchScene
          strokes={strokes}
          reading={{ ...reading, design }}
          analysis={analysis}
          trace={flight.trace}
          renderUrl={flight.renderUrl}
          napkinRect={flight.napkinRect}
          onEvent={(event) => setNarration(event.label)}
          onDone={() => {
            setFlight(null);
            setPhase("reviewed");
          }}
        />
      )}
    </div>
  );
}
