"use client";

import { useEffect, useRef, useState } from "react";
import LaunchScene from "@/components/LaunchScene";
import { FIXTURES, REAL_FIXTURES, SAMPLE_MISSION, SAMPLE_RECAP, TEMPLATE_FIXTURES, type LaunchFixture } from "./fixtures";

export default function LaunchDevPage() {
  const [active, setActive] = useState<{ fixture: LaunchFixture; run: number } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const runs = useRef(0);
  const [missionMode, setMissionMode] = useState(false);
  const [napkinRect, setNapkinRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  function play(fixture: LaunchFixture) {
    setLog([]);
    setActive({ fixture, run: ++runs.current });
  }

  // ?play=<fixture id> starts a launch on load (handy for screenshots).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fixture = [...TEMPLATE_FIXTURES, ...REAL_FIXTURES, ...FIXTURES].find((f) => f.id === params.get("play"));
    if (!fixture) return;
    // ?rect=left,top,width,height pretends the napkin sat there on screen.
    const [left, top, width, height] = (params.get("rect") ?? "").split(",").map(Number);
    // ?mission=1 shows the historic-mission debrief end card.
    const ms = params.get("mission") === "1";
    const h = window.setTimeout(() => {
      if (height > 0) setNapkinRect({ left, top, width, height });
      setMissionMode(ms);
      setActive({ fixture, run: ++runs.current });
    }, 0);
    return () => window.clearTimeout(h);
  }, []);

  return (
    <main className="min-h-screen bg-table px-4 py-8 text-graphite sm:px-10">
      <h1 className="font-hand text-5xl">Launch scene</h1>
      <p className="mt-1 font-mono text-xs text-ink-muted">
        Dev bench for components/LaunchScene.tsx. Esc or “skip” jumps to the end card.
      </p>

      {[
        { title: "Real rockets: templates", list: TEMPLATE_FIXTURES },
        { title: "Real physics: demo sketches", list: REAL_FIXTURES },
        { title: "Hand-made traces", list: FIXTURES },
      ].map((group) => (
        <section key={group.title} className="mt-6">
          <h2 className="font-mono text-xs uppercase tracking-widest text-ink-muted">{group.title}</h2>
          <div className="mt-2 flex flex-wrap gap-3">
            {group.list.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => play(f)}
                className="rounded-[3px] border border-napkin-edge bg-napkin px-4 py-3 text-left shadow-sm transition-transform hover:-rotate-1"
              >
                <div className="font-hand text-3xl leading-none">{f.title}</div>
                <div className="mt-1 font-mono text-[11px] text-ink-muted">{f.note}</div>
              </button>
            ))}
          </div>
        </section>
      ))}

      <section className="mt-8 max-w-2xl">
        <h2 className="font-mono text-xs uppercase tracking-widest text-ink-muted">onEvent log</h2>
        <ol className="mt-2 space-y-1 font-mono text-xs">
          {log.length === 0 && <li className="text-ink-muted">Nothing yet.</li>}
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </section>

      {active && (
        <LaunchScene
          key={active.run}
          strokes={active.fixture.strokes}
          reading={active.fixture.reading}
          analysis={active.fixture.analysis}
          trace={active.fixture.trace}
          stageBands={active.fixture.stageBands}
          templateId={active.fixture.templateId}
          napkinRect={napkinRect}
          mission={missionMode ? SAMPLE_MISSION : null}
          recap={SAMPLE_RECAP}
          onImprove={(fix) => {
            setLog((l) => [...l, `onImprove ${JSON.stringify(fix)}`]);
            setActive(null);
          }}
          onEvent={(e) => setLog((l) => [...l, `T+${Math.round(e.tS)}s  ${e.kind}  ${e.label}`])}
          onDone={() => setActive(null)}
        />
      )}
    </main>
  );
}
