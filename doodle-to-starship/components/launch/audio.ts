// Procedural launch sound: every noise is synthesized with WebAudio, no asset files.
// One AudioContext is shared by the launch scene and the narrator (playQuindar), and
// it only starts after the user has clicked something, never on page load.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();
/** Leaves headroom for the voice narrator talking over the launch. */
const MASTER_GAIN = 0.65;
const MUTE_KEY = "penumbra-launch-muted";

function readMuted(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** True once the page has had a click or key press, so starting audio isn't autoplay. */
function hasGesture(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}

/**
 * Creates or wakes the shared AudioContext. Call it straight from a click handler
 * (the LAUNCH button) so Safari lets it start too.
 */
export function unlockLaunchAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.3;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function running(): { c: AudioContext; m: GainNode } | null {
  if (!ctx && hasGesture()) unlockLaunchAudio();
  return ctx && master && ctx.state === "running" ? { c: ctx, m: master } : null;
}

export function isLaunchAudioMuted(): boolean {
  return muted;
}

export function setLaunchAudioMuted(next: boolean) {
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    // Private mode: the toggle still works for this visit.
  }
  if (ctx && master) master.gain.setTargetAtTime(next ? 0 : MASTER_GAIN, ctx.currentTime, 0.05);
}

let lastQuindar = -Infinity;

/**
 * The Apollo "Quindar" tones: 2525 Hz then 2475 Hz, 250 ms each. Returns how long they
 * last in seconds (0 if audio isn't running) so a narrator can start speaking after.
 */
export function playQuindar(): number {
  const a = running();
  if (!a) return 0;
  const { c, m } = a;
  const t0 = Math.max(c.currentTime + 0.01, lastQuindar + 0.5);
  lastQuindar = t0;
  for (const [hz, at] of [
    [2525, t0],
    [2475, t0 + 0.25],
  ] as const) {
    const osc = c.createOscillator();
    osc.frequency.value = hz;
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.11, at + 0.006);
    g.gain.setValueAtTime(0.11, at + 0.244);
    g.gain.linearRampToValueAtTime(0, at + 0.25);
    osc.connect(g).connect(m);
    osc.start(at);
    osc.stop(at + 0.26);
  }
  return t0 + 0.5 - c.currentTime;
}

// --- Noise ---

const buffers = new Map<string, AudioBuffer>();

function noise(c: AudioContext, kind: "white" | "pink" | "brown" | "crackle"): AudioBuffer {
  const cached = buffers.get(kind);
  if (cached && cached.sampleRate === c.sampleRate) return cached;
  const n = Math.floor(c.sampleRate * (kind === "crackle" ? 2.3 : 3.1));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "white") {
      d[i] = w;
    } else if (kind === "brown") {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else if (kind === "pink") {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else if (Math.random() < 0.0022) {
      // Crackle: sparse sharp pops, the sound of a rocket's shock-laden exhaust.
      const a = (0.3 + Math.random() * 0.7) * (Math.random() < 0.5 ? -1 : 1);
      const len = 30 + Math.floor(Math.random() * 120);
      for (let k = 0; k < len && i + k < n; k++) d[i + k] += a * Math.exp(-k / (len / 5)) * (Math.random() * 0.6 + 0.4);
    }
  }
  buffers.set(kind, buf);
  return buf;
}

function source(c: AudioContext, kind: "white" | "pink" | "brown" | "crackle", loop: boolean): AudioBufferSourceNode {
  const s = c.createBufferSource();
  s.buffer = noise(c, kind);
  s.loop = loop;
  return s;
}

