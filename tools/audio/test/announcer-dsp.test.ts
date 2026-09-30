// The announcer tool's processing (tools/audio/announcer.ts): the pitch shift really lowers
// the pitch by 30 %, and the finished clip is normalised, mono 22.05 kHz, trimmed.
import { describe, expect, it } from 'vitest';
import { pitchResample, processVoice, readWav, trimSilence, writeWav } from '../announcer';

const sine = (hz: number, sec: number, sr: number, amp = 0.5): Float64Array =>
  Float64Array.from(
    { length: Math.round(sec * sr) },
    (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr),
  );

/** frequency from rising zero crossings */
const freq = (x: Float64Array, sr: number): number => {
  let n = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) n++;
  return n / (x.length / sr);
};

describe('announcer DSP', () => {
  it('pitch-resample: 200 Hz at 44.1 kHz becomes 140 Hz at 22.05 kHz', () => {
    const y = pitchResample(sine(200, 1, 44100), 44100, 22050, 0.7);
    expect(freq(y, 22050)).toBeGreaterThan(136);
    expect(freq(y, 22050)).toBeLessThan(144);
    // tape-style: 1 s of input lasts 1 / 0.7 s
    expect(y.length / 22050).toBeCloseTo(1 / 0.7, 1);
  });

  it('trims silence and round-trips 16-bit WAV', () => {
    const sr = 22050;
    const x = new Float64Array(sr);
    x.set(sine(300, 0.2, sr), sr / 2);
    const t = trimSilence(x, sr, 0.01, 0.01);
    expect(t.length / sr).toBeLessThan(0.25);
    const back = readWav(writeWav(t, sr));
    expect(back.sr).toBe(sr);
    expect(back.data.length).toBe(t.length);
    expect(Math.abs(back.data[100] - t[100])).toBeLessThan(1e-4);
  });

  it('the whole chain: peak at -1 dBFS, a short tail, no silence padding', () => {
    const sr = 44100;
    const raw = new Float64Array(sr * 2);
    raw.set(sine(120, 0.6, sr, 0.3), sr / 2);
    const out = processVoice(raw, sr);
    let peak = 0;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThanOrEqual(0.892);
    expect(peak).toBeGreaterThan(0.5);
    // 0.6 s slowed by 1/0.7 plus echo/reverb tail, under 2 s
    expect(out.length / 22050).toBeGreaterThan(0.8);
    expect(out.length / 22050).toBeLessThan(2);
  });
});
