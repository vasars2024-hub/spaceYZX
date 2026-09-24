// Pure DSP helpers for procedural sound effects.
//
// Every function renders or transforms mono `Float32Array` sample buffers and returns a NEW
// buffer (the only exception is `mixInto`, which writes into its destination on purpose).
// Nothing here touches WebAudio, the DOM or `Math.random`, so every sound renders the same
// samples every time and can be unit-tested in Node.

/** A mono buffer of samples, nominally in [-1, 1]. */
export type Signal = Float32Array;
/** A constant frequency in Hz, or a function of time in seconds (for pitch sweeps). */
export type Freq = number | ((t: number) => number);
/** A gain curve as a function of time in seconds. */
export type Envelope = (t: number) => number;
export type Wave = 'sine' | 'square' | 'saw' | 'triangle';
export type FilterType = 'lowpass' | 'highpass' | 'bandpass';

const TAU = Math.PI * 2;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const freqAt = (f: Freq, t: number): number => (typeof f === 'number' ? f : f(t));

// ---------------------------------------------------------------------------------------------
// Buffers and randomness

/** Number of samples for `dur` seconds (at least 1). */
export function sampleCount(sampleRate: number, dur: number): number {
  return Math.max(1, Math.round(sampleRate * dur));
}

/** A silent buffer of `dur` seconds. */
export function silence(sampleRate: number, dur: number): Signal {
  return new Float32Array(sampleCount(sampleRate, dur));
}

