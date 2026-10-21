// LofiPlayer against a tiny fake WebAudio graph: it schedules notes ahead of the clock, every
// note starts from silence (no clicks), stop() fades out and releases everything, and nothing
// is scheduled while the tab is hidden.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LofiPlayer } from '../src/audio/music';
import { songForMap } from '../src/audio/lofi';

type Ev = [string, ...number[]];

class FakeParam {
  value: number;
  events: Ev[] = [];
  constructor(v = 0) {
    this.value = v;
  }
  setValueAtTime(v: number, t: number) {
    this.events.push(['set', v, t]);
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push(['linear', v, t]);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.events.push(['exp', v, t]);
    return this;
  }
  setTargetAtTime(v: number, t: number, tau: number) {
    this.events.push(['target', v, t, tau]);
    return this;
  }
  cancelScheduledValues(t: number) {
    this.events.push(['cancel', t]);
    return this;
  }
}

class FakeNode {
  kind: string;
  outs = new Set<unknown>();
  disconnected = false;
  started: number | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;
  gain = new FakeParam(1);
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
  Q = new FakeParam(1);
  delayTime = new FakeParam(0);
  type = '';
  buffer: unknown = null;
  loop = false;
  constructor(kind: string) {
    this.kind = kind;
  }
  connect<T>(to: T): T {
    this.outs.add(to);
    return to;
  }
  disconnect(to?: unknown) {
    if (to) this.outs.delete(to);
    else {
      this.outs.clear();
      this.disconnected = true;
    }
  }
  start(t = 0) {
    this.started = t;
  }
  stop(t = 0) {
    this.stoppedAt = t;
  }
}

class FakeContext {
  currentTime = 0;
  sampleRate = 8000;
  nodes: FakeNode[] = [];
  private make(kind: string) {
    const n = new FakeNode(kind);
    this.nodes.push(n);
    return n;
  }
  createGain() {
    return this.make('gain');
  }
  createBiquadFilter() {
    return this.make('filter');
  }
  createOscillator() {
    return this.make('osc');
  }
  createBufferSource() {
    return this.make('buffer');
  }
  createDelay() {
    return this.make('delay');
  }
  createBuffer(_ch: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data, length };
  }
}

describe('LofiPlayer', () => {
  let ctx: FakeContext;
  let out: FakeNode;
  beforeEach(() => {
    vi.useFakeTimers();
    ctx = new FakeContext();
    out = new FakeNode('musicBus');
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const host = () => ({
    musicOut: () => ({ ctx: ctx as unknown as AudioContext, out: out as unknown as AudioNode }),
  });

  it('does nothing without audio', () => {
    const p = new LofiPlayer({ musicOut: () => null }, songForMap('a'));
    expect(p.start()).toBe(false);
    expect(p.playing).toBe(false);
    p.stop();
  });

  it('fades in, schedules a little ahead, every note starts from silence', () => {
    const p = new LofiPlayer(host(), songForMap('Neon Run'));
    expect(p.start(3)).toBe(true);
    const fade = ctx.nodes.find((n) => n.outs.has(out))!;
    expect(fade.gain.events[0]).toEqual(['set', 0, 0]);
    expect(fade.gain.events[1]).toEqual(['linear', 1, 3]);
    // run 20 s of scheduler ticks
    for (let i = 0; i < 200; i++) {
      ctx.currentTime += 0.1;
      vi.advanceTimersByTime(100);
    }
    const oscs = ctx.nodes.filter((n) => n.kind === 'osc' && n.started !== null && n.started > 0);
    expect(oscs.length).toBeGreaterThan(40);
    for (const o of oscs) expect(o.started!).toBeLessThanOrEqual(ctx.currentTime + 0.36);
    // every note / hit envelope opens from exactly 0 with a ramp (no click)
    const envs = ctx.nodes.filter(
      (n) => n.kind === 'gain' && n.gain.events.length > 0 && n.gain.events[0][0] === 'set',
    );
    // (amplitude envelopes feed nodes; the FM depth gains feed a frequency param)
    const noteEnvs = envs.filter(
      (n) => n !== fade && [...n.outs].every((o) => o instanceof FakeNode),
    );
    expect(noteEnvs.length).toBeGreaterThan(40);
    for (const g of noteEnvs) {
      expect(g.gain.events[0][1]).toBe(0);
      expect(g.gain.events[1][0]).toBe('linear');
      expect(g.gain.events[1][2] - g.gain.events[0][2]).toBeGreaterThanOrEqual(0.003);
      // and every one goes back to 0 at the end
      expect(g.gain.events.some((e) => e[0] === 'target' && e[1] === 0)).toBe(true);
      // peaks stay small (the whole mix is kept under the limiter)
      expect(g.gain.events[1][1]).toBeLessThanOrEqual(0.31);
    }
    p.stop(1.5);
  });

  it('a hidden tab: quiet, nothing scheduled; back: picks up again', () => {
    const listeners: (() => void)[] = [];
    const doc = {
      hidden: false,
      addEventListener: (_: string, f: () => void) => listeners.push(f),
      removeEventListener: () => {},
    };
    vi.stubGlobal('document', doc);
    try {
      const p = new LofiPlayer(host(), songForMap('Ember Rush'));
      p.start();
      const fade = ctx.nodes.find((n) => n.outs.has(out))!;
      ctx.currentTime = 2;
      vi.advanceTimersByTime(2000);
      doc.hidden = true;
      for (const f of listeners) f();
      expect(fade.gain.events[fade.gain.events.length - 1].slice(0, 2)).toEqual(['target', 0]);
      const before = ctx.nodes.length;
      for (let i = 0; i < 100; i++) {
        ctx.currentTime += 0.1;
        vi.advanceTimersByTime(100);
      }
      expect(ctx.nodes.length).toBe(before);
      doc.hidden = false;
      for (const f of listeners) f();
      expect(fade.gain.events[fade.gain.events.length - 1].slice(0, 2)).toEqual(['target', 1]);
      for (let i = 0; i < 30; i++) {
        ctx.currentTime += 0.1;
        vi.advanceTimersByTime(100);
      }
      const fresh = ctx.nodes.slice(before).filter((n) => n.kind === 'osc');
      expect(fresh.length).toBeGreaterThan(0);
      for (const o of fresh) expect(o.started!).toBeGreaterThanOrEqual(12);
      p.stop();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('stop: fades out, then stops and disconnects everything', () => {
    const p = new LofiPlayer(host(), songForMap('Sunspire'));
    p.start();
    ctx.currentTime = 5;
    vi.advanceTimersByTime(5000);
    const before = ctx.nodes.length;
    p.stop(1.5);
    expect(p.playing).toBe(false);
    const fade = ctx.nodes.find((n) => n.outs.has(out))!;
    const last = fade.gain.events[fade.gain.events.length - 1];
    expect(last).toEqual(['linear', 0, 6.5]);
    // no new notes after stop
    ctx.currentTime = 6;
    vi.advanceTimersByTime(1000);
    expect(ctx.nodes.length).toBe(before);
    vi.advanceTimersByTime(2000);
    expect(fade.disconnected).toBe(true);
    const loops = ctx.nodes.filter((n) => n.kind === 'buffer' && n.loop);
    expect(loops.length).toBe(1); // the crackle
    expect(loops[0].stoppedAt).not.toBeNull();
  });
});
