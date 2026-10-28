import { searchPriorArt } from "./search";

/** GET /api/prior-art?q=...&limit=3 returns { results: PriorArtResult[] }, and never an error status. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? "";
  const limit = Math.min(10, Math.max(1, Math.round(Number(params.get("limit")) || 5)));
  try {
    return Response.json({ results: await searchPriorArt(q, limit) });
  } catch {
    return Response.json({ results: [] });
  }
}