/** Small seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function createRng(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Oscillators

/** PolyBLEP correction that removes most aliasing from saw/square discontinuities. */
function polyBlep(p: number, dt: number): number {
  if (p < dt) {
    const x = p / dt;
    return x + x - x * x - 1;
  }
  if (p > 1 - dt) {
    const x = (p - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/**
 * Band-limited oscillator. `freq` may be a function of time for sweeps; the phase is integrated
 * so sweeps stay smooth. `phase` is the start phase in cycles (0..1).
 */
export function osc(sampleRate: number, dur: number, wave: Wave, freq: Freq, phase = 0): Signal {
  const out = silence(sampleRate, dur);
  let p = phase - Math.floor(phase);
  for (let i = 0; i < out.length; i++) {
    const f = freqAt(freq, i / sampleRate);
    const dt = clamp(Math.abs(f) / sampleRate, 1e-9, 0.5);
    let v: number;
    switch (wave) {
      case 'sine':
        v = Math.sin(TAU * p);
        break;
      case 'triangle':
        v = 1 - 4 * Math.abs(((p + 0.25) % 1) - 0.5);
        break;
      case 'saw':
        v = 2 * p - 1 - polyBlep(p, dt);
        break;
      case 'square':
        v = (p < 0.5 ? 1 : -1) + polyBlep(p, dt) - polyBlep((p + 0.5) % 1, dt);
        break;
    }
    out[i] = v;
    p += f / sampleRate;
    p -= Math.floor(p);
  }
  return out;
}

/**
 * Two-operator FM (phase modulation): a sine carrier modulated by a sine at `ratio` times the
 * carrier frequency. Inharmonic ratios give metallic, bell-like tones; a decaying `index` gives
 * the typical bright-attack, mellow-tail clang.
 */
export function fm(
  sampleRate: number,
  dur: number,
  carrier: Freq,
  ratio: number,
  index: number | Envelope,
): Signal {
  const out = silence(sampleRate, dur);
  let pc = 0;
  let pm = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const f = freqAt(carrier, t);
    const idx = typeof index === 'number' ? index : index(t);
    out[i] = Math.sin(TAU * pc + idx * Math.sin(TAU * pm));
    pc += f / sampleRate;
    pm += (f * ratio) / sampleRate;
    pc -= Math.floor(pc);
    pm -= Math.floor(pm);
  }
  return out;
}

/** Frequency rounded so that it completes a whole number of cycles in `loopDur` seconds. */
export function loopFreq(freq: number, loopDur: number): number {
  return Math.max(1, Math.round(freq * loopDur)) / loopDur;
}

// ---------------------------------------------------------------------------------------------
// Noise

/** Uniform white noise in [-1, 1). */
export function whiteNoise(sampleRate: number, dur: number, seed: number): Signal {
  const out = silence(sampleRate, dur);
  const rng = createRng(seed);
  for (let i = 0; i < out.length; i++) out[i] = rng() * 2 - 1;
  return out;
}

/** Pink (1/f) noise, Paul Kellet's economy filter. Softer and "airier" than white noise. */
export function pinkNoise(sampleRate: number, dur: number, seed: number): Signal {
  const out = silence(sampleRate, dur);
  const rng = createRng(seed);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < out.length; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
  }
  return out;
}

/** Brown (1/f^2) noise: deep rumble. */
export function brownNoise(sampleRate: number, dur: number, seed: number): Signal {
  const out = silence(sampleRate, dur);
  const rng = createRng(seed);
  let b = 0;
  for (let i = 0; i < out.length; i++) {
    b = (b + 0.02 * (rng() * 2 - 1)) / 1.02;
    out[i] = b * 3.5;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Envelopes and sweeps

export interface AdsrParams {
  attack: number;
  decay: number;
  /** Sustain level 0..1. */
  sustain: number;
  /** Release time; the release ends exactly at the end of the sound. */
  release: number;
}

/** ADSR envelope function for a sound lasting `dur` seconds. */
export function adsrFn({ attack, decay, sustain, release }: AdsrParams, dur: number): Envelope {
  return (t) => {
    let v: number;
    if (t < attack) v = t / attack;
    else if (t < attack + decay) v = 1 - ((1 - sustain) * (t - attack)) / decay;
    else v = sustain;
    const rel = release > 0 ? clamp((dur - t) / release, 0, 1) : 1;
    return v * rel;
  };
}

/** Rendered ADSR envelope. */
export function adsr(sampleRate: number, dur: number, params: AdsrParams): Signal {
  return render(sampleRate, dur, adsrFn(params, dur));
}

/** Percussive envelope: linear attack, then exponential decay with time constant `decay`. */
export function percFn(decay: number, attack = 0.001): Envelope {
  return (t) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));
}

/** Rendered exponential (percussive) envelope. */
export function expDecay(sampleRate: number, dur: number, decay: number, attack = 0.001): Signal {
  return render(sampleRate, dur, percFn(decay, attack));
}

/** Exponential sweep from `from` to `to` over `time` seconds, then holds `to`. */
export function expSweep(from: number, to: number, time: number): Envelope {
  const ratio = to / from;
  return (t) => from * Math.pow(ratio, clamp(t / time, 0, 1));
}

/** Linear sweep from `from` to `to` over `time` seconds, starting at `start`. */
export function linSweep(from: number, to: number, time: number, start = 0): Envelope {
  return (t) => from + (to - from) * clamp((t - start) / time, 0, 1);
}

/** Samples an arbitrary function of time into a buffer. */
export function render(sampleRate: number, dur: number, fn: Envelope): Signal {
  const out = silence(sampleRate, dur);
  for (let i = 0; i < out.length; i++) out[i] = fn(i / sampleRate);
  return out;
}

/** Multiplies a signal by an envelope (buffer or function of time). */
export function applyEnv(sig: Signal, sampleRate: number, env: Signal | Envelope): Signal {
  const out = new Float32Array(sig.length);
  if (typeof env === 'function') {
    for (let i = 0; i < sig.length; i++) out[i] = sig[i] * env(i / sampleRate);
  } else {
    for (let i = 0; i < sig.length; i++) out[i] = sig[i] * (i < env.length ? env[i] : 0);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Filters

/**
 * RBJ biquad filter. `cutoff` may be a function of time for filter sweeps (coefficients are
 * refreshed every 16 samples). The band-pass has 0 dB peak gain.
 */
export function biquad(
  sig: Signal,
  sampleRate: number,
  type: FilterType,
  cutoff: Freq,
  q = Math.SQRT1_2,
): Signal {
  const out = new Float32Array(sig.length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let a1 = 0;
  let a2 = 0;
  const update = (f: number): void => {
    const w0 = (TAU * clamp(f, 10, sampleRate * 0.45)) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.max(q, 0.05));
    const a0 = 1 + alpha;
    if (type === 'lowpass') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = b0;
    } else if (type === 'highpass') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = b0;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    b0 /= a0;
    b1 /= a0;
    b2 /= a0;
    a1 = (-2 * cos) / a0;
    a2 = (1 - alpha) / a0;
  };
  const dynamic = typeof cutoff === 'function';
  update(freqAt(cutoff, 0));
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < sig.length; i++) {
    if (dynamic && (i & 15) === 0) update(freqAt(cutoff, i / sampleRate));
    const x = sig[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

export const lowpass = (sig: Signal, sampleRate: number, cutoff: Freq, q?: number): Signal =>
  biquad(sig, sampleRate, 'lowpass', cutoff, q);
export const highpass = (sig: Signal, sampleRate: number, cutoff: Freq, q?: number): Signal =>
  biquad(sig, sampleRate, 'highpass', cutoff, q);
export const bandpass = (sig: Signal, sampleRate: number, cutoff: Freq, q?: number): Signal =>
  biquad(sig, sampleRate, 'bandpass', cutoff, q);

/** Gentle 6 dB/octave low-pass. */
export function onePoleLowpass(sig: Signal, sampleRate: number, cutoff: Freq): Signal {
  const out = new Float32Array(sig.length);
  let y = 0;
  for (let i = 0; i < sig.length; i++) {
    const a = 1 - Math.exp((-TAU * freqAt(cutoff, i / sampleRate)) / sampleRate);
    y += a * (sig[i] - y);
    out[i] = y;
  }
  return out;
}

/** Gentle 6 dB/octave high-pass. */
export function onePoleHighpass(sig: Signal, sampleRate: number, cutoff: Freq): Signal {
  const low = onePoleLowpass(sig, sampleRate, cutoff);
  const out = new Float32Array(sig.length);
  for (let i = 0; i < sig.length; i++) out[i] = sig[i] - low[i];
  return out;
}

// ---------------------------------------------------------------------------------------------
// Dynamics, mixing and finishing

/** Multiplies every sample by `g`. */
export function gain(sig: Signal, g: number): Signal {
  const out = new Float32Array(sig.length);
  for (let i = 0; i < sig.length; i++) out[i] = sig[i] * g;
  return out;
}

/** tanh soft clipper; output stays within [-1, 1]. Higher `drive` = more grit and loudness. */
export function softClip(sig: Signal, drive = 1): Signal {
  const out = new Float32Array(sig.length);
  const norm = Math.tanh(drive);
  for (let i = 0; i < sig.length; i++) out[i] = Math.tanh(sig[i] * drive) / norm;
  return out;
}

/** Largest absolute sample value. */
export function peak(sig: Signal): number {
  let p = 0;
  for (let i = 0; i < sig.length; i++) {
    const a = Math.abs(sig[i]);
    if (a > p) p = a;
  }
  return p;
}

/** Scales the signal so its peak equals `target` (silence stays silent). */
export function normalize(sig: Signal, target = 0.9): Signal {
  const p = peak(sig);
  return p > 0 ? gain(sig, target / p) : new Float32Array(sig);
}

/** Linear fade-in and fade-out (in seconds) to avoid clicks at the edges. */
export function fade(sig: Signal, sampleRate: number, fadeIn: number, fadeOut: number): Signal {
  const out = new Float32Array(sig);
  const n = out.length;
  const inLen = Math.min(n, Math.round(fadeIn * sampleRate));
  const outLen = Math.min(n, Math.round(fadeOut * sampleRate));
  for (let i = 0; i < inLen; i++) out[i] *= i / inLen;
  for (let i = 0; i < outLen; i++) out[n - 1 - i] *= i / outLen;
  return out;
}

/** Adds `src * g` into `dst` starting at sample `offset` (mutates `dst`). */
export function mixInto(dst: Signal, src: Signal, g = 1, offset = 0): Signal {
  const start = Math.max(0, offset);
  const end = Math.min(dst.length, offset + src.length);
  for (let i = start; i < end; i++) dst[i] += src[i - offset] * g;
  return dst;
}

export interface Layer {
  sig: Signal;
  /** Linear gain (default 1). */
  gain?: number;
  /** Start time in seconds (default 0). */
  at?: number;
}

/** Mixes layers into a new buffer of `dur` seconds; layers past the end are truncated. */
export function mix(sampleRate: number, dur: number, layers: Layer[]): Signal {
  const out = silence(sampleRate, dur);
  for (const l of layers) {
    mixInto(out, l.sig, l.gain ?? 1, Math.round((l.at ?? 0) * sampleRate));
  }
  return out;
}

/**
 * Feedback echo inside the existing buffer length: y[n] = x[n] + feedback * y[n - d], blended
 * with the dry signal by `wet`. Gives short "spaceship metal" tails without extra length.
 */
export function echo(
  sig: Signal,
  sampleRate: number,
  time: number,
  feedback: number,
  wet: number,
): Signal {
  const d = Math.max(1, Math.round(time * sampleRate));
  const y = new Float32Array(sig.length);
  for (let i = 0; i < sig.length; i++) y[i] = sig[i] + (i >= d ? feedback * y[i - d] : 0);
  const out = new Float32Array(sig.length);
  for (let i = 0; i < sig.length; i++) out[i] = sig[i] * (1 - wet) + y[i] * wet;
  return out;
}

/**
 * Makes a seamless loop by cross-fading the last `crossfade` seconds into the start
 * (equal-power, suited to noisy material). The result is `crossfade` seconds shorter.
 */
export function makeLoop(sig: Signal, sampleRate: number, crossfade: number): Signal {
  const c = Math.min(Math.round(crossfade * sampleRate), Math.floor(sig.length / 2));
  const n = sig.length - c;
  const out = sig.slice(0, n);
  for (let i = 0; i < c; i++) {
    const x = (i / c) * (Math.PI / 2);
    out[i] = sig[i] * Math.sin(x) + sig[n + i] * Math.cos(x);
  }
  return out;
}
