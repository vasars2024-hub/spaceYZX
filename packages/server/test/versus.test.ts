// The ranked versus screen: when a ranked room forms, every member gets { t: 'versus' } with
// everyone's ladder standing (read-only from the ranked store) and the odds.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { VersusInfo } from '@space-yz/shared';
import { rankedQueue, teamWinChance } from '@space-yz/shared';
import { createServices, type Services } from '../src/services';
import { buildVersus } from '../src/services/queue';
import type { Conn } from '../src/game/conn';
import type { GameHub } from '../src/game/hub';
import type { MatchResult } from '../src/game/rules/match';

interface FakeConn {
  conn: Conn;
  sent: { t: string; [k: string]: unknown }[];
}

const result = (a: number[], b: number[], winner: 0 | 1 | null): MatchResult => ({
  mode: a.length === 1 ? '1v1' : a.length === 2 ? '2v2' : '5v5',
  winner,
  reason: 'first to 5',
  scores: winner === 0 ? [5, 2] : [2, 5],
  rounds: 7,
  durationSec: 200,
  players: [...a.map((id) => [id, 0] as const), ...b.map((id) => [id, 1] as const)].map(
    ([id, team], i) => ({
      id: i + 1,
      accountId: id,
      team,
      bot: false,
      kills: 3,
      deaths: 2,
      teamKills: 0,
      damage: 300,
    }),
  ),
  leavers: [],
});

