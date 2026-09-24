import { describe, expect, it } from 'vitest';
import { DynamicResolution, FrameStats, QUALITY } from '../src/render/perf';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';

const fakeRenderer = () => {
  const r = { ratio: 1, setPixelRatio: (v: number) => (r.ratio = v) };
  return r;
};

const run = (d: DynamicResolution, ms: number, seconds: number) => {
  for (let t = 0; t < seconds * 1000; t += ms) d.frame(ms);
};

describe('dynamic resolution', () => {
  it('drops the resolution when frames are slow and recovers slowly when fast', () => {
    const s: Settings = {
      ...DEFAULT_SETTINGS,
      quality: 'medium',
      renderScale: 1,
      dynamicResolution: true,
    };
    const r = fakeRenderer();
    const d = new DynamicResolution(r as never, s);
    expect(d.scale).toBe(1);
    run(d, 33, 3);
    expect(d.scale).toBeLessThan(1);
    expect(d.scale).toBeGreaterThanOrEqual(QUALITY.medium.minScale);
    const low = d.scale;
    run(d, 10, 2);
    expect(d.scale).toBe(low); // not immediately
    run(d, 10, 20);
    expect(d.scale).toBeGreaterThan(low);
  });

  it('respects the preset and the off switch', () => {
    const s: Settings = {
      ...DEFAULT_SETTINGS,
      quality: 'potato',
      renderScale: 1,
      dynamicResolution: true,
    };
    const d = new DynamicResolution(fakeRenderer() as never, s);
    expect(d.scale).toBe(0.5);
    run(d, 10, 10);
    expect(d.scale).toBe(0.5);
    const s2: Settings = {
      ...DEFAULT_SETTINGS,
      quality: 'high',
      renderScale: 0.8,
      dynamicResolution: false,
    };
    const d2 = new DynamicResolution(fakeRenderer() as never, s2);
    run(d2, 50, 5);
    expect(d2.scale).toBe(0.8);
  });

  it('frame stats report averages and percentiles', () => {
    const f = new FrameStats();
    for (let i = 0; i < 99; i++) f.add(10);
    f.add(100);
    const s = f.summary();
    expect(s.frames).toBe(100);
    expect(s.avgMs).toBeCloseTo(10.9, 5);
    expect(s.p99Ms).toBe(100);
    expect(s.p95Ms).toBe(10);
  });
});
