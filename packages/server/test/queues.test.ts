// The queues: Premier's team sizes (3v3 by default, 4v4 / 5v5 when enough search), Premier CS
// (mode vote + map veto, CS kit), multi-search, players-online thresholds with the opening
// hours, the casual queue (mixed picks, bot fill), parties (one team, party rating, rank gap,
// stack penalty), Brawl results in the profile stats and the versus screen's account ids.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { QueueCounts, VersusInfo, VetoView } from '@space-yz/shared';
import { partyRating, STACK_PENALTY } from '@space-yz/shared';
import { createServices, type Services } from '../src/services';
import { parseWindows } from '../src/services/schedule';
import type { Conn } from '../src/game/conn';
import type { GameHub } from '../src/game/hub';
import { Room } from '../src/game/room';
import { BrawlRules } from '../src/game/rules/brawl';
import type { MatchResult } from '../src/game/rules/match';

interface Fake {
  conn: Conn;
  id: number;
  sent: { t: string; [k: string]: unknown }[];
  last(t: string): { t: string; [k: string]: unknown } | undefined;
}

interface FakeRoom {
  opts: Record<string, unknown>;
  code: string;
  joined: [string, number | undefined][];
  bots: (0 | 1 | undefined)[];
  ladder?: string | null;
  ratingScale?: Map<number, number> | null;
  botFill?: unknown;
  teamCounts(): [number, number];
  addMember(name: string, conn: null, o: { team?: 0 | 1 }): void;
}

