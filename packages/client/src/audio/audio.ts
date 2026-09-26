// Thin WebAudio layer over the procedural sound recipes.
//
// - The AudioContext is created lazily in `unlock()` (browsers only allow audio after a user
//   gesture). Until then, and whenever WebAudio is unavailable, every call is a silent no-op.
// - All recipes are rendered into AudioBuffers once, spread over idle callbacks so startup does
//   not hitch. A sound requested before its turn is rendered on the spot, so playback is never
//   delayed.
// - Routing: voice -> [panner] -> sfx|ui bus -> master -> limiter -> speakers.
// - Proximity: 3D sounds fade linearly to silence at their `maxDistance` (default 40 m); a
//   one-shot farther away than that is not played at all.

import { SOUND_DEFS, SOUND_NAMES, UI_SOUNDS } from './sounds';
import type { SoundName } from './sounds';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type VolumeKind = 'master' | 'sfx' | 'ui';

export interface PlayOptions {
  /** Linear gain, default 1. */
  volume?: number;
  /** Playback rate (1 = normal; also shifts pitch), default 1. */
  rate?: number;
  /** Pitch offset in cents, default 0. */
  detune?: number;
}

export interface SpatialOptions extends PlayOptions {
  /** Distance (m) at which the sound plays at full volume. Default 4. */
  refDistance?: number;
  /** Hearing range (m): the sound fades out linearly and is silent beyond it. Default 40. */
  maxDistance?: number;
  /** How fast the volume falls off with distance (1 = silent exactly at maxDistance). */
  rolloff?: number;
}

/** Control handle for a looping sound. All methods are safe to call after `stop()`. */
export interface LoopHandle {
  /** Moves the source (3D loops only; ignored for 2D loops). */
  setPosition(v: Vec3): void;
  setRate(rate: number): void;
  setVolume(volume: number): void;
  /** Fades out over `fade` seconds (default 0.05) and releases the voice. */
  stop(fade?: number): void;
}