describe('ranked versus message', () => {
  let s: Services;
  let clock: number;
  let order: string[];
  let nextPlayerId: number;

  beforeEach(() => {
    clock = new Date(2026, 8, 25, 12, 0).getTime();
    s = createServices({ dbFile: ':memory:', log: () => {}, now: () => clock });
    order = [];
    nextPlayerId = 1;
    s.queue.hub = {
      createRoom: (opts: Record<string, unknown>) => ({ opts, code: 'R1' }),
      joinRoom: (c: Conn, room: { code: string }) => {
        c.roomCode = room.code;
        c.playerId = nextPlayerId++;
        order.push(`join:${c.name}`);
      },
    } as unknown as GameHub;
    s.queue.rand = () => 0;
  });
  afterEach(() => s.close());

  const player = (name: string): FakeConn => {
    const id = s.accounts.login(name).account.id;
    const sent: FakeConn['sent'] = [];
    const conn = {
      name,
      accountId: id,
      roomCode: null,
      playerId: null,
      closed: false,
      rttMs: 20,
      sendJson: (m: { t: string }) => {
        sent.push(m);
        if (m.t === 'versus') order.push(`versus:${name}`);
      },
    } as unknown as Conn;
    return { conn, sent };
  };

  const versusOf = (p: FakeConn): VersusInfo =>
    p.sent.find((m) => m.t === 'versus')!.data as VersusInfo;

  it('Duels 1v1: both players get ratings, W/L form and the same odds, after joining', () => {
    const a = player('Ace');
    const b = player('Nova');
    const aid = a.conn.accountId!;
    const bid = b.conn.accountId!;
    // history: Nova won 6 of 7 duels against Ace
    for (let i = 0; i < 7; i++)
      s.ranked.recordMatch({
        mode: '1v1',
        ranked: true,
        map: 'kestrel',
        result: i === 3 ? result([aid], [bid], 0) : result([bid], [aid], 0),
        names: {},
      });
    // a casual match never shows up in the ranked form
    s.ranked.recordMatch({
      mode: '1v1',
      ranked: false,
      map: 'kestrel',
      result: result([aid], [bid], 0),
      names: {},
    });
    const ratingsBefore = [s.ranked.rating(aid, 'duels'), s.ranked.rating(bid, 'duels')];
    expect(s.queue.set(a.conn, 'duels-1v1')).toBeNull();
    expect(s.queue.set(b.conn, 'duels-1v1')).toBeNull();
    // their ratings are apart: the search window widens while they wait
    for (let i = 0; i < 600 && !order.length; i++) {
      clock += 1000;
      s.queue.tick();
    }
    // sent after everyone joined (the client resets its room state on roomJoined)
    expect(order.indexOf('versus:Ace')).toBeGreaterThan(order.indexOf('join:Nova'));
    const va = versusOf(a);
    const vb = versusOf(b);
    expect(vb).toEqual(va);
    expect(va).toMatchObject({ ladder: 'duels', queue: 'duels-1v1' });
    expect(va.players).toHaveLength(2);
    const ace = va.players.find((p) => p.name === 'Ace')!;
    const nova = va.players.find((p) => p.name === 'Nova')!;
    expect(ace.id).toBe(a.conn.playerId);
    expect(nova.id).toBe(b.conn.playerId);
    expect(ace.team).not.toBe(nova.team);
    expect(nova).toMatchObject({ games: 7, wins: 6, placement: null });
    expect(ace).toMatchObject({ games: 7, wins: 1 });
    expect(nova.rating).toBe(Math.round(ratingsBefore[1].rating.rating));
    expect(nova.rank?.label).toMatch(/Asteroid|Moon|Planet|Gas Giant|Star|Supergiant|Galaxy/);
    // newest first; Ace won the 4th of 7 (index 3 from the newest)
    expect(nova.form).toEqual(['W', 'W', 'W', 'L', 'W']);
    expect(ace.form).toEqual(['L', 'L', 'L', 'W', 'L']);
    // the odds: Glicko-2 expected score of the two ratings, summing to 1
    const pNova = teamWinChance([ratingsBefore[1].rating], [ratingsBefore[0].rating]);
    expect(va.teamChance[nova.team]).toBeCloseTo(pNova, 10);
    expect(va.teamChance[0] + va.teamChance[1]).toBeCloseTo(1, 10);
    expect(pNova).toBeGreaterThan(0.5);
    // read-only: nothing about the ratings changed
    expect(s.ranked.rating(aid, 'duels')).toEqual(ratingsBefore[0]);
    expect(s.ranked.rating(bid, 'duels')).toEqual(ratingsBefore[1]);
  });

  it('Premier: a placing player shows placement progress, never the hidden rating', () => {
    const ps = Array.from({ length: 10 }, (_, i) => player(`Prem${i}`));
    const members = ps.map((p, i) => {
      p.conn.playerId = i + 1;
      return { conn: p.conn, team: (i < 5 ? 0 : 1) as 0 | 1 };
    });
    // Prem0 is placed (5 wins this season), everyone else is placing
    const id0 = ps[0].conn.accountId!;
    s.ranked.save(id0, 'premier', {
      rating: { rating: 1340, rd: 80, vol: 0.06 },
      games: 8,
      wins: 5,
      seasonGames: 8,
      seasonWins: 5,
      lastPlayed: clock,
    });
    const v = buildVersus(s.ranked, rankedQueue('premier')!, 'split-deck', members);
    expect(v.ladder).toBe('premier');
    expect(v.map).toBe('split-deck');
    expect(v.players).toHaveLength(10);
    const p0 = v.players.find((p) => p.name === 'Prem0')!;
    expect(p0).toMatchObject({ rating: 1340, placement: null, games: 8, wins: 5 });
    expect(p0.rank?.label).toBe('Planet');
    const p1 = v.players.find((p) => p.name === 'Prem1')!;
    expect(p1.rating).toBeNull();
    expect(p1.rank).toBeNull();
    expect(p1.placement).toEqual({ done: 0, need: 5, unit: 'wins' });
    // team 0 has the placed 1340 player, the rest start at 1000: team 0 is favoured
    expect(v.teamChance[0]).toBeGreaterThan(0.5);
    expect(v.teamChance[0] + v.teamChance[1]).toBeCloseTo(1, 10);
    expect(JSON.stringify(v)).not.toMatch(/"rd"|"vol"/);
  });

  it('Race: every racer gets a chance to finish first (summing to 1)', () => {
    const ps = ['Zip', 'Zap', 'Zop'].map(player);
    s.ranked.save(ps[0].conn.accountId!, 'race', {
      rating: { rating: 1250, rd: 350, vol: 0.06 },
      games: 12,
      wins: 7,
      seasonGames: 12,
      seasonWins: 7,
      lastPlayed: clock,
    });
    const v = buildVersus(
      s.ranked,
      rankedQueue('race')!,
      'race-cliffline',
      ps.map((p, i) => {
        p.conn.playerId = i + 1;
        return { conn: p.conn, team: 0 as const };
      }),
    );
    const sum = v.players.reduce((x, p) => x + (p.firstChance ?? 0), 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(v.players[0].firstChance!).toBeGreaterThan(v.players[1].firstChance!);
    expect(v.players[0].rating).toBe(1250);
    expect(v.players[1].placement).toMatchObject({ done: 0, need: 5, unit: 'races' });
  });
});
