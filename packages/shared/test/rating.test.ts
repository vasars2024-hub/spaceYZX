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
  premierBand,
  PREMIER_BANDS,
  seasonResetRating,
  ladderForMode,
  ladderRank,
  LADDER_IDS,
  LADDERS,
  RANKED_QUEUES,
  createVeto,
  vetoBan,
  vetoTick,
  vetoRemaining,
  pickGroup,
  applyInactivity,
  findMatches,
  searchWindow,
  balanceTeams,
  formableTeamSize,
  partyOnlySize,
  partyQueueProblem,
  partyRating,
  queueTeamSizes,
  stackMultiplier,
  STACK_PENALTY,
  splitParties,
  createModeVote,
  castModeVote,
  modeVoteTick,
  modeVoteCounts,
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

describe('ladders: Premier, Duels and Race only', () => {
  it('Race: its own ladder, 2-8 racers, number + colour band like Premier, seasonal', () => {
    const race = RANKED_QUEUES.find((q) => q.id === 'race')!;
    expect(race).toMatchObject({ kind: 'race', ladder: 'race', group: { min: 2, max: 8 } });
    expect(LADDERS.race).toMatchObject({
      startRating: 1000,
      placement: { count: 5, unit: 'races' },
      hideWhilePlacing: true,
      seasonal: true,
    });
    expect(ladderRank('race', 1450)).toEqual(ladderRank('premier', 1450));
    expect(seasonResetRating(1500, LADDERS.race.startRating)).toBeCloseTo(1300, 9);
  });

  it('has the approved ladders: Premier, Premier CS, Duels (1v1 + 2v2), Race', () => {
    expect(LADDER_IDS).toEqual(['premier', 'premier-cs', 'duels', 'race']);
    expect(RANKED_QUEUES.map((q) => q.id)).toEqual([
      'premier',
      'premier-cs',
      'duels-1v1',
      'duels-2v2',
      'race',
    ]);
    expect(ladderForMode('5v5')).toBe('premier');
    expect(ladderForMode('3v3')).toBe('premier');
    expect(ladderForMode('1v1')).toBe('duels');
    expect(ladderForMode('2v2')).toBe('duels');
    expect(ladderForMode('arena')).toBeNull();
    expect(ladderForMode('race')).toBe('race');
    const premier = RANKED_QUEUES.find((q) => q.id === 'premier')!;
    if (premier.kind !== 'team') throw new Error('Premier is a team queue');
    expect(premier).toMatchObject({ objective: 'bomb', veto: true, loadout: 'lethal' });
    // 3v3 by default, 4v4 / 5v5 when enough search
    expect(queueTeamSizes(premier)).toEqual([5, 4, 3]);
    const cs = RANKED_QUEUES.find((q) => q.id === 'premier-cs')!;
    if (cs.kind !== 'team') throw new Error('Premier CS is a team queue');
    expect(cs).toMatchObject({ ladder: 'premier-cs', loadout: 'cs', veto: true });
    expect(cs.modeVote).toEqual(['bomb', 'elim']);
    expect(queueTeamSizes(cs)).toEqual([5, 4, 3]);
    for (const l of ['premier', 'premier-cs'] as const)
      expect(LADDERS[l]).toMatchObject({
        startRating: 1000,
        placement: { count: 5, unit: 'wins' },
        hideWhilePlacing: true,
        seasonal: true,
      });
    expect(ladderRank('premier-cs', 1450)).toEqual(ladderRank('premier', 1450));
  });

  it('says which team size could form now', () => {
    const premier = RANKED_QUEUES.find((q) => q.id === 'premier')!;
    expect(formableTeamSize(premier, 5)).toBeNull();
    expect(formableTeamSize(premier, 6)).toBe(3);
    expect(formableTeamSize(premier, 8)).toBe(4);
    expect(formableTeamSize(premier, 9)).toBe(4);
    expect(formableTeamSize(premier, 10)).toBe(5);
    expect(formableTeamSize(premier, 14)).toBe(5);
    const duel = RANKED_QUEUES.find((q) => q.id === 'duels-1v1')!;
    expect(formableTeamSize(duel, 2)).toBe(1);
  });

  it('rates parties toward their best player and limits rank gaps', () => {
    expect(partyRating([1000])).toBe(1000);
    expect(partyRating([1600, 1000])).toBeCloseTo(0.6 * 1600 + 0.4 * 1300, 9);
    const premier = RANKED_QUEUES.find((q) => q.id === 'premier')!;
    const duo = RANKED_QUEUES.find((q) => q.id === 'duels-2v2')!;
    const solo = RANKED_QUEUES.find((q) => q.id === 'duels-1v1')!;
    const race = RANKED_QUEUES.find((q) => q.id === 'race')!;
    expect(partyQueueProblem(premier, [1000, 1500])).toBeNull();
    // a duo 700 apart can't search Premier (not a full team)…
    expect(partyQueueProblem(premier, [1000, 1700])).toMatch(/apart/);
    // …but a full team may, and then only plays at its own size
    expect(partyQueueProblem(premier, [1000, 1700, 1100])).toBeNull();
    expect(partyOnlySize([1000, 1700, 1100])).toBe(3);
    expect(partyOnlySize([1000, 1100])).toBeNull();
    expect(partyQueueProblem(duo, [1000, 1900])).toBeNull();
    expect(partyQueueProblem(duo, [1000, 1100, 1200])).toMatch(/up to 2/);
    expect(partyQueueProblem(solo, [1000, 1100])).toMatch(/solo/);
    expect(partyQueueProblem(race, [1000, 1100])).toMatch(/solo/);
    expect(
      partyQueueProblem(
        premier,
        [1, 2, 3, 4, 5, 6].map((x) => 1000 + x),
      ),
    ).toMatch(/up to 5/);
    // Valorant rule: a full stack with a big spread earns 75 %
    expect(stackMultiplier([1000, 1500, 1100], 3)).toBe(STACK_PENALTY);
    expect(stackMultiplier([1000, 1300, 1100], 3)).toBe(1);
    expect(stackMultiplier([1000, 1500, 1100], 5)).toBe(1);
    expect(stackMultiplier([1000], 1)).toBe(1);
  });

  it('Premier shows one number in 7 colour bands', () => {
    expect(PREMIER_BANDS.length).toBe(7);
    const c = (x: number) => premierBand(x).color;
    expect(c(999)).toBe('#9aa6b8');
    expect(c(1000)).toBe('#8fd3ff');
    expect(c(1199)).toBe('#8fd3ff');
    expect(c(1200)).toBe('#4f8dff');
    expect(c(1400)).toBe('#a77bff');
    expect(c(1600)).toBe('#ff7ad9');
    expect(c(1800)).toBe('#ff5a5a');
    expect(c(2000)).toBe('#ffd24a');
    expect(c(3000)).toBe('#ffd24a');
    expect(ladderRank('premier', 2100)).toEqual({ label: 'Galaxy', color: '#ffd24a' });
    // Duels keeps the space tiers
    expect(ladderRank('duels', 1750).label).toBe('Gas Giant II');
  });

  it('a new season pulls every rating 40% toward 1000', () => {
    expect(seasonResetRating(1000)).toBe(1000);
    expect(seasonResetRating(2000)).toBeCloseTo(1600, 9);
    expect(seasonResetRating(1500)).toBeCloseTo(1300, 9);
    expect(seasonResetRating(500)).toBeCloseTo(700, 9);
  });
});

