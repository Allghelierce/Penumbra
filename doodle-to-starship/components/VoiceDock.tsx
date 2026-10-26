"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { playQuindar, unlockLaunchAudio } from "@/components/LaunchScene";
import TypeOut from "@/components/TypeOut";
import type { Analysis, Design, DesignAction, Phase, Poll, Review } from "@/lib/design";
import { parseReply } from "@/lib/mission-control";
import {
  canRecognize,
  canSynthesize,
  listen,
  openMicMeter,
  speak,
  stopSpeaking,
  type Listener,
  type MicMeter,
} from "@/lib/voice/browser";
import { parseCommand } from "@/lib/voice/intent";
import { ackLine, buildInstructions, deltaLine, nudge, speakable, toolResult, verdictLine } from "@/lib/voice/persona";
import { voiceActivity } from "@/lib/voice/activity";
import { createRealtimeSession, type RealtimeSession } from "@/lib/voice/realtime";
import { fetchSpeech, hashName, playSpeech, splitDialog, stopSpeech, type Speaker } from "@/lib/voice/tts";
import { toolCallToAction, VOICE_TOOLS } from "@/lib/voice/tools";

export interface VoiceDockProps {
  phase: Phase;
  design: Design | null;
  analysis: Analysis | null;
  review: Review | null;
  /** Spoken out loud whenever it changes (launch callouts, review summary). */
  narration: string | null;
  onAction: (action: DesignAction) => void;
  /** The GO/NO-GO poll to read out while phase is "poll". */
  poll?: Poll | null;
  /** Called as each poll line starts, with how many calls are now lit. */
  onPollReveal?: (revealed: number) => void;
  /** The user said or typed GO, SCRUB or FIX during the poll. */
  onPollReply?: (reply: "go" | "scrub" | "fix") => void;
  /** After a flight: spoken once; "yes" calls onImprove with its fix. */
  offer?: { line: string; fix?: DesignAction } | null;
  onImprove?: (fix?: DesignAction) => void;
}

/** When xAI speech isn't available, each speaker still sounds a little different in browser voice. */
const BROWSER_VOICE: Record<Speaker, { pitch: number; rate: number }> = {
  Propulsion: { pitch: 0.9, rate: 1.02 },
  Structures: { pitch: 1.0, rate: 1.0 },
  Trajectory: { pitch: 0.95, rate: 1.02 },
  Landing: { pitch: 1.05, rate: 1.0 },
  Flight: { pitch: 0.92, rate: 0.96 },
  Callout: { pitch: 1.0, rate: 1.08 },
  Engineer: { pitch: 1.0, rate: 1.0 },
};
/** Without speech synthesis the tiles still light, one per this many ms. */
const SILENT_LINE_MS = 900;

/** Ends the browser line in progress (cancel() doesn't always fire onend). */
let endBrowserLine: (() => void) | null = null;

/** Browser voice for a role, or a stable pitch and rate hashed from a named speaker. */
function browserVoice(speaker: string): { pitch: number; rate: number } {
  if (Object.prototype.hasOwnProperty.call(BROWSER_VOICE, speaker)) return BROWSER_VOICE[speaker as Speaker];
  const h = hashName(speaker);
  return { pitch: 0.85 + ((h % 7) / 6) * 0.3, rate: 0.95 + (((h >>> 3) % 5) / 4) * 0.1 };
}

/**
 * What has already been heard, kept on window so a remount (HMR, a Studio re-render, StrictMode)
 * never repeats a line or restarts a poll that was already read out.
 */
const heard: { narration: string | null; offer: string | null; poll: Poll | null } =
  typeof window === "undefined"
    ? { narration: null, offer: null, poll: null }
    : ((window as { __voiceHeard?: { narration: string | null; offer: string | null; poll: Poll | null } }).__voiceHeard ??= {
        narration: null,
        offer: null,
        poll: null,
      });

/** True while the pen is on the napkin; nothing talks over someone drawing. */
const penDown = () => typeof document !== "undefined" && document.querySelector('[data-drawing="true"]') !== null;

/** Module-level clock, so it's plainly not called during render. */
const clock = () => Date.now();
/** The same line in the same phase within this window is a duplicate and isn't spoken again. */
const DEDUPE_MS = 4000;

