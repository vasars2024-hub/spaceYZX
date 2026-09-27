// Matchmaking: the ranked queues (rating/ladders.ts RANKED_QUEUES — Premier, Premier CS,
// Duels 1v1, Duels 2v2, Race) and the casual queue (modes/casual-queue.ts). Every second it
// groups the searchers by their ladder rating (window widens the longer you wait, similar
// ping preferred, teams balanced by rating).
// - A searcher is a solo player or a whole party (party.ts): one unit, always on one team,
//   rated by the party rating (0.6 × best + 0.4 × mean). Only the party leader searches.
// - Multi-search: one unit may search several ranked queues at once; the first match that
//   forms takes it and cancels the others.
// - Premier / Premier CS: 3v3 by default; 4v4 or 5v5 when enough search (PREMIER_SIZES), then
//   the map veto (Premier CS votes the mode, Bomb or Elimination, first), then the room.
// - Duels: the room starts right away on the default match map (Tower rules).
// - Race: 2–8 racers (8 start at once; else everyone waiting ~20 s after the 2nd joined) on a
//   random race track; one ranked race, then the room closes. Solo only.
// - A ranked queue is open when enough players are online and / or in Premier's opening hours
//   (RankedStore.queueOpen). Casual: the match that suits the most people, bots fill the rest
//   after a short wait (never in ranked).
// Live numbers (players online, searching per mode) go to everyone in the menus every 3 s.
import type {
  CasualMatch,
  CasualPick,
  GroupQueueDef,
  LadderId,
  ModeVoteState,
  QueueCounts,
  QueueEntry,
  RankedQueueDef,
  RankedQueueId,
  TeamQueueDef,
  TeamMode,
  VersusInfo,
  VersusPlayer,
  VetoState,
  VetoView,
  PartyView,
  MatchObjective,
} from '@space-yz/shared';
import {
  ARENA_MAP_ID,
  CASUAL_MODE_IDS,
  DEFAULT_BOT_SKILL,
  DEFAULT_MATCH_MAP,
  LADDERS,
  MAPS,
  MODE_VOTE_SEC,
  RANKED_QUEUES,
  RANKED_QUEUE_IDS,
  VETO_BAN_SEC,
  brawlMaps,
  casualMode,
  casualPlayers,
  castModeVote,
  cleanCasualPick,
  createModeVote,
  createVeto,
  findMatches,
  formableTeamSize,
  mapDef,
  modeVoteCounts,
  modeVoteTick,
  partyOnlySize,
  partyQueueProblem,
  partyRating,
  pickCasualMatch,
  pickGroup,
  queueTeamSizes,
  raceFirstChances,
  raceTracks,
  rankedQueue,
  stackMultiplier,
  teamWinChance,
  vetoBan,
  vetoTick,
} from '@space-yz/shared';
import type { Conn } from '../game/conn';
import type { GameHub } from '../game/hub';
import type { Room } from '../game/room';
import type { RankedStore } from './ranked';
import type { Parties, Party } from './party';

export const RANKED_MAP = DEFAULT_MATCH_MAP();

/** How often the live queue numbers go out to the menus (ms). */
export const COUNTS_EVERY_MS = 3000;

/**
 * The veto's maps (Premier and Premier CS): every competitive map with bomb sites (new maps
 * join by themselves), except small maps that opt out (MapInfo `premier: false`).
 */
export const premierMapPool = (): string[] =>
  MAPS.filter(
    (m) =>
      m.competitive && !m.arena && m.premier !== false && (mapDef(m.id).bombSites?.length ?? 0) > 0,
  ).map((m) => m.id);

/** Race tracks the Race queue picks from (race tracks, not surf maps). */
/** (the race tracks only: surf maps are raced and timed too, but never in the ranked queue) */
export const raceTrackPool = (): string[] => raceTracks().map((m) => m.id);

/** Maps a casual match of this objective may use (Towers / bomb sites where it needs them). */
export const casualMapPool = (objective: MatchObjective): string[] =>
  MAPS.filter((m) => {
    if (!m.competitive || m.arena || m.race) return false;
    const d = mapDef(m.id);
    return objective === 'tower'
      ? d.towers.length >= 2
      : objective === 'bomb'
        ? (d.bombSites?.length ?? 0) >= 2
        : true;
  }).map((m) => m.id);

/** A searcher: a solo player or a whole party (one unit, one team). */
interface Unit {
  /** 'a<account>' (solo) or 'p<party>' */
  key: string;
  /** the one who started the search (the party leader) */
  leader: Conn;
  /** everyone in it, leader first */
  conns: Conn[];
  party: Party | null;
  /** ranked queues searched (multi-search) */
  ranked: RankedQueueDef[];
  /** the casual pick (null: not searching casual) */
  casual: CasualPick | null;
  joinedAtMs: number;
  /** each member's rating per ladder searched (conns order) */
  ratings: Partial<Record<LadderId, number[]>>;
}

