// How busy the screen gets. A 5v5 at full effects is a lot to read, so the default ("reduced")
// keeps everything that tells you about danger and quiets the rest: teammates' effects fade,
// far-away trails and sparks go, surface detail is calmer. Gameplay information (enemy lines,
// warnings, markers) is never removed.
import type { Settings } from '../settings';

export type EffectsLevel = Settings['effects'];

export interface EffectsProfile {
  /** multiplier on decorative sparks and shatters */
  particles: number;
  /** opacity multiplier for teammates' Boomerang trails, Wind-up and Laser lines */
  mateFx: number;
  /** Boomerangs farther than this (m) draw no trail */
  trailRange: number;
  killFeedRows: number;
  /** contrast of the fine surface detail (seams, grating, bolts): 1 = as drawn */
  textureDetail: number;
  screenShake: number;
  /** zero-G dust and light glows/shafts (still also limited by the quality preset) */
  decoration: boolean;
  /** sound visualizer: most indicators at once; quiet sounds (footsteps…) only if this loud */
  radarMax: number;
  radarQuietMin: number;
}

export const EFFECTS: Record<EffectsLevel, EffectsProfile> = {
  full: {
    particles: 1,
    mateFx: 1,
    trailRange: Infinity,
    killFeedRows: 6,
    textureDetail: 1,
    screenShake: 1,
    decoration: true,
    radarMax: 8,
    radarQuietMin: 0,
  },
  reduced: {
    particles: 0.5,
    mateFx: 0.35,
    trailRange: 40,
    killFeedRows: 4,
    textureDetail: 0.5,
    screenShake: 0.6,
    // light glows/shafts and dust are ~260 extra draws of see-through layers: a big frame-rate
    // cost on laptop graphics, and more to look at
    decoration: false,
    radarMax: 5,
    radarQuietMin: 0.6,
  },
  minimal: {
    particles: 0.2,
    mateFx: 0.15,
    trailRange: 25,
    killFeedRows: 3,
    textureDetail: 0.25,
    screenShake: 0.3,
    decoration: false,
    radarMax: 3,
    radarQuietMin: 2, // never: only real threats
  },
};

/** The active profile (read by effects every frame). */
export let effects: EffectsProfile = EFFECTS.reduced;
export const setEffects = (level: EffectsLevel): void => {
  effects = EFFECTS[level] ?? EFFECTS.reduced;
};
