// Hit registration and Boomerang consistency, end to end: the real server and real clients on
// a virtual network (deterministic, runs in seconds). "What you hit on your screen counts, what
// you miss doesn't" — for every weapon, at pings up to the 175 ms lag-compensation cap.
import { describe, expect, it } from 'vitest';
import {
  agreement,
  boomerangDuel,
  deflectDuel,
  grenadeShot,
  gunDuel,
  laserDuel,
  slashDuel,
  type NetcheckOptions,
  type ScenarioReport,
} from '../scenarios';

const SECONDS = 8;

/** Everything the shooter saw must match what the server decided. */
const expectConsistent = (r: ScenarioReport, needShots = true): void => {
  const where = `${r.name}: ${JSON.stringify(r.stats)} ${JSON.stringify(r.extra)}`;
  if (needShots) expect(r.stats.shots, where).toBeGreaterThan(0);
  expect(r.stats.falseNegative, `hit on screen but not counted — ${where}`).toBe(0);
  expect(r.stats.falsePositive, `missed on screen but counted — ${where}`).toBe(0);
  // hit markers, beams, catches, deflects... each shown exactly once per real event
  for (const [kind, v] of Object.entries(r.events))
    expect(v.shown, `${kind} shown vs real — ${where}`).toBe(v.real);
  for (const [k, v] of Object.entries(r.extra)) {
    if (/error/.test(k)) expect(v, `${k} — ${where}`).toBeLessThan(1e-6);
    if (/never happened|not predicted|mismatches/.test(k)) expect(v, `${k} — ${where}`).toBe(0);
    if (/ticks apart/.test(k)) expect(v, `${k} — ${where}`).toBe(0);
  }
};

const pings = [0, 100, 150];
const link = (rttMs: number): NetcheckOptions['link'] => ({ rttMs, jitterMs: rttMs * 0.1 });

describe.each(pings)('hit registration at %i ms ping', (rtt) => {
  const o: NetcheckOptions = { link: link(rtt), seconds: SECONDS };
  it('Laser: tracked shots hit, shots beside the body miss', () => expectConsistent(laserDuel(o)));
  it('Laser while strafing (own prediction)', () =>
    expectConsistent(laserDuel({ ...o, shooterStrafes: true })));
  it('Boomerang: quick throws at a strafing target', () =>
    expectConsistent(boomerangDuel(o, 'quick')));
  it('Boomerang thrown while strafing', () =>
    expectConsistent(boomerangDuel({ ...o, shooterStrafes: true }, 'quick')));
  it('Boomerang steered onto the target', () => expectConsistent(boomerangDuel(o, 'steer')));
  it('Wind-up Throw', () => expectConsistent(boomerangDuel({ ...o, seconds: 12 }, 'windup')));
  it('Lethal Recall: same line, same timing', () => {
    const r = boomerangDuel(o, 'recall');
    expect(r.extra['recall lines']).toBeGreaterThan(2);
    expectConsistent(r, false); // recall kills are judged on the victim's side (dodgeable)
  });
  it('Double boomerang: twins hit what was on screen, predicted exactly', () => {
    const r = boomerangDuel(o, 'twin');
    expect(r.extra['twins thrown']).toBeGreaterThan(2);
    expectConsistent(r);
  });
  it('Slash', () => expectConsistent(slashDuel(o)));
  it('Deflect', () => expectConsistent(deflectDuel(o)));
  it('Laser at a flying grenade', () => expectConsistent(grenadeShot(o)));
  it('CS mode AK bursts: spray + spread predicted exactly', () => expectConsistent(gunDuel(o)));
  it('CS mode AK while strafing (moving inaccuracy)', () =>
    expectConsistent(gunDuel({ ...o, shooterStrafes: true })));
});

describe('hit registration on uneven connections', () => {
  it('a low-ping shooter with ping equalization (input delay) vs a high-ping target', () => {
    const r = laserDuel({ link: link(20), targetLink: link(140), seconds: SECONDS });
    expectConsistent(r);
    const b = boomerangDuel({ link: link(20), targetLink: link(140), seconds: SECONDS });
    expectConsistent(b);
  });

  it('a high-ping shooter vs a low-ping target', () => {
    expectConsistent(laserDuel({ link: link(150), targetLink: link(20), seconds: SECONDS }));
  });

  it('jitter and packet loss: nearly every verdict still agrees', () => {
    const bad = { rttMs: 80, jitterMs: 25, lossPct: 2 };
    for (const r of [
      laserDuel({ link: bad, seconds: SECONDS }),
      boomerangDuel({ link: bad, seconds: SECONDS }),
    ]) {
      expect(agreement(r.stats), r.name).toBeGreaterThanOrEqual(0.9);
      expect(r.stats.falsePositive, r.name).toBe(0);
    }
  });
});

describe('the check catches broken lag compensation', () => {
  it('without lag compensation, hits seen on screen are lost', () => {
    const r = laserDuel({ link: link(100), seconds: SECONDS, lagComp: false });
    expect(r.stats.falseNegative).toBeGreaterThan(3);
  });
});
