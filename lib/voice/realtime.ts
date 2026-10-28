// Grok Voice realtime session (browser side), push-to-talk over the xAI realtime WebSocket.
// Follows the official xAI browser cookbook: ephemeral token as a subprotocol, PCM16 at 24 kHz
// both ways, manual turns (commit + response.create on release).

import type { VoiceTool } from "./tools";

const REALTIME_URL = "wss://api.x.ai/v1/realtime?model=grok-voice-3.0";
const VOICE = "rex";
const RATE = 24_000;
/** About one connection in ten never sends session.created, so each try gets this long. */
const CONNECT_TIMEOUT_MS = 5000;
const CONNECT_ATTEMPTS = 3;
/** Mic audio is dropped while Grok is playing, plus this long, so it never hears itself. */
const ECHO_GUARD_S = 0.3;

// Runs on the audio thread and hands each block of mic samples to the page.
const CAPTURE_WORKLET = `registerProcessor("capture", class extends AudioWorkletProcessor {
  process([input]) {
    if (input[0]) this.port.postMessage(input[0]);
    return true;
  }
});`;

export interface RealtimeHandlers {
  /** Running transcript of what the user is saying (cumulative). */
  onUserTranscript: (text: string, final: boolean) => void;
  /** Running transcript of the reviewer's reply (cumulative). */
  onReplyTranscript: (text: string, final: boolean) => void;
  /** The reviewer started or stopped producing audio. */
  onSpeaking: (speaking: boolean) => void;
  /** The model called a tool; resolve with the result to send back. */
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onError: (message: string) => void;
  /** The socket closed after the session was ready. */
  onClose: () => void;
}

export interface RealtimeSession {
  /** Resolves once Grok has applied our instructions; rejects if it never connects. */
  ready: Promise<void>;
  /** Replace the session instructions (persona + current design + analysis). */
  updateInstructions(instructions: string): void;
  /** Push-to-talk pressed: start streaming mic audio. */
  startTalking(): void;
  /** Push-to-talk released: commit the audio and ask for a reply. */
  stopTalking(): void;
  /** Say a line verbatim (launch callouts, review summary). */
  say(text: string): void;
  /** Send a typed message as if the user said it. */
  sendText(text: string): void;
  /** Stop the reviewer mid-sentence. */
  interrupt(): void;
  /** True while Grok audio is playing or a response is being generated. */
  busy(): boolean;
  micAnalyser: AnalyserNode;
  outputAnalyser: AnalyserNode;
  close(): void;
}

export interface RealtimeOptions {
  /** Mints a fresh ephemeral token; called once per connection attempt (a token opens one session). */
  getToken: () => Promise<string>;
  instructions: string;
  tools: VoiceTool[];
  handlers: RealtimeHandlers;
}

