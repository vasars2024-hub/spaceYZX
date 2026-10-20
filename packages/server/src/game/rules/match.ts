// Match rules for 1v1 / 2v2 / 3v3 / 5v5 rooms: warmup until both teams are full (or the host
// starts early), then rounds with the room's objective: Controller & Tower, bomb or Elimination
// (shared/rules/match).
import type {
  LoadoutName,
  MatchObjective,
  MatchState,
  PlaylistState,
  TeamMode,
} from '@space-yz/shared';
import {
  PLAYLIST_RULES,
  objectiveMapPool,
  playlistAdvance,
  playlistMatchEnded,
  playlistSkip,
  playlistView,
  playlistVote,
  voteSeed,
  createMatch,
  startMatch,
  updateMatch,
  matchView,
  applyBotObjectives,
  benchPlayer,
  playerLeft,
  forfeitMatch,
  takeOverInMatch,
} from '@space-yz/shared';
import type { Member, Room, Rules } from '../room';
import { MatchStats, type PlayerMatchStats } from '../match-stats';

export interface MatchResult {
  /**
   * the room's team size ('1v1'…'5v5'), or 'brawl' / 'brawl-ffa' (brawl.ts brawlMatchResult),
   * or 'royale' (royale.ts matchResult)
   */
  mode: TeamMode | 'brawl' | 'brawl-ffa' | 'royale';
  /** 'tower', 'bomb', 'elim'… (profiles count wins per objective) */
  objective?: string;
  winner: 0 | 1 | null;
  reason: string;
  scores: [number, number];
  rounds: number;
  durationSec: number;
  players: {
    id: number;
    accountId: number | null;
    team: 0 | 1;
    bot: boolean;
    kills: number;
    deaths: number;
    teamKills: number;
    damage: number;
    /** shooting stats this match (match-stats.ts) and seconds played */
    stats?: PlayerMatchStats & { playSec: number };
    /** free-for-all: final place (1 = won) */
    place?: number | null;
  }[];
  /** players who left before the end (count as losses in ranked) */
  leavers: { accountId: number | null; team: 0 | 1 }[];
}

const START_DELAY_SEC = 3;
/** ranked: a longer warm-up so everyone can read the versus screen (odds, ratings) */
export const RANKED_START_DELAY_SEC = 7;

/** Anti-grief thresholds (per match). A warning comes first, then a kick. */
export const GRIEF = {
  teamKillsWarn: 2,
  teamKillsKick: 3,
  carrierDamageWarn: 150,
  carrierDamageKick: 300,
  afkWarnSec: 40,
  afkKickSec: 75,
};

export type GriefAction = 'warn' | 'kick';

export class MatchRules implements Rules {
  readonly name = 'match';
  ms: MatchState;
  /** tick at which the match starts (0 = not scheduled) */
  startAt = 0;
  leavers: { accountId: number | null; team: 0 | 1 }[] = [];
  onResult: ((room: Room, result: MatchResult) => void) | null = null;
  /** anti-grief: a human misbehaved (warn once, then kick) */
  onGrief: ((room: Room, m: Member, action: GriefAction, reason: string) => void) | null = null;
  /** ranked rooms: the results screen is over (the room should close) */
  onFinished: ((room: Room) => void) | null = null;
  /**
   * Casual rooms with a map playlist (rules/playlist.ts): the queued maps, loop, or a map vote
   * after each match. Null: one map, back to warm-up after each match (as before).
   */
  playlist: PlaylistState | null = null;
  /**
   * The results card / vote is over: move the room to `map` and call `nextMatch` (the hub does
   * it and tells the clients). Without a handler the next match is played on the same map.
   */
  onNextMap: ((room: Room, map: string) => void) | null = null;
  /** matches finished in this room (seeds the map vote) */
  matchesPlayed = 0;
  /** the current match end was handled (playlist) */
  private endSeen = false;
  private grief = new Map<number, { teamKills: number; warned: Set<string> }>();
  /** shooting stats of the match being played (profiles) */
  readonly stats = new MatchStats();

  constructor(
    readonly mode: TeamMode,
    objective: MatchObjective = 'tower',
    loadout: LoadoutName = 'lethal',
  ) {
    // CS mode is played with the bomb, or as Elimination (never Towers); the room's config
    // must be csConfig: see hub
    this.ms = createMatch(
      mode,
      loadout === 'cs' ? (objective === 'elim' ? 'elim' : 'bomb') : objective,
      loadout,
    );
  }

  private full(room: Room): boolean {
    const [a, b] = room.teamCounts();
    return a >= this.ms.rules.teamSize && b >= this.ms.rules.teamSize;
  }

