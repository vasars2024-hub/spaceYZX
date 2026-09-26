// Procedural sound recipes. Every entry renders a mono buffer at the given sample rate from
// seeded noise and oscillators, so the game ships no audio files and renders are reproducible.
// One-shots are short (well under ~1.2 s) and start their transient on the first millisecond:
// sound feedback must be crisp and never delayed. Loops are listed in LOOP_SOUNDS.

import {
  adsrFn,
  applyEnv,
  bandpass,
  brownNoise,
  echo,
  expSweep,
  fade,
  fm,
  highpass,
  loopFreq,
  lowpass,
  makeLoop,
  mix,
  normalize,
  osc,
  percFn,
  pinkNoise,
  softClip,
  whiteNoise,
} from './dsp';
import type { Envelope, Freq, Layer, Signal, Wave } from './dsp';

export type SoundDef = (sampleRate: number) => Signal;

// ---------------------------------------------------------------------------------------------
// Building blocks

/** Final pass for one-shots: click-free edges and a consistent peak level. */
const finish = (s: Signal, sr: number, level = 0.9): Signal =>
  normalize(fade(s, sr, 0.0008, 0.012), level);

/** Final pass for loops: no edge fades (they would click at the loop point). */
const finishLoop = (s: Signal, level = 0.8): Signal => normalize(s, level);

/** Tone with a percussive envelope. */
function tone(sr: number, dur: number, wave: Wave, freq: Freq, decay: number, attack = 0.001) {
  return applyEnv(osc(sr, dur, wave, freq), sr, percFn(decay, attack));
}

/** Low sine "thump" with a downward pitch drop: the body of impacts and kills. */
function thump(sr: number, dur: number, from: number, to: number, decay: number): Signal {
  return tone(sr, dur, 'sine', expSweep(from, to, dur * 0.6), decay, 0.0015);
}

/** Very short high-passed noise burst: the "crack" at the front of a transient. */
function crack(sr: number, dur: number, seed: number, decay: number, cutoff = 2500): Signal {
  return applyEnv(highpass(whiteNoise(sr, dur, seed), sr, cutoff), sr, percFn(decay, 0.0005));
}

/** Band-passed noise swept in frequency: whooshes, swishes and air. */
function whoosh(
  sr: number,
  dur: number,
  seed: number,
  cutoff: Freq,
  q: number,
  env: Envelope,
): Signal {
  return applyEnv(bandpass(whiteNoise(sr, dur, seed), sr, cutoff, q), sr, env);
}

/** Metallic FM clang with a decaying brightness. */
function bell(sr: number, dur: number, freq: Freq, ratio: number, index: number, decay: number) {
  return applyEnv(
    fm(sr, dur, freq, ratio, (t) => index * Math.exp(-t / (decay * 0.5))),
    sr,
    percFn(decay, 0.0008),
  );
}

/** Rises then falls: attack for `rise` seconds, then exponential decay. */
const swell = (rise: number, decay: number): Envelope => percFn(decay, rise);

/** Tremolo (amplitude modulation) as an envelope multiplier. */
const trem =
  (rate: Freq, depth: number): Envelope =>
  (t) => {
    const r = typeof rate === 'number' ? rate * t : rate(t);
    return 1 - depth * 0.5 * (1 - Math.cos(2 * Math.PI * r));
  };

/** `dur` seconds of `sig` starting at `skip` seconds (drops a filter's start-up transient). */
const steady = (sig: Signal, sr: number, skip: number, dur: number): Signal => {
  const start = Math.round(skip * sr);
  return sig.slice(start, start + Math.round(dur * sr));
};

const semis = (n: number): number => Math.pow(2, n / 12);

/** A bright synth note: detuned saws, low-passed, with a percussive envelope. */
function pluck(sr: number, dur: number, freq: number, decay: number, bright = 4): Signal {
  const saw = mix(sr, dur, [
    { sig: osc(sr, dur, 'saw', freq * 0.997), gain: 0.5 },
    { sig: osc(sr, dur, 'saw', freq * 1.003), gain: 0.5 },
    { sig: osc(sr, dur, 'sine', freq * 2), gain: 0.25 },
  ]);
  const filtered = lowpass(saw, sr, (t) => freq * (1 + bright * Math.exp(-t / decay)), 1.2);
  return applyEnv(filtered, sr, percFn(decay, 0.002));
}

// ---------------------------------------------------------------------------------------------
// Kill feedback helpers (escalation shares a common "punch")

/** Shared kill punch: sub thump + crack + confirm tone. */
function killPunch(sr: number, dur: number, seed: number, pitch: number): Signal {
  return mix(sr, dur, [
    { sig: thump(sr, dur, 140, 42, 0.11), gain: 1 },
    { sig: crack(sr, dur, seed, 0.018, 3000), gain: 0.55 },
    { sig: tone(sr, dur, 'triangle', pitch, 0.12), gain: 0.35 },
    { sig: tone(sr, dur, 'sine', pitch * 1.5, 0.16), gain: 0.25, at: 0.035 },
  ]);
}