/** A Premier / Premier CS match being set up: the teams are known, vote and veto run. */
interface PendingMatch {
  queue: TeamQueueDef;
  teams: [Unit[], Unit[]];
  teamSize: number;
  /** Premier CS: the mode vote (runs before the veto) */
  vote: ModeVoteState | null;
  /** the map veto (null while the vote runs) */
  veto: VetoState | null;
}

const ROOM_MODE: Record<number, TeamMode> = { 1: '1v1', 2: '2v2', 3: '3v3', 4: '5v5', 5: '5v5' };

export class RankedQueue {
  private waiting = new Map<string, Unit>();
  private pending = new Set<PendingMatch>();
  private timer: NodeJS.Timeout | null = null;
  private lastCounts = 0;
  hub: GameHub | null = null;
  /** parties (services wire it; null: everyone is solo) */
  parties: Parties | null = null;
  /** ranked on / off (host dashboard); the casual queue always works */
  enabled = true;
  matchesMade = 0;
  /** seconds per map ban (tests shorten it) */
  vetoBanMs = VETO_BAN_SEC * 1000;
  /** Premier CS mode vote length (ms) */
  voteMs = MODE_VOTE_SEC * 1000;
  /** random numbers for timed-out bans, tied votes, maps (tests make it predictable) */
  rand: () => number = Math.random;
  /** the veto's maps (tests may use a fixed pool) */
  mapPool: () => string[] = premierMapPool;
  /** the Race queue's tracks (one is picked at random) */
  trackPool: () => string[] = raceTrackPool;
  /** players online (distinct accounts connected; tests override it) */
  onlineCount: () => number = () => {
    const ids = new Set<number | string>();
    for (const c of this.hub?.conns ?? [])
      if (c.helloDone && !c.closed) ids.add(c.accountId ?? `c${c.id}`);
    return ids.size;
  };
  /**
   * Ranked race rooms the queue started: who was sent in (room code -> accounts). Whoever
   * never reached the start counts as a leaver (services: takeRaceRoster).
   */
  private raceRosters = new Map<string, { accountId: number; name: string }[]>();

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

  /**
   * Players searching this ranked queue (a multi-searching player counts in each), or with
   * no argument everyone searching anything (ranked or casual).
   */
  size(queue?: RankedQueueId): number {
    let n = 0;
    for (const u of this.waiting.values())
      if (!queue || u.ranked.some((q) => q.id === queue)) n += u.conns.length;
    return n;
  }

  /** Players in the casual queue (with `mode`: those who ticked it). */
  casualSize(mode?: string): number {
    let n = 0;
    for (const u of this.waiting.values())
      if (u.casual && (!mode || (u.casual.modes as string[]).includes(mode))) n += u.conns.length;
    return n;
  }

  /** The accounts the queue sent into a ranked race room (once: it forgets them). */
  takeRaceRoster(room: string): { accountId: number; name: string }[] | undefined {
    const r = this.raceRosters.get(room);
    this.raceRosters.delete(room);
    return r;
  }

  /** Players in a map veto / mode vote right now. */
  vetoing(): number {
    let n = 0;
    for (const p of this.pending) for (const t of p.teams) for (const u of t) n += u.conns.length;
    return n;
  }

  private pendingOf(conn: Conn): PendingMatch | undefined {
    for (const p of this.pending)
      if (p.teams.some((t) => t.some((u) => u.conns.includes(conn)))) return p;
    return undefined;
  }

  private unitOf(conn: Conn): Unit | undefined {
    for (const u of this.waiting.values()) if (u.conns.includes(conn)) return u;
    return undefined;
  }

  /** The party's search as its members see it (party.ts view). */
  partySearch(p: Party): PartyView['search'] {
    const u = this.waiting.get(`p${p.id}`);
    if (!u) return null;
    return {
      ranked: u.ranked.length ? u.ranked.map((q) => q.id) : null,
      casual: u.casual,
      waitSec: Math.floor((this.now() - u.joinedAtMs) / 1000),
    };
  }

  // ---------------- joining / leaving ----------------

  /**
   * Who searches when `conn` starts a search: the player alone, or their whole party (only the
   * leader may start one). Returns the members' connections or an error message.
   */
  private membersFor(conn: Conn): { party: Party | null; conns: Conn[] } | string {
    const party = this.parties?.of(conn.accountId) ?? null;
    if (!party || party.members.length <= 1) return { party, conns: [conn] };
    if (party.leader !== conn.accountId) return 'Only your party leader can start a search.';
    const conns: Conn[] = [conn];
    for (const id of party.members) {
      if (id === conn.accountId) continue;
      const c = this.parties!.connOf(id);
      if (!c) return 'Someone in your party is offline.';
      if (c.roomCode) return `${c.name} is in a room — wait for them to come back.`;
      if (this.pendingOf(c)) return `${c.name} is in a map veto.`;
      conns.push(c);
    }
    return { party, conns };
  }

