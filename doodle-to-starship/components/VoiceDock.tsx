"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Analysis, Design, DesignAction, Phase, Review } from "@/lib/design";
import { canRecognize, listen, openMicMeter, speak, stopSpeaking, type Listener, type MicMeter } from "@/lib/voice/browser";
import { parseCommand } from "@/lib/voice/intent";
import { ackLine, buildInstructions, deltaLine, nudge, speakable, toolResult, verdictLine } from "@/lib/voice/persona";
import { createRealtimeSession, type RealtimeSession } from "@/lib/voice/realtime";
import { toolCallToAction, VOICE_TOOLS } from "@/lib/voice/tools";

export interface VoiceDockProps {
  phase: Phase;
  design: Design | null;
  analysis: Analysis | null;
  review: Review | null;
  /** Spoken out loud whenever it changes (launch callouts, review summary). */
  narration: string | null;
  onAction: (action: DesignAction) => void;
}

type Mode = "checking" | "grok" | "browser";
type Talker = "user" | "reviewer" | null;

const HINTS: Record<Phase, string> = {
  draw: "Draw a rocket, then hold to talk to the engineer.",
  reading: "Reading your napkin…",
  reviewed: "Try “send it to Mars” or “stretch the tanks 30 percent”.",
  launch: "Hold to talk. “Launch it again” works.",
};

/** How long to wait for the parent to re-analyze after an edit before replying anyway. */
const ANALYSIS_WAIT_MS = 1500;
/** Grok Voice bills for every connected minute, so the session closes after this long with nothing said. */
const IDLE_CLOSE_MS = 60_000;

async function mintToken(): Promise<string> {
  const res = await fetch("/api/voice-token", { method: "POST" });
  const body = (await res.json()) as { mode: Mode; token?: string; error?: string };
  if (body.mode !== "grok" || !body.token) throw new Error(body.error ?? "No Grok Voice token.");
  return body.token;
}

