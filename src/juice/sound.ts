import { getPrefs } from "../phone/prefs";
import { createThrottle, nowMs } from "./throttle";

// All sound is synthesised with Web Audio: no files to load, nothing to license.

/** One note: start offset and length in seconds, peak gain before master volume. */
export interface Note {
  f: number;
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** Glide to this frequency over the note (for the "wah-wah" sting). */
  to?: number;
}

export type SfxName = "chime" | "oyster" | "doors" | "ping" | "coin" | "fanfare" | "promotion" | "late" | "tap" | "alert";

export const RECIPES: Record<SfxName, Note[]> = {
  // Station "bing-bong": a falling major third.
  chime: [
    { f: 659.3, at: 0, dur: 0.55, gain: 0.22 },
    { f: 523.3, at: 0.32, dur: 0.8, gain: 0.22 },
  ],
  // Oyster / contactless reader accept beep.
  oyster: [{ f: 1975, at: 0, dur: 0.12, gain: 0.12 }],
  // Doors closing: three quick beeps.
  doors: [0, 0.2, 0.4].map((at) => ({ f: 1047, at, dur: 0.12, type: "square" as const, gain: 0.04 })),
  ping: [
    { f: 1319, at: 0, dur: 0.12, gain: 0.14 },
    { f: 1760, at: 0.08, dur: 0.22, gain: 0.12 },
  ],
  coin: [
    { f: 988, at: 0, dur: 0.08, type: "square", gain: 0.05 },
    { f: 1319, at: 0.08, dur: 0.32, type: "square", gain: 0.05 },
  ],
  fanfare: [
    { f: 523.3, at: 0, dur: 0.14, type: "triangle", gain: 0.2 },
    { f: 659.3, at: 0.13, dur: 0.14, type: "triangle", gain: 0.2 },
    { f: 784, at: 0.26, dur: 0.14, type: "triangle", gain: 0.2 },
    { f: 1047, at: 0.39, dur: 0.6, type: "triangle", gain: 0.22 },
    { f: 784, at: 0.39, dur: 0.6, type: "sine", gain: 0.08 },
  ],
  promotion: [
    { f: 392, at: 0, dur: 0.12, type: "triangle", gain: 0.18 },
    { f: 523.3, at: 0.11, dur: 0.12, type: "triangle", gain: 0.18 },
    { f: 659.3, at: 0.22, dur: 0.12, type: "triangle", gain: 0.18 },
    { f: 784, at: 0.33, dur: 0.2, type: "triangle", gain: 0.18 },
    { f: 659.3, at: 0.5, dur: 0.12, type: "triangle", gain: 0.18 },
    { f: 784, at: 0.62, dur: 0.12, type: "triangle", gain: 0.18 },
    { f: 1047, at: 0.74, dur: 0.7, type: "triangle", gain: 0.2 },
  ],
  // Sad trombone, short.
  late: [
    { f: 311, at: 0, dur: 0.32, type: "sawtooth", gain: 0.05, to: 294 },
    { f: 262, at: 0.34, dur: 0.6, type: "sawtooth", gain: 0.05, to: 220 },
  ],
  tap: [{ f: 660, at: 0, dur: 0.035, gain: 0.08 }],
  alert: [
    { f: 880, at: 0, dur: 0.14, type: "triangle", gain: 0.16 },
    { f: 660, at: 0.15, dur: 0.22, type: "triangle", gain: 0.16 },
  ],
};

/** Minimum ms between repeats of each sound. */
export const SFX_GAPS: Record<SfxName, number> = {
  chime: 700,
  oyster: 150,
  doors: 1500,
  ping: 300,
  coin: 120,
  fanfare: 1500,
  promotion: 1500,
  late: 1500,
  tap: 60,
  alert: 800,
};

const allow = createThrottle(SFX_GAPS);

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// Browsers only allow audio after a gesture: create/resume the context on the first one.
if (typeof window !== "undefined") {
  const unlock = () => {
    if (audio()?.state === "running") {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    }
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

function ready(): AudioContext | null {
  const p = getPrefs();
  if (!p.sound || p.volume <= 0) return null;
  const c = audio();
  if (c && master) master.gain.value = p.volume;
  return c;
}

/** Play a named sound effect. Respects prefs, throttles repeats, never throws. */
export function sfx(name: SfxName): void {
  try {
    if (!allow(name, nowMs())) return;
    const c = ready();
    if (!c || !master) return;
    const t0 = c.currentTime + 0.01;
    for (const n of RECIPES[name]) {
      const osc = c.createOscillator();
      const g = c.createGain();
      const start = t0 + n.at;
      const end = start + n.dur;
      osc.type = n.type ?? "sine";
      osc.frequency.setValueAtTime(n.f, start);
      if (n.to) osc.frequency.linearRampToValueAtTime(n.to, end);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(n.gain ?? 0.15, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(g).connect(master);
      osc.start(start);
      osc.stop(end + 0.05);
    }
  } catch {
    // Sound is decoration; never break the game for it.
  }
}

// ---- Train rumble: looping low-passed brown noise, very quiet. ----

let rumbleSrc: AudioBufferSourceNode | null = null;
let rumbleGain: GainNode | null = null;
const RUMBLE_LEVEL = 0.18;

function brownNoise(c: AudioContext): AudioBuffer {
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

/** Start (or keep) the moving-train rumble. Idempotent. */
export function startRumble(): void {
  try {
    if (rumbleSrc) return;
    const c = ready();
    if (!c || !master) return;
    const src = c.createBufferSource();
    src.buffer = brownNoise(c);
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 160;
    const g = c.createGain();
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(RUMBLE_LEVEL, c.currentTime + 0.6);
    src.connect(lp).connect(g).connect(master);
    src.start();
    rumbleSrc = src;
    rumbleGain = g;
  } catch {
    rumbleSrc = null;
  }
}

/** Fade the rumble out. Safe to call when it isn't playing. */
export function stopRumble(): void {
  try {
    const src = rumbleSrc;
    const g = rumbleGain;
    rumbleSrc = null;
    rumbleGain = null;
    if (!src || !g || !ctx) return;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + 0.4);
    src.stop(t + 0.45);
  } catch {
    // ignore
  }
}
