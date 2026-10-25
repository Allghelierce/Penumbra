"use client";

// Dev smoke test for every xAI-backed route: one button per capability, latency, source,
// cost (from the x-xai-cost-usd header the routes set) and the image or video itself.

import { useEffect, useRef, useState } from "react";
import type { ReplayPollResponse, ReplayStartResponse } from "@/app/api/replay/types";
import { DEMO_SKETCHES } from "@/lib/demo-sketches";
import type { Analysis, ReadResponse, RenderResponse, ReviewResponse, SketchReading } from "@/lib/design";
import { strokesToPng } from "@/lib/napkin";
import { analyze } from "@/lib/physics";

const SKETCH = DEMO_SKETCHES.find((d) => d.id === "mars-ship")!;
const POLL_MS = 3000;
const POLL_LIMIT_MS = 180_000;

/** Milliseconds since `t0` (a previous now()). Module-level so it's clearly not called during render. */
const now = () => performance.now();
const since = (t0: number) => Math.round(now() - t0);

type Step = "read" | "review" | "concept" | "patch" | "outcome" | "replay" | "voice";
const STEPS: { id: Step; label: string; note: string }[] = [
  { id: "read", label: "read sketch", note: "vision · mars-ship PNG" },
  { id: "review", label: "review rewrite", note: "text · red-pen copy" },
  { id: "concept", label: "concept render", note: "imagine · edit from sketch" },
  { id: "patch", label: "mission patch", note: "imagine · generate 1:1" },
  { id: "outcome", label: "outcome render", note: "imagine · generate" },
  { id: "replay", label: "replay video", note: "video · start + poll" },
  { id: "voice", label: "voice token", note: "realtime · client secret" },
];

interface Result {
  state: "running" | "ok" | "fallback" | "error";
  ms?: number;
  source?: string;
  costUsd?: number | null;
  text?: string;
  image?: string | null;
  video?: string | null;
}

interface Status {
  keyPresent: boolean;
  models: Record<string, string>;
}

async function post<T>(path: string, body?: unknown) {
  const t0 = now();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  const cost = res.headers.get("x-xai-cost-usd");
  return { json, ms: since(t0), costUsd: cost === null ? null : Number(cost), ok: res.ok };
}

