import { describe, expect, it } from 'vitest';
import {
  Btn,
  buildLevel,
  createWorld,
  createPlayer,
  addPlayer,
  defaultConfig,
  csConfig,
  step,
  mapDef,
  DEFAULT_MATCH_MAP,
  createMatch,
  startMatch,
  updateMatch,
  applyBotObjectives,
  botThink,
  createBotMemory,
  BOT_SKILLS,
  TICK_DT,
  type BotMemory,
  type BotSkillName,
  type PlayerInput,
  type SimContext,
  type SimEvent,
} from '../src/index';

/** A 2v2 CS-mode bomb match between bots, for `rounds` rounds (or `maxTicks`). */
const csBotMatch = (skill: BotSkillName, rounds: number, maxTicks = 60 * 60 * 6) => {
  const config = csConfig(defaultConfig());
  const def = mapDef(DEFAULT_MATCH_MAP());
  const ctx: SimContext = { level: buildLevel(def), config, dt: TICK_DT };
  const world = createWorld(ctx.level, 7);
  const mems: BotMemory[] = [];
  let id = 1;
  for (const team of [0, 1] as const)
    for (let i = 0; i < 2; i++) {
      const s = def.spawns.filter((sp) => sp.team === team)[i] ?? def.spawns[0];
      addPlayer(world, createPlayer(id, team, s.pos, s.yawDeg, config));
      mems.push(createBotMemory(id, BOT_SKILLS[skill], id * 13));
      id++;
    }
  const ms = createMatch('2v2', 'bomb', 'cs');
  startMatch(ms, world, ctx);
  const events: SimEvent[] = [];
  const buttonsSeen = new Map<number, number>();
  while (world.tick < maxTicks && ms.rounds.length < rounds && ms.phase !== 'matchEnd') {
    const inputs: Record<number, PlayerInput> = {};
    for (const mem of mems) {
      const p = world.players.find((q) => q.id === mem.id)!;
      inputs[p.id] = botThink(world, ctx, p, mem);
      buttonsSeen.set(p.id, (buttonsSeen.get(p.id) ?? 0) | inputs[p.id].buttons);
    }
    step(world, inputs, ctx);
    updateMatch(ms, world, ctx);
    applyBotObjectives(ms, world, ctx, mems);
    events.push(...world.events);
  }
  return { ms, events, buttonsSeen };
};

describe('bots in CS mode', () => {
  it('shoot with the guns (never the Boomerang kit), kill and play the bomb', () => {
    const { ms, events, buttonsSeen } = csBotMatch('normal', 2);
    const types = new Set(events.map((e) => e.type));
    expect(ms.rounds.length).toBeGreaterThanOrEqual(1);
    expect(types.has('gunFire')).toBe(true);
    for (const t of ['throw', 'laserWarn', 'grenadeThrow', 'recallStart'])
      expect(types.has(t as SimEvent['type']), t).toBe(false);
    const kills = events.filter(
      (e) => e.type === 'kill' && (e.kind === 'ak' || e.kind === 'deagle'),
    );
    expect(kills.length).toBeGreaterThan(0);
    // somebody pressed Use (plant) or the round was decided by the bomb / elimination
    expect([...buttonsSeen.values()].some((b) => b & Btn.Use) || kills.length >= 2).toBe(true);
  }, 60000);

  it('better bots land a bigger share of their shots', () => {
    const acc = (skill: BotSkillName) => {
      const { events } = csBotMatch(skill, 2, 60 * 60 * 3);
      const shots = events.filter((e) => e.type === 'gunFire');
      const hit = shots.filter((e) => e.type === 'gunFire' && e.hit >= 0).length;
      return { shots: shots.length, rate: hit / Math.max(1, shots.length) };
    };
    const rookie = acc('rookie');
    const hard = acc('hard');
    expect(hard.shots).toBeGreaterThan(10);
    expect(hard.rate).toBeGreaterThan(rookie.rate);
  }, 60000);
});
