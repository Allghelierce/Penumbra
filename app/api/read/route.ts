import type { ReadRequest, ReadResponse } from "@/lib/design";
import { readFromGeometry } from "@/lib/sketch/geometry";
import { isDestinationId } from "@/lib/sketch/ids";
import { buildReadPrompt, READ_SYSTEM, READING_SCHEMA, sanitizeReading, type GrokReading } from "@/lib/sketch/vision";
import { flyAsRealRocket } from "@/lib/presets";
import { metered, paidCallsAllowed, visionJson } from "@/lib/xai";

export function POST(request: Request) {
  return metered(() => handle(request));
}

async function handle(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<ReadRequest> | null;
  const destination = isDestinationId(body?.destination) ? body.destination : "leo";

  try {
    const geometry = readFromGeometry(body?.strokes ?? [], destination);

    const image = body?.image;
    // No key or no budget left: answer from geometry at once rather than queueing a call that can't run.
    if (paidCallsAllowed() && typeof image === "string" && image.startsWith("data:image/")) {
      const raw = await visionJson<GrokReading>({
        image,
        system: READ_SYSTEM,
        prompt: buildReadPrompt(geometry),
        schema: READING_SCHEMA,
        schemaName: "sketch_reading",
      });
      const reading = sanitizeReading(raw, destination);
      if (reading) {
        // Trust the more doubtful of the two judges, and explain with whichever one doubted.
        const grok = reading.confidence ?? 1;
        const geo = geometry.confidence ?? 1;
        const confidence = Math.min(grok, geo);
        const problem = confidence >= 0.5 ? null : grok <= geo ? (reading.problem ?? geometry.problem) : geometry.problem;
        const snapped = { ...reading, design: flyAsRealRocket(reading.design), confidence, problem: problem ?? null };
        return Response.json({ reading: snapped, source: "grok" } satisfies ReadResponse);
      }
    }

    return Response.json({ reading: { ...geometry, design: flyAsRealRocket(geometry.design) }, source: "geometry" } satisfies ReadResponse);
  } catch (err) {
    console.warn("[api/read] falling back to a blank reading:", err);
    const blank = readFromGeometry([], destination);
    return Response.json({ reading: { ...blank, design: flyAsRealRocket(blank.design) }, source: "geometry" } satisfies ReadResponse);
  }
}