export interface AudioEngineOptions {
  /** Max simultaneous one-shot voices per sound; the oldest is cut when exceeded. Default 6. */
  maxVoicesPerSound?: number;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const NOOP_LOOP: LoopHandle = {
  setPosition: () => {},
  setRate: () => {},
  setVolume: () => {},
  stop: () => {},
};

/** Default hearing range (m) of a 3D sound. */
export const DEFAULT_HEARING_RANGE = 40;

/** Time constant (s) for smoothing parameter changes (avoids zipper noise and clicks). */
const SMOOTH = 0.015;

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function findAudioContext(): AudioContextCtor | undefined {
  const g = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return g.AudioContext ?? g.webkitAudioContext;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private failed = false;
  private master: GainNode | null = null;
  private buses: Partial<Record<'sfx' | 'ui', GainNode>> = {};
  private readonly volumes: Record<VolumeKind, number> = { master: 1, sfx: 1, ui: 1 };
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly voices = new Map<SoundName, Voice[]>();
  private readonly pending: SoundName[] = [];
  private readonly maxVoices: number;
  private renderScheduled = false;
  private listenerPos: Vec3 | null = null;
  /** Game sounds (sfx bus) silenced while a menu is open; UI sounds keep playing. */
  private sfxPaused = false;

  constructor(options: AudioEngineOptions = {}) {
    this.maxVoices = Math.max(1, options.maxVoicesPerSound ?? 6);
  }

  /** True once an AudioContext exists and is running. */
  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** True once every sound has been rendered. */
  get ready(): boolean {
    return this.ctx !== null && this.buffers.size === SOUND_NAMES.length;
  }

  /**
   * Creates/resumes the AudioContext. Call from a user gesture (click, key press). Safe to call
   * repeatedly; never throws.
   */
  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    } catch (_err) {
      this.failed = true;
      this.ctx = null;
    }
  }

  /**
   * Installs one-time `pointerdown`/`keydown` listeners that call `unlock()`. Returns a function
   * that removes them.
   */
  unlockOnFirstGesture(target: EventTarget = globalThis): () => void {
    const events = ['pointerdown', 'keydown', 'touchstart'];
    const handler = (): void => {
      this.unlock();
      if (this.unlocked) remove();
    };
    const remove = (): void => {
      for (const e of events) target.removeEventListener?.(e, handler, true);
    };
    for (const e of events) target.addEventListener?.(e, handler, true);
    return remove;
  }

  /** Sets a volume (0..1). Works before `unlock()`; the value is applied when audio starts. */
  setVolume(kind: VolumeKind, value: number): void {
    const v = clamp01(finite(value, 1));
    this.volumes[kind] = v;
    const node = kind === 'master' ? this.master : this.buses[kind];
    const target = kind === 'sfx' && this.sfxPaused ? 0 : v;
    if (node && this.ctx) node.gain.setTargetAtTime(target, this.ctx.currentTime, SMOOTH);
  }

  /** Fades game sounds (incl. loops) out while a menu is open, and back in on resume. */
  setSfxPaused(paused: boolean): void {
    if (paused === this.sfxPaused) return;
    this.sfxPaused = paused;
    const bus = this.buses.sfx;
    if (bus && this.ctx)
      bus.gain.setTargetAtTime(paused ? 0 : this.volumes.sfx, this.ctx.currentTime, 0.05);
  }

  getVolume(kind: VolumeKind): number {
    return this.volumes[kind];
  }

  /** Plays a non-positional (2D) sound, e.g. UI, hit markers, your own footsteps. */
  play(name: SoundName, opts: PlayOptions = {}): void {
    try {
      const voice = this.startVoice(name, opts, false, null);
      if (voice) this.track(name, voice);
    } catch (_err) {
      // Audio must never break the game.
    }
  }

  /** Plays a positional sound at `position` (world metres) with HRTF panning. */
  play3d(name: SoundName, position: Vec3, opts: SpatialOptions = {}): void {
    try {
      if (!this.inHearingRange(position, opts)) return;
      const panner = this.createPanner(position, opts);
      if (!panner) return;
      const voice = this.startVoice(name, opts, false, panner);
      if (voice) this.track(name, voice);
    } catch (_err) {
      // Audio must never break the game.
    }
  }

  /** Starts a looping non-positional sound (e.g. wind while moving fast). */
  loop2d(name: SoundName, opts: PlayOptions = {}): LoopHandle {
    try {
      const voice = this.startVoice(name, opts, true, null);
      return voice ? this.loopHandle(voice, null) : NOOP_LOOP;
    } catch (_err) {
      return NOOP_LOOP;
    }
  }

  /** Starts a looping positional sound (e.g. a Boomerang's whistle, a grenade's pull). */
  loop3d(name: SoundName, position: Vec3, opts: SpatialOptions = {}): LoopHandle {
    try {
      const panner = this.createPanner(position, opts);
      if (!panner) return NOOP_LOOP;
      const voice = this.startVoice(name, opts, true, panner);
      return voice ? this.loopHandle(voice, panner) : NOOP_LOOP;
    } catch (_err) {
      return NOOP_LOOP;
    }
  }

  /** Updates the listener (the local player's head): position and facing, in world space. */
  setListener(position: Vec3, forward: Vec3, up: Vec3): void {
    this.listenerPos = { x: position.x, y: position.y, z: position.z };
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const l = ctx.listener;
      if (l.positionX) {
        const t = ctx.currentTime;
        l.positionX.setValueAtTime(position.x, t);
        l.positionY.setValueAtTime(position.y, t);
        l.positionZ.setValueAtTime(position.z, t);
        l.forwardX.setValueAtTime(forward.x, t);
        l.forwardY.setValueAtTime(forward.y, t);
        l.forwardZ.setValueAtTime(forward.z, t);
        l.upX.setValueAtTime(up.x, t);
        l.upY.setValueAtTime(up.y, t);
        l.upZ.setValueAtTime(up.z, t);
      } else {
        l.setPosition(position.x, position.y, position.z);
        l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
      }
    } catch (_err) {
      // Ignore (e.g. non-finite values).
    }
  }

  /** Stops every one-shot voice (e.g. on returning to the menu). Loops are stopped via handles. */
  stopAll(): void {
    for (const list of this.voices.values()) {
      for (const v of list) stopSource(v.source);
      list.length = 0;
    }
  }

  // -------------------------------------------------------------------------------- internals

  /** Is `position` close enough to the listener to be heard at all? */
  private inHearingRange(position: Vec3, opts: SpatialOptions): boolean {
    const l = this.listenerPos;
    if (!l) return true;
    const range = opts.maxDistance ?? DEFAULT_HEARING_RANGE;
    const dx = position.x - l.x;
    const dy = position.y - l.y;
    const dz = position.z - l.z;
    return dx * dx + dy * dy + dz * dz <= range * range;
  }

  private init(): void {
    const Ctor = findAudioContext();
    if (!Ctor) {
      this.failed = true;
      return;
    }
    const ctx = new Ctor({ latencyHint: 'interactive' });
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = this.volumes.master;
    master.connect(limiter);
    for (const kind of ['sfx', 'ui'] as const) {
      const bus = ctx.createGain();
      bus.gain.value = kind === 'sfx' && this.sfxPaused ? 0 : this.volumes[kind];
      bus.connect(master);
      this.buses[kind] = bus;
    }
    this.ctx = ctx;
    this.master = master;
    this.pending.push(...SOUND_NAMES);
    this.scheduleRender();
  }

  /** Renders queued sounds in small slices during idle time. */
  private scheduleRender(): void {
    if (this.renderScheduled || this.pending.length === 0) return;
    this.renderScheduled = true;
    const g = globalThis as unknown as {
      requestIdleCallback?: (cb: (d: IdleDeadline) => void, o?: { timeout: number }) => number;
    };
    const work = (deadline?: IdleDeadline): void => {
      this.renderScheduled = false;
      const start = performance.now();
      // Render at least one sound per slice; keep going while there is idle time left.
      do {
        const name = this.pending.shift();
        if (!name) break;
        this.getBuffer(name);
      } while (
        this.pending.length > 0 &&
        (deadline ? deadline.timeRemaining() > 4 : performance.now() - start < 4)
      );
      this.scheduleRender();
    };
    if (g.requestIdleCallback) g.requestIdleCallback(work, { timeout: 200 });
    else setTimeout(() => work(), 16);
  }

  private getBuffer(name: SoundName): AudioBuffer | null {
    const cached = this.buffers.get(name);
    if (cached) return cached;
    const ctx = this.ctx;
    if (!ctx) return null;
    const def = SOUND_DEFS[name];
    if (!def) return null;
    const samples = def(ctx.sampleRate);
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.getChannelData(0).set(samples);
    this.buffers.set(name, buffer);
    return buffer;
  }

  private createPanner(position: Vec3, opts: SpatialOptions): PannerNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    // linear: full volume up to refDistance, then fading to silence at maxDistance
    p.distanceModel = 'linear';
    p.refDistance = Math.max(0.01, opts.refDistance ?? 4);
    p.maxDistance = Math.max(p.refDistance + 1, opts.maxDistance ?? DEFAULT_HEARING_RANGE);
    p.rolloffFactor = Math.min(1, Math.max(0, opts.rolloff ?? 1));
    setPannerPosition(ctx, p, position, false);
    return p;
  }

  private startVoice(
    name: SoundName,
    opts: PlayOptions,
    loop: boolean,
    panner: PannerNode | null,
  ): Voice | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const buffer = this.getBuffer(name);
    if (!buffer) return null;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = Math.max(0.01, finite(opts.rate ?? 1, 1));
    if (source.detune) source.detune.value = finite(opts.detune ?? 0, 0);
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, finite(opts.volume ?? 1, 1));
    source.connect(gain);
    const bus = this.buses[UI_SOUNDS.has(name) ? 'ui' : 'sfx'];
    if (!bus) return null;
    if (panner) {
      gain.connect(panner);
      panner.connect(bus);
    } else {
      gain.connect(bus);
    }
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      panner?.disconnect();
    };
    source.start();
    return { source, gain };
  }

  /** Enforces the per-sound voice cap for one-shots. */
  private track(name: SoundName, voice: Voice): void {
    let list = this.voices.get(name);
    if (!list) {
      list = [];
      this.voices.set(name, list);
    }
    list.push(voice);
    const prev = voice.source.onended;
    voice.source.onended = (ev) => {
      const i = list.indexOf(voice);
      if (i >= 0) list.splice(i, 1);
      if (prev) prev.call(voice.source, ev);
    };
    while (list.length > this.maxVoices) {
      const oldest = list.shift();
      if (oldest) fadeOutAndStop(this.ctx, oldest, 0.01);
    }
  }

  private loopHandle(voice: Voice, panner: PannerNode | null): LoopHandle {
    let stopped = false;
    return {
      setPosition: (v) => {
        if (!stopped && panner && this.ctx) setPannerPosition(this.ctx, panner, v, true);
      },
      setRate: (r) => {
        if (stopped || !this.ctx) return;
        const rate = Math.max(0.01, finite(r, 1));
        voice.source.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, SMOOTH);
      },
      setVolume: (v) => {
        if (stopped || !this.ctx) return;
        voice.gain.gain.setTargetAtTime(Math.max(0, finite(v, 0)), this.ctx.currentTime, SMOOTH);
      },
      stop: (fade = 0.05) => {
        if (stopped) return;
        stopped = true;
        fadeOutAndStop(this.ctx, voice, fade);
      },
    };
  }
}

function setPannerPosition(ctx: AudioContext, p: PannerNode, v: Vec3, smooth: boolean): void {
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return;
  if (p.positionX) {
    const t = ctx.currentTime;
    if (smooth) {
      p.positionX.setTargetAtTime(v.x, t, SMOOTH);
      p.positionY.setTargetAtTime(v.y, t, SMOOTH);
      p.positionZ.setTargetAtTime(v.z, t, SMOOTH);
    } else {
      p.positionX.setValueAtTime(v.x, t);
      p.positionY.setValueAtTime(v.y, t);
      p.positionZ.setValueAtTime(v.z, t);
    }
  } else {
    p.setPosition(v.x, v.y, v.z);
  }
}

function fadeOutAndStop(ctx: AudioContext | null, voice: Voice, fade: number): void {
  try {
    if (!ctx) {
      stopSource(voice.source);
      return;
    }
    const t = ctx.currentTime;
    const g = voice.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + Math.max(0.005, fade));
    voice.source.stop(t + Math.max(0.005, fade) + 0.01);
  } catch (_err) {
    stopSource(voice.source);
  }
}

function stopSource(source: AudioBufferSourceNode): void {
  try {
    source.stop();
  } catch (_err) {
    // Already stopped.
  }
}