  /** Checks every search needs. Error message, or null. */
  private commonProblem(conns: Conn[]): string | null {
    for (const c of conns) {
      if (c.accountId === null) return 'Matchmaking needs an account — reconnect and try again.';
      if (c.roomCode) return 'Leave your room first.';
      if (this.pendingOf(c)) return 'You are in a map veto.';
      // two tabs / windows of one browser share one account: it can't play itself
      for (const u of this.waiting.values())
        if (!u.conns.includes(c) && u.conns.some((x) => x.accountId === c.accountId))
          return 'This account is already searching in another tab or window. Your opponent needs their own device, or a private / incognito window.';
    }
    return null;
  }

  private refuse(conn: Conn, err: string, what: string): string {
    this.log(`Queue: ${conn.name} can't search ${what}: ${err}`);
    conn.sendJson({ t: 'queue', mode: null, waitSec: 0, searching: this.size(), error: err });
    return err;
  }

  /** Put a unit in the queue (replacing an earlier search of the same players). */
  private enqueue(unit: Unit): void {
    const old = this.waiting.get(unit.key);
    if (old) unit.joinedAtMs = old.joinedAtMs; // changing the pick keeps the wait
    for (const c of unit.conns) {
      const u = this.unitOf(c);
      if (u && u.key !== unit.key) this.waiting.delete(u.key);
    }
    this.waiting.set(unit.key, unit);
    for (const c of unit.conns) this.status(c);
    if (unit.party) this.parties?.push(unit.party);
  }

  /**
   * Search ranked: one queue id, several (multi-search), or null to stop searching (ranked
   * and casual; during a veto it walks out of it). Returns an error message, or null.
   */
  set(conn: Conn, queue: string | string[] | null): string | null {
    const inVeto = this.pendingOf(conn);
    if (queue === null) {
      if (inVeto) this.cancelVeto(inVeto, conn, 'left the map veto');
      const u = this.unitOf(conn);
      if (u) this.drop(u, u.conns.length > 1 ? `${conn.name} stopped the search.` : null);
      this.log(`Queue: ${conn.name} stopped searching`);
      this.status(conn);
      return null;
    }
    const ids = [...new Set(Array.isArray(queue) ? queue : [queue])];
    const what = ids.join(' + ');
    if (!this.enabled)
      return this.refuse(conn, 'Ranked is turned off on this server right now.', what);
    const defs = ids.map((id) => rankedQueue(id));
    if (!ids.length || defs.some((q) => !q))
      return this.refuse(conn, 'Unknown ranked queue.', what);
    if (inVeto) return this.refuse(conn, 'You are in a map veto.', what);
    const who = this.membersFor(conn);
    if (typeof who === 'string') return this.refuse(conn, who, what);
    const common = this.commonProblem(who.conns);
    if (common) return this.refuse(conn, common, what);
    for (const c of who.conns) {
      const ban = this.ranked.bannedUntil(c.accountId!);
      if (ban)
        return this.refuse(
          conn,
          c === conn
            ? `You are banned from ranked for ${Math.ceil((ban - this.now()) / 60000)} more minute(s).`
            : `${c.name} is banned from ranked for now.`,
          what,
        );
    }
    // each queue: open now? does the party fit it?
    const online = this.onlineCount();
    const ok: RankedQueueDef[] = [];
    const ratings: Unit['ratings'] = {};
    const skipped: string[] = [];
    for (const q of defs as RankedQueueDef[]) {
      const st = this.ranked.queueOpen(q.id, online);
      const r = who.conns.map((c) => this.ranked.rating(c.accountId!, q.ladder).rating.rating);
      const problem = !st.open ? closedText(q, st) : partyQueueProblem(q, r);
      if (problem) {
        skipped.push(problem);
        continue;
      }
      ok.push(q);
      ratings[q.ladder] = r;
    }
    if (!ok.length) return this.refuse(conn, skipped[0] ?? 'Unknown ranked queue.', what);
    if (skipped.length)
      conn.sendJson({ t: 'notice', msg: `Not searching everything: ${skipped.join(' ')}` });
    const unit: Unit = {
      key: who.party && who.conns.length > 1 ? `p${who.party.id}` : `a${conn.accountId}`,
      leader: conn,
      conns: who.conns,
      party: who.conns.length > 1 ? who.party : null,
      ranked: ok,
      casual: null,
      joinedAtMs: this.now(),
      ratings,
    };
    this.log(
      `Queue: ${who.conns.map((c) => c.name).join(' + ')} searching ${ok.map((q) => q.id).join(' + ')}`,
    );
    this.enqueue(unit);
    return null;
  }

