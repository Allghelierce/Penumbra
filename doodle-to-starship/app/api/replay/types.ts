import type { Verdict } from "@/lib/design";

// HTTP contract for the Grok Imagine "mission replay" video (a ~1 minute job, polled).

export type ReplayStatus = "pending" | "done" | "failed" | "expired" | "unavailable";

/** POST /api/replay */
export interface ReplayRequest {
  /** The outcome render's URL (or a png/jpg data URL). */
  imageUrl: string;
  /** Picks the motion: a calm push-in for orbit/destination, spreading fire for failures. */
  verdict?: Verdict;
}
export interface ReplayStartResponse {
  /** "pending" means a job started: poll GET /api/replay/<id>. */
  status: "pending" | "failed" | "unavailable";
  id: string | null;
}

/** GET /api/replay/<id> */
export interface ReplayPollResponse {
  status: ReplayStatus;
  /** 0..100 when xAI reports it. */
  progress: number | null;
  /** Set when status is "done". Temporary URL. */
  url: string | null;
}
