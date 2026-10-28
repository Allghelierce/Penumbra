import type { PartKind, SketchReading } from "@/lib/design";

// One line saying what the reader found in the sketch, tagged with which reader found it.

const PART_NAMES: Partial<Record<PartKind, string>> = {
  fin: "fins",
  nose: "nose cone",
  payload: "payload",
  "heat-shield": "heat shield",
  "landing-legs": "landing legs",
  "solar-panel": "solar panels",
  window: "crew window",
};

/** "2 stages · 9 engines · grid fins · fairing". Specific labels ("Grid fins") win over the generic part name. */
export function identifiedLine(reading: SketchReading): string {
  const stages = reading.design.stages.length;
  const engines = reading.design.stages.reduce((n, s) => n + s.engines.reduce((m, c) => m + c.count, 0), 0);
  const items = [`${stages} ${stages === 1 ? "stage" : "stages"}`, `${engines} ${engines === 1 ? "engine" : "engines"}`];
  const seen = new Set<PartKind>();
  for (const part of reading.parts) {
    const generic = PART_NAMES[part.kind];
    if (!generic || seen.has(part.kind)) continue;
    seen.add(part.kind);
    const label = part.label.trim().toLowerCase();
    items.push(label.includes(" ") && label.length <= 20 ? label : generic);
  }
  return items.join(" · ");
}

export default function VisionIdentified({ reading, source }: { reading: SketchReading | null; source: "grok" | "geometry" }) {
  const grok = source === "grok";
  return (
    <section className="module">
      <header className="module-head">
        <h3 className="font-space text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
          {grok ? "Grok vision identified" : "Geometry reader identified"}
        </h3>
        <span className="border border-rule px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-haze">
          {grok ? "Grok vision" : "Offline reader"}
        </span>
      </header>
      <p className="px-4 py-3 font-space text-[15px] font-medium uppercase tracking-[0.1em] text-white">
        {reading ? identifiedLine(reading) : <span className="text-haze">Reading the sketch…</span>}
      </p>
    </section>
  );
}
