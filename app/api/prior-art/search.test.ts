import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";
import { clearPriorArtCache, searchPriorArt } from "./search";

type Citation = {
  id: number;
  title: string;
  abstract?: string;
  stiType?: string;
  publications?: { publicationDate: string }[];
};

function citation(id: number, title: string, abstract: string, year = 2015, stiType = "CONFERENCE_PAPER"): Citation {
  return { id, title, abstract, stiType, publications: [{ publicationDate: `${year}-06-01T00:00:00.0000000+00:00` }] };
}

/** A fake NTRS: answers each query with the citations whose "q" it was given. */
function fakeNtrs(byQuery: Record<string, Citation[]>) {
  return vi.fn(async (input: string | URL | Request) => {
    const q = new URL(String(input)).searchParams.get("q") ?? "";
    return Response.json({ results: byQuery[q] ?? [], stats: { total: (byQuery[q] ?? []).length } });
  });
}

const MEDLI = citation(
  20170009078,
  "Mars 2020 Entry, Descent, and Landing Instrumentation 2 (MEDLI2) Sensor Suite",
  "MEDLI2 measures the heat shield and backshell of Mars 2020 during entry, descent and landing. ".repeat(6),
  2017,
);
const MSL = citation(20110014965, "Mars Science Laboratory heat shield flight data", "Thermocouples in the Mars entry heat shield measured ...", 2011);

beforeEach(() => clearPriorArtCache());
afterEach(() => vi.unstubAllGlobals());

describe("searchPriorArt", () => {
  it("maps NTRS citations to sticky-note results", async () => {
    const fetch = fakeNtrs({ "mars entry heat shield": [MEDLI] });
    const [result] = await searchPriorArt("Mars entry heat shield", 3, fetch);
    expect(result).toEqual({
      id: "20170009078",
      title: MEDLI.title,
      year: 2017,
      abstract: expect.stringMatching(/^MEDLI2 measures the heat shield/),
      url: "https://ntrs.nasa.gov/citations/20170009078",
    });
    expect(result.abstract.length).toBeLessThanOrEqual(300);
    expect(result.abstract.endsWith("…")).toBe(true);
  });

  it("relaxes a query NTRS can't match in full, most specific match first", async () => {
    // NTRS matches every term, so the full query finds nothing; dropping "liquid methane" works.
    const fetch = fakeNtrs({
      "mars entry descent landing heat shield": [MEDLI],
      "mars entry": [MSL],
    });
    const results = await searchPriorArt("Mars entry descent landing liquid methane heat shield", 3, fetch);
    expect(results.map((r) => r.id)).toEqual(["20170009078", "20110014965"]);
    const asked = fetch.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("q"));
    expect(asked).toContain("mars entry descent landing liquid methane heat shield");
    expect(asked).toContain("mars entry descent landing heat shield");
  });

  it("drops conference volumes, bare abstracts and reports that only mention the terms deep in their text", async () => {
    const fetch = fakeNtrs({
      "mars heat shield": [
        citation(1, "Lunar and Planetary Science XXXI", "Mars heat shield", 2000, "CONFERENCE_PROCEEDINGS"),
        citation(2, "Mars heat shield testing", "Arc jet tests", 2014, "ABSTRACT"),
        citation(3, "Surface Water Systems Portfolio Closeout Report", "Water pumps and pipes.", 2026, "OTHER"),
        MSL,
      ],
    });
    const results = await searchPriorArt("Mars heat shield", 3, fetch);
    expect(results.map((r) => r.id)).toEqual(["20110014965"]);
  });

  it("counts a talk and its paper with the same title once", async () => {
    const talk = { ...MEDLI, id: 20170009080, stiType: "PRESENTATION" };
    const fetch = fakeNtrs({ "mars entry heat shield": [MEDLI, talk] });
    expect(await searchPriorArt("Mars entry heat shield", 3, fetch)).toHaveLength(1);
  });

  it("respects the limit", async () => {
    const many = Array.from({ length: 8 }, (_, i) => citation(100 + i, `Mars heat shield study ${i}`, "Mars heat shield"));
    const fetch = fakeNtrs({ "mars heat shield": many });
    expect(await searchPriorArt("Mars heat shield", 3, fetch)).toHaveLength(3);
  });

  it("serves a repeat query from the cache", async () => {
    const fetch = fakeNtrs({ "mars entry heat shield": [MEDLI] });
    await searchPriorArt("Mars entry heat shield", 3, fetch);
    const calls = fetch.mock.calls.length;
    await searchPriorArt("Mars entry heat shield", 3, fetch);
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it("returns nothing, and caches nothing, when NTRS is down", async () => {
    const down = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    expect(await searchPriorArt("Mars entry heat shield", 3, down)).toEqual([]);
    const up = fakeNtrs({ "mars entry heat shield": [MEDLI] });
    expect(await searchPriorArt("Mars entry heat shield", 3, up)).toHaveLength(1);
  });

  it("asks for nothing on an empty query", async () => {
    const fetch = fakeNtrs({});
    expect(await searchPriorArt("  the of  ", 3, fetch)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("GET /api/prior-art", () => {
  it("answers { results } with the limit applied", async () => {
    vi.stubGlobal("fetch", fakeNtrs({ "mars entry heat shield": [MEDLI, MSL] }));
    const res = await GET(new Request("http://localhost/api/prior-art?q=Mars%20entry%20heat%20shield&limit=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].url).toMatch(/^https:\/\/ntrs\.nasa\.gov\/citations\//);
  });

  it("answers 200 with no results when NTRS fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502 })));
    const res = await GET(new Request("http://localhost/api/prior-art?q=Mars%20entry"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });
});
