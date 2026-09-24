import { describe, expect, it } from 'vitest';
import {
  createRng,
  loopFreq,
  makeLoop,
  normalize,
  osc,
  peak,
  pinkNoise,
  whiteNoise,
} from '../src/audio/dsp';
import { LOOP_SOUNDS, SOUND_DEFS, SOUND_NAMES } from '../src/audio/sounds';
import type { SoundName } from '../src/audio/sounds';

const SR = 44100;

const REQUIRED: SoundName[] = [
  // movement
  'jump',
  'land',
  'landHard',
  'slide',
  'wind',
  'thruster',
  'magboots',
  'dash',
  'mantle',
  'railGrab',
  'step',
  // boomerang
  'boomerangWhistle',
  'throw',
  'throwWindupCharge',
  'windupReady',
  'windupFire',
  'catch',
  'wallHit',
  'clash',
  'deflect',
  'recallTelegraph',
  'recallWhoosh',
  'slash',
  // laser
  'laserWarn',
  'laserFire',
  'laserEmpty',
  // grenade
  'grenadeThrow',
  'grenadePull',
  'grenadePop',
  // feedback
  'hitMarker',
  'hitHead',
  'killConfirm',
  'killHeadshot',
  'killWindup',
  'killRecall',
  'killRecallMulti',
  'killDeflect',
  'multiDouble',
  'multiTriple',
  'multiQuad',
  'multiAce',
  'teamKill',
  'hurt',
  'death',
  // objective / UI
  'roundStart',
  'countdownTick',
  'roundWin',
  'roundLose',
  'towerTouch',
  'controllerPickup',
  'controllerDrop',
  'controllerReturn',
  'revealPulse',
  'uiClick',
  'uiHover',
];

/** Allowed duration in seconds per sound. */
function durationRange(name: SoundName): [number, number] {
  if (name === 'throwWindupCharge') return [2.5, 3.5];
  if (LOOP_SOUNDS.has(name)) return [0.5, 3];
  return [0.02, 1.25];
}

const renders = new Map<SoundName, Float32Array>();
const rendered = (name: SoundName): Float32Array => {
  let s = renders.get(name);
  if (!s) {
    s = SOUND_DEFS[name](SR);
    renders.set(name, s);
  }
  return s;
};

const rms = (s: Float32Array, from: number, to: number): number => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / Math.max(1, to - from));
};

describe('audio dsp', () => {
  it('seeded noise is deterministic and in range', () => {
    const a = whiteNoise(SR, 0.1, 42);
    const b = whiteNoise(SR, 0.1, 42);
    const c = whiteNoise(SR, 0.1, 43);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(peak(a)).toBeLessThanOrEqual(1);
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(peak(pinkNoise(SR, 0.5, 1))).toBeGreaterThan(0.05);
  });

  it('oscillators have the requested pitch', () => {
    for (const wave of ['sine', 'square', 'saw', 'triangle'] as const) {
      const s = osc(SR, 1, wave, 441);
      let crossings = 0;
      for (let i = 1; i < s.length; i++) if (s[i - 1] < 0 && s[i] >= 0) crossings++;
      expect(Math.abs(crossings - 441)).toBeLessThanOrEqual(2);
    }
  });

  it('normalize, loopFreq and makeLoop behave', () => {
    expect(peak(normalize(osc(SR, 0.1, 'sine', 100), 0.5))).toBeCloseTo(0.5, 5);
    expect(loopFreq(880.3, 1)).toBe(880);
    const looped = makeLoop(whiteNoise(SR, 1.1, 3), SR, 0.1);
    expect(looped.length).toBe(SR);
  });
});

describe('SOUND_DEFS', () => {
  it('defines every required sound', () => {
    for (const name of REQUIRED) expect(SOUND_DEFS[name], name).toBeTypeOf('function');
    expect(SOUND_NAMES.length).toBe(Object.keys(SOUND_DEFS).length);
  });

  for (const name of REQUIRED) {
    describe(name, () => {
      it('renders finite samples with a sane peak and duration', () => {
        const s = rendered(name);
        for (let i = 0; i < s.length; i++) {
          if (!Number.isFinite(s[i])) throw new Error(`${name}: non-finite sample at ${i}`);
        }
        const p = peak(s);
        expect(p, `${name} peak`).toBeGreaterThan(0.05);
        expect(p, `${name} peak`).toBeLessThanOrEqual(1);
        const [lo, hi] = durationRange(name);
        const dur = s.length / SR;
        expect(dur, `${name} duration`).toBeGreaterThanOrEqual(lo);
        expect(dur, `${name} duration`).toBeLessThanOrEqual(hi);
      });

      it('is deterministic', () => {
        expect(SOUND_DEFS[name](SR)).toEqual(rendered(name));
      });

      if (LOOP_SOUNDS.has(name)) {
        it('loops without a click or a level jump', () => {
          const s = rendered(name);
          let maxStep = 0;
          for (let i = 1; i < s.length; i++) maxStep = Math.max(maxStep, Math.abs(s[i] - s[i - 1]));
          const wrapStep = Math.abs(s[0] - s[s.length - 1]);
          expect(wrapStep, `${name} wrap step`).toBeLessThanOrEqual(maxStep * 1.05 + 1e-4);
          const w = Math.round(0.05 * SR);
          const head = rms(s, 0, w);
          const tail = rms(s, s.length - w, s.length);
          expect(head / tail, `${name} head/tail level`).toBeGreaterThan(0.5);
          expect(head / tail, `${name} head/tail level`).toBeLessThan(2);
        });
      } else {
        it('starts and ends silently (no clicks)', () => {
          const s = rendered(name);
          expect(Math.abs(s[0])).toBeLessThan(0.01);
          expect(Math.abs(s[s.length - 1])).toBeLessThan(0.01);
        });
      }
    });
  }
});
