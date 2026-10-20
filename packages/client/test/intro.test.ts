import { describe, expect, it } from 'vitest';
import {
  INTRO_BEATS,
  LINE_SPACING,
  beatAt,
  dropDepth,
  flight,
  introClock,
  introPhase,
  introShot,
  lineLayout,
  lineOrder,
  portalOpen,
  shouldStartIntro,
  teamGap,
  winPercents,
  type IntroGate,
} from '../src/game/intro';

const T = 5;

describe('opening face-off timeline', () => {
  it('plays fly-in, face-off, portals, drop in order, then ends', () => {
    const seen: string[] = [];
    for (let t = 0; t < T; t += 0.05) {
      const p = introPhase(t, T)!;
      expect(p.u).toBeGreaterThanOrEqual(0);
      expect(p.u).toBeLessThanOrEqual(1);
      if (seen[seen.length - 1] !== p.phase) seen.push(p.phase);
    }
    expect(seen).toEqual(['flyIn', 'faceOff', 'portal', 'drop']);
    expect(introPhase(T, T)).toBeNull();
    expect(introPhase(-0.1, T)).toBeNull();
    // the beats stretch with the intro's length
    expect(beatAt('portal', 10)).toBeCloseTo(INTRO_BEATS.portal * 10);
  });

  it('a skipped intro is over at once', () => {
    expect(introPhase(1, T, true)).toBeNull();
    expect(introPhase(1, 0)).toBeNull();
  });

  it('runs on the match clock: it fills the extra spawn lock before the normal countdown', () => {
    // round 1's spawn lock = 5 s intro + 5 s countdown, ending at tick 600
    expect(introClock(0, 600, 5, 5)).toBeCloseTo(0);
    expect(introClock(150, 600, 5, 5)).toBeCloseTo(2.5);
    // the intro is over exactly when the usual 5 s countdown starts
    expect(introClock(300, 600, 5, 5)).toBeCloseTo(5);
  });

  it('starts only for the first round of a two-team match, seen from its start', () => {
    const g: IntroGate = {
      enabled: true,
      introSec: 5,
      phase: 'spawnLock',
      round: 1,
      teamSizes: [3, 3],
      t: 0.1,
    };
    expect(shouldStartIntro(g)).toBe(true);
    expect(shouldStartIntro({ ...g, enabled: false })).toBe(false); // Settings → Match intro off
    expect(shouldStartIntro({ ...g, round: 2 })).toBe(false); // not every round
    expect(shouldStartIntro({ ...g, phase: 'live' })).toBe(false);
    expect(shouldStartIntro({ ...g, t: 2 })).toBe(false); // joined late
    expect(shouldStartIntro({ ...g, introSec: 0 })).toBe(false); // older server
    expect(shouldStartIntro({ ...g, teamSizes: [3, 0] })).toBe(false);
    expect(shouldStartIntro({ ...g, ffa: true })).toBe(false); // Royale / free-for-all
    expect(shouldStartIntro({ ...g, teamSizes: [1, 1] })).toBe(true); // 1v1, bots too
  });
});

