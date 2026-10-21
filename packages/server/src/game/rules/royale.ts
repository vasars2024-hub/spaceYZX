// Royale rooms (private rooms on a royale map): everyone for themselves, one life per round, a
// shrinking zone, location flashes; the first to win 3 rounds wins the match
// (shared/rules/royale.ts). The room waits in a lobby (free play with respawns) until the host
// starts or the room is full (bot fill counts), plays the match, shows the results, and goes
// back to the lobby (a full room starts the next match by itself). Casual only: nothing is
// rated, but every finished match is stored in the match history with each player's place.
import type { RoyaleSettings, RoyaleState } from '@space-yz/shared';
import {
  createRoyale,
  startRoyale,
  updateRoyale,
  royaleView,
  royaleJoin,
  royaleLeave,
  royaleToLobby,
  royaleStandings,
  applyRoyaleBotObjectives,
} from '@space-yz/shared';
import type { Member, Room, Rules } from '../room';
import type { MatchResult } from './match';
import { MatchStats } from '../match-stats';

export class RoyaleRules implements Rules {
  readonly name = 'royale';
  readonly st: RoyaleState;
  /** tick the next match starts at (0 = not scheduled) */
  startAt = 0;
  /** a match ended (its results screen starts): record it */
  onResult: ((room: Room, result: MatchResult) => void) | null = null;
  /** shooting stats of the match being played (profiles) */
  readonly stats = new MatchStats();
  private matchStart = 0;

  constructor(settings: Partial<RoyaleSettings> = {}) {
    this.st = createRoyale(settings);
  }

  /** How many players fill the room: the bot fill's size, else the room's limit. */
  private target(room: Room): number {
    return Math.min(room.maxPlayers, room.botFill?.size ?? room.maxPlayers);
  }

  /** Host asked to start now: needs at least two players. */
  requestStart(room: Room): string | null {
    if (this.st.phase !== 'lobby') return 'The match is already running.';
    if (room.members.size < this.st.settings.minPlayers)
      return 'Royale needs at least two players.';
    this.startAt = room.world.tick + Math.round(this.st.settings.startDelaySec * 60);
    return null;
  }

  setup(room: Room): void {
    royaleToLobby(this.st, room.world, room.ctx);
  }

  afterStep(room: Room): void {
    const { world, ctx } = room;
    const st = this.st;
    if (st.phase === 'lobby') {
      // a full room starts by itself (bots fill it to its size)
      if (!this.startAt && room.members.size >= Math.max(st.settings.minPlayers, this.target(room)))
        this.startAt = world.tick + Math.round(st.settings.startDelaySec * 60);
      if (this.startAt && world.tick >= this.startAt) {
        this.startAt = 0;
        this.stats.reset();
        this.matchStart = world.tick;
        startRoyale(st, world, ctx);
      }
    } else if (st.phase === 'live') this.stats.observe(world);
    const wasEnd = st.phase === 'end';
    const over = updateRoyale(st, world, ctx);
    if (!wasEnd && st.phase === 'end') this.onResult?.(room, this.matchResult(room));
    if (over) royaleToLobby(st, world, ctx);
    applyRoyaleBotObjectives(
      st,
      world,
      ctx,
      [...room.members.values()].flatMap((m) => (m.bot ? [m.bot] : [])),
    );
  }

  /** The finished match as a record (services recordMatch): everyone with their final place. */
  matchResult(room: Room): MatchResult {
    const order = royaleStandings(this.st, room.world);
    const durationSec = Math.round((room.world.tick - this.matchStart) / 60);
    return {
      mode: 'royale',
      objective: 'royale',
      winner: null,
      reason: 'first to ' + this.st.settings.winsToWin + ' round wins',
      scores: [0, 0],
      rounds: this.st.round,
      durationSec,
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
              Math.round((room.world.tick - Math.max(this.matchStart, m?.joinedTick ?? 0)) / 60),
            ),
          },
          place: order.findIndex((r) => r.id === p.id) + 1 || null,
        };
      }),
      leavers: [],
    };
  }

  state(room: Room): unknown {
    return { rules: 'royale', ...royaleView(this.st, room.world, room.map), startAt: this.startAt };
  }

  revealed(): readonly number[] {
    return this.st.revealed;
  }

  /** Out of the round (dead, or watching after joining mid-match), or between rounds: see all. */
  seesAll(room: Room, viewer: number): boolean {
    const ph = this.st.phase;
    if (ph === 'lobby' || ph === 'countdown') return false;
    if (ph !== 'live') return true;
    return !room.world.players.find((p) => p.id === viewer)?.alive;
  }

  onJoin(room: Room, m: Member): void {
    royaleJoin(this.st, room.world, room.ctx, m.id);
  }

  onLeave(room: Room, m: Member): void {
    royaleLeave(this.st, m.id);
    // not enough players any more: cancel a pending start
    if (this.st.phase === 'lobby' && room.members.size - 1 < this.st.settings.minPlayers)
      this.startAt = 0;
  }
}
