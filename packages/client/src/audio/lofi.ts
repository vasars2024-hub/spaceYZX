// Procedural lofi music for races, the pure part: which key and tempo a map gets, the jazzy
// chord progressions and their voicings, the swung drum / bass / keys patterns, the song's
// sections and the note events of every bar. No WebAudio here (audio/music.ts plays the
// events), no Math.random: a map always gets the same song, and everything is unit-tested.
//
// Time is counted in bars of 4 beats on an 8th-note grid (8 steps per bar); off-beat 8ths are
// pushed late by the song's swing. A song is an endless chain of "cycles"; each cycle is a few
// sections (intro, groove, lift, breakdown) whose progression, drum / keys / bass patterns and
// melodic motif are drawn from the song's seed, so it never loops in an obvious way.
import { createRng, pinkNoise, lowpass, highpass, makeLoop, normalize } from './dsp';
import type { Signal } from './dsp';

// ------------------------------------------------------------------------------- the song

export interface LofiSong {
  seed: number;
  /** key: semitones from C, -3..+3 (A, Bb, B, C, Db, D, Eb major) */
  key: number;
  bpm: number;
  /** where an off-beat 8th lands inside its beat (0.5 = straight, 0.667 = triplet) */
  swing: number;
}

export const BPM_MIN = 72;
export const BPM_MAX = 84;
export const KEY_RANGE = 3;

/** FNV-1a hash of a string (a map's name → the song's seed). */
export const hashString = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** The song a map plays: key, tempo and swing drawn from its id / name. */
export const songForMap = (id: string): LofiSong => {
  const seed = hashString(id || 'race');
  const rng = createRng(seed);
  const key = Math.floor(rng() * (2 * KEY_RANGE + 1)) - KEY_RANGE;
  const bpm = BPM_MIN + Math.floor(rng() * (BPM_MAX - BPM_MIN + 1));
  const swing = 0.58 + rng() * 0.05;
  return { seed, key, bpm, swing };
};

export const secPerBeat = (song: LofiSong): number => 60 / song.bpm;
export const secPerBar = (song: LofiSong): number => 4 * secPerBeat(song);

// --------------------------------------------------------------------------------- harmony

export type ChordQuality =
  'maj7' | 'maj9' | '6/9' | 'm7' | 'm9' | 'm11' | 'm6' | '7' | '9' | '13' | '7sus';

/** Chord tones as semitones above the chord's root. */
export const CHORD_INTERVALS: Readonly<Record<ChordQuality, readonly number[]>> = {
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  '6/9': [0, 4, 7, 9, 14],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  m11: [0, 3, 7, 10, 14, 17],
  m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10],
  '9': [0, 4, 7, 10, 14],
  '13': [0, 4, 10, 14, 21],
  '7sus': [0, 5, 7, 10, 14],
};

export interface Chord {
  /** semitones above the key's tonic */
  root: number;
  q: ChordQuality;
}

const ch = (root: number, q: ChordQuality): Chord => ({ root, q });

/** Four-bar progressions (one chord per bar), in a major key. */
export const PROGRESSIONS: readonly (readonly Chord[])[] = [
  // ii9 · V13 · Imaj9 · vi9 (the classic)
  [ch(2, 'm9'), ch(7, '13'), ch(0, 'maj9'), ch(9, 'm9')],
  // IVmaj7 · ivm6 · iii7 · vi9 (the borrowed minor four)
  [ch(5, 'maj7'), ch(5, 'm6'), ch(4, 'm7'), ch(9, 'm9')],
  // Imaj7 · vi7 · ii9 · V7sus
  [ch(0, 'maj7'), ch(9, 'm7'), ch(2, 'm9'), ch(7, '7sus')],
  // vi9 · ii9 · V9 · Imaj9
  [ch(9, 'm9'), ch(2, 'm9'), ch(7, '9'), ch(0, 'maj9')],
  // IVmaj9 · iii7 · ii9 · I6/9 (walking down)
  [ch(5, 'maj9'), ch(4, 'm7'), ch(2, 'm9'), ch(0, '6/9')],
  // Imaj9 · iii7 · IVmaj7 · ivm6
  [ch(0, 'maj9'), ch(4, 'm7'), ch(5, 'maj7'), ch(5, 'm6')],
  // ii11 · ii9 · V7sus · V13 (a slow vamp)
  [ch(2, 'm11'), ch(2, 'm9'), ch(7, '7sus'), ch(7, '13')],
];