describe('opening face-off staging', () => {
  for (let n = 1; n <= 5; n++) {
    it(`${n}v${n}: two lines facing each other, evenly spaced, never overlapping`, () => {
      const left = lineLayout(n, 1);
      const right = lineLayout(n, -1);
      expect(left).toHaveLength(n);
      for (let i = 0; i < n; i++) {
        // mirror images across the middle line
        expect(right[i].x).toBeCloseTo(left[i].x);
        expect(right[i].z).toBeCloseTo(-left[i].z);
        expect(left[i].z).toBeGreaterThan(2);
      }
      // centred on the stage
      expect(left.reduce((s, p) => s + p.x, 0)).toBeCloseTo(0);
      for (let i = 1; i < n; i++) {
        const d = Math.hypot(left[i].x - left[i - 1].x, left[i].z - left[i - 1].z);
        expect(d).toBeGreaterThanOrEqual(LINE_SPACING - 1e-9);
        expect(d).toBeLessThan(LINE_SPACING * 1.2);
        // seen from the side (screen = z): each next player stands further out, never behind
        expect(left[i].z - left[i - 1].z).toBeGreaterThan(1);
      }
    });
  }

  it('bigger teams stand further apart and the camera steps back to fit them', () => {
    expect(teamGap(5)).toBeGreaterThan(teamGap(1));
    expect(introShot(2, T, 5).pos.x).toBeGreaterThan(introShot(2, T, 1).pos.x);
  });

  it('the camera is a side view (90° to the line between the teams), pushing in', () => {
    for (let t = 0; t < T; t += 0.25) {
      const s = introShot(t, T, 3);
      expect(s.pos.z).toBe(0);
      expect(s.target.z).toBe(0);
      expect(s.pos.x).toBeGreaterThan(5);
      expect(s.pos.y).toBeGreaterThan(s.target.y); // a little from above
    }
    const early = introShot(beatAt('faceOff', T), T, 3).pos.x;
    const late = introShot(beatAt('drop', T) - 0.01, T, 3).pos.x;
    expect(late).toBeLessThan(early);
  });

  it('puts you at the front of your line', () => {
    expect(lineOrder([4, 2, 9, 7, 5], 7)).toEqual([7, 2, 4, 5, 9]);
    expect(lineOrder([3, 1], null)).toEqual([1, 3]);
    expect(lineOrder([8], 8)).toEqual([8]);
  });

  it('players fly in from off-stage on their own side and land on their spot', () => {
    const spot = { x: 1.8, z: 4 };
    const start = flight(spot, 1, 0, 0);
    expect(start.pos.y).toBeGreaterThan(10);
    expect(start.pos.z).toBeGreaterThan(spot.z + 10);
    expect(start.thrust).toBe(1);
    const end = flight(spot, 1, 0, 3);
    expect(end.landed).toBe(true);
    expect(end.thrust).toBe(0);
    expect(end.pos.x).toBeCloseTo(spot.x);
    expect(end.pos.y).toBeCloseTo(0);
    expect(end.pos.z).toBeCloseTo(spot.z);
    // later places in the line take off a moment later; everyone is down before the face-off
    expect(flight(spot, 1, 3, 0.1).started).toBe(false);
    for (let k = 0; k < 5; k++) expect(flight(spot, -1, k, beatAt('faceOff', T)).landed).toBe(true);
  });

  it('portals open under their feet, then they drop through before the cut', () => {
    expect(portalOpen(0, beatAt('portal', T) - 0.01, T)).toBe(0);
    expect(portalOpen(0, beatAt('drop', T), T)).toBeCloseTo(1, 1);
    expect(dropDepth(0, beatAt('drop', T) - 0.01, T)).toBe(0);
    for (let k = 0; k < 5; k++) expect(dropDepth(k, T - 0.01, T)).toBeGreaterThan(2.5);
  });
});

describe('face-off win chance', () => {
  it('equal ratings: 50 / 50', () => {
    expect(winPercents([1200, 1400], [1300, 1300])).toEqual([50, 50]);
  });
  it('missing ratings (unranked, bots, a team without any): 50 / 50', () => {
    expect(winPercents([], [1500])).toEqual([50, 50]);
    expect(winPercents([null, undefined], [1500])).toEqual([50, 50]);
    expect(winPercents([1500], [null])).toEqual([50, 50]);
  });
  it('a 400-point gap: about 91 / 9 (Elo), adding up to 100', () => {
    expect(winPercents([1600], [1200])).toEqual([91, 9]);
    expect(winPercents([1200], [1600])).toEqual([9, 91]);
  });
  it('averages each team, leaving out players without a rating', () => {
    // 1400 vs 1400 once the bot (null) is left out
    expect(winPercents([1300, 1500, null], [1400])).toEqual([50, 50]);
    const [a, b] = winPercents([1100, 1200], [1150]);
    expect(a + b).toBe(100);
    expect(a).toBe(50);
  });
});
