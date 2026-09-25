// Match rules for 1v1 / 2v2 / 5v5 rooms: warmup until both teams are full (or the host
// starts early), then rounds with the Controller & Tower objective (shared/rules/match).
import type { MatchState, RankedMode } from '@space-yz/shared';
import {
  createMatch,
  startMatch,
  updateMatch,
  matchView,
  applyBotObjectives,
  benchPlayer,
  playerLeft,
  forfeitMatch,
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
  private grief = new Map<number, { teamKills: number; warned: Set<string> }>();

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
        this.grief.clear();
        startMatch(ms, world, ctx);
      }
    }
    const wasEnd = ms.phase === 'matchEnd';
    updateMatch(ms, world, ctx);
    if (!wasEnd && ms.phase === 'matchEnd') this.onResult?.(room, this.result(room));
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