/** Bumped by every hush(), so a line still fetching its audio knows it was cancelled. */
let hushes = 0;

/** Silence every voice: browser speech and xAI audio. */
function hush() {
  hushes++;
  stopSpeaking();
  endBrowserLine?.();
  stopSpeech();
}

/** Browser speech for one line, with a synthetic level for the visuals. Resolves when it's said. */
function browserLine(text: string, speaker: string, index?: number): Promise<void> {
  return new Promise((resolve) => {
    const estimateMs = 600 + text.split(/\s+/).length * 340;
    const named = !Object.prototype.hasOwnProperty.call(BROWSER_VOICE, speaker);
    const info = { role: (named ? "Callout" : speaker) as Speaker, text, index, ...(named && { speaker }) };
    let level = 0.6;
    const pulse = setInterval(() => {
      level = Math.max(0.12, level * 0.82);
      voiceActivity.emit({ ...info, level });
    }, 33);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(pulse);
      clearTimeout(safety);
      if (endBrowserLine === finish) endBrowserLine = null;
      voiceActivity.quiet();
      resolve();
    };
    endBrowserLine = finish;
    const safety = setTimeout(finish, estimateMs * 2 + 1500);
    if (!canSynthesize()) {
      setTimeout(finish, SILENT_LINE_MS);
      return;
    }
    speak(speakable(text), {
      onEnd: finish,
      onBoundary: () => {
        level = 1;
      },
      ...browserVoice(speaker),
    });
  });
}

type Mode = "checking" | "grok" | "browser";
type Talker = "user" | "reviewer" | null;

const HINTS: Record<Phase, string> = {
  draw: "Sketch something, check it, then ask the engineer to change it.",
  reading: "Reading your sketch…",
  reviewed: "Try “send it to Mars”, “stretch the tanks 30 percent” or “add a booster”.",
  launch: "Say “launch it again” to fly once more.",
  poll: "Go/no-go poll. Say “go”, “fix it” or “scrub”.",
};

/** How long to wait for the parent to re-analyze after an edit before replying anyway. */
const ANALYSIS_WAIT_MS = 1500;
/** Grok Voice bills for every connected minute, so the session closes after this long with nothing said. */
const IDLE_CLOSE_MS = 30_000;

async function mintToken(): Promise<string> {
  const res = await fetch("/api/voice-token", { method: "POST" });
  const body = (await res.json()) as { mode: Mode; token?: string; error?: string };
  if (body.mode !== "grok" || !body.token) throw new Error(body.error ?? "No Grok Voice token.");
  return body.token;
}

