// Fallback intent parser: turns a spoken command into DesignActions with a few
// regexes. Used when Grok Voice isn't available (no XAI_API_KEY) and by the
// typed-command box in the dock.

import type { Design, DesignAction, DestinationId, EngineId } from "../design";

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** "thirty three raptors" -> "33 raptors", "one hundred and fifty tons" -> "150 tons". */
export function normalizeNumbers(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current: number | null = null;
  const flush = () => {
    if (current !== null) out.push(String(current));
    current = null;
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const bare = w.replace(/-/g, " ");
    // Hyphenated compounds: "thirty-three".
    const parts = bare.split(" ");
    if (parts.length > 1 && parts.every((p) => p in UNITS || p in TENS)) {
      current = (current ?? 0) + parts.reduce((s, p) => s + (UNITS[p] ?? TENS[p]), 0);
      continue;
    }
    if (w in UNITS || w in TENS) {
      current = (current ?? 0) + (UNITS[w] ?? TENS[w]);
    } else if (w === "hundred" || w === "thousand") {
      current = (current ?? 1) * (w === "hundred" ? 100 : 1000);
    } else if (w === "and" && current !== null && i + 1 < words.length && (words[i + 1] in UNITS || words[i + 1] in TENS)) {
      // "hundred and fifty": keep accumulating.
    } else {
      flush();
      out.push(w);
    }
  }
  flush();
  return out.join(" ");
}

function clean(text: string): string {
  const lowered = text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/(\d),(\d{3})/g, "$1$2") // 1,500 -> 1500
    .replace(/(\d)\s*%/g, "$1 percent")
    .replace(/\bper cent\b/g, "percent")
    .replace(/[^a-z0-9.%'\- ]+/g, " ");
  return normalizeNumbers(lowered).replace(/\s+/g, " ").trim();
}

const NUM = String.raw`(\d+(?:\.\d+)?)`;

function destinationIn(text: string): DestinationId | null {
  const landing = /\b(land|landing|lands|surface|touch ?down|set (it|her) down)\b/.test(text);
  if (/\b(europa|jupiter)\b/.test(text)) return "europa";
  if (/\b(mars|martian|red planet)\b/.test(text)) return landing ? "mars-surface" : "mars-transfer";
  if (/\b(moon|lunar|luna)\b/.test(text)) return landing ? "moon-surface" : "moon-orbit";
  if (/\b(gto|geo|geostationary|geosynchronous)\b/.test(text)) return "gto";
  if (/\b(leo|low earth orbit|earth orbit|low orbit|orbit|space station|iss)\b/.test(text)) return "leo";
  return null;
}

const ENGINE_WORDS: [RegExp, EngineId][] = [
  [/\b(vacuum raptors?|raptor vacuums?|raptor vacs?|r ?vacs?)\b/, "raptor-vacuum"],
  [/\b(vacuum merlins?|merlin vacuums?|merlin vacs?|m ?vacs?)\b/, "merlin-vacuum"],
  [/\braptors?\b/, "raptor-3"],
  [/\bmerlins?\b/, "merlin-1d"],
  [/\b(rs ?-?25s?|shuttle engines?|space shuttle main engines?)\b/, "rs-25"],
  [/\b(rl ?-?10s?|rl ?-?10 ?cs?)\b/, "rl10c"],
  [/\b(f ?-?1s?|f ones?|saturn engines?)\b/, "f-1"],
  [/\b(j ?-?2s?)\b/, "j-2"],
  [/\b(be ?-?4s?|blue origin engines?)\b/, "be-4"],
  [/\b(rd ?-?180s?)\b/, "rd-180"],
  [/\brutherfords?\b/, "rutherford"],
  [/\b(solid rocket motors?|solids?|srbs?)\b/, "generic-solid"],
];

function stageIndexIn(text: string, design: Design | null): number {
  const last = Math.max(0, (design?.stages.length ?? 1) - 1);
  const ordinal = text.match(/\b(first|second|third|1st|2nd|3rd)\s+stage\b|\bstage\s+(\d)\b/);
  if (ordinal) {
    const word = ordinal[1] ?? ordinal[2];
    const n = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3 }[word] ?? Number(word);
    return Math.min(last, Math.max(0, n - 1));
  }
  if (/\b(upper|top|ship|last)\b/.test(text)) return last;
  return 0;
}

function parseTanks(text: string, design: Design | null): DesignAction | null {
  if (!/\b(tanks?|fuel|propellant|prop|gas)\b/.test(text)) return null;
  const shrink = /\b(shrink|smaller|shorter|cut|reduce|less|trim|squash|halve|half)\b/.test(text);
  const grow = /\b(stretch|bigger|longer|grow|enlarge|increase|more|extend|double|triple|taller|add|fatter|pump)\b/.test(text);
  if (!shrink && !grow) return null;

  let factor: number;
  const percent = text.match(new RegExp(`${NUM} percent`));
  const times = text.match(new RegExp(`${NUM} ?(x|times)\\b`));
  if (percent) {
    const p = Number(percent[1]) / 100;
    factor = shrink ? 1 - p : 1 + p;
  } else if (times) {
    factor = Number(times[1]);
  } else if (/\bdouble\b/.test(text)) {
    factor = 2;
  } else if (/\btriple\b/.test(text)) {
    factor = 3;
  } else if (/\b(halve|half)\b/.test(text)) {
    factor = 0.5;
  } else {
    factor = shrink ? 1 / 1.3 : 1.3;
  }
  factor = Math.min(10, Math.max(0.1, Math.round(factor * 1000) / 1000));
  return { type: "scale-tanks", stageIndex: stageIndexIn(text, design), factor };
}

