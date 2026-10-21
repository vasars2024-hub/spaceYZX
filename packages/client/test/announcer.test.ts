// The announcer loads its clips lazily and must never break or hold up the game: failed loads
// are skipped silently (and not retried), late clips are dropped, off = silent.
import { describe, expect, it } from 'vitest';
import { Announcer, type ClipPlayer } from '../src/audio/announcer';
import { ANNOUNCER_LINES, roundLine } from '../src/audio/announcer-lines';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fakeBuffer = (id: string) => ({ id }) as unknown as AudioBuffer;

const engine = (opts: { unlocked?: boolean; decode?: 'ok' | 'null' | 'throw' } = {}) => {
  const played: string[] = [];
  const e: ClipPlayer & { played: string[] } = {
    played,
    unlocked: opts.unlocked ?? true,
    decodeClip: async (data) => {
      if (opts.decode === 'throw') throw new Error('bad data');
      if (opts.decode === 'null') return null;
      return fakeBuffer(new TextDecoder().decode(data));
    },
    playClip: (buf) => {
      played.push((buf as unknown as { id: string }).id);
      return () => {};
    },
  };
  return e;
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('announcer', () => {
  it('loads a clip on first use, then plays it instantly', async () => {
    const e = engine();
    const urls: string[] = [];
    const a = new Announcer(e, {
      base: '/',
      fetch: async (url) => {
        urls.push(url);
        return new TextEncoder().encode(url).buffer as ArrayBuffer;
      },
    });
    expect(a.say('victory')).toBe(false); // not loaded yet: loads, plays when it arrives
    await flush();
    expect(urls).toEqual(['/audio/announcer/victory.ogg']);
    expect(e.played).toEqual(['/audio/announcer/victory.ogg']);
    expect(a.isReady('victory')).toBe(true);
    expect(a.say('victory')).toBe(true);
    expect(urls).toHaveLength(1);
  });

  it('a failing download is skipped silently and not asked for again', async () => {
    const e = engine();
    let calls = 0;
    const a = new Announcer(e, {
      fetch: async () => {
        calls++;
        throw new Error('404');
      },
    });
    expect(() => a.say('fight')).not.toThrow();
    await flush();
    a.say('fight');
    await flush();
    expect(calls).toBe(1);
    expect(e.played).toEqual([]);
    await expect(a.load('fight')).resolves.toBeNull();
  });

  it('undecodable data or a throwing decoder is skipped too', async () => {
    for (const decode of ['null', 'throw'] as const) {
      const e = engine({ decode });
      const a = new Announcer(e, { fetch: async () => new ArrayBuffer(4) });
      a.say('match-point');
      await flush();
      expect(e.played).toEqual([]);
    }
  });

  it('a clip that arrives too late is dropped (never out of sync with the cards)', async () => {
    const e = engine();
    let t = 0;
    let release!: () => void;
    const a = new Announcer(e, {
      now: () => t,
      maxLateMs: 600,
      fetch: () =>
        new Promise((res) => {
          release = () => res(new TextEncoder().encode('late').buffer as ArrayBuffer);
        }),
    });
    a.say('round-3');
    t = 900;
    release();
    await flush();
    expect(e.played).toEqual([]);
    expect(a.isReady('round-3')).toBe(true); // next time it plays at once
  });

  it('off, not unlocked yet, or an unknown line: silent, nothing fetched', async () => {
    let calls = 0;
    const fetch = async () => {
      calls++;
      return new ArrayBuffer(1);
    };
    const off = new Announcer(engine(), { fetch });
    off.enabled = false;
    off.say('victory');
    off.preload();
    const locked = new Announcer(engine({ unlocked: false }), { fetch });
    locked.say('victory');
    const unknown = new Announcer(engine(), { fetch });
    unknown.say('not-a-line');
    await flush();
    expect(calls).toBe(0);
  });

  it('every line has a clip file (small, shipped in public/)', () => {
    const dir = fileURLToPath(new URL('../public/audio/announcer', import.meta.url));
    let total = 0;
    for (const id of Object.keys(ANNOUNCER_LINES)) {
      const f = path.join(dir, `${id}.ogg`);
      expect(existsSync(f), f).toBe(true);
      total += statSync(f).size;
    }
    expect(total).toBeLessThan(600 * 1024);
    expect(roundLine(1)).toBe('round-1');
    expect(roundLine(13)).toBe('round-13');
    expect(roundLine(14)).toBe('next-round');
  });
});