/** The keys' register (MIDI notes, inclusive). */
export const KEYS_LOW = 52;
export const KEYS_HIGH = 77;
/** The bass register: roots from C2 up to B2. */
export const BASS_LOW = 36;
/** The lead's register. */
export const LEAD_LOW = 67;
export const LEAD_HIGH = 86;

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/**
 * The pitch classes the keys play for a chord (0..11, the chord's own order). Five or more
 * tones: rootless (the bass has the root), then without the fifth, at most four notes.
 */
export const chordPitchClasses = (key: number, c: Chord): number[] => {
  let iv = [...CHORD_INTERVALS[c.q]];
  if (iv.length > 4) iv = iv.filter((x) => x !== 0);
  if (iv.length > 4) iv = iv.filter((x) => x !== 7);
  if (iv.length > 4) iv = iv.slice(0, 4);
  return iv.map((x) => mod12(key + c.root + x));
};

/** Widest a keys voicing may spread (semitones: a comfortable hand). */
export const KEYS_MAX_SPAN = 14;

/**
 * A voicing of the chord in the keys' register (every chord tone once, within a hand's span,
 * ascending), as close as possible to the previous voicing (smooth voice leading), or centred
 * in the register when there is none. Semitone rubs low down (mud) are avoided.
 */
export const voiceChord = (key: number, c: Chord, prev: readonly number[] | null): number[] => {
  const options = chordPitchClasses(key, c).map((pc) => {
    const xs: number[] = [];
    for (let n = KEYS_LOW; n <= KEYS_HIGH; n++) if (mod12(n) === pc) xs.push(n);
    return xs;
  });
  let best: number[] = [];
  let bestScore = Infinity;
  const acc: number[] = [];
  const consider = (): void => {
    const notes = [...acc].sort((a, b) => a - b);
    const span = notes[notes.length - 1] - notes[0];
    if (span > KEYS_MAX_SPAN) return;
    let mud = 0;
    for (let k = 1; k < notes.length; k++) {
      const gap = notes[k] - notes[k - 1];
      if (gap === 0) return;
      if (gap <= 2 && notes[k - 1] < 58) mud += 3;
    }
    let score: number;
    if (prev) {
      // total motion, and no single voice leaping far
      const moves = notes.map((n, k) => Math.abs(n - (prev[k] ?? prev[prev.length - 1])));
      score = moves.reduce((s, m) => s + m, 0) + 2 * Math.max(...moves);
    } else score = Math.abs((notes[0] + notes[notes.length - 1]) / 2 - 64);
    score += mud;
    if (score < bestScore) {
      bestScore = score;
      best = notes;
    }
  };
  const walk = (i: number): void => {
    if (i === options.length) return consider();
    for (const n of options[i]) {
      acc.push(n);
      walk(i + 1);
      acc.pop();
    }
  };
  walk(0);
  return best;
};

/** The chord's root in the bass register. */
export const bassRoot = (key: number, c: Chord): number => BASS_LOW + mod12(key + c.root);

/** Major pentatonic scale degrees. */
export const PENTATONIC = [0, 2, 4, 7, 9] as const;

/** Is `midi` in the key's major pentatonic scale? */
export const inPentatonic = (key: number, midi: number): boolean =>
  (PENTATONIC as readonly number[]).includes(mod12(midi - key));

