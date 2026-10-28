import type { Analysis, Review } from "@/lib/design";

// Grok rewrites the red-pen copy; these checks make sure it only changes the words.

export const NOTE_MAX_WORDS = 6;
export const SUMMARY_MAX_WORDS = 30;

export const COPY_SYSTEM =
  "You are a veteran SpaceX propulsion engineer marking up a napkin rocket sketch in red pen. " +
  "Dry, witty and precise. Never mean, never wrong.";

export const COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "notes"],
  properties: {
    summary: { type: "string" },
    notes: { type: "array", items: { type: "string" } },
  },
};

export interface CopyRewrite {
  summary: string;
  notes: string[];
}

export function buildCopyPrompt(review: Review, analysis: Partial<Analysis> | undefined): string {
  return [
    "Rewrite this red-pen review of a rocket sketch so it is witty but still accurate.",
    `- summary: one sentence, at most ${SUMMARY_MAX_WORDS} words.`,
    `- notes: exactly ${review.marks.length}, in the same order, each ${NOTE_MAX_WORDS} words or fewer.`,
    "- Keep every number exactly as written (signs, %, units). Do not add, round or drop numbers.",
    "",
    JSON.stringify(
      {
        verdict: analysis?.verdict,
        findings: analysis?.findings,
        summary: review.summary,
        notes: review.marks.map((m) => m.note),
      },
      null,
      2,
    ),
  ].join("\n");
}

/** Apply each rewritten line only where it keeps the original's numbers and fits the word limit. */
export function applyRewrite(review: Review, rewrite: CopyRewrite | null): { review: Review; changed: boolean } {
  if (!rewrite || !Array.isArray(rewrite.notes) || rewrite.notes.length !== review.marks.length) {
    return { review, changed: false };
  }
  let changed = false;
  const pick = (original: string, candidate: unknown, maxWords: number) => {
    if (!acceptable(original, candidate, maxWords)) return original;
    const text = candidate.trim();
    changed ||= text !== original;
    return text;
  };
  const marks = review.marks.map((mark, i) => ({ ...mark, note: pick(mark.note, rewrite.notes[i], NOTE_MAX_WORDS) }));
  const summary = pick(review.summary, rewrite.summary, SUMMARY_MAX_WORDS);
  return { review: { marks, summary }, changed };
}

function acceptable(original: string, candidate: unknown, maxWords: number): candidate is string {
  if (typeof candidate !== "string") return false;
  const text = candidate.trim();
  if (!text || text.split(/\s+/).length > maxWords) return false;
  return sameNumbers(original, text);
}

/** True when both strings contain exactly the same set of numbers ("1,200" and "1200" match). */
export function sameNumbers(a: string, b: string): boolean {
  const na = numbersIn(a);
  const nb = numbersIn(b);
  return na.size === nb.size && [...na].every((n) => nb.has(n));
}

function numbersIn(text: string): Set<string> {
  return new Set((text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => String(Number(n.replace(/,/g, "")))));
}
