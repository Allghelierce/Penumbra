import { cachedFile, saveRemote, VIDEO_EXTS } from "@/lib/render-cache";
import { getVideo, hasXai } from "@/lib/xai";
import { CACHED_PREFIX, keyForJob } from "../jobs";
import type { ReplayPollResponse } from "../types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return Response.json({ status: "failed", progress: null, url: null } satisfies ReplayPollResponse, { status: 400 });
  }

  if (id.startsWith(CACHED_PREFIX)) {
    const url = await cachedFile(id.slice(CACHED_PREFIX.length), VIDEO_EXTS);
    return Response.json({ status: url ? "done" : "failed", progress: url ? 100 : null, url } satisfies ReplayPollResponse);
  }
  if (!hasXai()) return Response.json({ status: "unavailable", progress: null, url: null } satisfies ReplayPollResponse);

  // A failed poll is usually transient: report "pending" and let the client's own timeout decide.
  const job = await getVideo(id);
  if (!job) return Response.json({ status: "pending", progress: null, url: null } satisfies ReplayPollResponse);

  // Done: keep a local copy, since xAI's video URL is temporary.
  const key = keyForJob(id);
  if (job.status === "done" && job.url && key) {
    job.url = (await cachedFile(key, VIDEO_EXTS)) ?? (await saveRemote(key, job.url, "mp4")) ?? job.url;
  }
  return Response.json(job satisfies ReplayPollResponse);
}
