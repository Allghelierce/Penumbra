import type { RenderRequest, RenderResponse } from "@/lib/design";
import { generateImage, hasXai } from "@/lib/xai";
import { buildRenderPrompt } from "./prompt";

const NONE: RenderResponse = { url: null, source: "none" };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<RenderRequest> | null;
  if (!hasXai() || !body?.design) return Response.json(NONE);

  try {
    const prompt = buildRenderPrompt(body.design, body.analysis, body.kind === "outcome" ? "outcome" : "concept");
    const url = await generateImage(prompt);
    return Response.json(url ? ({ url, source: "grok" } satisfies RenderResponse) : NONE);
  } catch (err) {
    console.warn("[api/render] failed:", err);
    return Response.json(NONE);
  }
}
