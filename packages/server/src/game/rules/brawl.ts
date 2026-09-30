// Brawl rooms (public quick-play rooms and private ones): team deathmatch ('brawl') or
// free-for-all ('brawl-ffa') with instant respawns, a kill target and a 5-minute timer
// (shared/rules/brawl.ts). They never stop: after the results the hub moves the room to the
// next map of the rotation (onNextMap) and the next Brawl starts by itself. Players join and
// leave whenever they like. Casual only: nothing is rated, but every finished Brawl is stored
// in the match history with each player's shooting stats (profiles: brawlMatchResult).
import type { BrawlMode, BrawlSettings, BrawlState } from '@space-yz/shared';
import {
  createBrawl,
  startBrawl,
  updateBrawl,
  brawlView,
  brawlJoin,
  brawlLeave,
  brawlStandings,
  applyBrawlBotObjectives,
} from '@space-yz/shared';
import type { Member, Room, Rules } from '../room';
import { GRIEF, type GriefAction, type MatchResult } from './match';
import { MatchStats } from '../match-stats';

export interface BrawlResult {
  mode: BrawlMode;
  map: string;
  /** TDM: the winning team; FFA: the winning player's id; null = a draw */
  winner: number | null;
  reason: string;
  scores: [number, number];
  durationSec: number;
  /** everyone still in the room, best first */
  players: {
    id: number;
    name: string;
    bot: boolean;
    team: 0 | 1;
    kills: number;
    deaths: number;
    score: number;
  }[];
}

export class BrawlRules implements Rules {
  readonly name = 'brawl';
  readonly st: BrawlState;
  onResult: ((room: Room, result: BrawlResult) => void) | null = null;
  /**
   * The results screen is over: move the room to the next map and call `restart` (the hub does
   * it and tells the clients). Without a handler the next Brawl starts on the same map.
   */
  onNextMap: ((room: Room) => void) | null = null;
  /** anti-grief: team killing (TDM) and, in public rooms, standing AFK (warn once, then kick) */
  onGrief: ((room: Room, m: Member, action: GriefAction, reason: string) => void) | null = null;
  private grief = new Map<number, { teamKills: number; warned: Set<string> }>();
  /** shooting stats of the Brawl being played (profiles) */
  readonly stats = new MatchStats();

  constructor(
    readonly mode: BrawlMode = 'brawl',
    settings: Partial<BrawlSettings> = {},
  ) {
    this.st = createBrawl(mode === 'brawl-ffa' ? 'ffa' : 'tdm', settings);
  }

  setup(room: Room): void {
    this.stats.reset();
    startBrawl(this.st, room.world, room.ctx);
  }

  /** Start the next Brawl (after the room moved to the next map). */
  restart(room: Room): void {
    this.grief.clear();
    this.stats.reset();
    startBrawl(this.st, room.world, room.ctx);
  }

  afterStep(room: Room): void {
    const { world, ctx } = room;
    const st = this.st;
    const wasEnd = st.phase === 'end';
    if (st.phase === 'live') this.stats.observe(world);
    const next = updateBrawl(st, world, ctx);
    if (!wasEnd && st.phase === 'end') this.onResult?.(room, this.result(room));
    if (next) {
      if (this.onNextMap) this.onNextMap(room);
      else this.restart(room);
    } else if (st.phase === 'live') this.checkGrief(room);
    applyBrawlBotObjectives(
      st,
      room.world,
      room.ctx,
      [...room.members.values()].flatMap((m) => (m.bot ? [m.bot] : [])),
    );
  }

  private checkGrief(room: Room): void {
    const { world } = room;
    const entry = (id: number) => {
      let e = this.grief.get(id);
      if (!e) this.grief.set(id, (e = { teamKills: 0, warned: new Set() }));
      return e;
    };
    const act = (m: Member, key: string, kick: boolean, reason: string) => {
      const e = entry(m.id);
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
      const e = entry(m.id);
      e.teamKills++;
      if (e.teamKills >= GRIEF.teamKillsKick) act(m, 'tk', true, 'Kicked for team killing.');
      else if (e.teamKills >= GRIEF.teamKillsWarn)
        act(m, 'tk', false, 'Warning: stop killing your teammates or you will be kicked.');
    }
    // public rooms: an AFK player holds a slot strangers could use
    if (!room.isPublic) return;
    for (const m of [...room.members.values()]) {
      if (!m.conn) continue;
      const idle = (world.tick - Math.max(m.activeTick, this.st.startTick)) / 60;
      if (idle >= GRIEF.afkKickSec) act(m, 'afk', true, 'Kicked for being away (AFK).');
      else if (idle >= GRIEF.afkWarnSec)
        act(m, 'afk', false, 'Are you still there? Move or you will be kicked.');
      else entry(m.id).warned.delete('afk');
    }
  }

  result(room: Room): BrawlResult {
    const st = this.st;
    return {
      mode: this.mode,
      map: room.map,
      winner: st.winner,
      reason: st.endReason,
      scores: [st.scores[0], st.scores[1]],
      durationSec: Math.round((room.world.tick - st.startTick) / 60),
      players: brawlStandings(room.world).map((r) => {
        const m = room.members.get(r.id);
        return {
          id: r.id,
          name: m?.name ?? `Player ${r.id}`,
          bot: !!m?.bot,
          team: r.team,
          kills: r.kills,
          deaths: r.deaths,
          score: r.score,
        };
      }),
    };
  }

  /**
   * The finished Brawl as a match record (services recordMatch, objective 'brawl'): everyone
   * with their kills, deaths, damage and shooting stats; TDM has a winning team, FFA a place
   * per player (1 = won).
   */
  matchResult(room: Room): MatchResult {
    const st = this.st;
    const ffa = this.mode === 'brawl-ffa';
    const order = brawlStandings(room.world);
    return {
      mode: this.mode,
      objective: 'brawl',
      winner: ffa ? null : st.winner === 0 || st.winner === 1 ? st.winner : null,
      reason: st.endReason,
      scores: [st.scores[0], st.scores[1]],
      rounds: 1,
      durationSec: Math.round((room.world.tick - st.startTick) / 60),
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
              Math.round((room.world.tick - Math.max(st.startTick, m?.joinedTick ?? 0)) / 60),
            ),
          },
          ...(ffa ? { place: order.findIndex((r) => r.id === p.id) + 1 || null } : {}),
        };
      }),
      leavers: [],
    };
  }

  state(room: Room): unknown {
    return { rules: 'brawl', ...brawlView(this.st, room.world, room.map) };
  }

  onJoin(room: Room, m: Member): void {
    brawlJoin(this.st, room.world, room.ctx, m.id);
  }

  onLeave(_room: Room, m: Member): void {
    brawlLeave(this.st, m.id);
    this.grief.delete(m.id);
  }
}
