// Parkour race rooms (shared/rules/race.ts): up to 8 racers on a race track, no combat, everyone
// sees everyone (racers are drawn semi-transparent and pass through each other). Private rooms
// loop lobby → countdown → race → results by themselves; the host can start early. Bots drive
// the racing line (shared/bots/racer.ts).
//
// Each finished race produces a RaceResult record (onResult): the ranked services store it
// (personal bests; ranked rooms also the Race ladder, rating/race.ts). Ranked rooms (the Race
// queue) run one race after a short lobby, then close after the results (onFinished).
import type { PlayerInput, PlayerState, RaceResult, RaceState } from '@space-yz/shared';
import {
  createRace,
  createRacerMemory,
  raceJoin,
  raceLeave,
  racerThink,
  raceView,
  RACER_SKILLS,
  requestRaceStart,
  updateRace,
  type BotSkillName,
  type RacerMemory,
} from '@space-yz/shared';
import type { Member, Room, Rules } from '../room';

/** A finished race with who raced (the record the server can store). */
export interface RaceRecord extends RaceResult {
  room: string;
  /** racers by id: account (null = guest), name, bot */
  racers: { id: number; accountId: number | null; name: string; bot: boolean }[];
}

export class RaceRules implements Rules {
  readonly name = 'race';
  readonly st: RaceState;
  onResult: ((room: Room, result: RaceRecord) => void) | null = null;
  /** ranked rooms: the results screen is over (the room should close) */
  onFinished: ((room: Room) => void) | null = null;
  private who = new Map<number, { accountId: number | null; name: string; bot: boolean }>();
  private drivers = new Map<number, RacerMemory>();

  constructor(track: string, settings: Parameters<typeof createRace>[1] = {}) {
    this.st = createRace(track, settings);
  }

  /** Host asked to start now. */
  requestStart(room: Room): string | null {
    if (this.st.phase !== 'lobby') return 'The race is already on.';
    if (!requestRaceStart(this.st, room.world)) return 'Nobody to race.';
    return null;
  }

  afterStep(room: Room): void {
    const wasResults = this.st.phase === 'results';
    updateRace(this.st, room.world, room.ctx);
    if (!wasResults && this.st.phase === 'results' && this.st.result)
      this.onResult?.(room, this.record(room));
    if (wasResults && this.st.phase !== 'results' && room.ranked) this.onFinished?.(room);
    // everyone races on one team (one colour, every name tag shown)
    for (const m of room.members.values()) m.team = 0;
  }

  record(room: Room): RaceRecord {
    const r = this.st.result!;
    return {
      ...r,
      room: room.code,
      racers: r.standings.map((s) => ({
        id: s.id,
        ...(this.who.get(s.id) ?? { accountId: null, name: `Racer ${s.id}`, bot: false }),
      })),
    };
  }

  state(room: Room): unknown {
    return { rules: 'race', ...raceView(this.st, room.ctx) };
  }

  /** Racers see every racer (no line-of-sight culling: they're drawn see-through anyway). */
  revealed(room: Room): readonly number[] {
    return room.world.players.map((p) => p.id);
  }

  /** Bots drive the racing line instead of fighting. */
  botInput(room: Room, m: Member, p: PlayerState): PlayerInput {
    let mem = this.drivers.get(m.id);
    if (!mem) {
      const skill = RACER_SKILLS[(m.bot?.skill.name ?? 'normal') as BotSkillName];
      mem = createRacerMemory(m.id, skill, m.id * 977 + 13);
      this.drivers.set(m.id, mem);
    }
    return racerThink(room.world, room.ctx, p, mem);
  }

  onJoin(room: Room, m: Member): void {
    this.who.set(m.id, { accountId: m.accountId, name: m.name, bot: !m.conn });
    raceJoin(this.st, room.world, room.ctx, m.id);
    m.team = 0;
  }

  onLeave(room: Room, m: Member): void {
    const was = this.st.phase;
    raceLeave(this.st, room.world, room.ctx, m.id);
    this.drivers.delete(m.id);
    if (was !== 'results' && this.st.phase === 'results' && this.st.result)
      queueMicrotask(() => this.onResult?.(room, this.record(room)));
  }
}
