// Procedural game audio: pure DSP + sound recipes + a thin WebAudio engine.
export { AudioEngine } from './audio';
export type {
  AudioEngineOptions,
  LoopHandle,
  PlayOptions,
  SpatialOptions,
  Vec3,
  VolumeKind,
} from './audio';
export { LOOP_SOUNDS, SOUND_DEFS, SOUND_NAMES, UI_SOUNDS, isSoundName } from './sounds';
export type { SoundDef, SoundName } from './sounds';
export * as dsp from './dsp';