describe('Premier map veto', () => {
  const maps = ['split-deck', 'kestrel', 'orbital-ring', 'canyon'];

  it('teams alternate bans until one map is left, which is played', () => {
    const v = createVeto(maps, 0, { banMs: 15_000 });
    expect(v.turn).toBe(0);
    expect(vetoBan(v, 1, 'kestrel', 1000)).toMatch(/other team/);
    expect(vetoBan(v, 0, 'nowhere', 1000)).toMatch(/not in the veto/);
    expect(vetoBan(v, 0, 'kestrel', 1000)).toBeNull();
    expect(v.turn).toBe(1);
    expect(v.turnEndsMs).toBe(16_000);
    expect(vetoBan(v, 1, 'kestrel', 2000)).toMatch(/not in the veto/); // already banned
    expect(vetoBan(v, 1, 'canyon', 2000)).toBeNull();
    expect(v.turn).toBe(0);
    expect(v.picked).toBeNull();
    expect(vetoBan(v, 0, 'split-deck', 3000)).toBeNull();
    expect(v.picked).toBe('orbital-ring');
    expect(v.banned.map((b) => [b.map, b.team])).toEqual([
      ['kestrel', 0],
      ['canyon', 1],
      ['split-deck', 0],
    ]);
    expect(vetoBan(v, 1, 'orbital-ring', 4000)).toMatch(/already decided/);
  });

  it('a turn that runs out bans a random map for that team', () => {
    const v = createVeto(maps.slice(0, 3), 0, { banMs: 15_000 });
    expect(vetoTick(v, 14_999, () => 0)).toBe(false);
    expect(vetoTick(v, 15_000, () => 0.99)).toBe(true);
    expect(v.banned).toEqual([{ map: 'orbital-ring', team: 0, auto: true }]);
    expect(v.turn).toBe(1);
    expect(vetoRemaining(v)).toEqual(['split-deck', 'kestrel']);
    expect(vetoTick(v, 30_000, () => 0)).toBe(true);
    expect(v.picked).toBe('kestrel');
    expect(vetoTick(v, 99_000, () => 0)).toBe(false);
  });

  it('a pool of one map needs no bans', () => {
    expect(createVeto(['kestrel'], 0, { banMs: 1 }).picked).toBe('kestrel');
  });
});

