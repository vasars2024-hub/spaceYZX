import { describe, expect, it } from 'vitest';
import { highpass, peak } from '../src/audio/dsp';
import { SOUND_DEFS, type SoundName } from '../src/audio/sounds';
import type { LoopHandle, LoopOptions, PlayOptions, VolumeKind } from '../src/audio/audio';
import {
  RACE_AIR,
  RACE_CUE_VOLUME,
  RACE_SLIDE,
  raceAirCutoff,
  raceAirLevel,
  raceAirRate,
  smoothToward,
  type RaceCue,
} from '../src/audio/race-mix';
import {
  RACE_CUE_SOUND,
  RaceAudio,
  cueDetune,
  gateSemis,
  musicWanted,
  raceCue,
  type RaceAudioEngine,
} from '../src/game/race-audio';
import { songForMap } from '../src/audio/lofi';

const SR = 44100;
const renders = new Map<SoundName, Float32Array>();
const render = (n: SoundName): Float32Array => {
  let s = renders.get(n);
  if (!s) renders.set(n, (s = SOUND_DEFS[n](SR)));
  return s;
};
const rms = (s: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / Math.max(1, s.length));
};
/** Share of a sound's energy above `hz` (0..1): how bright / hissy it is. */
const brightness = (s: Float32Array, hz: number): number => {
  const hi = rms(highpass(highpass(s, SR, hz), SR, hz));
  return (hi * hi) / Math.max(1e-12, rms(s) ** 2);
};

describe('race air (replaces the wind + slide scrape on race maps)', () => {
  it('is silent when slow, swells smoothly with speed, never jumps', () => {
    expect(raceAirLevel(0)).toBe(0);
    expect(raceAirLevel(RACE_AIR.startSpeed)).toBe(0);
    expect(raceAirLevel(RACE_AIR.fullSpeed)).toBe(1);
    expect(raceAirLevel(80)).toBe(1);
    expect(raceAirLevel(Number.NaN)).toBe(0);
    let prev = 0;
    for (let v = 0; v <= 60; v += 0.25) {
      const l = raceAirLevel(v);
      expect(l).toBeGreaterThanOrEqual(prev);
      expect(l - prev).toBeLessThan(0.03);
      prev = l;
    }
    expect(raceAirCutoff(0)).toBe(RACE_AIR.lowpassMin);
    expect(raceAirCutoff(1)).toBe(RACE_AIR.lowpassMax);
    expect(RACE_AIR.lowpassMax).toBeLessThanOrEqual(1500);
    expect(raceAirRate(0)).toBeGreaterThan(0.85);
    expect(raceAirRate(1)).toBeLessThan(1.15);
  });

  it('smoothing follows without overshoot', () => {
    let x = 0;
    for (let i = 0; i < 200; i++) {
      const n = smoothToward(x, 1, 1 / 60, 0.35);
      expect(n).toBeGreaterThanOrEqual(x);
      expect(n).toBeLessThanOrEqual(1);
      x = n;
    }
    expect(x).toBeGreaterThan(0.99);
    expect(smoothToward(0.3, 1, 0, 0.35)).toBe(0.3);
  });

  it('the loop is dark and soft, and much quieter than the old wind and slide', () => {
    const air = render('surfAir');
    expect(peak(air)).toBeLessThanOrEqual(0.61);
    // almost no energy up where hiss and grit live
    expect(brightness(air, 3000)).toBeLessThan(0.02);
    expect(brightness(air, 3000)).toBeLessThan(brightness(render('slide'), 3000) / 10);
    expect(brightness(air, 3000)).toBeLessThan(brightness(render('wind'), 3000));
    // loudest it gets (full speed) vs the old loops at their usual levels
    const airTop = rms(air) * RACE_AIR.max;
    const oldWind = rms(render('wind')) * 0.6;
    const oldSlide = rms(render('slide')) * 0.35;
    expect(airTop).toBeLessThan(oldWind / 3);
    expect(rms(air) * RACE_SLIDE.volume).toBeLessThan(oldSlide / 3);
    // about -35 dBFS at full speed: under the music bed
    expect(airTop).toBeLessThan(0.025);
  });
});

describe('race cues', () => {
  const cues = Object.keys(RACE_CUE_VOLUME) as RaceCue[];

  it('every cue has a soft recipe at a modest level', () => {
    for (const c of cues) {
      const { name } = RACE_CUE_SOUND[c];
      const s = render(name);
      const top = peak(s) * RACE_CUE_VOLUME[c];
      expect(top, c).toBeGreaterThan(0.05);
      expect(top, c).toBeLessThanOrEqual(0.5);
      // no bright clang or hiss
      expect(brightness(s, 5000), c).toBeLessThan(0.03);
    }
  });

  it('are softer and less bright than the combat sounds races used before', () => {
    const before: [RaceCue, SoundName, number][] = [
      ['gate', 'controllerPickup', 0.7],
      ['finish', 'roundStart', 0.7],
      ['best', 'roundWin', 1],
      ['tick', 'countdownTick', 1],
      ['go', 'roundStart', 1],
      ['respawn', 'revealPulse', 0.6],
      ['portal', 'revealPulse', 0.8],
      ['fuel', 'powerupPickup', 0.7],
      ['surge', 'dash', 0.9],
    ];
    for (const [cue, old, vol] of before) {
      const s = render(RACE_CUE_SOUND[cue].name);
      expect(peak(s) * RACE_CUE_VOLUME[cue], cue).toBeLessThan(peak(render(old)) * vol);
      // (less bright, or so dark that it doesn't matter)
      expect(brightness(s, 3000), cue).toBeLessThan(Math.max(0.005, brightness(render(old), 3000)));
    }
  });

  it('are tuned into the music key; gate chimes climb the pentatonic', () => {
    const song = songForMap('Neon Run');
    expect(cueDetune(song)).toBe(song.key * 100);
    expect(cueDetune(song, 2)).toBe((song.key + 2) * 100);
    expect([1, 2, 3, 4, 5, 6].map(gateSemis)).toEqual([0, 2, 4, 0, 2, 4]);
  });
});

