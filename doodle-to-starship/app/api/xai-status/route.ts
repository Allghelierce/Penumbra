import { connection } from "next/server";
import { hasXai, TEXT_MODEL, timeouts, VISION_MODEL, xaiHealth } from "@/lib/xai";

// Whether a key is configured, which models and timeouts the routes use, and the last xAI error any
// route hit (auth, rate-limit, server, bad-request, timeout, network). Never echoes the key.
export async function GET() {
  await connection();
  return Response.json({
    keyPresent: hasXai(),
    models: { vision: VISION_MODEL, text: TEXT_MODEL },
    timeoutsMs: timeouts(),
    ...xaiHealth(),
  });
}
