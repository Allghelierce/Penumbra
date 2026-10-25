import { connection } from "next/server";
import { hasXai, IMAGE_MODEL, TEXT_MODEL, timeouts, VIDEO_MODEL, VISION_MODEL, xaiHealth } from "@/lib/xai";

// Whether a key is configured, which models and timeouts the routes use, and the last xAI error any
// route hit (auth, rate-limit, server, bad-request, timeout, network). Never echoes the key.
export async function GET() {
  await connection();
  return Response.json({
    keyPresent: hasXai(),
    models: { vision: VISION_MODEL, text: TEXT_MODEL, image: IMAGE_MODEL, video: VIDEO_MODEL },
    timeoutsMs: timeouts(),
    ...xaiHealth(),
  });
}
