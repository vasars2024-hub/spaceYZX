// Wires accounts, ranked, matchmaking, reports and anti-grief into the game hub, and serves
// the small JSON API (leaderboards, profiles).
import type http from 'node:http';
import type { LadderMode } from '@space-yz/shared';
import { LADDER_MODES } from '@space-yz/shared';
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
    queue: (h, conn, mode, opts) => {
      queue.start(h);
      queue.set(conn, mode === null ? null : (mode as LadderMode), opts?.loadout);
    },
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
      for (const m of room.humans) {
        if (!m.conn || m.accountId === null) continue;
        const profile = ranked.profile(m.accountId);
        m.conn.sendJson({ t: 'profile', data: profile });
        const d = deltas.get(m.accountId);
        // (3v3 is casual only: it has no ladder, and no rating change to show)
        const tier = result.mode === '3v3' ? undefined : profile?.modes[result.mode]?.tier.label;
        if (d !== undefined)
          m.conn.sendJson({
            t: 'notice',
            msg: `Rating ${d >= 0 ? '+' : ''}${Math.round(d)}${tier ? ` · ${result.mode}: ${tier}` : ''}`,
          });
      }
    },
  };

  // Arena 1v1: its own ladder ('arena' in profiles and leaderboards)
  hub.onArenaEnd = (room, result) => {
    const deltas = ranked.recordArena({ ranked: room.ranked, map: room.map, result });
    for (const m of room.humans) {
      if (!m.conn || m.accountId === null) continue;
      const profile = ranked.profile(m.accountId);
      m.conn.sendJson({ t: 'profile', data: profile });
      const d = deltas.get(m.accountId);
      const tier = profile?.modes.arena?.tier.label;
      if (d !== undefined)
        m.conn.sendJson({
          t: 'notice',
          msg: `Arena rating ${d >= 0 ? '+' : ''}${Math.round(d)}${tier ? ` · Arena: ${tier}` : ''}`,
        });
    }
  };

  const api = (req: http.IncomingMessage, res: http.ServerResponse): boolean => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/api/')) return false;
    if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
    switch (url.pathname) {
      case '/api/leaderboard': {
        const which = url.searchParams.get('mode') ?? 'global';
        if (which !== 'global' && !LADDER_MODES.includes(which as LadderMode))
          return json(res, 400, { error: 'unknown mode' });
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));
        return json(res, 200, {
          mode: which,
          rows: ranked.leaderboard(which as LadderMode | 'global', limit),
        });
      }
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
    api,
    close: () => {
      queue.stop();
      db.close();
    },
  };
};