  /** Host asked to start now: needs at least one player per team. */
  requestStart(room: Room): string | null {
    if (this.ms.phase !== 'warmup') return 'The match is already running.';
    const [a, b] = room.teamCounts();
    if (a === 0 || b === 0) return 'Both teams need at least one player.';
    this.startAt = room.world.tick + Math.round(START_DELAY_SEC * 60);
    return null;
  }

  afterStep(room: Room): void {
    const { world, ctx } = room;
    const ms = this.ms;
    if (ms.phase !== 'warmup' && ms.phase !== 'matchEnd') this.stats.observe(world);
    if (ms.phase === 'warmup') {
      if (!this.startAt && this.full(room))
        this.startAt =
          world.tick + Math.round((room.ranked ? RANKED_START_DELAY_SEC : START_DELAY_SEC) * 60);
      if (this.startAt && world.tick >= this.startAt) {
        this.startAt = 0;
        this.leavers = [];
        this.grief.clear();
        this.stats.reset();
        startMatch(ms, world, ctx);
      }
    }
    // a playlist's next map: when the results card / vote is over, the room moves on
    const pl = this.playlist;
    if (pl && ms.phase === 'matchEnd' && pl.endsAt) {
      ms.phaseEnds = pl.endsAt; // (the results screen counts down to the next map)
      const next = playlistAdvance(pl, world.tick);
      if (next !== null) {
        if (this.onNextMap) this.onNextMap(room, next);
        else this.nextMatch(room);
        return;
      }
    }
    const wasEnd = ms.phase === 'matchEnd';
    updateMatch(ms, world, ctx);
    if (!wasEnd && ms.phase === 'matchEnd') this.onResult?.(room, this.result(room));
    // (checked apart from the result: a forfeit ends the match outside this step)
    if (ms.phase !== 'matchEnd') this.endSeen = false;
    else if (!this.endSeen) {
      this.endSeen = true;
      this.matchesPlayed++;
      // casual playlist: the next queued map (or a vote) instead of going back to warm-up
      if (pl && !room.ranked) {
        const pool = [...new Set([...objectiveMapPool(ms.objective), ...pl.maps])];
        if (
          playlistMatchEnded(
            pl,
            room.map,
            pool,
            world.tick,
            voteSeed(room.code, this.matchesPlayed),
          )
        )
          ms.phaseEnds = pl.endsAt;
      }
    }
    if (wasEnd && ms.phase === 'warmup' && room.ranked) this.onFinished?.(room);
    if (ms.phase !== 'warmup' && ms.phase !== 'matchEnd') this.checkGrief(room);
    // bots pursue the objective
    applyBotObjectives(
      ms,
      world,
      ctx,
      [...room.members.values()].flatMap((m) => (m.bot ? [m.bot] : [])),
    );
  }

  /**
   * The next match of a playlist, after the room moved to its next map: a fresh match (same
   * mode, objective, kit and team size) that starts after a short warm-up countdown.
   */
  nextMatch(room: Room): void {
    const old = this.ms;
    this.ms = createMatch(old.mode, old.objective, old.loadout);
    this.ms.rules = old.rules;
    this.leavers = [];
    this.grief.clear();
    this.stats.reset();
    this.startAt = room.world.tick + Math.round(PLAYLIST_RULES.startDelaySec * 60);
  }

  /** A player's map vote on the results screen (humans only). False: not counted. */
  vote(room: Room, playerId: number, map: string): boolean {
    const pl = this.playlist;
    if (!pl || this.ms.phase !== 'matchEnd' || !room.members.get(playerId)?.conn) return false;
    const ok = playlistVote(
      pl,
      playerId,
      map,
      room.humans.map((m) => m.id),
      room.world.tick,
    );
    if (ok) this.ms.phaseEnds = pl.endsAt;
    return ok;
  }

  /** The host skips the results card / vote. False: nothing to skip. */
  skip(room: Room): boolean {
    const pl = this.playlist;
    if (!pl || this.ms.phase !== 'matchEnd') return false;
    return playlistSkip(pl, room.world.tick);
  }

