// Wires accounts, ranked, matchmaking (ranked + casual queues), parties, reports and
// anti-grief into the game hub, and serves the small JSON API (leaderboards, profiles, match
// details, player search).
import type http from 'node:http';
import type { LadderId, PartyOp } from '@space-yz/shared';
import { LADDER_IDS, LADDERS, ladderForMode, raceMaps } from '@space-yz/shared';
import type { HubServices } from '../game/hub';
import { openDb, type Db } from './db';
import { Accounts } from './accounts';
import { RankedStore } from './ranked';
import { RankedQueue } from './queue';
import { Social } from './social';
import { Parties } from './party';
import { ProfileStore } from './profiles';
import { accountHandler } from './account-handler';
import type { ScryptCost } from './passwords';

export interface Services {
  db: Db;
  accounts: Accounts;
  ranked: RankedStore;
  queue: RankedQueue;
  social: Social;
  parties: Parties;
  profiles: ProfileStore;
  hub: HubServices;
  /** Tell every connected player the season / Premier hours changed. */
  broadcastRankedInfo(): void;
  api: (req: http.IncomingMessage, res: http.ServerResponse) => boolean;
  close(): void;
}

const json = (res: http.ServerResponse, status: number, body: unknown): true => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
  return true;
};

export const createServices = (opts: {
  dbFile: string;
  log?: (msg: string) => void;
  now?: () => number;
  /** password hashing cost (tests use a cheap one) */
  scrypt?: ScryptCost;
}): Services => {
  const log = opts.log ?? ((m: string) => console.log(m));
  const now = opts.now ?? Date.now;
  const db = openDb(opts.dbFile);
  const accounts = new Accounts(db, now, { cost: opts.scrypt });
  const ranked = new RankedStore(db, now);
  const queue = new RankedQueue(ranked, now, log);
  const social = new Social(db, accounts, () => queue.hub, now);
  const parties = new Parties(social, accounts, now, log);
  queue.parties = parties;
  parties.searchOf = (p) => queue.partySearch(p);
  parties.onChange = (p, why) => queue.partyChanged(p, why);
  const profiles = new ProfileStore(db);
  const accountMsgs = accountHandler({ accounts, ranked, queue, social, log });

  const hub: HubServices = {
    login: (conn, name, token) => {
      // (a hello again: renamed, or switched account) — friends see the new state
      social.disconnect(conn);
      const r = accounts.login(name, token);
      if (r.created) log(`New player: ${r.account.name} (#${r.account.id})`);
      accountMsgs.sessionOf.set(conn, r.token);
      return {
        name: r.account.name,
        accountId: r.account.id,
        token: r.token,
        account: ranked.profile(r.account.id),
      };
    },
    profile: (conn) => (conn.accountId !== null ? ranked.profile(conn.accountId) : null),
    queue: (h, conn, id) => {
      queue.start(h);
      queue.set(conn, id);
    },
    casualQueue: (h, conn, pick) => {
      queue.start(h);
      queue.setCasual(conn, pick);
    },
    veto: (conn, map) => void queue.ban(conn, map),
    modeVote: (conn, mode) => void queue.vote(conn, mode),
    party: (h, conn, op, id) => {
      queue.start(h);
      const err = parties.op(conn, op as PartyOp, id);
      if (err) conn.sendJson({ t: 'notice', msg: err });
    },
    onHello: (conn, h) => {
      queue.start(h);
      conn.sendJson({ t: 'rankedInfo', data: ranked.info() });
      queue.pushCounts(conn);
      if (conn.accountId === null) return;
      social.connect(conn);
      const me = accounts.me(conn.accountId);
      if (me) conn.sendJson({ t: 'me', data: me });
      conn.sendJson({ t: 'social', data: social.state(conn.accountId) });
      parties.hello(conn);
    },
    onDisconnect: (_h, conn) => {
      queue.remove(conn);
      social.disconnect(conn);
      // (their last tab closed: out of the party)
      parties.disconnected(conn.accountId);
    },
    onSocial: (h, conn, msg) => accountMsgs.handle(h, conn, msg),
    blocked: (to, from) => social.blocks(to, from),
    onReport: (conn, player, reason, room) => {
      const m = room.members.get(player);
      if (!m || m.conn === conn) return;
      ranked.report({
        reporterId: conn.accountId,
        reportedId: m.accountId,
        reportedName: m.name,
        reason: reason || 'no reason given',
        room: room.code,
      });
      log(`Report: ${conn.name} reported ${m.name} in room ${room.code}`);
    },
    onGrief: (conn, action, reason, room) => {
      if (conn.accountId === null) return;
      if (action === 'warn') ranked.warn(conn.accountId);
      else if (room.ranked) {
        const until = ranked.griefKick(conn.accountId, reason);
        conn.sendJson({
          t: 'notice',
          msg: `${reason} This counts as a loss, and you can't play ranked for ${Math.ceil((until - now()) / 60000)} minute(s).`,
        });
      }
    },
    onMatchEnd: (room, result) => {
      const names: Record<number, string> = {};
      for (const m of room.members.values()) names[m.id] = m.name;
      const ladder = room.ranked ? (room.ladder ?? ladderForMode(result.mode)) : null;
      const deltas = ranked.recordMatch({
        mode: room.mode,
        ranked: room.ranked,
        map: room.map,
        result,
        names,
        ladder,
        scale: room.ratingScale ?? undefined,
      });
      for (const m of room.humans) {
        if (!m.conn || m.accountId === null) continue;
        const profile = ranked.profile(m.accountId);
        m.conn.sendJson({ t: 'profile', data: profile });
        const d = deltas.get(m.accountId);
        const st = ladder ? profile?.ladders[ladder] : undefined;
        if (d === undefined || !st) continue;
        m.conn.sendJson({
          t: 'notice',
          msg:
            // Premier hides the rating until 5 placement wins
            st.rating === null
              ? `${st.name} placement: ${st.placement.done}/${st.placement.need} ${st.placement.unit}`
              : `${st.name} rating ${d >= 0 ? '+' : ''}${Math.round(d)} · ${st.rating}${st.rank ? ` ${st.rank.label}` : ''}`,
        });
      }
    },
  };

  // Brawl is casual: every finished Brawl goes into the match history with each player's
  // stats (profiles: kills, accuracy, time played, wins as 'brawl')
  hub.onBrawlEnd = (room, _result, rules) => {
    const names: Record<number, string> = {};
    for (const m of room.members.values()) names[m.id] = m.name;
    try {
      ranked.recordMatch({
        mode: room.mode,
        ranked: false,
        map: room.map,
        result: rules.matchResult(room),
        names,
      });
    } catch (err) {
      log(`Brawl result not stored: ${String(err)}`);
      return;
    }
    for (const m of room.humans)
      if (m.conn && m.accountId !== null)
        m.conn.sendJson({ t: 'profile', data: ranked.profile(m.accountId) });
  };

  // Arena 1v1 is casual only now: its matches are just recorded in the history
  hub.onArenaEnd = (room, result) => {
    ranked.recordArena({ map: room.map, result });
    for (const m of room.humans)
      if (m.conn && m.accountId !== null)
        m.conn.sendJson({ t: 'profile', data: ranked.profile(m.accountId) });
  };

  // Races: every online race is stored (personal bests); ranked ones (the Race queue) also
  // update the Race ladder. Each racer hears their rating change / best time.
  hub.onRaceEnd = (room, record) => {
    const roster = room.ranked ? queue.takeRaceRoster(room.code) : undefined;
    const notes = ranked.recordRace({ ranked: room.ranked, record, roster });
    for (const m of room.humans) {
      if (!m.conn || m.accountId === null) continue;
      const n = notes.get(m.accountId);
      if (!n) continue;
      m.conn.sendJson({ t: 'raceRating', data: n });
      m.conn.sendJson({ t: 'profile', data: ranked.profile(m.accountId) });
    }
    // queued racers who left before the start are told too, if still connected
    for (const r of roster ?? []) {
      if (room.humans.some((m) => m.accountId === r.accountId)) continue;
      const c = [...(queue.hub?.conns ?? [])].find((x) => x.accountId === r.accountId);
      const n = notes.get(r.accountId);
      if (c && n && n.delta !== null)
        c.sendJson({
          t: 'notice',
          msg: `You left a ranked race: Race rating ${n.delta >= 0 ? '+' : ''}${Math.round(n.delta)}`,
        });
    }
  };

  const api = (req: http.IncomingMessage, res: http.ServerResponse): boolean => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/api/')) return false;
    if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
    switch (url.pathname) {
      case '/api/leaderboard': {
        // ?mode=premier|duels (&season=N: a finished Premier season's final standings)
        const which = url.searchParams.get('mode') ?? 'premier';
        if (!LADDER_IDS.includes(which as LadderId))
          return json(res, 400, { error: 'unknown ladder' });
        const ladder = which as LadderId;
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));
        const current = ranked.season();
        const sp = Number(url.searchParams.get('season'));
        const season =
          LADDERS[ladder].seasonal && Number.isInteger(sp) && sp >= 1 && sp <= current
            ? sp
            : current;
        return json(res, 200, {
          mode: ladder,
          season: LADDERS[ladder].seasonal ? season : null,
          currentSeason: current,
          rows: ranked.leaderboard(ladder, limit, season),
        });
      }
      case '/api/race-times': {
        // ?track=ID: fastest times on a race track, one per player
        const track = url.searchParams.get('track') ?? '';
        if (!raceMaps().some((m) => m.id === track))
          return json(res, 400, { error: 'unknown track' });
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));
        return json(res, 200, { track, rows: ranked.trackLeaderboard(track, limit) });
      }
      case '/api/ranked':
        return json(res, 200, ranked.info());
      case '/api/profile': {
        const id = Number(url.searchParams.get('id'));
        const p = Number.isInteger(id) ? ranked.profile(id) : null;
        if (!p) return json(res, 404, { error: 'no such player' });
        // public view: no moderation details; looks, join date and lifetime stats
        return json(res, 200, {
          ...p,
          bannedUntil: undefined,
          warnings: undefined,
          card: profiles.card(id),
          stats: profiles.stats(id),
        });
      }
      case '/api/match': {
        // one recorded match with every player's line (the profile's match detail)
        const id = Number(url.searchParams.get('id'));
        const m = Number.isInteger(id) && id > 0 ? profiles.match(id) : null;
        if (!m) return json(res, 404, { error: 'no such match' });
        return json(res, 200, m);
      }
      case '/api/players': {
        // ?q=name: find players (friend search)
        const q = (url.searchParams.get('q') ?? '').slice(0, 32);
        return json(res, 200, { rows: accounts.search(q, 20) });
      }
      case '/api/stats':
        return json(res, 200, { players: accounts.count(), queued: queue.size() });
      case '/api/queues':
        // the live queue numbers the menus show (players online, searching per mode)
        return json(res, 200, queue.counts());
      default:
        return json(res, 404, { error: 'not found' });
    }
  };

  return {
    db,
    accounts,
    ranked,
    queue,
    social,
    parties,
    profiles,
    hub,
    broadcastRankedInfo: () => {
      const msg = { t: 'rankedInfo' as const, data: ranked.info() };
      for (const c of queue.hub?.conns ?? []) if (c.helloDone) c.sendJson(msg);
    },
    api,
    close: () => {
      queue.stop();
      social.stop();
      db.close();
    },
  };
};