interface ServerEvent {
  type: string;
  [key: string]: unknown;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Open a Grok Voice session. Call it from a user gesture (a button press) so the AudioContext may play.
 * Everything sent before the session is ready, including mic audio, is queued and flushed once it is.
 */
export function createRealtimeSession({ getToken, instructions, tools, handlers }: RealtimeOptions): RealtimeSession {
  const audio = new AudioContext({ sampleRate: RATE });
  void audio.resume();
  const micAnalyser = audio.createAnalyser();
  micAnalyser.fftSize = 1024;
  const output = audio.createGain();
  const outputAnalyser = audio.createAnalyser();
  outputAnalyser.fftSize = 1024;
  output.connect(outputAnalyser);
  outputAnalyser.connect(audio.destination);

  let socket: WebSocket | null = null;
  let mic: MediaStream | null = null;
  let ready = false;
  let closed = false;
  let talking = false;
  let appended = false;
  let responding = false;
  let speaking = false;
  let playhead = 0;
  let reply = "";
  const outbox: object[] = [];
  const sources = new Set<AudioBufferSourceNode>();
  const pendingCalls: { call_id: string; name: string; arguments: string }[] = [];
  const chunk = new Int16Array(RATE / 10);
  let filled = 0;

  const send = (message: object) => {
    if (ready && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    else if (!closed) outbox.push(message);
  };

  const settings = (text: string) => ({
    instructions: text,
    voice: VOICE,
    turn_detection: null,
    audio: {
      input: { format: { type: "audio/pcm", rate: RATE }, transcription: { model: "grok-transcribe" } },
      output: { format: { type: "audio/pcm", rate: RATE } },
    },
    tools: tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters })),
  });

  // ---- Audio out: schedule each chunk where the last one ends.
  const play = (base64: string) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const samples = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
    if (samples.length === 0) return;
    const buffer = audio.createBuffer(1, samples.length, RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(output);
    source.onended = () => sources.delete(source);
    sources.add(source);
    playhead = Math.max(playhead, audio.currentTime + 0.05);
    source.start(playhead);
    playhead += buffer.duration;
  };

  const stopPlayback = () => {
    sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    });
    sources.clear();
    playhead = audio.currentTime;
  };

  const speakingTimer = setInterval(() => {
    const now = audio.currentTime < playhead;
    if (now !== speaking) {
      speaking = now;
      handlers.onSpeaking(now);
    }
  }, 80);

  const waitForPlayback = () =>
    new Promise<void>((resolve) => {
      const check = () => (closed || audio.currentTime >= playhead - 0.1 ? resolve() : setTimeout(check, 50));
      check();
    });

  // ---- Audio in: 100 ms chunks of PCM16 while push-to-talk is held.
  const record = (samples: Float32Array) => {
    if (!talking || audio.currentTime < playhead + ECHO_GUARD_S) return;
    for (const sample of samples) {
      chunk[filled++] = Math.max(-1, Math.min(1, sample)) * 0x7fff;
      if (filled < chunk.length) continue;
      send({ type: "input_audio_buffer.append", audio: toBase64(new Uint8Array(chunk.buffer.slice(0))) });
      appended = true;
      filled = 0;
    }
  };

  const flushPartialChunk = () => {
    if (filled === 0) return;
    send({ type: "input_audio_buffer.append", audio: toBase64(new Uint8Array(chunk.buffer.slice(0, filled * 2))) });
    appended = true;
    filled = 0;
  };

  const startMic = async () => {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (closed) {
      mic.getTracks().forEach((t) => t.stop());
      return;
    }
    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "text/javascript" }));
    await audio.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const capture = new AudioWorkletNode(audio, "capture", { numberOfOutputs: 0 });
    capture.port.onmessage = (e: MessageEvent<Float32Array>) => record(e.data);
    const source = audio.createMediaStreamSource(mic);
    source.connect(capture);
    source.connect(micAnalyser);
  };

  // ---- Server events.
  const runToolCalls = async () => {
    const calls = pendingCalls.splice(0);
    for (const call of calls) {
      let result: Record<string, unknown>;
      try {
        const args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
        result = await handlers.onToolCall(call.name, args);
      } catch (err) {
        result = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) } });
    }
    // Let the current line finish so the follow-up doesn't talk over it.
    await waitForPlayback();
    send({ type: "response.create" });
  };

  const handle = (event: ServerEvent) => {
    switch (event.type) {
      case "conversation.item.input_audio_transcription.updated":
      case "conversation.item.input_audio_transcription.completed":
        handlers.onUserTranscript(String(event.transcript ?? ""), event.type.endsWith("completed"));
        break;
      case "response.created":
        responding = true;
        reply = "";
        break;
      case "response.output_audio_transcript.delta":
        reply += String(event.delta ?? "");
        handlers.onReplyTranscript(reply, false);
        break;
      case "response.output_audio_transcript.done":
        handlers.onReplyTranscript(reply, true);
        break;
      case "response.output_audio.delta":
        play(String(event.delta ?? ""));
        break;
      case "response.function_call_arguments.done":
        pendingCalls.push({ call_id: String(event.call_id), name: String(event.name), arguments: String(event.arguments ?? "") });
        break;
      case "response.done":
        responding = false;
        if (pendingCalls.length) void runToolCalls();
        break;
      case "error": {
        const error = event.error as { message?: string } | undefined;
        handlers.onError(error?.message ?? "Grok Voice error.");
        break;
      }
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    ready = false;
    clearInterval(speakingTimer);
    outbox.length = 0;
    if (socket) {
      socket.onmessage = null;
      socket.close();
    }
    mic?.getTracks().forEach((t) => t.stop());
    void audio.close();
  };

  // ---- Connect: token -> socket -> session.created -> session.update -> session.updated with our instructions.
  const connectOnce = async (): Promise<WebSocket | null> => {
    const token = await getToken();
    if (closed) return null;
    const ws = new WebSocket(REALTIME_URL, [`xai-client-secret.${token}`]);
    const started = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), CONNECT_TIMEOUT_MS);
      ws.onmessage = (m) => {
        if ((JSON.parse(String(m.data)) as ServerEvent).type !== "session.created") return;
        clearTimeout(timer);
        resolve(true);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        resolve(false);
      };
    });
    if (started) return ws;
    ws.onmessage = ws.onclose = null;
    ws.close();
    return null;
  };

  const readyPromise = (async () => {
    const micStarted = startMic();
    micStarted.catch(() => {}); // awaited below; this just keeps an early mic error from going unhandled
    for (let attempt = 0; attempt < CONNECT_ATTEMPTS && !closed && !socket; attempt++) socket = await connectOnce();
    if (closed) throw new Error("closed");
    if (!socket) throw new Error("Grok Voice didn't start a session.");
    const ws = socket;
    const configured = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Grok Voice never applied the session settings.")), CONNECT_TIMEOUT_MS);
      ws.onmessage = (m) => {
        const event = JSON.parse(String(m.data)) as ServerEvent;
        // The token's own settings arrive first, in an update without instructions.
        const session = event.session as { instructions?: string } | undefined;
        if (event.type === "session.updated" && session?.instructions) {
          clearTimeout(timer);
          ws.onmessage = (msg) => handle(JSON.parse(String(msg.data)) as ServerEvent);
          resolve();
        } else if (event.type === "error") {
          handle(event);
        }
      };
      ws.onclose = () => {
        clearTimeout(timer);
        reject(new Error("Grok Voice closed the session."));
      };
    });
    ws.send(JSON.stringify({ type: "session.update", session: settings(instructions) }));
    await configured;
    await micStarted;
    ws.onclose = () => {
      if (!closed) close();
      handlers.onClose();
    };
    ready = true;
    for (const message of outbox.splice(0)) ws.send(JSON.stringify(message));
  })();
  readyPromise.catch(() => close());

  const interrupt = () => {
    stopPlayback();
    if (responding) send({ type: "response.cancel" });
  };

  return {
    ready: readyPromise,
    micAnalyser,
    outputAnalyser,
    updateInstructions(text) {
      // Before the session is ready, the latest instructions just replace what connect will send.
      if (!ready) instructions = text;
      else send({ type: "session.update", session: { instructions: text } });
    },
    startTalking() {
      interrupt();
      talking = true;
      appended = false;
      filled = 0;
    },
    stopTalking() {
      if (!talking) return;
      talking = false;
      flushPartialChunk();
      if (!appended) {
        send({ type: "input_audio_buffer.clear" });
        return;
      }
      send({ type: "input_audio_buffer.commit" });
      send({ type: "response.create" });
    },
    say(text) {
      interrupt();
      send({
        type: "conversation.item.create",
        item: { type: "force_message", role: "assistant", interruptible: true, content: [{ type: "output_text", text }] },
      });
      handlers.onReplyTranscript(text, true);
    },
    sendText(text) {
      interrupt();
      send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
      send({ type: "response.create" });
    },
    interrupt,
    busy: () => responding || audio.currentTime < playhead,
    close,
  };
}
