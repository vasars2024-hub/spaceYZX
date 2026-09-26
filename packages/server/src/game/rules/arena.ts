// Arena 1v1 rooms (private and ranked): up to 8 players duel 1v1 in separate pits of the Arena
// map, re-paired after every round, for a timed match (shared/rules/arena.ts). Each client is
// sent only the players of the pit it is in or watching (canSee). Ranked rooms close after the
// results screen; private rooms go back to warmup and start the next match by themselves.
import type { ArenaSettings, ArenaState, DuelEndReason, LoadoutName } from '@space-yz/shared';
import {
  ARENA_DEFAULTS,
  createArena,
  updateArena,
  arenaView,
  arenaJoin,
  arenaLeave,
  arenaCanSee,
  arenaStandings,
  applyArenaBotObjectives,
  requestArenaStart,
} from '@space-yz/shared';
import type { Member, Room, Rules } from '../room';

export interface ArenaResult {
  mode: 'arena';
  loadout: LoadoutName;
  reason: string;
  rounds: number;
  durationSec: number;
  /** final standings, best first (place 1 won the arena); players who left come last */
  standings: {
    id: number;
    accountId: number | null;
    name: string;
    bot: boolean;
    place: number;
    wins: number;
    losses: number;
    kills: number;
    deaths: number;
    damage: number;
    left: boolean;
  }[];
  /** every duel of the match (player ids) */
  duels: { round: number; a: number; b: number; winner: number; reason: DuelEndReason }[];
}

export class ArenaRules implements Rules {
  readonly name = 'arena';
  readonly st: ArenaState;
  onResult: ((room: Room, result: ArenaResult) => void) | null = null;
  /** ranked rooms: the results screen is over (the room should close) */
  onFinished: ((room: Room) => void) | null = null;
  /** everyone who was ever in the room (ids are never reused), for the results */
  private who = new Map<number, { accountId: number | null; name: string; bot: boolean }>();

  constructor(
    readonly loadout: LoadoutName = 'lethal',
    opts: { ranked?: boolean; settings?: Partial<ArenaSettings> } = {},
  ) {
    // ranked rooms start as soon as everyone is in (they all arrive together from the queue)
    this.st = createArena(loadout, {
      ...(opts.ranked ? { warmupSec: ARENA_DEFAULTS.startSec } : {}),
      ...opts.settings,
    });
  }

  /** The first ladder order (ranked: best arena rating on top). */
  seed(order: number[]): void {
    this.st.seed = order.slice();
  }

  /** Host asked to start now. */
  requestStart(room: Room): string | null {
    if (this.st.phase !== 'warmup') return 'The arena is already running.';
    if (!requestArenaStart(this.st, room.world, room.ctx)) return 'The arena needs 2 players.';
    return null;
  }

  afterStep(room: Room): void {
    const { world, ctx } = room;
    const st = this.st;
    const wasEnd = st.phase === 'matchEnd';
    updateArena(st, world, ctx);
    if (!wasEnd && st.phase === 'matchEnd') this.onResult?.(room, this.result(room));
    if (wasEnd && st.phase === 'warmup' && room.ranked) this.onFinished?.(room);
    // the rules pick each player's side per duel: keep the room's teams in step
    for (const m of room.members.values()) {
      const p = world.players.find((q) => q.id === m.id);
      if (p) m.team = p.team;
    }
    applyArenaBotObjectives(
      st,
      world,
      ctx,
      [...room.members.values()].flatMap((m) => (m.bot ? [m.bot] : [])),
    );
  }

  result(room: Room): ArenaResult {
    const st = this.st;
    return {
      mode: 'arena',
      loadout: st.loadout,
      reason: st.endReason,
      rounds: st.round,
      durationSec: Math.round((room.world.tick - st.matchStartTick) / 60),
      standings: arenaStandings(st).map((e, i) => {
        const w = this.who.get(e.id);
        return {
          id: e.id,
          accountId: w?.accountId ?? null,
          name: w?.name ?? `Player ${e.id}`,
          bot: w?.bot ?? false,
          place: i + 1,
          wins: e.wins,
          losses: e.losses,
          kills: e.kills,
          deaths: e.deaths,
          damage: Math.round(e.damage),
          left: e.left,
        };
      }),
      duels: st.history.map((d) => ({
        round: d.round,
        a: d.ids[0],
        b: d.ids[1],
        winner: d.winner,
        reason: d.reason,
      })),
    };
  }

  state(): unknown {
    return { rules: 'arena', ...arenaView(this.st) };
  }

  canSee(room: Room, viewer: number, target: number): boolean {
    return arenaCanSee(this.st, room.world, viewer, target);
  }

  onJoin(room: Room, m: Member): void {
    this.who.set(m.id, { accountId: m.accountId, name: m.name, bot: !m.conn });
    arenaJoin(this.st, room.world, room.ctx, m.id);
    const p = room.world.players.find((q) => q.id === m.id);
    if (p) m.team = p.team;
  }

  onLeave(room: Room, m: Member): void {
    const wasEnd = this.st.phase === 'matchEnd';
    arenaLeave(this.st, room.world, room.ctx, m.id);
    // (the leaver is still in the world during onLeave: report after they are removed)
    if (!wasEnd && this.st.phase === 'matchEnd')
      queueMicrotask(() => this.onResult?.(room, this.result(room)));
  }
}
