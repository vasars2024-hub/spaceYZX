// Ranked matchmaking: one queue per ranked queue (rating/ladders.ts RANKED_QUEUES — Premier,
// Duels 1v1, Duels 2v2). Every second it groups players by their ladder rating (window widens
// the longer you wait, similar ping preferred, teams balanced by rating).
// - Duels: the room starts right away on the default match map (Tower rules).
// - Premier: 5v5 (4v4 after a long wait with few searching), then a map veto (the teams take
//   turns banning from every competitive map with bomb sites until one is left), then the
//   room starts on that map with Bomb rules. Premier can be closed outside its opening hours.
// Solo queue only (there is no party system).
import type {
  QueueEntry,
  RankedQueueDef,
  RankedQueueId,
  VetoState,
  VetoView,
} from '@space-yz/shared';
import {
  createVeto,
  DEFAULT_MATCH_MAP,
  findMatches,
  MAPS,
  mapDef,
  RANKED_QUEUES,
  rankedQueue,
  VETO_BAN_SEC,
  vetoBan,
  vetoTick,
} from '@space-yz/shared';
import type { Conn } from '../game/conn';
import type { GameHub } from '../game/hub';
import type { RankedStore } from './ranked';

export const RANKED_MAP = DEFAULT_MATCH_MAP();

/**
 * Premier's veto pool: every competitive map with bomb sites (new maps join by themselves),
 * except small maps that opt out (MapInfo `premier: false`, e.g. Sakura Hold).
 */
export const premierMapPool = (): string[] =>
  MAPS.filter(
    (m) =>
      m.competitive && !m.arena && m.premier !== false && (mapDef(m.id).bombSites?.length ?? 0) > 0,
  ).map((m) => m.id);

interface Waiting {
  conn: Conn;
  queue: RankedQueueDef;
  entry: QueueEntry;
}

/** A Premier match being set up: the teams are known, the map veto is running. */
interface PendingMatch {
  queue: RankedQueueDef;
  teams: [Waiting[], Waiting[]];
  teamSize: number;
  veto: VetoState;
}

export class RankedQueue {
  private waiting = new Map<Conn, Waiting>();
  private pending = new Set<PendingMatch>();
  private timer: NodeJS.Timeout | null = null;
  hub: GameHub | null = null;
  enabled = true;
  matchesMade = 0;
  /** seconds per map ban (tests shorten it) */
  vetoBanMs = VETO_BAN_SEC * 1000;
  /** random numbers for timed-out bans (tests make it predictable) */
  rand: () => number = Math.random;
  /** the veto's maps (tests may use a fixed pool) */
  mapPool: () => string[] = premierMapPool;

  constructor(
    private ranked: RankedStore,
    private now: () => number = Date.now,
    /** the host log: who joins / leaves / is refused, and the matches made */
    private log: (msg: string) => void = () => {},
  ) {}

  start(hub: GameHub): void {
    this.hub = hub;
    this.timer ??= setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.waiting.clear();
    this.pending.clear();
  }

  size(queue?: RankedQueueId): number {
    let n = 0;
    for (const w of this.waiting.values()) if (!queue || w.queue.id === queue) n++;
    return n;
  }

  /** Players in a map veto right now. */
  vetoing(): number {
    let n = 0;
    for (const p of this.pending) n += p.teams[0].length + p.teams[1].length;
    return n;
  }

  private pendingOf(conn: Conn): PendingMatch | undefined {
    for (const p of this.pending) if (p.teams.some((t) => t.some((w) => w.conn === conn))) return p;
    return undefined;
  }