  /** Search the casual queue with this pick (modes × sizes). Error message, or null. */
  setCasual(conn: Conn, raw: unknown): string | null {
    const pick = cleanCasualPick(raw);
    if (!pick) return this.refuse(conn, 'Tick at least one mode and one team size.', 'casual');
    if (this.pendingOf(conn)) return this.refuse(conn, 'You are in a map veto.', 'casual');
    const who = this.membersFor(conn);
    if (typeof who === 'string') return this.refuse(conn, who, 'casual');
    const common = this.commonProblem(who.conns);
    if (common) return this.refuse(conn, common, 'casual');
    // a party must fit on one team of some size it ticked (or play free-for-all / Arena)
    const n = who.conns.length;
    const fits = pick.modes.some((m) => {
      const def = casualMode(m)!;
      return pick.sizes.some((s) =>
        def.kind === 'match' || def.kind === 'brawl'
          ? n <= casualPlayers(def, s) / 2
          : n <= casualPlayers(def, s),
      );
    });
    if (!fits) return this.refuse(conn, 'Your party is too big for those team sizes.', 'casual');
    const unit: Unit = {
      key: who.party && n > 1 ? `p${who.party.id}` : `a${conn.accountId}`,
      leader: conn,
      conns: who.conns,
      party: n > 1 ? who.party : null,
      ranked: [],
      casual: pick,
      joinedAtMs: this.now(),
      ratings: {},
    };
    this.log(
      `Queue: ${who.conns.map((c) => c.name).join(' + ')} searching casual ${pick.modes.join('/')} ${pick.sizes.join('/')}`,
    );
    this.enqueue(unit);
    return null;
  }

  /** A connection closed (or switched account): out of every queue and veto. */
  remove(conn: Conn): void {
    const u = this.unitOf(conn);
    if (u) this.drop(u, u.conns.length > 1 ? `${conn.name} went offline — search stopped.` : null);
    const p = this.pendingOf(conn);
    if (p) this.cancelVeto(p, conn, 'disconnected');
  }

  /** The party changed (joined / left / new leader): its search stops. */
  partyChanged(party: Party, why: string): void {
    const u = this.waiting.get(`p${party.id}`);
    if (u) this.drop(u, `Search stopped: ${why}.`);
  }

  /** Take a unit out of the queue; `why` goes to its members (null: nobody is told). */
  private drop(u: Unit, why: string | null): void {
    if (!this.waiting.delete(u.key)) return;
    for (const c of u.conns) {
      if (c.closed) continue;
      if (why) c.sendJson({ t: 'notice', msg: why });
      this.status(c);
    }
    if (u.party) this.parties?.push(u.party);
  }

  // ---------------- veto / vote ----------------

  /** A player bans a map in their veto. Returns an error message, or null. */
  ban(conn: Conn, map: string): string | null {
    const p = this.pendingOf(conn);
    if (!p?.veto) return 'There is no map veto.';
    const team = p.teams[0].some((u) => u.conns.includes(conn)) ? 0 : 1;
    const err = vetoBan(p.veto, team, String(map), this.now());
    if (err) conn.sendJson({ t: 'notice', msg: err });
    else {
      this.log(`Ranked: ${conn.name} banned ${map}`);
      this.afterVetoChange(p);
    }
    return err;
  }

  /** Premier CS: a player votes the mode. Returns an error message, or null. */
  vote(conn: Conn, mode: string): string | null {
    const p = this.pendingOf(conn);
    if (!p?.vote || p.vote.result !== null) return 'There is no mode vote.';
    const err = castModeVote(p.vote, String(conn.accountId), mode);
    if (err) {
      conn.sendJson({ t: 'notice', msg: err });
      return err;
    }
    if (modeVoteTick(p.vote, this.now(), this.voters(p), this.rand)) this.afterVetoChange(p);
    else this.sendVeto(p);
    return null;
  }

  private voters(p: PendingMatch): number {
    return p.teams.flat().reduce((n, u) => n + u.conns.length, 0);
  }

  // ---------------- status and live numbers ----------------

  private status(conn: Conn): void {
    const u = this.unitOf(conn);
    if (!u) {
      conn.sendJson({ t: 'queue', mode: null, waitSec: 0, searching: this.size() });
      return;
    }
    conn.sendJson({
      t: 'queue',
      mode: u.ranked[0]?.id ?? null,
      modes: u.ranked.map((q) => q.id),
      casual: u.casual,
      ...(u.conns.length > 1 ? { party: true } : {}),
      waitSec: Math.floor((this.now() - u.joinedAtMs) / 1000),
      searching: u.ranked.length ? this.size(u.ranked[0].id) : this.casualSize(),
    });
  }

