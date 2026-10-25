import { cacheKey, sha } from "@/lib/render-cache";

// Shared by POST /api/replay and GET /api/replay/<id>: which cache key a running xAI job saves to.

/** A cache hit is handed out as a job id with this prefix; polling it returns the file at once. */
export const CACHED_PREFIX = "cached-";

// On globalThis because dev bundles each route separately.
const jobs: Map<string, string> = ((globalThis as { __replayJobs?: Map<string, string> }).__replayJobs ??= new Map());

export function replayKey(imageUrl: string, verdict: string | undefined): string {
  // Local /renders/ URLs are stable; data URLs are hashed so the key stays short.
  return cacheKey({ kind: "replay", image: imageUrl.startsWith("data:") ? sha(imageUrl) : imageUrl, verdict: verdict ?? null });
}

export function rememberJob(id: string, key: string) {
  jobs.set(id, key);
}

export function keyForJob(id: string): string | undefined {
  return jobs.get(id);
}
