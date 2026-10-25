import type { Review, ReviewRequest, ReviewResponse } from "@/lib/design";
import { buildReview } from "@/lib/redpen";
import { chatJson, hasXai, metered } from "@/lib/xai";
import { applyRewrite, buildCopyPrompt, COPY_SCHEMA, COPY_SYSTEM, type CopyRewrite } from "./copy";

export function POST(request: Request) {
  return metered(() => handle(request));
}

async function handle(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<ReviewRequest> | null;

  let review: Review;
  try {
    if (!body?.reading || !body.analysis) throw new Error("expected { reading, analysis }");
    review = buildReview(body.reading, body.analysis);
  } catch (err) {
    console.warn("[api/review] buildReview failed:", err);
    review = { marks: [], summary: "The red pen ran dry: this design couldn't be reviewed." };
    return Response.json({ review, source: "rules" } satisfies ReviewResponse);
  }

  if (hasXai()) {
    const rewrite = await chatJson<CopyRewrite>({
      system: COPY_SYSTEM,
      prompt: buildCopyPrompt(review, body.analysis),
      schema: COPY_SCHEMA,
      schemaName: "red_pen_copy",
    });
    const polished = applyRewrite(review, rewrite);
    if (polished.changed) return Response.json({ review: polished.review, source: "grok" } satisfies ReviewResponse);
  }

  return Response.json({ review, source: "rules" } satisfies ReviewResponse);
}