  /** Live numbers for the menus' mode cards (protocol QueueCounts). */
  counts(): QueueCounts {
    const online = this.onlineCount();
    const ranked = {} as QueueCounts['ranked'];
    for (const id of RANKED_QUEUE_IDS) {
      const q = rankedQueue(id)!;
      const st = this.ranked.queueOpen(id, online);
      const searching = this.size(id);
      ranked[id] = {
        searching,
        open: this.enabled && st.open,
        threshold: st.threshold,
        forms: formableTeamSize(q, searching),
      };
    }
    const casual = {} as QueueCounts['casual'];
    for (const m of CASUAL_MODE_IDS) casual[m] = this.casualSize(m);
    return { online, ranked, casual };
  }

  /** Send the live numbers to everyone in the menus (or just `to`). */
  pushCounts(to?: Conn): void {
    const msg = { t: 'queueCounts' as const, data: this.counts() };
    if (to) return void to.sendJson(msg);
    this.lastCounts = this.now();
    for (const c of this.hub?.conns ?? []) if (c.helloDone && !c.roomCode) c.sendJson(msg);
  }

  // ---------------- the matchmaking tick ----------------

  tick(): void {
    const hub = this.hub;
    if (!hub) return;
    const now = this.now();
    // drop searchers who disconnected or joined a room meanwhile
    for (const u of [...this.waiting.values()]) {
      const gone = u.conns.find((c) => c.closed || c.roomCode);
      if (gone) {
        this.log(
          `Queue: ${gone.name} left the queue (${gone.closed ? 'disconnected' : 'joined a room'})`,
        );
        this.drop(u, u.conns.length > 1 ? `${gone.name} left — search stopped.` : null);
      }
    }
    // a ranked queue that closed (opening hours over, players gone) drops its searchers; a bit
    // of slack on the player count so a flickering number doesn't kick everyone out
    const online = this.onlineCount();
    for (const u of [...this.waiting.values()]) {
      if (!u.ranked.length) continue;
      const closed: string[] = [];
      u.ranked = u.ranked.filter((q) => {
        const st = this.ranked.queueOpen(q.id, Math.ceil(online * 1.25));
        if (st.open && this.enabled) return true;
        closed.push(
          st.byHours === false && !st.threshold
            ? `${LADDERS[q.ladder].name} just closed for today — see its opening hours.`
            : `${LADDERS[q.ladder].name} closed: fewer than ${st.threshold} players online.`,
        );
        return false;
      });
      if (!closed.length) continue;
      if (!u.ranked.length && !u.casual) {
        this.waiting.delete(u.key);
        for (const c of u.conns)
          c.sendJson({ t: 'queue', mode: null, waitSec: 0, searching: 0, error: closed[0] });
        if (u.party) this.parties?.push(u.party);
      } else for (const c of u.conns) c.sendJson({ t: 'notice', msg: closed.join(' ') });
    }
    // ranked: queue by queue (a unit taken by one is gone from the others)
    for (const q of RANKED_QUEUES) {
      if (q.kind === 'race') this.startRaces(q, now);
      else this.formTeams(q, now);
    }
    // casual: the matches that suit the most people
    for (;;) {
      const list = [...this.waiting.values()].filter((u) => u.casual);
      const m = pickCasualMatch(
        list.map((u) => ({
          id: u.key,
          size: u.conns.length,
          joinedAtMs: u.joinedAtMs,
          modes: u.casual!.modes,
          sizes: u.casual!.sizes,
        })),
        now,
      );
      if (!m) break;
      if (!this.startCasual(m, list)) break;
    }
    for (const p of [...this.pending]) {
      // someone vanished or joined a room meanwhile: the match is off
      const gone = p.teams
        .flat()
        .flatMap((u) => u.conns)
        .find((c) => c.closed || c.roomCode);
      if (gone) {
        this.cancelVeto(p, gone, gone.closed ? 'disconnected' : 'joined a room');
        continue;
      }
      if (p.vote && p.vote.result === null) {
        if (modeVoteTick(p.vote, now, this.voters(p), this.rand)) this.afterVetoChange(p);
        else this.sendVeto(p);
      } else if (p.veto && vetoTick(p.veto, now, this.rand)) this.afterVetoChange(p);
      else this.sendVeto(p);
    }
    for (const u of this.waiting.values()) {
      for (const c of u.conns) this.status(c);
      if (u.party) this.parties?.push(u.party);
    }
    if (now - this.lastCounts >= COUNTS_EVERY_MS) this.pushCounts();
  }

  /** A unit's line in a team queue (its party rating on the queue's ladder). */
  private entry(u: Unit, q: TeamQueueDef): QueueEntry {
    const r = u.ratings[q.ladder] ?? [];
    return {
      id: u.key,
      rating: partyRating(r),
      pingMs: Math.max(0, ...u.conns.map((c) => c.rttMs)),
      joinedAtMs: u.joinedAtMs,
      size: u.conns.length,
      onlySize: partyOnlySize(r),
    };
  }