function parseEngines(text: string, design: Design | null): DesignAction | null {
  const stageIndex = stageIndexIn(text, design);
  const cluster = design?.stages[stageIndex]?.engines[0];
  for (const [re, engine] of ENGINE_WORDS) {
    const m = text.match(re);
    if (!m) continue;
    const before = text.slice(0, m.index);
    const count = before.match(new RegExp(`${NUM}\\s*(more |extra |additional )?(\\w+ )?$`));
    if (count) {
      const n = Math.round(Number(count[1]));
      const relative = Boolean(count[2]) || /\badd\b/.test(before);
      const base = relative && cluster?.engine === engine ? cluster.count : 0;
      return { type: "set-engines", stageIndex, engine, count: Math.max(1, base + n) };
    }
    // "swap to raptors" keeps the current count.
    if (/\b(swap|switch|change|use|replace|give it|put)\b/.test(text)) {
      return { type: "set-engines", stageIndex, engine, count: cluster?.count ?? 1 };
    }
  }
  // "more engines", "add 3 engines"
  if (cluster && /\bengines?\b/.test(text)) {
    const add = text.match(new RegExp(`${NUM}\\s*(more |extra |additional )?engines?`));
    if (add) {
      const n = Math.round(Number(add[1]));
      const relative = Boolean(add[2]) || /\badd\b/.test(text);
      return { type: "set-engines", stageIndex, engine: cluster.engine, count: Math.max(1, relative ? cluster.count + n : n) };
    }
    if (/\b(more|extra|another|add)\b/.test(text)) {
      return { type: "set-engines", stageIndex, engine: cluster.engine, count: Math.max(cluster.count + 1, Math.ceil(cluster.count * 1.5)) };
    }
    if (/\b(fewer|less|remove|drop)\b/.test(text)) {
      return { type: "set-engines", stageIndex, engine: cluster.engine, count: Math.max(1, Math.floor(cluster.count / 1.5)) };
    }
  }
  return null;
}

function parsePayload(text: string): DesignAction | null {
  const m = text.match(new RegExp(`${NUM}\\s*(metric tons?|tons?|tonnes?|t|kilos?|kilograms?|kgs?)\\b`));
  if (!m) return null;
  if (!/\b(payload|cargo|carry|lift|haul|deliver|crew|load)\b/.test(text) && !/\btons?|tonnes?\b/.test(m[2])) return null;
  const n = Number(m[1]);
  const kg = /^k/.test(m[2]) ? n : n * 1000;
  return { type: "set-payload", payloadMassKg: Math.round(kg) };
}

function parseStage(text: string, design: Design | null): DesignAction | null {
  if (!/\b(stages?|boosters?)\b/.test(text)) return null;
  if (/\b(remove|drop|delete|lose|ditch|take off|get rid of|scrap|kill)\b/.test(text)) {
    const last = Math.max(0, (design?.stages.length ?? 1) - 1);
    const bottom = /\b(booster|bottom|first|lower)\b/.test(text) && !/\b(top|upper|last)\b/.test(text);
    return { type: "remove-stage", stageIndex: bottom ? 0 : last };
  }
  if (/\b(add|another|extra|one more|stick|bolt|strap|stack|put|give it|more)\b/.test(text)) {
    return { type: "add-stage" };
  }
  return null;
}

function parseClause(text: string, design: Design | null): DesignAction | null {
  if (!text) return null;
  const specific =
    parseTanks(text, design) ?? parseEngines(text, design) ?? parsePayload(text) ?? parseStage(text, design);
  if (specific) return specific;

  const destination = destinationIn(text);
  if (destination) return { type: "set-destination", destination };

  if (/\b(launch|lift ?off|light (it|the candle|this candle)|send it|fly it|let's fly|go for launch|ignition|ignite|blast off|light it up|full send)\b/.test(text)) {
    return { type: "launch" };
  }
  if (/\b(review|check|look at|what do you think|thoughts|how's it|how is it|how does it|analy[sz]e|critique|grade|rate it|will it (fly|work|make it)|does it (fly|work)|is it good)\b/.test(text)) {
    return { type: "review" };
  }
  return null;
}

/**
 * Parse a spoken or typed command into zero or more DesignActions.
 * Compound commands are split on "and"/"then"/commas: "add a stage and send it to Mars".
 */
export function parseCommand(text: string, design: Design | null): DesignAction[] {
  const cleaned = clean(text);
  const clauses = cleaned.split(/\s*(?:,|;|\band then\b|\bthen\b|\band\b|\bafter\b|\bbefore\b|\bplus\b|\balso\b)\s*/);
  const actions: DesignAction[] = [];
  for (const clause of clauses) {
    const action = parseClause(clause.trim(), design);
    if (!action) continue;
    const prev = actions[actions.length - 1];
    if (prev && JSON.stringify(prev) === JSON.stringify(action)) continue;
    actions.push(action);
  }
  // "Launch" always goes last so edits land before liftoff.
  const launches = actions.filter((a) => a.type === "launch");
  return [...actions.filter((a) => a.type !== "launch"), ...launches.slice(0, 1)];
}