// ------------------------------------------------------------------------------ RaceAudio

interface FakeLoop extends LoopHandle {
  name: SoundName;
  opts: LoopOptions;
  volume: number;
  lowpass: number;
  stopped: boolean;
}

const fakeEngine = (vol: Partial<Record<VolumeKind, number>> = {}) => {
  const played: { name: SoundName; opts: PlayOptions }[] = [];
  const loops: FakeLoop[] = [];
  const volumes: Record<VolumeKind, number> = {
    master: 1,
    sfx: 1,
    ui: 1,
    announcer: 1,
    music: 0.4,
    ...vol,
  };
  const engine: RaceAudioEngine & { unlocked: boolean } = {
    unlocked: true,
    getVolume: (k) => volumes[k],
    play: (name, opts = {}) => {
      played.push({ name, opts });
    },
    loop2d: (name, opts = {}) => {
      const l: FakeLoop = {
        name,
        opts,
        volume: opts.volume ?? 1,
        lowpass: opts.lowpass ?? 0,
        stopped: false,
        setPosition: () => {},
        setRate: () => {},
        setVolume: (v) => {
          l.volume = v;
        },
        setLowpass: (hz) => {
          l.lowpass = hz;
        },
        stop: () => {
          l.stopped = true;
        },
      };
      loops.push(l);
      return l;
    },
    musicOut: () => null,
  };
  return { engine, played, loops, volumes };
};

const fakeMusic = () => {
  const log: string[] = [];
  return {
    log,
    make: () => ({
      start: () => {
        log.push('start');
        return true;
      },
      stop: () => {
        log.push('stop');
      },
    }),
  };
};

describe('RaceAudio', () => {
  it('plays cues in the key of the map', () => {
    const { engine, played } = fakeEngine();
    const r = new RaceAudio(engine, 'Neon Run', fakeMusic().make);
    r.cue('gate', gateSemis(2));
    expect(played[0].name).toBe('raceGate');
    expect(played[0].opts.detune).toBe((r.song.key + 2) * 100);
    expect(played[0].opts.volume).toBe(RACE_CUE_VOLUME.gate);
    const client = { raceAudio: r, deps: { audio: engine } };
    raceCue(client, 'finish');
    expect(played[1].name).toBe('raceFinish');
  });

  it('music: starts on a race map, follows the Music / master volume, fades out on leaving', () => {
    const { engine, volumes } = fakeEngine();
    const m = fakeMusic();
    const r = new RaceAudio(engine, 'Sunspire', m.make);
    engine.unlocked = false;
    r.frame(1 / 60, 0, false);
    expect(m.log).toEqual([]); // not before audio is unlocked
    engine.unlocked = true;
    r.frame(1 / 60, 0, false);
    r.frame(1 / 60, 0, false);
    expect(m.log).toEqual(['start']);
    volumes.music = 0;
    r.frame(1 / 60, 0, false);
    expect(m.log).toEqual(['start', 'stop']);
    volumes.music = 0.4;
    volumes.master = 0;
    r.frame(1 / 60, 0, false);
    expect(m.log).toEqual(['start', 'stop']); // muted: nothing runs
    volumes.master = 0.8;
    r.frame(1 / 60, 0, false);
    r.dispose();
    expect(m.log).toEqual(['start', 'stop', 'start', 'stop']);
    expect(musicWanted(0.4, 0.8)).toBe(true);
    expect(musicWanted(0, 0.8)).toBe(false);
  });

  it('air swells gently with speed; a slide fades in and out (no hard starts)', () => {
    const { engine, loops } = fakeEngine();
    const r = new RaceAudio(engine, 'Surf Beginner', fakeMusic().make);
    r.frame(1 / 60, 40, false);
    expect(loops).toHaveLength(1);
    const air = loops[0];
    expect(air.name).toBe('surfAir');
    // first frame at full speed: only a small step, not a jump to full
    expect(air.volume).toBeLessThan(RACE_AIR.max * 0.1);
    for (let i = 0; i < 180; i++) r.frame(1 / 60, 40, false);
    expect(air.volume).toBeCloseTo(RACE_AIR.max, 3);
    expect(air.lowpass).toBeCloseTo(RACE_AIR.lowpassMax, 0);
    r.frame(1 / 60, 40, true);
    expect(loops).toHaveLength(2);
    const slide = loops[1];
    expect(slide.volume).toBeLessThan(RACE_SLIDE.volume);
    for (let i = 0; i < 60; i++) r.frame(1 / 60, 40, true);
    expect(slide.volume).toBeCloseTo(RACE_SLIDE.volume, 3);
    r.frame(1 / 60, 40, false);
    expect(slide.volume).toBeGreaterThan(RACE_SLIDE.volume * 0.5);
    for (let i = 0; i < 120; i++) r.frame(1 / 60, 40, false);
    expect(slide.volume).toBeLessThan(0.001);
    expect(loops).toHaveLength(2); // the slide loop is reused, never restarted
    r.dispose();
    expect(air.stopped && slide.stopped).toBe(true);
  });
});
