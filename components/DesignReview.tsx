"use client";

// The design review: what's wrong with the vehicle, why (the physics, with its own numbers),
// what it costs, and the fix. Issue numbers match the numbered red-pen marks on the napkin.

import type { DesignAction } from "@/lib/design";

export interface ReviewIssue {
  id: string;
  severity: "no-go" | "warning" | "ok";
  title: string;
  /** The physics behind it, with the design's own numbers. */
  why: string;
  /** What it does to the flight. */
  effect: string;
  fix?: DesignAction;
  /** Index into review.marks of the red-pen mark that points at it. */
  markIndex?: number;
}

export interface Trade {
  label: string;
  text: string;
}

const SEVERITY: Record<ReviewIssue["severity"], { label: string; chip: string }> = {
  "no-go": { label: "No-go", chip: "border-nogo text-nogo" },
  warning: { label: "Warning", chip: "border-flame text-flame" },
  ok: { label: "OK", chip: "border-go-signal text-go-signal" },
};

/** A circled issue number, the same glyph the red pen writes on the napkin. */
export function IssueNumber({ n, active }: { n: number; active?: boolean }) {
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold tabular-nums ${
        active ? "border-redpen bg-redpen text-white" : "border-redpen text-redpen"
      }`}
      aria-hidden
    >
      {n}
    </span>
  );
}

interface DesignReviewProps {
  issues: ReviewIssue[];
  trades: Trade[];
  /** Index into `issues` of the selected issue, if any. */
  selected: number | null;
  onSelect: (index: number | null) => void;
}

export default function DesignReview({ issues, trades, selected, onSelect }: DesignReviewProps) {
  return (
    <div>
      {issues.length === 0 ? (
        <p className="px-4 py-3 text-[14px] text-go-signal">No issues found. Nothing on this design stops it reaching its target.</p>
      ) : (
        <ol className="divide-y divide-rule">
          {issues.map((issue, i) => {
            const sev = SEVERITY[issue.severity];
            const active = selected === i;
            return (
              <li
                key={issue.id}
                onMouseEnter={() => onSelect(i)}
                onMouseLeave={() => onSelect(null)}
                onFocus={() => onSelect(i)}
                className={`relative flex gap-3 px-4 py-3 transition-colors ${active ? "bg-white/[0.04]" : ""}`}
              >
                {active && <span className="absolute inset-y-0 left-0 w-[2px] bg-redpen" aria-hidden />}
                <IssueNumber n={i + 1} active={active} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`border px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.16em] ${sev.chip}`}>{sev.label}</span>
                    <h4 className="text-[15px] font-semibold leading-snug text-white">{issue.title}</h4>
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-haze">{issue.why}</p>
                  <p className="mt-1 text-[13px] leading-snug text-white/85">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-haze">Effect </span>
                    {issue.effect}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {trades.length > 0 && (
        <div className="border-t border-rule px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-haze">Trade numbers</p>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
            {trades.map((t) => (
              <div key={t.label} className="contents">
                <dt className="text-haze">{t.label}</dt>
                <dd className="tabular-nums text-white">{t.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/** When the sketch can't be read as a vehicle: what's wrong, and how to draw one Penumbra can read. */
export function CantRead({ problem, samples, onSample }: { problem: string | null; samples: { id: string; title: string }[]; onSample: (id: string) => void }) {
  return (
    <div className="px-4 py-4">
      <p className="font-space text-[20px] font-semibold uppercase leading-tight tracking-[0.06em] text-white">Can&apos;t read this as a vehicle</p>
      {problem && <p className="mt-1.5 text-[14px] leading-snug text-haze">{problem}</p>}
      <ol className="mt-3 space-y-2 text-[14px] text-white">
        <li className="flex gap-3">
          <IssueNumber n={1} />
          Draw the body as two long walls, nose at the top.
        </li>
        <li className="flex gap-3">
          <IssueNumber n={2} />
          Draw a line across the body for each stage break.
        </li>
        <li className="flex gap-3">
          <IssueNumber n={3} />
          Draw engine bells along the bottom, one per engine.
        </li>
      </ol>
      <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-haze">Or start from an example</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {samples.map((s) => (
          <button key={s.id} type="button" onClick={() => onSample(s.id)} className="btn-outline h-8 px-3 text-[10px]">
            {s.title}
          </button>
        ))}
      </div>
    </div>
  );
}