// -------------------------------------------------------------------------------- patterns

/** Velocities per 8th-note step (8 per bar); 0 = no hit. */
export interface DrumPattern {
  kick: readonly number[];
  snare: readonly number[];
  hat: readonly number[];
}

export const DRUM_PATTERNS: readonly DrumPattern[] = [
  // boom . . . | bap . . boom . | bap
  {
    kick: [1, 0, 0, 0, 0, 0.7, 0, 0],
    snare: [0, 0, 1, 0, 0, 0, 1, 0],
    hat: [0.8, 0.45, 0.7, 0.45, 0.8, 0.45, 0.7, 0.5],
  },
  // a lazy double kick on the and of two
  {
    kick: [1, 0, 0, 0.55, 0.8, 0, 0, 0],
    snare: [0, 0, 1, 0, 0, 0, 1, 0],
    hat: [0.8, 0.4, 0.7, 0.4, 0.8, 0.4, 0.7, 0.3],
  },
  // sparse hats, kick pushing into the next bar
  {
    kick: [1, 0, 0, 0, 0, 0.75, 0, 0.45],
    snare: [0, 0, 1, 0, 0, 0, 0.9, 0],
    hat: [0.7, 0, 0.6, 0.35, 0.7, 0, 0.6, 0.35],
  },
];

/** Breakdowns: no kick or snare, only a whisper of hats. */
export const BREAKDOWN_DRUMS: DrumPattern = {
  kick: [0, 0, 0, 0, 0, 0, 0, 0],
  snare: [0, 0, 0, 0, 0, 0, 0, 0],
  hat: [0.4, 0, 0.3, 0, 0.4, 0, 0.3, 0],
};

/** Keys comping: chord hits as [step, duration in beats, velocity]. */
export const KEYS_PATTERNS: readonly (readonly (readonly [number, number, number])[])[] = [
  [[0, 3.8, 1]],
  [
    [0, 1.4, 1],
    [3, 2.4, 0.65],
  ],
  [
    [0, 2.2, 1],
    [5, 1.3, 0.6],
  ],
];

/** Bass lines: [step, chord tone ('r' root, '5' fifth, 'o' octave, 'a' approach), beats, vel]. */
export type BassTone = 'r' | '5' | 'o' | 'a';
export const BASS_PATTERNS: readonly (readonly (readonly [number, BassTone, number, number])[])[] =
  [
    [
      [0, 'r', 1.4, 1],
      [3, 'r', 0.4, 0.6],
      [4, '5', 1.4, 0.85],
    ],
    [
      [0, 'r', 2.4, 1],
      [5, '5', 0.9, 0.7],
      [7, 'a', 0.4, 0.6],
    ],
    [
      [0, 'r', 1.8, 1],
      [4, 'o', 0.4, 0.55],
      [6, 'r', 0.9, 0.75],
    ],
  ];

/** The breakdown's bass: one long root. */
export const BREAKDOWN_BASS: readonly (readonly [number, BassTone, number, number])[] = [
  [0, 'r', 3.6, 0.75],
];

// -------------------------------------------------------------------------------- sections

export type SectionKind = 'intro' | 'groove' | 'lift' | 'breakdown';

export interface Section {
  kind: SectionKind;
  bars: number;
  /** index into PROGRESSIONS */
  prog: number;
  /** index into DRUM_PATTERNS (unused in intro / breakdown) */
  drums: number;
  keys: number;
  bass: number;
  /** the section's melodic motif (null = none) */
  motif: MotifNote[] | null;
}

export interface MotifNote {
  step: number;
  /** scale steps above the lead's low tonic (index into the pentatonic, may pass an octave) */
  degree: number;
  beats: number;
  vel: number;
}

