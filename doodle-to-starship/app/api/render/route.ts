import type { RenderRequest, RenderResponse } from "@/lib/design";
import { editImage, generateImage, hasXai, metered, timeouts } from "@/lib/xai";
import { buildPatchPrompt, buildRenderPrompt, buildSketchEditPrompt } from "./prompt";

const NONE: RenderResponse = { url: null, source: "none" };
/** xAI accepts png/jpg up to 20 MiB; base64 adds a third. */
const MAX_SKETCH_CHARS = 27_000_000;
/** Don't start the text-to-image fallback with less time than this left in the budget. */
const MIN_FALLBACK_MS = 8_000;

export function POST(request: Request) {
  return metered(() => handle(request));
}

async function handle(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<RenderRequest> | null;
  if (!hasXai() || !body?.design) return Response.json(NONE);

  try {
    if (body.kind === "patch") {
      const patch = await generateImage(buildPatchPrompt(body.design), { aspect_ratio: "1:1" });
      return Response.json(patch ? ({ url: patch, source: "grok" } satisfies RenderResponse) : NONE);
    }

    const kind = body.kind === "outcome" ? "outcome" : "concept";
    const sketch = body.sketch;
    // Prefer editing the user's own napkin into a photo; fall back to plain text-to-image, all
    // within one image budget so a slow edit can't double the wait.
    const deadline = Date.now() + timeouts().image;
    let url: string | null = null;
    if (typeof sketch === "string" && /^data:image\/(png|jpe?g);base64,/.test(sketch) && sketch.length <= MAX_SKETCH_CHARS) {
      url = await editImage(buildSketchEditPrompt(body.design, body.analysis, kind), sketch, deadline - Date.now());
    }
    const left = deadline - Date.now();
    if (!url && left >= MIN_FALLBACK_MS) {
      url = await generateImage(buildRenderPrompt(body.design, body.analysis, kind), undefined, left);
    }
    return Response.json(url ? ({ url, source: "grok" } satisfies RenderResponse) : NONE);
  } catch (err) {
    console.warn("[api/render] failed:", err);
    return Response.json(NONE);
  }
}
