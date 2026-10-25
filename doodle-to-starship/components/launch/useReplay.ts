"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReplayPollResponse, ReplayRequest, ReplayStartResponse } from "@/app/api/replay/types";
import type { Verdict } from "@/lib/design";

export type ReplayState =
  | { phase: "idle" }
  | { phase: "pending"; progress: number | null }
  | { phase: "done"; url: string }
  | { phase: "failed" }
  | { phase: "unavailable" };

const POLL_MS = 3000;
const GIVE_UP_MS = 180_000;

/**
 * The Grok Imagine mission replay: a paid ~1 minute video job, so it only starts when
 * someone asks for it, and then polls until the clip is ready.
 */
export function useReplay(imageUrl: string | null, verdict: Verdict) {
  const [state, setState] = useState<ReplayState>({ phase: "idle" });
  const alive = useRef(true);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  const start = useCallback(async () => {
    if (!imageUrl) return;
    setState({ phase: "pending", progress: null });
    try {
      const body: ReplayRequest = { imageUrl, verdict };
      const res = await fetch("/api/replay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const started = (await res.json()) as ReplayStartResponse;
      if (!alive.current) return;
      if (started.status !== "pending" || !started.id) {
        setState({ phase: started.status === "unavailable" ? "unavailable" : "failed" });
        return;
      }
      const id = started.id;
      const deadline = Date.now() + GIVE_UP_MS;
      const poll = async () => {
        if (!alive.current) return;
        if (Date.now() > deadline) {
          setState({ phase: "failed" });
          return;
        }
        try {
          const r = await fetch(`/api/replay/${encodeURIComponent(id)}`, { cache: "no-store" });
          const p = (await r.json()) as ReplayPollResponse;
          if (!alive.current) return;
          if (p.status === "done" && p.url) {
            setState({ phase: "done", url: p.url });
            return;
          }
          if (p.status === "unavailable") {
            setState({ phase: "unavailable" });
            return;
          }
          if (p.status === "failed" || p.status === "expired") {
            setState({ phase: "failed" });
            return;
          }
          setState({ phase: "pending", progress: p.progress });
        } catch {
          // A dropped poll is not a failed job; try again next tick.
        }
        timer.current = window.setTimeout(poll, POLL_MS);
      };
      timer.current = window.setTimeout(poll, POLL_MS);
    } catch {
      if (alive.current) setState({ phase: "failed" });
    }
  }, [imageUrl, verdict]);

  return { state, start };
}