  private checkGrief(room: Room): void {
    const { world } = room;
    const g = (id: number) => {
      let e = this.grief.get(id);
      if (!e) this.grief.set(id, (e = { teamKills: 0, warned: new Set() }));
      return e;
    };
    const act = (m: Member, key: string, kick: boolean, reason: string) => {
      const e = g(m.id);
      if (kick) this.onGrief?.(room, m, 'kick', reason);
      else if (!e.warned.has(key)) {
        e.warned.add(key);
        this.onGrief?.(room, m, 'warn', reason);
      }
    };
    for (const ev of world.events) {
      if (ev.type !== 'kill' || !ev.teamKill || ev.attacker === ev.victim) continue;
      const m = room.members.get(ev.attacker);
      if (!m?.conn) continue;
      const e = g(m.id);
      e.teamKills++;
      if (e.teamKills >= GRIEF.teamKillsKick) act(m, 'tk', true, 'Kicked for team killing.');
      else if (e.teamKills >= GRIEF.teamKillsWarn)
        act(m, 'tk', false, 'Warning: stop killing your teammates or you will be kicked.');
    }
    for (const m of [...room.members.values()]) {
      if (!m.conn) continue;
      const dmg = this.ms.carrierDamageByMate[m.id] ?? 0;
      if (dmg >= GRIEF.carrierDamageKick)
        act(m, 'carrier', true, 'Kicked for attacking your own Controller carrier.');
      else if (dmg >= GRIEF.carrierDamageWarn)
        act(m, 'carrier', false, 'Warning: stop attacking your own Controller carrier.');
      if (this.ms.phase !== 'live') continue;
      const idle = (world.tick - Math.max(m.activeTick, this.ms.roundStart)) / 60;
      if (idle >= GRIEF.afkKickSec) act(m, 'afk', true, 'Kicked for being away (AFK).');
      else if (idle >= GRIEF.afkWarnSec)
        act(m, 'afk', false, 'Are you still there? Move or you will be kicked.');
      else g(m.id).warned.delete('afk');
    }
  }

  result(room: Room): MatchResult {
    const ms = this.ms;
    return {
      mode: this.mode,
      objective: ms.objective,
      winner: ms.winner,
      reason: ms.endReason,
      scores: [...ms.scores] as [number, number],
      rounds: ms.round,
      durationSec: Math.round((room.world.tick - ms.matchStartTick) / 60),
      players: room.world.players.map((p) => {
        const m = room.members.get(p.id);
        return {
          id: p.id,
          accountId: m?.accountId ?? null,
          team: p.team,
          bot: !!m?.bot,
          kills: p.kills,
          deaths: p.deaths,
          teamKills: p.teamKills,
          damage: Math.round(p.damageDealt),
          stats: {
            ...this.stats.get(p.id),
            playSec: Math.max(
              0,
              Math.round((room.world.tick - Math.max(ms.matchStartTick, m?.joinedTick ?? 0)) / 60),
            ),
          },
        };
      }),
      leavers: this.leavers,
    };
  }

  state(room: Room): unknown {
    return {
      rules: 'match',
      ...matchView(this.ms),
      startAt: this.startAt,
      ...(this.playlist ? { playlist: playlistView(this.playlist) } : {}),
      stats: room.world.players.map((p) => ({
        id: p.id,
        team: p.team,
        kills: p.kills,
        deaths: p.deaths,
        teamKills: p.teamKills,
        damage: Math.round(p.damageDealt),
      })),
    };
  }

  revealed(): readonly number[] {
    return this.ms.revealed;
  }

  /** Dead players may take over a bot teammate while the round is live (the Controller too). */
  takeOver(room: Room, humanId: number, botId: number): boolean {
    return takeOverInMatch(this.ms, room.world, humanId, botId);
  }

  onJoin(room: Room, m: Member): void {
    const p = room.world.players.find((q) => q.id === m.id);
    if (p) benchPlayer(this.ms, p);
  }

  onLeave(room: Room, m: Member): void {
    playerLeft(this.ms, room.world, m.id);
    const live = this.ms.phase !== 'warmup' && this.ms.phase !== 'matchEnd';
    if (live && m.conn) this.leavers.push({ accountId: m.accountId, team: m.team });
    // not enough players any more: cancel a pending start
    if (this.ms.phase === 'warmup' && !this.full(room)) this.startAt = 0;
    // ranked: a team with no players left forfeits (checked after the member is gone)
    if (live && room.ranked) {
      const left = [...room.members.values()].filter((x) => x.id !== m.id && x.conn);
      const teamsLeft = [0, 1].map((t) => left.filter((x) => x.team === t).length);
      if (teamsLeft[m.team] === 0 && teamsLeft[1 - m.team] > 0) {
        const wasEnd = this.ms.phase === 'matchEnd';
        forfeitMatch(this.ms, room.world, room.ctx, (1 - m.team) as 0 | 1);
        if (!wasEnd && this.ms.phase === 'matchEnd') {
          // the leaver is still in the world during onLeave: report after they are removed
          queueMicrotask(() => this.onResult?.(room, this.result(room)));
        }
      }
    }
  }
}