describe('queues', () => {
  let s: Services;
  let clock: number;
  let rooms: FakeRoom[];
  let n = 0;

  beforeEach(() => {
    clock = new Date(2026, 8, 25, 12, 0).getTime(); // a Friday, noon
    s = createServices({ dbFile: ':memory:', log: () => {}, now: () => clock });
    rooms = [];
    s.queue.hub = {
      conns: new Set(),
      createRoom: (opts: Record<string, unknown>) => {
        const r: FakeRoom = {
          opts,
          code: `R${rooms.length}`,
          joined: [],
          bots: [],
          teamCounts() {
            const c: [number, number] = [0, 0];
            for (const [, t] of this.joined) if (t !== undefined) c[t]++;
            for (const t of this.bots) if (t !== undefined) c[t]++;
            return c;
          },
          addMember(_name, _conn, o) {
            this.bots.push(o.team);
          },
        };
        rooms.push(r);
        return r;
      },
      joinRoom: (c: Conn, room: FakeRoom, team?: number) => {
        room.joined.push([c.name, team]);
        c.roomCode = room.code;
        c.playerId = room.joined.length;
      },
    } as unknown as GameHub;
    s.queue.rand = () => 0;
    s.queue.mapPool = () => ['split-deck', 'kestrel', 'orbital-ring'];
    // (the real race tracks are retired, which closes the Race queue: race-ranked.test.ts)
    s.queue.trackPool = () => ['track-a'];
    s.queue.onlineCount = () => 100;
  });
  afterEach(() => s.close());

  const player = (
    name: string,
    rating?: { ladder: 'premier' | 'premier-cs' | 'duels'; r: number },
  ): Fake => {
    const id = s.accounts.login(`${name}${n++}`).account.id;
    const sent: Fake['sent'] = [];
    const conn = {
      id: 1000 + id,
      name,
      accountId: id,
      roomCode: null,
      playerId: null,
      closed: false,
      helloDone: true,
      rttMs: 20,
      sendJson: (m: { t: string }) => sent.push(m),
    } as unknown as Conn;
    if (rating) {
      const cur = s.ranked.rating(id, rating.ladder);
      s.ranked.save(id, rating.ladder, { ...cur, rating: { ...cur.rating, rating: rating.r } });
    }
    return {
      conn,
      id,
      sent,
      last: (t) => [...sent].reverse().find((m) => m.t === t),
    };
  };
  const many = (k: number, name: string) =>
    Array.from({ length: k }, (_, i) => player(`${name}${i}`));
  const tick = (sec = 1) => {
    clock += sec * 1000;
    s.queue.tick();
  };
  const runVeto = () => {
    for (let i = 0; i < 20 && !rooms.length; i++) tick(15);
  };

  describe('Premier team sizes', () => {
    it('3v3 is the default: 6 searching start after 20 s, not before', () => {
      const ps = many(6, 'Three');
      for (const p of ps) expect(s.queue.set(p.conn, 'premier')).toBeNull();
      tick(19);
      expect(s.queue.vetoing()).toBe(0);
      tick(1);
      expect(s.queue.vetoing()).toBe(6);
      expect((ps[0].last('veto')!.data as VetoView).teamSize).toBe(3);
      runVeto();
      expect(rooms[0].opts).toMatchObject({
        mode: '3v3',
        ranked: true,
        objective: 'bomb',
        loadout: 'lethal',
        ladder: 'premier',
      });
      expect(rooms[0].opts.teamSize).toBeUndefined();
      expect(rooms[0].joined.filter(([, t]) => t === 0).length).toBe(3);
    });

    it('10 searching start a 5v5 at once; 9 play 4v4 after 10 s and one waits', () => {
      for (const p of many(10, 'Ten')) s.queue.set(p.conn, 'premier');
      tick();
      expect(s.queue.vetoing()).toBe(10);
      s.close();
      s = createServices({ dbFile: ':memory:', log: () => {}, now: () => clock });
      s.queue.hub = { conns: new Set(), createRoom: () => null } as unknown as GameHub;
      s.queue.onlineCount = () => 100;
      s.ranked.setThresholds({ premier: 0 });
      for (const p of many(9, 'Nine')) s.queue.set(p.conn, 'premier');
      tick(5);
      expect(s.queue.vetoing()).toBe(0);
      tick(5);
      expect(s.queue.vetoing()).toBe(8);
      expect(s.queue.size('premier')).toBe(1);
    });

    it('the live numbers say which size would form now', () => {
      for (const p of many(8, 'Live')) s.queue.set(p.conn, 'premier');
      const c = s.queue.counts();
      expect(c.ranked.premier).toMatchObject({ searching: 8, open: true, forms: 4 });
      expect(c.ranked['premier-cs'].forms).toBeNull();
      expect(c.online).toBe(100);
    });
  });

  describe('Premier CS', () => {
    it('votes the mode (majority), then bans maps, then plays with the CS kit', () => {
      const ps = many(6, 'Cs');
      for (const p of ps) expect(s.queue.set(p.conn, 'premier-cs')).toBeNull();
      tick(20);
      const v0 = ps[0].last('veto')!.data as VetoView;
      expect(v0).toMatchObject({ phase: 'vote', ladder: 'premier-cs', teamSize: 3 });
      expect(v0.vote!.options).toEqual(['bomb', 'elim']);
      // bans don't count during the vote
      expect(s.queue.ban(ps[0].conn, 'kestrel')).toMatch(/no map veto/);
      for (const [i, p] of ps.entries()) s.queue.vote(p.conn, i < 4 ? 'elim' : 'bomb');
      const v1 = ps[0].last('veto')!.data as VetoView;
      expect(v1.phase).toBe('ban');
      expect(v1.mode).toBe('elim');
      expect(v1.vote).toMatchObject({
        result: 'elim',
        counts: { bomb: 2, elim: 4 },
        yours: 'elim',
      });
      runVeto();
      expect(rooms[0].opts).toMatchObject({
        mode: '3v3',
        objective: 'elim',
        loadout: 'cs',
        ladder: 'premier-cs',
      });
    });

    it('nobody voting: the timer decides (a tie at random)', () => {
      const ps = many(6, 'Quiet');
      for (const p of ps) s.queue.set(p.conn, 'premier-cs');
      tick(20);
      tick(10);
      const v = ps[0].last('veto')!.data as VetoView;
      expect(v.phase).toBe('ban');
      expect(v.mode).toBe('bomb'); // rand() = 0 picks the first of the tied options
    });
  });

  describe('multi-search', () => {
    it('the first match that forms takes you and cancels your other searches', () => {
      const [a, b] = [player('MultiA'), player('MultiB')];
      expect(s.queue.set(a.conn, ['premier', 'duels-1v1', 'race'])).toBeNull();
      expect(a.last('queue')).toMatchObject({ modes: ['premier', 'duels-1v1', 'race'] });
      expect(s.queue.size('premier')).toBe(1);
      expect(s.queue.set(b.conn, 'duels-1v1')).toBeNull();
      tick();
      expect(rooms.length).toBe(1);
      expect(rooms[0].opts).toMatchObject({ mode: '1v1', ladder: 'duels' });
      expect(s.queue.size('premier')).toBe(0);
      expect(s.queue.size('race')).toBe(0);
    });

    it('a closed queue is skipped, the rest are searched', () => {
      s.queue.onlineCount = () => 12;
      const a = player('Skip');
      expect(s.queue.set(a.conn, ['premier', 'duels-2v2'])).toBeNull();
      expect(a.last('queue')).toMatchObject({ modes: ['duels-2v2'] });
      expect(String(a.last('notice')!.msg)).toMatch(/Premier is closed: it opens at 20/);
    });
  });

  describe('opening by players online', () => {
    it('Premier opens at 20 online, Premier CS at 35; Duels and Race always', () => {
      const counts = (): QueueCounts => s.queue.counts();
      s.queue.onlineCount = () => 12;
      expect(counts().ranked.premier).toMatchObject({ open: false, threshold: 20 });
      expect(counts().ranked['premier-cs']).toMatchObject({ open: false, threshold: 35 });
      expect(counts().ranked['duels-1v1'].open).toBe(true);
      expect(counts().ranked.race.open).toBe(true);
      expect(s.queue.set(player('Early').conn, 'premier')).toMatch(
        /opens at 20 players online \(now 12\)/,
      );
      s.queue.onlineCount = () => 20;
      expect(counts().ranked.premier.open).toBe(true);
      expect(counts().ranked['premier-cs'].open).toBe(false);
      // the host changes it
      s.ranked.setThresholds({ 'premier-cs': 10 });
      expect(counts().ranked['premier-cs'].open).toBe(true);
    });

    it('with opening hours too, either rule opens it', () => {
      s.ranked.setSchedule({ mode: 'scheduled', windows: parseWindows('Fri-Sun 18:00-23:00')! });
      s.queue.onlineCount = () => 12;
      expect(s.ranked.queueOpen('premier', 12).open).toBe(false); // noon, few players
      expect(s.ranked.queueOpen('premier', 25).open).toBe(true); // a crowd outside the hours
      clock += 7 * 3600_000; // 19:00: inside the hours
      expect(s.ranked.queueOpen('premier', 3).open).toBe(true);
      // hours only (no player-count rule): the hours decide
      s.ranked.setThresholds({ premier: 0 });
      clock -= 7 * 3600_000;
      expect(s.ranked.queueOpen('premier', 500).open).toBe(false);
    });

    it('searchers are dropped when their queue closes', () => {
      s.queue.onlineCount = () => 30;
      const a = player('Drop');
      expect(s.queue.set(a.conn, 'premier')).toBeNull();
      s.queue.onlineCount = () => 10;
      tick();
      expect(s.queue.size('premier')).toBe(0);
      expect(String(a.last('queue')!.error)).toMatch(/closed/);
    });
  });

  describe('casual queue', () => {
    it('forms the match that suits the most people from mixed picks', () => {
      const a = player('CasA');
      const b = player('CasB');
      const c = player('CasC');
      const d = player('CasD');
      s.queue.setCasual(a.conn, { modes: ['tower', 'bomb'], sizes: ['1v1', '2v2'] });
      s.queue.setCasual(b.conn, { modes: ['bomb'], sizes: ['2v2', '3v3'] });
      s.queue.setCasual(c.conn, { modes: ['bomb', 'elim'], sizes: ['2v2'] });
      s.queue.setCasual(d.conn, { modes: ['bomb', 'brawl'], sizes: ['2v2'] });
      expect(s.queue.casualSize('bomb')).toBe(4);
      tick();
      expect(rooms.length).toBe(1);
      expect(rooms[0].opts).toMatchObject({ mode: '2v2', objective: 'bomb', loadout: 'lethal' });
      expect(rooms[0].opts.ranked).toBeUndefined();
      expect(rooms[0].joined.length).toBe(4);
      expect(rooms[0].bots.length).toBe(0);
    });

    it('bots fill the missing slots after 30 s (casual only)', () => {
      const a = player('Lonely');
      s.queue.setCasual(a.conn, { modes: ['cs'], sizes: ['3v3'] });
      tick(29);
      expect(rooms.length).toBe(0);
      tick(1);
      expect(rooms[0].opts).toMatchObject({ mode: '3v3', objective: 'bomb', loadout: 'cs' });
      expect(rooms[0].bots.length).toBe(5);
      expect(rooms[0].teamCounts()).toEqual([3, 3]);
    });

    it('refuses an empty pick', () => {
      expect(s.queue.setCasual(player('None').conn, { modes: [], sizes: ['1v1'] })).toMatch(/Tick/);
    });
  });

  describe('parties', () => {
    const befriend = (a: Fake, b: Fake) => {
      s.social.op(a.id, 'request', { id: b.id });
      s.social.op(b.id, 'accept', { id: a.id });
    };
    const party = (leader: Fake, ...members: Fake[]) => {
      s.social.connect(leader.conn);
      for (const m of members) {
        s.social.connect(m.conn);
        befriend(leader, m);
        expect(s.parties.op(leader.conn, 'invite', m.id)).toBeNull();
        expect(m.last('socialNotice')).toBeTruthy();
        expect(s.parties.op(m.conn, 'join', leader.id)).toBeNull();
      }
    };

    it('a duo plays Duels 2v2 on one team; only the leader searches', () => {
      const [a, b] = [
        player('Lead', { ladder: 'duels', r: 1600 }),
        player('Mate', { ladder: 'duels', r: 1400 }),
      ];
      party(a, b);
      expect(s.parties.of(a.id)!.members).toEqual([a.id, b.id]);
      expect(b.last('party')).toBeTruthy();
      expect(s.queue.set(b.conn, 'duels-2v2')).toMatch(/leader/);
      // Duels 1v1 and Race are solo only
      expect(s.queue.set(a.conn, 'duels-1v1')).toMatch(/solo/);
      expect(s.queue.set(a.conn, ['duels-1v1', 'duels-2v2'])).toBeNull();
      expect(b.last('queue')).toMatchObject({ modes: ['duels-2v2'], party: true });
      expect(s.queue.size('duels-2v2')).toBe(2);
      const [c, d] = [player('SoloC'), player('SoloD')];
      s.queue.set(c.conn, 'duels-2v2');
      s.queue.set(d.conn, 'duels-2v2');
      tick();
      const r = rooms[0];
      expect(r.opts).toMatchObject({ mode: '2v2', ladder: 'duels' });
      const teamOf = (name: string) => r.joined.find(([x]) => x === name)![1];
      expect(teamOf('Lead')).toBe(teamOf('Mate'));
      expect(teamOf('SoloC')).toBe(teamOf('SoloD'));
      expect(teamOf('SoloC')).not.toBe(teamOf('Lead'));
    });

    it('searches with the party rating (weighted toward the best player)', () => {
      const [a, b] = [
        player('W1', { ladder: 'premier', r: 1500 }),
        player('W2', { ladder: 'premier', r: 1100 }),
      ];
      party(a, b);
      s.queue.set(a.conn, 'premier');
      const entry = (
        s.queue as unknown as {
          entry: (u: unknown, q: unknown) => { rating: number; size: number };
        }
      ).entry;
      const unit = (s.queue as unknown as { waiting: Map<string, unknown> }).waiting
        .values()
        .next().value;
      const q = { ladder: 'premier' };
      const e = entry.call(s.queue, unit, q);
      expect(e.size).toBe(2);
      expect(e.rating).toBeCloseTo(partyRating([1500, 1100]), 6);
    });

    it('a small party more than 600 apart may not queue ranked; a full team may, at 75 %', () => {
      const [a, b] = [
        player('Gap1', { ladder: 'premier', r: 1000 }),
        player('Gap2', { ladder: 'premier', r: 1700 }),
      ];
      party(a, b);
      expect(s.queue.set(a.conn, 'premier')).toMatch(/apart/);
      const c = player('Gap3', { ladder: 'premier', r: 1100 });
      party(a, c);
      // a full 3-stack with a 700 gap: allowed, only as 3v3, reduced rating
      expect(s.queue.set(a.conn, 'premier')).toBeNull();
      for (const p of many(3, 'Opp')) s.queue.set(p.conn, 'premier');
      tick(20);
      runVeto();
      expect(rooms[0].opts.mode).toBe('3v3');
      const scale = rooms[0].ratingScale!;
      expect(scale.get(a.id)).toBe(STACK_PENALTY);
      expect(scale.get(c.id)).toBe(STACK_PENALTY);
    });

    it('the stack penalty scales the recorded rating change', () => {
      const [a, b] = [player('Sc1'), player('Sc2')];
      const result: MatchResult = {
        mode: '1v1',
        winner: 0,
        reason: 'x',
        scores: [5, 0],
        rounds: 5,
        durationSec: 100,
        players: [
          {
            id: 1,
            accountId: a.id,
            team: 0,
            bot: false,
            kills: 1,
            deaths: 0,
            teamKills: 0,
            damage: 1,
          },
          {
            id: 2,
            accountId: b.id,
            team: 1,
            bot: false,
            kills: 0,
            deaths: 1,
            teamKills: 0,
            damage: 0,
          },
        ],
        leavers: [],
      };
      const full = s.ranked.recordMatch({
        mode: '1v1',
        ranked: true,
        map: 'm',
        result,
        names: {},
        ladder: 'premier',
      });
      const [c, d] = [player('Sc3'), player('Sc4')];
      result.players[0].accountId = c.id;
      result.players[1].accountId = d.id;
      const cut = s.ranked.recordMatch({
        mode: '1v1',
        ranked: true,
        map: 'm',
        result,
        names: {},
        ladder: 'premier',
        scale: new Map([[c.id, STACK_PENALTY]]),
      });
      expect(cut.get(c.id)).toBeCloseTo(full.get(a.id)! * STACK_PENALTY, 6);
      expect(cut.get(d.id)).toBeCloseTo(full.get(b.id)!, 6);
      expect(s.ranked.rating(c.id, 'premier').rating.rating).toBeCloseTo(1000 + cut.get(c.id)!, 6);
    });

    it('someone leaving the party stops its search', () => {
      const [a, b] = [player('Stop1'), player('Stop2')];
      party(a, b);
      s.queue.setCasual(a.conn, { modes: ['tower'], sizes: ['2v2'] });
      expect(s.queue.casualSize()).toBe(2);
      expect(s.parties.op(b.conn, 'leave')).toBeNull();
      expect(s.queue.casualSize()).toBe(0);
      expect(String(a.last('notice')!.msg)).toMatch(/Search stopped/);
    });
  });

  it('the versus screen carries account ids (names open profiles)', () => {
    const [a, b] = [player('VsA'), player('VsB')];
    s.queue.set(a.conn, 'duels-1v1');
    s.queue.set(b.conn, 'duels-1v1');
    tick();
    const v = a.last('versus')!.data as VersusInfo;
    expect(v.players.map((p) => p.accountId).sort()).toEqual([a.id, b.id].sort());
  });
});

describe('Brawl results', () => {
  it("are recorded with each player's stats (objective brawl)", () => {
    const s = createServices({ dbFile: ':memory:', log: () => {} });
    const id = s.accounts.login('Brawler').account.id;
    const room = new Room({ code: 'BRAWL1', mode: 'brawl', map: 'split-deck' });
    const rules = new BrawlRules('brawl');
    room.rules = rules;
    rules.setup(room);
    const conn = { name: 'Brawler', accountId: id, sendJson: () => {} } as unknown as Conn;
    const me = room.addMember('Brawler', conn, { accountId: id, team: 0 });
    room.addMember('Bot 1', null, { team: 1 });
    room.world.players.find((p) => p.id === me.id)!.kills = 7;
    s.hub.onBrawlEnd!(room, rules.result(room), rules);
    const stats = s.profiles.stats(id);
    expect(stats.byMode.brawl?.games).toBe(1);
    expect(stats.kills).toBe(7);
    const p = s.ranked.profile(id)!;
    expect(p.recent[0]).toMatchObject({ objective: 'brawl', ranked: false, kills: 7 });
    s.close();
  });
});
