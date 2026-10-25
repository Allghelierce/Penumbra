// Browser voice: Web Speech API recognition and synthesis, plus a mic level meter.
// TypeScript's DOM lib doesn't ship SpeechRecognition, so the bits we use are typed here.

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canRecognize(): boolean {
  return recognitionCtor() !== null;
}

export function canSynthesize(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export interface Listener {
  /** Stop listening; onDone fires with the final transcript once the recognizer flushes. */
  stop(): void;
  /** Stop and throw away whatever was heard. */
  cancel(): void;
}

/** Start listening. onInterim streams the running transcript; onDone fires once with the final one. */
export function listen(handlers: {
  onInterim: (text: string) => void;
  onDone: (text: string) => void;
  onError: (message: string) => void;
}): Listener | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true;

  let finalText = "";
  let interimText = "";
  let cancelled = false;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (!cancelled) handlers.onDone((finalText + " " + interimText).trim());
  };

  rec.onresult = (event) => {
    interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) finalText += " " + result[0].transcript;
      else interimText += " " + result[0].transcript;
    }
    handlers.onInterim((finalText + " " + interimText).trim());
  };
  rec.onerror = (event) => {
    if (event.error === "no-speech" || event.error === "aborted") return;
    handlers.onError(event.error === "not-allowed" ? "Microphone blocked. Allow it in the address bar." : `Speech recognition error: ${event.error}`);
  };
  rec.onend = finish;

  try {
    rec.start();
  } catch {
    return null;
  }
  return {
    stop() {
      try {
        rec.stop();
      } catch {
        finish();
      }
      // Some browsers never fire onend after a very short press.
      setTimeout(finish, 1500);
    },
    cancel() {
      cancelled = true;
      rec.abort();
    },
  };
}

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  if (voices.length === 0) return null;
  const preferred = [/Daniel/, /Google UK English Male/, /Aaron/, /Alex/, /Fred/, /Google US English/, /Male/i];
  for (const re of preferred) {
    const match = voices.find((v) => re.test(v.name));
    if (match) return (cachedVoice = match);
  }
  return (cachedVoice = voices.find((v) => v.lang === "en-US") ?? voices[0]);
}

/** Speak text, cancelling anything already being said. onEnd fires when it finishes or is interrupted. */
export function speak(
  text: string,
  handlers: { onStart?: () => void; onEnd?: () => void; pitch?: number; rate?: number } = {},
): void {
  if (!canSynthesize() || !text.trim()) {
    handlers.onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = handlers.rate ?? 1.05;
  utterance.pitch = handlers.pitch ?? 0.85;
  utterance.onstart = () => handlers.onStart?.();
  utterance.onend = () => handlers.onEnd?.();
  utterance.onerror = () => handlers.onEnd?.();
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (canSynthesize()) window.speechSynthesis.cancel();
}

export interface MicMeter {
  analyser: AnalyserNode;
  stream: MediaStream;
  close(): void;
}

/** Open the microphone and return an analyser for the waveform. */
export async function openMicMeter(): Promise<MicMeter | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    return {
      analyser,
      stream,
      close() {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      },
    };
  } catch {
    return null;
  }
}
