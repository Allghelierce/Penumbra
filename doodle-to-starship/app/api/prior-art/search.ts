// Prior art from the NASA Technical Reports Server (NTRS). NTRS matches every term of a
// query, so the studio's long descriptive queries usually return nothing. Instead we run a
// few relaxed versions in parallel (the full query, the query without each pair of adjacent
// terms, and short prefixes) and take the most specific matches first.

import type { PriorArtResult } from "@/lib/design";

const NTRS_SEARCH = "https://ntrs.nasa.gov/api/citations/search";
const CACHE_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6000;
/** Prefer work from this year on; older reports only fill in when there aren't enough. */
const RECENT_SINCE = "2000";
const ABSTRACT_MAX = 300;
const MAX_TERMS = 10;
const MAX_QUERIES = 10;
/** E.g. one query term in the title plus one in the abstract. */
const MIN_RELEVANCE = 3;

const STOPWORDS = new Set(["a", "an", "and", "for", "in", "of", "on", "or", "the", "to", "with", "into", "from", "by"]);
/** Whole conference volumes, bare abstracts, posters, slides and videos rarely help an engineer. */
const SKIP_TYPES = new Set([
  "ABSTRACT",
  "EXTENDED_ABSTRACT",
  "CONFERENCE_PROCEEDINGS",
  "POSTER",
  "VIDEO",
  "Slides (Viewgraph)",
]);

/** The fields we use from an NTRS citation. */
interface Citation {
  id: number | string;
  title?: string;
  abstract?: string;
  stiType?: string;
  publications?: { publicationDate?: string }[];
  submittedDate?: string;
}

type Fetch = typeof fetch;

const cache = new Map<string, { at: number; results: PriorArtResult[] }>();

export function clearPriorArtCache() {
  cache.clear();
}

export async function searchPriorArt(q: string, limit: number, fetchImpl: Fetch = fetch): Promise<PriorArtResult[]> {
  const terms = toTerms(q);
  if (terms.length === 0) return [];

  const key = `${terms.join(" ")}|${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results;

  const queries = candidateQueries(terms);
  let results = await collect(queries, terms, limit, { "published.gte": RECENT_SINCE }, fetchImpl);
  if (results.length < limit) {
    const older = await collect(queries, terms, limit, {}, fetchImpl);
    const seen = new Set(results.map(titleKey));
    results = [...results, ...older.filter((r) => !seen.has(titleKey(r)))].slice(0, limit);
  }

  // Don't cache an empty answer: it's usually NTRS being down, not a real "nothing found".
  if (results.length > 0) cache.set(key, { at: Date.now(), results });
  return results;
}

function toTerms(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .slice(0, MAX_TERMS);
}

/** Most specific first: everything, then everything but one adjacent pair, then short prefixes. */
function candidateQueries(terms: string[]): string[] {
  const out: string[][] = [terms];
  if (terms.length >= 4) {
    // Keep the first term: the studio leads with the destination, the main subject.
    for (let i = 1; i + 2 <= terms.length; i++) out.push([...terms.slice(0, i), ...terms.slice(i + 2)]);
  }
  for (const n of [4, 3, 2]) if (n < terms.length) out.push(terms.slice(0, n));
  return [...new Set(out.map((t) => t.join(" ")))].slice(0, MAX_QUERIES);
}

/**
 * Runs every query, keeps reports whose title and abstract actually talk about the terms
 * (NTRS also matches deep inside full texts), and ranks them: most relevant first, then
 * found by the more specific query, then newer. Talks and papers that share a title count once.
 */
async function collect(
  queries: string[],
  terms: string[],
  limit: number,
  filters: Record<string, string>,
  fetchImpl: Fetch,
): Promise<PriorArtResult[]> {
  const pages = await Promise.all(queries.map((q) => fetchCitations(q, limit + 5, filters, fetchImpl)));
  const ranked: { result: PriorArtResult; score: number; query: number }[] = [];
  pages.forEach((page, query) => {
    for (const citation of page) {
      if (!citation.title || SKIP_TYPES.has(citation.stiType ?? "")) continue;
      const result = toResult(citation);
      const score = relevance(citation.title, citation.abstract ?? "", terms);
      if (score >= MIN_RELEVANCE) ranked.push({ result, score, query });
    }
  });
  ranked.sort((a, b) => b.score - a.score || a.query - b.query || (b.result.year ?? 0) - (a.result.year ?? 0));

  const out: PriorArtResult[] = [];
  const seen = new Set<string>();
  for (const { result } of ranked) {
    if (out.length >= limit) break;
    if (seen.has(titleKey(result))) continue;
    seen.add(titleKey(result));
    out.push(result);
  }
  return out;
}

/** Query terms in the title count 2, in the abstract 1. Words match on a shared stem, so "landing" matches "lander". */
function relevance(titleText: string, abstractText: string, terms: string[]) {
  const words = (text: string) => new Set(text.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean));
  const title = words(titleText);
  const abstract = words(abstractText);
  const has = (set: Set<string>, term: string) => {
    const stem = term.length > 5 ? term.slice(0, 5) : term;
    for (const w of set) if (w === term || (stem.length >= 4 && w.startsWith(stem))) return true;
    return false;
  };
  return terms.reduce((score, t) => score + (has(title, t) ? 2 : has(abstract, t) ? 1 : 0), 0);
}

/** The start of the title, so a talk and its paper, or a re-upload with a typo fixed, count once. */
function titleKey(result: PriorArtResult) {
  return result.title.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30);
}

async function fetchCitations(
  q: string,
  size: number,
  filters: Record<string, string>,
  fetchImpl: Fetch,
): Promise<Citation[]> {
  try {
    const params = new URLSearchParams({ q, "page.size": String(size), ...filters });
    const res = await fetchImpl(`${NTRS_SEARCH}?${params}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: Citation[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

function toResult(c: Citation): PriorArtResult {
  const id = String(c.id);
  const date = c.publications?.[0]?.publicationDate ?? c.submittedDate ?? "";
  const year = Number(date.slice(0, 4));
  return {
    id,
    title: c.title!.replace(/\s+/g, " ").trim(),
    year: Number.isInteger(year) && year > 1900 ? year : null,
    abstract: clip((c.abstract ?? "").replace(/\s+/g, " ").trim(), ABSTRACT_MAX),
    url: `https://ntrs.nasa.gov/citations/${id}`,
  };
}

/** Cuts at a word boundary so the result, ellipsis included, fits in `max` characters. */
function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}
