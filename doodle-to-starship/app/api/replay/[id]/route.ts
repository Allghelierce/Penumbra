import { getVideo, hasXai } from "@/lib/xai";
import type { ReplayPollResponse } from "../types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasXai()) return Response.json({ status: "unavailable", progress: null, url: null } satisfies ReplayPollResponse);

  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return Response.json({ status: "failed", progress: null, url: null } satisfies ReplayPollResponse, { status: 400 });
  }

  // A failed poll is usually transient: report "pending" and let the client's own timeout decide.
  const job = await getVideo(id);
  return Response.json((job ?? { status: "pending", progress: null, url: null }) satisfies ReplayPollResponse);
}
