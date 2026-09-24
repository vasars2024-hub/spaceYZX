import { describe, expect, it } from 'vitest';
import {
  updateRating,
  newRating,
  updateTeamMatch,
  virtualOpponent,
  tierFor,
  tierThreshold,
  galaxyThreshold,
  RANK_TIERS,
  globalRating,
  globalRd,
  applyInactivity,
  findMatches,
  searchWindow,
  balanceTeams,
  MIN_RD,
  MAX_RD,
} from '../src/index';
import type { QueueEntry, Rating } from '../src/index';

const r = (rating: number, rd = 100, vol = 0.06): Rating => ({ rating, rd, vol });

describe('glicko2', () => {
  it('reproduces the Glickman (2013) paper example', () => {
    const next = updateRating(
      r(1500, 200),
      [
        { opponent: r(1400, 30), score: 1 },
        { opponent: r(1550, 100), score: 0 },
        { opponent: r(1700, 300), score: 0 },
      ],
      0.5,
    );
    expect(next.rating).toBeCloseTo(1464.06, 1);
    expect(next.rd).toBeCloseTo(151.52, 1);
    expect(Math.abs(next.vol - 0.05999)).toBeLessThan(1e-5);
  });

  it('grows RD without games and clamps RD to [30, 350]', () => {
    const p = r(1800, 50);
    const next = updateRating(p, []);
    expect(next.rating).toBe(1800);
    expect(next.rd).toBeGreaterThan(50);
    expect(updateRating(newRating(), []).rd).toBe(MAX_RD);
    let q = r(1500, 31);
    for (let i = 0; i < 50; i++) q = updateRating(q, [{ opponent: r(1500, 30), score: 0.5 }]);
    expect(q.rd).toBeGreaterThanOrEqual(MIN_RD);
  });
});

describe('team matches', () => {
  const teamA = [r(1500), r(1520)];
  const teamB = [r(1510), r(1490)];

  it('uses the enemy average rating and RMS RD as a virtual opponent', () => {
    const v = virtualOpponent([r(1400, 30), r(1600, 40)]);
    expect(v.rating).toBe(1500);
    expect(v.rd).toBeCloseTo(Math.sqrt((900 + 1600) / 2), 9);
  });

  it('winners gain and losers lose', () => {
    const [a, b] = updateTeamMatch({ teams: [teamA, teamB], winner: 0 });
    for (const u of a) expect(u.delta).toBeGreaterThan(0);
    for (const u of b) expect(u.delta).toBeLessThan(0);
    expect(a[0].rating.rating).toBeCloseTo(1500 + a[0].delta, 9);
  });

  it('placement factor enlarges deltas', () => {
    const [base] = updateTeamMatch({ teams: [teamA, teamB], winner: 0 });
    const [placed] = updateTeamMatch({
      teams: [teamA, teamB],
      winner: 0,
      options: { placementGamesLeft: [[3, 0], []] },
    });
    expect(placed[0].delta).toBeCloseTo(base[0].delta * 1.6, 9);
    expect(placed[1].delta).toBeCloseTo(base[1].delta, 9);
  });

  it('applies team-kill and leaver penalties', () => {
    const [base] = updateTeamMatch({ teams: [teamA, teamB], winner: 0 });
    const [tk] = updateTeamMatch({
      teams: [teamA, teamB],
      winner: 0,
      options: { teamKills: [[2, 0], []] },
    });
    expect(tk[0].delta).toBeCloseTo(base[0].delta - 16, 9);
    const [left] = updateTeamMatch({
      teams: [teamA, teamB],
      winner: 0,
      options: { leftEarly: [[false, true], []] },
    });
    // Leaving counts as a loss even though the team won, plus 15 points.
    const [lostTeam] = updateTeamMatch({ teams: [teamA, teamB], winner: 1 });
    expect(left[1].delta).toBeCloseTo(lostTeam[1].delta - 15, 9);
    expect(left[1].delta).toBeLessThan(0);
    expect(left[0].delta).toBeCloseTo(base[0].delta, 9);
  });

  it('draws move ratings toward each other', () => {
    const [hi, lo] = updateTeamMatch({ teams: [[r(1800)], [r(1400)]], winner: null });
    expect(hi[0].delta).toBeLessThan(0);
    expect(lo[0].delta).toBeGreaterThan(0);
  });
});

