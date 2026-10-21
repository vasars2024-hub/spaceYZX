import { describe, expect, it } from 'vitest';
import {
  BASS_LOW,
  BPM_MAX,
  BPM_MIN,
  KEY_RANGE,
  KEYS_HIGH,
  KEYS_LOW,
  LEAD_HIGH,
  LEAD_LOW,
  LofiSequencer,
  PROGRESSIONS,
  barEvents,
  chordPitchClasses,
  cycleSections,
  inPentatonic,
  playable,
  secPerBar,
  sectionAt,
  songForMap,
  swungBeat,
  vinylCrackle,
  voiceChord,
  type LofiSong,
} from '../src/audio/lofi';
import { peak } from '../src/audio/dsp';
import { MUSIC_DEFAULT_VOLUME, MUSIC_TRIM, MUSIC_VOICE } from '../src/audio/race-mix';

const MAPS = ['Neon Run', 'Ember Rush', 'Sunspire', 'Surf Beginner', 'Surf Intermediate', 'x'];
const SONG: LofiSong = songForMap('Neon Run');

describe('lofi song choice', () => {
  it('is seeded by the map: same map, same song; keys and tempos in range', () => {
    for (const m of MAPS) {
      const s = songForMap(m);
      expect(songForMap(m)).toEqual(s);
      expect(Math.abs(s.key)).toBeLessThanOrEqual(KEY_RANGE);
      expect(s.bpm).toBeGreaterThanOrEqual(BPM_MIN);
      expect(s.bpm).toBeLessThanOrEqual(BPM_MAX);
      expect(s.bpm).toBeGreaterThanOrEqual(70);
      expect(s.bpm).toBeLessThanOrEqual(85);
      expect(s.swing).toBeGreaterThan(0.55);
      expect(s.swing).toBeLessThan(0.667);
    }
  });

  it('different maps get different songs', () => {
    const many = Array.from({ length: 40 }, (_, i) => songForMap(`map-${i}`));
    expect(new Set(many.map((s) => s.key)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(many.map((s) => s.bpm)).size).toBeGreaterThanOrEqual(5);
  });
});

describe('lofi harmony', () => {
  it('voices every chord with at most four notes in the keys register', () => {
    for (let key = -KEY_RANGE; key <= KEY_RANGE; key++) {
      for (const prog of PROGRESSIONS) {
        expect(prog.length).toBe(4);
        let prev: number[] | null = null;
        for (const c of prog) {
          const pcs = chordPitchClasses(key, c);
          expect(pcs.length).toBeGreaterThanOrEqual(3);
          expect(pcs.length).toBeLessThanOrEqual(4);
          const v = voiceChord(key, c, prev);
          expect(v.length).toBe(pcs.length);
          for (let i = 0; i < v.length; i++) {
            expect(v[i]).toBeGreaterThanOrEqual(KEYS_LOW);
            expect(v[i]).toBeLessThanOrEqual(KEYS_HIGH);
            if (i > 0) expect(v[i]).toBeGreaterThan(v[i - 1]);
          }
          expect(new Set(v.map((n) => ((n % 12) + 12) % 12))).toEqual(new Set(pcs));
          // smooth voice leading: no voice leaps far between neighbouring chords
          if (prev) {
            const moves = v.map((n, i) => Math.abs(n - (prev![i] ?? prev![prev!.length - 1])));
            expect(Math.max(...moves)).toBeLessThanOrEqual(5);
            expect(moves.reduce((x, y) => x + y, 0) / moves.length).toBeLessThanOrEqual(4);
          }
          prev = v;
        }
      }
    }
  });

  it('chords are jazzy sevenths / ninths (never a bare triad)', () => {
    for (const prog of PROGRESSIONS)
      for (const c of prog) expect(chordPitchClasses(0, c).length).toBeGreaterThanOrEqual(4);
  });
});

describe('lofi arrangement', () => {
  it('starts with a quiet intro, then grooves, and varies between cycles', () => {
    const first = cycleSections(SONG, 0);
    expect(first[0].kind).toBe('intro');
    expect(first[1].kind).toBe('groove');
    expect(sectionAt(SONG, 0).section.kind).toBe('intro');
    const progs = new Set<number>();
    for (let c = 0; c < 6; c++) for (const s of cycleSections(SONG, c)) progs.add(s.prog);
    expect(progs.size).toBeGreaterThanOrEqual(3);
  });

  it('intro: keys first, no kick, snare or bass in its first bars', () => {
    for (const bar of [0, 1]) {
      const ev = barEvents(SONG, bar);
      expect(ev.some((e) => e.voice === 'keys')).toBe(true);
      expect(ev.some((e) => e.voice === 'kick' || e.voice === 'snare' || e.voice === 'bass')).toBe(
        false,
      );
    }
  });

  it('every bar: in range, in time, deterministic', () => {
    for (const m of MAPS) {
      const song = songForMap(m);
      for (let bar = 0; bar < 120; bar++) {
        const ev = barEvents(song, bar);
        expect(barEvents(song, bar)).toEqual(ev);
        expect(ev.some((e) => e.voice === 'keys')).toBe(true);
        for (let i = 0; i < ev.length; i++) {
          const e = ev[i];
          expect(e.beat).toBeGreaterThanOrEqual(0);
          expect(e.beat).toBeLessThan(4);
          if (i > 0) expect(e.beat).toBeGreaterThanOrEqual(ev[i - 1].beat);
          expect(e.vel).toBeGreaterThan(0);
          expect(e.vel).toBeLessThanOrEqual(1.05);
          expect(e.dur).toBeGreaterThan(0);
          if (e.voice === 'bass') {
            expect(e.midi).toBeGreaterThanOrEqual(BASS_LOW);
            expect(e.midi).toBeLessThanOrEqual(BASS_LOW + 23);
          }
          if (e.voice === 'lead') {
            expect(e.midi).toBeGreaterThanOrEqual(LEAD_LOW);
            expect(e.midi).toBeLessThanOrEqual(LEAD_HIGH);
            expect(inPentatonic(song.key, e.midi)).toBe(true);
          }
        }
        // few voices: a bar never asks for many notes
        expect(ev.length).toBeLessThanOrEqual(40);
      }
    }
  });

  it('has drums, a bass line and an occasional motif once it grooves', () => {
    let lead = 0;
    let kicks = 0;
    let snares = 0;
    for (let bar = 4; bar < 100; bar++) {
      const ev = barEvents(SONG, bar);
      lead += ev.filter((e) => e.voice === 'lead').length > 0 ? 1 : 0;
      kicks += ev.filter((e) => e.voice === 'kick').length;
      snares += ev.filter((e) => e.voice === 'snare').length;
    }
    expect(kicks).toBeGreaterThan(80);
    expect(snares).toBeGreaterThan(80);
    // occasional: some bars, far from all
    expect(lead).toBeGreaterThan(3);
    expect(lead).toBeLessThan(60);
  });

  it('swings the off-beats (hats land late, not straight)', () => {
    expect(swungBeat(0, 0.6)).toBe(0);
    expect(swungBeat(1, 0.6)).toBeCloseTo(0.6);
    expect(swungBeat(7, 0.6)).toBeCloseTo(3.6);
    let offbeats = 0;
    for (let bar = 5; bar < 40; bar++) {
      for (const e of barEvents(SONG, bar)) {
        if (e.voice !== 'hat') continue;
        const frac = e.beat - Math.floor(e.beat);
        if (frac > 0.3) {
          offbeats++;
          expect(frac).toBeGreaterThan(0.55);
          expect(frac).toBeLessThan(0.7);
        }
      }
    }
    expect(offbeats).toBeGreaterThan(20);
  });

  it("doesn't repeat itself every cycle", () => {
    const len = cycleSections(SONG, 1).reduce((s, x) => s + x.bars, 0);
    const start = cycleSections(SONG, 0).reduce((s, x) => s + x.bars, 0);
    let same = 0;
    for (let b = 0; b < len; b++) {
      const a = JSON.stringify(barEvents(SONG, start + b));
      const c = JSON.stringify(barEvents(SONG, start + len + b));
      if (a === c) same++;
    }
    expect(same).toBeLessThan(len / 2);
  });
});

describe('lofi sequencer (lookahead scheduling)', () => {
  it('hands out every event once, in order, bar after bar without gaps', () => {
    const seq = new LofiSequencer(SONG, 10);
    const bar = secPerBar(SONG);
    const all = [];
    for (let t = 10; t < 10 + bar * 12; t += 0.1) all.push(...seq.take(t + 0.35));
    for (let i = 1; i < all.length; i++) {
      expect(all[i].time).toBeGreaterThanOrEqual(all[i - 1].time);
      if (all[i].bar === all[i - 1].bar) continue;
      expect(all[i].bar).toBe(all[i - 1].bar + 1);
    }
    for (const e of all) {
      expect(e.time).toBeGreaterThanOrEqual(10 + e.bar * bar - 1e-9);
      expect(e.time).toBeLessThan(10 + (e.bar + 1) * bar);
    }
    // same result in one big call (nothing lost or doubled)
    const seq2 = new LofiSequencer(SONG, 10);
    const big = seq2.take(all[all.length - 1].time + 1e-6);
    expect(big.map((e) => e.time)).toEqual(all.map((e) => e.time));
  });

  it('never schedules far ahead, and picks up at a fresh bar after a stall', () => {
    const seq = new LofiSequencer(SONG, 0);
    for (const e of seq.take(0.35)) expect(e.time).toBeLessThan(0.35);
    expect(seq.behind(0.5)).toBe(false);
    expect(seq.behind(secPerBar(SONG) + 5)).toBe(true);
    const bar = seq.bar;
    seq.reanchor(100);
    expect(seq.bar).toBe(bar + 1);
    const next = seq.take(100.35);
    for (const e of next) expect(e.time).toBeGreaterThanOrEqual(100);
    expect(playable(9.99, 10, 0.03)).toBe(true);
    expect(playable(9.9, 10, 0.03)).toBe(false);
  });
});

describe('lofi levels', () => {
  it('sits under the limiter at the default Music volume, even when everything peaks at once', () => {
    const v = MUSIC_VOICE;
    const worst = (4 * v.keys + v.bass + v.kick + v.hat + v.crackle + v.lead) * MUSIC_TRIM;
    expect(worst).toBeLessThanOrEqual(1.1);
    // the engine limiter starts at 0.5 (after the master volume)
    expect(worst * MUSIC_DEFAULT_VOLUME).toBeLessThan(0.5);
    expect(MUSIC_DEFAULT_VOLUME).toBeGreaterThanOrEqual(0.35);
    expect(MUSIC_DEFAULT_VOLUME).toBeLessThanOrEqual(0.4);
  });

  it('vinyl crackle: finite, deterministic, seamless loop', () => {
    const sr = 22050;
    const s = vinylCrackle(sr, 2, 5);
    expect(s.length).toBe(2 * sr);
    expect(vinylCrackle(sr, 2, 5)).toEqual(s);
    for (let i = 0; i < s.length; i++) expect(Number.isFinite(s[i])).toBe(true);
    expect(peak(s)).toBeLessThanOrEqual(0.9 + 1e-6);
    let maxStep = 0;
    for (let i = 1; i < s.length; i++) maxStep = Math.max(maxStep, Math.abs(s[i] - s[i - 1]));
    expect(Math.abs(s[0] - s[s.length - 1])).toBeLessThanOrEqual(maxStep * 1.05 + 1e-4);
  });
});
