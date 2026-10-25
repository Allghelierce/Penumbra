import type { ReadRequest, ReadResponse } from "@/lib/design";
import { readFromGeometry } from "@/lib/sketch/geometry";
import { isDestinationId } from "@/lib/sketch/ids";
import { buildReadPrompt, READ_SYSTEM, READING_SCHEMA, sanitizeReading, type GrokReading } from "@/lib/sketch/vision";
import { hasXai, metered, visionJson } from "@/lib/xai";

export function POST(request: Request) {
  return metered(() => handle(request));
}

async function handle(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<ReadRequest> | null;
  const destination = isDestinationId(body?.destination) ? body.destination : "leo";

  try {
    const geometry = readFromGeometry(body?.strokes ?? [], destination);

    const image = body?.image;
    if (hasXai() && typeof image === "string" && image.startsWith("data:image/")) {
      const raw = await visionJson<GrokReading>({
        image,
        system: READ_SYSTEM,
        prompt: buildReadPrompt(geometry),
        schema: READING_SCHEMA,
        schemaName: "sketch_reading",
      });
      const reading = sanitizeReading(raw, destination);
      if (reading) return Response.json({ reading, source: "grok" } satisfies ReadResponse);
    }

    return Response.json({ reading: geometry, source: "geometry" } satisfies ReadResponse);
  } catch (err) {
    console.warn("[api/read] falling back to a blank reading:", err);
    return Response.json({ reading: readFromGeometry([], destination), source: "geometry" } satisfies ReadResponse);
  }
}