describe('race queue groups', () => {
  const e = (id: string, rating: number, joinedAtMs: number): QueueEntry => ({
    id,
    rating,
    pingMs: 20,
    joinedAtMs,
  });
  const opts = { minPlayers: 2, maxPlayers: 8, gatherMs: 20_000 };
  it('8 start at once; else 2+ start together ~20 s after the 2nd joined', () => {
    expect(pickGroup([e('a', 1000, 0)], 99_000, opts)).toBeNull();
    const three = [e('a', 1000, 0), e('b', 1000, 5_000), e('c', 1000, 10_000)];
    expect(pickGroup(three, 24_999, opts)).toBeNull();
    expect(pickGroup(three, 25_000, opts)).toEqual(['a', 'b', 'c']);
    const ten = Array.from({ length: 10 }, (_, i) => e(`p${i}`, 1000 + i * 100, i));
    const g = pickGroup(ten, 20, opts)!;
    expect(g.length).toBe(8);
    expect(g[0]).toBe('p0');
    // the nearest ratings to the longest waiter: the two strongest wait for the next race
    expect(g).not.toContain('p9');
    expect(g).not.toContain('p8');
  });
});

describe('matchmaking team size override', () => {
  it('Premier can start 4v4 from 8 players (5v5 needs 10)', () => {
    const q: QueueEntry[] = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      rating: 1000 + i * 10,
      pingMs: 30,
      joinedAtMs: 0,
    }));
    expect(findMatches(q, 100_000, '5v5').matches).toEqual([]);
    const m = findMatches(q, 100_000, '5v5', { teamSize: 4 }).matches;
    expect(m.length).toBe(1);
    expect(m[0].teams[0].length).toBe(4);
    expect(m[0].teams[1].length).toBe(4);
  });
});

