// Wires accounts, ranked, matchmaking, reports and anti-grief into the game hub, and serves
// the small JSON API (leaderboards, profiles).
import type http from 'node:http';
import type { LadderId } from '@space-yz/shared';
import { LADDER_IDS, LADDERS, ladderForMode, raceMaps } from '@space-yz/shared';
import type { HubServices } from '../game/hub';
import { openDb, type Db } from './db';
import { Accounts } from './accounts';
import { RankedStore } from './ranked';
import { RankedQueue } from './queue';

export interface Services {
  db: Db;
  accounts: Accounts;
  ranked: RankedStore;
  queue: RankedQueue;
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
}): Services => {
  const log = opts.log ?? ((m: string) => console.log(m));
  const now = opts.now ?? Date.now;
  const db = openDb(opts.dbFile);
  const accounts = new Accounts(db, now);
  const ranked = new RankedStore(db, now);
  const queue = new RankedQueue(ranked, now, log);

  const hub: HubServices = {
    login: (_conn, name, token) => {
      const r = accounts.login(name, token);
      if (r.created) log(`New player: ${r.account.name} (#${r.account.id})`);
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
    veto: (conn, map) => void queue.ban(conn, map),
    onHello: (conn) => conn.sendJson({ t: 'rankedInfo', data: ranked.info() }),
    onDisconnect: (_h, conn) => queue.remove(conn),
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
      const deltas = ranked.recordMatch({
        mode: room.mode,
        ranked: room.ranked,
        map: room.map,
        result,
        names,
      });
      const ladder = room.ranked ? ladderForMode(result.mode) : null;
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
        // public view: no moderation details
        return json(res, 200, { ...p, bannedUntil: undefined, warnings: undefined });
      }
      case '/api/stats':
        return json(res, 200, { players: accounts.count(), queued: queue.size() });
      default:
        return json(res, 404, { error: 'not found' });
    }
  };

  return {
    db,
    accounts,
    ranked,
    queue,
    hub,
    broadcastRankedInfo: () => {
      const msg = { t: 'rankedInfo' as const, data: ranked.info() };
      for (const c of queue.hub?.conns ?? []) if (c.helloDone) c.sendJson(msg);
    },
    api,
    close: () => {
      queue.stop();
      db.close();
    },
  };
};
