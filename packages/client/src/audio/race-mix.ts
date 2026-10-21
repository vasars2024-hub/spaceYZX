// Every level of the race soundscape in one place: the lofi music (audio/music.ts), the soft
// air / slide loops while racing and the race cues (game/race-audio.ts). Tune by ear here.
//
// Gain staging (linear gains; the engine's limiter starts at 0.5 after the master volume):
//   music voices -> MUSIC_TRIM -> warm low-pass -> fade -> Music slider -> duck -> master
//   race loops / cues (sfx bus, "Game sounds" slider) -> master
// Worst case (keys chord + bass + kick + hat + crackle all peaking together) the music sums to
// about 0.95 x MUSIC_TRIM before the slider, so at the default Music volume (0.4) it peaks near
// 0.38 and sits around -28 dBFS RMS: a background bed, clearly under the effects (race cues
// peak at 0.15..0.4) and above the air loop (about -35 dBFS RMS at full speed).

// ------------------------------------------------------------------------------------ music

/** Settings → Audio → Music, the default (0 = no music at all, nothing runs). */
export const MUSIC_DEFAULT_VOLUME = 0.4;
/** Whole-music trim before the Music slider. */
export const MUSIC_TRIM = 1;
/** Fade in when a race map starts, fade out on leaving (seconds). */
export const MUSIC_FADE_IN_SEC = 3;
export const MUSIC_FADE_OUT_SEC = 1.5;
/** Music level while the announcer speaks (1 = no ducking), and how fast it comes back (s). */
export const MUSIC_DUCK = 0.6;
export const MUSIC_DUCK_RELEASE_SEC = 0.4;
/** The dull, warm top end of the whole music mix (Hz). */
export const MUSIC_LOWPASS_HZ = 6000;

/** Peak gain of one hit / note of each music voice (keys: per chord note). */
export const MUSIC_VOICE = {
  keys: 0.09,
  bass: 0.22,
  kick: 0.3,
  // (the snare and hats are filtered noise: their peaks come out at about 0.6x these)
  snare: 0.16,
  hat: 0.05,
  lead: 0.08,
  crackle: 0.03,
} as const;

/** Electric piano: FM brightness at the attack and after it mellows, and its low-pass. */
export const KEYS_FM_INDEX = { attack: 1.1, settled: 0.25, mellowSec: 0.5 } as const;
export const KEYS_LOWPASS_HZ = 1800;
/** Keys: level the held chord settles to (fraction of the peak) and its decay time (s). */
export const KEYS_SUSTAIN = 0.45;
export const KEYS_DECAY_SEC = 0.6;
export const BASS_LOWPASS_HZ = 420;
/** The snare's band-pass centre and the hats' high-pass (Hz). */
export const SNARE_BANDPASS_HZ = 1700;
export const HAT_HIGHPASS_HZ = 5000;
/** Tape wobble on the keys and the lead: depth (cents) and rate (Hz). */
export const TAPE_WOBBLE_CENTS = 7;
export const TAPE_WOBBLE_HZ = 0.45;
/** The lead's echo: delay (beats), feedback and wet level. */
export const LEAD_ECHO = { beats: 0.75, feedback: 0.3, wet: 0.35 } as const;

/** Scheduler: how often it wakes (ms) and how far ahead it schedules notes (s). */
export const MUSIC_TICK_MS = 100;
export const MUSIC_LOOKAHEAD_SEC = 0.35;
/** A note later than this (s, e.g. after a long frame hitch) is dropped, not played late. */
export const MUSIC_LATE_SEC = 0.03;

// ------------------------------------------------------------------------ race movement loops

/**
 * The air you hear while racing (replaces the combat wind loop on race and surf maps): silent
 * below `startSpeed`, swelling smoothly to `max` at `fullSpeed` (m/s). The loop is low-passed;
 * the cut-off opens from `lowpassMin` to `lowpassMax` Hz with speed, the pitch barely moves.
 */
export const RACE_AIR = {
  startSpeed: 8,
  fullSpeed: 38,
  max: 0.12,
  lowpassMin: 380,
  lowpassMax: 1000,
  rateMin: 0.92,
  rateMax: 1.08,
  /** time constant of the swell (s): the level follows speed changes this slowly */
  smoothSec: 0.35,
  /** fade when leaving the map (s) */
  fadeSec: 0.5,
} as const;

/** A crouch slide on a race map: the same air, quieter and darker (was a gritty scrape). */
export const RACE_SLIDE = { volume: 0.06, lowpass: 600, fadeInSec: 0.15, fadeOutSec: 0.3 } as const;

// ---------------------------------------------------------------------------------- race cues

/** Volume of each race cue (their recipes in sounds.ts peak at 0.45..0.65). */
export const RACE_CUE_VOLUME = {
  gate: 0.6,
  anchor: 0.35,
  portal: 0.5,
  respawn: 0.5,
  tick: 0.55,
  go: 0.6,
  finish: 0.65,
  best: 0.7,
  dnf: 0.5,
  surge: 0.45,
  fuel: 0.45,
  launch: 0.35,
  slideBoost: 0.25,
} as const;

export type RaceCue = keyof typeof RACE_CUE_VOLUME;

// ------------------------------------------------------------------------------- pure helpers

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 0..1 air level for a speed (m/s): a smoothstep from startSpeed to fullSpeed. */
export const raceAirLevel = (speed: number): number => {
  const x = clamp01((speed - RACE_AIR.startSpeed) / (RACE_AIR.fullSpeed - RACE_AIR.startSpeed));
  return Number.isFinite(x) ? x * x * (3 - 2 * x) : 0;
};

/** The air loop's low-pass cut-off (Hz) at an air level (0..1). */
export const raceAirCutoff = (level: number): number =>
  RACE_AIR.lowpassMin + (RACE_AIR.lowpassMax - RACE_AIR.lowpassMin) * clamp01(level);

/** The air loop's playback rate at an air level (0..1). */
export const raceAirRate = (level: number): number =>
  RACE_AIR.rateMin + (RACE_AIR.rateMax - RACE_AIR.rateMin) * clamp01(level);

/** One-pole smoothing of `from` toward `to` over `dt` seconds with time constant `tau`. */
export const smoothToward = (from: number, to: number, dt: number, tau: number): number => {
  if (!(dt > 0)) return from;
  if (!(tau > 0)) return to;
  return to + (from - to) * Math.exp(-dt / tau);
};