function filter(c: AudioContext, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** Gain node that swells in, then dies away slowly like a rumble rolling off the hills. */
function longTail(c: AudioContext, at: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setTargetAtTime(0, at + attack, decay / 4);
  return g;
}

/** Gain node with an attack/decay envelope that starts at `at`. */
function envelope(c: AudioContext, at: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return g;
}

export interface LaunchAudio {
  /** Ignition crackle and the rumble coming up. */
  ignite: () => void;
  /** Every frame: total engine throttle 0..1 and altitude (the rumble thins as the air does). */
  engine: (throttle: number, altKm: number) => void;
  maxQ: () => void;
  /** Every frame: reentry plasma 0..1, a rising roar as the air comes back. */
  reentry: (k: number) => void;
  /** Pyro bolts firing. */
  separation: () => void;
  /** Engines shut down: a falling wind-down. */
  cutoff: () => void;
  /** Made it: a soft rising chime. */
  chime: () => void;
  /** Rapid unscheduled disassembly. */
  boom: () => void;
  stop: () => void;
}

interface Layers {
  rumble: GainNode;
  rumbleLp: BiquadFilterNode;
  sub: GainNode;
  crackle: GainNode;
  hiss: GainNode;
  sources: AudioBufferSourceNode[];
}

/** The launch currently making sound; a new one silences it, so two can never overlap. */
let active: LaunchAudio | null = null;

/** Sound for one launch. Silent until the shared context is running; never throws. */
export function createLaunchAudio(): LaunchAudio {
  active?.stop();
  let bus: GainNode | null = null;
  let layers: Layers | null = null;
  let lastSet = 0;
  let lastRoar = 0;
  let roar: { gain: GainNode; band: BiquadFilterNode } | null = null;
  let stopped = false;
  const shots: AudioScheduledSourceNode[] = [];

  const get = () => {
    if (stopped) return null;
    const a = running();
    if (!a) return null;
    if (!bus) {
      bus = a.c.createGain();
      bus.connect(a.m);
    }
    return { c: a.c, out: bus };
  };

  const play = (s: AudioScheduledSourceNode, at: number, dur?: number) => {
    // Noise starts at a random spot so repeated one-shots don't sound identical.
    if (s instanceof AudioBufferSourceNode && s.buffer) s.start(at, Math.random() * s.buffer.duration * 0.5);
    else s.start(at);
    if (dur !== undefined) s.stop(at + dur);
    shots.push(s);
    if (shots.length > 40) shots.shift();
  };

  const startLayers = () => {
    const a = get();
    if (!a || layers) return;
    const { c, out } = a;
    const now = c.currentTime;
    const mk = (node: AudioNode) => {
      const g = c.createGain();
      g.gain.value = 0;
      node.connect(g).connect(out);
      return g;
    };
    const rumbleSrc = source(c, "brown", true);
    const rumbleLp = filter(c, "lowpass", 260, 0.8);
    rumbleSrc.connect(rumbleLp);
    const subSrc = source(c, "brown", true);
    const subLp = filter(c, "lowpass", 70, 1.1);
    subSrc.connect(subLp);
    const crackleSrc = source(c, "crackle", true);
    const crackleHp = filter(c, "highpass", 500);
    crackleSrc.connect(crackleHp);
    const hissSrc = source(c, "pink", true);
    const hissHp = filter(c, "highpass", 1800);
    const hissLp = filter(c, "lowpass", 7000);
    hissSrc.connect(hissHp).connect(hissLp);
    layers = { rumble: mk(rumbleLp), rumbleLp, sub: mk(subLp), crackle: mk(crackleHp), hiss: mk(hissLp), sources: [rumbleSrc, subSrc, crackleSrc, hissSrc] };
    for (const s of layers.sources) s.start(now, Math.random() * (s.buffer?.duration ?? 0));
  };

  const audio: LaunchAudio = {
    ignite() {
      const a = get();
      if (!a) return;
      const { c, out } = a;
      const t = c.currentTime;
      startLayers();
      // Igniter pops, then the whump of the main engines catching.
      const pops = source(c, "crackle", false);
      const popsHp = filter(c, "highpass", 900);
      pops.connect(popsHp).connect(envelope(c, t, 0.9, 0.02, 1.3)).connect(out);
      play(pops, t, 1.5);
      const whump = source(c, "brown", false);
      const whumpLp = filter(c, "lowpass", 220);
      whump.connect(whumpLp).connect(envelope(c, t + 0.25, 1.4, 0.06, 1.4)).connect(out);
      play(whump, t + 0.25, 1.8);
    },

    engine(throttle, altKm) {
      if (!layers && throttle > 0.02) startLayers();
      const a = get();
      if (!a || !layers) return;
      const now = a.c.currentTime;
      if (now - lastSet < 0.06) return;
      lastSet = now;
      const air = 1 - Math.min(1, Math.max(0, altKm / 70));
      const th = Math.max(0, Math.min(1, throttle));
      const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, now, 0.09);
      set(layers.rumble.gain, th * (0.12 + 0.88 * air) * 0.95);
      set(layers.rumbleLp.frequency, 110 + 300 * air * th);
      set(layers.sub.gain, th * air * 1.1);
      set(layers.crackle.gain, th * air * air * 0.55);
      set(layers.hiss.gain, th * (0.035 + 0.11 * (1 - air)));
    },

    reentry(k) {
      const a = get();
      if (!a || (!roar && k < 0.02)) return;
      const { c, out } = a;
      const now = c.currentTime;
      if (!roar) {
        const s = source(c, "pink", true);
        const band = filter(c, "bandpass", 400, 0.8);
        const gain = c.createGain();
        gain.gain.value = 0;
        s.connect(band).connect(gain).connect(out);
        s.start(now, Math.random() * (s.buffer?.duration ?? 0));
        shots.push(s);
        roar = { gain, band };
      }
      if (now - lastRoar < 0.06) return;
      lastRoar = now;
      roar.gain.gain.setTargetAtTime(Math.min(1, k) * 0.7, now, 0.15);
      roar.band.frequency.setTargetAtTime(300 + 900 * k, now, 0.2);
    },

    maxQ() {
      const a = get();
      if (!a) return;
      const { c, out } = a;
      const t = c.currentTime;
      const s = source(c, "brown", false);
      s.connect(filter(c, "bandpass", 240, 0.9)).connect(envelope(c, t, 0.9, 0.9, 1.6)).connect(out);
      play(s, t, 2.6);
    },

    separation() {
      const a = get();
      if (!a) return;
      const { c, out } = a;
      const t = c.currentTime;
      const burst = source(c, "white", false);
      burst.connect(filter(c, "bandpass", 1100, 1.2)).connect(envelope(c, t, 0.8, 0.004, 0.12)).connect(out);
      play(burst, t, 0.2);
      const thunk = c.createOscillator();
      thunk.frequency.setValueAtTime(150, t);
      thunk.frequency.exponentialRampToValueAtTime(38, t + 0.3);
      thunk.connect(envelope(c, t, 0.9, 0.006, 0.45)).connect(out);
      play(thunk, t, 0.5);
    },

    cutoff() {
      const a = get();
      if (!a) return;
      const { c, out } = a;
      const t = c.currentTime;
      const saw = c.createOscillator();
      saw.type = "sawtooth";
      saw.frequency.setValueAtTime(170, t);
      saw.frequency.exponentialRampToValueAtTime(32, t + 1.7);
      saw.connect(filter(c, "lowpass", 420)).connect(envelope(c, t, 0.1, 0.02, 1.8)).connect(out);
      play(saw, t, 1.9);
    },

    chime() {
      const a = get();
      if (!a) return;
      const { c, out } = a;
      const t = c.currentTime;
      // A little delay line for shimmer.
      const delay = c.createDelay(1);
      delay.delayTime.value = 0.23;
      const fb = c.createGain();
      fb.gain.value = 0.32;
      const damp = filter(c, "lowpass", 3200);
      delay.connect(damp).connect(fb).connect(delay);
      damp.connect(out);
      [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => {
        const at = t + i * 0.14;
        for (const [mult, peak] of [
          [1, 0.12],
          [2, 0.025],
        ] as const) {
          const osc = c.createOscillator();
          osc.frequency.value = hz * mult;
          const g = envelope(c, at, peak, 0.02, 2.2);
          osc.connect(g);
          g.connect(out);
          g.connect(delay);
          play(osc, at, 2.4);
        }
      });
    },

    boom() {
      const a = get();
      if (!a) return;
      const { c, out } = a;
      const t = c.currentTime;
      const crack = source(c, "white", false);
      crack.connect(filter(c, "highpass", 1500)).connect(envelope(c, t, 0.5, 0.002, 0.06)).connect(out);
      play(crack, t, 0.1);
      const body = source(c, "brown", false);
      const lp = filter(c, "lowpass", 900, 0.9);
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.exponentialRampToValueAtTime(70, t + 2.6);
      body.connect(lp).connect(longTail(c, t, 1.6, 0.015, 5)).connect(out);
      play(body, t, 6);
      const drop = c.createOscillator();
      drop.frequency.setValueAtTime(62, t);
      drop.frequency.exponentialRampToValueAtTime(26, t + 1.6);
      drop.connect(envelope(c, t, 1, 0.01, 2.6)).connect(out);
      play(drop, t, 2.8);
      const tail = source(c, "pink", true);
      tail.connect(filter(c, "lowpass", 260)).connect(longTail(c, t + 0.2, 0.55, 0.5, 7)).connect(out);
      play(tail, t + 0.2, 9);
    },

    stop() {
      if (stopped) return;
      stopped = true;
      if (active === audio) active = null;
      const a = running();
      if (!a || !bus) return;
      const now = a.c.currentTime;
      const b = bus;
      b.gain.setTargetAtTime(0, now, 0.08);
      const all = [...(layers?.sources ?? []), ...shots];
      window.setTimeout(() => {
        for (const s of all) {
          try {
            s.stop();
          } catch {
            // Already stopped.
          }
        }
        b.disconnect();
      }, 700);
    },
  };
  active = audio;
  return audio;
}