export default function XaiDevPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [results, setResults] = useState<Partial<Record<Step, Result>>>({});
  const reading = useRef<SketchReading | null>(null);
  const analysis = useRef<Analysis | null>(null);
  const outcomeUrl = useRef<string | null>(null);
  const png = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/xai-status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const set = (step: Step, result: Result) => setResults((prev) => ({ ...prev, [step]: result }));
  const sketchPng = () => (png.current ??= strokesToPng(SKETCH.strokes));

  async function ensureReading() {
    if (!reading.current) await run.read();
    return { reading: reading.current!, analysis: analysis.current! };
  }

  async function render(step: Step, kind: "concept" | "outcome" | "patch", withSketch: boolean) {
    set(step, { state: "running" });
    const ctx = await ensureReading();
    const r = await post<RenderResponse>("/api/render", {
      design: ctx.reading.design,
      analysis: ctx.analysis,
      kind,
      ...(withSketch ? { sketch: sketchPng() } : {}),
    });
    if (kind === "outcome") outcomeUrl.current = r.json.url;
    set(step, {
      state: r.json.source === "grok" ? "ok" : "fallback",
      ms: r.ms,
      source: r.json.source,
      costUsd: r.costUsd,
      image: r.json.url,
      text: r.json.url ? undefined : "no image",
    });
  }

  const run: Record<Step, () => Promise<void>> = {
    read: async () => {
      set("read", { state: "running" });
      const r = await post<ReadResponse>("/api/read", {
        image: sketchPng(),
        strokes: SKETCH.strokes,
        destination: SKETCH.destination,
      });
      reading.current = r.json.reading;
      analysis.current = analyze(r.json.reading.design);
      const d = r.json.reading.design;
      set("read", {
        state: r.json.source === "grok" ? "ok" : "fallback",
        ms: r.ms,
        source: r.json.source,
        costUsd: r.costUsd,
        text: `"${d.name}" · ${d.heightM} × ${d.diameterM} m · ${d.stages
          .map((s) => s.engines.map((e) => `${e.count}× ${e.engine}`).join("+"))
          .join(" / ")} · [${d.features.join(", ")}] · ${r.json.reading.parts.length} parts → ${analysis.current.verdict}`,
      });
    },
    review: async () => {
      set("review", { state: "running" });
      const ctx = await ensureReading();
      const r = await post<ReviewResponse>("/api/review", ctx);
      set("review", {
        state: r.json.source === "grok" ? "ok" : "fallback",
        ms: r.ms,
        source: r.json.source,
        costUsd: r.costUsd,
        text: [r.json.review?.summary, ...(r.json.review?.marks ?? []).map((m) => `• ${m.note}`)].join("\n"),
      });
    },
    concept: () => render("concept", "concept", true),
    patch: () => render("patch", "patch", false),
    outcome: () => render("outcome", "outcome", false),
    replay: async () => {
      set("replay", { state: "running", text: "starting…" });
      if (!outcomeUrl.current) await run.outcome();
      if (!outcomeUrl.current) {
        set("replay", { state: "fallback", source: "none", text: "needs an outcome render url first" });
        return;
      }
      const t0 = now();
      const start = await post<ReplayStartResponse>("/api/replay", {
        imageUrl: outcomeUrl.current,
        verdict: analysis.current?.verdict,
      });
      if (start.json.status !== "pending" || !start.json.id) {
        set("replay", { state: "fallback", ms: start.ms, source: start.json.status, costUsd: start.costUsd });
        return;
      }
      while (since(t0) < POLL_LIMIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        const poll = (await fetch(`/api/replay/${start.json.id}`).then((r) => r.json())) as ReplayPollResponse;
        const ms = since(t0);
        if (poll.status === "done") {
          set("replay", { state: "ok", ms, source: "grok", costUsd: start.costUsd, video: poll.url });
          return;
        }
        if (poll.status !== "pending") {
          set("replay", { state: "error", ms, source: poll.status });
          return;
        }
        set("replay", { state: "running", ms, text: `pending ${poll.progress ?? "?"}% · ${Math.round(ms / 1000)} s` });
      }
      set("replay", { state: "error", text: "gave up after 3 min" });
    },
    voice: async () => {
      set("voice", { state: "running" });
      const r = await post<{ mode: string; token?: string; expiresAt?: number | null; error?: string }>("/api/voice-token");
      const expires = r.json.expiresAt ? new Date(r.json.expiresAt * 1000).toLocaleTimeString() : "unknown";
      set("voice", {
        state: r.json.mode === "grok" && r.json.token ? "ok" : r.json.error ? "error" : "fallback",
        ms: r.ms,
        source: r.json.mode,
        text: r.json.token ? `token ok, expires at ${expires}` : (r.json.error ?? "no key: browser voice"),
      });
    },
  };

  async function guarded(step: Step) {
    try {
      await run[step]();
    } catch (err) {
      set(step, { state: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function runAll() {
    await guarded("read");
    await guarded("review");
    await Promise.all([guarded("concept"), guarded("patch"), guarded("outcome")]);
    await Promise.all([guarded("replay"), guarded("voice")]);
  }

  const totalCost = Object.values(results).reduce((sum, r) => sum + (r?.costUsd ?? 0), 0);

  return (
    <main className="min-h-screen bg-white p-6 font-mono text-sm text-neutral-900">
      <h1 className="mb-1 text-lg font-bold">xAI smoke test</h1>
      <p className="mb-4 text-neutral-600">
        key: {status ? (status.keyPresent ? "present" : "missing (fallbacks only)") : "…"}
        {status && ` · ${Object.entries(status.models).map(([k, v]) => `${k} ${v}`).join(" · ")}`}
      </p>
      <div className="mb-6 flex items-center gap-4">
        <button className="rounded bg-neutral-900 px-3 py-1.5 text-white" onClick={runAll}>
          run all (≈$0.30)
        </button>
        <span className="text-neutral-600">spent this page: ${totalCost.toFixed(4)}</span>
      </div>
      <ul className="space-y-3">
        {STEPS.map(({ id, label, note }) => {
          const r = results[id];
          return (
            <li key={id} className="rounded border border-neutral-300 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded border border-neutral-900 px-2 py-1 disabled:opacity-40"
                  disabled={r?.state === "running"}
                  onClick={() => guarded(id)}
                >
                  {label}
                </button>
                <span className="text-neutral-500">{note}</span>
                {r && (
                  <span
                    className={
                      r.state === "ok" ? "text-green-700" : r.state === "error" ? "text-red-700" : "text-amber-700"
                    }
                  >
                    {r.state}
                    {r.source && ` · ${r.source}`}
                    {r.ms !== undefined && ` · ${r.ms} ms`}
                    {r.costUsd != null && ` · $${r.costUsd.toFixed(4)}`}
                  </span>
                )}
              </div>
              {r?.text && <pre className="mt-2 whitespace-pre-wrap text-neutral-700">{r.text}</pre>}
              {r?.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.image} alt={label} className="mt-2 max-h-72 rounded border border-neutral-200" />
              )}
              {r?.video && <video src={r.video} className="mt-2 max-h-72" autoPlay muted loop playsInline controls />}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
