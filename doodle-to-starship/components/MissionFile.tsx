"use client";

// The mission file for a real flight: what flew, where and when, what happened, what broke,
// the numbers that mattered in plain words, and where it's all documented.

import type { HistoricMission } from "@/lib/design";

const formatDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
};

function Section({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="module">
      <header className="module-head">
        <h3 className="font-space text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">{title}</h3>
        {meta}
      </header>
      {children}
    </section>
  );
}

export default function MissionFile({ mission, onLaunch, canLaunch }: { mission: HistoricMission; onLaunch: () => void; canLaunch: boolean }) {
  const lost = mission.outcome === "lost";
  return (
    <aside className="flex flex-col gap-3 p-3">
      <Section
        title="Mission file"
        meta={
          <span className={`font-space text-[12px] font-semibold tracking-[0.2em] ${lost ? "text-nogo" : "text-go-signal"}`}>
            <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${lost ? "bg-nogo" : "bg-go-signal"}`} />
            {lost ? "LOST" : "SUCCESS"}
          </span>
        }
      >
        <div className="px-4 py-3">
          <p className="font-space text-[24px] font-semibold uppercase leading-tight tracking-[0.06em] text-white">{mission.vehicle}</p>
          <p className="mt-0.5 text-[15px] text-white/85">{mission.mission}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
            <dt className="text-[10px] uppercase leading-5 tracking-[0.18em] text-haze">Date</dt>
            <dd className="text-white">{formatDate(mission.date)}</dd>
            <dt className="text-[10px] uppercase leading-5 tracking-[0.18em] text-haze">Site</dt>
            <dd className="text-white">{mission.site}</dd>
          </dl>
          <button type="button" onClick={onLaunch} disabled={!canLaunch} className="btn-solid mt-4 h-10 w-full text-[12px]">
            Replay the flight
          </button>
        </div>
      </Section>

      {mission.failure && (
        <Section title="What failed" meta={<span className="text-[12px] text-nogo">Marked in red on the drawing</span>}>
          <div className="px-4 py-3">
            <p className="text-[16px] font-semibold leading-snug text-white">{mission.failure.label}</p>
            <p className="mt-1.5 text-[14px] leading-snug text-haze">{mission.failure.detail}</p>
          </div>
        </Section>
      )}

      <Section title="Why it happened">
        <div className="space-y-3 px-4 py-3 text-[14px] leading-snug">
          <p className="text-white/90">{mission.rootCause}</p>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-haze">What changed</p>
            <p className="mt-1 text-white/90">{mission.whatChanged}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-haze">Return to flight</p>
            <p className="mt-1 text-go-signal">{mission.returnToFlight}</p>
          </div>
        </div>
      </Section>

      {mission.stats.length > 0 && (
        <Section title="The numbers">
          <ul className="divide-y divide-rule">
            {mission.stats.map((s) => (
              <li key={s.label} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] uppercase tracking-[0.14em] text-haze">{s.label}</span>
                  <span className="font-space text-[18px] font-medium tabular-nums text-white">{s.value}</span>
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-white/75">{s.meaning}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {mission.sources.length > 0 && (
        <Section title="Sources">
          <ul className="space-y-1.5 px-4 py-3">
            {mission.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-[13px] leading-snug text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </aside>
  );
}