  /**
   * Team queues: the biggest team size first. A size may start once the longest waiter has
   * waited its `afterSec` (Premier: 5v5 at once with 10, 4v4 after 10 s, 3v3 after 20 s).
   */
  private formTeams(q: TeamQueueDef, now: number): void {
    const sizes = q.sizes ?? queueTeamSizes(q).map((teamSize) => ({ teamSize, afterSec: 0 }));
    for (const { teamSize, afterSec } of sizes) {
      const list = [...this.waiting.values()].filter((u) => u.ranked.includes(q));
      if (!list.length) return;
      if (now - Math.min(...list.map((u) => u.joinedAtMs)) < afterSec * 1000) continue;
      const res = findMatches(
        list.map((u) => this.entry(u, q)),
        now,
        q.mode,
        { teamSize },
      );
      for (const m of res.matches) {
        const teams = m.teams.map((t) => t.map((key) => this.waiting.get(key)!)) as [
          Unit[],
          Unit[],
        ];
        // the first match that forms takes them: every other search of theirs ends
        for (const t of teams) for (const u of t) this.waiting.delete(u.key);
        if (q.veto) this.startVeto(q, teams, teamSize);
        else this.startRoom(q, teams, RANKED_MAP, teamSize, q.objective);
      }
    }
  }

  /** Race: start every group the queue can fill (solo racers only). */
  private startRaces(q: GroupQueueDef, now: number): void {
    for (;;) {
      const left = [...this.waiting.values()].filter(
        (u) => u.ranked.includes(q) && u.conns.length === 1,
      );
      if (!left.length) return;
      const group = pickGroup(
        left.map((u) => ({
          id: u.key,
          rating: (u.ratings.race ?? [0])[0],
          pingMs: u.conns[0].rttMs,
          joinedAtMs: u.joinedAtMs,
        })),
        now,
        { minPlayers: q.group.min, maxPlayers: q.group.max, gatherMs: q.group.gatherSec * 1000 },
      );
      if (!group) return;
      const racers = group.map((key) => this.waiting.get(key)!);
      for (const u of racers) this.waiting.delete(u.key);
      const tracks = this.trackPool();
      const track = tracks[Math.min(tracks.length - 1, Math.floor(this.rand() * tracks.length))];
      const room = this.hub?.createRoom({
        mode: 'race',
        map: track,
        ranked: true,
        ladder: q.ladder,
      });
      if (!room) {
        this.log(`Ranked: couldn't open a room for a race (server full?)`);
        for (const u of racers) this.serverFull(u.conns[0]);
        return;
      }
      room.ladder = q.ladder;
      this.matchesMade++;
      const conns = racers.map((u) => u.conns[0]);
      this.raceRosters.set(
        room.code,
        conns.map((c) => ({ accountId: c.accountId!, name: c.name })),
      );
      this.log(`Ranked race on ${track}: ${conns.map((c) => c.name).join(', ')}`);
      for (const c of conns) this.hub!.joinRoom(c, room);
      this.sendVersus(
        q,
        track,
        conns.map((conn) => ({ conn, team: 0 as const })),
      );
    }
  }

  private serverFull(conn: Conn): void {
    conn.sendJson({
      t: 'queue',
      mode: null,
      waitSec: 0,
      searching: 0,
      error: 'The server is full right now — try again in a minute.',
    });
  }

  private startVeto(q: TeamQueueDef, teams: [Unit[], Unit[]], teamSize: number): void {
    const now = this.now();
    const vote = q.modeVote ? createModeVote(q.modeVote, now, this.voteMs) : null;
    const p: PendingMatch = {
      queue: q,
      teams,
      teamSize,
      vote,
      veto: vote && vote.result === null ? null : this.newVeto(),
    };
    this.pending.add(p);
    const names = (t: Unit[]) =>
      t
        .flatMap((u) => u.conns)
        .map((c) => c.name)
        .join(' + ');
    this.log(
      `Ranked ${q.id} ${teamSize}v${teamSize} found: ${names(teams[0])} vs ${names(teams[1])} · ${vote ? 'mode vote' : 'map veto'}`,
    );
    this.afterVetoChange(p);
  }

  private newVeto(): VetoState {
    return createVeto(this.mapPool(), this.now(), { banMs: this.vetoBanMs });
  }

  private afterVetoChange(p: PendingMatch): void {
    // the mode vote is over: the map bans start
    if (!p.veto && (!p.vote || p.vote.result !== null)) {
      p.veto = this.newVeto();
      if (p.vote) this.log(`Ranked ${p.queue.id}: the players voted ${p.vote.result}`);
    }
    this.sendVeto(p);
    if (!p.veto || p.veto.picked === null) return;
    this.pending.delete(p);
    this.startRoom(
      p.queue,
      p.teams,
      p.veto.picked,
      p.teamSize,
      p.vote?.result ?? p.queue.objective,
    );
  }

