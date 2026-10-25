import type { PollCall } from "@/lib/design";
import { voiceActivity, type VoiceActivity } from "./activity";

// xAI text-to-speech for every scripted line, through /api/tts (cached server-side). Returns null
// when there's no audio (no key, no budget, error) so callers fall back to browser speech.

export type Speaker = PollCall["role"] | "Engineer" | "Callout";

/**
 * Who speaks with which xAI voice. Picked by name only (the API lists no descriptions), so change
 * a voice here after hearing it; cached lines are keyed by voice, so nothing stale is served.
 */
export const CAST: Record<Speaker, { voice: string; speed: number }> = {
  Propulsion: { voice: "atlas", speed: 1.05 },
  Structures: { voice: "kepler", speed: 1.05 },
  Trajectory: { voice: "orion", speed: 1.05 },
  Landing: { voice: "castor", speed: 1.05 },
  Flight: { voice: "eve", speed: 1.0 },
  Callout: { voice: "sirius", speed: 1.1 },
  Engineer: { voice: "ara", speed: 1.0 },
};

/** Light speech tags: a beat after the GO/NO-GO call, so it lands like a real loop. */
export function performance(text: string, speaker: Speaker): string {
  if (speaker === "Callout" || speaker === "Engineer") return text;
  return text.replace(/^([A-Za-z]+, (?:NO-GO|GO)\.)\s+/, "$1 [pause] ");
}

const fetched = new Map<string, Promise<string | null>>();

/** Fetch (once) the audio for a line; resolves to an object URL or null. Safe to call early to prefetch. */
export function fetchSpeech(text: string, speaker: Speaker): Promise<string | null> {
  const { voice, speed } = CAST[speaker];
  const spoken = performance(text, speaker);
  const key = `${voice}|${speed}|${spoken}`;
  let pending = fetched.get(key);
  if (!pending) {
    pending = fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: spoken, voice, speed }),
    })
      .then(async (res) => (res.status === 200 ? URL.createObjectURL(await res.blob()) : null))
      .catch(() => null);
    // Don't remember failures: the budget may open later.
    pending.then((url) => url === null && fetched.delete(key));
    fetched.set(key, pending);
  }
  return pending;
}

let ctx: AudioContext | null = null;
let stopCurrent: (() => void) | null = null;

/** Play fetched speech, reporting live loudness to voiceActivity. Resolves when it ends or is stopped. */
export function playSpeech(url: string, info: Omit<VoiceActivity, "level">): Promise<void> {
  stopSpeech();
  return new Promise((resolve) => {
    const audio = new Audio(url);
    let raf = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      audio.pause();
      if (stopCurrent === finish) stopCurrent = null;
      voiceActivity.quiet();
      resolve();
    };
    stopCurrent = finish;
    audio.onended = finish;
    audio.onerror = finish;

    // Route through an analyser for the level meter; if Web Audio isn't available, just play.
    let analyser: AnalyserNode | null = null;
    try {
      ctx ??= new AudioContext();
      void ctx.resume();
      const source = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser).connect(ctx.destination);
    } catch {
      analyser = null;
    }
    const samples = new Uint8Array(512);
    const tick = () => {
      let level = 0.5;
      if (analyser) {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += ((v - 128) / 128) ** 2;
        level = Math.min(1, Math.sqrt(sum / samples.length) * 4);
      }
      voiceActivity.emit({ ...info, level });
      raf = requestAnimationFrame(tick);
    };
    audio.play().then(
      () => (raf = requestAnimationFrame(tick)),
      () => finish(),
    );
  });
}

/** Stop whatever TTS line is playing. */
export function stopSpeech() {
  stopCurrent?.();
}