describe('Premier CS mode vote', () => {
  it('the majority decides; it closes early once everyone voted', () => {
    const v = createModeVote(['bomb', 'elim'], 0, 10_000);
    expect(castModeVote(v, 'a', 'elim')).toBeNull();
    expect(castModeVote(v, 'b', 'bomb')).toBeNull();
    expect(castModeVote(v, 'c', 'elim')).toBeNull();
    expect(castModeVote(v, 'c', 'tower')).toMatch(/not in the vote/);
    // 3 of 4 voted, time left: still open
    expect(modeVoteTick(v, 5_000, 4, () => 0)).toBe(false);
    expect(v.result).toBeNull();
    expect(modeVoteTick(v, 5_000, 3, () => 0.99)).toBe(true);
    expect(v.result).toBe('elim');
    expect(modeVoteCounts(v)).toEqual({ bomb: 1, elim: 2 });
    expect(castModeVote(v, 'd', 'bomb')).toMatch(/decided/);
  });

  it('a tie (or nobody voting) is decided at random when time runs out', () => {
    const tie = createModeVote(['bomb', 'elim'], 0, 10_000);
    castModeVote(tie, 'a', 'bomb');
    castModeVote(tie, 'b', 'elim');
    expect(modeVoteTick(tie, 9_999, 6, () => 0)).toBe(false);
    expect(modeVoteTick(tie, 10_000, 6, () => 0.7)).toBe(true);
    expect(tie.result).toBe('elim');
    const none = createModeVote(['bomb', 'elim'], 0, 10_000);
    modeVoteTick(none, 10_000, 6, () => 0.2);
    expect(none.result).toBe('bomb');
  });
});

describe('parties in matchmaking', () => {
  const e = (id: string, rating: number, size = 1, joinedAtMs = 0): QueueEntry => ({
    id,
    rating,
    pingMs: 30,
    joinedAtMs,
    size,
  });

  it('keeps a party on one team and fills the rest with solo players', () => {
    const q = [e('duo', 1200, 2), e('a', 1180), e('b', 1210), e('c', 1190), e('d', 1205)];
    const m = findMatches(q, 0, '5v5', { teamSize: 3 }).matches;
    expect(m.length).toBe(1);
    const [a, b] = m[0].teams;
    const withDuo = a.includes('duo') ? a : b;
    const other = withDuo === a ? b : a;
    expect(withDuo.length).toBe(2); // the duo + one solo = 3 players
    expect(other.length).toBe(3);
  });

  it('never splits a party or overfills a team', () => {
    expect(splitParties([e('x', 1000, 3), e('y', 1000, 3)], 3)).not.toBeNull();
    expect(splitParties([e('x', 1000, 2), e('y', 1000, 2), e('z', 1000, 2)], 3)).toBeNull();
    // two trios can't fill a 2v2; a party of 4 sits out a 3v3
    expect(
      findMatches([e('x', 1000, 3), e('y', 1000, 3)], 0, '5v5', { teamSize: 2 }).matches,
    ).toEqual([]);
    const four = [e('q', 1000, 4), e('a', 1000), e('b', 1000), e('c', 1000), e('d', 1000)];
    expect(findMatches(four, 0, '5v5', { teamSize: 3 }).matches).toEqual([]);
  });

  it('balances whole parties by total rating', () => {
    const wide = { baseWindow: 1000, maxWindow: 1000 };
    const duos = findMatches([e('hi', 1600, 2), e('lo', 1000, 2)], 0, '2v2', wide).matches[0];
    // two duos can't be split: they face each other
    expect(duos.teams.map((t) => t.join())).toEqual(['hi', 'lo']);
    const q = [e('hi', 1400, 2), e('s1', 1500), e('s2', 1300), e('s3', 1000), e('s4', 1100)];
    const [a, b] = findMatches(q, 0, '5v5', { ...wide, teamSize: 3 }).matches[0].teams;
    const mine = a.includes('hi') ? a : b;
    // the strong duo gets a weak third player: 1400·2 + 1000/1100 vs the other three
    expect(mine.length).toBe(2);
    expect(['s3', 's4']).toContain(mine.find((x) => x !== 'hi'));
  });

  it('a wide-gap full stack only plays at its own size', () => {
    const stack: QueueEntry = { ...e('stack', 1300, 3), onlySize: 3 };
    const solos = ['a', 'b', 'c', 'd', 'f', 'g', 'h'].map((id) => e(id, 1300));
    expect(findMatches([stack, ...solos], 0, '5v5', { teamSize: 5 }).matches).toEqual([]);
    solos.length = 3;
    const m = findMatches([stack, ...solos], 0, '5v5', { teamSize: 3 }).matches;
    expect(m.length).toBe(1);
    expect(m[0].teams.some((t) => t.length === 1 && t[0] === 'stack')).toBe(true);
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
