import { describe, expect, it } from 'vitest';
import { DynamicResolution, FrameStats, QUALITY } from '../src/render/perf';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { setStyle, setText } from '../src/ui/menus';

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

describe('per-frame HUD writes', () => {
  /** A stand-in element whose style stores colours the way a browser does (as rgb()). */
  const fakeEl = () => {
    const writes = { text: 0, style: 0 };
    let text = '';
    let color = '';
    let display = '';
    const style = {
      get color() {
        return color;
      },
      set color(v: string) {
        writes.style++;
        color = v === '#ff0000' ? 'rgb(255, 0, 0)' : v;
      },
      get display() {
        return display;
      },
      set display(v: string) {
        writes.style++;
        display = v;
      },
    };
    const el = {
      style,
      get textContent() {
        return text;
      },
      set textContent(v: string) {
        writes.text++;
        text = v;
      },
    };
    return { el: el as unknown as HTMLElement, writes };
  };

  it('writes text and styles only when they change', () => {
    const { el, writes } = fakeEl();
    for (let i = 0; i < 5; i++) {
      setText(el, 'ATTACK');
      setStyle(el, 'color', '#ff0000');
      setStyle(el, 'display', '');
    }
    expect(writes.text).toBe(1);
    // (the colour reads back as rgb(): still written once; display '' starts out as '')
    expect(writes.style).toBe(2);
    setText(el, 'DEFEND');
    expect(writes.text).toBe(2);
  });

  it('notices a write from elsewhere since its own', () => {
    const { el } = fakeEl();
    setStyle(el, 'display', '');
    el.style.display = 'none'; // e.g. a hide() that sets the style directly
    setStyle(el, 'display', '');
    expect(el.style.display).toBe('');
  });
});