  /** Join (queue id) or leave (null) the queue. Returns an error message, or null. */
  set(conn: Conn, queueId: string | null): string | null {
    const inVeto = this.pendingOf(conn);
    if (queueId === null) {
      if (inVeto) this.cancelVeto(inVeto, conn, 'left the map veto');
      if (this.waiting.delete(conn)) this.log(`Ranked: ${conn.name} stopped searching`);
      this.status(conn);
      return null;
    }
    const q = rankedQueue(queueId);
    let err: string | null = null;
    if (!this.enabled) err = 'Ranked is turned off on this server right now.';
    else if (!q) err = 'Unknown ranked queue.';
    else if (conn.accountId === null) err = 'Ranked needs an account — reconnect and try again.';
    else if (conn.roomCode) err = 'Leave your room first.';
    else if (inVeto) err = 'You are in a map veto.';
    else if (
      [...this.waiting.values()].some(
        (w) => w.conn !== conn && w.entry.id === String(conn.accountId),
      )
    )
      // two tabs / windows of one browser share one account: it can't play itself
      err =
        'This account is already searching in another tab or window. Your opponent needs their own device, or a private / incognito window.';
    else if (q.ladder === 'premier' && !this.ranked.premierStatus().open)
      err = 'Premier is closed right now — see its opening hours.';
    else {
      const ban = this.ranked.bannedUntil(conn.accountId);
      if (ban)
        err = `You are banned from ranked for ${Math.ceil((ban - this.now()) / 60000)} more minute(s).`;
    }
    if (err || !q) {
      err ??= 'Unknown ranked queue.';
      this.log(`Ranked: ${conn.name} can't search ${String(queueId)}: ${err}`);
      conn.sendJson({ t: 'queue', mode: null, waitSec: 0, searching: this.size(), error: err });
      return err;
    }
    const r = this.ranked.rating(conn.accountId!, q.ladder);
    this.log(
      `Ranked: ${conn.name} (#${conn.accountId}) searching ${q.id} · ${this.size(q.id) + (this.waiting.get(conn)?.queue.id === q.id ? 0 : 1)} searching`,
    );
    this.waiting.set(conn, {
      conn,
      queue: q,
      entry: {
        id: String(conn.accountId),
        rating: r.rating.rating,
        pingMs: conn.rttMs,
        joinedAtMs: this.now(),
      },
    });
    this.status(conn);
    return null;
  }

  remove(conn: Conn): void {
    this.waiting.delete(conn);
    const p = this.pendingOf(conn);
    if (p) this.cancelVeto(p, conn, 'disconnected');
  }

  /** A player bans a map in their Premier veto. Returns an error message, or null. */
  ban(conn: Conn, map: string): string | null {
    const p = this.pendingOf(conn);
    if (!p) return 'There is no map veto.';
    const team = p.teams[0].some((w) => w.conn === conn) ? 0 : 1;
    const err = vetoBan(p.veto, team, String(map), this.now());
    if (err) conn.sendJson({ t: 'notice', msg: err });
    else {
      this.log(`Ranked: ${conn.name} banned ${map}`);
      this.afterVetoChange(p);
    }
    return err;
  }

  private status(conn: Conn): void {
    const w = this.waiting.get(conn);
    conn.sendJson({
      t: 'queue',
      mode: w?.queue.id ?? null,
      waitSec: w ? Math.floor((this.now() - w.entry.joinedAtMs) / 1000) : 0,
      searching: w ? this.size(w.queue.id) : this.size(),
    });
  }

  tick(): void {
    const hub = this.hub;
    if (!hub) return;
    const premierOpen = this.ranked.premierStatus().open;
    // drop players who disconnected or joined a room meanwhile (and Premier when it closes)
    for (const [conn, w] of this.waiting)
      if (conn.closed || conn.roomCode) {
        this.waiting.delete(conn);
        this.log(
          `Ranked: ${conn.name} left the queue (${conn.closed ? 'disconnected' : 'joined a room'})`,
        );
      } else if (w.queue.ladder === 'premier' && !premierOpen) {
        this.waiting.delete(conn);
        conn.sendJson({
          t: 'queue',
          mode: null,
          waitSec: 0,
          searching: 0,
          error: 'Premier just closed for today — see its opening hours.',
        });
      } else w.entry.pingMs = conn.rttMs;
    const now = this.now();
    for (const q of RANKED_QUEUES) {
      const list = [...this.waiting.values()].filter((w) => w.queue.id === q.id);
      if (!list.length) continue;
      const byId = (id: string) => list.find((w) => w.entry.id === id)!;
      const res = findMatches(
        list.map((w) => w.entry),
        now,
        q.mode,
      );
      const found = res.matches.map((m) => ({ m, size: 0 }));
      // few searching: a smaller match once the longest waiter has waited long enough
      const small = q.smaller;
      if (
        small &&
        res.remaining.length >= small.teamSize * 2 &&
        now - Math.min(...res.remaining.map((e) => e.joinedAtMs)) >= small.afterSec * 1000
      )
        for (const m of findMatches(res.remaining, now, q.mode, { teamSize: small.teamSize })
          .matches)
          found.push({ m, size: small.teamSize });
      for (const { m, size } of found) {
        const teams = m.teams.map((t) => t.map(byId)) as [Waiting[], Waiting[]];
        for (const t of teams) for (const w of t) this.waiting.delete(w.conn);
        if (q.veto) this.startVeto(q, teams, size || teams[0].length);
        else this.startRoom(q, teams, RANKED_MAP, 0);
      }
    }
    for (const p of [...this.pending]) {
      // someone vanished or joined a room meanwhile: the match is off
      const gone = p.teams.flat().find((w) => w.conn.closed || w.conn.roomCode);
      if (gone) {
        this.cancelVeto(p, gone.conn, gone.conn.closed ? 'disconnected' : 'joined a room');
        continue;
      }
      if (vetoTick(p.veto, now, this.rand)) this.afterVetoChange(p);
      else this.sendVeto(p);
    }
    for (const conn of this.waiting.keys()) this.status(conn);
  }

