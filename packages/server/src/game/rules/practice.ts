// Practice rules: dead players respawn after a short delay (no rounds). Used for M4 rooms
// and practice rooms with bots.
import { createPractice, updatePractice, type PracticeState } from '@space-yz/shared';
import type { Room, Rules } from '../room';

export class PracticeRules implements Rules {
  readonly name = 'practice';
  private st: PracticeState = createPractice(2.5);

  afterStep(room: Room): void {
    updatePractice(this.st, room.world, room.ctx);
  }

  state(room: Room): unknown {
    return {
      rules: 'practice',
      scores: room.world.players.map((p) => ({
        id: p.id,
        kills: p.kills,
        deaths: p.deaths,
        teamKills: p.teamKills,
      })),
    };
  }
}
