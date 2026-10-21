// The race soundscape (race tracks and surf maps, whenever `level.def.race` is set: practice,
// ranked races, free roam): the lofi music (audio/music.ts), a soft air loop that swells with
// speed instead of the combat wind and slide scrape, and calm cues (gates, anchors, portals,
// countdown, finish) tuned into the music's key. Combat maps never create one of these.
// Levels: audio/race-mix.ts.
import type { AudioEngine, LoopHandle } from '../audio';
import type { SoundName } from '../audio/sounds';
import { songForMap, type LofiSong } from '../audio/lofi';
import { LofiPlayer } from '../audio/music';
import {
  RACE_AIR,
  RACE_CUE_VOLUME,
  RACE_SLIDE,
  raceAirCutoff,
  raceAirLevel,
  raceAirRate,
  smoothToward,
  type RaceCue,
} from '../audio/race-mix';

export type { RaceCue } from '../audio/race-mix';

/** What the race audio needs from the engine (AudioEngine implements it; tests fake it). */
export type RaceAudioEngine = Pick<
  AudioEngine,
  'unlocked' | 'getVolume' | 'play' | 'loop2d' | 'musicOut'
>;

/** Which recipe each cue plays, at what rate, and whether it is pitched (moved into the key). */
export const RACE_CUE_SOUND: Readonly<
  Record<RaceCue, { name: SoundName; rate?: number; tuned: boolean }>
> = {
  gate: { name: 'raceGate', tuned: true },
  anchor: { name: 'raceAnchor', tuned: true },
  portal: { name: 'racePortal', tuned: true },
  respawn: { name: 'raceRespawn', tuned: true },
  tick: { name: 'raceTick', tuned: true },
  go: { name: 'raceGo', tuned: true },
  finish: { name: 'raceFinish', tuned: true },
  best: { name: 'raceBest', tuned: true },
  dnf: { name: 'raceDnf', tuned: true },
  surge: { name: 'raceSurge', tuned: true },
  fuel: { name: 'raceFuel', tuned: true },
  launch: { name: 'raceSurge', rate: 0.8, tuned: false },
  slideBoost: { name: 'raceSurge', rate: 0.9, tuned: false },
};

/** Cents that move a cue written in C by `semis` more semitones into the song's key. */
export const cueDetune = (song: LofiSong, semis = 0): number => (song.key + semis) * 100;

/** Gate chimes climb the pentatonic as you pass checkpoints: 0, +2, +4, 0, ... semitones. */
export const gateSemis = (cp: number): number => [0, 2, 4][(((cp - 1) % 3) + 3) % 3];

/** Music runs only while both the Music and the master volume are up. */
export const musicWanted = (music: number, master: number): boolean => music > 0 && master > 0;

/** The music player (LofiPlayer; tests fake it). */
export interface MusicPlayer {
  start(): boolean;
  stop(fade?: number): void;
}

export class RaceAudio {
  readonly song: LofiSong;
  private music: MusicPlayer | null = null;
  private air: LoopHandle | null = null;
  private slide: LoopHandle | null = null;
  private airLevel = 0;
  private slideLevel = 0;
  private disposed = false;
  /** failed music starts (it gives up after a few rather than retrying every frame) */
  private musicFails = 0;

  constructor(
    private readonly audio: RaceAudioEngine,
    mapId: string,
    private readonly makePlayer: (song: LofiSong) => MusicPlayer = (song) =>
      new LofiPlayer(audio, song),
  ) {
    this.song = songForMap(mapId);
  }

  get musicPlaying(): boolean {
    return this.music !== null;
  }

  /** Plays a race cue (in the music's key; `semis` moves it further, e.g. gateSemis). */
  cue(cue: RaceCue, semis = 0): void {
    if (this.disposed) return;
    const s = RACE_CUE_SOUND[cue];
    this.audio.play(s.name, {
      volume: RACE_CUE_VOLUME[cue],
      rate: s.rate ?? 1,
      detune: s.tuned ? cueDetune(this.song, semis) : 0,
    });
  }

  /** Every frame: music on/off with its volume, the air and slide loops from your speed. */
  frame(dt: number, speed: number, sliding: boolean): void {
    const a = this.audio;
    if (this.disposed || !a.unlocked) return;
    // the music (nothing runs while it is turned down to zero)
    const want = musicWanted(a.getVolume('music'), a.getVolume('master'));
    if (want && !this.music && this.musicFails < 3) {
      const p = this.makePlayer(this.song);
      if (p.start()) this.music = p;
      else this.musicFails++;
    } else if (!want && this.music) {
      this.music.stop(0.3);
      this.music = null;
    }
    // the air: swells smoothly with speed, darker and quieter than the combat wind
    this.airLevel = smoothToward(this.airLevel, raceAirLevel(speed), dt, RACE_AIR.smoothSec);
    this.air ??= a.loop2d('surfAir', { volume: 0, lowpass: RACE_AIR.lowpassMin });
    this.air.setVolume(this.airLevel * RACE_AIR.max);
    this.air.setLowpass(raceAirCutoff(this.airLevel));
    this.air.setRate(raceAirRate(this.airLevel));
    // a crouch slide: the same air, darker, faded in and out (never a hard start or stop)
    const tau = sliding ? RACE_SLIDE.fadeInSec : RACE_SLIDE.fadeOutSec;
    this.slideLevel = smoothToward(this.slideLevel, sliding ? 1 : 0, dt, tau / 3);
    if (sliding) this.slide ??= a.loop2d('surfAir', { volume: 0, lowpass: RACE_SLIDE.lowpass });
    this.slide?.setVolume(this.slideLevel * RACE_SLIDE.volume);
  }

  /** Leaving the map: the music and loops fade out. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.music?.stop();
    this.music = null;
    this.air?.stop(RACE_AIR.fadeSec);
    this.slide?.stop(RACE_AIR.fadeSec);
    this.air = null;
    this.slide = null;
  }
}

/** Plays a race cue through the client's race audio (a race map always has one). */
export const raceCue = (
  c: { raceAudio: RaceAudio | null; deps: { audio: Pick<AudioEngine, 'play'> } },
  cue: RaceCue,
  semis = 0,
): void => {
  if (c.raceAudio) c.raceAudio.cue(cue, semis);
  else c.deps.audio.play(RACE_CUE_SOUND[cue].name, { volume: RACE_CUE_VOLUME[cue] });
};