  private startVeto(q: RankedQueueDef, teams: [Waiting[], Waiting[]], teamSize: number): void {
    const p: PendingMatch = {
      queue: q,
      teams,
      teamSize,
      veto: createVeto(this.mapPool(), this.now(), { banMs: this.vetoBanMs }),
    };
    this.pending.add(p);
    this.log(
      `Ranked ${q.id} ${teamSize}v${teamSize} found: ${teams.map((t) => t.map((w) => w.conn.name).join(' + ')).join(' vs ')} · map veto`,
    );
    this.afterVetoChange(p);
  }

  private afterVetoChange(p: PendingMatch): void {
    this.sendVeto(p);
    if (p.veto.picked === null) return;
    this.pending.delete(p);
    this.startRoom(p.queue, p.teams, p.veto.picked, p.teamSize);
  }

  private view(p: PendingMatch, team: 0 | 1): VetoView {
    return {
      maps: p.veto.maps,
      banned: p.veto.banned,
      turn: p.veto.turn,
      yourTeam: team,
      secondsLeft: Math.max(0, Math.ceil((p.veto.turnEndsMs - this.now()) / 1000)),
      picked: p.veto.picked,
      teams: [p.teams[0].map((w) => w.conn.name), p.teams[1].map((w) => w.conn.name)],
      teamSize: p.teamSize,
    };
  }

  private sendVeto(p: PendingMatch): void {
    p.teams.forEach((t, team) => {
      const data = this.view(p, team as 0 | 1);
      for (const w of t) w.conn.sendJson({ t: 'veto', data });
    });
  }

  /** Someone left during the veto: the others go back to searching (keeping their wait). */
  private cancelVeto(p: PendingMatch, by: Conn, why: string): void {
    if (!this.pending.delete(p)) return;
    this.log(`Ranked: map veto cancelled — ${by.name} ${why}`);
    for (const w of p.teams.flat()) {
      if (w.conn.closed) continue;
      w.conn.sendJson({ t: 'veto', data: null });
      if (w.conn === by) continue;
      w.conn.sendJson({ t: 'notice', msg: `${by.name} left the map veto — back to searching.` });
      if (!w.conn.roomCode) this.waiting.set(w.conn, w);
      this.status(w.conn);
    }
  }

  private startRoom(
    q: RankedQueueDef,
    teams: [Waiting[], Waiting[]],
    map: string,
    teamSize: number,
  ): void {
    const hub = this.hub;
    if (!hub) return;
    const room = hub.createRoom({
      mode: q.mode,
      map,
      ranked: true,
      objective: q.objective,
      loadout: 'lethal',
      teamSize: teamSize || undefined,
    });
    if (!room) {
      this.log(`Ranked: couldn't open a room for a ${q.id} match (server full?)`);
      for (const t of teams)
        for (const w of t)
          w.conn.sendJson({
            t: 'queue',
            mode: null,
            waitSec: 0,
            searching: 0,
            error: 'The server is full right now — try again in a minute.',
          });
      return;
    }
    this.matchesMade++;
    this.log(
      `Ranked ${q.id} match on ${map}: ${teams.map((t) => t.map((w) => w.conn.name).join(' + ')).join(' vs ')}`,
    );
    teams.forEach((members, team) =>
      members.forEach((w) => hub.joinRoom(w.conn, room, team as 0 | 1)),
    );
  }
}
