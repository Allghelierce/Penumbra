import type { PollCall } from "@/lib/design";

// Who is talking right now, and how loudly: a tiny pub/sub that the speaking code feeds and any
// visual (poll tiles, waveforms) can follow without being wired through Studio.

export interface VoiceActivity {
  role: PollCall["role"] | "Engineer" | "Callout" | null;
  text: string;
  /** 0..1 live loudness. */
  level: number;
  /** Index of the poll call being read, during the poll. */
  index?: number;
  /** A named speaker in a flight replay ("CAPCOM"), when role is "Callout". */
  speaker?: string;
}

type Listener = (activity: VoiceActivity) => void;

const SILENT: VoiceActivity = { role: null, text: "", level: 0 };
let current: VoiceActivity = SILENT;
const listeners = new Set<Listener>();

export const voiceActivity = {
  /** Calls fn now with the current state, then on every change. Returns an unsubscribe. */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    fn(current);
    return () => {
      listeners.delete(fn);
    };
  },
  get(): VoiceActivity {
    return current;
  },
  emit(next: VoiceActivity) {
    current = next;
    for (const fn of listeners) fn(next);
  },
  /** Back to silence (role null), if not already. */
  quiet() {
    if (current.role === null && current.level === 0) return;
    voiceActivity.emit(SILENT);
  },
};