export default function VoiceDock({ phase, design, analysis, review, narration, onAction }: VoiceDockProps) {
  const [mode, setMode] = useState<Mode>("checking");
  const [holding, setHolding] = useState(false);
  const [talker, setTalker] = useState<Talker>(null);
  const [userCaption, setUserCaption] = useState("");
  const [replyCaption, setReplyCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
  const [outputAnalyser, setOutputAnalyser] = useState<AnalyserNode | null>(null);

  // Latest props for async callbacks.
  const designRef = useRef(design);
  const analysisRef = useRef(analysis);
  const reviewRef = useRef(review);
  const onActionRef = useRef(onAction);
  useEffect(() => {
    designRef.current = design;
    analysisRef.current = analysis;
    reviewRef.current = review;
    onActionRef.current = onAction;
  });

  const listenerRef = useRef<Listener | null>(null);
  const micRef = useRef<MicMeter | null>(null);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const holdingRef = useRef(false);
  const analysisWaiters = useRef<(() => void)[]>([]);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve anyone waiting for a fresh analysis.
  useEffect(() => {
    const waiters = analysisWaiters.current;
    analysisWaiters.current = [];
    waiters.forEach((resolve) => resolve());
  }, [analysis]);

  const waitForAnalysis = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ANALYSIS_WAIT_MS);
        analysisWaiters.current.push(() => {
          clearTimeout(timer);
          // Let the parent finish its render pass so designRef is current too.
          setTimeout(resolve, 0);
        });
      }),
    [],
  );

  // ---- Mode: Grok Voice when the server has a key. The session itself opens on the first press.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/voice-token")
      .then((res) => res.json() as Promise<{ mode: Mode }>)
      .then((status) => !cancelled && setMode(status.mode === "grok" ? "grok" : "browser"))
      .catch(() => !cancelled && setMode("browser"));
    return () => {
      cancelled = true;
    };
  }, []);

  const closeSession = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    setOutputAnalyser(null);
    setMicAnalyser(micRef.current?.analyser ?? null);
  }, []);

  /** Push the idle close back; called on every bit of voice activity. */
  const touch = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(function check() {
      const session = sessionRef.current;
      if (!session) return;
      if (holdingRef.current || session.busy()) idleTimer.current = setTimeout(check, 5000);
      else closeSession();
    }, IDLE_CLOSE_MS);
  }, [closeSession]);

  /** Open a Grok Voice session if there isn't one. Call from a user gesture so audio can play. */
  const ensureSession = useCallback((): RealtimeSession => {
    if (sessionRef.current) return sessionRef.current;
    const session = createRealtimeSession({
      getToken: mintToken,
      instructions: buildInstructions(designRef.current, analysisRef.current, reviewRef.current),
      tools: VOICE_TOOLS,
      handlers: {
        onUserTranscript: (text) => {
          setUserCaption(text);
          touch();
        },
        onReplyTranscript: (text) => {
          setReplyCaption(text);
          touch();
        },
        onSpeaking: (speaking) => {
          setTalker((t) => (speaking ? (t === "user" ? t : "reviewer") : t === "reviewer" ? null : t));
          touch();
        },
        onToolCall: async (name, args) => {
          touch();
          const result = toolCallToAction(name, args, designRef.current);
          if ("error" in result) return { ok: false, error: result.error };
          onActionRef.current(result.action);
          if (result.action.type === "launch") return { ok: true, note: "Launching now. Say a few words at most." };
          await waitForAnalysis();
          return toolResult(designRef.current, analysisRef.current);
        },
        onError: (message) => setError(message),
        onClose: () => {
          if (sessionRef.current === session) closeSession();
        },
      },
    });
    sessionRef.current = session;
    setMicAnalyser(session.micAnalyser);
    setOutputAnalyser(session.outputAnalyser);
    session.ready.catch((err: unknown) => {
      if (sessionRef.current !== session) return;
      closeSession();
      if (err instanceof Error && err.message === "closed") return;
      console.warn("[voice] Grok Voice failed, using browser voice:", err);
      setError("Grok Voice didn't connect, so this is browser voice. Hold to talk again.");
      setMode("browser");
    });
    touch();
    return session;
  }, [closeSession, touch, waitForAnalysis]);

  // Keep Grok's instructions in sync with the design on the napkin.
  useEffect(() => {
    sessionRef.current?.updateInstructions(buildInstructions(design, analysis, review));
  }, [design, analysis, review]);

  const sayReply = useRef<(text: string) => void>(() => {});
  // Only the latest utterance may clear the "reviewer is talking" state.
  const utteranceId = useRef(0);
  sayReply.current = (text: string) => {
    setReplyCaption(text);
    if (mode === "grok") {
      ensureSession().say(text);
      return;
    }
    const id = ++utteranceId.current;
    speak(speakable(text), {
      onStart: () => setTalker((t) => (t === "user" ? t : "reviewer")),
      onEnd: () => {
        if (id === utteranceId.current) setTalker((t) => (t === "reviewer" ? null : t));
      },
    });
  };

  // Narration: speak whenever it changes.
  const lastNarration = useRef<string | null>(null);
  useEffect(() => {
    if (!narration || narration === lastNarration.current || mode === "checking") return;
    lastNarration.current = narration;
    if (holdingRef.current) return; // don't talk over the user
    sayReply.current(narration);
  }, [narration, mode]);

  // Close the mic and any session when the dock goes away.
  useEffect(
    () => () => {
      listenerRef.current?.cancel();
      micRef.current?.close();
      sessionRef.current?.close();
      if (idleTimer.current) clearTimeout(idleTimer.current);
      stopSpeaking();
    },
    [],
  );

  // ---- Browser mode: parse the command, apply it, reply from the analysis.
  const handleCommand = useCallback(
    async (text: string) => {
      setUserCaption(text);
      if (!text.trim()) {
        sayReply.current("Didn't catch that. Hold the button the whole time you talk.");
        return;
      }
      if (mode === "grok") {
        ensureSession().sendText(text);
        touch();
        return;
      }
      const before = analysisRef.current;
      const actions = parseCommand(text, designRef.current);
      if (actions.length === 0) {
        sayReply.current("I only speak rocket. Try “send it to Mars”, “stretch the tanks 30 percent”, or “add a booster”.");
        return;
      }
      if (!designRef.current) {
        sayReply.current("Draw me something first. I can't review a blank napkin.");
        return;
      }
      for (const action of actions) onActionRef.current(action);

      const last = actions[actions.length - 1];
      if (last.type === "launch") {
        sayReply.current(ackLine(last, designRef.current));
        return;
      }
      const edits = actions.filter((a) => a.type !== "review");
      if (edits.length === 0) {
        const now = analysisRef.current;
        sayReply.current(now ? verdictLine(designRef.current, now) : "Nothing to review yet.");
        return;
      }
      await waitForAnalysis();
      const after = analysisRef.current;
      const ack = ackLine(edits[edits.length - 1], designRef.current);
      if (!after) {
        sayReply.current(ack);
        return;
      }
      const delta = deltaLine(before, after);
      sayReply.current(delta ? `${ack} ${delta} ${nudge(designRef.current, after)}` : `${ack} ${verdictLine(designRef.current, after)}`);
    },
    [mode, ensureSession, touch, waitForAnalysis],
  );

  // ---- Push to talk.
  const startTalk = useCallback(() => {
    if (holdingRef.current || mode === "checking") return;
    holdingRef.current = true;
    setHolding(true);
    setError(null);
    setTalker("user");
    setUserCaption("");
    stopSpeaking();

    if (mode === "grok") {
      ensureSession().startTalking();
      touch();
      return;
    }
    if (!micRef.current) {
      void openMicMeter().then((mic) => {
        if (!mic) return;
        micRef.current = mic;
        setMicAnalyser(mic.analyser);
      });
    }
    listenerRef.current = listen({
      onInterim: (text) => setUserCaption(text),
      onDone: (text) => {
        listenerRef.current = null;
        void handleCommand(text);
      },
      onError: (message) => setError(message),
    });
    if (!listenerRef.current) {
      setError(canRecognize() ? "Couldn't start the mic. Try again." : "This browser can't do speech recognition. Type the command below.");
    }
  }, [mode, ensureSession, touch, handleCommand]);

  const endTalk = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setHolding(false);
    setTalker((t) => (t === "user" ? null : t));
    if (sessionRef.current) {
      sessionRef.current.stopTalking();
      touch();
      return;
    }
    listenerRef.current?.stop();
  }, [touch]);

  // Hold Space to talk (unless typing somewhere).
  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target)) return;
      e.preventDefault();
      if (!e.repeat) startTalk();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target)) return;
      e.preventDefault();
      endTalk();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", endTalk);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", endTalk);
    };
  }, [startTalk, endTalk]);

  const submitTyped = (e: FormEvent) => {
    e.preventDefault();
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    void handleCommand(text);
  };

  const analyser = talker === "user" ? micAnalyser : talker === "reviewer" ? outputAnalyser : null;

  return (
    <div className="w-full rounded-t-2xl border border-b-0 border-napkin-edge bg-napkin/95 px-4 pt-3 pb-4 shadow-[0_-6px_24px_rgba(45,45,45,0.08)] backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <ModeBadge mode={mode} />
            <span className="truncate font-sans text-xs text-ink-muted">{error ?? HINTS[phase]}</span>
          </div>
          <div className="min-h-[3.5rem] font-hand leading-tight" aria-live="polite">
            {userCaption ? (
              <p className="truncate text-xl text-graphite">
                <span className="text-ink-muted">you: </span>
                {userCaption}
              </p>
            ) : null}
            {replyCaption ? (
              <p className="line-clamp-2 text-2xl text-redpen">
                <span className="text-ink-muted text-xl">engineer: </span>
                {replyCaption}
              </p>
            ) : null}
            {!userCaption && !replyCaption ? (
              <p className="text-xl text-ink-muted">Hold the red button (or Space) and talk.</p>
            ) : null}
          </div>
          <form onSubmit={submitTyped} className="mt-1">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="or type: add a booster and send it to Mars"
              aria-label="Type a command for the engineer"
              className="w-full max-w-md border-b border-dashed border-napkin-edge bg-transparent font-mono text-xs text-graphite placeholder:text-ink-muted/70 focus:border-redpen focus:outline-none"
            />
          </form>
        </div>

        <Waveform talker={talker} analyser={analyser} />

        <button
          type="button"
          aria-label="Hold to talk"
          aria-pressed={holding}
          disabled={mode === "checking"}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            startTalk();
          }}
          onPointerUp={endTalk}
          onPointerCancel={endTalk}
          onContextMenu={(e) => e.preventDefault()}
          className={`relative flex h-20 w-20 shrink-0 touch-none select-none flex-col items-center justify-center rounded-full bg-redpen text-napkin shadow-[0_4px_0_#8f1d15] transition-transform disabled:opacity-50 ${
            holding ? "translate-y-1 scale-95 shadow-[0_1px_0_#8f1d15]" : "hover:scale-[1.03]"
          }`}
        >
          {holding ? <span className="absolute inset-0 animate-ping rounded-full bg-redpen/40" /> : null}
          <MicIcon />
          <span className="mt-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase">{holding ? "listening" : "hold"}</span>
        </button>
      </div>
    </div>
  );
}

