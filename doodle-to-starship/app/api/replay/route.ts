import type { Verdict } from "@/lib/design";
import { hasXai, metered, startVideo } from "@/lib/xai";
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
  if (!hasXai()) return Response.json({ status: "unavailable", id: null } satisfies ReplayStartResponse);

  const body = (await request.json().catch(() => null)) as Partial<ReplayRequest> | null;
  const imageUrl = body?.imageUrl;
  if (typeof imageUrl !== "string" || !/^(https:\/\/|data:image\/(png|jpe?g);base64,)/.test(imageUrl)) {
    return Response.json({ status: "failed", id: null } satisfies ReplayStartResponse, { status: 400 });
  }

  const prompt = (body?.verdict && MOTION[body.verdict]) || CALM;
  const id = await startVideo(imageUrl, prompt);
  return Response.json({ status: id ? "pending" : "failed", id } satisfies ReplayStartResponse);
}
