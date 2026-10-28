"use client";

// Attract mode: when nobody has touched the studio for a while, the napkin draws itself,
// gets reviewed, launches, and moves on to the next demo sketch. Any real pointer or key
// event stops it at once. Renders nothing; it drives the studio through callbacks.

import { useEffect, useRef } from "react";
import { replaySketch, sketchDurationMs } from "@/lib/attract";
import type { DestinationId, Phase, Stroke } from "@/lib/design";
import { DEMO_SKETCHES } from "@/lib/demo-sketches";

export interface AttractModeProps {
  /** The studio turns this off the moment a person touches anything. */
  enabled: boolean;
  /** Progressively growing drawing. */
  onStrokes: (strokes: Stroke[]) => void;
  onDestination: (d: DestinationId) => void;
  /** Run the read + red pen. */
  onCheck: () => void;
  onLaunch: () => void;
  /** So attract mode knows when the review or launch has finished. */
  phase: Phase;
}

const IDLE_MS = 45_000;
/** After the review lands, let the red pen and the voice play out before launching. */
const REVIEW_LINGER_MS = 6_000;
const REVIEW_TIMEOUT_MS = 30_000;
const LAUNCH_START_TIMEOUT_MS = 5_000;
const LAUNCH_TIMEOUT_MS = 40_000;
const BETWEEN_SKETCHES_MS = 2_000;

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

class Stopped extends Error {}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Stopped());
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Stopped());
      },
      { once: true },
    );
  });
}

export default function AttractMode(props: AttractModeProps): null {
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const run = useRef<AbortController | null>(null);
  const lastActivity = useRef(0);
  const next = useRef(0);

  // Any real pointer or key event: stop and restart the idle clock.
  useEffect(() => {
    lastActivity.current = performance.now();
    const onActivity = (e: Event) => {
      if (!e.isTrusted) return;
      lastActivity.current = performance.now();
      run.current?.abort();
      run.current = null;
    };
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, { capture: true, passive: true });
    return () => {
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity, { capture: true });
    };
  }, []);

  // Turned off by the studio: stop now.
  useEffect(() => {
    if (props.enabled) return;
    run.current?.abort();
    run.current = null;
  }, [props.enabled]);

  // Stop when unmounted.
  useEffect(
    () => () => {
      run.current?.abort();
      run.current = null;
    },
    [],
  );

  // Idle clock: start the show after IDLE_MS with nobody around.
  useEffect(() => {
    const waitForPhase = async (ok: (p: Phase) => boolean, timeoutMs: number, signal: AbortSignal) => {
      const until = performance.now() + timeoutMs;
      while (!ok(latest.current.phase)) {
        if (performance.now() > until) return false;
        await sleep(100, signal);
      }
      return true;
    };

    const show = async (signal: AbortSignal) => {
      while (!signal.aborted && DEMO_SKETCHES.length > 0) {
        const sketch = DEMO_SKETCHES[next.current % DEMO_SKETCHES.length];
        next.current++;

        latest.current.onStrokes([]);
        await sleep(400, signal);
        await replaySketch(sketch.strokes, (s) => latest.current.onStrokes(s), {
          durationMs: sketchDurationMs(sketch.strokes),
          signal,
        });
        await sleep(600, signal);

        latest.current.onDestination(sketch.destination);
        await sleep(300, signal);
        latest.current.onCheck();

        if (await waitForPhase((p) => p === "reviewed", REVIEW_TIMEOUT_MS, signal)) {
          await sleep(REVIEW_LINGER_MS, signal);
          latest.current.onLaunch();
          if (await waitForPhase((p) => p === "launch", LAUNCH_START_TIMEOUT_MS, signal)) {
            await waitForPhase((p) => p !== "launch", LAUNCH_TIMEOUT_MS, signal);
          }
        }
        await sleep(BETWEEN_SKETCHES_MS, signal);
      }
    };

    const timer = setInterval(() => {
      if (run.current || !latest.current.enabled) return;
      if (performance.now() - lastActivity.current < IDLE_MS) return;
      const controller = new AbortController();
      run.current = controller;
      show(controller.signal)
        .catch((err: unknown) => {
          if (!(err instanceof Stopped)) console.warn("[attract] stopped:", err);
        })
        .finally(() => {
          if (run.current === controller) run.current = null;
          // Wait a full idle period before starting again.
          lastActivity.current = performance.now();
        });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return null;
}