/** Escalating multi-kill stinger: more notes, higher, faster and wider for bigger streaks. */
function multiKill(sr: number, level: number): Signal {
  const scale = [0, 4, 7, 12, 16, 19, 24];
  const count = level + 1;
  const base = 330 * semis((level - 1) * 2);
  const stepT = 0.075 - level * 0.008;
  const dur = Math.min(1.15, count * stepT + 0.5 + level * 0.08);
  const layers: Layer[] = [{ sig: thump(sr, dur, 160, 40, 0.14 + level * 0.03), gain: 1 }];
  for (let k = 0; k < count; k++) {
    const f = base * semis(scale[k % scale.length]);
    const last = k === count - 1;
    layers.push({
      sig: pluck(sr, dur, f, last ? 0.22 + level * 0.04 : 0.09),
      gain: 0.5,
      at: k * stepT,
    });
    layers.push({ sig: crack(sr, 0.05, 900 + k, 0.01, 4000), gain: 0.25, at: k * stepT });
  }
  const end = (count - 1) * stepT;
  if (level >= 3) {
    // Wide chord + sub on the final hit.
    layers.push({ sig: thump(sr, dur, 110, 30, 0.25), gain: 0.9, at: end });
    for (const n of [0, 7, 12]) {
      layers.push({ sig: pluck(sr, dur, base * semis(n) * 0.5, 0.35, 3), gain: 0.3, at: end });
    }
  }
  if (level >= 4) {
    layers.push({
      sig: whoosh(sr, dur, 77, expSweep(800, 6000, 0.5), 1.5, swell(0.25, 0.2)),
      gain: 0.4,
    });
  }
  let s = mix(sr, dur, layers);
  if (level >= 2) s = echo(s, sr, 0.09, 0.3, 0.3);
  return finish(softClip(s, 1.2 + level * 0.3), sr, 0.95);
}

// ---------------------------------------------------------------------------------------------
// The recipes

