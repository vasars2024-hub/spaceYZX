// Match rules for 1v1 / 2v2 / 5v5 rooms: warmup until both teams are full (or the host
// starts early), then rounds with the Controller & Tower objective (shared/rules/match).
import type { MatchState, RankedMode } from '@space-yz/shared';
import {
  createMatch,
  startMatch,
  updateMatch,
  matchView,
  botObjectives,
  benchPlayer,
  playerLeft,
} from '@space-yz/shared';
import type { Member, Room, Rules } from '../room';

export interface MatchResult {
  mode: RankedMode;
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
  }[];
  /** players who left before the end (count as losses in ranked) */
  leavers: { accountId: number | null; team: 0 | 1 }[];
}

const START_DELAY_SEC = 3;

export class MatchRules implements Rules {
  readonly name = 'match';
  ms: MatchState;
  /** tick at which the match starts (0 = not scheduled) */
  startAt = 0;
  leavers: { accountId: number | null; team: 0 | 1 }[] = [];
  onResult: ((room: Room, result: MatchResult) => void) | null = null;

  constructor(readonly mode: RankedMode) {
    this.ms = createMatch(mode);
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
    if (ms.phase === 'warmup') {
      if (!this.startAt && this.full(room))
        this.startAt = world.tick + Math.round(START_DELAY_SEC * 60);
      if (this.startAt && world.tick >= this.startAt) {
        this.startAt = 0;
        this.leavers = [];
        startMatch(ms, world, ctx);
      }
    }
    const wasEnd = ms.phase === 'matchEnd';
    updateMatch(ms, world, ctx);
    if (!wasEnd && ms.phase === 'matchEnd') this.onResult?.(room, this.result(room));
    // bots pursue the objective
    const obj = botObjectives(ms, world, ctx);
    for (const m of room.members.values()) if (m.bot) m.bot.objective = obj[m.id] ?? null;
  }

  result(room: Room): MatchResult {
    const ms = this.ms;
    return {
      mode: this.mode,
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
      stats: room.world.players.map((p) => ({
        id: p.id,
        kills: p.kills,
        deaths: p.deaths,
        teamKills: p.teamKills,
        damage: Math.round(p.damageDealt),
      })),
    };
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
  }
}