describe('tiers', () => {
  const done = { placementDone: true };

  it('maps ratings to tier divisions and labels', () => {
    expect(tierFor(500, done).label).toBe('Asteroid III');
    expect(tierFor(1000, done).label).toBe('Asteroid III');
    expect(tierFor(1074.9, done).label).toBe('Asteroid III');
    expect(tierFor(1075, done).label).toBe('Asteroid II');
    expect(tierFor(1150, done).label).toBe('Asteroid I');
    expect(tierFor(1225, done).label).toBe('Moon III');
    expect(tierFor(1750, done)).toMatchObject({
      tier: 'Gas Giant',
      division: 'II',
      label: 'Gas Giant II',
      color: '#e0a15a',
      isGalaxy: false,
    });
    expect(tierThreshold('Star', 'III')).toBe(1900);
    expect(galaxyThreshold()).toBe(2275);
    expect(tierFor(3000, done).label).toBe('Supergiant I');
  });

  it('gives Galaxy only to top-N players above the Supergiant I threshold', () => {
    const top = RANK_TIERS.galaxy.topN;
    expect(tierFor(2300, { ...done, leaderboardPosition: 1 }).isGalaxy).toBe(true);
    expect(tierFor(2300, { ...done, leaderboardPosition: top }).label).toBe('Galaxy');
    expect(tierFor(2300, { ...done, leaderboardPosition: top + 1 }).label).toBe('Supergiant I');
    expect(tierFor(2200, { ...done, leaderboardPosition: 1 }).label).toBe('Supergiant II');
    expect(tierFor(2300, done).isGalaxy).toBe(false);
  });

  it('is unranked during placements', () => {
    const t = tierFor(2500, { placementDone: false, placementGamesPlayed: 2 });
    expect(t.label).toBe('Unranked (placements: 2/5)');
    expect(t.isRanked).toBe(false);
    expect(t.division).toBeNull();
  });
});

describe('global rating', () => {
  it('weights modes by games + 1 and ignores unplayed modes', () => {
    expect(globalRating({})).toBeNull();
    expect(globalRating({ '1v1': { rating: 1600, rd: 50, games: 0 } })).toBeNull();
    expect(globalRd({})).toBeNull();
    const g = globalRating({
      '1v1': { rating: 1600, rd: 50, games: 9 },
      '2v2': { rating: 1400, rd: 100, games: 4 },
      '5v5': { rating: 2000, rd: 80, games: 0 },
    });
    expect(g).toBeCloseTo((1600 * 10 + 1400 * 5) / 15, 9);
    const rd = globalRd({
      '1v1': { rating: 1600, rd: 50, games: 9 },
      '2v2': { rating: 1400, rd: 100, games: 4 },
    });
    expect(rd).toBeCloseTo(Math.sqrt((2500 * 10 + 10000 * 5) / 15), 9);
  });
});

describe('inactivity decay', () => {
  it('only grows RD for players below Star III', () => {
    const next = applyInactivity(r(1800, 60), 70);
    expect(next.rating).toBe(1800);
    expect(next.rd).toBeGreaterThan(60);
    expect(applyInactivity(r(1800, 60), 6).rd).toBe(60);
  });

  it('decays top tiers after 14 days, 10 per full week, never below Star III', () => {
    expect(applyInactivity(r(2200), 14).rating).toBe(2200);
    expect(applyInactivity(r(2200), 20).rating).toBe(2200);
    expect(applyInactivity(r(2200), 21).rating).toBe(2190);
    expect(applyInactivity(r(2200), 14 + 7 * 5).rating).toBe(2150);
    expect(applyInactivity(r(1905), 14 + 7 * 10).rating).toBe(1900);
    expect(applyInactivity(r(2200), 21).rd).toBeGreaterThan(100);
  });
});

