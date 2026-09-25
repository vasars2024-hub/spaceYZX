import { describe, expect, it } from 'vitest';
import { v3 } from '@space-yz/shared';
import { soundDirection, loudness, SOUND_KINDS } from '../src/game/sound-radar';

const eye = v3(0, 1.6, 0);
const F = v3(0, 0, -1); // looking down -Z
const R = v3(1, 0, 0);
const U = v3(0, 1, 0);
const deg = (r: number) => Math.round((r * 180) / Math.PI);

describe('sound visualizer', () => {
  it('places sounds by direction: ahead = top, right = right, behind = bottom, left = left', () => {
    expect(deg(soundDirection(v3(0, 1.6, -10), eye, F, R, U).angle)).toBe(0);
    expect(deg(soundDirection(v3(10, 1.6, 0), eye, F, R, U).angle)).toBe(90);
    expect(Math.abs(deg(soundDirection(v3(0, 1.6, 10), eye, F, R, U).angle))).toBe(180);
    expect(deg(soundDirection(v3(-10, 1.6, 0), eye, F, R, U).angle)).toBe(-90);
  });

  it('knows above and below relative to your own up (works on walls and ceilings)', () => {
    expect(soundDirection(v3(0, 12, -5), eye, F, R, U).vertical).toBeGreaterThan(3);
    // standing on a wall: "up" is +X, so a sound at +X is above you
    const wall = soundDirection(v3(8, 1.6, -2), eye, v3(0, 0, -1), v3(0, -1, 0), v3(1, 0, 0));
    expect(wall.vertical).toBeGreaterThan(3);
  });

  it('closer is louder; out of hearing range is silent; loud things carry further', () => {
    expect(loudness('steps', 3)).toBeGreaterThan(loudness('steps', 20));
    expect(loudness('steps', SOUND_KINDS.steps.range + 1)).toBe(0);
    expect(loudness('recall', 60)).toBeGreaterThan(0);
    expect(loudness('steps', 60)).toBe(0);
  });
});
