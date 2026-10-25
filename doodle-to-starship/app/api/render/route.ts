import type { Analysis, Design, RenderRequest, RenderResponse } from "@/lib/design";
import { cacheKey, cachedFile, IMAGE_EXTS, saveRemote, sha } from "@/lib/render-cache";
import { editImage, generateImage, hasXai, metered, timeouts } from "@/lib/xai";
import { buildPatchPrompt, buildRenderPrompt, buildSketchEditPrompt } from "./prompt";

const NONE: RenderResponse = { url: null, source: "none" };
/** xAI accepts png/jpg up to 20 MiB; base64 adds a third. */
const MAX_SKETCH_CHARS = 27_000_000;
/** Concepts match the 3:4 napkin so the doodle can cross-fade into them; outcomes fill the 4:3 end card. */
const ASPECT: Record<RenderRequest["kind"], string> = { concept: "3:4", outcome: "4:3", patch: "1:1" };
/** Don't start the text-to-image fallback with less time than this left in the budget. */
const MIN_FALLBACK_MS = 8_000;

export function POST(request: Request) {
  return metered(() => handle(request));
}

async function handle(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<RenderRequest> | null;
  if (!body?.design) return Response.json(NONE);

  try {
    const kind = body.kind === "outcome" || body.kind === "patch" ? body.kind : "concept";
    const sketch =
      typeof body.sketch === "string" &&
      /^data:image\/(png|jpe?g);base64,/.test(body.sketch) &&
      body.sketch.length <= MAX_SKETCH_CHARS
        ? body.sketch
        : null;

    // A cached render is served even without a key or network: that's the offline demo.
    const key = renderKey(kind, body.design, body.analysis, sketch);
    const hit = await cachedFile(key, IMAGE_EXTS);
    if (hit) return Response.json({ url: hit, source: "grok" } satisfies RenderResponse);
    if (!hasXai()) return Response.json(NONE);

    let url: string | null;
    if (kind === "patch") {
      url = await generateImage(buildPatchPrompt(body.design), { aspect_ratio: ASPECT.patch });
    } else {
      // Prefer editing the user's own napkin into a photo; fall back to plain text-to-image, all
      // within one image budget so a slow edit can't double the wait.
      const deadline = Date.now() + timeouts().image;
      url = sketch
        ? await editImage(
            buildSketchEditPrompt(body.design, body.analysis, kind),
            sketch,
            { aspect_ratio: ASPECT[kind] },
            deadline - Date.now(),
          )
        : null;
      const left = deadline - Date.now();
      if (!url && left >= MIN_FALLBACK_MS) {
        url = await generateImage(buildRenderPrompt(body.design, body.analysis, kind), { aspect_ratio: ASPECT[kind] }, left);
      }
    }
    if (!url) return Response.json(NONE);
    // xAI URLs are temporary: keep a local copy and hand that out instead.
    return Response.json({ url: (await saveRemote(key, url, "jpg")) ?? url, source: "grok" } satisfies RenderResponse);
  } catch (err) {
    console.warn("[api/render] failed:", err);
    return Response.json(NONE);
  }
}

/**
 * Cache key. Sketch renders are keyed by the napkin PNG (deterministic for the same strokes in the
 * same browser), so they hit whether Grok or geometry read the sketch. A concept doesn't depend on
 * the verdict; an outcome does, and on where it was headed. Patches are keyed by their prompt.
 */
function renderKey(
  kind: RenderRequest["kind"],
  design: Partial<Design>,
  analysis: Partial<Analysis> | undefined,
  sketch: string | null,
): string {
  if (kind === "patch") return cacheKey({ kind, prompt: buildPatchPrompt(design) });
  const subject = sketch ? { sketch: sha(sketch) } : { prompt: buildRenderPrompt(design, analysis, kind) };
  // Aspect and style are in the key so renders made at an older shape or look are never served.
  if (kind === "concept") return cacheKey({ kind, aspect: ASPECT.concept, style: "iso-v2", ...subject });
  return cacheKey({ kind, ...subject, verdict: analysis?.verdict ?? null, destination: design.destination ?? null });
}