describe('matchmaking', () => {
  const q = (id: string, rating: number, joinedAtMs = 0, pingMs = 30): QueueEntry => ({
    id,
    rating,
    pingMs,
    joinedAtMs,
  });

  it('widens the window by 50 per 10 s, capped at 1000', () => {
    expect(searchWindow(q('a', 1500), 0)).toBe(100);
    expect(searchWindow(q('a', 1500), 9_999)).toBe(100);
    expect(searchWindow(q('a', 1500), 10_000)).toBe(150);
    expect(searchWindow(q('a', 1500), 60_000)).toBe(400);
    expect(searchWindow(q('a', 1500), 1e9)).toBe(1000);
  });

  it('matches 1v1 once the window is wide enough', () => {
    const queue = [q('a', 1500), q('b', 1650)];
    expect(findMatches(queue, 0, '1v1').matches).toEqual([]);
    expect(findMatches(queue, 0, '1v1').remaining).toEqual(queue);
    const res = findMatches(queue, 10_000, '1v1');
    expect(res.matches).toEqual([{ teams: [['b'], ['a']] }]);
    expect(res.remaining).toEqual([]);
    expect(findMatches([q('a', 1000), q('b', 2500)], 1e9, '1v1').matches).toEqual([]);
  });

  it('uses the widest window of the involved players', () => {
    const queue = [q('old', 1500, 0), q('new', 1800, 60_000)];
    expect(findMatches(queue, 60_000, '1v1').matches.length).toBe(1);
  });

  it('prefers similar ping among similar ratings', () => {
    const queue = [q('a', 1500, 0, 20), q('b', 1510, 1, 200), q('c', 1520, 2, 30)];
    const res = findMatches(queue, 0, '1v1');
    expect(res.matches[0].teams.flat().sort()).toEqual(['a', 'c']);
    expect(res.remaining.map((p) => p.id)).toEqual(['b']);
  });

  it('balances team modes', () => {
    const [a, b] = balanceTeams([q('1', 1600), q('2', 1550), q('3', 1500), q('4', 1450)]);
    expect(a.map((p) => p.id)).toEqual(['1', '4']);
    expect(b.map((p) => p.id)).toEqual(['2', '3']);

    const ratings = [1900, 1850, 1700, 1690, 1650, 1600, 1580, 1500, 1450, 1300];
    const queue = ratings.map((x, i) => q(`p${i}`, x, 0));
    const res = findMatches(queue, 1e9, '5v5');
    expect(res.matches.length).toBe(1);
    const [ta, tb] = res.matches[0].teams;
    expect(ta.length).toBe(5);
    expect(tb.length).toBe(5);
    const avg = (ids: string[]) =>
      ids.reduce((s, id) => s + queue.find((p) => p.id === id)!.rating, 0) / ids.length;
    // Best possible split: brute force over all 5-player subsets.
    let best = Infinity;
    for (let mask = 0; mask < 1 << 10; mask++) {
      let n = 0;
      let s = 0;
      for (let i = 0; i < 10; i++) {
        if (mask & (1 << i)) {
          n++;
          s += ratings[i];
        }
      }
      if (n !== 5) continue;
      const total = ratings.reduce((x, y) => x + y, 0);
      best = Math.min(best, Math.abs(s - (total - s)) / 5);
    }
    expect(Math.abs(avg(ta) - avg(tb))).toBeLessThanOrEqual(best + 10);
  });

  it('leaves extra players in the queue for team modes', () => {
    const queue = [q('a', 1500), q('b', 1510), q('c', 1520), q('d', 1530), q('e', 1540, 5)];
    const res = findMatches(queue, 0, '2v2');
    expect(res.matches.length).toBe(1);
    expect(res.remaining.map((p) => p.id)).toEqual(['e']);
  });

  it('is deterministic regardless of queue order', () => {
    const queue = Array.from({ length: 23 }, (_, i) =>
      q(`p${i}`, 1200 + ((i * 137) % 600), (i * 7919) % 30_000, 20 + ((i * 31) % 90)),
    );
    const shuffled = [...queue].reverse();
    const a = findMatches(queue, 45_000, '2v2');
    const b = findMatches(shuffled, 45_000, '2v2');
    expect(a.matches).toEqual(b.matches);
    expect(a.matches.length).toBeGreaterThan(0);
    expect(new Set(a.remaining.map((p) => p.id))).toEqual(new Set(b.remaining.map((p) => p.id)));
  });
});