const pick = <T>(rng: () => number, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

/** A short motif: 3–5 pentatonic notes on the 8th grid, mostly stepwise. */
export const makeMotif = (rng: () => number): MotifNote[] => {
  const count = 3 + Math.floor(rng() * 3);
  const steps: number[] = [];
  let s = Math.floor(rng() * 2);
  for (let i = 0; i < count && s < 8; i++) {
    steps.push(s);
    s += 1 + Math.floor(rng() * 2);
  }
  let degree = 2 + Math.floor(rng() * 4);
  return steps.map((step, i) => {
    if (i > 0) degree = Math.max(0, Math.min(8, degree + pick(rng, [-2, -1, -1, 1, 1, 2])));
    const next = steps[i + 1] ?? 8;
    return {
      step,
      degree,
      beats: Math.min(1.5, Math.max(0.4, (next - step) * 0.5 - 0.05)),
      vel: 0.65 + rng() * 0.3,
    };
  });
};

/** The sections of one cycle of the song (cycle 0 starts with the intro). */
export const cycleSections = (song: LofiSong, cycle: number): Section[] => {
  const rng = createRng((song.seed ^ Math.imul(cycle + 1, 0x9e3779b1)) >>> 0);
  const progA = Math.floor(rng() * PROGRESSIONS.length);
  let progB = Math.floor(rng() * (PROGRESSIONS.length - 1));
  if (progB >= progA) progB++;
  const sec = (kind: SectionKind, bars: number, prog: number, motifChance: number): Section => ({
    kind,
    bars,
    prog,
    drums: Math.floor(rng() * DRUM_PATTERNS.length),
    keys: Math.floor(rng() * KEYS_PATTERNS.length),
    bass: Math.floor(rng() * BASS_PATTERNS.length),
    motif: rng() < motifChance ? makeMotif(rng) : null,
  });
  const out: Section[] = [];
  if (cycle === 0) out.push(sec('intro', 4, progA, 0));
  out.push(sec('groove', 8, progA, 0.6));
  out.push(sec('lift', 8, progB, 0.9));
  if (rng() < 0.7) out.push(sec('breakdown', 4, rng() < 0.5 ? progA : progB, 0.5));
  out.push(sec('groove', 8, progA, 0.7));
  return out;
};

/** Where bar `bar` (0 = the first) falls: its section and the bar inside it. */
export const sectionAt = (
  song: LofiSong,
  bar: number,
): { section: Section; barInSection: number; cycle: number } => {
  let start = 0;
  for (let cycle = 0; ; cycle++) {
    const secs = cycleSections(song, cycle);
    for (const section of secs) {
      if (bar < start + section.bars) return { section, barInSection: bar - start, cycle };
      start += section.bars;
    }
  }
};

// ---------------------------------------------------------------------------------- events

export type MusicVoice = 'keys' | 'bass' | 'lead' | 'kick' | 'snare' | 'hat';

export interface MusicEvent {
  voice: MusicVoice;
  /** beats after the bar's start (0 ≤ beat < 4) */
  beat: number;
  /** MIDI note (0 for drums) */
  midi: number;
  /** 0..1 */
  vel: number;
  /** length in beats (drums: 0.25 closed hat / short hit, longer = open hat) */
  dur: number;
}

/** The beat an 8th-note step starts on, with swing on the off-beats. */
export const swungBeat = (step: number, swing: number): number =>
  Math.floor(step / 2) + (step % 2 === 1 ? swing : 0);

/** Humanize: how late the drums sit (beats), and the random nudge range (± beats). */
const DRUM_LAZY = 0.015;
const SNARE_LAZY = 0.03;
const NUDGE = 0.012;
/** Beats between the notes of a strummed chord. */
const STRUM = 0.03;

/** Every note event of bar `bar` (sorted by beat). Deterministic. */
export const barEvents = (song: LofiSong, bar: number): MusicEvent[] => {
  const { section, barInSection } = sectionAt(song, bar);
  const rng = createRng((song.seed + Math.imul(bar + 1, 0x85ebca6b)) >>> 0);
  const prog = PROGRESSIONS[section.prog];
  const chordIdx = barInSection % prog.length;
  const chord = prog[chordIdx];
  const nextChord = prog[(chordIdx + 1) % prog.length];
  const out: MusicEvent[] = [];
  const at = (step: number, lazy = 0): number =>
    Math.min(3.95, Math.max(0, swungBeat(step, song.swing) + lazy + (rng() * 2 - 1) * NUDGE));

  // keys: voice-led from the previous bar's chord (same section progression)
  const prevChord = barInSection > 0 ? prog[(chordIdx + prog.length - 1) % prog.length] : null;
  const prevVoicing = prevChord ? voiceChord(song.key, prevChord, null) : null;
  const voicing = voiceChord(song.key, chord, prevVoicing);
  const keysPat = section.kind === 'breakdown' ? KEYS_PATTERNS[0] : KEYS_PATTERNS[section.keys];
  for (const [step, beats, vel] of keysPat) {
    const t = at(step);
    voicing.forEach((midi, k) =>
      out.push({
        voice: 'keys',
        beat: Math.min(3.98, t + k * STRUM),
        midi,
        vel: vel * (0.85 + rng() * 0.15),
        dur: beats,
      }),
    );
  }

  // bass (not in the intro's first two bars)
  if (!(section.kind === 'intro' && barInSection < 2)) {
    const pat = section.kind === 'breakdown' ? BREAKDOWN_BASS : BASS_PATTERNS[section.bass];
    const root = bassRoot(song.key, chord);
    for (const [step, tone, beats, vel] of pat) {
      let midi = root;
      if (tone === '5') midi = root + 7;
      else if (tone === 'o') midi = root + 12;
      else if (tone === 'a') {
        midi = bassRoot(song.key, nextChord) - 1;
        if (midi < BASS_LOW) midi += 12;
      }
      out.push({ voice: 'bass', beat: at(step), midi, vel: vel * (0.9 + rng() * 0.1), dur: beats });
    }
  }

  // drums: the intro has only hats (from its second half), breakdowns whisper
  const drums =
    section.kind === 'groove' || section.kind === 'lift'
      ? DRUM_PATTERNS[section.drums]
      : section.kind === 'breakdown' || barInSection >= 2
        ? BREAKDOWN_DRUMS
        : null;
  if (drums) {
    const fill = barInSection % 4 === 3;
    for (let step = 0; step < 8; step++) {
      const k = drums.kick[step];
      if (k > 0 && !(fill && step === 5 && rng() < 0.5))
        out.push({ voice: 'kick', beat: at(step, DRUM_LAZY), midi: 0, vel: k, dur: 0.25 });
      let s = drums.snare[step];
      // a ghost note before the next bar at the end of each four
      if (fill && step === 7 && s === 0 && drums !== BREAKDOWN_DRUMS) s = 0.3;
      if (s > 0)
        out.push({ voice: 'snare', beat: at(step, SNARE_LAZY), midi: 0, vel: s, dur: 0.25 });
      const hv = drums.hat[step];
      if (hv > 0 && rng() > 0.08) {
        const open = step === 7 && section.kind === 'lift' && rng() < 0.35;
        out.push({
          voice: 'hat',
          beat: at(step, DRUM_LAZY),
          midi: 0,
          vel: hv * (0.8 + rng() * 0.25),
          dur: open ? 1 : 0.25,
        });
      }
    }
  }

  // the section's motif, answering at the end of each four bars (lift: every other bar)
  const motifBar = section.kind === 'lift' ? barInSection % 2 === 1 : barInSection % 4 === 3;
  if (section.motif && motifBar) {
    const tonic = LEAD_LOW + mod12(song.key - LEAD_LOW);
    for (const n of section.motif) {
      const oct = Math.floor(n.degree / PENTATONIC.length);
      let midi = tonic + 12 * oct + PENTATONIC[n.degree % PENTATONIC.length];
      while (midi > LEAD_HIGH) midi -= 12;
      while (midi < LEAD_LOW) midi += 12;
      out.push({ voice: 'lead', beat: at(n.step), midi, vel: n.vel, dur: n.beats });
    }
  }

  return out.sort((a, b) => a.beat - b.beat);
};

// ------------------------------------------------------------------------------ sequencer

export interface TimedEvent extends MusicEvent {
  /** absolute time (s, the AudioContext's clock) */
  time: number;
  /** length (s) */
  sec: number;
  bar: number;
}

/**
 * Turns bars into timed events for a lookahead scheduler: `take(until)` hands out every event
 * starting before `until`, in order, exactly once. Pure (the caller supplies the clock).
 */
export class LofiSequencer {
  bar = 0;
  barStart: number;
  private queue: TimedEvent[] = [];
  private pos = 0;

  constructor(
    readonly song: LofiSong,
    startTime: number,
  ) {
    this.barStart = startTime;
    this.fill();
  }

  get barSec(): number {
    return secPerBar(this.song);
  }

  private fill(): void {
    const spb = secPerBeat(this.song);
    this.queue = barEvents(this.song, this.bar).map((e) => ({
      ...e,
      time: this.barStart + e.beat * spb,
      sec: e.dur * spb,
      bar: this.bar,
    }));
    this.pos = 0;
  }

  /** Events starting before `until` not handed out yet. */
  take(until: number): TimedEvent[] {
    const out: TimedEvent[] = [];
    for (let guard = 0; guard < 64; guard++) {
      while (this.pos < this.queue.length && this.queue[this.pos].time < until)
        out.push(this.queue[this.pos++]);
      if (this.pos < this.queue.length || this.barStart + this.barSec >= until) break;
      this.bar++;
      this.barStart += this.barSec;
      this.fill();
    }
    return out;
  }

  /** Continue with the next bar starting at `time` (after a pause, or when far behind). */
  reanchor(time: number): void {
    this.bar++;
    this.barStart = time;
    this.fill();
  }

  /** Has the clock run past the current bar by more than `slack` seconds (a long stall)? */
  behind(now: number, slack = 0.5): boolean {
    return now > this.barStart + this.barSec + slack;
  }
}

/** Should an event due at `time` still be played at `now`, or dropped as too late? */
export const playable = (time: number, now: number, late: number): boolean => time >= now - late;

// ---------------------------------------------------------------------------- vinyl crackle

/**
 * A seamless loop of vinyl crackle: a faint low hiss with sparse soft pops (low-passed, no
 * sharp clicks). Peak 0.9 (the player sets its level).
 */
export const vinylCrackle = (sampleRate: number, dur: number, seed: number): Signal => {
  const x = 0.1;
  const n = Math.round((dur + x) * sampleRate);
  const rng = createRng(seed);
  const pops = new Float32Array(n);
  // about 7 pops a second, a few louder ones
  const count = Math.round((dur + x) * 7);
  for (let i = 0; i < count; i++) {
    const at = Math.floor(rng() * (n - 64));
    const amp = (rng() < 0.15 ? 1 : 0.35) * (0.5 + rng() * 0.5);
    const sign = rng() < 0.5 ? -1 : 1;
    const len = 12 + Math.floor(rng() * 40);
    for (let k = 0; k < len; k++) pops[at + k] += sign * amp * Math.exp(-k / (len / 4));
  }
  const soft = lowpass(highpass(pops, sampleRate, 300), sampleRate, 3200, 0.6);
  const hiss = lowpass(pinkNoise(sampleRate, dur + x, seed + 1), sampleRate, 2500);
  const body = new Float32Array(n);
  for (let i = 0; i < n; i++) body[i] = soft[i] + 0.08 * hiss[i];
  return normalize(makeLoop(body, sampleRate, x), 0.9);
};
