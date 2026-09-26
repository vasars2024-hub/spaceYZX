// Ranked matchmaking queue: one queue per mode. Every second it pairs players by rating
// (window widens the longer you wait, similar ping preferred, teams balanced by rating) and
// starts a ranked room on the default match map (Split Deck).
// Arena 1v1 ('arena'): its own queue per kit. Once 2 players wait it gathers more for
// `queueGatherSec` (8 start at once), then starts an arena room with the best arena rating
// on top of the first ladder.
import type { LadderMode, LoadoutName, QueueEntry } from '@space-yz/shared';
import {
  ARENA_DEFAULTS,
  ARENA_MAP_ID,
  DEFAULT_MATCH_MAP,
  findMatches,
  LADDER_MODES,
  LOADOUT_NAMES,
  pickArenaGroup,
  RANKED_MODES,
} from '@space-yz/shared';
import type { Conn } from '../game/conn';
import type { GameHub } from '../game/hub';
import { ArenaRules } from '../game/rules/arena';
import type { RankedStore } from './ranked';

export const RANKED_MAP = DEFAULT_MATCH_MAP();

interface Waiting {
  conn: Conn;
  mode: LadderMode;
  /** arena: the kit (players only meet the same kit) */
  loadout: LoadoutName;
  entry: QueueEntry;
}

export class RankedQueue {
  private waiting = new Map<Conn, Waiting>();
  private timer: NodeJS.Timeout | null = null;
  hub: GameHub | null = null;
  enabled = true;
  matchesMade = 0;
  /** Arena: once 2 players wait, how long to gather more (ms) */
  arenaGatherMs = ARENA_DEFAULTS.queueGatherSec * 1000;

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
  }

  size(mode?: LadderMode): number {
    let n = 0;
    for (const w of this.waiting.values()) if (!mode || w.mode === mode) n++;
    return n;
  }

  /** Join (mode) or leave (null) the queue. Returns an error message, or null. */
  set(conn: Conn, mode: LadderMode | null, loadout: LoadoutName = 'lethal'): string | null {
    if (mode === null) {
      if (this.waiting.delete(conn)) this.log(`Ranked: ${conn.name} stopped searching`);
      this.status(conn);
      return null;
    }
    let err: string | null = null;
    if (!this.enabled) err = 'Ranked is turned off on this server right now.';
    else if (!LADDER_MODES.includes(mode)) err = 'Unknown mode.';
    else if (conn.accountId === null) err = 'Ranked needs an account — reconnect and try again.';
    else if (conn.roomCode) err = 'Leave your room first.';
    else if (
      [...this.waiting.values()].some(
        (w) => w.conn !== conn && w.entry.id === String(conn.accountId),
      )
    )
      // two tabs / windows of one browser share one account: it can't play itself
      err =
        'This account is already searching in another tab or window. Your opponent needs their own device, or a private / incognito window.';
    else {
      const ban = this.ranked.bannedUntil(conn.accountId);
      if (ban)
        err = `You are banned from ranked for ${Math.ceil((ban - this.now()) / 60000)} more minute(s).`;
    }
    if (err) {
      this.log(`Ranked: ${conn.name} can't search ${mode}: ${err}`);
      conn.sendJson({ t: 'queue', mode: null, waitSec: 0, searching: this.size(), error: err });
      return err;
    }
    const r = this.ranked.rating(conn.accountId!, mode);
    this.log(
      `Ranked: ${conn.name} (#${conn.accountId}) searching ${mode}${mode === 'arena' ? ` (${loadout})` : ''} · ${this.size(mode) + (this.waiting.has(conn) ? 0 : 1)} searching`,
    );
    this.waiting.set(conn, {
      conn,
      mode,
      loadout: mode === 'arena' && loadout === 'cs' ? 'cs' : 'lethal',
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
      if (conn.closed || conn.roomCode) {
        this.waiting.delete(conn);
        this.log(
          `Ranked: ${conn.name} left the queue (${conn.closed ? 'disconnected' : 'joined a room'})`,
        );
      } else w.entry.pingMs = conn.rttMs;
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
        if (!room) {
          this.log(`Ranked: couldn't open a room for a ${mode} match (server full?)`);
          continue;
        }
        this.matchesMade++;
        this.log(
          `Ranked ${mode} match: ${teams.map((t) => t.map((w) => w.conn.name).join(' + ')).join(' vs ')}`,
        );
        teams.forEach((members, team) =>
          members.forEach((w) => {
            this.waiting.delete(w.conn);
            hub.joinRoom(w.conn, room, team as 0 | 1);
          }),
        );
      }
    }
    for (const loadout of LOADOUT_NAMES) this.startArenas(hub, loadout, now);
    for (const conn of this.waiting.keys()) this.status(conn);
  }

  /** Arena 1v1: start every room the queue for this kit can fill. */
  private startArenas(hub: GameHub, loadout: LoadoutName, now: number): void {
    for (;;) {
      const list = [...this.waiting.values()].filter(
        (w) => w.mode === 'arena' && w.loadout === loadout,
      );
      const group = pickArenaGroup(
        list.map((w) => w.entry),
        now,
        {
          minPlayers: ARENA_DEFAULTS.minPlayers,
          maxPlayers: Math.min(ARENA_DEFAULTS.maxPlayers, ARENA_DEFAULTS.queueMaxPlayers),
          gatherMs: this.arenaGatherMs,
        },
      );
      if (!group) return;
      const room = hub.createRoom({ mode: 'arena', map: ARENA_MAP_ID, ranked: true, loadout });
      if (!room) return;
      this.matchesMade++;
      const players = group
        .map((id) => list.find((w) => w.entry.id === id)!)
        .sort((a, b) => b.entry.rating - a.entry.rating);
      const order: number[] = [];
      for (const w of players) {
        this.waiting.delete(w.conn);
        hub.joinRoom(w.conn, room);
        if (w.conn.playerId !== null) order.push(w.conn.playerId);
      }
      if (room.rules instanceof ArenaRules) room.rules.seed(order);
    }
  }
}