  private view(p: PendingMatch, team: 0 | 1, conn: Conn): VetoView {
    const now = this.now();
    const voting = !!p.vote && p.vote.result === null;
    const names = (t: Unit[]) => t.flatMap((u) => u.conns).map((c) => c.name);
    return {
      maps: p.veto?.maps ?? this.mapPool(),
      banned: p.veto?.banned ?? [],
      turn: p.veto?.turn ?? 0,
      yourTeam: team,
      secondsLeft: Math.max(
        0,
        Math.ceil(((voting ? p.vote!.endsMs : (p.veto?.turnEndsMs ?? now)) - now) / 1000),
      ),
      picked: p.veto?.picked ?? null,
      teams: [names(p.teams[0]), names(p.teams[1])],
      teamSize: p.teamSize,
      ladder: p.queue.ladder,
      phase: voting ? 'vote' : 'ban',
      ...(p.vote
        ? {
            vote: {
              options: p.vote.options,
              counts: modeVoteCounts(p.vote),
              yours: p.vote.votes[String(conn.accountId)] ?? null,
              secondsLeft: Math.max(0, Math.ceil((p.vote.endsMs - now) / 1000)),
              result: p.vote.result,
            },
          }
        : {}),
      ...(voting ? {} : { mode: p.vote?.result ?? p.queue.objective }),
    };
  }

  private sendVeto(p: PendingMatch): void {
    p.teams.forEach((t, team) => {
      for (const u of t)
        for (const c of u.conns) c.sendJson({ t: 'veto', data: this.view(p, team as 0 | 1, c) });
    });
  }

  /**
   * Someone left during the vote / veto: the match is off. The others go back to searching
   * (keeping their wait and their searches); the leaver's party stops searching.
   */
  private cancelVeto(p: PendingMatch, by: Conn, why: string): void {
    if (!this.pending.delete(p)) return;
    this.log(`Ranked: map veto cancelled — ${by.name} ${why}`);
    for (const u of p.teams.flat()) {
      const mine = u.conns.includes(by);
      for (const c of u.conns) {
        if (c.closed) continue;
        c.sendJson({ t: 'veto', data: null });
        if (c !== by)
          c.sendJson({
            t: 'notice',
            msg: mine
              ? `${by.name} left the map veto — search stopped.`
              : `${by.name} left the map veto — back to searching.`,
          });
      }
      if (!mine && u.conns.every((c) => !c.closed && !c.roomCode)) this.waiting.set(u.key, u);
      for (const c of u.conns) if (!c.closed) this.status(c);
    }
  }

  private startRoom(
    q: TeamQueueDef,
    teams: [Unit[], Unit[]],
    map: string,
    teamSize: number,
    objective: MatchObjective,
  ): void {
    const hub = this.hub;
    if (!hub) return;
    const room = hub.createRoom({
      mode: ROOM_MODE[teamSize] ?? q.mode,
      map,
      ranked: true,
      objective,
      loadout: q.loadout,
      // (4v4 plays in a 5v5 room with 4 per team)
      teamSize: teamSize === 4 ? 4 : undefined,
      ladder: q.ladder,
    });
    if (!room) {
      this.log(`Ranked: couldn't open a room for a ${q.id} match (server full?)`);
      for (const t of teams) for (const u of t) for (const c of u.conns) this.serverFull(c);
      return;
    }
    room.ladder = q.ladder;
    // a wide-gap full-team stack earns less (Valorant rule)
    const scale = new Map<number, number>();
    for (const u of teams.flat()) {
      const k = stackMultiplier(u.ratings[q.ladder] ?? [], teamSize);
      if (k !== 1) for (const c of u.conns) scale.set(c.accountId!, k);
    }
    room.ratingScale = scale.size ? scale : null;
    this.matchesMade++;
    const names = (t: Unit[]) =>
      t
        .flatMap((u) => u.conns)
        .map((c) => c.name)
        .join(' + ');
    this.log(
      `Ranked ${q.id} ${teamSize}v${teamSize} ${objective} on ${map}: ${names(teams[0])} vs ${names(teams[1])}`,
    );
    teams.forEach((units, team) => {
      for (const u of units) for (const c of u.conns) hub.joinRoom(c, room, team as 0 | 1);
    });
    this.sendVersus(
      q,
      map,
      teams.flatMap((units, team) =>
        units.flatMap((u) => u.conns.map((conn) => ({ conn, team: team as 0 | 1 }))),
      ),
    );
  }