function ModeBadge({ mode }: { mode: Mode }) {
  const label = mode === "grok" ? "Grok Voice" : mode === "browser" ? "browser voice" : "connecting…";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase ${
        mode === "grok" ? "border-go/40 text-go" : "border-napkin-edge text-ink-muted"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${mode === "grok" ? "bg-go" : "bg-ink-muted"}`} />
      {label}
    </span>
  );
}

function MicIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

/** Live waveform: real samples when there's an analyser, a drawn squiggle when the browser won't give us audio. */
function Waveform({ talker, analyser }: { talker: Talker; analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const styles = getComputedStyle(document.documentElement);
    const color = talker === "user" ? styles.getPropertyValue("--redpen") : styles.getPropertyValue("--graphite");
    const idle = styles.getPropertyValue("--napkin-edge");
    const samples = analyser ? new Uint8Array(analyser.fftSize) : null;
    let frame = 0;
    let raf = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = talker ? color : idle;
      ctx.beginPath();
      const steps = 64;
      if (analyser && samples) analyser.getByteTimeDomainData(samples);
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * w;
        let y: number;
        if (talker && analyser && samples) {
          const v = (samples[Math.floor((i / steps) * (samples.length - 1))] - 128) / 128;
          y = h / 2 + v * h * 1.4;
        } else if (talker) {
          const env = Math.sin((i / steps) * Math.PI);
          const t = frame / 6;
          y = h / 2 + env * (Math.sin(i * 0.55 + t) * 0.3 + Math.sin(i * 1.7 - t * 1.3) * 0.15) * h * (0.6 + 0.4 * Math.sin(t / 2));
        } else {
          y = h / 2 + Math.sin(i * 0.4 + frame / 30) * 1.2;
        }
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, Math.max(2, Math.min(h - 2, y)));
      }
      ctx.stroke();
      frame++;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [talker, analyser]);

  return <canvas ref={canvasRef} className="hidden h-14 w-40 shrink-0 sm:block" aria-hidden />;
}
