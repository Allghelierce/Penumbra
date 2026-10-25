"use client";

// The GO/NO-GO poll strip: one tile per flight controller, lit as Mission Control reads each line,
// and big GO / SCRUB / APPLY FIX buttons so the launch never depends on the microphone.

import type { DesignAction, Poll } from "@/lib/design";

export interface PollConsoleProps {
  poll: Poll;
  /** How many calls have been read out; tiles past this stay dark. poll.calls.length lights them all. */
  revealed: number;
  onGo: () => void;
  onScrub: () => void;
  onFix: (fix: DesignAction) => void;
}

export default function PollConsole({ poll, revealed, onGo, onScrub, onFix }: PollConsoleProps) {
  const controllers = poll.calls.filter((c) => c.role !== "Flight");
  const done = revealed >= poll.calls.length;
  const fix = poll.calls.find((c) => !c.go && c.fix)?.fix;
  const speaking = poll.calls[Math.min(revealed, poll.calls.length) - 1];

  return (
    <section aria-label="GO/NO-GO poll" className="w-full border border-rule bg-black px-4 py-3 text-white">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="font-space text-[12px] font-semibold uppercase tracking-[0.2em] text-haze">GO / NO-GO poll</h2>
        <p className="min-w-0 truncate text-[13px] text-haze" aria-live="polite">
          {speaking?.line ?? "Flight, conduct the poll."}
        </p>
      </div>

      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${controllers.length + 1}, minmax(0, 1fr))` }}>
        {controllers.map((call, i) => (
          <Tile key={call.role} label={call.role} lit={i < revealed} go={call.go} />
        ))}
        <Tile label="Flight" lit={done} go={poll.go} hold />
      </ol>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={onScrub} className="btn-outline h-11 px-6 text-[12px]">
          Scrub
        </button>
        {fix && (
          <button type="button" onClick={() => onFix(fix)} className="btn-outline h-11 px-6 text-[12px]">
            Apply fix
          </button>
        )}
        {/* Disabled until every controller has reported, so a NO-GO can't fly before it's heard (Esc skips). */}
        <button
          type="button"
          onClick={onGo}
          disabled={!done}
          className={`h-11 px-8 text-[12px] ${poll.go || !done ? "btn-solid" : "btn-outline border-nogo text-nogo"}`}
        >
          {!done ? "Polling…" : poll.go ? "GO for launch" : "GO anyway"}
        </button>
      </div>
    </section>
  );
}

function Tile({ label, lit, go, hold }: { label: string; lit: boolean; go: boolean; hold?: boolean }) {
  const state = !lit ? "standby" : go ? "GO" : hold ? "HOLD" : "NO-GO";
  const tone = !lit ? "border-rule text-haze" : go ? "border-go-signal text-go-signal" : "border-nogo text-nogo";
  return (
    <li className={`border px-3 py-2 transition-colors duration-300 ${tone}`}>
      <div className="font-space text-[11px] uppercase tracking-[0.18em] text-haze">{label}</div>
      <div className="font-display text-[22px] font-semibold uppercase leading-tight tracking-[0.06em]">{state}</div>
    </li>
  );
}
