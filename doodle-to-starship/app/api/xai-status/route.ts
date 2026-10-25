import { connection } from "next/server";
import { hasXai, IMAGE_MODEL, TEXT_MODEL, VIDEO_MODEL, VISION_MODEL } from "@/lib/xai";

// Whether a key is configured and which models the routes call. Never echoes the key.
export async function GET() {
  await connection();
  return Response.json({
    keyPresent: hasXai(),
    models: { vision: VISION_MODEL, text: TEXT_MODEL, image: IMAGE_MODEL, video: VIDEO_MODEL },
  });
}
