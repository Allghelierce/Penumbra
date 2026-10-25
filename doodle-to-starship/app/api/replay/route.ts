import type { Verdict } from "@/lib/design";
import { cachedFile, cachedImageAsDataUrl, isCachedUrl, VIDEO_EXTS } from "@/lib/render-cache";
import { hasXai, metered, startVideo } from "@/lib/xai";
import { CACHED_PREFIX, rememberJob, replayKey } from "./jobs";
import type { ReplayRequest, ReplayStartResponse } from "./types";

const CALM = "Slow cinematic push-in on the spacecraft, exhaust plume glowing and flickering, stars drifting gently behind.";

const MOTION: Partial<Record<Verdict, string>> = {
  suborbital: "Slow push-in as the fireball expands and burning debris trails streak down toward the ocean.",
  "stuck-on-pad": "Slow push-in as the fireball billows over the launch pad, smoke rolling outward and debris raining down.",
};

/** Starts a paid video job (no cancel), so the UI should only call this when the user asks. */
export function POST(request: Request) {
  return metered(() => handle(request));
}

async function handle(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<ReplayRequest> | null;
  const imageUrl = body?.imageUrl;
  if (
    typeof imageUrl !== "string" ||
    !(/^(https:\/\/|data:image\/(png|jpe?g);base64,)/.test(imageUrl) || isCachedUrl(imageUrl))
  ) {
    return Response.json({ status: "failed", id: null } satisfies ReplayStartResponse, { status: 400 });
  }

  // A cached clip needs no key or network: hand out an id that polls straight to "done".
  const key = replayKey(imageUrl, body?.verdict);
  if (await cachedFile(key, VIDEO_EXTS)) {
    return Response.json({ status: "pending", id: `${CACHED_PREFIX}${key}` } satisfies ReplayStartResponse);
  }
  if (!hasXai()) return Response.json({ status: "unavailable", id: null } satisfies ReplayStartResponse);

  // xAI can't fetch our localhost files, so a cached render goes up as a data URL.
  const image = isCachedUrl(imageUrl) ? await cachedImageAsDataUrl(imageUrl) : imageUrl;
  if (!image) return Response.json({ status: "failed", id: null } satisfies ReplayStartResponse);
  const prompt = (body?.verdict && MOTION[body.verdict]) || CALM;
  const id = await startVideo(image, prompt);
  if (id) rememberJob(id, key);
  return Response.json({ status: id ? "pending" : "failed", id } satisfies ReplayStartResponse);
}
