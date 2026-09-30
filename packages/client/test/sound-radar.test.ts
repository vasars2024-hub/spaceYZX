import { describe, expect, it } from 'vitest';
import { v3 } from '@space-yz/shared';
import { soundDirection, loudness, listenerFrame, SOUND_KINDS } from '../src/game/sound-radar';

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

  it('looking up or down changes nothing (sounds are placed in your body frame)', () => {
    const ahead = v3(0, 1.6, -10); // at eye height, straight ahead
    const behind = v3(0, 1.6, 10);
    for (const pitch of [-80, -40, 0, 40, 80]) {
      const p = (pitch * Math.PI) / 180;
      const look = v3(0, Math.sin(p), -Math.cos(p));
      const f = listenerFrame(look, U);
      const a = soundDirection(ahead, eye, f.forward, f.right, f.up);
      expect(deg(a.angle)).toBe(0);
      expect(Math.abs(a.vertical)).toBeLessThan(1e-9); // not "above"/"below"
      expect(Math.abs(deg(soundDirection(behind, eye, f.forward, f.right, f.up).angle))).toBe(180);
      expect(deg(soundDirection(v3(10, 1.6, 0), eye, f.forward, f.right, f.up).angle)).toBe(90);
    }
    // on a wall (up = +X), looking along -Z: a sound at -Y is on your right
    const wall = listenerFrame(v3(0, 0, -1), v3(1, 0, 0));
    expect(deg(soundDirection(v3(0, -8, 0), eye, wall.forward, wall.right, wall.up).angle)).toBe(
      90,
    );
  });

  it('closer is louder; out of hearing range is silent; loud things carry further', () => {
    expect(loudness('steps', 3)).toBeGreaterThan(loudness('steps', 20));
    expect(loudness('steps', SOUND_KINDS.steps.range + 1)).toBe(0);
    expect(loudness('recall', 60)).toBeGreaterThan(0);
    expect(loudness('steps', 60)).toBe(0);
  });
});
