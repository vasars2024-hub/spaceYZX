// Offline practice vs bots (Training Bay by default).
import type { LevelDef, PlayerInput, BotMemory, BotSkill, GameConfig } from '@space-yz/shared';
import {
  buildTrainingBay,
  createPlayer,
  addPlayer,
  botThink,
  createBotMemory,
  BOT_SKILLS,
  StatsTracker,
  createPractice,
  updatePractice,
} from '@space-yz/shared';
import { LocalSession } from './local-session';

export const BOT_NAMES = [
  'Nova',
  'Vega',
  'Orion',
  'Lyra',
  'Rigel',
  'Deneb',
  'Altair',
  'Sirius',
  'Mira',
];

export interface PracticeOptions {
  size: number; // players per team (you + size-1 teammates)
  skill: BotSkill['name'];
  levelDef?: LevelDef;
  config: GameConfig;
}

export const createPracticeSession = (
  opts: PracticeOptions,
): { session: LocalSession; stats: StatsTracker } => {
  const levelDef = opts.levelDef ?? buildTrainingBay();
  const mems: BotMemory[] = [];
  const stats = new StatsTracker();
  const practice = createPractice(2.5);
  const names: Record<number, string> = {};
  const session = new LocalSession({
    levelDef,
    config: opts.config,
    seed: 1 + Math.floor(Math.random() * 1e6),
    names,
    setup: (world, ctx) => {
      let id = 2;
      let n = 0;
      for (const team of [0, 1] as const) {
        const count = team === 0 ? opts.size - 1 : opts.size;
        const spawns = levelDef.spawns.filter((s) => s.team === team);
        for (let i = 0; i < count; i++) {
          const s = spawns[(i + (team === 0 ? 1 : 0)) % spawns.length];
          addPlayer(world, createPlayer(id, team, s.pos, s.yawDeg, ctx.config));
          mems.push(createBotMemory(id, BOT_SKILLS[opts.skill], id * 13));
          names[id] = `${BOT_NAMES[n++ % BOT_NAMES.length]}${team === 0 ? ' (ally)' : ''}`;
          id++;
        }
      }
      // put the local player on a team-0 spawn
      const me = world.players.find((p) => p.id === 1)!;
      const s0 = levelDef.spawns.find((s) => s.team === 0) ?? levelDef.spawns[0];
      Object.assign(me, createPlayer(1, 0, s0.pos, s0.yawDeg, ctx.config));
    },
    extraInputs: (world, ctx) => {
      const inputs: Record<number, PlayerInput> = {};
      for (const mem of mems) {
        const p = world.players.find((pp) => pp.id === mem.id);
        if (p) inputs[p.id] = botThink(world, ctx, p, mem);
      }
      return inputs;
    },
    afterStep: (world, ctx) => {
      stats.observe(world);
      for (const id of updatePractice(practice, world, ctx)) stats.onRespawn(id);
    },
  });
  return { session, stats };
};
