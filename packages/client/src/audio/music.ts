// The lofi music player: plays audio/lofi.ts's note events with a handful of live WebAudio
// voices (no audio files). A lookahead scheduler wakes every MUSIC_TICK_MS and schedules the
// notes due in the next MUSIC_LOOKAHEAD_SEC on the AudioContext clock, so timing stays tight
// even when a frame hitches. Nothing runs before start() or after stop(); while the tab is
// hidden the music fades out and stops scheduling, and picks up at the next bar on return.
//
//   keys  FM electric piano (sine carrier + sine modulator, bright attack mellowing), strummed,
//         tape-wobbled, low-passed          bass  a triangle through a low-pass (round)
//   drums a pitch-dropping sine kick, band-passed noise snare, high-passed noise hats
//   lead  a soft sine mallet with a dark echo                crackle  a looped vinyl buffer
// Levels and filters: audio/race-mix.ts.
import { whiteNoise } from './dsp';
import { LofiSequencer, playable, vinylCrackle } from './lofi';
import type { LofiSong, TimedEvent } from './lofi';
import {
  BASS_LOWPASS_HZ,
  HAT_HIGHPASS_HZ,
  KEYS_DECAY_SEC,
  KEYS_FM_INDEX,
  KEYS_LOWPASS_HZ,
  KEYS_SUSTAIN,
  LEAD_ECHO,
  MUSIC_FADE_IN_SEC,
  MUSIC_FADE_OUT_SEC,
  MUSIC_LATE_SEC,
  MUSIC_LOOKAHEAD_SEC,
  MUSIC_LOWPASS_HZ,
  MUSIC_TICK_MS,
  MUSIC_TRIM,
  MUSIC_VOICE,
  SNARE_BANDPASS_HZ,
  TAPE_WOBBLE_CENTS,
  TAPE_WOBBLE_HZ,
} from './race-mix';

/** Where the music plays (AudioEngine.musicOut). */
export interface MusicHost {
  musicOut(): { ctx: AudioContext; out: AudioNode } | null;
}

interface Graph {
  fade: GainNode;
  keys: GainNode;
  bass: GainNode;
  drums: GainNode;
  snare: AudioNode;
  hat: AudioNode;
  lead: GainNode;
  wobble: GainNode;
  /** everything to disconnect / stop when done */
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  noise: AudioBuffer;
}

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Disconnects a node (all outputs, or one destination); never throws. */
const unplug = (n: AudioNode, from?: AudioParam): void => {
  try {
    if (from) n.disconnect(from);
    else n.disconnect();
  } catch (_err) {
    // already disconnected
  }
};

export class LofiPlayer {
  private ctx: AudioContext | null = null;
  private g: Graph | null = null;
  private seq: LofiSequencer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hidden = false;
  private done = false;
  private noiseAt = 0;
  private readonly onVisibility = (): void => this.visibility();

  constructor(
    private readonly host: MusicHost,
    readonly song: LofiSong,
  ) {}

  get playing(): boolean {
    return this.g !== null && !this.done;
  }

  /** Builds the voices and starts playing (fading in). False when audio isn't available. */
  start(fadeIn = MUSIC_FADE_IN_SEC): boolean {
    if (this.g || this.done) return this.playing;
    try {
      const out = this.host.musicOut();
      if (!out) return false;
      const ctx = out.ctx;
      this.ctx = ctx;
      this.g = this.build(ctx, out.out);
      const now = ctx.currentTime;
      this.hidden = typeof document !== 'undefined' && document.hidden === true;
      const f = this.g.fade.gain;
      f.setValueAtTime(0, now);
      // (a hidden tab stays silent; the music fades in when it is shown)
      if (!this.hidden) f.linearRampToValueAtTime(1, now + Math.max(0.05, fadeIn));
      this.seq = new LofiSequencer(this.song, now + 0.15);
      if (typeof document !== 'undefined')
        document.addEventListener('visibilitychange', this.onVisibility);
      this.timer = setInterval(() => this.tick(), MUSIC_TICK_MS);
      this.tick();
      return true;
    } catch (_err) {
      this.teardown();
      return false;
    }
  }