const defs = {
  // ------------------------------------------------------------------------------- movement
  jump: (sr) => {
    const d = 0.2;
    return finish(
      mix(sr, d, [
        { sig: tone(sr, d, 'sine', expSweep(160, 330, 0.12), 0.06, 0.004), gain: 0.7 },
        { sig: whoosh(sr, d, 11, expSweep(700, 2400, 0.15), 1.2, swell(0.02, 0.06)), gain: 0.6 },
      ]),
      sr,
      0.6,
    );
  },
  land: (sr) => {
    const d = 0.22;
    return finish(
      mix(sr, d, [
        { sig: thump(sr, d, 120, 45, 0.05), gain: 1 },
        { sig: applyEnv(lowpass(whiteNoise(sr, d, 12), sr, 900), sr, percFn(0.025)), gain: 0.6 },
      ]),
      sr,
      0.65,
    );
  },
  landHard: (sr) => {
    const d = 0.45;
    return finish(
      softClip(
        mix(sr, d, [
          { sig: thump(sr, d, 100, 30, 0.12), gain: 1.2 },
          { sig: applyEnv(lowpass(whiteNoise(sr, d, 13), sr, 1400), sr, percFn(0.05)), gain: 0.8 },
          { sig: bell(sr, d, 210, 2.76, 3, 0.12), gain: 0.25, at: 0.004 },
          { sig: crack(sr, d, 14, 0.01, 1500), gain: 0.4 },
        ]),
        1.8,
      ),
      sr,
      0.85,
    );
  },
  slide: (sr) => {
    // 1 s loop: gritty scrape with a slow grind wobble (3 Hz, whole cycles per loop).
    const d = 1;
    const x = 0.12;
    const scrape = bandpass(pinkNoise(sr, d + x, 15), sr, 1300, 0.7);
    const grit = highpass(whiteNoise(sr, d + x, 16), sr, 3500);
    const body = mix(sr, d + x, [
      { sig: scrape, gain: 1 },
      { sig: applyEnv(grit, sr, trem(3, 0.6)), gain: 0.35 },
    ]);
    return finishLoop(makeLoop(body, sr, x), 0.6);
  },
  wind: (sr) => {
    // 2 s loop of airy noise with a slow filter drift. Runtime sets volume/pitch by speed.
    const d = 2;
    const x = 0.2;
    const drift = (t: number): number => 900 + 350 * Math.sin(Math.PI * t);
    const air = bandpass(pinkNoise(sr, d + x, 17), sr, drift, 0.6);
    const rumble = lowpass(brownNoise(sr, d + x, 18), sr, 220);
    const hiss = bandpass(whiteNoise(sr, d + x, 19), sr, 4200, 0.8);
    const body = mix(sr, d + x, [
      { sig: air, gain: 1 },
      { sig: rumble, gain: 0.5 },
      { sig: hiss, gain: 0.12 },
    ]);
    return finishLoop(makeLoop(body, sr, x), 0.6);
  },
  thruster: (sr) => {
    const d = 0.5;
    const env = adsrFn({ attack: 0.012, decay: 0.08, sustain: 0.55, release: 0.3 }, d);
    return finish(
      softClip(
        mix(sr, d, [
          {
            sig: applyEnv(lowpass(whiteNoise(sr, d, 20), sr, expSweep(4500, 1500, 0.3)), sr, env),
            gain: 1,
          },
          { sig: applyEnv(lowpass(brownNoise(sr, d, 21), sr, 300), sr, env), gain: 0.9 },
          { sig: applyEnv(osc(sr, d, 'saw', 68), sr, env), gain: 0.12 },
        ]),
        1.5,
      ),
      sr,
      0.7,
    );
  },
  magboots: (sr) => {
    const d = 0.2;
    return finish(
      mix(sr, d, [
        { sig: lowpass(tone(sr, d, 'square', 55, 0.03), sr, 900), gain: 0.8 },
        { sig: bell(sr, d, 520, 1.41, 2.5, 0.04), gain: 0.35, at: 0.003 },
        {
          sig: applyEnv(osc(sr, d, 'saw', 120), sr, (t) => (t < 0.07 ? 1 - t / 0.07 : 0)),
          gain: 0.15,
        },
        { sig: thump(sr, d, 90, 45, 0.04), gain: 0.7 },
      ]),
      sr,
      0.6,
    );
  },
  dash: (sr) => {
    const d = 0.32;
    return finish(
      mix(sr, d, [
        { sig: whoosh(sr, d, 22, expSweep(500, 5000, 0.12), 1.1, swell(0.015, 0.08)), gain: 1 },
        { sig: thump(sr, d, 220, 60, 0.06), gain: 0.6 },
        { sig: tone(sr, d, 'triangle', expSweep(400, 1600, 0.1), 0.05), gain: 0.2 },
      ]),
      sr,
      0.8,
    );
  },
  mantle: (sr) => {
    const d = 0.25;
    return finish(
      mix(sr, d, [
        { sig: whoosh(sr, d, 23, expSweep(700, 1600, 0.15), 1, swell(0.03, 0.06)), gain: 0.7 },
        { sig: thump(sr, d, 150, 70, 0.04), gain: 0.6, at: 0.05 },
        { sig: crack(sr, d, 24, 0.008, 2000), gain: 0.2, at: 0.05 },
      ]),
      sr,
      0.55,
    );
  },
  railGrab: (sr) => {
    const d = 0.3;
    return finish(
      mix(sr, d, [
        { sig: bell(sr, d, 880, 1.41, 3.5, 0.07), gain: 0.6 },
        { sig: bell(sr, d, 1320, 2.1, 1.5, 0.05), gain: 0.25 },
        { sig: crack(sr, d, 25, 0.006, 3000), gain: 0.4 },
        { sig: thump(sr, d, 130, 70, 0.03), gain: 0.4 },
      ]),
      sr,
      0.6,
    );
  },
  step: (sr) => {
    const d = 0.08;
    return finish(
      mix(sr, d, [
        {
          sig: applyEnv(bandpass(whiteNoise(sr, d, 26), sr, 1500, 1.4), sr, percFn(0.012)),
          gain: 1,
        },
        { sig: thump(sr, d, 110, 60, 0.018), gain: 0.8 },
      ]),
      sr,
      0.4,
    );
  },

  // ------------------------------------------------------------------------------ boomerang
  boomerangWhistle: (sr) => {
    // 1 s loop. Tone partials complete whole cycles per loop (seamless); the spin "whoop"
    // runs at 16 Hz and the vibrato at 8 Hz. The air noise is cross-faded.
    const d = 1;
    const f0 = loopFreq(880, d);
    const vib = (t: number): number => f0 + 18 * Math.sin(2 * Math.PI * 8 * t);
    const spin = trem(16, 0.75);
    const tonal = mix(sr, d, [
      { sig: osc(sr, d, 'sine', vib), gain: 0.8 },
      { sig: osc(sr, d, 'sine', (t) => 2 * vib(t)), gain: 0.25 },
      { sig: osc(sr, d, 'triangle', (t) => 1.5 * vib(t)), gain: 0.12 },
    ]);
    const air = makeLoop(bandpass(whiteNoise(sr, d + 0.1, 27), sr, 2200, 1.5), sr, 0.1);
    const body = mix(sr, d, [
      { sig: applyEnv(tonal, sr, spin), gain: 1 },
      { sig: applyEnv(air, sr, spin), gain: 0.5 },
    ]);
    return finishLoop(body, 0.85);
  },
  throw: (sr) => {
    const d = 0.3;
    return finish(
      mix(sr, d, [
        {
          sig: whoosh(
            sr,
            d,
            28,
            (t) => 900 + 2200 * Math.sin(Math.min(1, t / 0.2) * Math.PI),
            1.3,
            swell(0.02, 0.07),
          ),
          gain: 1,
        },
        { sig: crack(sr, d, 29, 0.006, 4000), gain: 0.4 },
        { sig: tone(sr, d, 'sine', expSweep(300, 700, 0.1), 0.05), gain: 0.3 },
      ]),
      sr,
      0.75,
    );
  },
  throwWindupCharge: (sr) => {
    // 3 s: loud, rising, tremolo accelerates from 5 Hz to ~30 Hz so everyone hears it coming.
    const d = 3;
    const pitch = expSweep(110, 440, d);
    const rate = (t: number): number => 5 * t + (25 / (2 * d)) * t * t; // integral of 5->30 Hz
    const rise: Envelope = (t) => 0.35 + 0.65 * (t / d) * (t / d);
    const saws = mix(sr, d, [
      { sig: osc(sr, d, 'saw', pitch), gain: 0.5 },
      { sig: osc(sr, d, 'saw', (t) => pitch(t) * 1.005), gain: 0.5 },
      { sig: osc(sr, d, 'square', (t) => pitch(t) * 0.5), gain: 0.3 },
    ]);
    const filtered = lowpass(saws, sr, (t) => 400 + 3200 * (t / d), 3);
    const shimmer = osc(sr, d, 'sine', (t) => pitch(t) * 4);
    const hiss = bandpass(whiteNoise(sr, d, 30), sr, (t) => 1500 + 3000 * (t / d), 1.2);
    const body = mix(sr, d, [
      { sig: filtered, gain: 1 },
      { sig: shimmer, gain: 0.18 },
      { sig: hiss, gain: 0.35 },
    ]);
    const shaped = applyEnv(applyEnv(body, sr, rise), sr, trem(rate, 0.55));
    return finish(softClip(shaped, 1.6), sr, 0.95);
  },
  windupReady: (sr) => {
    const d = 0.45;
    return finish(
      mix(sr, d, [
        { sig: tone(sr, d, 'sine', 1320, 0.1), gain: 0.7 },
        { sig: tone(sr, d, 'sine', 1760, 0.14), gain: 0.7, at: 0.07 },
        { sig: bell(sr, d, 2640, 1.5, 1.2, 0.12), gain: 0.25, at: 0.07 },
        { sig: crack(sr, d, 31, 0.004, 5000), gain: 0.2 },
      ]),
      sr,
      0.8,
    );
  },
  windupFire: (sr) => {
    const d = 0.75;
    return finish(
      softClip(
        mix(sr, d, [
          { sig: thump(sr, d, 90, 32, 0.18), gain: 1.2 },
          {
            sig: applyEnv(
              lowpass(whiteNoise(sr, d, 32), sr, expSweep(6000, 400, 0.4)),
              sr,
              percFn(0.12),
            ),
            gain: 0.9,
          },
          { sig: tone(sr, d, 'saw', expSweep(1400, 180, 0.25), 0.1), gain: 0.4 },
          { sig: crack(sr, d, 33, 0.02, 2000), gain: 0.7 },
          { sig: whoosh(sr, d, 34, expSweep(3000, 600, 0.5), 1, swell(0.01, 0.2)), gain: 0.5 },
        ]),
        2.2,
      ),
      sr,
      0.95,
    );
  },
  catch: (sr) => {
    const d = 0.2;
    return finish(
      mix(sr, d, [
        {
          sig: applyEnv(bandpass(whiteNoise(sr, d, 35), sr, 2200, 1.5), sr, percFn(0.02)),
          gain: 0.8,
        },
        { sig: tone(sr, d, 'sine', expSweep(520, 300, 0.06), 0.04), gain: 0.8 },
        { sig: tone(sr, d, 'triangle', 1040, 0.03), gain: 0.25, at: 0.01 },
        { sig: crack(sr, d, 36, 0.003, 5000), gain: 0.5 },
      ]),
      sr,
      0.7,
    );
  },
  wallHit: (sr) => {
    const d = 0.35;
    return finish(
      mix(sr, d, [
        { sig: bell(sr, d, 310, 2.76, 4, 0.08), gain: 0.5 },
        { sig: applyEnv(lowpass(whiteNoise(sr, d, 37), sr, 2200), sr, percFn(0.025)), gain: 0.8 },
        { sig: thump(sr, d, 160, 70, 0.04), gain: 0.8 },
        { sig: crack(sr, d, 38, 0.005, 3000), gain: 0.4 },
      ]),
      sr,
      0.75,
    );
  },
  clash: (sr) => {
    const d = 0.65;
    return finish(
      softClip(
        mix(sr, d, [
          { sig: bell(sr, d, 1100, 1.47, 5, 0.18), gain: 0.6 },
          { sig: bell(sr, d, 1650, 2.33, 4, 0.14), gain: 0.5 },
          { sig: bell(sr, d, 740, 3.17, 3, 0.25), gain: 0.35 },
          { sig: crack(sr, d, 39, 0.02, 2500), gain: 0.9 },
          { sig: thump(sr, d, 180, 80, 0.05), gain: 0.5 },
        ]),
        1.4,
      ),
      sr,
      0.9,
    );
  },
  deflect: (sr) => {
    const d = 0.45;
    return finish(
      mix(sr, d, [
        { sig: tone(sr, d, 'sine', expSweep(1200, 2600, 0.08), 0.1), gain: 0.6 },
        { sig: bell(sr, d, 1900, 1.41, 3, 0.15), gain: 0.45, at: 0.005 },
        { sig: whoosh(sr, d, 40, expSweep(1500, 5000, 0.15), 1.4, swell(0.005, 0.08)), gain: 0.6 },
        { sig: crack(sr, d, 41, 0.006, 4000), gain: 0.6 },
      ]),
      sr,
      0.85,
    );
  },
  recallTelegraph: (sr) => {
    // Sharp, unmistakable warning: rising chirped square buzz + three fast high beeps.
    const d = 0.34;
    const buzz = lowpass(osc(sr, d, 'square', expSweep(700, 2100, 0.28)), sr, 5000);
    const beeps: Envelope = (t) => {
      const k = Math.floor(t / 0.09);
      const u = t - k * 0.09;
      return k < 3 ? Math.max(0, Math.min(1, u / 0.003, (0.05 - u) / 0.003)) : 0;
    };
    return finish(
      mix(sr, d, [
        { sig: applyEnv(buzz, sr, (t) => trem(32, 0.6)(t) * Math.min(1, t / 0.01)), gain: 0.5 },
        { sig: applyEnv(osc(sr, d, 'triangle', 2960), sr, beeps), gain: 0.45 },
        { sig: crack(sr, d, 42, 0.004, 5000), gain: 0.3 },
      ]),
      sr,
      0.9,
    );
  },
  recallWhoosh: (sr) => {
    const d = 0.5;
    return finish(
      mix(sr, d, [
        { sig: whoosh(sr, d, 43, expSweep(4000, 500, 0.35), 1.2, swell(0.04, 0.12)), gain: 1 },
        { sig: tone(sr, d, 'sine', expSweep(1800, 300, 0.3), 0.1, 0.02), gain: 0.4 },
        { sig: thump(sr, d, 120, 50, 0.08), gain: 0.4, at: 0.05 },
      ]),
      sr,
      0.85,
    );
  },
  slash: (sr) => {
    const d = 0.2;
    return finish(
      mix(sr, d, [
        { sig: whoosh(sr, d, 44, expSweep(1500, 6000, 0.08), 1.6, swell(0.01, 0.035)), gain: 1 },
        { sig: crack(sr, d, 45, 0.01, 6000), gain: 0.3, at: 0.01 },
      ]),
      sr,
      0.7,
    );
  },

  // ---------------------------------------------------------------------------------- laser
  laserWarn: (sr) => {
    const d = 0.24;
    return finish(
      applyEnv(
        mix(sr, d, [
          { sig: osc(sr, d, 'sine', expSweep(600, 1800, 0.2)), gain: 0.7 },
          { sig: lowpass(osc(sr, d, 'saw', expSweep(300, 900, 0.2)), sr, 3000), gain: 0.3 },
        ]),
        sr,
        (t) =>
          trem(40, 0.7)(t) *
          Math.min(1, t / 0.005) *
          (t < 0.2 ? 1 : Math.max(0, 1 - (t - 0.2) / 0.04)),
      ),
      sr,
      0.75,
    );
  },
  laserFire: (sr) => {
    const d = 0.35;
    return finish(
      softClip(
        mix(sr, d, [
          { sig: tone(sr, d, 'saw', expSweep(2600, 140, 0.18), 0.08), gain: 0.7 },
          { sig: tone(sr, d, 'square', expSweep(1300, 70, 0.18), 0.06), gain: 0.35 },
          { sig: crack(sr, d, 46, 0.03, 3500), gain: 0.5 },
          { sig: thump(sr, d, 180, 60, 0.05), gain: 0.6 },
        ]),
        1.8,
      ),
      sr,
      0.85,
    );
  },
  laserEmpty: (sr) => {
    const d = 0.14;
    return finish(
      mix(sr, d, [
        { sig: crack(sr, d, 47, 0.004, 1500), gain: 0.8 },
        { sig: lowpass(tone(sr, d, 'square', 110, 0.03), sr, 1200), gain: 0.5, at: 0.01 },
        { sig: tone(sr, d, 'sine', 440, 0.015), gain: 0.3, at: 0.04 },
      ]),
      sr,
      0.5,
    );
  },

  // ----------------------------------------------------------------------- guns (CS mode)
  // AK-47: a sharp supersonic crack over a punchy mid "chug" and a short room tail
  akShot: (sr) => {
    const d = 0.55;
    return finish(
      softClip(
        mix(sr, d, [
          { sig: crack(sr, d, 201, 0.012, 3200), gain: 0.9 },
          { sig: thump(sr, d, 210, 55, 0.07), gain: 1.1 },
          {
            sig: applyEnv(bandpass(whiteNoise(sr, d, 202), sr, 1100, 0.9), sr, percFn(0.045)),
            gain: 1,
          },
          {
            sig: applyEnv(
              lowpass(whiteNoise(sr, d, 203), sr, expSweep(3500, 500, 0.3)),
              sr,
              percFn(0.16, 0.004),
            ),
            gain: 0.45,
            at: 0.01,
          },
        ]),
        2.6,
      ),
      sr,
      0.95,
    );
  },
  // Desert Eagle: a heavier, deeper boom with a longer tail
  deagleShot: (sr) => {
    const d = 0.9;
    return finish(
      softClip(
        echo(
          mix(sr, d, [
            { sig: crack(sr, d, 204, 0.016, 2600), gain: 0.9 },
            { sig: thump(sr, d, 160, 38, 0.13), gain: 1.4 },
            {
              sig: applyEnv(bandpass(whiteNoise(sr, d, 205), sr, 700, 0.8), sr, percFn(0.07)),
              gain: 1,
            },
            {
              sig: applyEnv(
                lowpass(brownNoise(sr, d, 206), sr, expSweep(1800, 250, 0.5)),
                sr,
                percFn(0.3, 0.006),
              ),
              gain: 0.8,
              at: 0.01,
            },
          ]),
          sr,
          0.11,
          0.25,
          0.25,
        ),
        2.8,
      ),
      sr,
      0.98,
    );
  },
  // magazine out, magazine in, charging handle
  gunReload: (sr) => {
    const d = 1.1;
    const clack = (seed: number, f: number) =>
      mix(sr, 0.12, [
        { sig: crack(sr, 0.12, seed, 0.006, 2500), gain: 0.8 },
        { sig: bell(sr, 0.12, f, 1.9, 3, 0.03), gain: 0.35 },
        { sig: thump(sr, 0.12, 240, 120, 0.02), gain: 0.4 },
      ]);
    return finish(
      mix(sr, d, [
        { sig: clack(207, 900), gain: 0.7 },
        {
          sig: whoosh(sr, 0.3, 208, expSweep(800, 2000, 0.2), 1.2, swell(0.05, 0.08)),
          gain: 0.25,
          at: 0.1,
        },
        { sig: clack(209, 700), gain: 1, at: 0.55 },
        { sig: clack(210, 1300), gain: 0.8, at: 0.86 },
        { sig: clack(211, 1100), gain: 0.7, at: 0.95 },
      ]),
      sr,
      0.6,
    );
  },
  // pulling out a gun
  gunDraw: (sr) => {
    const d = 0.25;
    return finish(
      mix(sr, d, [
        { sig: whoosh(sr, d, 212, expSweep(600, 2500, 0.12), 1, swell(0.02, 0.05)), gain: 0.5 },
        { sig: crack(sr, d, 213, 0.005, 3000), gain: 0.6, at: 0.1 },
        { sig: bell(sr, d, 1500, 1.9, 2, 0.03), gain: 0.25, at: 0.1 },
      ]),
      sr,
      0.5,
    );
  },

  // -------------------------------------------------------------------------------- grenade
  grenadeThrow: (sr) => {
    const d = 0.32;
    return finish(
      mix(sr, d, [
        { sig: whoosh(sr, d, 48, expSweep(500, 1400, 0.2), 1, swell(0.03, 0.08)), gain: 0.9 },
        { sig: bell(sr, d, 1400, 1.73, 2, 0.04), gain: 0.25 },
        { sig: tone(sr, d, 'sine', expSweep(200, 400, 0.15), 0.06), gain: 0.4 },
      ]),
      sr,
      0.65,
    );
  },
  grenadePull: (sr) => {
    // 1 s loop: gravitational hum, 4 Hz warble. All partials whole cycles per loop.
    const d = 1;
    const hum = mix(sr, d, [
      { sig: osc(sr, d, 'sine', 55), gain: 1 },
      { sig: osc(sr, d, 'sine', 110), gain: 0.5 },
      // Filtered after a 0.5 s warm-up so the loop contains only the steady state.
      { sig: steady(lowpass(osc(sr, d + 0.5, 'saw', 83), sr, 400), sr, 0.5, d), gain: 0.25 },
    ]);
    const rumble = makeLoop(lowpass(brownNoise(sr, d + 0.1, 49), sr, 300), sr, 0.1);
    const body = mix(sr, d, [
      { sig: applyEnv(hum, sr, trem(4, 0.5)), gain: 1 },
      { sig: rumble, gain: 0.6 },
    ]);
    return finishLoop(body, 0.8);
  },
  grenadePop: (sr) => {
    const d = 0.8;
    return finish(
      softClip(
        mix(sr, d, [
          { sig: thump(sr, d, 150, 28, 0.2), gain: 1.3 },
          {
            sig: applyEnv(
              lowpass(whiteNoise(sr, d, 50), sr, expSweep(5000, 300, 0.35)),
              sr,
              percFn(0.1),
            ),
            gain: 1,
          },
          { sig: lowpass(tone(sr, d, 'saw', expSweep(400, 40, 0.4), 0.15), sr, 800), gain: 0.5 },
          { sig: crack(sr, d, 51, 0.015, 1500), gain: 0.8 },
        ]),
        2.5,
      ),
      sr,
      0.95,
    );
  },

  // ------------------------------------------------------------------------------- feedback
  // body hit: a bright metallic "ting" that rings out, on top of a short punchy thud
  hitMarker: (sr) => {
    const d = 0.42;
    return finish(
      softClip(
        mix(sr, d, [
          { sig: tone(sr, d, 'sine', 2093, 0.16), gain: 0.55 },
          { sig: bell(sr, d, 2093, 2.76, 2.2, 0.14), gain: 0.45 },
          { sig: tone(sr, d, 'sine', 4186, 0.05), gain: 0.2 },
          { sig: thump(sr, d, 190, 70, 0.055), gain: 0.75 },
          { sig: crack(sr, d, 52, 0.003, 5000), gain: 0.45 },
        ]),
        1.3,
      ),
      sr,
      0.95,
    );
  },
  // headshot: a higher double "tink-TING" that rings longer
  hitHead: (sr) => {
    const d = 0.6;
    return finish(
      softClip(
        mix(sr, d, [
          { sig: tone(sr, d, 'sine', 2637, 0.05), gain: 0.45 },
          { sig: tone(sr, d, 'sine', 3520, 0.24), gain: 0.55, at: 0.055 },
          { sig: bell(sr, d, 3520, 2.76, 2.6, 0.22), gain: 0.4, at: 0.055 },
          { sig: tone(sr, d, 'sine', 7040, 0.04), gain: 0.15, at: 0.055 },
          { sig: thump(sr, d, 220, 90, 0.04), gain: 0.5 },
          { sig: crack(sr, d, 53, 0.003, 6000), gain: 0.55 },
        ]),
        1.3,
      ),
      sr,
      0.98,
    );
  },
  killConfirm: (sr) => finish(softClip(killPunch(sr, 0.5, 54, 880), 1.6), sr, 0.95),
  killHeadshot: (sr) => {
    const d = 0.65;
    return finish(
      softClip(
        mix(sr, d, [
          { sig: killPunch(sr, d, 55, 988), gain: 1 },
          { sig: bell(sr, d, 2960, 1.41, 2, 0.22), gain: 0.35, at: 0.02 },
          { sig: tone(sr, d, 'sine', 3950, 0.18), gain: 0.2, at: 0.05 },
        ]),
        1.6,
      ),
      sr,
      0.95,
    );
  },
  killWindup: (sr) => {
    const d = 0.85;
    const chord = mix(
      sr,
      d,
      [220, 330, 440].map((f) => ({ sig: pluck(sr, d, f, 0.3, 5), gain: 0.35 })),
    );
    return finish(
      softClip(
        mix(sr, d, [
          { sig: thump(sr, d, 90, 26, 0.25), gain: 1.4 },
          { sig: crack(sr, d, 56, 0.03, 1800), gain: 0.8 },
          { sig: chord, gain: 1, at: 0.02 },
          { sig: whoosh(sr, d, 57, expSweep(4000, 700, 0.5), 1, swell(0.005, 0.2)), gain: 0.4 },
        ]),
        2,
      ),
      sr,
      0.95,
    );
  },
  killRecall: (sr) => {
    const d = 0.7;
    return finish(
      softClip(
        mix(sr, d, [
          { sig: whoosh(sr, d, 58, expSweep(800, 5000, 0.08), 1.2, swell(0.07, 0.03)), gain: 0.7 },
          { sig: killPunch(sr, d - 0.07, 59, 740), gain: 1, at: 0.07 },
          { sig: tone(sr, d, 'saw', expSweep(2400, 200, 0.3), 0.12), gain: 0.25, at: 0.07 },
        ]),
        1.8,
      ),
      sr,
      0.95,
    );
  },
  killRecallMulti: (sr) => {
    const d = 1.15;
    const arp = [0, 7, 12, 19].map((n, k) => ({
      sig: pluck(sr, d, 370 * semis(n), k === 3 ? 0.35 : 0.1),
      gain: 0.45,
      at: 0.07 + k * 0.06,
    }));
    const body = mix(sr, d, [
      { sig: whoosh(sr, d, 60, expSweep(600, 7000, 0.08), 1.1, swell(0.07, 0.05)), gain: 0.8 },
      { sig: killPunch(sr, d - 0.07, 61, 740), gain: 1, at: 0.07 },
      { sig: thump(sr, d, 100, 25, 0.3), gain: 1, at: 0.25 },
      ...arp,
    ]);
    return finish(softClip(echo(body, sr, 0.11, 0.35, 0.35), 2), sr, 0.95);
  },
  killDeflect: (sr) => {
    const d = 0.65;
    return finish(
      softClip(
        mix(sr, d, [
          { sig: bell(sr, d, 1760, 1.41, 4, 0.2), gain: 0.5 },
          { sig: killPunch(sr, d, 62, 1175), gain: 1 },
          { sig: tone(sr, d, 'sine', expSweep(900, 2400, 0.12), 0.12), gain: 0.35 },
        ]),
        1.6,
      ),
      sr,
      0.95,
    );
  },
  multiDouble: (sr) => multiKill(sr, 1),
  multiTriple: (sr) => multiKill(sr, 2),
  multiQuad: (sr) => multiKill(sr, 3),
  multiAce: (sr) => multiKill(sr, 5),
  teamKill: (sr) => {
    const d = 0.55;
    const buzz = mix(sr, d, [
      { sig: osc(sr, d, 'square', 220), gain: 0.5 },
      { sig: osc(sr, d, 'square', 233), gain: 0.5 },
    ]);
    return finish(
      mix(sr, d, [
        {
          sig: applyEnv(
            lowpass(buzz, sr, 1400),
            sr,
            adsrFn({ attack: 0.005, decay: 0.1, sustain: 0.6, release: 0.2 }, d),
          ),
          gain: 0.8,
        },
        { sig: thump(sr, d, 110, 50, 0.08), gain: 0.7 },
      ]),
      sr,
      0.75,
    );
  },
  hurt: (sr) => {
    const d = 0.3;
    return finish(
      softClip(
        mix(sr, d, [
          { sig: thump(sr, d, 160, 55, 0.07), gain: 1 },
          { sig: applyEnv(lowpass(whiteNoise(sr, d, 63), sr, 1200), sr, percFn(0.03)), gain: 0.7 },
          { sig: lowpass(tone(sr, d, 'square', 80, 0.08), sr, 700), gain: 0.5 },
        ]),
        2.2,
      ),
      sr,
      0.85,
    );
  },
  death: (sr) => {
    const d = 1.1;
    const fall = expSweep(440, 55, 0.9);
    return finish(
      softClip(
        mix(sr, d, [
          {
            sig: applyEnv(
              lowpass(osc(sr, d, 'saw', fall), sr, 1500),
              sr,
              (t) => trem(9, 0.5)(t) * Math.exp(-t / 0.4),
            ),
            gain: 0.6,
          },
          { sig: thump(sr, d, 120, 30, 0.2), gain: 1 },
          {
            sig: applyEnv(
              lowpass(whiteNoise(sr, d, 64), sr, expSweep(3000, 200, 0.8)),
              sr,
              percFn(0.25),
            ),
            gain: 0.6,
          },
          { sig: crack(sr, d, 65, 0.02, 2000), gain: 0.5 },
        ]),
        1.5,
      ),
      sr,
      0.9,
    );
  },

  // --------------------------------------------------------------------------- objective/UI
  roundStart: (sr) => {
    const d = 0.95;
    const env = adsrFn({ attack: 0.03, decay: 0.2, sustain: 0.6, release: 0.5 }, d);
    const horn = mix(
      sr,
      d,
      [220, 330, 440, 660].map((f) => ({ sig: osc(sr, d, 'saw', f), gain: 0.25 })),
    );
    return finish(
      softClip(
        mix(sr, d, [
          {
            sig: applyEnv(
              lowpass(horn, sr, (t) => 600 + 2500 * Math.exp(-t / 0.3), 1.5),
              sr,
              env,
            ),
            gain: 1,
          },
          { sig: thump(sr, d, 110, 35, 0.2), gain: 1 },
          { sig: crack(sr, d, 66, 0.02, 2000), gain: 0.4 },
        ]),
        1.4,
      ),
      sr,
      0.9,
    );
  },
  countdownTick: (sr) => {
    const d = 0.12;
    return finish(
      mix(sr, d, [
        { sig: tone(sr, d, 'sine', 1000, 0.035), gain: 0.8 },
        { sig: tone(sr, d, 'sine', 2000, 0.015), gain: 0.25 },
        { sig: crack(sr, d, 67, 0.002, 4000), gain: 0.3 },
      ]),
      sr,
      0.7,
    );
  },
  roundWin: (sr) => {
    const d = 1.2;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const layers: Layer[] = notes.map((f, k) => ({
      sig: pluck(sr, d, f, k === 3 ? 0.4 : 0.15, 3),
      gain: 0.5,
      at: k * 0.1,
    }));
    layers.push({ sig: thump(sr, d, 130, 45, 0.15), gain: 0.8, at: 0.3 });
    return finish(echo(mix(sr, d, layers), sr, 0.13, 0.3, 0.3), sr, 0.9);
  },
  roundLose: (sr) => {
    const d = 1.2;
    const notes = [392, 311.13, 261.63];
    const layers: Layer[] = notes.map((f, k) => ({
      sig: pluck(sr, d, f, k === 2 ? 0.45 : 0.16, 1.5),
      gain: 0.55,
      at: k * 0.16,
    }));
    layers.push({ sig: thump(sr, d, 90, 35, 0.2), gain: 0.7, at: 0.32 });
    return finish(echo(mix(sr, d, layers), sr, 0.15, 0.25, 0.25), sr, 0.85);
  },
  towerTouch: (sr) => {
    const d = 1.2;
    const chord = mix(
      sr,
      d,
      [261.63, 392, 523.25, 783.99].map((f) => ({ sig: pluck(sr, d, f, 0.5, 4), gain: 0.3 })),
    );
    return finish(
      softClip(
        mix(sr, d, [
          { sig: thump(sr, d, 70, 22, 0.4), gain: 1.5 },
          {
            sig: applyEnv(
              lowpass(whiteNoise(sr, d, 68), sr, expSweep(5000, 250, 0.9)),
              sr,
              percFn(0.3),
            ),
            gain: 1,
          },
          { sig: crack(sr, d, 69, 0.04, 1500), gain: 0.8 },
          { sig: chord, gain: 1, at: 0.03 },
          { sig: bell(sr, d, 1568, 1.5, 2, 0.4), gain: 0.2, at: 0.05 },
        ]),
        2.2,
      ),
      sr,
      0.97,
    );
  },
  controllerPickup: (sr) => {
    const d = 0.42;
    return finish(
      mix(sr, d, [
        { sig: pluck(sr, d, 659.25, 0.08), gain: 0.6 },
        { sig: pluck(sr, d, 987.77, 0.18), gain: 0.6, at: 0.08 },
        { sig: bell(sr, d, 2960, 1.5, 1, 0.1), gain: 0.2, at: 0.08 },
      ]),
      sr,
      0.8,
    );
  },
  controllerDrop: (sr) => {
    const d = 0.42;
    return finish(
      mix(sr, d, [
        { sig: pluck(sr, d, 659.25, 0.08), gain: 0.6 },
        { sig: pluck(sr, d, 440, 0.18), gain: 0.6, at: 0.09 },
        { sig: thump(sr, d, 140, 50, 0.06), gain: 0.7, at: 0.09 },
      ]),
      sr,
      0.8,
    );
  },
  controllerReturn: (sr) => {
    const d = 0.65;
    return finish(
      mix(sr, d, [
        { sig: whoosh(sr, d, 70, expSweep(600, 3000, 0.25), 1.1, swell(0.1, 0.08)), gain: 0.5 },
        { sig: pluck(sr, d, 523.25, 0.07), gain: 0.5, at: 0.02 },
        { sig: pluck(sr, d, 783.99, 0.07), gain: 0.5, at: 0.09 },
        { sig: pluck(sr, d, 1046.5, 0.22), gain: 0.5, at: 0.16 },
      ]),
      sr,
      0.8,
    );
  },
  revealPulse: (sr) => {
    const d = 0.75;
    return finish(
      echo(
        mix(sr, d, [
          { sig: tone(sr, d, 'sine', 1200, 0.12), gain: 0.7 },
          { sig: tone(sr, d, 'sine', 1800, 0.06), gain: 0.2 },
          { sig: tone(sr, d, 'sine', expSweep(300, 120, 0.3), 0.12, 0.004), gain: 0.5 },
        ]),
        sr,
        0.16,
        0.4,
        0.45,
      ),
      sr,
      0.75,
    );
  },
  // power-ups: one appears in the middle (a shimmer), you pick one up (a bright rising chime),
  // a Freeze hit locks someone in ice (a glassy crackle)
  powerupSpawn: (sr) => {
    const d = 0.9;
    return finish(
      echo(
        mix(sr, d, [
          { sig: bell(sr, d, 1318.5, 2.01, 1.2, 0.18), gain: 0.35 },
          { sig: pluck(sr, d, 783.99, 0.1, 2), gain: 0.35, at: 0.05 },
          { sig: pluck(sr, d, 1174.66, 0.12, 2), gain: 0.35, at: 0.13 },
          { sig: pluck(sr, d, 1567.98, 0.22, 2), gain: 0.35, at: 0.21 },
        ]),
        sr,
        0.12,
        0.35,
        0.35,
      ),
      sr,
      0.75,
    );
  },
  powerupPickup: (sr) => {
    const d = 0.55;
    return finish(
      mix(sr, d, [
        { sig: whoosh(sr, d, 81, expSweep(900, 7000, 0.2), 1.3, swell(0.03, 0.08)), gain: 0.35 },
        { sig: pluck(sr, d, 523.25, 0.06), gain: 0.5 },
        { sig: pluck(sr, d, 783.99, 0.06), gain: 0.5, at: 0.05 },
        { sig: pluck(sr, d, 1046.5, 0.2), gain: 0.55, at: 0.1 },
        { sig: bell(sr, d, 2093, 1.5, 1.4, 0.16), gain: 0.25, at: 0.1 },
      ]),
      sr,
      0.85,
    );
  },
  freeze: (sr) => {
    const d = 0.6;
    return finish(
      mix(sr, d, [
        { sig: crack(sr, d, 91, 0.03, 5000), gain: 0.7 },
        { sig: whoosh(sr, d, 92, expSweep(8000, 2500, 0.4), 2, percFn(0.18, 0.002)), gain: 0.4 },
        { sig: bell(sr, d, 2637, 2.76, 2.5, 0.14), gain: 0.35 },
        { sig: bell(sr, d, 3520, 3.1, 2, 0.1), gain: 0.25, at: 0.02 },
        { sig: thump(sr, d, 220, 90, 0.05), gain: 0.4 },
      ]),
      sr,
      0.85,
    );
  },
  uiClick: (sr) => {
    const d = 0.05;
    return finish(
      mix(sr, d, [
        { sig: tone(sr, d, 'sine', 1800, 0.008), gain: 0.8 },
        { sig: crack(sr, d, 71, 0.002, 3000), gain: 0.3 },
      ]),
      sr,
      0.5,
    );
  },
  uiHover: (sr) => finish(tone(sr, 0.04, 'sine', 2400, 0.006), sr, 0.3),
} satisfies Record<string, SoundDef>;

export type SoundName = keyof typeof defs;

/** All procedural sound recipes by name. */
export const SOUND_DEFS: Readonly<Record<SoundName, SoundDef>> = defs;

/** Every sound name, in definition order. */
export const SOUND_NAMES = Object.keys(defs) as SoundName[];

/** Sounds designed to be played with `loop = true` (seamless loop point). */
export const LOOP_SOUNDS: ReadonlySet<SoundName> = new Set<SoundName>([
  'slide',
  'wind',
  'boomerangWhistle',
  'grenadePull',
]);

/** Sounds routed to the UI volume bus instead of the SFX bus. */
export const UI_SOUNDS: ReadonlySet<SoundName> = new Set<SoundName>(['uiClick', 'uiHover']);

export const isSoundName = (name: string): name is SoundName =>
  Object.prototype.hasOwnProperty.call(defs, name);