  /** Start a casual match; false if no room could be opened. */
  private startCasual(m: CasualMatch, list: Unit[]): boolean {
    const hub = this.hub!;
    const def = casualMode(m.mode)!;
    const units = m.members.map((key) => list.find((u) => u.key === key)!);
    const pick = <T>(xs: readonly T[]): T | undefined =>
      xs[Math.min(xs.length - 1, Math.floor(this.rand() * xs.length))];
    const ffa = def.kind === 'brawl-ffa' || def.kind === 'arena';
    const room: Room | null =
      def.kind === 'match'
        ? hub.createRoom({
            mode: m.size,
            map: pick(casualMapPool(def.objective)) ?? DEFAULT_MATCH_MAP(),
            objective: def.objective,
            loadout: def.loadout,
          })
        : def.kind === 'arena'
          ? hub.createRoom({ mode: 'arena', map: ARENA_MAP_ID, loadout: def.loadout })
          : hub.createRoom({
              mode: def.kind,
              map: pick(brawlMaps())?.id ?? DEFAULT_MATCH_MAP(),
            });
    for (const u of units) this.waiting.delete(u.key);
    if (!room) {
      this.log(`Casual: couldn't open a room (server full?)`);
      for (const u of units) for (const c of u.conns) this.serverFull(c);
      return false;
    }
    this.matchesMade++;
    this.log(
      `Casual ${m.mode} ${m.size} on ${room.map}: ${units
        .flatMap((u) => u.conns)
        .map((c) => c.name)
        .join(', ')}${m.bots ? ` + ${m.bots} bot(s)` : ''}`,
    );
    for (const u of units)
      for (const c of u.conns) hub.joinRoom(c, room, ffa ? undefined : (m.teams[u.key] ?? 0));
    // bots fill the missing slots, evening out the teams (casual only)
    if (m.bots > 0 && typeof room.addMember === 'function') {
      const cap = casualPlayers(def, m.size);
      const per = cap / 2;
      for (let i = 0; i < m.bots; i++) {
        const [a, b] = room.teamCounts();
        const team: 0 | 1 | undefined = ffa ? undefined : a < per && a <= b ? 0 : 1;
        room.addMember(`Bot ${i + 1}`, null, { team, botSkill: DEFAULT_BOT_SKILL });
      }
      room.botFill = { size: cap, skill: DEFAULT_BOT_SKILL };
    }
    return true;
  }

  /** The ranked versus screen (rating/versus.ts), sent to everyone in a room that just formed. */
  private sendVersus(q: RankedQueueDef, map: string, members: { conn: Conn; team: 0 | 1 }[]): void {
    try {
      const data = buildVersus(this.ranked, q, map, members);
      for (const m of members) if (!m.conn.closed) m.conn.sendJson({ t: 'versus', data });
    } catch (err) {
      // nice to have: a failed lookup must never stop the match
      this.log(`Ranked: versus screen failed: ${String(err)}`);
    }
  }
}

/** Why a ranked queue is closed, for the player. */
const closedText = (
  q: RankedQueueDef,
  st: { threshold: number; online: number; byHours: boolean | null },
): string => {
  const name = LADDERS[q.ladder].name;
  if (st.threshold > 0 && st.byHours === false)
    return `${name} is closed: it opens at ${st.threshold} players online (now ${st.online}) or in its opening hours.`;
  if (st.threshold > 0)
    return `${name} is closed: it opens at ${st.threshold} players online (now ${st.online}).`;
  return `${name} is closed right now — see its opening hours.`;
};

/**
 * Everyone's ladder standing and the odds for a ranked room that just formed (read-only from
 * the ranked store). Hidden ratings (Premier / Race placements) are left out of the players
 * but still count for the odds.
 */
export const buildVersus = (
  ranked: RankedStore,
  q: RankedQueueDef,
  map: string,
  members: { conn: Conn; team: 0 | 1 }[],
): VersusInfo => {
  const lines = members.map((m) => ({ m, v: ranked.versusLine(m.conn.accountId!, q.ladder) }));
  const players: VersusPlayer[] = lines.map(({ m, v }) => ({
    id: m.conn.playerId ?? null,
    accountId: m.conn.accountId,
    name: m.conn.name,
    team: m.team,
    rating: v.standing.rating,
    rank: v.standing.rank,
    placement: v.standing.placed ? null : v.standing.placement,
    games: v.standing.games,
    wins: v.standing.wins,
    form: v.form,
  }));
  let teamChance: [number, number] = [1, 0];
  if (q.kind === 'race') {
    const chances = raceFirstChances(lines.map(({ v }) => v.rating.rating));
    players.forEach((p, i) => (p.firstChance = chances[i]));
  } else {
    const team = (t: 0 | 1) => lines.filter(({ m }) => m.team === t).map(({ v }) => v.rating);
    const a = teamWinChance(team(0), team(1));
    teamChance = [a, 1 - a];
  }
  return { ladder: q.ladder, queue: q.id, map, players, teamChance };
};