  /** Fades out over `fade` seconds and releases everything. Safe to call more than once. */
  stop(fade = MUSIC_FADE_OUT_SEC): void {
    if (this.done) return;
    this.done = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.onVisibility);
    const ctx = this.ctx;
    const g = this.g;
    if (!ctx || !g) {
      this.teardown();
      return;
    }
    try {
      const now = ctx.currentTime;
      const p = g.fade.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(0, now + Math.max(0.02, fade));
    } catch (_err) {
      // fall through to the teardown
    }
    setTimeout(() => this.teardown(), (Math.max(0.02, fade) + 0.3) * 1000);
  }

  // ------------------------------------------------------------------------------ internals

  private teardown(): void {
    const g = this.g;
    this.g = null;
    this.seq = null;
    if (!g) return;
    for (const s of g.sources) {
      try {
        s.stop();
      } catch (_err) {
        // already stopped
      }
    }
    for (const n of g.nodes) unplug(n);
  }

  private visibility(): void {
    const ctx = this.ctx;
    const g = this.g;
    if (!ctx || !g || this.done) return;
    const hidden = document.hidden;
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    const now = ctx.currentTime;
    const p = g.fade.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    if (hidden) p.setTargetAtTime(0, now, 0.08);
    else {
      this.seq?.reanchor(now + 0.15);
      p.setTargetAtTime(1, now, 0.4);
    }
  }

  private tick(): void {
    const ctx = this.ctx;
    const seq = this.seq;
    if (!ctx || !seq || !this.g || this.done || this.hidden) return;
    try {
      const now = ctx.currentTime;
      // a long stall (a throttled timer, a suspended context): pick up at a fresh bar
      if (seq.behind(now)) seq.reanchor(now + 0.1);
      for (const e of seq.take(now + MUSIC_LOOKAHEAD_SEC)) {
        if (playable(e.time, now, MUSIC_LATE_SEC)) this.play(e, Math.max(e.time, now));
      }
    } catch (_err) {
      // music must never break the game
    }
  }

  private build(ctx: AudioContext, dest: AudioNode): Graph {
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const gain = (v: number): GainNode => {
      const n = ctx.createGain();
      n.gain.value = v;
      nodes.push(n);
      return n;
    };
    const filter = (type: BiquadFilterType, hz: number, q = 0.707): BiquadFilterNode => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = hz;
      n.Q.value = q;
      nodes.push(n);
      return n;
    };

    const fade = gain(0);
    fade.connect(dest);
    const warm = filter('lowpass', MUSIC_LOWPASS_HZ, 0.5);
    warm.connect(fade);
    const mix = gain(MUSIC_TRIM);
    mix.connect(warm);

    const keys = gain(1);
    keys.connect(filter('lowpass', KEYS_LOWPASS_HZ, 0.5)).connect(mix);
    const bass = gain(1);
    bass.connect(filter('lowpass', BASS_LOWPASS_HZ, 0.6)).connect(mix);
    const drums = gain(1);
    drums.connect(mix);
    const snare = filter('bandpass', SNARE_BANDPASS_HZ, 0.7);
    snare.connect(filter('lowpass', 5000)).connect(drums);
    const hat = filter('highpass', HAT_HIGHPASS_HZ, 0.6);
    hat.connect(filter('lowpass', 10000)).connect(drums);

    // the lead with a dark feedback echo
    const lead = gain(1);
    lead.connect(mix);
    const delay = ctx.createDelay(2);
    nodes.push(delay);
    delay.delayTime.value = (LEAD_ECHO.beats * 60) / this.song.bpm;
    const dark = filter('lowpass', 2200);
    const feedback = gain(LEAD_ECHO.feedback);
    const wet = gain(LEAD_ECHO.wet);
    lead.connect(delay);
    delay.connect(dark);
    dark.connect(feedback);
    feedback.connect(delay);
    dark.connect(wet);
    wet.connect(mix);

    // tape wobble: one slow LFO bending every keys / lead note a few cents
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = TAPE_WOBBLE_HZ;
    const wobble = gain(TAPE_WOBBLE_CENTS);
    lfo.connect(wobble);
    lfo.start();
    nodes.push(lfo);
    sources.push(lfo);

    // vinyl crackle, looped
    const crackleSig = vinylCrackle(ctx.sampleRate, 4, this.song.seed);
    const cb = ctx.createBuffer(1, crackleSig.length, ctx.sampleRate);
    cb.getChannelData(0).set(crackleSig);
    const crackle = ctx.createBufferSource();
    crackle.buffer = cb;
    crackle.loop = true;
    crackle.connect(gain(MUSIC_VOICE.crackle)).connect(mix);
    crackle.start();
    nodes.push(crackle);
    sources.push(crackle);

    const noiseSig = whiteNoise(ctx.sampleRate, 1, this.song.seed + 7);
    const noise = ctx.createBuffer(1, noiseSig.length, ctx.sampleRate);
    noise.getChannelData(0).set(noiseSig);

    return { fade, keys, bass, drums, snare, hat, lead, wobble, nodes, sources, noise };
  }

  /** Plays one event at time `t`. */
  private play(e: TimedEvent, t: number): void {
    switch (e.voice) {
      case 'keys':
        return this.keysNote(t, e.midi, e.vel, e.sec);
      case 'bass':
        return this.bassNote(t, e.midi, e.vel, e.sec);
      case 'lead':
        return this.leadNote(t, e.midi, e.vel, e.sec);
      case 'kick':
        return this.kick(t, e.vel);
      case 'snare':
        return this.noiseHit(t, e.vel * MUSIC_VOICE.snare, 0.09, 'snare');
      case 'hat':
        return this.noiseHit(t, e.vel * MUSIC_VOICE.hat, e.dur > 0.5 ? 0.14 : 0.035, 'hat');
    }
  }

  /** An envelope gain: 0 → peak in `attack`, (optional decay to `sustain`), release at `end`. */
  private env(
    t: number,
    peak: number,
    attack: number,
    end: number,
    release: number,
    sustain = 1,
    decay = 0.3,
  ): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const p = g.gain;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + attack);
    if (sustain < 1) p.setTargetAtTime(peak * sustain, t + attack, decay);
    p.setTargetAtTime(0, Math.max(t + attack, end), release / 5);
    return g;
  }

  private keysNote(t: number, midi: number, vel: number, sec: number): void {
    const ctx = this.ctx!;
    const g = this.g!;
    const f = mtof(midi);
    const end = t + sec;
    const release = 0.9;
    const stopAt = end + release + 0.1;
    const car = ctx.createOscillator();
    car.frequency.value = f;
    // a little fixed detune per note on top of the wobble: a chorused, slightly out-of-tune piano
    car.detune.value = ((midi * 7) % 5) - 2;
    const mod = ctx.createOscillator();
    mod.frequency.value = f;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(f * KEYS_FM_INDEX.attack, t);
    depth.gain.setTargetAtTime(f * KEYS_FM_INDEX.settled, t, KEYS_FM_INDEX.mellowSec / 3);
    mod.connect(depth).connect(car.frequency);
    g.wobble.connect(car.detune);
    const amp = this.env(
      t,
      vel * MUSIC_VOICE.keys,
      0.012,
      end,
      release,
      KEYS_SUSTAIN,
      KEYS_DECAY_SEC,
    );
    car.connect(amp).connect(g.keys);
    car.start(t);
    mod.start(t);
    car.stop(stopAt);
    mod.stop(stopAt);
    car.onended = () => {
      unplug(g.wobble, car.detune);
      for (const n of [car, mod, depth, amp]) unplug(n);
    };
  }

  private bassNote(t: number, midi: number, vel: number, sec: number): void {
    const ctx = this.ctx!;
    const g = this.g!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mtof(midi);
    const end = t + sec;
    const amp = this.env(t, vel * MUSIC_VOICE.bass, 0.015, end, 0.25, 0.7, 0.4);
    o.connect(amp).connect(g.bass);
    o.start(t);
    o.stop(end + 0.4);
    o.onended = () => {
      unplug(o);
      unplug(amp);
    };
  }

  private leadNote(t: number, midi: number, vel: number, sec: number): void {
    const ctx = this.ctx!;
    const g = this.g!;
    const o = ctx.createOscillator();
    o.frequency.value = mtof(midi);
    g.wobble.connect(o.detune);
    const end = t + sec;
    const amp = this.env(t, vel * MUSIC_VOICE.lead, 0.01, end, 0.5, 0.35, 0.25);
    o.connect(amp).connect(g.lead);
    o.start(t);
    o.stop(end + 0.7);
    o.onended = () => {
      unplug(g.wobble, o.detune);
      unplug(o);
      unplug(amp);
    };
  }

  private kick(t: number, vel: number): void {
    const ctx = this.ctx!;
    const g = this.g!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(115, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(vel * MUSIC_VOICE.kick, t + 0.004);
    amp.gain.setTargetAtTime(0, t + 0.004, 0.085);
    o.connect(amp).connect(g.drums);
    o.start(t);
    o.stop(t + 0.6);
    o.onended = () => {
      unplug(o);
      unplug(amp);
    };
  }

  /** A short burst of the shared noise buffer into the snare or hat filters. */
  private noiseHit(t: number, peak: number, decay: number, into: 'snare' | 'hat'): void {
    const ctx = this.ctx!;
    const g = this.g!;
    const src = ctx.createBufferSource();
    src.buffer = g.noise;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.003);
    amp.gain.setTargetAtTime(0, t + 0.003, decay / 2);
    src.connect(amp).connect(into === 'snare' ? g.snare : g.hat);
    // a different slice of the noise every hit
    this.noiseAt = (this.noiseAt + 0.137) % 0.6;
    const len = decay * 5 + 0.05;
    src.start(t, this.noiseAt, len);
    src.onended = () => {
      unplug(src);
      unplug(amp);
    };
  }
}
