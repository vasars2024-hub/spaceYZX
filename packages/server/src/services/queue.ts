// Ranked matchmaking queue: one queue per mode. Every second it pairs players by rating
// (window widens the longer you wait, similar ping preferred, teams balanced by rating) and
// starts a ranked room on Kestrel.
import type { RankedMode, QueueEntry } from '@space-yz/shared';
import { findMatches, RANKED_MODES } from '@space-yz/shared';
import type { Conn } from '../game/conn';
import type { GameHub } from '../game/hub';
import type { RankedStore } from './ranked';

export const RANKED_MAP = 'kestrel';

interface Waiting {
  conn: Conn;
  mode: RankedMode;
  entry: QueueEntry;
}

export class RankedQueue {
  private waiting = new Map<Conn, Waiting>();
  private timer: NodeJS.Timeout | null = null;
  hub: GameHub | null = null;
  enabled = true;
  matchesMade = 0;

  constructor(
    private ranked: RankedStore,
    private now: () => number = Date.now,
  ) {}

  start(hub: GameHub): void {
    this.hub = hub;
    this.timer ??= setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.waiting.clear();
  }

  size(mode?: RankedMode): number {
    let n = 0;
    for (const w of this.waiting.values()) if (!mode || w.mode === mode) n++;
    return n;
  }

  /** Join (mode) or leave (null) the queue. Returns an error message, or null. */
  set(conn: Conn, mode: RankedMode | null): string | null {
    if (mode === null) {
      this.waiting.delete(conn);
      this.status(conn);
      return null;
    }
    let err: string | null = null;
    if (!this.enabled) err = 'Ranked is turned off on this server right now.';
    else if (!RANKED_MODES.includes(mode)) err = 'Unknown mode.';
    else if (conn.accountId === null) err = 'Ranked needs an account — reconnect and try again.';
    else if (conn.roomCode) err = 'Leave your room first.';
    else {
      const ban = this.ranked.bannedUntil(conn.accountId);
      if (ban)
        err = `You are banned from ranked for ${Math.ceil((ban - this.now()) / 60000)} more minute(s).`;
    }
    if (err) {
      conn.sendJson({ t: 'queue', mode: null, waitSec: 0, searching: this.size(), error: err });
      return err;
    }
    const r = this.ranked.rating(conn.accountId!, mode);
    this.waiting.set(conn, {
      conn,
      mode,
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
  }

  private status(conn: Conn): void {
    const w = this.waiting.get(conn);
    conn.sendJson({
      t: 'queue',
      mode: w?.mode ?? null,
      waitSec: w ? Math.floor((this.now() - w.entry.joinedAtMs) / 1000) : 0,
      searching: w ? this.size(w.mode) : this.size(),
    });
  }

  tick(): void {
    const hub = this.hub;
    if (!hub) return;
    // drop players who disconnected or joined a room meanwhile
    for (const [conn, w] of this.waiting)
      if (conn.closed || conn.roomCode) this.waiting.delete(conn);
      else w.entry.pingMs = conn.rttMs;
    const now = this.now();
    for (const mode of RANKED_MODES) {
      const list = [...this.waiting.values()].filter((w) => w.mode === mode);
      if (!list.length) continue;
      const res = findMatches(
        list.map((w) => w.entry),
        now,
        mode,
      );
      for (const match of res.matches) {
        const byId = (id: string) => list.find((w) => w.entry.id === id)!;
        const teams = match.teams.map((t) => t.map(byId));
        const room = hub.createRoom({ mode, map: RANKED_MAP, ranked: true });
        if (!room) continue;
        this.matchesMade++;
        teams.forEach((members, team) =>
          members.forEach((w) => {
            this.waiting.delete(w.conn);
            hub.joinRoom(w.conn, room, team as 0 | 1);
          }),
        );
      }
    }
    for (const conn of this.waiting.keys()) this.status(conn);
  }
}