export default function VoiceDock({
  phase,
  design,
  analysis,
  review,
  narration,
  onAction,
  poll = null,
  onPollReveal,
  onPollReply,
  offer = null,
  onImprove,
}: VoiceDockProps) {
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
  const phaseRef = useRef(phase);
  const pollRef = useRef(poll);
  const modeRef = useRef<Mode>("checking");
  const onPollRevealRef = useRef(onPollReveal);
  const onPollReplyRef = useRef(onPollReply);
  const onImproveRef = useRef(onImprove);
  useEffect(() => {
    designRef.current = design;
    analysisRef.current = analysis;
    reviewRef.current = review;
    onActionRef.current = onAction;
    phaseRef.current = phase;
    pollRef.current = poll;
    onPollRevealRef.current = onPollReveal;
    onPollReplyRef.current = onPollReply;
    onImproveRef.current = onImprove;
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

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  /** Poll answers and the post-flight offer; set below, used by Grok transcripts and typed or spoken commands. */
  const handleReplyRef = useRef<(text: string) => boolean>(() => false);

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
        onUserTranscript: (text, final) => {
          setUserCaption(text);
          touch();
          if (final) handleReplyRef.current(text);
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
          // During the poll a spoken "launch" is the GO call, answered once.
          if (phaseRef.current === "poll" && result.action.type === "launch") {
            handleReplyRef.current("go");
            return { ok: true, note: "GO for launch. Say a few words at most." };
          }
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
      setMode("browser");
      // A denied mic is the user's choice, not a failure: fall back quietly (typing and buttons still work).
      const denied = err instanceof Error && (err.name === "NotAllowedError" || /permission/i.test(err.message));
      if (!denied) setError("Grok Voice didn't connect, so this is browser voice. Hold to talk again.");
    });
    touch();
    return session;
  }, [closeSession, touch, waitForAnalysis]);

  // Keep Grok's instructions in sync with the design on the napkin.
  useEffect(() => {
    sessionRef.current?.updateInstructions(buildInstructions(design, analysis, review));
  }, [design, analysis, review]);

  const sayReply = useRef<(text: string, speaker?: string) => void>(() => {});
  const speakLineRef = useRef<(text: string, speaker: string, index?: number) => Promise<void>>(async () => {});
  // Only the latest utterance may clear the "reviewer is talking" state.
  const utteranceId = useRef(0);
  // Grok Voice bills per connected minute and needs the mic, so only push-to-talk opens a session;
  // until then (and after it idles out) lines go through xAI text-to-speech or the browser's voice.
  const lastSaid = useRef({ text: "", phase: "", at: 0 });
  sayReply.current = (text: string, speaker: string = "Engineer") => {
    const at = clock();
    const last = lastSaid.current;
    if (last.text === text && last.phase === phaseRef.current && at - last.at < DEDUPE_MS) return;
    lastSaid.current = { text, phase: phaseRef.current, at };
    void speakLineRef.current(text, speaker);
  };

  // One voice at a time across phases: a new phase cuts off whatever the last one was still saying.
  // Declared before the narration and offer effects, so the new phase's own line still plays.
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current === phase) return;
    lastPhase.current = phase;
    hush();
    sessionRef.current?.interrupt();
  }, [phase]);

  // Narration: speak whenever it changes. Launch callouts get the Quindar tones first, like the loops.
  // Speech happens at three moments only: the poll, flight callouts, and the post-flight offer (plus
  // direct replies to push-to-talk or typing). Narration outside a flight (review summaries,
  // re-checks, voice edits) is noted as heard but never spoken.
  useEffect(() => {
    if (!narration || narration === heard.narration || mode === "checking") return;
    heard.narration = narration;
    if (phase !== "launch") return;
    if (holdingRef.current || penDown()) return; // don't talk over the user
    // Replay dialog (`CAPCOM: "Roger, go at throttle up."`): speak only the quote, in that speaker's voice.
    const dialog = splitDialog(narration);
    const say = () => {
      if (dialog) {
        sayReply.current(dialog.quote, dialog.speaker);
        setReplyCaption(`${dialog.speaker}: “${dialog.quote}”`);
      } else sayReply.current(narration, phase === "launch" ? "Callout" : "Engineer");
    };
    if (phase === "launch") {
      const timer = setTimeout(say, playQuindar() * 1000);
      return () => clearTimeout(timer); // a newer callout replaces one still waiting on its tones
    }
    say();
  }, [narration, mode, phase]);

  /**
   * Speaks one scripted line and resolves when it has been said: Grok Voice if push-to-talk already
   * opened a session, else xAI text-to-speech (cached), else the browser's voice.
   */
  const speakLine = useCallback(async (text: string, speaker: string, index?: number): Promise<void> => {
    if (penDown()) return;
    hush();
    const generation = hushes;
    setReplyCaption(text);
    const id = ++utteranceId.current;
    const quietIfLatest = () => {
      if (id === utteranceId.current) setTalker((t) => (t === "reviewer" ? null : t));
    };
    setTalker((t) => (t === "user" ? t : "reviewer"));

    const session = modeRef.current === "grok" ? sessionRef.current : null;
    if (session) {
      session.say(text);
      // force_message has no completion event: wait about as long as the line, then until Grok goes quiet.
      const estimateMs = 600 + text.split(/\s+/).length * 340;
      const started = Date.now();
      await new Promise<void>((resolve) => {
        const wait = () => (Date.now() - started >= estimateMs && !session.busy() ? resolve() : setTimeout(wait, 150));
        setTimeout(wait, 300);
        setTimeout(resolve, estimateMs * 2 + 1500);
      });
      quietIfLatest();
      return;
    }

    const url = await fetchSpeech(text, speaker);
    // Something newer started, or Esc/scrub hushed us, while the audio was loading.
    if (id !== utteranceId.current || generation !== hushes) return;
    const named = !Object.prototype.hasOwnProperty.call(BROWSER_VOICE, speaker);
    if (url) await playSpeech(url, { role: (named ? "Callout" : speaker) as Speaker, text, index, ...(named && { speaker }) });
    else await browserLine(text, speaker, index);
    quietIfLatest();
  }, []);

  useEffect(() => {
    speakLineRef.current = speakLine;
  }, [speakLine]);

  // ---- The GO/NO-GO poll: read each controller's line, lighting its tile as it starts.
  const pollRun = useRef(0);
  const pollAnswered = useRef(false);
  /** True once every call has been read out (or skipped); a spoken GO before that only finishes the readout. */
  const pollDone = useRef(false);
  useEffect(() => {
    if (phase !== "poll" || !poll || mode === "checking") return;
    const run = ++pollRun.current;
    pollAnswered.current = false;
    pollDone.current = false;
    // A remount mid-poll (HMR, re-render) doesn't read the board again: just light it.
    if (heard.poll === poll) {
      pollDone.current = true;
      onPollRevealRef.current?.(poll.calls.length);
      setReplyCaption(pollPrompt(poll));
      return;
    }
    // Fetch every line's audio at once so the readout has no gaps.
    for (const call of poll.calls) void fetchSpeech(call.line, call.role);
    void (async () => {
      for (let i = 0; i < poll.calls.length; i++) {
        if (run !== pollRun.current) return;
        onPollRevealRef.current?.(i + 1);
        await speakLine(poll.calls[i].line, poll.calls[i].role, i);
        // Marked heard once a line has actually played (StrictMode's instant re-run still reads it).
        if (run === pollRun.current) heard.poll = poll;
      }
      if (run !== pollRun.current) return;
      pollDone.current = true;
      setReplyCaption(pollPrompt(poll));
    })();
    return () => {
      pollRun.current++;
      hush();
      sessionRef.current?.interrupt();
    };
  }, [phase, poll, mode, speakLine]);

  // Esc skips the readout and lights every tile.
  useEffect(() => {
    if (phase !== "poll" || !poll) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      pollRun.current++;
      hush();
      sessionRef.current?.interrupt();
      onPollRevealRef.current?.(poll.calls.length);
      pollDone.current = true;
      setReplyCaption(pollPrompt(poll));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, poll]);

  // ---- After the flight: offer the best improvement once, and wait for a yes.
  const offerRef = useRef(offer);
  useEffect(() => {
    offerRef.current = offer;
    if (!offer || offer.line === heard.offer || mode === "checking") return;
    heard.offer = offer.line; // spoken once, even across remounts
    if (!holdingRef.current && !penDown()) sayReply.current(offer.line, "Flight");
  }, [offer, mode]);

  handleReplyRef.current = (text: string): boolean => {
    const reply = parseReply(text);
    const currentPoll = pollRef.current;
    if (phaseRef.current === "poll" && currentPoll) {
      if (pollAnswered.current) return true;
      const answer = reply === "yes" ? "go" : reply === "no" ? "scrub" : reply;
      if (!answer) {
        sayReply.current("Say go, fix it, or scrub.");
        return true;
      }
      if (answer === "go" && !pollDone.current) {
        // Don't fly past controllers that haven't reported: finish the board, then ask again.
        pollRun.current++;
        hush();
        onPollRevealRef.current?.(currentPoll.calls.length);
        pollDone.current = true;
        sayReply.current(pollPrompt(currentPoll));
        return true;
      }
      if (answer === "fix" && !currentPoll.calls.some((c) => !c.go && c.fix)) {
        sayReply.current("No fix on the board. Go or scrub?");
        return true;
      }
      pollAnswered.current = true;
      pollRun.current++;
      sayReply.current(answer === "go" ? "Copy. GO for launch." : answer === "scrub" ? "Copy. Scrubbing." : "Copy. Applying the fix.");
      onPollReplyRef.current?.(answer);
      return true;
    }
    const pending = offerRef.current;
    if (pending && reply) {
      offerRef.current = null;
      if (reply === "yes" || reply === "go" || reply === "fix") {
        sayReply.current(pending.fix ? "Copy. Making the change." : "Copy.");
        onImproveRef.current?.(pending.fix);
      } else {
        sayReply.current("Copy. Standing by.");
      }
      return true;
    }
    return false;
  };

  // Close the mic and any session when the dock goes away.
  useEffect(
    () => () => {
      listenerRef.current?.cancel();
      micRef.current?.close();
      sessionRef.current?.close();
      if (idleTimer.current) clearTimeout(idleTimer.current);
      hush();
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
      if (handleReplyRef.current(text)) return;
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
    // A spoken "launch it" lands later, outside this gesture; unlock launch audio now (Safari).
    unlockLaunchAudio();
    setError(null);
    setTalker("user");
    setUserCaption("");
    hush();

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
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", endTalk);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
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
    <div className="flex h-[76px] w-full shrink-0 items-center gap-5 border-t border-rule bg-black px-6">
      <button
        type="button"
        aria-label="Hold to talk to the engineer"
        aria-pressed={holding}
        disabled={mode === "checking"}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          startTalk();
        }}
        onPointerUp={endTalk}
        onPointerCancel={endTalk}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative flex h-12 w-12 shrink-0 touch-none select-none items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
          holding ? "border-2 border-nogo bg-nogo text-white" : "border-2 border-white text-white hover:bg-white hover:text-black"
        }`}
      >
        {holding ? <span className="absolute inset-0 animate-ping rounded-full bg-nogo/40 motion-reduce:hidden" /> : null}
        <MicIcon />
      </button>

      <div className="w-[150px] shrink-0">
        <p className="font-space text-[12px] font-semibold uppercase tracking-[0.18em] text-white">{holding ? "Listening…" : "Engineer"}</p>
        <p className="text-[12px] text-haze">Hold to talk, or hold Space</p>
      </div>

      <div className="min-w-0 flex-1 border-l border-rule pl-5" aria-live="polite">
        {error ? (
          <p className="truncate text-[14px] text-nogo">{error}</p>
        ) : userCaption || replyCaption ? (
          <>
            {userCaption ? (
              <p className="truncate text-[13px] text-haze">
                <span className="text-haze/70">You: </span>
                {userCaption}
              </p>
            ) : null}
            {replyCaption ? (
              <p className="line-clamp-2 text-[15px] leading-snug text-starlight">
                <span className="text-haze">Engineer: </span>
                {/* Grok streams its transcript already; browser replies arrive whole, so type them out. */}
                {mode === "grok" ? replyCaption : <TypeOut key={replyCaption} text={replyCaption} cps={70} linger={800} />}
              </p>
            ) : null}
          </>
        ) : (
          <p className="truncate text-[14px] text-haze">{HINTS[phase]}</p>
        )}
      </div>

      <Waveform talker={talker} analyser={analyser} />

      <div className="flex w-[230px] shrink-0 flex-col items-end gap-1.5">
        <ModeBadge mode={mode} />
        <form onSubmit={submitTyped} className="w-full">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Or type a command"
            aria-label="Type a command for the engineer"
            className="h-7 w-full border border-rule bg-black px-2 text-[13px] text-white placeholder:text-haze/70 focus:border-white focus:outline-none"
          />
        </form>
      </div>
    </div>
  );
}

function pollPrompt(poll: Poll): string {
  if (poll.go) return `${poll.summary} Say “go”.`;
  return poll.calls.some((c) => !c.go && c.fix)
    ? `${poll.summary} Say “fix it”, “go” or “scrub”.`
    : `${poll.summary} Say “go” or “scrub”.`;
}

function ModeBadge({ mode }: { mode: Mode }) {
  const label = mode === "grok" ? "Grok Voice" : mode === "browser" ? "Browser voice" : "Connecting…";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] ${mode === "grok" ? "text-go-signal" : "text-haze"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${mode === "grok" ? "bg-go-signal" : "bg-haze"}`} />
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
    const color = talker === "user" ? styles.getPropertyValue("--nogo") : styles.getPropertyValue("--starlight");
    const idle = styles.getPropertyValue("--rule");
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

  return <canvas ref={canvasRef} className="hidden h-10 w-36 shrink-0 md:block" aria-hidden />;
}
